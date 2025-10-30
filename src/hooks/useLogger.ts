/**
 * React Hook for Logging
 * Provides easy access to structured logging with React context
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from './useAuth';
import { 
  logger, 
  createLogger,
  StructuredLogger,
  LogContext
} from '../lib/logging/structuredLogger';

export function useLogger(additionalContext?: LogContext) {
  const { user } = useAuth();

  // Create user-scoped logger if user is authenticated
  const userLogger = useMemo(() => {
    if (user?.id) {
      return logger.withUser(user.id, user.session_id);
    }
    return logger;
  }, [user?.id, user?.session_id]);

  // Create logger with additional context
  const contextLogger = useMemo(() => {
    if (additionalContext) {
      return userLogger.child(additionalContext);
    }
    return userLogger;
  }, [userLogger, additionalContext]);

  // Logging methods
  const debug = useCallback((message: string, context?: LogContext) => {
    contextLogger.debug(message, context);
  }, [contextLogger]);

  const info = useCallback((message: string, context?: LogContext) => {
    contextLogger.info(message, context);
  }, [contextLogger]);

  const warn = useCallback((message: string, context?: LogContext) => {
    contextLogger.warn(message, context);
  }, [contextLogger]);

  const error = useCallback((message: string, error?: Error, context?: LogContext) => {
    contextLogger.error(message, error, context);
  }, [contextLogger]);

  // Utility logging methods
  const logUserAction = useCallback((action: string, details?: Record<string, any>) => {
    contextLogger.business('user_action', `User action: ${action}`, {
      action,
      entityId: user?.id,
      entityType: 'user',
      result: 'SUCCESS'
    }, details);
  }, [contextLogger, user?.id]);

  const logApiCall = useCallback((
    method: string,
    endpoint: string,
    statusCode: number,
    duration: number
  ) => {
    contextLogger.httpRequest(method, endpoint, statusCode, duration);
  }, [contextLogger]);

  const logError = useCallback((error: Error, context?: Record<string, any>) => {
    contextLogger.error(error.message, error, context);
  }, [contextLogger]);

  const logPerformance = useCallback((
    operation: string,
    duration: number,
    context?: Record<string, any>
  ) => {
    contextLogger.performance(`Performance: ${operation}`, { duration }, context);
  }, [contextLogger]);

  const logSecurityEvent = useCallback((
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details?: Record<string, any>
  ) => {
    contextLogger.security('security_event', `Security event: ${event}`, {
      action: event,
      result: 'DETECTED',
      riskLevel: severity.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    }, details);
  }, [contextLogger]);

  // Component lifecycle logging
  useEffect(() => {
    if (additionalContext?.component) {
      debug(`Component mounted: ${additionalContext.component}`);
      
      return () => {
        debug(`Component unmounted: ${additionalContext.component}`);
      };
    }
  }, [additionalContext?.component, debug]);

  return {
    // Basic logging methods
    debug,
    info,
    warn,
    error,
    
    // Utility methods
    logUserAction,
    logApiCall,
    logError,
    logPerformance,
    logSecurityEvent,
    
    // Direct access to logger instance
    logger: contextLogger,
  };
}

/**
 * Hook for component-specific logging
 */
export function useComponentLogger(componentName: string, additionalContext?: LogContext) {
  return useLogger({
    component: componentName,
    ...additionalContext,
  });
}

/**
 * Hook for API call logging with automatic timing
 */
export function useApiLogger() {
  const { logApiCall, logError } = useLogger();

  const logApiRequest = useCallback(async <T>(
    method: string,
    endpoint: string,
    apiCall: () => Promise<T>
  ): Promise<T> => {
    const startTime = Date.now();
    
    try {
      const result = await apiCall();
      const duration = Date.now() - startTime;
      logApiCall(method, endpoint, 200, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const statusCode = error instanceof Error && 'status' in error 
        ? (error as any).status 
        : 500;
      
      logApiCall(method, endpoint, statusCode, duration);
      logError(error as Error, { method, endpoint, duration });
      throw error;
    }
  }, [logApiCall, logError]);

  return { logApiRequest };
}

/**
 * Hook for performance logging with automatic timing
 */
export function usePerformanceLogger() {
  const { logPerformance } = useLogger();

  const measurePerformance = useCallback(async <T>(
    operation: string,
    task: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> => {
    const startTime = Date.now();
    
    try {
      const result = await task();
      const duration = Date.now() - startTime;
      logPerformance(operation, duration, context);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logPerformance(`${operation}_failed`, duration, { 
        error: (error as Error).message,
        ...context 
      });
      throw error;
    }
  }, [logPerformance]);

  const measureSync = useCallback(<T>(
    operation: string,
    task: () => T,
    context?: Record<string, any>
  ): T => {
    const startTime = Date.now();
    
    try {
      const result = task();
      const duration = Date.now() - startTime;
      logPerformance(operation, duration, context);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logPerformance(`${operation}_failed`, duration, { 
        error: (error as Error).message,
        ...context 
      });
      throw error;
    }
  }, [logPerformance]);

  return { measurePerformance, measureSync };
}