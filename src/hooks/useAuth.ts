import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { User, UserRole, DEFAULT_ROLES } from '../types/user';
import { OAuthService } from '../lib/oauth/oauthService';
import { oauthConfig } from '../lib/oauth/oauthConfig';
import { OAuthErrorHandler, OAuthErrorMonitor } from '../lib/oauth/oauthErrorHandler';
import { config } from '../lib/env';
import { subscriptionService } from '../lib/subscriptionServiceClient';
import { UserSubscription, SubscriptionPlan } from '../types/subscription';
import { cognitoAuth } from '../lib/cognitoAuth';
import { isAwsConfigured } from '../lib/aws-config';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  subscription: UserSubscription | null;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionLoading: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  signUpWithEmailPassword: (email: string, password: string) => Promise<any>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  hasPermission: (resource: string, action: string) => boolean;
  hasActiveSubscription: () => boolean;
  canAccessFeature: (feature: string) => boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  canManageUsers: () => boolean;
  oauthService: OAuthService | null;
  isOAuthAvailable: boolean;
  getSessionStatus: () => Promise<any>;
  getUserSessions: () => Promise<any[]>;
  revokeSession: (sessionId: string) => Promise<void>;
  validateCurrentSession: () => Promise<boolean>;
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
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [oauthService, setOAuthService] = useState<OAuthService | null>(null);
  const [isOAuthAvailable, setIsOAuthAvailable] = useState(false);
  const [useAWSCognito, setUseAWSCognito] = useState(false);

  useEffect(() => {
    // Determine which authentication system to use
    const awsConfigured = isAwsConfigured();
    setUseAWSCognito(awsConfigured);
    
    if (awsConfigured) {
      console.log('🔐 Using AWS Cognito for authentication');
      initializeCognitoAuth();
    } else {
      console.log('🔐 Using Supabase for authentication (fallback)');
      initializeSupabaseAuth();
    }
  }, []);

  const initializeCognitoAuth = async () => {
    try {
      // Set up Cognito auth state listener
      const unsubscribe = cognitoAuth.onAuthStateChange(async (cognitoUser) => {
        if (cognitoUser) {
          setUser(cognitoUser);
          await loadUserSubscription(cognitoUser.id);
        } else {
          setUser(null);
          setSubscription(null);
          setSubscriptionPlan(null);
        }
        setLoading(false);
      });

      // Check for existing session
      const currentUser = await cognitoAuth.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        await loadUserSubscription(currentUser.id);
      }
      setLoading(false);

      // Return cleanup function
      return unsubscribe;
    } catch (error) {
      console.error('Failed to initialize Cognito auth:', error);
      setLoading(false);
    }
  };

  const initializeSupabaseAuth = async () => {
    // Initialize OAuth service if available
    const initializeOAuth = async () => {
      try {
        const availability = oauthConfig.getAvailabilityStatus();
        setIsOAuthAvailable(availability.available);

        if (availability.available) {
          try {
            // In browser environment, only initialize OAuth for client-side operations
            if (typeof window !== 'undefined') {
              // Browser-side OAuth initialization (no token storage)
              console.log('✅ OAuth available for browser-side operations');
              setOAuthService(null); // Will be handled by server-side endpoints
            } else {
              // Server-side OAuth initialization (full service)
              const config = oauthConfig.getConfig();
              const service = new OAuthService(config);
              setOAuthService(service);
              console.log('✅ OAuth service initialized');
            }
          } catch (configError) {
            console.error('OAuth configuration error:', configError);
            setIsOAuthAvailable(false);
            setOAuthService(null);
          }
        } else {
          console.log('⚠️ OAuth not available:', availability.reason);
          setOAuthService(null);
        }
      } catch (error) {
        console.error('Failed to initialize OAuth service:', error);
        setIsOAuthAvailable(false);
        setOAuthService(null);
      }
    };

    await initializeOAuth();

    // Check if user is already logged in
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const appUser = await convertSupabaseUserToAppUser(session.user);
        setUser(appUser);
        // Load subscription data after user is set
        loadUserSubscription(appUser.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const appUser = await convertSupabaseUserToAppUser(session.user);
        setUser(appUser);
        // Load subscription data after user is set
        loadUserSubscription(appUser.id);
      } else {
        setUser(null);
        setSubscription(null);
        setSubscriptionPlan(null);
      }
    });

    return () => authSubscription.unsubscribe();
  };

  const loadUserSubscription = async (userId: string) => {
    try {
      setSubscriptionLoading(true);
      const userSubscription = await subscriptionService.getUserSubscription(userId);
      setSubscription(userSubscription);
      
      if (userSubscription) {
        const plan = await subscriptionService.getSubscriptionPlan(userSubscription.planId);
        setSubscriptionPlan(plan);
      } else {
        setSubscriptionPlan(null);
      }
    } catch (error) {
      console.error('Failed to load user subscription:', error);
      setSubscription(null);
      setSubscriptionPlan(null);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const refreshSubscription = async () => {
    if (user) {
      await loadUserSubscription(user.id);
    }
  };

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
    if (useAWSCognito) {
      // Use AWS Cognito for Google OAuth
      try {
        await cognitoAuth.signInWithGoogle();
      } catch (error) {
        console.error('Cognito Google OAuth error:', error);
        throw error;
      }
      return;
    }

    // Fallback to Supabase OAuth
    if (!isOAuthAvailable) {
      // Get more specific error message
      const availability = oauthConfig.getAvailabilityStatus();
      const reason = availability.reason || 'OAuth service is not configured';
      throw new Error(`Google OAuth is not available: ${reason}. Please use email/password authentication.`);
    }

    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined') {
        throw new Error('OAuth authentication is only available in browser environment');
      }

      // Use our enhanced OAuth flow with PKCE and state validation
      if (oauthService) {
        // Use the full OAuth service for server-side environments
        const redirectUri = `${window.location.origin}/auth/callback`;
        const { authUrl } = await oauthService.initiateAuth(redirectUri);
        
        // Redirect to Google OAuth
        window.location.href = authUrl;
      } else {
        // Fallback to Supabase's built-in Google OAuth for browser-side authentication
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
            scopes: 'openid email profile https://www.googleapis.com/auth/drive.readonly'
          }
        });

        if (error) {
          console.error('Google OAuth error:', error);
          throw new Error(`Google authentication failed: ${error.message}`);
        }
      }

      // The redirect will happen, so we don't return here
    } catch (error) {
      OAuthErrorMonitor.recordError(error instanceof Error ? error : new Error(String(error)));
      const userMessage = OAuthErrorHandler.getUserMessage(error instanceof Error ? error : String(error));
      throw new Error(userMessage);
    }
  };

  const signOut = async () => {
    try {
      if (useAWSCognito) {
        // Use AWS Cognito sign out
        await cognitoAuth.signOut();
        setUser(null);
        setSubscription(null);
        setSubscriptionPlan(null);
        return;
      }

      // Supabase sign out (fallback)
      // Clear JWT sessions first
      try {
        const { SessionManager } = await import('../lib/oauth/sessionManager');
        await SessionManager.clearSession();
      } catch (error) {
        console.warn('Failed to clear JWT sessions:', error);
      }

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

  const hasActiveSubscription = (): boolean => {
    return subscription !== null && ['active', 'trialing'].includes(subscription.status);
  };

  const canAccessFeature = (feature: string): boolean => {
    if (!subscription || !subscriptionPlan) {
      return false; // No subscription means no access to premium features
    }

    if (!['active', 'trialing'].includes(subscription.status)) {
      return false; // Inactive subscription
    }

    // Check if the feature is included in the current plan
    const featureMap: Record<string, string[]> = {
      'basic_analysis': ['basic', 'pro', 'enterprise'],
      'advanced_analysis': ['pro', 'enterprise'],
      'seq_logprob': ['pro', 'enterprise'],
      'batch_processing': ['pro', 'enterprise'],
      'scheduled_monitoring': ['pro', 'enterprise'],
      'team_collaboration': ['pro', 'enterprise'],
      'custom_integrations': ['pro', 'enterprise'],
      'advanced_analytics': ['pro', 'enterprise'],
      'unlimited_analyses': ['enterprise'],
      'custom_model_training': ['enterprise'],
      'dedicated_support': ['enterprise'],
      'sla_guarantees': ['enterprise'],
      'on_premise_deployment': ['enterprise'],
      'advanced_security': ['enterprise']
    };

    const allowedPlans = featureMap[feature];
    return allowedPlans ? allowedPlans.includes(subscriptionPlan.id) : false;
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

  const signInWithEmailPassword = async (email: string, password: string) => {
    try {
      if (useAWSCognito) {
        // Use AWS Cognito for email/password authentication
        const user = await cognitoAuth.signInWithEmailPassword(email, password);
        setUser(user);
        await loadUserSubscription(user.id);
        return;
      }

      // Supabase authentication (fallback)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        throw new Error(`Email/password authentication failed: ${error.message}`);
      }

      if (data.user) {
        const appUser = await convertSupabaseUserToAppUser(data.user);
        setUser(appUser);
        
        // Load subscription data after successful login
        loadUserSubscription(appUser.id);
        
        // Create JWT session for email/password users too
        try {
          const { SessionManager } = await import('../lib/oauth/sessionManager');
          const { JWTTokenManager } = await import('../lib/oauth/jwtTokenManager');
          
          const jwtManager = new JWTTokenManager();
          const jwtTokens = await jwtManager.createTokenPair(
            data.user.id,
            data.user.email || '',
            data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'User',
            'email',
            'email profile',
            data.user.user_metadata?.avatar_url
          );
          
          // Store JWT tokens
          localStorage.setItem('hallucifix_jwt_access_token', jwtTokens.accessToken);
          localStorage.setItem('hallucifix_jwt_refresh_token', jwtTokens.refreshToken);
        } catch (jwtError) {
          console.warn('Failed to create JWT session for email user:', jwtError);
          // Don't fail the login for JWT issues
        }
      }
    } catch (error) {
      console.error('Email/password sign in error:', error);
      throw error;
    }
  };

  const signUpWithEmailPassword = async (email: string, password: string) => {
    try {
      if (useAWSCognito) {
        // Use AWS Cognito for email/password registration
        const result = await cognitoAuth.signUpWithEmailPassword(email, password);
        return result;
      }

      // Supabase registration (fallback)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      
      if (error) {
        throw new Error(`Email/password registration failed: ${error.message}`);
      }

      // Note: User will need to verify email before they can sign in
      return data;
    } catch (error) {
      console.error('Email/password sign up error:', error);
      throw error;
    }
  };

  const getSessionStatus = async () => {
    try {
      const { SessionManager } = await import('../lib/oauth/sessionManager');
      return await SessionManager.getSessionStatus();
    } catch (error) {
      console.warn('Failed to get session status:', error);
      return {
        hasBasicSession: !!user,
        basicSessionValid: !!user,
        hasJWTToken: false,
        jwtTokenValid: false,
        fullyValid: !!user,
        activeSessions: 0,
        currentSession: null,
        jwtPayload: null
      };
    }
  };

  const getUserSessions = async () => {
    if (!user) return [];
    
    try {
      const { SessionManager } = await import('../lib/oauth/sessionManager');
      return await SessionManager.getUserSessions();
    } catch (error) {
      console.warn('Failed to get user sessions:', error);
      return [];
    }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      const { SessionManager } = await import('../lib/oauth/sessionManager');
      await SessionManager.revokeSession(sessionId);
    } catch (error) {
      console.error('Failed to revoke session:', error);
      throw error;
    }
  };

  const validateCurrentSession = async (): Promise<boolean> => {
    try {
      const { SessionManager } = await import('../lib/oauth/sessionManager');
      return await SessionManager.isSessionFullyValid();
    } catch (error) {
      console.warn('Session validation failed:', error);
      return false;
    }
  };

  return {
    user,
    loading,
    subscription,
    subscriptionPlan,
    subscriptionLoading,
    signOut,
    signInWithGoogle,
    signInWithEmailPassword,
    signUpWithEmailPassword,
    refreshProfile,
    refreshSubscription,
    hasPermission,
    hasActiveSubscription,
    canAccessFeature,
    isAdmin,
    isManager,
    canManageUsers,
    oauthService,
    isOAuthAvailable,
    getSessionStatus,
    getUserSessions,
    revokeSession,
    validateCurrentSession
  };
};