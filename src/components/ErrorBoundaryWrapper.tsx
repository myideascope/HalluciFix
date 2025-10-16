import React, { ReactNode } from 'react';
import ErrorBoundary from './ErrorBoundary';
import { useErrorBoundaryContext } from '../contexts/ErrorBoundaryContext';

interface ErrorBoundaryWrapperProps {
  children: ReactNode;
  level?: 'global' | 'feature' | 'component';
  featureName?: string;
  fallback?: ReactNode;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
}

const ErrorBoundaryWrapper: React.FC<ErrorBoundaryWrapperProps> = ({
  children,
  level = 'component',
  featureName,
  fallback,
  resetKeys,
  resetOnPropsChange
}) => {
  const { addError, resolveError } = useErrorBoundaryContext();

  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Add error to global context for tracking
    const errorId = addError(error, level, featureName);
    
    // Log detailed error information
    console.error(`Error Boundary (${level}${featureName ? ` - ${featureName}` : ''}):`, {
      errorId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      level,
      featureName
    });

    // In a production environment, you would send this to your error tracking service
    // Example: Sentry.captureException(error, { 
    //   tags: { level, feature: featureName },
    //   extra: { errorId, errorInfo }
    // });
  };

  return (
    <ErrorBoundary
      level={level}
      onError={handleError}
      fallback={fallback}
      resetKeys={resetKeys}
      resetOnPropsChange={resetOnPropsChange}
    >
      {children}
    </ErrorBoundary>
  );
};

export default ErrorBoundaryWrapper;