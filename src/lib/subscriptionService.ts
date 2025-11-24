/**
 * Subscription Service
 * Core service for managing subscriptions, billing, and Stripe integration
 */

import Stripe from 'stripe';
import { supabase } from './supabase';
import { getStripe, withStripeErrorHandling, StripeError } from './stripe';
import { config } from './config';
import {
  SubscriptionPlan,
  UserSubscription,
  StripeCustomer,
  CheckoutSessionOptions,
  CheckoutSessionResult,
  PortalSessionResult,
  SubscriptionUpdateOptions,
  SubscriptionCancelOptions,
  UserSubscriptionRow,
  StripeCustomerRow,
  convertUserSubscriptionFromDb,
  convertUserSubscriptionToDb,
  convertStripeCustomerFromDb,
} from '../types/subscription';

export class SubscriptionService {
  private stripe: Stripe | null = null;

  constructor() {
    // Don't initialize Stripe in browser environment
    // It will be initialized when needed in server-side operations
  }

  /**
   * Get Stripe instance (lazy initialization)
   */
  private getStripeInstance(): Stripe {
    if (typeof window !== 'undefined') {
      throw new Error('SubscriptionService server methods cannot be used in browser environment');
    }
    
    if (!this.stripe) {
      this.stripe = getStripe();
    }
    
    return this.stripe;
  }

  /**
   * Get available subscription plans
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
   * Get or create Stripe customer for user
   */
  async getOrCreateStripeCustomer(userId: string, userEmail: string, userName?: string): Promise<StripeCustomer> {
    // First check if customer already exists in our database
    const { data: existingCustomer, error: fetchError } = await supabase
      .from('stripe_customers')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw new Error(`Failed to fetch customer: ${fetchError.message}`);
    }

    if (existingCustomer) {
      return convertStripeCustomerFromDb(existingCustomer);
    }

    // Create new Stripe customer
    const stripeCustomer = await withStripeErrorHandling(
      () => this.getStripeInstance().customers.create({
        email: userEmail,
        name: userName,
        metadata: {
          userId: userId,
        },
      }),
      'create customer'
    );

    // Save customer to database
    const { data: savedCustomer, error: saveError } = await supabase
      .from('stripe_customers')
      .insert({
        user_id: userId,
        stripe_customer_id: stripeCustomer.id,
        email: userEmail,
        name: userName,
      })
      .select()
      .single();

    if (saveError) {
      throw new Error(`Failed to save customer: ${saveError.message}`);
    }

    return convertStripeCustomerFromDb(savedCustomer);
  }

  /**
   * Create Stripe checkout session
   */
  async createCheckoutSession(
    userId: string,
    priceId: string,
    options: CheckoutSessionOptions
  ): Promise<CheckoutSessionResult> {
    // Get user information
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .single();

    if (userError) {
      throw new Error(`Failed to fetch user: ${userError.message}`);
    }

    // Get or create Stripe customer
    const customer = await this.getOrCreateStripeCustomer(userId, user.email, user.name);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customer.stripeCustomerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
      billing_address_collection: options.collectBillingAddress ? 'required' : 'auto',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
      allow_promotion_codes: options.allowPromotionCodes || false,
      metadata: {
        userId: userId,
        priceId: priceId,
        ...options.metadata,
      },
    };

    // Add trial period if specified
    if (options.trialPeriodDays && options.trialPeriodDays > 0) {
      sessionParams.subscription_data = {
        trial_period_days: options.trialPeriodDays,
        metadata: {
          userId: userId,
        },
      };
    }

    // Add coupon if specified
    if (options.couponId) {
      sessionParams.discounts = [
        {
          coupon: options.couponId,
        },
      ];
    }

    const session = await withStripeErrorHandling(
      () => this.getStripeInstance().checkout.sessions.create(sessionParams),
      'create checkout session'
    );

    if (!session.url) {
      throw new Error('Checkout session URL not available');
    }

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  /**
   * Create Stripe Customer Portal session
   */
  async createPortalSession(userId: string, returnUrl: string): Promise<PortalSessionResult> {
    const customer = await this.getStripeCustomerByUserId(userId);
    if (!customer) {
      throw new Error('No Stripe customer found for user');
    }

    const session = await withStripeErrorHandling(
      () => this.getStripeInstance().billingPortal.sessions.create({
        customer: customer.stripeCustomerId,
        return_url: returnUrl,
      }),
      'create portal session'
    );

    return { url: session.url };
  }

  /**
   * Get user's current subscription
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
   * Get all user subscriptions (including inactive)
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
   * Update subscription (change plan, etc.)
   */
  async updateSubscription(
    subscriptionId: string,
    options: SubscriptionUpdateOptions
  ): Promise<Stripe.Subscription> {
    const updateParams: Stripe.SubscriptionUpdateParams = {};

    if (options.priceId) {
      // Get current subscription to update the price
      const subscription = await withStripeErrorHandling(
        () => this.getStripeInstance().subscriptions.retrieve(subscriptionId),
        'retrieve subscription for update'
      );

      updateParams.items = [
        {
          id: subscription.items.data[0].id,
          price: options.priceId,
        },
      ];
    }

    if (options.prorationBehavior) {
      updateParams.proration_behavior = options.prorationBehavior;
    }

    if (options.billingCycleAnchor) {
      updateParams.billing_cycle_anchor = options.billingCycleAnchor;
    }

    if (options.metadata) {
      updateParams.metadata = options.metadata;
    }

    return await withStripeErrorHandling(
      () => this.getStripeInstance().subscriptions.update(subscriptionId, updateParams),
      'update subscription'
    );
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    options?: SubscriptionCancelOptions
  ): Promise<Stripe.Subscription> {
    const { cancelAtPeriodEnd = true, invoiceNow = false, prorate = true } = options || {};

    if (cancelAtPeriodEnd) {
      return await withStripeErrorHandling(
        () => this.getStripeInstance().subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        }),
        'cancel subscription at period end'
      );
    } else {
      const cancelParams: Stripe.SubscriptionCancelParams = {
        invoice_now: invoiceNow,
        prorate: prorate,
      };

      return await withStripeErrorHandling(
        () => this.getStripeInstance().subscriptions.cancel(subscriptionId, cancelParams),
        'cancel subscription immediately'
      );
    }
  }

  /**
   * Reactivate a canceled subscription (if still within period)
   */
  async reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return await withStripeErrorHandling(
      () => this.getStripeInstance().subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      }),
      'reactivate subscription'
    );
  }

  /**
   * Get subscription by Stripe subscription ID
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

  /**
   * Save or update subscription in database
   */
  async saveSubscription(subscription: Partial<UserSubscription>): Promise<UserSubscription> {
    const subscriptionData = convertUserSubscriptionToDb(subscription);

    const { data: savedSubscription, error } = await supabase
      .from('user_subscriptions')
      .upsert(subscriptionData, {
        onConflict: 'stripe_subscription_id',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save subscription: ${error.message}`);
    }

    return convertUserSubscriptionFromDb(savedSubscription);
  }

  /**
   * Get Stripe customer by user ID
   */
  private async getStripeCustomerByUserId(userId: string): Promise<StripeCustomer | null> {
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
   * Sync subscription from Stripe
   */
  async syncSubscriptionFromStripe(stripeSubscriptionId: string): Promise<UserSubscription> {
    const stripeSubscription = await withStripeErrorHandling(
      () => this.getStripeInstance().subscriptions.retrieve(stripeSubscriptionId),
      'retrieve subscription from Stripe'
    );

    const userId = stripeSubscription.metadata.userId;
    if (!userId) {
      throw new Error('No userId found in subscription metadata');
    }

    const subscription: Partial<UserSubscription> = {
      userId: userId,
      stripeCustomerId: stripeSubscription.customer as string,
      stripeSubscriptionId: stripeSubscription.id,
      planId: stripeSubscription.items.data[0].price.id,
      status: stripeSubscription.status as UserSubscription['status'],
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : undefined,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : undefined,
      endedAt: stripeSubscription.ended_at ? new Date(stripeSubscription.ended_at * 1000) : undefined,
      updatedAt: new Date(),
    };

    return await this.saveSubscription(subscription);
  }

  /**
   * Check if user has active subscription
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    return subscription !== null && ['active', 'trialing'].includes(subscription.status);
  }

  /**
   * Get subscription plan by ID
   */
  async getSubscriptionPlan(planId: string): Promise<SubscriptionPlan | null> {
    const plans = await this.getSubscriptionPlans();
    return plans.find(plan => plan.id === planId || plan.stripePriceId === planId) || null;
  }

  /**
   * Validate subscription access for feature
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

  // =============================================================================
  // SUBSCRIPTION LIFECYCLE MANAGEMENT
  // =============================================================================

  /**
   * Upgrade subscription to a higher plan
   */
  async upgradeSubscription(
    userId: string,
    newPriceId: string,
    options?: {
      prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
      billingCycleAnchor?: 'now' | 'unchanged';
    }
  ): Promise<{
    subscription: Stripe.Subscription;
    prorationAmount?: number;
  }> {
    const currentSubscription = await this.getUserSubscription(userId);
    if (!currentSubscription) {
      throw new Error('No active subscription found for user');
    }

    const currentPlan = await this.getSubscriptionPlan(currentSubscription.planId);
    const newPlan = await this.getSubscriptionPlan(newPriceId);

    if (!currentPlan || !newPlan) {
      throw new Error('Invalid subscription plan');
    }

    // Validate that this is actually an upgrade
    if (newPlan.priority <= currentPlan.priority) {
      throw new Error('New plan must be a higher tier than current plan');
    }

    const updatedSubscription = await this.updateSubscription(
      currentSubscription.stripeSubscriptionId,
      {
        priceId: newPriceId,
        prorationBehavior: options?.prorationBehavior || 'create_prorations',
        billingCycleAnchor: options?.billingCycleAnchor || 'unchanged',
        metadata: {
          upgraded_from: currentSubscription.planId,
          upgraded_at: new Date().toISOString(),
        },
      }
    );

    // Calculate proration amount if available
    let prorationAmount: number | undefined;
    if (options.prorationBehavior === 'create_prorations') {
      const upcomingInvoice = await withStripeErrorHandling(
        () => this.getStripeInstance().invoices.retrieveUpcoming({
          customer: currentSubscription.stripeCustomerId,
        }),
        'retrieve upcoming invoice for proration'
      );
      prorationAmount = upcomingInvoice.amount_due;
    }

    // Sync subscription data
    await this.syncSubscriptionFromStripe(updatedSubscription.id);

    return {
      subscription: updatedSubscription,
      prorationAmount,
    };
  }

  /**
   * Downgrade subscription to a lower plan
   */
  async downgradeSubscription(
    userId: string,
    newPriceId: string,
    options?: {
      applyAtPeriodEnd?: boolean;
      prorationBehavior?: 'create_prorations' | 'none';
    }
  ): Promise<{
    subscription: Stripe.Subscription;
    effectiveDate: Date;
    creditAmount?: number;
  }> {
    const currentSubscription = await this.getUserSubscription(userId);
    if (!currentSubscription) {
      throw new Error('No active subscription found for user');
    }

    const currentPlan = await this.getSubscriptionPlan(currentSubscription.planId);
    const newPlan = await this.getSubscriptionPlan(newPriceId);

    if (!currentPlan || !newPlan) {
      throw new Error('Invalid subscription plan');
    }

    // Validate that this is actually a downgrade
    if (newPlan.priority >= currentPlan.priority) {
      throw new Error('New plan must be a lower tier than current plan');
    }

    const { applyAtPeriodEnd = true, prorationBehavior = 'create_prorations' } = options || {};

    let updatedSubscription: Stripe.Subscription;
    let effectiveDate: Date;
    let creditAmount: number | undefined;

    if (applyAtPeriodEnd) {
      // Schedule the downgrade for the end of the current period
      updatedSubscription = await withStripeErrorHandling(
        () => this.getStripeInstance().subscriptions.update(currentSubscription.stripeSubscriptionId, {
          items: [
            {
              id: currentSubscription.stripeSubscriptionId,
              price: newPriceId,
            },
          ],
          proration_behavior: 'none',
          billing_cycle_anchor: 'unchanged',
          metadata: {
            downgraded_from: currentSubscription.planId,
            downgrade_scheduled_at: new Date().toISOString(),
            downgrade_effective_at: currentSubscription.currentPeriodEnd.toISOString(),
          },
        }),
        'schedule subscription downgrade'
      );
      effectiveDate = currentSubscription.currentPeriodEnd;
    } else {
      // Apply downgrade immediately
      updatedSubscription = await this.updateSubscription(
        currentSubscription.stripeSubscriptionId,
        {
          priceId: newPriceId,
          prorationBehavior,
          billingCycleAnchor: 'now',
          metadata: {
            downgraded_from: currentSubscription.planId,
            downgraded_at: new Date().toISOString(),
          },
        }
      );
      effectiveDate = new Date();

      // Calculate credit amount if proration is enabled
      if (prorationBehavior === 'create_prorations') {
        const upcomingInvoice = await withStripeErrorHandling(
          () => this.getStripeInstance().invoices.retrieveUpcoming({
            customer: currentSubscription.stripeCustomerId,
          }),
          'retrieve upcoming invoice for credit calculation'
        );
        creditAmount = Math.abs(upcomingInvoice.amount_due); // Credit will be negative
      }
    }

    // Sync subscription data
    await this.syncSubscriptionFromStripe(updatedSubscription.id);

    return {
      subscription: updatedSubscription,
      effectiveDate,
      creditAmount,
    };
  }

  /**
   * Start trial for a subscription plan
   */
  async startTrial(
    userId: string,
    priceId: string,
    trialDays: number,
    options: {
      successUrl: string;
      cancelUrl: string;
      metadata?: Record<string, string>;
    }
  ): Promise<CheckoutSessionResult> {
    // Check if user has already used a trial
    const existingSubscriptions = await this.getUserSubscriptions(userId);
    const hasUsedTrial = existingSubscriptions.some(sub => sub.trialEnd !== undefined);

    if (hasUsedTrial) {
      throw new Error('User has already used a trial period');
    }

    return await this.createCheckoutSession(userId, priceId, {
      ...options,
      trialPeriodDays: trialDays,
      metadata: {
        trial_started_at: new Date().toISOString(),
        ...options.metadata,
      },
    });
  }

  /**
   * Convert trial to paid subscription
   */
  async convertTrialToPaid(userId: string): Promise<{
    subscription: Stripe.Subscription;
    success: boolean;
    message: string;
  }> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    if (subscription.status !== 'trialing') {
      return {
        subscription: await this.getStripeInstance().subscriptions.retrieve(subscription.stripeSubscriptionId),
        success: false,
        message: 'Subscription is not in trial period',
      };
    }

    // End trial immediately and start billing
    const updatedSubscription = await withStripeErrorHandling(
      () => this.getStripeInstance().subscriptions.update(subscription.stripeSubscriptionId, {
        trial_end: 'now',
        metadata: {
          trial_converted_at: new Date().toISOString(),
        },
      }),
      'convert trial to paid'
    );

    // Sync subscription data
    await this.syncSubscriptionFromStripe(updatedSubscription.id);

    return {
      subscription: updatedSubscription,
      success: true,
      message: 'Trial successfully converted to paid subscription',
    };
  }

  /**
   * Extend trial period
   */
  async extendTrial(
    userId: string,
    additionalDays: number
  ): Promise<{
    subscription: Stripe.Subscription;
    newTrialEnd: Date;
  }> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    if (subscription.status !== 'trialing' || !subscription.trialEnd) {
      throw new Error('Subscription is not in trial period');
    }

    const newTrialEnd = new Date(subscription.trialEnd.getTime() + (additionalDays * 24 * 60 * 60 * 1000));
    const newTrialEndTimestamp = Math.floor(newTrialEnd.getTime() / 1000);

    const updatedSubscription = await withStripeErrorHandling(
      () => this.getStripeInstance().subscriptions.update(subscription.stripeSubscriptionId, {
        trial_end: newTrialEndTimestamp,
        metadata: {
          trial_extended_at: new Date().toISOString(),
          trial_extension_days: additionalDays.toString(),
        },
      }),
      'extend trial period'
    );

    // Sync subscription data
    await this.syncSubscriptionFromStripe(updatedSubscription.id);

    return {
      subscription: updatedSubscription,
      newTrialEnd,
    };
  }

  /**
   * Apply promotional code to subscription
   */
  async applyPromotionalCode(
    userId: string,
    promotionCode: string
  ): Promise<{
    subscription: Stripe.Subscription;
    discount: Stripe.Discount;
    success: boolean;
    message: string;
  }> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    try {
      // Retrieve the promotion code from Stripe
      const promotionCodes = await withStripeErrorHandling(
        () => this.getStripeInstance().promotionCodes.list({
          code: promotionCode,
          active: true,
          limit: 1,
        }),
        'retrieve promotion code'
      );

      if (promotionCodes.data.length === 0) {
        return {
          subscription: await this.getStripeInstance().subscriptions.retrieve(subscription.stripeSubscriptionId),
          discount: {} as Stripe.Discount,
          success: false,
          message: 'Invalid or expired promotion code',
        };
      }

      const promoCode = promotionCodes.data[0];

      // Apply the promotion code to the subscription
      const updatedSubscription = await withStripeErrorHandling(
        () => this.getStripeInstance().subscriptions.update(subscription.stripeSubscriptionId, {
          promotion_code: promoCode.id,
          metadata: {
            promotion_applied_at: new Date().toISOString(),
            promotion_code: promotionCode,
          },
        }),
        'apply promotion code'
      );

      // Sync subscription data
      await this.syncSubscriptionFromStripe(updatedSubscription.id);

      return {
        subscription: updatedSubscription,
        discount: updatedSubscription.discount!,
        success: true,
        message: 'Promotion code applied successfully',
      };
    } catch (error) {
      if (error instanceof StripeError) {
        return {
          subscription: await this.getStripeInstance().subscriptions.retrieve(subscription.stripeSubscriptionId),
          discount: {} as Stripe.Discount,
          success: false,
          message: error.getUserMessage(),
        };
      }
      throw error;
    }
  }

  /**
   * Remove promotional code from subscription
   */
  async removePromotionalCode(userId: string): Promise<{
    subscription: Stripe.Subscription;
    success: boolean;
    message: string;
  }> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    const stripeSubscription = await withStripeErrorHandling(
      () => this.getStripeInstance().subscriptions.retrieve(subscription.stripeSubscriptionId),
      'retrieve subscription for discount removal'
    );

    if (!stripeSubscription.discount) {
      return {
        subscription: stripeSubscription,
        success: false,
        message: 'No active discount to remove',
      };
    }

    const updatedSubscription = await withStripeErrorHandling(
      () => this.getStripeInstance().subscriptions.deleteDiscount(subscription.stripeSubscriptionId),
      'remove promotion code'
    );

    // Sync subscription data
    await this.syncSubscriptionFromStripe(updatedSubscription.id);

    return {
      subscription: updatedSubscription,
      success: true,
      message: 'Promotion code removed successfully',
    };
  }

  /**
   * Get subscription usage and billing information
   */
  async getSubscriptionBillingInfo(userId: string): Promise<{
    subscription: UserSubscription;
    plan: SubscriptionPlan;
    usage: {
      current: number;
      limit: number;
      percentage: number;
      resetDate: Date;
      overage?: number;
      overageCost?: number;
    };
    billing: {
      nextBillingDate: Date;
      amount: number;
      currency: string;
      discount?: {
        amount: number;
        percentage?: number;
        description: string;
      };
    };
    trial?: {
      isActive: boolean;
      daysRemaining: number;
      endDate: Date;
    };
  }> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    const plan = await this.getSubscriptionPlan(subscription.planId);
    if (!plan) {
      throw new Error('Invalid subscription plan');
    }

    // Get current usage from usage tracker
    const { usageTracker } = await import('./usageTracker');
    const currentUsage = await usageTracker.getCurrentUsage(userId);

    // Get Stripe subscription for billing details
    const stripeSubscription = await withStripeErrorHandling(
      () => this.getStripeInstance().subscriptions.retrieve(subscription.stripeSubscriptionId),
      'retrieve subscription for billing info'
    );

    const billingInfo = {
      nextBillingDate: subscription.currentPeriodEnd,
      amount: plan.price,
      currency: plan.currency,
      discount: stripeSubscription.discount ? {
        amount: stripeSubscription.discount.coupon.amount_off || 0,
        percentage: stripeSubscription.discount.coupon.percent_off || undefined,
        description: stripeSubscription.discount.coupon.name || 'Discount applied',
      } : undefined,
    };

    const trialInfo = subscription.trialEnd ? {
      isActive: subscription.status === 'trialing',
      daysRemaining: Math.max(0, Math.ceil((subscription.trialEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000))),
      endDate: subscription.trialEnd,
    } : undefined;

    return {
      subscription,
      plan,
      usage: {
        current: currentUsage.current,
        limit: currentUsage.limit,
        percentage: currentUsage.percentage,
        resetDate: currentUsage.resetDate,
        overage: currentUsage.overage,
        overageCost: currentUsage.overageCost,
      },
      billing: billingInfo,
      trial: trialInfo,
    };
  }

  /**
   * Preview subscription change (upgrade/downgrade)
   */
  async previewSubscriptionChange(
    userId: string,
    newPriceId: string
  ): Promise<{
    currentPlan: SubscriptionPlan;
    newPlan: SubscriptionPlan;
    prorationAmount: number;
    effectiveDate: Date;
    nextBillingAmount: number;
    savings?: number;
    additionalCost?: number;
  }> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    const currentPlan = await this.getSubscriptionPlan(subscription.planId);
    const newPlan = await this.getSubscriptionPlan(newPriceId);

    if (!currentPlan || !newPlan) {
      throw new Error('Invalid subscription plan');
    }

    // Get proration preview from Stripe
    const upcomingInvoice = await withStripeErrorHandling(
      () => this.getStripeInstance().invoices.retrieveUpcoming({
        customer: subscription.stripeCustomerId,
        subscription: subscription.stripeSubscriptionId,
        subscription_items: [
          {
            id: subscription.stripeSubscriptionId,
            price: newPriceId,
          },
        ],
        subscription_proration_behavior: 'create_prorations',
      }),
      'preview subscription change'
    );

    const prorationAmount = upcomingInvoice.amount_due;
    const nextBillingAmount = newPlan.price;
    
    let savings: number | undefined;
    let additionalCost: number | undefined;

    if (newPlan.price < currentPlan.price) {
      savings = currentPlan.price - newPlan.price;
    } else if (newPlan.price > currentPlan.price) {
      additionalCost = newPlan.price - currentPlan.price;
    }

    return {
      currentPlan,
      newPlan,
      prorationAmount,
      effectiveDate: new Date(),
      nextBillingAmount,
      savings,
      additionalCost,
    };
  }
}

// Export singleton instance (server-side only)
let subscriptionServiceInstance: SubscriptionService | null = null;

export function getSubscriptionService(): SubscriptionService {
  if (typeof window !== 'undefined') {
    throw new Error('SubscriptionService can only be used in server-side environments. Use clientSubscriptionService for browser code.');
  }
  
  if (!subscriptionServiceInstance) {
    subscriptionServiceInstance = new SubscriptionService();
  }
  
  return subscriptionServiceInstance;
}

// For server-side code that expects the direct export
export const subscriptionService = typeof window === 'undefined' ? getSubscriptionService() : null;