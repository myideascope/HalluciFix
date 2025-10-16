import React, { ReactNode } from 'react';
import FeatureErrorBoundary from './FeatureErrorBoundary';
import { Shield, RefreshCw, LogIn } from 'lucide-react';

interface AuthErrorBoundaryProps {
  children: ReactNode;
}

const AuthErrorFallback: React.FC = () => (
  <div className="min-h-[400px] flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
    <div className="max-w-md w-full text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
        <Shield className="w-8 h-8 text-red-600 dark:text-red-400" />
      </div>
      
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        Authentication Issue
      </h3>
      
      <p className="text-slate-600 dark:text-slate-400 mb-4">
        We're having trouble with the authentication system. This might affect your ability to sign in or access certain features.
      </p>
      
      <div className="flex flex-col space-y-3">
        <button
          onClick={() => window.location.reload()}
          className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
        
        <button
          onClick={() => window.location.href = '/'}
          className="flex items-center justify-center space-x-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <LogIn className="w-4 h-4" />
          <span>Go to Login</span>
        </button>
      </div>
      
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        If this problem persists, please contact support.
      </p>
    </div>
  </div>
);

const AuthErrorBoundary: React.FC<AuthErrorBoundaryProps> = ({ children }) => {
  return (
    <FeatureErrorBoundary
      featureName="Authentication"
      fallback={<AuthErrorFallback />}
    >
      {children}
    </FeatureErrorBoundary>
  );
};

export default AuthErrorBoundary;