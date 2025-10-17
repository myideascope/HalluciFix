/**
 * Error Recovery Strategy System
 * Implements recovery strategy mapping for different error types with automatic recovery attempts
 */

import { ApiError, ErrorType, ErrorSeverity, ErrorContext } from './types';
import { recoveryTracker } from './recoveryTracker';
import { RetryManager } from './retryManager';
import { networkMonitor } from './networkMonitor';

export interface RecoveryStrategy {
  canRecover: boolean;
  maxAttempts: number;
  strategy: (error: ApiError, context: ErrorContext, attempt: number) => Promise<RecoveryResult>;
  priority: number; // Higher number = higher priority
  conditions?: (error: ApiError, context: ErrorContext) => boolean;
  cooldownMs?: number; // Minimum time between recovery attempts
}

export interface RecoveryResult {
  success: boolean;
  message?: string;
  shouldRetry?: boolean;
  nextAttemptDelay?: number;
  escalate?: boolean;
  data?: any;
}

export interface RecoveryAttemptLog {
  errorId: string;
  strategyName: string;
  attempt: number;
  timestamp: number;
  success: boolean;
  duration: number;
  message?: string;
}

export interface RecoveryConfig {
  maxConcurrentRecoveries: number;
  globalCooldownMs: number;
  enableAutoRecovery: boolean;
  escalationThreshold: number;
  trackingEnabled: boolean;
}

/**
 * Error Recovery Strategy Manager
 * Manages and executes recovery strategies for different error types
 */
export class ErrorRecoveryManager {
  private strategies: Map<ErrorType, RecoveryStrategy[]> = new Map();
  private activeRecoveries: Map<string, Promise<RecoveryResult>> = new Map();
  private attemptLog: RecoveryAttemptLog[] = [];
  private lastAttempts: Map<string, number> = new Map();
  private config: RecoveryConfig;

  constructor(config: Partial<RecoveryConfig> = {}) {
    this.config = {
      maxConcurrentRecoveries: 5,
      globalCooldownMs: 1000,
      enableAutoRecovery: true,
      escalationThreshold: 3,
      trackingEnabled: true,
      ...config
    };

    this.initializeDefaultStrategies();
  }

  /**
   * Register a recovery strategy for an error type
   */
  registerStrategy(errorType: ErrorType, strategy: RecoveryStrategy): void {
    if (!this.strategies.has(errorType)) {
      this.strategies.set(errorType, []);
    }

    const strategies = this.strategies.get(errorType)!;
    strategies.push(strategy);
    
    // Sort by priority (highest first)
    strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Attempt recovery for an error
   */
  async attemptRecovery(
    error: ApiError, 
    context: ErrorContext = {},
    operation?: () => Promise<any>
  ): Promise<RecoveryResult> {
    if (!this.config.enableAutoRecovery) {
      return { success: false, message: 'Auto-recovery disabled' };
    }

    // Check if recovery is already in progress for this error
    if (this.activeRecoveries.has(error.errorId)) {
      return this.activeRecoveries.get(error.errorId)!;
    }

    // Check concurrent recovery limit
    if (this.activeRecoveries.size >= this.config.maxConcurrentRecoveries) {
      return { 
        success: false, 
        message: 'Maximum concurrent recoveries reached',
        shouldRetry: true,
        nextAttemptDelay: 5000
      };
    }

    // Check global cooldown
    const lastAttempt = this.lastAttempts.get(error.errorId);
    if (lastAttempt && Date.now() - lastAttempt < this.config.globalCooldownMs) {
      return {
        success: false,
        message: 'Recovery cooldown active',
        shouldRetry: true,
        nextAttemptDelay: this.config.globalCooldownMs - (Date.now() - lastAttempt)
      };
    }

    // Start recovery process
    const recoveryPromise = this.executeRecovery(error, context, operation);
    this.activeRecoveries.set(error.errorId, recoveryPromise);

    try {
      const result = await recoveryPromise;
      
      // Track recovery attempt if enabled
      if (this.config.trackingEnabled) {
        recoveryTracker.recordAttempt(
          error,
          'auto_recovery',
          result.success,
          false, // Not user initiated
          result.success ? Date.now() - parseInt(error.timestamp) : undefined
        );
      }

      return result;
    } finally {
      this.activeRecoveries.delete(error.errorId);
      this.lastAttempts.set(error.errorId, Date.now());
    }
  }

  /**
   * Get available recovery strategies for an error type
   */
  getStrategies(errorType: ErrorType): RecoveryStrategy[] {
    return this.strategies.get(errorType) || [];
  }

  /**
   * Get recovery success rate for an error type
   */
  getSuccessRate(errorType: ErrorType): number {
    const attempts = this.attemptLog.filter(log => 
      log.errorId.includes(errorType) // Simple matching, could be improved
    );
    
    if (attempts.length === 0) return 0;
    
    const successful = attempts.filter(log => log.success).length;
    return (successful / attempts.length) * 100;
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    totalAttempts: number;
    successfulAttempts: number;
    successRate: number;
    averageRecoveryTime: number;
    byErrorType: Record<ErrorType, { attempts: number; successes: number; rate: number }>;
  } {
    const totalAttempts = this.attemptLog.length;
    const successfulAttempts = this.attemptLog.filter(log => log.success).length;
    const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;
    
    const successfulLogs = this.attemptLog.filter(log => log.success);
    const averageRecoveryTime = successfulLogs.length > 0 
      ? successfulLogs.reduce((sum, log) => sum + log.duration, 0) / successfulLogs.length
      : 0;

    // Group by error type (simplified)
    const byErrorType: Record<ErrorType, { attempts: number; successes: number; rate: number }> = 
      {} as Record<ErrorType, { attempts: number; successes: number; rate: number }>;

    Object.values(ErrorType).forEach(type => {
      const typeAttempts = this.attemptLog.filter(log => log.errorId.includes(type));
      const typeSuccesses = typeAttempts.filter(log => log.success);
      
      byErrorType[type] = {
        attempts: typeAttempts.length,
        successes: typeSuccesses.length,
        rate: typeAttempts.length > 0 ? (typeSuccesses.length / typeAttempts.length) * 100 : 0
      };
    });

    return {
      totalAttempts,
      successfulAttempts,
      successRate,
      averageRecoveryTime,
      byErrorType
    };
  }

  /**
   * Clear recovery history
   */
  clearHistory(): void {
    this.attemptLog = [];
    this.lastAttempts.clear();
  }

  /**
   * Execute recovery for an error
   */
  private async executeRecovery(
    error: ApiError, 
    context: ErrorContext,
    operation?: () => Promise<any>
  ): Promise<RecoveryResult> {
    const strategies = this.getStrategies(error.type);
    
    if (strategies.length === 0) {
      return { 
        success: false, 
        message: `No recovery strategies available for ${error.type}` 
      };
    }

    // Try each strategy in priority order
    for (const strategy of strategies) {
      // Check if strategy can handle this error
      if (!strategy.canRecover) continue;
      
      // Check strategy conditions
      if (strategy.conditions && !strategy.conditions(error, context)) {
        continue;
      }

      // Check strategy cooldown
      if (strategy.cooldownMs) {
        const lastAttempt = this.lastAttempts.get(`${error.errorId}_${strategy.strategy.name}`);
        if (lastAttempt && Date.now() - lastAttempt < strategy.cooldownMs) {
          continue;
        }
      }

      // Attempt recovery with this strategy
      for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
        const startTime = Date.now();
        
        try {
          const result = await strategy.strategy(error, context, attempt);
          const duration = Date.now() - startTime;
          
          // Log the attempt
          this.logAttempt({
            errorId: error.errorId,
            strategyName: strategy.strategy.name || 'anonymous',
            attempt,
            timestamp: startTime,
            success: result.success,
            duration,
            message: result.message
          });

          if (result.success) {
            // If we have an operation to retry, try it
            if (operation) {
              try {
                await operation();
                return { ...result, success: true };
              } catch (retryError) {
                // Operation still fails, continue to next strategy
                continue;
              }
            }
            return result;
          }

          // If strategy says don't retry, break out of attempt loop
          if (result.shouldRetry === false) {
            break;
          }

          // Wait before next attempt if specified
          if (result.nextAttemptDelay && attempt < strategy.maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, result.nextAttemptDelay));
          }

        } catch (strategyError) {
          const duration = Date.now() - startTime;
          
          this.logAttempt({
            errorId: error.errorId,
            strategyName: strategy.strategy.name || 'anonymous',
            attempt,
            timestamp: startTime,
            success: false,
            duration,
            message: `Strategy failed: ${strategyError.message}`
          });

          // Continue to next attempt or strategy
        }
      }
    }

    return { 
      success: false, 
      message: 'All recovery strategies failed',
      escalate: true
    };
  }

  /**
   * Log recovery attempt
   */
  private logAttempt(log: RecoveryAttemptLog): void {
    this.attemptLog.push(log);
    
    // Keep only recent attempts (last 1000)
    if (this.attemptLog.length > 1000) {
      this.attemptLog = this.attemptLog.slice(-1000);
    }
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeDefaultStrategies(): void {
    // Import and register enhanced recovery strategies
    this.initializeEnhancedStrategies();
    // Network error recovery
    this.registerStrategy(ErrorType.NETWORK, {
      canRecover: true,
      maxAttempts: 3,
      priority: 100,
      cooldownMs: 2000,
      strategy: async (error, context, attempt) => {
        // Wait for network connectivity
        if (!navigator.onLine) {
          await networkMonitor.waitForConnection(30000); // 30 second timeout
        }
        
        if (navigator.onLine) {
          return { 
            success: true, 
            message: 'Network connectivity restored',
            nextAttemptDelay: attempt * 1000 // Exponential backoff
          };
        }
        
        return { 
          success: false, 
          message: 'Network still unavailable',
          shouldRetry: true,
          nextAttemptDelay: attempt * 2000
        };
      }
    });

    // Authentication error recovery
    this.registerStrategy(ErrorType.AUTHENTICATION, {
      canRecover: true,
      maxAttempts: 1,
      priority: 90,
      cooldownMs: 5000,
      strategy: async (error, context, attempt) => {
        try {
          // Attempt token refresh
          const authService = (window as any).authService;
          if (authService && typeof authService.refreshToken === 'function') {
            await authService.refreshToken();
            return { 
              success: true, 
              message: 'Authentication token refreshed' 
            };
          }
          
          return { 
            success: false, 
            message: 'No auth service available for token refresh',
            escalate: true
          };
        } catch (refreshError) {
          return { 
            success: false, 
            message: 'Token refresh failed',
            escalate: true
          };
        }
      }
    });

    // Rate limit error recovery
    this.registerStrategy(ErrorType.RATE_LIMIT, {
      canRecover: true,
      maxAttempts: 1,
      priority: 80,
      strategy: async (error, context, attempt) => {
        const retryAfter = error.retryAfter || 60000; // Default 60 seconds
        
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        
        return { 
          success: true, 
          message: `Waited ${retryAfter}ms for rate limit reset` 
        };
      }
    });

    // Server error recovery
    this.registerStrategy(ErrorType.SERVER, {
      canRecover: true,
      maxAttempts: 3,
      priority: 70,
      cooldownMs: 5000,
      conditions: (error) => error.statusCode !== 500, // Don't retry 500 errors
      strategy: async (error, context, attempt) => {
        // Exponential backoff for server errors
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return { 
          success: true, 
          message: `Waited ${delay}ms before retry`,
          nextAttemptDelay: delay
        };
      }
    });

    // Timeout error recovery
    this.registerStrategy(ErrorType.TIMEOUT, {
      canRecover: true,
      maxAttempts: 2,
      priority: 60,
      cooldownMs: 3000,
      strategy: async (error, context, attempt) => {
        // Simple retry with increasing timeout tolerance
        const delay = attempt * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return { 
          success: true, 
          message: `Retry after ${delay}ms delay` 
        };
      }
    });

    // Service unavailable recovery
    this.registerStrategy(ErrorType.SERVICE_UNAVAILABLE, {
      canRecover: true,
      maxAttempts: 2,
      priority: 50,
      cooldownMs: 10000,
      strategy: async (error, context, attempt) => {
        // Wait longer for service to become available
        const delay = attempt * 10000; // 10s, 20s
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return { 
          success: true, 
          message: `Service recovery attempt after ${delay}ms` 
        };
      }
    });
  }

  /**
   * Initialize enhanced recovery strategies
   */
  private async initializeEnhancedStrategies(): Promise<void> {
    try {
      // Dynamically import enhanced strategies to avoid circular dependencies
      const { enhancedRecoveryStrategies } = await import('./enhancedRecoveryStrategies');
      
      // Register enhanced strategies
      const authStrategy = new enhancedRecoveryStrategies.AuthenticationRecoveryStrategy();
      this.registerStrategy(ErrorType.AUTHENTICATION, authStrategy);
      this.registerStrategy(ErrorType.SESSION_EXPIRED, authStrategy);

      const networkStrategy = new enhancedRecoveryStrategies.NetworkRecoveryStrategy();
      this.registerStrategy(ErrorType.NETWORK, networkStrategy);
      this.registerStrategy(ErrorType.CONNECTIVITY, networkStrategy);
      this.registerStrategy(ErrorType.TIMEOUT, networkStrategy);

      const rateLimitStrategy = new enhancedRecoveryStrategies.RateLimitRecoveryStrategy();
      this.registerStrategy(ErrorType.RATE_LIMIT, rateLimitStrategy);

      const analysisStrategy = new enhancedRecoveryStrategies.AnalysisServiceRecoveryStrategy();
      this.registerStrategy(ErrorType.ANALYSIS_ERROR, analysisStrategy);

    } catch (error) {
      console.error('Failed to initialize enhanced recovery strategies:', error);
    }
  }
}

// Singleton instance
export const errorRecoveryManager = new ErrorRecoveryManager();

// React hook for using error recovery
export const useErrorRecovery = () => {
  return {
    attemptRecovery: errorRecoveryManager.attemptRecovery.bind(errorRecoveryManager),
    getStrategies: errorRecoveryManager.getStrategies.bind(errorRecoveryManager),
    getSuccessRate: errorRecoveryManager.getSuccessRate.bind(errorRecoveryManager),
    getRecoveryStats: errorRecoveryManager.getRecoveryStats.bind(errorRecoveryManager),
    clearHistory: errorRecoveryManager.clearHistory.bind(errorRecoveryManager)
  };
};

// Utility function to wrap operations with automatic recovery
export async function withAutoRecovery<T>(
  operation: () => Promise<T>,
  errorContext: ErrorContext = {}
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Classify the error
    const { ApiErrorClassifier } = await import('./classifier');
    const classification = ApiErrorClassifier.classify(error, errorContext);
    
    // Attempt recovery
    const recoveryResult = await errorRecoveryManager.attemptRecovery(
      classification.error,
      errorContext,
      operation
    );
    
    if (recoveryResult.success) {
      // Recovery succeeded, try operation again
      return await operation();
    }
    
    // Recovery failed, throw original error
    throw classification.error;
  }
}