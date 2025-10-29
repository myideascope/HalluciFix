/**
 * File Upload Hook
 * 
 * React hook for handling file uploads with S3 integration.
 * Provides upload progress, error handling, and state management.
 */

import { useState, useCallback } from 'react';
import { fileUploadService, FileUploadResult, FileUploadOptions } from '../lib/storage/fileUploadService';
import { useAuth } from './useAuth';
import { logger } from '../lib/logging';

export interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  result: FileUploadResult | null;
}

export interface UseFileUploadOptions extends FileUploadOptions {
  onProgress?: (progress: number) => void;
  onSuccess?: (result: FileUploadResult) => void;
  onError?: (error: Error) => void;
}

export interface UseFileUploadReturn {
  uploadState: UploadState;
  uploadFile: (file: File) => Promise<FileUploadResult | null>;
  uploadFiles: (files: File[]) => Promise<FileUploadResult[]>;
  generatePresignedUpload: (filename: string, contentType: string) => Promise<{
    uploadUrl: string;
    fileKey: string;
    uploadId: string;
  }>;
  processUploadedFile: (fileKey: string, uploadId: string) => Promise<FileUploadResult | null>;
  deleteFile: (fileKey: string) => Promise<void>;
  getDownloadUrl: (fileKey: string) => Promise<string>;
  reset: () => void;
}

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const { user } = useAuth();
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    result: null
  });

  const reset = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: 0,
      error: null,
      result: null
    });
  }, []);

  const uploadFile = useCallback(async (file: File): Promise<FileUploadResult | null> => {
    if (!user) {
      const error = new Error('User must be authenticated to upload files');
      setUploadState(prev => ({ ...prev, error: error.message }));
      options.onError?.(error);
      return null;
    }

    try {
      setUploadState({
        isUploading: true,
        progress: 0,
        error: null,
        result: null
      });

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadState(prev => {
          const newProgress = Math.min(prev.progress + 10, 90);
          options.onProgress?.(newProgress);
          return { ...prev, progress: newProgress };
        });
      }, 200);

      const result = await fileUploadService.uploadFile(file, user.id, options);

      clearInterval(progressInterval);

      setUploadState({
        isUploading: false,
        progress: 100,
        error: null,
        result
      });

      options.onProgress?.(100);
      options.onSuccess?.(result);

      logger.info('File upload completed via hook', {
        filename: file.name,
        uploadId: result.id
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      
      setUploadState({
        isUploading: false,
        progress: 0,
        error: errorMessage,
        result: null
      });

      options.onError?.(error as Error);

      logger.error('File upload failed via hook', error as Error, {
        filename: file.name,
        userId: user.id
      });

      return null;
    }
  }, [user, options]);

  const uploadFiles = useCallback(async (files: File[]): Promise<FileUploadResult[]> => {
    if (!user) {
      const error = new Error('User must be authenticated to upload files');
      setUploadState(prev => ({ ...prev, error: error.message }));
      options.onError?.(error);
      return [];
    }

    try {
      setUploadState({
        isUploading: true,
        progress: 0,
        error: null,
        result: null
      });

      const results: FileUploadResult[] = [];
      const totalFiles = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          const result = await fileUploadService.uploadFile(file, user.id, options);
          results.push(result);

          const progress = Math.round(((i + 1) / totalFiles) * 100);
          setUploadState(prev => ({ ...prev, progress }));
          options.onProgress?.(progress);

        } catch (error) {
          logger.error('Failed to upload file in batch', error as Error, {
            filename: file.name,
            index: i
          });
          // Continue with other files
        }
      }

      setUploadState({
        isUploading: false,
        progress: 100,
        error: results.length === 0 ? 'All uploads failed' : null,
        result: null
      });

      if (results.length > 0) {
        options.onSuccess?.(results[0]); // Call with first result for compatibility
      }

      logger.info('Batch file upload completed via hook', {
        totalFiles,
        successCount: results.length
      });

      return results;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Batch upload failed';
      
      setUploadState({
        isUploading: false,
        progress: 0,
        error: errorMessage,
        result: null
      });

      options.onError?.(error as Error);

      return [];
    }
  }, [user, options]);

  const generatePresignedUpload = useCallback(async (
    filename: string, 
    contentType: string
  ) => {
    if (!user) {
      throw new Error('User must be authenticated to generate upload URLs');
    }

    try {
      const result = await fileUploadService.generatePresignedUpload(
        filename,
        contentType,
        user.id,
        options
      );

      logger.info('Generated presigned upload URL via hook', {
        filename,
        uploadId: result.uploadId
      });

      return result;

    } catch (error) {
      logger.error('Failed to generate presigned upload URL via hook', error as Error, {
        filename,
        userId: user.id
      });
      throw error;
    }
  }, [user, options]);

  const processUploadedFile = useCallback(async (
    fileKey: string,
    uploadId: string
  ): Promise<FileUploadResult | null> => {
    if (!user) {
      const error = new Error('User must be authenticated to process files');
      setUploadState(prev => ({ ...prev, error: error.message }));
      return null;
    }

    try {
      setUploadState(prev => ({ ...prev, isUploading: true, error: null }));

      const result = await fileUploadService.processUploadedFile(
        fileKey,
        uploadId,
        user.id,
        options
      );

      setUploadState({
        isUploading: false,
        progress: 100,
        error: null,
        result
      });

      options.onSuccess?.(result);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Processing failed';
      
      setUploadState({
        isUploading: false,
        progress: 0,
        error: errorMessage,
        result: null
      });

      options.onError?.(error as Error);
      return null;
    }
  }, [user, options]);

  const deleteFile = useCallback(async (fileKey: string): Promise<void> => {
    if (!user) {
      throw new Error('User must be authenticated to delete files');
    }

    try {
      await fileUploadService.deleteFile(fileKey, user.id);

      logger.info('File deleted via hook', { fileKey, userId: user.id });

    } catch (error) {
      logger.error('Failed to delete file via hook', error as Error, {
        fileKey,
        userId: user.id
      });
      throw error;
    }
  }, [user]);

  const getDownloadUrl = useCallback(async (fileKey: string): Promise<string> => {
    if (!user) {
      throw new Error('User must be authenticated to get download URLs');
    }

    try {
      const url = await fileUploadService.getDownloadUrl(fileKey, user.id);

      logger.info('Generated download URL via hook', { fileKey, userId: user.id });

      return url;

    } catch (error) {
      logger.error('Failed to generate download URL via hook', error as Error, {
        fileKey,
        userId: user.id
      });
      throw error;
    }
  }, [user]);

  return {
    uploadState,
    uploadFile,
    uploadFiles,
    generatePresignedUpload,
    processUploadedFile,
    deleteFile,
    getDownloadUrl,
    reset
  };
}