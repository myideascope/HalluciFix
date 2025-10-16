/**
 * Error classification and handling system
 * Provides comprehensive error management for the HalluciFix application
 */

export * from './types';
export * from './classifier';
export * from './retryManager';
export * from './networkMonitor';

// Re-export commonly used items for convenience
export { 
  ApiErrorClassifier as ErrorClassifier,
  generateErrorId 
} from './classifier';

export {
  RetryManager,
  withRetry,
  withRetryFallback,
  makeRetryable,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
  type RetryAttempt,
  type RetryResult
} from './retryManager';

export {
  NetworkMonitor,
  networkMonitor,
  executeWithNetworkHandling,
  waitForConnection,
  NetworkEventType,
  DEFAULT_NETWORK_CONFIG,
  type NetworkStatus,
  type NetworkEvent,
  type NetworkEventListener,
  type QueuedOperation,
  type NetworkMonitorConfig
} from './networkMonitor';

export {
  ErrorType,
  ErrorSeverity,
  ErrorActionType,
  type ApiError,
  type ErrorContext,
  type ErrorClassification,
  type ErrorAction
} from './types';