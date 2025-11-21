import { getElastiCacheService } from './elastiCacheService';

import { logger } from './logging';
export interface CachePerformanceMetrics {
  hitRate: number;
  missRate: number;
  averageLatency: number;
  totalOperations: number;
  errorRate: number;
  memoryUsage?: number;
  connectionCount: number;
  timestamp: Date;
}

export interface CacheAlert {
  type: 'hit_rate' | 'latency' | 'memory' | 'connections' | 'errors';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export interface CacheHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  details: {
    connectivity: boolean;
    performance: boolean;
    memory: boolean;
    errors: boolean;
  };
  alerts: CacheAlert[];
}

export class CacheMonitoringService {
  private elastiCacheService: any;
  private performanceHistory: CachePerformanceMetrics[] = [];
  private alertThresholds = {
    hitRate: { warning: 80, critical: 70 },
    latency: { warning: 10, critical: 20 },
    memoryUsage: { warning: 80, critical: 90 },
    errorRate: { warning: 1, critical: 5 },
  };

  constructor() {
    try {
      this.elastiCacheService = getElastiCacheService();
    } catch (error) {
      logger.warn("ElastiCache service not available:", { error });
    }
  }

  async getCurrentMetrics(): Promise<CachePerformanceMetrics | null> {
    if (!this.elastiCacheService) {
      return null;
    }

    try {
      const metrics = this.elastiCacheService.getMetrics();
      const memoryUsage = await this.elastiCacheService.getMemoryUsage();
      
      const performanceMetrics: CachePerformanceMetrics = {
        hitRate: metrics.hitRate,
        missRate: 100 - metrics.hitRate,
        averageLatency: metrics.latency,
        totalOperations: metrics.totalOperations,
        errorRate: this.calculateErrorRate(metrics),
        memoryUsage: memoryUsage || undefined,
        connectionCount: metrics.connectionCount,
        timestamp: new Date(),
      };

      // Add to history (keep last 100 entries)
      this.performanceHistory.push(performanceMetrics);
      if (this.performanceHistory.length > 100) {
        this.performanceHistory.shift();
      }

      return performanceMetrics;
    } catch (error) {
      logger.error("Failed to get cache metrics:", error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  async getHealthStatus(): Promise<CacheHealthStatus> {
    const metrics = await this.getCurrentMetrics();
    const alerts: CacheAlert[] = [];

    if (!metrics) {
      return {
        overall: 'unhealthy',
        details: {
          connectivity: false,
          performance: false,
          memory: false,
          errors: false,
        },
        alerts: [{
          type: 'errors',
          severity: 'critical',
          message: 'Cache service is not available',
          value: 0,
          threshold: 0,
          timestamp: new Date(),
        }],
      };
    }

    // Check connectivity
    let connectivity = true;
    try {
      const healthCheck = await this.elastiCacheService.healthCheck();
      connectivity = healthCheck.status === 'healthy';
    } catch (error) {
      connectivity = false;
      alerts.push({
        type: 'connections',
        severity: 'critical',
        message: 'Cache connectivity check failed',
        value: 0,
        threshold: 1,
        timestamp: new Date(),
      });
    }

    // Check hit rate
    const performance = this.checkHitRate(metrics, alerts);

    // Check latency
    this.checkLatency(metrics, alerts);

    // Check memory usage
    const memory = this.checkMemoryUsage(metrics, alerts);

    // Check error rate
    const errors = this.checkErrorRate(metrics, alerts);

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const warningAlerts = alerts.filter(a => a.severity === 'warning');

    if (criticalAlerts.length > 0 || !connectivity) {
      overall = 'unhealthy';
    } else if (warningAlerts.length > 0) {
      overall = 'degraded';
    }

    return {
      overall,
      details: {
        connectivity,
        performance,
        memory,
        errors,
      },
      alerts,
    };
  }

  getPerformanceHistory(limit?: number): CachePerformanceMetrics[] {
    const history = [...this.performanceHistory];
    return limit ? history.slice(-limit) : history;
  }

  getPerformanceTrends(): {
    hitRateTrend: 'improving' | 'stable' | 'declining';
    latencyTrend: 'improving' | 'stable' | 'declining';
    operationsTrend: 'increasing' | 'stable' | 'decreasing';
  } {
    if (this.performanceHistory.length < 10) {
      return {
        hitRateTrend: 'stable',
        latencyTrend: 'stable',
        operationsTrend: 'stable',
      };
    }

    const recent = this.performanceHistory.slice(-5);
    const previous = this.performanceHistory.slice(-10, -5);

    const recentHitRate = recent.reduce((sum, m) => sum + m.hitRate, 0) / recent.length;
    const previousHitRate = previous.reduce((sum, m) => sum + m.hitRate, 0) / previous.length;

    const recentLatency = recent.reduce((sum, m) => sum + m.averageLatency, 0) / recent.length;
    const previousLatency = previous.reduce((sum, m) => sum + m.averageLatency, 0) / previous.length;

    const recentOps = recent.reduce((sum, m) => sum + m.totalOperations, 0) / recent.length;
    const previousOps = previous.reduce((sum, m) => sum + m.totalOperations, 0) / previous.length;

    return {
      hitRateTrend: this.getTrend(recentHitRate, previousHitRate, 2),
      latencyTrend: this.getTrend(previousLatency, recentLatency, 1), // Lower is better for latency
      operationsTrend: this.getTrend(recentOps, previousOps, 10),
    };
  }

  private getTrend(current: number, previous: number, threshold: number): 'improving' | 'stable' | 'declining' {
    const diff = current - previous;
    if (Math.abs(diff) < threshold) return 'stable';
    return diff > 0 ? 'improving' : 'declining';
  }

  private calculateErrorRate(metrics: any): number {
    const totalErrors = (metrics.getErrors || 0) + (metrics.setErrors || 0) + (metrics.connectionErrors || 0);
    return metrics.totalOperations > 0 ? (totalErrors / metrics.totalOperations) * 100 : 0;
  }

  private checkHitRate(metrics: CachePerformanceMetrics, alerts: CacheAlert[]): boolean {
    if (metrics.hitRate < this.alertThresholds.hitRate.critical) {
      alerts.push({
        type: 'hit_rate',
        severity: 'critical',
        message: `Cache hit rate is critically low: ${metrics.hitRate.toFixed(1)}%`,
        value: metrics.hitRate,
        threshold: this.alertThresholds.hitRate.critical,
        timestamp: new Date(),
      });
      return false;
    } else if (metrics.hitRate < this.alertThresholds.hitRate.warning) {
      alerts.push({
        type: 'hit_rate',
        severity: 'warning',
        message: `Cache hit rate is below optimal: ${metrics.hitRate.toFixed(1)}%`,
        value: metrics.hitRate,
        threshold: this.alertThresholds.hitRate.warning,
        timestamp: new Date(),
      });
      return false;
    }
    return true;
  }

  private checkLatency(metrics: CachePerformanceMetrics, alerts: CacheAlert[]): void {
    if (metrics.averageLatency > this.alertThresholds.latency.critical) {
      alerts.push({
        type: 'latency',
        severity: 'critical',
        message: `Cache latency is critically high: ${metrics.averageLatency.toFixed(1)}ms`,
        value: metrics.averageLatency,
        threshold: this.alertThresholds.latency.critical,
        timestamp: new Date(),
      });
    } else if (metrics.averageLatency > this.alertThresholds.latency.warning) {
      alerts.push({
        type: 'latency',
        severity: 'warning',
        message: `Cache latency is elevated: ${metrics.averageLatency.toFixed(1)}ms`,
        value: metrics.averageLatency,
        threshold: this.alertThresholds.latency.warning,
        timestamp: new Date(),
      });
    }
  }

  private checkMemoryUsage(metrics: CachePerformanceMetrics, alerts: CacheAlert[]): boolean {
    if (!metrics.memoryUsage) return true;

    // Convert bytes to percentage (assuming we know the max memory)
    // This is a simplified calculation - in practice, you'd get this from ElastiCache metrics
    const memoryPercentage = metrics.memoryUsage / (1024 * 1024 * 1024); // Rough estimate

    if (memoryPercentage > this.alertThresholds.memoryUsage.critical) {
      alerts.push({
        type: 'memory',
        severity: 'critical',
        message: `Cache memory usage is critically high: ${memoryPercentage.toFixed(1)}%`,
        value: memoryPercentage,
        threshold: this.alertThresholds.memoryUsage.critical,
        timestamp: new Date(),
      });
      return false;
    } else if (memoryPercentage > this.alertThresholds.memoryUsage.warning) {
      alerts.push({
        type: 'memory',
        severity: 'warning',
        message: `Cache memory usage is elevated: ${memoryPercentage.toFixed(1)}%`,
        value: memoryPercentage,
        threshold: this.alertThresholds.memoryUsage.warning,
        timestamp: new Date(),
      });
      return false;
    }
    return true;
  }

  private checkErrorRate(metrics: CachePerformanceMetrics, alerts: CacheAlert[]): boolean {
    if (metrics.errorRate > this.alertThresholds.errorRate.critical) {
      alerts.push({
        type: 'errors',
        severity: 'critical',
        message: `Cache error rate is critically high: ${metrics.errorRate.toFixed(1)}%`,
        value: metrics.errorRate,
        threshold: this.alertThresholds.errorRate.critical,
        timestamp: new Date(),
      });
      return false;
    } else if (metrics.errorRate > this.alertThresholds.errorRate.warning) {
      alerts.push({
        type: 'errors',
        severity: 'warning',
        message: `Cache error rate is elevated: ${metrics.errorRate.toFixed(1)}%`,
        value: metrics.errorRate,
        threshold: this.alertThresholds.errorRate.warning,
        timestamp: new Date(),
      });
      return false;
    }
    return true;
  }

  async generatePerformanceReport(): Promise<{
    summary: string;
    recommendations: string[];
    metrics: CachePerformanceMetrics | null;
    trends: ReturnType<CacheMonitoringService['getPerformanceTrends']>;
    health: CacheHealthStatus;
  }> {
    const metrics = await this.getCurrentMetrics();
    const trends = this.getPerformanceTrends();
    const health = await this.getHealthStatus();

    let summary = 'Cache performance report: ';
    const recommendations: string[] = [];

    if (health.overall === 'healthy') {
      summary += 'All systems operating normally.';
    } else if (health.overall === 'degraded') {
      summary += 'Some performance issues detected.';
    } else {
      summary += 'Critical issues require immediate attention.';
    }

    // Generate recommendations based on metrics and trends
    if (metrics) {
      if (metrics.hitRate < 80) {
        recommendations.push('Consider reviewing cache TTL settings and cache key strategies to improve hit rate.');
      }
      
      if (metrics.averageLatency > 10) {
        recommendations.push('Investigate network connectivity and Redis performance for high latency.');
      }
      
      if (trends.hitRateTrend === 'declining') {
        recommendations.push('Hit rate is declining - review recent application changes that might affect caching.');
      }
      
      if (trends.latencyTrend === 'declining') {
        recommendations.push('Latency is increasing - consider scaling up ElastiCache instance or optimizing queries.');
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Cache is performing optimally. Continue monitoring for any changes.');
    }

    return {
      summary,
      recommendations,
      metrics,
      trends,
      health,
    };
  }
}

// Export singleton instance
export const cacheMonitoringService = new CacheMonitoringService();