import { supabase } from './supabase';
import { config } from './config';
import { TokenManager } from './oauth/tokenManager';
import { TokenData } from './oauth/types';

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
        console.warn('Google Drive service not configured. Google OAuth credentials are missing.');
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
        console.warn('Google Drive service not configured. Google OAuth credentials are missing.');
      }
    }
    
    this.configurationChecked = true;
  }

  async initialize() {
    await this.checkConfiguration();
    
    if (!this.isConfigured || !this.tokenManager) {
      console.warn('Cannot initialize Google Drive service: OAuth not configured');
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

  async listFiles(folderId: string = 'root', pageSize: number = 100): Promise<GoogleDriveFile[]> {
    const url = `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents)',
        pageSize: pageSize.toString(),
        orderBy: 'modifiedTime desc'
      });

    const response = await this.makeAuthenticatedRequest(url, {}, 'list files');
    const data = await response.json();
    return data.files || [];
  }

  async getFolders(parentId: string = 'root'): Promise<GoogleDriveFolder[]> {
    const url = `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id,name)',
        orderBy: 'name'
      });

    const response = await this.makeAuthenticatedRequest(url, {}, 'fetch folders');
    const data = await response.json();
    const folders: GoogleDriveFolder[] = [];

    for (const folder of data.files || []) {
      try {
        const files = await this.listFiles(folder.id);
        const subFolders = await this.getFolders(folder.id);
        
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

  async downloadFile(fileId: string): Promise<string> {
    // First, get file metadata to check if it's a Google Docs file
    const metadataUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`;
    const metadataResponse = await this.makeAuthenticatedRequest(metadataUrl, {}, 'get file metadata');
    const metadata = await metadataResponse.json();
    
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    // Handle Google Docs files by exporting them as plain text
    if (metadata.mimeType === 'application/vnd.google-apps.document') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    } else if (metadata.mimeType === 'application/vnd.google-apps.spreadsheet') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
    } else if (metadata.mimeType === 'application/vnd.google-apps.presentation') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    }

    const response = await this.makeAuthenticatedRequest(
      downloadUrl, 
      { headers: { 'Accept': 'text/plain' } }, 
      'download file'
    );

    // Return full file content without any character limits
    const fullContent = await response.text();
    return fullContent;
  }

  async searchFiles(query: string, mimeTypes?: string[]): Promise<GoogleDriveFile[]> {
    let searchQuery = `name contains '${query}' and trashed=false`;
    
    if (mimeTypes && mimeTypes.length > 0) {
      const mimeTypeQuery = mimeTypes.map(type => `mimeType='${type}'`).join(' or ');
      searchQuery += ` and (${mimeTypeQuery})`;
    }

    const url = `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: searchQuery,
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents)',
        pageSize: '50',
        orderBy: 'modifiedTime desc'
      });

    const response = await this.makeAuthenticatedRequest(url, {}, 'search files');
    const data = await response.json();
    return data.files || [];
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
    return [
      'text/plain',
      'application/pdf',
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'text/csv',
      'text/markdown'
    ];
  }
}

export const googleDriveService = new GoogleDriveService();