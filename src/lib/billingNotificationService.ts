/**
 * Billing Notification Service
 * Handles email notifications and user communications for billing events
 */

import { supabase } from './supabase';
import { config } from './config';

export interface NotificationTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: string[];
}

export interface NotificationData {
  userId: string;
  emailAddress: string;
  templateName: string;
  templateData: Record<string, any>;
  stripeSubscriptionId?: string;
  stripeInvoiceId?: string;
}

export interface BillingAlert {
  id: string;
  userId: string;
  alertType: 'payment_failed' | 'trial_ending' | 'subscription_canceled' | 'usage_limit_exceeded';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  actionRequired: boolean;
  actionUrl?: string;
  actionText?: string;
  dismissed: boolean;
  createdAt: Date;
  dismissedAt?: Date;
}

export class BillingNotificationService {
  /**
   * Send welcome email to new subscriber
   */
  async sendWelcomeEmail(
    userId: string,
    subscriptionData: {
      planName: string;
      trialEnd?: Date;
      features: string[];
    }
  ): Promise<void> {
    const user = await this.getUserInfo(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const templateData = {
      userName: user.name || user.email.split('@')[0],
      planName: subscriptionData.planName,
      trialEnd: subscriptionData.trialEnd?.toLocaleDateString(),
      features: subscriptionData.features,
      dashboardUrl: `${config.app.url}/dashboard`,
      supportUrl: `${config.app.url}/support`,
    };

    await this.sendNotification({
      userId,
      emailAddress: user.email,
      templateName: 'welcome',
      templateData,
    });

    // Create in-app notification
    await this.createBillingAlert({
      userId,
      alertType: 'trial_ending',
      title: `Welcome to ${subscriptionData.planName}!`,
      message: subscriptionData.trialEnd 
        ? `Your trial ends on ${subscriptionData.trialEnd.toLocaleDateString()}. Enjoy exploring all the features!`
        : 'Your subscription is now active. Enjoy all the premium features!',
      severity: 'info',
      actionRequired: false,
      actionUrl: '/dashboard',
      actionText: 'Go to Dashboard',
    });
  }

  /**
   * Send trial ending notification
   */
  async sendTrialEndingEmail(
    userId: string,
    subscriptionData: {
      planName: string;
      trialEnd: Date;
      daysRemaining: number;
    }
  ): Promise<void> {
    const user = await this.getUserInfo(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const templateData = {
      userName: user.name || user.email.split('@')[0],
      planName: subscriptionData.planName,
      trialEnd: subscriptionData.trialEnd.toLocaleDateString(),
      daysRemaining: subscriptionData.daysRemaining,
      billingUrl: `${config.app.url}/billing`,
      plansUrl: `${config.app.url}/pricing`,
    };

    await this.sendNotification({
      userId,
      emailAddress: user.email,
      templateName: 'trial_ending',
      templateData,
    });

    // Create urgent in-app notification
    await this.createBillingAlert({
      userId,
      alertType: 'trial_ending',
      title: 'Trial Ending Soon',
      message: `Your ${subscriptionData.planName} trial ends in ${subscriptionData.daysRemaining} days. Add a payment method to continue.`,
      severity: 'warning',
      actionRequired: true,
      actionUrl: '/billing',
      actionText: 'Add Payment Method',
    });
  }

  /**
   * Send payment failure notification
   */
  async sendPaymentFailureEmail(
    userId: string,
    paymentData: {
      amount: number;
      currency: string;
      failureReason?: string;
      nextAttempt?: Date;
      invoiceUrl?: string;
    }
  ): Promise<void> {
    const user = await this.getUserInfo(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const templateData = {
      userName: user.name || user.email.split('@')[0],
      amount: this.formatCurrency(paymentData.amount, paymentData.currency),
      failureReason: paymentData.failureReason || 'Payment could not be processed',
      nextAttempt: paymentData.nextAttempt?.toLocaleDateString(),
      invoiceUrl: paymentData.invoiceUrl,
      billingUrl: `${config.app.url}/billing`,
      supportUrl: `${config.app.url}/support`,
    };

    await this.sendNotification({
      userId,
      emailAddress: user.email,
      templateName: 'payment_failed',
      templateData,
    });

    // Create critical in-app notification
    await this.createBillingAlert({
      userId,
      alertType: 'payment_failed',
      title: 'Payment Failed',
      message: `Your payment of ${this.formatCurrency(paymentData.amount, paymentData.currency)} could not be processed. Please update your payment method.`,
      severity: 'error',
      actionRequired: true,
      actionUrl: '/billing',
      actionText: 'Update Payment Method',
    });
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmationEmail(
    userId: string,
    paymentData: {
      amount: number;
      currency: string;
      invoiceUrl?: string;
      periodStart?: Date;
      periodEnd?: Date;
      planName?: string;
    }
  ): Promise<void> {
    const user = await this.getUserInfo(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const templateData = {
      userName: user.name || user.email.split('@')[0],
      amount: this.formatCurrency(paymentData.amount, paymentData.currency),
      invoiceUrl: paymentData.invoiceUrl,
      periodStart: paymentData.periodStart?.toLocaleDateString(),
      periodEnd: paymentData.periodEnd?.toLocaleDateString(),
      planName: paymentData.planName,
      billingUrl: `${config.app.url}/billing`,
    };

    await this.sendNotification({
      userId,
      emailAddress: user.email,
      templateName: 'payment_confirmation',
      templateData,
    });
  }

  /**
   * Send subscription cancellation email
   */
  async sendCancellationEmail(
    userId: string,
    subscriptionData: {
      planName: string;
      endDate: Date;
      reason?: string;
    }
  ): Promise<void> {
    const user = await this.getUserInfo(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const templateData = {
      userName: user.name || user.email.split('@')[0],
      planName: subscriptionData.planName,
      endDate: subscriptionData.endDate.toLocaleDateString(),
      reason: subscriptionData.reason,
      reactivateUrl: `${config.app.url}/billing`,
      feedbackUrl: `${config.app.url}/feedback`,
    };

    await this.sendNotification({
      userId,
      emailAddress: user.email,
      templateName: 'cancellation',
      templateData,
    });

    // Create in-app notification
    await this.createBillingAlert({
      userId,
      alertType: 'subscription_canceled',
      title: 'Subscription Canceled',
      message: `Your ${subscriptionData.planName} subscription will end on ${subscriptionData.endDate.toLocaleDateString()}.`,
      severity: 'warning',
      actionRequired: false,
      actionUrl: '/billing',
      actionText: 'Reactivate Subscription',
    });
  }

  /**
   * Send subscription cancellation scheduled email
   */
  async sendCancellationScheduledEmail(
    userId: string,
    subscriptionData: {
      planName: string;
      endDate: Date;
    }
  ): Promise<void> {
    const user = await this.getUserInfo(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const templateData = {
      userName: user.name || user.email.split('@')[0],
      planName: subscriptionData.planName,
      endDate: subscriptionData.endDate.toLocaleDateString(),
      reactivateUrl: `${config.app.url}/billing`,
    };

    await this.sendNotification({
      userId,
      emailAddress: user.email,
      templateName: 'cancellation_scheduled',
      templateData,
    });

    // Create in-app notification
    await this.createBillingAlert({
      userId,
      alertType: 'subscription_canceled',
      title: 'Cancellation Scheduled',
      message: `Your ${subscriptionData.planName} subscription is scheduled to end on ${subscriptionData.endDate.toLocaleDateString()}.`,
      severity: 'warning',
      actionRequired: false,
      actionUrl: '/billing',
      actionText: 'Reactivate Subscription',
    });
  }

  /**
   * Send usage limit exceeded notification
   */
  async sendUsageLimitExceededNotification(
    userId: string,
    usageData: {
      usageType: string;
      currentUsage: number;
      limit: number;
      overage: number;
      overageCost?: number;
    }
  ): Promise<void> {
    const user = await this.getUserInfo(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const templateData = {
      userName: user.name || user.email.split('@')[0],
      usageType: usageData.usageType,
      currentUsage: usageData.currentUsage.toLocaleString(),
      limit: usageData.limit.toLocaleString(),
      overage: usageData.overage.toLocaleString(),
      overageCost: usageData.overageCost ? this.formatCurrency(usageData.overageCost * 100, 'usd') : null,
      billingUrl: `${config.app.url}/billing`,
      upgradeUrl: `${config.app.url}/pricing`,
    };

    await this.sendNotification({
      userId,
      emailAddress: user.email,
      templateName: 'usage_limit_exceeded',
      templateData,
    });

    // Create in-app notification
    await this.createBillingAlert({
      userId,
      alertType: 'usage_limit_exceeded',
      title: 'Usage Limit Exceeded',
      message: `You've exceeded your ${usageData.usageType} limit by ${usageData.overage.toLocaleString()} units.`,
      severity: 'warning',
      actionRequired: true,
      actionUrl: '/pricing',
      actionText: 'Upgrade Plan',
    });
  }

  /**
   * Get billing alerts for a user
   */
  async getBillingAlerts(
    userId: string,
    options: {
      includeRead?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ alerts: BillingAlert[]; total: number }> {
    const { includeRead = false, limit = 50, offset = 0 } = options;

    let query = supabase
      .from('billing_alerts')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!includeRead) {
      query = query.eq('dismissed', false);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch billing alerts: ${error.message}`);
    }

    return {
      alerts: data?.map(this.convertBillingAlertFromDb) || [],
      total: count || 0,
    };
  }

  /**
   * Dismiss a billing alert
   */
  async dismissBillingAlert(userId: string, alertId: string): Promise<void> {
    const { error } = await supabase
      .from('billing_alerts')
      .update({
        dismissed: true,
        dismissed_at: new Date(),
      })
      .eq('id', alertId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to dismiss alert: ${error.message}`);
    }
  }

  /**
   * Dismiss all billing alerts for a user
   */
  async dismissAllBillingAlerts(userId: string): Promise<void> {
    const { error } = await supabase
      .from('billing_alerts')
      .update({
        dismissed: true,
        dismissed_at: new Date(),
      })
      .eq('user_id', userId)
      .eq('dismissed', false);

    if (error) {
      throw new Error(`Failed to dismiss all alerts: ${error.message}`);
    }
  }

  /**
   * Get notification templates
   */
  async getNotificationTemplates(): Promise<NotificationTemplate[]> {
    // In a real implementation, these would come from a database or external service
    return [
      {
        id: 'welcome',
        name: 'Welcome Email',
        subject: 'Welcome to HalluciFix {{planName}}!',
        htmlContent: this.getWelcomeEmailTemplate(),
        textContent: this.getWelcomeEmailTextTemplate(),
        variables: ['userName', 'planName', 'trialEnd', 'features', 'dashboardUrl', 'supportUrl'],
      },
      {
        id: 'trial_ending',
        name: 'Trial Ending',
        subject: 'Your HalluciFix trial ends in {{daysRemaining}} days',
        htmlContent: this.getTrialEndingEmailTemplate(),
        textContent: this.getTrialEndingEmailTextTemplate(),
        variables: ['userName', 'planName', 'trialEnd', 'daysRemaining', 'billingUrl', 'plansUrl'],
      },
      {
        id: 'payment_failed',
        name: 'Payment Failed',
        subject: 'Payment Failed - Action Required',
        htmlContent: this.getPaymentFailedEmailTemplate(),
        textContent: this.getPaymentFailedEmailTextTemplate(),
        variables: ['userName', 'amount', 'failureReason', 'nextAttempt', 'invoiceUrl', 'billingUrl', 'supportUrl'],
      },
      {
        id: 'payment_confirmation',
        name: 'Payment Confirmation',
        subject: 'Payment Received - Thank You!',
        htmlContent: this.getPaymentConfirmationEmailTemplate(),
        textContent: this.getPaymentConfirmationEmailTextTemplate(),
        variables: ['userName', 'amount', 'invoiceUrl', 'periodStart', 'periodEnd', 'planName', 'billingUrl'],
      },
      {
        id: 'cancellation',
        name: 'Subscription Canceled',
        subject: 'Your HalluciFix subscription has been canceled',
        htmlContent: this.getCancellationEmailTemplate(),
        textContent: this.getCancellationEmailTextTemplate(),
        variables: ['userName', 'planName', 'endDate', 'reason', 'reactivateUrl', 'feedbackUrl'],
      },
      {
        id: 'cancellation_scheduled',
        name: 'Cancellation Scheduled',
        subject: 'Your HalluciFix subscription will be canceled',
        htmlContent: this.getCancellationScheduledEmailTemplate(),
        textContent: this.getCancellationScheduledEmailTextTemplate(),
        variables: ['userName', 'planName', 'endDate', 'reactivateUrl'],
      },
      {
        id: 'usage_limit_exceeded',
        name: 'Usage Limit Exceeded',
        subject: 'Usage Limit Exceeded - Consider Upgrading',
        htmlContent: this.getUsageLimitExceededEmailTemplate(),
        textContent: this.getUsageLimitExceededEmailTextTemplate(),
        variables: ['userName', 'usageType', 'currentUsage', 'limit', 'overage', 'overageCost', 'billingUrl', 'upgradeUrl'],
      },
    ];
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Send notification (email)
   */
  private async sendNotification(data: NotificationData): Promise<void> {
    // In a real implementation, this would integrate with an email service like SendGrid, Mailgun, etc.
    console.log(`Sending ${data.templateName} email to ${data.emailAddress}`);

    // Record the notification in the database
    const { error } = await supabase
      .from('email_notifications')
      .insert({
        user_id: data.userId,
        email_type: data.templateName,
        stripe_subscription_id: data.stripeSubscriptionId,
        stripe_invoice_id: data.stripeInvoiceId,
        email_address: data.emailAddress,
        subject: this.renderTemplate(`{{subject}}`, data.templateData),
        template_name: data.templateName,
        template_data: data.templateData,
        sent_at: new Date(),
        delivery_status: 'sent',
      });

    if (error) {
      console.error('Failed to record email notification:', error);
    }
  }

  /**
   * Create billing alert
   */
  private async createBillingAlert(alert: Omit<BillingAlert, 'id' | 'dismissed' | 'createdAt' | 'dismissedAt'>): Promise<void> {
    const { error } = await supabase
      .from('billing_alerts')
      .insert({
        user_id: alert.userId,
        alert_type: alert.alertType,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        action_required: alert.actionRequired,
        action_url: alert.actionUrl,
        action_text: alert.actionText,
        dismissed: false,
        created_at: new Date(),
      });

    if (error) {
      console.error('Failed to create billing alert:', error);
    }
  }

  /**
   * Get user information
   */
  private async getUserInfo(userId: string): Promise<{ email: string; name?: string } | null> {
    const { data, error } = await supabase
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Failed to fetch user info:', error);
      return null;
    }

    return data;
  }

  /**
   * Format currency amount
   */
  private formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  }

  /**
   * Render template with data
   */
  private renderTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  /**
   * Convert billing alert from database format
   */
  private convertBillingAlertFromDb(row: any): BillingAlert {
    return {
      id: row.id,
      userId: row.user_id,
      alertType: row.alert_type,
      title: row.title,
      message: row.message,
      severity: row.severity,
      actionRequired: row.action_required,
      actionUrl: row.action_url,
      actionText: row.action_text,
      dismissed: row.dismissed,
      createdAt: new Date(row.created_at),
      dismissedAt: row.dismissed_at ? new Date(row.dismissed_at) : undefined,
    };
  }

  // =============================================================================
  // EMAIL TEMPLATES
  // =============================================================================

  private getWelcomeEmailTemplate(): string {
    return `
      <h1>Welcome to HalluciFix {{planName}}!</h1>
      <p>Hi {{userName}},</p>
      <p>Welcome to HalluciFix! We're excited to have you on board with our {{planName}} plan.</p>
      {{#if trialEnd}}
      <p>Your trial period ends on {{trialEnd}}. Make sure to add a payment method before then to continue enjoying all the features.</p>
      {{/if}}
      <h3>Your plan includes:</h3>
      <ul>
        {{#each features}}
        <li>{{this}}</li>
        {{/each}}
      </ul>
      <p><a href="{{dashboardUrl}}">Get started with your dashboard</a></p>
      <p>If you have any questions, don't hesitate to <a href="{{supportUrl}}">contact our support team</a>.</p>
      <p>Best regards,<br>The HalluciFix Team</p>
    `;
  }

  private getWelcomeEmailTextTemplate(): string {
    return `
      Welcome to HalluciFix {{planName}}!
      
      Hi {{userName}},
      
      Welcome to HalluciFix! We're excited to have you on board with our {{planName}} plan.
      
      {{#if trialEnd}}
      Your trial period ends on {{trialEnd}}. Make sure to add a payment method before then to continue enjoying all the features.
      {{/if}}
      
      Your plan includes:
      {{#each features}}
      - {{this}}
      {{/each}}
      
      Get started: {{dashboardUrl}}
      Support: {{supportUrl}}
      
      Best regards,
      The HalluciFix Team
    `;
  }

  private getTrialEndingEmailTemplate(): string {
    return `
      <h1>Your trial ends in {{daysRemaining}} days</h1>
      <p>Hi {{userName}},</p>
      <p>Your {{planName}} trial ends on {{trialEnd}} ({{daysRemaining}} days from now).</p>
      <p>To continue using HalluciFix without interruption, please add a payment method to your account.</p>
      <p><a href="{{billingUrl}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Add Payment Method</a></p>
      <p>Want to change your plan? <a href="{{plansUrl}}">View all plans</a></p>
      <p>Best regards,<br>The HalluciFix Team</p>
    `;
  }

  private getTrialEndingEmailTextTemplate(): string {
    return `
      Your trial ends in {{daysRemaining}} days
      
      Hi {{userName}},
      
      Your {{planName}} trial ends on {{trialEnd}} ({{daysRemaining}} days from now).
      
      To continue using HalluciFix without interruption, please add a payment method to your account.
      
      Add payment method: {{billingUrl}}
      View all plans: {{plansUrl}}
      
      Best regards,
      The HalluciFix Team
    `;
  }

  private getPaymentFailedEmailTemplate(): string {
    return `
      <h1>Payment Failed - Action Required</h1>
      <p>Hi {{userName}},</p>
      <p>We were unable to process your payment of {{amount}}.</p>
      <p><strong>Reason:</strong> {{failureReason}}</p>
      {{#if nextAttempt}}
      <p>We'll try again on {{nextAttempt}}, but please update your payment method to avoid service interruption.</p>
      {{/if}}
      <p><a href="{{billingUrl}}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Update Payment Method</a></p>
      {{#if invoiceUrl}}
      <p><a href="{{invoiceUrl}}">View Invoice</a></p>
      {{/if}}
      <p>Need help? <a href="{{supportUrl}}">Contact Support</a></p>
      <p>Best regards,<br>The HalluciFix Team</p>
    `;
  }

  private getPaymentFailedEmailTextTemplate(): string {
    return `
      Payment Failed - Action Required
      
      Hi {{userName}},
      
      We were unable to process your payment of {{amount}}.
      
      Reason: {{failureReason}}
      
      {{#if nextAttempt}}
      We'll try again on {{nextAttempt}}, but please update your payment method to avoid service interruption.
      {{/if}}
      
      Update payment method: {{billingUrl}}
      {{#if invoiceUrl}}
      View invoice: {{invoiceUrl}}
      {{/if}}
      Contact support: {{supportUrl}}
      
      Best regards,
      The HalluciFix Team
    `;
  }

  private getPaymentConfirmationEmailTemplate(): string {
    return `
      <h1>Payment Received - Thank You!</h1>
      <p>Hi {{userName}},</p>
      <p>We've successfully received your payment of {{amount}}.</p>
      {{#if planName}}
      <p>Your {{planName}} subscription is active{{#if periodEnd}} until {{periodEnd}}{{/if}}.</p>
      {{/if}}
      {{#if invoiceUrl}}
      <p><a href="{{invoiceUrl}}">Download your invoice</a></p>
      {{/if}}
      <p><a href="{{billingUrl}}">View your billing details</a></p>
      <p>Thank you for your business!</p>
      <p>Best regards,<br>The HalluciFix Team</p>
    `;
  }

  private getPaymentConfirmationEmailTextTemplate(): string {
    return `
      Payment Received - Thank You!
      
      Hi {{userName}},
      
      We've successfully received your payment of {{amount}}.
      
      {{#if planName}}
      Your {{planName}} subscription is active{{#if periodEnd}} until {{periodEnd}}{{/if}}.
      {{/if}}
      
      {{#if invoiceUrl}}
      Download invoice: {{invoiceUrl}}
      {{/if}}
      View billing: {{billingUrl}}
      
      Thank you for your business!
      
      Best regards,
      The HalluciFix Team
    `;
  }

  private getCancellationEmailTemplate(): string {
    return `
      <h1>Subscription Canceled</h1>
      <p>Hi {{userName}},</p>
      <p>Your {{planName}} subscription has been canceled and will end on {{endDate}}.</p>
      {{#if reason}}
      <p>Reason: {{reason}}</p>
      {{/if}}
      <p>You'll continue to have access to all features until {{endDate}}.</p>
      <p>Changed your mind? <a href="{{reactivateUrl}}">Reactivate your subscription</a></p>
      <p>We'd love to hear your feedback: <a href="{{feedbackUrl}}">Share your thoughts</a></p>
      <p>Best regards,<br>The HalluciFix Team</p>
    `;
  }

  private getCancellationEmailTextTemplate(): string {
    return `
      Subscription Canceled
      
      Hi {{userName}},
      
      Your {{planName}} subscription has been canceled and will end on {{endDate}}.
      
      {{#if reason}}
      Reason: {{reason}}
      {{/if}}
      
      You'll continue to have access to all features until {{endDate}}.
      
      Reactivate: {{reactivateUrl}}
      Feedback: {{feedbackUrl}}
      
      Best regards,
      The HalluciFix Team
    `;
  }

  private getCancellationScheduledEmailTemplate(): string {
    return `
      <h1>Cancellation Scheduled</h1>
      <p>Hi {{userName}},</p>
      <p>Your {{planName}} subscription is scheduled to be canceled on {{endDate}}.</p>
      <p>You'll continue to have access to all features until then.</p>
      <p>Changed your mind? <a href="{{reactivateUrl}}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reactivate Subscription</a></p>
      <p>Best regards,<br>The HalluciFix Team</p>
    `;
  }

  private getCancellationScheduledEmailTextTemplate(): string {
    return `
      Cancellation Scheduled
      
      Hi {{userName}},
      
      Your {{planName}} subscription is scheduled to be canceled on {{endDate}}.
      
      You'll continue to have access to all features until then.
      
      Reactivate: {{reactivateUrl}}
      
      Best regards,
      The HalluciFix Team
    `;
  }

  private getUsageLimitExceededEmailTemplate(): string {
    return `
      <h1>Usage Limit Exceeded</h1>
      <p>Hi {{userName}},</p>
      <p>You've exceeded your {{usageType}} limit.</p>
      <p><strong>Current usage:</strong> {{currentUsage}}</p>
      <p><strong>Plan limit:</strong> {{limit}}</p>
      <p><strong>Overage:</strong> {{overage}}</p>
      {{#if overageCost}}
      <p><strong>Additional charges:</strong> {{overageCost}}</p>
      {{/if}}
      <p>Consider upgrading your plan to avoid overage charges and get more capacity.</p>
      <p><a href="{{upgradeUrl}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upgrade Plan</a></p>
      <p><a href="{{billingUrl}}">View billing details</a></p>
      <p>Best regards,<br>The HalluciFix Team</p>
    `;
  }

  private getUsageLimitExceededEmailTextTemplate(): string {
    return `
      Usage Limit Exceeded
      
      Hi {{userName}},
      
      You've exceeded your {{usageType}} limit.
      
      Current usage: {{currentUsage}}
      Plan limit: {{limit}}
      Overage: {{overage}}
      {{#if overageCost}}
      Additional charges: {{overageCost}}
      {{/if}}
      
      Consider upgrading your plan to avoid overage charges and get more capacity.
      
      Upgrade plan: {{upgradeUrl}}
      View billing: {{billingUrl}}
      
      Best regards,
      The HalluciFix Team
    `;
  }
}

// Export singleton instance
export const billingNotificationService = new BillingNotificationService();

// Export types for external use
export type {
  NotificationTemplate,
  NotificationData,
  BillingAlert,
};