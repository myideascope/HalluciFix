/**
 * Error State Manager Hook
 * Provides component-level error state management and recovery capabilities
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useErrorBoundary } from '../components/ErrorBoundaryWrapper';
import { recoveryTracker } from '../lib/errors';
import { ApiError, ErrorType, ErrorSeverity } from '../lib/errors/types';

import { logger } from './logging';
export interface ComponentErrorState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  retryCount: number;
  lastErrorTime: number;
  isRecovering: boolean;
  canRetry: boolean;
}

export interface ErrorStateConfig {
  componentId: string;
  maxRetries?: number;
  retryDelay?: number;
  autoRecovery?: boolean;
  persistState?: boolean;
  onError?: (error: Error) => void;
  onRecovery?: (successful: boolean) => void;
}

export interface ErrorStateActions {
  setError: (error: Error) => void;
  clearError: () => void;
  retry: () => Promise<boolean>;
  reset: () => void;
  canRetry: () => boolean;
  getRetryDelay: () => number;
}

/**
 * Hook for managing component-level error state with recovery capabilities
 */
export const useErrorStateManager = (config: ErrorStateConfig): [ComponentErrorState, ErrorStateActions] => {
  const {
    componentId,
    maxRetries = 3,
    retryDelay = 1000,
    autoRecovery = false,
    persistState = false,
    onError,
    onRecovery
  } = config;

  const errorBoundary = useErrorBoundary();
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const stateKey = `error_state_${componentId}`;

  // Initialize state
  const [errorState, setErrorState] = useState<ComponentErrorState>(() => {
    const initialState: ComponentErrorState = {
      hasError: false,
      error: null,
      errorId: null,
      retryCount: 0,
      lastErrorTime: 0,
      isRecovering: false,
      canRetry: true
    };

    // Load persisted state if enabled
    if (persistState && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(stateKey);
        if (stored) {
          const parsedState = JSON.parse(stored);
          return { ...initialState, ...parsedState, error: null }; // Don't persist actual error objects
        }
      } catch (error) {
        logger.error("Failed to load persisted error state:", error instanceof Error ? error : new Error(String(error)));
      }
    }

    return initialState;
  });

  // Register component with error boundary
  useEffect(() => {
    const resetCallback = () => {
      setErrorState(prev => ({
        ...prev,
        hasError: false,
        error: null,
        errorId: null,
        isRecovering: false
      }));
    };

    errorBoundary.registerComponent(componentId, resetCallback);

    return () => {
      errorBoundary.unregisterComponent(componentId);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [componentId, errorBoundary]);

  // Persist state when it changes
  useEffect(() => {
    if (persistState && typeof localStorage !== 'undefined') {
      try {
        const stateToPersist = {
          hasError: errorState.hasError,
          errorId: errorState.errorId,
          retryCount: errorState.retryCount,
          lastErrorTime: errorState.lastErrorTime,
          canRetry: errorState.canRetry
        };
        localStorage.setItem(stateKey, JSON.stringify(stateToPersist));
      } catch (error) {
        logger.error("Failed to persist error state:", error instanceof Error ? error : new Error(String(error)));
      }
    }
  }, [errorState, persistState, stateKey]);

  // Generate error ID
  const generateErrorId = useCallback((): string => {
    return `${componentId}_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, [componentId]);

  // Set error state
  const setError = useCallback((error: Error) => {
    const errorId = generateErrorId();
    const now = Date.now();

    setErrorState(prev => ({
      ...prev,
      hasError: true,
      error,
      errorId,
      lastErrorTime: now,
      isRecovering: false,
      canRetry: prev.retryCount < maxRetries
    }));

    // Create API error for tracking
    const apiError: ApiError = {
      type: ErrorType.CLIENT,
      severity: ErrorSeverity.MEDIUM,
      errorId,
      timestamp: new Date(now).toISOString(),
      message: error.message,
      userMessage: `Error in component ${componentId}: ${error.message}`,
      retryable: true,
      context: {
        component: componentId,
        retryCount: errorState.retryCount
      }
    };

    // Track error
    recoveryTracker.recordAttempt(
      apiError,
      'component_error',
      false,
      false
    );

    // Call error callback
    if (onError) {
      onError(error);
    }

    // Attempt auto-recovery if enabled
    if (autoRecovery && errorState.retryCount < maxRetries) {
      const delay = getRetryDelay(errorState.retryCount);
      retryTimeoutRef.current = setTimeout(() => {
        retry();
      }, delay);
    }
  }, [componentId, maxRetries, autoRecovery, onError, errorState.retryCount]);

  // Clear error state
  const clearError = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    setErrorState(prev => ({
      ...prev,
      hasError: false,
      error: null,
      errorId: null,
      isRecovering: false
    }));

    // Clear persisted state
    if (persistState && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(stateKey);
      } catch (error) {
        logger.error("Failed to clear persisted error state:", error instanceof Error ? error : new Error(String(error)));
      }
    }
  }, [persistState, stateKey]);

  // Calculate retry delay with exponential backoff
  const getRetryDelay = useCallback((retryCount: number = errorState.retryCount): number => {
    return Math.min(retryDelay * Math.pow(2, retryCount), 30000); // Max 30 seconds
  }, [retryDelay, errorState.retryCount]);

  // Check if retry is allowed
  const canRetryCheck = useCallback((): boolean => {
    return errorState.retryCount < maxRetries && !errorState.isRecovering;
  }, [errorState.retryCount, errorState.isRecovering, maxRetries]);

  // Retry operation
  const retry = useCallback(async (): Promise<boolean> => {
    if (!canRetryCheck()) {
      return false;
    }

    setErrorState(prev => ({
      ...prev,
      isRecovering: true,
      retryCount: prev.retryCount + 1
    }));

    try {
      // Create API error for tracking retry
      if (errorState.error && errorState.errorId) {
        const apiError: ApiError = {
          type: ErrorType.CLIENT,
          severity: ErrorSeverity.MEDIUM,
          errorId: errorState.errorId,
          timestamp: new Date().toISOString(),
          message: errorState.error.message,
          userMessage: `Retry attempt for component ${componentId}`,
          retryable: true,
          context: {
            component: componentId,
            retryCount: errorState.retryCount + 1
          }
        };

        // Record retry attempt
        recoveryTracker.recordAttempt(
          apiError,
          'component_retry',
          false,
          true // User initiated
        );
      }

      // Simulate recovery delay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clear error state on successful retry
      setErrorState(prev => ({
        ...prev,
        hasError: false,
        error: null,
        errorId: null,
        isRecovering: false,
        canRetry: true
      }));

      // Mark recovery as successful
      if (errorState.error && errorState.errorId) {
        const apiError: ApiError = {
          type: ErrorType.CLIENT,
          severity: ErrorSeverity.MEDIUM,
          errorId: errorState.errorId,
          timestamp: new Date().toISOString(),
          message: errorState.error.message,
          userMessage: `Successful recovery for component ${componentId}`,
          retryable: true,
          context: {
            component: componentId,
            retryCount: errorState.retryCount + 1
          }
        };

        recoveryTracker.recordAttempt(
          apiError,
          'component_retry',
          true,
          true
        );
      }

      if (onRecovery) {
        onRecovery(true);
      }

      return true;
    } catch (retryError) {
      console.error(`Retry failed for component ${componentId}:`, retryError);

      setErrorState(prev => ({
        ...prev,
        isRecovering: false,
        canRetry: prev.retryCount < maxRetries
      }));

      if (onRecovery) {
        onRecovery(false);
      }

      return false;
    }
  }, [componentId, maxRetries, errorState, onRecovery, canRetryCheck]);

  // Reset component state
  const reset = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    setErrorState({
      hasError: false,
      error: null,
      errorId: null,
      retryCount: 0,
      lastErrorTime: 0,
      isRecovering: false,
      canRetry: true
    });

    // Clear persisted state
    if (persistState && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(stateKey);
      } catch (error) {
        logger.error("Failed to clear persisted error state:", error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Reset component in error boundary
    errorBoundary.resetComponent(componentId);
  }, [componentId, errorBoundary, persistState, stateKey]);

  const actions: ErrorStateActions = {
    setError,
    clearError,
    retry,
    reset,
    canRetry: canRetryCheck,
    getRetryDelay
  };

  return [errorState, actions];
};

/**
 * Hook for wrapping async operations with error handling
 */
export const useAsyncErrorHandler = (config: ErrorStateConfig) => {
  const [errorState, actions] = useErrorStateManager(config);

  const executeWithErrorHandling = useCallback(async <T>(
    operation: () => Promise<T>,
    options?: {
      retryOnFailure?: boolean;
      maxRetries?: number;
    }
  ): Promise<T | null> => {
    const { retryOnFailure = false, maxRetries: operationMaxRetries } = options || {};

    try {
      actions.clearError();
      const result = await operation();
      return result;
    } catch (error) {
      actions.setError(error as Error);

      // Auto-retry if enabled
      if (retryOnFailure && actions.canRetry()) {
        const retryCount = operationMaxRetries || config.maxRetries || 3;
        
        for (let attempt = 1; attempt <= retryCount; attempt++) {
          try {
            await new Promise(resolve => setTimeout(resolve, actions.getRetryDelay()));
            const result = await operation();
            actions.clearError();
            return result;
          } catch (retryError) {
            if (attempt === retryCount) {
              actions.setError(retryError as Error);
            }
          }
        }
      }

      return null;
    }
  }, [actions, config.maxRetries]);

  return {
    errorState,
    actions,
    executeWithErrorHandling
  };
};

/**
 * Hook for component lifecycle error handling
 */
export const useComponentErrorRecovery = (componentId: string) => {
  const errorBoundary = useErrorBoundary();
  const [isRecovering, setIsRecovering] = useState(false);

  const recoverComponent = useCallback(async () => {
    setIsRecovering(true);
    
    try {
      // Reset component state
      errorBoundary.resetComponent(componentId);
      
      // Wait for component to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setIsRecovering(false);
      return true;
    } catch (error) {
      console.error(`Failed to recover component ${componentId}:`, error);
      setIsRecovering(false);
      return false;
    }
  }, [componentId, errorBoundary]);

  const getComponentErrorState = useCallback(() => {
    return errorBoundary.getErrorState(componentId);
  }, [componentId, errorBoundary]);

  return {
    isRecovering,
    recoverComponent,
    getComponentErrorState,
    resetAllComponents: errorBoundary.resetAllComponents
  };
};