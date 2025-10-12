// Database Optimization Service - Integration layer for all optimization components
import { optimizedAnalysisService } from './optimizedAnalysisService';
import { cachedQueryService, cacheService } from './cacheService';
import { dbMonitor } from './queryOptimizer';
import { supabase } from './supabase';

export interface OptimizationMetrics {
  queryPerformance: {
    averageExecutionTime: number;
    slowQueries: number;
    totalQueries: number;
    queryFrequency: Record<string, number>;
  };
  cachePerformance: {
    hitRate: number;
    totalEntries: number;
    totalSize: number;
  };
  databaseHealth: {
    connectionStatus: boolean;
    indexUsage: number;
    queryThroughput: number;
  };
}

export interface OptimizationRecommendations {
  performance: string[];
  caching: string[];
  indexing: string[];
  queries: string[];
}

class DatabaseOptimizationService {
  // Get comprehensive optimization metrics
  async getOptimizationMetrics(): Promise<OptimizationMetrics> {
    const [queryPerformance, cacheStats, dbStats] = await Promise.all([
      this.getQueryPerformanceMetrics(),
      this.getCachePerformanceMetrics(),
      this.getDatabaseHealthMetrics()
    ]);

    return {
      queryPerformance,
      cachePerformance: cacheStats,
      databaseHealth: dbStats
    };
  }

  // Get query performance metrics
  private async getQueryPerformanceMetrics() {
    const report = optimizedAnalysisService.getPerformanceMetrics();
    
    return {
      averageExecutionTime: report.averageExecutionTime,
      slowQueries: report.slowQueries.length,
      totalQueries: report.totalQueries,
      queryFrequency: report.queryFrequency
    };
  }

  // Get cache performance metrics
  private getCachePerformanceMetrics() {
    return cachedQueryService.getCacheStats();
  }

  // Get database health metrics
  private async getDatabaseHealthMetrics() {
    try {
      // Test database connection
      const { error: connectionError } = await supabase
        .from('users')
        .select('count')
        .limit(1);

      const connectionStatus = !connectionError;

      // Get database performance stats if available
      let indexUsage = 0;
      let queryThroughput = 0;

      try {
        const { data: perfData } = await supabase.rpc('get_database_performance_stats');
        if (perfData) {
          queryThroughput = perfData.totalQueries || 0;
          // Index usage would be calculated from database statistics
          indexUsage = 0.95; // Placeholder - would come from actual DB stats
        }
      } catch (error) {
        console.warn('Could not fetch database performance stats:', error);
      }

      return {
        connectionStatus,
        indexUsage,
        queryThroughput
      };
    } catch (error) {
      console.error('Error getting database health metrics:', error);
      return {
        connectionStatus: false,
        indexUsage: 0,
        queryThroughput: 0
      };
    }
  }

  // Generate optimization recommendations based on metrics
  async getOptimizationRecommendations(): Promise<OptimizationRecommendations> {
    const metrics = await this.getOptimizationMetrics();
    const recommendations: OptimizationRecommendations = {
      performance: [],
      caching: [],
      indexing: [],
      queries: []
    };

    // Performance recommendations
    if (metrics.queryPerformance.averageExecutionTime > 500) {
      recommendations.performance.push('Average query execution time is high. Consider optimizing slow queries.');
    }

    if (metrics.queryPerformance.slowQueries > 5) {
      recommendations.performance.push(`${metrics.queryPerformance.slowQueries} slow queries detected. Review and optimize these queries.`);
    }

    // Caching recommendations
    if (metrics.cachePerformance.hitRate < 0.8) {
      recommendations.caching.push('Cache hit rate is below 80%. Consider increasing cache TTL or warming up critical caches.');
    }

    if (metrics.cachePerformance.totalEntries < 10) {
      recommendations.caching.push('Cache utilization is low. Consider caching more frequently accessed queries.');
    }

    // Database health recommendations
    if (!metrics.databaseHealth.connectionStatus) {
      recommendations.performance.push('Database connection issues detected. Check database connectivity.');
    }

    if (metrics.databaseHealth.indexUsage < 0.9) {
      recommendations.indexing.push('Index usage is below 90%. Review and optimize database indexes.');
    }

    // Query-specific recommendations
    const topQueries = Object.entries(metrics.queryPerformance.queryFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    if (topQueries.length > 0) {
      recommendations.queries.push(`Most frequent queries: ${topQueries.map(([query]) => query).join(', ')}. Ensure these are optimized.`);
    }

    return recommendations;
  }

  // Optimize user analytics queries with caching
  async getUserAnalyticsOptimized(
    userId: string,
    timeRange?: { start: Date; end: Date },
    forceRefresh: boolean = false
  ) {
    return cachedQueryService.getUserAnalytics(userId, timeRange, { forceRefresh });
  }

  // Optimize analysis results queries with caching and pagination
  async getAnalysisResultsOptimized(
    userId?: string,
    options?: {
      limit?: number;
      cursor?: string;
      riskLevel?: string;
    },
    forceRefresh: boolean = false
  ) {
    return cachedQueryService.getAnalysisResults(userId, options, { forceRefresh });
  }

  // Optimize search with caching
  async searchAnalysisResultsOptimized(
    searchQuery: string,
    userId?: string,
    options?: {
      limit?: number;
      cursor?: string;
    },
    forceRefresh: boolean = false
  ) {
    return cachedQueryService.searchAnalysisResults(searchQuery, userId, options, { forceRefresh });
  }

  // Batch operations with optimization
  async batchCreateAnalysisResults(
    results: any[],
    userId: string
  ) {
    // Use optimized batch insert
    const createdResults = await optimizedAnalysisService.batchCreateAnalysisResults(
      results,
      { userId, endpoint: 'batchCreate' }
    );

    // Invalidate relevant caches
    cachedQueryService.invalidateAnalysisCache(userId);
    cachedQueryService.invalidateUserCache(userId);

    return createdResults;
  }

  // Warm up critical caches for a user
  async warmUpUserCaches(userId: string) {
    await cachedQueryService.warmUpCriticalCaches(userId);
  }

  // Refresh materialized views
  async refreshMaterializedViews(viewName?: string) {
    try {
      if (viewName) {
        await supabase.rpc('refresh_materialized_view', { view_name: viewName });
      } else {
        await supabase.rpc('refresh_all_materialized_views');
      }
      
      // Clear related caches after refresh
      cacheService.invalidateByTags(['analytics', 'dashboard']);
      
      return { success: true };
    } catch (error) {
      console.error('Error refreshing materialized views:', error);
      return { success: false, error: error.message };
    }
  }

  // Get materialized view statistics
  async getMaterializedViewStats() {
    try {
      const { data, error } = await supabase.rpc('get_materialized_view_stats');
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting materialized view stats:', error);
      return null;
    }
  }

  // Performance monitoring and alerting
  async checkPerformanceThresholds(): Promise<{
    alerts: string[];
    status: 'healthy' | 'warning' | 'critical';
  }> {
    const metrics = await this.getOptimizationMetrics();
    const alerts: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check query performance thresholds
    if (metrics.queryPerformance.averageExecutionTime > 1000) {
      alerts.push('Critical: Average query execution time exceeds 1 second');
      status = 'critical';
    } else if (metrics.queryPerformance.averageExecutionTime > 500) {
      alerts.push('Warning: Average query execution time exceeds 500ms');
      if (status !== 'critical') status = 'warning';
    }

    // Check slow query count
    if (metrics.queryPerformance.slowQueries > 10) {
      alerts.push(`Critical: ${metrics.queryPerformance.slowQueries} slow queries detected`);
      status = 'critical';
    } else if (metrics.queryPerformance.slowQueries > 5) {
      alerts.push(`Warning: ${metrics.queryPerformance.slowQueries} slow queries detected`);
      if (status !== 'critical') status = 'warning';
    }

    // Check cache performance
    if (metrics.cachePerformance.hitRate < 0.5) {
      alerts.push('Warning: Cache hit rate is below 50%');
      if (status !== 'critical') status = 'warning';
    }

    // Check database health
    if (!metrics.databaseHealth.connectionStatus) {
      alerts.push('Critical: Database connection failure');
      status = 'critical';
    }

    return { alerts, status };
  }

  // Clear all performance metrics and caches (useful for testing)
  clearAllMetrics() {
    optimizedAnalysisService.clearPerformanceMetrics();
    cachedQueryService.clearAllCaches();
  }

  // Get comprehensive performance report
  async getPerformanceReport() {
    const [metrics, recommendations, alerts] = await Promise.all([
      this.getOptimizationMetrics(),
      this.getOptimizationRecommendations(),
      this.checkPerformanceThresholds()
    ]);

    return {
      metrics,
      recommendations,
      alerts: alerts.alerts,
      status: alerts.status,
      timestamp: new Date().toISOString()
    };
  }

  // Execute database maintenance tasks
  async performMaintenance() {
    const results = {
      materializedViewsRefreshed: false,
      cacheCleared: false,
      performanceLogsCleanup: false,
      errors: [] as string[]
    };

    try {
      // Refresh materialized views
      await this.refreshMaterializedViews();
      results.materializedViewsRefreshed = true;
    } catch (error) {
      results.errors.push(`Materialized views refresh failed: ${error.message}`);
    }

    try {
      // Clear old cache entries
      cacheService.clear();
      results.cacheCleared = true;
    } catch (error) {
      results.errors.push(`Cache clear failed: ${error.message}`);
    }

    try {
      // Clean up old performance logs
      await supabase.rpc('cleanup_performance_logs', { retention_days: 30 });
      results.performanceLogsCleanup = true;
    } catch (error) {
      results.errors.push(`Performance logs cleanup failed: ${error.message}`);
    }

    return results;
  }
}

// Export singleton instance
export const databaseOptimizationService = new DatabaseOptimizationService();