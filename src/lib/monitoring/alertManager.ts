/**
 * Alert Manager with Rule-Based Alerting
 * Comprehensive alerting system with configurable rules, thresholds, and escalation
 */

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: (metrics: any) => boolean;
  severity: AlertSeverity;
  cooldownMs: number;
  tags: string[];
  escalationRules?: EscalationRule[];
  enabled: boolean;
}

export interface EscalationRule {
  delayMs: number;
  severity: AlertSeverity;
  channels: NotificationChannel[];
}

export interface Alert {
  id: string;
  ruleId: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  timestamp: Date;
  tags: Record<string, string>;
  resolved: boolean;
  resolvedAt?: Date;
  escalationLevel: number;
  suppressedUntil?: Date;
}

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type NotificationChannel = 'slack' | 'email' | 'pagerduty' | 'webhook';

export interface AlertManagerConfig {
  maxAlerts: number;
  defaultCooldownMs: number;
  enableNoiseReduction: boolean;
  correlationWindowMs: number;
  maxEscalationLevel: number;
}

/**
 * Alert Manager - Core alerting system with rule-based alerting
 */
export class AlertManager {
  private alerts: Alert[] = [];
  private rules: AlertRule[] = [];
  private lastAlertTimes: Map<string, number> = new Map();
  private suppressedAlerts: Map<string, number> = new Map();
  private config: AlertManagerConfig;
  private notificationHandlers: Map<NotificationChannel, (alert: Alert) => Promise<void>> = new Map();

  constructor(config: Partial<AlertManagerConfig> = {}) {
    this.config = {
      maxAlerts: 1000,
      defaultCooldownMs: 5 * 60 * 1000, // 5 minutes
      enableNoiseReduction: true,
      correlationWindowMs: 10 * 60 * 1000, // 10 minutes
      maxEscalationLevel: 3,
      ...config
    };
  }

  /**
   * Add alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove alert rule
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(rule => rule.id !== ruleId);
  }

  /**
   * Update alert rule
   */
  updateRule(ruleId: string, updates: Partial<AlertRule>): void {
    const ruleIndex = this.rules.findIndex(rule => rule.id === ruleId);
    if (ruleIndex !== -1) {
      this.rules[ruleIndex] = { ...this.rules[ruleIndex], ...updates };
    }
  }

  /**
   * Get all rules
   */
  getRules(): AlertRule[] {
    return [...this.rules];
  }

  /**
   * Check rules against metrics and trigger alerts
   */
  async checkRules(metrics: any): Promise<void> {
    for (const rule of this.rules.filter(r => r.enabled)) {
      try {
        if (rule.condition(metrics)) {
          await this.triggerRuleAlert(rule, metrics);
        }
      } catch (error) {
        console.error(`Error evaluating rule ${rule.name}:`, error);
      }
    }
  }

  /**
   * Trigger alert for a rule
   */
  private async triggerRuleAlert(rule: AlertRule, metrics: any): Promise<void> {
    const now = Date.now();
    const lastAlert = this.lastAlertTimes.get(rule.id) || 0;
    
    // Check cooldown period
    if (now - lastAlert < rule.cooldownMs) {
      return;
    }

    // Check if alert is suppressed
    const suppressedUntil = this.suppressedAlerts.get(rule.id);
    if (suppressedUntil && now < suppressedUntil) {
      return;
    }

    this.lastAlertTimes.set(rule.id, now);

    const alert: Alert = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      title: `Alert: ${rule.name}`,
      message: this.generateRuleMessage(rule, metrics),
      severity: rule.severity,
      timestamp: new Date(),
      tags: this.extractTags(rule, metrics),
      resolved: false,
      escalationLevel: 0
    };

    // Add to alerts
    this.alerts.push(alert);
    
    // Maintain max alerts limit
    if (this.alerts.length > this.config.maxAlerts) {
      this.alerts = this.alerts.slice(-this.config.maxAlerts);
    }

    // Log alert
    console.warn(`Alert triggered: ${alert.title}`, {
      alertId: alert.id,
      severity: alert.severity,
      tags: alert.tags
    });

    // Send notifications
    await this.sendNotifications(alert);

    // Schedule escalation if configured
    if (rule.escalationRules && rule.escalationRules.length > 0) {
      this.scheduleEscalation(alert, rule.escalationRules[0]);
    }
  }

  /**
   * Send notifications for alert
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    const channels = this.getChannelsForSeverity(alert.severity);
    
    for (const channel of channels) {
      try {
        const handler = this.notificationHandlers.get(channel);
        if (handler) {
          await handler(alert);
        }
      } catch (error) {
        console.error(`Failed to send alert to ${channel}:`, error);
      }
    }
  }

  /**
   * Get notification channels for severity level
   */
  private getChannelsForSeverity(severity: AlertSeverity): NotificationChannel[] {
    switch (severity) {
      case 'info':
        return ['slack'];
      case 'warning':
        return ['slack'];
      case 'error':
        return ['slack', 'email'];
      case 'critical':
        return ['slack', 'email', 'pagerduty'];
      default:
        return ['slack'];
    }
  }

  /**
   * Schedule alert escalation
   */
  private scheduleEscalation(alert: Alert, escalationRule: EscalationRule): void {
    setTimeout(async () => {
      // Check if alert is still unresolved
      const currentAlert = this.alerts.find(a => a.id === alert.id);
      if (currentAlert && !currentAlert.resolved && currentAlert.escalationLevel < this.config.maxEscalationLevel) {
        currentAlert.escalationLevel++;
        currentAlert.severity = escalationRule.severity;
        
        console.warn(`Alert escalated: ${currentAlert.title}`, {
          alertId: currentAlert.id,
          escalationLevel: currentAlert.escalationLevel,
          newSeverity: currentAlert.severity
        });

        // Send escalated notifications
        for (const channel of escalationRule.channels) {
          try {
            const handler = this.notificationHandlers.get(channel);
            if (handler) {
              await handler(currentAlert);
            }
          } catch (error) {
            console.error(`Failed to send escalated alert to ${channel}:`, error);
          }
        }

        // Schedule next escalation if available
        const rule = this.rules.find(r => r.id === alert.ruleId);
        if (rule?.escalationRules && rule.escalationRules[currentAlert.escalationLevel]) {
          this.scheduleEscalation(currentAlert, rule.escalationRules[currentAlert.escalationLevel]);
        }
      }
    }, escalationRule.delayMs);
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      
      console.info(`Alert resolved: ${alert.title}`, {
        alertId: alert.id,
        resolutionTime: alert.resolvedAt.getTime() - alert.timestamp.getTime()
      });
    }
  }

  /**
   * Suppress alert rule for specified duration
   */
  suppressRule(ruleId: string, durationMs: number): void {
    const suppressUntil = Date.now() + durationMs;
    this.suppressedAlerts.set(ruleId, suppressUntil);
    
    console.info(`Alert rule suppressed: ${ruleId}`, {
      suppressedUntil: new Date(suppressUntil).toISOString()
    });
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): Alert[] {
    return [...this.alerts];
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: AlertSeverity): Alert[] {
    return this.alerts.filter(alert => alert.severity === severity);
  }

  /**
   * Get alert statistics
   */
  getAlertStats(): {
    total: number;
    active: number;
    resolved: number;
    bySeverity: Record<AlertSeverity, number>;
    averageResolutionTime: number;
  } {
    const active = this.alerts.filter(a => !a.resolved);
    const resolved = this.alerts.filter(a => a.resolved);
    
    const bySeverity = {
      info: this.alerts.filter(a => a.severity === 'info').length,
      warning: this.alerts.filter(a => a.severity === 'warning').length,
      error: this.alerts.filter(a => a.severity === 'error').length,
      critical: this.alerts.filter(a => a.severity === 'critical').length
    };

    const avgResolutionTime = resolved.length > 0 
      ? resolved.reduce((sum, alert) => {
          if (alert.resolvedAt) {
            return sum + (alert.resolvedAt.getTime() - alert.timestamp.getTime());
          }
          return sum;
        }, 0) / resolved.length
      : 0;

    return {
      total: this.alerts.length,
      active: active.length,
      resolved: resolved.length,
      bySeverity,
      averageResolutionTime: avgResolutionTime
    };
  }

  /**
   * Add notification handler
   */
  addNotificationHandler(channel: NotificationChannel, handler: (alert: Alert) => Promise<void>): void {
    this.notificationHandlers.set(channel, handler);
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate rule message
   */
  private generateRuleMessage(rule: AlertRule, metrics: any): string {
    return `Alert Rule "${rule.name}" triggered with metrics: ${JSON.stringify(metrics)}`;
  }

  /**
   * Extract tags from rule and metrics
   */
  private extractTags(rule: AlertRule, metrics: any): Record<string, string> {
    const tags: Record<string, string> = {};
    
    // Add rule tags
    rule.tags.forEach(tag => {
      tags[tag] = 'true';
    });

    // Add metric-based tags
    if (metrics.service) {
      tags.service = metrics.service;
    }
    if (metrics.environment) {
      tags.environment = metrics.environment;
    }

    return tags;
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(olderThanMs: number): void {
    const cutoff = Date.now() - olderThanMs;
    const initialCount = this.alerts.length;
    
    this.alerts = this.alerts.filter(alert => 
      alert.timestamp.getTime() > cutoff || !alert.resolved
    );

    const removedCount = initialCount - this.alerts.length;
    if (removedCount > 0) {
      console.info(`Cleared ${removedCount} old alerts`);
    }
  }
}

// Export singleton instance
export const alertManager = new AlertManager();