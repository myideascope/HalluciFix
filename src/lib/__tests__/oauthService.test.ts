/**
 * Tests for OAuthService
 * Covers OAuth authentication flow, token management, and service integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OAuthService } from '../oauth/oauthService';

// Mock dependencies
vi.mock('../oauth/tokenManager', () => ({
  TokenManager: vi.fn().mockImplementation(() => ({
    storeTokens: vi.fn(),
    getValidTokens: vi.fn(),
    hasValidTokens: vi.fn(),
    getTokenStats: vi.fn()
  }))
}));

vi.mock('../oauth/tokenRefreshService', () => ({
  TokenRefreshService: vi.fn().mockImplementation(() => ({
    startScheduler: vi.fn(),
    stopScheduler: vi.fn(),
    refreshUserTokens: vi.fn(),
    getStats: vi.fn(() => ({ isRunning: true })),
    updateConfig: vi.fn()
  }))
}));

vi.mock('../oauth/tokenCleanupService', () => ({
  TokenCleanupService: vi.fn().mockImplementation(() => ({
    startCleanupScheduler: vi.fn(),
    stopCleanupScheduler: vi.fn(),
    revokeUserTokens: vi.fn(),
    revokeAllTokens: vi.fn(),
    performCleanup: vi.fn(),
    getCleanupInfo: vi.fn(() => ({ nextCleanupTime: new Date() })),
    getStats: vi.fn(() => ({ nextCleanupTime: new Date() })),
    updateConfig: vi.fn()
  }))
}));

vi.mock('../oauth/googleProvider', () => ({
  GoogleOAuthProvider: vi.fn().mockImplementation(() => ({
    initiateAuth: vi.fn(),
    handleCallback: vi.fn()
  }))
}));

vi.mock('../oauth/stateManager', () => ({
  StateManager: vi.fn().mockImplementation(() => ({
    createState: vi.fn(),
    validateState: vi.fn()
  }))
}));

vi.mock('../oauth/profileService', () => ({
  GoogleProfileService: vi.fn().mockImplementation(() => ({
    getUserProfile: vi.fn(),
    syncProfile: vi.fn(),
    clearUserCache: vi.fn(),
    getCacheStats: vi.fn(() => ({ hits: 0, misses: 0 }))
  }))
}));

vi.mock('../oauth/oauthErrorHandler', () => ({
  OAuthErrorMonitor: {
    recordError: vi.fn()
  },
  OAuthErrorHandler: {
    logError: vi.fn(),
    getUserMessage: vi.fn((error) => `User friendly: ${error.message || error}`)
  }
}));

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let mockConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      google: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:3000/callback'
      },
      encryptionKey: 'test-encryption-key',
      autoStartServices: false // Disable auto-start for testing
    };

    oauthService = new OAuthService(mockConfig);
  });

  afterEach(() => {
    if (oauthService) {
      oauthService.stopServices();
    }
  });

  describe('initialization', () => {
    it('should initialize with provided configuration', () => {
      expect(oauthService).toBeDefined();
    });

    it('should auto-start services when enabled', () => {
      const configWithAutoStart = { ...mockConfig, autoStartServices: true };
      const serviceWithAutoStart = new OAuthService(configWithAutoStart);

      // Services should be started automatically
      expect(serviceWithAutoStart).toBeDefined();
      
      serviceWithAutoStart.stopServices();
    });
  });

  describe('initiateAuth', () => {
    it('should initiate OAuth authentication flow', async () => {
      const redirectUri = 'http://localhost:3000/callback';
      const mockState = 'test-state-123';
      const mockAuthUrl = 'https://accounts.google.com/oauth/authorize?state=test-state-123';

      // Mock state manager
      const { StateManager } = await import('../oauth/stateManager');
      const mockStateManager = new StateManager();
      vi.mocked(mockStateManager.createState).mockResolvedValue(mockState);

      // Mock Google provider
      const { GoogleOAuthProvider } = await import('../oauth/googleProvider');
      const mockGoogleProvider = new GoogleOAuthProvider(mockConfig.google);
      vi.mocked(mockGoogleProvider.initiateAuth).mockResolvedValue(mockAuthUrl);

      const result = await oauthService.initiateAuth(redirectUri);

      expect(result).toEqual({
        authUrl: mockAuthUrl,
        state: mockState
      });

      expect(mockStateManager.createState).toHaveBeenCalledWith(redirectUri);
      expect(mockGoogleProvider.initiateAuth).toHaveBeenCalledWith(redirectUri, mockState);
    });

    it('should handle initiation errors', async () => {
      const redirectUri = 'http://localhost:3000/callback';
      const error = new Error('State creation failed');

      const { StateManager } = await import('../oauth/stateManager');
      const mockStateManager = new StateManager();
      vi.mocked(mockStateManager.createState).mockRejectedValue(error);

      await expect(oauthService.initiateAuth(redirectUri))
        .rejects.toThrow('Failed to initiate auth: State creation failed');
    });
  });

  describe('handleCallback', () => {
    it('should handle OAuth callback successfully', async () => {
      const code = 'auth-code-123';
      const state = 'test-state-123';
      const redirectUri = 'http://localhost:3000/callback';
      const codeVerifier = 'test-code-verifier';

      const mockStateData = { codeVerifier };
      const mockAuthResult = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresIn: 3600,
        scope: 'profile email',
        tokenType: 'Bearer',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User'
        }
      };

      // Mock state validation
      const { StateManager } = await import('../oauth/stateManager');
      const mockStateManager = new StateManager();
      vi.mocked(mockStateManager.validateState).mockResolvedValue(mockStateData);

      // Mock Google provider callback
      const { GoogleOAuthProvider } = await import('../oauth/googleProvider');
      const mockGoogleProvider = new GoogleOAuthProvider(mockConfig.google);
      vi.mocked(mockGoogleProvider.handleCallback).mockResolvedValue(mockAuthResult);

      // Mock token manager
      const { TokenManager } = await import('../oauth/tokenManager');
      const mockTokenManager = new TokenManager(mockConfig.encryptionKey);
      vi.mocked(mockTokenManager.storeTokens).mockResolvedValue();

      const result = await oauthService.handleCallback(code, state, redirectUri);

      expect(result.user).toEqual(mockAuthResult.user);
      expect(result.tokens).toMatchObject({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresAt: expect.any(Date),
        scope: 'profile email',
        tokenType: 'Bearer'
      });

      expect(mockStateManager.validateState).toHaveBeenCalledWith(state, redirectUri);
      expect(mockGoogleProvider.handleCallback).toHaveBeenCalledWith(code, state, codeVerifier);
      expect(mockTokenManager.storeTokens).toHaveBeenCalledWith(
        mockAuthResult.user.id,
        expect.objectContaining({
          accessToken: 'access-token-123',
          refreshToken: 'refresh-token-123'
        })
      );
    });

    it('should handle missing callback parameters', async () => {
      const { OAuthErrorMonitor } = await import('../oauth/oauthErrorHandler');

      await expect(oauthService.handleCallback('', 'state', 'redirect'))
        .rejects.toThrow('User friendly: Missing required OAuth callback parameters');

      expect(OAuthErrorMonitor.recordError).toHaveBeenCalled();
    });

    it('should handle state validation failure', async () => {
      const code = 'auth-code-123';
      const state = 'invalid-state';
      const redirectUri = 'http://localhost:3000/callback';

      const { StateManager } = await import('../oauth/stateManager');
      const mockStateManager = new StateManager();
      vi.mocked(mockStateManager.validateState).mockRejectedValue(new Error('Invalid state'));

      const { OAuthErrorMonitor } = await import('../oauth/oauthErrorHandler');

      await expect(oauthService.handleCallback(code, state, redirectUri))
        .rejects.toThrow('User friendly: State validation failed - possible CSRF attack');

      expect(OAuthErrorMonitor.recordError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          code: 'auth-code-1...',
          state,
          redirectUri
        })
      );
    });

    it('should handle token exchange failure', async () => {
      const code = 'auth-code-123';
      const state = 'test-state-123';
      const redirectUri = 'http://localhost:3000/callback';

      const { StateManager } = await import('../oauth/stateManager');
      const mockStateManager = new StateManager();
      vi.mocked(mockStateManager.validateState).mockResolvedValue({ codeVerifier: 'test' });

      const { GoogleOAuthProvider } = await import('../oauth/googleProvider');
      const mockGoogleProvider = new GoogleOAuthProvider(mockConfig.google);
      vi.mocked(mockGoogleProvider.handleCallback).mockRejectedValue(new Error('Token exchange failed'));

      await expect(oauthService.handleCallback(code, state, redirectUri))
        .rejects.toThrow('User friendly: Token exchange failed');
    });

    it('should handle token storage failure', async () => {
      const code = 'auth-code-123';
      const state = 'test-state-123';
      const redirectUri = 'http://localhost:3000/callback';

      const mockAuthResult = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresIn: 3600,
        scope: 'profile email',
        tokenType: 'Bearer',
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' }
      };

      const { StateManager } = await import('../oauth/stateManager');
      const mockStateManager = new StateManager();
      vi.mocked(mockStateManager.validateState).mockResolvedValue({ codeVerifier: 'test' });

      const { GoogleOAuthProvider } = await import('../oauth/googleProvider');
      const mockGoogleProvider = new GoogleOAuthProvider(mockConfig.google);
      vi.mocked(mockGoogleProvider.handleCallback).mockResolvedValue(mockAuthResult);

      const { TokenManager } = await import('../oauth/tokenManager');
      const mockTokenManager = new TokenManager(mockConfig.encryptionKey);
      vi.mocked(mockTokenManager.storeTokens).mockRejectedValue(new Error('Storage failed'));

      await expect(oauthService.handleCallback(code, state, redirectUri))
        .rejects.toThrow('User friendly: Failed to store OAuth tokens');
    });
  });

  describe('token management', () => {
    it('should get valid tokens', async () => {
      const userId = 'user-123';
      const mockTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'profile email',
        tokenType: 'Bearer'
      };

      const { TokenManager } = await import('../oauth/tokenManager');
      const mockTokenManager = new TokenManager(mockConfig.encryptionKey);
      vi.mocked(mockTokenManager.getValidTokens).mockResolvedValue(mockTokens);

      const result = await oauthService.getValidTokens(userId);

      expect(result).toEqual(mockTokens);
      expect(mockTokenManager.getValidTokens).toHaveBeenCalledWith(userId);
    });

    it('should check if user has valid tokens', async () => {
      const userId = 'user-123';

      const { TokenManager } = await import('../oauth/tokenManager');
      const mockTokenManager = new TokenManager(mockConfig.encryptionKey);
      vi.mocked(mockTokenManager.hasValidTokens).mockResolvedValue(true);

      const result = await oauthService.hasValidTokens(userId);

      expect(result).toBe(true);
      expect(mockTokenManager.hasValidTokens).toHaveBeenCalledWith(userId);
    });

    it('should refresh user tokens', async () => {
      const userId = 'user-123';

      const { TokenRefreshService } = await import('../oauth/tokenRefreshService');
      const mockRefreshService = new TokenRefreshService({} as any);
      vi.mocked(mockRefreshService.refreshUserTokens).mockResolvedValue(true);

      const result = await oauthService.refreshUserTokens(userId);

      expect(result).toBe(true);
      expect(mockRefreshService.refreshUserTokens).toHaveBeenCalledWith(userId);
    });

    it('should revoke user tokens', async () => {
      const userId = 'user-123';
      const reason = 'User logout';

      const { TokenCleanupService } = await import('../oauth/tokenCleanupService');
      const mockCleanupService = new TokenCleanupService({} as any);
      vi.mocked(mockCleanupService.revokeUserTokens).mockResolvedValue();

      await oauthService.revokeUserTokens(userId, reason);

      expect(mockCleanupService.revokeUserTokens).toHaveBeenCalledWith(userId, reason);
    });

    it('should revoke all tokens', async () => {
      const reason = 'Security breach';

      const { TokenCleanupService } = await import('../oauth/tokenCleanupService');
      const mockCleanupService = new TokenCleanupService({} as any);
      vi.mocked(mockCleanupService.revokeAllTokens).mockResolvedValue(5);

      const result = await oauthService.revokeAllTokens(reason);

      expect(result).toBe(5);
      expect(mockCleanupService.revokeAllTokens).toHaveBeenCalledWith(reason);
    });
  });

  describe('profile management', () => {
    it('should get user profile', async () => {
      const userId = 'user-123';
      const mockProfile = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg'
      };

      const { GoogleProfileService } = await import('../oauth/profileService');
      const mockProfileService = new GoogleProfileService({} as any);
      vi.mocked(mockProfileService.getUserProfile).mockResolvedValue(mockProfile);

      const result = await oauthService.getUserProfile(userId);

      expect(result).toEqual(mockProfile);
      expect(mockProfileService.getUserProfile).toHaveBeenCalledWith(userId, false);
    });

    it('should force refresh user profile', async () => {
      const userId = 'user-123';
      const mockProfile = { id: userId, email: 'test@example.com' };

      const { GoogleProfileService } = await import('../oauth/profileService');
      const mockProfileService = new GoogleProfileService({} as any);
      vi.mocked(mockProfileService.getUserProfile).mockResolvedValue(mockProfile);

      await oauthService.getUserProfile(userId, true);

      expect(mockProfileService.getUserProfile).toHaveBeenCalledWith(userId, true);
    });

    it('should sync user profile', async () => {
      const userId = 'user-123';
      const mockProfile = { id: userId, email: 'updated@example.com' };

      const { GoogleProfileService } = await import('../oauth/profileService');
      const mockProfileService = new GoogleProfileService({} as any);
      vi.mocked(mockProfileService.syncProfile).mockResolvedValue(mockProfile);

      const result = await oauthService.syncUserProfile(userId);

      expect(result).toEqual(mockProfile);
      expect(mockProfileService.syncProfile).toHaveBeenCalledWith(userId);
    });

    it('should clear user profile cache', () => {
      const userId = 'user-123';

      const { GoogleProfileService } = await import('../oauth/profileService');
      const mockProfileService = new GoogleProfileService({} as any);

      oauthService.clearUserProfileCache(userId);

      expect(mockProfileService.clearUserCache).toHaveBeenCalledWith(userId);
    });
  });

  describe('service management', () => {
    it('should start services', () => {
      const { TokenRefreshService } = await import('../oauth/tokenRefreshService');
      const { TokenCleanupService } = await import('../oauth/tokenCleanupService');
      
      const mockRefreshService = new TokenRefreshService({} as any);
      const mockCleanupService = new TokenCleanupService({} as any);

      oauthService.startServices();

      expect(mockRefreshService.startScheduler).toHaveBeenCalled();
      expect(mockCleanupService.startCleanupScheduler).toHaveBeenCalled();
    });

    it('should stop services', () => {
      const { TokenRefreshService } = await import('../oauth/tokenRefreshService');
      const { TokenCleanupService } = await import('../oauth/tokenCleanupService');
      
      const mockRefreshService = new TokenRefreshService({} as any);
      const mockCleanupService = new TokenCleanupService({} as any);

      oauthService.stopServices();

      expect(mockRefreshService.stopScheduler).toHaveBeenCalled();
      expect(mockCleanupService.stopCleanupScheduler).toHaveBeenCalled();
    });

    it('should get service statistics', async () => {
      const mockRefreshStats = { isRunning: true, lastRefresh: new Date() };
      const mockCleanupInfo = { nextCleanupTime: new Date(), totalCleaned: 5 };
      const mockProfileStats = { hits: 10, misses: 2 };

      const { TokenRefreshService } = await import('../oauth/tokenRefreshService');
      const { TokenCleanupService } = await import('../oauth/tokenCleanupService');
      const { GoogleProfileService } = await import('../oauth/profileService');

      const mockRefreshService = new TokenRefreshService({} as any);
      const mockCleanupService = new TokenCleanupService({} as any);
      const mockProfileService = new GoogleProfileService({} as any);

      vi.mocked(mockRefreshService.getStats).mockResolvedValue(mockRefreshStats);
      vi.mocked(mockCleanupService.getCleanupInfo).mockResolvedValue(mockCleanupInfo);
      vi.mocked(mockProfileService.getCacheStats).mockReturnValue(mockProfileStats);

      const stats = await oauthService.getServiceStats();

      expect(stats).toEqual({
        refresh: mockRefreshStats,
        cleanup: mockCleanupInfo,
        profile: mockProfileStats,
        isConfigured: expect.any(Boolean)
      });
    });
  });

  describe('health check', () => {
    it('should return healthy status when all services are working', async () => {
      // Mock successful service checks
      const { TokenRefreshService } = await import('../oauth/tokenRefreshService');
      const { TokenCleanupService } = await import('../oauth/tokenCleanupService');

      const mockRefreshService = new TokenRefreshService({} as any);
      const mockCleanupService = new TokenCleanupService({} as any);

      vi.mocked(mockRefreshService.getStats).mockReturnValue({ isRunning: true });
      vi.mocked(mockCleanupService.getStats).mockReturnValue({ nextCleanupTime: new Date() });

      const health = await oauthService.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.services.tokenManager).toBe(true);
      expect(health.services.refreshService).toBe(true);
      expect(health.services.cleanupService).toBe(true);
      expect(health.services.googleProvider).toBe(true);
      expect(health.issues).toHaveLength(0);
    });

    it('should return degraded status when some services have issues', async () => {
      const { TokenRefreshService } = await import('../oauth/tokenRefreshService');
      const { TokenCleanupService } = await import('../oauth/tokenCleanupService');

      const mockRefreshService = new TokenRefreshService({} as any);
      const mockCleanupService = new TokenCleanupService({} as any);

      vi.mocked(mockRefreshService.getStats).mockReturnValue({ isRunning: false });
      vi.mocked(mockCleanupService.getStats).mockReturnValue({ nextCleanupTime: new Date() });

      const health = await oauthService.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.services.refreshService).toBe(false);
      expect(health.issues).toContain('Token refresh service is not running');
    });

    it('should handle health check errors', async () => {
      const { TokenRefreshService } = await import('../oauth/tokenRefreshService');
      const mockRefreshService = new TokenRefreshService({} as any);
      vi.mocked(mockRefreshService.getStats).mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      const health = await oauthService.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.issues).toContain('Health check failed: Service unavailable');
    });
  });

  describe('configuration updates', () => {
    it('should update service configuration', () => {
      const newConfig = {
        refreshConfig: { checkIntervalMs: 60000 },
        cleanupConfig: { cleanupIntervalMs: 120000 }
      };

      const { TokenRefreshService } = await import('../oauth/tokenRefreshService');
      const { TokenCleanupService } = await import('../oauth/tokenCleanupService');

      const mockRefreshService = new TokenRefreshService({} as any);
      const mockCleanupService = new TokenCleanupService({} as any);

      oauthService.updateConfig(newConfig);

      expect(mockRefreshService.updateConfig).toHaveBeenCalledWith(newConfig.refreshConfig);
      expect(mockCleanupService.updateConfig).toHaveBeenCalledWith(newConfig.cleanupConfig);
    });
  });

  describe('shutdown', () => {
    it('should gracefully shutdown all services', async () => {
      const { TokenCleanupService } = await import('../oauth/tokenCleanupService');
      const mockCleanupService = new TokenCleanupService({} as any);
      vi.mocked(mockCleanupService.performCleanup).mockResolvedValue();

      await oauthService.shutdown();

      expect(mockCleanupService.performCleanup).toHaveBeenCalled();
    });

    it('should handle shutdown errors', async () => {
      const { TokenCleanupService } = await import('../oauth/tokenCleanupService');
      const mockCleanupService = new TokenCleanupService({} as any);
      vi.mocked(mockCleanupService.performCleanup).mockRejectedValue(new Error('Cleanup failed'));

      await expect(oauthService.shutdown()).rejects.toThrow('Cleanup failed');
    });
  });
});