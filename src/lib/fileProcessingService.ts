import { googleDriveService } from './googleDrive';
import { mimeTypeValidator } from './mimeTypeValidator';

export interface ProcessedFile {
  id: string;
  name: string;
  content: string;
  mimeType: string;
  originalMimeType: string;
  size: number;
  truncated: boolean;
  processingTime: number;
  extractedMetadata?: {
    title?: string;
    author?: string;
    createdDate?: string;
    modifiedDate?: string;
    pageCount?: number;
    wordCount?: number;
  };
}

export interface ProcessingOptions {
  maxSizeBytes?: number;
  preferredFormat?: string;
  extractMetadata?: boolean;
  chunkSize?: number;
  maxChunks?: number;
}

export class FileProcessingError extends Error {
  constructor(
    public code: string,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'FileProcessingError';
  }
}

class FileProcessingService {
  private readonly DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB
  private readonly DEFAULT_MAX_CHUNKS = 50;

  /**
   * Process a single file from Google Drive
   */
  async processFile(
    fileId: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessedFile> {
    const startTime = Date.now();
    
    try {
      // Get file metadata first
      const fileInfo = await googleDriveService.getFileInfo(fileId);
      if (!fileInfo) {
        throw new FileProcessingError(
          'FILE_NOT_FOUND',
          `File with ID ${fileId} not found`
        );
      }

      // Validate file type
      if (!this.isSupportedMimeType(fileInfo.mimeType)) {
        throw new FileProcessingError(
          'UNSUPPORTED_FILE_TYPE',
          `File type ${fileInfo.mimeType} is not supported for processing`
        );
      }

      // Validate file size
      const maxSize = options.maxSizeBytes || this.DEFAULT_MAX_SIZE;
      const fileSize = fileInfo.size ? parseInt(fileInfo.size) : 0;
      
      if (fileSize > maxSize) {
        throw new FileProcessingError(
          'FILE_TOO_LARGE',
          `File size (${this.formatBytes(fileSize)}) exceeds maximum allowed size (${this.formatBytes(maxSize)})`
        );
      }

      // Determine the best format for processing
      const preferredFormat = this.getBestProcessingFormat(fileInfo.mimeType, options.preferredFormat);

      // Download and process the file
      const downloadResult = await googleDriveService.downloadFile(fileId, {
        maxSizeBytes: maxSize,
        preferredFormat
      });

      // Process content based on file type
      const processedContent = await this.processContent(
        downloadResult.content,
        downloadResult.mimeType,
        fileInfo.mimeType,
        options
      );

      // Extract metadata if requested
      let extractedMetadata;
      if (options.extractMetadata) {
        extractedMetadata = await this.extractMetadata(
          downloadResult.content,
          downloadResult.mimeType,
          fileInfo
        );
      }

      const processingTime = Date.now() - startTime;

      return {
        id: fileId,
        name: fileInfo.name,
        content: processedContent,
        mimeType: downloadResult.mimeType,
        originalMimeType: fileInfo.mimeType,
        size: downloadResult.size,
        truncated: downloadResult.truncated,
        processingTime,
        extractedMetadata
      };

    } catch (error) {
      if (error instanceof FileProcessingError) {
        throw error;
      }
      
      throw new FileProcessingError(
        'PROCESSING_FAILED',
        `Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Process multiple files in batch
   */
  async processFiles(
    fileIds: string[],
    options: ProcessingOptions = {}
  ): Promise<{
    successful: ProcessedFile[];
    failed: Array<{ fileId: string; error: FileProcessingError }>;
    totalProcessingTime: number;
  }> {
    const startTime = Date.now();
    const successful: ProcessedFile[] = [];
    const failed: Array<{ fileId: string; error: FileProcessingError }> = [];

    // Process files concurrently but with a limit to avoid overwhelming the API
    const concurrencyLimit = 3;
    const chunks = this.chunkArray(fileIds, concurrencyLimit);

    for (const chunk of chunks) {
      const promises = chunk.map(async (fileId) => {
        try {
          const result = await this.processFile(fileId, options);
          successful.push(result);
        } catch (error) {
          failed.push({
            fileId,
            error: error instanceof FileProcessingError 
              ? error 
              : new FileProcessingError('PROCESSING_FAILED', `Failed to process file ${fileId}`)
          });
        }
      });

      await Promise.all(promises);
    }

    return {
      successful,
      failed,
      totalProcessingTime: Date.now() - startTime
    };
  }

  /**
   * Process content based on MIME type
   */
  private async processContent(
    content: string,
    mimeType: string,
    originalMimeType: string,
    options: ProcessingOptions
  ): Promise<string> {
    // Handle chunking for large content
    if (options.chunkSize && content.length > options.chunkSize) {
      return this.chunkContent(content, options);
    }

    // Process based on content type
    switch (mimeType) {
      case 'text/plain':
        return this.processPlainText(content);
      
      case 'text/html':
        return this.processHtml(content);
      
      case 'text/csv':
        return this.processCsv(content);
      
      case 'application/json':
        return this.processJson(content);
      
      default:
        // For binary content (base64), we might want to extract text if possible
        if (this.isBase64Content(content)) {
          return this.processBinaryContent(content, mimeType, originalMimeType);
        }
        return content;
    }
  }

  /**
   * Extract metadata from file content
   */
  private async extractMetadata(
    content: string,
    mimeType: string,
    fileInfo: any
  ): Promise<any> {
    const metadata: any = {
      title: fileInfo.name,
      createdDate: fileInfo.createdTime,
      modifiedDate: fileInfo.modifiedTime
    };

    // Extract content-specific metadata
    switch (mimeType) {
      case 'text/plain':
        metadata.wordCount = this.countWords(content);
        metadata.lineCount = content.split('\n').length;
        break;
      
      case 'text/csv':
        const lines = content.split('\n').filter(line => line.trim());
        metadata.rowCount = lines.length - 1; // Subtract header row
        metadata.columnCount = lines[0] ? lines[0].split(',').length : 0;
        break;
      
      case 'text/html':
        metadata.wordCount = this.countWords(this.stripHtml(content));
        break;
    }

    return metadata;
  }

  /**
   * Determine the best format for processing a file
   */
  private getBestProcessingFormat(mimeType: string, preferredFormat?: string): string {
    return mimeTypeValidator.getBestExportFormat(mimeType, preferredFormat);
  }

  /**
   * Check if a MIME type is supported for processing
   */
  private isSupportedMimeType(mimeType: string): boolean {
    return mimeTypeValidator.isSupported(mimeType);
  }

  /**
   * Process plain text content
   */
  private processPlainText(content: string): string {
    // Clean up common text issues
    return content
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n') // Reduce excessive line breaks
      .trim();
  }

  /**
   * Process HTML content by stripping tags
   */
  private processHtml(content: string): string {
    return this.stripHtml(content)
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Process CSV content
   */
  private processCsv(content: string): string {
    // Basic CSV processing - could be enhanced with proper CSV parsing
    const lines = content.split('\n');
    const processedLines = lines.map(line => {
      // Remove quotes and normalize
      return line.replace(/"/g, '').trim();
    }).filter(line => line.length > 0);

    return processedLines.join('\n');
  }

  /**
   * Process JSON content
   */
  private processJson(content: string): string {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2); // Pretty print
    } catch (error) {
      return content; // Return as-is if not valid JSON
    }
  }

  /**
   * Process binary content (base64 encoded)
   */
  private processBinaryContent(content: string, mimeType: string, originalMimeType: string): string {
    // For now, return a placeholder for binary content
    // In a real implementation, you might use OCR for images or PDF parsing
    return `[Binary content: ${originalMimeType}, size: ${content.length} characters (base64)]`;
  }

  /**
   * Chunk large content into smaller pieces
   */
  private chunkContent(content: string, options: ProcessingOptions): string {
    const chunkSize = options.chunkSize || this.DEFAULT_CHUNK_SIZE;
    const maxChunks = options.maxChunks || this.DEFAULT_MAX_CHUNKS;
    
    if (content.length <= chunkSize) {
      return content;
    }

    const chunks: string[] = [];
    let offset = 0;
    let chunkCount = 0;

    while (offset < content.length && chunkCount < maxChunks) {
      const chunk = content.substring(offset, offset + chunkSize);
      chunks.push(chunk);
      offset += chunkSize;
      chunkCount++;
    }

    let result = chunks.join('\n--- CHUNK BREAK ---\n');
    
    if (offset < content.length) {
      result += '\n\n[Content truncated - exceeded maximum chunk limit]';
    }

    return result;
  }

  /**
   * Utility methods
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
  }

  private isBase64Content(content: string): boolean {
    // Simple check for base64 content
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    return base64Regex.test(content) && content.length > 100;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Validate file before processing
   */
  async validateFile(fileId: string, options: ProcessingOptions = {}): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    estimatedProcessingTime?: number;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const fileInfo = await googleDriveService.getFileInfo(fileId);
      if (!fileInfo) {
        errors.push('File not found');
        return { valid: false, errors, warnings };
      }

      // Check file type
      if (!this.isSupportedMimeType(fileInfo.mimeType)) {
        errors.push(`Unsupported file type: ${fileInfo.mimeType}`);
      }

      // Check file size
      const maxSize = options.maxSizeBytes || this.DEFAULT_MAX_SIZE;
      const fileSize = fileInfo.size ? parseInt(fileInfo.size) : 0;
      
      if (fileSize > maxSize) {
        errors.push(`File too large: ${this.formatBytes(fileSize)} (max: ${this.formatBytes(maxSize)})`);
      } else if (fileSize > maxSize * 0.8) {
        warnings.push(`Large file: ${this.formatBytes(fileSize)} - processing may be slow`);
      }

      // Check permissions
      const accessInfo = await googleDriveService.validateFileAccess(fileId);
      if (!accessInfo.canRead) {
        errors.push('Insufficient permissions to read file');
      }

      // Estimate processing time based on file size
      const estimatedProcessingTime = Math.max(1000, fileSize / 1000); // Rough estimate

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        estimatedProcessingTime
      };

    } catch (error) {
      errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, errors, warnings };
    }
  }
}

export const fileProcessingService = new FileProcessingService();