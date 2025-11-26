/**
 * Authentication Error Recovery System
 * Handles automatic token refresh, re-authentication flows, and session management
 */

import { supabase } from '../supabase';
import { SessionManager } from '../oauth/sessionManager';
import { JWTTokenManager } from '../oauth/jwtTokenManager';
import { OAuthService } from '../oauth/oauthService';
import { oauthConfig } from '../oauth/oauthConfig';
import { ApiError, ErrorType, ErrorSeverity } from '../errors/types';
import { generateErrorId } from '../errors/classifier';

import { logger } from '../logging';
export interface AuthRecoveryResult {
  success: boolean;
  action: 'token_refreshed' | 'reauthentication_required' | 'session_restored' | 'recovery_failed';
  error?: ApiError;
  newTokens?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  };
}

export interface AuthErrorContext {
  userId?: string;
  errorType: 'token_expired' | 'token_invalid' | 'session_expired' | 'permission_denied' | 'network_error';
  originalError?: Error;
  retryCount?: number;
  lastAttempt?: Date;
}

/**
 * Authentication Error Recovery Manager
 * Provides automatic recovery mechanisms for authentication-related errors
 */
export class AuthErrorRecoveryManager {
  private static instance: AuthErrorRecoveryManager;
  private jwtManager: JWTTokenManager;
  private oauthService: OAuthService | null = null;
  private recoveryAttempts: Map<string, number> = new Map();
  private readonly maxRecoveryAttempts = 3;
  private readonly recoveryTimeout = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.jwtManager = new JWTTokenManager();
    this.initializeOAuthService();
  }

  static getInstance(): AuthErrorRecoveryManager {
    if (!this.instance) {
      this.instance = new AuthErrorRecoveryManager();
    }
    return this.instance;
  }

  private async initializeOAuthService(): Promise<void> {
    try {
      const availability = oauthConfig.getAvailabilityStatus();
      if (availability.available) {
        const config = oauthConfig.getConfig();
        this.oauthService = new OAuthService(config);
      }
    } catch (error) {
      logger.warn("Failed to initialize OAuth service for auth recovery:", { error });
    }
  }

  /**
   * Attempts to recover from authentication errors automatically
   */
  async attemptRecovery(context: AuthErrorContext): Promise<AuthRecoveryResult> {
    const recoveryKey = `${context.userId || 'anonymous'}_${context.errorType}`;
    const currentAttempts = this.recoveryAttempts.get(recoveryKey) || 0;

    // Check if we've exceeded max recovery attempts
    if (currentAttempts >= this.maxRecoveryAttempts) {
      return {
        success: false,
        action: 'recovery_failed',
        error: this.createRecoveryError('Max recovery attempts exceeded', context)
      };
    }

    // Increment recovery attempts
    this.recoveryAttempts.set(recoveryKey, currentAttempts + 1);

    try {
      let result: AuthRecoveryResult;

      switch (context.errorType) {
        case 'token_expired':
          result = await this.handleTokenExpired(context);
          break;
        case 'token_invalid':
          result = await this.handleTokenInvalid(context);
          break;
        case 'session_expired':
          result = await this.handleSessionExpired(context);
          break;
        case 'permission_denied':
          result = await this.handlePermissionDenied(context);
          break;
        case 'network_error':
          result = await this.handleNetworkError(context);
          break;
        default:
          result = {
            success: false,
            action: 'recovery_failed',
            error: this.createRecoveryError('Unknown error type', context)
          };
      }

      // Clear recovery attempts on success
      if (result.success) {
        this.recoveryAttempts.delete(recoveryKey);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        action: 'recovery_failed',
        error: this.createRecoveryError(
          error instanceof Error ? error.message : 'Recovery attempt failed',
          context
        )
      };
    }
  }

  /**
   * Handles expired token recovery through automatic refresh
   */
  private async handleTokenExpired(context: AuthErrorContext): Promise<AuthRecoveryResult> {
    try {
      // First, try to refresh JWT tokens
      const jwtRefreshToken = SessionManager.getJWTRefreshToken();
      if (jwtRefreshToken) {
        const newJWTTokens = await this.jwtManager.refreshAccessToken(jwtRefreshToken);
        if (newJWTTokens) {
          // Store new JWT tokens
          localStorage.setItem('hallucifix_jwt_access_token', newJWTTokens.accessToken);
          localStorage.setItem('hallucifix_jwt_refresh_token', newJWTTokens.refreshToken);
          
          return {
            success: true,
            action: 'token_refreshed'
          };
        }
      }

      // Try to refresh Supabase session
      const { data: { session }, error } = await supabase.auth.refreshSession();
      
      if (error || !session) {
        // If refresh fails, require re-authentication
        return {
          success: false,
          action: 'reauthentication_required',
          error: this.createRecoveryError('Token refresh failed', context)
        };
      }

      // Update session with new tokens
      await SessionManager.refreshSession({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: new Date(session.expires_at! * 1000)
      });

      return {
        success: true,
        action: 'token_refreshed',
        newTokens: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: new Date(session.expires_at! * 1000)
        }
      };
    } catch (error) {
      return {
        success: false,
        action: 'reauthentication_required',
        error: this.createRecoveryError(
          `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          context
        )
      };
    }
  }

  /**
   * Handles invalid token recovery by clearing session and requiring re-authentication
   */
  private async handleTokenInvalid(context: AuthErrorContext): Promise<AuthRecoveryResult> {
    try {
      // Clear invalid session data
      await SessionManager.clearSession();
      
      // Sign out from Supabase to clear any invalid tokens
      await supabase.auth.signOut();

      return {
        success: false,
        action: 'reauthentication_required',
        error: this.createRecoveryError('Invalid tokens detected, re-authentication required', context)
      };
    } catch (error) {
      return {
        success: false,
        action: 'recovery_failed',
        error: this.createRecoveryError(
          `Failed to clear invalid session: ${error instanceof Error ? error.message : 'Unknown error'}`,
          context
        )
      };
    }
  }

  /**
   * Handles expired session recovery
   */
  private async handleSessionExpired(context: AuthErrorContext): Promise<AuthRecoveryResult> {
    try {
      // Check if we can restore session from stored data
      const sessionInfo = SessionManager.getSessionInfo();
      const storedUser = SessionManager.getStoredUser();

      if (sessionInfo && storedUser && SessionManager.isSessionValid()) {
        // Session data is valid, try to restore Supabase session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session && !error) {
          return {
            success: true,
            action: 'session_restored'
          };
        }
      }

      // Session cannot be restored, require re-authentication
      await SessionManager.clearSession();
      
      return {
        success: false,
        action: 'reauthentication_required',
        error: this.createRecoveryError('Session expired and cannot be restored', context)
      };
    } catch (error) {
      return {
        success: false,
        action: 'recovery_failed',
        error: this.createRecoveryError(
          `Session recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          context
        )
      };
    }
  }

  /**
   * Handles permission denied errors
   */
  private async handlePermissionDenied(context: AuthErrorContext): Promise<AuthRecoveryResult> {
    try {
      // Check if user's permissions have changed by refreshing user data
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // Refresh user profile to get updated permissions
        const { data: userData, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', session.user.email)
          .single();

        if (userData && !error) {
          // Update stored user data with new permissions
          SessionManager.updateStoredUser(userData);
          
          return {
            success: true,
            action: 'session_restored'
          };
        }
      }

      // Cannot resolve permission issue automatically
      return {
        success: false,
        action: 'recovery_failed',
        error: this.createRecoveryError('Insufficient permissions - contact administrator', context)
      };
    } catch (error) {
      return {
        success: false,
        action: 'recovery_failed',
        error: this.createRecoveryError(
          `Permission check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          context
        )
      };
    }
  }

  /**
   * Handles network error recovery by waiting for connectivity
   */
  private async handleNetworkError(context: AuthErrorContext): Promise<AuthRecoveryResult> {
    try {
      // Wait for network connectivity
      await this.waitForNetworkConnectivity();
      
      // Once connected, try to validate current session
      const isValid = await SessionManager.isSessionFullyValid();
      
      if (isValid) {
        return {
          success: true,
          action: 'session_restored'
        };
      } else {
        // Session is not valid, attempt token refresh
        return await this.handleTokenExpired(context);
      }
    } catch (error) {
      return {
        success: false,
        action: 'recovery_failed',
        error: this.createRecoveryError(
          `Network recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          context
        )
      };
    }
  }

  /**
   * Waits for network connectivity to be restored
   */
  private async waitForNetworkConnectivity(timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (navigator.onLine) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        window.removeEventListener('online', onOnline);
        reject(new Error('Network connectivity timeout'));
      }, timeout);

      const onOnline = () => {
        clearTimeout(timeoutId);
        window.removeEventListener('online', onOnline);
        resolve();
      };

      window.addEventListener('online', onOnline);
    });
  }

  /**
   * Creates a standardized recovery error
   */
  private createRecoveryError(message: string, context: AuthErrorContext): ApiError {
    return {
      type: ErrorType.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      message,
      userMessage: this.getUserFriendlyMessage(context.errorType),
      statusCode: 401,
      retryable: context.errorType === 'network_error' || context.errorType === 'token_expired',
      timestamp: new Date().toISOString(),
      errorId: generateErrorId(),
      context: {
        errorType: context.errorType,
        retryCount: context.retryCount || 0,
        userId: context.userId
      }
    };
  }

  /**
   * Gets user-friendly error messages based on error type
   */
  private getUserFriendlyMessage(errorType: string): string {
    switch (errorType) {
      case 'token_expired':
        return 'Your session has expired. Please sign in again.';
      case 'token_invalid':
        return 'Your authentication is invalid. Please sign in again.';
      case 'session_expired':
        return 'Your session has expired. Please sign in again.';
      case 'permission_denied':
        return 'You don\'t have permission to perform this action. Contact your administrator if you believe this is an error.';
      case 'network_error':
        return 'Network connection issues are affecting authentication. Please check your connection and try again.';
      default:
        return 'An authentication error occurred. Please try signing in again.';
    }
  }

  /**
   * Clears recovery attempt counters (useful for testing or manual reset)
   */
  clearRecoveryAttempts(): void {
    this.recoveryAttempts.clear();
  }

  /**
   * Gets recovery attempt statistics
   */
  getRecoveryStats(): { [key: string]: number } {
    return Object.fromEntries(this.recoveryAttempts);
  }

  /**
   * Checks if automatic recovery is available for a given error type
   */
  canAttemptRecovery(errorType: string, userId?: string): boolean {
    const recoveryKey = `${userId || 'anonymous'}_${errorType}`;
    const currentAttempts = this.recoveryAttempts.get(recoveryKey) || 0;
    
    return currentAttempts < this.maxRecoveryAttempts;
  }
}

/**
 * Convenience function to attempt authentication recovery
 */
export async function attemptAuthRecovery(context: AuthErrorContext): Promise<AuthRecoveryResult> {
  const manager = AuthErrorRecoveryManager.getInstance();
  return await manager.attemptRecovery(context);
}

/**
 * Hook for React components to handle authentication errors with automatic recovery
 */
export function useAuthErrorRecovery() {
  const manager = AuthErrorRecoveryManager.getInstance();

  const handleAuthError = async (error: Error, userId?: string): Promise<AuthRecoveryResult> => {
    // Classify the error type
    let errorType: AuthErrorContext['errorType'] = 'token_invalid';
    
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes('expired')) {
      errorType = 'token_expired';
    } else if (errorMessage.includes('session')) {
      errorType = 'session_expired';
    } else if (errorMessage.includes('permission') || errorMessage.includes('forbidden')) {
      errorType = 'permission_denied';
    } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      errorType = 'network_error';
    }

    return await manager.attemptRecovery({
      userId,
      errorType,
      originalError: error
    });
  };

  const canRecover = (errorType: string, userId?: string): boolean => {
    return manager.canAttemptRecovery(errorType, userId);
  };

  const clearAttempts = (): void => {
    manager.clearRecoveryAttempts();
  };

  const getStats = () => {
    return manager.getRecoveryStats();
  };

  return {
    handleAuthError,
    canRecover,
    clearAttempts,
    getStats
  };
}