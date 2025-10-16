/**
 * Retry mechanism with exponential backoff and jitter
 * Handles automatic retry of failed operations with configurable policies
 */

import { ApiError, ErrorType } from './types';

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;        // Base delay in milliseconds
  maxDelay: number;         // Maximum delay in milliseconds
  backoffFactor: number;    // Exponential backoff multiplier
  jitter: boolean;          // Add randomization to prevent thundering herd
  retryableErrors?: ErrorType[];  // Specific error types to retry
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,          // 1 second
  maxDelay: 30000,          // 30 seconds
  backoffFactor: 2,         // Double the delay each time
  jitter: true,
  retryableErrors: [
    ErrorType.NETWORK,
    ErrorType.TIMEOUT,
    ErrorType.CONNECTIVITY,
    ErrorType.SERVER,
    ErrorType.SERVICE_UNAVAILABLE,
    ErrorType.RATE_LIMIT
  ]
};

/**
 * Retry attempt information
 */
export interface RetryAttempt {
  attemptNumber: number;
  delay: number;
  error: ApiError;
  timestamp: string;
}

/**
 * Retry result with attempt history
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: ApiError;
  attempts: RetryAttempt[];
  totalDuration: number;
}

/**
 * Retry manager class for handling automatic retries with exponential backoff
 */
export class RetryManager {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Execute an operation with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = customConfig ? { ...this.config, ...customConfig } : this.config;
    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let lastError: ApiError;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Success - return result with attempt history if needed
        return result;
      } catch (error) {
        const apiError = this.normalizeError(error);
        lastError = apiError;
        
        const attemptInfo: RetryAttempt = {
          attemptNumber: attempt + 1,
          delay: 0,
          error: apiError,
          timestamp: new Date().toISOString()
        };

        // Check if we should retry this error
        if (!this.shouldRetryError(apiError, config) || attempt === config.maxRetries) {
          attempts.push(attemptInfo);
          
          // If it's the first attempt and shouldn't be retried, throw original error
          if (attempt === 0 && !this.shouldRetryError(apiError, config)) {
            throw apiError;
          }
          
          // Otherwise throw retry exhausted error
          throw this.createRetryExhaustedError(lastError, attempts, Date.now() - startTime);
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt, config, apiError);
        attemptInfo.delay = delay;
        attempts.push(attemptInfo);

        // Wait before retrying
        await this.delay(delay);
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError!;
  }

  /**
   * Execute multiple operations with retry, stopping on first success
   */
  async withRetryFallback<T>(
    operations: Array<() => Promise<T>>,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    let lastError: ApiError;

    for (const operation of operations) {
      try {
        return await this.withRetry(operation, config);
      } catch (error) {
        lastError = this.normalizeError(error);
        // Continue to next operation
      }
    }

    throw lastError!;
  }

  /**
   * Create a retryable operation wrapper
   */
  createRetryableOperation<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): () => Promise<T> {
    return () => this.withRetry(operation, config);
  }

  /**
   * Check if an error should be retried based on configuration
   */
  private shouldRetryError(error: ApiError, config: RetryConfig): boolean {
    // Don't retry if error is explicitly marked as non-retryable
    if (error.retryable === false) {
      return false;
    }

    // Don't retry authentication/authorization errors
    if (error.type === ErrorType.AUTHENTICATION || 
        error.type === ErrorType.AUTHORIZATION ||
        error.type === ErrorType.VALIDATION ||
        error.type === ErrorType.CLIENT) {
      return false;
    }

    // If error is marked as retryable, allow it regardless of type
    if (error.retryable === true) {
      return true;
    }

    // Check if error type is in the retryable list
    if (config.retryableErrors && config.retryableErrors.includes(error.type)) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay for next retry attempt with exponential backoff and jitter
   */
  private calculateDelay(attempt: number, config: RetryConfig, error?: ApiError): number {
    // Use retry-after header if available (for rate limiting)
    if (error?.retryAfter) {
      return Math.max(error.retryAfter, config.baseDelay);
    }

    // Calculate exponential backoff
    let delay = config.baseDelay * Math.pow(config.backoffFactor, attempt);
    
    // Cap at maximum delay
    delay = Math.min(delay, config.maxDelay);

    // Add jitter to prevent thundering herd problem
    if (config.jitter) {
      // Add random jitter between 0% and 50% of the delay
      const jitterAmount = delay * 0.5 * Math.random();
      delay = delay + jitterAmount;
    }

    return Math.floor(delay);
  }

  /**
   * Create a delay promise
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Normalize any error to ApiError format
   */
  private normalizeError(error: any): ApiError {
    // If it's already an ApiError, return as-is
    if (error && typeof error === 'object' && 'type' in error && 'errorId' in error) {
      return error as ApiError;
    }

    // For regular Error objects, create a retryable ApiError
    return {
      type: ErrorType.UNKNOWN,
      severity: 'medium' as const,
      errorId: `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      message: error?.message || 'Unknown error',
      userMessage: 'An unexpected error occurred. Please try again.',
      retryable: true
    };
  }

  /**
   * Create an error when all retry attempts are exhausted
   */
  private createRetryExhaustedError(
    originalError: ApiError, 
    attempts: RetryAttempt[], 
    totalDuration: number
  ): ApiError {
    return {
      ...originalError,
      type: ErrorType.UNKNOWN,
      message: `Operation failed after ${attempts.length} attempts: ${originalError.message}`,
      userMessage: 'The operation failed after multiple attempts. Please try again later or contact support.',
      context: {
        ...originalError.context,
        retryAttempts: attempts.length,
        totalDuration,
        attempts: attempts.map(a => ({
          attempt: a.attemptNumber,
          error: a.error.type,
          delay: a.delay
        }))
      }
    };
  }

  /**
   * Get current retry configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Update retry configuration
   */
  updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

/**
 * Default retry manager instance
 */
export const defaultRetryManager = new RetryManager();

/**
 * Convenience function for retrying operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  return defaultRetryManager.withRetry(operation, config);
}

/**
 * Convenience function for retrying with fallback operations
 */
export async function withRetryFallback<T>(
  operations: Array<() => Promise<T>>,
  config?: Partial<RetryConfig>
): Promise<T> {
  return defaultRetryManager.withRetryFallback(operations, config);
}

/**
 * Create a retryable version of an async function
 */
export function makeRetryable<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  config?: Partial<RetryConfig>
): (...args: T) => Promise<R> {
  return (...args: T) => withRetry(() => fn(...args), config);
}