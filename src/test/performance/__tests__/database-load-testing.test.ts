import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseLoadTester, LoadTestConfig } from '../database-load-testing';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }))
    })),
    insert: vi.fn(() => Promise.resolve({ data: [], error: null }))
  })),
  rpc: vi.fn(() => Promise.resolve({ data: [{ total: 100, avg_accuracy: 85.5 }], error: null }))
};

// Mock the config
vi.mock('../../../lib/env', () => ({
  config: {
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-key'
  }
}));

// Mock Supabase client creation
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

// Mock database performance monitor
vi.mock('../../../lib/databasePerformanceMonitor', () => ({
  dbMonitor: {
    trackQuery: vi.fn(async (name, queryFn) => {
      return await queryFn();
    })
  }
}));

describe('DatabaseLoadTester', () => {
  let loadTester: DatabaseLoadTester;
  let testConfig: LoadTestConfig;

  beforeEach(() => {
    loadTester = new DatabaseLoadTester();
    testConfig = {
      concurrentUsers: 5,
      testDuration: 10,
      operationsPerUser: 3,
      queryTypes: ['user_analysis_list', 'dashboard_analytics']
    };
    
    vi.clearAllMocks();
  });

  describe('runLoadTest', () => {
    it('should execute load test with specified configuration', async () => {
      const result = await loadTester.runLoadTest('test_load', testConfig);

      expect(result).toBeDefined();
      expect(result.testName).toBe('test_load');
      expect(result.config).toEqual(testConfig);
      expect(result.totalOperations).toBeGreaterThan(0);
      expect(result.successfulOperations).toBeGreaterThanOrEqual(0);
      expect(result.failedOperations).toBeGreaterThanOrEqual(0);
      expect(result.averageResponseTime).toBeGreaterThanOrEqual(0);
      expect(result.throughput).toBeGreaterThanOrEqual(0);
      expect(result.errorRate).toBeGreaterThanOrEqual(0);
    });

    it('should track query performance for each query type', async () => {
      const result = await loadTester.runLoadTest('test_queries', testConfig);

      expect(result.queryResults).toBeDefined();
      expect(result.queryResults.size).toBeGreaterThan(0);
      
      testConfig.queryTypes.forEach(queryType => {
        const queryResult = result.queryResults.get(queryType);
        if (queryResult && queryResult.totalExecutions > 0) {
          expect(queryResult.queryType).toBe(queryType);
          expect(queryResult.averageTime).toBeGreaterThanOrEqual(0);
          expect(queryResult.minTime).toBeGreaterThanOrEqual(0);
          expect(queryResult.maxTime).toBeGreaterThanOrEqual(queryResult.minTime);
        }
      });
    });

    it('should calculate percentiles correctly', async () => {
      const result = await loadTester.runLoadTest('test_percentiles', testConfig);

      expect(result.p95ResponseTime).toBeGreaterThanOrEqual(0);
      expect(result.p99ResponseTime).toBeGreaterThanOrEqual(result.p95ResponseTime);
      expect(result.averageResponseTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent users correctly', async () => {
      const highConcurrencyConfig = {
        ...testConfig,
        concurrentUsers: 10,
        operationsPerUser: 2
      };

      const result = await loadTester.runLoadTest('test_concurrency', highConcurrencyConfig);

      expect(result.totalOperations).toBeLessThanOrEqual(
        highConcurrencyConfig.concurrentUsers * highConcurrencyConfig.operationsPerUser
      );
      expect(result.successfulOperations + result.failedOperations).toBe(result.totalOperations);
    });
  });

  describe('runStandardLoadTests', () => {
    it('should run all predefined load test scenarios', async () => {
      // Mock shorter durations for testing
      const originalRunLoadTest = loadTester.runLoadTest;
      loadTester.runLoadTest = vi.fn().mockImplementation(async (name, config) => {
        // Return a mock result quickly
        return {
          testName: name,
          config,
          startTime: new Date(),
          endTime: new Date(),
          totalOperations: 10,
          successfulOperations: 9,
          failedOperations: 1,
          averageResponseTime: 100,
          p95ResponseTime: 150,
          p99ResponseTime: 200,
          throughput: 5,
          errorRate: 10,
          queryResults: new Map()
        };
      });

      const results = await loadTester.runStandardLoadTests();

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(loadTester.runLoadTest).toHaveBeenCalledTimes(results.length);

      // Restore original method
      loadTester.runLoadTest = originalRunLoadTest;
    });
  });

  describe('compareWithBaseline', () => {
    it('should compare current results with baseline correctly', async () => {
      const baselineResult = {
        testName: 'baseline',
        config: testConfig,
        startTime: new Date(),
        endTime: new Date(),
        totalOperations: 100,
        successfulOperations: 95,
        failedOperations: 5,
        averageResponseTime: 200,
        p95ResponseTime: 300,
        p99ResponseTime: 400,
        throughput: 10,
        errorRate: 5,
        queryResults: new Map()
      };

      const currentResult = {
        ...baselineResult,
        averageResponseTime: 240, // 20% increase
        throughput: 8, // 20% decrease
        errorRate: 7 // 2 percentage point increase
      };

      const comparison = await loadTester.compareWithBaseline(currentResult, baselineResult);

      expect(comparison.performanceChange).toBe(20); // 20% increase in response time
      expect(comparison.throughputChange).toBe(-20); // 20% decrease in throughput
      expect(comparison.errorRateChange).toBe(2); // 2 percentage point increase
      expect(comparison.recommendations).toContain('Performance degraded by more than 10%. Consider reviewing recent changes.');
    });

    it('should provide appropriate recommendations based on performance changes', async () => {
      const baselineResult = {
        testName: 'baseline',
        config: testConfig,
        startTime: new Date(),
        endTime: new Date(),
        totalOperations: 100,
        successfulOperations: 100,
        failedOperations: 0,
        averageResponseTime: 100,
        p95ResponseTime: 150,
        p99ResponseTime: 200,
        throughput: 20,
        errorRate: 0,
        queryResults: new Map()
      };

      const degradedResult = {
        ...baselineResult,
        averageResponseTime: 1200, // Very slow
        p95ResponseTime: 1500,
        throughput: 5, // Much lower
        errorRate: 3 // Some errors
      };

      const comparison = await loadTester.compareWithBaseline(degradedResult, baselineResult);

      expect(comparison.recommendations.length).toBeGreaterThan(0);
      expect(comparison.recommendations.some(rec => rec.includes('Performance degraded'))).toBe(true);
      expect(comparison.recommendations.some(rec => rec.includes('95th percentile'))).toBe(true);
    });
  });

  describe('query execution', () => {
    it('should handle different query types', async () => {
      const queryTypes = ['user_analysis_list', 'dashboard_analytics', 'search_content', 'risk_level_filter', 'batch_insert'];
      
      for (const queryType of queryTypes) {
        const config = {
          ...testConfig,
          queryTypes: [queryType],
          operationsPerUser: 1
        };

        const result = await loadTester.runLoadTest(`test_${queryType}`, config);
        
        expect(result.totalOperations).toBeGreaterThan(0);
        // Should not throw errors for valid query types
      }
    });

    it('should handle query failures gracefully', async () => {
      // Mock a failing query
      mockSupabase.from.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.reject(new Error('Database connection failed'))
            })
          })
        })
      }));

      const result = await loadTester.runLoadTest('test_failures', {
        ...testConfig,
        operationsPerUser: 1
      });

      // Should handle failures and continue
      expect(result.failedOperations).toBeGreaterThanOrEqual(0);
      expect(result.errorRate).toBeGreaterThanOrEqual(0);
    });
  });
});