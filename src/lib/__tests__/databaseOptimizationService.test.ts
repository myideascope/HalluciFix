/**
 * Tests for DatabaseOptimizationService
 * Covers optimization metrics, recommendations, and performance monitoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { databaseOptimizationService } from '../databaseOptimizationService';

// Mock dependencies
vi.mock('../optimizedAnalysisService', () => ({
  optimizedAnalysisService: {
    getPerformanceMetrics: vi.fn(() => ({
      averageExecutionTime: 250,
      slowQueries: [{ query: 'SELECT * FROM large_table', time: 1500 }],
      totalQueries: 100,
      queryFrequency: {
        'getUserAnalytics': 25,
        'getAnalysisResults': 30,
        'searchAnalysisResults': 15
      }
    })),
    batchCreateAnalysisResults: vi.fn(),
    clearPerformanceMetrics: vi.fn()
  }
}));

vi.mock('../cacheService', () => ({
  cachedQueryService: {
    getCacheStats: vi.fn(() => ({
      hitRate: 0.85,
      totalEntries: 150,
      totalSize: 2048000
    })),
    getUserAnalytics: vi.fn(),
    getAnalysisResults: vi.fn(),
    searchAnalysisResults: vi.fn(),
    invalidateAnalysisCache: vi.fn(),
    invalidateUserCache: vi.fn(),
    warmUpCriticalCaches: vi.fn(),
    clearAllCaches: vi.fn()
  }),
  cacheService: {
    invalidateByTags: vi.fn(),
    clear: vi.fn()
  }
}));

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        error: null
      })
    })),
    rpc: vi.fn()
  }
}));

describe('DatabaseOptimizationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getOptimizationMetrics', () => {
    it('should return comprehensive optimization metrics', async () => {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.rpc)
        .mockResolvedValueOnce({ data: { totalQueries: 500 } })
        .mockResolvedValueOnce({ data: null });

      const metrics = await databaseOptimizationService.getOptimizationMetrics();

      expect(metrics).toEqual({
        queryPerformance: {
          averageExecutionTime: 250,
          slowQueries: 1,
          totalQueries: 100,
          queryFrequency: {
            'getUserAnalytics': 25,
            'getAnalysisResults': 30,
            'searchAnalysisResults': 15
          }
        },
        cachePerformance: {
          hitRate: 0.85,
          totalEntries: 150,
          totalSize: 2048000
        },
        databaseHealth: {
          connectionStatus: true,
          indexUsage: 0.95,
          queryThroughput: 500
        }
      });
    });

    it('should handle database connection errors', async () => {
      const { supabase } = await import('../supabase');
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          error: { message: 'Connection failed' }
        })
      };
      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const metrics = await databaseOptimizationService.getOptimizationMetrics();

      expect(metrics.databaseHealth.connectionStatus).toBe(false);
      expect(metrics.databaseHealth.indexUsage).toBe(0);
      expect(metrics.databaseHealth.queryThroughput).toBe(0);
    });

    it('should handle missing performance stats gracefully', async () => {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.rpc).mockRejectedValue(new Error('Function not found'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const metrics = await databaseOptimizationService.getOptimizationMetrics();

      expect(consoleSpy).toHaveBeenCalledWith('Could not fetch database performance stats:', expect.any(Error));
      expect(metrics.databaseHealth.queryThroughput).toBe(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('getOptimizationRecommendations', () => {
    it('should generate performance recommendations for slow queries', async () => {
      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getPerformanceMetrics).mockReturnValue({
        averageExecutionTime: 600, // High execution time
        slowQueries: Array(8).fill({ query: 'slow query', time: 1000 }), // 8 slow queries
        totalQueries: 100,
        queryFrequency: {}
      });

      const recommendations = await databaseOptimizationService.getOptimizationRecommendations();

      expect(recommendations.performance).toContain('Average query execution time is high. Consider optimizing slow queries.');
      expect(recommendations.performance).toContain('8 slow queries detected. Review and optimize these queries.');
    });

    it('should generate caching recommendations for low hit rate', async () => {
      const { cachedQueryService } = await import('../cacheService');
      vi.mocked(cachedQueryService.getCacheStats).mockReturnValue({
        hitRate: 0.6, // Low hit rate
        totalEntries: 5, // Low utilization
        totalSize: 1024
      });

      const recommendations = await databaseOptimizationService.getOptimizationRecommendations();

      expect(recommendations.caching).toContain('Cache hit rate is below 80%. Consider increasing cache TTL or warming up critical caches.');
      expect(recommendations.caching).toContain('Cache utilization is low. Consider caching more frequently accessed queries.');
    });

    it('should generate database health recommendations', async () => {
      const { supabase } = await import('../supabase');
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          error: { message: 'Connection failed' }
        })
      };
      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const recommendations = await databaseOptimizationService.getOptimizationRecommendations();

      expect(recommendations.performance).toContain('Database connection issues detected. Check database connectivity.');
    });

    it('should generate query-specific recommendations', async () => {
      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getPerformanceMetrics).mockReturnValue({
        averageExecutionTime: 200,
        slowQueries: [],
        totalQueries: 100,
        queryFrequency: {
          'getAnalysisResults': 50,
          'getUserAnalytics': 30,
          'searchAnalysisResults': 20
        }
      });

      const recommendations = await databaseOptimizationService.getOptimizationRecommendations();

      expect(recommendations.queries).toContain('Most frequent queries: getAnalysisResults, getUserAnalytics, searchAnalysisResults, . Ensure these are optimized.');
    });
  });

  describe('optimized query methods', () => {
    it('should call getUserAnalyticsOptimized with caching', async () => {
      const { cachedQueryService } = await import('../cacheService');
      const mockResult = { totalAnalyses: 100, averageAccuracy: 85 };
      vi.mocked(cachedQueryService.getUserAnalytics).mockResolvedValue(mockResult);

      const userId = 'user-123';
      const timeRange = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };

      const result = await databaseOptimizationService.getUserAnalyticsOptimized(userId, timeRange, true);

      expect(cachedQueryService.getUserAnalytics).toHaveBeenCalledWith(userId, timeRange, { forceRefresh: true });
      expect(result).toEqual(mockResult);
    });

    it('should call getAnalysisResultsOptimized with pagination', async () => {
      const { cachedQueryService } = await import('../cacheService');
      const mockResult = { data: [], hasMore: false, nextCursor: undefined };
      vi.mocked(cachedQueryService.getAnalysisResults).mockResolvedValue(mockResult);

      const userId = 'user-123';
      const options = { limit: 20, cursor: 'cursor-123', riskLevel: 'high' };

      const result = await databaseOptimizationService.getAnalysisResultsOptimized(userId, options);

      expect(cachedQueryService.getAnalysisResults).toHaveBeenCalledWith(userId, options, { forceRefresh: false });
      expect(result).toEqual(mockResult);
    });

    it('should call searchAnalysisResultsOptimized with search query', async () => {
      const { cachedQueryService } = await import('../cacheService');
      const mockResult = { data: [], hasMore: false, nextCursor: undefined };
      vi.mocked(cachedQueryService.searchAnalysisResults).mockResolvedValue(mockResult);

      const searchQuery = 'test query';
      const userId = 'user-123';
      const options = { limit: 10 };

      const result = await databaseOptimizationService.searchAnalysisResultsOptimized(searchQuery, userId, options);

      expect(cachedQueryService.searchAnalysisResults).toHaveBeenCalledWith(searchQuery, userId, options, { forceRefresh: false });
      expect(result).toEqual(mockResult);
    });
  });

  describe('batch operations', () => {
    it('should perform batch create with cache invalidation', async () => {
      const { optimizedAnalysisService, cachedQueryService } = await import('../optimizedAnalysisService');
      const mockResults = [{ id: '1', content: 'test' }, { id: '2', content: 'test2' }];
      vi.mocked(optimizedAnalysisService.batchCreateAnalysisResults).mockResolvedValue(mockResults);

      const userId = 'user-123';
      const results = [{ content: 'test' }, { content: 'test2' }];

      const createdResults = await databaseOptimizationService.batchCreateAnalysisResults(results, userId);

      expect(optimizedAnalysisService.batchCreateAnalysisResults).toHaveBeenCalledWith(
        results,
        { userId, endpoint: 'batchCreate' }
      );
      expect(cachedQueryService.invalidateAnalysisCache).toHaveBeenCalledWith(userId);
      expect(cachedQueryService.invalidateUserCache).toHaveBeenCalledWith(userId);
      expect(createdResults).toEqual(mockResults);
    });

    it('should warm up user caches', async () => {
      const { cachedQueryService } = await import('../cacheService');
      const userId = 'user-123';

      await databaseOptimizationService.warmUpUserCaches(userId);

      expect(cachedQueryService.warmUpCriticalCaches).toHaveBeenCalledWith(userId);
    });
  });

  describe('materialized views management', () => {
    it('should refresh specific materialized view', async () => {
      const { supabase, cacheService } = await import('../supabase');
      vi.mocked(supabase.rpc).mockResolvedValue({ error: null });

      const result = await databaseOptimizationService.refreshMaterializedViews('user_analytics_view');

      expect(supabase.rpc).toHaveBeenCalledWith('refresh_materialized_view', { view_name: 'user_analytics_view' });
      expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['analytics', 'dashboard']);
      expect(result).toEqual({ success: true });
    });

    it('should refresh all materialized views', async () => {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.rpc).mockResolvedValue({ error: null });

      const result = await databaseOptimizationService.refreshMaterializedViews();

      expect(supabase.rpc).toHaveBeenCalledWith('refresh_all_materialized_views');
      expect(result).toEqual({ success: true });
    });

    it('should handle materialized view refresh errors', async () => {
      const { supabase } = await import('../supabase');
      const error = new Error('Refresh failed');
      vi.mocked(supabase.rpc).mockRejectedValue(error);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await databaseOptimizationService.refreshMaterializedViews('test_view');

      expect(consoleSpy).toHaveBeenCalledWith('Error refreshing materialized views:', error);
      expect(result).toEqual({ success: false, error: 'Refresh failed' });
      
      consoleSpy.mockRestore();
    });

    it('should get materialized view statistics', async () => {
      const { supabase } = await import('../supabase');
      const mockStats = { view_count: 5, last_refresh: '2024-01-01T00:00:00Z' };
      vi.mocked(supabase.rpc).mockResolvedValue({ data: mockStats, error: null });

      const stats = await databaseOptimizationService.getMaterializedViewStats();

      expect(supabase.rpc).toHaveBeenCalledWith('get_materialized_view_stats');
      expect(stats).toEqual(mockStats);
    });

    it('should handle materialized view stats errors', async () => {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Stats error' } });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const stats = await databaseOptimizationService.getMaterializedViewStats();

      expect(consoleSpy).toHaveBeenCalledWith('Error getting materialized view stats:', expect.any(Error));
      expect(stats).toBeNull();
      
      consoleSpy.mockRestore();
    });
  });

  describe('performance monitoring', () => {
    it('should check performance thresholds and return healthy status', async () => {
      const { optimizedAnalysisService, cachedQueryService } = await import('../optimizedAnalysisService');
      
      // Mock good performance metrics
      vi.mocked(optimizedAnalysisService.getPerformanceMetrics).mockReturnValue({
        averageExecutionTime: 300, // Below critical threshold
        slowQueries: [{ query: 'test', time: 800 }], // 1 slow query
        totalQueries: 100,
        queryFrequency: {}
      });

      vi.mocked(cachedQueryService.getCacheStats).mockReturnValue({
        hitRate: 0.9, // Good hit rate
        totalEntries: 100,
        totalSize: 1024000
      });

      const result = await databaseOptimizationService.checkPerformanceThresholds();

      expect(result.status).toBe('healthy');
      expect(result.alerts).toHaveLength(0);
    });

    it('should detect critical performance issues', async () => {
      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      
      // Mock poor performance metrics
      vi.mocked(optimizedAnalysisService.getPerformanceMetrics).mockReturnValue({
        averageExecutionTime: 1200, // Above critical threshold
        slowQueries: Array(15).fill({ query: 'slow', time: 2000 }), // Many slow queries
        totalQueries: 100,
        queryFrequency: {}
      });

      const result = await databaseOptimizationService.checkPerformanceThresholds();

      expect(result.status).toBe('critical');
      expect(result.alerts).toContain('Critical: Average query execution time exceeds 1 second');
      expect(result.alerts).toContain('Critical: 15 slow queries detected');
    });

    it('should detect warning level issues', async () => {
      const { optimizedAnalysisService, cachedQueryService } = await import('../optimizedAnalysisService');
      
      vi.mocked(optimizedAnalysisService.getPerformanceMetrics).mockReturnValue({
        averageExecutionTime: 600, // Warning level
        slowQueries: Array(7).fill({ query: 'slow', time: 1000 }), // Warning level
        totalQueries: 100,
        queryFrequency: {}
      });

      vi.mocked(cachedQueryService.getCacheStats).mockReturnValue({
        hitRate: 0.4, // Low hit rate
        totalEntries: 50,
        totalSize: 512000
      });

      const result = await databaseOptimizationService.checkPerformanceThresholds();

      expect(result.status).toBe('warning');
      expect(result.alerts).toContain('Warning: Average query execution time exceeds 500ms');
      expect(result.alerts).toContain('Warning: 7 slow queries detected');
      expect(result.alerts).toContain('Warning: Cache hit rate is below 50%');
    });

    it('should detect database connection issues', async () => {
      const { supabase } = await import('../supabase');
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          error: { message: 'Connection failed' }
        })
      };
      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const result = await databaseOptimizationService.checkPerformanceThresholds();

      expect(result.status).toBe('critical');
      expect(result.alerts).toContain('Critical: Database connection failure');
    });
  });

  describe('performance reporting', () => {
    it('should generate comprehensive performance report', async () => {
      const report = await databaseOptimizationService.getPerformanceReport();

      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('alerts');
      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('timestamp');
      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('maintenance operations', () => {
    it('should perform comprehensive maintenance', async () => {
      const { supabase, cacheService } = await import('../supabase');
      vi.mocked(supabase.rpc)
        .mockResolvedValueOnce({ error: null }) // refresh materialized views
        .mockResolvedValueOnce({ error: null }); // cleanup performance logs

      const results = await databaseOptimizationService.performMaintenance();

      expect(results.materializedViewsRefreshed).toBe(true);
      expect(results.cacheCleared).toBe(true);
      expect(results.performanceLogsCleanup).toBe(true);
      expect(results.errors).toHaveLength(0);

      expect(supabase.rpc).toHaveBeenCalledWith('refresh_all_materialized_views');
      expect(supabase.rpc).toHaveBeenCalledWith('cleanup_performance_logs', { retention_days: 30 });
      expect(cacheService.clear).toHaveBeenCalled();
    });

    it('should handle maintenance errors gracefully', async () => {
      const { supabase } = await import('../supabase');
      vi.mocked(supabase.rpc)
        .mockRejectedValueOnce(new Error('Materialized view refresh failed'))
        .mockRejectedValueOnce(new Error('Cleanup failed'));

      const results = await databaseOptimizationService.performMaintenance();

      expect(results.materializedViewsRefreshed).toBe(false);
      expect(results.performanceLogsCleanup).toBe(false);
      expect(results.errors).toContain('Materialized views refresh failed: Materialized view refresh failed');
      expect(results.errors).toContain('Performance logs cleanup failed: Cleanup failed');
    });
  });

  describe('metrics management', () => {
    it('should clear all metrics', () => {
      const { optimizedAnalysisService, cachedQueryService } = require('../optimizedAnalysisService');

      databaseOptimizationService.clearAllMetrics();

      expect(optimizedAnalysisService.clearPerformanceMetrics).toHaveBeenCalled();
      expect(cachedQueryService.clearAllCaches).toHaveBeenCalled();
    });
  });
});