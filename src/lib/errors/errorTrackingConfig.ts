/**
 * Error Tracking Configuration Helper
 * Provides easy setup and configuration for error tracking services
 */

import { 
  externalErrorTracking, 
  ErrorTrackingProvider, 
  ErrorTrackingConfig,
  commonFilters,
  commonEnrichers
} from './externalErrorTracking';
import { initializeSentry } from './sentryIntegration';
import { errorManager } from './errorManager';

/**
 * Environment-based error tracking configuration
 */
export interface ErrorTrackingSetupConfig {
  // Sentry configuration
  sentry?: {
    dsn?: string;
    environment?: string;
    release?: string;
    sampleRate?: number;
    tracesSampleRate?: number;
    enableUserFeedback?: boolean;
  };

  // Custom endpoint configuration
  custom?: {
    endpoint?: string;
    apiKey?: string;
  };

  // General settings
  enabledProviders?: ErrorTrackingProvider[];
  enableCommonFilters?: boolean;
  enableCommonEnrichers?: boolean;
  enableConsoleLogging?: boolean;
}

/**
 * Setup error tracking with environment-based configuration
 */
export async function setupErrorTracking(config: ErrorTrackingSetupConfig = {}): Promise<void> {
  try {
    // Configure Sentry if enabled and DSN provided
    const sentryDsn = config.sentry?.dsn || process.env.VITE_SENTRY_DSN;
    if (sentryDsn && (!config.enabledProviders || config.enabledProviders.includes(ErrorTrackingProvider.SENTRY))) {
      await externalErrorTracking.configureProvider({
        provider: ErrorTrackingProvider.SENTRY,
        enabled: true,
        config: {
          dsn: sentryDsn,
          environment: config.sentry?.environment || process.env.NODE_ENV || 'development',
          release: config.sentry?.release || process.env.VITE_APP_VERSION || '1.0.0',
          sampleRate: config.sentry?.sampleRate || (process.env.NODE_ENV === 'production' ? 0.1 : 1.0),
          tracesSampleRate: config.sentry?.tracesSampleRate || (process.env.NODE_ENV === 'production' ? 0.1 : 1.0),
          enableAutoSessionTracking: true,
          enableUserFeedback: config.sentry?.enableUserFeedback ?? (process.env.NODE_ENV === 'production')
        }
      });

      console.log('Sentry error tracking configured');
    }

    // Configure custom endpoint if provided
    const customEndpoint = config.custom?.endpoint || process.env.VITE_ERROR_TRACKING_ENDPOINT;
    if (customEndpoint && (!config.enabledProviders || config.enabledProviders.includes(ErrorTrackingProvider.CUSTOM))) {
      await externalErrorTracking.configureProvider({
        provider: ErrorTrackingProvider.CUSTOM,
        enabled: true,
        config: {
          endpoint: customEndpoint,
          apiKey: config.custom?.apiKey || process.env.VITE_ERROR_TRACKING_API_KEY
        }
      });

      console.log('Custom error tracking endpoint configured');
    }

    // Add common filters if enabled (default: true)
    if (config.enableCommonFilters !== false) {
      externalErrorTracking.addGlobalFilter(commonFilters.productionSeverityFilter);
      externalErrorTracking.addGlobalFilter(commonFilters.networkErrorFilter);
      
      // Only filter validation errors in production
      if (process.env.NODE_ENV === 'production') {
        externalErrorTracking.addGlobalFilter(commonFilters.validationErrorFilter);
      }
    }

    // Add common enrichers if enabled (default: true)
    if (config.enableCommonEnrichers !== false) {
      externalErrorTracking.addGlobalEnricher(commonEnrichers.browserEnricher);
      externalErrorTracking.addGlobalEnricher(commonEnrichers.performanceEnricher);
    }

    // Set up user context if available
    setupUserContext();

    // Set up global error handlers
    setupGlobalErrorHandlers();

    console.log('Error tracking setup completed');
  } catch (error) {
    console.error('Failed to setup error tracking:', error);
  }
}

/**
 * Setup user context for error tracking
 */
function setupUserContext(): void {
  // Check if user information is available (from auth context)
  if (typeof window !== 'undefined') {
    const user = (window as any).currentUser;
    if (user) {
      externalErrorTracking.setUser({
        id: user.id,
        email: user.email,
        username: user.username || user.name
      });
    }

    // Listen for user changes
    window.addEventListener('user-changed', (event: any) => {
      const userData = event.detail;
      if (userData) {
        externalErrorTracking.setUser({
          id: userData.id,
          email: userData.email,
          username: userData.username || userData.name
        });
      }
    });
  }
}

/**
 * Setup global error handlers
 */
function setupGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  // Handle unhandled JavaScript errors
  window.addEventListener('error', (event) => {
    errorManager.handleError(event.error || new Error(event.message), {
      component: 'global',
      url: event.filename,
      line: event.lineno,
      column: event.colno,
      stackTrace: event.error?.stack
    });
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    errorManager.handleError(event.reason || new Error('Unhandled promise rejection'), {
      component: 'global',
      type: 'unhandled_promise_rejection'
    });
  });

  // Add breadcrumbs for navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    externalErrorTracking.addBreadcrumb({
      message: 'Navigation',
      category: 'navigation',
      data: { url: args[2] }
    });
    return originalPushState.apply(this, args);
  };

  history.replaceState = function(...args) {
    externalErrorTracking.addBreadcrumb({
      message: 'Navigation (replace)',
      category: 'navigation',
      data: { url: args[2] }
    });
    return originalReplaceState.apply(this, args);
  };

  // Add breadcrumbs for clicks
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'A' || target.onclick) {
      externalErrorTracking.addBreadcrumb({
        message: 'User click',
        category: 'ui',
        data: {
          tagName: target.tagName,
          className: target.className,
          id: target.id,
          text: target.textContent?.slice(0, 100)
        }
      });
    }
  });
}

/**
 * Update user context for error tracking
 */
export function updateUserContext(user: {
  id?: string;
  email?: string;
  username?: string;
  [key: string]: any;
}): void {
  externalErrorTracking.setUser(user);
  
  // Store user info globally for error context
  if (typeof window !== 'undefined') {
    (window as any).currentUser = user;
    
    // Dispatch user change event
    window.dispatchEvent(new CustomEvent('user-changed', { detail: user }));
  }
}

/**
 * Add application context for error tracking
 */
export function setApplicationContext(context: Record<string, any>): void {
  externalErrorTracking.setContext('application', context);
}

/**
 * Add feature flag context for error tracking
 */
export function setFeatureFlagContext(flags: Record<string, boolean>): void {
  externalErrorTracking.setContext('featureFlags', flags);
}

/**
 * Flush all error tracking providers
 */
export async function flushErrorTracking(timeout: number = 2000): Promise<void> {
  try {
    await Promise.all([
      errorManager.flushErrors(),
      externalErrorTracking.flush(timeout)
    ]);
  } catch (error) {
    console.error('Failed to flush error tracking:', error);
  }
}

/**
 * Get error tracking status
 */
export function getErrorTrackingStatus(): {
  providers: string[];
  errorManager: boolean;
  analytics: boolean;
} {
  return {
    providers: externalErrorTracking.getConfiguredProviders(),
    errorManager: true,
    analytics: true
  };
}