/**
 * Lambda File Processor Service
 * 
 * Integrates with AWS Lambda function for server-side file processing
 * Provides async file processing with status tracking
 */

import { logger } from '../logging';
import { config } from '../config';

export interface LambdaProcessingRequest {
  fileKey: string;
  bucketName: string;
  extractText?: boolean;
  extractMetadata?: boolean;
  maxContentLength?: number;
}

export interface LambdaProcessingResult {
  fileKey: string;
  filename: string;
  contentType: string;
  size: number;
  content?: string;
  metadata?: {
    wordCount?: number;
    pageCount?: number;
    language?: string;
    extractedAt: string;
  };
  processingTime: number;
  error?: string;
}

export interface ProcessingStatus {
  fileKey: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: LambdaProcessingResult;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

class LambdaFileProcessorService {
  private apiBaseUrl: string;
  private authToken: string | null = null;

  constructor() {
    this.apiBaseUrl = process.env.VITE_API_URL || 'https://api.hallucifix.com';
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Process a file using Lambda function
   */
  async processFile(request: LambdaProcessingRequest): Promise<LambdaProcessingResult> {
    const startTime = Date.now();

    try {
      const response = await this.makeApiRequest('/files/process', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result: LambdaProcessingResult = await response.json();
      const duration = Date.now() - startTime;

      logger.info('Lambda file processing completed', {
        fileKey: request.fileKey,
        processingTime: result.processingTime,
        requestTime: duration,
        hasContent: !!result.content,
        hasError: !!result.error
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Lambda file processing failed', error as Error, {
        fileKey: request.fileKey,
        requestTime: duration
      });

      throw error;
    }
  }

  /**
   * Get processing status for a file
   */
  async getProcessingStatus(fileKey: string): Promise<ProcessingStatus> {
    try {
      const response = await this.makeApiRequest(`/files/processing-status?fileKey=${encodeURIComponent(fileKey)}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const status: ProcessingStatus = await response.json();

      logger.info('Retrieved processing status', {
        fileKey,
        status: status.status
      });

      return status;

    } catch (error) {
      logger.error('Failed to get processing status', error as Error, { fileKey });
      throw error;
    }
  }

  /**
   * Process multiple files in batch
   */
  async processFiles(requests: LambdaProcessingRequest[]): Promise<LambdaProcessingResult[]> {
    const startTime = Date.now();
    
    logger.info('Starting batch Lambda file processing', {
      fileCount: requests.length
    });

    const results: LambdaProcessingResult[] = [];
    const batchSize = 3; // Process 3 files concurrently to avoid overwhelming the Lambda

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      const batchPromises = batch.map(request => 
        this.processFile(request).catch(error => ({
          fileKey: request.fileKey,
          filename: request.fileKey.split('/').pop() || request.fileKey,
          contentType: 'unknown',
          size: 0,
          processingTime: 0,
          error: error.message
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add small delay between batches to avoid rate limiting
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => !r.error).length;

    logger.info('Batch Lambda file processing completed', {
      totalFiles: requests.length,
      successCount,
      failureCount: requests.length - successCount,
      totalTime
    });

    return results;
  }

  /**
   * Make authenticated API request
   */
  private async makeApiRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.apiBaseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    // Add authentication if available
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const requestOptions: RequestInit = {
      ...options,
      headers
    };

    logger.debug('Making API request to Lambda processor', {
      url,
      method: options.method || 'GET',
      hasAuth: !!this.authToken
    });

    return fetch(url, requestOptions);
  }

  /**
   * Check if Lambda processing is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.makeApiRequest('/files/processing-status?fileKey=health-check', {
        method: 'GET',
      });

      // Even if the specific file doesn't exist, the endpoint should respond
      return response.status === 200 || response.status === 404;

    } catch (error) {
      logger.warn('Lambda file processor not available', error as Error);
      return false;
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    totalProcessed: number;
    averageProcessingTime: number;
    successRate: number;
    lastProcessedAt?: string;
  }> {
    try {
      const response = await this.makeApiRequest('/files/processing-stats', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      logger.error('Failed to get processing stats', error as Error);
      
      // Return default stats if API is not available
      return {
        totalProcessed: 0,
        averageProcessingTime: 0,
        successRate: 0
      };
    }
  }
}

// Export singleton instance
export const lambdaFileProcessor = new LambdaFileProcessorService();