/**
 * Centralized Error Manager Service
 * Provides comprehensive error management with queuing, batch processing, and logging
 */

import { 
  ApiError, 
  ErrorContext, 
  ErrorClassification, 
  ErrorSeverity,
  ErrorType 
} from './types';
import { ApiErrorClassifier } from './classifier';
import { errorAnalytics, ErrorAnalytics } from './errorAnalytics';
import { externalErrorTracking, ExternalErrorTracking } from './externalErrorTracking';
import { errorMonitor } from './errorMonitor';
import { errorRouter, ErrorRouter } from './errorRouter';
import { structuredLogger, StructuredLogger } from './structuredLogger';
import { errorGrouping, ErrorGroupingService } from './errorGrouping';
import { errorAlerting, ErrorAlertingService } from './errorAlerting';

/**
 * Error log entry for structured logging
 */
export interface ErrorLogEntry {
  errorId: string;
  timestamp: string;
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  statusCode?: number;
  url: string;
  userAgent: string;
  userId?: string;
  sessionId?: string;
  context: Record<string, any>;
  stackTrace?: string;
  resolved: boolean;
  resolvedAt?: string;
  retryCount?: number;
  component?: string;
  feature?: string;
}

/**
 * Queued error for batch processing
 */
interface QueuedError {
  error: ApiError;
  context: ErrorContext;
  classification: ErrorClassification;
  timestamp: string;
  processed: boolean;
}

/**
 * Error manager configuration
 */
interface ErrorManagerConfig {
  batchSize: number;
  flushInterval: number; // milliseconds
  maxQueueSize: number;
  enableConsoleLogging: boolean;
  enableLocalStorage: boolean;
  localStorageKey: string;
  maxLocalStorageEntries: number;
}

/**
 * Error statistics for analytics
 */
export interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recentErrors: ErrorLogEntry[];
  errorRate: number; // errors per minute
  lastErrorTime?: string;
}

/**
 * Centralized Error Manager
 * Handles error collection, processing, logging, and reporting
 */
export class ErrorManager {
  private static instance: ErrorManager;
  private config: ErrorManagerConfig;
  private errorQueue: QueuedError[] = [];
  private errorLog: ErrorLogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private stats: ErrorStats;
  private listeners: Set<(error: ApiError, context: ErrorContext) => void> = new Set();
  private analytics: ErrorAnalytics;
  private externalTracking: ExternalErrorTracking;
  private router: ErrorRouter;
  private logger: StructuredLogger;
  private grouping: ErrorGroupingService;
  private alerting: ErrorAlertingService;

  private constructor(config: Partial<ErrorManagerConfig> = {}) {
    this.config = {
      batchSize: 10,
      flushInterval: 30000, // 30 seconds
      maxQueueSize: 100,
      enableConsoleLogging: import.meta.env.MODE === 'development',
      enableLocalStorage: true,
      localStorageKey: 'hallucifix_error_log',
      maxLocalStorageEntries: 50,
      ...config
    };

    this.stats = {
      totalErrors: 0,
      errorsByType: {} as Record<ErrorType, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      recentErrors: [],
      errorRate: 0
    };

    this.analytics = errorAnalytics;
    this.externalTracking = externalErrorTracking;
    this.router = errorRouter;
    this.logger = structuredLogger;
    this.grouping = errorGrouping;
    this.alerting = errorAlerting;
    this.initializeErrorManager();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<ErrorManagerConfig>): ErrorManager {
    if (!ErrorManager.instance) {
      ErrorManager.instance = new ErrorManager(config);
    }
    return ErrorManager.instance;
  }

  /**
   * Initialize error manager
   */
  private initializeErrorManager(): void {
    // Load existing error log from localStorage
    this.loadErrorLogFromStorage();

    // Start flush timer
    this.startFlushTimer();

    // Handle page unload to flush remaining errors
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushErrors(true);
      });

      // Handle visibility change to flush errors when page becomes hidden
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.flushErrors();
        }
      });
    }
  }

  /**
   * Handle an error with comprehensive processing
   */
  public handleError(error: any, context: ErrorContext = {}): ApiError {
    // Enhance context with additional information
    const enhancedContext = this.enhanceErrorContext(context);
    
    // Classify the error with routing information
    const classification = ApiErrorClassifier.classifyWithRouting(error, enhancedContext);
    
    // Log the error using structured logging
    this.logger.logError(classification.error, enhancedContext);
    
    // Process error grouping and alerting
    this.processErrorGroupingAndAlerting(classification.error, enhancedContext);
    
    // Route the error to appropriate handlers
    this.routeErrorAsync(classification.error, enhancedContext, classification);
    
    // Add to queue for batch processing
    this.queueError(classification.error, enhancedContext, classification);
    
    // Update statistics
    this.updateStats(classification.error);
    
    // Log to console in development (fallback)
    if (this.config.enableConsoleLogging) {
      this.logToConsole(classification.error, enhancedContext);
    }
    
    // Notify listeners
    this.notifyListeners(classification.error, enhancedContext);
    
    // Immediate processing for critical errors
    if (classification.error.severity === ErrorSeverity.CRITICAL) {
      this.processCriticalError(classification.error, enhancedContext, classification);
    }

    // Report to external tracking services immediately for high/critical errors
    if (classification.error.severity === ErrorSeverity.HIGH || 
        classification.error.severity === ErrorSeverity.CRITICAL) {
      this.externalTracking.reportError(classification.error, enhancedContext).catch(error => {
        this.logger.logError(error, {
          component: 'ErrorManager',
          feature: 'external-tracking',
          operation: 'reportError'
        });
      });
    }
    
    return classification.error;
  }

  /**
   * Route error asynchronously to avoid blocking
   */
  private async routeErrorAsync(
    error: ApiError, 
    context: ErrorContext, 
    classification: ErrorClassification
  ): Promise<void> {
    try {
      const routingResults = await this.router.routeError(error, context, classification);
      
      // Log routing results
      this.logger.logInfo('Error routing completed', {
        errorId: error.errorId,
        handlersExecuted: routingResults.length,
        successfulHandlers: routingResults.filter(r => r.handled).length,
        component: 'ErrorManager',
        feature: 'error-routing'
      });

      // Check if any handler requested escalation
      const needsEscalation = routingResults.some(r => r.escalate);
      if (needsEscalation) {
        this.escalateError(error, context, routingResults);
      }

    } catch (routingError) {
      this.logger.logError(routingError, {
        errorId: error.errorId,
        component: 'ErrorManager',
        feature: 'error-routing',
        operation: 'routeErrorAsync'
      });
    }
  }

  /**
   * Escalate error when handlers fail or request escalation
   */
  private escalateError(
    error: ApiError, 
    context: ErrorContext, 
    routingResults: any[]
  ): void {
    this.logger.logWarning('Error escalation triggered', {
      errorId: error.errorId,
      errorType: error.type,
      severity: error.severity,
      routingResults: routingResults.map(r => ({
        handled: r.handled,
        escalate: r.escalate,
        message: r.message
      })),
      component: 'ErrorManager',
      feature: 'error-escalation'
    }, ['escalation']);

    // Additional escalation logic could be implemented here
    // For example: notify administrators, create high-priority incidents, etc.
  }

  /**
   * Process error grouping and alerting
   */
  private async processErrorGroupingAndAlerting(
    error: ApiError, 
    context: ErrorContext
  ): Promise<void> {
    try {
      // Process error grouping (synchronous)
      const groupId = this.grouping.processError(error, context);
      
      // Process error alerting (asynchronous to avoid blocking)
      this.alerting.processError(error, context).catch(alertError => {
        this.logger.logError(alertError, {
          errorId: error.errorId,
          component: 'ErrorManager',
          feature: 'error-alerting',
          operation: 'processError'
        });
      });

      // Log grouping information
      this.logger.logDebug('Error processed for grouping and alerting', {
        errorId: error.errorId,
        groupId,
        component: 'ErrorManager',
        feature: 'error-grouping'
      });

    } catch (groupingError) {
      this.logger.logError(groupingError, {
        errorId: error.errorId,
        component: 'ErrorManager',
        feature: 'error-grouping',
        operation: 'processErrorGroupingAndAlerting'
      });
    }
  }

  /**
   * Report an error (alias for handleError for backward compatibility)
   */
  public reportError(error: any, context: ErrorContext = {}): ApiError {
    return this.handleError(error, context);
  }

  /**
   * Add error listener
   */
  public addErrorListener(listener: (error: ApiError, context: ErrorContext) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove error listener
   */
  public removeErrorListener(listener: (error: ApiError, context: ErrorContext) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Get error statistics
   */
  public getStats(): ErrorStats {
    return { ...this.stats };
  }

  /**
   * Get recent error log entries
   */
  public getRecentErrors(limit: number = 20): ErrorLogEntry[] {
    return this.errorLog
      .slice(-limit)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Clear error log
   */
  public clearErrorLog(): void {
    this.errorLog = [];
    this.saveErrorLogToStorage();
    this.resetStats();
    this.analytics.updateErrorLog(this.errorLog);
  }

  /**
   * Get analytics instance
   */
  public getAnalytics(): ErrorAnalytics {
    return this.analytics;
  }

  /**
   * Get external tracking instance
   */
  public getExternalTracking(): ExternalErrorTracking {
    return this.externalTracking;
  }

  /**
   * Flush errors immediately
   */
  public async flushErrors(synchronous: boolean = false): Promise<void> {
    if (this.errorQueue.length === 0) return;

    const errorsToProcess = [...this.errorQueue];
    this.errorQueue = [];

    if (synchronous) {
      // Process synchronously for page unload
      this.processErrorBatch(errorsToProcess);
    } else {
      // Process asynchronously
      try {
        await this.processErrorBatch(errorsToProcess);
      } catch (error) {
        console.error('Failed to process error batch:', error);
        // Re-add errors to queue for retry
        this.errorQueue.unshift(...errorsToProcess);
      }
    }
  }

  /**
   * Enhance error context with additional information
   */
  private enhanceErrorContext(context: ErrorContext): ErrorContext {
    const enhanced: ErrorContext = {
      ...context,
      timestamp: new Date().toISOString(),
      url: context.url || (typeof window !== 'undefined' ? window.location.href : undefined),
      userAgent: context.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
    };

    // Add user information if available (from auth context)
    if (typeof window !== 'undefined' && (window as any).currentUser) {
      enhanced.userId = (window as any).currentUser.id;
    }

    // Add session information if available
    if (typeof window !== 'undefined' && (window as any).sessionId) {
      enhanced.sessionId = (window as any).sessionId;
    }

    // Add performance information
    if (typeof performance !== 'undefined') {
      enhanced.performanceNow = performance.now();
      enhanced.memoryUsage = (performance as any).memory ? {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit
      } : undefined;
    }

    return enhanced;
  }

  /**
   * Queue error for batch processing
   */
  private queueError(
    error: ApiError, 
    context: ErrorContext, 
    classification: ErrorClassification
  ): void {
    // Check queue size limit
    if (this.errorQueue.length >= this.config.maxQueueSize) {
      // Remove oldest error to make room
      this.errorQueue.shift();
    }

    this.errorQueue.push({
      error,
      context,
      classification,
      timestamp: new Date().toISOString(),
      processed: false
    });

    // Flush immediately if batch size reached
    if (this.errorQueue.length >= this.config.batchSize) {
      this.flushErrors();
    }
  }

  /**
   * Process a batch of errors
   */
  private async processErrorBatch(errors: QueuedError[]): Promise<void> {
    const logEntries: ErrorLogEntry[] = [];

    for (const queuedError of errors) {
      try {
        const logEntry = this.createLogEntry(queuedError.error, queuedError.context);
        logEntries.push(logEntry);
        
        // Mark as processed
        queuedError.processed = true;
      } catch (error) {
        console.error('Failed to create log entry:', error);
      }
    }

    if (logEntries.length === 0) return;

    // Add to error log
    this.errorLog.push(...logEntries);

    // Trim error log if it gets too large
    if (this.errorLog.length > this.config.maxLocalStorageEntries * 2) {
      this.errorLog = this.errorLog.slice(-this.config.maxLocalStorageEntries);
    }

    // Update analytics with new error log
    try {
      this.analytics.updateErrorLog(this.errorLog);
    } catch (error) {
      console.error('Failed to update analytics:', error);
    }

    // Update monitoring system with new error log
    try {
      errorMonitor.updateMetrics(this.errorLog);
    } catch (error) {
      console.error('Failed to update monitoring:', error);
    }

    // Check for alert conditions
    try {
      const triggeredAlerts = this.analytics.checkAlerts();
      if (triggeredAlerts.length > 0) {
        this.handleTriggeredAlerts(triggeredAlerts);
      }
    } catch (error) {
      console.error('Failed to check alerts:', error);
    }

    // Save to localStorage
    if (this.config.enableLocalStorage) {
      try {
        this.saveErrorLogToStorage();
      } catch (error) {
        console.error('Failed to save to localStorage:', error);
      }
    }

    // Send to external services
    try {
      await this.sendToExternalServices(logEntries);
    } catch (error) {
      console.error('Failed to send to external services:', error);
    }
  }

  /**
   * Create structured log entry
   */
  private createLogEntry(error: ApiError, context: ErrorContext): ErrorLogEntry {
    return {
      errorId: error.errorId,
      timestamp: error.timestamp,
      type: error.type,
      severity: error.severity,
      message: error.message,
      userMessage: error.userMessage,
      statusCode: error.statusCode,
      url: error.url || context.url || '',
      userAgent: error.userAgent || context.userAgent || '',
      userId: error.userId || context.userId,
      sessionId: error.sessionId || context.sessionId,
      context: {
        ...context,
        // Remove sensitive information
        userAgent: undefined,
        userId: undefined,
        sessionId: undefined
      },
      stackTrace: context.stackTrace,
      resolved: false,
      retryCount: context.retryCount || 0,
      component: context.component,
      feature: context.feature
    };
  }

  /**
   * Update error statistics
   */
  private updateStats(error: ApiError): void {
    this.stats.totalErrors++;
    this.stats.errorsByType[error.type] = (this.stats.errorsByType[error.type] || 0) + 1;
    this.stats.errorsBySeverity[error.severity] = (this.stats.errorsBySeverity[error.severity] || 0) + 1;
    this.stats.lastErrorTime = error.timestamp;

    // Calculate error rate (errors per minute over last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentErrors = this.errorLog.filter(entry => 
      new Date(entry.timestamp) > oneHourAgo
    );
    this.stats.errorRate = recentErrors.length / 60; // errors per minute

    // Update recent errors
    this.stats.recentErrors = this.getRecentErrors(10);
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      totalErrors: 0,
      errorsByType: {} as Record<ErrorType, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      recentErrors: [],
      errorRate: 0
    };
  }

  /**
   * Log error to console (development only)
   */
  private logToConsole(error: ApiError, context: ErrorContext): void {
    const logLevel = this.getConsoleLogLevel(error.severity);
    const logMessage = `[ErrorManager] ${error.type}: ${error.message}`;
    
    console[logLevel](logMessage, {
      errorId: error.errorId,
      severity: error.severity,
      userMessage: error.userMessage,
      context
    });
  }

  /**
   * Get appropriate console log level for error severity
   */
  private getConsoleLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'error';
    }
  }

  /**
   * Notify error listeners
   */
  private notifyListeners(error: ApiError, context: ErrorContext): void {
    this.listeners.forEach(listener => {
      try {
        listener(error, context);
      } catch (listenerError) {
        console.error('Error in error listener:', listenerError);
      }
    });
  }

  /**
   * Process critical errors immediately
   */
  private async processCriticalError(
    error: ApiError, 
    context: ErrorContext, 
    classification: ErrorClassification
  ): Promise<void> {
    // Create log entry immediately
    const logEntry = this.createLogEntry(error, context);
    
    // Send to external services immediately
    try {
      await this.sendToExternalServices([logEntry]);
    } catch (sendError) {
      console.error('Failed to send critical error to external services:', sendError);
    }
  }

  /**
   * Send errors to external services
   */
  private async sendToExternalServices(logEntries: ErrorLogEntry[]): Promise<void> {
    try {
      // Send batch to external error tracking services
      await this.externalTracking.reportErrorBatch(logEntries);
      
      if (this.config.enableConsoleLogging) {
        console.log(`[ErrorManager] Sent ${logEntries.length} errors to external services`);
      }
    } catch (error) {
      console.error('Failed to send errors to external services:', error);
    }
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flushErrors();
    }, this.config.flushInterval);
  }

  /**
   * Load error log from localStorage
   */
  private loadErrorLogFromStorage(): void {
    if (!this.config.enableLocalStorage || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(this.config.localStorageKey);
      if (stored) {
        const parsedLog = JSON.parse(stored);
        if (Array.isArray(parsedLog)) {
          this.errorLog = parsedLog.slice(-this.config.maxLocalStorageEntries);
          
          // Rebuild stats from loaded errors
          this.rebuildStatsFromLog();
        }
      }
    } catch (error) {
      console.error('Failed to load error log from localStorage:', error);
    }
  }

  /**
   * Save error log to localStorage
   */
  private saveErrorLogToStorage(): void {
    if (!this.config.enableLocalStorage || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const toSave = this.errorLog.slice(-this.config.maxLocalStorageEntries);
      localStorage.setItem(this.config.localStorageKey, JSON.stringify(toSave));
    } catch (error) {
      console.error('Failed to save error log to localStorage:', error);
    }
  }

  /**
   * Rebuild statistics from loaded error log
   */
  private rebuildStatsFromLog(): void {
    this.resetStats();
    
    for (const entry of this.errorLog) {
      this.stats.totalErrors++;
      this.stats.errorsByType[entry.type] = (this.stats.errorsByType[entry.type] || 0) + 1;
      this.stats.errorsBySeverity[entry.severity] = (this.stats.errorsBySeverity[entry.severity] || 0) + 1;
      
      if (!this.stats.lastErrorTime || entry.timestamp > this.stats.lastErrorTime) {
        this.stats.lastErrorTime = entry.timestamp;
      }
    }

    // Calculate error rate
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentErrors = this.errorLog.filter(entry => 
      new Date(entry.timestamp) > oneHourAgo
    );
    this.stats.errorRate = recentErrors.length / 60;
    
    this.stats.recentErrors = this.getRecentErrors(10);
  }

  /**
   * Handle triggered alerts
   */
  private handleTriggeredAlerts(alerts: any[]): void {
    for (const alert of alerts) {
      // Execute alert actions
      for (const action of alert.actions || []) {
        try {
          switch (action.type) {
            case 'console':
              console.warn(`[Alert] ${alert.alertName}: ${action.message || alert.condition.type}`);
              break;
            case 'notification':
              // Could integrate with browser notifications API
              if (typeof window !== 'undefined' && 'Notification' in window) {
                new Notification(`Error Alert: ${alert.alertName}`, {
                  body: action.message || `Alert condition met: ${alert.condition.type}`,
                  icon: '/favicon.ico'
                });
              }
              break;
            // Other action types can be implemented as needed
          }
        } catch (error) {
          console.error('Failed to execute alert action:', error);
        }
      }
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // Flush any remaining errors
    this.flushErrors(true);
    
    this.listeners.clear();
  }
}

// Export singleton instance
export const errorManager = ErrorManager.getInstance();

// Export factory function for custom configurations
export const createErrorManager = (config?: Partial<ErrorManagerConfig>) => 
  ErrorManager.getInstance(config);