import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home, AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'global' | 'feature' | 'component';
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
}

const generateErrorId = (): string => {
  return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null;
  
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: generateErrorId()
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error details
    console.error('Error Boundary caught an error:', {
      error,
      errorInfo,
      level: this.props.level || 'component',
      errorId: this.state.errorId,
      retryCount: this.state.retryCount
    });
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;
    
    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (resetKeys?.some((key, idx) => prevProps.resetKeys?.[idx] !== key)) {
        this.resetErrorBoundary();
      }
    }
    
    if (hasError && resetOnPropsChange && prevProps.children !== this.props.children) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
    
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0
    });
  };

  handleRetry = () => {
    const newRetryCount = this.state.retryCount + 1;
    
    // Limit retry attempts
    if (newRetryCount > 3) {
      console.error('Max retry attempts exceeded', {
        originalError: this.state.error,
        retryCount: newRetryCount
      });
      return;
    }
    
    this.setState({ retryCount: newRetryCount });
    
    // Reset after a short delay to allow for cleanup
    this.resetTimeoutId = window.setTimeout(() => {
      this.resetErrorBoundary();
    }, 100);
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallbackUI
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          retryCount={this.state.retryCount}
          level={this.props.level}
          onRetry={this.handleRetry}
          onReset={this.resetErrorBoundary}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackUIProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
  level?: 'global' | 'feature' | 'component';
  onRetry: () => void;
  onReset: () => void;
}

const ErrorFallbackUI: React.FC<ErrorFallbackUIProps> = ({
  error,
  errorInfo,
  errorId,
  retryCount,
  level = 'component',
  onRetry,
  onReset
}) => {
  const getErrorSeverity = () => {
    if (level === 'global') return 'critical';
    if (level === 'feature') return 'high';
    return 'medium';
  };

  const getErrorMessage = () => {
    const severity = getErrorSeverity();
    
    switch (severity) {
      case 'critical':
        return {
          title: 'Something went wrong',
          message: 'We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.',
          icon: AlertTriangle,
          color: 'red'
        };
      case 'high':
        return {
          title: 'Feature temporarily unavailable',
          message: 'This feature is currently experiencing issues. Please try again or use an alternative approach.',
          icon: AlertCircle,
          color: 'orange'
        };
      default:
        return {
          title: 'Something went wrong',
          message: 'We encountered an issue loading this content. Please try again.',
          icon: RefreshCw,
          color: 'blue'
        };
    }
  };

  const errorMessage = getErrorMessage();
  const Icon = errorMessage.icon;
  const isDevelopment = import.meta.env.DEV;

  return (
    <div className={`min-h-[200px] flex items-center justify-center p-6 ${
      level === 'global' ? 'min-h-screen bg-slate-50 dark:bg-slate-900' : ''
    }`}>
      <div className="max-w-md w-full text-center">
        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
          errorMessage.color === 'red' ? 'bg-red-100 dark:bg-red-900/20' :
          errorMessage.color === 'orange' ? 'bg-orange-100 dark:bg-orange-900/20' : 'bg-blue-100 dark:bg-blue-900/20'
        }`}>
          <Icon className={`w-8 h-8 ${
            errorMessage.color === 'red' ? 'text-red-600 dark:text-red-400' :
            errorMessage.color === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'
          }`} />
        </div>
        
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          {errorMessage.title}
        </h2>
        
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          {errorMessage.message}
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onRetry}
            disabled={retryCount >= 3}
            className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              retryCount >= 3
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>{retryCount >= 3 ? 'Max retries reached' : 'Try Again'}</span>
          </button>
          
          {level === 'global' && (
            <button
              onClick={() => window.location.href = '/'}
              className="flex items-center justify-center space-x-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Go Home</span>
            </button>
          )}
        </div>
        
        {errorId && (
          <div className="mt-6 text-xs text-slate-500 dark:text-slate-400">
            Error ID: {errorId}
          </div>
        )}
        
        {isDevelopment && error && (
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">
              Error Details (Development)
            </summary>
            <pre className="mt-2 text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded overflow-auto max-h-40 text-slate-800 dark:text-slate-200">
              {error.toString()}
              {errorInfo?.componentStack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
};

export default ErrorBoundary;