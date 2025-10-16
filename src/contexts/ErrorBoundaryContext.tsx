import React, { createContext, useContext, ReactNode, useState, useCallback } from 'react';

interface ErrorInfo {
  errorId: string;
  message: string;
  timestamp: string;
  level: 'global' | 'feature' | 'component';
  feature?: string;
  resolved: boolean;
}

interface ErrorBoundaryContextType {
  errors: ErrorInfo[];
  addError: (error: Error, level: 'global' | 'feature' | 'component', feature?: string) => string;
  resolveError: (errorId: string) => void;
  clearErrors: () => void;
  getUnresolvedErrors: () => ErrorInfo[];
}

const ErrorBoundaryContext = createContext<ErrorBoundaryContextType | undefined>(undefined);

interface ErrorBoundaryProviderProps {
  children: ReactNode;
}

export const ErrorBoundaryProvider: React.FC<ErrorBoundaryProviderProps> = ({ children }) => {
  const [errors, setErrors] = useState<ErrorInfo[]>([]);

  const addError = useCallback((
    error: Error, 
    level: 'global' | 'feature' | 'component', 
    feature?: string
  ): string => {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const errorInfo: ErrorInfo = {
      errorId,
      message: error.message,
      timestamp: new Date().toISOString(),
      level,
      feature,
      resolved: false
    };

    setErrors(prev => [...prev, errorInfo]);
    
    // Log error for debugging
    console.error('Error added to context:', errorInfo);
    
    return errorId;
  }, []);

  const resolveError = useCallback((errorId: string) => {
    setErrors(prev => 
      prev.map(error => 
        error.errorId === errorId 
          ? { ...error, resolved: true }
          : error
      )
    );
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const getUnresolvedErrors = useCallback(() => {
    return errors.filter(error => !error.resolved);
  }, [errors]);

  const value: ErrorBoundaryContextType = {
    errors,
    addError,
    resolveError,
    clearErrors,
    getUnresolvedErrors
  };

  return (
    <ErrorBoundaryContext.Provider value={value}>
      {children}
    </ErrorBoundaryContext.Provider>
  );
};

export const useErrorBoundaryContext = (): ErrorBoundaryContextType => {
  const context = useContext(ErrorBoundaryContext);
  if (context === undefined) {
    throw new Error('useErrorBoundaryContext must be used within an ErrorBoundaryProvider');
  }
  return context;
};