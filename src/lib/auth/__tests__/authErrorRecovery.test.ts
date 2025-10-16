/**
 * Authentication Error Recovery Tests
 * Tests for the authentication error recovery system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before importing the module
vi.mock('../../supabase', () => ({
  supabase: {
    auth: {
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null })
    }
  }
}));

vi.mock('../../oauth/sessionManager', () => ({
  SessionManager: {
    getJWTRefreshToken: vi.fn().mockReturnValue(null),
    getSessionInfo: vi.fn().mockReturnValue(null),
    getStoredUser: vi.fn().mockReturnValue(null),
    isSessionValid: vi.fn().mockReturnValue(false),
    clearSession: vi.fn().mockResolvedValue(undefined),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    updateStoredUser: vi.fn(),
    isSessionFullyValid: vi.fn().mockResolvedValue(false)
  }
}));

vi.mock('../../oauth/jwtTokenManager', () => ({
  JWTTokenManager: vi.fn().mockImplementation(() => ({
    refreshAccessToken: vi.fn().mockResolvedValue(null),
    revokeAllUserSessions: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../../oauth/oauthConfig', () => ({
  oauthConfig: {
    getAvailabilityStatus: vi.fn().mockReturnValue({ available: false, reason: 'Test environment' }),
    getConfig: vi.fn().mockReturnValue({})
  }
}));

vi.mock('../../oauth/oauthService', () => ({
  OAuthService: vi.fn().mockImplementation(() => ({}))
}));

// Import after mocking
import { AuthErrorRecoveryManager, AuthErrorContext } from '../authErrorRecovery';

describe('AuthErrorRecoveryManager', () => {
  let manager: AuthErrorRecoveryManager;

  beforeEach(() => {
    manager = AuthErrorRecoveryManager.getInstance();
    manager.clearRecoveryAttempts();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('attemptRecovery', () => {
    it('should handle token expired errors', async () => {
      const context: AuthErrorContext = {
        userId: 'test-user',
        errorType: 'token_expired',
        originalError: new Error('Token expired')
      };

      const result = await manager.attemptRecovery(context);
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.action).toBeDefined();
    });

    it('should handle network errors', async () => {
      const context: AuthErrorContext = {
        userId: 'test-user',
        errorType: 'network_error',
        originalError: new Error('Network connection failed')
      };

      const result = await manager.attemptRecovery(context);
      
      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });

    it('should limit recovery attempts', async () => {
      const context: AuthErrorContext = {
        userId: 'test-user',
        errorType: 'token_expired',
        originalError: new Error('Token expired')
      };

      // Attempt recovery multiple times
      for (let i = 0; i < 5; i++) {
        await manager.attemptRecovery(context);
      }

      const result = await manager.attemptRecovery(context);
      expect(result.success).toBe(false);
      expect(result.action).toBe('recovery_failed');
    });

    it('should track recovery attempts', () => {
      const canRecover = manager.canAttemptRecovery('token_expired', 'test-user');
      expect(canRecover).toBe(true);
    });
  });

  describe('canAttemptRecovery', () => {
    it('should return true for new recovery attempts', () => {
      const canRecover = manager.canAttemptRecovery('token_expired', 'test-user');
      expect(canRecover).toBe(true);
    });

    it('should return false after max attempts', async () => {
      const context: AuthErrorContext = {
        userId: 'test-user',
        errorType: 'token_expired',
        originalError: new Error('Token expired')
      };

      // Exhaust recovery attempts
      for (let i = 0; i < 4; i++) {
        await manager.attemptRecovery(context);
      }

      const canRecover = manager.canAttemptRecovery('token_expired', 'test-user');
      expect(canRecover).toBe(false);
    });
  });

  describe('getRecoveryStats', () => {
    it('should return recovery statistics', async () => {
      const context: AuthErrorContext = {
        userId: 'test-user',
        errorType: 'token_expired',
        originalError: new Error('Token expired')
      };

      await manager.attemptRecovery(context);
      
      const stats = manager.getRecoveryStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });
  });
});