import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Auth, Hub } from 'aws-amplify';
import { useCognitoAuthProvider } from '../../hooks/useCognitoAuth';
import { subscriptionService } from '../../lib/subscriptionServiceClient';

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

// Mock subscription service
vi.mock('../../lib/subscriptionServiceClient', () => ({
  subscriptionService: {
    getUserSubscription: vi.fn(),
    getSubscriptionPlan: vi.fn(),
  },
}));

// Mock cognito auth service
vi.mock('../../lib/cognito-auth', () => ({
  cognitoAuth: {
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
    getCurrentUser: vi.fn(),
    confirmSignUp: vi.fn(),
    resendConfirmationCode: vi.fn(),
    forgotPassword: vi.fn(),
    confirmPassword: vi.fn(),
    changePassword: vi.fn(),
  },
  convertCognitoUserToAppUser: vi.fn(),
}));

describe('useCognitoAuth Hook', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    avatar: 'https://example.com/avatar.jpg',
    role: { name: 'user', level: 3, permissions: [] },
    department: 'Engineering',
    status: 'active',
    lastActive: '2023-01-01T00:00:00Z',
    createdAt: '2023-01-01T00:00:00Z',
    permissions: [],
  };

  const mockSubscription = {
    id: 'sub-123',
    userId: 'test-user-id',
    planId: 'pro',
    status: 'active',
    currentPeriodStart: '2023-01-01T00:00:00Z',
    currentPeriodEnd: '2023-02-01T00:00:00Z',
    cancelAtPeriodEnd: false,
  };

  const mockPlan = {
    id: 'pro',
    name: 'Pro Plan',
    price: 29.99,
    interval: 'month',
    features: ['advanced_analysis', 'batch_processing'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    vi.mocked(subscriptionService.getUserSubscription).mockResolvedValue(mockSubscription);
    vi.mocked(subscriptionService.getSubscriptionPlan).mockResolvedValue(mockPlan);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with loading state', () => {
      vi.mocked(Auth.currentAuthenticatedUser).mockRejectedValue(new Error('No user'));

      const { result } = renderHook(() => useCognitoAuthProvider());

      expect(result.current.loading).toBe(true);
      expect(result.current.user).toBeNull();
    });

    it('should load authenticated user on initialization', async () => {
      const mockCognitoUser = { getUsername: () => 'test@example.com' };
      
      vi.mocked(Auth.currentAuthenticatedUser).mockResolvedValue(mockCognitoUser);
      
      const { convertCognitoUserToAppUser } = await import('../../lib/cognito-auth');
      vi.mocked(convertCognitoUserToAppUser).mockResolvedValue(mockUser);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
    });

    it('should handle no authenticated user', async () => {
      vi.mocked(Auth.currentAuthenticatedUser).mockRejectedValue(new Error('No user'));

      const { result } = renderHook(() => useCognitoAuthProvider());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
    });
  });

  describe('Hub listener', () => {
    it('should set up Hub listener for auth events', () => {
      renderHook(() => useCognitoAuthProvider());

      expect(Hub.listen).toHaveBeenCalledWith('auth', expect.any(Function));
    });

    it('should handle signIn event', async () => {
      let hubCallback: any;
      vi.mocked(Hub.listen).mockImplementation((channel, callback) => {
        if (channel === 'auth') {
          hubCallback = callback;
        }
      });

      const mockCognitoUser = { getUsername: () => 'test@example.com' };
      const { convertCognitoUserToAppUser } = await import('../../lib/cognito-auth');
      vi.mocked(convertCognitoUserToAppUser).mockResolvedValue(mockUser);

      const { result } = renderHook(() => useCognitoAuthProvider());

      // Simulate signIn event
      act(() => {
        hubCallback({
          payload: {
            event: 'signIn',
            data: mockCognitoUser,
          },
        });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });
    });

    it('should handle signOut event', async () => {
      let hubCallback: any;
      vi.mocked(Hub.listen).mockImplementation((channel, callback) => {
        if (channel === 'auth') {
          hubCallback = callback;
        }
      });

      const { result } = renderHook(() => useCognitoAuthProvider());

      // Set initial user
      act(() => {
        hubCallback({
          payload: {
            event: 'signIn',
            data: { getUsername: () => 'test@example.com' },
          },
        });
      });

      // Simulate signOut event
      act(() => {
        hubCallback({
          payload: {
            event: 'signOut',
          },
        });
      });

      expect(result.current.user).toBeNull();
      expect(result.current.subscription).toBeNull();
      expect(result.current.subscriptionPlan).toBeNull();
    });
  });

  describe('authentication methods', () => {
    it('should sign in with email and password', async () => {
      const { cognitoAuth } = await import('../../lib/cognito-auth');
      const mockCognitoUser = { getUsername: () => 'test@example.com' };
      
      vi.mocked(cognitoAuth.signIn).mockResolvedValue(mockCognitoUser);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await act(async () => {
        await result.current.signInWithEmailPassword('test@example.com', 'password123');
      });

      expect(cognitoAuth.signIn).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should sign up with email and password', async () => {
      const { cognitoAuth } = await import('../../lib/cognito-auth');
      const mockResult = { user: { getUsername: () => 'test@example.com' } };
      
      vi.mocked(cognitoAuth.signUp).mockResolvedValue(mockResult);

      const { result } = renderHook(() => useCognitoAuthProvider());

      let signUpResult;
      await act(async () => {
        signUpResult = await result.current.signUpWithEmailPassword('test@example.com', 'password123');
      });

      expect(cognitoAuth.signUp).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(signUpResult).toBe(mockResult);
    });

    it('should sign in with Google', async () => {
      const { cognitoAuth } = await import('../../lib/cognito-auth');
      
      vi.mocked(cognitoAuth.signInWithGoogle).mockResolvedValue(undefined);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      expect(cognitoAuth.signInWithGoogle).toHaveBeenCalled();
    });

    it('should sign out', async () => {
      const { cognitoAuth } = await import('../../lib/cognito-auth');
      
      vi.mocked(cognitoAuth.signOut).mockResolvedValue(undefined);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await act(async () => {
        await result.current.signOut();
      });

      expect(cognitoAuth.signOut).toHaveBeenCalled();
    });

    it('should confirm sign up', async () => {
      const { cognitoAuth } = await import('../../lib/cognito-auth');
      
      vi.mocked(cognitoAuth.confirmSignUp).mockResolvedValue(undefined);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await act(async () => {
        await result.current.confirmSignUp('test@example.com', '123456');
      });

      expect(cognitoAuth.confirmSignUp).toHaveBeenCalledWith('test@example.com', '123456');
    });

    it('should handle forgot password', async () => {
      const { cognitoAuth } = await import('../../lib/cognito-auth');
      
      vi.mocked(cognitoAuth.forgotPassword).mockResolvedValue(undefined);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await act(async () => {
        await result.current.forgotPassword('test@example.com');
      });

      expect(cognitoAuth.forgotPassword).toHaveBeenCalledWith('test@example.com');
    });

    it('should change password', async () => {
      const { cognitoAuth } = await import('../../lib/cognito-auth');
      
      vi.mocked(cognitoAuth.changePassword).mockResolvedValue(undefined);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await act(async () => {
        await result.current.changePassword('oldpass', 'newpass');
      });

      expect(cognitoAuth.changePassword).toHaveBeenCalledWith('oldpass', 'newpass');
    });
  });

  describe('subscription management', () => {
    it('should load user subscription after sign in', async () => {
      const mockCognitoUser = { getUsername: () => 'test@example.com' };
      
      vi.mocked(Auth.currentAuthenticatedUser).mockResolvedValue(mockCognitoUser);
      
      const { convertCognitoUserToAppUser } = await import('../../lib/cognito-auth');
      vi.mocked(convertCognitoUserToAppUser).mockResolvedValue(mockUser);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await waitFor(() => {
        expect(result.current.subscription).toEqual(mockSubscription);
        expect(result.current.subscriptionPlan).toEqual(mockPlan);
      });

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith(mockUser.id);
      expect(subscriptionService.getSubscriptionPlan).toHaveBeenCalledWith(mockSubscription.planId);
    });

    it('should refresh subscription', async () => {
      const { result } = renderHook(() => useCognitoAuthProvider());

      // Set user first
      act(() => {
        (result.current as any).user = mockUser;
      });

      await act(async () => {
        await result.current.refreshSubscription();
      });

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('permission checks', () => {
    it('should check permissions correctly', () => {
      const userWithPermissions = {
        ...mockUser,
        role: { name: 'admin', level: 1, permissions: [] },
        permissions: [
          { resource: 'users', actions: ['read', 'write'] },
          { resource: 'analytics', actions: ['read'] },
        ],
      };

      const { result } = renderHook(() => useCognitoAuthProvider());

      // Set user with permissions
      act(() => {
        (result.current as any).user = userWithPermissions;
      });

      expect(result.current.hasPermission('users', 'read')).toBe(true);
      expect(result.current.hasPermission('users', 'write')).toBe(true);
      expect(result.current.hasPermission('analytics', 'read')).toBe(true);
      expect(result.current.hasPermission('analytics', 'write')).toBe(true); // Admin has all permissions
      expect(result.current.hasPermission('billing', 'read')).toBe(true); // Admin has all permissions
    });

    it('should check admin status', () => {
      const adminUser = {
        ...mockUser,
        role: { name: 'admin', level: 1, permissions: [] },
      };

      const { result } = renderHook(() => useCognitoAuthProvider());

      // Set admin user
      act(() => {
        (result.current as any).user = adminUser;
      });

      expect(result.current.isAdmin()).toBe(true);
      expect(result.current.isManager()).toBe(true);
      expect(result.current.canManageUsers()).toBe(true);
    });

    it('should check manager status', () => {
      const managerUser = {
        ...mockUser,
        role: { name: 'manager', level: 2, permissions: [] },
      };

      const { result } = renderHook(() => useCognitoAuthProvider());

      // Set manager user
      act(() => {
        (result.current as any).user = managerUser;
      });

      expect(result.current.isAdmin()).toBe(false);
      expect(result.current.isManager()).toBe(true);
    });

    it('should check feature access based on subscription', () => {
      const { result } = renderHook(() => useCognitoAuthProvider());

      // Set user and subscription
      act(() => {
        (result.current as any).user = mockUser;
        (result.current as any).subscription = mockSubscription;
        (result.current as any).subscriptionPlan = mockPlan;
      });

      expect(result.current.hasActiveSubscription()).toBe(true);
      expect(result.current.canAccessFeature('advanced_analysis')).toBe(true);
      expect(result.current.canAccessFeature('batch_processing')).toBe(true);
      expect(result.current.canAccessFeature('unlimited_analyses')).toBe(false); // Enterprise only
    });

    it('should deny feature access without subscription', () => {
      const { result } = renderHook(() => useCognitoAuthProvider());

      // Set user without subscription
      act(() => {
        (result.current as any).user = mockUser;
        (result.current as any).subscription = null;
        (result.current as any).subscriptionPlan = null;
      });

      expect(result.current.hasActiveSubscription()).toBe(false);
      expect(result.current.canAccessFeature('advanced_analysis')).toBe(false);
      expect(result.current.canAccessFeature('batch_processing')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle sign in errors', async () => {
      const { cognitoAuth } = await import('../../lib/cognito-auth');
      const error = new Error('Invalid credentials');
      
      vi.mocked(cognitoAuth.signIn).mockRejectedValue(error);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await expect(
        act(async () => {
          await result.current.signInWithEmailPassword('test@example.com', 'wrongpassword');
        })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should handle subscription loading errors', async () => {
      vi.mocked(subscriptionService.getUserSubscription).mockRejectedValue(
        new Error('Subscription service unavailable')
      );

      const mockCognitoUser = { getUsername: () => 'test@example.com' };
      vi.mocked(Auth.currentAuthenticatedUser).mockResolvedValue(mockCognitoUser);
      
      const { convertCognitoUserToAppUser } = await import('../../lib/cognito-auth');
      vi.mocked(convertCognitoUserToAppUser).mockResolvedValue(mockUser);

      const { result } = renderHook(() => useCognitoAuthProvider());

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.subscription).toBeNull();
        expect(result.current.subscriptionPlan).toBeNull();
      });
    });
  });
});