/**
 * Error classification and handling system
 * Provides comprehensive error management for the HalluciFix application
 */

export * from './types';
export * from './classifier';
export * from './retryManager';
export * from './networkMonitor';
export * from './recoveryTracker';
export * from './recoveryStrategy';
export * from './networkRecovery';
export * from './errorManager';
export * from './errorAnalytics';
export * from './sentryIntegration';
export * from './externalErrorTracking';
export * from './errorTrackingConfig';
export * from './errorMonitor';
export * from './incidentManager';
export * from './healthCheck';
export * from './healthEndpoints';
export * from './init';
export * from './errorRouter';
export * from './structuredLogger';
export * from './enhancedRecoveryStrategies';

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
  ErrorManager,
  errorManager,
  createErrorManager,
  type ErrorLogEntry,
  type ErrorStats
} from './errorManager';

export {
  ErrorAnalytics,
  errorAnalytics,
  TimePeriod,
  type ErrorTrendPoint,
  type ErrorPattern,
  type ErrorImpact,
  type ErrorTrend,
  type AlertConfig,
  type AlertCondition,
  type AlertAction,
  type TriggeredAlert
} from './errorAnalytics';

export {
  SentryIntegration,
  sentryIntegration,
  initializeSentry,
  type SentryConfig,
  type UserFeedbackConfig
} from './sentryIntegration';

export {
  ExternalErrorTracking,
  externalErrorTracking,
  ErrorTrackingProvider,
  commonFilters,
  commonEnrichers,
  type ErrorTrackingConfig,
  type ErrorFilter,
  type ErrorEnricher,
  type IErrorTrackingProvider
} from './externalErrorTracking';

export {
  setupErrorTracking,
  updateUserContext,
  setApplicationContext,
  setFeatureFlagContext,
  flushErrorTracking,
  getErrorTrackingStatus,
  type ErrorTrackingSetupConfig
} from './errorTrackingConfig';

export {
  initializeErrorTracking,
  initializeCustomErrorTracking
} from './init';

export {
  recoveryTracker,
  useRecoveryTracker,
  type RecoveryAttempt,
  type RecoveryMetrics,
  type UserRecoveryPreferences
} from './recoveryTracker';

export {
  ErrorRecoveryManager,
  errorRecoveryManager,
  useErrorRecovery,
  withAutoRecovery,
  type RecoveryStrategy,
  type RecoveryResult,
  type RecoveryAttemptLog,
  type RecoveryConfig
} from './recoveryStrategy';

export {
  NetworkRecoveryManager,
  networkRecoveryManager,
  useNetworkRecovery,
  queueWhenOffline,
  type SyncOperation,
  type SyncResult,
  type NetworkRecoveryConfig,
  type ConflictResolution
} from './networkRecovery';

export {
  ErrorMonitor,
  errorMonitor,
  type MonitoringThreshold,
  type ThresholdCondition,
  type AlertAction,
  type MonitoringMetrics,
  type AlertEvent
} from './errorMonitor';

export {
  IncidentManager,
  incidentManager,
  IncidentSeverity,
  IncidentStatus,
  IncidentPriority,
  type Incident,
  type IncidentTimelineEntry,
  type IncidentImpact,
  type EscalationRule,
  type NotificationChannel
} from './incidentManager';

export {
  HealthCheckService,
  healthCheckService,
  HealthStatus,
  type HealthCheckResult,
  type CheckResult,
  type SystemDiagnostics,
  type ErrorCorrelation,
  type RootCauseAnalysis,
  type ImpactAssessment
} from './healthCheck';

export {
  HealthEndpoints,
  healthEndpoints,
  getHealth,
  getDetailedHealth,
  getReadiness,
  getLiveness,
  getErrorMetrics,
  getIncidentMetrics,
  getSystemDiagnostics,
  getPerformanceMetrics,
  type HealthEndpointResponse
} from './healthEndpoints';

export {
  ErrorType,
  ErrorSeverity,
  ErrorActionType,
  type ApiError,
  type ErrorContext,
  type ErrorClassification,
  type ErrorAction
} from './types';