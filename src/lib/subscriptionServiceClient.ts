/**
 * Client-Side Subscription Service
 * Browser-safe version of subscription service that only includes methods that can run in the browser
 */

import { supabase } from './supabase';
import {
  SubscriptionPlan,
  UserSubscription,
  StripeCustomer,
  UserSubscriptionRow,
  StripeCustomerRow,
  convertUserSubscriptionFromDb,
  convertStripeCustomerFromDb,
} from '../types/subscription';
import { config } from './config';

export class ClientSubscriptionService {
  /**
   * Get available subscription plans (client-safe)
   */
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const plans: SubscriptionPlan[] = [
      {
        id: 'basic',
        name: 'Basic',
        description: 'Essential AI accuracy verification',
        price: 29,
        interval: 'month',
        currency: 'usd',
        features: [
          '1,000 analyses per month',
          'Basic hallucination detection',
          'Email support',
          'Standard accuracy reports',
          'API access',
        ],
        stripePriceId: config.payments.stripe?.priceIds?.basicMonthly || '',
        analysisLimit: 1000,
        priority: 1,
        trialDays: 14,
      },
      {
        id: 'pro',
        name: 'Pro',
        description: 'Advanced verification with team features',
        price: 99,
        interval: 'month',
        currency: 'usd',
        features: [
          '10,000 analyses per month',
          'Advanced seq-logprob analysis',
          'Team collaboration',
          'Priority support',
          'Custom integrations',
          'Advanced analytics',
          'Batch processing',
          'Scheduled monitoring',
        ],
        stripePriceId: config.payments.stripe?.priceIds?.proMonthly || '',
        analysisLimit: 10000,
        priority: 2,
        popular: true,
        trialDays: 14,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'Custom solutions for large organizations',
        price: 0, // Custom pricing
        interval: 'month',
        currency: 'usd',
        features: [
          'Unlimited analyses',
          'Custom model training',
          'Dedicated support',
          'SLA guarantees',
          'On-premise deployment',
          'Custom integrations',
          'Advanced security',
          'Custom reporting',
        ],
        stripePriceId: '', // Contact sales
        analysisLimit: -1, // Unlimited
        priority: 3,
      },
    ];

    return plans;
  }

  /**
   * Get user's current subscription (client-safe)
   */
  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch subscription: ${error.message}`);
    }

    return subscription ? convertUserSubscriptionFromDb(subscription) : null;
  }

  /**
   * Get all user subscriptions (including inactive) (client-safe)
   */
  async getUserSubscriptions(userId: string): Promise<UserSubscription[]> {
    const { data: subscriptions, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch subscriptions: ${error.message}`);
    }

    return subscriptions.map(convertUserSubscriptionFromDb);
  }

  /**
   * Check if user has active subscription (client-safe)
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    return subscription !== null && ['active', 'trialing'].includes(subscription.status);
  }

  /**
   * Get subscription plan by ID (client-safe)
   */
  async getSubscriptionPlan(planId: string): Promise<SubscriptionPlan | null> {
    const plans = await this.getSubscriptionPlans();
    return plans.find(plan => plan.id === planId || plan.stripePriceId === planId) || null;
  }

  /**
   * Validate subscription access for feature (client-safe)
   */
  async validateSubscriptionAccess(userId: string, requiredFeature?: string): Promise<{
    hasAccess: boolean;
    subscription: UserSubscription | null;
    plan: SubscriptionPlan | null;
    reason?: string;
  }> {
    const subscription = await this.getUserSubscription(userId);
    
    if (!subscription) {
      return {
        hasAccess: false,
        subscription: null,
        plan: null,
        reason: 'No active subscription',
      };
    }

    if (!['active', 'trialing'].includes(subscription.status)) {
      return {
        hasAccess: false,
        subscription,
        plan: null,
        reason: `Subscription status: ${subscription.status}`,
      };
    }

    const plan = await this.getSubscriptionPlan(subscription.planId);
    if (!plan) {
      return {
        hasAccess: false,
        subscription,
        plan: null,
        reason: 'Invalid subscription plan',
      };
    }

    // If no specific feature required, just check for active subscription
    if (!requiredFeature) {
      return {
        hasAccess: true,
        subscription,
        plan,
      };
    }

    // Check if plan includes the required feature
    const hasFeature = plan.features.some(feature => 
      feature.toLowerCase().includes(requiredFeature.toLowerCase())
    );

    return {
      hasAccess: hasFeature,
      subscription,
      plan,
      reason: hasFeature ? undefined : `Feature not included in ${plan.name} plan`,
    };
  }

  /**
   * Get Stripe customer by user ID (client-safe)
   */
  async getStripeCustomerByUserId(userId: string): Promise<StripeCustomer | null> {
    const { data: customer, error } = await supabase
      .from('stripe_customers')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch customer: ${error.message}`);
    }

    return customer ? convertStripeCustomerFromDb(customer) : null;
  }

  /**
   * Get subscription by Stripe subscription ID (client-safe)
   */
  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<UserSubscription | null> {
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch subscription: ${error.message}`);
    }

    return subscription ? convertUserSubscriptionFromDb(subscription) : null;
  }

  // =============================================================================
  // SERVER-SIDE ONLY METHODS (Throw errors in browser)
  // =============================================================================

  /**
   * Create checkout session - Server-side only
   */
  async createCheckoutSession(): Promise<never> {
    throw new Error('createCheckoutSession can only be called from server-side code. Use API endpoints instead.');
  }

  /**
   * Create portal session - Server-side only
   */
  async createPortalSession(): Promise<never> {
    throw new Error('createPortalSession can only be called from server-side code. Use API endpoints instead.');
  }

  /**
   * Update subscription - Server-side only
   */
  async updateSubscription(): Promise<never> {
    throw new Error('updateSubscription can only be called from server-side code. Use API endpoints instead.');
  }

  /**
   * Cancel subscription - Server-side only
   */
  async cancelSubscription(): Promise<never> {
    throw new Error('cancelSubscription can only be called from server-side code. Use API endpoints instead.');
  }
}

// Export singleton instance
export const clientSubscriptionService = new ClientSubscriptionService();

// For backward compatibility, export as subscriptionService for client-side code
export const subscriptionService = clientSubscriptionService;