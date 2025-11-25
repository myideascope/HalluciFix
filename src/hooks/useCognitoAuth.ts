import { useState, useEffect, createContext, useContext } from 'react';
import { Hub } from '@aws-amplify/core';
import { getCurrentUser } from '@aws-amplify/auth';
import { CognitoUser } from 'amazon-cognito-identity-js';
import { User, DEFAULT_ROLES } from '../types/user';
import { cognitoAuth } from '../lib/cognitoAuth';
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
  signUpWithEmailPassword: (email: string, password: string) => Promise<any>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendConfirmationCode: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  hasPermission: (resource: string, action: string) => boolean;
  hasActiveSubscription: () => boolean;
  canAccessFeature: (feature: string) => boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  canManageUsers: () => boolean;
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

  useEffect(() => {
    // Check if user is already authenticated
    checkAuthState();

    // Listen for authentication events
    const hubListener = (data: any) => {
      const { payload } = data;
      
      switch (payload.event) {
        case 'signIn':
          logger.info("User signed in:", { data: payload.data });
          handleUserSignIn(payload.data);
          break;
        case 'signOut':
          logger.debug("User signed out");
          handleUserSignOut();
          break;
        case 'signUp':
          logger.info("User signed up:", { data: payload.data });
          break;
        case 'signIn_failure':
          logger.error("Sign in failed:", payload.data instanceof Error ? payload.data : new Error(String(payload.data)));
          setLoading(false);
          break;
        case 'tokenRefresh':
          logger.debug("Token refreshed");
          break;
        case 'tokenRefresh_failure':
          logger.error("Token refresh failed:", payload.data instanceof Error ? payload.data : new Error(String(payload.data)));
          break;
        default:
          break;
      }
    };

    Hub.listen('auth', hubListener);

    return () => {
      Hub.remove('auth', hubListener);
    };
  }, []);

  const checkAuthState = async () => {
    try {
      const cognitoUser = await cognitoAuth.getCurrentUser();
      if (cognitoUser) {
        await handleUserSignIn(cognitoUser);
      }
    } catch (error) {
      logger.debug("No authenticated user found");
    } finally {
      setLoading(false);
    }
  };

  const handleUserSignIn = async (cognitoUser: CognitoUser) => {
    try {
      const appUser = await cognitoAuth.convertCognitoUserToAppUser(cognitoUser);
      setUser(appUser);
      await loadUserSubscription(appUser.id);
    } catch (error) {
      logger.error("Error handling user sign in:", error instanceof Error ? error : new Error(String(error)));
    }
  };

  const handleUserSignOut = () => {
    setUser(null);
    setSubscription(null);
    setSubscriptionPlan(null);
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
      logger.error("Failed to load user subscription:", error instanceof Error ? error : new Error(String(error)));
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
      setLoading(true);
      const cognitoUser = await cognitoAuth.signIn(email, password);
      // User sign in will be handled by Hub listener
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signUpWithEmailPassword = async (email: string, password: string) => {
    try {
      const result = await cognitoAuth.signUp(email, password);
      return result;
    } catch (error) {
      throw error;
    }
  };

  const confirmSignUp = async (email: string, code: string) => {
    try {
      await cognitoAuth.confirmSignUp(email, code);
    } catch (error) {
      throw error;
    }
  };

  const resendConfirmationCode = async (email: string) => {
    try {
      await cognitoAuth.resendConfirmationCode(email);
    } catch (error) {
      throw error;
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      await cognitoAuth.forgotPassword(email);
    } catch (error) {
      throw error;
    }
  };

  const confirmPassword = async (email: string, code: string, newPassword: string) => {
    try {
      await cognitoAuth.confirmPassword(email, code, newPassword);
    } catch (error) {
      throw error;
    }
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    try {
      await cognitoAuth.changePassword(oldPassword, newPassword);
    } catch (error) {
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      await cognitoAuth.signInWithGoogle();
      // User sign in will be handled by Hub listener
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await cognitoAuth.signOut();
      // User sign out will be handled by Hub listener
    } catch (error) {
      logger.error("Sign out error:", error instanceof Error ? error : new Error(String(error)));
      // Force clear user state even if sign out fails
      handleUserSignOut();
      throw error;
    }
  };

  const refreshProfile = async (): Promise<void> => {
    if (!user) return;

    try {
      const cognitoUser = await cognitoAuth.getCurrentUser();
      if (cognitoUser) {
        const updatedUser = await cognitoAuth.convertCognitoUserToAppUser(cognitoUser);
        setUser(updatedUser);
      }
    } catch (error) {
      logger.error("Failed to refresh profile:", error instanceof Error ? error : new Error(String(error)));
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
    forgotPassword,
    confirmPassword,
    changePassword,
    refreshProfile,
    refreshSubscription,
    hasPermission,
    hasActiveSubscription,
    canAccessFeature,
    isAdmin,
    isManager,
    canManageUsers,
  };
};