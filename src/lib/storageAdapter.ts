/**
 * Storage Adapter
 * 
 * Provides a unified interface for file storage operations that can switch
 * between Supabase Storage and AWS S3 based on migration status
 */

import { supabase } from './supabase';
import { getS3Service, S3Service } from './storage/s3Service';
import { logger } from './logging';

export interface StorageAdapter {
  uploadFile(
    path: string,
    file: File | Buffer | Uint8Array,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<{ path: string; url: string; error?: Error }>;

  downloadFile(path: string): Promise<{ data: Uint8Array | null; error?: Error }>;

  deleteFile(path: string): Promise<{ error?: Error }>;

  generateSignedUrl(
    path: string,
    expiresIn?: number
  ): Promise<{ url: string | null; error?: Error }>;

  listFiles(
    prefix?: string,
    limit?: number
  ): Promise<{ files: Array<{ name: string; size?: number; lastModified?: Date }> | null; error?: Error }>;
}

class SupabaseStorageAdapter implements StorageAdapter {
  private bucketName = 'documents';
  private adapterLogger = logger.child({ component: 'SupabaseStorageAdapter' });

  async uploadFile(
    path: string,
    file: File | Buffer | Uint8Array,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<{ path: string; url: string; error?: Error }> {
    try {
      let fileData: ArrayBuffer;
      
      if (file instanceof File) {
        fileData = await file.arrayBuffer();
      } else if (file instanceof Buffer) {
        fileData = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
      } else {
        fileData = file.buffer;
      }

      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .upload(path, fileData, {
          contentType: options?.contentType,
          metadata: options?.metadata,
          upsert: true
        });

      if (error) {
        this.adapterLogger.error('Supabase file upload failed', error, { path });
        return { path, url: '', error };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(path);

      return {
        path: data.path,
        url: urlData.publicUrl,
        error: undefined
      };

    } catch (error) {
      this.adapterLogger.error('Supabase upload operation failed', error as Error, { path });
      return { path, url: '', error: error as Error };
    }
  }

  async downloadFile(path: string): Promise<{ data: Uint8Array | null; error?: Error }> {
    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .download(path);

      if (error) {
        this.adapterLogger.error('Supabase file download failed', error, { path });
        return { data: null, error };
      }

      const arrayBuffer = await data.arrayBuffer();
      return { data: new Uint8Array(arrayBuffer), error: undefined };

    } catch (error) {
      this.adapterLogger.error('Supabase download operation failed', error as Error, { path });
      return { data: null, error: error as Error };
    }
  }

  async deleteFile(path: string): Promise<{ error?: Error }> {
    try {
      const { error } = await supabase.storage
        .from(this.bucketName)
        .remove([path]);

      if (error) {
        this.adapterLogger.error('Supabase file deletion failed', error, { path });
        return { error };
      }

      return { error: undefined };

    } catch (error) {
      this.adapterLogger.error('Supabase delete operation failed', error as Error, { path });
      return { error: error as Error };
    }
  }

  async generateSignedUrl(
    path: string,
    expiresIn: number = 3600
  ): Promise<{ url: string | null; error?: Error }> {
    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .createSignedUrl(path, expiresIn);

      if (error) {
        this.adapterLogger.error('Supabase signed URL generation failed', error, { path });
        return { url: null, error };
      }

      return { url: data.signedUrl, error: undefined };

    } catch (error) {
      this.adapterLogger.error('Supabase signed URL operation failed', error as Error, { path });
      return { url: null, error: error as Error };
    }
  }

  async listFiles(
    prefix?: string,
    limit: number = 1000
  ): Promise<{ files: Array<{ name: string; size?: number; lastModified?: Date }> | null; error?: Error }> {
    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .list(prefix || '', { limit });

      if (error) {
        this.adapterLogger.error('Supabase file listing failed', error, { prefix });
        return { files: null, error };
      }

      const files = data.map(file => ({
        name: file.name,
        size: file.metadata?.size,
        lastModified: file.updated_at ? new Date(file.updated_at) : undefined
      }));

      return { files, error: undefined };

    } catch (error) {
      this.adapterLogger.error('Supabase list operation failed', error as Error, { prefix });
      return { files: null, error: error as Error };
    }
  }
}

class S3StorageAdapter implements StorageAdapter {
  private s3Service: S3Service;
  private adapterLogger = logger.child({ component: 'S3StorageAdapter' });

  constructor() {
    this.s3Service = getS3Service();
  }

  async uploadFile(
    path: string,
    file: File | Buffer | Uint8Array,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<{ path: string; url: string; error?: Error }> {
    try {
      const result = await this.s3Service.uploadFile(path, file, {
        contentType: options?.contentType,
        metadata: options?.metadata
      });

      return {
        path: result.key,
        url: result.url,
        error: undefined
      };

    } catch (error) {
      this.adapterLogger.error('S3 upload operation failed', error as Error, { path });
      return { path, url: '', error: error as Error };
    }
  }

  async downloadFile(path: string): Promise<{ data: Uint8Array | null; error?: Error }> {
    try {
      const result = await this.s3Service.downloadFile(path);
      return { data: result.body, error: undefined };

    } catch (error) {
      this.adapterLogger.error('S3 download operation failed', error as Error, { path });
      return { data: null, error: error as Error };
    }
  }

  async deleteFile(path: string): Promise<{ error?: Error }> {
    try {
      await this.s3Service.deleteFile(path);
      return { error: undefined };

    } catch (error) {
      this.adapterLogger.error('S3 delete operation failed', error as Error, { path });
      return { error: error as Error };
    }
  }

  async generateSignedUrl(
    path: string,
    expiresIn: number = 3600
  ): Promise<{ url: string | null; error?: Error }> {
    try {
      const url = await this.s3Service.generatePresignedDownloadUrl(path, expiresIn);
      return { url, error: undefined };

    } catch (error) {
      this.adapterLogger.error('S3 signed URL operation failed', error as Error, { path });
      return { url: null, error: error as Error };
    }
  }

  async listFiles(
    prefix?: string,
    limit: number = 1000
  ): Promise<{ files: Array<{ name: string; size?: number; lastModified?: Date }> | null; error?: Error }> {
    try {
      const files = await this.s3Service.listFiles(prefix, limit);
      
      const formattedFiles = files.map(file => ({
        name: file.key,
        size: file.size,
        lastModified: file.lastModified
      }));

      return { files: formattedFiles, error: undefined };

    } catch (error) {
      this.adapterLogger.error('S3 list operation failed', error as Error, { prefix });
      return { files: null, error: error as Error };
    }
  }
}

class StorageAdapterService {
  private supabaseAdapter = new SupabaseStorageAdapter();
  private s3Adapter: S3StorageAdapter | null = null;
  private adapterLogger = logger.child({ component: 'StorageAdapterService' });

  /**
   * Get the appropriate storage adapter based on migration status
   */
  private getAdapter(): StorageAdapter {
    // Check if migration to S3 has been completed
    const migrationAuthMode = localStorage.getItem('hallucifix_migration_auth_mode');
    
    if (migrationAuthMode === 'cognito') {
      // If using Cognito, assume S3 migration is also complete
      if (!this.s3Adapter) {
        try {
          this.s3Adapter = new S3StorageAdapter();
        } catch (error) {
          this.adapterLogger.warn('Failed to initialize S3 adapter, falling back to Supabase', error as Error);
          return this.supabaseAdapter;
        }
      }
      
      this.adapterLogger.debug('Using S3 storage adapter');
      return this.s3Adapter;
    }

    this.adapterLogger.debug('Using Supabase storage adapter');
    return this.supabaseAdapter;
  }

  /**
   * Upload a file using the appropriate adapter
   */
  async uploadFile(
    path: string,
    file: File | Buffer | Uint8Array,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<{ path: string; url: string; error?: Error }> {
    const adapter = this.getAdapter();
    return adapter.uploadFile(path, file, options);
  }

  /**
   * Download a file using the appropriate adapter
   */
  async downloadFile(path: string): Promise<{ data: Uint8Array | null; error?: Error }> {
    const adapter = this.getAdapter();
    return adapter.downloadFile(path);
  }

  /**
   * Delete a file using the appropriate adapter
   */
  async deleteFile(path: string): Promise<{ error?: Error }> {
    const adapter = this.getAdapter();
    return adapter.deleteFile(path);
  }

  /**
   * Generate a signed URL using the appropriate adapter
   */
  async generateSignedUrl(
    path: string,
    expiresIn?: number
  ): Promise<{ url: string | null; error?: Error }> {
    const adapter = this.getAdapter();
    return adapter.generateSignedUrl(path, expiresIn);
  }

  /**
   * List files using the appropriate adapter
   */
  async listFiles(
    prefix?: string,
    limit?: number
  ): Promise<{ files: Array<{ name: string; size?: number; lastModified?: Date }> | null; error?: Error }> {
    const adapter = this.getAdapter();
    return adapter.listFiles(prefix, limit);
  }

  /**
   * Check which storage adapter is currently being used
   */
  getCurrentAdapterType(): 'supabase' | 's3' {
    const migrationAuthMode = localStorage.getItem('hallucifix_migration_auth_mode');
    return migrationAuthMode === 'cognito' ? 's3' : 'supabase';
  }
}

// Export singleton instance
export const storageAdapter = new StorageAdapterService();

// Export types
export type { StorageAdapter };