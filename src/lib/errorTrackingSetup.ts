/**
 * Global Error Tracking Setup
 * Initializes comprehensive error tracking across the application
 */

import { errorManager } from './errors';
import { sentryIntegration, initializeSentry } from './errors/sentryIntegration';
import { logger } from './logging';

/**
 * Initialize global error tracking
 */
export function initializeErrorTracking(): void {
  // Initialize Sentry if configured
  initializeSentry({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.NODE_ENV || 'development',
    release: import.meta.env.VITE_APP_VERSION || '1.0.0',
    sampleRate: import.meta.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    tracesSampleRate: import.meta.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    enableAutoSessionTracking: true,
    enableUserFeedback: import.meta.env.NODE_ENV === 'production',
  });

  // Set up global error handlers
  setupGlobalErrorHandlers();

  // Set up unhandled promise rejection handler
  setupUnhandledRejectionHandler();

  // Set up React error boundary integration
  setupReactErrorBoundaryIntegration();

  logger.info('Error tracking initialized', {
    sentryEnabled: sentryIntegration.isInitialized(),
    environment: import.meta.env.NODE_ENV,
  });
}

/**
 * Set up global error handlers for uncaught errors
 */
function setupGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  // Handle uncaught JavaScript errors
  window.addEventListener('error', (event) => {
    const error = event.error || new Error(event.message);
    
    errorManager.handleError(error, {
      component: 'GlobalErrorHandler',
      feature: 'uncaught-error',
      operation: 'window.onerror',
      url: event.filename,
      lineNumber: event.lineno,
      columnNumber: event.colno,
      stackTrace: error.stack,
    });
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));

    errorManager.handleError(error, {
      component: 'GlobalErrorHandler',
      feature: 'unhandled-rejection',
      operation: 'window.onunhandledrejection',
      promiseRejection: true,
      reason: event.reason,
    });

    // Prevent the default browser behavior (logging to console)
    event.preventDefault();
  });
}

/**
 * Set up unhandled promise rejection handler
 */
function setupUnhandledRejectionHandler(): void {
  if (typeof window === 'undefined') return;

  // Additional handling for fetch errors and other async operations
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    try {
      const response = await originalFetch(...args);
      
      // Track failed HTTP requests
      if (!response.ok) {
        errorManager.handleError(new Error(`HTTP ${response.status}: ${response.statusText}`), {
          component: 'GlobalFetchHandler',
          feature: 'http-error',
          operation: 'fetch',
          url: args[0] as string,
          statusCode: response.status,
          statusText: response.statusText,
        });
      }
      
      return response;
    } catch (error) {
      errorManager.handleError(error as Error, {
        component: 'GlobalFetchHandler',
        feature: 'network-error',
        operation: 'fetch',
        url: args[0] as string,
      });
      throw error;
    }
  };
}

/**
 * Set up React error boundary integration
 */
function setupReactErrorBoundaryIntegration(): void {
  // Add global error listener for React error boundaries
  errorManager.addErrorListener((error, context) => {
    // Log React component errors with additional context
    if (context.component === 'ErrorBoundary') {
      logger.error('React Error Boundary triggered', error, {
        componentStack: context.componentStack,
        level: context.level,
        retryCount: context.retryCount,
      });

      // Set user context in Sentry if available
      if (context.userId) {
        sentryIntegration.setUser({ id: context.userId });
      }

      // Add breadcrumb for React errors
      sentryIntegration.addBreadcrumb({
        message: `React Error in ${context.level || 'component'} boundary`,
        category: 'react',
        level: 'error',
        data: {
          component: context.component,
          feature: context.feature,
          level: context.level,
        },
      });
    }
  });
}

/**
 * Set user context for error tracking
 */
export function setUserContext(user: {
  id: string;
  email?: string;
  username?: string;
  [key: string]: any;
}): void {
  // Set user context in Sentry
  sentryIntegration.setUser(user);

  // Set user context in error manager
  if (typeof window !== 'undefined') {
    (window as any).currentUser = user;
  }

  logger.info('User context set for error tracking', {
    userId: user.id,
    hasEmail: !!user.email,
  });
}

/**
 * Clear user context (on logout)
 */
export function clearUserContext(): void {
  // Clear user context in Sentry
  sentryIntegration.setUser({});

  // Clear user context in error manager
  if (typeof window !== 'undefined') {
    delete (window as any).currentUser;
  }

  logger.info('User context cleared for error tracking');
}

/**
 * Set application context for error tracking
 */
export function setApplicationContext(context: {
  version?: string;
  environment?: string;
  feature?: string;
  [key: string]: any;
}): void {
  // Set context in Sentry
  sentryIntegration.setContext('application', context);

  // Set tags in Sentry
  if (context.version) {
    sentryIntegration.setTags({ version: context.version });
  }
  if (context.environment) {
    sentryIntegration.setTags({ environment: context.environment });
  }
  if (context.feature) {
    sentryIntegration.setTags({ feature: context.feature });
  }

  logger.debug('Application context set for error tracking', context);
}

/**
 * Track user action with error context
 */
export function trackUserAction(
  action: string,
  details?: Record<string, any>,
  userId?: string
): void {
  // Add breadcrumb for user actions
  sentryIntegration.addBreadcrumb({
    message: `User action: ${action}`,
    category: 'user',
    level: 'info',
    data: {
      action,
      userId,
      ...details,
    },
  });

  logger.info(`User action: ${action}`, {
    action,
    userId,
    ...details,
  });
}

/**
 * Track performance issue as error context
 */
export function trackPerformanceIssue(
  operation: string,
  duration: number,
  threshold: number,
  context?: Record<string, any>
): void {
  if (duration > threshold) {
    errorManager.handleError(new Error(`Performance issue: ${operation} took ${duration}ms`), {
      component: 'PerformanceTracker',
      feature: 'performance-monitoring',
      operation,
      duration,
      threshold,
      performanceIssue: true,
      ...context,
    });
  }
}

/**
 * Flush all pending error reports
 */
export async function flushErrorTracking(): Promise<void> {
  try {
    // Flush error manager
    await errorManager.flushErrors();

    // Flush Sentry
    await sentryIntegration.flush(2000);

    logger.info('Error tracking flushed successfully');
  } catch (error) {
    logger.error('Failed to flush error tracking', error as Error);
  }
}

/**
 * Get error tracking status
 */
export function getErrorTrackingStatus(): {
  errorManagerActive: boolean;
  sentryActive: boolean;
  totalErrors: number;
  errorRate: number;
} {
  const stats = errorManager.getStats();
  
  return {
    errorManagerActive: true,
    sentryActive: sentryIntegration.isInitialized(),
    totalErrors: stats.totalErrors,
    errorRate: stats.errorRate,
  };
}