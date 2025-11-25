/**
 * Error Routing System
 * Routes errors to appropriate handlers based on classification and context
 */

import { 
  ApiError, 
  ErrorType, 
  ErrorSeverity, 
  ErrorContext,
  ErrorClassification 
} from './types';
import { errorManager } from './errorManager';
import { errorRecoveryManager } from './recoveryStrategy';
import { incidentManager } from './incidentManager';
import { externalErrorTracking } from './externalErrorTracking';

import { logger } from '../logging';
/**
 * Error handler interface
 */
export interface ErrorHandler {
  name: string;
  canHandle: (error: ApiError, context: ErrorContext) => boolean;
  priority: number; // Higher number = higher priority
  handle: (error: ApiError, context: ErrorContext, classification: ErrorClassification) => Promise<ErrorHandlingResult>;
}

/**
 * Error handling result
 */
export interface ErrorHandlingResult {
  handled: boolean;
  escalate?: boolean;
  retry?: boolean;
  message?: string;
  actions?: Array<{
    type: string;
    label: string;
    handler: () => void | Promise<void>;
  }>;
}

/**
 * Error routing configuration
 */
export interface ErrorRoutingConfig {
  enableAutoRecovery: boolean;
  enableIncidentManagement: boolean;
  enableExternalReporting: boolean;
  maxConcurrentHandlers: number;
  handlerTimeout: number; // milliseconds
  escalationThreshold: number; // number of failed handling attempts
}

/**
 * Error Router
 * Routes errors to appropriate handlers based on type, severity, and context
 */
export class ErrorRouter {
  private handlers: Map<string, ErrorHandler> = new Map();
  private handlingQueue: Array<{
    error: ApiError;
    context: ErrorContext;
    classification: ErrorClassification;
    timestamp: number;
  }> = [];
  private activeHandlers: Set<string> = new Set();
  private config: ErrorRoutingConfig;
  private handlingStats: Map<string, {
    attempts: number;
    successes: number;
    failures: number;
    averageTime: number;
  }> = new Map();

  constructor(config: Partial<ErrorRoutingConfig> = {}) {
    this.config = {
      enableAutoRecovery: true,
      enableIncidentManagement: true,
      enableExternalReporting: true,
      maxConcurrentHandlers: 10,
      handlerTimeout: 30000, // 30 seconds
      escalationThreshold: 3,
      ...config
    };

    this.initializeDefaultHandlers();
  }

  /**
   * Register an error handler
   */
  registerHandler(handler: ErrorHandler): void {
    this.handlers.set(handler.name, handler);
    
    // Initialize stats for this handler
    this.handlingStats.set(handler.name, {
      attempts: 0,
      successes: 0,
      failures: 0,
      averageTime: 0
    });
  }

  /**
   * Unregister an error handler
   */
  unregisterHandler(handlerName: string): void {
    this.handlers.delete(handlerName);
    this.handlingStats.delete(handlerName);
  }

  /**
   * Route an error to appropriate handlers
   */
  async routeError(
    error: ApiError, 
    context: ErrorContext, 
    classification: ErrorClassification
  ): Promise<ErrorHandlingResult[]> {
    // Add to queue if we're at capacity
    if (this.activeHandlers.size >= this.config.maxConcurrentHandlers) {
      this.handlingQueue.push({
        error,
        context,
        classification,
        timestamp: Date.now()
      });
      
      return [{
        handled: false,
        message: 'Error queued for processing - system at capacity'
      }];
    }

    // Find applicable handlers
    const applicableHandlers = this.getApplicableHandlers(error, context);
    
    if (applicableHandlers.length === 0) {
      return [{
        handled: false,
        escalate: true,
        message: 'No handlers available for this error type'
      }];
    }

    // Execute handlers in parallel (for independent handlers) or sequence (for dependent handlers)
    const results: ErrorHandlingResult[] = [];
    
    for (const handler of applicableHandlers) {
      try {
        const handlerId = `${handler.name}_${error.errorId}`;
        this.activeHandlers.add(handlerId);
        
        const startTime = Date.now();
        const timeoutPromise = new Promise<ErrorHandlingResult>((_, reject) => {
          setTimeout(() => reject(new Error('Handler timeout')), this.config.handlerTimeout);
        });
        
        const handlerPromise = handler.handle(error, context, classification);
        const result = await Promise.race([handlerPromise, timeoutPromise]);
        
        const duration = Date.now() - startTime;
        this.updateHandlerStats(handler.name, true, duration);
        
        results.push(result);
        
        // If handler succeeded and says not to escalate, we can stop here
        if (result.handled && !result.escalate) {
          break;
        }
        
      } catch (handlerError) {
        this.updateHandlerStats(handler.name, false, 0);
        
        console.error(`Error handler ${handler.name} failed:`, handlerError);
        
        results.push({
          handled: false,
          escalate: true,
          message: `Handler ${handler.name} failed: ${handlerError.message}`
        });
        
      } finally {
        const handlerId = `${handler.name}_${error.errorId}`;
        this.activeHandlers.delete(handlerId);
      }
    }

    // Process next item in queue if available
    this.processQueue();

    return results;
  }

  /**
   * Get applicable handlers for an error
   */
  private getApplicableHandlers(error: ApiError, context: ErrorContext): ErrorHandler[] {
    const handlers = Array.from(this.handlers.values())
      .filter(handler => handler.canHandle(error, context))
      .sort((a, b) => b.priority - a.priority); // Higher priority first

    return handlers;
  }

  /**
   * Update handler statistics
   */
  private updateHandlerStats(handlerName: string, success: boolean, duration: number): void {
    const stats = this.handlingStats.get(handlerName);
    if (!stats) return;

    stats.attempts++;
    
    if (success) {
      stats.successes++;
      // Update average time (exponential moving average)
      stats.averageTime = stats.averageTime === 0 
        ? duration 
        : (stats.averageTime * 0.8) + (duration * 0.2);
    } else {
      stats.failures++;
    }
  }

  /**
   * Process queued errors
   */
  private async processQueue(): Promise<void> {
    if (this.handlingQueue.length === 0 || 
        this.activeHandlers.size >= this.config.maxConcurrentHandlers) {
      return;
    }

    const queuedItem = this.handlingQueue.shift();
    if (!queuedItem) return;

    // Check if the queued error is still relevant (not too old)
    const age = Date.now() - queuedItem.timestamp;
    if (age > 300000) { // 5 minutes
      logger.warn("Dropping stale queued error:", { errorId: queuedItem.error.errorId });
      return;
    }

    // Route the queued error
    await this.routeError(
      queuedItem.error, 
      queuedItem.context, 
      queuedItem.classification
    );
  }

  /**
   * Get handler statistics
   */
  getHandlerStats(): Record<string, {
    attempts: number;
    successes: number;
    failures: number;
    successRate: number;
    averageTime: number;
  }> {
    const stats: Record<string, any> = {};
    
    for (const [name, handlerStats] of this.handlingStats) {
      stats[name] = {
        ...handlerStats,
        successRate: handlerStats.attempts > 0 
          ? (handlerStats.successes / handlerStats.attempts) * 100 
          : 0
      };
    }
    
    return stats;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    activeHandlers: number;
    maxConcurrentHandlers: number;
    oldestQueuedItem?: number;
  } {
    return {
      queueLength: this.handlingQueue.length,
      activeHandlers: this.activeHandlers.size,
      maxConcurrentHandlers: this.config.maxConcurrentHandlers,
      oldestQueuedItem: this.handlingQueue.length > 0 
        ? Date.now() - this.handlingQueue[0].timestamp 
        : undefined
    };
  }

  /**
   * Initialize default error handlers
   */
  private initializeDefaultHandlers(): void {
    // Recovery Handler - Attempts automatic recovery
    this.registerHandler({
      name: 'recovery',
      priority: 100,
      canHandle: (error, context) => {
        return this.config.enableAutoRecovery && 
               error.retryable && 
               error.severity !== ErrorSeverity.CRITICAL;
      },
      handle: async (error, context, classification) => {
        try {
          const recoveryResult = await errorRecoveryManager.attemptRecovery(error, context);
          
          return {
            handled: recoveryResult.success,
            retry: recoveryResult.shouldRetry,
            escalate: recoveryResult.escalate,
            message: recoveryResult.message
          };
        } catch (recoveryError) {
          return {
            handled: false,
            escalate: true,
            message: `Recovery failed: ${recoveryError.message}`
          };
        }
      }
    });

    // Incident Management Handler - Creates incidents for severe errors
    this.registerHandler({
      name: 'incident',
      priority: 90,
      canHandle: (error, context) => {
        return this.config.enableIncidentManagement && 
               (error.severity === ErrorSeverity.CRITICAL || 
                error.severity === ErrorSeverity.HIGH);
      },
      handle: async (error, context, classification) => {
        try {
          const incident = await incidentManager.createIncident({
            title: `${error.type}: ${error.message}`,
            description: error.userMessage,
            severity: error.severity === ErrorSeverity.CRITICAL ? 'critical' : 'high',
            errorId: error.errorId,
            context: {
              ...context,
              errorType: error.type,
              statusCode: error.statusCode
            }
          });

          return {
            handled: true,
            message: `Incident created: ${incident.id}`,
            actions: [{
              type: 'view_incident',
              label: 'View Incident',
              handler: () => {
                // Could open incident management UI
                console.log(`View incident: ${incident.id}`);
              }
            }]
          };
        } catch (incidentError) {
          return {
            handled: false,
            escalate: true,
            message: `Failed to create incident: ${incidentError.message}`
          };
        }
      }
    });

    // External Reporting Handler - Reports errors to external services
    this.registerHandler({
      name: 'external_reporting',
      priority: 80,
      canHandle: (error, context) => {
        return this.config.enableExternalReporting;
      },
      handle: async (error, context, classification) => {
        try {
          await externalErrorTracking.reportError(error, context);
          
          return {
            handled: true,
            message: 'Error reported to external tracking services'
          };
        } catch (reportingError) {
          return {
            handled: false,
            message: `External reporting failed: ${reportingError.message}`
          };
        }
      }
    });

    // User Notification Handler - Notifies users of errors
    this.registerHandler({
      name: 'user_notification',
      priority: 70,
      canHandle: (error, context) => {
        return error.severity !== ErrorSeverity.LOW;
      },
      handle: async (error, context, classification) => {
        try {
          // Use the toast system if available
          if (typeof window !== 'undefined' && (window as any).showToast) {
            const toastType = error.severity === ErrorSeverity.CRITICAL ? 'error' :
                            error.severity === ErrorSeverity.HIGH ? 'error' :
                            error.severity === ErrorSeverity.MEDIUM ? 'warning' : 'info';
            
            (window as any).showToast(error.userMessage, toastType);
          }

          return {
            handled: true,
            message: 'User notified of error',
            actions: classification.actions
          };
        } catch (notificationError) {
          return {
            handled: false,
            message: `User notification failed: ${notificationError.message}`
          };
        }
      }
    });

    // Logging Handler - Ensures all errors are logged
    this.registerHandler({
      name: 'logging',
      priority: 10, // Low priority, runs last
      canHandle: () => true, // Handles all errors
      handle: async (error, context, classification) => {
        try {
          // Ensure error is logged through error manager
          errorManager.reportError(error, context);
          
          return {
            handled: true,
            message: 'Error logged successfully'
          };
        } catch (loggingError) {
          // This is critical - if we can't log, something is very wrong
          logger.error("Critical: Failed to log error:", loggingError instanceof Error ? loggingError : new Error(String(loggingError)));
          
          return {
            handled: false,
            escalate: true,
            message: `Logging failed: ${loggingError.message}`
          };
        }
      }
    });
  }

  /**
   * Clear handler statistics
   */
  clearStats(): void {
    for (const stats of this.handlingStats.values()) {
      stats.attempts = 0;
      stats.successes = 0;
      stats.failures = 0;
      stats.averageTime = 0;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ErrorRoutingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): ErrorRoutingConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const errorRouter = new ErrorRouter();

// Export for testing and custom configurations
export const createErrorRouter = (config?: Partial<ErrorRoutingConfig>) => 
  new ErrorRouter(config);