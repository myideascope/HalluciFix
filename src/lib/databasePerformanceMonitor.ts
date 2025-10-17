import { supabase } from './supabase';
import { performanceMonitor } from './performanceMonitor';

export interface QueryMetrics {
  query: string;
  executionTime: number;
  rowsReturned: number;
  timestamp: Date;
  userId?: string;
  endpoint?: string;
  error?: string;
}

export interface PerformanceAlert {
  id: string;
  type: 'slow_query' | 'high_error_rate' | 'connection_pool_exhaustion' | 'disk_space_warning';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface HealthCheckResult {
  status: 'healthy' | 'warning' | 'critical';
  checks: {
    connection: boolean;
    queryPerformance: boolean;
    indexUsage: boolean;
    diskSpace: boolean;
    connectionPool: boolean;
  };
  metrics: {
    avgQueryTime: number;
    activeConnections: number;
    indexHitRatio: number;
    diskUsagePercent: number;
    errorRate: number;
  };
  recommendations: string[];
}

/**
 * Database Performance Monitor with real-time tracking and alerting
 */
class DatabasePerformanceMonitor {
  private metrics: QueryMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private slowQueryThreshold: number = 1000; // 1 second
  private errorRateThreshold: number = 0.05; // 5%
  private maxMetricsHistory: number = 10000;
  private alertCallbacks: Array<(alert: PerformanceAlert) => void> = [];

  constructor() {
    // Start periodic health checks
    this.startPeriodicHealthChecks();
  }

  /**
   * Track query performance with automatic alerting
   */
  async trackQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>,
    context?: { userId?: string; endpoint?: string }
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await queryFn();
      const executionTime = Date.now() - startTime;
      
      // Store metrics
      const metrics: QueryMetrics = {
        query: queryName,
        executionTime,
        rowsReturned: Array.isArray(result) ? result.length : 1,
        timestamp: new Date(),
        ...context
      };

      this.addMetrics(metrics);
      
      // Record in central performance monitor
      performanceMonitor.recordMetric({
        name: 'database.query.duration',
        value: executionTime,
        unit: 'ms',
        tags: {
          query: queryName,
          status: 'success',
          userId: context?.userId || 'unknown',
          endpoint: context?.endpoint || 'unknown'
        }
      });
      
      // Check for slow queries
      if (executionTime > this.slowQueryThreshold) {
        await this.handleSlowQuery(metrics);
      }
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Store error metrics
      const errorMetrics: QueryMetrics = {
        query: queryName,
        executionTime,
        rowsReturned: 0,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        ...context
      };

      this.addMetrics(errorMetrics);
      
      // Record error in central performance monitor
      performanceMonitor.recordMetric({
        name: 'database.query.duration',
        value: executionTime,
        unit: 'ms',
        tags: {
          query: queryName,
          status: 'error',
          error: error instanceof Error ? error.name : 'unknown',
          userId: context?.userId || 'unknown',
          endpoint: context?.endpoint || 'unknown'
        }
      });
      
      // Check error rate
      await this.checkErrorRate();
      
      throw error;
    }
  }

  /**
   * Wrap Supabase queries with performance monitoring
   */
  wrapSupabaseQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>,
    context?: { userId?: string; endpoint?: string }
  ): Promise<T> {
    return this.trackQuery(queryName, queryFn, context);
  }

  /**
   * Add metrics to history with cleanup
   */
  private addMetrics(metrics: QueryMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only recent metrics to prevent memory leaks
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Handle slow query detection and alerting
   */
  private async handleSlowQuery(metrics: QueryMetrics): Promise<void> {
    console.warn(`Slow query detected: ${metrics.query} took ${metrics.executionTime}ms`);
    
    const alert: PerformanceAlert = {
      id: `slow_query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'slow_query',
      severity: metrics.executionTime > 5000 ? 'critical' : 
                metrics.executionTime > 3000 ? 'high' : 'medium',
      message: `Slow query detected: ${metrics.query} executed in ${metrics.executionTime}ms`,
      timestamp: new Date(),
      metadata: {
        queryName: metrics.query,
        executionTime: metrics.executionTime,
        userId: metrics.userId,
        endpoint: metrics.endpoint
      }
    };

    await this.triggerAlert(alert);
    
    // Store slow query for analysis
    await this.storeSlowQueryLog(metrics);
  }

  /**
   * Check error rate and trigger alerts if threshold exceeded
   */
  private async checkErrorRate(): Promise<void> {
    const recentMetrics = this.getRecentMetrics(5 * 60 * 1000); // Last 5 minutes
    
    if (recentMetrics.length < 10) return; // Need minimum sample size
    
    const errorCount = recentMetrics.filter(m => m.error).length;
    const errorRate = errorCount / recentMetrics.length;
    
    if (errorRate > this.errorRateThreshold) {
      const alert: PerformanceAlert = {
        id: `error_rate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'high_error_rate',
        severity: errorRate > 0.2 ? 'critical' : errorRate > 0.1 ? 'high' : 'medium',
        message: `High error rate detected: ${(errorRate * 100).toFixed(1)}% of queries failing`,
        timestamp: new Date(),
        metadata: {
          errorRate,
          totalQueries: recentMetrics.length,
          errorCount
        }
      };

      await this.triggerAlert(alert);
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks = {
      connection: await this.checkConnection(),
      queryPerformance: await this.checkQueryPerformance(),
      indexUsage: await this.checkIndexUsage(),
      diskSpace: await this.checkDiskSpace(),
      connectionPool: await this.checkConnectionPool()
    };

    const metrics = await this.collectHealthMetrics();
    const recommendations = this.generateRecommendations(checks, metrics);
    const status = this.determineOverallStatus(checks, metrics);

    return {
      status,
      checks,
      metrics,
      recommendations
    };
  }

  /**
   * Check database connection health
   */
  private async checkConnection(): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('count')
        .limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Check query performance health
   */
  private async checkQueryPerformance(): Promise<boolean> {
    const recentMetrics = this.getRecentMetrics(10 * 60 * 1000); // Last 10 minutes
    
    if (recentMetrics.length === 0) return true;
    
    const avgExecutionTime = recentMetrics.reduce((sum, m) => sum + m.executionTime, 0) / recentMetrics.length;
    return avgExecutionTime < 500; // 500ms threshold
  }

  /**
   * Check index usage (placeholder - would need database-specific queries)
   */
  private async checkIndexUsage(): Promise<boolean> {
    try {
      // This would typically query pg_stat_user_indexes or similar
      // For now, we'll assume indexes are being used properly
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check disk space (placeholder - would need system-level access)
   */
  private async checkDiskSpace(): Promise<boolean> {
    try {
      // This would typically check disk usage
      // For now, we'll assume disk space is adequate
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Check connection pool health
   */
  private async checkConnectionPool(): Promise<boolean> {
    try {
      // This would check connection pool metrics
      // For now, we'll assume connection pool is healthy
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Collect health metrics
   */
  private async collectHealthMetrics(): Promise<HealthCheckResult['metrics']> {
    const recentMetrics = this.getRecentMetrics(10 * 60 * 1000); // Last 10 minutes
    
    const avgQueryTime = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.executionTime, 0) / recentMetrics.length
      : 0;

    const errorCount = recentMetrics.filter(m => m.error).length;
    const errorRate = recentMetrics.length > 0 ? errorCount / recentMetrics.length : 0;

    return {
      avgQueryTime,
      activeConnections: 0, // Would be populated from actual connection pool
      indexHitRatio: 0.95, // Would be populated from database stats
      diskUsagePercent: 0, // Would be populated from system stats
      errorRate
    };
  }

  /**
   * Generate health recommendations
   */
  private generateRecommendations(
    checks: HealthCheckResult['checks'],
    metrics: HealthCheckResult['metrics']
  ): string[] {
    const recommendations: string[] = [];

    if (!checks.queryPerformance || metrics.avgQueryTime > 1000) {
      recommendations.push('Consider optimizing slow queries or adding indexes');
    }

    if (!checks.indexUsage) {
      recommendations.push('Review and optimize database indexes');
    }

    if (!checks.diskSpace) {
      recommendations.push('Archive old data or increase disk space');
    }

    if (!checks.connectionPool) {
      recommendations.push('Consider increasing connection pool size');
    }

    if (metrics.errorRate > 0.05) {
      recommendations.push('Investigate and resolve query errors');
    }

    if (recommendations.length === 0) {
      recommendations.push('Database performance is optimal');
    }

    return recommendations;
  }

  /**
   * Determine overall health status
   */
  private determineOverallStatus(
    checks: HealthCheckResult['checks'],
    metrics: HealthCheckResult['metrics']
  ): HealthCheckResult['status'] {
    const failedChecks = Object.values(checks).filter(check => !check).length;
    
    if (failedChecks === 0 && metrics.avgQueryTime < 200 && metrics.errorRate < 0.01) {
      return 'healthy';
    } else if (failedChecks <= 1 && metrics.avgQueryTime < 1000 && metrics.errorRate < 0.05) {
      return 'warning';
    } else {
      return 'critical';
    }
  }

  /**
   * Store slow query log for analysis
   */
  private async storeSlowQueryLog(metrics: QueryMetrics): Promise<void> {
    try {
      await supabase.from('query_performance_log').insert({
        query_name: metrics.query,
        execution_time: metrics.executionTime,
        rows_returned: metrics.rowsReturned,
        user_id: metrics.userId,
        endpoint: metrics.endpoint,
        timestamp: metrics.timestamp.toISOString(),
        error_message: metrics.error
      });
    } catch (error) {
      console.error('Failed to store slow query log:', error);
    }
  }

  /**
   * Trigger alert and notify callbacks
   */
  private async triggerAlert(alert: PerformanceAlert): Promise<void> {
    this.alerts.push(alert);
    
    // Keep only recent alerts
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    // Notify alert callbacks
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        console.error('Alert callback failed:', error);
      }
    });

    // Store alert in database
    try {
      await supabase.from('performance_alerts').insert({
        alert_type: alert.type,
        severity: alert.severity,
        message: alert.message,
        metadata: alert.metadata,
        timestamp: alert.timestamp.toISOString()
      });
    } catch (error) {
      console.error('Failed to store alert:', error);
    }
  }

  /**
   * Get recent metrics within time window
   */
  private getRecentMetrics(timeWindowMs: number): QueryMetrics[] {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return this.metrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicHealthChecks(): void {
    // Perform health check every 5 minutes
    setInterval(async () => {
      try {
        const healthResult = await this.performHealthCheck();
        
        if (healthResult.status === 'critical') {
          const alert: PerformanceAlert = {
            id: `health_check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'connection_pool_exhaustion', // Generic type for health issues
            severity: 'critical',
            message: 'Database health check failed',
            timestamp: new Date(),
            metadata: healthResult
          };
          
          await this.triggerAlert(alert);
        }
      } catch (error) {
        console.error('Periodic health check failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Subscribe to performance alerts
   */
  onAlert(callback: (alert: PerformanceAlert) => void): () => void {
    this.alertCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.alertCallbacks.indexOf(callback);
      if (index > -1) {
        this.alertCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): {
    slowQueries: QueryMetrics[];
    recentAlerts: PerformanceAlert[];
    averageExecutionTime: number;
    totalQueries: number;
    errorRate: number;
  } {
    const recentMetrics = this.getRecentMetrics(60 * 60 * 1000); // Last hour
    const slowQueries = recentMetrics.filter(m => m.executionTime > this.slowQueryThreshold);
    const recentAlerts = this.alerts.filter(a => 
      a.timestamp >= new Date(Date.now() - 60 * 60 * 1000)
    );
    
    const averageExecutionTime = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.executionTime, 0) / recentMetrics.length
      : 0;

    const errorCount = recentMetrics.filter(m => m.error).length;
    const errorRate = recentMetrics.length > 0 ? errorCount / recentMetrics.length : 0;

    return {
      slowQueries,
      recentAlerts,
      averageExecutionTime,
      totalQueries: recentMetrics.length,
      errorRate
    };
  }

  /**
   * Clear metrics and alerts
   */
  clearHistory(): void {
    this.metrics = [];
    this.alerts = [];
  }

  /**
   * Get current alerts
   */
  getCurrentAlerts(): PerformanceAlert[] {
    return [...this.alerts];
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
}

// Export singleton instance
export const dbPerformanceMonitor = new DatabasePerformanceMonitor();
export default dbPerformanceMonitor;