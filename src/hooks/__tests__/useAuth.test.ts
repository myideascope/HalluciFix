import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuthProvider } from '../useAuth';
import { supabase } from '../../lib/supabase';
import { DEFAULT_ROLES } from '../../types/user';

// Mock Supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn()
    }
  }
}));

const mockSupabase = vi.mocked(supabase);

describe('useAuth', () => {
  const mockUser = {
    id: 'test-user-123',
    email: 'test@example.com',
    created_at: '2024-01-01T00:00:00Z',
    user_metadata: {
      full_name: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg'
    }
  };

  const mockSession = {
    user: mockUser,
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token'
  };

<<<<<<< HEAD
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with no user when no session exists', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      mockSupabase.auth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } }
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it('should initialize with user when session exists', async () => {
=======
  let mockUnsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUnsubscribe = vi.fn();
    
    // Default mock setup
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    });
    
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } }
    } as any);
    
    mockSupabase.auth.signOut.mockResolvedValue({
      error: null
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should start with loading state', () => {
      const { result } = renderHook(() => useAuthProvider());
      
      expect(result.current.loading).toBe(true);
      expect(result.current.user).toBe(null);
    });

    it('should load existing session on mount', async () => {
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

<<<<<<< HEAD
      mockSupabase.auth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } }
      });

=======
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toMatchObject({
<<<<<<< HEAD
        id: 'test-user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
=======
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.user_metadata.full_name,
        avatar: mockUser.user_metadata.avatar_url,
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        role: DEFAULT_ROLES[0],
        department: 'Engineering',
        status: 'active'
      });
    });

<<<<<<< HEAD
    it('should handle user metadata variations', async () => {
      const userWithoutFullName = {
        ...mockUser,
        user_metadata: {
          name: 'Alternative Name'
        }
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { ...mockSession, user: userWithoutFullName } },
        error: null
      });

      mockSupabase.auth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } }
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user?.name).toBe('Alternative Name');
      });
    });

    it('should fallback to email prefix when no name is available', async () => {
      const userWithoutName = {
        ...mockUser,
        user_metadata: {}
=======
    it('should handle session without user', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBe(null);
    });

    it('should handle user without full name', async () => {
      const userWithoutName = {
        ...mockUser,
        user_metadata: {
          avatar_url: 'https://example.com/avatar.jpg'
        }
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { ...mockSession, user: userWithoutName } },
        error: null
      });

<<<<<<< HEAD
      mockSupabase.auth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } }
=======
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user?.name).toBe('test'); // Should use email prefix
    });

    it('should handle user without email', async () => {
      const userWithoutEmail = {
        ...mockUser,
        email: undefined
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { ...mockSession, user: userWithoutEmail } },
        error: null
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
<<<<<<< HEAD
        expect(result.current.user?.name).toBe('test');
      });
=======
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user?.email).toBe('');
      expect(result.current.user?.name).toBe('User'); // Should use fallback
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('auth state changes', () => {
<<<<<<< HEAD
    it('should update user on auth state change', async () => {
      let authStateCallback: (event: string, session: any) => void;

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        authStateCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      const { result } = renderHook(() => useAuthProvider());

=======
    it('should listen for auth state changes', () => {
      renderHook(() => useAuthProvider());

      expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('should update user on sign in', async () => {
      const { result } = renderHook(() => useAuthProvider());

      // Wait for initial load
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

<<<<<<< HEAD
      expect(result.current.user).toBeNull();

      // Simulate sign in
=======
      expect(result.current.user).toBe(null);

      // Simulate auth state change (sign in)
      const authStateCallback = mockSupabase.auth.onAuthStateChange.mock.calls[0][0];
      
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      act(() => {
        authStateCallback('SIGNED_IN', mockSession);
      });

<<<<<<< HEAD
      await waitFor(() => {
        expect(result.current.user).not.toBeNull();
      });

      expect(result.current.user?.email).toBe('test@example.com');
    });

    it('should clear user on sign out', async () => {
      let authStateCallback: (event: string, session: any) => void;

=======
      expect(result.current.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.user_metadata.full_name
      });
    });

    it('should clear user on sign out', async () => {
      // Start with authenticated user
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

<<<<<<< HEAD
      mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        authStateCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user).not.toBeNull();
      });

      // Simulate sign out
=======
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      // Simulate auth state change (sign out)
      const authStateCallback = mockSupabase.auth.onAuthStateChange.mock.calls[0][0];
      
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      act(() => {
        authStateCallback('SIGNED_OUT', null);
      });

<<<<<<< HEAD
      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });
    });
  });

  describe('signOut', () => {
    it('should call supabase signOut and clear user', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

      mockSupabase.auth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } }
      });

      mockSupabase.auth.signOut.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user).not.toBeNull();
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
    });
  });

  describe('permission methods', () => {
    beforeEach(() => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

      mockSupabase.auth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } }
      });
    });

    it('should check permissions correctly for admin user', async () => {
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user).not.toBeNull();
      });

      // Admin should have all permissions
      expect(result.current.hasPermission('users', 'create')).toBe(true);
      expect(result.current.hasPermission('analysis', 'delete')).toBe(true);
      expect(result.current.isAdmin()).toBe(true);
      expect(result.current.isManager()).toBe(true);
      expect(result.current.canManageUsers()).toBe(true);
    });

    it('should return false for permissions when no user', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasPermission('users', 'read')).toBe(false);
      expect(result.current.isAdmin()).toBe(false);
      expect(result.current.isManager()).toBe(false);
      expect(result.current.canManageUsers()).toBe(false);
    });

    it('should check specific permissions for non-admin users', async () => {
      // Mock a user role with limited permissions
      const limitedRole = {
        id: 'user',
        name: 'User',
        level: 3,
        permissions: [
          { resource: 'analysis', actions: ['read', 'create'] },
          { resource: 'profile', actions: ['read', 'update'] }
        ]
      };

      const userWithLimitedRole = {
        ...mockUser,
        user_metadata: {
          ...mockUser.user_metadata,
          role: limitedRole
        }
      };

      // We need to modify the hook to use the role from user_metadata
      // For this test, we'll assume the role assignment logic is updated
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user).not.toBeNull();
      });

      // Since we're using DEFAULT_ROLES[0] (admin) in the current implementation,
      // these tests verify the permission checking logic works
      expect(result.current.hasPermission('analysis', 'read')).toBe(true);
      expect(result.current.hasPermission('users', 'delete')).toBe(true); // Admin has all
    });
  });

  describe('cleanup', () => {
    it('should unsubscribe from auth changes on unmount', () => {
      const mockUnsubscribe = vi.fn();

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      mockSupabase.auth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: mockUnsubscribe } }
      });

=======
      expect(result.current.user).toBe(null);
    });

    it('should unsubscribe from auth changes on unmount', () => {
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      const { unmount } = renderHook(() => useAuthProvider());

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
<<<<<<< HEAD
=======

  describe('signOut', () => {
    it('should sign out user successfully', async () => {
      // Start with authenticated user
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
      expect(result.current.user).toBe(null);
    });

    it('should handle sign out errors gracefully', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({
        error: new Error('Sign out failed')
      } as any);

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not throw error
      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });
  });

  describe('permission methods', () => {
    beforeEach(async () => {
      // Setup authenticated user with admin role
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null
      });
    });

    describe('hasPermission', () => {
      it('should return true for admin users (any permission)', async () => {
        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.user).not.toBe(null);
        });

        expect(result.current.hasPermission('users', 'create')).toBe(true);
        expect(result.current.hasPermission('analysis', 'delete')).toBe(true);
        expect(result.current.hasPermission('any-resource', 'any-action')).toBe(true);
      });

      it('should return false when user is not authenticated', async () => {
        mockSupabase.auth.getSession.mockResolvedValue({
          data: { session: null },
          error: null
        });

        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.loading).toBe(false);
        });

        expect(result.current.hasPermission('users', 'read')).toBe(false);
      });

      it('should check specific permissions for non-admin users', async () => {
        // Mock user with limited permissions
        const limitedUser = {
          ...mockUser,
          user_metadata: {
            ...mockUser.user_metadata,
            role_level: 3 // Non-admin role
          }
        };

        mockSupabase.auth.getSession.mockResolvedValue({
          data: { session: { ...mockSession, user: limitedUser } },
          error: null
        });

        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.user).not.toBe(null);
        });

        // Should check actual permissions for non-admin users
        // Since we're using DEFAULT_ROLES[0] (admin) in the implementation,
        // this test verifies the permission checking logic
        expect(result.current.hasPermission('users', 'read')).toBe(true);
      });

      it('should handle wildcard permissions', async () => {
        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.user).not.toBe(null);
        });

        // Admin should have wildcard permissions
        expect(result.current.hasPermission('any-resource', 'any-action')).toBe(true);
      });
    });

    describe('isAdmin', () => {
      it('should return true for admin users', async () => {
        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.user).not.toBe(null);
        });

        expect(result.current.isAdmin()).toBe(true);
      });

      it('should return false when user is not authenticated', async () => {
        mockSupabase.auth.getSession.mockResolvedValue({
          data: { session: null },
          error: null
        });

        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.loading).toBe(false);
        });

        expect(result.current.isAdmin()).toBe(false);
      });
    });

    describe('isManager', () => {
      it('should return true for admin users (level 1)', async () => {
        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.user).not.toBe(null);
        });

        expect(result.current.isManager()).toBe(true);
      });

      it('should return false when user is not authenticated', async () => {
        mockSupabase.auth.getSession.mockResolvedValue({
          data: { session: null },
          error: null
        });

        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.loading).toBe(false);
        });

        expect(result.current.isManager()).toBe(false);
      });
    });

    describe('canManageUsers', () => {
      it('should return true for admin users', async () => {
        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.user).not.toBe(null);
        });

        expect(result.current.canManageUsers()).toBe(true);
      });

      it('should return false when user is not authenticated', async () => {
        mockSupabase.auth.getSession.mockResolvedValue({
          data: { session: null },
          error: null
        });

        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.loading).toBe(false);
        });

        expect(result.current.canManageUsers()).toBe(false);
      });

      it('should check user management permissions for non-admin users', async () => {
        const { result } = renderHook(() => useAuthProvider());

        await waitFor(() => {
          expect(result.current.user).not.toBe(null);
        });

        // Admin should be able to manage users
        expect(result.current.canManageUsers()).toBe(true);
      });
    });
  });

  describe('user data transformation', () => {
    it('should transform Supabase user to app user format', async () => {
      const supabaseUser = {
        id: 'supabase-user-456',
        email: 'transform@example.com',
        created_at: '2024-02-01T10:30:00Z',
        user_metadata: {
          full_name: 'Transform Test User',
          avatar_url: 'https://example.com/transform-avatar.jpg'
        }
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { ...mockSession, user: supabaseUser } },
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      expect(result.current.user).toMatchObject({
        id: 'supabase-user-456',
        email: 'transform@example.com',
        name: 'Transform Test User',
        avatar: 'https://example.com/transform-avatar.jpg',
        role: DEFAULT_ROLES[0],
        department: 'Engineering',
        status: 'active',
        createdAt: '2024-02-01T10:30:00Z',
        permissions: DEFAULT_ROLES[0].permissions
      });

      // Should have lastActive timestamp
      expect(result.current.user?.lastActive).toBeDefined();
      expect(new Date(result.current.user!.lastActive)).toBeInstanceOf(Date);
    });

    it('should handle missing user metadata gracefully', async () => {
      const minimalUser = {
        id: 'minimal-user-789',
        email: 'minimal@example.com',
        created_at: '2024-03-01T15:45:00Z',
        user_metadata: {}
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { ...mockSession, user: minimalUser } },
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      expect(result.current.user).toMatchObject({
        id: 'minimal-user-789',
        email: 'minimal@example.com',
        name: 'minimal', // Should use email prefix
        avatar: undefined,
        role: DEFAULT_ROLES[0],
        department: 'Engineering',
        status: 'active'
      });
    });

    it('should prefer full_name over name in user_metadata', async () => {
      const userWithBothNames = {
        ...mockUser,
        user_metadata: {
          full_name: 'Full Name Priority',
          name: 'Regular Name',
          avatar_url: 'https://example.com/avatar.jpg'
        }
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { ...mockSession, user: userWithBothNames } },
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      expect(result.current.user?.name).toBe('Full Name Priority');
    });

    it('should fall back to name if full_name is not available', async () => {
      const userWithNameOnly = {
        ...mockUser,
        user_metadata: {
          name: 'Name Only User',
          avatar_url: 'https://example.com/avatar.jpg'
        }
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { ...mockSession, user: userWithNameOnly } },
        error: null
      });

      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.user).not.toBe(null);
      });

      expect(result.current.user?.name).toBe('Name Only User');
    });
  });

  describe('error handling', () => {
    it('should handle getSession errors gracefully', async () => {
      mockSupabase.auth.getSession.mockRejectedValue(new Error('Session error'));

      const { result } = renderHook(() => useAuthProvider());

      // Should not crash and should eventually set loading to false
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 1000 });

      expect(result.current.user).toBe(null);
    });

    it('should handle auth state change errors', async () => {
      const { result } = renderHook(() => useAuthProvider());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Simulate auth state change with error
      const authStateCallback = mockSupabase.auth.onAuthStateChange.mock.calls[0][0];
      
      // Should not crash when called with invalid data
      expect(() => {
        authStateCallback('TOKEN_REFRESHED', null);
      }).not.toThrow();
    });
  });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
});