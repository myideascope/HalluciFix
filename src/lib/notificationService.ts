/**
 * Notification Service
 * Service for creating and managing billing notifications
 */

import { billingService } from './billingService';
import { BillingNotification } from '../types/subscription';

export class NotificationService {
  /**
   * Create payment success notification
   */
  async createPaymentSuccessNotification(
    userId: string,
    amount: number,
    currency: string,
    invoiceId?: string
  ): Promise<BillingNotification> {
    return await billingService.createBillingNotification({
      userId,
      type: 'payment_succeeded',
      title: 'Payment Successful',
      message: `Your payment of ${this.formatCurrency(amount, currency)} has been processed successfully.`,
      severity: 'success',
      read: false,
      metadata: {
        amount,
        currency,
        invoiceId,
      },
    });
  }

  /**
   * Create payment failure notification
   */
  async createPaymentFailureNotification(
    userId: string,
    amount: number,
    currency: string,
    reason?: string,
    invoiceId?: string
  ): Promise<BillingNotification> {
    return await billingService.createBillingNotification({
      userId,
      type: 'payment_failed',
      title: 'Payment Failed',
      message: `Your payment of ${this.formatCurrency(amount, currency)} could not be processed. ${reason ? `Reason: ${reason}` : 'Please update your payment method.'}`,
      severity: 'error',
      read: false,
      actionUrl: '/billing',
      actionText: 'Update Payment Method',
      metadata: {
        amount,
        currency,
        reason,
        invoiceId,
      },
    });
  }

  /**
   * Create upcoming invoice notification
   */
  async createUpcomingInvoiceNotification(
    userId: string,
    amount: number,
    currency: string,
    dueDate: Date,
    invoiceId?: string
  ): Promise<BillingNotification> {
    const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    
    return await billingService.createBillingNotification({
      userId,
      type: 'invoice_upcoming',
      title: 'Upcoming Invoice',
      message: `Your next invoice of ${this.formatCurrency(amount, currency)} is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.`,
      severity: 'info',
      read: false,
      actionUrl: '/billing',
      actionText: 'View Invoice',
      metadata: {
        amount,
        currency,
        dueDate: dueDate.toISOString(),
        daysUntilDue,
        invoiceId,
      },
    });
  }

  /**
   * Create trial ending notification
   */
  async createTrialEndingNotification(
    userId: string,
    trialEndDate: Date,
    planName: string
  ): Promise<BillingNotification> {
    const daysUntilEnd = Math.ceil((trialEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    
    return await billingService.createBillingNotification({
      userId,
      type: 'trial_ending',
      title: 'Trial Ending Soon',
      message: `Your ${planName} trial ends in ${daysUntilEnd} day${daysUntilEnd !== 1 ? 's' : ''}. Add a payment method to continue your subscription.`,
      severity: 'warning',
      read: false,
      actionUrl: '/billing',
      actionText: 'Add Payment Method',
      metadata: {
        trialEndDate: trialEndDate.toISOString(),
        daysUntilEnd,
        planName,
      },
    });
  }

  /**
   * Create subscription canceled notification
   */
  async createSubscriptionCanceledNotification(
    userId: string,
    planName: string,
    endDate: Date,
    reason?: string
  ): Promise<BillingNotification> {
    return await billingService.createBillingNotification({
      userId,
      type: 'subscription_canceled',
      title: 'Subscription Canceled',
      message: `Your ${planName} subscription has been canceled and will end on ${endDate.toLocaleDateString()}. ${reason ? `Reason: ${reason}` : 'You can reactivate it anytime before then.'}`,
      severity: 'warning',
      read: false,
      actionUrl: '/billing',
      actionText: 'Reactivate Subscription',
      metadata: {
        planName,
        endDate: endDate.toISOString(),
        reason,
      },
    });
  }

  /**
   * Create usage limit reached notification
   */
  async createUsageLimitReachedNotification(
    userId: string,
    currentUsage: number,
    limit: number,
    planName: string,
    overage?: number
  ): Promise<BillingNotification> {
    const percentage = Math.round((currentUsage / limit) * 100);
    const isOverage = overage && overage > 0;
    
    return await billingService.createBillingNotification({
      userId,
      type: 'usage_limit_reached',
      title: isOverage ? 'Usage Limit Exceeded' : 'Usage Limit Reached',
      message: isOverage 
        ? `You've exceeded your ${planName} plan limit by ${overage.toLocaleString()} API calls. Additional usage charges may apply.`
        : `You've reached ${percentage}% of your ${planName} plan limit (${currentUsage.toLocaleString()}/${limit.toLocaleString()} API calls).`,
      severity: isOverage ? 'error' : 'warning',
      read: false,
      actionUrl: '/billing',
      actionText: isOverage ? 'Upgrade Plan' : 'Monitor Usage',
      metadata: {
        currentUsage,
        limit,
        percentage,
        planName,
        overage,
        isOverage,
      },
    });
  }

  /**
   * Create custom billing notification
   */
  async createCustomNotification(
    userId: string,
    title: string,
    message: string,
    severity: BillingNotification['severity'] = 'info',
    actionUrl?: string,
    actionText?: string,
    metadata?: Record<string, any>
  ): Promise<BillingNotification> {
    return await billingService.createBillingNotification({
      userId,
      type: 'payment_succeeded', // Default type, can be customized
      title,
      message,
      severity,
      read: false,
      actionUrl,
      actionText,
      metadata,
    });
  }

  /**
   * Send notification digest (summary of recent notifications)
   */
  async createNotificationDigest(
    userId: string,
    notifications: BillingNotification[]
  ): Promise<BillingNotification> {
    const unreadCount = notifications.filter(n => !n.read).length;
    const criticalCount = notifications.filter(n => n.severity === 'error' && !n.read).length;
    
    let message = `You have ${unreadCount} unread billing notification${unreadCount !== 1 ? 's' : ''}.`;
    if (criticalCount > 0) {
      message += ` ${criticalCount} require${criticalCount === 1 ? 's' : ''} immediate attention.`;
    }

    return await billingService.createBillingNotification({
      userId,
      type: 'payment_succeeded', // Generic type for digest
      title: 'Billing Notification Summary',
      message,
      severity: criticalCount > 0 ? 'error' : unreadCount > 0 ? 'warning' : 'info',
      read: false,
      actionUrl: '/billing',
      actionText: 'View All Notifications',
      metadata: {
        unreadCount,
        criticalCount,
        totalCount: notifications.length,
        digestType: 'summary',
      },
    });
  }

  /**
   * Format currency for notifications
   */
  private formatCurrency(amount: number, currency: string = 'usd'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100); // Stripe amounts are in cents
  }

  /**
   * Check if notification should be sent based on user preferences
   */
  async shouldSendNotification(
    userId: string,
    notificationType: BillingNotification['type']
  ): Promise<boolean> {
    // This could be enhanced to check user notification preferences
    // For now, send all notifications
    return true;
  }

  /**
   * Batch create notifications
   */
  async createBatchNotifications(
    notifications: Array<Omit<BillingNotification, 'id' | 'createdAt' | 'readAt'>>
  ): Promise<BillingNotification[]> {
    const results: BillingNotification[] = [];
    
    for (const notification of notifications) {
      try {
        const created = await billingService.createBillingNotification(notification);
        results.push(created);
      } catch (error) {
        console.error('Failed to create notification:', error);
      }
    }
    
    return results;
  }

  /**
   * Clean up old notifications (older than 90 days)
   */
  async cleanupOldNotifications(userId: string, daysToKeep: number = 90): Promise<number> {
    // This would typically be implemented as a database operation
    // For now, just return 0 as a placeholder
    return 0;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();