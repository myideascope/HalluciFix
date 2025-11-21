/**
 * Enhanced Authentication Error Boundary
 * Provides comprehensive error handling for authentication-related errors with automatic recovery
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { Shield, RefreshCw, LogIn, AlertTriangle, Wifi, Lock } from 'lucide-react';
import { AuthErrorRecoveryManager, AuthRecoveryResult, AuthErrorContext } from '../../lib/auth/authErrorRecovery';
import { ApiError, ErrorType } from '../../lib/errors/types';
import { generateErrorId } from '../../lib/errors/classifier';

import { logger } from './logging';
interface AuthenticationErrorBoundaryProps {
  children: ReactNode;
  userId?: string;
  onRecoverySuccess?: () => void;
  onRecoveryFailure?: (error: ApiError) => void;
  fallback?: ReactNode;
}

interface AuthenticationErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
  isRecovering: boolean;
  recoveryResult: AuthRecoveryResult | null;
  authErrorType: AuthErrorContext['errorType'] | null;
}

class AuthenticationErrorBoundary extends Component<
  AuthenticationErrorBoundaryProps,
  AuthenticationErrorBoundaryState
> {
  private recoveryManager: AuthErrorRecoveryManager;
  private resetTimeoutId: number | null = null;

  constructor(props: AuthenticationErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      isRecovering: false,
      recoveryResult: null,
      authErrorType: null
    };
    this.recoveryManager = AuthErrorRecoveryManager.getInstance();
  }

  static getDerivedStateFromError(error: Error): Partial<AuthenticationErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: generateErrorId()
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Classify the authentication error
    const authErrorType = this.classifyAuthError(error);
    this.setState({ authErrorType });
    
    // Log error details
    logger.error("Authentication Error Boundary caught an error:", {
      error,
      errorInfo,
      errorId: this.state.errorId,
      authErrorType,
      retryCount: this.state.retryCount
    } instanceof Error ? {
      error,
      errorInfo,
      errorId: this.state.errorId,
      authErrorType,
      retryCount: this.state.retryCount
    } : new Error(String({
      error,
      errorInfo,
      errorId: this.state.errorId,
      authErrorType,
      retryCount: this.state.retryCount
    })));

    // Attempt automatic recovery for certain error types
    if (this.shouldAttemptAutoRecovery(authErrorType)) {
      this.attemptRecovery();
    }
  }

  /**
   * Classifies the error to determine the appropriate recovery strategy
   */
  private classifyAuthError(error: Error): AuthErrorContext['errorType'] {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('expired') || errorMessage.includes('token')) {
      return 'token_expired';
    } else if (errorMessage.includes('invalid') || errorMessage.includes('unauthorized')) {
      return 'token_invalid';
    } else if (errorMessage.includes('session')) {
      return 'session_expired';
    } else if (errorMessage.includes('permission') || errorMessage.includes('forbidden')) {
      return 'permission_denied';
    } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'network_error';
    }
    
    return 'token_invalid'; // Default fallback
  }

  /**
   * Determines if automatic recovery should be attempted
   */
  private shouldAttemptAutoRecovery(errorType: AuthErrorContext['errorType']): boolean {
    return errorType === 'token_expired' || errorType === 'network_error';
  }

  /**
   * Attempts to recover from the authentication error
   */
  private attemptRecovery = async (): Promise<void> => {
    if (this.state.isRecovering || !this.state.authErrorType) {
      return;
    }

    this.setState({ isRecovering: true });

    try {
      const recoveryResult = await this.recoveryManager.attemptRecovery({
        userId: this.props.userId,
        errorType: this.state.authErrorType,
        originalError: this.state.error || undefined,
        retryCount: this.state.retryCount
      });

      this.setState({ recoveryResult, isRecovering: false });

      if (recoveryResult.success) {
        // Recovery successful, reset error boundary
        this.props.onRecoverySuccess?.();
        this.resetErrorBoundary();
      } else {
        // Recovery failed, notify parent component
        if (recoveryResult.error) {
          this.props.onRecoveryFailure?.(recoveryResult.error);
        }
      }
    } catch (error) {
      logger.error("Recovery attempt failed:", error instanceof Error ? error : new Error(String(error)));
      this.setState({ 
        isRecovering: false,
        recoveryResult: {
          success: false,
          action: 'recovery_failed',
          error: {
            type: ErrorType.AUTHENTICATION,
            severity: 'high' as const,
            message: error instanceof Error ? error.message : 'Recovery failed',
            userMessage: 'Automatic recovery failed. Please try signing in again.',
            retryable: false,
            timestamp: new Date().toISOString(),
            errorId: generateErrorId()
          }
        }
      });
    }
  };

  /**
   * Handles manual retry attempts
   */
  private handleRetry = (): void => {
    const newRetryCount = this.state.retryCount + 1;
    
    // Limit retry attempts
    if (newRetryCount > 3) {
      logger.error("Max retry attempts exceeded for authentication error");
      return;
    }
    
    this.setState({ retryCount: newRetryCount });
    
    // Attempt recovery
    this.attemptRecovery();
  };

  /**
   * Resets the error boundary state
   */
  private resetErrorBoundary = (): void => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
    
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      isRecovering: false,
      recoveryResult: null,
      authErrorType: null
    });
  };

  /**
   * Handles re-authentication flow
   */
  private handleReauthenticate = (): void => {
    // Clear any existing session data
    localStorage.removeItem('hallucifix_oauth_session');
    localStorage.removeItem('hallucifix_user_data');
    localStorage.removeItem('hallucifix_jwt_access_token');
    localStorage.removeItem('hallucifix_jwt_refresh_token');
    
    // Redirect to login page
    window.location.href = '/auth/login';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <AuthenticationErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          retryCount={this.state.retryCount}
          isRecovering={this.state.isRecovering}
          recoveryResult={this.state.recoveryResult}
          authErrorType={this.state.authErrorType}
          onRetry={this.handleRetry}
          onReauthenticate={this.handleReauthenticate}
          onReset={this.resetErrorBoundary}
        />
      );
    }

    return this.props.children;
  }
}

interface AuthenticationErrorFallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
  isRecovering: boolean;
  recoveryResult: AuthRecoveryResult | null;
  authErrorType: AuthErrorContext['errorType'] | null;
  onRetry: () => void;
  onReauthenticate: () => void;
  onReset: () => void;
}

const AuthenticationErrorFallback: React.FC<AuthenticationErrorFallbackProps> = ({
  error,
  errorInfo,
  errorId,
  retryCount,
  isRecovering,
  recoveryResult,
  authErrorType,
  onRetry,
  onReauthenticate,
  onReset
}) => {
  const getErrorDisplay = () => {
    switch (authErrorType) {
      case 'token_expired':
        return {
          icon: RefreshCw,
          title: 'Session Expired',
          message: 'Your session has expired. We\'re attempting to refresh your authentication automatically.',
          color: 'blue'
        };
      case 'token_invalid':
        return {
          icon: Lock,
          title: 'Authentication Invalid',
          message: 'Your authentication credentials are invalid. Please sign in again.',
          color: 'red'
        };
      case 'session_expired':
        return {
          icon: Shield,
          title: 'Session Expired',
          message: 'Your session has expired. Please sign in again to continue.',
          color: 'orange'
        };
      case 'permission_denied':
        return {
          icon: AlertTriangle,
          title: 'Access Denied',
          message: 'You don\'t have permission to access this resource. Contact your administrator if you believe this is an error.',
          color: 'red'
        };
      case 'network_error':
        return {
          icon: Wifi,
          title: 'Connection Issue',
          message: 'Network connectivity issues are affecting authentication. Please check your connection.',
          color: 'orange'
        };
      default:
        return {
          icon: Shield,
          title: 'Authentication Error',
          message: 'An authentication error occurred. Please try signing in again.',
          color: 'red'
        };
    }
  };

  const errorDisplay = getErrorDisplay();
  const Icon = errorDisplay.icon;
  const isDevelopment = import.meta.env.DEV;

  const getRecoveryMessage = () => {
    if (isRecovering) {
      return 'Attempting automatic recovery...';
    }
    
    if (recoveryResult) {
      switch (recoveryResult.action) {
        case 'token_refreshed':
          return 'Authentication refreshed successfully!';
        case 'session_restored':
          return 'Session restored successfully!';
        case 'reauthentication_required':
          return 'Please sign in again to continue.';
        case 'recovery_failed':
          return 'Automatic recovery failed. Manual intervention required.';
        default:
          return null;
      }
    }
    
    return null;
  };

  const recoveryMessage = getRecoveryMessage();

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="max-w-md w-full text-center">
        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
          errorDisplay.color === 'red' ? 'bg-red-100 dark:bg-red-900/20' :
          errorDisplay.color === 'orange' ? 'bg-orange-100 dark:bg-orange-900/20' : 
          'bg-blue-100 dark:bg-blue-900/20'
        }`}>
          <Icon className={`w-8 h-8 ${
            errorDisplay.color === 'red' ? 'text-red-600 dark:text-red-400' :
            errorDisplay.color === 'orange' ? 'text-orange-600 dark:text-orange-400' : 
            'text-blue-600 dark:text-blue-400'
          } ${isRecovering ? 'animate-spin' : ''}`} />
        </div>
        
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
          {errorDisplay.title}
        </h3>
        
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          {errorDisplay.message}
        </p>

        {recoveryMessage && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            recoveryResult?.success 
              ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
              : isRecovering
              ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
              : 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200'
          }`}>
            {recoveryMessage}
          </div>
        )}
        
        <div className="flex flex-col space-y-3">
          {/* Show retry button for recoverable errors */}
          {(authErrorType === 'token_expired' || authErrorType === 'network_error') && (
            <button
              onClick={onRetry}
              disabled={retryCount >= 3 || isRecovering}
              className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                retryCount >= 3 || isRecovering
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isRecovering ? 'animate-spin' : ''}`} />
              <span>
                {isRecovering ? 'Recovering...' : 
                 retryCount >= 3 ? 'Max retries reached' : 'Try Again'}
              </span>
            </button>
          )}
          
          {/* Always show re-authentication button */}
          <button
            onClick={onReauthenticate}
            disabled={isRecovering}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In Again</span>
          </button>
          
          {/* Show home button for non-recoverable errors */}
          {authErrorType === 'permission_denied' && (
            <button
              onClick={() => window.location.href = '/'}
              className="flex items-center justify-center space-x-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Shield className="w-4 h-4" />
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

export default AuthenticationErrorBoundary;