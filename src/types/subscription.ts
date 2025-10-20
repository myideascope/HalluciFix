/**
 * Subscription Types
 * Type definitions for subscription management and billing
 */

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: 'month' | 'year';
  currency: string;
  features: string[];
  stripePriceId: string;
  analysisLimit: number;
  priority: number;
  popular?: boolean;
  trialDays?: number;
}

export interface UserSubscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planId: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'trialing' | 'incomplete' | 'incomplete_expired';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface StripeCustomer {
  id: string;
  userId: string;
  stripeCustomerId: string;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckoutSessionOptions {
  successUrl: string;
  cancelUrl: string;
  trialPeriodDays?: number;
  couponId?: string;
  allowPromotionCodes?: boolean;
  collectBillingAddress?: boolean;
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface SubscriptionUpdateOptions {
  priceId?: string;
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
  billingCycleAnchor?: 'now' | 'unchanged';
  metadata?: Record<string, string>;
}

export interface SubscriptionCancelOptions {
  cancelAtPeriodEnd?: boolean;
  invoiceNow?: boolean;
  prorate?: boolean;
}

export interface UsageRecord {
  id: string;
  userId: string;
  subscriptionId?: string;
  stripeSubscriptionId?: string;
  usageType: 'api_calls' | 'analysis_requests' | 'document_uploads' | 'batch_processing';
  quantity: number;
  timestamp: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface BillingInfo {
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: string;
    plan: SubscriptionPlan;
    cancelAtPeriodEnd: boolean;
    trialEnd?: string;
  };
  usage: {
    current: number;
    limit: number;
    resetDate: string;
    overage: number;
    overageCost: number;
  };
  paymentMethod: {
    brand: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
  } | null;
  invoices: Array<{
    id: string;
    date: string;
    amount: number;
    status: string;
    downloadUrl: string;
    description: string;
  }>;
}

// Database row types (snake_case to match Supabase)
export interface UserSubscriptionRow {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  trial_end?: string;
  cancel_at_period_end: boolean;
  canceled_at?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
}

export interface StripeCustomerRow {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  email: string;
  name?: string;
  created_at: string;
  updated_at: string;
}

export interface UsageRecordRow {
  id: string;
  user_id: string;
  subscription_id?: string;
  stripe_subscription_id?: string;
  usage_type: string;
  quantity: number;
  timestamp: string;
  metadata?: Record<string, any>;
  created_at: string;
}

// Conversion helpers
export function convertUserSubscriptionFromDb(row: UserSubscriptionRow): UserSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    planId: row.plan_id,
    status: row.status as UserSubscription['status'],
    currentPeriodStart: new Date(row.current_period_start),
    currentPeriodEnd: new Date(row.current_period_end),
    trialEnd: row.trial_end ? new Date(row.trial_end) : undefined,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    canceledAt: row.canceled_at ? new Date(row.canceled_at) : undefined,
    endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function convertUserSubscriptionToDb(subscription: Partial<UserSubscription>): Partial<UserSubscriptionRow> {
  return {
    id: subscription.id,
    user_id: subscription.userId,
    stripe_customer_id: subscription.stripeCustomerId,
    stripe_subscription_id: subscription.stripeSubscriptionId,
    plan_id: subscription.planId,
    status: subscription.status,
    current_period_start: subscription.currentPeriodStart?.toISOString(),
    current_period_end: subscription.currentPeriodEnd?.toISOString(),
    trial_end: subscription.trialEnd?.toISOString(),
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    canceled_at: subscription.canceledAt?.toISOString(),
    ended_at: subscription.endedAt?.toISOString(),
    created_at: subscription.createdAt?.toISOString(),
    updated_at: subscription.updatedAt?.toISOString(),
  };
}

export function convertStripeCustomerFromDb(row: StripeCustomerRow): StripeCustomer {
  return {
    id: row.id,
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    email: row.email,
    name: row.name,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function convertUsageRecordFromDb(row: UsageRecordRow): UsageRecord {
  return {
    id: row.id,
    userId: row.user_id,
    subscriptionId: row.subscription_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    usageType: row.usage_type as UsageRecord['usageType'],
    quantity: row.quantity,
    timestamp: new Date(row.timestamp),
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
  };
}