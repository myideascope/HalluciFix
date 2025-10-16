/**
 * Sentry Integration for External Error Tracking
 * Provides comprehensive error reporting to Sentry with context enrichment
 */

// Optional Sentry import - will be undefined if not installed
let Sentry: any;
let Integrations: any;

// Mock Sentry types for when Sentry is not available
type SentryEvent = any;
type SentryBreadcrumb = any;
type SentryScope = any;
type SentryTransaction = any;
type SentrySeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

try {
  Sentry = require('@sentry/browser');
  const tracing = require('@sentry/tracing');
  Integrations = tracing.Integrations;
} catch (error) {
  // Sentry not installed, will use mock implementation
  console.warn('Sentry not installed, error tracking will use mock implementation');
}
import { 
  ApiError, 
  ErrorContext, 
  ErrorSeverity, 
  ErrorType 
} from './types';
import { ErrorLogEntry } from './errorManager';

/**
 * Sentry configuration options
 */
export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  sampleRate: number;
  tracesSampleRate: number;
  enableAutoSessionTracking: boolean;
  enableUserFeedback: boolean;
  beforeSend?: (event: SentryEvent) => SentryEvent | null;
  beforeBreadcrumb?: (breadcrumb: SentryBreadcrumb) => SentryBreadcrumb | null;
}

/**
 * User feedback configuration
 */
export interface UserFeedbackConfig {
  title: string;
  subtitle: string;
  labelName: string;
  labelEmail: string;
  labelComments: string;
  labelSubmit: string;
  labelClose: string;
  successMessage: string;
  errorMessage: string;
}

/**
 * Sentry Integration Service
 * Handles initialization and error reporting to Sentry
 */
export class SentryIntegration {
  private static instance: SentryIntegration;
  private initialized = false;
  private config?: SentryConfig;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): SentryIntegration {
    if (!SentryIntegration.instance) {
      SentryIntegration.instance = new SentryIntegration();
    }
    return SentryIntegration.instance;
  }

  /**
   * Initialize Sentry with configuration
   */
  public initialize(config: SentryConfig): void {
    if (this.initialized) {
      console.warn('Sentry already initialized');
      return;
    }

    this.config = config;

    // Check if Sentry is available
    if (!Sentry) {
      console.warn('Sentry not available, using mock implementation');
      this.initialized = true;
      return;
    }

    try {
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        release: config.release,
        sampleRate: config.sampleRate,
        tracesSampleRate: config.tracesSampleRate,
        autoSessionTracking: config.enableAutoSessionTracking,
        integrations: [
          new Integrations.BrowserTracing({
            // Set up automatic route change tracking for SPAs
            routingInstrumentation: Sentry.reactRouterV6Instrumentation(
              // This would need to be imported from react-router if using React Router
              // React.useEffect,
              // useLocation,
              // useNavigationType,
              // createRoutesFromChildren,
              // matchRoutes
            ),
          }),
        ],
        beforeSend: (event) => {
          // Apply custom beforeSend logic
          if (config.beforeSend) {
            event = config.beforeSend(event);
            if (!event) return null;
          }

          // Filter out low-priority errors in production
          if (config.environment === 'production') {
            const errorLevel = event.level;
            if (errorLevel === 'info' || errorLevel === 'debug') {
              return null;
            }
          }

          return event;
        },
        beforeBreadcrumb: (breadcrumb) => {
          // Apply custom beforeBreadcrumb logic
          if (config.beforeBreadcrumb) {
            return config.beforeBreadcrumb(breadcrumb);
          }

          // Filter out noisy breadcrumbs
          if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
            return null;
          }

          return breadcrumb;
        }
      });

      this.initialized = true;
      console.log('Sentry initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
    }
  }

  /**
   * Check if Sentry is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Report an API error to Sentry
   */
  public reportError(apiError: ApiError, context: ErrorContext = {}): void {
    if (!this.initialized) {
      console.warn('Sentry not initialized, skipping error report');
      return;
    }

    if (!Sentry) {
      // Fallback to console logging
      console.error('Error Report (Sentry unavailable):', {
        type: apiError.type,
        severity: apiError.severity,
        message: apiError.message,
        context
      });
      return;
    }

    Sentry.withScope((scope) => {
      // Set error context
      this.setErrorContext(scope, apiError, context);
      
      // Create error object
      const error = new Error(apiError.message);
      error.name = `${apiError.type}Error`;
      
      // Capture the error
      Sentry.captureException(error);
    });
  }

  /**
   * Report multiple errors in batch
   */
  public reportErrorBatch(errorEntries: ErrorLogEntry[]): void {
    if (!this.initialized) {
      console.warn('Sentry not initialized, skipping batch error report');
      return;
    }

    if (!Sentry) {
      // Fallback to console logging
      console.error('Batch Error Report (Sentry unavailable):', errorEntries.length, 'errors');
      return;
    }

    for (const entry of errorEntries) {
      const apiError: ApiError = {
        type: entry.type,
        severity: entry.severity,
        errorId: entry.errorId,
        timestamp: entry.timestamp,
        message: entry.message,
        userMessage: entry.userMessage,
        statusCode: entry.statusCode,
        retryable: false, // Not available in log entry
        url: entry.url,
        userAgent: entry.userAgent,
        userId: entry.userId,
        sessionId: entry.sessionId,
        context: entry.context
      };

      this.reportError(apiError, entry.context);
    }
  }

  /**
   * Set user context for error tracking
   */
  public setUser(user: {
    id?: string;
    email?: string;
    username?: string;
    [key: string]: any;
  }): void {
    if (!this.initialized) return;

    if (!Sentry) {
      console.debug('Set user context (Sentry unavailable):', user);
      return;
    }

    Sentry.setUser(user);
  }

  /**
   * Set additional context tags
   */
  public setTags(tags: Record<string, string>): void {
    if (!this.initialized) return;

    if (!Sentry) {
      console.debug('Set tags (Sentry unavailable):', tags);
      return;
    }

    Sentry.setTags(tags);
  }

  /**
   * Set additional context data
   */
  public setContext(key: string, context: Record<string, any>): void {
    if (!this.initialized) return;

    if (!Sentry) {
      console.debug('Set context (Sentry unavailable):', key, context);
      return;
    }

    Sentry.setContext(key, context);
  }

  /**
   * Add breadcrumb for debugging
   */
  public addBreadcrumb(breadcrumb: {
    message: string;
    category?: string;
    level?: SentrySeverityLevel;
    data?: Record<string, any>;
  }): void {
    if (!this.initialized) return;

    if (!Sentry) {
      console.debug('Add breadcrumb (Sentry unavailable):', breadcrumb);
      return;
    }

    Sentry.addBreadcrumb({
      message: breadcrumb.message,
      category: breadcrumb.category || 'custom',
      level: breadcrumb.level || 'info',
      data: breadcrumb.data
    });
  }

  /**
   * Show user feedback dialog
   */
  public showUserFeedback(config?: Partial<UserFeedbackConfig>): void {
    if (!this.initialized || !this.config?.enableUserFeedback) return;

    const feedbackConfig: UserFeedbackConfig = {
      title: 'It looks like we\'re having issues.',
      subtitle: 'Our team has been notified. If you\'d like to help, tell us what happened below.',
      labelName: 'Name',
      labelEmail: 'Email',
      labelComments: 'What happened?',
      labelSubmit: 'Submit',
      labelClose: 'Close',
      successMessage: 'Thank you for your feedback!',
      errorMessage: 'An error occurred while submitting your feedback.',
      ...config
    };

    if (!Sentry) {
      console.warn('User feedback dialog not available (Sentry unavailable)');
      return;
    }

    Sentry.showReportDialog({
      title: feedbackConfig.title,
      subtitle: feedbackConfig.subtitle,
      labelName: feedbackConfig.labelName,
      labelEmail: feedbackConfig.labelEmail,
      labelComments: feedbackConfig.labelComments,
      labelSubmit: feedbackConfig.labelSubmit,
      labelClose: feedbackConfig.labelClose,
      successMessage: feedbackConfig.successMessage,
      errorMessage: feedbackConfig.errorMessage
    });
  }

  /**
   * Capture a custom message
   */
  public captureMessage(
    message: string, 
    level: SentrySeverityLevel = 'info',
    context?: Record<string, any>
  ): void {
    if (!this.initialized) return;

    if (!Sentry) {
      console.log(`[${level.toUpperCase()}] ${message}`, context);
      return;
    }

    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext('custom', context);
      }
      Sentry.captureMessage(message, level);
    });
  }

  /**
   * Start a performance transaction
   */
  public startTransaction(name: string, op: string): SentryTransaction | undefined {
    if (!this.initialized) return undefined;

    if (!Sentry) {
      console.debug('Start transaction (Sentry unavailable):', name, op);
      return undefined;
    }

    return Sentry.startTransaction({ name, op });
  }

  /**
   * Flush pending events
   */
  public async flush(timeout: number = 2000): Promise<boolean> {
    if (!this.initialized) return false;

    if (!Sentry) {
      console.debug('Flush events (Sentry unavailable)');
      return true;
    }

    try {
      return await Sentry.flush(timeout);
    } catch (error) {
      console.error('Failed to flush Sentry events:', error);
      return false;
    }
  }

  /**
   * Close Sentry client
   */
  public async close(timeout: number = 2000): Promise<boolean> {
    if (!this.initialized) return false;

    if (!Sentry) {
      console.debug('Close Sentry client (Sentry unavailable)');
      this.initialized = false;
      return true;
    }

    try {
      const result = await Sentry.close(timeout);
      this.initialized = false;
      return result;
    } catch (error) {
      console.error('Failed to close Sentry client:', error);
      return false;
    }
  }

  // Private helper methods

  /**
   * Set comprehensive error context in Sentry scope
   */
  private setErrorContext(scope: SentryScope, apiError: ApiError, context: ErrorContext): void {
    // Set error level based on severity
    scope.setLevel(this.mapSeverityToSentryLevel(apiError.severity));

    // Set error tags
    scope.setTag('errorType', apiError.type);
    scope.setTag('errorSeverity', apiError.severity);
    scope.setTag('errorId', apiError.errorId);
    
    if (apiError.statusCode) {
      scope.setTag('statusCode', apiError.statusCode.toString());
    }

    if (apiError.retryable) {
      scope.setTag('retryable', 'true');
    }

    // Set user context
    if (apiError.userId || context.userId) {
      scope.setUser({
        id: apiError.userId || context.userId
      });
    }

    // Set request context
    if (apiError.url || context.url) {
      scope.setContext('request', {
        url: apiError.url || context.url,
        method: context.method,
        endpoint: context.endpoint
      });
    }

    // Set application context
    scope.setContext('application', {
      component: context.component,
      feature: context.feature,
      sessionId: apiError.sessionId || context.sessionId,
      userAgent: apiError.userAgent || context.userAgent
    });

    // Set error details context
    scope.setContext('errorDetails', {
      userMessage: apiError.userMessage,
      retryable: apiError.retryable,
      retryAfter: apiError.retryAfter,
      details: apiError.details
    });

    // Set additional context
    if (context && Object.keys(context).length > 0) {
      scope.setContext('additionalContext', {
        ...context,
        // Remove sensitive information
        userId: undefined,
        sessionId: undefined,
        userAgent: undefined
      });
    }

    // Add performance context if available
    if (context.performanceNow) {
      scope.setContext('performance', {
        performanceNow: context.performanceNow,
        memoryUsage: context.memoryUsage
      });
    }

    // Set fingerprint for grouping similar errors
    scope.setFingerprint([
      apiError.type,
      this.normalizeErrorMessage(apiError.message),
      context.component || 'unknown'
    ]);
  }

  /**
   * Map error severity to Sentry level
   */
  private mapSeverityToSentryLevel(severity: ErrorSeverity): SentrySeverityLevel {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'fatal';
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warning';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'error';
    }
  }

  /**
   * Normalize error message for consistent grouping
   */
  private normalizeErrorMessage(message: string): string {
    // Remove specific IDs, numbers, and timestamps for better grouping
    return message
      .replace(/\b\d+\b/g, 'NUMBER')
      .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, 'UUID')
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\b/g, 'TIMESTAMP')
      .replace(/https?:\/\/[^\s]+/g, 'URL')
      .toLowerCase()
      .trim();
  }
}

// Export singleton instance
export const sentryIntegration = SentryIntegration.getInstance();

/**
 * Initialize Sentry with environment-based configuration
 */
export const initializeSentry = (config: Partial<SentryConfig> = {}) => {
  const defaultConfig: SentryConfig = {
    dsn: process.env.VITE_SENTRY_DSN || '',
    environment: process.env.NODE_ENV || 'development',
    release: process.env.VITE_APP_VERSION || '1.0.0',
    sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    enableAutoSessionTracking: true,
    enableUserFeedback: process.env.NODE_ENV === 'production',
    ...config
  };

  // Only initialize if DSN is provided
  if (defaultConfig.dsn) {
    sentryIntegration.initialize(defaultConfig);
  } else {
    console.warn('Sentry DSN not provided, error tracking disabled');
  }
};