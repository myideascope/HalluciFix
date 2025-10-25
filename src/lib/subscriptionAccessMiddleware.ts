/**
 * Subscription Access Middleware
 * Middleware to check subscription status and enforce usage limits for API calls
 */

import { getSubscriptionService } from './subscriptionService';
import { getUsageTracker } from './usageTracker';
import { User } from '../types/user';

export interface SubscriptionAccessOptions {
  enforceSubscription?: boolean;
  enforceUsageLimit?: boolean;
  requiredFeature?: string;
  analysisType?: string;
  tokensUsed?: number;
  metadata?: Record<string, any>;
}

export interface SubscriptionAccessResult {
  allowed: boolean;
  reason?: string;
  subscription?: {
    plan: string;
    status: string;
    limit: number;
    current: number;
    remaining: number;
    resetDate: Date;
  };
  gracePeriod?: {
    active: boolean;
    daysRemaining: number;
    endDate: Date;
  };
  alternatives?: Array<{
    action: 'upgrade' | 'subscribe' | 'contact_support';
    label: string;
    description: string;
    url?: string;
  }>;
}

export class SubscriptionAccessMiddleware {
  /**
   * Check if user has subscription access for a feature
   */
  static async checkSubscriptionAccess(
    userId: string,
    options: SubscriptionAccessOptions = {}
  ): Promise<SubscriptionAccessResult> {
    const {
      enforceSubscription = true,
      enforceUsageLimit = true,
      requiredFeature,
      analysisType = 'api_call',
      tokensUsed = 1
    } = options;

    try {
      // Check if user has active subscription
      const subscriptionAccess = await getSubscriptionService().validateSubscriptionAccess(
        userId,
        requiredFeature
      );

      if (!subscriptionAccess.hasAccess && enforceSubscription) {
        return {
          allowed: false,
          reason: subscriptionAccess.reason || 'No active subscription',
          alternatives: this.getSubscriptionAlternatives(subscriptionAccess.subscription?.status)
        };
      }

      // If subscription is valid, check usage limits
      if (subscriptionAccess.hasAccess && enforceUsageLimit) {
        const usageLimit = await getUsageTracker().checkUsageLimit(userId);
        
        if (!usageLimit.allowed) {
          // Check if user is in grace period for payment failures
          const gracePeriod = await this.checkGracePeriod(userId);
          
          if (gracePeriod.active) {
            return {
              allowed: true,
              reason: 'Grace period active',
              subscription: subscriptionAccess.subscription && subscriptionAccess.plan ? {
                plan: subscriptionAccess.plan.name,
                status: subscriptionAccess.subscription.status,
                limit: subscriptionAccess.plan.analysisLimit,
                current: 0, // Will be filled by usage data
                remaining: usageLimit.remaining,
                resetDate: usageLimit.resetDate
              } : undefined,
              gracePeriod
            };
          }

          return {
            allowed: false,
            reason: usageLimit.reason || 'Usage limit exceeded',
            subscription: subscriptionAccess.subscription && subscriptionAccess.plan ? {
              plan: subscriptionAccess.plan.name,
              status: subscriptionAccess.subscription.status,
              limit: subscriptionAccess.plan.analysisLimit,
              current: 0, // Will be filled by usage data
              remaining: usageLimit.remaining,
              resetDate: usageLimit.resetDate
            } : undefined,
            alternatives: this.getUsageLimitAlternatives(subscriptionAccess.plan?.name)
          };
        }

        // Get current usage for response
        const currentUsage = await getUsageTracker().getCurrentUsage(userId);
        
        return {
          allowed: true,
          subscription: subscriptionAccess.subscription && subscriptionAccess.plan ? {
            plan: subscriptionAccess.plan.name,
            status: subscriptionAccess.subscription.status,
            limit: subscriptionAccess.plan.analysisLimit,
            current: currentUsage.current,
            remaining: usageLimit.remaining,
            resetDate: usageLimit.resetDate
          } : undefined
        };
      }

      // Subscription valid, no usage enforcement
      return {
        allowed: true,
        subscription: subscriptionAccess.subscription && subscriptionAccess.plan ? {
          plan: subscriptionAccess.plan.name,
          status: subscriptionAccess.subscription.status,
          limit: subscriptionAccess.plan.analysisLimit,
          current: 0,
          remaining: -1,
          resetDate: new Date()
        } : undefined
      };

    } catch (error) {
      console.error('Error checking subscription access:', error);
      
      // Fail open - allow access if we can't check subscription
      return {
        allowed: true,
        reason: 'Unable to verify subscription status'
      };
    }
  }

  /**
   * Check if user is in grace period for payment failures
   */
  private static async checkGracePeriod(userId: string): Promise<{
    active: boolean;
    daysRemaining: number;
    endDate: Date;
  }> {
    try {
      const subscription = await getSubscriptionService().getUserSubscription(userId);
      
      if (!subscription || subscription.status !== 'past_due') {
        return {
          active: false,
          daysRemaining: 0,
          endDate: new Date()
        };
      }

      // Grace period is typically 7 days from when subscription became past_due
      const gracePeriodDays = 7;
      const gracePeriodStart = subscription.currentPeriodEnd;
      const gracePeriodEnd = new Date(gracePeriodStart.getTime() + (gracePeriodDays * 24 * 60 * 60 * 1000));
      const now = new Date();

      if (now <= gracePeriodEnd) {
        const daysRemaining = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        
        return {
          active: true,
          daysRemaining,
          endDate: gracePeriodEnd
        };
      }

      return {
        active: false,
        daysRemaining: 0,
        endDate: gracePeriodEnd
      };

    } catch (error) {
      console.error('Error checking grace period:', error);
      return {
        active: false,
        daysRemaining: 0,
        endDate: new Date()
      };
    }
  }

  /**
   * Get alternative actions for subscription issues
   */
  private static getSubscriptionAlternatives(subscriptionStatus?: string): Array<{
    action: 'upgrade' | 'subscribe' | 'contact_support';
    label: string;
    description: string;
    url?: string;
  }> {
    const alternatives = [];

    if (!subscriptionStatus || subscriptionStatus === 'canceled') {
      alternatives.push({
        action: 'subscribe' as const,
        label: 'Subscribe Now',
        description: 'Choose a plan to access premium features',
        url: '/pricing'
      });
    }

    if (subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid') {
      alternatives.push({
        action: 'contact_support' as const,
        label: 'Update Payment Method',
        description: 'Update your payment information to restore access',
        url: '/billing'
      });
    }

    alternatives.push({
      action: 'contact_support' as const,
      label: 'Contact Support',
      description: 'Get help with your subscription',
      url: '/support'
    });

    return alternatives;
  }

  /**
   * Get alternative actions for usage limit issues
   */
  private static getUsageLimitAlternatives(planName?: string): Array<{
    action: 'upgrade' | 'subscribe' | 'contact_support';
    label: string;
    description: string;
    url?: string;
  }> {
    const alternatives = [];

    if (planName === 'Basic') {
      alternatives.push({
        action: 'upgrade' as const,
        label: 'Upgrade to Pro',
        description: 'Get 10x more analyses with Pro plan',
        url: '/pricing'
      });
    }

    if (planName === 'Pro') {
      alternatives.push({
        action: 'upgrade' as const,
        label: 'Upgrade to Enterprise',
        description: 'Get unlimited analyses with Enterprise plan',
        url: '/pricing'
      });
    }

    alternatives.push({
      action: 'contact_support' as const,
      label: 'Contact Sales',
      description: 'Discuss custom usage limits',
      url: '/contact'
    });

    return alternatives;
  }

  /**
   * Record usage after successful API call
   */
  static async recordUsage(
    userId: string,
    options: SubscriptionAccessOptions = {}
  ): Promise<void> {
    const {
      analysisType = 'api_call',
      tokensUsed = 1,
      metadata = {}
    } = options;

    try {
      await getUsageTracker().recordApiCall(userId, {
        analysisType,
        tokensUsed,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          success: true
        }
      });
    } catch (error) {
      console.error('Error recording usage:', error);
      // Don't throw - usage recording failure shouldn't break the API call
    }
  }

  /**
   * Higher-order function to wrap API functions with subscription access control
   */
  static withSubscriptionAccess<T extends any[], R>(
    apiFunction: (...args: T) => Promise<R>,
    options: {
      getUserId: (...args: T) => string;
      getOptions?: (...args: T) => SubscriptionAccessOptions;
      onAccessDenied?: (result: SubscriptionAccessResult) => void;
    }
  ) {
    return async (...args: T): Promise<R> => {
      const userId = options.getUserId(...args);
      const accessOptions = options.getOptions?.(...args) || {};

      // Check subscription access before making the API call
      const accessResult = await this.checkSubscriptionAccess(userId, accessOptions);
      
      if (!accessResult.allowed) {
        if (options.onAccessDenied) {
          options.onAccessDenied(accessResult);
        }
        
        const error = new SubscriptionAccessError(
          accessResult.reason || 'Access denied',
          accessResult
        );
        throw error;
      }

      try {
        // Execute the API function
        const result = await apiFunction(...args);

        // Record usage after successful execution
        await this.recordUsage(userId, accessOptions);

        return result;
      } catch (error) {
        // Don't record usage for failed API calls
        throw error;
      }
    };
  }

  /**
   * React hook for subscription access checking
   */
  static useSubscriptionAccess(userId: string | null) {
    const checkAccess = async (options?: SubscriptionAccessOptions) => {
      if (!userId) {
        return {
          allowed: false,
          reason: 'User not authenticated'
        };
      }
      return this.checkSubscriptionAccess(userId, options);
    };

    const recordCall = async (options?: SubscriptionAccessOptions) => {
      if (!userId) {
        return;
      }
      return this.recordUsage(userId, options);
    };

    return {
      checkAccess,
      recordCall
    };
  }
}

/**
 * Custom error class for subscription access issues
 */
export class SubscriptionAccessError extends Error {
  public readonly accessResult: SubscriptionAccessResult;
  public readonly statusCode: number;

  constructor(message: string, accessResult: SubscriptionAccessResult) {
    super(message);
    this.name = 'SubscriptionAccessError';
    this.accessResult = accessResult;
    this.statusCode = this.getStatusCode(accessResult);
  }

  private getStatusCode(result: SubscriptionAccessResult): number {
    if (result.reason?.includes('authentication') || result.reason?.includes('not authenticated')) {
      return 401;
    }
    if (result.reason?.includes('subscription') || result.reason?.includes('plan')) {
      return 402; // Payment Required
    }
    if (result.reason?.includes('limit') || result.reason?.includes('usage')) {
      return 429; // Too Many Requests
    }
    return 403; // Forbidden
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      accessResult: this.accessResult
    };
  }
}

// Export convenience functions
export const checkSubscriptionAccess = (userId: string, options?: SubscriptionAccessOptions) =>
  SubscriptionAccessMiddleware.checkSubscriptionAccess(userId, options);

export const recordUsage = (userId: string, options?: SubscriptionAccessOptions) =>
  SubscriptionAccessMiddleware.recordUsage(userId, options);

export const withSubscriptionAccess = SubscriptionAccessMiddleware.withSubscriptionAccess;

export default SubscriptionAccessMiddleware;