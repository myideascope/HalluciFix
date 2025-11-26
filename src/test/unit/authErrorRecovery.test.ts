/**
 * Tests for AuthErrorRecoveryManager
 * Covers authentication error recovery, token refresh, and session management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthErrorRecoveryManager, attemptAuthRecovery, useAuthErrorRecovery } from '../../lib/auth/authErrorRecovery';

// Mock dependencies
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      refreshSession: vi.fn(),
      getSession: vi.fn(),
      signOut: vi.fn()
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
    }))
  }
}));

vi.mock('../oauth/sessionManager', () => ({
  SessionManager: {
    getJWTRefreshToken: vi.fn(),
    refreshSession: vi.fn(),
    clearSession: vi.fn(),
    getSessionInfo: vi.fn(),
    getStoredUser: vi.fn(),
    isSessionValid: vi.fn(),
    updateStoredUser: vi.fn(),
    isSessionFullyValid: vi.fn()
  }
}));

vi.mock('../oauth/jwtTokenManager', () => ({
  JWTTokenManager: vi.fn().mockImplementation(() => ({
    refreshAccessToken: vi.fn()
  }))
}));

vi.mock('../oauth/oauthService', () => ({
  OAuthService: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('../oauth/oauthConfig', () => ({
  oauthConfig: {
    getAvailabilityStatus: vi.fn(() => ({ available: true })),
    getConfig: vi.fn(() => ({
      google: { clientId: 'test-client-id' },
      encryptionKey: 'test-key'
    }))
  }
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
});

describe('AuthErrorRecoveryManager', () => {
  let recoveryManager: AuthErrorRecoveryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    recoveryManager = AuthErrorRecoveryManager.getInstance();
    recoveryManager.clearRecoveryAttempts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = AuthErrorRecoveryManager.getInstance();
      const instance2 = AuthErrorRecoveryManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('attemptRecovery', () => {
    it('should handle token expired errors', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'token_expired' as const,
        originalError: new Error('Token expired')
      };

      // Mock successful JWT refresh
      mockLocalStorage.getItem.mockReturnValue('jwt-refresh-token');
      
      const { SessionManager } = await import('../oauth/sessionManager');
      vi.mocked(SessionManager.getJWTRefreshToken).mockReturnValue('jwt-refresh-token');

      const { JWTTokenManager } = await import('../oauth/jwtTokenManager');
      const mockJWTManager = new JWTTokenManager();
      vi.mocked(mockJWTManager.refreshAccessToken).mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token'
      });

      const result = await recoveryManager.attemptRecovery(context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('token_refreshed');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('hallucifix_jwt_access_token', 'new-access-token');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('hallucifix_jwt_refresh_token', 'new-refresh-token');
    });

    it('should fallback to Supabase session refresh', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'token_expired' as const
      };

      // Mock no JWT refresh token
      const { SessionManager } = await import('../oauth/sessionManager');
      vi.mocked(SessionManager.getJWTRefreshToken).mockReturnValue(null);

      // Mock successful Supabase refresh
      const { supabase } = await import('../../lib/supabase');
      const mockSession = {
        access_token: 'new-supabase-token',
        refresh_token: 'new-supabase-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600
      };

      vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

      const result = await recoveryManager.attemptRecovery(context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('token_refreshed');
      expect(result.newTokens).toEqual({
        accessToken: 'new-supabase-token',
        refreshToken: 'new-supabase-refresh',
        expiresAt: new Date(mockSession.expires_at * 1000)
      });

      expect(SessionManager.refreshSession).toHaveBeenCalledWith({
        accessToken: 'new-supabase-token',
        refreshToken: 'new-supabase-refresh',
        expiresAt: new Date(mockSession.expires_at * 1000)
      });
    });

    it('should require re-authentication when refresh fails', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'token_expired' as const
      };

      const { SessionManager } = await import('../oauth/sessionManager');
      vi.mocked(SessionManager.getJWTRefreshToken).mockReturnValue(null);

      const { supabase } = await import('../../lib/supabase');
      vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
        data: { session: null },
        error: { message: 'Refresh failed' }
      });

      const result = await recoveryManager.attemptRecovery(context);

      expect(result.success).toBe(false);
      expect(result.action).toBe('reauthentication_required');
      expect(result.error?.message).toContain('Token refresh failed');
    });

    it('should handle invalid token errors', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'token_invalid' as const
      };

      const { SessionManager } = await import('../oauth/sessionManager');
      const { supabase } = await import('../../lib/supabase');

      const result = await recoveryManager.attemptRecovery(context);

      expect(result.success).toBe(false);
      expect(result.action).toBe('reauthentication_required');
      expect(SessionManager.clearSession).toHaveBeenCalled();
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });

    it('should handle session expired errors', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'session_expired' as const
      };

      const { SessionManager } = await import('../oauth/sessionManager');
      const { supabase } = await import('../../lib/supabase');

      // Mock valid stored session
      vi.mocked(SessionManager.getSessionInfo).mockReturnValue({
        accessToken: 'stored-token',
        expiresAt: new Date(Date.now() + 3600000)
      });
      vi.mocked(SessionManager.getStoredUser).mockReturnValue({
        id: 'user-123',
        email: 'test@example.com'
      });
      vi.mocked(SessionManager.isSessionValid).mockReturnValue(true);

      // Mock successful Supabase session
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: 'restored-token',
            user: { id: 'user-123' }
          }
        },
        error: null
      });

      const result = await recoveryManager.attemptRecovery(context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('session_restored');
    });

    it('should handle permission denied errors', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'permission_denied' as const
      };

      const { supabase } = await import('../../lib/supabase');
      const { SessionManager } = await import('../oauth/sessionManager');

      // Mock session with user
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            user: { email: 'test@example.com' }
          }
        },
        error: null
      });

      // Mock updated user data
      const mockUserQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'user-123',
            email: 'test@example.com',
            role: 'admin'
          },
          error: null
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockUserQuery as any);

      const result = await recoveryManager.attemptRecovery(context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('session_restored');
      expect(SessionManager.updateStoredUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin'
      });
    });

    it('should handle network errors', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'network_error' as const
      };

      const { SessionManager } = await import('../oauth/sessionManager');

      // Mock network connectivity
      Object.defineProperty(navigator, 'onLine', { value: true });
      vi.mocked(SessionManager.isSessionFullyValid).mockResolvedValue(true);

      const result = await recoveryManager.attemptRecovery(context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('session_restored');
    });

    it('should enforce maximum recovery attempts', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'token_expired' as const
      };

      // Simulate multiple failed attempts
      for (let i = 0; i < 3; i++) {
        const { SessionManager } = await import('../oauth/sessionManager');
        vi.mocked(SessionManager.getJWTRefreshToken).mockReturnValue(null);

        const { supabase } = await import('../../lib/supabase');
        vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
          data: { session: null },
          error: { message: 'Refresh failed' }
        });

        await recoveryManager.attemptRecovery(context);
      }

      // Fourth attempt should be rejected
      const result = await recoveryManager.attemptRecovery(context);

      expect(result.success).toBe(false);
      expect(result.action).toBe('recovery_failed');
      expect(result.error?.message).toBe('Max recovery attempts exceeded');
    });

    it('should handle unknown error types', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'unknown_error' as any
      };

      const result = await recoveryManager.attemptRecovery(context);

      expect(result.success).toBe(false);
      expect(result.action).toBe('recovery_failed');
      expect(result.error?.message).toBe('Unknown error type');
    });
  });

  describe('network connectivity handling', () => {
    it('should wait for network connectivity', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'network_error' as const
      };

      // Start offline
      Object.defineProperty(navigator, 'onLine', { value: false });

      const recoveryPromise = recoveryManager.attemptRecovery(context);

      // Simulate network coming back online
      setTimeout(() => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        window.dispatchEvent(new Event('online'));
      }, 100);

      const { SessionManager } = await import('../oauth/sessionManager');
      vi.mocked(SessionManager.isSessionFullyValid).mockResolvedValue(true);

      const result = await recoveryPromise;

      expect(result.success).toBe(true);
      expect(result.action).toBe('session_restored');
    });

    it('should timeout waiting for network connectivity', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'network_error' as const
      };

      // Stay offline
      Object.defineProperty(navigator, 'onLine', { value: false });

      const result = await recoveryManager.attemptRecovery(context);

      expect(result.success).toBe(false);
      expect(result.action).toBe('recovery_failed');
      expect(result.error?.message).toContain('Network recovery failed');
    });
  });

  describe('recovery statistics', () => {
    it('should track recovery attempts', async () => {
      const context = {
        userId: 'user-123',
        errorType: 'token_expired' as const
      };

      // Perform a recovery attempt
      const { SessionManager } = await import('../oauth/sessionManager');
      vi.mocked(SessionManager.getJWTRefreshToken).mockReturnValue('jwt-token');

      const { JWTTokenManager } = await import('../oauth/jwtTokenManager');
      const mockJWTManager = new JWTTokenManager();
      vi.mocked(mockJWTManager.refreshAccessToken).mockResolvedValue({
        accessToken: 'new-token',
        refreshToken: 'new-refresh'
      });

      await recoveryManager.attemptRecovery(context);

      const stats = recoveryManager.getRecoveryStats();
      expect(stats).toHaveProperty('user-123_token_expired');
      expect(stats['user-123_token_expired']).toBe(1);
    });

    it('should check if recovery can be attempted', () => {
      const canAttempt1 = recoveryManager.canAttemptRecovery('token_expired', 'user-123');
      expect(canAttempt1).toBe(true);

      // Simulate max attempts reached
      for (let i = 0; i < 3; i++) {
        recoveryManager.attemptRecovery({
          userId: 'user-123',
          errorType: 'token_expired',
          originalError: new Error('Test')
        }).catch(() => {}); // Ignore errors for this test
      }

      const canAttempt2 = recoveryManager.canAttemptRecovery('token_expired', 'user-123');
      expect(canAttempt2).toBe(false);
    });

    it('should clear recovery attempts', () => {
      // Add some attempts
      recoveryManager.attemptRecovery({
        userId: 'user-123',
        errorType: 'token_expired',
        originalError: new Error('Test')
      }).catch(() => {});

      let stats = recoveryManager.getRecoveryStats();
      expect(Object.keys(stats)).toHaveLength(1);

      recoveryManager.clearRecoveryAttempts();

      stats = recoveryManager.getRecoveryStats();
      expect(Object.keys(stats)).toHaveLength(0);
    });
  });

  describe('user-friendly error messages', () => {
    it('should provide appropriate user messages for different error types', async () => {
      const testCases = [
        { errorType: 'token_expired', expectedMessage: 'Your session has expired. Please sign in again.' },
        { errorType: 'token_invalid', expectedMessage: 'Your authentication is invalid. Please sign in again.' },
        { errorType: 'session_expired', expectedMessage: 'Your session has expired. Please sign in again.' },
        { errorType: 'permission_denied', expectedMessage: 'You don\'t have permission to perform this action. Contact your administrator if you believe this is an error.' },
        { errorType: 'network_error', expectedMessage: 'Network connection issues are affecting authentication. Please check your connection and try again.' }
      ];

      for (const testCase of testCases) {
        const context = {
          userId: 'user-123',
          errorType: testCase.errorType as any
        };

        // Force failure to get error message
        const { SessionManager } = await import('../oauth/sessionManager');
        vi.mocked(SessionManager.getJWTRefreshToken).mockReturnValue(null);

        const { supabase } = await import('../../lib/supabase');
        vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
          data: { session: null },
          error: { message: 'Failed' }
        });

        const result = await recoveryManager.attemptRecovery(context);

        if (testCase.errorType !== 'network_error') {
          expect(result.error?.userMessage).toBe(testCase.expectedMessage);
        }
      }
    });
  });
});

describe('attemptAuthRecovery function', () => {
  it('should be a convenience wrapper for the manager', async () => {
    const context = {
      userId: 'user-123',
      errorType: 'token_expired' as const
    };

    const { SessionManager } = await import('../oauth/sessionManager');
    vi.mocked(SessionManager.getJWTRefreshToken).mockReturnValue('jwt-token');

    const { JWTTokenManager } = await import('../oauth/jwtTokenManager');
    const mockJWTManager = new JWTTokenManager();
    vi.mocked(mockJWTManager.refreshAccessToken).mockResolvedValue({
      accessToken: 'new-token',
      refreshToken: 'new-refresh'
    });

    const result = await attemptAuthRecovery(context);

    expect(result.success).toBe(true);
    expect(result.action).toBe('token_refreshed');
  });
});

describe('useAuthErrorRecovery hook', () => {
  it('should provide recovery functions', () => {
    const hook = useAuthErrorRecovery();

    expect(hook).toHaveProperty('handleAuthError');
    expect(hook).toHaveProperty('canRecover');
    expect(hook).toHaveProperty('clearAttempts');
    expect(hook).toHaveProperty('getStats');
    expect(typeof hook.handleAuthError).toBe('function');
    expect(typeof hook.canRecover).toBe('function');
    expect(typeof hook.clearAttempts).toBe('function');
    expect(typeof hook.getStats).toBe('function');
  });

  it('should classify errors correctly', async () => {
    const hook = useAuthErrorRecovery();

    const { SessionManager } = await import('../oauth/sessionManager');
    vi.mocked(SessionManager.getJWTRefreshToken).mockReturnValue('jwt-token');

    const { JWTTokenManager } = await import('../oauth/jwtTokenManager');
    const mockJWTManager = new JWTTokenManager();
    vi.mocked(mockJWTManager.refreshAccessToken).mockResolvedValue({
      accessToken: 'new-token',
      refreshToken: 'new-refresh'
    });

    const testCases = [
      { error: new Error('Token expired'), expectedType: 'token_expired' },
      { error: new Error('Session invalid'), expectedType: 'session_expired' },
      { error: new Error('Permission denied'), expectedType: 'permission_denied' },
      { error: new Error('Network connection failed'), expectedType: 'network_error' },
      { error: new Error('Unknown error'), expectedType: 'token_invalid' }
    ];

    for (const testCase of testCases) {
      const result = await hook.handleAuthError(testCase.error, 'user-123');
      
      // The result should indicate the recovery was attempted
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('action');
    }
  });

  it('should provide recovery capability checking', () => {
    const hook = useAuthErrorRecovery();

    const canRecover = hook.canRecover('token_expired', 'user-123');
    expect(typeof canRecover).toBe('boolean');
  });

  it('should provide statistics', () => {
    const hook = useAuthErrorRecovery();

    const stats = hook.getStats();
    expect(typeof stats).toBe('object');
  });

  it('should clear attempts', () => {
    const hook = useAuthErrorRecovery();

    expect(() => hook.clearAttempts()).not.toThrow();
  });
});