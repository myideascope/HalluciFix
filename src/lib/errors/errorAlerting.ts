/**
 * Real-time Error Alerting System
 * Provides critical error alerts, threshold-based alerting, and escalation
 */

import { ApiError, ErrorContext, ErrorSeverity, ErrorType } from './types';
import { ErrorGroup, ErrorImpact, errorGrouping } from './errorGrouping';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Alert types
 */
export enum AlertType {
  ERROR_THRESHOLD = 'error_threshold',
  ERROR_SPIKE = 'error_spike',
  CRITICAL_ERROR = 'critical_error',
  ERROR_REGRESSION = 'error_regression',
  USER_IMPACT = 'user_impact',
  SYSTEM_DEGRADATION = 'system_degradation'
}

/**
 * Alert configuration
 */
export interface AlertRule {
  id: string;
  name: string;
  type: AlertType;
  severity: AlertSeverity;
  enabled: boolean;
  conditions: AlertCondition[];
  cooldownMinutes: number;
  channels: AlertChannel[];
  escalation?: EscalationRule;
}

/**
 * Alert condition
 */
export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  value: number;
  timeWindow?: number; // minutes
}

/**
 * Alert channels
 */
export enum AlertChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  SMS = 'sms',
  PAGERDUTY = 'pagerduty'
}

/**
 * Escalation rule
 */
export interface EscalationRule {
  levels: EscalationLevel[];
}

/**
 * Escalation level
 */
export interface EscalationLevel {
  delayMinutes: number;
  channels: AlertChannel[];
  recipients: string[];
}

/**
 * Alert instance
 */
export interface Alert {
  id: string;
  ruleId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  errorGroupId?: string;
  metadata: Record<string, any>;
  escalationLevel: number;
  nextEscalationAt?: Date;
}

/**
 * Alert notification
 */
export interface AlertNotification {
  alertId: string;
  channel: AlertChannel;
  recipient: string;
  sentAt: Date;
  success: boolean;
  error?: string;
}

/**
 * Real-time Error Alerting Service
 */
export class ErrorAlertingService {
  private static instance: ErrorAlertingService;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private notifications: AlertNotification[] = [];
  private lastAlertTimes: Map<string, Date> = new Map();
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    this.setupDefaultRules();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ErrorAlertingService {
    if (!ErrorAlertingService.instance) {
      ErrorAlertingService.instance = new ErrorAlertingService();
    }
    return ErrorAlertingService.instance;
  }

  /**
   * Process error and check for alert conditions
   */
  public async processError(error: ApiError, context: ErrorContext = {}): Promise<void> {
    const groupId = errorGrouping.processError(error, context);
    const group = errorGrouping.getErrorGroup(groupId);
    
    if (!group) return;

    // Check all alert rules
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      if (await this.evaluateRule(rule, error, group, context)) {
        await this.triggerAlert(rule, error, group, context);
      }
    }
  }

  /**
   * Add alert rule
   */
  public addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
  }

  /**
   * Remove alert rule
   */
  public removeAlertRule(ruleId: string): boolean {
    return this.alertRules.delete(ruleId);
  }

  /**
   * Get alert rule
   */
  public getAlertRule(ruleId: string): AlertRule | undefined {
    return this.alertRules.get(ruleId);
  }

  /**
   * Get all alert rules
   */
  public getAllAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  public getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(0, limit);
  }

  /**
   * Resolve alert
   */
  public resolveAlert(alertId: string, resolvedBy?: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date();
    alert.resolvedBy = resolvedBy;

    // Move to history
    this.alertHistory.unshift(alert);
    this.activeAlerts.delete(alertId);

    // Cancel escalation timer
    const timer = this.escalationTimers.get(alertId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(alertId);
    }

    return true;
  }

  /**
   * Get alert statistics
   */
  public getStatistics(): {
    activeAlerts: number;
    totalAlerts: number;
    criticalAlerts: number;
    resolvedAlerts: number;
    averageResolutionTime: number;
  } {
    const activeAlerts = this.activeAlerts.size;
    const totalAlerts = this.alertHistory.length + activeAlerts;
    const criticalAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.severity === AlertSeverity.CRITICAL).length;
    const resolvedAlerts = this.alertHistory.filter(alert => alert.resolved).length;

    // Calculate average resolution time
    const resolvedWithTime = this.alertHistory.filter(alert => 
      alert.resolved && alert.resolvedAt
    );
    const totalResolutionTime = resolvedWithTime.reduce((sum, alert) => {
      const resolutionTime = alert.resolvedAt!.getTime() - alert.timestamp.getTime();
      return sum + resolutionTime;
    }, 0);
    const averageResolutionTime = resolvedWithTime.length > 0 
      ? totalResolutionTime / resolvedWithTime.length 
      : 0;

    return {
      activeAlerts,
      totalAlerts,
      criticalAlerts,
      resolvedAlerts,
      averageResolutionTime
    };
  }

  // Private helper methods

  /**
   * Setup default alert rules
   */
  private setupDefaultRules(): void {
    // Critical error rule
    this.addAlertRule({
      id: 'critical-errors',
      name: 'Critical Errors',
      type: AlertType.CRITICAL_ERROR,
      severity: AlertSeverity.CRITICAL,
      enabled: true,
      conditions: [
        { metric: 'error.severity', operator: 'eq', value: 4 } // CRITICAL = 4
      ],
      cooldownMinutes: 5,
      channels: [AlertChannel.EMAIL, AlertChannel.SLACK, AlertChannel.PAGERDUTY],
      escalation: {
        levels: [
          {
            delayMinutes: 15,
            channels: [AlertChannel.SMS, AlertChannel.PAGERDUTY],
            recipients: ['oncall@company.com']
          }
        ]
      }
    });

    // Error spike rule
    this.addAlertRule({
      id: 'error-spike',
      name: 'Error Spike Detected',
      type: AlertType.ERROR_SPIKE,
      severity: AlertSeverity.ERROR,
      enabled: true,
      conditions: [
        { metric: 'group.trend.changeRate', operator: 'gt', value: 100 }, // 100% increase
        { metric: 'group.count', operator: 'gt', value: 10 } // At least 10 errors
      ],
      cooldownMinutes: 30,
      channels: [AlertChannel.EMAIL, AlertChannel.SLACK]
    });

    // High user impact rule
    this.addAlertRule({
      id: 'high-user-impact',
      name: 'High User Impact',
      type: AlertType.USER_IMPACT,
      severity: AlertSeverity.ERROR,
      enabled: true,
      conditions: [
        { metric: 'impact.userImpact.impactPercentage', operator: 'gt', value: 10 } // 10% of users affected
      ],
      cooldownMinutes: 15,
      channels: [AlertChannel.EMAIL, AlertChannel.SLACK]
    });

    // Error regression rule
    this.addAlertRule({
      id: 'error-regression',
      name: 'Error Regression Detected',
      type: AlertType.ERROR_REGRESSION,
      severity: AlertSeverity.WARNING,
      enabled: true,
      conditions: [
        { metric: 'group.regressed', operator: 'eq', value: 1 } // Boolean: regressed
      ],
      cooldownMinutes: 60,
      channels: [AlertChannel.EMAIL, AlertChannel.SLACK]
    });
  }

  /**
   * Evaluate alert rule conditions
   */
  private async evaluateRule(
    rule: AlertRule, 
    error: ApiError, 
    group: ErrorGroup, 
    context: ErrorContext
  ): Promise<boolean> {
    // Check cooldown period
    const lastAlert = this.lastAlertTimes.get(rule.id);
    if (lastAlert) {
      const cooldownMs = rule.cooldownMinutes * 60 * 1000;
      if (Date.now() - lastAlert.getTime() < cooldownMs) {
        return false;
      }
    }

    // Get error impact for evaluation
    const impact = errorGrouping.getErrorImpact(group.fingerprint.id);
    const regressed = errorGrouping.checkForRegression(group.fingerprint.id);

    // Evaluate all conditions
    for (const condition of rule.conditions) {
      const value = this.getMetricValue(condition.metric, error, group, impact, regressed);
      if (!this.evaluateCondition(condition, value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get metric value for condition evaluation
   */
  private getMetricValue(
    metric: string, 
    error: ApiError, 
    group: ErrorGroup, 
    impact?: ErrorImpact,
    regressed?: boolean
  ): number {
    switch (metric) {
      case 'error.severity':
        return this.getSeverityWeight(error.severity);
      case 'group.count':
        return group.count;
      case 'group.trend.changeRate':
        return group.trend.changeRate;
      case 'group.affectedUsers':
        return group.affectedUsers.size;
      case 'impact.userImpact.impactPercentage':
        return impact?.userImpact.impactPercentage || 0;
      case 'impact.systemImpact.criticalityScore':
        return impact?.systemImpact.criticalityScore || 0;
      case 'group.regressed':
        return regressed ? 1 : 0;
      default:
        return 0;
    }
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case 'gt': return value > condition.value;
      case 'gte': return value >= condition.value;
      case 'lt': return value < condition.value;
      case 'lte': return value <= condition.value;
      case 'eq': return value === condition.value;
      case 'neq': return value !== condition.value;
      default: return false;
    }
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(
    rule: AlertRule, 
    error: ApiError, 
    group: ErrorGroup, 
    context: ErrorContext
  ): Promise<void> {
    const alertId = this.generateAlertId();
    const impact = errorGrouping.getErrorImpact(group.fingerprint.id);

    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      type: rule.type,
      severity: rule.severity,
      title: this.generateAlertTitle(rule, error, group),
      message: this.generateAlertMessage(rule, error, group, impact),
      timestamp: new Date(),
      resolved: false,
      errorGroupId: group.fingerprint.id,
      metadata: {
        errorId: error.errorId,
        errorType: error.type,
        component: context.component,
        url: error.url || context.url,
        userAgent: error.userAgent,
        userId: error.userId,
        sessionId: error.sessionId,
        groupCount: group.count,
        affectedUsers: group.affectedUsers.size,
        impact
      },
      escalationLevel: 0
    };

    // Store alert
    this.activeAlerts.set(alertId, alert);
    this.lastAlertTimes.set(rule.id, new Date());

    // Send notifications
    await this.sendNotifications(alert, rule.channels);

    // Setup escalation if configured
    if (rule.escalation && rule.escalation.levels.length > 0) {
      this.setupEscalation(alert, rule.escalation);
    }

    console.log(`Alert triggered: ${alert.title}`);
  }

  /**
   * Send alert notifications
   */
  private async sendNotifications(alert: Alert, channels: AlertChannel[]): Promise<void> {
    const promises = channels.map(channel => this.sendNotification(alert, channel));
    await Promise.allSettled(promises);
  }

  /**
   * Send notification to specific channel
   */
  private async sendNotification(alert: Alert, channel: AlertChannel): Promise<void> {
    const notification: AlertNotification = {
      alertId: alert.id,
      channel,
      recipient: this.getDefaultRecipient(channel),
      sentAt: new Date(),
      success: false
    };

    try {
      switch (channel) {
        case AlertChannel.EMAIL:
          await this.sendEmailNotification(alert);
          break;
        case AlertChannel.SLACK:
          await this.sendSlackNotification(alert);
          break;
        case AlertChannel.WEBHOOK:
          await this.sendWebhookNotification(alert);
          break;
        case AlertChannel.SMS:
          await this.sendSMSNotification(alert);
          break;
        case AlertChannel.PAGERDUTY:
          await this.sendPagerDutyNotification(alert);
          break;
      }
      notification.success = true;
    } catch (error) {
      notification.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to send ${channel} notification:`, error);
    }

    this.notifications.push(notification);
  }

  /**
   * Setup escalation timer
   */
  private setupEscalation(alert: Alert, escalation: EscalationRule): void {
    const level = escalation.levels[0];
    if (!level) return;

    const timer = setTimeout(async () => {
      if (this.activeAlerts.has(alert.id) && !alert.resolved) {
        alert.escalationLevel++;
        alert.nextEscalationAt = undefined;
        
        await this.sendNotifications(alert, level.channels);
        
        // Setup next escalation level if available
        const nextLevel = escalation.levels[alert.escalationLevel];
        if (nextLevel) {
          this.setupEscalation(alert, { levels: [nextLevel] });
        }
      }
    }, level.delayMinutes * 60 * 1000);

    this.escalationTimers.set(alert.id, timer);
    alert.nextEscalationAt = new Date(Date.now() + level.delayMinutes * 60 * 1000);
  }

  /**
   * Generate alert title
   */
  private generateAlertTitle(rule: AlertRule, error: ApiError, group: ErrorGroup): string {
    switch (rule.type) {
      case AlertType.CRITICAL_ERROR:
        return `Critical Error: ${error.type} in ${group.fingerprint.component || 'Unknown Component'}`;
      case AlertType.ERROR_SPIKE:
        return `Error Spike: ${group.count} errors (${group.trend.changeRate.toFixed(1)}% increase)`;
      case AlertType.USER_IMPACT:
        return `High User Impact: ${group.affectedUsers.size} users affected`;
      case AlertType.ERROR_REGRESSION:
        return `Error Regression: ${group.fingerprint.normalizedMessage}`;
      default:
        return `Alert: ${rule.name}`;
    }
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(
    rule: AlertRule, 
    error: ApiError, 
    group: ErrorGroup, 
    impact?: ErrorImpact
  ): string {
    const lines = [
      `Alert: ${rule.name}`,
      `Severity: ${rule.severity.toUpperCase()}`,
      `Error Type: ${error.type}`,
      `Component: ${group.fingerprint.component || 'Unknown'}`,
      `Message: ${error.message}`,
      ``,
      `Group Statistics:`,
      `- Total Occurrences: ${group.count}`,
      `- Affected Users: ${group.affectedUsers.size}`,
      `- First Seen: ${group.firstSeen.toISOString()}`,
      `- Last Seen: ${group.lastSeen.toISOString()}`,
      `- Trend: ${group.trend.isIncreasing ? 'Increasing' : 'Stable'} (${group.trend.changeRate.toFixed(1)}% change)`
    ];

    if (impact) {
      lines.push(
        ``,
        `Impact Assessment:`,
        `- User Impact: ${impact.userImpact.impactPercentage.toFixed(2)}% of users`,
        `- Criticality Score: ${impact.systemImpact.criticalityScore}/100`,
        `- Feature Availability: ${impact.businessImpact.featureAvailability.toFixed(1)}%`
      );
    }

    return lines.join('\n');
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get severity weight
   */
  private getSeverityWeight(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return 4;
      case ErrorSeverity.HIGH: return 3;
      case ErrorSeverity.MEDIUM: return 2;
      case ErrorSeverity.LOW: return 1;
      default: return 0;
    }
  }

  /**
   * Get default recipient for channel
   */
  private getDefaultRecipient(channel: AlertChannel): string {
    switch (channel) {
      case AlertChannel.EMAIL: return 'alerts@company.com';
      case AlertChannel.SLACK: return '#alerts';
      case AlertChannel.WEBHOOK: return 'webhook-endpoint';
      case AlertChannel.SMS: return '+1234567890';
      case AlertChannel.PAGERDUTY: return 'pagerduty-service';
      default: return 'unknown';
    }
  }

  // Notification methods (mock implementations)
  private async sendEmailNotification(alert: Alert): Promise<void> {
    console.log(`[EMAIL] ${alert.title}`);
    // Implementation would integrate with email service
  }

  private async sendSlackNotification(alert: Alert): Promise<void> {
    console.log(`[SLACK] ${alert.title}`);
    // Implementation would integrate with Slack API
  }

  private async sendWebhookNotification(alert: Alert): Promise<void> {
    console.log(`[WEBHOOK] ${alert.title}`);
    // Implementation would send HTTP POST to webhook URL
  }

  private async sendSMSNotification(alert: Alert): Promise<void> {
    console.log(`[SMS] ${alert.title}`);
    // Implementation would integrate with SMS service
  }

  private async sendPagerDutyNotification(alert: Alert): Promise<void> {
    console.log(`[PAGERDUTY] ${alert.title}`);
    // Implementation would integrate with PagerDuty API
  }
}

// Export singleton instance
export const errorAlerting = ErrorAlertingService.getInstance();