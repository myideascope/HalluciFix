/**
 * Integrated Alert System
 * Combines AlertManager, NotificationService, and IntelligentAlerting
 * for a complete automated alerting and incident response system
 */

import { AlertManager, type Alert, type AlertRule, type AlertSeverity } from './alertManager';
import { NotificationService, type NotificationConfig } from './notificationService';
import { IntelligentAlertingSystem } from './intelligentAlerting';

import { logger } from './logging';
export interface IntegratedAlertConfig {
  alertManager?: {
    maxAlerts?: number;
    defaultCooldownMs?: number;
  };
  notifications?: NotificationConfig;
  intelligentAlerting?: {
    correlationWindowMs?: number;
    minCorrelationConfidence?: number;
    enableSmartGrouping?: boolean;
    enableCascadeDetection?: boolean;
  };
}

export interface AlertSystemStats {
  totalAlerts: number;
  activeAlerts: number;
  resolvedAlerts: number;
  suppressedAlerts: number;
  correlatedAlerts: number;
  notificationsSent: number;
  averageResolutionTime: number;
}

/**
 * Integrated Alert System
 * Complete alerting solution with intelligent processing and multi-channel notifications
 */
export class IntegratedAlertSystem {
  private alertManager: AlertManager;
  private notificationService: NotificationService;
  private intelligentAlerting: IntelligentAlertingSystem;
  private notificationsSent: number = 0;
  private isInitialized: boolean = false;

  constructor(config: IntegratedAlertConfig = {}) {
    this.alertManager = new AlertManager(config.alertManager);
    this.notificationService = new NotificationService(config.notifications || {});
    this.intelligentAlerting = new IntelligentAlertingSystem(config.intelligentAlerting);

    this.setupIntegration();
  }

  /**
   * Initialize the integrated alert system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Setup default alert rules
    this.setupDefaultAlertRules();

    // Setup notification handlers
    this.setupNotificationHandlers();

    // Test notification channels
    await this.testNotificationChannels();

    this.isInitialized = true;
    logger.info("Integrated Alert System initialized successfully");
  }

  /**
   * Setup integration between components
   */
  private setupIntegration(): void {
    // Override alert manager's notification handling with intelligent processing
    this.alertManager.addNotificationHandler('slack', async (alert: Alert) => {
      await this.processAlertWithIntelligence(alert);
    });

    this.alertManager.addNotificationHandler('email', async (alert: Alert) => {
      await this.processAlertWithIntelligence(alert);
    });

    this.alertManager.addNotificationHandler('pagerduty', async (alert: Alert) => {
      await this.processAlertWithIntelligence(alert);
    });
  }

  /**
   * Process alert through intelligent alerting system
   */
  private async processAlertWithIntelligence(alert: Alert): Promise<void> {
    try {
      const result = await this.intelligentAlerting.processAlert(alert);

      if (result.shouldNotify) {
        // Send notifications based on priority and severity
        const channels = this.getNotificationChannels(alert.severity, result.priority.score);
        
        for (const channel of channels) {
          try {
            await this.notificationService.sendNotification(channel, alert);
            this.notificationsSent++;
          } catch (error) {
            console.error(`Failed to send notification via ${channel}:`, error);
          }
        }

        console.info(`Alert notification sent: ${alert.title}`, {
          alertId: alert.id,
          priority: result.priority.score,
          channels: channels.join(', '),
          correlationId: result.correlationId
        });
      } else {
        console.debug(`Alert suppressed: ${alert.title}`, {
          alertId: alert.id,
          reason: result.suppressionReason,
          correlationId: result.correlationId
        });
      }
    } catch (error) {
      logger.error("Error processing alert with intelligence:", error instanceof Error ? error : new Error(String(error)));
      // Fallback to direct notification for critical alerts
      if (alert.severity === 'critical') {
        await this.notificationService.sendNotification('slack', alert);
        this.notificationsSent++;
      }
    }
  }

  /**
   * Get notification channels based on severity and priority
   */
  private getNotificationChannels(severity: AlertSeverity, priority: number): Array<'slack' | 'email' | 'pagerduty'> {
    const channels: Array<'slack' | 'email' | 'pagerduty'> = [];

    // Always include Slack for visibility
    channels.push('slack');

    // Add email for higher severity or priority
    if (severity === 'error' || severity === 'critical' || priority >= 0.8) {
      channels.push('email');
    }

    // Add PagerDuty for critical alerts with high priority
    if (severity === 'critical' && priority >= 0.9) {
      channels.push('pagerduty');
    }

    return channels;
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultAlertRules(): void {
    const defaultRules: Omit<AlertRule, 'id'>[] = [
      {
        name: 'High Error Rate',
        description: 'Triggers when error rate exceeds 5%',
        condition: (metrics) => metrics.errorRate > 0.05,
        severity: 'error',
        cooldownMs: 10 * 60 * 1000, // 10 minutes
        tags: ['performance', 'errors'],
        enabled: true
      },
      {
        name: 'Critical Error Rate',
        description: 'Triggers when error rate exceeds 10%',
        condition: (metrics) => metrics.errorRate > 0.10,
        severity: 'critical',
        cooldownMs: 5 * 60 * 1000, // 5 minutes
        tags: ['performance', 'errors', 'critical'],
        escalationRules: [
          {
            delayMs: 15 * 60 * 1000, // 15 minutes
            severity: 'critical',
            channels: ['slack', 'email', 'pagerduty']
          }
        ],
        enabled: true
      },
      {
        name: 'High Response Time',
        description: 'Triggers when average response time exceeds 2 seconds',
        condition: (metrics) => metrics.avgResponseTime > 2000,
        severity: 'warning',
        cooldownMs: 15 * 60 * 1000, // 15 minutes
        tags: ['performance', 'latency'],
        enabled: true
      },
      {
        name: 'Database Connection Failed',
        description: 'Triggers when database connection fails',
        condition: (metrics) => metrics.dbConnectionFailed === true,
        severity: 'critical',
        cooldownMs: 2 * 60 * 1000, // 2 minutes
        tags: ['database', 'connectivity'],
        escalationRules: [
          {
            delayMs: 5 * 60 * 1000, // 5 minutes
            severity: 'critical',
            channels: ['slack', 'email', 'pagerduty']
          }
        ],
        enabled: true
      },
      {
        name: 'High Memory Usage',
        description: 'Triggers when memory usage exceeds 85%',
        condition: (metrics) => metrics.memoryUsage > 0.85,
        severity: 'warning',
        cooldownMs: 20 * 60 * 1000, // 20 minutes
        tags: ['infrastructure', 'memory'],
        enabled: true
      },
      {
        name: 'Critical Memory Usage',
        description: 'Triggers when memory usage exceeds 95%',
        condition: (metrics) => metrics.memoryUsage > 0.95,
        severity: 'critical',
        cooldownMs: 5 * 60 * 1000, // 5 minutes
        tags: ['infrastructure', 'memory', 'critical'],
        enabled: true
      },
      {
        name: 'Service Unavailable',
        description: 'Triggers when service health check fails',
        condition: (metrics) => metrics.serviceHealth === 'unhealthy',
        severity: 'critical',
        cooldownMs: 3 * 60 * 1000, // 3 minutes
        tags: ['service', 'health'],
        escalationRules: [
          {
            delayMs: 10 * 60 * 1000, // 10 minutes
            severity: 'critical',
            channels: ['slack', 'email', 'pagerduty']
          }
        ],
        enabled: true
      }
    ];

    defaultRules.forEach(rule => {
      this.alertManager.addRule({
        ...rule,
        id: this.generateRuleId(rule.name)
      });
    });
  }

  /**
   * Setup notification handlers
   */
  private setupNotificationHandlers(): void {
    // The integration is handled in setupIntegration()
    // This method can be extended for additional custom handlers
  }

  /**
   * Test notification channels
   */
  private async testNotificationChannels(): Promise<void> {
    const channels: Array<'slack' | 'email' | 'pagerduty'> = ['slack', 'email', 'pagerduty'];
    
    for (const channel of channels) {
      try {
        const isWorking = await this.notificationService.testNotification(channel);
        console.info(`Notification channel ${channel}: ${isWorking ? 'OK' : 'FAILED'}`);
      } catch (error) {
        console.warn(`Notification channel ${channel} test failed:`, error);
      }
    }
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: Omit<AlertRule, 'id'>): string {
    const ruleWithId: AlertRule = {
      ...rule,
      id: this.generateRuleId(rule.name)
    };
    
    this.alertManager.addRule(ruleWithId);
    return ruleWithId.id;
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): void {
    this.alertManager.removeRule(ruleId);
  }

  /**
   * Update alert rule
   */
  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): void {
    this.alertManager.updateRule(ruleId, updates);
  }

  /**
   * Check metrics against all rules
   */
  async checkMetrics(metrics: any): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await this.alertManager.checkRules(metrics);
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): void {
    this.alertManager.resolveAlert(alertId);
  }

  /**
   * Suppress alert rule
   */
  suppressRule(ruleId: string, durationMs: number): void {
    this.alertManager.suppressRule(ruleId, durationMs);
  }

  /**
   * Get system statistics
   */
  getSystemStats(): AlertSystemStats {
    const alertStats = this.alertManager.getAlertStats();
    const correlationStats = this.intelligentAlerting.getCorrelationStats();

    return {
      totalAlerts: alertStats.total,
      activeAlerts: alertStats.active,
      resolvedAlerts: alertStats.resolved,
      suppressedAlerts: correlationStats.suppressedAlerts,
      correlatedAlerts: correlationStats.totalAlertsCorrelated,
      notificationsSent: this.notificationsSent,
      averageResolutionTime: alertStats.averageResolutionTime
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alertManager.getActiveAlerts();
  }

  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return this.alertManager.getRules();
  }

  /**
   * Get active correlations
   */
  getActiveCorrelations() {
    return this.intelligentAlerting.getActiveCorrelations();
  }

  /**
   * Update notification configuration
   */
  updateNotificationConfig(config: Partial<NotificationConfig>): void {
    this.notificationService.updateConfig(config);
  }

  /**
   * Get notification configuration summary
   */
  getNotificationConfigSummary(): Record<string, boolean> {
    return this.notificationService.getConfigSummary();
  }

  /**
   * Add business impact rule for intelligent alerting
   */
  addBusinessImpactRule(ruleId: string, impact: number): void {
    this.intelligentAlerting.addBusinessImpactRule(ruleId, impact);
  }

  /**
   * Generate rule ID
   */
  private generateRuleId(name: string): string {
    return `rule_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  }

  /**
   * Cleanup old data
   */
  cleanup(): void {
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    this.alertManager.clearOldAlerts(oneWeekMs);
  }

  /**
   * Shutdown the alert system
   */
  shutdown(): void {
    this.cleanup();
    logger.info("Integrated Alert System shutdown complete");
  }
}

// Export singleton instance
export const integratedAlertSystem = new IntegratedAlertSystem();