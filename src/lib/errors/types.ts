/**
 * Comprehensive error classification system for HalluciFix
 * Provides standardized error types, severity levels, and user-friendly messaging
 */

/**
 * Error types covering all major error categories
 */
export enum ErrorType {
  // Network-related errors
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  CONNECTIVITY = 'CONNECTIVITY',
  
  // Authentication and authorization errors
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Validation and client errors
  VALIDATION = 'VALIDATION',
  CLIENT = 'CLIENT',
  INVALID_INPUT = 'INVALID_INPUT',
  
  // Server and service errors
  SERVER = 'SERVER',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT = 'RATE_LIMIT',
  
  // Application-specific errors
  ANALYSIS_ERROR = 'ANALYSIS_ERROR',
  FILE_PROCESSING_ERROR = 'FILE_PROCESSING_ERROR',
  GOOGLE_DRIVE_ERROR = 'GOOGLE_DRIVE_ERROR',
  
  // Unknown or unclassified errors
  UNKNOWN = 'UNKNOWN'
}

/**
 * Error severity levels for prioritization and handling
 */
export enum ErrorSeverity {
  LOW = 'low',           // Minor issues, user can continue
  MEDIUM = 'medium',     // Moderate issues, some functionality affected
  HIGH = 'high',         // Significant issues, major functionality affected
  CRITICAL = 'critical'  // Severe issues, application may be unusable
}

/**
 * Comprehensive error information structure
 */
export interface ApiError {
  // Core error identification
  type: ErrorType;
  severity: ErrorSeverity;
  errorId: string;
  timestamp: string;
  
  // Error messages
  message: string;        // Technical message for logging
  userMessage: string;    // User-friendly message for display
  
  // HTTP-specific information
  statusCode?: number;
  
  // Additional context
  details?: any;
  context?: Record<string, any>;
  
  // Recovery information
  retryable: boolean;
  retryAfter?: number;    // Milliseconds to wait before retry
  
  // Tracking information
  url?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
}

/**
 * Error action types for user interaction
 */
export enum ErrorActionType {
  RETRY = 'retry',
  REFRESH = 'refresh',
  LOGIN = 'login',
  CONTACT_SUPPORT = 'contact_support',
  GO_HOME = 'go_home',
  DISMISS = 'dismiss'
}

/**
 * User action for error recovery
 */
export interface ErrorAction {
  type: ErrorActionType;
  label: string;
  handler: () => void | Promise<void>;
  primary?: boolean;
}

/**
 * Error context for enhanced debugging and tracking
 */
export interface ErrorContext {
  // User context
  userId?: string;
  sessionId?: string;
  
  // Request context
  url?: string;
  method?: string;
  endpoint?: string;
  
  // Application context
  component?: string;
  feature?: string;
  userAgent?: string;
  
  // Additional metadata
  [key: string]: any;
}

/**
 * Error classification result
 */
export interface ErrorClassification {
  error: ApiError;
  actions: ErrorAction[];
  shouldReport: boolean;
  shouldNotifyUser: boolean;
}