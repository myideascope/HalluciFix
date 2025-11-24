/**
 * Enhanced Error Boundary Wrapper with Component State Reset and Recovery
 * Provides comprehensive error boundary functionality with automatic recovery mechanisms
 */

import React, { Component, ReactNode, ErrorInfo, createContext, useContext } from 'react';
import { AlertTriangle, RefreshCw, Home, AlertCircle, RotateCcw } from 'lucide-react';
import { errorRecoveryManager, recoveryTracker } from '../lib/errors';
import { ApiError, ErrorType, ErrorSeverity, ErrorContext } from '../lib/errors/types';

import { logger } from '../lib/logging';
// Context for error boundary state management
interface ErrorBoundaryContextValue {
  resetComponent: (componentId?: string) => void;
  resetAllComponents: () => void;
  getErrorState: (componentId?: string) => ComponentErrorState | null;
  registerComponent: (componentId: string, resetCallback: () => void) => void;
  unregisterComponent: (componentId: string) => void;
}

const ErrorBoundaryContext = createContext<ErrorBoundaryContextValue | null>(null);

export const useErrorBoundary = () => {
  const context = useContext(ErrorBoundaryContext);
  if (!context) {
    throw new Error('useErrorBoundary must be used within an ErrorBoundaryWrapper');
  }
  return context;
};

// Component error state tracking
interface ComponentErrorState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
  lastErrorTime: number;
  recoveryAttempts: number;
  componentId?: string;
}

// Enhanced error boundary props
interface ErrorBoundaryWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo, componentId?: string) => void;
  level?: 'global' | 'feature' | 'component';
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
  componentId?: string;
  enableAutoRecovery?: boolean;
  maxRetryAttempts?: number;
  recoveryDelay?: number;
  isolateErrors?: boolean;
  persistState?: boolean;
}

interface ErrorBoundaryWrapperState extends ComponentErrorState {
  registeredComponents: Map<string, () => void>;
  componentStates: Map<string, ComponentErrorState>;
  recoveryInProgress: boolean;
}

const generateErrorId = (): string => {
  return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Enhanced Error Boundary with Component State Reset and Recovery
 */
export class ErrorBoundaryWrapper extends Component<ErrorBoundaryWrapperProps, ErrorBoundaryWrapperState> {
  private resetTimeoutId: number | null = null;
  private recoveryTimeoutId: number | null = null;
  private stateKey: string;

  constructor(props: ErrorBoundaryWrapperProps) {
    super(props);
    
    this.stateKey = `error_boundary_${props.componentId || 'default'}_state`;
    
    const initialState: ErrorBoundaryWrapperState = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      lastErrorTime: 0,
      recoveryAttempts: 0,
      componentId: props.componentId,
      registeredComponents: new Map(),
      componentStates: new Map(),
      recoveryInProgress: false
    };

    // Load persisted state if enabled
    if (props.persistState) {
      const persistedState = this.loadPersistedState();
      if (persistedState) {
        this.state = { ...initialState, ...persistedState };
      } else {
        this.state = initialState;
      }
    } else {
      this.state = initialState;
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryWrapperState> {
    return {
      hasError: true,
      error,
      errorId: generateErrorId(),
      lastErrorTime: Date.now()
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ 
      errorInfo,
      recoveryInProgress: false
    });
    
    // Create error context
    const errorContext: ErrorContext = {
      component: this.props.componentId || 'unknown',
      level: this.props.level || 'component',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      retryCount: this.state.retryCount,
      recoveryAttempts: this.state.recoveryAttempts
    };

    // Log error with error manager
    const apiError: ApiError = {
      type: ErrorType.CLIENT,
      severity: this.getErrorSeverity(),
      errorId: this.state.errorId || generateErrorId(),
      timestamp: new Date().toISOString(),
      message: error.message,
      userMessage: this.getUserFriendlyMessage(error),
      retryable: true,
      context: errorContext
    };

    // Report to error manager
    if (typeof window !== 'undefined' && (window as any).errorManager) {
      (window as any).errorManager.handleError(error, errorContext);
    }

    // Track recovery attempt
    recoveryTracker.recordAttempt(
      apiError,
      'component_error_boundary',
      false,
      false
    );
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo, this.props.componentId);
    }

    // Persist state if enabled
    if (this.props.persistState) {
      this.persistState();
    }

    // Attempt automatic recovery if enabled
    if (this.props.enableAutoRecovery && this.shouldAttemptAutoRecovery()) {
      this.attemptAutoRecovery(apiError, errorContext);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryWrapperProps) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;
    
    // Reset on key changes
    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (resetKeys?.some((key, idx) => prevProps.resetKeys?.[idx] !== key)) {
        this.resetErrorBoundary();
      }
    }
    
    // Reset on props change
    if (hasError && resetOnPropsChange && prevProps.children !== this.props.children) {
      this.resetErrorBoundary();
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
    if (this.recoveryTimeoutId) {
      clearTimeout(this.recoveryTimeoutId);
    }
  }

  /**
   * Reset the error boundary state
   */
  resetErrorBoundary = (componentId?: string) => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
    if (this.recoveryTimeoutId) {
      clearTimeout(this.recoveryTimeoutId);
    }

    if (componentId) {
      // Reset specific component
      const componentStates = new Map(this.state.componentStates);
      componentStates.delete(componentId);
      
      // Call component reset callback
      const resetCallback = this.state.registeredComponents.get(componentId);
      if (resetCallback) {
        resetCallback();
      }
      
      this.setState({ componentStates });
    } else {
      // Reset entire boundary
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
        retryCount: 0,
        recoveryAttempts: 0,
        recoveryInProgress: false
      });

      // Clear persisted state
      if (this.props.persistState) {
        this.clearPersistedState();
      }
    }
  };

  /**
   * Reset all registered components
   */
  resetAllComponents = () => {
    this.state.registeredComponents.forEach((resetCallback, componentId) => {
      try {
        resetCallback();
      } catch (error) {
        logger.error(`Failed to reset component ${componentId}`, error instanceof Error ? error : new Error(String(error)));
      }
    });

    this.setState({
      componentStates: new Map(),
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      recoveryAttempts: 0,
      recoveryInProgress: false
    });

    if (this.props.persistState) {
      this.clearPersistedState();
    }
  };

  /**
   * Register a component for state management
   */
  registerComponent = (componentId: string, resetCallback: () => void) => {
    this.setState(prevState => ({
      registeredComponents: new Map(prevState.registeredComponents).set(componentId, resetCallback)
    }));
  };

  /**
   * Unregister a component
   */
  unregisterComponent = (componentId: string) => {
    this.setState(prevState => {
      const registeredComponents = new Map(prevState.registeredComponents);
      const componentStates = new Map(prevState.componentStates);
      
      registeredComponents.delete(componentId);
      componentStates.delete(componentId);
      
      return { registeredComponents, componentStates };
    });
  };

  /**
   * Get error state for a component
   */
  getErrorState = (componentId?: string): ComponentErrorState | null => {
    if (componentId) {
      return this.state.componentStates.get(componentId) || null;
    }
    return {
      hasError: this.state.hasError,
      error: this.state.error,
      errorInfo: this.state.errorInfo,
      errorId: this.state.errorId,
      retryCount: this.state.retryCount,
      lastErrorTime: this.state.lastErrorTime,
      recoveryAttempts: this.state.recoveryAttempts,
      componentId: this.state.componentId
    };
  };

  /**
   * Handle retry with enhanced logic
   */
  handleRetry = () => {
    const newRetryCount = this.state.retryCount + 1;
    const maxAttempts = this.props.maxRetryAttempts || 3;
    
    // Check retry limit
    if (newRetryCount > maxAttempts) {
      logger.error("Max retry attempts exceeded", {
        originalError: this.state.error,
        retryCount: newRetryCount,
        componentId: this.props.componentId
      } instanceof Error ? {
        originalError: this.state.error,
        retryCount: newRetryCount,
        componentId: this.props.componentId
      } : new Error(String({
        originalError: this.state.error,
        retryCount: newRetryCount,
        componentId: this.props.componentId
      })));
      return;
    }
    
    this.setState({ 
      retryCount: newRetryCount,
      recoveryInProgress: true
    });
    
    // Track retry attempt
    if (this.state.error) {
      const apiError: ApiError = {
        type: ErrorType.CLIENT,
        severity: this.getErrorSeverity(),
        errorId: this.state.errorId || generateErrorId(),
        timestamp: new Date().toISOString(),
        message: this.state.error.message,
        userMessage: this.getUserFriendlyMessage(this.state.error),
        retryable: true
      };

      recoveryTracker.recordAttempt(
        apiError,
        'manual_retry',
        false,
        true // User initiated
      );
    }
    
    // Reset after delay
    const delay = this.props.recoveryDelay || 100;
    this.resetTimeoutId = window.setTimeout(() => {
      this.resetErrorBoundary();
    }, delay);
  };

  /**
   * Handle component remount
   */
  handleRemount = () => {
    // Force component remount by changing key
    const remountKey = `remount_${Date.now()}`;
    
    this.setState({
      recoveryInProgress: true
    });

    // Reset all registered components
    this.resetAllComponents();

    // Track remount attempt
    if (this.state.error) {
      const apiError: ApiError = {
        type: ErrorType.CLIENT,
        severity: this.getErrorSeverity(),
        errorId: this.state.errorId || generateErrorId(),
        timestamp: new Date().toISOString(),
        message: this.state.error.message,
        userMessage: this.getUserFriendlyMessage(this.state.error),
        retryable: true
      };

      recoveryTracker.recordAttempt(
        apiError,
        'component_remount',
        false,
        true
      );
    }

    // Force re-render with new key
    setTimeout(() => {
      this.resetErrorBoundary();
    }, 100);
  };

  /**
   * Attempt automatic recovery
   */
  private async attemptAutoRecovery(error: ApiError, context: ErrorContext): Promise<void> {
    this.setState({ recoveryInProgress: true });

    try {
      const recoveryResult = await errorRecoveryManager.attemptRecovery(error, context);
      
      if (recoveryResult.success) {
        // Recovery successful, reset boundary
        recoveryTracker.recordAttempt(
          error,
          'auto_recovery',
          true,
          false
        );
        
        this.setState({ recoveryAttempts: this.state.recoveryAttempts + 1 });
        
        // Delay before reset to allow for cleanup
        this.recoveryTimeoutId = window.setTimeout(() => {
          this.resetErrorBoundary();
        }, 1000);
      } else {
        // Recovery failed
        this.setState({ 
          recoveryInProgress: false,
          recoveryAttempts: this.state.recoveryAttempts + 1
        });
      }
    } catch (recoveryError) {
      logger.error("Auto-recovery failed:", recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError)));
      this.setState({ 
        recoveryInProgress: false,
        recoveryAttempts: this.state.recoveryAttempts + 1
      });
    }
  }

  /**
   * Check if auto-recovery should be attempted
   */
  private shouldAttemptAutoRecovery(): boolean {
    const maxRecoveryAttempts = 2;
    const recoveryWindow = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    
    // Don't attempt if too many recent attempts
    if (this.state.recoveryAttempts >= maxRecoveryAttempts) {
      return false;
    }
    
    // Don't attempt if error is too recent (avoid rapid recovery loops)
    if (now - this.state.lastErrorTime < 5000) {
      return false;
    }
    
    return true;
  }

  /**
   * Get error severity based on level
   */
  private getErrorSeverity(): ErrorSeverity {
    switch (this.props.level) {
      case 'global':
        return ErrorSeverity.CRITICAL;
      case 'feature':
        return ErrorSeverity.HIGH;
      case 'component':
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyMessage(error: Error): string {
    const level = this.props.level || 'component';
    
    switch (level) {
      case 'global':
        return 'We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.';
      case 'feature':
        return 'This feature is currently experiencing issues. Please try again or use an alternative approach.';
      case 'component':
      default:
        return 'We encountered an issue loading this content. Please try again.';
    }
  }

  /**
   * Persist error boundary state
   */
  private persistState(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const stateToSave = {
        hasError: this.state.hasError,
        retryCount: this.state.retryCount,
        lastErrorTime: this.state.lastErrorTime,
        recoveryAttempts: this.state.recoveryAttempts,
        errorId: this.state.errorId
      };
      
      localStorage.setItem(this.stateKey, JSON.stringify(stateToSave));
    } catch (error) {
      logger.error("Failed to persist error boundary state:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Load persisted error boundary state
   */
  private loadPersistedState(): Partial<ErrorBoundaryWrapperState> | null {
    if (typeof localStorage === 'undefined') return null;

    try {
      const stored = localStorage.getItem(this.stateKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      logger.error("Failed to load persisted error boundary state:", error instanceof Error ? error : new Error(String(error)));
    }
    
    return null;
  }

  /**
   * Clear persisted state
   */
  private clearPersistedState(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      localStorage.removeItem(this.stateKey);
    } catch (error) {
      logger.error("Failed to clear persisted error boundary state:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  render() {
    const contextValue: ErrorBoundaryContextValue = {
      resetComponent: this.resetErrorBoundary,
      resetAllComponents: this.resetAllComponents,
      getErrorState: this.getErrorState,
      registerComponent: this.registerComponent,
      unregisterComponent: this.unregisterComponent
    };

    if (this.state.hasError) {
      if (this.props.fallback) {
        return (
          <ErrorBoundaryContext.Provider value={contextValue}>
            {this.props.fallback}
          </ErrorBoundaryContext.Provider>
        );
      }

      return (
        <ErrorBoundaryContext.Provider value={contextValue}>
          <EnhancedErrorFallbackUI
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            errorId={this.state.errorId}
            retryCount={this.state.retryCount}
            recoveryAttempts={this.state.recoveryAttempts}
            recoveryInProgress={this.state.recoveryInProgress}
            level={this.props.level}
            componentId={this.props.componentId}
            onRetry={this.handleRetry}
            onReset={this.resetErrorBoundary}
            onRemount={this.handleRemount}
            registeredComponents={Array.from(this.state.registeredComponents.keys())}
          />
        </ErrorBoundaryContext.Provider>
      );
    }

    return (
      <ErrorBoundaryContext.Provider value={contextValue}>
        {this.props.children}
      </ErrorBoundaryContext.Provider>
    );
  }
}

// Enhanced Error Fallback UI with recovery options
interface EnhancedErrorFallbackUIProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
  recoveryAttempts: number;
  recoveryInProgress: boolean;
  level?: 'global' | 'feature' | 'component';
  componentId?: string;
  onRetry: () => void;
  onReset: () => void;
  onRemount: () => void;
  registeredComponents: string[];
}

const EnhancedErrorFallbackUI: React.FC<EnhancedErrorFallbackUIProps> = ({
  error,
  errorInfo,
  errorId,
  retryCount,
  recoveryAttempts,
  recoveryInProgress,
  level = 'component',
  componentId,
  onRetry,
  onReset,
  onRemount,
  registeredComponents
}) => {
  const getErrorMessage = () => {
    switch (level) {
      case 'global':
        return {
          title: 'Application Error',
          message: 'We encountered an unexpected error. Please try one of the recovery options below.',
          icon: AlertTriangle,
          color: 'red'
        };
      case 'feature':
        return {
          title: 'Feature Unavailable',
          message: 'This feature is currently experiencing issues. Please try the recovery options below.',
          icon: AlertCircle,
          color: 'orange'
        };
      default:
        return {
          title: 'Component Error',
          message: 'We encountered an issue with this component. Please try the recovery options below.',
          icon: RefreshCw,
          color: 'blue'
        };
    }
  };

  const errorMessage = getErrorMessage();
  const Icon = errorMessage.icon;
  const isDevelopment = import.meta.env.DEV;
  const maxRetries = 3;

  return (
    <div className={`min-h-[200px] flex items-center justify-center p-6 ${
      level === 'global' ? 'min-h-screen bg-slate-50 dark:bg-slate-900' : ''
    }`}>
      <div className="max-w-lg w-full text-center">
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

        {recoveryInProgress && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center justify-center space-x-2 text-blue-700 dark:text-blue-300">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Attempting recovery...</span>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <button
            onClick={onRetry}
            disabled={retryCount >= maxRetries || recoveryInProgress}
            className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              retryCount >= maxRetries || recoveryInProgress
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>
              {retryCount >= maxRetries ? 'Max retries reached' : `Retry (${retryCount}/${maxRetries})`}
            </span>
          </button>

          <button
            onClick={onRemount}
            disabled={recoveryInProgress}
            className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              recoveryInProgress
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Component</span>
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

          {level !== 'global' && (
            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center space-x-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh Page</span>
            </button>
          )}
        </div>

        {/* Recovery Statistics */}
        {(retryCount > 0 || recoveryAttempts > 0) && (
          <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm">
            <div className="text-slate-600 dark:text-slate-400">
              Recovery attempts: {recoveryAttempts} | Manual retries: {retryCount}
            </div>
          </div>
        )}

        {/* Component Information */}
        {componentId && (
          <div className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            Component: {componentId}
            {registeredComponents.length > 0 && (
              <div className="mt-1">
                Registered components: {registeredComponents.join(', ')}
              </div>
            )}
          </div>
        )}
        
        {errorId && (
          <div className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            Error ID: {errorId}
          </div>
        )}
        
        {isDevelopment && error && (
          <details className="text-left">
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

export default ErrorBoundaryWrapper;