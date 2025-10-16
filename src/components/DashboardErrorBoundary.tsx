import React, { ReactNode } from 'react';
import FeatureErrorBoundary from './FeatureErrorBoundary';
import { BarChart3, RefreshCw, TrendingUp } from 'lucide-react';

interface DashboardErrorBoundaryProps {
  children: ReactNode;
}

const DashboardErrorFallback: React.FC = () => (
  <div className="min-h-[300px] flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
    <div className="max-w-md w-full text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
        <BarChart3 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
      </div>
      
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        Dashboard Temporarily Unavailable
      </h3>
      
      <p className="text-slate-600 dark:text-slate-400 mb-4">
        We're having trouble loading your dashboard data. This is usually a temporary issue.
      </p>
      
      <div className="flex flex-col space-y-2">
        <button
          onClick={() => window.location.reload()}
          className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Dashboard</span>
        </button>
        
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Your data is safe and will be restored once the issue is resolved.
        </p>
      </div>
    </div>
  </div>
);

const DashboardErrorBoundary: React.FC<DashboardErrorBoundaryProps> = ({ children }) => {
  return (
    <FeatureErrorBoundary
      featureName="Dashboard"
      fallback={<DashboardErrorFallback />}
    >
      {children}
    </FeatureErrorBoundary>
  );
};

export default DashboardErrorBoundary;