import { useState, useCallback, useRef } from 'react';

import { logger } from '../lib/logging';
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  retryCount: number;
}

interface UseErrorBoundaryReturn {
  errorState: ErrorBoundaryState;
  throwError: (error: Error) => void;
  resetError: () => void;
  canRetry: boolean;
  retry: () => void;
}

const generateErrorId = (): string => {
  return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const useErrorBoundary = (maxRetries: number = 3): UseErrorBoundaryReturn => {
  const [errorState, setErrorState] = useState<ErrorBoundaryState>({
    hasError: false,
    error: null,
    errorId: null,
    retryCount: 0
  });

  const retryTimeoutRef = useRef<number | null>(null);

  const throwError = useCallback((error: Error) => {
    setErrorState({
      hasError: true,
      error,
      errorId: generateErrorId(),
      retryCount: 0
    });
  }, []);

  const resetError = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setErrorState({
      hasError: false,
      error: null,
      errorId: null,
      retryCount: 0
    });
  }, []);

  const retry = useCallback(() => {
    if (errorState.retryCount >= maxRetries) {
      logger.warn("Maximum retry attempts reached");
      return;
    }

    setErrorState(prev => ({
      ...prev,
      retryCount: prev.retryCount + 1
    }));

    // Reset error state after a short delay
    retryTimeoutRef.current = window.setTimeout(() => {
      resetError();
    }, 100);
  }, [errorState.retryCount, maxRetries, resetError]);

  const canRetry = errorState.retryCount < maxRetries;

  return {
    errorState,
    throwError,
    resetError,
    canRetry,
    retry
  };
};