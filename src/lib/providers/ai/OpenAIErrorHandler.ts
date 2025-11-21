import { logger } from './logging';

/**
 * OpenAI Error Handler
 * Comprehensive error handling and classification for OpenAI API errors
 */

export enum OpenAIErrorType {
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  QUOTA_EXCEEDED = 'quota_exceeded',
  INVALID_REQUEST = 'invalid_request',
  SERVER_ERROR = 'server_error',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

export interface OpenAIErrorInfo {
  type: OpenAIErrorType;
  message: string;
  originalError: Error;
  isRetryable: boolean;
  retryAfter?: number; // milliseconds
  statusCode?: number;
  errorCode?: string;
}

export class OpenAIErrorHandler {
  /**
   * Classify and handle OpenAI API errors
   */
  static handleError(error: any): OpenAIErrorInfo {
    const errorInfo: OpenAIErrorInfo = {
      type: OpenAIErrorType.UNKNOWN,
      message: 'Unknown error occurred',
      originalError: error,
      isRetryable: false
    };

    // Handle OpenAI SDK errors
    if (error?.error) {
      const openaiError = error.error;
      errorInfo.statusCode = error.status;
      errorInfo.errorCode = openaiError.code;
      errorInfo.message = openaiError.message || error.message;

      switch (error.status) {
        case 401:
          errorInfo.type = OpenAIErrorType.AUTHENTICATION;
          errorInfo.message = 'Invalid API key or authentication failed';
          errorInfo.isRetryable = false;
          break;

        case 429:
          errorInfo.type = OpenAIErrorType.RATE_LIMIT;
          errorInfo.message = 'Rate limit exceeded';
          errorInfo.isRetryable = true;
          errorInfo.retryAfter = this.extractRetryAfter(error) || 60000; // Default 1 minute
          break;

        case 400:
          errorInfo.type = OpenAIErrorType.INVALID_REQUEST;
          errorInfo.message = openaiError.message || 'Invalid request parameters';
          errorInfo.isRetryable = false;
          break;

        case 403:
          if (openaiError.code === 'insufficient_quota') {
            errorInfo.type = OpenAIErrorType.QUOTA_EXCEEDED;
            errorInfo.message = 'API quota exceeded';
            errorInfo.isRetryable = false;
          } else {
            errorInfo.type = OpenAIErrorType.AUTHENTICATION;
            errorInfo.message = 'Access forbidden';
            errorInfo.isRetryable = false;
          }
          break;

        case 500:
        case 502:
        case 503:
        case 504:
          errorInfo.type = OpenAIErrorType.SERVER_ERROR;
          errorInfo.message = 'OpenAI server error';
          errorInfo.isRetryable = true;
          errorInfo.retryAfter = this.calculateBackoffDelay(1); // Start with first retry
          break;

        default:
          errorInfo.type = OpenAIErrorType.UNKNOWN;
          errorInfo.isRetryable = error.status >= 500;
      }
    }
    // Handle network errors
    else if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorInfo.type = OpenAIErrorType.NETWORK_ERROR;
      errorInfo.message = 'Network connection error';
      errorInfo.isRetryable = true;
      errorInfo.retryAfter = this.calculateBackoffDelay(1);
    }
    // Handle timeout errors
    else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      errorInfo.type = OpenAIErrorType.TIMEOUT;
      errorInfo.message = 'Request timeout';
      errorInfo.isRetryable = true;
      errorInfo.retryAfter = this.calculateBackoffDelay(1);
    }
    // Handle generic errors
    else {
      errorInfo.message = error.message || 'Unknown error';
      errorInfo.isRetryable = false;
    }

    return errorInfo;
  }

  /**
   * Determine if an error should trigger circuit breaker
   */
  static shouldTriggerCircuitBreaker(errorInfo: OpenAIErrorInfo): boolean {
    return errorInfo.type === OpenAIErrorType.SERVER_ERROR ||
           errorInfo.type === OpenAIErrorType.NETWORK_ERROR ||
           errorInfo.type === OpenAIErrorType.TIMEOUT;
  }

  /**
   * Get retry strategy for an error
   */
  static getRetryStrategy(errorInfo: OpenAIErrorInfo, attemptNumber: number): {
    shouldRetry: boolean;
    delay: number;
    maxRetries: number;
  } {
    if (!errorInfo.isRetryable) {
      return { shouldRetry: false, delay: 0, maxRetries: 0 };
    }

    let maxRetries = 3;
    let delay = errorInfo.retryAfter || this.calculateBackoffDelay(attemptNumber);

    switch (errorInfo.type) {
      case OpenAIErrorType.RATE_LIMIT:
        maxRetries = 5; // More retries for rate limits
        delay = errorInfo.retryAfter || 60000; // Respect rate limit reset time
        break;

      case OpenAIErrorType.SERVER_ERROR:
        maxRetries = 3;
        delay = this.calculateBackoffDelay(attemptNumber);
        break;

      case OpenAIErrorType.NETWORK_ERROR:
      case OpenAIErrorType.TIMEOUT:
        maxRetries = 4;
        delay = this.calculateBackoffDelay(attemptNumber);
        break;

      default:
        maxRetries = 2;
        delay = this.calculateBackoffDelay(attemptNumber);
    }

    return {
      shouldRetry: attemptNumber < maxRetries,
      delay,
      maxRetries
    };
  }

  /**
   * Extract retry-after header from error response
   */
  private static extractRetryAfter(error: any): number | null {
    try {
      const retryAfter = error.headers?.['retry-after'] || error.response?.headers?.['retry-after'];
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        return isNaN(seconds) ? null : seconds * 1000; // Convert to milliseconds
      }
    } catch (e) {
      // Ignore parsing errors
    }
    return null;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private static calculateBackoffDelay(attemptNumber: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const backoffMultiplier = 2;

    const delay = Math.min(
      baseDelay * Math.pow(backoffMultiplier, attemptNumber - 1),
      maxDelay
    );

    // Add jitter (±25% of delay)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.max(100, delay + jitter); // Minimum 100ms delay
  }

  /**
   * Create user-friendly error message
   */
  static createUserMessage(errorInfo: OpenAIErrorInfo): string {
    switch (errorInfo.type) {
      case OpenAIErrorType.AUTHENTICATION:
        return 'Authentication failed. Please check your API key configuration.';

      case OpenAIErrorType.RATE_LIMIT:
        return 'Rate limit exceeded. Your request has been queued and will be processed shortly.';

      case OpenAIErrorType.QUOTA_EXCEEDED:
        return 'API quota exceeded. Please check your OpenAI billing and usage limits.';

      case OpenAIErrorType.INVALID_REQUEST:
        return 'Invalid request. Please check your input and try again.';

      case OpenAIErrorType.SERVER_ERROR:
        return 'OpenAI service is temporarily unavailable. Retrying automatically...';

      case OpenAIErrorType.NETWORK_ERROR:
        return 'Network connection error. Retrying automatically...';

      case OpenAIErrorType.TIMEOUT:
        return 'Request timeout. Retrying with a longer timeout...';

      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Log error with appropriate level
   */
  static logError(errorInfo: OpenAIErrorInfo, context: string): void {
    const logData = {
      type: errorInfo.type,
      message: errorInfo.message,
      statusCode: errorInfo.statusCode,
      errorCode: errorInfo.errorCode,
      isRetryable: errorInfo.isRetryable,
      context
    };

    switch (errorInfo.type) {
      case OpenAIErrorType.AUTHENTICATION:
      case OpenAIErrorType.QUOTA_EXCEEDED:
        logger.error("OpenAI Error (Critical):", logData instanceof Error ? logData : new Error(String(logData)));
        break;

      case OpenAIErrorType.RATE_LIMIT:
        logger.warn("OpenAI Error (Rate Limited):", { logData });
        break;

      case OpenAIErrorType.SERVER_ERROR:
      case OpenAIErrorType.NETWORK_ERROR:
      case OpenAIErrorType.TIMEOUT:
        logger.warn("OpenAI Error (Retryable):", { logData });
        break;

      default:
        logger.error("OpenAI Error (Unknown):", logData instanceof Error ? logData : new Error(String(logData)));
    }
  }
}