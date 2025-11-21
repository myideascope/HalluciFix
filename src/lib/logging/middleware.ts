/**
 * Logging Middleware for API Calls and Request Tracking
 */

import { createRequestLogger, logUtils } from './index';
import { LogContext } from './types';

import { logger } from './logging';
/**
 * API Request Logging Middleware
 */
export class ApiLoggingMiddleware {
  /**
   * Log API request and response
   */
  static async logApiCall<T>(
    method: string,
    url: string,
    requestBody?: any,
    headers?: Record<string, string>
  ): Promise<{
    logRequest: (context?: LogContext) => void;
    logResponse: (response: Response, responseBody?: any) => void;
    logError: (error: Error) => void;
  }> {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const requestLogger = createRequestLogger({
      method,
      url,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });

    const logRequest = (context?: LogContext) => {
      requestLogger.info('API request started', {
        requestId,
        method,
        url,
        hasBody: !!requestBody,
        headers: headers ? Object.keys(headers) : [],
        ...context,
      });
    };

    const logResponse = (response: Response, responseBody?: any) => {
      const duration = Date.now() - startTime;
      
      requestLogger.info('API request completed', {
        requestId,
        method,
        url,
        statusCode: response.status,
        statusText: response.statusText,
        duration,
        hasResponseBody: !!responseBody,
        contentType: response.headers.get('content-type'),
      });

      // Log performance metrics
      logUtils.logPerformance(`api_${method.toLowerCase()}_${url}`, duration, {
        requestId,
        statusCode: response.status,
      });
    };

    const logError = (error: Error) => {
      const duration = Date.now() - startTime;
      
      requestLogger.error('API request failed', error, {
        requestId,
        method,
        url,
        duration,
      });
    };

    return { logRequest, logResponse, logError };
  }

  /**
   * Fetch wrapper with automatic logging
   */
  static async loggedFetch(
    url: string,
    options: RequestInit = {},
    context?: LogContext
  ): Promise<Response> {
    const method = options.method || 'GET';
    const { logRequest, logResponse, logError } = await this.logApiCall(
      method,
      url,
      options.body,
      options.headers as Record<string, string>
    );

    logRequest(context);

    try {
      const response = await fetch(url, options);
      
      // Clone response to read body for logging without consuming it
      const responseClone = response.clone();
      let responseBody;
      
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          responseBody = await responseClone.json();
        } else if (contentType?.includes('text/')) {
          responseBody = await responseClone.text();
        }
      } catch {
        // Ignore body parsing errors for logging
      }

      logResponse(response, responseBody);
      return response;
    } catch (error) {
      logError(error as Error);
      throw error;
    }
  }
}

/**
 * Error Boundary Logging Middleware
 */
export class ErrorBoundaryLoggingMiddleware {
  static logComponentError(
    error: Error,
    errorInfo: { componentStack: string },
    componentName?: string
  ): void {
    logUtils.logError(error, {
      errorBoundary: true,
      componentName,
      componentStack: errorInfo.componentStack,
      errorType: 'component_error',
    });
  }

  static logUnhandledError(error: Error | ErrorEvent): void {
    const errorObj = error instanceof Error ? error : new Error(error.message);
    
    logUtils.logError(errorObj, {
      errorType: 'unhandled_error',
      filename: error instanceof ErrorEvent ? error.filename : undefined,
      lineno: error instanceof ErrorEvent ? error.lineno : undefined,
      colno: error instanceof ErrorEvent ? error.colno : undefined,
    });
  }

  static logUnhandledRejection(event: PromiseRejectionEvent): void {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));

    logUtils.logError(error, {
      errorType: 'unhandled_rejection',
      reason: event.reason,
    });
  }
}

/**
 * User Action Logging Middleware
 */
export class UserActionLoggingMiddleware {
  static logPageView(path: string, userId?: string): void {
    logUtils.logUserAction(userId || 'anonymous', 'page_view', {
      path,
      timestamp: new Date().toISOString(),
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
    });
  }

  static logButtonClick(buttonId: string, userId?: string, context?: LogContext): void {
    logUtils.logUserAction(userId || 'anonymous', 'button_click', {
      buttonId,
      ...context,
    });
  }

  static logFormSubmission(formId: string, userId?: string, context?: LogContext): void {
    logUtils.logUserAction(userId || 'anonymous', 'form_submission', {
      formId,
      ...context,
    });
  }

  static logFileUpload(fileName: string, fileSize: number, userId?: string): void {
    logUtils.logUserAction(userId || 'anonymous', 'file_upload', {
      fileName,
      fileSize,
      timestamp: new Date().toISOString(),
    });
  }

  static logAnalysisRequest(
    analysisType: string,
    contentLength: number,
    userId?: string
  ): void {
    logUtils.logUserAction(userId || 'anonymous', 'analysis_request', {
      analysisType,
      contentLength,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Performance Logging Middleware
 */
export class PerformanceLoggingMiddleware {
  private static performanceObserver?: PerformanceObserver;

  static initializeWebVitals(): void {
    if (typeof window === 'undefined' || this.performanceObserver) {
      return;
    }

    // Observe Core Web Vitals
    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming;
            logUtils.logPerformance('page_load', navEntry.loadEventEnd - navEntry.fetchStart, {
              domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.fetchStart,
              firstPaint: navEntry.responseEnd - navEntry.fetchStart,
              type: 'navigation',
            });
          }

          if (entry.entryType === 'paint') {
            logUtils.logPerformance(`web_vital_${entry.name}`, entry.startTime, {
              type: 'paint',
            });
          }

          if (entry.entryType === 'largest-contentful-paint') {
            logUtils.logPerformance('web_vital_lcp', entry.startTime, {
              type: 'lcp',
              size: (entry as any).size,
            });
          }
        });
      });

      this.performanceObserver.observe({ 
        entryTypes: ['navigation', 'paint', 'largest-contentful-paint'] 
      });
    } catch (error) {
      logger.warn("Performance monitoring not supported:", { error });
    }
  }

  static logComponentRender(componentName: string, renderTime: number): void {
    logUtils.logPerformance(`component_render_${componentName}`, renderTime, {
      type: 'component_render',
      componentName,
    });
  }

  static logDatabaseQuery(query: string, duration: number, resultCount?: number): void {
    logUtils.logPerformance('database_query', duration, {
      type: 'database',
      query: query.substring(0, 100), // Truncate long queries
      resultCount,
    });
  }

  static cleanup(): void {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = undefined;
    }
  }
}

/**
 * Initialize all logging middleware
 */
export function initializeLoggingMiddleware(): void {
  // Initialize performance monitoring
  PerformanceLoggingMiddleware.initializeWebVitals();

  // Set up global error handlers
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      ErrorBoundaryLoggingMiddleware.logUnhandledError(event);
    });

    window.addEventListener('unhandledrejection', (event) => {
      ErrorBoundaryLoggingMiddleware.logUnhandledRejection(event);
    });
  }
}

/**
 * Cleanup logging middleware
 */
export function cleanupLoggingMiddleware(): void {
  PerformanceLoggingMiddleware.cleanup();
}