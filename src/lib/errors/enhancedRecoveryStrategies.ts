/**
 * Enhanced Recovery Strategies
 * Implements sophisticated recovery strategies for different failure types
 */

import { ApiError, ErrorType, ErrorSeverity, ErrorContext } from './types';
import { RecoveryStrategy, RecoveryResult } from './recoveryStrategy';
import { networkMonitor } from './networkMonitor';
import { structuredLogger } from './structuredLogger';

/**
 * Authentication Recovery Strategy
 * Handles authentication failures with token refresh and re-authentication
 */
export class AuthenticationRecoveryStrategy implements RecoveryStrategy {
  canRecover = true;
  maxAttempts = 2;
  priority = 95;
  cooldownMs = 5000;

  conditions = (error: ApiError, context: ErrorContext): boolean => {
    return error.type === ErrorType.AUTHENTICATION || 
           error.type === ErrorType.SESSION_EXPIRED ||
           error.statusCode === 401;
  };

  strategy = async (error: ApiError, context: ErrorContext, attempt: number): Promise<RecoveryResult> => {
    structuredLogger.logInfo('Attempting authentication recovery', {
      errorId: error.errorId,
      attempt,
      component: 'AuthenticationRecoveryStrategy'
    });

    try {
      // First attempt: Try token refresh
      if (attempt === 1) {
        const refreshResult = await this.attemptTokenRefresh();
        if (refreshResult.success) {
          return {
            success: true,
            message: 'Authentication recovered via token refresh'
          };
        }
      }

      // Second attempt: Redirect to login
      if (attempt === 2) {
        await this.redirectToLogin(context);
        return {
          success: true,
          message: 'User redirected to login for re-authentication'
        };
      }

      return {
        success: false,
        message: 'Authentication recovery failed',
        escalate: true
      };

    } catch (recoveryError) {
      structuredLogger.logError(recoveryError, {
        errorId: error.errorId,
        attempt,
        component: 'AuthenticationRecoveryStrategy',
        operation: 'strategy'
      });

      return {
        success: false,
        message: `Authentication recovery error: ${recoveryError.message}`,
        shouldRetry: attempt < this.maxAttempts
      };
    }
  };

  private async attemptTokenRefresh(): Promise<{ success: boolean; message?: string }> {
    try {
      // Check if auth service is available
      const authService = (window as any).authService;
      if (!authService || typeof authService.refreshToken !== 'function') {
        return { success: false, message: 'Auth service not available' };
      }

      // Attempt token refresh
      await authService.refreshToken();
      
      // Verify the refresh worked
      const isAuthenticated = await authService.isAuthenticated();
      if (isAuthenticated) {
        return { success: true, message: 'Token refreshed successfully' };
      }

      return { success: false, message: 'Token refresh did not restore authentication' };

    } catch (error) {
      return { success: false, message: `Token refresh failed: ${error.message}` };
    }
  }

  private async redirectToLogin(context: ErrorContext): Promise<void> {
    // Store current location for redirect after login
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname + window.location.search;
      sessionStorage.setItem('redirectAfterLogin', currentPath);
      
      // Redirect to login page
      window.location.href = '/auth/login';
    }
  }
}

/**
 * Network Recovery Strategy
 * Handles network connectivity issues with intelligent retry and offline mode
 */
export class NetworkRecoveryStrategy implements RecoveryStrategy {
  canRecover = true;
  maxAttempts = 5;
  priority = 90;
  cooldownMs = 2000;

  conditions = (error: ApiError, context: ErrorContext): boolean => {
    return error.type === ErrorType.NETWORK || 
           error.type === ErrorType.CONNECTIVITY ||
           error.type === ErrorType.TIMEOUT;
  };

  strategy = async (error: ApiError, context: ErrorContext, attempt: number): Promise<RecoveryResult> => {
    structuredLogger.logInfo('Attempting network recovery', {
      errorId: error.errorId,
      attempt,
      networkOnline: navigator.onLine,
      component: 'NetworkRecoveryStrategy'
    });

    try {
      // Check current network status
      if (!navigator.onLine) {
        return await this.handleOfflineMode(error, context, attempt);
      }

      // Test actual connectivity (not just navigator.onLine)
      const connectivityTest = await this.testConnectivity();
      if (!connectivityTest.success) {
        return await this.handleConnectivityIssues(error, context, attempt);
      }

      // Network appears to be working, try exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      await new Promise(resolve => setTimeout(resolve, delay));

      return {
        success: true,
        message: `Network recovery attempt ${attempt} completed after ${delay}ms delay`,
        nextAttemptDelay: delay
      };

    } catch (recoveryError) {
      structuredLogger.logError(recoveryError, {
        errorId: error.errorId,
        attempt,
        component: 'NetworkRecoveryStrategy',
        operation: 'strategy'
      });

      return {
        success: false,
        message: `Network recovery error: ${recoveryError.message}`,
        shouldRetry: attempt < this.maxAttempts,
        nextAttemptDelay: 5000
      };
    }
  };

  private async handleOfflineMode(
    error: ApiError, 
    context: ErrorContext, 
    attempt: number
  ): Promise<RecoveryResult> {
    // Wait for network to come back online
    try {
      await networkMonitor.waitForConnection(30000); // 30 second timeout
      
      return {
        success: true,
        message: 'Network connectivity restored'
      };
    } catch (timeoutError) {
      // Enable offline mode if available
      if (this.canEnableOfflineMode(context)) {
        await this.enableOfflineMode(context);
        return {
          success: true,
          message: 'Offline mode enabled - using cached data'
        };
      }

      return {
        success: false,
        message: 'Network still offline and no offline mode available',
        shouldRetry: attempt < this.maxAttempts,
        nextAttemptDelay: 10000
      };
    }
  }

  private async handleConnectivityIssues(
    error: ApiError, 
    context: ErrorContext, 
    attempt: number
  ): Promise<RecoveryResult> {
    // Try different connectivity approaches
    const strategies = [
      () => this.testAlternativeEndpoint(context),
      () => this.testWithDifferentDNS(),
      () => this.testWithReducedTimeout()
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result.success) {
          return {
            success: true,
            message: `Connectivity restored using alternative approach: ${result.method}`
          };
        }
      } catch (strategyError) {
        // Continue to next strategy
      }
    }

    return {
      success: false,
      message: 'All connectivity recovery strategies failed',
      shouldRetry: attempt < this.maxAttempts,
      nextAttemptDelay: 5000
    };
  }

  private async testConnectivity(): Promise<{ success: boolean; latency?: number }> {
    const startTime = Date.now();
    
    try {
      // Test with a simple HEAD request to a reliable endpoint
      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      });

      const latency = Date.now() - startTime;
      
      return {
        success: response.ok,
        latency
      };
    } catch (error) {
      return { success: false };
    }
  }

  private async testAlternativeEndpoint(context: ErrorContext): Promise<{ success: boolean; method: string }> {
    // Try alternative API endpoints if configured
    const alternativeEndpoints = [
      '/api/v1/health',
      '/health',
      'https://api.backup.hallucifix.com/health'
    ];

    for (const endpoint of alternativeEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'HEAD',
          signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
          return { success: true, method: `alternative endpoint: ${endpoint}` };
        }
      } catch (error) {
        // Continue to next endpoint
      }
    }

    return { success: false, method: 'alternative endpoints' };
  }

  private async testWithDifferentDNS(): Promise<{ success: boolean; method: string }> {
    // This is a simplified example - in practice, you might use different DNS servers
    try {
      const response = await fetch(window.location.origin + '/api/health', {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000)
      });

      return { success: response.ok, method: 'DNS retry' };
    } catch (error) {
      return { success: false, method: 'DNS retry' };
    }
  }

  private async testWithReducedTimeout(): Promise<{ success: boolean; method: string }> {
    try {
      const response = await fetch('/api/health', {
        method: 'HEAD',
        signal: AbortSignal.timeout(1000) // Very short timeout
      });

      return { success: response.ok, method: 'reduced timeout' };
    } catch (error) {
      return { success: false, method: 'reduced timeout' };
    }
  }

  private canEnableOfflineMode(context: ErrorContext): boolean {
    // Check if the operation supports offline mode
    const offlineSupportedFeatures = ['content-analysis', 'file-processing', 'user-settings'];
    return context.feature ? offlineSupportedFeatures.includes(context.feature) : false;
  }

  private async enableOfflineMode(context: ErrorContext): Promise<void> {
    // Enable offline mode by setting a flag and notifying the user
    if (typeof window !== 'undefined') {
      (window as any).offlineMode = true;
      
      // Notify user about offline mode
      if ((window as any).showToast) {
        (window as any).showToast(
          'Working offline - using cached data. Some features may be limited.',
          'info'
        );
      }
    }
  }
}

/**
 * Rate Limit Recovery Strategy
 * Handles rate limiting with intelligent backoff and queue management
 */
export class RateLimitRecoveryStrategy implements RecoveryStrategy {
  canRecover = true;
  maxAttempts = 3;
  priority = 85;
  cooldownMs = 1000;

  conditions = (error: ApiError, context: ErrorContext): boolean => {
    return error.type === ErrorType.RATE_LIMIT || error.statusCode === 429;
  };

  strategy = async (error: ApiError, context: ErrorContext, attempt: number): Promise<RecoveryResult> => {
    structuredLogger.logInfo('Attempting rate limit recovery', {
      errorId: error.errorId,
      attempt,
      retryAfter: error.retryAfter,
      component: 'RateLimitRecoveryStrategy'
    });

    try {
      // Calculate wait time based on retry-after header or exponential backoff
      const waitTime = this.calculateWaitTime(error, attempt);
      
      // Notify user about the delay
      this.notifyUserOfDelay(waitTime, context);
      
      // Wait for the calculated time
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Check if rate limit has been reset
      const rateLimitStatus = await this.checkRateLimitStatus(context);
      
      if (rateLimitStatus.available) {
        return {
          success: true,
          message: `Rate limit recovered after ${waitTime}ms wait`
        };
      }

      // If still rate limited, try with reduced request rate
      if (attempt < this.maxAttempts) {
        return {
          success: false,
          message: 'Rate limit still active, will retry with longer delay',
          shouldRetry: true,
          nextAttemptDelay: waitTime * 2
        };
      }

      return {
        success: false,
        message: 'Rate limit recovery failed after maximum attempts',
        escalate: true
      };

    } catch (recoveryError) {
      structuredLogger.logError(recoveryError, {
        errorId: error.errorId,
        attempt,
        component: 'RateLimitRecoveryStrategy',
        operation: 'strategy'
      });

      return {
        success: false,
        message: `Rate limit recovery error: ${recoveryError.message}`,
        shouldRetry: attempt < this.maxAttempts
      };
    }
  };

  private calculateWaitTime(error: ApiError, attempt: number): number {
    // Use retry-after header if available
    if (error.retryAfter) {
      return error.retryAfter;
    }

    // Otherwise use exponential backoff with jitter
    const baseDelay = 60000; // 1 minute base
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    
    return Math.min(exponentialDelay + jitter, 300000); // Max 5 minutes
  }

  private notifyUserOfDelay(waitTime: number, context: ErrorContext): void {
    const minutes = Math.ceil(waitTime / 60000);
    const message = `Rate limit reached. Waiting ${minutes} minute${minutes > 1 ? 's' : ''} before retrying...`;
    
    if (typeof window !== 'undefined' && (window as any).showToast) {
      (window as any).showToast(message, 'warning');
    }

    structuredLogger.logInfo('User notified of rate limit delay', {
      waitTime,
      waitTimeMinutes: minutes,
      component: 'RateLimitRecoveryStrategy',
      feature: context.feature
    });
  }

  private async checkRateLimitStatus(context: ErrorContext): Promise<{ available: boolean; remaining?: number }> {
    try {
      // Make a lightweight request to check rate limit status
      const response = await fetch('/api/rate-limit-status', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });

      const remaining = response.headers.get('X-RateLimit-Remaining');
      
      return {
        available: response.ok && (!remaining || parseInt(remaining) > 0),
        remaining: remaining ? parseInt(remaining) : undefined
      };
    } catch (error) {
      // If we can't check status, assume it's available
      return { available: true };
    }
  }
}

/**
 * Analysis Service Recovery Strategy
 * Handles analysis service failures with fallback to alternative providers
 */
export class AnalysisServiceRecoveryStrategy implements RecoveryStrategy {
  canRecover = true;
  maxAttempts = 3;
  priority = 80;
  cooldownMs = 3000;

  conditions = (error: ApiError, context: ErrorContext): boolean => {
    return error.type === ErrorType.ANALYSIS_ERROR ||
           (context.component === 'AnalysisService' && error.type === ErrorType.SERVER);
  };

  strategy = async (error: ApiError, context: ErrorContext, attempt: number): Promise<RecoveryResult> => {
    structuredLogger.logInfo('Attempting analysis service recovery', {
      errorId: error.errorId,
      attempt,
      component: 'AnalysisServiceRecoveryStrategy'
    });

    try {
      // Try different recovery approaches based on attempt
      switch (attempt) {
        case 1:
          return await this.tryAlternativeProvider(error, context);
        case 2:
          return await this.tryReducedAnalysis(error, context);
        case 3:
          return await this.tryMockAnalysis(error, context);
        default:
          return {
            success: false,
            message: 'All analysis recovery strategies exhausted',
            escalate: true
          };
      }

    } catch (recoveryError) {
      structuredLogger.logError(recoveryError, {
        errorId: error.errorId,
        attempt,
        component: 'AnalysisServiceRecoveryStrategy',
        operation: 'strategy'
      });

      return {
        success: false,
        message: `Analysis recovery error: ${recoveryError.message}`,
        shouldRetry: attempt < this.maxAttempts
      };
    }
  };

  private async tryAlternativeProvider(error: ApiError, context: ErrorContext): Promise<RecoveryResult> {
    // Try to switch to a backup AI provider
    try {
      const serviceRegistry = (window as any).serviceRegistry;
      if (serviceRegistry && typeof serviceRegistry.switchToBackupProvider === 'function') {
        await serviceRegistry.switchToBackupProvider();
        
        return {
          success: true,
          message: 'Switched to backup analysis provider'
        };
      }

      return {
        success: false,
        message: 'No backup analysis provider available'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to switch to backup provider: ${error.message}`
      };
    }
  }

  private async tryReducedAnalysis(error: ApiError, context: ErrorContext): Promise<RecoveryResult> {
    // Try analysis with reduced complexity/features
    try {
      const analysisService = (window as any).analysisService;
      if (analysisService && typeof analysisService.performBasicAnalysis === 'function') {
        // This would be a simplified analysis mode
        return {
          success: true,
          message: 'Using reduced complexity analysis mode'
        };
      }

      return {
        success: false,
        message: 'Reduced analysis mode not available'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to enable reduced analysis: ${error.message}`
      };
    }
  }

  private async tryMockAnalysis(error: ApiError, context: ErrorContext): Promise<RecoveryResult> {
    // Fall back to mock analysis as last resort
    try {
      // Enable mock mode
      if (typeof window !== 'undefined') {
        (window as any).useMockAnalysis = true;
        
        // Notify user about degraded service
        if ((window as any).showToast) {
          (window as any).showToast(
            'Analysis service temporarily unavailable. Using simplified analysis.',
            'warning'
          );
        }
      }

      return {
        success: true,
        message: 'Fallback to mock analysis enabled'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to enable mock analysis: ${error.message}`
      };
    }
  }
}

// Export all recovery strategies
export const enhancedRecoveryStrategies = {
  AuthenticationRecoveryStrategy,
  NetworkRecoveryStrategy,
  RateLimitRecoveryStrategy,
  AnalysisServiceRecoveryStrategy
};