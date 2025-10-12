/**
 * Database Performance Monitor
 * Tracks query performance and provides baseline metrics
 */

import { supabase } from './supabase';

interface QueryMetrics {
  queryName: string;
  executionTime: number;
  rowsReturned: number;
  timestamp: Date;
  userId?: string;
  endpoint?: string;
  success: boolean;
  error?: string;
}

interface PerformanceReport {
  totalQueries: number;
  averageExecutionTime: number;
  slowQueries: QueryMetrics[];
  errorRate: number;
  queryBreakdown: Record<string, {
    count: number;
    avgTime: number;
    maxTime: number;
    minTime: number;
  }>;
}

class DatabasePerformanceMonitor {
  private metrics: QueryMetrics[] = [];
  private slowQueryThreshold = 1000; // 1 second
  private maxMetricsHistory = 1000; // Keep last 1000 queries

  /**
   * Track a database query and its performance
   */
  async trackQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>,
    context?: { userId?: string; endpoint?: string }
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;
    let result: T;
    let rowsReturned = 0;

    try {
      result = await queryFn();
      
      // Count rows if result is an array or has data property
      if (Array.isArray(result)) {
        rowsReturned = result.length;
      } else if (result && typeof result === 'object' && 'data' in result) {
        const data = (result as any).data;
        rowsReturned = Array.isArray(data) ? data.length : (data ? 1 : 0);
      } else if (result) {
        rowsReturned = 1;
      }

    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      const executionTime = Date.now() - startTime;
      
      // Store metrics
      this.addMetric({
        queryName,
        executionTime,
        rowsReturned,
        timestamp: new Date(),
        success,
        error,
        ...context
      });

      // Log slow queries
      if (executionTime > this.slowQueryThreshold) {
        console.warn(`Slow query detected: ${queryName} took ${executionTime}ms`, {
          executionTime,
          rowsReturned,
          success,
          error,
          ...context
        });
      }
    }

    return result!;
  }

  /**
   * Add a metric to the collection
   */
  private addMetric(metric: QueryMetrics): void {
    this.metrics.push(metric);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Get performance report for all tracked queries
   */
  getPerformanceReport(): PerformanceReport {
    if (this.metrics.length === 0) {
      return {
        totalQueries: 0,
        averageExecutionTime: 0,
        slowQueries: [],
        errorRate: 0,
        queryBreakdown: {}
      };
    }

    const totalQueries = this.metrics.length;
    const successfulQueries = this.metrics.filter(m => m.success);
    const failedQueries = this.metrics.filter(m => !m.success);
    
    const averageExecutionTime = successfulQueries.length > 0
      ? successfulQueries.reduce((sum, m) => sum + m.executionTime, 0) / successfulQueries.length
      : 0;

    const slowQueries = this.metrics.filter(m => m.executionTime > this.slowQueryThreshold);
    const errorRate = (failedQueries.length / totalQueries) * 100;

    // Query breakdown by name
    const queryBreakdown: Record<string, any> = {};
    this.metrics.forEach(metric => {
      if (!queryBreakdown[metric.queryName]) {
        queryBreakdown[metric.queryName] = {
          count: 0,
          totalTime: 0,
          maxTime: 0,
          minTime: Infinity,
          errors: 0
        };
      }

      const breakdown = queryBreakdown[metric.queryName];
      breakdown.count++;
      
      if (metric.success) {
        breakdown.totalTime += metric.executionTime;
        breakdown.maxTime = Math.max(breakdown.maxTime, metric.executionTime);
        breakdown.minTime = Math.min(breakdown.minTime, metric.executionTime);
      } else {
        breakdown.errors++;
      }
    });

    // Calculate averages
    Object.keys(queryBreakdown).forEach(queryName => {
      const breakdown = queryBreakdown[queryName];
      const successfulCount = breakdown.count - breakdown.errors;
      breakdown.avgTime = successfulCount > 0 ? breakdown.totalTime / successfulCount : 0;
      breakdown.minTime = breakdown.minTime === Infinity ? 0 : breakdown.minTime;
      delete breakdown.totalTime; // Remove intermediate calculation
    });

    return {
      totalQueries,
      averageExecutionTime: Math.round(averageExecutionTime * 100) / 100,
      slowQueries: slowQueries.slice(-10), // Last 10 slow queries
      errorRate: Math.round(errorRate * 100) / 100,
      queryBreakdown
    };
  }

  /**
   * Get database health metrics
   */
  async getDatabaseHealth(): Promise<{
    connectionStatus: 'healthy' | 'warning' | 'error';
    queryPerformance: 'good' | 'slow' | 'critical';
    errorRate: 'low' | 'medium' | 'high';
    recommendations: string[];
  }> {
    const report = this.getPerformanceReport();
    const recommendations: string[] = [];

    // Check connection status
    let connectionStatus: 'healthy' | 'warning' | 'error' = 'healthy';
    try {
      await supabase.from('users').select('count').limit(1);
    } catch (error) {
      connectionStatus = 'error';
      recommendations.push('Database connection issues detected');
    }

    // Check query performance
    let queryPerformance: 'good' | 'slow' | 'critical' = 'good';
    if (report.averageExecutionTime > 2000) {
      queryPerformance = 'critical';
      recommendations.push('Critical: Average query time exceeds 2 seconds');
    } else if (report.averageExecutionTime > 500) {
      queryPerformance = 'slow';
      recommendations.push('Warning: Average query time exceeds 500ms');
    }

    // Check error rate
    let errorRate: 'low' | 'medium' | 'high' = 'low';
    if (report.errorRate > 10) {
      errorRate = 'high';
      recommendations.push('High error rate detected (>10%)');
    } else if (report.errorRate > 5) {
      errorRate = 'medium';
      recommendations.push('Elevated error rate detected (>5%)');
    }

    // Check for slow queries
    if (report.slowQueries.length > 0) {
      recommendations.push(`${report.slowQueries.length} slow queries detected`);
    }

    // Performance recommendations
    if (report.totalQueries > 100) {
      const topSlowQueries = Object.entries(report.queryBreakdown)
        .filter(([_, stats]) => stats.avgTime > 500)
        .sort((a, b) => b[1].avgTime - a[1].avgTime)
        .slice(0, 3);

      if (topSlowQueries.length > 0) {
        recommendations.push(
          `Consider optimizing: ${topSlowQueries.map(([name]) => name).join(', ')}`
        );
      }
    }

    return {
      connectionStatus,
      queryPerformance,
      errorRate,
      recommendations
    };
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Set slow query threshold
   */
  setSlowQueryThreshold(milliseconds: number): void {
    this.slowQueryThreshold = milliseconds;
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(): QueryMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get metrics for a specific time range
   */
  getMetricsInRange(startTime: Date, endTime: Date): QueryMetrics[] {
    return this.metrics.filter(
      metric => metric.timestamp >= startTime && metric.timestamp <= endTime
    );
  }

  /**
   * Get metrics for a specific query name
   */
  getMetricsForQuery(queryName: string): QueryMetrics[] {
    return this.metrics.filter(metric => metric.queryName === queryName);
  }
}

// Create singleton instance
export const dbMonitor = new DatabasePerformanceMonitor();

// Helper function to wrap Supabase queries with monitoring
export const monitoredQuery = <T>(
  queryName: string,
  queryFn: () => Promise<T>,
  context?: { userId?: string; endpoint?: string }
): Promise<T> => {
  return dbMonitor.trackQuery(queryName, queryFn, context);
};

export default DatabasePerformanceMonitor;