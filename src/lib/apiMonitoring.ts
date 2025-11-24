import { performanceMonitor } from './performanceMonitor';
import { timedFetch } from './performanceUtils';

import { logger } from './logging';
export interface ApiEndpointMetrics {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  requestSize?: number;
  responseSize?: number;
  userAgent?: string;
  userId?: string;
  timestamp: Date;
}

export interface SlowQueryAlert {
  endpoint: string;
  method: string;
  responseTime: number;
  threshold: number;
  timestamp: Date;
}

/**
 * API endpoint performance monitoring service
 */
export class ApiMonitoringService {
  private slowQueryThreshold: number = 2000; // 2 seconds
  private errorRateThreshold: number = 0.05; // 5%
  private recentRequests: ApiEndpointMetrics[] = [];
  private maxHistorySize: number = 10000;

  /**
   * Monitor API endpoint performance
   */
  async monitorApiCall<T>(
    endpoint: string,
    method: string,
    apiCall: () => Promise<Response>,
    context?: {
      userId?: string;
      userAgent?: string;
      requestSize?: number;
    }
  ): Promise<Response> {
    const startTime = Date.now();
    
    try {
      const response = await apiCall();
      const responseTime = Date.now() - startTime;
      
      // Get response size if available
      const responseSize = this.getResponseSize(response);
      
      // Record metrics
      const metrics: ApiEndpointMetrics = {
        endpoint: this.normalizeEndpoint(endpoint),
        method,
        statusCode: response.status,
        responseTime,
        requestSize: context?.requestSize,
        responseSize,
        userAgent: context?.userAgent,
        userId: context?.userId,
        timestamp: new Date()
      };

      this.recordApiMetrics(metrics);
      
      // Check for slow queries
      if (responseTime > this.slowQueryThreshold) {
        await this.handleSlowQuery(metrics);
      }
      
      // Check error rates
      if (response.status >= 400) {
        await this.checkErrorRate(endpoint, method);
      }
      
      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Record error metrics
      const errorMetrics: ApiEndpointMetrics = {
        endpoint: this.normalizeEndpoint(endpoint),
        method,
        statusCode: 0, // Network error
        responseTime,
        requestSize: context?.requestSize,
        userAgent: context?.userAgent,
        userId: context?.userId,
        timestamp: new Date()
      };

      this.recordApiMetrics(errorMetrics);
      await this.checkErrorRate(endpoint, method);
      
      throw error;
    }
  }

  /**
   * Wrap fetch with monitoring
   */
  monitoredFetch(
    url: string,
    options?: RequestInit,
    context?: {
      userId?: string;
      userAgent?: string;
    }
  ): Promise<Response> {
    const method = options?.method || 'GET';
    const requestSize = this.getRequestSize(options || {});
    
    return this.monitorApiCall(
      url,
      method,
      () => fetch(url, options),
      {
        ...context,
        requestSize
      }
    );
  }

  /**
   * Record API metrics
   */
  private recordApiMetrics(metrics: ApiEndpointMetrics): void {
    // Add to history
    this.recentRequests.push(metrics);
    
    // Cleanup old requests
    if (this.recentRequests.length > this.maxHistorySize) {
      this.recentRequests = this.recentRequests.slice(-this.maxHistorySize);
    }

    // Record performance metrics
    performanceMonitor.recordApiCall(
      metrics.endpoint,
      metrics.method,
      metrics.statusCode,
      metrics.responseTime,
      {
        userId: metrics.userId || 'anonymous',
        userAgent: metrics.userAgent || 'unknown',
        ...(metrics.requestSize && { requestSize: metrics.requestSize.toString() }),
        ...(metrics.responseSize && { responseSize: metrics.responseSize.toString() })
      }
    );

    // Record throughput metrics
    performanceMonitor.recordMetric({
      name: 'api.throughput',
      value: 1,
      unit: 'count',
      tags: {
        endpoint: metrics.endpoint,
        method: metrics.method,
        status: this.getStatusCategory(metrics.statusCode)
      }
    });

    // Record response size metrics
    if (metrics.responseSize) {
      performanceMonitor.recordMetric({
        name: 'api.response_size',
        value: metrics.responseSize,
        unit: 'bytes',
        tags: {
          endpoint: metrics.endpoint,
          method: metrics.method
        }
      });
    }
  }

  /**
   * Handle slow query detection
   */
  private async handleSlowQuery(metrics: ApiEndpointMetrics): Promise<void> {
    console.warn(`Slow API call detected: ${metrics.method} ${metrics.endpoint} took ${metrics.responseTime}ms`);
    
    // Record slow query metric
    performanceMonitor.recordMetric({
      name: 'api.slow_query',
      value: 1,
      unit: 'count',
      tags: {
        endpoint: metrics.endpoint,
        method: metrics.method,
        severity: metrics.responseTime > 5000 ? 'critical' : 'warning'
      }
    });

    // Could trigger alerts here
    const alert: SlowQueryAlert = {
      endpoint: metrics.endpoint,
      method: metrics.method,
      responseTime: metrics.responseTime,
      threshold: this.slowQueryThreshold,
      timestamp: new Date()
    };

    // Log alert (could be sent to external alerting system)
    logger.info("Slow Query Alert:", { alert });
  }

  /**
   * Check error rate for endpoint
   */
  private async checkErrorRate(endpoint: string, method: string): Promise<void> {
    const recentWindow = 5 * 60 * 1000; // 5 minutes
    const cutoff = new Date(Date.now() - recentWindow);
    
    const recentRequests = this.recentRequests.filter(
      req => req.endpoint === this.normalizeEndpoint(endpoint) &&
             req.method === method &&
             req.timestamp >= cutoff
    );

    if (recentRequests.length < 10) return; // Need minimum sample size
    
    const errorCount = recentRequests.filter(req => req.statusCode >= 400).length;
    const errorRate = errorCount / recentRequests.length;
    
    if (errorRate > this.errorRateThreshold) {
      console.warn(`High error rate detected for ${method} ${endpoint}: ${(errorRate * 100).toFixed(1)}%`);
      
      performanceMonitor.recordMetric({
        name: 'api.error_rate',
        value: errorRate,
        unit: 'percent',
        tags: {
          endpoint: this.normalizeEndpoint(endpoint),
          method,
          severity: errorRate > 0.2 ? 'critical' : errorRate > 0.1 ? 'high' : 'medium'
        }
      });
    }
  }

  /**
   * Normalize endpoint for consistent metrics
   */
  private normalizeEndpoint(endpoint: string): string {
    // Replace IDs with placeholders
    return endpoint
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
      .replace(/\/[a-f0-9]{24}/g, '/:objectId');
  }

  /**
   * Get status category for grouping
   */
  private getStatusCategory(statusCode: number): string {
    if (statusCode === 0) return 'network_error';
    if (statusCode < 300) return 'success';
    if (statusCode < 400) return 'redirect';
    if (statusCode < 500) return 'client_error';
    return 'server_error';
  }

  /**
   * Get request size from options
   */
  private getRequestSize(options: RequestInit): number | undefined {
    if (!options.body) return undefined;
    
    if (typeof options.body === 'string') {
      return new Blob([options.body]).size;
    }
    
    if (options.body instanceof FormData) {
      // Approximate size for FormData
      return 1024; // Placeholder
    }
    
    if (options.body instanceof ArrayBuffer) {
      return options.body.byteLength;
    }
    
    return undefined;
  }

  /**
   * Get response size from response
   */
  private getResponseSize(response: Response): number | undefined {
    const contentLength = response.headers.get('content-length');
    return contentLength ? parseInt(contentLength, 10) : undefined;
  }

  /**
   * Get API performance report
   */
  getPerformanceReport(timeWindowMs: number = 60 * 60 * 1000): {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    slowestEndpoints: Array<{
      endpoint: string;
      method: string;
      averageResponseTime: number;
      requestCount: number;
    }>;
    errorsByEndpoint: Array<{
      endpoint: string;
      method: string;
      errorCount: number;
      errorRate: number;
    }>;
    throughputByEndpoint: Array<{
      endpoint: string;
      method: string;
      requestsPerMinute: number;
    }>;
  } {
    const cutoff = new Date(Date.now() - timeWindowMs);
    const recentRequests = this.recentRequests.filter(req => req.timestamp >= cutoff);
    
    const totalRequests = recentRequests.length;
    const averageResponseTime = totalRequests > 0 
      ? recentRequests.reduce((sum, req) => sum + req.responseTime, 0) / totalRequests
      : 0;
    
    const errorCount = recentRequests.filter(req => req.statusCode >= 400).length;
    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;
    
    // Group by endpoint and method
    const endpointGroups = new Map<string, ApiEndpointMetrics[]>();
    recentRequests.forEach(req => {
      const key = `${req.method}:${req.endpoint}`;
      const existing = endpointGroups.get(key) || [];
      existing.push(req);
      endpointGroups.set(key, existing);
    });
    
    // Calculate slowest endpoints
    const slowestEndpoints = Array.from(endpointGroups.entries())
      .map(([key, requests]) => {
        const [method, endpoint] = key.split(':');
        const averageResponseTime = requests.reduce((sum, req) => sum + req.responseTime, 0) / requests.length;
        return {
          endpoint,
          method,
          averageResponseTime,
          requestCount: requests.length
        };
      })
      .sort((a, b) => b.averageResponseTime - a.averageResponseTime)
      .slice(0, 10);
    
    // Calculate errors by endpoint
    const errorsByEndpoint = Array.from(endpointGroups.entries())
      .map(([key, requests]) => {
        const [method, endpoint] = key.split(':');
        const errorCount = requests.filter(req => req.statusCode >= 400).length;
        const errorRate = errorCount / requests.length;
        return {
          endpoint,
          method,
          errorCount,
          errorRate
        };
      })
      .filter(item => item.errorCount > 0)
      .sort((a, b) => b.errorRate - a.errorRate);
    
    // Calculate throughput by endpoint
    const timeWindowMinutes = timeWindowMs / (60 * 1000);
    const throughputByEndpoint = Array.from(endpointGroups.entries())
      .map(([key, requests]) => {
        const [method, endpoint] = key.split(':');
        return {
          endpoint,
          method,
          requestsPerMinute: requests.length / timeWindowMinutes
        };
      })
      .sort((a, b) => b.requestsPerMinute - a.requestsPerMinute)
      .slice(0, 10);
    
    return {
      totalRequests,
      averageResponseTime,
      errorRate,
      slowestEndpoints,
      errorsByEndpoint,
      throughputByEndpoint
    };
  }

  /**
   * Set slow query threshold
   */
  setSlowQueryThreshold(thresholdMs: number): void {
    this.slowQueryThreshold = thresholdMs;
  }

  /**
   * Set error rate threshold
   */
  setErrorRateThreshold(threshold: number): void {
    this.errorRateThreshold = threshold;
  }

  /**
   * Clear request history
   */
  clearHistory(): void {
    this.recentRequests = [];
  }
}

// Export singleton instance
export const apiMonitoringService = new ApiMonitoringService();
export default apiMonitoringService;