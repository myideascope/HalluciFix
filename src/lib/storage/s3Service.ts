/**
 * AWS S3 File Storage Service
 * 
 * Handles file uploads, downloads, and management using AWS S3.
 * Replaces Supabase storage with direct S3 operations.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../logging';

export interface S3Config {
  region: string;
  bucketName: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
  // Remove serverSideEncryption from options since buckets use AWS-managed encryption
  storageClass?: 'STANDARD' | 'REDUCED_REDUNDANCY' | 'STANDARD_IA' | 'ONEZONE_IA' | 'INTELLIGENT_TIERING' | 'GLACIER' | 'DEEP_ARCHIVE';
}

export interface FileMetadata {
  key: string;
  size: number;
  lastModified: Date;
  contentType: string;
  etag: string;
  metadata?: Record<string, string>;
}

export interface PresignedUrlOptions {
  expiresIn?: number; // seconds
  contentType?: string;
  contentLength?: number;
}

class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(config: S3Config) {
    this.bucketName = config.bucketName;
    
    this.s3Client = new S3Client({
      region: config.region,
      credentials: config.accessKeyId && config.secretAccessKey ? {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      } : undefined,
      endpoint: config.endpoint
    });

    logger.info('S3 service initialized', {
      region: config.region,
      bucket: config.bucketName
    });
  }

  /**
   * Upload a file to S3
   */
  async uploadFile(
    key: string,
    file: File | Buffer | Uint8Array | string,
    options: UploadOptions = {}
  ): Promise<{ key: string; url: string; etag: string }> {
    try {
      const startTime = Date.now();

      // Prepare file data
      let body: Buffer | Uint8Array | string;
      let contentType = options.contentType;

      if (file instanceof File) {
        body = new Uint8Array(await file.arrayBuffer());
        contentType = contentType || file.type || 'application/octet-stream';
      } else {
        body = file;
        contentType = contentType || 'application/octet-stream';
      }

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: options.metadata,
        StorageClass: options.storageClass,
        Tagging: options.tags ? Object.entries(options.tags)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&') : undefined
      });

      const result = await this.s3Client.send(command);
      const duration = Date.now() - startTime;

      const url = `https://${this.bucketName}.s3.amazonaws.com/${key}`;

      logger.info('File uploaded to S3', {
        key,
        contentType,
        duration,
        etag: result.ETag
      });

      return {
        key,
        url,
        etag: result.ETag || ''
      };

    } catch (error) {
      logger.error('Failed to upload file to S3', error as Error, { key });
      throw error;
    }
  }

  /**
   * Generate a presigned URL for direct upload
   */
  async generatePresignedUploadUrl(
    key: string,
    options: PresignedUrlOptions = {}
  ): Promise<{ url: string; fields?: Record<string, string> }> {
    try {
      const { expiresIn = 3600, contentType, contentLength } = options;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      logger.info('Generated presigned upload URL', {
        key,
        expiresIn,
        contentType
      });

      return { url };

    } catch (error) {
      logger.error('Failed to generate presigned upload URL', error as Error, { key });
      throw error;
    }
  }

  /**
   * Generate a presigned URL for download
   */
  async generatePresignedDownloadUrl(
    key: string,
    expiresIn = 3600
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      logger.info('Generated presigned download URL', {
        key,
        expiresIn
      });

      return url;

    } catch (error) {
      logger.error('Failed to generate presigned download URL', error as Error, { key });
      throw error;
    }
  }

  /**
   * Download a file from S3
   */
  async downloadFile(key: string): Promise<{ body: Uint8Array; metadata: FileMetadata }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const result = await this.s3Client.send(command);

      if (!result.Body) {
        throw new Error('File not found or empty');
      }

      const body = await result.Body.transformToByteArray();

      const metadata: FileMetadata = {
        key,
        size: result.ContentLength || 0,
        lastModified: result.LastModified || new Date(),
        contentType: result.ContentType || 'application/octet-stream',
        etag: result.ETag || '',
        metadata: result.Metadata
      };

      logger.info('File downloaded from S3', {
        key,
        size: metadata.size,
        contentType: metadata.contentType
      });

      return { body, metadata };

    } catch (error) {
      logger.error('Failed to download file from S3', error as Error, { key });
      throw error;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.s3Client.send(command);

      logger.info('File deleted from S3', { key });

    } catch (error) {
      logger.error('Failed to delete file from S3', error as Error, { key });
      throw error;
    }
  }

  /**
   * Check if a file exists in S3
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.s3Client.send(command);
      return true;

    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      logger.error('Failed to check file existence in S3', error, { key });
      throw error;
    }
  }

  /**
   * Get file metadata without downloading
   */
  async getFileMetadata(key: string): Promise<FileMetadata> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const result = await this.s3Client.send(command);

      return {
        key,
        size: result.ContentLength || 0,
        lastModified: result.LastModified || new Date(),
        contentType: result.ContentType || 'application/octet-stream',
        etag: result.ETag || '',
        metadata: result.Metadata
      };

    } catch (error) {
      logger.error('Failed to get file metadata from S3', error as Error, { key });
      throw error;
    }
  }

  /**
   * List files in S3 with optional prefix
   */
  async listFiles(
    prefix?: string,
    maxKeys = 1000
  ): Promise<FileMetadata[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys
      });

      const result = await this.s3Client.send(command);

      const files: FileMetadata[] = (result.Contents || []).map(obj => ({
        key: obj.Key || '',
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        contentType: 'application/octet-stream', // Not available in list operation
        etag: obj.ETag || ''
      }));

      logger.info('Listed files from S3', {
        prefix,
        count: files.length
      });

      return files;

    } catch (error) {
      logger.error('Failed to list files from S3', error as Error, { prefix });
      throw error;
    }
  }

  /**
   * Generate a unique key for file storage
   */
  generateFileKey(userId: string, filename: string, prefix = 'uploads'): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    return `${prefix}/${userId}/${timestamp}_${randomId}_${sanitizedFilename}`;
  }

  /**
   * Get the public URL for a file (if bucket allows public access)
   */
  getPublicUrl(key: string): string {
    return `https://${this.bucketName}.s3.amazonaws.com/${key}`;
  }
}

// Create S3 service instance
let s3Service: S3Service | null = null;

/**
 * Get or create the S3 service instance
 */
export function getS3Service(): S3Service {
  if (!s3Service) {
    const config: S3Config = {
      region: process.env.AWS_REGION || 'us-east-1',
      bucketName: process.env.S3_BUCKET_NAME || 'hallucifix-documents',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT
    };

    if (!config.bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is required');
    }

    s3Service = new S3Service(config);
  }

  return s3Service;
}

// Export the service class for testing
export { S3Service };