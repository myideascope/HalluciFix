import { OAuthError, OAuthErrorType } from './types';

export interface OAuthErrorInfo {
  type: OAuthErrorType;
  title: string;
  message: string;
  userMessage: string;
  recoveryOptions: RecoveryOption[];
  shouldRetry: boolean;
  logLevel: 'error' | 'warn' | 'info';
}

export interface RecoveryOption {
  label: string;
  action: 'retry' | 'contact_support' | 'use_alternative' | 'navigate';
  target?: string;
}

/**
 * Comprehensive OAuth error handler with user-friendly messages and recovery options
 */
export class OAuthErrorHandler {
  private static readonly ERROR_MAPPINGS: Record<string, OAuthErrorInfo> = {
    [OAuthErrorType.INVALID_REQUEST]: {
      type: OAuthErrorType.INVALID_REQUEST,
      title: 'Invalid Request',
      message: 'The authentication request was malformed or missing required parameters',
      userMessage: 'There was a problem with the authentication request. Please try signing in again.',
      recoveryOptions: [
        { label: 'Try Again', action: 'retry' },
        { label: 'Contact Support', action: 'contact_support' }
      ],
      shouldRetry: true,
      logLevel: 'warn'
    },

    [OAuthErrorType.UNAUTHORIZED_CLIENT]: {
      type: OAuthErrorType.UNAUTHORIZED_CLIENT,
      title: 'Unauthorized Client',
      message: 'The application is not authorized to perform this authentication request',
      userMessage: 'This application is not properly configured for Google authentication. Please contact your administrator.',
      recoveryOptions: [
        { label: 'Use Email/Password', action: 'use_alternative' },
        { label: 'Contact Support', action: 'contact_support' }
      ],
      shouldRetry: false,
      logLevel: 'error'
    },

    [OAuthErrorType.ACCESS_DENIED]: {
      type: OAuthErrorType.ACCESS_DENIED,
      title: 'Access Denied',
      message: 'User denied access to the application',
      userMessage: 'You chose not to grant access to the application. You can try again if you want to sign in with Google.',
      recoveryOptions: [
        { label: 'Try Google Again', action: 'retry' },
        { label: 'Use Email/Password', action: 'use_alternative' }
      ],
      shouldRetry: true,
      logLevel: 'info'
    },

    [OAuthErrorType.UNSUPPORTED_RESPONSE_TYPE]: {
      type: OAuthErrorType.UNSUPPORTED_RESPONSE_TYPE,
      title: 'Unsupported Response Type',
      message: 'The authorization server does not support the requested response type',
      userMessage: 'The authentication method is not supported. Please contact support or try email/password authentication.',
      recoveryOptions: [
        { label: 'Use Email/Password', action: 'use_alternative' },
        { label: 'Contact Support', action: 'contact_support' }
      ],
      shouldRetry: false,
      logLevel: 'error'
    },

    [OAuthErrorType.INVALID_SCOPE]: {
      type: OAuthErrorType.INVALID_SCOPE,
      title: 'Invalid Scope',
      message: 'The requested scope is invalid or not supported',
      userMessage: 'The application requested invalid permissions. Please contact support.',
      recoveryOptions: [
        { label: 'Contact Support', action: 'contact_support' },
        { label: 'Use Email/Password', action: 'use_alternative' }
      ],
      shouldRetry: false,
      logLevel: 'error'
    },

    [OAuthErrorType.SERVER_ERROR]: {
      type: OAuthErrorType.SERVER_ERROR,
      title: 'Server Error',
      message: 'The authorization server encountered an unexpected condition',
      userMessage: 'A server error occurred during authentication. Please try again in a few moments.',
      recoveryOptions: [
        { label: 'Try Again', action: 'retry' },
        { label: 'Use Email/Password', action: 'use_alternative' },
        { label: 'Contact Support', action: 'contact_support' }
      ],
      shouldRetry: true,
      logLevel: 'error'
    },

    [OAuthErrorType.TEMPORARILY_UNAVAILABLE]: {
      type: OAuthErrorType.TEMPORARILY_UNAVAILABLE,
      title: 'Service Temporarily Unavailable',
      message: 'The authorization server is temporarily overloaded or under maintenance',
      userMessage: 'Google authentication is temporarily unavailable. Please try again in a few minutes or use email/password authentication.',
      recoveryOptions: [
        { label: 'Try Again Later', action: 'retry' },
        { label: 'Use Email/Password', action: 'use_alternative' }
      ],
      shouldRetry: true,
      logLevel: 'warn'
    },

    // Custom error types
    'network_error': {
      type: OAuthErrorType.SERVER_ERROR,
      title: 'Network Error',
      message: 'Network connection failed during authentication',
      userMessage: 'Unable to connect to Google authentication services. Please check your internet connection and try again.',
      recoveryOptions: [
        { label: 'Try Again', action: 'retry' },
        { label: 'Use Email/Password', action: 'use_alternative' }
      ],
      shouldRetry: true,
      logLevel: 'warn'
    },

    'token_exchange_failed': {
      type: OAuthErrorType.SERVER_ERROR,
      title: 'Token Exchange Failed',
      message: 'Failed to exchange authorization code for access tokens',
      userMessage: 'Authentication failed during token exchange. Please try signing in again.',
      recoveryOptions: [
        { label: 'Try Again', action: 'retry' },
        { label: 'Contact Support', action: 'contact_support' }
      ],
      shouldRetry: true,
      logLevel: 'error'
    },

    'profile_fetch_failed': {
      type: OAuthErrorType.SERVER_ERROR,
      title: 'Profile Fetch Failed',
      message: 'Failed to fetch user profile from Google',
      userMessage: 'Unable to retrieve your profile information from Google. Please try again.',
      recoveryOptions: [
        { label: 'Try Again', action: 'retry' },
        { label: 'Contact Support', action: 'contact_support' }
      ],
      shouldRetry: true,
      logLevel: 'error'
    },

    'state_validation_failed': {
      type: OAuthErrorType.INVALID_REQUEST,
      title: 'State Validation Failed',
      message: 'OAuth state parameter validation failed - possible CSRF attack',
      userMessage: 'Security validation failed. Please try signing in again.',
      recoveryOptions: [
        { label: 'Try Again', action: 'retry' },
        { label: 'Contact Support', action: 'contact_support' }
      ],
      shouldRetry: true,
      logLevel: 'error'
    },

    'session_creation_failed': {
      type: OAuthErrorType.SERVER_ERROR,
      title: 'Session Creation Failed',
      message: 'Failed to create user session after successful OAuth',
      userMessage: 'Authentication succeeded but failed to create your session. Please try again.',
      recoveryOptions: [
        { label: 'Try Again', action: 'retry' },
        { label: 'Contact Support', action: 'contact_support' }
      ],
      shouldRetry: true,
      logLevel: 'error'
    }
  };

  /**
   * Maps an error to user-friendly information
   */
  static mapError(error: Error | OAuthError | string): OAuthErrorInfo {
    let errorKey: string;

    if (error instanceof OAuthError) {
      errorKey = error.type;
    } else if (typeof error === 'string') {
      errorKey = error;
    } else {
      // Try to infer error type from message
      const message = error.message.toLowerCase();
      
      if (message.includes('network') || message.includes('fetch')) {
        errorKey = 'network_error';
      } else if (message.includes('token') && message.includes('exchange')) {
        errorKey = 'token_exchange_failed';
      } else if (message.includes('profile')) {
        errorKey = 'profile_fetch_failed';
      } else if (message.includes('state')) {
        errorKey = 'state_validation_failed';
      } else if (message.includes('session')) {
        errorKey = 'session_creation_failed';
      } else {
        errorKey = OAuthErrorType.SERVER_ERROR;
      }
    }

    return this.ERROR_MAPPINGS[errorKey] || this.getDefaultErrorInfo(errorKey);
  }

  /**
   * Creates a default error info for unknown errors
   */
  private static getDefaultErrorInfo(errorKey: string): OAuthErrorInfo {
    return {
      type: OAuthErrorType.SERVER_ERROR,
      title: 'Authentication Error',
      message: `Unknown OAuth error: ${errorKey}`,
      userMessage: 'An unexpected error occurred during authentication. Please try again or contact support.',
      recoveryOptions: [
        { label: 'Try Again', action: 'retry' },
        { label: 'Use Email/Password', action: 'use_alternative' },
        { label: 'Contact Support', action: 'contact_support' }
      ],
      shouldRetry: true,
      logLevel: 'error'
    };
  }

  /**
   * Logs an OAuth error with appropriate level and context
   */
  static logError(error: Error | OAuthError | string, context?: Record<string, any>): void {
    const errorInfo = this.mapError(error);
    const logData = {
      type: errorInfo.type,
      title: errorInfo.title,
      message: errorInfo.message,
      shouldRetry: errorInfo.shouldRetry,
      context: context || {},
      timestamp: new Date().toISOString()
    };

    switch (errorInfo.logLevel) {
      case 'error':
        console.error('OAuth Error:', logData);
        break;
      case 'warn':
        console.warn('OAuth Warning:', logData);
        break;
      case 'info':
        console.info('OAuth Info:', logData);
        break;
    }

    // In production, you might want to send this to a monitoring service
    // Example: sendToMonitoring(logData);
  }

  /**
   * Determines if an error should trigger a retry
   */
  static shouldRetry(error: Error | OAuthError | string): boolean {
    const errorInfo = this.mapError(error);
    return errorInfo.shouldRetry;
  }

  /**
   * Gets user-friendly error message
   */
  static getUserMessage(error: Error | OAuthError | string): string {
    const errorInfo = this.mapError(error);
    return errorInfo.userMessage;
  }

  /**
   * Gets recovery options for an error
   */
  static getRecoveryOptions(error: Error | OAuthError | string): RecoveryOption[] {
    const errorInfo = this.mapError(error);
    return errorInfo.recoveryOptions;
  }

  /**
   * Creates a standardized error response for API endpoints
   */
  static createErrorResponse(error: Error | OAuthError | string, requestId?: string) {
    const errorInfo = this.mapError(error);
    
    return {
      error: {
        type: errorInfo.type,
        title: errorInfo.title,
        message: errorInfo.userMessage,
        recoveryOptions: errorInfo.recoveryOptions,
        shouldRetry: errorInfo.shouldRetry,
        requestId: requestId || crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * OAuth error monitoring service
 */
export class OAuthErrorMonitor {
  private static errorCounts: Map<string, number> = new Map();
  private static lastErrors: Array<{ error: string; timestamp: Date; context?: any }> = [];
  private static readonly MAX_RECENT_ERRORS = 100;

  /**
   * Records an OAuth error for monitoring
   */
  static recordError(error: Error | OAuthError | string, context?: Record<string, any>): void {
    const errorInfo = OAuthErrorHandler.mapError(error);
    const errorKey = errorInfo.type;

    // Update error counts
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    // Add to recent errors
    this.lastErrors.push({
      error: errorKey,
      timestamp: new Date(),
      context
    });

    // Keep only recent errors
    if (this.lastErrors.length > this.MAX_RECENT_ERRORS) {
      this.lastErrors.shift();
    }

    // Log the error
    OAuthErrorHandler.logError(error, context);

    // Check for error patterns that might indicate system issues
    this.checkErrorPatterns();
  }

  /**
   * Gets error statistics
   */
  static getErrorStats() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentErrors = this.lastErrors.filter(e => e.timestamp > oneHourAgo);
    const dailyErrors = this.lastErrors.filter(e => e.timestamp > oneDayAgo);

    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
      errorsByType: Object.fromEntries(this.errorCounts),
      recentErrorsCount: recentErrors.length,
      dailyErrorsCount: dailyErrors.length,
      errorRate: {
        hourly: recentErrors.length,
        daily: dailyErrors.length
      }
    };
  }

  /**
   * Checks for error patterns that might indicate system issues
   */
  private static checkErrorPatterns(): void {
    const stats = this.getErrorStats();
    
    // Alert if error rate is too high
    if (stats.errorRate.hourly > 10) {
      console.warn('High OAuth error rate detected:', stats.errorRate.hourly, 'errors in the last hour');
    }

    // Alert if specific error types are frequent
    const serverErrors = this.errorCounts.get(OAuthErrorType.SERVER_ERROR) || 0;
    if (serverErrors > 5) {
      console.warn('Multiple server errors detected:', serverErrors);
    }
  }

  /**
   * Resets error monitoring data
   */
  static reset(): void {
    this.errorCounts.clear();
    this.lastErrors.length = 0;
  }
}