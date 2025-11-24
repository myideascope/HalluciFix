/**
 * Session Recovery Service
 * Provides comprehensive session management with automatic recovery and error handling
 */

import { supabase } from '../supabase';
import { SessionManager } from '../oauth/sessionManager';
import { AuthErrorRecoveryManager, AuthErrorContext } from './authErrorRecovery';
import { ApiError, ErrorType, ErrorSeverity } from '../errors/types';
import { generateErrorId } from '../errors/classifier';

import { logger } from './logging';
export interface SessionStatus {
  isValid: boolean;
  isExpired: boolean;
  needsRefresh: boolean;
  hasJWTToken: boolean;
  jwtTokenValid: boolean;
  lastValidated: Date;
  expiresAt?: Date;
  userId?: string;
  email?: string;
}

export interface SessionRecoveryOptions {
  autoRefresh?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  onRecoverySuccess?: () => void;
  onRecoveryFailure?: (error: ApiError) => void;
  onSessionExpired?: () => void;
}

/**
 * Session Recovery Service
 * Manages session validation, recovery, and automatic refresh
 */
export class SessionRecoveryService {
  private static instance: SessionRecoveryService;
  private recoveryManager: AuthErrorRecoveryManager;
  private validationInterval: NodeJS.Timeout | null = null;
  private readonly defaultOptions: Required<SessionRecoveryOptions> = {
    autoRefresh: true,
    maxRetries: 3,
    retryDelay: 1000,
    onRecoverySuccess: () => {},
    onRecoveryFailure: () => {},
    onSessionExpired: () => {}
  };

  private constructor() {
    this.recoveryManager = AuthErrorRecoveryManager.getInstance();
  }

  static getInstance(): SessionRecoveryService {
    if (!this.instance) {
      this.instance = new SessionRecoveryService();
    }
    return this.instance;
  }

  /**
   * Validates the current session and attempts recovery if needed
   */
  async validateSession(options?: SessionRecoveryOptions): Promise<SessionStatus> {
    const opts = { ...this.defaultOptions, ...options || {} };
    
    try {
      // Get basic session info
      const sessionInfo = SessionManager.getSessionInfo();
      const jwtAccessToken = SessionManager.getJWTAccessToken();
      
      // Check if session exists
      if (!sessionInfo) {
        return {
          isValid: false,
          isExpired: true,
          needsRefresh: false,
          hasJWTToken: false,
          jwtTokenValid: false,
          lastValidated: new Date()
        };
      }

      // Check if session is expired
      const now = new Date();
      const isExpired = now >= sessionInfo.expiresAt;
      
      // Validate JWT token if present
      let jwtTokenValid = false;
      if (jwtAccessToken) {
        try {
          const jwtPayload = await SessionManager.getCurrentJWTPayload();
          jwtTokenValid = !!jwtPayload;
        } catch (error) {
          logger.warn("JWT token validation failed:", { error });
        }
      }

      // Validate Supabase session
      const { data: { session }, error } = await supabase.auth.getSession();
      const supabaseSessionValid = !error && !!session;

      const status: SessionStatus = {
        isValid: supabaseSessionValid && !isExpired && (jwtTokenValid || !jwtAccessToken),
        isExpired,
        needsRefresh: isExpired || !supabaseSessionValid,
        hasJWTToken: !!jwtAccessToken,
        jwtTokenValid,
        lastValidated: now,
        expiresAt: sessionInfo.expiresAt,
        userId: sessionInfo.userId,
        email: sessionInfo.email
      };

      // Attempt recovery if session is invalid and auto-refresh is enabled
      if (!status.isValid && opts.autoRefresh) {
        const recoveryResult = await this.attemptSessionRecovery(sessionInfo.userId, opts);
        
        if (recoveryResult.success) {
          // Re-validate after successful recovery
          return await this.validateSession({ ...options, autoRefresh: false });
        } else {
          opts.onRecoveryFailure(recoveryResult.error || this.createSessionError('Session recovery failed'));
        }
      }

      return status;
    } catch (error) {
      logger.error("Session validation failed:", error instanceof Error ? error : new Error(String(error)));
      
      return {
        isValid: false,
        isExpired: true,
        needsRefresh: true,
        hasJWTToken: false,
        jwtTokenValid: false,
        lastValidated: new Date()
      };
    }
  }

  /**
   * Attempts to recover an invalid session
   */
  private async attemptSessionRecovery(
    userId: string, 
    options: Required<SessionRecoveryOptions>
  ): Promise<{ success: boolean; error?: ApiError }> {
    try {
      // Determine the type of recovery needed
      const sessionInfo = SessionManager.getSessionInfo();
      let errorType: AuthErrorContext['errorType'] = 'session_expired';
      
      if (sessionInfo && new Date() >= sessionInfo.expiresAt) {
        errorType = 'token_expired';
      }

      // Attempt recovery
      const recoveryResult = await this.recoveryManager.attemptRecovery({
        userId,
        errorType,
        retryCount: 0
      });

      if (recoveryResult.success) {
        options.onRecoverySuccess();
        return { success: true };
      } else {
        return { 
          success: false, 
          error: recoveryResult.error || this.createSessionError('Recovery failed')
        };
      }
    } catch (error) {
      return {
        success: false,
        error: this.createSessionError(
          error instanceof Error ? error.message : 'Unknown recovery error'
        )
      };
    }
  }

  /**
   * Starts automatic session monitoring
   */
  startSessionMonitoring(
    intervalMs: number = 60000, // Check every minute
    options?: SessionRecoveryOptions
  ): () => void {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
    }

    this.validationInterval = setInterval(async () => {
      try {
        const status = await this.validateSession(options || {});
        
        if (!status.isValid && status.isExpired) {
          options.onSessionExpired?.();
        }
      } catch (error) {
        logger.error("Session monitoring error:", error instanceof Error ? error : new Error(String(error)));
      }
    }, intervalMs);

    // Return cleanup function
    return () => {
      if (this.validationInterval) {
        clearInterval(this.validationInterval);
        this.validationInterval = null;
      }
    };
  }

  /**
   * Stops session monitoring
   */
  stopSessionMonitoring(): void {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = null;
    }
  }

  /**
   * Forces a session refresh
   */
  async refreshSession(options?: SessionRecoveryOptions): Promise<SessionStatus> {
    const opts = { ...this.defaultOptions, ...options || {} };
    
    try {
      const sessionInfo = SessionManager.getSessionInfo();
      if (!sessionInfo) {
        throw new Error('No active session to refresh');
      }

      // Attempt to refresh the session
      const recoveryResult = await this.recoveryManager.attemptRecovery({
        userId: sessionInfo.userId,
        errorType: 'token_expired',
        retryCount: 0
      });

      if (recoveryResult.success) {
        opts.onRecoverySuccess();
        return await this.validateSession({ ...options, autoRefresh: false });
      } else {
        opts.onRecoveryFailure(recoveryResult.error || this.createSessionError('Refresh failed'));
        throw new Error('Session refresh failed');
      }
    } catch (error) {
      const apiError = this.createSessionError(
        error instanceof Error ? error.message : 'Session refresh failed'
      );
      opts.onRecoveryFailure(apiError);
      throw apiError;
    }
  }

  /**
   * Clears the current session
   */
  async clearSession(): Promise<void> {
    try {
      this.stopSessionMonitoring();
      await SessionManager.clearSession();
      await supabase.auth.signOut();
    } catch (error) {
      logger.error("Error clearing session:", error instanceof Error ? error : new Error(String(error)));
      // Force clear local storage even if other operations fail
      localStorage.removeItem('hallucifix_oauth_session');
      localStorage.removeItem('hallucifix_user_data');
      localStorage.removeItem('hallucifix_jwt_access_token');
      localStorage.removeItem('hallucifix_jwt_refresh_token');
    }
  }

  /**
   * Gets comprehensive session information
   */
  async getSessionInfo(): Promise<{
    status: SessionStatus;
    supabaseSession: any;
    jwtPayload: any;
    userSessions: any[];
  }> {
    const status = await this.validateSession({ autoRefresh: false });
    
    // Get Supabase session
    const { data: { session } } = await supabase.auth.getSession();
    
    // Get JWT payload
    const jwtPayload = await SessionManager.getCurrentJWTPayload();
    
    // Get user sessions
    const userSessions = await SessionManager.getUserSessions();

    return {
      status,
      supabaseSession: session,
      jwtPayload,
      userSessions
    };
  }

  /**
   * Validates session with retry logic
   */
  async validateSessionWithRetry(
    maxRetries: number = 3,
    retryDelay: number = 1000,
    options?: SessionRecoveryOptions
  ): Promise<SessionStatus> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.validateSession(options || {});
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
        }
      }
    }
    
    throw lastError || new Error('Session validation failed after retries');
  }

  /**
   * Creates a standardized session error
   */
  private createSessionError(message: string): ApiError {
    return {
      type: ErrorType.AUTHENTICATION,
      severity: ErrorSeverity.HIGH,
      message,
      userMessage: 'Session validation failed. Please sign in again.',
      statusCode: 401,
      retryable: true,
      timestamp: new Date().toISOString(),
      errorId: generateErrorId()
    };
  }

  /**
   * Checks if the service is currently monitoring sessions
   */
  isMonitoring(): boolean {
    return this.validationInterval !== null;
  }

  /**
   * Gets session recovery statistics
   */
  getRecoveryStats() {
    return this.recoveryManager.getRecoveryStats();
  }
}

/**
 * React hook for session management with automatic recovery
 */
export function useSessionRecovery(options?: SessionRecoveryOptions) {
  const defaultOptions = {
    autoRefresh: true,
    maxRetries: 3,
    retryDelay: 1000,
    onRecoveryFailure: () => {},
    onSessionExpired: () => {}
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  const mergedOptions = { ...defaultOptions, ...options };
  const [sessionStatus, setSessionStatus] = React.useState<SessionStatus | null>(null);
  const [isValidating, setIsValidating] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  
  const service = React.useMemo(() => SessionRecoveryService.getInstance(), []);

  const validateSession = React.useCallback(async () => {
    setIsValidating(true);
    setError(null);
    
    try {
      const status = await service.validateSession({
        ...options,
        onRecoveryFailure: (err) => {
          setError(err);
          options.onRecoveryFailure?.(err);
        }
      });
      setSessionStatus(status);
      return status;
    } catch (err) {
      const apiError = err instanceof Error ? 
        service['createSessionError'](err.message) : 
        service['createSessionError']('Session validation failed');
      setError(apiError);
      throw apiError;
    } finally {
      setIsValidating(false);
    }
  }, [service, options]);

  const refreshSession = React.useCallback(async () => {
    setIsValidating(true);
    setError(null);
    
    try {
      const status = await service.refreshSession({
        ...options,
        onRecoveryFailure: (err) => {
          setError(err);
          options.onRecoveryFailure?.(err);
        }
      });
      setSessionStatus(status);
      return status;
    } catch (err) {
      const apiError = err instanceof Error ? 
        service['createSessionError'](err.message) : 
        service['createSessionError']('Session refresh failed');
      setError(apiError);
      throw apiError;
    } finally {
      setIsValidating(false);
    }
  }, [service, options]);

  const clearSession = React.useCallback(async () => {
    await service.clearSession();
    setSessionStatus(null);
    setError(null);
  }, [service]);

  // Start monitoring on mount
  React.useEffect(() => {
    const cleanup = service.startSessionMonitoring(60000, {
      ...options,
      onSessionExpired: () => {
        setSessionStatus(prev => prev ? { ...prev, isValid: false, isExpired: true } : null);
        options.onSessionExpired?.();
      }
    });

    // Initial validation
    validateSession();

    return cleanup;
  }, [service, validateSession, options]);

  return {
    sessionStatus,
    isValidating,
    error,
    validateSession,
    refreshSession,
    clearSession,
    isMonitoring: service.isMonitoring(),
    recoveryStats: service.getRecoveryStats()
  };
}

// Export singleton instance for direct use
export const sessionRecoveryService = SessionRecoveryService.getInstance();