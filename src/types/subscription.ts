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
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  stripeInvoiceId: string;
  userId: string;
  subscriptionId?: string;
  stripeSubscriptionId?: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  description: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
  dueDate?: Date;
  paidAt?: Date;
  periodStart: Date;
  periodEnd: Date;
  subtotal: number;
  tax?: number;
  total: number;
  attemptCount: number;
  nextPaymentAttempt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentHistory {
  id: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  userId: string;
  invoiceId?: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed' | 'canceled' | 'requires_action';
  paymentMethod: {
    type: 'card' | 'bank_account' | 'sepa_debit' | 'ideal' | 'sofort' | 'giropay' | 'eps' | 'p24' | 'bancontact';
    brand?: string;
    last4?: string;
    expiryMonth?: number;
    expiryYear?: number;
    country?: string;
  };
  description?: string;
  receiptUrl?: string;
  failureCode?: string;
  failureMessage?: string;
  refunded: boolean;
  refundedAmount?: number;
  disputeStatus?: 'warning_needs_response' | 'warning_under_review' | 'warning_closed' | 'needs_response' | 'under_review' | 'charge_refunded' | 'won' | 'lost';
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageHistoryEntry {
  date: Date;
  usage: number;
  limit: number;
  overage?: number;
  cost?: number;
}

export interface BillingNotification {
  id: string;
  userId: string;
  type: 'payment_succeeded' | 'payment_failed' | 'invoice_upcoming' | 'trial_ending' | 'subscription_canceled' | 'usage_limit_reached';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  actionUrl?: string;
  actionText?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  readAt?: Date;
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
  invoices: Invoice[];
  paymentHistory: PaymentHistory[];
  usageHistory: UsageHistoryEntry[];
  notifications: BillingNotification[];
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
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface InvoiceRow {
  id: string;
  stripe_invoice_id: string;
  user_id: string;
  subscription_id?: string;
  stripe_subscription_id?: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  invoice_number?: string;
  invoice_url?: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  due_date?: string;
  paid_at?: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  tax?: number;
  total: number;
  attempt_count: number;
  next_payment_attempt?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentHistoryRow {
  id: string;
  stripe_payment_intent_id?: string;
  stripe_charge_id?: string;
  user_id: string;
  invoice_id?: string;
  amount: number;
  currency: string;
  status: string;
  payment_method_type: string;
  payment_method_brand?: string;
  payment_method_last4?: string;
  payment_method_expiry_month?: number;
  payment_method_expiry_year?: number;
  payment_method_country?: string;
  description?: string;
  receipt_url?: string;
  failure_code?: string;
  failure_message?: string;
  refunded: boolean;
  refunded_amount?: number;
  dispute_status?: string;
  created_at: string;
  updated_at: string;
}

export interface BillingNotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  read: boolean;
  action_url?: string;
  action_text?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  read_at?: string;
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

export function convertInvoiceFromDb(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    stripeInvoiceId: row.stripe_invoice_id,
    userId: row.user_id,
    subscriptionId: row.subscription_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status as Invoice['status'],
    description: row.description,
    invoiceNumber: row.invoice_number,
    invoiceUrl: row.invoice_url,
    hostedInvoiceUrl: row.hosted_invoice_url,
    invoicePdf: row.invoice_pdf,
    dueDate: row.due_date ? new Date(row.due_date) : undefined,
    paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
    periodStart: new Date(row.period_start),
    periodEnd: new Date(row.period_end),
    subtotal: row.subtotal,
    tax: row.tax,
    total: row.total,
    attemptCount: row.attempt_count,
    nextPaymentAttempt: row.next_payment_attempt ? new Date(row.next_payment_attempt) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function convertPaymentHistoryFromDb(row: PaymentHistoryRow): PaymentHistory {
  return {
    id: row.id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeChargeId: row.stripe_charge_id,
    userId: row.user_id,
    invoiceId: row.invoice_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status as PaymentHistory['status'],
    paymentMethod: {
      type: row.payment_method_type as PaymentHistory['paymentMethod']['type'],
      brand: row.payment_method_brand,
      last4: row.payment_method_last4,
      expiryMonth: row.payment_method_expiry_month,
      expiryYear: row.payment_method_expiry_year,
      country: row.payment_method_country,
    },
    description: row.description,
    receiptUrl: row.receipt_url,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    refunded: row.refunded,
    refundedAmount: row.refunded_amount,
    disputeStatus: row.dispute_status as PaymentHistory['disputeStatus'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function convertBillingNotificationFromDb(row: BillingNotificationRow): BillingNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as BillingNotification['type'],
    title: row.title,
    message: row.message,
    severity: row.severity as BillingNotification['severity'],
    read: row.read,
    actionUrl: row.action_url,
    actionText: row.action_text,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
    readAt: row.read_at ? new Date(row.read_at) : undefined,
  };
}