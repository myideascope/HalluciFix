/**
 * Error classification and mapping system
 * Maps HTTP status codes and error types to user-friendly messages and actions
 */

import { 
  ErrorType, 
  ErrorSeverity, 
  ApiError, 
  ErrorContext, 
  ErrorClassification,
  ErrorAction,
  ErrorActionType
} from './types';

/**
 * Generates a unique error ID for tracking
 */
export function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * HTTP status code to error type mapping
 */
const HTTP_STATUS_MAPPING: Record<number, { type: ErrorType; severity: ErrorSeverity }> = {
  // Client errors (4xx)
  400: { type: ErrorType.CLIENT, severity: ErrorSeverity.LOW },
  401: { type: ErrorType.AUTHENTICATION, severity: ErrorSeverity.HIGH },
  403: { type: ErrorType.AUTHORIZATION, severity: ErrorSeverity.MEDIUM },
  404: { type: ErrorType.CLIENT, severity: ErrorSeverity.LOW },
  408: { type: ErrorType.TIMEOUT, severity: ErrorSeverity.MEDIUM },
  409: { type: ErrorType.CLIENT, severity: ErrorSeverity.LOW },
  422: { type: ErrorType.VALIDATION, severity: ErrorSeverity.LOW },
  429: { type: ErrorType.RATE_LIMIT, severity: ErrorSeverity.MEDIUM },
  
  // Server errors (5xx)
  500: { type: ErrorType.SERVER, severity: ErrorSeverity.HIGH },
  502: { type: ErrorType.SERVER, severity: ErrorSeverity.HIGH },
  503: { type: ErrorType.SERVICE_UNAVAILABLE, severity: ErrorSeverity.HIGH },
  504: { type: ErrorType.TIMEOUT, severity: ErrorSeverity.MEDIUM },
};

/**
 * User-friendly messages for different error types
 */
const ERROR_MESSAGES: Record<ErrorType, { 
  title: string; 
  message: string; 
  retryable: boolean;
}> = {
  [ErrorType.NETWORK]: {
    title: 'Connection Problem',
    message: 'Unable to connect to our servers. Please check your internet connection and try again.',
    retryable: true
  },
  [ErrorType.TIMEOUT]: {
    title: 'Request Timeout',
    message: 'The request took too long to complete. Please try again.',
    retryable: true
  },
  [ErrorType.CONNECTIVITY]: {
    title: 'No Internet Connection',
    message: 'Please check your internet connection and try again.',
    retryable: true
  },
  [ErrorType.AUTHENTICATION]: {
    title: 'Authentication Required',
    message: 'Your session has expired. Please sign in again to continue.',
    retryable: false
  },
  [ErrorType.AUTHORIZATION]: {
    title: 'Access Denied',
    message: 'You don\'t have permission to perform this action. Please contact your administrator if you believe this is an error.',
    retryable: false
  },
  [ErrorType.SESSION_EXPIRED]: {
    title: 'Session Expired',
    message: 'Your session has expired for security reasons. Please sign in again.',
    retryable: false
  },
  [ErrorType.VALIDATION]: {
    title: 'Invalid Input',
    message: 'Please check your input and try again. Some fields may contain invalid data.',
    retryable: false
  },
  [ErrorType.CLIENT]: {
    title: 'Request Error',
    message: 'There was a problem with your request. Please check your input and try again.',
    retryable: false
  },
  [ErrorType.INVALID_INPUT]: {
    title: 'Invalid Input',
    message: 'The provided input is not valid. Please correct the highlighted fields and try again.',
    retryable: false
  },
  [ErrorType.SERVER]: {
    title: 'Server Error',
    message: 'We\'re experiencing technical difficulties. Please try again in a few moments.',
    retryable: true
  },
  [ErrorType.SERVICE_UNAVAILABLE]: {
    title: 'Service Unavailable',
    message: 'The service is temporarily unavailable. Please try again later.',
    retryable: true
  },
  [ErrorType.RATE_LIMIT]: {
    title: 'Too Many Requests',
    message: 'You\'ve made too many requests. Please wait a moment before trying again.',
    retryable: true
  },
  [ErrorType.ANALYSIS_ERROR]: {
    title: 'Analysis Failed',
    message: 'Unable to analyze the content. Please try again or contact support if the problem persists.',
    retryable: true
  },
  [ErrorType.FILE_PROCESSING_ERROR]: {
    title: 'File Processing Error',
    message: 'Unable to process the uploaded file. Please check the file format and try again.',
    retryable: false
  },
  [ErrorType.GOOGLE_DRIVE_ERROR]: {
    title: 'Google Drive Error',
    message: 'Unable to access Google Drive. Please check your permissions and try again.',
    retryable: true
  },
  [ErrorType.UNKNOWN]: {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
    retryable: false
  }
};

/**
 * Main error classifier class
 */
export class ApiErrorClassifier {
  /**
   * Classifies an error and returns comprehensive error information
   */
  static classify(error: any, context: ErrorContext = {}): ErrorClassification {
    const apiError = this.createApiError(error, context);
    const actions = this.generateErrorActions(apiError);
    
    return {
      error: apiError,
      actions,
      shouldReport: this.shouldReportError(apiError, context),
      shouldNotifyUser: this.shouldNotifyUser(apiError, context)
    };
  }

  /**
   * Enhanced error classification with routing information
   */
  static classifyWithRouting(error: any, context: ErrorContext = {}): ErrorClassification & {
    routingPriority: number;
    handlerSuggestions: string[];
    escalationLevel: number;
  } {
    const baseClassification = this.classify(error, context);
    
    return {
      ...baseClassification,
      routingPriority: this.calculateRoutingPriority(baseClassification.error, context),
      handlerSuggestions: this.suggestHandlers(baseClassification.error, context),
      escalationLevel: this.calculateEscalationLevel(baseClassification.error, context)
    };
  }

  /**
   * Creates a standardized ApiError from various error types
   */
  private static createApiError(error: any, context: ErrorContext): ApiError {
    const errorId = generateErrorId();
    const timestamp = new Date().toISOString();
    
    // Handle network connectivity errors
    if (!navigator.onLine) {
      return this.createNetworkError(errorId, timestamp, context);
    }

    // Handle HTTP response errors
    if (error.response) {
      return this.createHttpError(error, errorId, timestamp, context);
    }

    // Handle request timeout errors
    if (this.isTimeoutError(error)) {
      return this.createTimeoutError(error, errorId, timestamp, context);
    }

    // Handle network errors
    if (this.isNetworkError(error)) {
      return this.createNetworkError(errorId, timestamp, context, error.message);
    }

    // Handle application-specific errors
    if (this.isApplicationError(error)) {
      return this.createApplicationError(error, errorId, timestamp, context);
    }

    // Handle unknown errors
    return this.createUnknownError(error, errorId, timestamp, context);
  }

  /**
   * Creates a network connectivity error
   */
  private static createNetworkError(
    errorId: string, 
    timestamp: string, 
    context: ErrorContext,
    message?: string
  ): ApiError {
    // Determine if it's a connectivity issue or general network error
    const errorType = !navigator.onLine ? ErrorType.CONNECTIVITY : ErrorType.NETWORK;
    const errorMessage = ERROR_MESSAGES[errorType];
    
    return {
      type: errorType,
      severity: ErrorSeverity.MEDIUM,
      errorId,
      timestamp,
      message: message || 'No internet connection detected',
      userMessage: errorMessage.message,
      retryable: errorMessage.retryable,
      context,
      url: context.url || (typeof window !== 'undefined' ? window.location.href : undefined),
      userAgent: context.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      userId: context.userId,
      sessionId: context.sessionId
    };
  }

  /**
   * Creates an HTTP error from response
   */
  private static createHttpError(
    error: any, 
    errorId: string, 
    timestamp: string, 
    context: ErrorContext
  ): ApiError {
    const { status, data } = error.response;
    const mapping = HTTP_STATUS_MAPPING[status] || { 
      type: ErrorType.UNKNOWN, 
      severity: ErrorSeverity.MEDIUM 
    };
    
    const errorMessage = ERROR_MESSAGES[mapping.type];
    let userMessage = errorMessage.message;
    let details = data;

    // Customize messages for specific status codes
    switch (status) {
      case 422:
        if (data?.errors) {
          userMessage = 'Please correct the following errors and try again.';
          details = data.errors;
        }
        break;
      case 429:
        const retryAfter = parseInt(error.response.headers['retry-after']) || 60;
        userMessage = `Too many requests. Please wait ${retryAfter} seconds and try again.`;
        break;
      case 404:
        userMessage = 'The requested resource was not found.';
        break;
    }

    return {
      type: mapping.type,
      severity: mapping.severity,
      errorId,
      timestamp,
      message: data?.message || `HTTP ${status}: ${error.response.statusText}`,
      userMessage,
      statusCode: status,
      details,
      retryable: errorMessage.retryable,
      retryAfter: status === 429 ? (parseInt(error.response.headers['retry-after']) || 60) * 1000 : undefined,
      context,
      url: context.url || (typeof window !== 'undefined' ? window.location.href : undefined),
      userAgent: context.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      userId: context.userId,
      sessionId: context.sessionId
    };
  }

  /**
   * Creates a timeout error
   */
  private static createTimeoutError(
    error: any, 
    errorId: string, 
    timestamp: string, 
    context: ErrorContext
  ): ApiError {
    const errorMessage = ERROR_MESSAGES[ErrorType.TIMEOUT];
    
    return {
      type: ErrorType.TIMEOUT,
      severity: ErrorSeverity.MEDIUM,
      errorId,
      timestamp,
      message: error.message || 'Request timeout',
      userMessage: errorMessage.message,
      retryable: errorMessage.retryable,
      context,
      url: context.url || (typeof window !== 'undefined' ? window.location.href : undefined),
      userAgent: context.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      userId: context.userId,
      sessionId: context.sessionId
    };
  }

  /**
   * Creates an application-specific error
   */
  private static createApplicationError(
    error: any, 
    errorId: string, 
    timestamp: string, 
    context: ErrorContext
  ): ApiError {
    let errorType = ErrorType.UNKNOWN;
    
    // Determine error type based on error properties
    if (error.name === 'AnalysisError' || error.type === 'ANALYSIS_ERROR') {
      errorType = ErrorType.ANALYSIS_ERROR;
    } else if (error.name === 'FileProcessingError' || error.type === 'FILE_PROCESSING_ERROR') {
      errorType = ErrorType.FILE_PROCESSING_ERROR;
    } else if (error.name === 'DriveError' || error.type?.includes('DRIVE')) {
      errorType = ErrorType.GOOGLE_DRIVE_ERROR;
    } else if (error.name === 'ValidationError' || error.type === 'VALIDATION') {
      errorType = ErrorType.VALIDATION;
    }

    const errorMessage = ERROR_MESSAGES[errorType];
    
    return {
      type: errorType,
      severity: this.determineSeverity(errorType, error),
      errorId,
      timestamp,
      message: error.message || 'Application error occurred',
      userMessage: error.userMessage || errorMessage.message,
      retryable: errorMessage.retryable,
      details: error.details,
      context,
      url: context.url || (typeof window !== 'undefined' ? window.location.href : undefined),
      userAgent: context.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      userId: context.userId,
      sessionId: context.sessionId
    };
  }

  /**
   * Creates an unknown error
   */
  private static createUnknownError(
    error: any, 
    errorId: string, 
    timestamp: string, 
    context: ErrorContext
  ): ApiError {
    const errorMessage = ERROR_MESSAGES[ErrorType.UNKNOWN];
    
    return {
      type: ErrorType.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      errorId,
      timestamp,
      message: error?.message || 'Unknown error occurred',
      userMessage: errorMessage.message,
      retryable: errorMessage.retryable,
      context,
      url: context.url || (typeof window !== 'undefined' ? window.location.href : undefined),
      userAgent: context.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      userId: context.userId,
      sessionId: context.sessionId
    };
  }

  /**
   * Generates appropriate actions for an error
   */
  private static generateErrorActions(apiError: ApiError): ErrorAction[] {
    const actions: ErrorAction[] = [];

    // Add retry action for retryable errors
    if (apiError.retryable) {
      actions.push({
        type: ErrorActionType.RETRY,
        label: 'Try Again',
        handler: () => window.location.reload(),
        primary: true
      });
    }

    // Add authentication-specific actions
    if (apiError.type === ErrorType.AUTHENTICATION || apiError.type === ErrorType.SESSION_EXPIRED) {
      actions.push({
        type: ErrorActionType.LOGIN,
        label: 'Sign In',
        handler: () => window.location.href = '/auth/login',
        primary: true
      });
    }

    // Add refresh action for server errors
    if (apiError.type === ErrorType.SERVER || apiError.type === ErrorType.SERVICE_UNAVAILABLE) {
      actions.push({
        type: ErrorActionType.REFRESH,
        label: 'Refresh Page',
        handler: () => window.location.reload()
      });
    }

    // Add contact support for critical errors
    if (apiError.severity === ErrorSeverity.CRITICAL || apiError.severity === ErrorSeverity.HIGH) {
      actions.push({
        type: ErrorActionType.CONTACT_SUPPORT,
        label: 'Contact Support',
        handler: () => window.open('mailto:support@hallucifix.com?subject=Error Report&body=' + 
          encodeURIComponent(`Error ID: ${apiError.errorId}\nError: ${apiError.message}`))
      });
    }

    // Add go home action for navigation errors
    if (apiError.statusCode === 404) {
      actions.push({
        type: ErrorActionType.GO_HOME,
        label: 'Go Home',
        handler: () => window.location.href = '/'
      });
    }

    // Always add dismiss action
    actions.push({
      type: ErrorActionType.DISMISS,
      label: 'Dismiss',
      handler: () => {} // Will be handled by the notification system
    });

    return actions;
  }

  /**
   * Determines if an error should be reported to external services
   */
  private static shouldReportError(apiError: ApiError, context: ErrorContext = {}): boolean {
    // Don't report client-side validation errors or authentication errors first
    if (apiError.type === ErrorType.VALIDATION || 
        apiError.type === ErrorType.CLIENT ||
        apiError.type === ErrorType.AUTHENTICATION ||
        apiError.type === ErrorType.AUTHORIZATION) {
      return false;
    }

    // Always report critical and high severity errors (except auth/validation)
    if (apiError.severity === ErrorSeverity.CRITICAL || apiError.severity === ErrorSeverity.HIGH) {
      return true;
    }

    // Report server errors and unknown errors
    if (apiError.type === ErrorType.SERVER || 
        apiError.type === ErrorType.SERVICE_UNAVAILABLE ||
        apiError.type === ErrorType.UNKNOWN) {
      return true;
    }

    // Report errors from critical components
    if (context.component && ['AnalysisService', 'AuthService', 'PaymentService'].includes(context.component)) {
      return true;
    }

    return false;
  }

  /**
   * Determines if the user should be notified about an error
   */
  private static shouldNotifyUser(apiError: ApiError, context: ErrorContext = {}): boolean {
    // Always notify for medium and higher severity errors
    if (apiError.severity !== ErrorSeverity.LOW) {
      return true;
    }

    // Notify for errors in user-facing features
    if (context.feature && ['content-analysis', 'file-upload', 'authentication'].includes(context.feature)) {
      return true;
    }

    return false;
  }

  /**
   * Calculate routing priority for error handling
   */
  private static calculateRoutingPriority(apiError: ApiError, context: ErrorContext): number {
    let priority = 0;

    // Base priority on severity
    switch (apiError.severity) {
      case ErrorSeverity.CRITICAL:
        priority += 100;
        break;
      case ErrorSeverity.HIGH:
        priority += 75;
        break;
      case ErrorSeverity.MEDIUM:
        priority += 50;
        break;
      case ErrorSeverity.LOW:
        priority += 25;
        break;
    }

    // Increase priority for certain error types
    switch (apiError.type) {
      case ErrorType.AUTHENTICATION:
      case ErrorType.AUTHORIZATION:
        priority += 20;
        break;
      case ErrorType.SERVER:
      case ErrorType.SERVICE_UNAVAILABLE:
        priority += 15;
        break;
      case ErrorType.RATE_LIMIT:
        priority += 10;
        break;
    }

    // Increase priority for critical components
    if (context.component && ['AnalysisService', 'AuthService', 'PaymentService'].includes(context.component)) {
      priority += 25;
    }

    // Increase priority for user-facing features
    if (context.feature && ['content-analysis', 'file-upload', 'authentication'].includes(context.feature)) {
      priority += 15;
    }

    return priority;
  }

  /**
   * Suggest appropriate handlers for an error
   */
  private static suggestHandlers(apiError: ApiError, context: ErrorContext): string[] {
    const handlers: string[] = [];

    // Always suggest logging
    handlers.push('logging');

    // Suggest recovery for retryable errors
    if (apiError.retryable) {
      handlers.push('recovery');
    }

    // Suggest incident management for severe errors
    if (apiError.severity === ErrorSeverity.CRITICAL || apiError.severity === ErrorSeverity.HIGH) {
      handlers.push('incident');
    }

    // Suggest external reporting for reportable errors
    if (this.shouldReportError(apiError, context)) {
      handlers.push('external_reporting');
    }

    // Suggest user notification for user-facing errors
    if (this.shouldNotifyUser(apiError, context)) {
      handlers.push('user_notification');
    }

    // Suggest specific handlers based on error type
    switch (apiError.type) {
      case ErrorType.AUTHENTICATION:
      case ErrorType.SESSION_EXPIRED:
        handlers.push('auth_recovery');
        break;
      case ErrorType.RATE_LIMIT:
        handlers.push('rate_limit_handler');
        break;
      case ErrorType.NETWORK:
      case ErrorType.CONNECTIVITY:
        handlers.push('network_recovery');
        break;
      case ErrorType.ANALYSIS_ERROR:
        handlers.push('analysis_fallback');
        break;
    }

    return handlers;
  }

  /**
   * Calculate escalation level (0-5, higher means more urgent)
   */
  private static calculateEscalationLevel(apiError: ApiError, context: ErrorContext): number {
    let level = 0;

    // Base level on severity
    switch (apiError.severity) {
      case ErrorSeverity.CRITICAL:
        level = 5;
        break;
      case ErrorSeverity.HIGH:
        level = 4;
        break;
      case ErrorSeverity.MEDIUM:
        level = 2;
        break;
      case ErrorSeverity.LOW:
        level = 1;
        break;
    }

    // Increase for certain error types
    if (apiError.type === ErrorType.SERVER && apiError.statusCode === 500) {
      level = Math.max(level, 4);
    }

    // Increase for critical components
    if (context.component && ['AnalysisService', 'AuthService', 'PaymentService'].includes(context.component)) {
      level = Math.min(level + 1, 5);
    }

    // Increase for repeated errors (if context indicates this)
    if (context.retryCount && context.retryCount > 2) {
      level = Math.min(level + 1, 5);
    }

    return level;
  }

  /**
   * Helper methods for error type detection
   */
  private static isTimeoutError(error: any): boolean {
    return error.code === 'ECONNABORTED' || 
           error.name === 'AbortError' ||
           error.message?.includes('timeout');
  }

  private static isNetworkError(error: any): boolean {
    return error.code === 'NETWORK_ERROR' || 
           error.name === 'NetworkError' ||
           (!error.response && error.request);
  }

  private static isApplicationError(error: any): boolean {
    return error.name && (
      error.name.includes('Error') || 
      error.type || 
      error.userMessage
    );
  }

  private static determineSeverity(errorType: ErrorType, error: any): ErrorSeverity {
    // Use explicit severity if provided
    if (error.severity) {
      return error.severity;
    }

    // Determine severity based on error type
    switch (errorType) {
      case ErrorType.ANALYSIS_ERROR:
      case ErrorType.FILE_PROCESSING_ERROR:
        return ErrorSeverity.MEDIUM;
      case ErrorType.GOOGLE_DRIVE_ERROR:
        return ErrorSeverity.HIGH;
      case ErrorType.VALIDATION:
        return ErrorSeverity.LOW;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }
}