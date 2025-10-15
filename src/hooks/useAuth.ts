import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { User, UserRole, DEFAULT_ROLES } from '../types/user';
import { OAuthService } from '../lib/oauth/oauthService';
import { oauthConfig } from '../lib/oauth/oauthConfig';
import { OAuthErrorHandler, OAuthErrorMonitor } from '../lib/oauth/oauthErrorHandler';
import { config } from '../lib/env';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPermission: (resource: string, action: string) => boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  canManageUsers: () => boolean;
  oauthService: OAuthService | null;
  isOAuthAvailable: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthProvider = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthService, setOAuthService] = useState<OAuthService | null>(null);
  const [isOAuthAvailable, setIsOAuthAvailable] = useState(false);

  useEffect(() => {
    // Initialize OAuth service if available
    const initializeOAuth = async () => {
      try {
        const availability = oauthConfig.getAvailabilityStatus();
        setIsOAuthAvailable(availability.available);

        if (availability.available) {
          const config = oauthConfig.getConfig();
          const service = new OAuthService(config);
          setOAuthService(service);
          console.log('✅ OAuth service initialized');
        } else {
          console.log('⚠️ OAuth not available:', availability.reason);
        }
      } catch (error) {
        console.error('Failed to initialize OAuth service:', error);
        setIsOAuthAvailable(false);
      }
    };

    initializeOAuth();

    // Check if user is already logged in
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const appUser = await convertSupabaseUserToAppUser(session.user);
        setUser(appUser);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const appUser = await convertSupabaseUserToAppUser(session.user);
        setUser(appUser);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const convertSupabaseUserToAppUser = async (supabaseUser: any): Promise<User> => {
    try {
      // Try to get cached profile from OAuth service if available
      if (oauthService && isOAuthAvailable) {
        try {
          const cachedProfile = await oauthService.getUserProfile(supabaseUser.id);
          if (cachedProfile) {
            // Sync profile data in background
            oauthService.syncUserProfile(supabaseUser.id).catch(error => {
              console.warn('Background profile sync failed:', error);
            });
          }
        } catch (error) {
          console.warn('Failed to get cached profile:', error);
        }
      }

      // Try to fetch user data from our users table
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', supabaseUser.email)
        .single();

      if (userData && !error) {
        // Use data from our users table
        return {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          avatar: userData.avatar_url,
          role: userData.role_id ? { 
            name: userData.role_id, 
            level: userData.role_id === 'admin' ? 1 : userData.role_id === 'manager' ? 2 : 3,
            permissions: DEFAULT_ROLES.find(r => r.name === userData.role_id)?.permissions || []
          } : DEFAULT_ROLES[2], // Default to user role
          department: userData.department || 'General',
          status: userData.status || 'active',
          lastActive: userData.last_active || new Date().toISOString(),
          createdAt: userData.created_at || supabaseUser.created_at,
          permissions: DEFAULT_ROLES.find(r => r.name === userData.role_id)?.permissions || DEFAULT_ROLES[2].permissions
        };
      }
    } catch (error) {
      console.warn('Failed to fetch user data from users table:', error);
    }

    // Fallback to Supabase user metadata
    return {
      id: supabaseUser.id,
      email: supabaseUser.email || '',
      name: supabaseUser.user_metadata?.full_name || 
            supabaseUser.user_metadata?.name || 
            supabaseUser.email?.split('@')[0] || 'User',
      avatar: supabaseUser.user_metadata?.avatar_url,
      role: DEFAULT_ROLES[2], // Default to user role
      department: 'General',
      status: 'active',
      lastActive: new Date().toISOString(),
      createdAt: supabaseUser.created_at,
      permissions: DEFAULT_ROLES[2].permissions
    };
  };

  const signInWithGoogle = async () => {
    if (!oauthService || !isOAuthAvailable) {
      throw new Error('Google OAuth is not available. Please use email/password authentication.');
    }

    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const { authUrl } = await oauthService.initiateAuth(redirectUri);
      
      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      OAuthErrorMonitor.recordError(error instanceof Error ? error : new Error(String(error)));
      const userMessage = OAuthErrorHandler.getUserMessage(error instanceof Error ? error : String(error));
      throw new Error(userMessage);
    }
  };

  const signOut = async () => {
    try {
      // If we have OAuth service and user, revoke OAuth tokens
      if (oauthService && user) {
        try {
          await oauthService.revokeUserTokens(user.id, 'User logout');
        } catch (error) {
          console.warn('Failed to revoke OAuth tokens:', error);
          // Don't fail the logout for this
        }
      }

      // Sign out from Supabase
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
      // Force clear user state even if sign out fails
      setUser(null);
      throw error;
    }
  };

  const hasPermission = (resource: string, action: string): boolean => {
    if (!user) return false;
    
    // Admin has all permissions
    if (user.role.level === 1) return true;
    
    return user.permissions.some(permission => {
      const resourceMatch = permission.resource === '*' || permission.resource === resource;
      const actionMatch = permission.actions.includes('*') || permission.actions.includes(action);
      return resourceMatch && actionMatch;
    });
  };

  const isAdmin = (): boolean => {
    return user?.role.level === 1;
  };

  const isManager = (): boolean => {
    return user?.role.level <= 2;
  };

  const canManageUsers = (): boolean => {
    return hasPermission('users', 'update') || isAdmin();
  };

  const refreshProfile = async (): Promise<void> => {
    if (!user || !oauthService || !isOAuthAvailable) {
      return;
    }

    try {
      // Force refresh profile from Google
      const updatedProfile = await oauthService.getUserProfile(user.id, true);
      if (updatedProfile) {
        // Refresh the current session to get updated user data
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const appUser = await convertSupabaseUserToAppUser(session.user);
          setUser(appUser);
        }
      }
    } catch (error) {
      console.error('Failed to refresh profile:', error);
      throw error;
    }
  };

  return {
    user,
    loading,
    signOut,
    signInWithGoogle,
    refreshProfile,
    hasPermission,
    isAdmin,
    isManager,
    canManageUsers,
    oauthService,
    isOAuthAvailable
  };
};