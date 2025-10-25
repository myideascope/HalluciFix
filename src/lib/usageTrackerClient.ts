/**
 * Client-Side Usage Tracker
 * Browser-safe version of usage tracker that only includes methods that can run in the browser
 */

import { supabase } from './supabase';

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

export class ClientUsageTracker {
  /**
   * Get current usage for a user (client-safe)
   */
  async getCurrentUsage(userId: string): Promise<CurrentUsage> {
    try {
      // Get usage from database
      const { data: usageRecords, error } = await supabase
        .from('usage_records')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch usage: ${error.message}`);
      }

      // Calculate current usage
      const current = usageRecords?.reduce((total, record) => total + (record.quantity || 1), 0) || 0;
      
      // Default limits (would normally come from subscription plan)
      const limit = 1000; // Default limit
      const percentage = (current / limit) * 100;
      const overage = Math.max(0, current - limit);
      
      // Calculate reset date (first day of next month)
      const resetDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

      return {
        current,
        limit,
        percentage,
        overage,
        resetDate,
        overageCost: overage * 0.01, // $0.01 per overage unit
      };
    } catch (error) {
      console.error('Error fetching current usage:', error);
      
      // Return safe defaults
      return {
        current: 0,
        limit: 1000,
        percentage: 0,
        overage: 0,
        resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      };
    }
  }

  /**
   * Check usage limits for a user (client-safe)
   */
  async checkUsageLimit(userId: string, requestedUsage: number = 1): Promise<UsageLimit> {
    try {
      const currentUsage = await this.getCurrentUsage(userId);
      const remaining = Math.max(0, currentUsage.limit - currentUsage.current);
      const allowed = remaining >= requestedUsage;

      return {
        allowed,
        remaining,
        resetDate: currentUsage.resetDate,
        reason: allowed ? undefined : 'Usage limit exceeded',
      };
    } catch (error) {
      console.error('Error checking usage limit:', error);
      
      // Return conservative defaults
      return {
        allowed: false,
        remaining: 0,
        resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
        reason: 'Unable to verify usage limits',
      };
    }
  }

  /**
   * Get usage history for a user (client-safe)
   */
  async getUsageHistory(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ): Promise<Array<{
    date: Date;
    usage: number;
    analysisType: string;
    metadata?: Record<string, any>;
  }>> {
    const { startDate, endDate, limit = 100 } = options;

    try {
      let query = supabase
        .from('usage_records')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (startDate) {
        query = query.gte('created_at', startDate.toISOString());
      }

      if (endDate) {
        query = query.lte('created_at', endDate.toISOString());
      }

      const { data: records, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch usage history: ${error.message}`);
      }

      return records?.map(record => ({
        date: new Date(record.created_at),
        usage: record.quantity || 1,
        analysisType: record.analysis_type || 'general',
        metadata: record.metadata,
      })) || [];
    } catch (error) {
      console.error('Error fetching usage history:', error);
      return [];
    }
  }

  // =============================================================================
  // SERVER-SIDE ONLY METHODS (Throw errors in browser)
  // =============================================================================

  /**
   * Record API call - Server-side only
   */
  async recordApiCall(): Promise<never> {
    throw new Error('recordApiCall can only be called from server-side code. Use API endpoints instead.');
  }

  /**
   * Report usage to Stripe - Server-side only
   */
  async reportUsageToStripe(): Promise<never> {
    throw new Error('reportUsageToStripe can only be called from server-side code.');
  }
}

// Export singleton instance
export const clientUsageTracker = new ClientUsageTracker();

// For backward compatibility, export as usageTracker for client-side code
export const usageTracker = clientUsageTracker;

// Export types
export type { UsageTrackingOptions, CurrentUsage, UsageLimit };