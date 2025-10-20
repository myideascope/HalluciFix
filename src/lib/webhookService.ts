/**
 * Webhook Service
 * Manages webhook-related operations and provides utilities for webhook processing
 */

import { supabase } from './supabase';
import { config } from './config';

export interface WebhookEvent {
  id: string;
  stripeEventId: string;
  eventType: string;
  success: boolean;
  message: string;
  errorMessage?: string;
  processedAt: Date;
  eventData: any;
  createdAt: Date;
}

export interface SubscriptionEvent {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  eventType: 'trial_will_end' | 'payment_failed' | 'cancellation_scheduled' | 'subscription_updated';
  eventData: any;
  createdAt: Date;
}

export interface PaymentHistoryRecord {
  id: string;
  stripeInvoiceId: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  amount: number;
  currency: string;
  status: 'paid' | 'failed' | 'pending';
  invoiceUrl?: string;
  description?: string;
  failureReason?: string;
  periodStart?: Date;
  periodEnd?: Date;
  createdAt: Date;
}

export interface EmailNotification {
  id: string;
  userId: string;
  emailType: 'welcome' | 'cancellation' | 'cancellation_scheduled' | 'trial_ending' | 'payment_confirmation' | 'payment_failed';
  stripeSubscriptionId?: string;
  stripeInvoiceId?: string;
  sentAt: Date;
}

export class WebhookService {
  /**
   * Get webhook events for monitoring and debugging
   */
  async getWebhookEvents(options: {
    limit?: number;
    offset?: number;
    eventType?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{ events: WebhookEvent[]; total: number }> {
    const {
      limit = 50,
      offset = 0,
      eventType,
      success,
      startDate,
      endDate,
    } = options;

    let query = supabase
      .from('webhook_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    if (success !== undefined) {
      query = query.eq('success', success);
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch webhook events: ${error.message}`);
    }

    return {
      events: data?.map(this.convertWebhookEventFromDb) || [],
      total: count || 0,
    };
  }

  /**
   * Get subscription events for a user
   */
  async getSubscriptionEvents(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      eventType?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ events: SubscriptionEvent[]; total: number }> {
    const {
      limit = 50,
      offset = 0,
      eventType,
      startDate,
      endDate,
    } = options;

    let query = supabase
      .from('subscription_events')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch subscription events: ${error.message}`);
    }

    return {
      events: data?.map(this.convertSubscriptionEventFromDb) || [],
      total: count || 0,
    };
  }

  /**
   * Get payment history for a user
   */
  async getPaymentHistory(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: 'paid' | 'failed' | 'pending';
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ payments: PaymentHistoryRecord[]; total: number }> {
    const {
      limit = 50,
      offset = 0,
      status,
      startDate,
      endDate,
    } = options;

    // First get the user's Stripe customer ID
    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (customerError) {
      throw new Error(`Failed to fetch customer: ${customerError.message}`);
    }

    if (!customer) {
      return { payments: [], total: 0 };
    }

    let query = supabase
      .from('payment_history')
      .select('*', { count: 'exact' })
      .eq('stripe_customer_id', customer.stripe_customer_id)
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

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch payment history: ${error.message}`);
    }

    return {
      payments: data?.map(this.convertPaymentHistoryFromDb) || [],
      total: count || 0,
    };
  }

  /**
   * Get email notifications for a user
   */
  async getEmailNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      emailType?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ notifications: EmailNotification[]; total: number }> {
    const {
      limit = 50,
      offset = 0,
      emailType,
      startDate,
      endDate,
    } = options;

    let query = supabase
      .from('email_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (emailType) {
      query = query.eq('email_type', emailType);
    }

    if (startDate) {
      query = query.gte('sent_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('sent_at', endDate.toISOString());
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch email notifications: ${error.message}`);
    }

    return {
      notifications: data?.map(this.convertEmailNotificationFromDb) || [],
      total: count || 0,
    };
  }

  /**
   * Get webhook processing statistics
   */
  async getWebhookStats(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    successRate: number;
    eventTypeBreakdown: Array<{
      eventType: string;
      count: number;
      successCount: number;
      failureCount: number;
    }>;
  }> {
    const { startDate, endDate } = options;

    let query = supabase
      .from('webhook_events')
      .select('event_type, success');

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch webhook stats: ${error.message}`);
    }

    const totalEvents = data?.length || 0;
    const successfulEvents = data?.filter(event => event.success).length || 0;
    const failedEvents = totalEvents - successfulEvents;
    const successRate = totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0;

    // Calculate event type breakdown
    const eventTypeMap = new Map<string, { count: number; successCount: number; failureCount: number }>();

    data?.forEach(event => {
      const existing = eventTypeMap.get(event.event_type) || { count: 0, successCount: 0, failureCount: 0 };
      existing.count++;
      if (event.success) {
        existing.successCount++;
      } else {
        existing.failureCount++;
      }
      eventTypeMap.set(event.event_type, existing);
    });

    const eventTypeBreakdown = Array.from(eventTypeMap.entries()).map(([eventType, stats]) => ({
      eventType,
      ...stats,
    }));

    return {
      totalEvents,
      successfulEvents,
      failedEvents,
      successRate,
      eventTypeBreakdown,
    };
  }

  /**
   * Retry failed webhook processing (for admin use)
   */
  async retryFailedWebhook(eventId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    // This would typically trigger a re-processing of the webhook
    // For now, we'll just mark it as retried
    const { error } = await supabase
      .from('webhook_events')
      .update({
        message: 'Retry requested',
        processed_at: new Date(),
      })
      .eq('stripe_event_id', eventId);

    if (error) {
      return {
        success: false,
        message: `Failed to retry webhook: ${error.message}`,
      };
    }

    return {
      success: true,
      message: 'Webhook retry requested successfully',
    };
  }

  /**
   * Get webhook endpoint URL for Stripe configuration
   */
  getWebhookEndpointUrl(): string {
    const baseUrl = config.app.url;
    return `${baseUrl}/functions/v1/stripe-webhook`;
  }

  /**
   * Validate webhook configuration
   */
  async validateWebhookConfiguration(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if webhook secret is configured
    if (!config.payments.stripe?.webhookSecret) {
      errors.push('Stripe webhook secret is not configured');
    }

    // Check if Stripe is enabled
    if (!config.payments.stripe?.enabled) {
      errors.push('Stripe payments are not enabled');
    }

    // Check recent webhook processing
    try {
      const recentStats = await this.getWebhookStats({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      });

      if (recentStats.totalEvents === 0) {
        warnings.push('No webhook events received in the last 24 hours');
      } else if (recentStats.successRate < 95) {
        warnings.push(`Webhook success rate is ${recentStats.successRate.toFixed(1)}% (below 95%)`);
      }
    } catch (error) {
      warnings.push('Unable to check recent webhook statistics');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // =============================================================================
  // CONVERSION HELPERS
  // =============================================================================

  private convertWebhookEventFromDb(row: any): WebhookEvent {
    return {
      id: row.id,
      stripeEventId: row.stripe_event_id,
      eventType: row.event_type,
      success: row.success,
      message: row.message,
      errorMessage: row.error_message,
      processedAt: new Date(row.processed_at),
      eventData: row.event_data,
      createdAt: new Date(row.created_at),
    };
  }

  private convertSubscriptionEventFromDb(row: any): SubscriptionEvent {
    return {
      id: row.id,
      userId: row.user_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      eventType: row.event_type,
      eventData: row.event_data,
      createdAt: new Date(row.created_at),
    };
  }

  private convertPaymentHistoryFromDb(row: any): PaymentHistoryRecord {
    return {
      id: row.id,
      stripeInvoiceId: row.stripe_invoice_id,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      invoiceUrl: row.invoice_url,
      description: row.description,
      failureReason: row.failure_reason,
      periodStart: row.period_start ? new Date(row.period_start) : undefined,
      periodEnd: row.period_end ? new Date(row.period_end) : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private convertEmailNotificationFromDb(row: any): EmailNotification {
    return {
      id: row.id,
      userId: row.user_id,
      emailType: row.email_type,
      stripeSubscriptionId: row.stripe_subscription_id,
      stripeInvoiceId: row.stripe_invoice_id,
      sentAt: new Date(row.sent_at),
    };
  }
}

// Export singleton instance
export const webhookService = new WebhookService();

// Export types for external use
export type {
  WebhookEvent,
  SubscriptionEvent,
  PaymentHistoryRecord,
  EmailNotification,
};