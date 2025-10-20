/**
 * Billing Service
 * Service for managing invoices, payment history, and billing notifications
 */

import Stripe from 'stripe';
import { supabase } from './supabase';
import { getStripe, withStripeErrorHandling, formatCurrency } from './stripe';
import {
  Invoice,
  PaymentHistory,
  BillingNotification,
  UsageHistoryEntry,
  InvoiceRow,
  PaymentHistoryRow,
  BillingNotificationRow,
  convertInvoiceFromDb,
  convertPaymentHistoryFromDb,
  convertBillingNotificationFromDb,
} from '../types/subscription';

export class BillingService {
  private stripe: Stripe;

  constructor() {
    this.stripe = getStripe();
  }

  /**
   * Get user's invoices with pagination
   */
  async getUserInvoices(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: Invoice['status'];
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    invoices: Invoice[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit = 10, offset = 0, status, startDate, endDate } = options;

    let query = supabase
      .from('invoices')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data: invoices, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch invoices: ${error.message}`);
    }

    return {
      invoices: (invoices || []).map(convertInvoiceFromDb),
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    };
  }

  /**
   * Get user's payment history with pagination
   */
  async getUserPaymentHistory(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: PaymentHistory['status'];
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    payments: PaymentHistory[];
    total: number;
    hasMore: boolean;
  }> {
    const { limit = 10, offset = 0, status, startDate, endDate } = options;

    let query = supabase
      .from('payment_history')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data: payments, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch payment history: ${error.message}`);
    }

    return {
      payments: (payments || []).map(convertPaymentHistoryFromDb),
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    };
  }

  /**
   * Get usage history for trend visualization
   */
  async getUserUsageHistory(
    userId: string,
    options: {
      days?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<UsageHistoryEntry[]> {
    const { days = 30, startDate, endDate } = options;

    const start = startDate || new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    // Get daily usage aggregation from usage_records table
    const { data: usageData, error } = await supabase
      .from('usage_records')
      .select('timestamp, quantity, usage_type')
      .eq('user_id', userId)
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch usage history: ${error.message}`);
    }

    // Group usage by day and aggregate
    const dailyUsage = new Map<string, { usage: number; limit: number; cost?: number }>();
    
    // Get user's subscription to determine limits
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    // Default limits based on plan (this should come from subscription service)
    const planLimits: Record<string, number> = {
      'basic': 1000,
      'pro': 10000,
      'enterprise': -1, // unlimited
    };

    const userLimit = subscription ? planLimits[subscription.plan_id] || 1000 : 1000;

    (usageData || []).forEach(record => {
      const date = new Date(record.timestamp).toISOString().split('T')[0];
      const current = dailyUsage.get(date) || { usage: 0, limit: userLimit };
      current.usage += record.quantity;
      dailyUsage.set(date, current);
    });

    // Convert to array and fill missing days
    const result: UsageHistoryEntry[] = [];
    const currentDate = new Date(start);
    
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayData = dailyUsage.get(dateStr) || { usage: 0, limit: userLimit };
      
      result.push({
        date: new Date(currentDate),
        usage: dayData.usage,
        limit: dayData.limit,
        overage: dayData.limit > 0 && dayData.usage > dayData.limit ? dayData.usage - dayData.limit : undefined,
        cost: dayData.cost,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  /**
   * Get user's billing notifications
   */
  async getUserBillingNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      type?: BillingNotification['type'];
    } = {}
  ): Promise<{
    notifications: BillingNotification[];
    total: number;
    unreadCount: number;
  }> {
    const { limit = 20, offset = 0, unreadOnly = false, type } = options;

    let query = supabase
      .from('billing_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq('read', false);
    }

    if (type) {
      query = query.eq('type', type);
    }

    const { data: notifications, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch billing notifications: ${error.message}`);
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('billing_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    return {
      notifications: (notifications || []).map(convertBillingNotificationFromDb),
      total: count || 0,
      unreadCount: unreadCount || 0,
    };
  }

  /**
   * Mark billing notification as read
   */
  async markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('billing_notifications')
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to mark notification as read: ${error.message}`);
    }
  }

  /**
   * Mark all billing notifications as read
   */
  async markAllNotificationsAsRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from('billing_notifications')
      .update({
        read: true,
        read_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      throw new Error(`Failed to mark all notifications as read: ${error.message}`);
    }
  }

  /**
   * Create billing notification
   */
  async createBillingNotification(notification: Omit<BillingNotification, 'id' | 'createdAt' | 'readAt'>): Promise<BillingNotification> {
    const { data: savedNotification, error } = await supabase
      .from('billing_notifications')
      .insert({
        user_id: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        severity: notification.severity,
        read: notification.read,
        action_url: notification.actionUrl,
        action_text: notification.actionText,
        metadata: notification.metadata,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create billing notification: ${error.message}`);
    }

    return convertBillingNotificationFromDb(savedNotification);
  }

  /**
   * Sync invoice from Stripe
   */
  async syncInvoiceFromStripe(stripeInvoiceId: string): Promise<Invoice> {
    const stripeInvoice = await withStripeErrorHandling(
      () => this.stripe.invoices.retrieve(stripeInvoiceId),
      'retrieve invoice from Stripe'
    );

    // Get user ID from customer metadata or subscription
    let userId: string | undefined;
    
    if (stripeInvoice.subscription) {
      const subscription = await withStripeErrorHandling(
        () => this.stripe.subscriptions.retrieve(stripeInvoice.subscription as string),
        'retrieve subscription for invoice'
      );
      userId = subscription.metadata.userId;
    }

    if (!userId && stripeInvoice.customer) {
      const customer = await withStripeErrorHandling(
        () => this.stripe.customers.retrieve(stripeInvoice.customer as string),
        'retrieve customer for invoice'
      );
      if (typeof customer !== 'string' && customer.metadata) {
        userId = customer.metadata.userId;
      }
    }

    if (!userId) {
      throw new Error('Could not determine user ID for invoice');
    }

    const invoiceData: Partial<InvoiceRow> = {
      stripe_invoice_id: stripeInvoice.id,
      user_id: userId,
      subscription_id: stripeInvoice.subscription as string || undefined,
      stripe_subscription_id: stripeInvoice.subscription as string || undefined,
      amount: stripeInvoice.amount_due,
      currency: stripeInvoice.currency,
      status: stripeInvoice.status || 'draft',
      description: stripeInvoice.description || `Invoice for ${stripeInvoice.period_start ? new Date(stripeInvoice.period_start * 1000).toLocaleDateString() : 'subscription'}`,
      invoice_number: stripeInvoice.number,
      invoice_url: stripeInvoice.invoice_pdf,
      hosted_invoice_url: stripeInvoice.hosted_invoice_url,
      invoice_pdf: stripeInvoice.invoice_pdf,
      due_date: stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000).toISOString() : undefined,
      paid_at: stripeInvoice.status_transitions?.paid_at ? new Date(stripeInvoice.status_transitions.paid_at * 1000).toISOString() : undefined,
      period_start: new Date(stripeInvoice.period_start * 1000).toISOString(),
      period_end: new Date(stripeInvoice.period_end * 1000).toISOString(),
      subtotal: stripeInvoice.subtotal,
      tax: stripeInvoice.tax || undefined,
      total: stripeInvoice.total,
      attempt_count: stripeInvoice.attempt_count,
      next_payment_attempt: stripeInvoice.next_payment_attempt ? new Date(stripeInvoice.next_payment_attempt * 1000).toISOString() : undefined,
      updated_at: new Date().toISOString(),
    };

    const { data: savedInvoice, error } = await supabase
      .from('invoices')
      .upsert(invoiceData, {
        onConflict: 'stripe_invoice_id',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save invoice: ${error.message}`);
    }

    return convertInvoiceFromDb(savedInvoice);
  }

  /**
   * Sync payment from Stripe
   */
  async syncPaymentFromStripe(stripeChargeId: string): Promise<PaymentHistory> {
    const stripeCharge = await withStripeErrorHandling(
      () => this.stripe.charges.retrieve(stripeChargeId),
      'retrieve charge from Stripe'
    );

    // Get user ID from customer metadata
    let userId: string | undefined;
    
    if (stripeCharge.customer) {
      const customer = await withStripeErrorHandling(
        () => this.stripe.customers.retrieve(stripeCharge.customer as string),
        'retrieve customer for charge'
      );
      if (typeof customer !== 'string' && customer.metadata) {
        userId = customer.metadata.userId;
      }
    }

    if (!userId) {
      throw new Error('Could not determine user ID for payment');
    }

    // Get invoice ID if available
    let invoiceId: string | undefined;
    if (stripeCharge.invoice) {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('stripe_invoice_id', stripeCharge.invoice)
        .single();
      invoiceId = invoice?.id;
    }

    const paymentData: Partial<PaymentHistoryRow> = {
      stripe_charge_id: stripeCharge.id,
      stripe_payment_intent_id: stripeCharge.payment_intent as string || undefined,
      user_id: userId,
      invoice_id: invoiceId,
      amount: stripeCharge.amount,
      currency: stripeCharge.currency,
      status: stripeCharge.status === 'succeeded' ? 'succeeded' : stripeCharge.status === 'failed' ? 'failed' : 'pending',
      payment_method_type: stripeCharge.payment_method_details?.type || 'card',
      payment_method_brand: stripeCharge.payment_method_details?.card?.brand,
      payment_method_last4: stripeCharge.payment_method_details?.card?.last4,
      payment_method_expiry_month: stripeCharge.payment_method_details?.card?.exp_month,
      payment_method_expiry_year: stripeCharge.payment_method_details?.card?.exp_year,
      payment_method_country: stripeCharge.payment_method_details?.card?.country,
      description: stripeCharge.description,
      receipt_url: stripeCharge.receipt_url,
      failure_code: stripeCharge.failure_code,
      failure_message: stripeCharge.failure_message,
      refunded: stripeCharge.refunded,
      refunded_amount: stripeCharge.amount_refunded > 0 ? stripeCharge.amount_refunded : undefined,
      dispute_status: stripeCharge.dispute?.status,
      updated_at: new Date().toISOString(),
    };

    const { data: savedPayment, error } = await supabase
      .from('payment_history')
      .upsert(paymentData, {
        onConflict: 'stripe_charge_id',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save payment: ${error.message}`);
    }

    return convertPaymentHistoryFromDb(savedPayment);
  }

  /**
   * Get billing summary for dashboard
   */
  async getBillingSummary(userId: string): Promise<{
    totalSpent: number;
    currentMonthSpent: number;
    unpaidInvoices: number;
    failedPayments: number;
    nextBillingAmount?: number;
    nextBillingDate?: Date;
  }> {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    // Get total spent (all successful payments)
    const { data: totalPayments } = await supabase
      .from('payment_history')
      .select('amount')
      .eq('user_id', userId)
      .eq('status', 'succeeded');

    const totalSpent = (totalPayments || []).reduce((sum, payment) => sum + payment.amount, 0);

    // Get current month spending
    const { data: monthlyPayments } = await supabase
      .from('payment_history')
      .select('amount')
      .eq('user_id', userId)
      .eq('status', 'succeeded')
      .gte('created_at', currentMonth.toISOString());

    const currentMonthSpent = (monthlyPayments || []).reduce((sum, payment) => sum + payment.amount, 0);

    // Get unpaid invoices count
    const { count: unpaidInvoices } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['open', 'past_due']);

    // Get failed payments count (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { count: failedPayments } = await supabase
      .from('payment_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'failed')
      .gte('created_at', thirtyDaysAgo.toISOString());

    // Get next billing info from active subscription
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('current_period_end, plan_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    let nextBillingAmount: number | undefined;
    let nextBillingDate: Date | undefined;

    if (subscription) {
      nextBillingDate = new Date(subscription.current_period_end);
      
      // Get plan price (this should come from subscription service)
      const planPrices: Record<string, number> = {
        'basic': 2900, // $29.00 in cents
        'pro': 9900,   // $99.00 in cents
        'enterprise': 0, // Custom pricing
      };
      nextBillingAmount = planPrices[subscription.plan_id] || 0;
    }

    return {
      totalSpent,
      currentMonthSpent,
      unpaidInvoices: unpaidInvoices || 0,
      failedPayments: failedPayments || 0,
      nextBillingAmount,
      nextBillingDate,
    };
  }
}

// Export singleton instance
export const billingService = new BillingService();