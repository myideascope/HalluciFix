/**
 * Subscription Status Monitor
 * Monitors subscription status and provides graceful degradation for subscription issues
 */

import { subscriptionService } from './subscriptionService';
import { usageTracker } from './usageTracker';
import { logger } from './logging';
import { UserSubscription, SubscriptionPlan } from '../types/subscription';

export interface SubscriptionStatus {
  isActive: boolean;
  isPastDue: boolean;
  isTrialing: boolean;
  inGracePeriod: boolean;
  daysUntilExpiry: number;
  gracePeriodDaysRemaining: number;
  plan: SubscriptionPlan | null;
  subscription: UserSubscription | null;
  degradationLevel: 'none' | 'warning' | 'limited' | 'blocked';
  allowedFeatures: string[];
  restrictions: string[];
}

export interface GracePeriodSettings {
  paymentFailureGraceDays: number;
  trialExpiryGraceDays: number;
  usageLimitGracePercentage: number;
  enableGracefulDegradation: boolean;
}

export class SubscriptionStatusMonitor {
  private static instance: SubscriptionStatusMonitor;
  private logger = logger.child({ component: 'SubscriptionStatusMonitor' });
  private gracePeriodSettings: GracePeriodSettings = {
    paymentFailureGraceDays: 7,
    trialExpiryGraceDays: 3,
    usageLimitGracePercentage: 10, // Allow 10% over limit during grace period
    enableGracefulDegradation: true
  };

  private constructor() {}

  static getInstance(): SubscriptionStatusMonitor {
    if (!SubscriptionStatusMonitor.instance) {
      SubscriptionStatusMonitor.instance = new SubscriptionStatusMonitor();
    }
    return SubscriptionStatusMonitor.instance;
  }

  /**
   * Get comprehensive subscription status for a user
   */
  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
    try {
      const subscription = await subscriptionService.getUserSubscription(userId);
      const plan = subscription ? await subscriptionService.getSubscriptionPlan(subscription.planId) : null;
      
      if (!subscription) {
        return this.createNoSubscriptionStatus();
      }

      const now = new Date();
      const isActive = ['active', 'trialing'].includes(subscription.status);
      const isPastDue = subscription.status === 'past_due';
      const isTrialing = subscription.status === 'trialing';
      
      // Calculate grace period status
      const gracePeriodInfo = this.calculateGracePeriod(subscription, now);
      
      // Calculate days until expiry
      const daysUntilExpiry = this.calculateDaysUntilExpiry(subscription, now);
      
      // Determine degradation level
      const degradationLevel = this.determineDegradationLevel(
        subscription,
        gracePeriodInfo,
        daysUntilExpiry,
        isActive
      );

      // Get allowed features and restrictions
      const { allowedFeatures, restrictions } = this.getFeatureAccess(
        plan,
        degradationLevel,
        gracePeriodInfo.inGracePeriod
      );

      return {
        isActive,
        isPastDue,
        isTrialing,
        inGracePeriod: gracePeriodInfo.inGracePeriod,
        daysUntilExpiry,
        gracePeriodDaysRemaining: gracePeriodInfo.daysRemaining,
        plan,
        subscription,
        degradationLevel,
        allowedFeatures,
        restrictions
      };

    } catch (error) {
      this.logger.error('Error getting subscription status', error as Error, { userId });
      
      // Return safe defaults on error
      return this.createErrorStatus();
    }
  }

  /**
   * Check if user can access a specific feature
   */
  async canAccessFeature(userId: string, feature: string): Promise<{
    allowed: boolean;
    reason?: string;
    degraded?: boolean;
    gracePeriod?: boolean;
  }> {
    const status = await this.getSubscriptionStatus(userId);
    
    // Always allow basic features during grace period
    if (status.inGracePeriod && this.isBasicFeature(feature)) {
      return {
        allowed: true,
        degraded: true,
        gracePeriod: true
      };
    }

    // Check if feature is in allowed list
    if (status.allowedFeatures.includes(feature) || status.allowedFeatures.includes('*')) {
      return {
        allowed: true,
        degraded: status.degradationLevel !== 'none'
      };
    }

    // Feature not allowed
    const reason = status.restrictions.find(r => r.includes(feature)) || 
                  `Feature '${feature}' not available with current subscription status`;

    return {
      allowed: false,
      reason,
      degraded: status.degradationLevel !== 'none'
    };
  }

  /**
   * Get fallback functionality for expired subscriptions
   */
  async getFallbackAccess(userId: string): Promise<{
    analysisLimit: number;
    features: string[];
    restrictions: string[];
    message: string;
  }> {
    const status = await this.getSubscriptionStatus(userId);
    
    if (status.inGracePeriod) {
      return {
        analysisLimit: 50, // Limited analyses during grace period
        features: ['basic_analysis', 'view_history'],
        restrictions: ['No batch processing', 'No scheduled scans', 'No advanced analytics'],
        message: `Grace period active. ${status.gracePeriodDaysRemaining} days remaining to resolve payment issues.`
      };
    }

    if (status.degradationLevel === 'limited') {
      return {
        analysisLimit: 10, // Very limited for expired subscriptions
        features: ['basic_analysis'],
        restrictions: ['No batch processing', 'No scheduled scans', 'No advanced analytics', 'No history access'],
        message: 'Subscription expired. Limited functionality available. Please renew to restore full access.'
      };
    }

    return {
      analysisLimit: 0,
      features: [],
      restrictions: ['All features disabled'],
      message: 'Subscription required to access this feature.'
    };
  }

  /**
   * Create user notifications for subscription issues
   */
  async createSubscriptionNotifications(userId: string): Promise<Array<{
    type: 'warning' | 'error' | 'info';
    title: string;
    message: string;
    action?: {
      label: string;
      url: string;
    };
    dismissible: boolean;
  }>> {
    const status = await this.getSubscriptionStatus(userId);
    const notifications = [];

    // Payment failure notifications
    if (status.isPastDue && status.inGracePeriod) {
      notifications.push({
        type: 'warning' as const,
        title: 'Payment Issue',
        message: `Your payment failed. You have ${status.gracePeriodDaysRemaining} days to update your payment method.`,
        action: {
          label: 'Update Payment',
          url: '/billing'
        },
        dismissible: false
      });
    }

    // Trial expiry notifications
    if (status.isTrialing && status.daysUntilExpiry <= 3) {
      notifications.push({
        type: 'info' as const,
        title: 'Trial Ending Soon',
        message: `Your trial ends in ${status.daysUntilExpiry} days. Subscribe to continue using premium features.`,
        action: {
          label: 'Choose Plan',
          url: '/pricing'
        },
        dismissible: true
      });
    }

    // Usage limit warnings
    try {
      const usage = await usageTracker.getCurrentUsage(userId);
      if (usage.percentage > 80 && usage.limit > 0) {
        notifications.push({
          type: 'warning' as const,
          title: 'Usage Limit Warning',
          message: `You've used ${usage.percentage.toFixed(0)}% of your monthly limit. Consider upgrading to avoid interruptions.`,
          action: {
            label: 'Upgrade Plan',
            url: '/pricing'
          },
          dismissible: true
        });
      }
    } catch (error) {
      this.logger.warn('Failed to check usage for notifications', undefined, { userId, error: (error as Error).message });
    }

    // Subscription expired notifications
    if (!status.isActive && !status.inGracePeriod && status.subscription) {
      notifications.push({
        type: 'error' as const,
        title: 'Subscription Expired',
        message: 'Your subscription has expired. Renew now to restore full access to all features.',
        action: {
          label: 'Renew Subscription',
          url: '/billing'
        },
        dismissible: false
      });
    }

    return notifications;
  }

  /**
   * Monitor subscription status and trigger alerts
   */
  async monitorSubscriptionHealth(userId: string): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const status = await this.getSubscriptionStatus(userId);
    const issues = [];
    const recommendations = [];

    // Check for payment issues
    if (status.isPastDue) {
      issues.push('Payment failure detected');
      recommendations.push('Update payment method immediately');
    }

    // Check for approaching trial expiry
    if (status.isTrialing && status.daysUntilExpiry <= 7) {
      issues.push(`Trial expires in ${status.daysUntilExpiry} days`);
      recommendations.push('Subscribe to a plan to continue service');
    }

    // Check usage patterns
    try {
      const usage = await usageTracker.getCurrentUsage(userId);
      if (usage.percentage > 90) {
        issues.push('Usage limit nearly exceeded');
        recommendations.push('Consider upgrading to a higher plan');
      }
    } catch (error) {
      this.logger.warn('Failed to check usage for monitoring', undefined, { userId });
    }

    // Check for degraded service
    if (status.degradationLevel !== 'none') {
      issues.push(`Service degraded: ${status.degradationLevel}`);
      recommendations.push('Resolve subscription issues to restore full functionality');
    }

    return {
      healthy: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Update grace period settings
   */
  updateGracePeriodSettings(settings: Partial<GracePeriodSettings>): void {
    this.gracePeriodSettings = {
      ...this.gracePeriodSettings,
      ...settings
    };
    
    this.logger.info('Grace period settings updated', { settings: this.gracePeriodSettings });
  }

  // Private helper methods

  private createNoSubscriptionStatus(): SubscriptionStatus {
    return {
      isActive: false,
      isPastDue: false,
      isTrialing: false,
      inGracePeriod: false,
      daysUntilExpiry: 0,
      gracePeriodDaysRemaining: 0,
      plan: null,
      subscription: null,
      degradationLevel: 'blocked',
      allowedFeatures: [],
      restrictions: ['Subscription required']
    };
  }

  private createErrorStatus(): SubscriptionStatus {
    return {
      isActive: false,
      isPastDue: false,
      isTrialing: false,
      inGracePeriod: false,
      daysUntilExpiry: 0,
      gracePeriodDaysRemaining: 0,
      plan: null,
      subscription: null,
      degradationLevel: 'limited',
      allowedFeatures: ['basic_analysis'], // Allow basic functionality on error
      restrictions: ['Unable to verify subscription status']
    };
  }

  private calculateGracePeriod(subscription: UserSubscription, now: Date): {
    inGracePeriod: boolean;
    daysRemaining: number;
  } {
    if (!this.gracePeriodSettings.enableGracefulDegradation) {
      return { inGracePeriod: false, daysRemaining: 0 };
    }

    let gracePeriodEnd: Date | null = null;

    // Payment failure grace period
    if (subscription.status === 'past_due') {
      gracePeriodEnd = new Date(
        subscription.currentPeriodEnd.getTime() + 
        (this.gracePeriodSettings.paymentFailureGraceDays * 24 * 60 * 60 * 1000)
      );
    }

    // Trial expiry grace period
    if (subscription.status === 'trialing' && subscription.trialEnd) {
      const trialGraceEnd = new Date(
        subscription.trialEnd.getTime() + 
        (this.gracePeriodSettings.trialExpiryGraceDays * 24 * 60 * 60 * 1000)
      );
      
      if (!gracePeriodEnd || trialGraceEnd > gracePeriodEnd) {
        gracePeriodEnd = trialGraceEnd;
      }
    }

    if (gracePeriodEnd && now <= gracePeriodEnd) {
      const daysRemaining = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      return { inGracePeriod: true, daysRemaining };
    }

    return { inGracePeriod: false, daysRemaining: 0 };
  }

  private calculateDaysUntilExpiry(subscription: UserSubscription, now: Date): number {
    if (subscription.trialEnd && subscription.status === 'trialing') {
      return Math.max(0, Math.ceil((subscription.trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    }

    if (subscription.currentPeriodEnd) {
      return Math.max(0, Math.ceil((subscription.currentPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    }

    return 0;
  }

  private determineDegradationLevel(
    subscription: UserSubscription,
    gracePeriodInfo: { inGracePeriod: boolean; daysRemaining: number },
    daysUntilExpiry: number,
    isActive: boolean
  ): 'none' | 'warning' | 'limited' | 'blocked' {
    if (!isActive && !gracePeriodInfo.inGracePeriod) {
      return 'blocked';
    }

    if (gracePeriodInfo.inGracePeriod) {
      return gracePeriodInfo.daysRemaining <= 2 ? 'limited' : 'warning';
    }

    if (subscription.status === 'trialing' && daysUntilExpiry <= 3) {
      return 'warning';
    }

    if (subscription.status === 'past_due') {
      return 'limited';
    }

    return 'none';
  }

  private getFeatureAccess(
    plan: SubscriptionPlan | null,
    degradationLevel: 'none' | 'warning' | 'limited' | 'blocked',
    inGracePeriod: boolean
  ): { allowedFeatures: string[]; restrictions: string[] } {
    if (degradationLevel === 'blocked') {
      return {
        allowedFeatures: [],
        restrictions: ['All features disabled - subscription required']
      };
    }

    if (degradationLevel === 'limited' || inGracePeriod) {
      return {
        allowedFeatures: ['basic_analysis', 'view_history'],
        restrictions: [
          'Batch processing disabled',
          'Scheduled scans disabled',
          'Advanced analytics disabled',
          'Limited to 50 analyses per month'
        ]
      };
    }

    if (!plan) {
      return {
        allowedFeatures: ['basic_analysis'],
        restrictions: ['Premium features require subscription']
      };
    }

    // Full access for active subscriptions
    const allFeatures = [
      'basic_analysis',
      'batch_processing',
      'scheduled_scans',
      'advanced_analytics',
      'view_history',
      'export_data',
      'api_access'
    ];

    // Filter based on plan features
    const planFeatures = plan.features.map(f => f.toLowerCase());
    const allowedFeatures = allFeatures.filter(feature => {
      if (feature === 'basic_analysis') return true; // Always allowed
      return planFeatures.some(pf => pf.includes(feature.replace('_', ' ')));
    });

    const restrictions = degradationLevel === 'warning' 
      ? ['Service may be interrupted soon - please resolve payment issues']
      : [];

    return { allowedFeatures, restrictions };
  }

  private isBasicFeature(feature: string): boolean {
    const basicFeatures = ['basic_analysis', 'view_history'];
    return basicFeatures.includes(feature);
  }
}

// Export singleton instance
export const subscriptionStatusMonitor = SubscriptionStatusMonitor.getInstance();

export default subscriptionStatusMonitor;