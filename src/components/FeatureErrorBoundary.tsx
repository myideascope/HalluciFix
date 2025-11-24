import React, { ReactNode } from 'react';
import ErrorBoundary from './ErrorBoundary';
import { logger } from '../lib/logging';

interface FeatureErrorBoundaryProps {
  children: ReactNode;
  featureName: string;
  fallback?: ReactNode;
}

const FeatureErrorBoundary: React.FC<FeatureErrorBoundaryProps> = ({ 
  children, 
  featureName,
  fallback 
}) => {
  const handleFeatureError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Log feature-specific errors
    logger.error(`Feature Error Boundary - ${featureName}: ${error.message}`, error);

    // Track feature-specific error metrics
    // In a real application, you might want to track which features are failing most often
  };

  return (
    <ErrorBoundary
      level="feature"
      onError={handleFeatureError}
      resetOnPropsChange={true}
      fallback={fallback}
    >
      {children}
    </ErrorBoundary>
  );
};

export default FeatureErrorBoundary;