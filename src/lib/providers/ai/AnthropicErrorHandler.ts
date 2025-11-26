import { logger } from '../../logging';

/**
 * Anthropic Error Handler
 * Comprehensive error handling and classification for Anthropic API errors
 */

export enum AnthropicErrorType {
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  QUOTA_EXCEEDED = 'quota_exceeded',
  INVALID_REQUEST = 'invalid_request',
  SERVER_ERROR = 'server_error',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  OVERLOADED = 'overloaded',
  UNKNOWN = 'unknown'
}

export interface AnthropicErrorInfo {
  type: AnthropicErrorType;
  message: string;
  originalError: Error;
  isRetryable: boolean;
  retryAfter?: number; // milliseconds
  statusCode?: number;
  errorCode?: string;
}

export class AnthropicErrorHandler {
  /**
   * Classify and handle Anthropic API errors
   */
  static handleError(error: any): AnthropicErrorInfo {
    const errorInfo: AnthropicErrorInfo = {
      type: AnthropicErrorType.UNKNOWN,
      message: 'Unknown error occurred',
      originalError: error,
      isRetryable: false
    };

    // Handle Anthropic SDK errors
    if (error?.status) {
      errorInfo.statusCode = error.status;
      errorInfo.message = error.message || 'API error occurred';

      switch (error.status) {
        case 400:
          errorInfo.type = AnthropicErrorType.INVALID_REQUEST;
          errorInfo.message = error.message || 'Invalid request parameters';
          errorInfo.isRetryable = false;
          break;

        case 401:
          errorInfo.type = AnthropicErrorType.AUTHENTICATION;
          errorInfo.message = 'Invalid API key or authentication failed';
          errorInfo.isRetryable = false;
          break;

        case 403:
          errorInfo.type = AnthropicErrorType.AUTHENTICATION;
          errorInfo.message = 'Access forbidden - check API key permissions';
          errorInfo.isRetryable = false;
          break;

        case 429:
          errorInfo.type = AnthropicErrorType.RATE_LIMIT;
          errorInfo.message = 'Rate limit exceeded';
          errorInfo.isRetryable = true;
          errorInfo.retryAfter = this.extractRetryAfter(error) || 60000; // Default 1 minute
          break;

        case 500:
          errorInfo.type = AnthropicErrorType.SERVER_ERROR;
          errorInfo.message = 'Anthropic server error';
          errorInfo.isRetryable = true;
          errorInfo.retryAfter = this.calculateBackoffDelay(1);
          break;

        case 502:
        case 503:
          errorInfo.type = AnthropicErrorType.OVERLOADED;
          errorInfo.message = 'Anthropic service temporarily overloaded';
          errorInfo.isRetryable = true;
          errorInfo.retryAfter = this.calculateBackoffDelay(1);
          break;

        case 504:
          errorInfo.type = AnthropicErrorType.TIMEOUT;
          errorInfo.message = 'Gateway timeout';
          errorInfo.isRetryable = true;
          errorInfo.retryAfter = this.calculateBackoffDelay(1);
          break;

        default:
          errorInfo.type = AnthropicErrorType.UNKNOWN;
          errorInfo.isRetryable = error.status >= 500;
      }
    }
    // Handle specific Anthropic error types
    else if (error?.error?.type) {
      const anthropicError = error.error;
      errorInfo.errorCode = anthropicError.type;
      errorInfo.message = anthropicError.message || error.message;

      switch (anthropicError.type) {
        case 'invalid_request_error':
          errorInfo.type = AnthropicErrorType.INVALID_REQUEST;
          errorInfo.isRetryable = false;
          break;

        case 'authentication_error':
          errorInfo.type = AnthropicErrorType.AUTHENTICATION;
          errorInfo.isRetryable = false;
          break;

        case 'permission_error':
          errorInfo.type = AnthropicErrorType.AUTHENTICATION;
          errorInfo.isRetryable = false;
          break;

        case 'rate_limit_error':
          errorInfo.type = AnthropicErrorType.RATE_LIMIT;
          errorInfo.isRetryable = true;
          errorInfo.retryAfter = 60000; // 1 minute default
          break;

        case 'api_error':
          errorInfo.type = AnthropicErrorType.SERVER_ERROR;
          errorInfo.isRetryable = true;
          errorInfo.retryAfter = this.calculateBackoffDelay(1);
          break;

        case 'overloaded_error':
          errorInfo.type = AnthropicErrorType.OVERLOADED;
          errorInfo.isRetryable = true;
          errorInfo.retryAfter = this.calculateBackoffDelay(2); // Longer delay for overload
          break;

        default:
          errorInfo.type = AnthropicErrorType.UNKNOWN;
          errorInfo.isRetryable = false;
      }
    }
    // Handle network errors
    else if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorInfo.type = AnthropicErrorType.NETWORK_ERROR;
      errorInfo.message = 'Network connection error';
      errorInfo.isRetryable = true;
      errorInfo.retryAfter = this.calculateBackoffDelay(1);
    }
    // Handle timeout errors
    else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      errorInfo.type = AnthropicErrorType.TIMEOUT;
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
  static shouldTriggerCircuitBreaker(errorInfo: AnthropicErrorInfo): boolean {
    return errorInfo.type === AnthropicErrorType.SERVER_ERROR ||
           errorInfo.type === AnthropicErrorType.NETWORK_ERROR ||
           errorInfo.type === AnthropicErrorType.TIMEOUT ||
           errorInfo.type === AnthropicErrorType.OVERLOADED;
  }

  /**
   * Get retry strategy for an error
   */
  static getRetryStrategy(errorInfo: AnthropicErrorInfo, attemptNumber: number): {
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
      case AnthropicErrorType.RATE_LIMIT:
        maxRetries = 5; // More retries for rate limits
        delay = errorInfo.retryAfter || 60000; // Respect rate limit reset time
        break;

      case AnthropicErrorType.OVERLOADED:
        maxRetries = 4; // More retries for overload
        delay = this.calculateBackoffDelay(attemptNumber, 2000); // Longer base delay
        break;

      case AnthropicErrorType.SERVER_ERROR:
        maxRetries = 3;
        delay = this.calculateBackoffDelay(attemptNumber);
        break;

      case AnthropicErrorType.NETWORK_ERROR:
      case AnthropicErrorType.TIMEOUT:
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
      const retryAfter = error.headers?.['retry-after'] || 
                        error.response?.headers?.['retry-after'] ||
                        error.headers?.['x-ratelimit-reset-requests'];
      
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
  private static calculateBackoffDelay(attemptNumber: number, baseDelay: number = 1000): number {
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
  static createUserMessage(errorInfo: AnthropicErrorInfo): string {
    switch (errorInfo.type) {
      case AnthropicErrorType.AUTHENTICATION:
        return 'Authentication failed. Please check your Anthropic API key configuration.';

      case AnthropicErrorType.RATE_LIMIT:
        return 'Rate limit exceeded. Your request has been queued and will be processed shortly.';

      case AnthropicErrorType.QUOTA_EXCEEDED:
        return 'API quota exceeded. Please check your Anthropic billing and usage limits.';

      case AnthropicErrorType.INVALID_REQUEST:
        return 'Invalid request. Please check your input and try again.';

      case AnthropicErrorType.SERVER_ERROR:
        return 'Anthropic service is temporarily unavailable. Retrying automatically...';

      case AnthropicErrorType.OVERLOADED:
        return 'Anthropic service is experiencing high demand. Retrying automatically...';

      case AnthropicErrorType.NETWORK_ERROR:
        return 'Network connection error. Retrying automatically...';

      case AnthropicErrorType.TIMEOUT:
        return 'Request timeout. Retrying with a longer timeout...';

      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Log error with appropriate level
   */
  static logError(errorInfo: AnthropicErrorInfo, context: string): void {
    const logData = {
      type: errorInfo.type,
      message: errorInfo.message,
      statusCode: errorInfo.statusCode,
      errorCode: errorInfo.errorCode,
      isRetryable: errorInfo.isRetryable,
      context
    };

    switch (errorInfo.type) {
      case AnthropicErrorType.AUTHENTICATION:
      case AnthropicErrorType.QUOTA_EXCEEDED:
        logger.error("Anthropic Error (Critical):", logData instanceof Error ? logData : new Error(String(logData)));
        break;

      case AnthropicErrorType.RATE_LIMIT:
      case AnthropicErrorType.OVERLOADED:
        logger.warn("Anthropic Error (Rate Limited/Overloaded):", { logData });
        break;

      case AnthropicErrorType.SERVER_ERROR:
      case AnthropicErrorType.NETWORK_ERROR:
      case AnthropicErrorType.TIMEOUT:
        logger.warn("Anthropic Error (Retryable):", { logData });
        break;

      default:
        logger.error("Anthropic Error (Unknown):", logData instanceof Error ? logData : new Error(String(logData)));
    }
  }
}