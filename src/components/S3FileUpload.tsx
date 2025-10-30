/**
 * S3 File Upload Component
 * 
 * Enhanced file upload component with direct S3 integration
 * Supports both direct upload and presigned URL upload methods
 */

import React, { useState, useRef, useCallback } from 'react';
import { 
  Upload, 
  File, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Cloud,
  Download,
  Trash2
} from 'lucide-react';
import { useFileUpload, UploadState } from '../hooks/useFileUpload';
import { FileUploadResult } from '../lib/storage/fileUploadService';

export interface S3FileUploadProps {
  onUploadComplete?: (results: FileUploadResult[]) => void;
  onUploadError?: (error: Error) => void;
  maxFiles?: number;
  maxFileSize?: number; // bytes
  allowedTypes?: string[];
  extractText?: boolean;
  showPreview?: boolean;
  className?: string;
}

interface UploadedFile extends FileUploadResult {
  file: File;
  uploadState: 'uploading' | 'completed' | 'error';
  error?: string;
}

export const S3FileUpload: React.FC<S3FileUploadProps> = ({
  onUploadComplete,
  onUploadError,
  maxFiles = 10,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  allowedTypes = [
    'text/plain',
    'text/markdown', 
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  extractText = true,
  showPreview = true,
  className = ''
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { 
    uploadState, 
    uploadFiles, 
    generatePresignedUpload,
    deleteFile,
    getDownloadUrl,
    reset 
  } = useFileUpload({
    maxSize: maxFileSize,
    allowedTypes,
    extractText,
    onProgress: (progress) => {
      // Update progress for current upload
      setUploadedFiles(prev => prev.map(file => 
        file.uploadState === 'uploading' 
          ? { ...file, progress } 
          : file
      ));
    },
    onSuccess: (result) => {
      setUploadedFiles(prev => prev.map(file => 
        file.id === result.id 
          ? { ...file, uploadState: 'completed' as const }
          : file
      ));
    },
    onError: (error) => {
      setUploadedFiles(prev => prev.map(file => 
        file.uploadState === 'uploading' 
          ? { ...file, uploadState: 'error' as const, error: error.message }
          : file
      ));
      onUploadError?.(error);
    }
  });

  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSize) {
      return `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum allowed size of ${(maxFileSize / 1024 / 1024).toFixed(1)}MB`;
    }

    if (!allowedTypes.includes(file.type)) {
      return `File type ${file.type} is not allowed`;
    }

    return null;
  };

  const handleFileSelect = useCallback(async (files: File[]) => {
    if (uploadedFiles.length + files.length > maxFiles) {
      onUploadError?.(new Error(`Cannot upload more than ${maxFiles} files`));
      return;
    }

    // Validate files
    const validFiles: File[] = [];
    const invalidFiles: { file: File; error: string }[] = [];

    files.forEach(file => {
      const error = validateFile(file);
      if (error) {
        invalidFiles.push({ file, error });
      } else {
        validFiles.push(file);
      }
    });

    // Add invalid files to state with error status
    if (invalidFiles.length > 0) {
      const errorFiles: UploadedFile[] = invalidFiles.map(({ file, error }) => ({
        id: `error_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        key: '',
        url: '',
        filename: file.name,
        size: file.size,
        contentType: file.type,
        uploadedAt: new Date(),
        userId: '',
        file,
        uploadState: 'error',
        error
      }));

      setUploadedFiles(prev => [...prev, ...errorFiles]);
    }

    if (validFiles.length === 0) return;

    // Add files to state with uploading status
    const uploadingFiles: UploadedFile[] = validFiles.map(file => ({
      id: `uploading_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      key: '',
      url: '',
      filename: file.name,
      size: file.size,
      contentType: file.type,
      uploadedAt: new Date(),
      userId: '',
      file,
      uploadState: 'uploading'
    }));

    setUploadedFiles(prev => [...prev, ...uploadingFiles]);

    try {
      // Upload files
      const results = await uploadFiles(validFiles);
      
      // Update state with results
      setUploadedFiles(prev => prev.map(file => {
        if (file.uploadState === 'uploading') {
          const result = results.find(r => r.filename === file.filename);
          if (result) {
            return {
              ...file,
              ...result,
              uploadState: 'completed' as const
            };
          }
        }
        return file;
      }));

      // Call completion callback
      const completedFiles = uploadedFiles.filter(f => f.uploadState === 'completed');
      onUploadComplete?.(completedFiles);

    } catch (error) {
      // Error handling is done in the hook's onError callback
    }
  }, [uploadedFiles, maxFiles, maxFileSize, allowedTypes, uploadFiles, onUploadComplete, onUploadError]);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      handleFileSelect(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files);
    }
  };

  const handleRemoveFile = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    
    if (file && file.uploadState === 'completed' && file.key) {
      try {
        await deleteFile(file.key);
      } catch (error) {
        console.error('Failed to delete file from S3:', error);
      }
    }

    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleDownloadFile = async (file: UploadedFile) => {
    if (file.uploadState !== 'completed' || !file.key) return;

    try {
      const downloadUrl = await getDownloadUrl(file.key);
      
      // Create temporary link and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download file:', error);
      onUploadError?.(error as Error);
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.includes('pdf')) return '📄';
    if (contentType.includes('word')) return '📝';
    if (contentType.includes('text')) return '📃';
    return '📁';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Upload Area */}
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${isDragOver 
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
          ${uploadState.isUploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={allowedTypes.join(',')}
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center space-y-4">
          {uploadState.isUploading ? (
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          ) : (
            <Cloud className="w-12 h-12 text-gray-400" />
          )}
          
          <div>
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {uploadState.isUploading ? 'Uploading files...' : 'Upload files to S3'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Drag and drop files here, or click to select
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Max {maxFiles} files, {formatFileSize(maxFileSize)} each
            </p>
          </div>

          {uploadState.isUploading && (
            <div className="w-full max-w-xs">
              <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
                {uploadState.progress}% complete
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {uploadState.error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-300">
              {uploadState.error}
            </p>
          </div>
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Uploaded Files ({uploadedFiles.length})
          </h3>
          
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <span className="text-2xl">
                    {getFileIcon(file.contentType)}
                  </span>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {file.filename}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(file.size)}
                      {file.uploadState === 'completed' && file.content && (
                        <span className="ml-2">• Text extracted</span>
                      )}
                    </p>
                    
                    {file.error && (
                      <p className="text-xs text-red-500 mt-1">
                        {file.error}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Status Icon */}
                  {file.uploadState === 'uploading' && (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  )}
                  {file.uploadState === 'completed' && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                  {file.uploadState === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}

                  {/* Actions */}
                  {file.uploadState === 'completed' && (
                    <button
                      onClick={() => handleDownloadFile(file)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Download file"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleRemoveFile(file.id)}
                    className="p-1 text-gray-400 hover:text-red-500"
                    title="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Preview */}
      {showPreview && uploadedFiles.some(f => f.content) && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Extracted Content Preview
          </h3>
          
          {uploadedFiles
            .filter(f => f.content && f.uploadState === 'completed')
            .map((file) => (
              <div
                key={`preview-${file.id}`}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  {file.filename}
                </h4>
                <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded p-3 max-h-32 overflow-y-auto">
                  <pre className="whitespace-pre-wrap">
                    {file.content?.substring(0, 500)}
                    {file.content && file.content.length > 500 && '...'}
                  </pre>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
};

export default S3FileUpload;