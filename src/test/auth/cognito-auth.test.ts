import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Auth, Hub } from 'aws-amplify';
import { cognitoAuth, convertCognitoUserToAppUser } from '../../lib/cognito-auth';
import { DEFAULT_ROLES } from '../../types/user';

// Mock AWS Amplify
vi.mock('aws-amplify', () => ({
  Auth: {
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    federatedSignIn: vi.fn(),
    currentAuthenticatedUser: vi.fn(),
    currentSession: vi.fn(),
    confirmSignUp: vi.fn(),
    resendSignUp: vi.fn(),
    forgotPassword: vi.fn(),
    forgotPasswordSubmit: vi.fn(),
    changePassword: vi.fn(),
    updateUserAttributes: vi.fn(),
    userAttributes: vi.fn(),
  },
  Hub: {
    listen: vi.fn(),
    remove: vi.fn(),
  },
}));

describe('CognitoAuth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('signIn', () => {
    it('should successfully sign in with email and password', async () => {
      const mockUser = {
        getUsername: () => 'test@example.com',
        attributes: {
          email: 'test@example.com',
          name: 'Test User',
        },
      };

      vi.mocked(Auth.signIn).mockResolvedValue(mockUser);

      const result = await cognitoAuth.signIn('test@example.com', 'password123');

      expect(Auth.signIn).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(result).toBe(mockUser);
    });

    it('should handle sign in errors gracefully', async () => {
      const error = new Error('NotAuthorizedException');
      error.name = 'NotAuthorizedException';
      vi.mocked(Auth.signIn).mockRejectedValue(error);

      await expect(cognitoAuth.signIn('test@example.com', 'wrongpassword'))
        .rejects.toThrow('Invalid email or password.');
    });

    it('should handle user not confirmed error', async () => {
      const error = new Error('UserNotConfirmedException');
      error.name = 'UserNotConfirmedException';
      vi.mocked(Auth.signIn).mockRejectedValue(error);

      await expect(cognitoAuth.signIn('test@example.com', 'password123'))
        .rejects.toThrow('Please verify your email address before signing in.');
    });

    it('should handle user not found error', async () => {
      const error = new Error('UserNotFoundException');
      error.name = 'UserNotFoundException';
      vi.mocked(Auth.signIn).mockRejectedValue(error);

      await expect(cognitoAuth.signIn('nonexistent@example.com', 'password123'))
        .rejects.toThrow('No account found with this email address.');
    });
  });

  describe('signUp', () => {
    it('should successfully sign up with email and password', async () => {
      const mockResult = {
        user: {
          getUsername: () => 'test@example.com',
        },
        userConfirmed: false,
      };

      vi.mocked(Auth.signUp).mockResolvedValue(mockResult);

      const result = await cognitoAuth.signUp('test@example.com', 'password123', {
        name: 'Test User',
      });

      expect(Auth.signUp).toHaveBeenCalledWith({
        username: 'test@example.com',
        password: 'password123',
        attributes: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });
      expect(result).toBe(mockResult);
    });

    it('should handle username exists error', async () => {
      const error = new Error('UsernameExistsException');
      error.name = 'UsernameExistsException';
      vi.mocked(Auth.signUp).mockRejectedValue(error);

      await expect(cognitoAuth.signUp('existing@example.com', 'password123'))
        .rejects.toThrow('An account with this email already exists.');
    });

    it('should handle invalid password error', async () => {
      const error = new Error('InvalidPasswordException');
      error.name = 'InvalidPasswordException';
      vi.mocked(Auth.signUp).mockRejectedValue(error);

      await expect(cognitoAuth.signUp('test@example.com', 'weak'))
        .rejects.toThrow('Password does not meet requirements.');
    });
  });

  describe('signOut', () => {
    it('should successfully sign out', async () => {
      vi.mocked(Auth.signOut).mockResolvedValue(undefined);

      await cognitoAuth.signOut();

      expect(Auth.signOut).toHaveBeenCalled();
    });

    it('should handle sign out errors', async () => {
      const error = new Error('Sign out failed');
      vi.mocked(Auth.signOut).mockRejectedValue(error);

      await expect(cognitoAuth.signOut()).rejects.toThrow('Sign out failed');
    });
  });

  describe('signInWithGoogle', () => {
    it('should successfully sign in with Google', async () => {
      const mockUser = {
        getUsername: () => 'google_123456',
        attributes: {
          email: 'test@gmail.com',
          name: 'Test User',
        },
      };

      vi.mocked(Auth.federatedSignIn).mockResolvedValue(mockUser);

      const result = await cognitoAuth.signInWithGoogle();

      expect(Auth.federatedSignIn).toHaveBeenCalledWith({ provider: 'Google' });
      expect(result).toBe(mockUser);
    });

    it('should handle Google OAuth errors', async () => {
      const error = new Error('OAuth failed');
      vi.mocked(Auth.federatedSignIn).mockRejectedValue(error);

      await expect(cognitoAuth.signInWithGoogle()).rejects.toThrow('OAuth failed');
    });
  });

  describe('getCurrentUser', () => {
    it('should return current authenticated user', async () => {
      const mockUser = {
        getUsername: () => 'test@example.com',
        attributes: {
          email: 'test@example.com',
        },
      };

      vi.mocked(Auth.currentAuthenticatedUser).mockResolvedValue(mockUser);

      const result = await cognitoAuth.getCurrentUser();

      expect(Auth.currentAuthenticatedUser).toHaveBeenCalled();
      expect(result).toBe(mockUser);
    });

    it('should return null when no user is authenticated', async () => {
      const error = new Error('No current user');
      vi.mocked(Auth.currentAuthenticatedUser).mockRejectedValue(error);

      const result = await cognitoAuth.getCurrentUser();

      expect(result).toBeNull();
    });
  });

  describe('confirmSignUp', () => {
    it('should successfully confirm sign up', async () => {
      const mockResult = { success: true };
      vi.mocked(Auth.confirmSignUp).mockResolvedValue(mockResult);

      const result = await cognitoAuth.confirmSignUp('test@example.com', '123456');

      expect(Auth.confirmSignUp).toHaveBeenCalledWith('test@example.com', '123456');
      expect(result).toBe(mockResult);
    });

    it('should handle code mismatch error', async () => {
      const error = new Error('CodeMismatchException');
      error.name = 'CodeMismatchException';
      vi.mocked(Auth.confirmSignUp).mockRejectedValue(error);

      await expect(cognitoAuth.confirmSignUp('test@example.com', 'wrong'))
        .rejects.toThrow('Invalid verification code.');
    });

    it('should handle expired code error', async () => {
      const error = new Error('ExpiredCodeException');
      error.name = 'ExpiredCodeException';
      vi.mocked(Auth.confirmSignUp).mockRejectedValue(error);

      await expect(cognitoAuth.confirmSignUp('test@example.com', '123456'))
        .rejects.toThrow('Verification code has expired.');
    });
  });

  describe('forgotPassword', () => {
    it('should successfully initiate forgot password', async () => {
      const mockResult = { CodeDeliveryDetails: { Destination: 't***@example.com' } };
      vi.mocked(Auth.forgotPassword).mockResolvedValue(mockResult);

      const result = await cognitoAuth.forgotPassword('test@example.com');

      expect(Auth.forgotPassword).toHaveBeenCalledWith('test@example.com');
      expect(result).toBe(mockResult);
    });
  });

  describe('changePassword', () => {
    it('should successfully change password', async () => {
      const mockUser = { getUsername: () => 'test@example.com' };
      const mockResult = { success: true };

      vi.mocked(Auth.currentAuthenticatedUser).mockResolvedValue(mockUser);
      vi.mocked(Auth.changePassword).mockResolvedValue(mockResult);

      const result = await cognitoAuth.changePassword('oldpass', 'newpass');

      expect(Auth.currentAuthenticatedUser).toHaveBeenCalled();
      expect(Auth.changePassword).toHaveBeenCalledWith(mockUser, 'oldpass', 'newpass');
      expect(result).toBe(mockResult);
    });
  });
});

describe('convertCognitoUserToAppUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should convert Cognito user to app user format', async () => {
    const mockCognitoUser = {
      getUsername: () => 'test@example.com',
    };

    const mockAttributes = [
      { Name: 'email', Value: 'test@example.com' },
      { Name: 'name', Value: 'Test User' },
      { Name: 'picture', Value: 'https://example.com/avatar.jpg' },
      { Name: 'custom:role', Value: 'admin' },
      { Name: 'custom:department', Value: 'Engineering' },
      { Name: 'custom:status', Value: 'active' },
    ];

    vi.mocked(Auth.userAttributes).mockResolvedValue(mockAttributes);

    const result = await convertCognitoUserToAppUser(mockCognitoUser as any);

    expect(result).toEqual({
      id: 'test@example.com',
      email: 'test@example.com',
      name: 'Test User',
      avatar: 'https://example.com/avatar.jpg',
      role: DEFAULT_ROLES[2], // Default user role
      department: 'Engineering',
      status: 'active',
      lastActive: expect.any(String),
      createdAt: expect.any(String),
      permissions: DEFAULT_ROLES[2].permissions,
    });
  });

  it('should handle missing attributes gracefully', async () => {
    const mockCognitoUser = {
      getUsername: () => 'test@example.com',
    };

    const mockAttributes = [
      { Name: 'email', Value: 'test@example.com' },
    ];

    vi.mocked(Auth.userAttributes).mockResolvedValue(mockAttributes);

    const result = await convertCognitoUserToAppUser(mockCognitoUser as any);

    expect(result).toEqual({
      id: 'test@example.com',
      email: 'test@example.com',
      name: 'test', // Derived from email
      avatar: undefined,
      role: DEFAULT_ROLES[2],
      department: 'General',
      status: 'active',
      lastActive: expect.any(String),
      createdAt: expect.any(String),
      permissions: DEFAULT_ROLES[2].permissions,
    });
  });

  it('should handle userAttributes error and return fallback user', async () => {
    const mockCognitoUser = {
      getUsername: () => 'test@example.com',
    };

    vi.mocked(Auth.userAttributes).mockRejectedValue(new Error('Failed to get attributes'));

    const result = await convertCognitoUserToAppUser(mockCognitoUser as any);

    expect(result).toEqual({
      id: 'test@example.com',
      email: 'test@example.com',
      name: 'User',
      avatar: undefined,
      role: DEFAULT_ROLES[2],
      department: 'General',
      status: 'active',
      lastActive: expect.any(String),
      createdAt: expect.any(String),
      permissions: DEFAULT_ROLES[2].permissions,
    });
  });
});