/**
 * Real-time Error Monitoring System
 * Provides configurable thresholds, rate monitoring, and alert triggering
 */

import { ApiError, ErrorSeverity, ErrorType } from './types';
import { ErrorLogEntry } from './errorManager';
import { incidentManager } from './incidentManager';

import { logger } from '../logging';
/**
 * Monitoring threshold configuration
 */
export interface MonitoringThreshold {
  id: string;
  name: string;
  description: string;
  condition: ThresholdCondition;
  actions: AlertAction[];
  enabled: boolean;
  cooldownPeriod: number; // milliseconds
  lastTriggered?: string;
}

/**
 * Threshold condition types
 */
export interface ThresholdCondition {
  type: 'error_rate' | 'error_count' | 'severity_count' | 'error_type_count';
  timeWindow: number; // milliseconds
  threshold: number;
  severity?: ErrorSeverity;
  errorType?: ErrorType;
  operator: 'greater_than' | 'greater_equal' | 'less_than' | 'less_equal' | 'equal';
}

/**
 * Alert action configuration
 */
export interface AlertAction {
  type: 'console' | 'notification' | 'webhook' | 'email' | 'sentry';
  config: Record<string, any>;
  message?: string;
}

/**
 * Monitoring metrics
 */
export interface MonitoringMetrics {
  timestamp: string;
  errorRate: number; // errors per minute
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  criticalErrors: number;
  highSeverityErrors: number;
  recentErrors: ErrorLogEntry[];
}

/**
 * Alert event
 */
export interface AlertEvent {
  id: string;
  thresholdId: string;
  thresholdName: string;
  timestamp: string;
  condition: ThresholdCondition;
  actualValue: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  resolved: boolean;
  resolvedAt?: string;
}

/**
 * Real-time Error Monitor
 */
export class ErrorMonitor {
  private static instance: ErrorMonitor;
  private thresholds: Map<string, MonitoringThreshold> = new Map();
  private metrics: MonitoringMetrics;
  private alertHistory: AlertEvent[] = [];
  private metricsUpdateInterval?: NodeJS.Timeout;
  private alertListeners: Set<(alert: AlertEvent) => void> = new Set();
  private metricsListeners: Set<(metrics: MonitoringMetrics) => void> = new Set();

  private constructor() {
    this.metrics = this.initializeMetrics();
    this.setupDefaultThresholds();
    this.startMetricsCollection();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ErrorMonitor {
    if (!ErrorMonitor.instance) {
      ErrorMonitor.instance = new ErrorMonitor();
    }
    return ErrorMonitor.instance;
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): MonitoringMetrics {
    return {
      timestamp: new Date().toISOString(),
      errorRate: 0,
      totalErrors: 0,
      errorsByType: {} as Record<ErrorType, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      criticalErrors: 0,
      highSeverityErrors: 0,
      recentErrors: []
    };
  }

  /**
   * Setup default monitoring thresholds
   */
  private setupDefaultThresholds(): void {
    const defaultThresholds: MonitoringThreshold[] = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        description: 'Triggers when error rate exceeds 10 errors per minute',
        condition: {
          type: 'error_rate',
          timeWindow: 60000, // 1 minute
          threshold: 10,
          operator: 'greater_than'
        },
        actions: [
          {
            type: 'console',
            config: {},
            message: 'High error rate detected'
          },
          {
            type: 'notification',
            config: { title: 'High Error Rate Alert' },
            message: 'Error rate has exceeded 10 errors per minute'
          }
        ],
        enabled: true,
        cooldownPeriod: 300000 // 5 minutes
      },
      {
        id: 'critical_errors',
        name: 'Critical Errors',
        description: 'Triggers when any critical error occurs',
        condition: {
          type: 'severity_count',
          timeWindow: 60000, // 1 minute
          threshold: 1,
          severity: ErrorSeverity.CRITICAL,
          operator: 'greater_equal'
        },
        actions: [
          {
            type: 'console',
            config: {},
            message: 'Critical error detected'
          },
          {
            type: 'notification',
            config: { title: 'Critical Error Alert' },
            message: 'A critical error has occurred'
          },
          {
            type: 'sentry',
            config: { level: 'fatal' },
            message: 'Critical error requires immediate attention'
          }
        ],
        enabled: true,
        cooldownPeriod: 60000 // 1 minute
      },
      {
        id: 'authentication_failures',
        name: 'Authentication Failures',
        description: 'Triggers when authentication errors exceed threshold',
        condition: {
          type: 'error_type_count',
          timeWindow: 300000, // 5 minutes
          threshold: 5,
          errorType: ErrorType.AUTHENTICATION,
          operator: 'greater_than'
        },
        actions: [
          {
            type: 'console',
            config: {},
            message: 'Multiple authentication failures detected'
          },
          {
            type: 'notification',
            config: { title: 'Authentication Alert' },
            message: 'Multiple authentication failures detected - possible security issue'
          }
        ],
        enabled: true,
        cooldownPeriod: 600000 // 10 minutes
      },
      {
        id: 'server_errors',
        name: 'Server Errors',
        description: 'Triggers when server errors exceed threshold',
        condition: {
          type: 'error_type_count',
          timeWindow: 300000, // 5 minutes
          threshold: 3,
          errorType: ErrorType.SERVER,
          operator: 'greater_than'
        },
        actions: [
          {
            type: 'console',
            config: {},
            message: 'Multiple server errors detected'
          },
          {
            type: 'notification',
            config: { title: 'Server Error Alert' },
            message: 'Multiple server errors detected - service may be degraded'
          }
        ],
        enabled: true,
        cooldownPeriod: 300000 // 5 minutes
      }
    ];

    defaultThresholds.forEach(threshold => {
      this.thresholds.set(threshold.id, threshold);
    });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    // Update metrics every 30 seconds
    this.metricsUpdateInterval = setInterval(() => {
      this.updateMetrics();
    }, 30000);

    // Initial metrics update
    this.updateMetrics();
  }

  /**
   * Update monitoring metrics
   */
  public updateMetrics(errorLog?: ErrorLogEntry[]): void {
    if (!errorLog) {
      // Use empty array if no error log provided to avoid circular dependency
      errorLog = [];
    }

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    const fiveMinutesAgo = new Date(now.getTime() - 300000);

    // Calculate error rate (errors per minute)
    const recentErrors = errorLog.filter(error => 
      new Date(error.timestamp) > oneMinuteAgo
    );
    
    const fiveMinuteErrors = errorLog.filter(error => 
      new Date(error.timestamp) > fiveMinutesAgo
    );

    // Update metrics
    this.metrics = {
      timestamp: now.toISOString(),
      errorRate: recentErrors.length, // errors in last minute
      totalErrors: errorLog.length,
      errorsByType: this.calculateErrorsByType(fiveMinuteErrors),
      errorsBySeverity: this.calculateErrorsBySeverity(fiveMinuteErrors),
      criticalErrors: fiveMinuteErrors.filter(e => e.severity === ErrorSeverity.CRITICAL).length,
      highSeverityErrors: fiveMinuteErrors.filter(e => e.severity === ErrorSeverity.HIGH).length,
      recentErrors: recentErrors.slice(-20) // Last 20 errors
    };

    // Check thresholds
    this.checkThresholds();

    // Notify metrics listeners
    this.notifyMetricsListeners();
  }

  /**
   * Calculate errors by type
   */
  private calculateErrorsByType(errors: ErrorLogEntry[]): Record<ErrorType, number> {
    const counts: Record<ErrorType, number> = {} as Record<ErrorType, number>;
    
    errors.forEach(error => {
      counts[error.type] = (counts[error.type] || 0) + 1;
    });

    return counts;
  }

  /**
   * Calculate errors by severity
   */
  private calculateErrorsBySeverity(errors: ErrorLogEntry[]): Record<ErrorSeverity, number> {
    const counts: Record<ErrorSeverity, number> = {} as Record<ErrorSeverity, number>;
    
    errors.forEach(error => {
      counts[error.severity] = (counts[error.severity] || 0) + 1;
    });

    return counts;
  }

  /**
   * Check all thresholds against current metrics
   */
  private checkThresholds(): void {
    const now = new Date();

    this.thresholds.forEach(threshold => {
      if (!threshold.enabled) return;

      // Check cooldown period
      if (threshold.lastTriggered) {
        const lastTriggered = new Date(threshold.lastTriggered);
        if (now.getTime() - lastTriggered.getTime() < threshold.cooldownPeriod) {
          return; // Still in cooldown
        }
      }

      const actualValue = this.evaluateThresholdCondition(threshold.condition);
      const thresholdMet = this.compareValues(
        actualValue, 
        threshold.condition.threshold, 
        threshold.condition.operator
      );

      if (thresholdMet) {
        this.triggerAlert(threshold, actualValue);
      }
    });
  }

  /**
   * Evaluate threshold condition against current metrics
   */
  private evaluateThresholdCondition(condition: ThresholdCondition): number {
    const timeWindow = new Date(Date.now() - condition.timeWindow);

    switch (condition.type) {
      case 'error_rate':
        return this.metrics.errorRate;

      case 'error_count':
        return this.metrics.recentErrors.filter(error => 
          new Date(error.timestamp) > timeWindow
        ).length;

      case 'severity_count':
        if (!condition.severity) return 0;
        return this.metrics.recentErrors.filter(error => 
          error.severity === condition.severity && 
          new Date(error.timestamp) > timeWindow
        ).length;

      case 'error_type_count':
        if (!condition.errorType) return 0;
        return this.metrics.recentErrors.filter(error => 
          error.type === condition.errorType && 
          new Date(error.timestamp) > timeWindow
        ).length;

      default:
        return 0;
    }
  }

  /**
   * Compare values based on operator
   */
  private compareValues(actual: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case 'greater_than':
        return actual > threshold;
      case 'greater_equal':
        return actual >= threshold;
      case 'less_than':
        return actual < threshold;
      case 'less_equal':
        return actual <= threshold;
      case 'equal':
        return actual === threshold;
      default:
        return false;
    }
  }

  /**
   * Trigger alert for threshold violation
   */
  private triggerAlert(threshold: MonitoringThreshold, actualValue: number): void {
    const alert: AlertEvent = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      thresholdId: threshold.id,
      thresholdName: threshold.name,
      timestamp: new Date().toISOString(),
      condition: threshold.condition,
      actualValue,
      threshold: threshold.condition.threshold,
      severity: this.determineAlertSeverity(threshold.condition, actualValue),
      message: this.generateAlertMessage(threshold, actualValue),
      resolved: false
    };

    // Add to alert history
    this.alertHistory.push(alert);

    // Update last triggered time
    threshold.lastTriggered = alert.timestamp;

    // Create incident for critical and high severity alerts
    if (alert.severity === 'critical' || alert.severity === 'high') {
      try {
        incidentManager.createIncidentFromAlert(alert);
      } catch (error) {
        logger.error("Failed to create incident from alert:", error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Execute alert actions
    this.executeAlertActions(threshold.actions, alert);

    // Notify alert listeners
    this.notifyAlertListeners(alert);

    console.warn(`[ErrorMonitor] Alert triggered: ${alert.thresholdName}`, alert);
  }

  /**
   * Determine alert severity based on condition and actual value
   */
  private determineAlertSeverity(condition: ThresholdCondition, actualValue: number): 'low' | 'medium' | 'high' | 'critical' {
    if (condition.severity === ErrorSeverity.CRITICAL || condition.type === 'error_rate' && actualValue > 20) {
      return 'critical';
    }
    if (condition.severity === ErrorSeverity.HIGH || condition.type === 'error_rate' && actualValue > 10) {
      return 'high';
    }
    if (condition.severity === ErrorSeverity.MEDIUM || actualValue > condition.threshold * 2) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(threshold: MonitoringThreshold, actualValue: number): string {
    const condition = threshold.condition;
    let message = `${threshold.name}: `;

    switch (condition.type) {
      case 'error_rate':
        message += `Error rate is ${actualValue} errors/minute (threshold: ${condition.threshold})`;
        break;
      case 'error_count':
        message += `${actualValue} errors in ${condition.timeWindow / 1000}s (threshold: ${condition.threshold})`;
        break;
      case 'severity_count':
        message += `${actualValue} ${condition.severity} errors in ${condition.timeWindow / 1000}s (threshold: ${condition.threshold})`;
        break;
      case 'error_type_count':
        message += `${actualValue} ${condition.errorType} errors in ${condition.timeWindow / 1000}s (threshold: ${condition.threshold})`;
        break;
    }

    return message;
  }

  /**
   * Execute alert actions
   */
  private executeAlertActions(actions: AlertAction[], alert: AlertEvent): void {
    actions.forEach(action => {
      try {
        switch (action.type) {
          case 'console':
            console.error(`[Alert] ${alert.message}`, alert);
            break;

          case 'notification':
            this.sendBrowserNotification(action, alert);
            break;

          case 'webhook':
            this.sendWebhookNotification(action, alert);
            break;

          case 'sentry':
            this.sendSentryAlert(action, alert);
            break;

          // Additional action types can be implemented
        }
      } catch (error) {
        logger.error("Failed to execute alert action:", error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Send browser notification
   */
  private sendBrowserNotification(action: AlertAction, alert: AlertEvent): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(action.config.title || 'Error Alert', {
          body: action.message || alert.message,
          icon: '/favicon.ico',
          tag: alert.thresholdId // Prevent duplicate notifications
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            this.sendBrowserNotification(action, alert);
          }
        });
      }
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(action: AlertAction, alert: AlertEvent): Promise<void> {
    if (!action.config.url) return;

    try {
      await fetch(action.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...action.config.headers
        },
        body: JSON.stringify({
          alert,
          message: action.message || alert.message,
          timestamp: alert.timestamp,
          severity: alert.severity
        })
      });
    } catch (error) {
      logger.error("Failed to send webhook notification:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send Sentry alert
   */
  private sendSentryAlert(action: AlertAction, alert: AlertEvent): void {
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      const Sentry = (window as any).Sentry;
      
      Sentry.withScope((scope: any) => {
        scope.setTag('alertType', 'monitoring');
        scope.setTag('thresholdId', alert.thresholdId);
        scope.setLevel(action.config.level || 'warning');
        scope.setContext('alert', alert);
        
        Sentry.captureMessage(action.message || alert.message);
      });
    }
  }

  /**
   * Add threshold
   */
  public addThreshold(threshold: MonitoringThreshold): void {
    this.thresholds.set(threshold.id, threshold);
  }

  /**
   * Remove threshold
   */
  public removeThreshold(thresholdId: string): void {
    this.thresholds.delete(thresholdId);
  }

  /**
   * Update threshold
   */
  public updateThreshold(threshold: MonitoringThreshold): void {
    this.thresholds.set(threshold.id, threshold);
  }

  /**
   * Get all thresholds
   */
  public getThresholds(): MonitoringThreshold[] {
    return Array.from(this.thresholds.values());
  }

  /**
   * Get current metrics
   */
  public getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  /**
   * Get alert history
   */
  public getAlertHistory(limit: number = 50): AlertEvent[] {
    return this.alertHistory
      .slice(-limit)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Add alert listener
   */
  public addAlertListener(listener: (alert: AlertEvent) => void): void {
    this.alertListeners.add(listener);
  }

  /**
   * Remove alert listener
   */
  public removeAlertListener(listener: (alert: AlertEvent) => void): void {
    this.alertListeners.delete(listener);
  }

  /**
   * Add metrics listener
   */
  public addMetricsListener(listener: (metrics: MonitoringMetrics) => void): void {
    this.metricsListeners.add(listener);
  }

  /**
   * Remove metrics listener
   */
  public removeMetricsListener(listener: (metrics: MonitoringMetrics) => void): void {
    this.metricsListeners.delete(listener);
  }

  /**
   * Notify alert listeners
   */
  private notifyAlertListeners(alert: AlertEvent): void {
    this.alertListeners.forEach(listener => {
      try {
        listener(alert);
      } catch (error) {
        logger.error("Error in alert listener:", error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Notify metrics listeners
   */
  private notifyMetricsListeners(): void {
    this.metricsListeners.forEach(listener => {
      try {
        listener(this.metrics);
      } catch (error) {
        logger.error("Error in metrics listener:", error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Resolve alert
   */
  public resolveAlert(alertId: string): void {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
    }
  }

  /**
   * Clear alert history
   */
  public clearAlertHistory(): void {
    this.alertHistory = [];
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
      this.metricsUpdateInterval = undefined;
    }
    
    this.alertListeners.clear();
    this.metricsListeners.clear();
  }
}

// Export singleton instance
export const errorMonitor = ErrorMonitor.getInstance();