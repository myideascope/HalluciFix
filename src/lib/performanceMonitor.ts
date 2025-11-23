import { config } from './config';
import { logger } from './logging';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percent';
  tags: Record<string, string>;
  timestamp: Date;
}

export interface OperationTiming {
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface MetricsBatch {
  metrics: PerformanceMetric[];
  timestamp: Date;
  source: string;
}

/**
 * Comprehensive performance metrics collection system
 */
class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private activeOperations: Map<string, OperationTiming> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;
  private batchSize: number = 100;
  private flushIntervalMs: number = 30000; // 30 seconds

  constructor() {
    this.startPeriodicFlush();
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: Omit<PerformanceMetric, 'timestamp'>): void {
    this.metrics.push({
      ...metric,
      timestamp: new Date()
    });

    // Auto-flush if batch size reached
    if (this.metrics.length >= this.batchSize) {
      this.flushMetrics();
    }
  }

  /**
   * Start timing an operation
   */
  startOperation(
    operationName: string,
    tags?: Record<string, string>,
    metadata?: Record<string, any>
  ): string {
    const operationId = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.activeOperations.set(operationId, {
      operationName,
      startTime: Date.now(),
      tags: tags || {},
      metadata: metadata || {}
    });

    return operationId;
  }

  /**
   * End timing an operation and record metrics
   */
  endOperation(operationId: string, additionalTags?: Record<string, string>): void {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn(`Operation ${operationId} not found`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - operation.startTime;

    // Record duration metric
    this.recordMetric({
      name: `${operation.operationName}.duration`,
      value: duration,
      unit: 'ms',
      tags: { ...operation.tags, ...additionalTags || {} }
    });

    // Record operation count
    this.recordMetric({
      name: `${operation.operationName}.count`,
      value: 1,
      unit: 'count',
      tags: { ...operation.tags, ...additionalTags || {} }
    });

    this.activeOperations.delete(operationId);
  }

  /**
   * Time an async operation
   */
  async timeOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const operationId = this.startOperation(operationName, tags);
    
    try {
      const result = await operation();
      this.endOperation(operationId, { status: 'success' });
      return result;
    } catch (error) {
      this.endOperation(operationId, { 
        status: 'error',
        error: error instanceof Error ? error.name : 'unknown'
      });
      throw error;
    }
  }

  /**
   * Record API call performance
   */
  recordApiCall(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    tags?: Record<string, string>
  ): void {
    // Normalize endpoint for consistent metrics
    const normalizedEndpoint = endpoint.replace(/\/\d+/g, '/:id');
    
    this.recordMetric({
      name: 'api.request.duration',
      value: duration,
      unit: 'ms',
      tags: {
        endpoint: normalizedEndpoint,
        method,
        status_code: statusCode.toString(),
        ...tags || {}
      }
    });

    this.recordMetric({
      name: 'api.request.count',
      value: 1,
      unit: 'count',
      tags: {
        endpoint: normalizedEndpoint,
        method,
        status_code: statusCode.toString(),
        ...tags
      }
    });
  }

  /**
   * Record memory usage metrics
   */
  recordMemoryUsage(): void {
    if (typeof window !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      
      this.recordMetric({
        name: 'memory.used_heap_size',
        value: memory.usedJSHeapSize,
        unit: 'bytes',
        tags: { source: 'browser' }
      });

      this.recordMetric({
        name: 'memory.total_heap_size',
        value: memory.totalJSHeapSize,
        unit: 'bytes',
        tags: { source: 'browser' }
      });

      this.recordMetric({
        name: 'memory.heap_size_limit',
        value: memory.jsHeapSizeLimit,
        unit: 'bytes',
        tags: { source: 'browser' }
      });
    }
  }

  /**
   * Record Core Web Vitals
   */
  recordWebVital(name: string, value: number, rating: 'good' | 'needs-improvement' | 'poor'): void {
    this.recordMetric({
      name: `web_vitals.${name.toLowerCase()}`,
      value,
      unit: name === 'CLS' ? 'count' : 'ms',
      tags: { 
        rating,
        source: 'web_vitals'
      }
    });
  }

  /**
   * Record user interaction metrics
   */
  recordUserInteraction(
    action: string,
    component: string,
    duration?: number,
    metadata?: Record<string, any>
  ): void {
    this.recordMetric({
      name: 'user.interaction.count',
      value: 1,
      unit: 'count',
      tags: {
        action,
        component,
        ...(metadata && Object.keys(metadata).length > 0 ? { metadata: JSON.stringify(metadata) } : {})
      }
    });

    if (duration !== undefined) {
      this.recordMetric({
        name: 'user.interaction.duration',
        value: duration,
        unit: 'ms',
        tags: { action, component }
      });
    }
  }

  /**
   * Record business metrics
   */
  recordBusinessMetric(
    metricName: string,
    value: number,
    unit: PerformanceMetric['unit'],
    tags?: Record<string, string>
  ): void {
    this.recordMetric({
      name: `business.${metricName}`,
      value,
      unit,
      tags: { ...tags || {}, source: 'business' }
    });
  }

  /**
   * Flush metrics to external services
   */
  private async flushMetrics(): Promise<void> {
    if (this.metrics.length === 0) return;

    const metricsToFlush = [...this.metrics];
    this.metrics = [];

    try {
      // Send to external monitoring services
      await this.sendMetricsToServices(metricsToFlush);
    } catch (error) {
      logger.error('Failed to flush metrics', error instanceof Error ? error : new Error(String(error)));
      // Re-add metrics for retry
      this.metrics.unshift(...metricsToFlush);
    }
  }

  /**
   * Send metrics to external monitoring services
   */
  private async sendMetricsToServices(metrics: PerformanceMetric[]): Promise<void> {
    const batch: MetricsBatch = {
      metrics,
      timestamp: new Date(),
      source: 'hallucifix'
    };

    // Send to DataDog if configured
    if (config.monitoring?.datadog?.apiKey) {
      await this.sendToDataDog(metrics);
    }

    // Send to New Relic if configured
    if (config.monitoring?.newrelic?.apiKey) {
      await this.sendToNewRelic(metrics);
    }

    // Send to custom endpoint if configured
    if (config.monitoring?.customEndpoint) {
      await this.sendToCustomEndpoint(batch);
    }

    // Log metrics in development
    if (config.app.environment === 'development') {
      logger.debug('Performance Metrics:', { batch });
    }
  }

  /**
   * Send metrics to DataDog
   */
  private async sendToDataDog(metrics: PerformanceMetric[]): Promise<void> {
    const payload = {
      series: metrics.map(metric => ({
        metric: `hallucifix.${metric.name}`,
        points: [[Math.floor(metric.timestamp.getTime() / 1000), metric.value]],
        tags: Object.entries(metric.tags).map(([k, v]) => `${k}:${v}`),
        type: metric.unit === 'count' ? 'count' : 'gauge'
      }))
    };

    await fetch('https://api.datadoghq.com/api/v1/series', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': config.monitoring.datadog!.apiKey
      },
      body: JSON.stringify(payload)
    });
  }

  /**
   * Send metrics to New Relic
   */
  private async sendToNewRelic(metrics: PerformanceMetric[]): Promise<void> {
    const payload = metrics.map(metric => ({
      eventType: 'HallucifixMetric',
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      timestamp: metric.timestamp.getTime(),
      ...metric.tags
    }));

    await fetch('https://insights-collector.newrelic.com/v1/accounts/YOUR_ACCOUNT_ID/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Insert-Key': config.monitoring.newrelic!.apiKey
      },
      body: JSON.stringify(payload)
    });
  }

  /**
   * Send metrics to custom endpoint
   */
  private async sendToCustomEndpoint(batch: MetricsBatch): Promise<void> {
    await fetch(config.monitoring.customEndpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(batch)
    });
  }

  /**
   * Start periodic metrics flushing
   */
  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, this.flushIntervalMs);
  }

  /**
   * Stop periodic flushing
   */
  stopPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Get current metrics (for testing/debugging)
   */
  getCurrentMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.activeOperations.clear();
  }

  /**
   * Set batch size for metrics flushing
   */
  setBatchSize(size: number): void {
    this.batchSize = size;
  }

  /**
   * Set flush interval
   */
  setFlushInterval(intervalMs: number): void {
    this.flushIntervalMs = intervalMs;
    
    // Restart periodic flush with new interval
    this.stopPeriodicFlush();
    this.startPeriodicFlush();
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
export default performanceMonitor;