import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { usageTracker, CurrentUsage, UsageLimit } from '../lib/usageTrackerClient';

export const useUsageTracking = () => {
  const { user, subscription, subscriptionPlan } = useAuth();
  const [currentUsage, setCurrentUsage] = useState<CurrentUsage | null>(null);
  const [usageLimit, setUsageLimit] = useState<UsageLimit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsageData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      const usage = await usageTracker.getCurrentUsage(user.id);
      setCurrentUsage(usage);

      if (subscriptionPlan) {
        const limit = await usageTracker.getUsageLimit(subscriptionPlan.id);
        setUsageLimit(limit);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load usage data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadUsageData();
    } else {
      setCurrentUsage(null);
      setUsageLimit(null);
    }
  }, [user, subscription, loadUsageData]);

  const recordUsage = async (options?: {
    analysisType?: string;
    tokensUsed?: number;
    metadata?: Record<string, any>;
  }) => {
    if (!user) return;

    try {
      await usageTracker.recordApiCall(user.id, options);
      // Refresh usage data after recording
      await loadUsageData();
    } catch (err) {
      console.error('Failed to record usage:', err);
      throw err;
    }
  };

  const canMakeRequest = (): boolean => {
    if (!usageLimit) return true; // Allow if we can't check limits
    return usageLimit.allowed;
  };

  const getUsagePercentage = (): number => {
    if (!currentUsage || currentUsage.limit === -1) return 0;
    return currentUsage.percentage;
  };

  const getRemainingUsage = (): number => {
    if (!currentUsage || currentUsage.limit === -1) return -1;
    return Math.max(0, currentUsage.limit - currentUsage.current);
  };

  const getUsageColor = (): string => {
    const percentage = getUsagePercentage();
    if (percentage >= 90) return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
    if (percentage >= 80) return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20';
    return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
  };

  const getUsageStatus = (): 'normal' | 'warning' | 'critical' | 'exceeded' => {
    const percentage = getUsagePercentage();
    if (percentage >= 100) return 'exceeded';
    if (percentage >= 90) return 'critical';
    if (percentage >= 80) return 'warning';
    return 'normal';
  };

  return {
    currentUsage,
    usageLimit,
    loading,
    error,
    subscription,
    subscriptionPlan,
    loadUsageData,
    recordUsage,
    canMakeRequest,
    getUsagePercentage,
    getRemainingUsage,
    getUsageColor,
    getUsageStatus
  };
};

export default useUsageTracking;