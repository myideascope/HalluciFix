/**
 * Cognito Authentication Integration Tests
 * Tests the complete authentication flow with AWS Cognito
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cognitoAuth, createCognitoConfig } from '../../lib/cognitoAuth';
import { userProfileSync } from '../../lib/userProfileSync';
import { useCognitoAuthProvider } from '../../hooks/useCognitoAuth';
import { renderHook, act } from '@testing-library/react';

// Mock AWS Amplify
vi.mock('aws-amplify', () => ({
  Amplify: {
    configure: vi.fn(),
  },
}));

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn(),
  fetchAuthSession: vi.fn(),
  confirmSignUp: vi.fn(),
  resendSignUpCode: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  updatePassword: vi.fn(),
  signInWithRedirect: vi.fn(),
  fetchUserAttributes: vi.fn(),
  updateUserAttributes: vi.fn(),
}));

// Mock environment configuration
vi.mock('../../lib/env', () => ({
  config: {
    useCognito: true,
    useSupabase: false,
    cognitoUserPoolId: 'us-east-1_TEST123456',
    cognitoUserPoolClientId: 'test-client-id',
    cognitoRegion: 'us-east-1',
    cognitoIdentityPoolId: 'us-east-1:test-identity-pool-id',
    cognitoDomain: 'hallucifix-test-domain',
  },
}));

describe('Cognito Authentication Integration', () => {
  const mockConfig = createCognitoConfig(
    'us-east-1_TEST123456',
    'test-client-id',
    'us-east-1',
    {
      identityPoolId: 'us-east-1:test-identity-pool-id',
      domain: 'hallucifix-test-domain',
      redirectSignIn: 'http://localhost:3000/callback',
      redirectSignOut: 'http://localhost:3000/logout',
    }
  );

  const mockCognitoUser = {
    userId: 'test-user-id',
    username: 'test@example.com',
    email: 'test@example.com',
    emailVerified: true,
    givenName: 'Test',
    familyName: 'User',
    name: 'Test User',
    picture: 'https://example.com/avatar.jpg',
    attributes: {
      email: 'test@example.com',
      email_verified: 'true',
      given_name: 'Test',
      family_name: 'User',
      name: 'Test User',
      picture: 'https://example.com/avatar.jpg',
    },
  };

  const mockAuthSession = {
    tokens: {
      accessToken: {
        toString: () => 'mock-access-token',
      },
      idToken: {
        toString: () => 'mock-id-token',
      },
      refreshToken: {
        toString: () => 'mock-refresh-token',
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CognitoAuthService', () => {
    it('should initialize with correct configuration', async () => {
      const { Amplify } = await import('aws-amplify');
      
      await cognitoAuth.initialize(mockConfig);

      expect(Amplify.configure).toHaveBeenCalledWith({
        Auth: {
          Cognito: {
            userPoolId: mockConfig.userPoolId,
            userPoolClientId: mockConfig.userPoolClientId,
            identityPoolId: mockConfig.identityPoolId,
            loginWith: {
              oauth: {
                domain: mockConfig.domain,
                scopes: ['openid', 'email', 'profile'],
                redirectSignIn: [mockConfig.redirectSignIn],
                redirectSignOut: [mockConfig.redirectSignOut],
                responseType: 'code',
                providers: ['Google'],
              },
              email: true,
              username: false,
            },
          },
        },
      });
    });

    it('should sign in with email and password', async () => {
      const { signIn, getCurrentUser, fetchAuthSession } = await import('aws-amplify/auth');
      
      vi.mocked(signIn).mockResolvedValue({ isSignedIn: true });
      vi.mocked(getCurrentUser).mockResolvedValue(mockCognitoUser);
      vi.mocked(fetchAuthSession).mockResolvedValue(mockAuthSession);

      await cognitoAuth.initialize(mockConfig);
      const result = await cognitoAuth.signInWithEmailPassword('test@example.com', 'password123');

      expect(signIn).toHaveBeenCalledWith({
        username: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        user: mockCognitoUser,
        accessToken: 'mock-access-token',
        idToken: 'mock-id-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should sign up with email and password', async () => {
      const { signUp } = await import('aws-amplify/auth');
      
      vi.mocked(signUp).mockResolvedValue({
        userId: 'new-user-id',
        isSignUpComplete: false,
      });

      await cognitoAuth.initialize(mockConfig);
      const result = await cognitoAuth.signUpWithEmailPassword('newuser@example.com', 'password123');

      expect(signUp).toHaveBeenCalledWith({
        username: 'newuser@example.com',
        password: 'password123',
        options: {
          userAttributes: {
            email: 'newuser@example.com',
          },
        },
      });

      expect(result).toEqual({
        userId: 'new-user-id',
        isConfirmed: false,
      });
    });

    it('should confirm sign up', async () => {
      const { confirmSignUp } = await import('aws-amplify/auth');
      
      vi.mocked(confirmSignUp).mockResolvedValue(undefined);

      await cognitoAuth.initialize(mockConfig);
      await cognitoAuth.confirmSignUp('test@example.com', '123456');

      expect(confirmSignUp).toHaveBeenCalledWith({
        username: 'test@example.com',
        confirmationCode: '123456',
      });
    });

    it('should initiate Google OAuth sign in', async () => {
      const { signInWithRedirect } = await import('aws-amplify/auth');
      
      vi.mocked(signInWithRedirect).mockResolvedValue(undefined);

      await cognitoAuth.initialize(mockConfig);
      await cognitoAuth.signInWithGoogle();

      expect(signInWithRedirect).toHaveBeenCalledWith({
        provider: 'Google',
      });
    });

    it('should get current user session', async () => {
      const { fetchAuthSession, getCurrentUser } = await import('aws-amplify/auth');
      
      vi.mocked(fetchAuthSession).mockResolvedValue(mockAuthSession);
      vi.mocked(getCurrentUser).mockResolvedValue(mockCognitoUser);

      await cognitoAuth.initialize(mockConfig);
      const session = await cognitoAuth.getCurrentSession();

      expect(session).toEqual({
        user: mockCognitoUser,
        accessToken: 'mock-access-token',
        idToken: 'mock-id-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should sign out user', async () => {
      const { signOut } = await import('aws-amplify/auth');
      
      vi.mocked(signOut).mockResolvedValue(undefined);

      await cognitoAuth.initialize(mockConfig);
      await cognitoAuth.signOut();

      expect(signOut).toHaveBeenCalled();
    });

    it('should reset password', async () => {
      const { resetPassword } = await import('aws-amplify/auth');
      
      vi.mocked(resetPassword).mockResolvedValue(undefined);

      await cognitoAuth.initialize(mockConfig);
      await cognitoAuth.resetPassword('test@example.com');

      expect(resetPassword).toHaveBeenCalledWith({
        username: 'test@example.com',
      });
    });

    it('should confirm password reset', async () => {
      const { confirmResetPassword } = await import('aws-amplify/auth');
      
      vi.mocked(confirmResetPassword).mockResolvedValue(undefined);

      await cognitoAuth.initialize(mockConfig);
      await cognitoAuth.confirmPasswordReset('test@example.com', '123456', 'newpassword123');

      expect(confirmResetPassword).toHaveBeenCalledWith({
        username: 'test@example.com',
        confirmationCode: '123456',
        newPassword: 'newpassword123',
      });
    });
  });

  describe('useCognitoAuth Hook', () => {
    it('should initialize and provide authentication context', async () => {
      const { getCurrentUser, fetchAuthSession } = await import('aws-amplify/auth');
      
      vi.mocked(getCurrentUser).mockResolvedValue(mockCognitoUser);
      vi.mocked(fetchAuthSession).mockResolvedValue(mockAuthSession);

      const { result } = renderHook(() => useCognitoAuthProvider());

      // Wait for initialization
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.user).toBeTruthy();
    });

    it('should handle sign in through hook', async () => {
      const { signIn, getCurrentUser, fetchAuthSession } = await import('aws-amplify/auth');
      
      vi.mocked(signIn).mockResolvedValue({ isSignedIn: true });
      vi.mocked(getCurrentUser).mockResolvedValue(mockCognitoUser);
      vi.mocked(fetchAuthSession).mockResolvedValue(mockAuthSession);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await act(async () => {
        await result.current.signInWithEmailPassword('test@example.com', 'password123');
      });

      expect(signIn).toHaveBeenCalledWith({
        username: 'test@example.com',
        password: 'password123',
      });
    });

    it('should handle sign out through hook', async () => {
      const { signOut } = await import('aws-amplify/auth');
      
      vi.mocked(signOut).mockResolvedValue(undefined);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await act(async () => {
        await result.current.signOut();
      });

      expect(signOut).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
    });
  });

  describe('User Profile Synchronization', () => {
    it('should sync Cognito user to RDS profile', async () => {
      // Mock the user profile sync service
      const syncSpy = vi.spyOn(userProfileSync, 'syncCognitoUserToRDS');
      syncSpy.mockResolvedValue({
        success: true,
        action: 'created',
        message: 'User profile created successfully',
        profile: {
          id: 'profile-id',
          cognitoUserId: mockCognitoUser.userId,
          email: mockCognitoUser.email!,
          name: mockCognitoUser.name,
          avatarUrl: mockCognitoUser.picture,
          role: 'user',
          department: 'General',
          status: 'active',
          lastActive: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const result = await userProfileSync.syncCognitoUserToRDS(mockCognitoUser);

      expect(syncSpy).toHaveBeenCalledWith(mockCognitoUser);
      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(result.profile).toBeTruthy();

      syncSpy.mockRestore();
    });

    it('should handle profile sync on authentication', async () => {
      const syncSpy = vi.spyOn(userProfileSync, 'syncOnAuthentication');
      syncSpy.mockResolvedValue({
        id: 'profile-id',
        cognitoUserId: mockCognitoUser.userId,
        email: mockCognitoUser.email!,
        name: mockCognitoUser.name,
        avatarUrl: mockCognitoUser.picture,
        role: 'user',
        department: 'General',
        status: 'active',
        lastActive: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const profile = await userProfileSync.syncOnAuthentication(mockCognitoUser);

      expect(syncSpy).toHaveBeenCalledWith(mockCognitoUser);
      expect(profile).toBeTruthy();
      expect(profile?.cognitoUserId).toBe(mockCognitoUser.userId);

      syncSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors gracefully', async () => {
      const { signIn } = await import('aws-amplify/auth');
      
      vi.mocked(signIn).mockRejectedValue(new Error('Invalid credentials'));

      await cognitoAuth.initialize(mockConfig);

      await expect(
        cognitoAuth.signInWithEmailPassword('test@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should handle network errors during sign up', async () => {
      const { signUp } = await import('aws-amplify/auth');
      
      vi.mocked(signUp).mockRejectedValue(new Error('Network error'));

      await cognitoAuth.initialize(mockConfig);

      await expect(
        cognitoAuth.signUpWithEmailPassword('test@example.com', 'password123')
      ).rejects.toThrow('Network error');
    });

    it('should handle OAuth errors', async () => {
      const { signInWithRedirect } = await import('aws-amplify/auth');
      
      vi.mocked(signInWithRedirect).mockRejectedValue(new Error('OAuth provider error'));

      await cognitoAuth.initialize(mockConfig);

      await expect(cognitoAuth.signInWithGoogle()).rejects.toThrow('OAuth provider error');
    });
  });

  describe('Session Management', () => {
    it('should check authentication status', async () => {
      const { fetchAuthSession } = await import('aws-amplify/auth');
      
      vi.mocked(fetchAuthSession).mockResolvedValue(mockAuthSession);

      await cognitoAuth.initialize(mockConfig);
      const isAuthenticated = await cognitoAuth.isAuthenticated();

      expect(isAuthenticated).toBe(true);
    });

    it('should handle expired sessions', async () => {
      const { fetchAuthSession } = await import('aws-amplify/auth');
      
      vi.mocked(fetchAuthSession).mockRejectedValue(new Error('Session expired'));

      await cognitoAuth.initialize(mockConfig);
      const isAuthenticated = await cognitoAuth.isAuthenticated();

      expect(isAuthenticated).toBe(false);
    });
  });

  describe('MFA Support', () => {
    it('should handle MFA challenge during sign in', async () => {
      const { signIn } = await import('aws-amplify/auth');
      
      vi.mocked(signIn).mockResolvedValue({
        isSignedIn: false,
        nextStep: {
          signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE',
        },
      });

      await cognitoAuth.initialize(mockConfig);

      await expect(
        cognitoAuth.signInWithEmailPassword('test@example.com', 'password123')
      ).rejects.toThrow('Sign in incomplete - additional steps required');
    });
  });

  describe('User Attributes', () => {
    it('should update user attributes', async () => {
      const { updateUserAttributes } = await import('aws-amplify/auth');
      
      vi.mocked(updateUserAttributes).mockResolvedValue(undefined);

      await cognitoAuth.initialize(mockConfig);
      await cognitoAuth.updateUserAttributes({
        name: 'Updated Name',
        picture: 'https://example.com/new-avatar.jpg',
      });

      expect(updateUserAttributes).toHaveBeenCalledWith({
        userAttributes: {
          name: 'Updated Name',
          picture: 'https://example.com/new-avatar.jpg',
        },
      });
    });

    it('should fetch user attributes', async () => {
      const { fetchUserAttributes } = await import('aws-amplify/auth');
      
      vi.mocked(fetchUserAttributes).mockResolvedValue({
        email: 'test@example.com',
        email_verified: 'true',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
      });

      await cognitoAuth.initialize(mockConfig);
      const user = await cognitoAuth.getCurrentUser();

      expect(fetchUserAttributes).toHaveBeenCalled();
      expect(user.email).toBe('test@example.com');
      expect(user.emailVerified).toBe(true);
    });
  });
});