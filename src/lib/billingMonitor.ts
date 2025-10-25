/**
 * Billing Monitor Service
 * Monitors billing system health, payment failures, and subscription issues
 */

import { supabase } from './supabase';
import { getSubscriptionService } from './subscriptionService';
import { getUsageTracker } from './usageTracker';
import { logger } from './logging';
import { performanceMonitor } from './performanceMonitor';
import { monitoringService } from './monitoring';
import { notificationService } from './notificationService';

export interface BillingAlert {
  id: string;
  type: 'payment_failure' | 'subscription_expiry' | 'usage_overage' | 'billing_error' | 'fraud_detection';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  subscriptionId?: string;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface BillingMetrics {
  totalRevenue: number;
  monthlyRecurringRevenue: number;
  activeSubscriptions: number;
  churnRate: number;
  averageRevenuePerUser: number;
  paymentFailureRate: number;
  usageOverageRate: number;
  trialConversionRate: number;
}

export interface BillingHealthStatus {
  overall: 'healthy' | 'warning' | 'critical';
  stripeConnectivity: 'connected' | 'degraded' | 'disconnected';
  webhookProcessing: 'normal' | 'delayed' | 'failing';
  paymentProcessing: 'normal' | 'degraded' | 'failing';
  subscriptionSync: 'synced' | 'delayed' | 'out_of_sync';
  lastHealthCheck: Date;
  issues: string[];
}

class BillingMonitor {
  private billingLogger = logger.child({ component: 'BillingMonitor' });
  private alertThresholds = {
    paymentFailureRate: 0.05, // 5%
    usageOverageRate: 0.15, // 15%
    webhookDelayMinutes: 5,
    subscriptionSyncDelayMinutes: 10
  };

  /**
   * Start billing monitoring
   */
  async startMonitoring(): Promise<void> {
    this.billingLogger.info('Starting billing monitoring');

    // Set up periodic health checks
    setInterval(() => this.performHealthCheck(), 5 * 60 * 1000); // Every 5 minutes
    setInterval(() => this.checkPaymentFailures(), 15 * 60 * 1000); // Every 15 minutes
    setInterval(() => this.checkUsageOverages(), 30 * 60 * 1000); // Every 30 minutes
    setInterval(() => this.checkSubscriptionExpirations(), 60 * 60 * 1000); // Every hour
    setInterval(() => this.generateBillingMetrics(), 24 * 60 * 60 * 1000); // Daily

    // Perform initial health check
    await this.performHealthCheck();
    
    this.billingLogger.info('Billing monitoring started successfully');
  }

  /**
   * Perform comprehensive billing system health check
   */
  async performHealthCheck(): Promise<BillingHealthStatus> {
    const startTime = Date.now();
    const performanceId = performanceMonitor.startOperation('billing_health_check');

    try {
      const healthStatus: BillingHealthStatus = {
        overall: 'healthy',
        stripeConnectivity: 'connected',
        webhookProcessing: 'normal',
        paymentProcessing: 'normal',
        subscriptionSync: 'synced',
        lastHealthCheck: new Date(),
        issues: []
      };

      // Check Stripe connectivity
      try {
        const plans = await getSubscriptionService().getSubscriptionPlans();
        if (plans.length === 0) {
          healthStatus.stripeConnectivity = 'degraded';
          healthStatus.issues.push('No subscription plans available');
        }
      } catch (error) {
        healthStatus.stripeConnectivity = 'disconnected';
        healthStatus.issues.push(`Stripe connectivity failed: ${(error as Error).message}`);
      }

      // Check webhook processing
      const webhookHealth = await this.checkWebhookHealth();
      healthStatus.webhookProcessing = webhookHealth.status;
      if (webhookHealth.issues.length > 0) {
        healthStatus.issues.push(...webhookHealth.issues);
      }

      // Check payment processing
      const paymentHealth = await this.checkPaymentProcessingHealth();
      healthStatus.paymentProcessing = paymentHealth.status;
      if (paymentHealth.issues.length > 0) {
        healthStatus.issues.push(...paymentHealth.issues);
      }

      // Check subscription sync
      const syncHealth = await this.checkSubscriptionSyncHealth();
      healthStatus.subscriptionSync = syncHealth.status;
      if (syncHealth.issues.length > 0) {
        healthStatus.issues.push(...syncHealth.issues);
      }

      // Determine overall health
      if (healthStatus.stripeConnectivity === 'disconnected' || 
          healthStatus.paymentProcessing === 'failing') {
        healthStatus.overall = 'critical';
      } else if (healthStatus.issues.length > 0) {
        healthStatus.overall = 'warning';
      }

      // Record metrics
      performanceMonitor.recordBusinessMetric('billing_health_check_completed', 1, 'count', {
        overall_status: healthStatus.overall,
        stripe_connectivity: healthStatus.stripeConnectivity,
        issues_count: healthStatus.issues.length.toString()
      });

      // Send alerts if needed
      if (healthStatus.overall !== 'healthy') {
        await this.createAlert({
          type: 'billing_error',
          severity: healthStatus.overall === 'critical' ? 'critical' : 'medium',
          message: `Billing system health check failed: ${healthStatus.overall}`,
          details: {
            healthStatus,
            issueCount: healthStatus.issues.length
          }
        });
      }

      performanceMonitor.endOperation(performanceId, {
        status: healthStatus.overall,
        issues_count: healthStatus.issues.length.toString()
      });

      return healthStatus;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      this.billingLogger.error('Billing health check failed', error as Error);
      throw error;
    }
  }

  /**
   * Check webhook processing health
   */
  private async checkWebhookHealth(): Promise<{ status: 'normal' | 'delayed' | 'failing'; issues: string[] }> {
    try {
      // Check for recent webhook processing delays
      const { data: recentWebhooks, error } = await supabase
        .from('webhook_events')
        .select('id, event_type, processed_at, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // Last 30 minutes
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        return { status: 'failing', issues: [`Webhook query failed: ${error.message}`] };
      }

      const issues: string[] = [];
      let delayedCount = 0;
      let failedCount = 0;

      recentWebhooks?.forEach(webhook => {
        if (!webhook.processed_at) {
          failedCount++;
        } else {
          const processingDelay = new Date(webhook.processed_at).getTime() - new Date(webhook.created_at).getTime();
          if (processingDelay > this.alertThresholds.webhookDelayMinutes * 60 * 1000) {
            delayedCount++;
          }
        }
      });

      if (failedCount > 0) {
        issues.push(`${failedCount} webhooks failed to process`);
      }

      if (delayedCount > 0) {
        issues.push(`${delayedCount} webhooks processed with delays`);
      }

      const status = failedCount > 5 ? 'failing' : delayedCount > 10 ? 'delayed' : 'normal';
      return { status, issues };

    } catch (error) {
      return { status: 'failing', issues: [`Webhook health check failed: ${(error as Error).message}`] };
    }
  }

  /**
   * Check payment processing health
   */
  private async checkPaymentProcessingHealth(): Promise<{ status: 'normal' | 'degraded' | 'failing'; issues: string[] }> {
    try {
      // Check recent payment failure rates
      const { data: recentPayments, error } = await supabase
        .from('payment_history')
        .select('id, status, created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('created_at', { ascending: false });

      if (error) {
        return { status: 'failing', issues: [`Payment query failed: ${error.message}`] };
      }

      const issues: string[] = [];
      const totalPayments = recentPayments?.length || 0;
      const failedPayments = recentPayments?.filter(p => p.status === 'failed').length || 0;
      
      const failureRate = totalPayments > 0 ? failedPayments / totalPayments : 0;

      if (failureRate > this.alertThresholds.paymentFailureRate) {
        issues.push(`High payment failure rate: ${(failureRate * 100).toFixed(1)}%`);
      }

      const status = failureRate > 0.15 ? 'failing' : failureRate > 0.05 ? 'degraded' : 'normal';
      return { status, issues };

    } catch (error) {
      return { status: 'failing', issues: [`Payment health check failed: ${(error as Error).message}`] };
    }
  }

  /**
   * Check subscription synchronization health
   */
  private async checkSubscriptionSyncHealth(): Promise<{ status: 'synced' | 'delayed' | 'out_of_sync'; issues: string[] }> {
    try {
      // Check for subscriptions that haven't been synced recently
      const { data: staleSubscriptions, error } = await supabase
        .from('user_subscriptions')
        .select('id, stripe_subscription_id, updated_at')
        .lt('updated_at', new Date(Date.now() - this.alertThresholds.subscriptionSyncDelayMinutes * 60 * 1000).toISOString())
        .eq('status', 'active');

      if (error) {
        return { status: 'out_of_sync', issues: [`Subscription sync query failed: ${error.message}`] };
      }

      const issues: string[] = [];
      const staleCount = staleSubscriptions?.length || 0;

      if (staleCount > 0) {
        issues.push(`${staleCount} subscriptions haven't been synced recently`);
      }

      const status = staleCount > 10 ? 'out_of_sync' : staleCount > 0 ? 'delayed' : 'synced';
      return { status, issues };

    } catch (error) {
      return { status: 'out_of_sync', issues: [`Subscription sync health check failed: ${(error as Error).message}`] };
    }
  }

  /**
   * Check for payment failures and create alerts
   */
  async checkPaymentFailures(): Promise<void> {
    try {
      // Get recent payment failures
      const { data: failedPayments, error } = await supabase
        .from('payment_history')
        .select('*, user_subscriptions!inner(user_id)')
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
        .is('alert_sent', null); // Haven't sent alert yet

      if (error) {
        this.billingLogger.error('Failed to query payment failures', error);
        return;
      }

      for (const payment of failedPayments || []) {
        await this.createAlert({
          type: 'payment_failure',
          severity: 'high',
          userId: payment.user_subscriptions.user_id,
          message: `Payment failed for user ${payment.user_subscriptions.user_id}`,
          details: {
            paymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            failureReason: payment.failure_message,
            paymentMethod: payment.payment_method
          }
        });

        // Mark as alerted
        await supabase
          .from('payment_history')
          .update({ alert_sent: new Date().toISOString() })
          .eq('id', payment.id);
      }

      if (failedPayments && failedPayments.length > 0) {
        this.billingLogger.warn(`Processed ${failedPayments.length} payment failure alerts`);
      }

    } catch (error) {
      this.billingLogger.error('Error checking payment failures', error as Error);
    }
  }

  /**
   * Check for usage overages and create alerts
   */
  async checkUsageOverages(): Promise<void> {
    try {
      // Get users with high usage
      const { data: activeSubscriptions, error } = await supabase
        .from('user_subscriptions')
        .select('user_id, stripe_subscription_id, plan_id')
        .eq('status', 'active');

      if (error) {
        this.billingLogger.error('Failed to query active subscriptions', error);
        return;
      }

      for (const subscription of activeSubscriptions || []) {
        try {
          const usage = await getUsageTracker().getCurrentUsage(subscription.user_id);
          
          // Check for overage
          if (usage.overage && usage.overage > 0) {
            await this.createAlert({
              type: 'usage_overage',
              severity: usage.percentage > 150 ? 'high' : 'medium',
              userId: subscription.user_id,
              subscriptionId: subscription.stripe_subscription_id,
              message: `User exceeded usage limit by ${usage.overage} calls`,
              details: {
                currentUsage: usage.current,
                limit: usage.limit,
                overage: usage.overage,
                overageCost: usage.overageCost,
                percentage: usage.percentage
              }
            });
          }
          
          // Check for approaching limit
          else if (usage.percentage > 90 && usage.limit > 0) {
            await this.createAlert({
              type: 'usage_overage',
              severity: 'low',
              userId: subscription.user_id,
              subscriptionId: subscription.stripe_subscription_id,
              message: `User approaching usage limit: ${usage.percentage.toFixed(1)}% used`,
              details: {
                currentUsage: usage.current,
                limit: usage.limit,
                percentage: usage.percentage,
                remaining: usage.limit - usage.current
              }
            });
          }
        } catch (usageError) {
          this.billingLogger.warn(`Failed to check usage for user ${subscription.user_id}`, usageError as Error);
        }
      }

    } catch (error) {
      this.billingLogger.error('Error checking usage overages', error as Error);
    }
  }

  /**
   * Check for upcoming subscription expirations
   */
  async checkSubscriptionExpirations(): Promise<void> {
    try {
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Check for subscriptions expiring in 3 days
      const { data: expiringSoon, error: expiringSoonError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('status', 'active')
        .eq('cancel_at_period_end', true)
        .lte('current_period_end', threeDaysFromNow.toISOString())
        .gte('current_period_end', new Date().toISOString());

      if (expiringSoonError) {
        this.billingLogger.error('Failed to query expiring subscriptions', expiringSoonError);
      } else {
        for (const subscription of expiringSoon || []) {
          await this.createAlert({
            type: 'subscription_expiry',
            severity: 'medium',
            userId: subscription.user_id,
            subscriptionId: subscription.stripe_subscription_id,
            message: `Subscription expires in 3 days`,
            details: {
              expirationDate: subscription.current_period_end,
              planId: subscription.plan_id,
              canceledAt: subscription.canceled_at
            }
          });
        }
      }

      // Check for trial subscriptions expiring in 7 days
      const { data: trialsExpiring, error: trialsError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('status', 'trialing')
        .lte('trial_end', sevenDaysFromNow.toISOString())
        .gte('trial_end', new Date().toISOString());

      if (trialsError) {
        this.billingLogger.error('Failed to query expiring trials', trialsError);
      } else {
        for (const subscription of trialsExpiring || []) {
          await this.createAlert({
            type: 'subscription_expiry',
            severity: 'low',
            userId: subscription.user_id,
            subscriptionId: subscription.stripe_subscription_id,
            message: `Trial expires in 7 days`,
            details: {
              trialEndDate: subscription.trial_end,
              planId: subscription.plan_id
            }
          });
        }
      }

    } catch (error) {
      this.billingLogger.error('Error checking subscription expirations', error as Error);
    }
  }

  /**
   * Generate billing metrics and analytics
   */
  async generateBillingMetrics(): Promise<BillingMetrics> {
    try {
      const performanceId = performanceMonitor.startOperation('billing_metrics_generation');

      // Get active subscriptions
      const { data: activeSubscriptions, error: subsError } = await supabase
        .from('user_subscriptions')
        .select('*, subscription_plans!inner(*)')
        .eq('status', 'active');

      if (subsError) {
        throw new Error(`Failed to query subscriptions: ${subsError.message}`);
      }

      // Get payment history for the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const { data: recentPayments, error: paymentsError } = await supabase
        .from('payment_history')
        .select('*')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .eq('status', 'succeeded');

      if (paymentsError) {
        throw new Error(`Failed to query payments: ${paymentsError.message}`);
      }

      // Calculate metrics
      const totalRevenue = (recentPayments || []).reduce((sum, payment) => sum + payment.amount, 0) / 100; // Convert from cents
      const monthlyRecurringRevenue = (activeSubscriptions || []).reduce((sum, sub) => {
        const plan = sub.subscription_plans;
        return sum + (plan?.price || 0);
      }, 0);

      const activeSubscriptionCount = activeSubscriptions?.length || 0;
      const averageRevenuePerUser = activeSubscriptionCount > 0 ? monthlyRecurringRevenue / activeSubscriptionCount : 0;

      // Calculate payment failure rate
      const { data: allRecentPayments, error: allPaymentsError } = await supabase
        .from('payment_history')
        .select('status')
        .gte('created_at', thirtyDaysAgo.toISOString());

      const totalPayments = allRecentPayments?.length || 0;
      const failedPayments = allRecentPayments?.filter(p => p.status === 'failed').length || 0;
      const paymentFailureRate = totalPayments > 0 ? failedPayments / totalPayments : 0;

      // Calculate churn rate (simplified - subscriptions canceled in last 30 days)
      const { data: canceledSubs, error: canceledError } = await supabase
        .from('user_subscriptions')
        .select('id')
        .eq('status', 'canceled')
        .gte('canceled_at', thirtyDaysAgo.toISOString());

      const churnedSubscriptions = canceledSubs?.length || 0;
      const churnRate = activeSubscriptionCount > 0 ? churnedSubscriptions / (activeSubscriptionCount + churnedSubscriptions) : 0;

      // Calculate trial conversion rate
      const { data: completedTrials, error: trialsError } = await supabase
        .from('user_subscriptions')
        .select('status')
        .not('trial_end', 'is', null)
        .lt('trial_end', new Date().toISOString());

      const totalTrials = completedTrials?.length || 0;
      const convertedTrials = completedTrials?.filter(t => t.status === 'active').length || 0;
      const trialConversionRate = totalTrials > 0 ? convertedTrials / totalTrials : 0;

      // Calculate usage overage rate (users exceeding limits)
      let usageOverageCount = 0;
      for (const subscription of activeSubscriptions || []) {
        try {
          const usage = await getUsageTracker().getCurrentUsage(subscription.user_id);
          if (usage.overage && usage.overage > 0) {
            usageOverageCount++;
          }
        } catch (error) {
          // Skip users where usage can't be calculated
        }
      }
      const usageOverageRate = activeSubscriptionCount > 0 ? usageOverageCount / activeSubscriptionCount : 0;

      const metrics: BillingMetrics = {
        totalRevenue,
        monthlyRecurringRevenue,
        activeSubscriptions: activeSubscriptionCount,
        churnRate,
        averageRevenuePerUser,
        paymentFailureRate,
        usageOverageRate,
        trialConversionRate
      };

      // Record metrics for monitoring
      Object.entries(metrics).forEach(([key, value]) => {
        performanceMonitor.recordBusinessMetric(`billing_${key}`, value, 'gauge');
      });

      performanceMonitor.endOperation(performanceId, {
        active_subscriptions: activeSubscriptionCount.toString(),
        total_revenue: totalRevenue.toString()
      });

      this.billingLogger.info('Billing metrics generated', metrics);
      return metrics;

    } catch (error) {
      this.billingLogger.error('Failed to generate billing metrics', error as Error);
      throw error;
    }
  }

  /**
   * Create a billing alert
   */
  private async createAlert(alertData: Omit<BillingAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    try {
      const alert: BillingAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        resolved: false,
        ...alertData
      };

      // Store alert in database
      const { error } = await supabase
        .from('billing_alerts')
        .insert({
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          user_id: alert.userId,
          subscription_id: alert.subscriptionId,
          message: alert.message,
          details: alert.details,
          timestamp: alert.timestamp.toISOString(),
          resolved: alert.resolved
        });

      if (error) {
        this.billingLogger.error('Failed to store billing alert', error);
        return;
      }

      // Send notification based on severity
      if (alert.severity === 'critical' || alert.severity === 'high') {
        await this.sendAlertNotification(alert);
      }

      // Record alert metric
      performanceMonitor.recordBusinessMetric('billing_alert_created', 1, 'count', {
        type: alert.type,
        severity: alert.severity,
        user_id: alert.userId || 'system'
      });

      this.billingLogger.warn('Billing alert created', {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message
      });

    } catch (error) {
      this.billingLogger.error('Failed to create billing alert', error as Error);
    }
  }

  /**
   * Send alert notification
   */
  private async sendAlertNotification(alert: BillingAlert): Promise<void> {
    try {
      // Send to monitoring system
      await monitoringService.recordAlert({
        id: alert.id,
        type: 'billing',
        severity: alert.severity,
        message: alert.message,
        details: alert.details,
        timestamp: alert.timestamp
      });

      // Send notification to admin users
      await notificationService.sendAdminNotification({
        type: 'billing_alert',
        title: `Billing Alert: ${alert.type}`,
        message: alert.message,
        severity: alert.severity,
        metadata: {
          alertId: alert.id,
          userId: alert.userId,
          subscriptionId: alert.subscriptionId
        }
      });

      // Send user notification for user-specific alerts
      if (alert.userId && (alert.type === 'payment_failure' || alert.type === 'usage_overage')) {
        await notificationService.sendUserNotification(alert.userId, {
          type: alert.type,
          title: alert.type === 'payment_failure' ? 'Payment Failed' : 'Usage Limit Exceeded',
          message: alert.message,
          severity: alert.severity,
          actionUrl: '/billing',
          actionText: 'Manage Billing'
        });
      }

    } catch (error) {
      this.billingLogger.error('Failed to send alert notification', error as Error);
    }
  }

  /**
   * Get billing alerts
   */
  async getBillingAlerts(options: {
    limit?: number;
    severity?: BillingAlert['severity'];
    type?: BillingAlert['type'];
    resolved?: boolean;
    userId?: string;
  } = {}): Promise<BillingAlert[]> {
    try {
      let query = supabase
        .from('billing_alerts')
        .select('*')
        .order('timestamp', { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.severity) {
        query = query.eq('severity', options.severity);
      }

      if (options.type) {
        query = query.eq('type', options.type);
      }

      if (options.resolved !== undefined) {
        query = query.eq('resolved', options.resolved);
      }

      if (options.userId) {
        query = query.eq('user_id', options.userId);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch billing alerts: ${error.message}`);
      }

      return (data || []).map(row => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        userId: row.user_id,
        subscriptionId: row.subscription_id,
        message: row.message,
        details: row.details,
        timestamp: new Date(row.timestamp),
        resolved: row.resolved,
        resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
        resolvedBy: row.resolved_by
      }));

    } catch (error) {
      this.billingLogger.error('Failed to get billing alerts', error as Error);
      throw error;
    }
  }

  /**
   * Resolve a billing alert
   */
  async resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('billing_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: resolvedBy
        })
        .eq('id', alertId);

      if (error) {
        throw new Error(`Failed to resolve alert: ${error.message}`);
      }

      this.billingLogger.info('Billing alert resolved', {
        alertId,
        resolvedBy
      });

    } catch (error) {
      this.billingLogger.error('Failed to resolve billing alert', error as Error);
      throw error;
    }
  }

  /**
   * Get billing system status
   */
  async getSystemStatus(): Promise<BillingHealthStatus> {
    return await this.performHealthCheck();
  }

  /**
   * Get billing metrics
   */
  async getMetrics(): Promise<BillingMetrics> {
    return await this.generateBillingMetrics();
  }
}

// Export singleton instance
export const billingMonitor = new BillingMonitor();
export default billingMonitor;