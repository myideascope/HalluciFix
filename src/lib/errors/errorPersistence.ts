/**
 * Error State Persistence Service
 * Manages error state persistence across page reloads and navigation
 */

import { ApiError, ErrorSeverity } from './types';

import { logger } from './logging';
export interface PersistedError {
  error: ApiError;
  timestamp: number;
  dismissed: boolean;
  recoveryAttempts: number;
  lastRecoveryAttempt?: number;
  userPreferences: {
    autoHide: boolean;
    showAgain: boolean;
    reminderInterval?: number; // minutes
  };
  sessionId: string;
  url: string;
}

export interface ErrorRecoveryStats {
  errorId: string;
  totalAttempts: number;
  successfulRecoveries: number;
  lastSuccessfulRecovery?: number;
  averageRecoveryTime: number;
  commonRecoveryActions: string[];
}

export interface ErrorPersistenceConfig {
  maxStoredErrors: number;
  retentionPeriod: number; // milliseconds
  enableCrossSession: boolean;
  enableAnalytics: boolean;
}

class ErrorPersistenceService {
  private config: ErrorPersistenceConfig;
  private storageKey = 'hallucifix_error_state';
  private statsKey = 'hallucifix_error_stats';
  private sessionId: string;

  constructor(config: Partial<ErrorPersistenceConfig> = {}) {
    this.config = {
      maxStoredErrors: 50,
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      enableCrossSession: true,
      enableAnalytics: true,
      ...config
    };
    
    this.sessionId = this.generateSessionId();
    this.cleanupExpiredErrors();
  }

  /**
   * Persist an error to storage
   */
  persistError(error: ApiError, userPreferences: Partial<PersistedError['userPreferences']> = {}): void {
    const persistedError: PersistedError = {
      error,
      timestamp: Date.now(),
      dismissed: false,
      recoveryAttempts: 0,
      userPreferences: {
        autoHide: error.severity !== ErrorSeverity.CRITICAL,
        showAgain: true,
        ...userPreferences
      },
      sessionId: this.sessionId,
      url: window.location.href
    };

    const errors = this.getPersistedErrors();
    
    // Remove duplicate errors (same error ID)
    const filteredErrors = errors.filter(e => e.error.errorId !== error.errorId);
    
    // Add new error
    filteredErrors.push(persistedError);
    
    // Limit the number of stored errors
    const limitedErrors = filteredErrors
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.config.maxStoredErrors);

    this.saveErrors(limitedErrors);
  }

  /**
   * Get all persisted errors
   */
  getPersistedErrors(): PersistedError[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return [];
      
      const errors: PersistedError[] = JSON.parse(stored);
      return errors.filter(error => this.isErrorValid(error));
    } catch (error) {
      logger.error("Failed to load persisted errors:", error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Get errors for the current session
   */
  getCurrentSessionErrors(): PersistedError[] {
    return this.getPersistedErrors().filter(error => 
      error.sessionId === this.sessionId && !error.dismissed
    );
  }

  /**
   * Get errors that should be shown again
   */
  getErrorsToShow(): PersistedError[] {
    const now = Date.now();
    return this.getPersistedErrors().filter(error => {
      if (error.dismissed || !error.userPreferences.showAgain) {
        return false;
      }

      // Check if enough time has passed for reminder
      if (error.userPreferences.reminderInterval) {
        const reminderTime = error.timestamp + (error.userPreferences.reminderInterval * 60 * 1000);
        return now >= reminderTime;
      }

      // Show critical errors across sessions
      if (error.error.severity === ErrorSeverity.CRITICAL) {
        return true;
      }

      // Show high severity errors if cross-session is enabled
      if (this.config.enableCrossSession && error.error.severity === ErrorSeverity.HIGH) {
        return true;
      }

      // Only show current session errors for medium/low severity
      return error.sessionId === this.sessionId;
    });
  }

  /**
   * Mark an error as dismissed
   */
  dismissError(errorId: string): void {
    const errors = this.getPersistedErrors();
    const updatedErrors = errors.map(error => 
      error.error.errorId === errorId 
        ? { ...error, dismissed: true }
        : error
    );
    this.saveErrors(updatedErrors);
  }

  /**
   * Update user preferences for an error
   */
  updateErrorPreferences(errorId: string, preferences: Partial<PersistedError['userPreferences']>): void {
    const errors = this.getPersistedErrors();
    const updatedErrors = errors.map(error => 
      error.error.errorId === errorId 
        ? { 
            ...error, 
            userPreferences: { ...error.userPreferences, ...preferences }
          }
        : error
    );
    this.saveErrors(updatedErrors);
  }

  /**
   * Record a recovery attempt
   */
  recordRecoveryAttempt(errorId: string, successful: boolean = false): void {
    const errors = this.getPersistedErrors();
    const now = Date.now();
    
    const updatedErrors = errors.map(error => {
      if (error.error.errorId === errorId) {
        return {
          ...error,
          recoveryAttempts: error.recoveryAttempts + 1,
          lastRecoveryAttempt: now
        };
      }
      return error;
    });
    
    this.saveErrors(updatedErrors);

    // Update recovery statistics
    if (this.config.enableAnalytics) {
      this.updateRecoveryStats(errorId, successful, now);
    }
  }

  /**
   * Get recovery statistics for an error type
   */
  getRecoveryStats(errorType?: string): ErrorRecoveryStats[] {
    try {
      const stored = localStorage.getItem(this.statsKey);
      if (!stored) return [];
      
      const stats: ErrorRecoveryStats[] = JSON.parse(stored);
      
      if (errorType) {
        return stats.filter(stat => stat.errorId.includes(errorType));
      }
      
      return stats;
    } catch (error) {
      logger.error("Failed to load recovery stats:", error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Clear all persisted errors
   */
  clearAllErrors(): void {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Clear errors for current session
   */
  clearSessionErrors(): void {
    const errors = this.getPersistedErrors();
    const otherSessionErrors = errors.filter(error => error.sessionId !== this.sessionId);
    this.saveErrors(otherSessionErrors);
  }

  /**
   * Get error persistence summary
   */
  getPersistenceSummary(): {
    totalErrors: number;
    currentSessionErrors: number;
    dismissedErrors: number;
    criticalErrors: number;
    recoverySuccessRate: number;
  } {
    const errors = this.getPersistedErrors();
    const stats = this.getRecoveryStats();
    
    const totalRecoveries = stats.reduce((sum, stat) => sum + stat.totalAttempts, 0);
    const successfulRecoveries = stats.reduce((sum, stat) => sum + stat.successfulRecoveries, 0);
    
    return {
      totalErrors: errors.length,
      currentSessionErrors: errors.filter(e => e.sessionId === this.sessionId).length,
      dismissedErrors: errors.filter(e => e.dismissed).length,
      criticalErrors: errors.filter(e => e.error.severity === ErrorSeverity.CRITICAL).length,
      recoverySuccessRate: totalRecoveries > 0 ? (successfulRecoveries / totalRecoveries) * 100 : 0
    };
  }

  /**
   * Export error data for analysis
   */
  exportErrorData(): {
    errors: PersistedError[];
    stats: ErrorRecoveryStats[];
    summary: ReturnType<ErrorPersistenceService['getPersistenceSummary']>;
  } {
    return {
      errors: this.getPersistedErrors(),
      stats: this.getRecoveryStats(),
      summary: this.getPersistenceSummary()
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isErrorValid(error: PersistedError): boolean {
    const now = Date.now();
    const age = now - error.timestamp;
    
    // Remove errors older than retention period
    if (age > this.config.retentionPeriod) {
      return false;
    }

    // Validate error structure
    return !!(error.error && error.error.errorId && error.error.type);
  }

  private saveErrors(errors: PersistedError[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(errors));
    } catch (error) {
      logger.error("Failed to save persisted errors:", error instanceof Error ? error : new Error(String(error)));
      // If storage is full, try to clear old errors and retry
      this.cleanupExpiredErrors();
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(errors.slice(0, 10)));
      } catch (retryError) {
        logger.error("Failed to save errors after cleanup:", retryError instanceof Error ? retryError : new Error(String(retryError)));
      }
    }
  }

  private cleanupExpiredErrors(): void {
    const errors = this.getPersistedErrors();
    const validErrors = errors.filter(error => this.isErrorValid(error));
    
    if (validErrors.length !== errors.length) {
      this.saveErrors(validErrors);
    }
  }

  private updateRecoveryStats(errorId: string, successful: boolean, timestamp: number): void {
    try {
      const stored = localStorage.getItem(this.statsKey);
      const stats: ErrorRecoveryStats[] = stored ? JSON.parse(stored) : [];
      
      let errorStats = stats.find(stat => stat.errorId === errorId);
      
      if (!errorStats) {
        errorStats = {
          errorId,
          totalAttempts: 0,
          successfulRecoveries: 0,
          averageRecoveryTime: 0,
          commonRecoveryActions: []
        };
        stats.push(errorStats);
      }
      
      errorStats.totalAttempts++;
      
      if (successful) {
        errorStats.successfulRecoveries++;
        errorStats.lastSuccessfulRecovery = timestamp;
      }
      
      // Update average recovery time (simplified calculation)
      if (errorStats.lastSuccessfulRecovery && errorStats.successfulRecoveries > 0) {
        errorStats.averageRecoveryTime = 
          (errorStats.averageRecoveryTime + (timestamp - errorStats.lastSuccessfulRecovery)) / 2;
      }
      
      // Limit stats storage
      const limitedStats = stats
        .sort((a, b) => (b.lastSuccessfulRecovery || 0) - (a.lastSuccessfulRecovery || 0))
        .slice(0, 100);
      
      localStorage.setItem(this.statsKey, JSON.stringify(limitedStats));
    } catch (error) {
      logger.error("Failed to update recovery stats:", error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// Singleton instance
export const errorPersistenceService = new ErrorPersistenceService();

// React hook for using error persistence
export const useErrorPersistence = () => {
  return {
    persistError: errorPersistenceService.persistError.bind(errorPersistenceService),
    getPersistedErrors: errorPersistenceService.getPersistedErrors.bind(errorPersistenceService),
    getCurrentSessionErrors: errorPersistenceService.getCurrentSessionErrors.bind(errorPersistenceService),
    getErrorsToShow: errorPersistenceService.getErrorsToShow.bind(errorPersistenceService),
    dismissError: errorPersistenceService.dismissError.bind(errorPersistenceService),
    updateErrorPreferences: errorPersistenceService.updateErrorPreferences.bind(errorPersistenceService),
    recordRecoveryAttempt: errorPersistenceService.recordRecoveryAttempt.bind(errorPersistenceService),
    getRecoveryStats: errorPersistenceService.getRecoveryStats.bind(errorPersistenceService),
    clearAllErrors: errorPersistenceService.clearAllErrors.bind(errorPersistenceService),
    clearSessionErrors: errorPersistenceService.clearSessionErrors.bind(errorPersistenceService),
    getPersistenceSummary: errorPersistenceService.getPersistenceSummary.bind(errorPersistenceService),
    exportErrorData: errorPersistenceService.exportErrorData.bind(errorPersistenceService)
  };
};