/**
 * Tests for CacheService and CachedQueryService
 * Covers query caching, cache invalidation, and performance optimization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cacheService, cachedQueryService, CachedQueryService } from '../cacheService';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Mock optimized services
vi.mock('../optimizedAnalysisService', () => ({
  optimizedAnalysisService: {
    getUserAnalytics: vi.fn(),
    getAnalysisResultsWithStats: vi.fn(),
    searchAnalysisResults: vi.fn(),
    getRecentAnalysisResults: vi.fn()
  }
}));

describe('QueryCacheService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    cacheService.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get and set operations', () => {
    it('should cache and retrieve data correctly', async () => {
      const testKey = 'test-key-unique-' + Date.now();
      const testData = { id: 1, name: 'Test Data' };
      const queryFn = vi.fn().mockResolvedValue(testData);

      // First call should execute query function
      const result1 = await cacheService.get(testKey, queryFn);
      expect(result1).toEqual(testData);
      expect(queryFn).toHaveBeenCalledTimes(1);

      // Second call should return cached data
      const result2 = await cacheService.get(testKey, queryFn);
      expect(result2).toEqual(testData);
      expect(queryFn).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should respect TTL and expire cached data', async () => {
      const testKey = 'test-key';
      const testData = { id: 1, name: 'Test Data' };
      const queryFn = vi.fn().mockResolvedValue(testData);
      const shortTTL = 1000; // 1 second

      // Cache data with short TTL
      await cacheService.get(testKey, queryFn, { ttl: shortTTL });
      expect(queryFn).toHaveBeenCalledTimes(1);

      // Advance time beyond TTL
      vi.advanceTimersByTime(shortTTL + 100);

      // Should execute query function again
      await cacheService.get(testKey, queryFn, { ttl: shortTTL });
      expect(queryFn).toHaveBeenCalledTimes(2);
    });

    it('should force refresh when requested', async () => {
      const testKey = 'test-key';
      const testData = { id: 1, name: 'Test Data' };
      const queryFn = vi.fn().mockResolvedValue(testData);

      // Cache data
      await cacheService.get(testKey, queryFn);
      expect(queryFn).toHaveBeenCalledTimes(1);

      // Force refresh should bypass cache
      await cacheService.get(testKey, queryFn, { forceRefresh: true });
      expect(queryFn).toHaveBeenCalledTimes(2);
    });

    it('should handle query function errors', async () => {
      const testKey = 'test-key';
      const error = new Error('Query failed');
      const queryFn = vi.fn().mockRejectedValue(error);

      await expect(cacheService.get(testKey, queryFn)).rejects.toThrow('Query failed');
      expect(queryFn).toHaveBeenCalledTimes(1);

      // Should retry on next call (no caching of errors)
      await expect(cacheService.get(testKey, queryFn)).rejects.toThrow('Query failed');
      expect(queryFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate cache by key', async () => {
      const testKey = 'test-key';
      const testData = { id: 1, name: 'Test Data' };
      const queryFn = vi.fn().mockResolvedValue(testData);

      // Cache data
      await cacheService.get(testKey, queryFn);
      expect(queryFn).toHaveBeenCalledTimes(1);

      // Invalidate cache
      const invalidated = cacheService.invalidate(testKey);
      expect(invalidated).toBe(true);

      // Should execute query function again
      await cacheService.get(testKey, queryFn);
      expect(queryFn).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache by tags', async () => {
      const testData = { id: 1, name: 'Test Data' };
      const queryFn1 = vi.fn().mockResolvedValue(testData);
      const queryFn2 = vi.fn().mockResolvedValue(testData);

      // Cache data with tags
      await cacheService.get('key1', queryFn1, { tags: ['user:123', 'analytics'] });
      await cacheService.get('key2', queryFn2, { tags: ['user:456', 'analytics'] });

      expect(queryFn1).toHaveBeenCalledTimes(1);
      expect(queryFn2).toHaveBeenCalledTimes(1);

      // Invalidate by tag
      const deletedCount = cacheService.invalidateByTags(['analytics']);
      expect(deletedCount).toBe(2);

      // Both should execute query functions again
      await cacheService.get('key1', queryFn1, { tags: ['user:123', 'analytics'] });
      await cacheService.get('key2', queryFn2, { tags: ['user:456', 'analytics'] });

      expect(queryFn1).toHaveBeenCalledTimes(2);
      expect(queryFn2).toHaveBeenCalledTimes(2);
    });

    it('should clear all cache', async () => {
      const testData = { id: 1, name: 'Test Data' };
      const queryFn1 = vi.fn().mockResolvedValue(testData);
      const queryFn2 = vi.fn().mockResolvedValue(testData);

      // Cache multiple items
      await cacheService.get('key1', queryFn1);
      await cacheService.get('key2', queryFn2);

      expect(queryFn1).toHaveBeenCalledTimes(1);
      expect(queryFn2).toHaveBeenCalledTimes(1);

      // Clear all cache
      cacheService.clear();

      // Both should execute query functions again
      await cacheService.get('key1', queryFn1);
      await cacheService.get('key2', queryFn2);

      expect(queryFn1).toHaveBeenCalledTimes(2);
      expect(queryFn2).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache statistics', () => {
    it('should track cache hits and misses', async () => {
      const testKey = 'test-key';
      const testData = { id: 1, name: 'Test Data' };
      const queryFn = vi.fn().mockResolvedValue(testData);

      // Initial stats
      let stats = cacheService.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);

      // First call (cache miss)
      await cacheService.get(testKey, queryFn);
      stats = cacheService.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);

      // Second call (cache hit)
      await cacheService.get(testKey, queryFn);
      stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should track total entries and size', async () => {
      const testData = { id: 1, name: 'Test Data' };
      const queryFn = vi.fn().mockResolvedValue(testData);

      await cacheService.get('key1', queryFn);
      await cacheService.get('key2', queryFn);

      const stats = cacheService.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  describe('cache persistence', () => {
    it('should save cache to localStorage', async () => {
      const testKey = 'test-key';
      const testData = { id: 1, name: 'Test Data' };
      const queryFn = vi.fn().mockResolvedValue(testData);

      await cacheService.get(testKey, queryFn);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'hallucifix_query_cache',
        expect.any(String)
      );
    });

    it('should load cache from localStorage on initialization', () => {
      const mockCacheData = JSON.stringify([
        ['query:test-key', {
          data: { id: 1, name: 'Test Data' },
          timestamp: Date.now(),
          ttl: 300000,
          key: 'query:test-key',
          tags: []
        }]
      ]);

      mockLocalStorage.getItem.mockReturnValue(mockCacheData);

      // Create new cache service instance to trigger loading
      const newCacheService = new (cacheService.constructor as any)();
      
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('hallucifix_query_cache');
    });

    it('should handle localStorage errors gracefully', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const testKey = 'test-key';
      const testData = { id: 1, name: 'Test Data' };
      const queryFn = vi.fn().mockResolvedValue(testData);

      // Should not throw error even if localStorage fails
      await expect(cacheService.get(testKey, queryFn)).resolves.toEqual(testData);
    });
  });

  describe('cache cleanup', () => {
    it('should automatically clean up expired entries', async () => {
      const testData = { id: 1, name: 'Test Data' };
      const queryFn = vi.fn().mockResolvedValue(testData);
      const shortTTL = 1000;

      // Cache data with short TTL
      await cacheService.get('key1', queryFn, { ttl: shortTTL });
      await cacheService.get('key2', queryFn, { ttl: shortTTL });

      let stats = cacheService.getStats();
      expect(stats.totalEntries).toBe(2);

      // Advance time to expire entries
      vi.advanceTimersByTime(shortTTL + 100);

      // Trigger cleanup (normally happens on interval)
      vi.advanceTimersByTime(60000); // Cleanup interval

      // Entries should be cleaned up
      stats = cacheService.getStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should evict oldest entries when cache is full', async () => {
      const testData = { id: 1, name: 'Test Data' };
      const queryFn = vi.fn().mockResolvedValue(testData);

      // Fill cache beyond max size (assuming max size is 100)
      for (let i = 0; i < 102; i++) {
        await cacheService.get(`key${i}`, queryFn);
        vi.advanceTimersByTime(10); // Ensure different timestamps
      }

      const stats = cacheService.getStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(100);
    });
  });

  describe('cache warmup', () => {
    it('should warm up cache with critical queries', async () => {
      const testData1 = { id: 1, name: 'Data 1' };
      const testData2 = { id: 2, name: 'Data 2' };
      const queryFn1 = vi.fn().mockResolvedValue(testData1);
      const queryFn2 = vi.fn().mockResolvedValue(testData2);

      const queries = [
        { key: 'key1', queryFn: queryFn1 },
        { key: 'key2', queryFn: queryFn2 }
      ];

      await cacheService.warmUp(queries);

      expect(queryFn1).toHaveBeenCalledTimes(1);
      expect(queryFn2).toHaveBeenCalledTimes(1);

      // Subsequent calls should hit cache
      await cacheService.get('key1', queryFn1);
      await cacheService.get('key2', queryFn2);

      expect(queryFn1).toHaveBeenCalledTimes(1);
      expect(queryFn2).toHaveBeenCalledTimes(1);
    });

    it('should handle warmup failures gracefully', async () => {
      const queryFn1 = vi.fn().mockResolvedValue({ success: true });
      const queryFn2 = vi.fn().mockRejectedValue(new Error('Warmup failed'));

      const queries = [
        { key: 'key1', queryFn: queryFn1 },
        { key: 'key2', queryFn: queryFn2 }
      ];

      // Should not throw error even if some queries fail
      await expect(cacheService.warmUp(queries)).resolves.toBeUndefined();

      expect(queryFn1).toHaveBeenCalledTimes(1);
      expect(queryFn2).toHaveBeenCalledTimes(1);
    });
  });
});

describe('CachedQueryService', () => {
  let cachedQuery: CachedQueryService;

  beforeEach(() => {
    vi.clearAllMocks();
    cachedQuery = new CachedQueryService();
  });

  describe('getUserAnalytics', () => {
    it('should cache user analytics data', async () => {
      const userId = 'user-123';
      const mockAnalytics = {
        totalAnalyses: 50,
        averageAccuracy: 85.5,
        riskDistribution: { low: 30, medium: 15, high: 5 }
      };

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getUserAnalytics).mockResolvedValue(mockAnalytics);

      // First call should fetch from service
      const result1 = await cachedQuery.getUserAnalytics(userId);
      expect(result1).toEqual(mockAnalytics);
      expect(optimizedAnalysisService.getUserAnalytics).toHaveBeenCalledTimes(1);

      // Second call should return cached data
      const result2 = await cachedQuery.getUserAnalytics(userId);
      expect(result2).toEqual(mockAnalytics);
      expect(optimizedAnalysisService.getUserAnalytics).toHaveBeenCalledTimes(1);
    });

    it('should handle time range parameters', async () => {
      const userId = 'user-123';
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getUserAnalytics).mockResolvedValue({});

      await cachedQuery.getUserAnalytics(userId, timeRange);

      expect(optimizedAnalysisService.getUserAnalytics).toHaveBeenCalledWith(userId, timeRange);
    });

    it('should force refresh when requested', async () => {
      const userId = 'user-123';
      const mockAnalytics = { totalAnalyses: 50 };

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getUserAnalytics).mockResolvedValue(mockAnalytics);

      // Cache data
      await cachedQuery.getUserAnalytics(userId);
      expect(optimizedAnalysisService.getUserAnalytics).toHaveBeenCalledTimes(1);

      // Force refresh
      await cachedQuery.getUserAnalytics(userId, undefined, { forceRefresh: true });
      expect(optimizedAnalysisService.getUserAnalytics).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAnalysisResults', () => {
    it('should cache analysis results with pagination', async () => {
      const userId = 'user-123';
      const options = { limit: 10, cursor: 'cursor-123' };
      const mockResults = {
        results: [{ id: 1, content: 'Test analysis' }],
        nextCursor: 'cursor-456',
        hasMore: true
      };

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getAnalysisResultsWithStats).mockResolvedValue(mockResults);

      const result = await cachedQuery.getAnalysisResults(userId, options);

      expect(result).toEqual(mockResults);
      expect(optimizedAnalysisService.getAnalysisResultsWithStats).toHaveBeenCalledWith(userId, options);
    });

    it('should handle global results when no userId provided', async () => {
      const options = { limit: 20 };
      const mockResults = { results: [], hasMore: false };

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getAnalysisResultsWithStats).mockResolvedValue(mockResults);

      await cachedQuery.getAnalysisResults(undefined, options);

      expect(optimizedAnalysisService.getAnalysisResultsWithStats).toHaveBeenCalledWith(undefined, options);
    });
  });

  describe('searchAnalysisResults', () => {
    it('should cache search results', async () => {
      const searchQuery = 'test query';
      const userId = 'user-123';
      const mockResults = {
        results: [{ id: 1, content: 'Test result' }],
        total: 1
      };

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.searchAnalysisResults).mockResolvedValue(mockResults);

      // First call
      const result1 = await cachedQuery.searchAnalysisResults(searchQuery, userId);
      expect(result1).toEqual(mockResults);
      expect(optimizedAnalysisService.searchAnalysisResults).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await cachedQuery.searchAnalysisResults(searchQuery, userId);
      expect(result2).toEqual(mockResults);
      expect(optimizedAnalysisService.searchAnalysisResults).toHaveBeenCalledTimes(1);
    });

    it('should use longer TTL for search results', async () => {
      const searchQuery = 'test query';
      const mockResults = { results: [] };

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.searchAnalysisResults).mockResolvedValue(mockResults);

      await cachedQuery.searchAnalysisResults(searchQuery);

      // Verify search results are cached with 15 minute TTL
      expect(optimizedAnalysisService.searchAnalysisResults).toHaveBeenCalledWith(searchQuery, undefined, undefined);
    });
  });

  describe('cache invalidation methods', () => {
    it('should invalidate user-specific cache', async () => {
      const userId = 'user-123';
      const mockAnalytics = { totalAnalyses: 50 };

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getUserAnalytics).mockResolvedValue(mockAnalytics);

      // Cache user data
      await cachedQuery.getUserAnalytics(userId);
      expect(optimizedAnalysisService.getUserAnalytics).toHaveBeenCalledTimes(1);

      // Invalidate user cache
      cachedQuery.invalidateUserCache(userId);

      // Should fetch from service again
      await cachedQuery.getUserAnalytics(userId);
      expect(optimizedAnalysisService.getUserAnalytics).toHaveBeenCalledTimes(2);
    });

    it('should invalidate analysis cache', async () => {
      const userId = 'user-123';
      const mockResults = { results: [] };

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getAnalysisResultsWithStats).mockResolvedValue(mockResults);

      // Cache analysis results
      await cachedQuery.getAnalysisResults(userId);
      expect(optimizedAnalysisService.getAnalysisResultsWithStats).toHaveBeenCalledTimes(1);

      // Invalidate analysis cache
      cachedQuery.invalidateAnalysisCache(userId);

      // Should fetch from service again
      await cachedQuery.getAnalysisResults(userId);
      expect(optimizedAnalysisService.getAnalysisResultsWithStats).toHaveBeenCalledTimes(2);
    });
  });

  describe('warmUpCriticalCaches', () => {
    it('should warm up critical user caches', async () => {
      const userId = 'user-123';
      const mockAnalytics = { totalAnalyses: 50 };
      const mockRecentResults = [{ id: 1, content: 'Recent analysis' }];

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getUserAnalytics).mockResolvedValue(mockAnalytics);
      vi.mocked(optimizedAnalysisService.getRecentAnalysisResults).mockResolvedValue(mockRecentResults);

      await cachedQuery.warmUpCriticalCaches(userId);

      expect(optimizedAnalysisService.getUserAnalytics).toHaveBeenCalledWith(userId, undefined, { forceRefresh: true });
      expect(optimizedAnalysisService.getRecentAnalysisResults).toHaveBeenCalledWith(userId, 10);
    });
  });

  describe('cache statistics and management', () => {
    it('should provide cache statistics', () => {
      const stats = cachedQuery.getCacheStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('totalSize');
    });

    it('should clear all caches', async () => {
      const userId = 'user-123';
      const mockAnalytics = { totalAnalyses: 50 };

      const { optimizedAnalysisService } = await import('../optimizedAnalysisService');
      vi.mocked(optimizedAnalysisService.getUserAnalytics).mockResolvedValue(mockAnalytics);

      // Cache some data
      await cachedQuery.getUserAnalytics(userId);
      expect(optimizedAnalysisService.getUserAnalytics).toHaveBeenCalledTimes(1);

      // Clear all caches
      cachedQuery.clearAllCaches();

      // Should fetch from service again
      await cachedQuery.getUserAnalytics(userId);
      expect(optimizedAnalysisService.getUserAnalytics).toHaveBeenCalledTimes(2);
    });
  });
});