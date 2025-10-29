/**
 * AI Service Performance Monitoring
 * Monitors AI service performance, accuracy, costs, and usage patterns
 */

import { logger } from './logging';
import { performanceMonitor } from './performanceMonitor';
import { errorManager } from './errors';
import { providerManager } from './providers/ProviderManager';
import { aiCostMonitoringService } from './aiCostMonitoringService';

interface AIPerformanceMetrics {
  provider: string;
  model: string;
  timestamp: string;
  responseTime: number;
  accuracy: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  success: boolean;
  errorType?: string;
  userId: string;
  contentLength: number;
  riskLevel: string;
}

interface AIProviderPerformance {
  provider: string;
  model: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  averageAccuracy: number;
  totalCost: number;
  totalTokens: number;
  errorRate: number;
  availability: number;
  lastUpdate: string;
  performanceTrend: 'improving' | 'stable' | 'degrading';
}

interface AIServiceHealthStatus {
  overallHealth: 'healthy' | 'warning' | 'critical';
  totalProviders: number;
  healthyProviders: number;
  degradedProviders: number;
  failedProviders: number;
  systemMetrics: {
    totalRequests: number;
    averageResponseTime: number;
    overallAccuracy: number;
    totalCost: number;
    errorRate: number;
  };
  providerPerformance: AIProviderPerformance[];
  alerts: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    provider?: string;
    timestamp: string;
  }>;
  lastUpdate: string;
}

interface PerformanceAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'response_time' | 'accuracy' | 'error_rate' | 'cost' | 'availability';
  provider: string;
  model?: string;
  message: string;
  threshold: number;
  currentValue: number;
  timestamp: string;
  resolved: boolean;
}

export class AIPerformanceMonitoringService {
  private logger = logger.child({ component: 'AIPerformanceMonitoringService' });
  private metrics: Map<string, AIPerformanceMetrics[]> = new Map();
  private alerts: Map<string, PerformanceAlert> = new Map();
  private isInitialized = false;
  private monitoringInterval?: NodeJS.Timeout;

  // Performance thresholds
  private thresholds = {
    responseTime: {
      warning: 5000, // 5 seconds
      critical: 10000, // 10 seconds
    },
    accuracy: {
      warning: 70, // Below 70%
      critical: 50, // Below 50%
    },
    errorRate: {
      warning: 0.05, // 5%
      critical: 0.1, // 10%
    },
    availability: {
      warning: 0.95, // Below 95%
      critical: 0.9, // Below 90%
    },
    costPerRequest: {
      warning: 0.1, // $0.10 per request
      critical: 0.5, // $0.50 per request
    },
  };

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.logger.info('Initializing AI Performance Monitoring Service');

      // Load historical metrics
      await this.loadHistoricalMetrics();

      // Start monitoring
      this.startPerformanceMonitoring();

      this.isInitialized = true;
      this.logger.info('AI Performance Monitoring Service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize AI Performance Monitoring Service', error as Error);
      throw error;
    }
  }

  /**
   * Record AI service performance metrics
   */
  async recordPerformanceMetrics(metrics: AIPerformanceMetrics): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      this.logger.debug('Recording AI performance metrics', {
        provider: metrics.provider,
        model: metrics.model,
        responseTime: metrics.responseTime,
        accuracy: metrics.accuracy,
        cost: metrics.cost,
        success: metrics.success,
      });

      // Store metrics
      const providerKey = `${metrics.provider}:${metrics.model}`;
      const providerMetrics = this.metrics.get(providerKey) || [];
      providerMetrics.push(metrics);

      // Keep only last 1000 metrics per provider
      if (providerMetrics.length > 1000) {
        providerMetrics.splice(0, providerMetrics.length - 1000);
      }

      this.metrics.set(providerKey, providerMetrics);

      // Check for performance issues
      await this.checkPerformanceThresholds(metrics);

      // Record business metrics
      performanceMonitor.recordBusinessMetric('ai_performance_recorded', 1, 'count', {
        provider: metrics.provider,
        model: metrics.model,
        success: metrics.success.toString(),
      });

      performanceMonitor.recordBusinessMetric('ai_response_time', metrics.responseTime, 'ms', {
        provider: metrics.provider,
        model: metrics.model,
      });

      performanceMonitor.recordBusinessMetric('ai_accuracy', metrics.accuracy, 'percent', {
        provider: metrics.provider,
        model: metrics.model,
      });

      if (metrics.cost > 0) {
        performanceMonitor.recordBusinessMetric('ai_request_cost', metrics.cost, 'currency', {
          provider: metrics.provider,
          model: metrics.model,
        });
      }

    } catch (error) {
      const handledError = errorManager.handleError(error, {
        component: 'AIPerformanceMonitoringService',
        feature: 'performance-recording',
        operation: 'recordPerformanceMetrics',
        provider: metrics.provider,
      });

      this.logger.error('Failed to record AI performance metrics', handledError);
      throw handledError;
    }
  }

  /**
   * Get current AI service health status
   */
  async getServiceHealthStatus(): Promise<AIServiceHealthStatus> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const providerStatus = providerManager.getStatus();
      const providerPerformance = await this.calculateProviderPerformance();
      const systemMetrics = this.calculateSystemMetrics(providerPerformance);
      const currentAlerts = Array.from(this.alerts.values())
        .filter(alert => !alert.resolved)
        .map(alert => ({
          severity: alert.severity,
          message: alert.message,
          provider: alert.provider,
          timestamp: alert.timestamp,
        }));

      // Determine overall health
      let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
      const criticalAlerts = currentAlerts.filter(a => a.severity === 'critical').length;
      const highAlerts = currentAlerts.filter(a => a.severity === 'high').length;

      if (criticalAlerts > 0 || systemMetrics.errorRate > this.thresholds.errorRate.critical) {
        overallHealth = 'critical';
      } else if (highAlerts > 0 || systemMetrics.errorRate > this.thresholds.errorRate.warning) {
        overallHealth = 'warning';
      }

      const healthyProviders = providerPerformance.filter(p => p.availability > this.thresholds.availability.warning).length;
      const degradedProviders = providerPerformance.filter(p => 
        p.availability <= this.thresholds.availability.warning && p.availability > this.thresholds.availability.critical
      ).length;
      const failedProviders = providerPerformance.filter(p => p.availability <= this.thresholds.availability.critical).length;

      return {
        overallHealth,
        totalProviders: providerPerformance.length,
        healthyProviders,
        degradedProviders,
        failedProviders,
        systemMetrics,
        providerPerformance,
        alerts: currentAlerts,
        lastUpdate: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Error getting service health status', error as Error);
      throw error;
    }
  }

  /**
   * Get performance trends for a specific provider
   */
  async getProviderTrends(
    provider: string, 
    model?: string, 
    timeRange: { start: Date; end: Date } = {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    }
  ): Promise<{
    responseTimeTrend: Array<{ timestamp: string; value: number }>;
    accuracyTrend: Array<{ timestamp: string; value: number }>;
    errorRateTrend: Array<{ timestamp: string; value: number }>;
    costTrend: Array<{ timestamp: string; value: number }>;
    requestVolumeTrend: Array<{ timestamp: string; value: number }>;
  }> {
    try {
      const providerKey = model ? `${provider}:${model}` : provider;
      const allMetrics = this.metrics.get(providerKey) || [];
      
      // Filter by time range
      const filteredMetrics = allMetrics.filter(m => {
        const timestamp = new Date(m.timestamp);
        return timestamp >= timeRange.start && timestamp <= timeRange.end;
      });

      // Group by hour for trending
      const hourlyData = new Map<string, AIPerformanceMetrics[]>();
      filteredMetrics.forEach(metric => {
        const hour = new Date(metric.timestamp);
        hour.setMinutes(0, 0, 0);
        const hourKey = hour.toISOString();
        
        const hourMetrics = hourlyData.get(hourKey) || [];
        hourMetrics.push(metric);
        hourlyData.set(hourKey, hourMetrics);
      });

      // Calculate trends
      const responseTimeTrend: Array<{ timestamp: string; value: number }> = [];
      const accuracyTrend: Array<{ timestamp: string; value: number }> = [];
      const errorRateTrend: Array<{ timestamp: string; value: number }> = [];
      const costTrend: Array<{ timestamp: string; value: number }> = [];
      const requestVolumeTrend: Array<{ timestamp: string; value: number }> = [];

      for (const [timestamp, metrics] of hourlyData.entries()) {
        const avgResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length;
        const avgAccuracy = metrics.reduce((sum, m) => sum + m.accuracy, 0) / metrics.length;
        const errorRate = metrics.filter(m => !m.success).length / metrics.length;
        const totalCost = metrics.reduce((sum, m) => sum + m.cost, 0);
        const requestVolume = metrics.length;

        responseTimeTrend.push({ timestamp, value: avgResponseTime });
        accuracyTrend.push({ timestamp, value: avgAccuracy });
        errorRateTrend.push({ timestamp, value: errorRate });
        costTrend.push({ timestamp, value: totalCost });
        requestVolumeTrend.push({ timestamp, value: requestVolume });
      }

      return {
        responseTimeTrend: responseTimeTrend.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        accuracyTrend: accuracyTrend.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        errorRateTrend: errorRateTrend.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        costTrend: costTrend.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        requestVolumeTrend: requestVolumeTrend.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      };

    } catch (error) {
      this.logger.error('Error getting provider trends', error as Error, { provider, model });
      throw error;
    }
  }

  /**
   * Get performance alerts
   */
  getPerformanceAlerts(resolved: boolean = false): PerformanceAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => alert.resolved === resolved)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Resolve a performance alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.alerts.set(alertId, alert);
      
      this.logger.info('Performance alert resolved', {
        alertId,
        provider: alert.provider,
        type: alert.type,
      });
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      totalMetrics: Array.from(this.metrics.values()).reduce((sum, metrics) => sum + metrics.length, 0),
      activeAlerts: Array.from(this.alerts.values()).filter(a => !a.resolved).length,
      monitoredProviders: this.metrics.size,
      thresholds: this.thresholds,
    };
  }

  private async loadHistoricalMetrics(): Promise<void> {
    // In a real implementation, this would load from persistent storage
    this.logger.debug('Loading historical performance metrics');
  }

  private startPerformanceMonitoring(): void {
    // Monitor performance every 5 minutes
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
        await this.cleanupOldMetrics();
      } catch (error) {
        this.logger.error('Error in performance monitoring cycle', error as Error);
      }
    }, 5 * 60 * 1000);
  }

  private async performHealthChecks(): Promise<void> {
    try {
      const providerStatus = providerManager.getStatus();
      
      for (const provider of providerStatus.providers) {
        if (provider.enabled) {
          // Check if provider is responding
          const isHealthy = await this.checkProviderHealth(provider.name);
          
          if (!isHealthy) {
            await this.createAlert({
              type: 'availability',
              provider: provider.name,
              severity: 'critical',
              message: `Provider ${provider.name} is not responding to health checks`,
              threshold: this.thresholds.availability.critical,
              currentValue: 0,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Error performing health checks', error as Error);
    }
  }

  private async checkProviderHealth(providerName: string): Promise<boolean> {
    try {
      // This would perform actual health checks against the provider
      // For now, we'll use the provider manager's health status
      const providerStatus = providerManager.getStatus();
      const provider = providerStatus.providers.find(p => p.name === providerName);
      return provider?.healthy || false;
    } catch (error) {
      return false;
    }
  }

  private async checkPerformanceThresholds(metrics: AIPerformanceMetrics): Promise<void> {
    const providerKey = `${metrics.provider}:${metrics.model}`;

    // Check response time
    if (metrics.responseTime > this.thresholds.responseTime.critical) {
      await this.createAlert({
        type: 'response_time',
        provider: metrics.provider,
        model: metrics.model,
        severity: 'critical',
        message: `Response time ${metrics.responseTime}ms exceeds critical threshold`,
        threshold: this.thresholds.responseTime.critical,
        currentValue: metrics.responseTime,
      });
    } else if (metrics.responseTime > this.thresholds.responseTime.warning) {
      await this.createAlert({
        type: 'response_time',
        provider: metrics.provider,
        model: metrics.model,
        severity: 'high',
        message: `Response time ${metrics.responseTime}ms exceeds warning threshold`,
        threshold: this.thresholds.responseTime.warning,
        currentValue: metrics.responseTime,
      });
    }

    // Check accuracy
    if (metrics.accuracy < this.thresholds.accuracy.critical) {
      await this.createAlert({
        type: 'accuracy',
        provider: metrics.provider,
        model: metrics.model,
        severity: 'critical',
        message: `Accuracy ${metrics.accuracy}% below critical threshold`,
        threshold: this.thresholds.accuracy.critical,
        currentValue: metrics.accuracy,
      });
    } else if (metrics.accuracy < this.thresholds.accuracy.warning) {
      await this.createAlert({
        type: 'accuracy',
        provider: metrics.provider,
        model: metrics.model,
        severity: 'high',
        message: `Accuracy ${metrics.accuracy}% below warning threshold`,
        threshold: this.thresholds.accuracy.warning,
        currentValue: metrics.accuracy,
      });
    }

    // Check cost per request
    if (metrics.cost > this.thresholds.costPerRequest.critical) {
      await this.createAlert({
        type: 'cost',
        provider: metrics.provider,
        model: metrics.model,
        severity: 'critical',
        message: `Cost per request $${metrics.cost.toFixed(4)} exceeds critical threshold`,
        threshold: this.thresholds.costPerRequest.critical,
        currentValue: metrics.cost,
      });
    } else if (metrics.cost > this.thresholds.costPerRequest.warning) {
      await this.createAlert({
        type: 'cost',
        provider: metrics.provider,
        model: metrics.model,
        severity: 'medium',
        message: `Cost per request $${metrics.cost.toFixed(4)} exceeds warning threshold`,
        threshold: this.thresholds.costPerRequest.warning,
        currentValue: metrics.cost,
      });
    }
  }

  private async createAlert(alertData: {
    type: PerformanceAlert['type'];
    provider: string;
    model?: string;
    severity: PerformanceAlert['severity'];
    message: string;
    threshold: number;
    currentValue: number;
  }): Promise<void> {
    const alertId = `${alertData.provider}_${alertData.type}_${Date.now()}`;
    
    const alert: PerformanceAlert = {
      id: alertId,
      severity: alertData.severity,
      type: alertData.type,
      provider: alertData.provider,
      model: alertData.model,
      message: alertData.message,
      threshold: alertData.threshold,
      currentValue: alertData.currentValue,
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    this.alerts.set(alertId, alert);

    this.logger.warn('Performance alert created', alert);

    // Record alert metric
    performanceMonitor.recordBusinessMetric('ai_performance_alert', 1, 'count', {
      provider: alertData.provider,
      type: alertData.type,
      severity: alertData.severity,
    });
  }

  private async calculateProviderPerformance(): Promise<AIProviderPerformance[]> {
    const performance: AIProviderPerformance[] = [];

    for (const [providerKey, metrics] of this.metrics.entries()) {
      const [provider, model] = providerKey.split(':');
      
      if (metrics.length === 0) continue;

      const recentMetrics = metrics.slice(-100); // Last 100 requests
      const totalRequests = recentMetrics.length;
      const successfulRequests = recentMetrics.filter(m => m.success).length;
      const failedRequests = totalRequests - successfulRequests;
      
      const averageResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests;
      const averageAccuracy = recentMetrics.reduce((sum, m) => sum + m.accuracy, 0) / totalRequests;
      const totalCost = recentMetrics.reduce((sum, m) => sum + m.cost, 0);
      const totalTokens = recentMetrics.reduce((sum, m) => sum + m.tokenUsage.total, 0);
      const errorRate = failedRequests / totalRequests;
      const availability = successfulRequests / totalRequests;

      // Calculate performance trend
      const oldMetrics = metrics.slice(-200, -100);
      const oldAvgResponseTime = oldMetrics.length > 0 ? 
        oldMetrics.reduce((sum, m) => sum + m.responseTime, 0) / oldMetrics.length : averageResponseTime;
      
      let performanceTrend: 'improving' | 'stable' | 'degrading' = 'stable';
      const responseTimeDiff = averageResponseTime - oldAvgResponseTime;
      if (responseTimeDiff > 1000) {
        performanceTrend = 'degrading';
      } else if (responseTimeDiff < -500) {
        performanceTrend = 'improving';
      }

      performance.push({
        provider,
        model,
        totalRequests,
        successfulRequests,
        failedRequests,
        averageResponseTime,
        averageAccuracy,
        totalCost,
        totalTokens,
        errorRate,
        availability,
        lastUpdate: new Date().toISOString(),
        performanceTrend,
      });
    }

    return performance;
  }

  private calculateSystemMetrics(providerPerformance: AIProviderPerformance[]) {
    if (providerPerformance.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        overallAccuracy: 0,
        totalCost: 0,
        errorRate: 0,
      };
    }

    const totalRequests = providerPerformance.reduce((sum, p) => sum + p.totalRequests, 0);
    const totalCost = providerPerformance.reduce((sum, p) => sum + p.totalCost, 0);
    const totalFailures = providerPerformance.reduce((sum, p) => sum + p.failedRequests, 0);

    const averageResponseTime = providerPerformance.reduce((sum, p) => 
      sum + (p.averageResponseTime * p.totalRequests), 0) / totalRequests;
    
    const overallAccuracy = providerPerformance.reduce((sum, p) => 
      sum + (p.averageAccuracy * p.totalRequests), 0) / totalRequests;
    
    const errorRate = totalFailures / totalRequests;

    return {
      totalRequests,
      averageResponseTime,
      overallAccuracy,
      totalCost,
      errorRate,
    };
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    let cleanedCount = 0;

    for (const [providerKey, metrics] of this.metrics.entries()) {
      const filteredMetrics = metrics.filter(m => new Date(m.timestamp).getTime() > cutoffTime);
      if (filteredMetrics.length !== metrics.length) {
        this.metrics.set(providerKey, filteredMetrics);
        cleanedCount += metrics.length - filteredMetrics.length;
      }
    }

    // Clean up old resolved alerts
    const oldAlerts = Array.from(this.alerts.entries()).filter(([_, alert]) => 
      alert.resolved && new Date(alert.timestamp).getTime() < cutoffTime
    );

    oldAlerts.forEach(([alertId]) => this.alerts.delete(alertId));

    if (cleanedCount > 0 || oldAlerts.length > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} old metrics and ${oldAlerts.length} old alerts`);
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down AI Performance Monitoring Service');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.metrics.clear();
    this.alerts.clear();
    this.isInitialized = false;

    this.logger.info('AI Performance Monitoring Service shutdown complete');
  }
}

// Export singleton instance
export const aiPerformanceMonitoringService = new AIPerformanceMonitoringService();
export default aiPerformanceMonitoringService;