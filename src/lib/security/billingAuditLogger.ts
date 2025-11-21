/**
 * Billing Audit Logger
 * Comprehensive audit logging for all billing operations and security events
 */

import { supabase } from '../supabase';

import { logger } from './logging';
// Audit log entry types
export type AuditActionType = 
  | 'subscription_created'
  | 'subscription_updated' 
  | 'subscription_canceled'
  | 'payment_processed'
  | 'payment_failed'
  | 'payment_method_added'
  | 'payment_method_removed'
  | 'invoice_generated'
  | 'refund_processed'
  | 'trial_started'
  | 'trial_ended'
  | 'trial_converted'
  | 'billing_address_updated'
  | 'tax_info_updated'
  | 'discount_applied'
  | 'discount_removed'
  | 'usage_recorded'
  | 'plan_changed'
  | 'customer_created'
  | 'customer_updated'
  | 'webhook_processed'
  | 'security_alert_created'
  | 'fraud_detected'
  | 'access_granted'
  | 'access_revoked';

export type ResourceType = 
  | 'subscription'
  | 'payment'
  | 'payment_method'
  | 'invoice'
  | 'customer'
  | 'usage_record'
  | 'billing_address'
  | 'tax_info'
  | 'discount'
  | 'trial'
  | 'security_alert'
  | 'user_access';

// Audit log entry
export interface AuditLogEntry {
  id?: string;
  userId: string;
  actionType: AuditActionType;
  resourceType: ResourceType;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  performedBy?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
}

// Audit query filters
export interface AuditQueryFilters {
  userId?: string;
  actionType?: AuditActionType;
  resourceType?: ResourceType;
  resourceId?: string;
  performedBy?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// Audit summary statistics
export interface AuditSummary {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  uniqueUsers: number;
  eventsByType: Record<AuditActionType, number>;
  eventsByResource: Record<ResourceType, number>;
  recentActivity: AuditLogEntry[];
}

export class BillingAuditLogger {
  /**
   * Log a billing operation
   */
  async logBillingOperation(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('billing_audit_log')
        .insert({
          user_id: entry.userId,
          action_type: entry.actionType,
          resource_type: entry.resourceType,
          resource_id: entry.resourceId,
          old_values: entry.oldValues,
          new_values: entry.newValues,
          ip_address: entry.ipAddress,
          user_agent: entry.userAgent,
          performed_by: entry.performedBy,
          success: entry.success,
          error_message: entry.errorMessage,
          metadata: entry.metadata || {},
        })
        .select('id')
        .single();

      if (error) {
        logger.error("Failed to log billing operation:", error instanceof Error ? error : new Error(String(error)));
        return null;
      }

      return data?.id || null;

    } catch (error) {
      logger.error("Audit logging error:", error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Log subscription creation
   */
  async logSubscriptionCreated(
    userId: string,
    subscriptionData: Record<string, any>,
    context: {
      ipAddress?: string;
      userAgent?: string;
      performedBy?: string;
    } = {}
  ): Promise<void> {
    await this.logBillingOperation({
      userId,
      actionType: 'subscription_created',
      resourceType: 'subscription',
      resourceId: subscriptionData.stripe_subscription_id,
      newValues: subscriptionData,
      success: true,
      ...context,
      metadata: {
        plan_id: subscriptionData.plan_id,
        trial_end: subscriptionData.trial_end,
        ...context,
      },
    });
  }

  /**
   * Log subscription update
   */
  async logSubscriptionUpdated(
    userId: string,
    subscriptionId: string,
    oldValues: Record<string, any>,
    newValues: Record<string, any>,
    context: {
      ipAddress?: string;
      userAgent?: string;
      performedBy?: string;
    } = {}
  ): Promise<void> {
    await this.logBillingOperation({
      userId,
      actionType: 'subscription_updated',
      resourceType: 'subscription',
      resourceId: subscriptionId,
      oldValues,
      newValues,
      success: true,
      ...context,
      metadata: {
        changes: this.calculateChanges(oldValues, newValues),
        ...context,
      },
    });
  }

  /**
   * Log subscription cancellation
   */
  async logSubscriptionCanceled(
    userId: string,
    subscriptionId: string,
    reason?: string,
    context: {
      ipAddress?: string;
      userAgent?: string;
      performedBy?: string;
    } = {}
  ): Promise<void> {
    await this.logBillingOperation({
      userId,
      actionType: 'subscription_canceled',
      resourceType: 'subscription',
      resourceId: subscriptionId,
      success: true,
      ...context,
      metadata: {
        cancellation_reason: reason,
        canceled_at: new Date().toISOString(),
        ...context,
      },
    });
  }

  /**
   * Log payment processing
   */
  async logPaymentProcessed(
    userId: string,
    paymentData: {
      paymentIntentId?: string;
      invoiceId?: string;
      amount: number;
      currency: string;
      status: string;
    },
    success: boolean,
    errorMessage?: string,
    context: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<void> {
    await this.logBillingOperation({
      userId,
      actionType: success ? 'payment_processed' : 'payment_failed',
      resourceType: 'payment',
      resourceId: paymentData.paymentIntentId || paymentData.invoiceId,
      newValues: paymentData,
      success,
      errorMessage,
      ...context,
      metadata: {
        amount: paymentData.amount,
        currency: paymentData.currency,
        payment_status: paymentData.status,
        ...context,
      },
    });
  }

  /**
   * Log payment method changes
   */
  async logPaymentMethodChange(
    userId: string,
    action: 'added' | 'removed' | 'updated',
    paymentMethodData: Record<string, any>,
    context: {
      ipAddress?: string;
      userAgent?: string;
      performedBy?: string;
    } = {}
  ): Promise<void> {
    const actionType = action === 'added' ? 'payment_method_added' : 
                     action === 'removed' ? 'payment_method_removed' : 
                     'payment_method_added'; // Default for updated

    await this.logBillingOperation({
      userId,
      actionType,
      resourceType: 'payment_method',
      resourceId: paymentMethodData.stripe_payment_method_id,
      newValues: paymentMethodData,
      success: true,
      ...context,
      metadata: {
        payment_method_type: paymentMethodData.type,
        last4: paymentMethodData.last4,
        brand: paymentMethodData.brand,
        action,
        ...context,
      },
    });
  }

  /**
   * Log trial events
   */
  async logTrialEvent(
    userId: string,
    action: 'started' | 'ended' | 'converted',
    trialData: Record<string, any>,
    context: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
    } = {}
  ): Promise<void> {
    const actionType = action === 'started' ? 'trial_started' :
                      action === 'ended' ? 'trial_ended' :
                      'trial_converted';

    await this.logBillingOperation({
      userId,
      actionType,
      resourceType: 'trial',
      resourceId: trialData.subscription_id,
      newValues: trialData,
      success: true,
      ...context,
      metadata: {
        trial_action: action,
        trial_duration: trialData.trial_duration,
        conversion_rate: trialData.conversion_rate,
        ...context,
      },
    });
  }

  /**
   * Log security events
   */
  async logSecurityEvent(
    userId: string,
    eventType: 'fraud_detected' | 'security_alert_created' | 'access_granted' | 'access_revoked',
    eventData: Record<string, any>,
    context: {
      ipAddress?: string;
      userAgent?: string;
      alertId?: string;
    } = {}
  ): Promise<void> {
    await this.logBillingOperation({
      userId,
      actionType: eventType,
      resourceType: 'security_alert',
      resourceId: context.alertId,
      newValues: eventData,
      success: true,
      ...context,
      metadata: {
        security_event_type: eventType,
        risk_level: eventData.risk_level,
        threat_indicators: eventData.threat_indicators,
        ...context,
      },
    });
  }

  /**
   * Log webhook processing
   */
  async logWebhookProcessed(
    webhookEventId: string,
    eventType: string,
    success: boolean,
    processingData: Record<string, any>,
    errorMessage?: string
  ): Promise<void> {
    // Extract user ID from processing data if available
    const userId = processingData.user_id || processingData.userId;

    await this.logBillingOperation({
      userId: userId || 'system',
      actionType: 'webhook_processed',
      resourceType: 'subscription', // Default, could be more specific
      resourceId: webhookEventId,
      newValues: processingData,
      success,
      errorMessage,
      metadata: {
        webhook_event_type: eventType,
        webhook_event_id: webhookEventId,
        processing_time: processingData.processing_time,
        retry_count: processingData.retry_count,
      },
    });
  }

  /**
   * Query audit logs with filters
   */
  async queryAuditLogs(filters: AuditQueryFilters = {}): Promise<AuditLogEntry[]> {
    try {
      let query = supabase
        .from('billing_audit_log')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.actionType) {
        query = query.eq('action_type', filters.actionType);
      }

      if (filters.resourceType) {
        query = query.eq('resource_type', filters.resourceType);
      }

      if (filters.resourceId) {
        query = query.eq('resource_id', filters.resourceId);
      }

      if (filters.performedBy) {
        query = query.eq('performed_by', filters.performedBy);
      }

      if (filters.success !== undefined) {
        query = query.eq('success', filters.success);
      }

      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }

      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        logger.error("Failed to query audit logs:", error instanceof Error ? error : new Error(String(error)));
        return [];
      }

      return (data || []).map(this.convertFromDb);

    } catch (error) {
      logger.error("Audit log query error:", error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Get audit summary statistics
   */
  async getAuditSummary(
    timeframe: 'day' | 'week' | 'month' = 'week',
    userId?: string
  ): Promise<AuditSummary> {
    const days = timeframe === 'day' ? 1 : timeframe === 'week' ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      // Build base query
      let baseQuery = supabase
        .from('billing_audit_log')
        .select('*')
        .gte('created_at', since.toISOString());

      if (userId) {
        baseQuery = baseQuery.eq('user_id', userId);
      }

      const { data: events, error } = await baseQuery;

      if (error) {
        logger.error("Failed to get audit summary:", error instanceof Error ? error : new Error(String(error)));
        return this.getEmptyAuditSummary();
      }

      const allEvents = events || [];

      // Calculate statistics
      const totalEvents = allEvents.length;
      const successfulEvents = allEvents.filter(e => e.success).length;
      const failedEvents = totalEvents - successfulEvents;
      const uniqueUsers = new Set(allEvents.map(e => e.user_id)).size;

      // Group by action type
      const eventsByType = allEvents.reduce((acc, event) => {
        acc[event.action_type as AuditActionType] = (acc[event.action_type as AuditActionType] || 0) + 1;
        return acc;
      }, {} as Record<AuditActionType, number>);

      // Group by resource type
      const eventsByResource = allEvents.reduce((acc, event) => {
        acc[event.resource_type as ResourceType] = (acc[event.resource_type as ResourceType] || 0) + 1;
        return acc;
      }, {} as Record<ResourceType, number>);

      // Get recent activity (last 10 events)
      const recentActivity = allEvents
        .slice(0, 10)
        .map(this.convertFromDb);

      return {
        totalEvents,
        successfulEvents,
        failedEvents,
        uniqueUsers,
        eventsByType,
        eventsByResource,
        recentActivity,
      };

    } catch (error) {
      logger.error("Audit summary error:", error instanceof Error ? error : new Error(String(error)));
      return this.getEmptyAuditSummary();
    }
  }

  /**
   * Get user's audit trail
   */
  async getUserAuditTrail(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{
    events: AuditLogEntry[];
    totalCount: number;
    hasMore: boolean;
  }> {
    try {
      // Get total count
      const { count } = await supabase
        .from('billing_audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Get events
      const events = await this.queryAuditLogs({
        userId,
        limit,
        offset,
      });

      return {
        events,
        totalCount: count || 0,
        hasMore: (count || 0) > offset + limit,
      };

    } catch (error) {
      logger.error("Failed to get user audit trail:", error instanceof Error ? error : new Error(String(error)));
      return {
        events: [],
        totalCount: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Export audit logs for compliance
   */
  async exportAuditLogs(
    filters: AuditQueryFilters,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const events = await this.queryAuditLogs(filters);

    if (format === 'csv') {
      return this.convertToCSV(events);
    }

    return JSON.stringify(events, null, 2);
  }

  /**
   * Calculate changes between old and new values
   */
  private calculateChanges(
    oldValues: Record<string, any>,
    newValues: Record<string, any>
  ): Record<string, { from: any; to: any }> {
    const changes: Record<string, { from: any; to: any }> = {};

    // Check for changed values
    Object.keys(newValues).forEach(key => {
      if (oldValues[key] !== newValues[key]) {
        changes[key] = {
          from: oldValues[key],
          to: newValues[key],
        };
      }
    });

    // Check for removed values
    Object.keys(oldValues).forEach(key => {
      if (!(key in newValues)) {
        changes[key] = {
          from: oldValues[key],
          to: null,
        };
      }
    });

    return changes;
  }

  /**
   * Convert database row to AuditLogEntry
   */
  private convertFromDb(row: any): AuditLogEntry {
    return {
      id: row.id,
      userId: row.user_id,
      actionType: row.action_type,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      oldValues: row.old_values,
      newValues: row.new_values,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      performedBy: row.performed_by,
      success: row.success,
      errorMessage: row.error_message,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Get empty audit summary
   */
  private getEmptyAuditSummary(): AuditSummary {
    return {
      totalEvents: 0,
      successfulEvents: 0,
      failedEvents: 0,
      uniqueUsers: 0,
      eventsByType: {} as Record<AuditActionType, number>,
      eventsByResource: {} as Record<ResourceType, number>,
      recentActivity: [],
    };
  }

  /**
   * Convert events to CSV format
   */
  private convertToCSV(events: AuditLogEntry[]): string {
    if (events.length === 0) {
      return 'No events found';
    }

    const headers = [
      'ID',
      'User ID',
      'Action Type',
      'Resource Type',
      'Resource ID',
      'Success',
      'IP Address',
      'User Agent',
      'Performed By',
      'Error Message',
      'Created At',
    ];

    const rows = events.map(event => [
      event.id || '',
      event.userId,
      event.actionType,
      event.resourceType,
      event.resourceId || '',
      event.success.toString(),
      event.ipAddress || '',
      event.userAgent || '',
      event.performedBy || '',
      event.errorMessage || '',
      event.createdAt?.toISOString() || '',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    return csvContent;
  }

  /**
   * Clean up old audit logs (for data retention compliance)
   */
  async cleanupOldLogs(retentionDays: number = 2555): Promise<{ deletedCount: number }> { // ~7 years default
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const { count, error } = await supabase
        .from('billing_audit_log')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        logger.error("Failed to cleanup old audit logs:", error instanceof Error ? error : new Error(String(error)));
        return { deletedCount: 0 };
      }

      return { deletedCount: count || 0 };

    } catch (error) {
      logger.error("Audit log cleanup error:", error instanceof Error ? error : new Error(String(error)));
      return { deletedCount: 0 };
    }
  }
}

// Export singleton instance
export const billingAuditLogger = new BillingAuditLogger();