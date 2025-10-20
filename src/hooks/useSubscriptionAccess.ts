/**
 * Subscription Access Hook
 * React hook for checking subscription status and enforcing access control
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { 
  SubscriptionAccessMiddleware, 
  SubscriptionAccessOptions, 
  SubscriptionAccessResult 
} from '../lib/subscriptionAccessMiddleware';
import { subscriptionService } from '../lib/subscriptionService';
import { usageTracker } from '../lib/usageTracker';
import { SubscriptionPlan, UserSubscription } from '../types/subscription';

export interface UseSubscriptionAccessResult {
  // Access checking
  checkAccess: (options?: SubscriptionAccessOptions) => Promise<SubscriptionAccessResult>;
  recordUsage: (options?: SubscriptionAccessOptions) => Promise<void>;
  
  // Current subscription info
  subscription: UserSubscription | null;
  plan: SubscriptionPlan | null;
  loading: boolean;
  error: string | null;
  
  // Access status
  hasActiveSubscription: boolean;
  isTrialing: boolean;
  isPastDue: boolean;
  inGracePeriod: boolean;
  
  // Usage info
  usage: {
    current: number;
    limit: number;
    percentage: number;
    remaining: number;
    resetDate: Date;
    overage?: number;
    overageCost?: number;
  } | null;
  
  // Feature access
  canAnalyze: boolean;
  canBatch: boolean;
  canSchedule: boolean;
  canViewAnalytics: boolean;
  
  // Actions
  refreshSubscription: () => Promise<void>;
  upgradeSubscription: (newPriceId: string) => Promise<void>;
  cancelSubscription: () => Promise<void>;
  openBillingPortal: () => Promise<void>;
}

/**
 * Hook for subscription access control
 */
export function useSubscriptionAccess(): UseSubscriptionAccessResult {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [usage, setUsage] = useState<UseSubscriptionAccessResult['usage']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load subscription data
  const loadSubscriptionData = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setPlan(null);
      setUsage(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Load subscription
      const userSubscription = await subscriptionService.getUserSubscription(user.id);
      setSubscription(userSubscription);

      // Load plan details
      if (userSubscription) {
        const subscriptionPlan = await subscriptionService.getSubscriptionPlan(userSubscription.planId);
        setPlan(subscriptionPlan);
      } else {
        setPlan(null);
      }

      // Load usage data
      const currentUsage = await usageTracker.getCurrentUsage(user.id);
      setUsage(currentUsage);

    } catch (err) {
      console.error('Error loading subscription data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load data on mount and user change
  useEffect(() => {
    loadSubscriptionData();
  }, [loadSubscriptionData]);

  // Access checking functions
  const checkAccess = useCallback(async (options?: SubscriptionAccessOptions) => {
    if (!user) {
      return {
        allowed: false,
        reason: 'User not authenticated'
      };
    }
    return SubscriptionAccessMiddleware.checkSubscriptionAccess(user.id, options);
  }, [user]);

  const recordUsage = useCallback(async (options?: SubscriptionAccessOptions) => {
    if (!user) {
      return;
    }
    await SubscriptionAccessMiddleware.recordUsage(user.id, options);
    // Refresh usage data after recording
    if (user) {
      const currentUsage = await usageTracker.getCurrentUsage(user.id);
      setUsage(currentUsage);
    }
  }, [user]);

  // Subscription actions
  const refreshSubscription = useCallback(async () => {
    await loadSubscriptionData();
  }, [loadSubscriptionData]);

  const upgradeSubscription = useCallback(async (newPriceId: string) => {
    if (!user || !subscription) {
      throw new Error('No active subscription to upgrade');
    }

    try {
      await subscriptionService.upgradeSubscription(user.id, newPriceId);
      await refreshSubscription();
    } catch (error) {
      console.error('Error upgrading subscription:', error);
      throw error;
    }
  }, [user, subscription, refreshSubscription]);

  const cancelSubscription = useCallback(async () => {
    if (!user || !subscription) {
      throw new Error('No active subscription to cancel');
    }

    try {
      await subscriptionService.cancelSubscription(subscription.stripeSubscriptionId);
      await refreshSubscription();
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw error;
    }
  }, [user, subscription, refreshSubscription]);

  const openBillingPortal = useCallback(async () => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const { url } = await subscriptionService.createPortalSession(
        user.id,
        `${window.location.origin}/billing`
      );
      window.location.href = url;
    } catch (error) {
      console.error('Error opening billing portal:', error);
      throw error;
    }
  }, [user]);

  // Computed properties
  const hasActiveSubscription = useMemo(() => {
    return subscription !== null && ['active', 'trialing'].includes(subscription.status);
  }, [subscription]);

  const isTrialing = useMemo(() => {
    return subscription?.status === 'trialing';
  }, [subscription]);

  const isPastDue = useMemo(() => {
    return subscription?.status === 'past_due';
  }, [subscription]);

  const inGracePeriod = useMemo(() => {
    if (!subscription || subscription.status !== 'past_due') {
      return false;
    }
    
    // Grace period is 7 days from current period end
    const gracePeriodEnd = new Date(subscription.currentPeriodEnd.getTime() + (7 * 24 * 60 * 60 * 1000));
    return new Date() <= gracePeriodEnd;
  }, [subscription]);

  // Feature access based on plan
  const canAnalyze = useMemo(() => {
    return hasActiveSubscription || inGracePeriod;
  }, [hasActiveSubscription, inGracePeriod]);

  const canBatch = useMemo(() => {
    if (!hasActiveSubscription && !inGracePeriod) return false;
    return plan?.features.some(f => f.toLowerCase().includes('batch')) || false;
  }, [hasActiveSubscription, inGracePeriod, plan]);

  const canSchedule = useMemo(() => {
    if (!hasActiveSubscription && !inGracePeriod) return false;
    return plan?.features.some(f => f.toLowerCase().includes('schedul')) || false;
  }, [hasActiveSubscription, inGracePeriod, plan]);

  const canViewAnalytics = useMemo(() => {
    if (!hasActiveSubscription && !inGracePeriod) return false;
    return plan?.features.some(f => f.toLowerCase().includes('analytic')) || false;
  }, [hasActiveSubscription, inGracePeriod, plan]);

  return {
    // Access checking
    checkAccess,
    recordUsage,
    
    // Current subscription info
    subscription,
    plan,
    loading,
    error,
    
    // Access status
    hasActiveSubscription,
    isTrialing,
    isPastDue,
    inGracePeriod,
    
    // Usage info
    usage,
    
    // Feature access
    canAnalyze,
    canBatch,
    canSchedule,
    canViewAnalytics,
    
    // Actions
    refreshSubscription,
    upgradeSubscription,
    cancelSubscription,
    openBillingPortal
  };
}

/**
 * Hook for checking specific feature access
 */
export function useFeatureAccess(feature: string, options?: SubscriptionAccessOptions) {
  const { user } = useAuth();
  const [accessResult, setAccessResult] = useState<SubscriptionAccessResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkFeatureAccess = async () => {
      if (!user) {
        setAccessResult({
          allowed: false,
          reason: 'User not authenticated'
        });
        setLoading(false);
        return;
      }

      try {
        const result = await SubscriptionAccessMiddleware.checkSubscriptionAccess(user.id, {
          requiredFeature: feature,
          ...options
        });
        setAccessResult(result);
      } catch (error) {
        console.error('Error checking feature access:', error);
        setAccessResult({
          allowed: false,
          reason: 'Error checking access'
        });
      } finally {
        setLoading(false);
      }
    };

    checkFeatureAccess();
  }, [user, feature, options]);

  return {
    allowed: accessResult?.allowed || false,
    loading,
    accessResult,
    reason: accessResult?.reason
  };
}

/**
 * Hook for usage limit checking
 */
export function useUsageLimit() {
  const { user } = useAuth();
  const [usageData, setUsageData] = useState<{
    current: number;
    limit: number;
    remaining: number;
    percentage: number;
    resetDate: Date;
    canMakeRequest: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const checkUsage = useCallback(async () => {
    if (!user) {
      setUsageData(null);
      setLoading(false);
      return;
    }

    try {
      const usage = await usageTracker.getCurrentUsage(user.id);
      const limit = await usageTracker.checkUsageLimit(user.id);
      
      setUsageData({
        current: usage.current,
        limit: usage.limit,
        remaining: limit.remaining,
        percentage: usage.percentage,
        resetDate: usage.resetDate,
        canMakeRequest: limit.allowed
      });
    } catch (error) {
      console.error('Error checking usage:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkUsage();
  }, [checkUsage]);

  return {
    usage: usageData,
    loading,
    refresh: checkUsage
  };
}

export default useSubscriptionAccess;