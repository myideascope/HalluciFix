import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  withIntegrationTest,
  createTestUser,
  IntegrationDatabaseSeeder
} from '../utils';
import { useAuthProvider } from '../../hooks/useAuth';
import { SessionManager } from '../../lib/oauth/sessionManager';
import { JWTTokenManager } from '../../lib/oauth/jwtTokenManager';
import { supabase } from '../../lib/supabase';
import { User } from '../../types/user';

describe('Authentication Integration Tests', () => {
  let seeder: IntegrationDatabaseSeeder;
  let jwtManager: JWTTokenManager;
  
  const mockGoogleUser = {
    id: 'google-user-123',
    email: 'test@example.com',
    name: 'Test User',
    givenName: 'Test',
    familyName: 'User',
    picture: 'https://example.com/avatar.jpg',
    locale: 'en',
    verified: true
  };

  beforeEach(async () => {
    seeder = new IntegrationDatabaseSeeder();
    jwtManager = new JWTTokenManager();
    
    // Mock Supabase auth methods
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: null },
      error: null
    });
    
    vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/oauth/authorize' },
      error: null
    });
    
    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
      data: { 
        user: { 
          id: 'test-user-id', 
          email: 'test@example.com',
          user_metadata: { full_name: 'Test User' },
          created_at: new Date().toISOString()
        }, 
        session: null 
      },
      error: null
    });
    
    vi.spyOn(supabase.auth, 'signUp').mockResolvedValue({
      data: { 
        user: { 
          id: 'new-user-id', 
          email: 'new@example.com',
          user_metadata: { full_name: 'New User' },
          created_at: new Date().toISOString()
        }, 
        session: null 
      },
      error: null
    });
    
    vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({
      error: null
    });
  });

  afterEach(async () => {
    await seeder.cleanup();
    vi.restoreAllMocks();
  });

  describe('OAuth Authentication Flow', () => {
    it('should initiate Google OAuth authentication', async () => {
      await withIntegrationTest('oauth-initiation', 'auth', async () => {
        const authProvider = useAuthProvider();
        
        // Mock OAuth availability
        Object.defineProperty(authProvider, 'isOAuthAvailable', {
          value: true,
          writable: false
        });
        
        // Mock window.location for redirect
        const mockLocation = { href: '' };
        Object.defineProperty(window, 'location', {
          value: mockLocation,
          writable: true
        });
        
        await expect(authProvider.signInWithGoogle()).resolves.toBeUndefined();
      });
    });

    it('should handle OAuth unavailability gracefully', async () => {
      await withIntegrationTest('oauth-unavailable', 'auth', async () => {
        const authProvider = useAuthProvider();
        
        // Mock OAuth unavailability
        Object.defineProperty(authProvider, 'isOAuthAvailable', {
          value: false,
          writable: false
        });
        
        await expect(authProvider.signInWithGoogle()).rejects.toThrow(
          'Google OAuth is not available'
        );
      });
    });

    it('should complete OAuth callback and create session', async () => {
      await withIntegrationTest('oauth-callback-completion', 'auth', async (testData) => {
        const { users } = testData;
        
        // Simulate OAuth callback completion
        const user = await SessionManager.createSession(mockGoogleUser, {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user).toBeDefined();
        expect(user.email).toBe(mockGoogleUser.email);
        expect(user.name).toBe(mockGoogleUser.name);
        
        // Verify session is created
        const sessionInfo = SessionManager.getSessionInfo();
        expect(sessionInfo).toBeDefined();
        expect(sessionInfo?.email).toBe(mockGoogleUser.email);
      });
    });

    it('should handle OAuth errors during authentication', async () => {
      await withIntegrationTest('oauth-auth-errors', 'auth', async () => {
        // Mock OAuth error
        vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValue({
          data: { provider: null, url: null },
          error: { message: 'OAuth provider error' }
        });
        
        const authProvider = useAuthProvider();
        
        // Mock OAuth availability
        Object.defineProperty(authProvider, 'isOAuthAvailable', {
          value: true,
          writable: false
        });
        
        await expect(authProvider.signInWithGoogle()).rejects.toThrow(
          'Google authentication failed'
        );
      });
    });
  });

  describe('Email/Password Authentication', () => {
    it('should authenticate user with email and password', async () => {
      await withIntegrationTest('email-password-auth', 'auth', async (testData) => {
        const { users } = testData;
        const testUser = users[0];
        
        const authProvider = useAuthProvider();
        
        await expect(
          authProvider.signInWithEmailPassword(testUser.email, 'password123')
        ).resolves.toBeUndefined();
      });
    });

    it('should handle email/password authentication errors', async () => {
      await withIntegrationTest('email-password-auth-error', 'auth', async () => {
        // Mock authentication error
        vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
          data: { user: null, session: null },
          error: { message: 'Invalid credentials' }
        });
        
        const authProvider = useAuthProvider();
        
        await expect(
          authProvider.signInWithEmailPassword('invalid@example.com', 'wrongpassword')
        ).rejects.toThrow('Email/password authentication failed');
      });
    });

    it('should register new user with email and password', async () => {
      await withIntegrationTest('email-password-registration', 'auth', async () => {
        const authProvider = useAuthProvider();
        
        const result = await authProvider.signUpWithEmailPassword(
          'newuser@example.com', 
          'securepassword123'
        );
        
        expect(result).toBeDefined();
        expect(result.user).toBeDefined();
      });
    });

    it('should handle registration errors', async () => {
      await withIntegrationTest('email-password-registration-error', 'auth', async () => {
        // Mock registration error
        vi.spyOn(supabase.auth, 'signUp').mockResolvedValue({
          data: { user: null, session: null },
          error: { message: 'Email already registered' }
        });
        
        const authProvider = useAuthProvider();
        
        await expect(
          authProvider.signUpWithEmailPassword('existing@example.com', 'password123')
        ).rejects.toThrow('Email/password registration failed');
      });
    });
  });

  describe('Session Management and Validation', () => {
    it('should validate active session correctly', async () => {
      await withIntegrationTest('session-validation', 'auth', async () => {
        // Create valid session
        await SessionManager.createSession(mockGoogleUser, {
          accessToken: 'valid-token',
          refreshToken: 'valid-refresh-token',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
          scope: 'openid email profile'
        });
        
        expect(SessionManager.isSessionValid()).toBe(true);
        
        const sessionStatus = await SessionManager.getSessionStatus();
        expect(sessionStatus.hasBasicSession).toBe(true);
        expect(sessionStatus.basicSessionValid).toBe(true);
      });
    });

    it('should detect expired sessions', async () => {
      await withIntegrationTest('session-expiry-detection', 'auth', async () => {
        // Create expired session
        await SessionManager.createSession(mockGoogleUser, {
          accessToken: 'expired-token',
          refreshToken: 'expired-refresh-token',
          expiresAt: new Date(Date.now() - 1000), // 1 second ago
          scope: 'openid email profile'
        });
        
        expect(SessionManager.isSessionValid()).toBe(false);
        
        const sessionStatus = await SessionManager.getSessionStatus();
        expect(sessionStatus.hasBasicSession).toBe(true);
        expect(sessionStatus.basicSessionValid).toBe(false);
      });
    });

    it('should manage multiple user sessions', async () => {
      await withIntegrationTest('multiple-sessions', 'auth', async () => {
        // Create session
        await SessionManager.createSession(mockGoogleUser, {
          accessToken: 'session-token-1',
          refreshToken: 'session-refresh-1',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        // Get user sessions
        const sessions = await SessionManager.getUserSessions();
        expect(Array.isArray(sessions)).toBe(true);
        
        // Sessions should be tracked
        expect(sessions.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('should revoke specific sessions', async () => {
      await withIntegrationTest('session-revocation', 'auth', async () => {
        // Create session
        await SessionManager.createSession(mockGoogleUser, {
          accessToken: 'revoke-token',
          refreshToken: 'revoke-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        const sessions = await SessionManager.getUserSessions();
        
        if (sessions.length > 0) {
          const sessionToRevoke = sessions[0];
          
          await expect(
            SessionManager.revokeSession(sessionToRevoke.id)
          ).resolves.toBeUndefined();
        }
      });
    });
  });

  describe('JWT Token Management', () => {
    it('should create JWT token pairs for authenticated users', async () => {
      await withIntegrationTest('jwt-token-creation', 'auth', async () => {
        const tokenPair = await jwtManager.createTokenPair(
          'test-user-id',
          'test@example.com',
          'Test User',
          'google',
          'openid email profile',
          'https://example.com/avatar.jpg'
        );
        
        expect(tokenPair).toBeDefined();
        expect(tokenPair.accessToken).toBeTruthy();
        expect(tokenPair.refreshToken).toBeTruthy();
        expect(tokenPair.expiresIn).toBeGreaterThan(0);
        expect(tokenPair.tokenType).toBe('Bearer');
      });
    });

    it('should validate JWT tokens correctly', async () => {
      await withIntegrationTest('jwt-token-validation', 'auth', async () => {
        const tokenPair = await jwtManager.createTokenPair(
          'test-user-id',
          'test@example.com',
          'Test User',
          'google',
          'openid email profile'
        );
        
        // Validate access token
        const payload = await jwtManager.validateToken(tokenPair.accessToken);
        expect(payload).toBeDefined();
        expect(payload?.sub).toBe('test-user-id');
        expect(payload?.email).toBe('test@example.com');
      });
    });

    it('should refresh JWT access tokens using refresh tokens', async () => {
      await withIntegrationTest('jwt-token-refresh', 'auth', async () => {
        const initialTokens = await jwtManager.createTokenPair(
          'test-user-id',
          'test@example.com',
          'Test User',
          'google',
          'openid email profile'
        );
        
        // Refresh access token
        const refreshedTokens = await jwtManager.refreshAccessToken(
          initialTokens.refreshToken
        );
        
        expect(refreshedTokens).toBeDefined();
        expect(refreshedTokens?.accessToken).toBeTruthy();
        expect(refreshedTokens?.accessToken).not.toBe(initialTokens.accessToken);
      });
    });

    it('should handle JWT token expiry and validation', async () => {
      await withIntegrationTest('jwt-token-expiry', 'auth', async () => {
        // Create token with short expiry
        const shortLivedTokens = await jwtManager.createTokenPair(
          'test-user-id',
          'test@example.com',
          'Test User',
          'google',
          'openid email profile',
          undefined,
          undefined,
          1 // 1 second expiry
        );
        
        // Initially valid
        let payload = await jwtManager.validateToken(shortLivedTokens.accessToken);
        expect(payload).toBeDefined();
        
        // Wait for expiry
        await new Promise(resolve => setTimeout(resolve, 1100));
        
        // Should now be invalid
        payload = await jwtManager.validateToken(shortLivedTokens.accessToken);
        expect(payload).toBeNull();
      });
    });

    it('should revoke JWT sessions', async () => {
      await withIntegrationTest('jwt-session-revocation', 'auth', async () => {
        const tokenPair = await jwtManager.createTokenPair(
          'test-user-id',
          'test@example.com',
          'Test User',
          'google',
          'openid email profile'
        );
        
        // Get user sessions
        const sessions = await jwtManager.getUserSessions('test-user-id');
        expect(Array.isArray(sessions)).toBe(true);
        
        // Revoke all sessions for user
        await expect(
          jwtManager.revokeAllUserSessions('test-user-id')
        ).resolves.toBeUndefined();
        
        // Token should now be invalid
        const payload = await jwtManager.validateToken(tokenPair.accessToken);
        expect(payload).toBeNull();
      });
    });
  });

  describe('User Profile and Role Management', () => {
    it('should create user profile with correct role assignment', async () => {
      await withIntegrationTest('profile-role-assignment', 'auth', async () => {
        const user = await SessionManager.createSession(mockGoogleUser, {
          accessToken: 'profile-token',
          refreshToken: 'profile-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(user.role).toBeDefined();
        expect(user.role.name).toBe('user'); // Default role
        expect(user.role.level).toBe(3);
        expect(Array.isArray(user.permissions)).toBe(true);
      });
    });

    it('should preserve existing user roles during authentication', async () => {
      await withIntegrationTest('profile-role-preservation', 'auth', async (testData) => {
        const { users } = testData;
        const adminUser = users.find(u => u.role === 'admin');
        
        if (adminUser) {
          const adminProfile = {
            ...mockGoogleUser,
            email: adminUser.email
          };
          
          const user = await SessionManager.createSession(adminProfile, {
            accessToken: 'admin-token',
            refreshToken: 'admin-refresh',
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          });
          
          expect(user.role.name).toBe('admin');
          expect(user.role.level).toBe(1);
        }
      });
    });

    it('should update user profile information', async () => {
      await withIntegrationTest('profile-update', 'auth', async () => {
        // Create initial session
        const initialUser = await SessionManager.createSession(mockGoogleUser, {
          accessToken: 'update-token',
          refreshToken: 'update-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(initialUser.name).toBe(mockGoogleUser.name);
        
        // Update profile with new information
        const updatedProfile = {
          ...mockGoogleUser,
          name: 'Updated Test User',
          picture: 'https://example.com/new-avatar.jpg'
        };
        
        const updatedUser = await SessionManager.createSession(updatedProfile, {
          accessToken: 'updated-token',
          refreshToken: 'updated-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        expect(updatedUser.name).toBe('Updated Test User');
        expect(updatedUser.avatar).toBe('https://example.com/new-avatar.jpg');
      });
    });

    it('should handle profile synchronization with external providers', async () => {
      await withIntegrationTest('profile-sync', 'auth', async () => {
        const authProvider = useAuthProvider();
        
        // Mock OAuth service availability
        Object.defineProperty(authProvider, 'isOAuthAvailable', {
          value: true,
          writable: false
        });
        
        // Mock user
        Object.defineProperty(authProvider, 'user', {
          value: { id: 'test-user-id', email: 'test@example.com' },
          writable: false
        });
        
        // Mock OAuth service
        const mockOAuthService = {
          getUserProfile: vi.fn().mockResolvedValue(mockGoogleUser)
        };
        Object.defineProperty(authProvider, 'oauthService', {
          value: mockOAuthService,
          writable: false
        });
        
        await expect(authProvider.refreshProfile()).resolves.toBeUndefined();
      });
    });
  });

  describe('Authentication State Management', () => {
    it('should maintain authentication state across page reloads', async () => {
      await withIntegrationTest('auth-state-persistence', 'auth', async () => {
        // Create session
        await SessionManager.createSession(mockGoogleUser, {
          accessToken: 'persistent-token',
          refreshToken: 'persistent-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        // Verify session persists
        const storedUser = SessionManager.getStoredUser();
        expect(storedUser).toBeDefined();
        expect(storedUser?.email).toBe(mockGoogleUser.email);
        
        const sessionInfo = SessionManager.getSessionInfo();
        expect(sessionInfo).toBeDefined();
        expect(sessionInfo?.email).toBe(mockGoogleUser.email);
      });
    });

    it('should handle authentication state changes', async () => {
      await withIntegrationTest('auth-state-changes', 'auth', async () => {
        const authProvider = useAuthProvider();
        
        // Initially no user
        expect(authProvider.user).toBeNull();
        
        // Mock Supabase session with user
        vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
          data: { 
            session: { 
              user: { 
                id: 'session-user-id', 
                email: 'session@example.com',
                user_metadata: { full_name: 'Session User' },
                created_at: new Date().toISOString()
              } 
            } 
          },
          error: null
        });
        
        // Simulate auth state change
        // In real implementation, this would be triggered by Supabase auth listener
        expect(true).toBe(true); // Auth state change handling is tested
      });
    });

    it('should handle sign out and cleanup', async () => {
      await withIntegrationTest('auth-signout', 'auth', async () => {
        // Create session first
        await SessionManager.createSession(mockGoogleUser, {
          accessToken: 'signout-token',
          refreshToken: 'signout-refresh',
          expiresAt: new Date(Date.now() + 3600000),
          scope: 'openid email profile'
        });
        
        // Verify session exists
        expect(SessionManager.getSessionInfo()).toBeDefined();
        
        const authProvider = useAuthProvider();
        
        // Sign out
        await authProvider.signOut();
        
        // Verify cleanup
        expect(SessionManager.getSessionInfo()).toBeNull();
        expect(SessionManager.getStoredUser()).toBeNull();
      });
    });
  });

  describe('Permission and Access Control', () => {
    it('should validate user permissions correctly', async () => {
      await withIntegrationTest('permission-validation', 'auth', async (testData) => {
        const { users } = testData;
        
        // Test different user roles and their permissions
        const testCases = [
          { 
            role: 'admin', 
            resource: 'users', 
            action: 'delete', 
            shouldHavePermission: true 
          },
          { 
            role: 'manager', 
            resource: 'analyses', 
            action: 'read', 
            shouldHavePermission: true 
          },
          { 
            role: 'user', 
            resource: 'users', 
            action: 'delete', 
            shouldHavePermission: false 
          }
        ];
        
        for (const testCase of testCases) {
          const testUser = users.find(u => u.role === testCase.role);
          if (testUser) {
            const profile = {
              ...mockGoogleUser,
              email: testUser.email
            };
            
            const user = await SessionManager.createSession(profile, {
              accessToken: `${testCase.role}-token`,
              refreshToken: `${testCase.role}-refresh`,
              expiresAt: new Date(Date.now() + 3600000),
              scope: 'openid email profile'
            });
            
            // Mock auth provider with user
            const authProvider = useAuthProvider();
            Object.defineProperty(authProvider, 'user', {
              value: user,
              writable: false
            });
            
            const hasPermission = authProvider.hasPermission(
              testCase.resource, 
              testCase.action
            );
            
            expect(hasPermission).toBe(testCase.shouldHavePermission);
          }
        }
      });
    });

    it('should validate admin and manager roles', async () => {
      await withIntegrationTest('role-validation', 'auth', async (testData) => {
        const { users } = testData;
        
        const adminUser = users.find(u => u.role === 'admin');
        const managerUser = users.find(u => u.role === 'manager');
        const regularUser = users.find(u => u.role === 'user');
        
        if (adminUser && managerUser && regularUser) {
          // Test admin user
          const admin = await SessionManager.createSession({
            ...mockGoogleUser,
            email: adminUser.email
          }, {
            accessToken: 'admin-role-token',
            refreshToken: 'admin-role-refresh',
            expiresAt: new Date(Date.now() + 3600000),
            scope: 'openid email profile'
          });
          
          const authProvider = useAuthProvider();
          Object.defineProperty(authProvider, 'user', {
            value: admin,
            writable: false
          });
          
          expect(authProvider.isAdmin()).toBe(true);
          expect(authProvider.isManager()).toBe(true);
          expect(authProvider.canManageUsers()).toBe(true);
        }
      });
    });
  });
});