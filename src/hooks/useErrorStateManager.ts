/**
 * Comprehensive Error State Manager Hook
 * Integrates error persistence, recovery tracking, and user preferences
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiError, ErrorAction } from '../lib/errors/types';
import { errorPersistenceService, PersistedError } from '../lib/errors/errorPersistence';
import { recoveryTracker } from '../lib/errors/recoveryTracker';
import { errorGuidanceService } from '../lib/errors/errorGuidance';

export interface ErrorStateManagerConfig {
  enablePersistence: boolean;
  enableRecoveryTracking: boolean;
  autoShowPersistedErrors: boolean;
  maxVisibleErrors: number;
  enableAnalytics: boolean;
}

export interface ManagedError extends PersistedError {
  guidance?: ReturnType<typeof errorGuidanceService.getGuidance>;
  recommendedActions?: Array<{
    action: string;
    successRate: number;
    confidence: number;
  }>;
  recoveryAttempts?: number;
  isRecovering?: boolean;
}

export const useErrorStateManager = (config: Partial<ErrorStateManagerConfig> = {}) => {
  const finalConfig: ErrorStateManagerConfig = {
    enablePersistence: true,
    enableRecoveryTracking: true,
    autoShowPersistedErrors: true,
    maxVisibleErrors: 5,
    enableAnalytics: true,
    ...config
  };

  const [managedErrors, setManagedErrors] = useState<ManagedError[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const recoveryTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Initialize error state manager
  useEffect(() => {
    if (finalConfig.autoShowPersistedErrors && finalConfig.enablePersistence) {
      loadPersistedErrors();
    }
    setIsInitialized(true);
  }, [finalConfig.autoShowPersistedErrors, finalConfig.enablePersistence]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      recoveryTimeouts.current.forEach(timeout => clearTimeout(timeout));
      recoveryTimeouts.current.clear();
    };
  }, []);

  const loadPersistedErrors = useCallback(() => {
    if (!finalConfig.enablePersistence) return;

    const persistedErrors = errorPersistenceService.getErrorsToShow();
    const enhancedErrors = persistedErrors.map(enhanceError);
    
    setManagedErrors(enhancedErrors.slice(0, finalConfig.maxVisibleErrors));
  }, [finalConfig.enablePersistence, finalConfig.maxVisibleErrors]);

  const enhanceError = useCallback((persistedError: PersistedError): ManagedError => {
    const enhanced: ManagedError = {
      ...persistedError,
      guidance: errorGuidanceService.getGuidance(persistedError.error),
      isRecovering: false
    };

    if (finalConfig.enableRecoveryTracking) {
      enhanced.recommendedActions = recoveryTracker.getRecommendedActions(persistedError.error.type);
    }

    return enhanced;
  }, [finalConfig.enableRecoveryTracking]);

  const addError = useCallback((
    error: ApiError,
    userPreferences: Partial<PersistedError['userPreferences']> = {}
  ): string => {
    // Persist error if enabled
    if (finalConfig.enablePersistence) {
      errorPersistenceService.persistError(error, userPreferences);
    }

    // Create managed error
    const persistedError: PersistedError = {
      error,
      timestamp: Date.now(),
      dismissed: false,
      recoveryAttempts: 0,
      userPreferences: {
        autoHide: error.severity !== 'critical',
        showAgain: true,
        ...userPreferences
      },
      sessionId: 'current',
      url: window.location.href
    };

    const managedError = enhanceError(persistedError);

    setManagedErrors(prev => {
      // Remove duplicate errors
      const filtered = prev.filter(e => e.error.errorId !== error.errorId);
      const newErrors = [...filtered, managedError];
      
      // Limit visible errors
      return newErrors
        .sort((a, b) => {
          // Sort by severity (critical first) then by timestamp
          const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          const severityDiff = severityOrder[a.error.severity] - severityOrder[b.error.severity];
          if (severityDiff !== 0) return severityDiff;
          return b.timestamp - a.timestamp;
        })
        .slice(0, finalConfig.maxVisibleErrors);
    });

    return error.errorId;
  }, [finalConfig.enablePersistence, finalConfig.maxVisibleErrors, enhanceError]);

  const dismissError = useCallback((errorId: string) => {
    // Update persistence
    if (finalConfig.enablePersistence) {
      errorPersistenceService.dismissError(errorId);
    }

    // Update local state
    setManagedErrors(prev => 
      prev.map(error => 
        error.error.errorId === errorId 
          ? { ...error, dismissed: true }
          : error
      )
    );

    // Remove from UI after animation
    setTimeout(() => {
      setManagedErrors(prev => prev.filter(e => e.error.errorId !== errorId));
    }, 300);

    // Clear any recovery timeouts
    const timeout = recoveryTimeouts.current.get(errorId);
    if (timeout) {
      clearTimeout(timeout);
      recoveryTimeouts.current.delete(errorId);
    }
  }, [finalConfig.enablePersistence]);

  const updateErrorPreferences = useCallback((
    errorId: string, 
    preferences: Partial<PersistedError['userPreferences']>
  ) => {
    if (finalConfig.enablePersistence) {
      errorPersistenceService.updateErrorPreferences(errorId, preferences);
    }

    setManagedErrors(prev =>
      prev.map(error =>
        error.error.errorId === errorId
          ? {
              ...error,
              userPreferences: { ...error.userPreferences, ...preferences }
            }
          : error
      )
    );
  }, [finalConfig.enablePersistence]);

  const attemptRecovery = useCallback(async (
    errorId: string,
    recoveryAction: string,
    recoveryFunction?: () => Promise<boolean>
  ): Promise<boolean> => {
    const managedError = managedErrors.find(e => e.error.errorId === errorId);
    if (!managedError) return false;

    // Mark as recovering
    setManagedErrors(prev =>
      prev.map(error =>
        error.error.errorId === errorId
          ? { ...error, isRecovering: true, recoveryAttempts: (error.recoveryAttempts || 0) + 1 }
          : error
      )
    );

    const startTime = Date.now();
    let successful = false;

    try {
      if (recoveryFunction) {
        successful = await recoveryFunction();
      } else {
        // Default recovery actions
        successful = await performDefaultRecovery(recoveryAction);
      }

      const recoveryTime = Date.now() - startTime;

      // Record recovery attempt
      if (finalConfig.enableRecoveryTracking) {
        recoveryTracker.recordAttempt(
          managedError.error,
          recoveryAction,
          successful,
          true,
          recoveryTime
        );
      }

      if (successful) {
        // Mark recovery in persistence
        if (finalConfig.enablePersistence) {
          errorPersistenceService.recordRecoveryAttempt(errorId, true);
        }

        // Remove error from UI
        dismissError(errorId);
      } else {
        // Mark recovery attempt in persistence
        if (finalConfig.enablePersistence) {
          errorPersistenceService.recordRecoveryAttempt(errorId, false);
        }

        // Update error state
        setManagedErrors(prev =>
          prev.map(error =>
            error.error.errorId === errorId
              ? { ...error, isRecovering: false }
              : error
          )
        );
      }

      return successful;
    } catch (error) {
      console.error('Recovery attempt failed:', error);
      
      // Record failed attempt
      if (finalConfig.enableRecoveryTracking) {
        recoveryTracker.recordAttempt(
          managedError.error,
          recoveryAction,
          false,
          true,
          Date.now() - startTime
        );
      }

      // Update error state
      setManagedErrors(prev =>
        prev.map(e =>
          e.error.errorId === errorId
            ? { ...e, isRecovering: false }
            : e
        )
      );

      return false;
    }
  }, [managedErrors, finalConfig.enableRecoveryTracking, finalConfig.enablePersistence, dismissError]);

  const scheduleAutoRecovery = useCallback((errorId: string, delay: number = 5000) => {
    const managedError = managedErrors.find(e => e.error.errorId === errorId);
    if (!managedError || !recoveryTracker.shouldAutoRetry(managedError.error)) {
      return;
    }

    const timeout = setTimeout(async () => {
      const recommendedActions = managedError.recommendedActions || [];
      const bestAction = recommendedActions[0];
      
      if (bestAction && bestAction.successRate > 50) {
        await attemptRecovery(errorId, bestAction.action);
      }
      
      recoveryTimeouts.current.delete(errorId);
    }, delay);

    recoveryTimeouts.current.set(errorId, timeout);
  }, [managedErrors, attemptRecovery]);

  const clearAllErrors = useCallback(() => {
    if (finalConfig.enablePersistence) {
      errorPersistenceService.clearSessionErrors();
    }

    // Clear all timeouts
    recoveryTimeouts.current.forEach(timeout => clearTimeout(timeout));
    recoveryTimeouts.current.clear();

    setManagedErrors([]);
  }, [finalConfig.enablePersistence]);

  const getErrorStats = useCallback(() => {
    if (!finalConfig.enableRecoveryTracking) {
      return null;
    }

    return recoveryTracker.getSuccessRateSummary();
  }, [finalConfig.enableRecoveryTracking]);

  const exportErrorData = useCallback(() => {
    const data: any = {
      managedErrors,
      isInitialized
    };

    if (finalConfig.enablePersistence) {
      data.persistenceData = errorPersistenceService.exportErrorData();
    }

    if (finalConfig.enableRecoveryTracking) {
      data.recoveryData = recoveryTracker.exportRecoveryData();
    }

    return data;
  }, [managedErrors, isInitialized, finalConfig.enablePersistence, finalConfig.enableRecoveryTracking]);

  // Helper function for default recovery actions
  const performDefaultRecovery = async (action: string): Promise<boolean> => {
    switch (action) {
      case 'refresh':
      case 'reload':
        window.location.reload();
        return true;
      
      case 'retry':
        // This would typically be handled by the calling component
        return false;
      
      case 'go_home':
        window.location.href = '/';
        return true;
      
      case 'login':
        window.location.href = '/auth/login';
        return true;
      
      case 'contact_support':
        // Open support contact
        return false;
      
      default:
        return false;
    }
  };

  return {
    // State
    managedErrors: managedErrors.filter(e => !e.dismissed),
    isInitialized,
    
    // Actions
    addError,
    dismissError,
    updateErrorPreferences,
    attemptRecovery,
    scheduleAutoRecovery,
    clearAllErrors,
    loadPersistedErrors,
    
    // Analytics
    getErrorStats,
    exportErrorData,
    
    // Configuration
    config: finalConfig
  };
};

// Default recovery actions for common error types
export const performDefaultRecoveryAction = async (
  error: ApiError,
  action: string
): Promise<boolean> => {
  switch (action) {
    case 'refresh_page':
      window.location.reload();
      return true;
    
    case 'clear_cache':
      // Clear localStorage and sessionStorage
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
      return true;
    
    case 'retry_request':
      // This should be handled by the calling component
      return false;
    
    case 'navigate_home':
      window.location.href = '/';
      return true;
    
    case 'sign_in':
      window.location.href = '/auth/login';
      return true;
    
    case 'contact_support':
      const subject = encodeURIComponent(`Error Report - ${error.errorId}`);
      const body = encodeURIComponent(
        `Error ID: ${error.errorId}\n` +
        `Error Type: ${error.type}\n` +
        `Message: ${error.message}\n` +
        `Timestamp: ${error.timestamp}`
      );
      window.open(`mailto:support@hallucifix.com?subject=${subject}&body=${body}`);
      return false;
    
    default:
      return false;
  }
};