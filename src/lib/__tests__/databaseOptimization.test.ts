import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Supabase client before importing modules
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: '1', name: 'test' }, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockResolvedValue({ error: null })
    })),
    rpc: vi.fn().mockResolvedValue({ data: { count: 100, avg_accuracy: 85.5 }, error: null })
  }
}));

import { OptimizedQueryBuilder, dbMonitor } from '../queryOptimizer';
import { cachedQueryService, cacheService } from '../cacheService';
import { databaseOptimizationService } from '../databaseOptimizationService';
import { supabase } from '../supabase';

describe('Database Optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMonitor.clearMetrics();
    cacheService.clear();
  });

  describe('OptimizedQueryBuilder', () => {
    it('should track query performance', async () => {
      const queryBuilder = new OptimizedQueryBuilder('test_table', supabase as any);
      
      // Mock query that returns data
      vi.mocked(supabase.from().single).mockResolvedValueOnce({
        data: { id: '1', name: 'test' },
        error: null
      });

      const result = await queryBuilder.findById('1');
      
      expect(result).toEqual({ id: '1', name: 'test' });
      
      const metrics = dbMonitor.getPerformanceReport();
      expect(metrics.totalQueries).toBe(1);
      expect(metrics.queryFrequency['test_table.findById']).toBe(1);
    });

    it('should handle cursor-based pagination', async () => {
      const queryBuilder = new OptimizedQueryBuilder('analysis_results', supabase as any);
      
      // Mock paginated data
      const mockData = [
        { id: '1', created_at: '2024-01-01T00:00:00Z' },
        { id: '2', created_at: '2024-01-02T00:00:00Z' },
        { id: '3', created_at: '2024-01-03T00:00:00Z' }
      ];
      
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockData, error: null })
      } as any);

      const result = await queryBuilder.findWithCursor({
        where: { user_id: 'user1' },
        limit: 2
      });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('2024-01-02T00:00:00Z');
    });

    it('should perform batch operations efficiently', async () => {
      const queryBuilder = new OptimizedQueryBuilder('analysis_results', supabase as any);
      
      const records = [
        { content: 'test1', user_id: 'user1' },
        { content: 'test2', user_id: 'user1' }
      ];

      await queryBuilder.batchInsert(records);

      expect(supabase.from().insert).toHaveBeenCalledWith(records);
    });
  });

  describe('Cache Service', () => {
    it('should cache query results', async () => {
      let callCount = 0;
      const mockQueryFn = vi.fn(async () => {
        callCount++;
        return { data: 'test', count: callCount };
      });

      // First call should execute query
      const result1 = await cacheService.get('test-key', mockQueryFn);
      expect(result1.count).toBe(1);
      expect(mockQueryFn).toHaveBeenCalledTimes(1);

      // Second call should return cached result
      const result2 = await cacheService.get('test-key', mockQueryFn);
      expect(result2.count).toBe(1); // Same as first call
      expect(mockQueryFn).toHaveBeenCalledTimes(1); // Not called again

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should invalidate cache by tags', async () => {
      const mockQueryFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheService.get('user-data', mockQueryFn, { tags: ['user:123'] });
      await cacheService.get('user-analytics', mockQueryFn, { tags: ['user:123', 'analytics'] });

      // Invalidate by user tag
      const invalidated = cacheService.invalidateByTags(['user:123']);
      expect(invalidated).toBe(2);

      // Next calls should miss cache
      await cacheService.get('user-data', mockQueryFn);
      const stats = cacheService.getStats();
      expect(stats.misses).toBe(3); // 2 initial + 1 after invalidation
    });

    it('should handle cache expiration', async () => {
      const mockQueryFn = vi.fn().mockResolvedValue({ data: 'test' });

      // Set very short TTL
      await cacheService.get('short-lived', mockQueryFn, { ttl: 1 });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should miss cache due to expiration
      await cacheService.get('short-lived', mockQueryFn);
      expect(mockQueryFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cached Query Service', () => {
    it('should cache user analytics', async () => {
      const userId = 'user123';
      const mockAnalytics = {
        totalAnalyses: 10,
        averageAccuracy: 85.5,
        riskDistribution: { low: 8, medium: 2 }
      };

      // Mock the optimized analysis service
      vi.doMock('../optimizedAnalysisService', () => ({
        optimizedAnalysisService: {
          getUserAnalytics: vi.fn().mockResolvedValue(mockAnalytics)
        }
      }));

      const result1 = await cachedQueryService.getUserAnalytics(userId);
      const result2 = await cachedQueryService.getUserAnalytics(userId);

      expect(result1).toEqual(mockAnalytics);
      expect(result2).toEqual(mockAnalytics);

      const stats = cachedQueryService.getCacheStats();
      expect(stats.hits).toBeGreaterThan(0);
    });

    it('should invalidate user cache when data changes', async () => {
      const userId = 'user123';
      
      // Cache some user data
      await cachedQueryService.getUserAnalytics(userId);
      
      // Invalidate user cache
      cachedQueryService.invalidateUserCache(userId);
      
      // Next call should miss cache
      await cachedQueryService.getUserAnalytics(userId);
      
      const stats = cachedQueryService.getCacheStats();
      expect(stats.misses).toBeGreaterThan(0);
    });
  });

  describe('Database Optimization Service', () => {
    it('should get optimization metrics', async () => {
      const metrics = await databaseOptimizationService.getOptimizationMetrics();

      expect(metrics).toHaveProperty('queryPerformance');
      expect(metrics).toHaveProperty('cachePerformance');
      expect(metrics).toHaveProperty('databaseHealth');
      
      expect(metrics.queryPerformance).toHaveProperty('averageExecutionTime');
      expect(metrics.queryPerformance).toHaveProperty('totalQueries');
      expect(metrics.cachePerformance).toHaveProperty('hitRate');
      expect(metrics.databaseHealth).toHaveProperty('connectionStatus');
    });

    it('should generate optimization recommendations', async () => {
      // Simulate poor performance metrics
      dbMonitor.trackQuery('slow-query', async () => {
        await new Promise(resolve => setTimeout(resolve, 1100)); // Slow query
        return { data: 'test' };
      });

      const recommendations = await databaseOptimizationService.getOptimizationRecommendations();

      expect(recommendations).toHaveProperty('performance');
      expect(recommendations).toHaveProperty('caching');
      expect(recommendations).toHaveProperty('indexing');
      expect(recommendations).toHaveProperty('queries');
      
      expect(recommendations.performance.length).toBeGreaterThan(0);
    });

    it('should check performance thresholds', async () => {
      const alerts = await databaseOptimizationService.checkPerformanceThresholds();

      expect(alerts).toHaveProperty('alerts');
      expect(alerts).toHaveProperty('status');
      expect(['healthy', 'warning', 'critical']).toContain(alerts.status);
    });

    it('should warm up user caches', async () => {
      const userId = 'user123';
      
      // Mock the cache warming
      const warmUpSpy = vi.spyOn(cachedQueryService, 'warmUpCriticalCaches')
        .mockResolvedValue(undefined);

      await databaseOptimizationService.warmUpUserCaches(userId);

      expect(warmUpSpy).toHaveBeenCalledWith(userId);
    });
  });

  describe('Performance Monitoring', () => {
    it('should detect slow queries', async () => {
      // Simulate a slow query
      await dbMonitor.trackQuery('slow-test-query', async () => {
        await new Promise(resolve => setTimeout(resolve, 1100));
        return { data: 'test' };
      });

      const report = dbMonitor.getPerformanceReport();
      expect(report.slowQueries.length).toBe(1);
      expect(report.slowQueries[0].queryName).toBe('slow-test-query');
      expect(report.slowQueries[0].executionTime).toBeGreaterThan(1000);
    });

    it('should track query frequency', async () => {
      // Execute the same query multiple times
      for (let i = 0; i < 3; i++) {
        await dbMonitor.trackQuery('frequent-query', async () => ({ data: 'test' }));
      }

      const report = dbMonitor.getPerformanceReport();
      expect(report.queryFrequency['frequent-query']).toBe(3);
    });

    it('should calculate average execution time', async () => {
      // Execute queries with known execution times
      await dbMonitor.trackQuery('fast-query', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: 'test' };
      });
      
      await dbMonitor.trackQuery('medium-query', async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
        return { data: 'test' };
      });

      const report = dbMonitor.getPerformanceReport();
      expect(report.averageExecutionTime).toBeGreaterThan(100);
      expect(report.averageExecutionTime).toBeLessThan(400);
    });
  });
});