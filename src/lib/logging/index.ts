/**
 * Logging Infrastructure Entry Point
 * Exports all logging functionality and provides easy setup
 */

export * from './types';
export * from './StructuredLogger';
export * from './contextManager';
export * from './externalServices';
export * from './logRetention';

import { StructuredLogger, logger } from './StructuredLogger';
import { contextManager } from './contextManager';
import { 
  DataDogLogsService, 
  HttpLogsService, 
  ConsoleLogsService,
  BatchLogsService,
  MultiServiceLogs 
} from './externalServices';
import { 
  InMemoryLogStorage, 
  LocalStorageLogStorage, 
  LogRetentionManager,
  DEFAULT_RETENTION_POLICIES 
} from './logRetention';
import { LoggerConfig } from './types';

/**
 * Initialize logging system with environment-specific configuration
 */
export function initializeLogging(customConfig?: Partial<LoggerConfig>): StructuredLogger {
  const loggerConfig: Partial<LoggerConfig> = {
    serviceName: 'HalluciFix',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    enableConsole: true,
    enableExternalService: false,
    ...customConfig,
  };

  // Configure external services if available
  if (process.env.DATADOG_API_KEY) {
    const dataDogService = new DataDogLogsService(process.env.DATADOG_API_KEY);
    logger.setExternalService(dataDogService);
    loggerConfig.enableExternalService = true;
  }

  // Set up log retention
  const isDevelopment = process.env.NODE_ENV === 'development';
  const storage = isDevelopment 
    ? new InMemoryLogStorage()
    : new LocalStorageLogStorage();
    
  const retentionPolicy = isDevelopment 
    ? DEFAULT_RETENTION_POLICIES.development
    : DEFAULT_RETENTION_POLICIES.production;
    
  const retentionManager = new LogRetentionManager(storage, retentionPolicy);

  // Set browser context if available
  if (typeof window !== 'undefined') {
    const browserContext = contextManager.getBrowserContext();
    contextManager.addContext('browser', browserContext);
  }

  return logger;
}

/**
 * Create a request-scoped logger with context
 */
export function createRequestLogger(requestContext?: {
  method?: string;
  url?: string;
  userAgent?: string;
  ip?: string;
  userId?: string;
  sessionId?: string;
}): StructuredLogger {
  const context = contextManager.createRequestContext(requestContext);
  
  if (requestContext?.userId) {
    context.userId = requestContext.userId;
  }
  
  if (requestContext?.sessionId) {
    context.sessionId = requestContext.sessionId;
  }

  return logger.child(context);
}

/**
 * Create a user-scoped logger with context
 */
export function createUserLogger(userId: string, sessionId?: string): StructuredLogger {
  contextManager.setUserContext(userId, sessionId);
  return logger.child(contextManager.getContext());
}

/**
 * Create an error logger with error context
 */
export function createErrorLogger(error: Error): StructuredLogger {
  const errorContext = contextManager.getErrorContext(error);
  return logger.child(errorContext);
}

/**
 * Utility functions for common logging patterns
 */
export const logUtils = {
  /**
   * Log API request/response
   */
  logApiCall: (
    method: string,
    endpoint: string,
    statusCode: number,
    duration: number,
    userId?: string
  ) => {
    const requestLogger = createRequestLogger({
      method,
      url: endpoint,
      userId,
    });

    requestLogger.info('API call completed', {
      statusCode,
      duration,
      endpoint,
      method,
    });
  },

  /**
   * Log user action
   */
  logUserAction: (
    userId: string,
    action: string,
    details?: Record<string, any>
  ) => {
    const userLogger = createUserLogger(userId);
    userLogger.info(`User action: ${action}`, {
      action,
      ...details,
    });
  },

  /**
   * Log error with context
   */
  logError: (
    error: Error,
    context?: Record<string, any>
  ) => {
    const errorLogger = createErrorLogger(error);
    errorLogger.error(error.message, error, context);
  },

  /**
   * Log performance metric
   */
  logPerformance: (
    operation: string,
    duration: number,
    context?: Record<string, any>
  ) => {
    logger.info(`Performance: ${operation}`, {
      operation,
      duration,
      ...context,
    });
  },

  /**
   * Log security event
   */
  logSecurityEvent: (
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details?: Record<string, any>
  ) => {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    logger[level](`Security event: ${event}`, {
      securityEvent: event,
      severity,
      ...details,
    });
  },
};

// Initialize logging on import
initializeLogging();

// Export default logger instance
export { logger as default };