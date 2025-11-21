import { supabase } from './supabase';
import { config } from './config';
import { TokenManager } from './oauth/tokenManager';
import { TokenData } from './oauth/types';
import { mimeTypeValidator } from './mimeTypeValidator';
import { serviceDegradationManager } from './serviceDegradationManager';
import { offlineCacheManager } from './offlineCacheManager';

import { logger } from './logging';
export enum DriveErrorType {
  AUTHENTICATION_ERROR = 'authentication_error',
  PERMISSION_ERROR = 'permission_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  QUOTA_EXCEEDED = 'quota_exceeded',
  FILE_NOT_FOUND = 'file_not_found',
  NETWORK_ERROR = 'network_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export class DriveError extends Error {
  constructor(
    public type: DriveErrorType,
    message: string,
    public statusCode?: number,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

interface RateLimitState {
  requestCount: number;
  windowStart: number;
  backoffUntil?: number;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
  parents?: string[];
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
  files: GoogleDriveFile[];
  folders: GoogleDriveFolder[];
}

class GoogleDriveService {
  private tokenManager: TokenManager | null = null;
  private isConfigured: boolean = false;
  private configurationChecked: boolean = false;
  private rateLimitState: RateLimitState = {
    requestCount: 0,
    windowStart: Date.now()
  };
  
  // Rate limiting configuration
  private readonly MAX_REQUESTS_PER_MINUTE = 100;
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
  private readonly MAX_RETRIES = 3;
  private readonly BASE_RETRY_DELAY_MS = 1000;

  constructor() {
    // Don't check configuration in constructor - do it lazily
  }

  private async checkConfiguration() {
    if (this.configurationChecked) {
      return;
    }

    try {
      // Use async getter to ensure config is initialized
      const auth = await config.getAuth();
      this.isConfigured = !!(auth.google.clientId && auth.google.clientSecret);
      
      if (this.isConfigured && !this.tokenManager) {
        // Initialize token manager with encryption key
        const encryptionKey = auth.google.tokenEncryptionKey || import.meta.env.VITE_TOKEN_ENCRYPTION_KEY || 'default-key';
        this.tokenManager = new TokenManager(encryptionKey);
      }
      
      if (!this.isConfigured) {
        logger.warn("Google Drive service not configured. Google OAuth credentials are missing.");
      }
    } catch (error) {
      // Fallback to environment variables if config not available
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
      this.isConfigured = !!(clientId && clientSecret);
      
      if (this.isConfigured && !this.tokenManager) {
        // Initialize token manager with fallback encryption key
        const encryptionKey = import.meta.env.VITE_TOKEN_ENCRYPTION_KEY || 'default-key';
        this.tokenManager = new TokenManager(encryptionKey);
      }
      
      if (!this.isConfigured) {
        logger.warn("Google Drive service not configured. Google OAuth credentials are missing.");
      }
    }
    
    this.configurationChecked = true;
  }

  async initialize() {
    await this.checkConfiguration();
    
    if (!this.isConfigured || !this.tokenManager) {
      logger.warn("Cannot initialize Google Drive service: OAuth not configured");
      return false;
    }

    // Check if we have valid OAuth tokens for the current user
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const hasTokens = await this.tokenManager.hasValidTokens(session.user.id);
      return hasTokens;
    }
    
    return false;
  }

  async isAvailable(): Promise<boolean> {
    await this.checkConfiguration();
    return this.isConfigured;
  }

  /**
   * Gets a valid access token for the current user
   */
  private async getAccessToken(): Promise<string> {
    await this.checkConfiguration();
    
    if (!this.isConfigured || !this.tokenManager) {
      throw new DriveError(
        DriveErrorType.AUTHENTICATION_ERROR,
        'Google Drive service not configured. Please set up Google OAuth credentials.'
      );
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      throw new DriveError(
        DriveErrorType.AUTHENTICATION_ERROR,
        'User not authenticated'
      );
    }

    const tokens = await this.tokenManager.getValidTokens(session.user.id);
    if (!tokens) {
      throw new DriveError(
        DriveErrorType.AUTHENTICATION_ERROR,
        'No valid Google Drive tokens found. Please re-authenticate.'
      );
    }

    return tokens.accessToken;
  }

  /**
   * Checks and enforces rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Check if we're in a backoff period
    if (this.rateLimitState.backoffUntil && now < this.rateLimitState.backoffUntil) {
      const waitTime = this.rateLimitState.backoffUntil - now;
      throw new DriveError(
        DriveErrorType.RATE_LIMIT_ERROR,
        `Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds before retrying.`,
        429,
        Math.ceil(waitTime / 1000)
      );
    }

    // Reset window if needed
    if (now - this.rateLimitState.windowStart >= this.RATE_LIMIT_WINDOW_MS) {
      this.rateLimitState.requestCount = 0;
      this.rateLimitState.windowStart = now;
      this.rateLimitState.backoffUntil = undefined;
    }

    // Check if we've exceeded the rate limit
    if (this.rateLimitState.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
      const waitTime = this.RATE_LIMIT_WINDOW_MS - (now - this.rateLimitState.windowStart);
      this.rateLimitState.backoffUntil = now + waitTime;
      
      throw new DriveError(
        DriveErrorType.RATE_LIMIT_ERROR,
        `Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds before retrying.`,
        429,
        Math.ceil(waitTime / 1000)
      );
    }

    // Increment request count
    this.rateLimitState.requestCount++;
  }

  /**
   * Handles API response errors and converts them to DriveError
   */
  private handleApiError(response: Response, context: string): DriveError {
    const statusCode = response.status;
    
    switch (statusCode) {
      case 401:
        return new DriveError(
          DriveErrorType.AUTHENTICATION_ERROR,
          'Google Drive authentication expired. Please re-authenticate.',
          statusCode
        );
      
      case 403:
        // Check if it's a rate limit or permission error
        if (response.headers.get('x-ratelimit-remaining') === '0') {
          const retryAfter = parseInt(response.headers.get('retry-after') || '60');
          this.rateLimitState.backoffUntil = Date.now() + (retryAfter * 1000);
          
          return new DriveError(
            DriveErrorType.RATE_LIMIT_ERROR,
            `API rate limit exceeded. Please wait ${retryAfter} seconds before retrying.`,
            statusCode,
            retryAfter
          );
        } else {
          return new DriveError(
            DriveErrorType.PERMISSION_ERROR,
            `Insufficient permissions for ${context}. Please grant additional permissions.`,
            statusCode
          );
        }
      
      case 404:
        return new DriveError(
          DriveErrorType.FILE_NOT_FOUND,
          `File or folder not found for ${context}.`,
          statusCode
        );
      
      case 429:
        const retryAfter = parseInt(response.headers.get('retry-after') || '60');
        this.rateLimitState.backoffUntil = Date.now() + (retryAfter * 1000);
        
        return new DriveError(
          DriveErrorType.RATE_LIMIT_ERROR,
          `Too many requests. Please wait ${retryAfter} seconds before retrying.`,
          statusCode,
          retryAfter
        );
      
      case 500:
      case 502:
      case 503:
      case 504:
        return new DriveError(
          DriveErrorType.NETWORK_ERROR,
          `Google Drive service temporarily unavailable for ${context}. Please try again later.`,
          statusCode
        );
      
      default:
        return new DriveError(
          DriveErrorType.UNKNOWN_ERROR,
          `Failed to ${context}: ${response.statusText}`,
          statusCode
        );
    }
  }

  /**
   * Makes an authenticated request with retry logic and error handling
   */
  private async makeAuthenticatedRequest(
    url: string,
    options: RequestInit = {},
    context: string = 'make request',
    retryCount: number = 0
  ): Promise<Response> {
    // Check rate limiting before making request
    await this.checkRateLimit();
    
    try {
      const accessToken = await this.getAccessToken();
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = this.handleApiError(response, context);
        
        // Retry logic for certain error types
        if (retryCount < this.MAX_RETRIES && this.shouldRetry(error)) {
          const delay = this.calculateRetryDelay(retryCount, error);
          await this.sleep(delay);
          return this.makeAuthenticatedRequest(url, options, context, retryCount + 1);
        }
        
        throw error;
      }

      return response;
    } catch (error) {
      if (error instanceof DriveError) {
        throw error;
      }
      
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new DriveError(
          DriveErrorType.NETWORK_ERROR,
          `Network error while trying to ${context}. Please check your connection.`
        );
        
        if (retryCount < this.MAX_RETRIES) {
          const delay = this.calculateRetryDelay(retryCount);
          await this.sleep(delay);
          return this.makeAuthenticatedRequest(url, options, context, retryCount + 1);
        }
        
        throw networkError;
      }
      
      throw new DriveError(
        DriveErrorType.UNKNOWN_ERROR,
        `Unexpected error while trying to ${context}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Determines if an error should trigger a retry
   */
  private shouldRetry(error: DriveError): boolean {
    return error.type === DriveErrorType.NETWORK_ERROR || 
           error.type === DriveErrorType.RATE_LIMIT_ERROR ||
           (error.statusCode && error.statusCode >= 500);
  }

  /**
   * Calculates retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number, error?: DriveError): number {
    // If error specifies retry-after, use that
    if (error?.retryAfter) {
      return error.retryAfter * 1000;
    }
    
    // Exponential backoff: base delay * 2^retryCount + jitter
    const exponentialDelay = this.BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async listFiles(folderId: string = 'root', pageSize: number = 100, pageToken?: string): Promise<{
    files: GoogleDriveFile[];
    nextPageToken?: string;
    hasMore: boolean;
  }> {
    // Check for cached files first (offline mode or degraded service)
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    
    if (serviceDegradationManager.isOfflineMode() || serviceDegradationManager.shouldUseFallback('googleDrive')) {
      const cachedFiles = offlineCacheManager.getCachedDriveFiles(folderId, userId);
      if (cachedFiles) {
        logger.debug("Using cached Drive files (offline/degraded mode)");
        return {
          files: cachedFiles,
          nextPageToken: undefined,
          hasMore: false
        };
      }
    }
    const params: Record<string, string> = {
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents),nextPageToken',
      pageSize: pageSize.toString(),
      orderBy: 'modifiedTime desc'
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const url = `https://www.googleapis.com/drive/v3/files?` + new URLSearchParams(params);

    try {
      const response = await this.makeAuthenticatedRequest(url, {}, 'list files');
      const data = await response.json();
      
      const result = {
        files: data.files || [],
        nextPageToken: data.nextPageToken,
        hasMore: !!data.nextPageToken
      };
      
      // Cache the files for offline use
      if (result.files.length > 0 && userId) {
        try {
          offlineCacheManager.cacheDriveFiles(folderId, result.files, userId);
        } catch (cacheError) {
          logger.warn("Failed to cache Drive files:", { cacheError });
        }
      }
      
      return result;
    } catch (error) {
      // Force degradation mode on persistent errors
      if (error instanceof DriveError && 
          (error.type === DriveErrorType.NETWORK_ERROR || error.type === DriveErrorType.AUTHENTICATION_ERROR)) {
        serviceDegradationManager.forceFallback('googleDrive', `Drive API error: ${error.message}`);
      }
      throw error;
    }
  }

  async listAllFiles(folderId: string = 'root', maxFiles?: number): Promise<GoogleDriveFile[]> {
    const allFiles: GoogleDriveFile[] = [];
    let pageToken: string | undefined;
    let totalFetched = 0;
    const pageSize = 100;

    do {
      const result = await this.listFiles(folderId, pageSize, pageToken);
      allFiles.push(...result.files);
      totalFetched += result.files.length;
      pageToken = result.nextPageToken;

      // Stop if we've reached the max files limit
      if (maxFiles && totalFetched >= maxFiles) {
        break;
      }
    } while (pageToken);

    return maxFiles ? allFiles.slice(0, maxFiles) : allFiles;
  }

  async getFolders(parentId: string = 'root', includeContents: boolean = false): Promise<GoogleDriveFolder[]> {
    const url = `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id,name,modifiedTime)',
        orderBy: 'name',
        pageSize: '100'
      });

    const response = await this.makeAuthenticatedRequest(url, {}, 'fetch folders');
    const data = await response.json();
    const folders: GoogleDriveFolder[] = [];

    for (const folder of data.files || []) {
      try {
        let files: GoogleDriveFile[] = [];
        const subFolders: GoogleDriveFolder[] = [];

        if (includeContents) {
          // Only fetch contents if explicitly requested to avoid deep recursion
          const fileResult = await this.listFiles(folder.id, 50); // Limit to 50 files per folder
          files = fileResult.files;
          // Don't recursively fetch subfolders to avoid performance issues
        }
        
        folders.push({
          id: folder.id,
          name: folder.name,
          files,
          folders: subFolders
        });
      } catch (error) {
        // Log error but continue with other folders
        console.warn(`Failed to process folder ${folder.name}:`, error);
        folders.push({
          id: folder.id,
          name: folder.name,
          files: [],
          folders: []
        });
      }
    }

    return folders;
  }

  async getFolderHierarchy(folderId: string = 'root', maxDepth: number = 3, currentDepth: number = 0): Promise<GoogleDriveFolder> {
    if (currentDepth >= maxDepth) {
      // Return folder without contents if max depth reached
      const folderInfo = await this.getFileInfo(folderId);
      return {
        id: folderId,
        name: folderInfo?.name || 'Unknown Folder',
        files: [],
        folders: []
      };
    }

    const [fileResult, subFolders] = await Promise.all([
      this.listFiles(folderId, 50), // Limit files per folder
      this.getFolders(folderId, false) // Don't include contents for subfolders initially
    ]);

    // Recursively get hierarchy for subfolders
    const foldersWithHierarchy: GoogleDriveFolder[] = [];
    for (const folder of subFolders) {
      try {
        const folderHierarchy = await this.getFolderHierarchy(folder.id, maxDepth, currentDepth + 1);
        foldersWithHierarchy.push(folderHierarchy);
      } catch (error) {
        console.warn(`Failed to get hierarchy for folder ${folder.name}:`, error);
        foldersWithHierarchy.push(folder);
      }
    }

    const folderInfo = folderId === 'root' ? { name: 'My Drive' } : await this.getFileInfo(folderId);

    return {
      id: folderId,
      name: folderInfo?.name || 'Unknown Folder',
      files: fileResult.files,
      folders: foldersWithHierarchy
    };
  }

  async getFileInfo(fileId: string): Promise<GoogleDriveFile | null> {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,webViewLink,parents`;
      const response = await this.makeAuthenticatedRequest(url, {}, 'get file info');
      return await response.json();
    } catch (error) {
      if (error instanceof DriveError && error.type === DriveErrorType.FILE_NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  async downloadFile(fileId: string, options?: {
    maxSizeBytes?: number;
    preferredFormat?: string;
  }): Promise<{
    content: string;
    mimeType: string;
    size: number;
    truncated: boolean;
  }> {
    // Check for cached content first
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    
    if (serviceDegradationManager.isOfflineMode() || serviceDegradationManager.shouldUseFallback('googleDrive')) {
      const cachedContent = offlineCacheManager.getCachedFileContent(fileId, userId);
      if (cachedContent) {
        logger.debug("Using cached file content (offline/degraded mode)");
        return {
          content: cachedContent.content,
          mimeType: cachedContent.mimeType,
          size: cachedContent.content.length,
          truncated: false
        };
      }
    }
    const maxSize = options?.maxSizeBytes || 10 * 1024 * 1024; // 10MB default limit
    
    // First, get file metadata to check size and type
    const metadata = await this.getFileInfo(fileId);
    if (!metadata) {
      throw new DriveError(DriveErrorType.FILE_NOT_FOUND, `File with ID ${fileId} not found`);
    }

    // Check file size if available
    const fileSize = metadata.size ? parseInt(metadata.size) : 0;
    if (fileSize > maxSize) {
      throw new DriveError(
        DriveErrorType.QUOTA_EXCEEDED,
        `File size (${this.formatBytes(fileSize)}) exceeds maximum allowed size (${this.formatBytes(maxSize)})`
      );
    }

    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    let exportMimeType = metadata.mimeType;

    // Handle Google Workspace files by exporting them
    if (metadata.mimeType === 'application/vnd.google-apps.document') {
      const format = options?.preferredFormat || 'text/plain';
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(format)}`;
      exportMimeType = format;
    } else if (metadata.mimeType === 'application/vnd.google-apps.spreadsheet') {
      const format = options?.preferredFormat || 'text/csv';
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(format)}`;
      exportMimeType = format;
    } else if (metadata.mimeType === 'application/vnd.google-apps.presentation') {
      const format = options?.preferredFormat || 'text/plain';
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(format)}`;
      exportMimeType = format;
    } else if (metadata.mimeType === 'application/vnd.google-apps.drawing') {
      const format = options?.preferredFormat || 'image/png';
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(format)}`;
      exportMimeType = format;
    }

    const response = await this.makeAuthenticatedRequest(
      downloadUrl, 
      { 
        headers: { 
          'Accept': exportMimeType.startsWith('text/') ? 'text/plain' : '*/*'
        } 
      }, 
      'download file'
    );

    // Handle different content types
    let content: string;
    let actualSize: number;
    let truncated = false;

    if (exportMimeType.startsWith('text/') || exportMimeType === 'application/json') {
      content = await response.text();
      actualSize = new Blob([content]).size;
      
      // Truncate if content is too large
      if (actualSize > maxSize) {
        const maxChars = Math.floor(maxSize * 0.8); // Leave some buffer for encoding
        content = content.substring(0, maxChars) + '\n\n[Content truncated due to size limit]';
        truncated = true;
      }
    } else {
      // For binary files, we'll return base64 encoded content
      const arrayBuffer = await response.arrayBuffer();
      actualSize = arrayBuffer.byteLength;
      
      if (actualSize > maxSize) {
        throw new DriveError(
          DriveErrorType.QUOTA_EXCEEDED,
          `File content (${this.formatBytes(actualSize)}) exceeds maximum allowed size (${this.formatBytes(maxSize)})`
        );
      }
      
      // Convert to base64 for text representation
      const uint8Array = new Uint8Array(arrayBuffer);
      content = btoa(String.fromCharCode(...uint8Array));
    }

    const result = {
      content,
      mimeType: exportMimeType,
      size: actualSize,
      truncated
    };
    
    // Cache the file content for offline use
    if (userId && content) {
      try {
        offlineCacheManager.cacheFileContent(fileId, content, exportMimeType, userId);
      } catch (cacheError) {
        logger.warn("Failed to cache file content:", { cacheError });
      }
    }
    
    return result;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async searchFiles(
    query: string, 
    options?: {
      mimeTypes?: string[];
      folderId?: string;
      maxResults?: number;
      orderBy?: 'name' | 'modifiedTime' | 'createdTime' | 'size';
      orderDirection?: 'asc' | 'desc';
      includeContent?: boolean;
    }
  ): Promise<{
    files: GoogleDriveFile[];
    totalResults: number;
    hasMore: boolean;
  }> {
    const {
      mimeTypes,
      folderId,
      maxResults = 50,
      orderBy = 'modifiedTime',
      orderDirection = 'desc',
      includeContent = false
    } = options || {};

    // Build search query
    let searchQuery = `name contains '${query.replace(/'/g, "\\'")}' and trashed=false`;
    
    if (mimeTypes && mimeTypes.length > 0) {
      const mimeTypeQuery = mimeTypes.map(type => `mimeType='${type}'`).join(' or ');
      searchQuery += ` and (${mimeTypeQuery})`;
    }

    if (folderId && folderId !== 'root') {
      searchQuery += ` and '${folderId}' in parents`;
    }

    // Add content search if requested (requires additional API calls)
    if (includeContent) {
      searchQuery += ` and fullText contains '${query.replace(/'/g, "\\'")}'`;
    }

    const orderByClause = `${orderBy} ${orderDirection}`;

    const url = `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: searchQuery,
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents)',
        pageSize: Math.min(maxResults, 100).toString(),
        orderBy: orderByClause
      });

    const response = await this.makeAuthenticatedRequest(url, {}, 'search files');
    const data = await response.json();
    const files = data.files || [];

    return {
      files,
      totalResults: files.length, // Note: Google Drive API doesn't provide total count
      hasMore: files.length === Math.min(maxResults, 100) // Approximate based on page size
    };
  }

  async advancedSearch(options: {
    query?: string;
    mimeTypes?: string[];
    folderId?: string;
    modifiedAfter?: Date;
    modifiedBefore?: Date;
    sizeMin?: number;
    sizeMax?: number;
    owners?: string[];
    sharedWithMe?: boolean;
    starred?: boolean;
    maxResults?: number;
  }): Promise<GoogleDriveFile[]> {
    const {
      query,
      mimeTypes,
      folderId,
      modifiedAfter,
      modifiedBefore,
      sizeMin,
      sizeMax,
      owners,
      sharedWithMe,
      starred,
      maxResults = 50
    } = options;

    const queryParts: string[] = ['trashed=false'];

    if (query) {
      queryParts.push(`name contains '${query.replace(/'/g, "\\'")}'`);
    }

    if (mimeTypes && mimeTypes.length > 0) {
      const mimeTypeQuery = mimeTypes.map(type => `mimeType='${type}'`).join(' or ');
      queryParts.push(`(${mimeTypeQuery})`);
    }

    if (folderId && folderId !== 'root') {
      queryParts.push(`'${folderId}' in parents`);
    }

    if (modifiedAfter) {
      queryParts.push(`modifiedTime > '${modifiedAfter.toISOString()}'`);
    }

    if (modifiedBefore) {
      queryParts.push(`modifiedTime < '${modifiedBefore.toISOString()}'`);
    }

    if (owners && owners.length > 0) {
      const ownerQuery = owners.map(owner => `'${owner}' in owners`).join(' or ');
      queryParts.push(`(${ownerQuery})`);
    }

    if (sharedWithMe) {
      queryParts.push('sharedWithMe=true');
    }

    if (starred) {
      queryParts.push('starred=true');
    }

    const searchQuery = queryParts.join(' and ');

    const url = `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: searchQuery,
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents,owners)',
        pageSize: Math.min(maxResults, 100).toString(),
        orderBy: 'modifiedTime desc'
      });

    const response = await this.makeAuthenticatedRequest(url, {}, 'advanced search');
    const data = await response.json();
    let files = data.files || [];

    // Client-side filtering for size constraints (API doesn't support size queries)
    if (sizeMin !== undefined || sizeMax !== undefined) {
      files = files.filter((file: GoogleDriveFile) => {
        if (!file.size) return true; // Include files without size info
        const size = parseInt(file.size);
        if (sizeMin !== undefined && size < sizeMin) return false;
        if (sizeMax !== undefined && size > sizeMax) return false;
        return true;
      });
    }

    return files;
  }

  async isAuthenticated(): Promise<boolean> {
    await this.checkConfiguration();
    
    if (!this.isConfigured || !this.tokenManager) {
      return false;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      return false;
    }

    return await this.tokenManager.hasValidTokens(session.user.id);
  }

  /**
   * Requests additional permissions through incremental authorization
   */
  async requestAdditionalPermissions(additionalScopes: string[]): Promise<void> {
    await this.checkConfiguration();
    
    if (!this.isConfigured || !this.tokenManager) {
      throw new DriveError(
        DriveErrorType.AUTHENTICATION_ERROR,
        'Google Drive service not configured. Please set up Google OAuth credentials.'
      );
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      throw new DriveError(
        DriveErrorType.AUTHENTICATION_ERROR,
        'User not authenticated'
      );
    }

    // This would typically redirect to Google's incremental authorization flow
    // For now, we'll throw an error indicating the user needs to re-authenticate
    throw new DriveError(
      DriveErrorType.PERMISSION_ERROR,
      'Additional permissions required. Please re-authenticate to grant access to the requested features.'
    );
  }

  /**
   * Gets current rate limit status
   */
  getRateLimitStatus(): {
    requestsRemaining: number;
    windowResetTime: number;
    isInBackoff: boolean;
    backoffEndsAt?: number;
  } {
    const now = Date.now();
    const windowResetTime = this.rateLimitState.windowStart + this.RATE_LIMIT_WINDOW_MS;
    
    return {
      requestsRemaining: Math.max(0, this.MAX_REQUESTS_PER_MINUTE - this.rateLimitState.requestCount),
      windowResetTime,
      isInBackoff: !!(this.rateLimitState.backoffUntil && now < this.rateLimitState.backoffUntil),
      backoffEndsAt: this.rateLimitState.backoffUntil
    };
  }

  /**
   * Resets rate limiting state (for testing or manual reset)
   */
  resetRateLimit(): void {
    this.rateLimitState = {
      requestCount: 0,
      windowStart: Date.now()
    };
  }

  getSupportedMimeTypes(): string[] {
    return mimeTypeValidator.getSupportedMimeTypes();
  }

  getExportFormats(mimeType: string): string[] {
    const info = mimeTypeValidator.getMimeTypeInfo(mimeType);
    return info?.exportFormats || [];
  }

  isGoogleWorkspaceFile(mimeType: string): boolean {
    const info = mimeTypeValidator.getMimeTypeInfo(mimeType);
    return info?.isGoogleWorkspace || false;
  }

  getFileTypeCategory(mimeType: string): 'document' | 'spreadsheet' | 'presentation' | 'image' | 'pdf' | 'text' | 'other' {
    const info = mimeTypeValidator.getMimeTypeInfo(mimeType);
    return info?.category || 'other';
  }

  getFileTypeDescription(mimeType: string): string {
    return mimeTypeValidator.getFileTypeDescription(mimeType);
  }

  validateFileSizeForType(mimeType: string, sizeBytes: number): {
    valid: boolean;
    warning?: string;
    maxRecommended?: number;
  } {
    return mimeTypeValidator.validateFileSize(mimeType, sizeBytes);
  }

  async validateFileAccess(fileId: string): Promise<{
    canRead: boolean;
    canWrite: boolean;
    canShare: boolean;
    error?: string;
  }> {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=capabilities`;
      const response = await this.makeAuthenticatedRequest(url, {}, 'validate file access');
      const data = await response.json();
      
      const capabilities = data.capabilities || {};
      
      return {
        canRead: capabilities.canDownload !== false,
        canWrite: capabilities.canEdit === true,
        canShare: capabilities.canShare === true
      };
    } catch (error) {
      if (error instanceof DriveError) {
        return {
          canRead: false,
          canWrite: false,
          canShare: false,
          error: error.message
        };
      }
      throw error;
    }
  }
}

export const googleDriveService = new GoogleDriveService();