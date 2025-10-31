/**
 * File Upload Service
 * 
 * High-level service for handling file uploads with S3 integration.
 * Provides validation, processing, and metadata management.
 */

import { getS3Service, UploadOptions } from './s3Service';
import { logger } from '../logging';
import { parsePDF, isPDFFile } from '../pdfParser';

export interface FileUploadResult {
  id: string;
  key: string;
  url: string;
  filename: string;
  size: number;
  contentType: string;
  content?: string; // Extracted text content
  uploadedAt: Date;
  userId: string;
}

export interface FileUploadOptions {
  extractText?: boolean;
  maxSize?: number; // bytes
  allowedTypes?: string[];
  metadata?: Record<string, string>;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  fileKey: string;
  uploadId: string;
}

class FileUploadService {
  private s3Service = getS3Service();
  private defaultMaxSize = 50 * 1024 * 1024; // 50MB
  private defaultAllowedTypes = [
    'text/plain',
    'text/markdown',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
    'application/json'
  ];

  /**
   * Upload a file directly to S3
   */
  async uploadFile(
    file: File,
    userId: string,
    options: FileUploadOptions = {}
  ): Promise<FileUploadResult> {
    try {
      const startTime = Date.now();

      // Validate file
      await this.validateFile(file, options);

      // Generate unique key
      const fileKey = this.s3Service.generateFileKey(userId, file.name);
      const uploadId = this.generateUploadId();

      // Prepare S3 upload options
      const s3Options: UploadOptions = {
        contentType: file.type,
        metadata: {
          originalName: file.name,
          uploadedBy: userId,
          uploadId,
          ...options.metadata
        },
        serverSideEncryption: 'AES256',
        storageClass: 'STANDARD'
      };

      // Upload to S3
      const uploadResult = await this.s3Service.uploadFile(fileKey, file, s3Options);

      // Extract text content if requested
      let content: string | undefined;
      if (options.extractText !== false) {
        try {
          content = await this.extractTextContent(file);
        } catch (error) {
          logger.warn('Failed to extract text content', error as Error, {
            filename: file.name,
            fileType: file.type
          });
        }
      }

      const result: FileUploadResult = {
        id: uploadId,
        key: fileKey,
        url: uploadResult.url,
        filename: file.name,
        size: file.size,
        contentType: file.type,
        content,
        uploadedAt: new Date(),
        userId
      };

      const duration = Date.now() - startTime;

      logger.info('File uploaded successfully', {
        uploadId,
        filename: file.name,
        size: file.size,
        duration,
        hasContent: !!content
      });

      return result;

    } catch (error) {
      logger.error('File upload failed', error as Error, {
        filename: file.name,
        userId
      });
      throw error;
    }
  }

  /**
   * Generate presigned URL for direct client upload
   */
  async generatePresignedUpload(
    filename: string,
    contentType: string,
    userId: string,
    options: FileUploadOptions = {}
  ): Promise<PresignedUploadResult> {
    try {
      // Validate file type
      if (options.allowedTypes && !options.allowedTypes.includes(contentType)) {
        throw new Error(`File type ${contentType} is not allowed`);
      }

      const fileKey = this.s3Service.generateFileKey(userId, filename);
      const uploadId = this.generateUploadId();

      const presignedResult = await this.s3Service.generatePresignedUploadUrl(fileKey, {
        contentType,
        expiresIn: 3600, // 1 hour
        contentLength: options.maxSize
      });

      logger.info('Generated presigned upload URL', {
        uploadId,
        filename,
        contentType,
        userId
      });

      return {
        uploadUrl: presignedResult.url,
        fileKey,
        uploadId
      };

    } catch (error) {
      logger.error('Failed to generate presigned upload URL', error as Error, {
        filename,
        userId
      });
      throw error;
    }
  }

  /**
   * Process uploaded file after presigned upload
   */
  async processUploadedFile(
    fileKey: string,
    uploadId: string,
    userId: string,
    options: FileUploadOptions = {}
  ): Promise<FileUploadResult> {
    try {
      // Get file metadata from S3
      const metadata = await this.s3Service.getFileMetadata(fileKey);

      // Download file for text extraction if needed
      let content: string | undefined;
      if (options.extractText !== false) {
        try {
          const downloadResult = await this.s3Service.downloadFile(fileKey);
          const file = new File([downloadResult.body], metadata.key, {
            type: metadata.contentType
          });
          content = await this.extractTextContent(file);
        } catch (error) {
          logger.warn('Failed to extract text content from uploaded file', error as Error, {
            fileKey
          });
        }
      }

      const result: FileUploadResult = {
        id: uploadId,
        key: fileKey,
        url: this.s3Service.getPublicUrl(fileKey),
        filename: metadata.metadata?.originalName || fileKey.split('/').pop() || fileKey,
        size: metadata.size,
        contentType: metadata.contentType,
        content,
        uploadedAt: metadata.lastModified,
        userId
      };

      logger.info('Processed uploaded file', {
        uploadId,
        fileKey,
        hasContent: !!content
      });

      return result;

    } catch (error) {
      logger.error('Failed to process uploaded file', error as Error, {
        fileKey,
        uploadId
      });
      throw error;
    }
  }

  /**
   * Delete an uploaded file
   */
  async deleteFile(fileKey: string, userId: string): Promise<void> {
    try {
      // Verify ownership by checking metadata
      const metadata = await this.s3Service.getFileMetadata(fileKey);
      if (metadata.metadata?.uploadedBy !== userId) {
        throw new Error('Unauthorized: Cannot delete file uploaded by another user');
      }

      await this.s3Service.deleteFile(fileKey);

      logger.info('File deleted', { fileKey, userId });

    } catch (error) {
      logger.error('Failed to delete file', error as Error, { fileKey, userId });
      throw error;
    }
  }

  /**
   * Get download URL for a file
   */
  async getDownloadUrl(fileKey: string, userId: string, expiresIn = 3600): Promise<string> {
    try {
      // Verify ownership
      const metadata = await this.s3Service.getFileMetadata(fileKey);
      if (metadata.metadata?.uploadedBy !== userId) {
        throw new Error('Unauthorized: Cannot access file uploaded by another user');
      }

      const url = await this.s3Service.generatePresignedDownloadUrl(fileKey, expiresIn);

      logger.info('Generated download URL', { fileKey, userId, expiresIn });

      return url;

    } catch (error) {
      logger.error('Failed to generate download URL', error as Error, { fileKey, userId });
      throw error;
    }
  }

  /**
   * List user's uploaded files
   */
  async listUserFiles(userId: string): Promise<FileUploadResult[]> {
    try {
      const prefix = `uploads/${userId}/`;
      const files = await this.s3Service.listFiles(prefix);

      const results: FileUploadResult[] = files.map(file => ({
        id: file.metadata?.uploadId || file.key,
        key: file.key,
        url: this.s3Service.getPublicUrl(file.key),
        filename: file.metadata?.originalName || file.key.split('/').pop() || file.key,
        size: file.size,
        contentType: file.contentType,
        uploadedAt: file.lastModified,
        userId
      }));

      logger.info('Listed user files', { userId, count: results.length });

      return results;

    } catch (error) {
      logger.error('Failed to list user files', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Validate file before upload
   */
  private async validateFile(file: File, options: FileUploadOptions): Promise<void> {
    const maxSize = options.maxSize || this.defaultMaxSize;
    const allowedTypes = options.allowedTypes || this.defaultAllowedTypes;

    // Check file size
    if (file.size > maxSize) {
      throw new Error(`File size ${file.size} bytes exceeds maximum allowed size of ${maxSize} bytes`);
    }

    // Check file type
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Additional validation for specific file types
    if (file.type === 'application/pdf' && !isPDFFile(file)) {
      throw new Error('File appears to be corrupted or is not a valid PDF');
    }
  }

  /**
   * Extract text content from file
   */
  private async extractTextContent(file: File): Promise<string> {
    if (isPDFFile(file)) {
      return await parsePDF(file);
    } else if (file.type.startsWith('text/')) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('Failed to read text file'));
        reader.readAsText(file);
      });
    } else {
      throw new Error(`Text extraction not supported for file type: ${file.type}`);
    }
  }

  /**
   * Generate unique upload ID
   */
  private generateUploadId(): string {
    return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

// Export singleton instance
export const fileUploadService = new FileUploadService();