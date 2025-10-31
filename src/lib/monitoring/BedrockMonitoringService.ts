/**
 * Bedrock-Specific Monitoring Service
 * Monitors AWS Bedrock performance, costs, and service quotas
 */

import { CloudWatchClient, PutMetricDataCommand, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { bedrockConfig, getAwsCredentials } from '../aws-config';
import { logger } from '../logging';
import { performanceMonitor } from '../performanceMonitor';
import { aiPerformanceMonitoringService } from '../aiPerformanceMonitoringService';
import { aiCostMonitoringService } from '../aiCostMonitoringService';

interface BedrockMetrics {
  modelInvocations: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
  throttleRate: number;
  timestamp: string;
}

interface BedrockQuotaStatus {
  modelId: string;
  quotaType: 'requests_per_minute' | 'tokens_per_minute' | 'concurrent_requests';
  currentUsage: number;
  quotaLimit: number;
  utilizationPercentage: number;
  status: 'healthy' | 'warning' | 'critical';
}

interface BedrockAlert {
  id: string;
  type: 'quota_exceeded' | 'high_latency' | 'error_spike' | 'cost_threshold' | 'throttling';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  modelId?: string;
  threshold: number;
  currentValue: number;
  timestamp: string;
  resolved: boolean;
}

export class BedrockMonitoringService {
  private cloudWatchClient: CloudWatchClient;
  private logger = logger.child({ component: 'BedrockMonitoringService' });
  private initialized = false;
  private metrics: Map<string, BedrockMetrics[]> = new Map();
  private alerts: Map<string, BedrockAlert> = new Map();
  private quotaStatus: Map<string, BedrockQuotaStatus> = new Map();
  private monitoringInterval?: NodeJS.Timeout;

  // Monitoring thresholds
  private thresholds = {
    latency: {
      warning: 3000, // 3 seconds
      critical: 8000, // 8 seconds
    },
    errorRate: {
      warning: 0.02, // 2%
      critical: 0.05, // 5%
    },
    throttleRate: {
      warning: 0.01, // 1%
      critical: 0.03, // 3%
    },
    quotaUtilization: {
      warning: 0.8, // 80%
      critical: 0.95, // 95%
    },
    costPerHour: {
      warning: 5.0, // $5/hour
      critical: 20.0, // $20/hour
    },
  };

  constructor() {
    const credentials = getAwsCredentials();
    
    this.cloudWatchClient = new CloudWatchClient({
      region: bedrockConfig.region,
      credentials,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.logger.info('Initializing Bedrock Monitoring Service');

      // Validate CloudWatch access
      await this.validateCloudWatchAccess();

      // Load historical metrics
      await this.loadHistoricalMetrics();

      // Start monitoring
      this.startMonitoring();

      this.initialized = true;
      this.logger.info('Bedrock Monitoring Service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Bedrock Monitoring Service', error as Error);
      throw error;
    }
  }

  /**
   * Record Bedrock-specific metrics
   */
  async recordBedrockMetrics(
    modelId: string,
    metrics: {
      inputTokens: number;
      outputTokens: number;
      latency: number;
      cost: number;
      success: boolean;
      errorType?: string;
      throttled?: boolean;
    }
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const timestamp = new Date().toISOString();
      
      // Store local metrics
      const modelMetrics = this.metrics.get(modelId) || [];
      const bedrockMetric: BedrockMetrics = {
        modelInvocations: 1,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        totalCost: metrics.cost,
        averageLatency: metrics.latency,
        errorRate: metrics.success ? 0 : 1,
        throttleRate: metrics.throttled ? 1 : 0,
        timestamp,
      };

      modelMetrics.push(bedrockMetric);
      
      // Keep only last 1000 metrics per model
      if (modelMetrics.length > 1000) {
        modelMetrics.splice(0, modelMetrics.length - 1000);
      }
      
      this.metrics.set(modelId, modelMetrics);

      // Send metrics to CloudWatch
      await this.sendMetricsToCloudWatch(modelId, bedrockMetric);

      // Check thresholds
      await this.checkBedrockThresholds(modelId, metrics);

      // Update quota tracking
      await this.updateQuotaTracking(modelId, metrics);

      this.logger.debug('Bedrock metrics recorded', {
        modelId,
        latency: metrics.latency,
        cost: metrics.cost,
        tokens: metrics.inputTokens + metrics.outputTokens,
        success: metrics.success,
      });

    } catch (error) {
      this.logger.error('Failed to record Bedrock metrics', error as Error, { modelId });
      throw error;
    }
  }

  /**
   * Get Bedrock service health dashboard
   */
  async getBedrockHealthDashboard(): Promise<{
    overallHealth: 'healthy' | 'warning' | 'critical';
    models: Array<{
      modelId: string;
      health: 'healthy' | 'warning' | 'critical';
      metrics: {
        requestsPerHour: number;
        averageLatency: number;
        errorRate: number;
        throttleRate: number;
        costPerHour: number;
        quotaUtilization: number;
      };
      alerts: BedrockAlert[];
    }>;
    systemMetrics: {
      totalRequests: number;
      totalCost: number;
      averageLatency: number;
      overallErrorRate: number;
      overallThrottleRate: number;
    };
    quotaStatus: BedrockQuotaStatus[];
    recentAlerts: BedrockAlert[];
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const models = [];
      let totalRequests = 0;
      let totalCost = 0;
      let totalLatency = 0;
      let totalErrors = 0;
      let totalThrottles = 0;

      // Calculate metrics for each model
      for (const [modelId, modelMetrics] of this.metrics.entries()) {
        const recentMetrics = modelMetrics.slice(-100); // Last 100 requests
        
        if (recentMetrics.length === 0) continue;

        const requestsPerHour = this.calculateRequestsPerHour(recentMetrics);
        const averageLatency = recentMetrics.reduce((sum, m) => sum + m.averageLatency, 0) / recentMetrics.length;
        const errorRate = recentMetrics.reduce((sum, m) => sum + m.errorRate, 0) / recentMetrics.length;
        const throttleRate = recentMetrics.reduce((sum, m) => sum + m.throttleRate, 0) / recentMetrics.length;
        const costPerHour = this.calculateCostPerHour(recentMetrics);
        
        const quotaStatus = this.quotaStatus.get(modelId);
        const quotaUtilization = quotaStatus ? quotaStatus.utilizationPercentage : 0;

        // Determine model health
        let health: 'healthy' | 'warning' | 'critical' = 'healthy';
        if (errorRate > this.thresholds.errorRate.critical || 
            throttleRate > this.thresholds.throttleRate.critical ||
            averageLatency > this.thresholds.latency.critical) {
          health = 'critical';
        } else if (errorRate > this.thresholds.errorRate.warning || 
                   throttleRate > this.thresholds.throttleRate.warning ||
                   averageLatency > this.thresholds.latency.warning) {
          health = 'warning';
        }

        const modelAlerts = Array.from(this.alerts.values())
          .filter(alert => alert.modelId === modelId && !alert.resolved);

        models.push({
          modelId,
          health,
          metrics: {
            requestsPerHour,
            averageLatency,
            errorRate,
            throttleRate,
            costPerHour,
            quotaUtilization,
          },
          alerts: modelAlerts,
        });

        // Aggregate system metrics
        totalRequests += recentMetrics.length;
        totalCost += recentMetrics.reduce((sum, m) => sum + m.totalCost, 0);
        totalLatency += averageLatency * recentMetrics.length;
        totalErrors += recentMetrics.reduce((sum, m) => sum + m.errorRate, 0);
        totalThrottles += recentMetrics.reduce((sum, m) => sum + m.throttleRate, 0);
      }

      // Calculate overall health
      let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
      const criticalModels = models.filter(m => m.health === 'critical').length;
      const warningModels = models.filter(m => m.health === 'warning').length;

      if (criticalModels > 0) {
        overallHealth = 'critical';
      } else if (warningModels > 0) {
        overallHealth = 'warning';
      }

      const systemMetrics = {
        totalRequests,
        totalCost,
        averageLatency: totalRequests > 0 ? totalLatency / totalRequests : 0,
        overallErrorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
        overallThrottleRate: totalRequests > 0 ? totalThrottles / totalRequests : 0,
      };

      const recentAlerts = Array.from(this.alerts.values())
        .filter(alert => !alert.resolved)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);

      return {
        overallHealth,
        models,
        systemMetrics,
        quotaStatus: Array.from(this.quotaStatus.values()),
        recentAlerts,
      };

    } catch (error) {
      this.logger.error('Error getting Bedrock health dashboard', error as Error);
      throw error;
    }
  }

  /**
   * Get Bedrock cost analysis
   */
  async getBedrockCostAnalysis(timeRange: { start: Date; end: Date }): Promise<{
    totalCost: number;
    costByModel: Array<{ modelId: string; cost: number; percentage: number }>;
    costTrend: Array<{ timestamp: string; cost: number }>;
    tokenUsage: {
      totalInputTokens: number;
      totalOutputTokens: number;
      costPerInputToken: number;
      costPerOutputToken: number;
    };
    projectedMonthlyCost: number;
  }> {
    try {
      let totalCost = 0;
      const costByModel = new Map<string, number>();
      const hourlyData = new Map<string, number>();
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      // Aggregate cost data
      for (const [modelId, modelMetrics] of this.metrics.entries()) {
        const filteredMetrics = modelMetrics.filter(m => {
          const timestamp = new Date(m.timestamp);
          return timestamp >= timeRange.start && timestamp <= timeRange.end;
        });

        const modelCost = filteredMetrics.reduce((sum, m) => sum + m.totalCost, 0);
        totalCost += modelCost;
        costByModel.set(modelId, modelCost);

        // Aggregate token usage
        totalInputTokens += filteredMetrics.reduce((sum, m) => sum + m.inputTokens, 0);
        totalOutputTokens += filteredMetrics.reduce((sum, m) => sum + m.outputTokens, 0);

        // Group by hour for trend analysis
        filteredMetrics.forEach(metric => {
          const hour = new Date(metric.timestamp);
          hour.setMinutes(0, 0, 0);
          const hourKey = hour.toISOString();
          
          const existingCost = hourlyData.get(hourKey) || 0;
          hourlyData.set(hourKey, existingCost + metric.totalCost);
        });
      }

      // Calculate cost percentages
      const costByModelArray = Array.from(costByModel.entries())
        .map(([modelId, cost]) => ({
          modelId,
          cost,
          percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
        }))
        .sort((a, b) => b.cost - a.cost);

      // Create cost trend
      const costTrend = Array.from(hourlyData.entries())
        .map(([timestamp, cost]) => ({ timestamp, cost }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Calculate average cost per token
      const costPerInputToken = totalInputTokens > 0 ? totalCost / totalInputTokens : 0;
      const costPerOutputToken = totalOutputTokens > 0 ? totalCost / totalOutputTokens : 0;

      // Project monthly cost based on current usage
      const timeRangeHours = (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60);
      const avgCostPerHour = timeRangeHours > 0 ? totalCost / timeRangeHours : 0;
      const projectedMonthlyCost = avgCostPerHour * 24 * 30; // 30 days

      return {
        totalCost,
        costByModel: costByModelArray,
        costTrend,
        tokenUsage: {
          totalInputTokens,
          totalOutputTokens,
          costPerInputToken,
          costPerOutputToken,
        },
        projectedMonthlyCost,
      };

    } catch (error) {
      this.logger.error('Error getting Bedrock cost analysis', error as Error);
      throw error;
    }
  }

  /**
   * Get service quotas and usage
   */
  async getServiceQuotas(): Promise<BedrockQuotaStatus[]> {
    return Array.from(this.quotaStatus.values());
  }

  /**
   * Get performance alerts
   */
  getBedrockAlerts(resolved: boolean = false): BedrockAlert[] {
    return Array.from(this.alerts.values())
      .filter(alert => alert.resolved === resolved)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private async validateCloudWatchAccess(): Promise<void> {
    try {
      // Test CloudWatch access by listing metrics
      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/Bedrock',
        MetricName: 'Invocations',
        StartTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        EndTime: new Date(),
        Period: 3600,
        Statistics: ['Sum'],
      });

      await this.cloudWatchClient.send(command);
      this.logger.debug('CloudWatch access validated successfully');
    } catch (error) {
      this.logger.warn('CloudWatch access validation failed', undefined, {
        error: (error as Error).message,
      });
      // Don't throw error - monitoring can work without CloudWatch
    }
  }

  private async sendMetricsToCloudWatch(modelId: string, metrics: BedrockMetrics): Promise<void> {
    try {
      const metricData = [
        {
          MetricName: 'Invocations',
          Value: metrics.modelInvocations,
          Unit: 'Count',
          Dimensions: [
            { Name: 'ModelId', Value: modelId },
          ],
        },
        {
          MetricName: 'InputTokens',
          Value: metrics.inputTokens,
          Unit: 'Count',
          Dimensions: [
            { Name: 'ModelId', Value: modelId },
          ],
        },
        {
          MetricName: 'OutputTokens',
          Value: metrics.outputTokens,
          Unit: 'Count',
          Dimensions: [
            { Name: 'ModelId', Value: modelId },
          ],
        },
        {
          MetricName: 'Latency',
          Value: metrics.averageLatency,
          Unit: 'Milliseconds',
          Dimensions: [
            { Name: 'ModelId', Value: modelId },
          ],
        },
        {
          MetricName: 'Cost',
          Value: metrics.totalCost,
          Unit: 'None',
          Dimensions: [
            { Name: 'ModelId', Value: modelId },
          ],
        },
        {
          MetricName: 'ErrorRate',
          Value: metrics.errorRate,
          Unit: 'Percent',
          Dimensions: [
            { Name: 'ModelId', Value: modelId },
          ],
        },
      ];

      const command = new PutMetricDataCommand({
        Namespace: 'HalluciFix/Bedrock',
        MetricData: metricData,
      });

      await this.cloudWatchClient.send(command);
      
    } catch (error) {
      this.logger.debug('Failed to send metrics to CloudWatch', undefined, {
        error: (error as Error).message,
        modelId,
      });
      // Don't throw error - local monitoring can continue
    }
  }

  private async checkBedrockThresholds(
    modelId: string, 
    metrics: {
      latency: number;
      success: boolean;
      throttled?: boolean;
    }
  ): Promise<void> {
    // Check latency threshold
    if (metrics.latency > this.thresholds.latency.critical) {
      await this.createBedrockAlert({
        type: 'high_latency',
        severity: 'critical',
        modelId,
        message: `Bedrock model ${modelId} latency ${metrics.latency}ms exceeds critical threshold`,
        threshold: this.thresholds.latency.critical,
        currentValue: metrics.latency,
      });
    } else if (metrics.latency > this.thresholds.latency.warning) {
      await this.createBedrockAlert({
        type: 'high_latency',
        severity: 'medium',
        modelId,
        message: `Bedrock model ${modelId} latency ${metrics.latency}ms exceeds warning threshold`,
        threshold: this.thresholds.latency.warning,
        currentValue: metrics.latency,
      });
    }

    // Check for throttling
    if (metrics.throttled) {
      await this.createBedrockAlert({
        type: 'throttling',
        severity: 'high',
        modelId,
        message: `Bedrock model ${modelId} request was throttled`,
        threshold: 0,
        currentValue: 1,
      });
    }

    // Check error rate (calculated from recent metrics)
    const recentMetrics = this.metrics.get(modelId)?.slice(-10) || [];
    if (recentMetrics.length >= 5) {
      const errorRate = recentMetrics.filter(m => m.errorRate > 0).length / recentMetrics.length;
      
      if (errorRate > this.thresholds.errorRate.critical) {
        await this.createBedrockAlert({
          type: 'error_spike',
          severity: 'critical',
          modelId,
          message: `Bedrock model ${modelId} error rate ${(errorRate * 100).toFixed(1)}% exceeds critical threshold`,
          threshold: this.thresholds.errorRate.critical,
          currentValue: errorRate,
        });
      }
    }
  }

  private async updateQuotaTracking(
    modelId: string, 
    metrics: { inputTokens: number; outputTokens: number }
  ): Promise<void> {
    // This is a simplified quota tracking - in a real implementation,
    // you would integrate with AWS Service Quotas API
    const totalTokens = metrics.inputTokens + metrics.outputTokens;
    
    // Estimate quota usage (these would be actual quotas from AWS)
    const estimatedQuotaLimit = 1000000; // 1M tokens per minute
    const currentUsage = totalTokens;
    const utilizationPercentage = (currentUsage / estimatedQuotaLimit) * 100;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (utilizationPercentage > this.thresholds.quotaUtilization.critical * 100) {
      status = 'critical';
    } else if (utilizationPercentage > this.thresholds.quotaUtilization.warning * 100) {
      status = 'warning';
    }

    this.quotaStatus.set(modelId, {
      modelId,
      quotaType: 'tokens_per_minute',
      currentUsage,
      quotaLimit: estimatedQuotaLimit,
      utilizationPercentage,
      status,
    });
  }

  private async createBedrockAlert(alertData: {
    type: BedrockAlert['type'];
    severity: BedrockAlert['severity'];
    modelId?: string;
    message: string;
    threshold: number;
    currentValue: number;
  }): Promise<void> {
    const alertId = `bedrock_${alertData.type}_${alertData.modelId || 'system'}_${Date.now()}`;
    
    const alert: BedrockAlert = {
      id: alertId,
      type: alertData.type,
      severity: alertData.severity,
      message: alertData.message,
      modelId: alertData.modelId,
      threshold: alertData.threshold,
      currentValue: alertData.currentValue,
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    this.alerts.set(alertId, alert);

    this.logger.warn('Bedrock alert created', alert);

    // Record alert metric
    performanceMonitor.recordBusinessMetric('bedrock_alert', 1, 'count', {
      type: alertData.type,
      severity: alertData.severity,
      modelId: alertData.modelId || 'system',
    });
  }

  private calculateRequestsPerHour(metrics: BedrockMetrics[]): number {
    if (metrics.length === 0) return 0;
    
    const timeSpan = new Date().getTime() - new Date(metrics[0].timestamp).getTime();
    const hours = timeSpan / (1000 * 60 * 60);
    
    return hours > 0 ? metrics.length / hours : 0;
  }

  private calculateCostPerHour(metrics: BedrockMetrics[]): number {
    if (metrics.length === 0) return 0;
    
    const totalCost = metrics.reduce((sum, m) => sum + m.totalCost, 0);
    const timeSpan = new Date().getTime() - new Date(metrics[0].timestamp).getTime();
    const hours = timeSpan / (1000 * 60 * 60);
    
    return hours > 0 ? totalCost / hours : 0;
  }

  private async loadHistoricalMetrics(): Promise<void> {
    // In a real implementation, this would load from persistent storage
    this.logger.debug('Loading historical Bedrock metrics');
  }

  private startMonitoring(): void {
    // Monitor every 5 minutes
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performQuotaChecks();
        await this.cleanupOldData();
      } catch (error) {
        this.logger.error('Error in Bedrock monitoring cycle', error as Error);
      }
    }, 5 * 60 * 1000);
  }

  private async performQuotaChecks(): Promise<void> {
    for (const [modelId, quotaStatus] of this.quotaStatus.entries()) {
      if (quotaStatus.status === 'critical') {
        await this.createBedrockAlert({
          type: 'quota_exceeded',
          severity: 'critical',
          modelId,
          message: `Bedrock model ${modelId} quota utilization at ${quotaStatus.utilizationPercentage.toFixed(1)}%`,
          threshold: this.thresholds.quotaUtilization.critical,
          currentValue: quotaStatus.utilizationPercentage / 100,
        });
      }
    }
  }

  private cleanupOldData(): void {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    let cleanedCount = 0;

    for (const [modelId, metrics] of this.metrics.entries()) {
      const filteredMetrics = metrics.filter(m => new Date(m.timestamp).getTime() > cutoffTime);
      if (filteredMetrics.length !== metrics.length) {
        this.metrics.set(modelId, filteredMetrics);
        cleanedCount += metrics.length - filteredMetrics.length;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} old Bedrock metrics`);
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Bedrock Monitoring Service');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.metrics.clear();
    this.alerts.clear();
    this.quotaStatus.clear();
    this.initialized = false;

    this.logger.info('Bedrock Monitoring Service shutdown complete');
  }
}

// Export singleton instance
export const bedrockMonitoringService = new BedrockMonitoringService();
export default bedrockMonitoringService;