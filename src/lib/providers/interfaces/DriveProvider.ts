/**
 * Drive Provider interface for file storage and retrieval services
 */

import { BaseProvider, ProviderConfig } from '../base/BaseProvider';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: Date;
  modifiedTime: Date;
  parents?: string[];
  webViewLink?: string;
  thumbnailLink?: string;
  isFolder: boolean;
  permissions?: {
    canRead: boolean;
    canWrite: boolean;
    canShare: boolean;
  };
}

export interface DriveFolder {
  id: string;
  name: string;
  files: DriveFile[];
  folders: DriveFolder[];
  totalItems: number;
  hasMore: boolean;
  nextPageToken?: string;
}

export interface FileContent {
  content: string;
  mimeType: string;
  encoding: string;
  size: number;
}

export interface ListOptions {
  pageSize?: number;
  pageToken?: string;
  orderBy?: string;
  includeItemsFromAllDrives?: boolean;
  supportsAllDrives?: boolean;
}

export interface SearchFilters {
  mimeType?: string;
  modifiedAfter?: Date;
  modifiedBefore?: Date;
  sizeMin?: number;
  sizeMax?: number;
  owners?: string[];
  starred?: boolean;
  trashed?: boolean;
}

export interface UploadOptions {
  parents?: string[];
  description?: string;
  starred?: boolean;
}

export interface DriveProviderConfig extends ProviderConfig {
  accessToken: string;
  refreshToken?: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  apiUrl: string;
}

export interface DriveQuota {
  limit: number;
  usage: number;
  usageInDrive: number;
  usageInDriveTrash: number;
}

export abstract class DriveProvider extends BaseProvider {
  protected driveConfig: DriveProviderConfig;

  constructor(config: DriveProviderConfig) {
    super(config);
    this.driveConfig = config;
  }

  /**
   * List files in a folder or root directory
   */
  abstract listFiles(
    folderId?: string, 
    options?: ListOptions
  ): Promise<DriveFile[]>;

  /**
   * Get folder structure with files and subfolders
   */
  abstract getFolderStructure(
    folderId?: string, 
    options?: ListOptions
  ): Promise<DriveFolder>;

  /**
   * Search for files based on query and filters
   */
  abstract searchFiles(
    query: string, 
    filters?: SearchFilters
  ): Promise<DriveFile[]>;

  /**
   * Download file content
   */
  abstract downloadFile(fileId: string): Promise<FileContent>;

  /**
   * Get file metadata
   */
  abstract getFileMetadata(fileId: string): Promise<DriveFile>;

  /**
   * Upload file content
   */
  abstract uploadFile(
    name: string, 
    content: string | Blob, 
    mimeType: string,
    options?: UploadOptions
  ): Promise<DriveFile>;

  /**
   * Delete file
   */
  abstract deleteFile(fileId: string): Promise<boolean>;

  /**
   * Create folder
   */
  abstract createFolder(
    name: string, 
    parentId?: string
  ): Promise<DriveFile>;

  /**
   * Get storage quota information
   */
  abstract getQuota(): Promise<DriveQuota>;

  /**
   * Check if file type is supported for content extraction
   */
  isSupportedFileType(mimeType: string): boolean {
    const supportedTypes = [
      'text/plain',
      'text/html',
      'text/markdown',
      'application/pdf',
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.google-apps.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint'
    ];
    return supportedTypes.includes(mimeType);
  }

  /**
   * Get maximum file size limit (in bytes)
   */
  getMaxFileSize(): number {
    return 100 * 1024 * 1024; // 100MB default
  }

  /**
   * Update drive-specific configuration
   */
  updateDriveConfig(newConfig: Partial<DriveProviderConfig>): void {
    this.driveConfig = { ...this.driveConfig, ...newConfig };
    this.updateConfig(newConfig);
  }

  /**
   * Update access token
   */
  updateAccessToken(accessToken: string, refreshToken?: string): void {
    this.driveConfig.accessToken = accessToken;
    if (refreshToken) {
      this.driveConfig.refreshToken = refreshToken;
    }
  }
}

export type DriveProviderType = 'google' | 'onedrive' | 'dropbox' | 'mock';