import React, { ReactNode } from 'react';
import ErrorBoundary from './ErrorBoundary';

interface GlobalErrorBoundaryProps {
  children: ReactNode;
}

const GlobalErrorBoundary: React.FC<GlobalErrorBoundaryProps> = ({ children }) => {
  const handleGlobalError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Log critical errors for monitoring
    console.error('Global Error Boundary - Critical Error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    });

    // In a real application, you would send this to your error tracking service
    // Example: Sentry.captureException(error, { extra: errorInfo });
  };

  return (
    <ErrorBoundary
      level="global"
      onError={handleGlobalError}
      resetOnPropsChange={true}
    >
      {children}
    </ErrorBoundary>
  );
};

export default GlobalErrorBoundary;