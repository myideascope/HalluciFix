import React, { ReactNode } from 'react';
import FeatureErrorBoundary from './FeatureErrorBoundary';
import { FileText } from 'lucide-react';

interface AnalysisErrorBoundaryProps {
  children: ReactNode;
}

const AnalysisErrorFallback: React.FC = () => (
  <div className="min-h-[400px] flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
    <div className="max-w-md w-full text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
        <FileText className="w-8 h-8 text-orange-600 dark:text-orange-400" />
      </div>
      
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        Analysis Feature Unavailable
      </h3>
      
      <p className="text-slate-600 dark:text-slate-400 mb-4">
        The analysis feature is currently experiencing issues. This might be due to high server load or a temporary service disruption.
      </p>
      
      <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
        <p>• Try refreshing the page</p>
        <p>• Check your internet connection</p>
        <p>• Contact support if the issue persists</p>
      </div>
    </div>
  </div>
);

const AnalysisErrorBoundary: React.FC<AnalysisErrorBoundaryProps> = ({ children }) => {
  return (
    <FeatureErrorBoundary
      featureName="Analysis"
      fallback={<AnalysisErrorFallback />}
    >
      {children}
    </FeatureErrorBoundary>
  );
};

export default AnalysisErrorBoundary;