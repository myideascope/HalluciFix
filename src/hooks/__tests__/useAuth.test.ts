import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthProvider } from '../useAuth';

// Mock dependencies
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null }
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } }
      }),
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn()
    }
  }
}));

vi.mock('../../lib/subscriptionService', () => ({
  subscriptionService: {
    getSubscription: vi.fn().mockResolvedValue(null),
    getSubscriptionPlan: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock('../../lib/oauth/oauthConfig', () => ({
  oauthConfig: {
    getAvailabilityStatus: vi.fn().mockReturnValue({
      available: true,
      reason: null
    }),
    getConfig: vi.fn().mockReturnValue({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret'
    })
  }
}));

vi.mock('../../lib/oauth/oauthService', () => ({
  OAuthService: vi.fn().mockImplementation(() => ({
    initiateAuthFlow: vi.fn(),
    handleCallback: vi.fn(),
    refreshToken: vi.fn()
  }))
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with loading state', () => {
      const { result } = renderHook(() => useAuthProvider());

      expect(result.current.loading).toBe(true);
      expect(result.current.user).toBeNull();
      expect(result.current.subscription).toBeNull();
    });

    it('should check for existing session on mount', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      renderHook(() => useAuthProvider());

      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    it('should set up auth state change listener', () => {
      const { supabase } = await import('../../lib/supabase');
      
      renderHook(() => useAuthProvider());

      expect(supabase.auth.onAuthStateChange).toHaveBeenCalled();
    });

    it('should initialize OAuth service when available', async () => {
      const { oauthConfig } = await import('../../lib/oauth/oauthConfig');
      
      vi.mocked(oauthConfig.getAvailabilityStatus).mockReturnValue({
        available: true,
        reason: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isOAuthAvailable).toBe(true);
      });
    });

    it('should handle OAuth unavailability gracefully', async () => {
      const { oauthConfig } = await import('../../lib/oauth/oauthConfig');
      
      vi.mocked(oauthConfig.getAvailabilityStatus).mockReturnValue({
        available: false,
        reason: 'Configuration missing'
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.isOAuthAvailable).toBe(false);
        expect(result.current.oauthService).toBeNull();
      });
    });
  });

  describe('authentication methods', () => {
    it('should handle Google sign in', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
        data: { url: 'https://oauth.url' },
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('/auth/callback')
        })
      });
    });

    it('should handle email/password sign in', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com'
      };

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: mockUser, session: { user: mockUser } },
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await act(async () => {
        await result.current.signInWithEmailPassword('test@example.com', 'password');
      });

      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password'
      });
    });

    it('should handle sign up', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com'
      };

      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await act(async () => {
        await result.current.signUpWithEmailPassword('test@example.com', 'password');
      });

      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password'
      });
    });

    it('should handle sign out', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      vi.mocked(supabase.auth.signOut).mockResolvedValue({
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await act(async () => {
        await result.current.signOut();
      });

      expect(supabase.auth.signOut).toHaveBeenCalled();
    });

    it('should handle authentication errors', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      const authError = new Error('Authentication failed');
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: authError
      });

      const { result } = renderHook(() => useAuthProvider());

      await expect(
        result.current.signInWithEmailPassword('test@example.com', 'wrong-password')
      ).rejects.toThrow('Authentication failed');
    });
  });

  describe('user state management', () => {
    it('should update user state when session changes', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        user_metadata: { role: 'user' }
      };

      // Mock the auth state change callback
      let authStateCallback: (event: string, session: any) => void;
      vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
        authStateCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      const { result } = renderHook(() => useAuthProvider());

      await act(async () => {
        authStateCallback('SIGNED_IN', { user: mockUser });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(
          expect.objectContaining({
            id: 'test-user-id',
            email: 'test@example.com'
          })
        );
        expect(result.current.loading).toBe(false);
      });
    });

    it('should clear user state on sign out', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      let authStateCallback: (event: string, session: any) => void;
      vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
        authStateCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      const { result } = renderHook(() => useAuthProvider());

      await act(async () => {
        authStateCallback('SIGNED_OUT', null);
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.subscription).toBeNull();
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('subscription management', () => {
    it('should load subscription data for authenticated user', async () => {
      const { subscriptionService } = await import('../../lib/subscriptionService');
      
      const mockSubscription = {
        id: 'sub-123',
        plan: 'pro',
        status: 'active'
      };

      vi.mocked(subscriptionService.getSubscription).mockResolvedValue(mockSubscription);

      const { result } = renderHook(() => useAuthProvider());

      // Simulate user authentication
      await act(async () => {
        result.current.refreshSubscription();
      });

      await waitFor(() => {
        expect(result.current.subscription).toEqual(mockSubscription);
      });
    });

    it('should check active subscription status', () => {
      const { result } = renderHook(() => useAuthProvider());

      // Mock subscription state
      act(() => {
        result.current.subscription = {
          id: 'sub-123',
          plan: 'pro',
          status: 'active'
        } as any;
      });

      expect(result.current.hasActiveSubscription()).toBe(true);
    });

    it('should check feature access permissions', () => {
      const { result } = renderHook(() => useAuthProvider());

      // Mock subscription with pro plan
      act(() => {
        result.current.subscriptionPlan = {
          id: 'pro',
          name: 'Pro Plan',
          features: ['advanced_analysis', 'batch_processing']
        } as any;
      });

      expect(result.current.canAccessFeature('advanced_analysis')).toBe(true);
      expect(result.current.canAccessFeature('enterprise_feature')).toBe(false);
    });
  });

  describe('permission system', () => {
    it('should check user permissions', () => {
      const { result } = renderHook(() => useAuthProvider());

      // Mock user with admin role
      act(() => {
        result.current.user = {
          id: 'test-user-id',
          email: 'admin@example.com',
          role: 'admin'
        } as any;
      });

      expect(result.current.hasPermission('users', 'read')).toBe(true);
      expect(result.current.hasPermission('users', 'write')).toBe(true);
      expect(result.current.isAdmin()).toBe(true);
    });

    it('should restrict permissions for regular users', () => {
      const { result } = renderHook(() => useAuthProvider());

      // Mock regular user
      act(() => {
        result.current.user = {
          id: 'test-user-id',
          email: 'user@example.com',
          role: 'user'
        } as any;
      });

      expect(result.current.hasPermission('users', 'read')).toBe(false);
      expect(result.current.hasPermission('users', 'write')).toBe(false);
      expect(result.current.isAdmin()).toBe(false);
      expect(result.current.canManageUsers()).toBe(false);
    });

    it('should check manager permissions', () => {
      const { result } = renderHook(() => useAuthProvider());

      // Mock manager user
      act(() => {
        result.current.user = {
          id: 'test-user-id',
          email: 'manager@example.com',
          role: 'manager'
        } as any;
      });

      expect(result.current.isManager()).toBe(true);
      expect(result.current.canManageUsers()).toBe(true);
    });
  });

  describe('session management', () => {
    it('should get session status', async () => {
      const { result } = renderHook(() => useAuthProvider());

      const sessionStatus = await result.current.getSessionStatus();

      expect(typeof sessionStatus).toBe('object');
    });

    it('should validate current session', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { user: { id: 'test-user' } } }
      });

      const { result } = renderHook(() => useAuthProvider());

      const isValid = await result.current.validateCurrentSession();

      expect(isValid).toBe(true);
    });

    it('should handle invalid session', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null }
      });

      const { result } = renderHook(() => useAuthProvider());

      const isValid = await result.current.validateCurrentSession();

      expect(isValid).toBe(false);
    });
  });

  describe('profile management', () => {
    it('should refresh user profile', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      const updatedUser = {
        id: 'test-user-id',
        email: 'updated@example.com'
      };

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: { user: updatedUser } }
      });

      const { result } = renderHook(() => useAuthProvider());

      await act(async () => {
        await result.current.refreshProfile();
      });

      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    it('should handle profile refresh errors', async () => {
      const { supabase } = await import('../../lib/supabase');
      
      vi.mocked(supabase.auth.getSession).mockRejectedValue(
        new Error('Failed to refresh profile')
      );

      const { result } = renderHook(() => useAuthProvider());

      await expect(result.current.refreshProfile()).rejects.toThrow(
        'Failed to refresh profile'
      );
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe from auth changes on unmount', () => {
      const unsubscribeMock = vi.fn();
      const { supabase } = require('../../lib/supabase');
      
      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
        data: { subscription: { unsubscribe: unsubscribeMock } }
      });

      const { unmount } = renderHook(() => useAuthProvider());

      unmount();

      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });
});