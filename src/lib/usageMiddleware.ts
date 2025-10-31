/**
 * Usage Tracking Middleware
 * Middleware to automatically track API usage across the application
 */

import { getUsageTracker, UsageTrackingOptions } from './usageTracker';
import { getSubscriptionService } from './subscriptionService';

export interface UsageMiddlewareOptions {
  trackUsage?: boolean;
  enforceLimit?: boolean;
  analysisType?: string;
  tokensUsed?: number;
  metadata?: Record<string, any>;
}

export interface UsageCheckResult {
  allowed: boolean;
  remaining: number;
  resetDate: Date;
  reason?: string;
  subscription?: {
    plan: string;
    status: string;
    limit: number;
  };
}

/**
 * Middleware function to check usage limits before API calls
 */
export async function checkUsageLimit(
  userId: string,
  options: UsageMiddlewareOptions = {}
): Promise<UsageCheckResult> {
  const { enforceLimit = true } = options;

  try {
    // Check if user has active subscription
    const hasActiveSubscription = await getSubscriptionService().hasActiveSubscription(userId);
    if (!hasActiveSubscription && enforceLimit) {
      return {
        allowed: false,
        remaining: 0,
        resetDate: new Date(),
        reason: 'No active subscription found'
      };
    }

    // Get subscription details
    const subscription = await getSubscriptionService().getUserSubscription(userId);
    const plan = subscription ? await getSubscriptionService().getSubscriptionPlan(subscription.planId) : null;

    // Check usage limits
    const usageLimit = await getUsageTracker().checkUsageLimit(userId);

    return {
      allowed: usageLimit.allowed,
      remaining: usageLimit.remaining,
      resetDate: usageLimit.resetDate,
      reason: usageLimit.reason,
      subscription: subscription && plan ? {
        plan: plan.name,
        status: subscription.status,
        limit: plan.analysisLimit
      } : undefined
    };
  } catch (error) {
    console.error('Error checking usage limit:', error);
    // Fail open - allow usage if we can't check limits
    return {
      allowed: true,
      remaining: 0,
      resetDate: new Date(),
      reason: 'Unable to verify usage limits'
    };
  }
}

/**
 * Middleware function to record API usage after successful calls
 */
export async function recordUsage(
  userId: string,
  options: UsageMiddlewareOptions = {}
): Promise<void> {
  const { 
    trackUsage = true,
    analysisType = 'api_call',
    tokensUsed = 1,
    metadata = {}
  } = options;

  if (!trackUsage) {
    return;
  }

  try {
    await getUsageTracker().recordApiCall(userId, {
      analysisType,
      tokensUsed,
      metadata
    });
  } catch (error) {
    console.error('Error recording usage:', error);
    // Don't throw - usage recording failure shouldn't break the API call
  }
}

/**
 * Higher-order function to wrap API calls with usage tracking
 */
export function withUsageTracking<T extends any[], R>(
  apiFunction: (...args: T) => Promise<R>,
  options: {
    getUserId: (...args: T) => string;
    getAnalysisType?: (...args: T) => string;
    getTokensUsed?: (...args: T) => number;
    getMetadata?: (...args: T) => Record<string, any>;
    enforceLimit?: boolean;
    trackUsage?: boolean;
  }
) {
  return async (...args: T): Promise<R> => {
    const userId = options.getUserId(...args);
    const analysisType = options.getAnalysisType?.(...args) || 'api_call';
    const tokensUsed = options.getTokensUsed?.(...args) || 1;
    const metadata = options.getMetadata?.(...args) || {};
    const enforceLimit = options.enforceLimit ?? true;
    const trackUsage = options.trackUsage ?? true;

    // Check usage limits before making the API call
    if (enforceLimit) {
      const usageCheck = await checkUsageLimit(userId, { enforceLimit });
      if (!usageCheck.allowed) {
        throw new Error(usageCheck.reason || 'Usage limit exceeded');
      }
    }

    try {
      // Execute the API function
      const result = await apiFunction(...args);

      // Record usage after successful execution
      if (trackUsage) {
        await recordUsage(userId, {
          analysisType,
          tokensUsed,
          metadata: {
            ...metadata,
            success: true,
            timestamp: new Date().toISOString()
          }
        });
      }

      return result;
    } catch (error) {
      // Record failed usage attempt (optional)
      if (trackUsage) {
        await recordUsage(userId, {
          analysisType,
          tokensUsed: 0, // Don't count failed attempts against usage
          metadata: {
            ...metadata,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          }
        });
      }

      throw error;
    }
  };
}

/**
 * React hook for usage tracking in components
 */
export function useUsageTracking(userId: string | null) {
  const checkLimit = async (options?: UsageMiddlewareOptions) => {
    if (!userId) {
      return {
        allowed: false,
        remaining: 0,
        resetDate: new Date(),
        reason: 'User not authenticated'
      };
    }
    return checkUsageLimit(userId, options);
  };

  const recordCall = async (options?: UsageMiddlewareOptions) => {
    if (!userId) {
      return;
    }
    return recordUsage(userId, options);
  };

  const getCurrentUsage = async () => {
    if (!userId) {
      return {
        current: 0,
        limit: 0,
        percentage: 0,
        overage: 0,
        resetDate: new Date()
      };
    }
    return getUsageTracker().getCurrentUsage(userId);
  };

  return {
    checkLimit,
    recordCall,
    getCurrentUsage
  };
}

/**
 * Express.js middleware for usage tracking (if using Express)
 */
export function createUsageMiddleware(options: {
  getUserId: (req: any) => string;
  getAnalysisType?: (req: any) => string;
  getTokensUsed?: (req: any) => number;
  enforceLimit?: boolean;
}) {
  return async (req: any, res: any, next: any) => {
    try {
      const userId = options.getUserId(req);
      const analysisType = options.getAnalysisType?.(req) || 'api_call';
      const tokensUsed = options.getTokensUsed?.(req) || 1;
      const enforceLimit = options.enforceLimit ?? true;

      // Check usage limits
      const usageCheck = await checkUsageLimit(userId, { enforceLimit });
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'Usage limit exceeded',
          message: usageCheck.reason,
          resetDate: usageCheck.resetDate,
          subscription: usageCheck.subscription
        });
      }

      // Add usage tracking to request
      req.usageTracking = {
        userId,
        analysisType,
        tokensUsed,
        recordUsage: () => recordUsage(userId, { analysisType, tokensUsed })
      };

      next();
    } catch (error) {
      console.error('Usage middleware error:', error);
      // Continue without blocking the request
      next();
    }
  };
}

export default {
  checkUsageLimit,
  recordUsage,
  withUsageTracking,
  useUsageTracking,
  createUsageMiddleware
};