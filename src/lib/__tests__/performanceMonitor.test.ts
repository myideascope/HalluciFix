/**
 * Tests for PerformanceMonitor
 * Covers metrics collection, operation timing, and external service integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { performanceMonitor } from '../performanceMonitor';

// Mock config
vi.mock('../config', () => ({
  config: {
    app: {
      environment: 'test'
    },
    monitoring: {
      datadog: {
        apiKey: 'test-datadog-key'
      },
      newrelic: {
        apiKey: 'test-newrelic-key'
      },
      customEndpoint: 'https://api.example.com/metrics'
    }
  }
}));

// Mock fetch
global.fetch = vi.fn();

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    performanceMonitor.clearMetrics();
    performanceMonitor.setBatchSize(5); // Small batch size for testing
    performanceMonitor.setFlushInterval(1000); // 1 second for testing
  });

  afterEach(() => {
    vi.useRealTimers();
    performanceMonitor.stopPeriodicFlush();
  });

  describe('recordMetric', () => {
    it('should record a performance metric', () => {
      const metric = {
        name: 'test.metric',
        value: 100,
        unit: 'ms' as const,
        tags: { component: 'test' }
      };

      performanceMonitor.recordMetric(metric);

      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        name: 'test.metric',
        value: 100,
        unit: 'ms',
        tags: { component: 'test' },
        timestamp: expect.any(Date)
      });
    });

    it('should auto-flush when batch size is reached', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

      // Record metrics up to batch size
      for (let i = 0; i < 5; i++) {
        performanceMonitor.recordMetric({
          name: `test.metric.${i}`,
          value: i,
          unit: 'count',
          tags: {}
        });
      }

      // Wait for async flush
      await vi.runAllTimersAsync();

      // Should have sent metrics to external services
      expect(fetchSpy).toHaveBeenCalled();
      
      // Metrics should be cleared after flush
      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(0);
    });
  });

  describe('operation timing', () => {
    it('should time operations correctly', () => {
      const operationName = 'test.operation';
      const tags = { component: 'test' };

      const operationId = performanceMonitor.startOperation(operationName, tags);
      expect(operationId).toMatch(/test\.operation_\d+_[a-z0-9]+/);

      // Advance time
      vi.advanceTimersByTime(100);

      performanceMonitor.endOperation(operationId, { status: 'success' });

      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(2); // duration and count metrics

      const durationMetric = metrics.find(m => m.name === 'test.operation.duration');
      const countMetric = metrics.find(m => m.name === 'test.operation.count');

      expect(durationMetric).toBeDefined();
      expect(durationMetric?.value).toBeGreaterThanOrEqual(100);
      expect(durationMetric?.unit).toBe('ms');
      expect(durationMetric?.tags).toMatchObject({ component: 'test', status: 'success' });

      expect(countMetric).toBeDefined();
      expect(countMetric?.value).toBe(1);
      expect(countMetric?.unit).toBe('count');
    });

    it('should handle missing operation gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      performanceMonitor.endOperation('non-existent-operation');

      expect(consoleSpy).toHaveBeenCalledWith('Operation non-existent-operation not found');
      
      consoleSpy.mockRestore();
    });

    it('should time async operations', async () => {
      const asyncOperation = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'success';
      });

      const promise = performanceMonitor.timeOperation('async.test', asyncOperation, { type: 'async' });
      
      vi.advanceTimersByTime(50);
      await vi.runAllTimersAsync();
      
      const result = await promise;
      expect(result).toBe('success');
      expect(asyncOperation).toHaveBeenCalledTimes(1);

      const metrics = performanceMonitor.getCurrentMetrics();
      const durationMetric = metrics.find(m => m.name === 'async.test.duration');
      expect(durationMetric).toBeDefined();
      expect(durationMetric?.tags).toMatchObject({ type: 'async', status: 'success' });
    });

    it('should handle async operation errors', async () => {
      const error = new Error('Operation failed');
      const asyncOperation = vi.fn().mockRejectedValue(error);

      await expect(
        performanceMonitor.timeOperation('async.error', asyncOperation)
      ).rejects.toThrow('Operation failed');

      const metrics = performanceMonitor.getCurrentMetrics();
      const durationMetric = metrics.find(m => m.name === 'async.error.duration');
      expect(durationMetric?.tags).toMatchObject({ status: 'error', error: 'Error' });
    });
  });

  describe('API call recording', () => {
    it('should record API call metrics', () => {
      performanceMonitor.recordApiCall('/api/users', 'GET', 200, 150, { version: 'v1' });

      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(2); // duration and count

      const durationMetric = metrics.find(m => m.name === 'api.request.duration');
      const countMetric = metrics.find(m => m.name === 'api.request.count');

      expect(durationMetric).toMatchObject({
        value: 150,
        unit: 'ms',
        tags: {
          endpoint: '/api/users',
          method: 'GET',
          status_code: '200',
          version: 'v1'
        }
      });

      expect(countMetric).toMatchObject({
        value: 1,
        unit: 'count',
        tags: {
          endpoint: '/api/users',
          method: 'GET',
          status_code: '200',
          version: 'v1'
        }
      });
    });

    it('should normalize endpoints with IDs', () => {
      performanceMonitor.recordApiCall('/api/users/123', 'GET', 200, 100);

      const metrics = performanceMonitor.getCurrentMetrics();
      const durationMetric = metrics.find(m => m.name === 'api.request.duration');
      
      expect(durationMetric?.tags.endpoint).toBe('/api/users/:id');
    });
  });

  describe('memory usage recording', () => {
    it('should record memory usage when available', () => {
      // Mock performance.memory
      Object.defineProperty(performance, 'memory', {
        value: {
          usedJSHeapSize: 1000000,
          totalJSHeapSize: 2000000,
          jsHeapSizeLimit: 4000000
        },
        configurable: true
      });

      performanceMonitor.recordMemoryUsage();

      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(3);

      const usedHeapMetric = metrics.find(m => m.name === 'memory.used_heap_size');
      const totalHeapMetric = metrics.find(m => m.name === 'memory.total_heap_size');
      const heapLimitMetric = metrics.find(m => m.name === 'memory.heap_size_limit');

      expect(usedHeapMetric?.value).toBe(1000000);
      expect(totalHeapMetric?.value).toBe(2000000);
      expect(heapLimitMetric?.value).toBe(4000000);
    });

    it('should handle missing memory API gracefully', () => {
      // Remove performance.memory
      Object.defineProperty(performance, 'memory', {
        value: undefined,
        configurable: true
      });

      performanceMonitor.recordMemoryUsage();

      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(0);
    });
  });

  describe('Web Vitals recording', () => {
    it('should record Core Web Vitals metrics', () => {
      performanceMonitor.recordWebVital('LCP', 2500, 'needs-improvement');
      performanceMonitor.recordWebVital('FID', 100, 'good');
      performanceMonitor.recordWebVital('CLS', 0.1, 'good');

      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(3);

      const lcpMetric = metrics.find(m => m.name === 'web_vitals.lcp');
      const fidMetric = metrics.find(m => m.name === 'web_vitals.fid');
      const clsMetric = metrics.find(m => m.name === 'web_vitals.cls');

      expect(lcpMetric).toMatchObject({
        value: 2500,
        unit: 'ms',
        tags: { rating: 'needs-improvement', source: 'web_vitals' }
      });

      expect(fidMetric).toMatchObject({
        value: 100,
        unit: 'ms',
        tags: { rating: 'good', source: 'web_vitals' }
      });

      expect(clsMetric).toMatchObject({
        value: 0.1,
        unit: 'count',
        tags: { rating: 'good', source: 'web_vitals' }
      });
    });
  });

  describe('user interaction recording', () => {
    it('should record user interactions', () => {
      performanceMonitor.recordUserInteraction('click', 'button', 50, { buttonId: 'submit' });

      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(2); // count and duration

      const countMetric = metrics.find(m => m.name === 'user.interaction.count');
      const durationMetric = metrics.find(m => m.name === 'user.interaction.duration');

      expect(countMetric).toMatchObject({
        value: 1,
        unit: 'count',
        tags: {
          action: 'click',
          component: 'button',
          metadata: JSON.stringify({ buttonId: 'submit' })
        }
      });

      expect(durationMetric).toMatchObject({
        value: 50,
        unit: 'ms',
        tags: {
          action: 'click',
          component: 'button'
        }
      });
    });

    it('should record interactions without duration', () => {
      performanceMonitor.recordUserInteraction('hover', 'menu');

      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(1); // only count metric

      const countMetric = metrics.find(m => m.name === 'user.interaction.count');
      expect(countMetric).toBeDefined();
      expect(metrics.find(m => m.name === 'user.interaction.duration')).toBeUndefined();
    });
  });

  describe('business metrics', () => {
    it('should record business metrics', () => {
      performanceMonitor.recordBusinessMetric('user_signups', 5, 'count', { source: 'organic' });

      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(1);

      const metric = metrics[0];
      expect(metric).toMatchObject({
        name: 'business.user_signups',
        value: 5,
        unit: 'count',
        tags: { source: 'organic', source: 'business' }
      });
    });
  });

  describe('metrics flushing', () => {
    it('should flush metrics to external services', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

      // Record some metrics
      performanceMonitor.recordMetric({
        name: 'test.metric',
        value: 100,
        unit: 'ms',
        tags: {}
      });

      await performanceMonitor.flushErrors();

      // Should send to DataDog
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.datadoghq.com/api/v1/series',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'DD-API-KEY': 'test-datadog-key'
          })
        })
      );

      // Should send to New Relic
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('insights-collector.newrelic.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Insert-Key': 'test-newrelic-key'
          })
        })
      );

      // Should send to custom endpoint
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/metrics',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should handle flush errors gracefully', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      performanceMonitor.recordMetric({
        name: 'test.metric',
        value: 100,
        unit: 'ms',
        tags: {}
      });

      await performanceMonitor.flushErrors();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to flush metrics:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    it('should flush metrics periodically', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

      performanceMonitor.recordMetric({
        name: 'test.metric',
        value: 100,
        unit: 'ms',
        tags: {}
      });

      // Advance time to trigger periodic flush
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('should update batch size', () => {
      performanceMonitor.setBatchSize(10);

      // Record 9 metrics (below new batch size)
      for (let i = 0; i < 9; i++) {
        performanceMonitor.recordMetric({
          name: `test.metric.${i}`,
          value: i,
          unit: 'count',
          tags: {}
        });
      }

      // Should not auto-flush yet
      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toHaveLength(9);
    });

    it('should update flush interval', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      performanceMonitor.setFlushInterval(5000);

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    });
  });

  describe('DataDog integration', () => {
    it('should format metrics for DataDog correctly', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

      performanceMonitor.recordMetric({
        name: 'test.metric',
        value: 100,
        unit: 'count',
        tags: { component: 'test', version: '1.0' }
      });

      await performanceMonitor.flushErrors();

      const datadogCall = fetchSpy.mock.calls.find(call => 
        call[0] === 'https://api.datadoghq.com/api/v1/series'
      );

      expect(datadogCall).toBeDefined();
      
      const payload = JSON.parse(datadogCall![1]!.body as string);
      expect(payload.series).toHaveLength(1);
      expect(payload.series[0]).toMatchObject({
        metric: 'hallucifix.test.metric',
        points: [[expect.any(Number), 100]],
        tags: ['component:test', 'version:1.0'],
        type: 'count'
      });
    });
  });

  describe('New Relic integration', () => {
    it('should format metrics for New Relic correctly', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

      performanceMonitor.recordMetric({
        name: 'test.metric',
        value: 150,
        unit: 'ms',
        tags: { endpoint: '/api/test' }
      });

      await performanceMonitor.flushErrors();

      const newrelicCall = fetchSpy.mock.calls.find(call => 
        typeof call[0] === 'string' && call[0].includes('insights-collector.newrelic.com')
      );

      expect(newrelicCall).toBeDefined();
      
      const payload = JSON.parse(newrelicCall![1]!.body as string);
      expect(payload).toHaveLength(1);
      expect(payload[0]).toMatchObject({
        eventType: 'HallucifixMetric',
        name: 'test.metric',
        value: 150,
        unit: 'ms',
        timestamp: expect.any(Number),
        endpoint: '/api/test'
      });
    });
  });

  describe('cleanup', () => {
    it('should clear metrics', () => {
      performanceMonitor.recordMetric({
        name: 'test.metric',
        value: 100,
        unit: 'ms',
        tags: {}
      });

      expect(performanceMonitor.getCurrentMetrics()).toHaveLength(1);

      performanceMonitor.clearMetrics();

      expect(performanceMonitor.getCurrentMetrics()).toHaveLength(0);
    });

    it('should stop periodic flushing', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      performanceMonitor.stopPeriodicFlush();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});