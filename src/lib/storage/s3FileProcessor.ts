/**
 * S3 File Processor Service
 * 
 * Handles processing of files stored in S3
 * Provides text extraction, metadata analysis, and content processing
 */

import { getS3Service } from './s3Service';
import { parsePDF, isPDFFile } from '../pdfParser';
import { logger } from '../logging';

export interface S3FileProcessingResult {
  key: string;
  filename: string;
  contentType: string;
  size: number;
  content?: string;
  metadata?: {
    title?: string;
    author?: string;
    pageCount?: number;
    wordCount?: number;
    language?: string;
    extractedAt: Date;
  };
  processingTime: number;
  error?: string;
}

export interface S3ProcessingOptions {
  extractText?: boolean;
  extractMetadata?: boolean;
  maxContentLength?: number;
  timeout?: number;
}

class S3FileProcessor {
  private s3Service = getS3Service();
  private defaultTimeout = 30000; // 30 seconds
  private maxContentLength = 1024 * 1024; // 1MB of text

  /**
   * Process a file from S3
   */
  async processFile(
    fileKey: string,
    options: S3ProcessingOptions = {}
  ): Promise<S3FileProcessingResult> {
    const startTime = Date.now();
    
    try {
      // Get file metadata
      const metadata = await this.s3Service.getFileMetadata(fileKey);
      
      const result: S3FileProcessingResult = {
        key: fileKey,
        filename: metadata.metadata?.originalName || fileKey.split('/').pop() || fileKey,
        contentType: metadata.contentType,
        size: metadata.size,
        processingTime: 0
      };

      // Extract text content if requested
      if (options.extractText !== false) {
        try {
          const content = await this.extractTextFromS3File(fileKey, metadata.contentType, options);
          result.content = content;
          
          // Extract metadata from content
          if (options.extractMetadata !== false && content) {
            result.metadata = this.extractContentMetadata(content, metadata.contentType);
          }
        } catch (error) {
          logger.warn('Failed to extract text from S3 file', error as Error, {
            fileKey,
            contentType: metadata.contentType
          });
          result.error = `Text extraction failed: ${(error as Error).message}`;
        }
      }

      result.processingTime = Date.now() - startTime;

      logger.info('S3 file processed successfully', {
        fileKey,
        contentType: metadata.contentType,
        size: metadata.size,
        hasContent: !!result.content,
        processingTime: result.processingTime
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Failed to process S3 file', error as Error, {
        fileKey,
        processingTime
      });

      return {
        key: fileKey,
        filename: fileKey.split('/').pop() || fileKey,
        contentType: 'unknown',
        size: 0,
        processingTime,
        error: (error as Error).message
      };
    }
  }

  /**
   * Process multiple files from S3 in batch
   */
  async processFiles(
    fileKeys: string[],
    options: S3ProcessingOptions = {}
  ): Promise<S3FileProcessingResult[]> {
    const startTime = Date.now();
    
    logger.info('Starting batch S3 file processing', {
      fileCount: fileKeys.length
    });

    const results: S3FileProcessingResult[] = [];
    const batchSize = 5; // Process 5 files concurrently

    for (let i = 0; i < fileKeys.length; i += batchSize) {
      const batch = fileKeys.slice(i, i + batchSize);
      
      const batchPromises = batch.map(fileKey => 
        this.processFile(fileKey, options).catch(error => ({
          key: fileKey,
          filename: fileKey.split('/').pop() || fileKey,
          contentType: 'unknown',
          size: 0,
          processingTime: 0,
          error: error.message
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => !r.error).length;

    logger.info('Batch S3 file processing completed', {
      totalFiles: fileKeys.length,
      successCount,
      failureCount: fileKeys.length - successCount,
      totalTime
    });

    return results;
  }

  /**
   * Extract text content from S3 file
   */
  private async extractTextFromS3File(
    fileKey: string,
    contentType: string,
    options: S3ProcessingOptions
  ): Promise<string> {
    const timeout = options.timeout || this.defaultTimeout;
    const maxLength = options.maxContentLength || this.maxContentLength;

    // Download file from S3
    const downloadResult = await this.s3Service.downloadFile(fileKey);
    
    // Create File object for processing
    const filename = fileKey.split('/').pop() || fileKey;
    const file = new File([downloadResult.body], filename, { type: contentType });

    let content: string;

    // Extract text based on content type
    if (contentType === 'application/pdf' || isPDFFile(file)) {
      content = await this.extractPDFText(file, timeout);
    } else if (contentType.startsWith('text/')) {
      content = await this.extractPlainText(downloadResult.body);
    } else if (this.isWordDocument(contentType)) {
      content = await this.extractWordText(downloadResult.body);
    } else {
      throw new Error(`Text extraction not supported for content type: ${contentType}`);
    }

    // Truncate if too long
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '\n\n[Content truncated...]';
    }

    return content;
  }

  /**
   * Extract text from PDF file
   */
  private async extractPDFText(file: File, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('PDF text extraction timed out'));
      }, timeout);

      parsePDF(file)
        .then(text => {
          clearTimeout(timeoutId);
          resolve(text);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Extract text from plain text file
   */
  private async extractPlainText(buffer: Uint8Array): Promise<string> {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer);
  }

  /**
   * Extract text from Word document
   */
  private async extractWordText(buffer: Uint8Array): Promise<string> {
    // For now, return a placeholder
    // In a real implementation, you would use a library like mammoth.js
    return '[Word document text extraction not yet implemented]';
  }

  /**
   * Check if content type is a Word document
   */
  private isWordDocument(contentType: string): boolean {
    return contentType === 'application/msword' ||
           contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  /**
   * Extract metadata from content
   */
  private extractContentMetadata(content: string, contentType: string): S3FileProcessingResult['metadata'] {
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    
    const metadata: S3FileProcessingResult['metadata'] = {
      wordCount,
      extractedAt: new Date()
    };

    // Detect language (simple heuristic)
    metadata.language = this.detectLanguage(content);

    // Extract title for certain content types
    if (contentType.startsWith('text/')) {
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      if (lines.length > 0) {
        metadata.title = lines[0].substring(0, 100);
      }
    }

    return metadata;
  }

  /**
   * Simple language detection
   */
  private detectLanguage(content: string): string {
    // Very basic language detection
    const sample = content.substring(0, 1000).toLowerCase();
    
    // Common English words
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const englishCount = englishWords.reduce((count, word) => 
      count + (sample.split(word).length - 1), 0
    );

    if (englishCount > 5) {
      return 'en';
    }

    return 'unknown';
  }

  /**
   * Get processing statistics for a user's files
   */
  async getProcessingStats(userId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    contentTypes: Record<string, number>;
    averageProcessingTime: number;
  }> {
    try {
      const prefix = `uploads/${userId}/`;
      const files = await this.s3Service.listFiles(prefix);

      const stats = {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
        contentTypes: {} as Record<string, number>,
        averageProcessingTime: 0
      };

      // Count content types
      files.forEach(file => {
        const contentType = file.contentType || 'unknown';
        stats.contentTypes[contentType] = (stats.contentTypes[contentType] || 0) + 1;
      });

      logger.info('Generated processing stats', {
        userId,
        ...stats
      });

      return stats;

    } catch (error) {
      logger.error('Failed to get processing stats', error as Error, { userId });
      throw error;
    }
  }
}

// Export singleton instance
export const s3FileProcessor = new S3FileProcessor();