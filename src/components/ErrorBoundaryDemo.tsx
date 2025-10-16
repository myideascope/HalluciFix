import React, { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import FeatureErrorBoundary from './FeatureErrorBoundary';
import AnalysisErrorBoundary from './AnalysisErrorBoundary';

// Demo component that can throw errors on demand
const ErrorProneComponent: React.FC<{ shouldThrow: boolean; errorType: string }> = ({ 
  shouldThrow, 
  errorType 
}) => {
  if (shouldThrow) {
    switch (errorType) {
      case 'network':
        throw new Error('Network connection failed');
      case 'validation':
        throw new Error('Validation failed: Invalid input data');
      case 'auth':
        throw new Error('Authentication token expired');
      default:
        throw new Error('Something went wrong');
    }
  }

  return (
    <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
      <div className="flex items-center space-x-2 text-green-700 dark:text-green-400">
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        <span className="font-medium">Component working normally</span>
      </div>
      <p className="text-sm text-green-600 dark:text-green-500 mt-1">
        No errors detected. All systems operational.
      </p>
    </div>
  );
};

const ErrorBoundaryDemo: React.FC = () => {
  const [errorStates, setErrorStates] = useState({
    basic: false,
    feature: false,
    analysis: false
  });

  const [errorTypes, setErrorTypes] = useState({
    basic: 'generic',
    feature: 'network',
    analysis: 'validation'
  });

  const toggleError = (boundary: keyof typeof errorStates) => {
    setErrorStates(prev => ({
      ...prev,
      [boundary]: !prev[boundary]
    }));
  };

  const setErrorType = (boundary: keyof typeof errorTypes, type: string) => {
    setErrorTypes(prev => ({
      ...prev,
      [boundary]: type
    }));
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Error Boundary Demo
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Demonstration of different error boundary implementations and their behavior
        </p>
      </div>

      {/* Basic Error Boundary Demo */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-blue-600" />
          <span>Basic Error Boundary</span>
        </h2>
        
        <div className="flex items-center space-x-4 mb-4">
          <button
            onClick={() => toggleError('basic')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              errorStates.basic
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {errorStates.basic ? 'Fix Error' : 'Trigger Error'}
          </button>
          
          <select
            value={errorTypes.basic}
            onChange={(e) => setErrorType('basic', e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          >
            <option value="generic">Generic Error</option>
            <option value="network">Network Error</option>
            <option value="validation">Validation Error</option>
            <option value="auth">Authentication Error</option>
          </select>
        </div>

        <ErrorBoundary level="component">
          <ErrorProneComponent 
            shouldThrow={errorStates.basic} 
            errorType={errorTypes.basic}
          />
        </ErrorBoundary>
      </div>

      {/* Feature Error Boundary Demo */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
          <span>Feature Error Boundary</span>
        </h2>
        
        <div className="flex items-center space-x-4 mb-4">
          <button
            onClick={() => toggleError('feature')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              errorStates.feature
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            }`}
          >
            {errorStates.feature ? 'Fix Error' : 'Trigger Error'}
          </button>
          
          <select
            value={errorTypes.feature}
            onChange={(e) => setErrorType('feature', e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          >
            <option value="network">Network Error</option>
            <option value="validation">Validation Error</option>
            <option value="auth">Authentication Error</option>
            <option value="generic">Generic Error</option>
          </select>
        </div>

        <FeatureErrorBoundary featureName="Demo Feature">
          <ErrorProneComponent 
            shouldThrow={errorStates.feature} 
            errorType={errorTypes.feature}
          />
        </FeatureErrorBoundary>
      </div>

      {/* Analysis Error Boundary Demo */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 text-purple-600" />
          <span>Analysis Error Boundary</span>
        </h2>
        
        <div className="flex items-center space-x-4 mb-4">
          <button
            onClick={() => toggleError('analysis')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              errorStates.analysis
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {errorStates.analysis ? 'Fix Error' : 'Trigger Error'}
          </button>
          
          <select
            value={errorTypes.analysis}
            onChange={(e) => setErrorType('analysis', e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          >
            <option value="validation">Validation Error</option>
            <option value="network">Network Error</option>
            <option value="auth">Authentication Error</option>
            <option value="generic">Generic Error</option>
          </select>
        </div>

        <AnalysisErrorBoundary>
          <ErrorProneComponent 
            shouldThrow={errorStates.analysis} 
            errorType={errorTypes.analysis}
          />
        </AnalysisErrorBoundary>
      </div>

      {/* Usage Instructions */}
      <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Usage Instructions
        </h3>
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <p>• Click "Trigger Error" to simulate different types of errors</p>
          <p>• Use the dropdown to select different error types</p>
          <p>• Notice how different error boundaries provide different fallback UIs</p>
          <p>• Try the "Try Again" button to see error recovery in action</p>
          <p>• Each error boundary tracks retry attempts and prevents infinite loops</p>
        </div>
      </div>
    </div>
  );
};

export default ErrorBoundaryDemo;