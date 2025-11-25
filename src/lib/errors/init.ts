import { logger } from '../logging';

/**
 * Comprehensive Error System Initialization
 * Initializes all error handling components with proper configuration
 */

export * from './types';
export * from './classifier';
export * from './errorManager';
export * from './errorAnalytics';
export * from './sentryIntegration';
export * from './externalErrorTracking';
export * from './errorTrackingConfig';
export * from './errorRouter';
export * from './structuredLogger';
export * from './enhancedRecoveryStrategies';
export * from './errorGrouping';
export * from './errorAlerting';

/**
 * Comprehensive error system configuration
 */
export interface ErrorSystemConfig {
  // Error tracking configuration
  enableSentry?: boolean;
  enableConsoleLogging?: boolean;
  enableLocalStorage?: boolean;
  enableRemoteLogging?: boolean;
  sentryDsn?: string;
  environment?: string;
  release?: string;
  
  // Error grouping and alerting
  enableErrorGrouping?: boolean;
  enableErrorAlerting?: boolean;
  totalUsers?: number;
  
  // Error routing configuration
  enableAutoRecovery?: boolean;
  enableIncidentManagement?: boolean;
  enableExternalReporting?: boolean;
  maxConcurrentHandlers?: number;
  
  // Structured logging configuration
  maxLocalEntries?: number;
  batchSize?: number;
  flushInterval?: number;
  remoteEndpoint?: string;
  apiKey?: string;
  
  // Recovery configuration
  maxRecoveryAttempts?: number;
  globalCooldownMs?: number;
  escalationThreshold?: number;
}

/**
 * Initialize comprehensive error handling system
 */
export async function initializeErrorSystem(config: ErrorSystemConfig = {}): Promise<void> {
  const defaultConfig: ErrorSystemConfig = {
    enableSentry: import.meta.env.MODE === 'production',
    enableConsoleLogging: import.meta.env.MODE === 'development',
    enableLocalStorage: true,
    enableRemoteLogging: false,
    environment: import.meta.env.MODE || 'development',
    release: import.meta.env.VITE_APP_VERSION || 'unknown',
    enableAutoRecovery: true,
    enableIncidentManagement: true,
    enableExternalReporting: true,
    maxConcurrentHandlers: 10,
    enableErrorGrouping: true,
    enableErrorAlerting: true,
    totalUsers: 0,
    maxLocalEntries: 100,
    batchSize: 10,
    flushInterval: 30000,
    maxRecoveryAttempts: 3,
    globalCooldownMs: 1000,
    escalationThreshold: 3,
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
    remoteEndpoint: import.meta.env.VITE_ERROR_LOGGING_ENDPOINT,
    apiKey: import.meta.env.VITE_ERROR_LOGGING_API_KEY,
    ...config
  };

  try {
    // Initialize structured logging
    await initializeStructuredLogging(defaultConfig);
    
    // Initialize error tracking
    await initializeErrorTracking(defaultConfig);
    
    // Initialize error routing
    await initializeErrorRouting(defaultConfig);
    
    // Initialize recovery strategies
    await initializeRecoveryStrategies(defaultConfig);
    
    // Initialize error analytics
    await initializeErrorAnalytics(defaultConfig);
    
    // Initialize error grouping
    await initializeErrorGrouping(defaultConfig);
    
    // Initialize error alerting
    await initializeErrorAlerting(defaultConfig);
    
    // Set up global error handlers
    setupGlobalErrorHandlers();
    
    logger.debug("Error handling system initialized successfully");
    
  } catch (error) {
    logger.error("Failed to initialize error handling system:", error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Initialize structured logging system
 */
async function initializeStructuredLogging(config: ErrorSystemConfig): Promise<void> {
  const { structuredLogger } = await import('./structuredLogger');
  
  // Update logger configuration
  structuredLogger.updateConfig({
    enableConsoleLogging: config.enableConsoleLogging,
    enableLocalStorage: config.enableLocalStorage,
    enableRemoteLogging: config.enableRemoteLogging,
    maxLocalEntries: config.maxLocalEntries,
    batchSize: config.batchSize,
    flushInterval: config.flushInterval,
    remoteEndpoint: config.remoteEndpoint,
    apiKey: config.apiKey
  });
}

/**
 * Initialize error tracking with configuration
 */
async function initializeErrorTracking(config: ErrorSystemConfig): Promise<void> {
  const { setupErrorTracking } = await import('./errorTrackingConfig');
  
  await setupErrorTracking({
    sentry: {
      dsn: config.sentryDsn,
      environment: config.environment,
      release: config.release,
      sampleRate: config.environment === 'production' ? 0.1 : 1.0,
      tracesSampleRate: config.environment === 'production' ? 0.1 : 1.0,
      enableUserFeedback: config.environment === 'production'
    },
    custom: {
      endpoint: config.remoteEndpoint,
      apiKey: config.apiKey
    },
    enableCommonFilters: true,
    enableCommonEnrichers: true,
    enableConsoleLogging: config.enableConsoleLogging
  });
}

/**
 * Initialize error routing system
 */
async function initializeErrorRouting(config: ErrorSystemConfig): Promise<void> {
  const { errorRouter } = await import('./errorRouter');
  
  // Update router configuration
  errorRouter.updateConfig({
    enableAutoRecovery: config.enableAutoRecovery,
    enableIncidentManagement: config.enableIncidentManagement,
    enableExternalReporting: config.enableExternalReporting,
    maxConcurrentHandlers: config.maxConcurrentHandlers,
    escalationThreshold: config.escalationThreshold
  });
}

/**
 * Initialize recovery strategies
 */
async function initializeRecoveryStrategies(config: ErrorSystemConfig): Promise<void> {
  const { errorRecoveryManager } = await import('./recoveryStrategy');
  
  // Recovery manager will automatically initialize enhanced strategies
  // through its constructor and initializeDefaultStrategies method
}

/**
 * Initialize error analytics
 */
async function initializeErrorAnalytics(config: ErrorSystemConfig): Promise<void> {
  const { errorAnalytics } = await import('./errorAnalytics');
  
  // Error analytics is initialized automatically
  // Additional configuration could be added here if needed
}

/**
 * Initialize error grouping system
 */
async function initializeErrorGrouping(config: ErrorSystemConfig): Promise<void> {
  if (!config.enableErrorGrouping) return;
  
  const { errorGrouping } = await import('./errorGrouping');
  
  // Set total users for impact calculations
  if (config.totalUsers) {
    errorGrouping.setTotalUsers(config.totalUsers);
  }
}

/**
 * Initialize error alerting system
 */
async function initializeErrorAlerting(config: ErrorSystemConfig): Promise<void> {
  if (!config.enableErrorAlerting) return;
  
  const { errorAlerting } = await import('./errorAlerting');
  
  // Error alerting is initialized automatically with default rules
  // Additional configuration could be added here if needed
}

/**
 * Set up global error handlers
 */
function setupGlobalErrorHandlers(): void {
  // Handle unhandled promise rejections
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', async (event) => {
      const { errorManager } = await import('./errorManager');
      
      errorManager.handleError(event.reason, {
        component: 'GlobalErrorHandler',
        feature: 'unhandled-promise-rejection',
        url: window.location.href,
        userAgent: navigator.userAgent
      });
    });

    // Handle uncaught errors
    window.addEventListener('error', async (event) => {
      const { errorManager } = await import('./errorManager');
      
      errorManager.handleError(event.error || new Error(event.message), {
        component: 'GlobalErrorHandler',
        feature: 'uncaught-error',
        url: window.location.href,
        userAgent: navigator.userAgent,
        stackTrace: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });
  }
}

/**
 * Initialize error tracking with default configuration (backward compatibility)
 */
export async function initializeDefaultErrorTracking(): Promise<void> {
  await initializeErrorSystem();
}

/**
 * Initialize error tracking with custom configuration (backward compatibility)
 */
export async function initializeCustomErrorTracking(config: any): Promise<void> {
  await initializeErrorSystem(config);
}

/**
 * Get error system status
 */
export async function getErrorSystemStatus(): Promise<{
  initialized: boolean;
  components: {
    structuredLogger: boolean;
    errorRouter: boolean;
    errorManager: boolean;
    recoveryManager: boolean;
    analytics: boolean;
    errorGrouping: boolean;
    errorAlerting: boolean;
  };
  stats: {
    totalErrors: number;
    activeHandlers: number;
    queueLength: number;
  };
}> {
  try {
    const { errorManager } = await import('./errorManager');
    const { errorRouter } = await import('./errorRouter');
    const { errorRecoveryManager } = await import('./recoveryStrategy');
    
    const managerStats = errorManager.getStats();
    const routerStatus = errorRouter.getQueueStatus();
    const recoveryStats = errorRecoveryManager.getRecoveryStats();
    
    return {
      initialized: true,
      components: {
        structuredLogger: true,
        errorRouter: true,
        errorManager: true,
        recoveryManager: true,
        analytics: true,
        errorGrouping: true,
        errorAlerting: true
      },
      stats: {
        totalErrors: managerStats.totalErrors,
        activeHandlers: routerStatus.activeHandlers,
        queueLength: routerStatus.queueLength
      }
    };
  } catch (error) {
    return {
      initialized: false,
      components: {
        structuredLogger: false,
        errorRouter: false,
        errorManager: false,
        recoveryManager: false,
        analytics: false,
        errorGrouping: false,
        errorAlerting: false
      },
      stats: {
        totalErrors: 0,
        activeHandlers: 0,
        queueLength: 0
      }
    };
  }
}

// Auto-initialize in browser environment if not in test mode
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeErrorSystem().catch(error => {
        logger.error("Failed to initialize error handling system:", error instanceof Error ? error : new Error(String(error)));
      });
    });
  } else {
    initializeErrorSystem().catch(error => {
      logger.error("Failed to initialize error handling system:", error instanceof Error ? error : new Error(String(error)));
    });
  }
}