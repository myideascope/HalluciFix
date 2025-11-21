/**
 * Multi-Channel Notification Service
 * Handles Slack, Email, and PagerDuty integrations for alert notifications
 */

import type { Alert, NotificationChannel } from './alertManager';

import { logger } from './logging';
export interface NotificationConfig {
  slack?: {
    webhookUrl: string;
    channel?: string;
    username?: string;
  };
  email?: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassword: string;
    fromEmail: string;
    toEmails: string[];
  };
  pagerduty?: {
    integrationKey: string;
    serviceKey?: string;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
}

export interface SlackAttachment {
  color: string;
  title: string;
  text: string;
  fields: Array<{
    title: string;
    value: string;
    short: boolean;
  }>;
}

export interface PagerDutyEvent {
  routing_key: string;
  event_action: 'trigger' | 'acknowledge' | 'resolve';
  dedup_key?: string;
  payload: {
    summary: string;
    source: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    component?: string;
    group?: string;
    class?: string;
    custom_details?: Record<string, any>;
  };
}

/**
 * Multi-Channel Notification Service
 */
export class NotificationService {
  private config: NotificationConfig;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  /**
   * Send notification to specified channel
   */
  async sendNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    switch (channel) {
      case 'slack':
        await this.sendSlackNotification(alert);
        break;
      case 'email':
        await this.sendEmailNotification(alert);
        break;
      case 'pagerduty':
        await this.sendPagerDutyNotification(alert);
        break;
      case 'webhook':
        await this.sendWebhookNotification(alert);
        break;
      default:
        throw new Error(`Unsupported notification channel: ${channel}`);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(alert: Alert): Promise<void> {
    if (!this.config.slack?.webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const color = this.getSeverityColor(alert.severity);
    const payload = {
      username: this.config.slack.username || 'AlertBot',
      channel: this.config.slack.channel,
      text: `🚨 ${alert.severity.toUpperCase()}: ${alert.title}`,
      attachments: [
        {
          color,
          title: alert.title,
          text: alert.message,
          fields: [
            {
              title: 'Severity',
              value: alert.severity,
              short: true
            },
            {
              title: 'Time',
              value: alert.timestamp.toISOString(),
              short: true
            },
            {
              title: 'Alert ID',
              value: alert.id,
              short: true
            },
            {
              title: 'Tags',
              value: Object.entries(alert.tags)
                .map(([k, v]) => `${k}:${v}`)
                .join(', ') || 'None',
              short: false
            }
          ]
        }
      ]
    };

    const response = await fetch(this.config.slack.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.statusText}`);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(alert: Alert): Promise<void> {
    if (!this.config.email) {
      throw new Error('Email configuration not provided');
    }

    const subject = `[${alert.severity.toUpperCase()}] ${alert.title}`;
    const htmlBody = this.generateEmailHtml(alert);
    const textBody = this.generateEmailText(alert);

    // Note: In a real implementation, you would use a proper email service
    // like nodemailer, SendGrid, or AWS SES. This is a simplified example.
    try {
      await this.sendEmail({
        from: this.config.email.fromEmail,
        to: this.config.email.toEmails,
        subject,
        html: htmlBody,
        text: textBody
      });
    } catch (error) {
      throw new Error(`Email notification failed: ${error}`);
    }
  }

  /**
   * Send PagerDuty notification
   */
  private async sendPagerDutyNotification(alert: Alert): Promise<void> {
    if (!this.config.pagerduty?.integrationKey) {
      throw new Error('PagerDuty integration key not configured');
    }

    const event: PagerDutyEvent = {
      routing_key: this.config.pagerduty.integrationKey,
      event_action: 'trigger',
      dedup_key: alert.id,
      payload: {
        summary: alert.title,
        source: 'HalluciFix Monitoring',
        severity: this.mapSeverityToPagerDuty(alert.severity),
        component: alert.tags.service || 'Unknown',
        group: alert.tags.environment || 'production',
        class: alert.ruleId,
        custom_details: {
          message: alert.message,
          tags: alert.tags,
          timestamp: alert.timestamp.toISOString(),
          escalationLevel: alert.escalationLevel
        }
      }
    };

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PagerDuty notification failed: ${response.statusText} - ${errorText}`);
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(alert: Alert): Promise<void> {
    if (!this.config.webhook?.url) {
      throw new Error('Webhook URL not configured');
    }

    const payload = {
      alert_id: alert.id,
      rule_id: alert.ruleId,
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      timestamp: alert.timestamp.toISOString(),
      tags: alert.tags,
      resolved: alert.resolved,
      escalation_level: alert.escalationLevel
    };

    const response = await fetch(this.config.webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.webhook.headers
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook notification failed: ${response.statusText}`);
    }
  }

  /**
   * Get color for severity level (for Slack)
   */
  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'info':
        return '#36a64f'; // Green
      case 'warning':
        return '#ffb366'; // Orange
      case 'error':
        return '#ff6b6b'; // Red
      case 'critical':
        return '#d63031'; // Dark red
      default:
        return '#95a5a6'; // Gray
    }
  }

  /**
   * Map severity to PagerDuty severity levels
   */
  private mapSeverityToPagerDuty(severity: string): 'critical' | 'error' | 'warning' | 'info' {
    switch (severity) {
      case 'critical':
        return 'critical';
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
      default:
        return 'info';
    }
  }

  /**
   * Generate HTML email content
   */
  private generateEmailHtml(alert: Alert): string {
    const severityColor = this.getSeverityColor(alert.severity);
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Alert Notification</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background-color: ${severityColor}; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .field { margin-bottom: 15px; }
            .field-label { font-weight: bold; color: #333; }
            .field-value { margin-top: 5px; padding: 8px; background-color: #f8f9fa; border-radius: 4px; }
            .tags { display: flex; flex-wrap: wrap; gap: 5px; }
            .tag { background-color: #e9ecef; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
            .footer { background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 Alert Notification</h1>
              <h2>${alert.severity.toUpperCase()}</h2>
            </div>
            <div class="content">
              <div class="field">
                <div class="field-label">Title:</div>
                <div class="field-value">${alert.title}</div>
              </div>
              <div class="field">
                <div class="field-label">Message:</div>
                <div class="field-value">${alert.message}</div>
              </div>
              <div class="field">
                <div class="field-label">Severity:</div>
                <div class="field-value">${alert.severity}</div>
              </div>
              <div class="field">
                <div class="field-label">Timestamp:</div>
                <div class="field-value">${alert.timestamp.toISOString()}</div>
              </div>
              <div class="field">
                <div class="field-label">Alert ID:</div>
                <div class="field-value">${alert.id}</div>
              </div>
              <div class="field">
                <div class="field-label">Tags:</div>
                <div class="field-value">
                  <div class="tags">
                    ${Object.entries(alert.tags).map(([k, v]) => `<span class="tag">${k}:${v}</span>`).join('')}
                  </div>
                </div>
              </div>
            </div>
            <div class="footer">
              <p>This alert was generated by HalluciFix Monitoring System</p>
              <p>Alert ID: ${alert.id}</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate plain text email content
   */
  private generateEmailText(alert: Alert): string {
    return `
ALERT NOTIFICATION
==================

Title: ${alert.title}
Message: ${alert.message}
Severity: ${alert.severity}
Timestamp: ${alert.timestamp.toISOString()}
Alert ID: ${alert.id}

Tags:
${Object.entries(alert.tags).map(([k, v]) => `  ${k}: ${v}`).join('\n')}

---
This alert was generated by HalluciFix Monitoring System
Alert ID: ${alert.id}
    `.trim();
  }

  /**
   * Simplified email sending (placeholder implementation)
   * In production, use a proper email service like nodemailer, SendGrid, etc.
   */
  private async sendEmail(emailData: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    // This is a placeholder implementation
    // In a real application, you would integrate with an email service
    logger.info("Email notification would be sent:", { {
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject
    } });
    
    // Simulate async email sending
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Test notification channel
   */
  async testNotification(channel: NotificationChannel): Promise<boolean> {
    const testAlert: Alert = {
      id: 'test-alert-' + Date.now(),
      ruleId: 'test-rule',
      title: 'Test Alert',
      message: 'This is a test alert to verify notification channel configuration.',
      severity: 'info',
      timestamp: new Date(),
      tags: { test: 'true', environment: 'test' },
      resolved: false,
      escalationLevel: 0
    };

    try {
      await this.sendNotification(channel, testAlert);
      return true;
    } catch (error) {
      console.error(`Test notification failed for ${channel}:`, error);
      return false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration (without sensitive data)
   */
  getConfigSummary(): Record<string, boolean> {
    return {
      slack: !!this.config.slack?.webhookUrl,
      email: !!this.config.email?.smtpHost,
      pagerduty: !!this.config.pagerduty?.integrationKey,
      webhook: !!this.config.webhook?.url
    };
  }
}

// Export singleton instance with default configuration
export const notificationService = new NotificationService({});