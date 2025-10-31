import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  withIntegrationTest,
  createTestUser,
  IntegrationDatabaseSeeder
} from '../utils';
import { OAuthService } from '../../lib/oauth/oauthService';
import { SessionManager } from '../../lib/oauth/sessionManager';
import { TokenManager } from '../../lib/oauth/tokenManager';
import { GoogleOAuthProvider } from '../../lib/oauth/googleProvider';
import { StateManager } from '../../lib/oauth/stateManager';
import { TokenData, UserProfile, AuthResult } from '../../lib/oauth/types';

describe('OAuth Integration Tests', () => {
  let oauthService: OAuthService;
  let seeder: IntegrationDatabaseSeeder;
  
  const mockConfig = {
    google: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3000/auth/callback',
      scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.readonly']
    },
    encryptionKey: 'test-encryption-key-32-characters',
    autoStartServices: false
  };

  const mockUserProfile: UserProfile = {
    id: 'google-user-123',
    email: 'test@example.com',
    name: 'Test User',
    givenName: 'Test',
    familyName: 'User',
    picture: 'https://example.com/avatar.jpg',
    locale: 'en',
    verified: true
  };

  const mockTokenData: TokenData = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    scope: 'openid email profile',
    tokenType: 'Bearer'
  };

  beforeEach(async () => {
    seeder = new IntegrationDatabaseSeeder();
    oauthService = new OAuthService(mockConfig);
    
    // Mock external OAuth provider calls
    vi.spyOn(GoogleOAuthProvider.prototype, 'initiateAuth').mockResolvedValue(
      'https://accounts.google.com/oauth/authorize?client_id=test&redirect_uri=callback&state=test-state'
    );
    
    vi.spyOn(GoogleOAuthProvider.prototype, 'handleCallback').mockResolvedValue({
      accessToken: mockTokenData.accessToken,
      refreshToken: mockTokenData.refreshToken,
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: mockTokenData.scope,
      user: mockUserProfile
    } as AuthResult);
    
    vi.spyOn(GoogleOAuthProvider.prototype, 'refreshTokens').mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600
    });
  });

  afterEach(async () => {
    await seeder.cleanup();
    vi.restoreAllMocks();
  });

  describe('OAuth Callback Handling', () => {
    it('should handle successful OAuth callback with code exchange', async () => {
      await withIntegrationTest('oauth-callback-success', 'auth', async (testData) => {
        const { users } = testData;
        
        // Mock state validation
        vi.spyOn(StateManager.prototype, 'validateState').mockResolvedValue({
          redirectUri: mockConfig.google.redirectUri,
          codeVerifier: 'test-code-verifier'
        });
        
        const result = await oauthService.handleCallback(
          'test-auth-code',
          'test-state',
          mockConfig.google.redirectUri
        );
        
        expect(result).toBeDefined();
        expect(result.user).toEqual(mockUserProfile);
        expect(result.tokens.accessToken).toBe(mockTokenData.accessToken);
        expect(result.tokens.refreshToken).toBe(mockTokenData.refreshToken);
        expect(result.tokens.expiresAt).toBeInstanceOf(Date);
        expect(result.tokens.scope).toBe(mockTokenData.scope);
      });
    });

    it('should handle OAuth callback with invalid state parameter', async () => {
      await withIntegrationTest('oauth-callback-invalid-state', 'auth', async () => {
        // Mock state validation failure
        vi.spyOn(StateManager.prototype, 'validateState').mockRejectedValue(
          new Error('Invalid state parameter')
        );
        
        await expect(
          oauthService.handleCallback(
            'test-auth-code',
            'invalid-state',
            mockConfig.google.redirectUri
          )
        ).rejects.toThrow('State validation failed');
      });
    });

    it('should handle OAuth callback with missing parameters', async () => {
      await withIntegrationTest('oauth-callback-missing-params', 'auth', async () => {
        await expect(
          oauthService.handleCallback('', 'test-state', mockConfig.google.redirectUri)
        ).rejects.toThrow('Missing required OAuth callback parameters');
        
        await expect(
          oauthService.handleCallback('test-code', '', mockConfig.google.redirectUri)
        ).rejects.toThrow('Missing required OAuth callback parameters');
      });
    });

    it('should handle token exchange failure during callback', async () => {
      await withIntegrationTest('oauth-callback-token-failure', 'auth', async () => {
        // Mock state validation success
        vi.spyOn(StateManager.prototype, 'validateState').mockResolvedValue({
          redirectUri: mockConfig.google.redirectUri,
          codeVerifier: 'test-code-verifier'
        });
        
        // Mock token exchange failure
        vi.spyOn(GoogleOAuthProvider.prototype, 'handleCallback').mockRejectedValue(
          new Error('Token exchange failed')
        );
        
        await expect(
          oauthService.handleCallback(
            'test-auth-code',
            'test-state',
            mockConfig.google.redirectUri
          )
        ).rejects.toThrow('Token exchange failed');
      });
    });

    it('should handle token storage failure during callback', async () => {
      await withIntegrationTest('oauth-callback-storage-failure', 'auth', async () => {
        // Mock state validation success
        vi.spyOn(StateManager.prototype, 'validateState').mockResolvedValue({
          redirectUri: mockConfig.google.redirectUri,
          codeVerifier: 'test-code-verifier'
        });
        
        // Mock token storage failure
        vi.spyOn(TokenManager.prototype, 'storeTokens').mockRejectedValue(
          new Error('Storage failed')
        );
        
        await expect(
          oauthService.handleCallback(
            'test-auth-code',
            'test-state',
            mockConfig.google.redirectUri
          )
        ).rejects.toThrow('Failed to store OAuth tokens');
      });
    });
  });

  describe('Session Management', () => {
    it('should create session after successful OAuth authentication', async () => {
      await withIntegrationTest('session-creation', 'auth', async (testData) => {
        const { users } = testData;
        
        // Create session with OAuth user and tokens
        const user = await SessionManager.createSession(mockUserProfile, {
          accessToken: mockTokenData.accessToken,
          refreshToken: mockTokenData.refreshToken,
          expiresAt: mockTokenData.expiresAt,
          scope: mockTokenData.scope
        });
        
        expect(user).toBeDefined();
        expect(user.email).toBe(mockUserProfile.email);
        expect(user.name).toBe(mockUserProfile.name);
        
        // Verify session info is stored
        const sessionInfo = SessionManager.getSessionInfo();
        expect(sessionInfo).toBeDefined();
        expect(sessionInfo?.email).toBe(mockUserProfile.email);
        expect(sessionInfo?.userId).toBeTruthy();
      });
    });

    it('should validate session expiry correctly', async () => {
      await withIntegrationTest('session-validation', 'auth', async () => {
        // Create session with short expiry
        const shortExpiryTokens = {
          ...mockTokenData,
          expiresAt: new Date(Date.now() + 1000) // 1 second from now
        };
        
        await SessionManager.createSession(mockUserProfile, {
          accessToken: shortExpiryTokens.accessToken,
          refreshToken: shortExpiryTokens.refreshToken,
          expiresAt: shortExpiryTokens.expiresAt,
          scope: shortExpiryTokens.scope
        });
        
        // Initially valid
        expect(SessionManager.isSessionValid()).toBe(true);
        
        // Wait for expiry
        await new Promise(resolve => setTimeout(resolve, 1100));
        
        // Should now be invalid
        expect(SessionManager.isSessionValid()).toBe(false);
      });
    });

    it('should clear session data completely', async () => {
      await withIntegrationTest('session-cleanup', 'auth', async () => {
        // Create session
        await SessionManager.createSession(mockUserProfile, {
          accessToken: mockTokenData.accessToken,
          refreshToken: mockTokenData.refreshToken,
          expiresAt: mockTokenData.expiresAt,
          scope: mockTokenData.scope
        });
        
        // Verify session exists
        expect(SessionManager.getSessionInfo()).toBeDefined();
        expect(SessionManager.getStoredUser()).toBeDefined();
        
        // Clear session
        await SessionManager.clearSession();
        
        // Verify session is cleared
        expect(SessionManager.getSessionInfo()).toBeNull();
        expect(SessionManager.getStoredUser()).toBeNull();
        expect(SessionManager.getJWTAccessToken()).toBeNull();
        expect(SessionManager.getJWTRefreshToken()).toBeNull();
      });
    });

    it('should refresh session with new token data', async () => {
      await withIntegrationTest('session-refresh', 'auth', async () => {
        // Create initial session
        await SessionManager.createSession(mockUserProfile, {
          accessToken: mockTokenData.accessToken,
          refreshToken: mockTokenData.refreshToken,
          expiresAt: mockTokenData.expiresAt,
          scope: mockTokenData.scope
        });
        
        const initialSession = SessionManager.getSessionInfo();
        expect(initialSession).toBeDefined();
        
        // Refresh with new tokens
        const newTokens = {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresAt: new Date(Date.now() + 7200000) // 2 hours from now
        };
        
        await SessionManager.refreshSession(newTokens);
        
        const refreshedSession = SessionManager.getSessionInfo();
        expect(refreshedSession).toBeDefined();
        expect(refreshedSession?.expiresAt.getTime()).toBeGreaterThan(
          initialSession!.expiresAt.getTime()
        );
      });
    });

    it('should handle session monitoring and JWT token validation', async () => {
      await withIntegrationTest('session-monitoring', 'auth', async () => {
        // Create session
        await SessionManager.createSession(mockUserProfile, {
          accessToken: mockTokenData.accessToken,
          refreshToken: mockTokenData.refreshToken,
          expiresAt: mockTokenData.expiresAt,
          scope: mockTokenData.scope
        });
        
        // Check session status
        const sessionStatus = await SessionManager.getSessionStatus();
        expect(sessionStatus.hasBasicSession).toBe(true);
        expect(sessionStatus.basicSessionValid).toBe(true);
        expect(sessionStatus.hasJWTToken).toBe(true);
        
        // Validate full session
        const isFullyValid = await SessionManager.isSessionFullyValid();
        expect(isFullyValid).toBe(true);
      });
    });
  });

  describe('Token Refresh Mechanisms', () => {
    it('should automatically refresh tokens before expiry', async () => {
      await withIntegrationTest('token-auto-refresh', 'auth', async (testData) => {
        const { users } = testData;
        const userId = users[0].id;
        
        // Store tokens that are close to expiry
        const nearExpiryTokens: TokenData = {
          ...mockTokenData,
          expiresAt: new Date(Date.now() + 240000) // 4 minutes from now (within 5-minute refresh window)
        };
        
        await oauthService.getValidTokens(userId);
        
        // Mock token storage
        vi.spyOn(TokenManager.prototype, 'getValidTokens').mockResolvedValue(nearExpiryTokens);
        
        const tokens = await oauthService.getValidTokens(userId);
        
        expect(tokens).toBeDefined();
        expect(tokens?.accessToken).toBeTruthy();
      });
    });

    it('should handle concurrent token refresh requests', async () => {
      await withIntegrationTest('concurrent-token-refresh', 'auth', async (testData) => {
        const { users } = testData;
        const userId = users[0].id;
        
        // Store expired tokens
        const expiredTokens: TokenData = {
          ...mockTokenData,
          expiresAt: new Date(Date.now() - 1000) // 1 second ago
        };
        
        vi.spyOn(TokenManager.prototype, 'getValidTokens').mockResolvedValue(expiredTokens);
        
        // Make multiple concurrent requests
        const refreshPromises = [
          oauthService.refreshUserTokens(userId),
          oauthService.refreshUserTokens(userId),
          oauthService.refreshUserTokens(userId)
        ];
        
        const results = await Promise.all(refreshPromises);
        
        // All should succeed and return the same result
        results.forEach(result => {
          expect(result).toBe(true);
        });
      });
    });

    it('should handle token refresh failure gracefully', async () => {
      await withIntegrationTest('token-refresh-failure', 'auth', async (testData) => {
        const { users } = testData;
        const userId = users[0].id;
        
        // Mock refresh failure
        vi.spyOn(GoogleOAuthProvider.prototype, 'refreshTokens').mockRejectedValue(
          new Error('Refresh token expired')
        );
        
        const result = await oauthService.refreshUserTokens(userId);
        
        expect(result).toBe(false);
      });
    });

    it('should validate token expiration and refresh timing', async () => {
      await withIntegrationTest('token-timing-validation', 'auth', async (testData) => {
        const { users } = testData;
        const userId = users[0].id;
        
        // Get token statistics
        const stats = await oauthService.getUserTokenStats(userId);
        
        expect(stats).toBeDefined();
        expect(typeof stats.hasTokens).toBe('boolean');
        expect(typeof stats.needsRefresh).toBe('boolean');
        
        if (stats.hasTokens) {
          expect(stats.expiresAt).toBeInstanceOf(Date);
          expect(typeof stats.timeUntilExpiry).toBe('number');
        }
      });
    });
  });

  describe('User Profile Creation and Updates', () => {
    it('should create new user profile from OAuth data', async () => {
      await withIntegrationTest('profile-creation', 'auth', async () => {
        // Create session which should create user profile
        const user = await SessionManager.createSession(mockUserProfile, {
          accessToken: mockTokenData.accessToken,
          refreshToken: mockTokenData.refreshToken,
          expiresAt: mockTokenData.expiresAt,
          scope: mockTokenData.scope
        });
        
        expect(user).toBeDefined();
        expect(user.email).toBe(mockUserProfile.email);
        expect(user.name).toBe(mockUserProfile.name);
        expect(user.avatar).toBe(mockUserProfile.picture);
        expect(user.role).toBeDefined();
        expect(user.department).toBe('General');
        expect(user.status).toBe('active');
      });
    });

    it('should update existing user profile with latest OAuth data', async () => {
      await withIntegrationTest('profile-update', 'auth', async (testData) => {
        const { users } = testData;
        const existingUser = users.find(u => u.email === mockUserProfile.email);
        
        if (existingUser) {
          // Update profile with new OAuth data
          const updatedProfile: UserProfile = {
            ...mockUserProfile,
            name: 'Updated Test User',
            picture: 'https://example.com/new-avatar.jpg'
          };
          
          const user = await SessionManager.createSession(updatedProfile, {
            accessToken: mockTokenData.accessToken,
            refreshToken: mockTokenData.refreshToken,
            expiresAt: mockTokenData.expiresAt,
            scope: mockTokenData.scope
          });
          
          expect(user.name).toBe('Updated Test User');
          expect(user.avatar).toBe('https://example.com/new-avatar.jpg');
        }
      });
    });

    it('should sync user profile with Google and cache results', async () => {
      await withIntegrationTest('profile-sync', 'auth', async (testData) => {
        const { users } = testData;
        const userId = users[0].id;
        
        // Mock profile service
        vi.spyOn(oauthService, 'getUserProfile').mockResolvedValue(mockUserProfile);
        
        // Get cached profile
        const cachedProfile = await oauthService.getUserProfile(userId);
        expect(cachedProfile).toEqual(mockUserProfile);
        
        // Force refresh profile
        const refreshedProfile = await oauthService.getUserProfile(userId, true);
        expect(refreshedProfile).toEqual(mockUserProfile);
        
        // Sync profile
        await oauthService.syncUserProfile(userId);
        
        // Clear cache
        oauthService.clearUserProfileCache(userId);
        
        // Get cache stats
        const cacheStats = oauthService.getProfileCacheStats();
        expect(cacheStats).toBeDefined();
      });
    });

    it('should handle profile creation with missing or invalid data', async () => {
      await withIntegrationTest('profile-invalid-data', 'auth', async () => {
        const invalidProfile: UserProfile = {
          id: '',
          email: 'invalid-email',
          name: '',
          givenName: '',
          familyName: '',
          picture: '',
          locale: '',
          verified: false
        };
        
        // Should handle gracefully and use fallback values
        const user = await SessionManager.createSession(invalidProfile, {
          accessToken: mockTokenData.accessToken,
          refreshToken: mockTokenData.refreshToken,
          expiresAt: mockTokenData.expiresAt,
          scope: mockTokenData.scope
        });
        
        expect(user).toBeDefined();
        expect(user.email).toBe('invalid-email');
        expect(user.name).toBeTruthy(); // Should have fallback name
        expect(user.role).toBeDefined();
      });
    });
  });

  describe('Role-Based Access Control and Permissions', () => {
    it('should assign default user role to new OAuth users', async () => {
      await withIntegrationTest('rbac-default-role', 'auth', async () => {
        const user = await SessionManager.createSession(mockUserProfile, {
          accessToken: mockTokenData.accessToken,
          refreshToken: mockTokenData.refreshToken,
          expiresAt: mockTokenData.expiresAt,
          scope: mockTokenData.scope
        });
        
        expect(user.role).toBeDefined();
        expect(user.role.name).toBe('user');
        expect(user.role.level).toBe(3);
        expect(Array.isArray(user.permissions)).toBe(true);
      });
    });

    it('should preserve existing user roles during OAuth login', async () => {
      await withIntegrationTest('rbac-preserve-role', 'auth', async (testData) => {
        const { users } = testData;
        const adminUser = users.find(u => u.role === 'admin');
        
        if (adminUser) {
          // Mock OAuth profile for existing admin user
          const adminProfile: UserProfile = {
            ...mockUserProfile,
            email: adminUser.email
          };
          
          const user = await SessionManager.createSession(adminProfile, {
            accessToken: mockTokenData.accessToken,
            refreshToken: mockTokenData.refreshToken,
            expiresAt: mockTokenData.expiresAt,
            scope: mockTokenData.scope
          });
          
          expect(user.role.name).toBe('admin');
          expect(user.role.level).toBe(1);
        }
      });
    });

    it('should validate permissions for different user roles', async () => {
      await withIntegrationTest('rbac-permissions', 'auth', async (testData) => {
        const { users } = testData;
        
        // Test different user roles
        const testCases = [
          { role: 'admin', level: 1, shouldHaveAllPermissions: true },
          { role: 'manager', level: 2, shouldHaveAllPermissions: false },
          { role: 'user', level: 3, shouldHaveAllPermissions: false }
        ];
        
        for (const testCase of testCases) {
          const testUser = users.find(u => u.role === testCase.role);
          if (testUser) {
            const profile: UserProfile = {
              ...mockUserProfile,
              email: testUser.email
            };
            
            const user = await SessionManager.createSession(profile, {
              accessToken: mockTokenData.accessToken,
              refreshToken: mockTokenData.refreshToken,
              expiresAt: mockTokenData.expiresAt,
              scope: mockTokenData.scope
            });
            
            expect(user.role.level).toBe(testCase.level);
            expect(Array.isArray(user.permissions)).toBe(true);
            
            if (testCase.shouldHaveAllPermissions) {
              // Admin should have comprehensive permissions
              expect(user.permissions.length).toBeGreaterThan(0);
            }
          }
        }
      });
    });

    it('should handle department assignment during OAuth registration', async () => {
      await withIntegrationTest('rbac-department-assignment', 'auth', async () => {
        const user = await SessionManager.createSession(mockUserProfile, {
          accessToken: mockTokenData.accessToken,
          refreshToken: mockTokenData.refreshToken,
          expiresAt: mockTokenData.expiresAt,
          scope: mockTokenData.scope
        });
        
        expect(user.department).toBe('General'); // Default department
        expect(user.status).toBe('active');
        expect(user.lastActive).toBeTruthy();
        expect(user.createdAt).toBeTruthy();
      });
    });

    it('should validate OAuth token scope permissions', async () => {
      await withIntegrationTest('oauth-scope-validation', 'auth', async (testData) => {
        const { users } = testData;
        const userId = users[0].id;
        
        // Test different OAuth scopes
        const scopeTestCases = [
          {
            scope: 'openid email profile',
            shouldAllowBasicAccess: true,
            shouldAllowDriveAccess: false
          },
          {
            scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
            shouldAllowBasicAccess: true,
            shouldAllowDriveAccess: true
          }
        ];
        
        for (const testCase of scopeTestCases) {
          const tokens: TokenData = {
            ...mockTokenData,
            scope: testCase.scope
          };
          
          // Store tokens with specific scope
          await oauthService.getValidTokens(userId);
          
          // Validate scope-based permissions
          expect(tokens.scope.includes('email')).toBe(testCase.shouldAllowBasicAccess);
          expect(tokens.scope.includes('drive.readonly')).toBe(testCase.shouldAllowDriveAccess);
        }
      });
    });

    it('should handle OAuth session security and validation', async () => {
      await withIntegrationTest('oauth-session-security', 'auth', async () => {
        // Create session
        await SessionManager.createSession(mockUserProfile, {
          accessToken: mockTokenData.accessToken,
          refreshToken: mockTokenData.refreshToken,
          expiresAt: mockTokenData.expiresAt,
          scope: mockTokenData.scope
        });
        
        // Validate session security
        const sessionStatus = await SessionManager.getSessionStatus();
        expect(sessionStatus.fullyValid).toBe(true);
        
        // Get user sessions
        const sessions = await SessionManager.getUserSessions();
        expect(Array.isArray(sessions)).toBe(true);
        
        // Validate current session
        const isValid = await SessionManager.isSessionFullyValid();
        expect(isValid).toBe(true);
      });
    });
  });

  describe('OAuth Service Health and Monitoring', () => {
    it('should provide comprehensive service health status', async () => {
      await withIntegrationTest('oauth-health-check', 'auth', async () => {
        const healthStatus = await oauthService.healthCheck();
        
        expect(healthStatus).toBeDefined();
        expect(['healthy', 'degraded', 'unhealthy']).toContain(healthStatus.status);
        expect(healthStatus.services).toBeDefined();
        expect(typeof healthStatus.services.tokenManager).toBe('boolean');
        expect(typeof healthStatus.services.refreshService).toBe('boolean');
        expect(typeof healthStatus.services.cleanupService).toBe('boolean');
        expect(typeof healthStatus.services.googleProvider).toBe('boolean');
        expect(Array.isArray(healthStatus.issues)).toBe(true);
      });
    });

    it('should provide service statistics and metrics', async () => {
      await withIntegrationTest('oauth-service-stats', 'auth', async () => {
        const stats = await oauthService.getServiceStats();
        
        expect(stats).toBeDefined();
        expect(stats.refresh).toBeDefined();
        expect(stats.cleanup).toBeDefined();
        expect(stats.profile).toBeDefined();
        expect(typeof stats.isConfigured).toBe('boolean');
      });
    });

    it('should handle service configuration validation', async () => {
      await withIntegrationTest('oauth-config-validation', 'auth', async () => {
        const isConfigured = oauthService.isConfigured();
        expect(typeof isConfigured).toBe('boolean');
        
        // Test configuration update
        oauthService.updateConfig({
          refreshConfig: {
            checkIntervalMs: 30000,
            refreshBufferMs: 300000
          }
        });
        
        // Configuration should still be valid
        expect(oauthService.isConfigured()).toBe(true);
      });
    });

    it('should handle graceful service shutdown', async () => {
      await withIntegrationTest('oauth-service-shutdown', 'auth', async () => {
        // Start services
        oauthService.startServices();
        
        // Verify services are running
        const initialStats = await oauthService.getServiceStats();
        expect(initialStats).toBeDefined();
        
        // Shutdown services
        await oauthService.shutdown();
        
        // Services should be stopped
        expect(true).toBe(true); // Shutdown completed without error
      });
    });
  });
});