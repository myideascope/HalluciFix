/**
 * Post-Migration Monitoring Service
 * 
 * Monitors system performance and error rates after migration to AWS
 */

import { logger } from './logging';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  threshold: number;
  status: 'good' | 'warning' | 'critical';
  timestamp: Date;
}

export interface ErrorRateMetric {
  service: string;
  errorCount: number;
  totalRequests: number;
  errorRate: number;
  threshold: number;
  status: 'good' | 'warning' | 'critical';
  timestamp: Date;
}

export interface SystemHealthReport {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  performanceMetrics: PerformanceMetric[];
  errorRates: ErrorRateMetric[];
  recommendations: string[];
  alerts: string[];
  timestamp: Date;
  monitoringDuration: number; // in minutes
}

class PostMigrationMonitoringService {
  private monitoringLogger = logger.child({ component: 'PostMigrationMonitoring' });
  private metricsHistory: Map<string, PerformanceMetric[]> = new Map();
  private errorHistory: Map<string, ErrorRateMetric[]> = new Map();
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMinutes: number = 5): void {
    if (this.isMonitoring) {
      this.monitoringLogger.warn('Monitoring already started');
      return;
    }

    this.isMonitoring = true;
    this.monitoringLogger.info('Starting post-migration monitoring', { intervalMinutes });

    // Initial health check
    this.collectMetrics();

    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.monitoringLogger.info('Post-migration monitoring stopped');
  }

  /**
   * Get current system health report
   */
  async getHealthReport(): Promise<SystemHealthReport> {
    const startTime = Date.now();
    
    try {
      // Collect current metrics
      const performanceMetrics = await this.collectPerformanceMetrics();
      const errorRates = await this.collectErrorRates();

      // Determine overall health
      const criticalMetrics = [
        ...performanceMetrics.filter(m => m.status === 'critical'),
        ...errorRates.filter(e => e.status === 'critical')
      ];

      const warningMetrics = [
        ...performanceMetrics.filter(m => m.status === 'warning'),
        ...errorRates.filter(e => e.status === 'warning')
      ];

      let overallHealth: SystemHealthReport['overallHealth'] = 'healthy';
      if (criticalMetrics.length > 0) {
        overallHealth = 'critical';
      } else if (warningMetrics.length > 0) {
        overallHealth = 'degraded';
      }

      // Generate recommendations and alerts
      const recommendations = this.generateRecommendations(performanceMetrics, errorRates);
      const alerts = this.generateAlerts(performanceMetrics, errorRates);

      const monitoringDuration = (Date.now() - startTime) / 1000 / 60; // in minutes

      return {
        overallHealth,
        performanceMetrics,
        errorRates,
        recommendations,
        alerts,
        timestamp: new Date(),
        monitoringDuration
      };

    } catch (error) {
      this.monitoringLogger.error('Failed to generate health report', error as Error);
      
      return {
        overallHealth: 'critical',
        performanceMetrics: [],
        errorRates: [],
        recommendations: ['Fix monitoring system errors'],
        alerts: [`Monitoring system error: ${(error as Error).message}`],
        timestamp: new Date(),
        monitoringDuration: 0
      };
    }
  }

  /**
   * Collect all metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const performanceMetrics = await this.collectPerformanceMetrics();
      const errorRates = await this.collectErrorRates();

      // Store metrics in history
      performanceMetrics.forEach(metric => {
        if (!this.metricsHistory.has(metric.name)) {
          this.metricsHistory.set(metric.name, []);
        }
        const history = this.metricsHistory.get(metric.name)!;
        history.push(metric);
        
        // Keep only last 100 entries
        if (history.length > 100) {
          history.shift();
        }
      });

      errorRates.forEach(errorRate => {
        if (!this.errorHistory.has(errorRate.service)) {
          this.errorHistory.set(errorRate.service, []);
        }
        const history = this.errorHistory.get(errorRate.service)!;
        history.push(errorRate);
        
        // Keep only last 100 entries
        if (history.length > 100) {
          history.shift();
        }
      });

      // Log critical issues
      const criticalMetrics = performanceMetrics.filter(m => m.status === 'critical');
      const criticalErrors = errorRates.filter(e => e.status === 'critical');

      if (criticalMetrics.length > 0 || criticalErrors.length > 0) {
        this.monitoringLogger.error('Critical issues detected', {
          criticalMetrics: criticalMetrics.map(m => ({ name: m.name, value: m.value, threshold: m.threshold })),
          criticalErrors: criticalErrors.map(e => ({ service: e.service, errorRate: e.errorRate, threshold: e.threshold }))
        });
      }

    } catch (error) {
      this.monitoringLogger.error('Failed to collect metrics', error as Error);
    }
  }

  /**
   * Collect performance metrics
   */
  private async collectPerformanceMetrics(): Promise<PerformanceMetric[]> {
    const metrics: PerformanceMetric[] = [];
    const timestamp = new Date();

    try {
      // Authentication latency
      const authLatency = await this.measureAuthenticationLatency();
      metrics.push({
        name: 'authentication-latency',
        value: authLatency,
        unit: 'ms',
        threshold: 2000,
        status: authLatency > 5000 ? 'critical' : authLatency > 2000 ? 'warning' : 'good',
        timestamp
      });

      // Database latency
      const dbLatency = await this.measureDatabaseLatency();
      metrics.push({
        name: 'database-latency',
        value: dbLatency,
        unit: 'ms',
        threshold: 1000,
        status: dbLatency > 3000 ? 'critical' : dbLatency > 1000 ? 'warning' : 'good',
        timestamp
      });

      // Storage latency
      const storageLatency = await this.measureStorageLatency();
      metrics.push({
        name: 'storage-latency',
        value: storageLatency,
        unit: 'ms',
        threshold: 2000,
        status: storageLatency > 5000 ? 'critical' : storageLatency > 2000 ? 'warning' : 'good',
        timestamp
      });

      // API latency
      const apiLatency = await this.measureApiLatency();
      metrics.push({
        name: 'api-latency',
        value: apiLatency,
        unit: 'ms',
        threshold: 3000,
        status: apiLatency > 10000 ? 'critical' : apiLatency > 3000 ? 'warning' : 'good',
        timestamp
      });

      // Memory usage (if available)
      if (typeof window !== 'undefined' && 'memory' in performance) {
        const memoryInfo = (performance as any).memory;
        const memoryUsage = (memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize) * 100;
        
        metrics.push({
          name: 'memory-usage',
          value: memoryUsage,
          unit: '%',
          threshold: 80,
          status: memoryUsage > 95 ? 'critical' : memoryUsage > 80 ? 'warning' : 'good',
          timestamp
        });
      }

    } catch (error) {
      this.monitoringLogger.error('Failed to collect performance metrics', error as Error);
    }

    return metrics;
  }

  /**
   * Collect error rates
   */
  private async collectErrorRates(): Promise<ErrorRateMetric[]> {
    const errorRates: ErrorRateMetric[] = [];
    const timestamp = new Date();

    try {
      // Authentication error rate
      const authErrors = await this.getAuthenticationErrorRate();
      errorRates.push({
        service: 'authentication',
        errorCount: authErrors.errorCount,
        totalRequests: authErrors.totalRequests,
        errorRate: authErrors.errorRate,
        threshold: 5,
        status: authErrors.errorRate > 10 ? 'critical' : authErrors.errorRate > 5 ? 'warning' : 'good',
        timestamp
      });

      // Database error rate
      const dbErrors = await this.getDatabaseErrorRate();
      errorRates.push({
        service: 'database',
        errorCount: dbErrors.errorCount,
        totalRequests: dbErrors.totalRequests,
        errorRate: dbErrors.errorRate,
        threshold: 2,
        status: dbErrors.errorRate > 5 ? 'critical' : dbErrors.errorRate > 2 ? 'warning' : 'good',
        timestamp
      });

      // Storage error rate
      const storageErrors = await this.getStorageErrorRate();
      errorRates.push({
        service: 'storage',
        errorCount: storageErrors.errorCount,
        totalRequests: storageErrors.totalRequests,
        errorRate: storageErrors.errorRate,
        threshold: 3,
        status: storageErrors.errorRate > 8 ? 'critical' : storageErrors.errorRate > 3 ? 'warning' : 'good',
        timestamp
      });

      // API error rate
      const apiErrors = await this.getApiErrorRate();
      errorRates.push({
        service: 'api',
        errorCount: apiErrors.errorCount,
        totalRequests: apiErrors.totalRequests,
        errorRate: apiErrors.errorRate,
        threshold: 5,
        status: apiErrors.errorRate > 15 ? 'critical' : apiErrors.errorRate > 5 ? 'warning' : 'good',
        timestamp
      });

    } catch (error) {
      this.monitoringLogger.error('Failed to collect error rates', error as Error);
    }

    return errorRates;
  }

  /**
   * Measure authentication latency
   */
  private async measureAuthenticationLatency(): Promise<number> {
    const startTime = Date.now();
    
    try {
      // Import Auth dynamically to avoid issues
      const { Auth } = await import('aws-amplify');
      
      // Try to get current session (this is a lightweight operation)
      await Auth.currentSession().catch(() => {
        // Expected to fail if no user is signed in
      });
      
      return Date.now() - startTime;
    } catch (error) {
      // Return a high latency value to indicate issues
      return 10000;
    }
  }

  /**
   * Measure database latency
   */
  private async measureDatabaseLatency(): Promise<number> {
    const startTime = Date.now();
    
    try {
      // Import database service dynamically
      const { databaseService } = await import('./database');
      
      // Simple query to test latency
      await databaseService.query('SELECT 1');
      
      return Date.now() - startTime;
    } catch (error) {
      // Return a high latency value to indicate issues
      return 10000;
    }
  }

  /**
   * Measure storage latency
   */
  private async measureStorageLatency(): Promise<number> {
    const startTime = Date.now();
    
    try {
      // Import S3 service dynamically
      const { getS3Service } = await import('./storage/s3Service');
      const s3Service = getS3Service();
      
      // Simple list operation to test latency
      await s3Service.listFiles('', 1);
      
      return Date.now() - startTime;
    } catch (error) {
      // Return a high latency value to indicate issues
      return 10000;
    }
  }

  /**
   * Measure API latency
   */
  private async measureApiLatency(): Promise<number> {
    const startTime = Date.now();
    
    try {
      const apiUrl = process.env.VITE_API_GATEWAY_URL;
      
      if (!apiUrl) {
        return 0; // No API configured
      }

      // Simple health check
      await fetch(`${apiUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      return Date.now() - startTime;
    } catch (error) {
      // Return a high latency value to indicate issues
      return 10000;
    }
  }

  /**
   * Get authentication error rate
   */
  private async getAuthenticationErrorRate(): Promise<{
    errorCount: number;
    totalRequests: number;
    errorRate: number;
  }> {
    // This would typically come from CloudWatch or application logs
    // For now, return mock data
    return {
      errorCount: 0,
      totalRequests: 100,
      errorRate: 0
    };
  }

  /**
   * Get database error rate
   */
  private async getDatabaseErrorRate(): Promise<{
    errorCount: number;
    totalRequests: number;
    errorRate: number;
  }> {
    // This would typically come from CloudWatch or application logs
    // For now, return mock data
    return {
      errorCount: 1,
      totalRequests: 200,
      errorRate: 0.5
    };
  }

  /**
   * Get storage error rate
   */
  private async getStorageErrorRate(): Promise<{
    errorCount: number;
    totalRequests: number;
    errorRate: number;
  }> {
    // This would typically come from CloudWatch or application logs
    // For now, return mock data
    return {
      errorCount: 0,
      totalRequests: 50,
      errorRate: 0
    };
  }

  /**
   * Get API error rate
   */
  private async getApiErrorRate(): Promise<{
    errorCount: number;
    totalRequests: number;
    errorRate: number;
  }> {
    // This would typically come from CloudWatch or application logs
    // For now, return mock data
    return {
      errorCount: 2,
      totalRequests: 150,
      errorRate: 1.33
    };
  }

  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(
    performanceMetrics: PerformanceMetric[],
    errorRates: ErrorRateMetric[]
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    const slowMetrics = performanceMetrics.filter(m => m.status !== 'good');
    slowMetrics.forEach(metric => {
      switch (metric.name) {
        case 'authentication-latency':
          if (metric.status === 'critical') {
            recommendations.push('Critical: Authentication latency is very high. Check Cognito service status and network connectivity.');
          } else {
            recommendations.push('Warning: Authentication latency is elevated. Monitor Cognito performance.');
          }
          break;
        case 'database-latency':
          if (metric.status === 'critical') {
            recommendations.push('Critical: Database latency is very high. Check RDS performance and connection pool settings.');
          } else {
            recommendations.push('Warning: Database latency is elevated. Consider optimizing queries or adding read replicas.');
          }
          break;
        case 'storage-latency':
          if (metric.status === 'critical') {
            recommendations.push('Critical: Storage latency is very high. Check S3 service status and consider using CloudFront.');
          } else {
            recommendations.push('Warning: Storage latency is elevated. Consider implementing caching or using CloudFront CDN.');
          }
          break;
        case 'api-latency':
          if (metric.status === 'critical') {
            recommendations.push('Critical: API latency is very high. Check API Gateway and Lambda function performance.');
          } else {
            recommendations.push('Warning: API latency is elevated. Review Lambda function performance and API Gateway configuration.');
          }
          break;
        case 'memory-usage':
          if (metric.status === 'critical') {
            recommendations.push('Critical: Memory usage is very high. Check for memory leaks and optimize application code.');
          } else {
            recommendations.push('Warning: Memory usage is elevated. Monitor for potential memory leaks.');
          }
          break;
      }
    });

    // Error rate recommendations
    const highErrorRates = errorRates.filter(e => e.status !== 'good');
    highErrorRates.forEach(errorRate => {
      if (errorRate.status === 'critical') {
        recommendations.push(`Critical: ${errorRate.service} error rate is ${errorRate.errorRate.toFixed(1)}%. Immediate investigation required.`);
      } else {
        recommendations.push(`Warning: ${errorRate.service} error rate is ${errorRate.errorRate.toFixed(1)}%. Monitor closely.`);
      }
    });

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('System is performing well. Continue monitoring.');
    } else {
      recommendations.push('Set up CloudWatch alarms for critical metrics.');
      recommendations.push('Review application logs for detailed error information.');
    }

    return recommendations;
  }

  /**
   * Generate alerts based on metrics
   */
  private generateAlerts(
    performanceMetrics: PerformanceMetric[],
    errorRates: ErrorRateMetric[]
  ): string[] {
    const alerts: string[] = [];

    // Critical performance alerts
    const criticalMetrics = performanceMetrics.filter(m => m.status === 'critical');
    criticalMetrics.forEach(metric => {
      alerts.push(`CRITICAL: ${metric.name} is ${metric.value}${metric.unit} (threshold: ${metric.threshold}${metric.unit})`);
    });

    // Critical error rate alerts
    const criticalErrors = errorRates.filter(e => e.status === 'critical');
    criticalErrors.forEach(errorRate => {
      alerts.push(`CRITICAL: ${errorRate.service} error rate is ${errorRate.errorRate.toFixed(1)}% (threshold: ${errorRate.threshold}%)`);
    });

    return alerts;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(metricName: string): PerformanceMetric[] {
    return this.metricsHistory.get(metricName) || [];
  }

  /**
   * Get error rate history
   */
  getErrorRateHistory(service: string): ErrorRateMetric[] {
    return this.errorHistory.get(service) || [];
  }
}

// Export singleton instance
export const postMigrationMonitoring = new PostMigrationMonitoringService();

// Export types
export type { PerformanceMetric, ErrorRateMetric, SystemHealthReport };