import { LoadTestSummary } from './load-testing';
import { WebVitalsMetrics } from './web-vitals';

export interface PerformanceAlert {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'response_time' | 'error_rate' | 'throughput' | 'core_web_vitals' | 'resource_usage' | 'concurrent_users';
  message: string;
  details: Record<string, any>;
  threshold: number;
  actualValue: number;
  testConfig?: {
    concurrentUsers: number;
    testDuration: number;
    scenario: string;
  };
}

export interface PerformanceThresholds {
  responseTime: {
    warning: number;
    critical: number;
  };
  errorRate: {
    warning: number;
    critical: number;
  };
  throughput: {
    warning: number;
    critical: number;
  };
  coreWebVitals: {
    fcp: { warning: number; critical: number };
    lcp: { warning: number; critical: number };
    cls: { warning: number; critical: number };
  };
  concurrentUsers: {
    maxSupported: number;
    degradationThreshold: number;
  };
}

export interface AlertingConfig {
  enabled: boolean;
  thresholds: PerformanceThresholds;
  notifications: {
    console: boolean;
    file: boolean;
    webhook?: string;
  };
  retentionDays: number;
}

/**
 * Performance alerting and monitoring system
 */
export class PerformanceAlerting {
  private alerts: PerformanceAlert[] = [];
  private config: AlertingConfig;

  constructor(config?: Partial<AlertingConfig>) {
    this.config = {
      enabled: true,
      thresholds: {
        responseTime: {
          warning: 10000, // 10 seconds
          critical: 30000 // 30 seconds
        },
        errorRate: {
          warning: 15, // 15%
          critical: 30 // 30%
        },
        throughput: {
          warning: 0.05, // 0.05 requests/second
          critical: 0.01 // 0.01 requests/second
        },
        coreWebVitals: {
          fcp: { warning: 2000, critical: 4000 }, // First Contentful Paint
          lcp: { warning: 2500, critical: 4000 }, // Largest Contentful Paint
          cls: { warning: 0.1, critical: 0.25 }   // Cumulative Layout Shift
        },
        concurrentUsers: {
          maxSupported: 50,
          degradationThreshold: 25 // Performance starts degrading after 25 users
        }
      },
      notifications: {
        console: true,
        file: true
      },
      retentionDays: 30,
      ...config
    };
  }

  /**
   * Analyze load test results and generate alerts
   */
  async analyzeLoadTestResults(summary: LoadTestSummary, testConfig: any): Promise<PerformanceAlert[]> {
    if (!this.config.enabled) {
      return [];
    }

    const newAlerts: PerformanceAlert[] = [];

    // Check response time thresholds
    const responseTimeAlerts = this.checkResponseTimeThresholds(summary, testConfig);
    newAlerts.push(...responseTimeAlerts);

    // Check error rate thresholds
    const errorRateAlerts = this.checkErrorRateThresholds(summary, testConfig);
    newAlerts.push(...errorRateAlerts);

    // Check throughput thresholds
    const throughputAlerts = this.checkThroughputThresholds(summary, testConfig);
    newAlerts.push(...throughputAlerts);

    // Check Core Web Vitals thresholds
    const webVitalsAlerts = this.checkWebVitalsThresholds(summary, testConfig);
    newAlerts.push(...webVitalsAlerts);

    // Check concurrent user capacity
    const concurrentUserAlerts = this.checkConcurrentUserCapacity(summary, testConfig);
    newAlerts.push(...concurrentUserAlerts);

    // Store and notify about new alerts
    this.alerts.push(...newAlerts);
    await this.processAlerts(newAlerts);

    return newAlerts;
  }

  private checkResponseTimeThresholds(summary: LoadTestSummary, testConfig: any): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    const thresholds = this.config.thresholds.responseTime;

    // Check average response time
    if (summary.averageResponseTime > thresholds.critical) {
      alerts.push(this.createAlert({
        severity: 'critical',
        type: 'response_time',
        message: `Critical: Average response time (${summary.averageResponseTime}ms) exceeds critical threshold (${thresholds.critical}ms)`,
        threshold: thresholds.critical,
        actualValue: summary.averageResponseTime,
        testConfig
      }));
    } else if (summary.averageResponseTime > thresholds.warning) {
      alerts.push(this.createAlert({
        severity: 'high',
        type: 'response_time',
        message: `Warning: Average response time (${summary.averageResponseTime}ms) exceeds warning threshold (${thresholds.warning}ms)`,
        threshold: thresholds.warning,
        actualValue: summary.averageResponseTime,
        testConfig
      }));
    }

    // Check P95 response time
    if (summary.p95ResponseTime > thresholds.critical * 1.5) {
      alerts.push(this.createAlert({
        severity: 'critical',
        type: 'response_time',
        message: `Critical: P95 response time (${summary.p95ResponseTime}ms) indicates severe performance degradation`,
        threshold: thresholds.critical * 1.5,
        actualValue: summary.p95ResponseTime,
        testConfig
      }));
    }

    return alerts;
  }

  private checkErrorRateThresholds(summary: LoadTestSummary, testConfig: any): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    const thresholds = this.config.thresholds.errorRate;

    if (summary.errorRate > thresholds.critical) {
      alerts.push(this.createAlert({
        severity: 'critical',
        type: 'error_rate',
        message: `Critical: Error rate (${summary.errorRate.toFixed(1)}%) exceeds critical threshold (${thresholds.critical}%)`,
        threshold: thresholds.critical,
        actualValue: summary.errorRate,
        testConfig,
        details: {
          failedUsers: summary.failedUsers,
          totalUsers: summary.totalUsers,
          scenarioResults: summary.scenarioResults
        }
      }));
    } else if (summary.errorRate > thresholds.warning) {
      alerts.push(this.createAlert({
        severity: 'high',
        type: 'error_rate',
        message: `Warning: Error rate (${summary.errorRate.toFixed(1)}%) exceeds warning threshold (${thresholds.warning}%)`,
        threshold: thresholds.warning,
        actualValue: summary.errorRate,
        testConfig
      }));
    }

    return alerts;
  }

  private checkThroughputThresholds(summary: LoadTestSummary, testConfig: any): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    const thresholds = this.config.thresholds.throughput;

    if (summary.throughput < thresholds.critical) {
      alerts.push(this.createAlert({
        severity: 'critical',
        type: 'throughput',
        message: `Critical: Throughput (${summary.throughput.toFixed(3)} req/s) below critical threshold (${thresholds.critical} req/s)`,
        threshold: thresholds.critical,
        actualValue: summary.throughput,
        testConfig
      }));
    } else if (summary.throughput < thresholds.warning) {
      alerts.push(this.createAlert({
        severity: 'medium',
        type: 'throughput',
        message: `Warning: Throughput (${summary.throughput.toFixed(3)} req/s) below warning threshold (${thresholds.warning} req/s)`,
        threshold: thresholds.warning,
        actualValue: summary.throughput,
        testConfig
      }));
    }

    return alerts;
  }

  private checkWebVitalsThresholds(summary: LoadTestSummary, testConfig: any): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    const thresholds = this.config.thresholds.coreWebVitals;
    const metrics = summary.performanceMetrics;

    // Check First Contentful Paint (FCP)
    if (metrics.averageFCP > 0) {
      if (metrics.averageFCP > thresholds.fcp.critical) {
        alerts.push(this.createAlert({
          severity: 'critical',
          type: 'core_web_vitals',
          message: `Critical: First Contentful Paint (${metrics.averageFCP.toFixed(0)}ms) exceeds critical threshold (${thresholds.fcp.critical}ms)`,
          threshold: thresholds.fcp.critical,
          actualValue: metrics.averageFCP,
          testConfig,
          details: { metric: 'FCP' }
        }));
      } else if (metrics.averageFCP > thresholds.fcp.warning) {
        alerts.push(this.createAlert({
          severity: 'medium',
          type: 'core_web_vitals',
          message: `Warning: First Contentful Paint (${metrics.averageFCP.toFixed(0)}ms) exceeds warning threshold (${thresholds.fcp.warning}ms)`,
          threshold: thresholds.fcp.warning,
          actualValue: metrics.averageFCP,
          testConfig,
          details: { metric: 'FCP' }
        }));
      }
    }

    // Check Largest Contentful Paint (LCP)
    if (metrics.averageLCP > 0) {
      if (metrics.averageLCP > thresholds.lcp.critical) {
        alerts.push(this.createAlert({
          severity: 'critical',
          type: 'core_web_vitals',
          message: `Critical: Largest Contentful Paint (${metrics.averageLCP.toFixed(0)}ms) exceeds critical threshold (${thresholds.lcp.critical}ms)`,
          threshold: thresholds.lcp.critical,
          actualValue: metrics.averageLCP,
          testConfig,
          details: { metric: 'LCP' }
        }));
      } else if (metrics.averageLCP > thresholds.lcp.warning) {
        alerts.push(this.createAlert({
          severity: 'medium',
          type: 'core_web_vitals',
          message: `Warning: Largest Contentful Paint (${metrics.averageLCP.toFixed(0)}ms) exceeds warning threshold (${thresholds.lcp.warning}ms)`,
          threshold: thresholds.lcp.warning,
          actualValue: metrics.averageLCP,
          testConfig,
          details: { metric: 'LCP' }
        }));
      }
    }

    // Check Cumulative Layout Shift (CLS)
    if (metrics.averageCLS > 0) {
      if (metrics.averageCLS > thresholds.cls.critical) {
        alerts.push(this.createAlert({
          severity: 'high',
          type: 'core_web_vitals',
          message: `Critical: Cumulative Layout Shift (${metrics.averageCLS.toFixed(3)}) exceeds critical threshold (${thresholds.cls.critical})`,
          threshold: thresholds.cls.critical,
          actualValue: metrics.averageCLS,
          testConfig,
          details: { metric: 'CLS' }
        }));
      } else if (metrics.averageCLS > thresholds.cls.warning) {
        alerts.push(this.createAlert({
          severity: 'medium',
          type: 'core_web_vitals',
          message: `Warning: Cumulative Layout Shift (${metrics.averageCLS.toFixed(3)}) exceeds warning threshold (${thresholds.cls.warning})`,
          threshold: thresholds.cls.warning,
          actualValue: metrics.averageCLS,
          testConfig,
          details: { metric: 'CLS' }
        }));
      }
    }

    return alerts;
  }

  private checkConcurrentUserCapacity(summary: LoadTestSummary, testConfig: any): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    const thresholds = this.config.thresholds.concurrentUsers;
    const concurrentUsers = testConfig.concurrentUsers || 0;

    // Check if we're approaching maximum supported users
    if (concurrentUsers > thresholds.maxSupported) {
      alerts.push(this.createAlert({
        severity: 'critical',
        type: 'concurrent_users',
        message: `Critical: Concurrent users (${concurrentUsers}) exceeds maximum supported capacity (${thresholds.maxSupported})`,
        threshold: thresholds.maxSupported,
        actualValue: concurrentUsers,
        testConfig,
        details: {
          successRate: (summary.successfulUsers / summary.totalUsers) * 100,
          errorRate: summary.errorRate
        }
      }));
    } else if (concurrentUsers > thresholds.degradationThreshold) {
      // Check if performance is degrading with higher user count
      const successRate = (summary.successfulUsers / summary.totalUsers) * 100;
      if (successRate < 80 || summary.errorRate > 20) {
        alerts.push(this.createAlert({
          severity: 'high',
          type: 'concurrent_users',
          message: `Warning: Performance degradation detected with ${concurrentUsers} concurrent users (Success: ${successRate.toFixed(1)}%, Errors: ${summary.errorRate.toFixed(1)}%)`,
          threshold: thresholds.degradationThreshold,
          actualValue: concurrentUsers,
          testConfig,
          details: {
            successRate,
            errorRate: summary.errorRate,
            averageResponseTime: summary.averageResponseTime
          }
        }));
      }
    }

    return alerts;
  }

  private createAlert(params: {
    severity: PerformanceAlert['severity'];
    type: PerformanceAlert['type'];
    message: string;
    threshold: number;
    actualValue: number;
    testConfig: any;
    details?: Record<string, any>;
  }): PerformanceAlert {
    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      severity: params.severity,
      type: params.type,
      message: params.message,
      threshold: params.threshold,
      actualValue: params.actualValue,
      details: params.details || {},
      testConfig: {
        concurrentUsers: params.testConfig.concurrentUsers,
        testDuration: params.testConfig.testDuration,
        scenario: params.testConfig.scenarios?.map((s: any) => s.name).join(', ') || 'Unknown'
      }
    };
  }

  private async processAlerts(alerts: PerformanceAlert[]): Promise<void> {
    if (alerts.length === 0) return;

    // Console notifications
    if (this.config.notifications.console) {
      alerts.forEach(alert => {
        const color = this.getConsoleColor(alert.severity);
        console.log(`${color}[PERFORMANCE ALERT - ${alert.severity.toUpperCase()}] ${alert.message}\x1b[0m`);
        console.log(`  Threshold: ${alert.threshold}, Actual: ${alert.actualValue}`);
        console.log(`  Test Config: ${alert.testConfig?.concurrentUsers} users, ${alert.testConfig?.scenario}`);
        if (Object.keys(alert.details).length > 0) {
          console.log(`  Details:`, alert.details);
        }
        console.log('');
      });
    }

    // File notifications
    if (this.config.notifications.file) {
      await this.writeAlertsToFile(alerts);
    }

    // Webhook notifications (if configured)
    if (this.config.notifications.webhook) {
      await this.sendWebhookNotifications(alerts);
    }
  }

  private getConsoleColor(severity: PerformanceAlert['severity']): string {
    switch (severity) {
      case 'critical': return '\x1b[31m'; // Red
      case 'high': return '\x1b[33m';     // Yellow
      case 'medium': return '\x1b[36m';   // Cyan
      case 'low': return '\x1b[32m';      // Green
      default: return '\x1b[0m';          // Reset
    }
  }

  private async writeAlertsToFile(alerts: PerformanceAlert[]): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const alertsDir = path.join(process.cwd(), 'test-results', 'performance-alerts');
      await fs.mkdir(alertsDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = path.join(alertsDir, `alerts-${timestamp}.json`);
      
      await fs.writeFile(filename, JSON.stringify(alerts, null, 2));
      console.log(`Performance alerts written to: ${filename}`);
    } catch (error) {
      console.error('Failed to write alerts to file:', error);
    }
  }

  private async sendWebhookNotifications(alerts: PerformanceAlert[]): Promise<void> {
    if (!this.config.notifications.webhook) return;

    try {
      const criticalAlerts = alerts.filter(a => a.severity === 'critical');
      const highAlerts = alerts.filter(a => a.severity === 'high');
      
      if (criticalAlerts.length > 0 || highAlerts.length > 0) {
        const payload = {
          timestamp: new Date().toISOString(),
          summary: {
            total: alerts.length,
            critical: criticalAlerts.length,
            high: highAlerts.length
          },
          alerts: criticalAlerts.concat(highAlerts)
        };

        // Note: In a real implementation, you would use fetch or axios here
        console.log(`Would send webhook notification to: ${this.config.notifications.webhook}`);
        console.log('Payload:', JSON.stringify(payload, null, 2));
      }
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
    }
  }

  /**
   * Get all alerts within a time range
   */
  getAlerts(startTime?: Date, endTime?: Date): PerformanceAlert[] {
    let filteredAlerts = [...this.alerts];

    if (startTime) {
      filteredAlerts = filteredAlerts.filter(alert => 
        new Date(alert.timestamp) >= startTime
      );
    }

    if (endTime) {
      filteredAlerts = filteredAlerts.filter(alert => 
        new Date(alert.timestamp) <= endTime
      );
    }

    return filteredAlerts;
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: PerformanceAlert['severity']): PerformanceAlert[] {
    return this.alerts.filter(alert => alert.severity === severity);
  }

  /**
   * Clear old alerts based on retention policy
   */
  cleanupOldAlerts(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    this.alerts = this.alerts.filter(alert => 
      new Date(alert.timestamp) > cutoffDate
    );
  }

  /**
   * Update alerting configuration
   */
  updateConfig(newConfig: Partial<AlertingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): AlertingConfig {
    return { ...this.config };
  }
}