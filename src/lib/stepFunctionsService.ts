/**
 * Step Functions Service
 * Integrates AWS Step Functions for complex batch analysis workflows
 */

import { logger } from './logging';
import { performanceMonitor } from './performanceMonitor';
import { errorManager } from './errors';

interface BatchAnalysisRequest {
  batchId: string;
  userId: string;
  documents: Array<{
    id: string;
    filename?: string;
    content?: string;
    s3Key?: string;
    size?: number;
    contentType?: string;
  }>;
  options?: {
    sensitivity?: 'low' | 'medium' | 'high';
    includeSourceVerification?: boolean;
    maxHallucinations?: number;
    enableRAG?: boolean;
  };
}

interface BatchExecutionStatus {
  executionArn: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
  startDate: string;
  stopDate?: string;
  output?: any;
  error?: any;
}

interface BatchAnalysisResult {
  batchId: string;
  status: 'success' | 'failed' | 'pending';
  summary?: {
    totalDocuments: number;
    averageAccuracy: number;
    totalHallucinations: number;
    riskDistribution: Record<string, number>;
    averageProcessingTime: number;
    totalProcessingTime: number;
  };
  reportS3Key?: string;
  completedAt?: string;
  error?: string;
}

class StepFunctionsService {
  private logger = logger.child({ component: 'StepFunctionsService' });
  private apiGatewayUrl: string;
  private isInitialized = false;

  constructor() {
    // Initialize with environment variables
    this.apiGatewayUrl = process.env.VITE_API_GATEWAY_URL || '';
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Validate configuration
      if (!this.apiGatewayUrl) {
        throw new Error('API Gateway URL not configured');
      }

      this.isInitialized = true;
      this.logger.info('Step Functions service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Step Functions service', error as Error);
      throw error;
    }
  }

  /**
   * Start a batch analysis workflow using Step Functions
   */
  async startBatchAnalysis(request: BatchAnalysisRequest): Promise<{ executionArn: string; startDate: string }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const performanceId = performanceMonitor.startOperation('step_functions_start_batch', {
      batchId: request.batchId,
      userId: request.userId,
      documentCount: request.documents.length.toString(),
    });

    try {
      this.logger.info('Starting batch analysis workflow', {
        batchId: request.batchId,
        userId: request.userId,
        documentCount: request.documents.length,
      });

      // Get authentication token
      const token = await this.getAuthToken();

      const response = await fetch(`${this.apiGatewayUrl}/batch/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to start batch analysis: ${response.status} ${response.statusText} - ${errorData.message || ''}`);
      }

      const result = await response.json();

      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        executionArn: result.executionArn,
      });

      this.logger.info('Batch analysis workflow started', {
        batchId: request.batchId,
        executionArn: result.executionArn,
        startDate: result.startDate,
      });

      return result;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      const handledError = errorManager.handleError(error, {
        component: 'StepFunctionsService',
        feature: 'batch-analysis',
        operation: 'startBatchAnalysis',
        batchId: request.batchId,
        userId: request.userId,
      });

      this.logger.error('Failed to start batch analysis workflow', handledError);
      throw handledError;
    }
  }

  /**
   * Get the status of a batch analysis execution
   */
  async getBatchExecutionStatus(executionArn: string): Promise<BatchExecutionStatus> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const performanceId = performanceMonitor.startOperation('step_functions_get_status', {
      executionArn,
    });

    try {
      this.logger.debug('Getting batch execution status', { executionArn });

      // Get authentication token
      const token = await this.getAuthToken();

      // Encode the execution ARN for URL path
      const encodedExecutionArn = encodeURIComponent(executionArn);

      const response = await fetch(`${this.apiGatewayUrl}/batch/status/${encodedExecutionArn}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to get execution status: ${response.status} ${response.statusText} - ${errorData.message || ''}`);
      }

      const result = await response.json();

      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        executionStatus: result.status,
      });

      return result;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      const handledError = errorManager.handleError(error, {
        component: 'StepFunctionsService',
        feature: 'batch-analysis',
        operation: 'getBatchExecutionStatus',
        executionArn,
      });

      this.logger.error('Failed to get batch execution status', handledError);
      throw handledError;
    }
  }

  /**
   * Stop a running batch analysis execution
   */
  async stopBatchExecution(executionArn: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      this.logger.info('Stopping batch execution', { executionArn });

      // Get authentication token
      const token = await this.getAuthToken();

      const response = await fetch(`${this.apiGatewayUrl}/batch/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ executionArn }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to stop execution: ${response.status} ${response.statusText} - ${errorData.message || ''}`);
      }

      this.logger.info('Batch execution stopped', { executionArn });

    } catch (error) {
      const handledError = errorManager.handleError(error, {
        component: 'StepFunctionsService',
        feature: 'batch-analysis',
        operation: 'stopBatchExecution',
        executionArn,
      });

      this.logger.error('Failed to stop batch execution', handledError);
      throw handledError;
    }
  }

  /**
   * Poll for batch completion with timeout
   */
  async waitForBatchCompletion(
    executionArn: string,
    options: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      onProgress?: (status: BatchExecutionStatus) => void;
    } = {}
  ): Promise<BatchExecutionStatus> {
    const { timeoutMs = 30 * 60 * 1000, pollIntervalMs = 5000, onProgress } = options;
    const startTime = Date.now();

    this.logger.info('Waiting for batch completion', {
      executionArn,
      timeoutMs,
      pollIntervalMs,
    });

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getBatchExecutionStatus(executionArn);

        if (onProgress) {
          onProgress(status);
        }

        if (['SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED'].includes(status.status)) {
          this.logger.info('Batch execution completed', {
            executionArn,
            status: status.status,
            duration: Date.now() - startTime,
          });
          return status;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      } catch (error) {
        this.logger.warn('Error polling batch status, retrying...', undefined, {
          executionArn,
          error: (error as Error).message,
        });
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }

    throw new Error(`Batch execution timed out after ${timeoutMs}ms`);
  }

  /**
   * Get authentication token for API calls
   */
  private async getAuthToken(): Promise<string> {
    // This would integrate with your authentication system
    // For now, we'll assume the token is available from the auth context
    
    // In a real implementation, this might look like:
    // const { user } = useAuth();
    // return user?.accessToken;
    
    // For development/testing, return a placeholder
    if (process.env.NODE_ENV === 'development') {
      return 'dev-token';
    }

    throw new Error('Authentication token not available');
  }

  /**
   * Create a batch ID for tracking
   */
  generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate batch analysis request
   */
  validateBatchRequest(request: BatchAnalysisRequest): void {
    if (!request.batchId) {
      throw new Error('Batch ID is required');
    }

    if (!request.userId) {
      throw new Error('User ID is required');
    }

    if (!Array.isArray(request.documents) || request.documents.length === 0) {
      throw new Error('At least one document is required');
    }

    if (request.documents.length > 100) {
      throw new Error('Maximum 100 documents per batch');
    }

    for (const doc of request.documents) {
      if (!doc.id) {
        throw new Error('Document ID is required');
      }

      if (!doc.content && !doc.s3Key) {
        throw new Error('Document must have either content or S3 key');
      }
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      apiGatewayUrl: this.apiGatewayUrl,
    };
  }
}

// Export singleton instance
export const stepFunctionsService = new StepFunctionsService();
export default stepFunctionsService;