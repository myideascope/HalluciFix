/**
 * Usage Tracker Service
 * Tracks API usage and reports to Stripe for metered billing
 */

import { supabase } from './supabase';
import { getStripe, withStripeErrorHandling } from './stripe';
import { getSubscriptionService } from './subscriptionService';
import { UsageRecord } from '../types/subscription';

import { logger } from './logging';
export interface UsageTrackingOptions {
  analysisType?: string;
  tokensUsed?: number;
  metadata?: Record<string, any>;
}

export interface CurrentUsage {
  current: number;
  limit: number;
  percentage: number;
  overage: number;
  resetDate: Date;
  overageCost?: number;
}

export interface UsageLimit {
  allowed: boolean;
  remaining: number;
  resetDate: Date;
  reason?: string;
}

export class UsageTracker {
  private stripe: any = null;

  /**
   * Get Stripe instance (lazy initialization)
   */
  private getStripeInstance() {
    if (typeof window !== 'undefined') {
      throw new Error('UsageTracker server methods cannot be used in browser environment');
    }
    
    if (!this.stripe) {
      this.stripe = getStripe();
    }
    
    return this.stripe;
  }

  /**
   * Record API usage for a user
   */
  async recordApiCall(
    userId: string,
    options: UsageTrackingOptions = {}
  ): Promise<void> {
    const {
      analysisType = 'general',
      tokensUsed = 1,
      metadata = {}
    } = options;

    try {
      // Record usage in database
      const { error } = await supabase
        .from('usage_records')
        .insert({
          user_id: userId,
          usage_type: 'api_calls',
          quantity: tokensUsed,
          timestamp: new Date().toISOString(),
          metadata: {
            analysis_type: analysisType,
            ...metadata
          }
        });

      if (error) {
        logger.error("Failed to record usage:", error instanceof Error ? error : new Error(String(error)));
        throw new Error(`Failed to record usage: ${error.message}`);
      }

      // Report to Stripe for usage-based billing (async, don't block)
      this.reportToStripe(userId, tokensUsed).catch(error => {
        logger.error("Failed to report usage to Stripe:", error instanceof Error ? error : new Error(String(error)));
      });

    } catch (error) {
      logger.error("Error recording API usage:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Report usage to Stripe for metered billing
   */
  private async reportToStripe(userId: string, quantity: number): Promise<void> {
    try {
      // Get user's active subscription
      const subscription = await getSubscriptionService().getUserSubscription(userId);
      if (!subscription || !['active', 'trialing'].includes(subscription.status)) {
        return; // No active subscription to report usage for
      }

      // Get Stripe subscription details
      const stripeSubscription = await withStripeErrorHandling(
        () => this.getStripeInstance().subscriptions.retrieve(subscription.stripeSubscriptionId),
        'retrieve subscription for usage reporting'
      );

      // Find usage-based pricing item
      const usageItem = stripeSubscription.items.data.find(
        item => item.price.recurring?.usage_type === 'metered'
      );

      if (usageItem) {
        await withStripeErrorHandling(
          () => this.getStripeInstance().subscriptionItems.createUsageRecord(
            usageItem.id,
            {
              quantity: quantity,
              timestamp: Math.floor(Date.now() / 1000),
              action: 'increment'
            }
          ),
          'create usage record in Stripe'
        );
      }
    } catch (error) {
      logger.error("Failed to report usage to Stripe:", error instanceof Error ? error : new Error(String(error)));
      // Don't throw - usage reporting to Stripe is not critical for app functionality
    }
  }

  /**
   * Get current usage for a user
   */
  async getCurrentUsage(userId: string): Promise<CurrentUsage> {
    try {
      // Get user's subscription to determine billing period
      const subscription = await getSubscriptionService().getUserSubscription(userId);
      if (!subscription) {
        return {
          current: 0,
          limit: 0,
          percentage: 0,
          overage: 0,
          resetDate: new Date()
        };
      }

      // Get plan details for limits
      const plan = await getSubscriptionService().getSubscriptionPlan(subscription.planId);
      if (!plan) {
        throw new Error('Invalid subscription plan');
      }

      // Get usage for current billing period
      const { data: usageRecords, error } = await supabase
        .from('usage_records')
        .select('quantity')
        .eq('user_id', userId)
        .eq('usage_type', 'api_calls')
        .gte('timestamp', subscription.currentPeriodStart.toISOString())
        .lt('timestamp', subscription.currentPeriodEnd.toISOString());

      if (error) {
        throw new Error(`Failed to fetch usage: ${error.message}`);
      }

      const currentUsage = usageRecords.reduce((total, record) => total + record.quantity, 0);
      const limit = plan.analysisLimit;
      const percentage = limit > 0 ? (currentUsage / limit) * 100 : 0;
      const overage = limit > 0 ? Math.max(0, currentUsage - limit) : 0;

      // Calculate overage cost (example: $0.01 per additional call)
      const overageCost = overage > 0 ? overage * 0.01 : 0;

      return {
        current: currentUsage,
        limit,
        percentage,
        overage,
        resetDate: subscription.currentPeriodEnd,
        overageCost
      };
    } catch (error) {
      logger.error("Error getting current usage:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Check if user can make an API call (within limits)
   */
  async checkUsageLimit(userId: string): Promise<UsageLimit> {
    try {
      const usage = await this.getCurrentUsage(userId);
      
      if (usage.limit === -1) {
        // Unlimited plan
        return {
          allowed: true,
          remaining: -1,
          resetDate: usage.resetDate
        };
      }

      const remaining = Math.max(0, usage.limit - usage.current);
      
      return {
        allowed: remaining > 0,
        remaining,
        resetDate: usage.resetDate,
        reason: remaining === 0 ? 'Monthly usage limit exceeded' : undefined
      };
    } catch (error) {
      logger.error("Error checking usage limit:", error instanceof Error ? error : new Error(String(error)));
      // Allow usage if we can't check limits (fail open)
      return {
        allowed: true,
        remaining: 0,
        resetDate: new Date(),
        reason: 'Unable to verify usage limits'
      };
    }
  }

  /**
   * Get usage history for a user
   */
  async getUsageHistory(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      usageType?: string;
    } = {}
  ): Promise<UsageRecord[]> {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate = new Date(),
      limit = 100,
      usageType = 'api_calls'
    } = options;

    try {
      let query = supabase
        .from('usage_records')
        .select('*')
        .eq('user_id', userId)
        .eq('usage_type', usageType)
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString())
        .order('timestamp', { ascending: false });

      if (limit > 0) {
        query = query.limit(limit);
      }

      const { data: records, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch usage history: ${error.message}`);
      }

      return records.map(record => ({
        id: record.id,
        userId: record.user_id,
        subscriptionId: record.subscription_id,
        stripeSubscriptionId: record.stripe_subscription_id,
        usageType: record.usage_type,
        quantity: record.quantity,
        timestamp: new Date(record.timestamp),
        metadata: record.metadata,
        createdAt: new Date(record.created_at)
      }));
    } catch (error) {
      logger.error("Error getting usage history:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get usage analytics for a user
   */
  async getUsageAnalytics(
    userId: string,
    days: number = 30
  ): Promise<{
    totalUsage: number;
    dailyAverage: number;
    peakDay: { date: string; usage: number };
    trend: 'increasing' | 'decreasing' | 'stable';
    dailyBreakdown: Array<{ date: string; usage: number }>;
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    try {
      const { data: records, error } = await supabase
        .from('usage_records')
        .select('quantity, timestamp')
        .eq('user_id', userId)
        .eq('usage_type', 'api_calls')
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch usage analytics: ${error.message}`);
      }

      // Group by day
      const dailyUsage = new Map<string, number>();
      let totalUsage = 0;

      records.forEach(record => {
        const date = new Date(record.timestamp).toISOString().split('T')[0];
        dailyUsage.set(date, (dailyUsage.get(date) || 0) + record.quantity);
        totalUsage += record.quantity;
      });

      // Convert to array and fill missing days with 0
      const dailyBreakdown: Array<{ date: string; usage: number }> = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0];
        dailyBreakdown.push({
          date,
          usage: dailyUsage.get(date) || 0
        });
      }

      // Find peak day
      const peakDay = dailyBreakdown.reduce((peak, day) => 
        day.usage > peak.usage ? day : peak,
        { date: '', usage: 0 }
      );

      // Calculate trend (simple linear regression)
      const n = dailyBreakdown.length;
      const sumX = (n * (n - 1)) / 2; // Sum of indices
      const sumY = dailyBreakdown.reduce((sum, day) => sum + day.usage, 0);
      const sumXY = dailyBreakdown.reduce((sum, day, index) => sum + index * day.usage, 0);
      const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squared indices

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const trend = slope > 1 ? 'increasing' : slope < -1 ? 'decreasing' : 'stable';

      return {
        totalUsage,
        dailyAverage: totalUsage / days,
        peakDay,
        trend,
        dailyBreakdown
      };
    } catch (error) {
      logger.error("Error getting usage analytics:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Bulk record usage (for batch operations)
   */
  async recordBulkUsage(
    userId: string,
    usageRecords: Array<{
      quantity: number;
      analysisType?: string;
      timestamp?: Date;
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    try {
      const records = usageRecords.map(record => ({
        user_id: userId,
        usage_type: 'api_calls',
        quantity: record.quantity,
        timestamp: (record.timestamp || new Date()).toISOString(),
        metadata: {
          analysis_type: record.analysisType || 'batch',
          ...record.metadata
        }
      }));

      const { error } = await supabase
        .from('usage_records')
        .insert(records);

      if (error) {
        throw new Error(`Failed to record bulk usage: ${error.message}`);
      }

      // Report total usage to Stripe
      const totalQuantity = usageRecords.reduce((sum, record) => sum + record.quantity, 0);
      this.reportToStripe(userId, totalQuantity).catch(error => {
        logger.error("Failed to report bulk usage to Stripe:", error instanceof Error ? error : new Error(String(error)));
      });

    } catch (error) {
      logger.error("Error recording bulk usage:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}

// Export singleton instance (server-side only)
let usageTrackerInstance: UsageTracker | null = null;

export function getUsageTracker(): UsageTracker {
  if (typeof window !== 'undefined') {
    throw new Error('UsageTracker can only be used in server-side environments. Use client-safe alternatives for browser code.');
  }
  
  if (!usageTrackerInstance) {
    usageTrackerInstance = new UsageTracker();
  }
  
  return usageTrackerInstance;
}

// For server-side code that expects the direct export
export const usageTracker = typeof window === 'undefined' ? getUsageTracker() : null;

// Convenience functions (server-side only)
export const recordApiCall = (userId: string, options?: UsageTrackingOptions) =>
  getUsageTracker().recordApiCall(userId, options);

export const getCurrentUsage = (userId: string) =>
  getUsageTracker().getCurrentUsage(userId);

export const checkUsageLimit = (userId: string) =>
  getUsageTracker().checkUsageLimit(userId);

export const getUsageHistory = (userId: string, options?: Parameters<UsageTracker['getUsageHistory']>[1]) =>
  getUsageTracker().getUsageHistory(userId, options);

export const getUsageAnalytics = (userId: string, days?: number) =>
  getUsageTracker().getUsageAnalytics(userId, days);