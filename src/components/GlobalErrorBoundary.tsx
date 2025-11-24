import React, { ReactNode } from 'react';
import ErrorBoundary from './ErrorBoundary';
import { logger } from '../lib/logging';
interface GlobalErrorBoundaryProps {
  children: ReactNode;
}

const GlobalErrorBoundary: React.FC<GlobalErrorBoundaryProps> = ({ children }) => {
  const handleGlobalError = (error: Error) => {
    // Log critical errors for monitoring
    logger.error("Global Error Boundary - Critical Error", error);

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