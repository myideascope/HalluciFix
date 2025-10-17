/**
 * Alerting Configuration
 * Configuration management for the integrated alert system
 */

import type { IntegratedAlertConfig } from '../monitoring/integratedAlertSystem';
import type { NotificationConfig } from '../monitoring/notificationService';

export interface AlertingEnvironmentConfig {
  slack?: {
    webhookUrl?: string;
    channel?: string;
    username?: string;
  };
  email?: {
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPassword?: string;
    fromEmail?: string;
    toEmails?: string[];
  };
  pagerduty?: {
    integrationKey?: string;
    serviceKey?: string;
  };
  webhook?: {
    url?: string;
    headers?: Record<string, string>;
  };
}

/**
 * Load alerting configuration from environment variables
 */
export function loadAlertingConfig(): IntegratedAlertConfig {
  const notificationConfig: NotificationConfig = {};

  // Slack configuration
  if (process.env.SLACK_WEBHOOK_URL) {
    notificationConfig.slack = {
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
      channel: process.env.SLACK_CHANNEL || '#alerts',
      username: process.env.SLACK_USERNAME || 'HalluciFix Alerts'
    };
  }

  // Email configuration
  if (process.env.SMTP_HOST) {
    notificationConfig.email = {
      smtpHost: process.env.SMTP_HOST,
      smtpPort: parseInt(process.env.SMTP_PORT || '587'),
      smtpUser: process.env.SMTP_USER || '',
      smtpPassword: process.env.SMTP_PASSWORD || '',
      fromEmail: process.env.ALERT_FROM_EMAIL || 'alerts@hallucifix.com',
      toEmails: process.env.ALERT_TO_EMAILS?.split(',') || []
    };
  }

  // PagerDuty configuration
  if (process.env.PAGERDUTY_INTEGRATION_KEY) {
    notificationConfig.pagerduty = {
      integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
      serviceKey: process.env.PAGERDUTY_SERVICE_KEY
    };
  }

  // Webhook configuration
  if (process.env.ALERT_WEBHOOK_URL) {
    notificationConfig.webhook = {
      url: process.env.ALERT_WEBHOOK_URL,
      headers: process.env.ALERT_WEBHOOK_HEADERS 
        ? JSON.parse(process.env.ALERT_WEBHOOK_HEADERS)
        : undefined
    };
  }

  return {
    alertManager: {
      maxAlerts: parseInt(process.env.MAX_ALERTS || '1000'),
      defaultCooldownMs: parseInt(process.env.DEFAULT_COOLDOWN_MS || '300000') // 5 minutes
    },
    notifications: notificationConfig,
    intelligentAlerting: {
      correlationWindowMs: parseInt(process.env.CORRELATION_WINDOW_MS || '600000'), // 10 minutes
      minCorrelationConfidence: parseFloat(process.env.MIN_CORRELATION_CONFIDENCE || '0.7'),
      enableSmartGrouping: process.env.ENABLE_SMART_GROUPING !== 'false',
      enableCascadeDetection: process.env.ENABLE_CASCADE_DETECTION !== 'false'
    }
  };
}

/**
 * Validate alerting configuration
 */
export function validateAlertingConfig(config: IntegratedAlertConfig): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if at least one notification channel is configured
  const hasSlack = !!config.notifications?.slack?.webhookUrl;
  const hasEmail = !!config.notifications?.email?.smtpHost;
  const hasPagerDuty = !!config.notifications?.pagerduty?.integrationKey;
  const hasWebhook = !!config.notifications?.webhook?.url;

  if (!hasSlack && !hasEmail && !hasPagerDuty && !hasWebhook) {
    warnings.push('No notification channels configured - alerts will only be logged');
  }

  // Validate Slack configuration
  if (config.notifications?.slack && !config.notifications.slack.webhookUrl) {
    errors.push('Slack webhook URL is required when Slack is configured');
  }

  // Validate email configuration
  if (config.notifications?.email) {
    const email = config.notifications.email;
    if (!email.smtpHost) {
      errors.push('SMTP host is required when email is configured');
    }
    if (!email.fromEmail) {
      errors.push('From email is required when email is configured');
    }
    if (!email.toEmails || email.toEmails.length === 0) {
      errors.push('At least one recipient email is required when email is configured');
    }
  }

  // Validate PagerDuty configuration
  if (config.notifications?.pagerduty && !config.notifications.pagerduty.integrationKey) {
    errors.push('PagerDuty integration key is required when PagerDuty is configured');
  }

  // Validate webhook configuration
  if (config.notifications?.webhook && !config.notifications.webhook.url) {
    errors.push('Webhook URL is required when webhook is configured');
  }

  // Validate alert manager configuration
  if (config.alertManager?.maxAlerts && config.alertManager.maxAlerts < 100) {
    warnings.push('Max alerts is set very low - consider increasing for better alert history');
  }

  if (config.alertManager?.defaultCooldownMs && config.alertManager.defaultCooldownMs < 60000) {
    warnings.push('Default cooldown is very short - may cause alert spam');
  }

  // Validate intelligent alerting configuration
  if (config.intelligentAlerting?.correlationWindowMs && config.intelligentAlerting.correlationWindowMs < 60000) {
    warnings.push('Correlation window is very short - may miss related alerts');
  }

  if (config.intelligentAlerting?.minCorrelationConfidence && 
      (config.intelligentAlerting.minCorrelationConfidence < 0.1 || config.intelligentAlerting.minCorrelationConfidence > 1.0)) {
    errors.push('Minimum correlation confidence must be between 0.1 and 1.0');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get default alerting configuration
 */
export function getDefaultAlertingConfig(): IntegratedAlertConfig {
  return {
    alertManager: {
      maxAlerts: 1000,
      defaultCooldownMs: 5 * 60 * 1000 // 5 minutes
    },
    notifications: {
      // No default notification channels - must be configured
    },
    intelligentAlerting: {
      correlationWindowMs: 10 * 60 * 1000, // 10 minutes
      minCorrelationConfidence: 0.7,
      enableSmartGrouping: true,
      enableCascadeDetection: true
    }
  };
}

/**
 * Merge configurations with defaults
 */
export function mergeAlertingConfig(
  userConfig: Partial<IntegratedAlertConfig>,
  defaultConfig: IntegratedAlertConfig = getDefaultAlertingConfig()
): IntegratedAlertConfig {
  return {
    alertManager: {
      ...defaultConfig.alertManager,
      ...userConfig.alertManager
    },
    notifications: {
      ...defaultConfig.notifications,
      ...userConfig.notifications
    },
    intelligentAlerting: {
      ...defaultConfig.intelligentAlerting,
      ...userConfig.intelligentAlerting
    }
  };
}

/**
 * Export configuration utilities
 */
export const alertingConfig = {
  load: loadAlertingConfig,
  validate: validateAlertingConfig,
  getDefault: getDefaultAlertingConfig,
  merge: mergeAlertingConfig
};