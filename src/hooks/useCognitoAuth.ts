/**
 * AWS Cognito Authentication Hook
 * Replaces useAuth hook with Cognito integration
 */

import { useState, useEffect, createContext, useContext } from 'react';
import { cognitoAuth, CognitoUser, AuthResult, createCognitoConfig } from '../lib/cognitoAuth';
import { User, UserRole, DEFAULT_ROLES } from '../types/user';
import { config } from '../lib/env';
import { subscriptionService } from '../lib/subscriptionServiceClient';
import { UserSubscription, SubscriptionPlan } from '../types/subscription';
import { logger } from '../lib/logging';

interface CognitoAuthContextType {
  user: User | null;
  loading: boolean;
  subscription: UserSubscription | null;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionLoading: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  signUpWithEmailPassword: (email: string, password: string) => Promise<{ userId: string; isConfirmed: boolean }>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendConfirmationCode: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmPasswordReset: (email: string, code: string, newPassword: string) => Promise<void>;
  updatePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  hasPermission: (resource: string, action: string) => boolean;
  hasActiveSubscription: () => boolean;
  canAccessFeature: (feature: string) => boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  canManageUsers: () => boolean;
  isAuthenticated: () => Promise<boolean>;
}

export const CognitoAuthContext = createContext<CognitoAuthContextType | undefined>(undefined);

export const useCognitoAuth = () => {
  const context = useContext(CognitoAuthContext);
  if (context === undefined) {
    throw new Error('useCognitoAuth must be used within a CognitoAuthProvider');
  }
  return context;
};

export const useCognitoAuthProvider = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const authLogger = logger.child({ component: 'CognitoAuthProvider' });

  useEffect(() => {
    initializeCognito();
  }, []);

  const initializeCognito = async () => {
    try {
      // Check if Cognito configuration is available
      if (!config.useCognito) {
        authLogger.warn('Cognito configuration not available, falling back to Supabase');
        setLoading(false);
        return;
      }

      // Initialize Cognito
      const cognitoConfig = createCognitoConfig(
        config.cognitoUserPoolId!,
        config.cognitoUserPoolClientId!,
        config.cognitoRegion,
        {
          identityPoolId: config.cognitoIdentityPoolId,
          domain: config.cognitoDomain,
          redirectSignIn: `${window.location.origin}/callback`,
          redirectSignOut: `${window.location.origin}/logout`
        }
      );

      await cognitoAuth.initialize(cognitoConfig);

      // Check for existing session
      const session = await cognitoAuth.getCurrentSession();
      if (session) {
        const appUser = await convertCognitoUserToAppUser(session.user);
        setUser(appUser);
        await loadUserSubscription(appUser.id);
      }

      authLogger.info('Cognito authentication initialized');
    } catch (error) {
      authLogger.error('Failed to initialize Cognito authentication', error as Error);
    } finally {
      setLoading(false);
    }
  };

  const convertCognitoUserToAppUser = async (cognitoUser: CognitoUser): Promise<User> => {
    try {
      // Try to fetch user data from our users table (when RDS migration is complete)
      // For now, use Cognito user attributes
      
      return {
        id: cognitoUser.userId,
        email: cognitoUser.email || '',
        name: cognitoUser.name || 
              `${cognitoUser.givenName || ''} ${cognitoUser.familyName || ''}`.trim() ||
              cognitoUser.email?.split('@')[0] || 'User',
        avatar: cognitoUser.picture,
        role: DEFAULT_ROLES[2], // Default to user role
        department: 'General',
        status: 'active',
        lastActive: new Date().toISOString(),
        createdAt: new Date().toISOString(), // We'll get this from RDS later
        permissions: DEFAULT_ROLES[2].permissions
      };
    } catch (error) {
      authLogger.error('Failed to convert Cognito user to app user', error as Error);
      throw error;
    }
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
      authLogger.error('Failed to load user subscription', error as Error);
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

  const signInWithEmailPassword = async (email: string, password: string) => {
    try {
      const result = await cognitoAuth.signInWithEmailPassword(email, password);
      const appUser = await convertCognitoUserToAppUser(result.user);
      setUser(appUser);
      await loadUserSubscription(appUser.id);
      
      authLogger.info('Email/password sign in successful', { userId: appUser.id });
    } catch (error) {
      authLogger.error('Email/password sign in failed', error as Error);
      throw error;
    }
  };

  const signUpWithEmailPassword = async (email: string, password: string) => {
    try {
      const result = await cognitoAuth.signUpWithEmailPassword(email, password, {
        name: email.split('@')[0] // Default name from email
      });
      
      authLogger.info('Email/password sign up successful', { 
        userId: result.userId, 
        isConfirmed: result.isConfirmed 
      });
      
      return result;
    } catch (error) {
      authLogger.error('Email/password sign up failed', error as Error);
      throw error;
    }
  };

  const confirmSignUp = async (email: string, code: string) => {
    try {
      await cognitoAuth.confirmSignUp(email, code);
      authLogger.info('Sign up confirmed', { email });
    } catch (error) {
      authLogger.error('Sign up confirmation failed', error as Error);
      throw error;
    }
  };

  const resendConfirmationCode = async (email: string) => {
    try {
      await cognitoAuth.resendConfirmationCode(email);
      authLogger.info('Confirmation code resent', { email });
    } catch (error) {
      authLogger.error('Failed to resend confirmation code', error as Error);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      await cognitoAuth.signInWithGoogle();
      // The redirect will happen, so we don't need to handle the result here
    } catch (error) {
      authLogger.error('Google sign in failed', error as Error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await cognitoAuth.signOut();
      setUser(null);
      setSubscription(null);
      setSubscriptionPlan(null);
      authLogger.info('User signed out');
    } catch (error) {
      authLogger.error('Sign out failed', error as Error);
      // Force clear user state even if sign out fails
      setUser(null);
      setSubscription(null);
      setSubscriptionPlan(null);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await cognitoAuth.resetPassword(email);
      authLogger.info('Password reset initiated', { email });
    } catch (error) {
      authLogger.error('Password reset failed', error as Error);
      throw error;
    }
  };

  const confirmPasswordReset = async (email: string, code: string, newPassword: string) => {
    try {
      await cognitoAuth.confirmPasswordReset(email, code, newPassword);
      authLogger.info('Password reset confirmed', { email });
    } catch (error) {
      authLogger.error('Password reset confirmation failed', error as Error);
      throw error;
    }
  };

  const updatePassword = async (oldPassword: string, newPassword: string) => {
    try {
      await cognitoAuth.updatePassword(oldPassword, newPassword);
      authLogger.info('Password updated');
    } catch (error) {
      authLogger.error('Password update failed', error as Error);
      throw error;
    }
  };

  const refreshProfile = async () => {
    try {
      if (!user) return;
      
      const session = await cognitoAuth.getCurrentSession();
      if (session) {
        const appUser = await convertCognitoUserToAppUser(session.user);
        setUser(appUser);
      }
    } catch (error) {
      authLogger.error('Failed to refresh profile', error as Error);
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
      return false;
    }

    if (!['active', 'trialing'].includes(subscription.status)) {
      return false;
    }

    // Feature access logic (same as original)
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

  const isAuthenticated = async (): Promise<boolean> => {
    try {
      return await cognitoAuth.isAuthenticated();
    } catch {
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
    confirmSignUp,
    resendConfirmationCode,
    resetPassword,
    confirmPasswordReset,
    updatePassword,
    refreshProfile,
    refreshSubscription,
    hasPermission,
    hasActiveSubscription,
    canAccessFeature,
    isAdmin,
    isManager,
    canManageUsers,
    isAuthenticated
  };
};