import { PerformanceMetric } from './performanceMonitor';

export interface AggregatedMetric {
  name: string;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  tags: Record<string, string>;
  timeWindow: {
    start: Date;
    end: Date;
  };
}

export interface MetricsAggregationConfig {
  windowSizeMs: number;
  aggregationIntervalMs: number;
  retentionPeriodMs: number;
}

/**
 * Metrics aggregation service for batch processing and analysis
 */
export class MetricsAggregator {
  private rawMetrics: PerformanceMetric[] = [];
  private aggregatedMetrics: AggregatedMetric[] = [];
  private config: MetricsAggregationConfig;
  private aggregationTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<MetricsAggregationConfig> = {}) {
    this.config = {
      windowSizeMs: config.windowSizeMs || 5 * 60 * 1000, // 5 minutes
      aggregationIntervalMs: config.aggregationIntervalMs || 60 * 1000, // 1 minute
      retentionPeriodMs: config.retentionPeriodMs || 24 * 60 * 60 * 1000 // 24 hours
    };

    this.startAggregation();
  }

  /**
   * Add raw metrics for aggregation
   */
  addMetrics(metrics: PerformanceMetric[]): void {
    this.rawMetrics.push(...metrics);
    
    // Clean up old metrics to prevent memory leaks
    this.cleanupOldMetrics();
  }

  /**
   * Get aggregated metrics for a time range
   */
  getAggregatedMetrics(
    startTime: Date,
    endTime: Date,
    metricName?: string
  ): AggregatedMetric[] {
    return this.aggregatedMetrics.filter(metric => {
      const inTimeRange = metric.timeWindow.start >= startTime && metric.timeWindow.end <= endTime;
      const matchesName = !metricName || metric.name === metricName;
      return inTimeRange && matchesName;
    });
  }

  /**
   * Get real-time metrics summary
   */
  getRealTimeMetrics(windowMs: number = 5 * 60 * 1000): {
    totalMetrics: number;
    metricsPerSecond: number;
    topMetrics: Array<{ name: string; count: number; avgValue: number }>;
    errorRate: number;
  } {
    const cutoff = new Date(Date.now() - windowMs);
    const recentMetrics = this.rawMetrics.filter(m => m.timestamp >= cutoff);
    
    const metricCounts = new Map<string, { count: number; totalValue: number; errors: number }>();
    
    recentMetrics.forEach(metric => {
      const key = metric.name;
      const current = metricCounts.get(key) || { count: 0, totalValue: 0, errors: 0 };
      
      current.count++;
      current.totalValue += metric.value;
      
      if (metric.tags.status === 'error') {
        current.errors++;
      }
      
      metricCounts.set(key, current);
    });

    const topMetrics = Array.from(metricCounts.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgValue: data.totalValue / data.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const totalErrors = Array.from(metricCounts.values()).reduce((sum, data) => sum + data.errors, 0);
    const errorRate = recentMetrics.length > 0 ? totalErrors / recentMetrics.length : 0;

    return {
      totalMetrics: recentMetrics.length,
      metricsPerSecond: recentMetrics.length / (windowMs / 1000),
      topMetrics,
      errorRate
    };
  }

  /**
   * Perform metrics aggregation
   */
  private performAggregation(): void {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.windowSizeMs);
    
    // Group metrics by name and tags combination
    const metricGroups = this.groupMetricsByNameAndTags(windowStart, now);
    
    // Aggregate each group
    const newAggregations = metricGroups.map(group => this.aggregateMetricGroup(group, windowStart, now));
    
    // Add to aggregated metrics
    this.aggregatedMetrics.push(...newAggregations);
    
    // Clean up old aggregated metrics
    this.cleanupOldAggregatedMetrics();
  }

  /**
   * Group metrics by name and tags combination
   */
  private groupMetricsByNameAndTags(
    startTime: Date,
    endTime: Date
  ): Array<{ key: string; metrics: PerformanceMetric[] }> {
    const groups = new Map<string, PerformanceMetric[]>();
    
    this.rawMetrics
      .filter(m => m.timestamp >= startTime && m.timestamp <= endTime)
      .forEach(metric => {
        const key = this.getMetricGroupKey(metric);
        const existing = groups.get(key) || [];
        existing.push(metric);
        groups.set(key, existing);
      });
    
    return Array.from(groups.entries()).map(([key, metrics]) => ({ key, metrics }));
  }

  /**
   * Generate a unique key for metric grouping
   */
  private getMetricGroupKey(metric: PerformanceMetric): string {
    const sortedTags = Object.entries(metric.tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    
    return `${metric.name}|${sortedTags}`;
  }

  /**
   * Aggregate a group of metrics
   */
  private aggregateMetricGroup(
    group: { key: string; metrics: PerformanceMetric[] },
    startTime: Date,
    endTime: Date
  ): AggregatedMetric {
    const { metrics } = group;
    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    
    const sum = values.reduce((acc, val) => acc + val, 0);
    const count = values.length;
    const avg = sum / count;
    const min = values[0];
    const max = values[values.length - 1];
    
    // Calculate percentiles
    const p50 = this.calculatePercentile(values, 0.5);
    const p95 = this.calculatePercentile(values, 0.95);
    const p99 = this.calculatePercentile(values, 0.99);
    
    // Use tags from first metric (they should all be the same in a group)
    const tags = metrics[0].tags;
    const name = metrics[0].name;

    return {
      name,
      count,
      sum,
      avg,
      min,
      max,
      p50,
      p95,
      p99,
      tags,
      timeWindow: {
        start: startTime,
        end: endTime
      }
    };
  }

  /**
   * Calculate percentile from sorted values
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];
    
    const index = (sortedValues.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedValues[lower];
    }
    
    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  /**
   * Start periodic aggregation
   */
  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      this.performAggregation();
    }, this.config.aggregationIntervalMs);
  }

  /**
   * Stop periodic aggregation
   */
  stopAggregation(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
  }

  /**
   * Clean up old raw metrics
   */
  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - this.config.retentionPeriodMs);
    this.rawMetrics = this.rawMetrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Clean up old aggregated metrics
   */
  private cleanupOldAggregatedMetrics(): void {
    const cutoff = new Date(Date.now() - this.config.retentionPeriodMs);
    this.aggregatedMetrics = this.aggregatedMetrics.filter(m => m.timeWindow.end >= cutoff);
  }

  /**
   * Get metrics statistics
   */
  getStatistics(): {
    rawMetricsCount: number;
    aggregatedMetricsCount: number;
    oldestRawMetric?: Date;
    newestRawMetric?: Date;
    oldestAggregatedMetric?: Date;
    newestAggregatedMetric?: Date;
  } {
    const rawTimestamps = this.rawMetrics.map(m => m.timestamp);
    const aggregatedTimestamps = this.aggregatedMetrics.map(m => m.timeWindow.end);

    return {
      rawMetricsCount: this.rawMetrics.length,
      aggregatedMetricsCount: this.aggregatedMetrics.length,
      oldestRawMetric: rawTimestamps.length > 0 ? new Date(Math.min(...rawTimestamps.map(d => d.getTime()))) : undefined,
      newestRawMetric: rawTimestamps.length > 0 ? new Date(Math.max(...rawTimestamps.map(d => d.getTime()))) : undefined,
      oldestAggregatedMetric: aggregatedTimestamps.length > 0 ? new Date(Math.min(...aggregatedTimestamps.map(d => d.getTime()))) : undefined,
      newestAggregatedMetric: aggregatedTimestamps.length > 0 ? new Date(Math.max(...aggregatedTimestamps.map(d => d.getTime()))) : undefined
    };
  }

  /**
   * Export aggregated metrics for external analysis
   */
  exportMetrics(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = [
        'name', 'count', 'sum', 'avg', 'min', 'max', 'p50', 'p95', 'p99',
        'tags', 'window_start', 'window_end'
      ];
      
      const rows = this.aggregatedMetrics.map(metric => [
        metric.name,
        metric.count,
        metric.sum,
        metric.avg,
        metric.min,
        metric.max,
        metric.p50,
        metric.p95,
        metric.p99,
        JSON.stringify(metric.tags),
        metric.timeWindow.start.toISOString(),
        metric.timeWindow.end.toISOString()
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    return JSON.stringify(this.aggregatedMetrics, null, 2);
  }

  /**
   * Clear all metrics
   */
  clearAll(): void {
    this.rawMetrics = [];
    this.aggregatedMetrics = [];
  }
}

// Export singleton instance
export const metricsAggregator = new MetricsAggregator();
export default metricsAggregator;