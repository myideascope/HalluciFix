/**
 * Sentry Integration for External Error Tracking
 * Provides comprehensive error reporting to Sentry with context enrichment
 */

import * as Sentry from '@sentry/browser';
import { BrowserTracing } from '@sentry/tracing';

// Sentry types
type SentryEvent = Sentry.Event;
type SentryBreadcrumb = Sentry.Breadcrumb;
type SentryScope = Sentry.Scope;
type SentryTransaction = Sentry.Transaction;
type SentrySeverityLevel = Sentry.SeverityLevel;
import { 
  ApiError, 
  ErrorContext, 
  ErrorSeverity, 
  ErrorType 
} from './types';
import { ErrorLogEntry } from './errorManager';

import { logger } from '../logging';
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
      logger.warn("Sentry already initialized");
      return;
    }

    this.config = config;

    try {
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        release: config.release,
        sampleRate: config.sampleRate,
        tracesSampleRate: config.tracesSampleRate,
        autoSessionTracking: config.enableAutoSessionTracking,
        integrations: [
          new BrowserTracing({
            // Basic browser tracing without React Router integration for now
            tracePropagationTargets: ['localhost', /^https:\/\/yourapi\.domain\.com\/api/],
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
      logger.debug("Sentry initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Sentry:", error instanceof Error ? error : new Error(String(error)));
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
      logger.warn("Sentry not initialized, skipping error report");
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
      logger.warn("Sentry not initialized, skipping batch error report");
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



    Sentry.setUser(user);
  }

  /**
   * Set additional context tags
   */
  public setTags(tags: Record<string, string>): void {
    if (!this.initialized) return;



    Sentry.setTags(tags);
  }

  /**
   * Set additional context data
   */
  public setContext(key: string, context: Record<string, any>): void {
    if (!this.initialized) return;



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

    // Use the newer Sentry API for transactions
    return Sentry.startSpan({ name, op }, (span) => span) as SentryTransaction;
  }

  /**
   * Flush pending events
   */
  public async flush(timeout: number = 2000): Promise<boolean> {
    if (!this.initialized) return false;



    try {
      return await Sentry.flush(timeout);
    } catch (error) {
      logger.error("Failed to flush Sentry events:", error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Close Sentry client
   */
  public async close(timeout: number = 2000): Promise<boolean> {
    if (!this.initialized) return false;



    try {
      const result = await Sentry.close(timeout);
      this.initialized = false;
      return result;
    } catch (error) {
      logger.error("Failed to close Sentry client:", error instanceof Error ? error : new Error(String(error)));
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
export const initializeSentry = (config?: Partial<SentryConfig>) => {
  const defaultConfig: SentryConfig = {
    dsn: import.meta.env.VITE_SENTRY_DSN || '',
    environment: import.meta.env.MODE || 'development',
    release: import.meta.env.VITE_APP_VERSION || '1.0.0',
    sampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    enableAutoSessionTracking: true,
    enableUserFeedback: import.meta.env.MODE === 'production',
    ...config
  };

  // Only initialize if DSN is provided
  if (defaultConfig.dsn) {
    sentryIntegration.initialize(defaultConfig);
  } else {
    logger.warn("Sentry DSN not provided, error tracking disabled");
  }
};