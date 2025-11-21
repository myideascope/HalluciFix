/**
 * Subscription Fallback Hook
 * React hook for managing fallback functionality when subscriptions have issues
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { 
  subscriptionFallbackService, 
  FallbackLimits 
} from '../lib/subscriptionFallbackService';
import { subscriptionStatusMonitor } from '../lib/subscriptionStatusMonitor';

import { logger } from './logging';
export interface UseSubscriptionFallbackResult {
  // Fallback status
  inFallbackMode: boolean;
  fallbackLimits: FallbackLimits | null;
  loading: boolean;
  error: string | null;
  
  // Usage tracking
  remainingDaily: number;
  remainingMonthly: number;
  
  // Feature availability
  featureAvailability: Record<string, {
    available: boolean;
    reason?: string;
    fallbackMode: boolean;
  }>;
  
  // Actions
  canPerformAnalysis: (contentLength: number, analysisType?: string) => Promise<{
    allowed: boolean;
    reason?: string;
    fallbackMode: boolean;
    remainingDaily: number;
    remainingMonthly: number;
  }>;
  
  performFallbackAnalysis: (content: string, analysisType?: string) => Promise<any>;
  refreshFallbackStatus: () => Promise<void>;
}

/**
 * Hook for subscription fallback functionality
 */
export function useSubscriptionFallback(): UseSubscriptionFallbackResult {
  const { user } = useAuth();
  const [inFallbackMode, setInFallbackMode] = useState(false);
  const [fallbackLimits, setFallbackLimits] = useState<FallbackLimits | null>(null);
  const [featureAvailability, setFeatureAvailability] = useState<Record<string, any>>({});
  const [remainingDaily, setRemainingDaily] = useState(0);
  const [remainingMonthly, setRemainingMonthly] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load fallback status
  const loadFallbackStatus = useCallback(async () => {
    if (!user) {
      setInFallbackMode(false);
      setFallbackLimits(null);
      setFeatureAvailability({});
      setRemainingDaily(0);
      setRemainingMonthly(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check subscription status
      const subscriptionStatus = await subscriptionStatusMonitor.getSubscriptionStatus(user.id);
      const isInFallback = subscriptionStatus.degradationLevel !== 'none';
      setInFallbackMode(isInFallback);

      // Get fallback limits
      const limits = await subscriptionFallbackService.getFallbackLimits(user.id);
      setFallbackLimits(limits);

      // Get feature availability
      const availability = await subscriptionFallbackService.getFeatureAvailability(user.id);
      setFeatureAvailability(availability);

      // Check current usage limits
      const usageCheck = await subscriptionFallbackService.canPerformAnalysis(user.id, 1000);
      setRemainingDaily(usageCheck.remainingDaily);
      setRemainingMonthly(usageCheck.remainingMonthly);

    } catch (err) {
      logger.error("Error loading fallback status:", err instanceof Error ? err : new Error(String(err)));
      setError(err instanceof Error ? err.message : 'Failed to load fallback status');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load status on mount and user change
  useEffect(() => {
    loadFallbackStatus();
  }, [loadFallbackStatus]);

  // Check if user can perform analysis
  const canPerformAnalysis = useCallback(async (
    contentLength: number, 
    analysisType: string = 'basic_analysis'
  ) => {
    if (!user) {
      return {
        allowed: false,
        reason: 'User not authenticated',
        fallbackMode: false,
        remainingDaily: 0,
        remainingMonthly: 0
      };
    }

    try {
      const result = await subscriptionFallbackService.canPerformAnalysis(
        user.id, 
        contentLength, 
        analysisType
      );
      
      // Update remaining counts
      setRemainingDaily(result.remainingDaily);
      setRemainingMonthly(result.remainingMonthly);
      
      return result;
    } catch (error) {
      logger.error("Error checking analysis permission:", error instanceof Error ? error : new Error(String(error)));
      return {
        allowed: false,
        reason: 'Error checking permissions',
        fallbackMode: true,
        remainingDaily: 0,
        remainingMonthly: 0
      };
    }
  }, [user]);

  // Perform fallback analysis
  const performFallbackAnalysis = useCallback(async (
    content: string, 
    analysisType: string = 'basic_analysis'
  ) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const result = await subscriptionFallbackService.performFallbackAnalysis(
        content,
        user.id,
        analysisType
      );
      
      // Refresh status after analysis
      await loadFallbackStatus();
      
      return result;
    } catch (error) {
      logger.error("Error performing fallback analysis:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }, [user, loadFallbackStatus]);

  // Refresh fallback status
  const refreshFallbackStatus = useCallback(async () => {
    await loadFallbackStatus();
  }, [loadFallbackStatus]);

  return {
    // Fallback status
    inFallbackMode,
    fallbackLimits,
    loading,
    error,
    
    // Usage tracking
    remainingDaily,
    remainingMonthly,
    
    // Feature availability
    featureAvailability,
    
    // Actions
    canPerformAnalysis,
    performFallbackAnalysis,
    refreshFallbackStatus
  };
}

/**
 * Hook for checking specific feature availability in fallback mode
 */
export function useFeatureFallback(feature: string) {
  const { user } = useAuth();
  const [availability, setAvailability] = useState<{
    available: boolean;
    reason?: string;
    fallbackMode: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkFeatureAvailability = async () => {
      if (!user) {
        setAvailability({
          available: false,
          reason: 'User not authenticated',
          fallbackMode: false
        });
        setLoading(false);
        return;
      }

      try {
        const featureAvailability = await subscriptionFallbackService.getFeatureAvailability(user.id);
        setAvailability(featureAvailability[feature] || {
          available: false,
          reason: 'Feature not found',
          fallbackMode: true
        });
      } catch (error) {
        logger.error("Error checking feature availability:", error instanceof Error ? error : new Error(String(error)));
        setAvailability({
          available: false,
          reason: 'Error checking availability',
          fallbackMode: true
        });
      } finally {
        setLoading(false);
      }
    };

    checkFeatureAvailability();
  }, [user, feature]);

  return {
    available: availability?.available || false,
    reason: availability?.reason,
    fallbackMode: availability?.fallbackMode || false,
    loading
  };
}

/**
 * Hook for fallback usage limits
 */
export function useFallbackLimits() {
  const { user } = useAuth();
  const [limits, setLimits] = useState<FallbackLimits | null>(null);
  const [usage, setUsage] = useState<{
    dailyUsed: number;
    monthlyUsed: number;
    dailyRemaining: number;
    monthlyRemaining: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLimits = useCallback(async () => {
    if (!user) {
      setLimits(null);
      setUsage(null);
      setLoading(false);
      return;
    }

    try {
      const fallbackLimits = await subscriptionFallbackService.getFallbackLimits(user.id);
      setLimits(fallbackLimits);

      const usageCheck = await subscriptionFallbackService.canPerformAnalysis(user.id, 1000);
      setUsage({
        dailyUsed: fallbackLimits.dailyAnalysisLimit - usageCheck.remainingDaily,
        monthlyUsed: fallbackLimits.monthlyAnalysisLimit - usageCheck.remainingMonthly,
        dailyRemaining: usageCheck.remainingDaily,
        monthlyRemaining: usageCheck.remainingMonthly
      });
    } catch (error) {
      logger.error("Error loading fallback limits:", error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadLimits();
  }, [loadLimits]);

  return {
    limits,
    usage,
    loading,
    refresh: loadLimits
  };
}

export default useSubscriptionFallback;