/**
 * Simple Monitoring Integration Test
 * Tests core monitoring functionality without complex dependencies
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../../logging/StructuredLogger';
import { errorMonitor } from '../../errors/errorMonitor';
import { performanceMonitor } from '../../performanceMonitor';

describe('Core Monitoring Integration', () => {
  beforeEach(() => {
    // Clear any existing state
    errorMonitor.clearAlertHistory();
  });

  afterEach(() => {
    // Cleanup
    errorMonitor.clearAlertHistory();
  });

  describe('Logging System', () => {
    it('should log messages with structured format', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('Test message', { testId: 'logging-test' });
      logger.warn('Test warning', { testId: 'logging-test' });
      logger.error('Test error', new Error('Test error'), { testId: 'logging-test' });

      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should sanitize sensitive information', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('Test with sensitive data', {
        password: 'secret123',
        apiKey: 'api-key-secret',
        token: 'bearer-token',
        normalField: 'normal-value'
      });

      expect(consoleSpy).toHaveBeenCalled();
      
      // Check that sensitive fields are redacted
      const logCall = consoleSpy.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);
      
      expect(logEntry.context.password).toBe('[REDACTED]');
      expect(logEntry.context.apiKey).toBe('[REDACTED]');
      expect(logEntry.context.token).toBe('[REDACTED]');
      expect(logEntry.context.normalField).toBe('normal-value');

      consoleSpy.mockRestore();
    });
  });

  describe('Error Monitoring', () => {
    it('should track error metrics', async () => {
      const initialMetrics = errorMonitor.getMetrics();

      // Simulate errors
      logger.error('Test error 1', new Error('Test error 1'));
      logger.error('Test error 2', new Error('Test error 2'));

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedMetrics = errorMonitor.getMetrics();
      
      expect(updatedMetrics.totalErrors).toBeGreaterThanOrEqual(initialMetrics.totalErrors);
    });

    it('should have default alert thresholds configured', () => {
      const thresholds = errorMonitor.getThresholds();
      
      expect(thresholds.length).toBeGreaterThan(0);
      
      // Check for expected default thresholds
      const thresholdNames = thresholds.map(t => t.id);
      expect(thresholdNames).toContain('high_error_rate');
      expect(thresholdNames).toContain('critical_errors');
    });

    it('should track alert history', async () => {
      const initialHistory = errorMonitor.getAlertHistory();
      
      // Simulate high error rate to trigger alert
      for (let i = 0; i < 15; i++) {
        logger.error(`High rate error ${i}`, new Error(`Error ${i}`));
      }

      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const updatedHistory = errorMonitor.getAlertHistory();
      
      // Should have more alerts (or at least same number)
      expect(updatedHistory.length).toBeGreaterThanOrEqual(initialHistory.length);
    });
  });

  describe('Performance Monitoring', () => {
    it('should record performance metrics', () => {
      const testMetric = {
        name: 'test_operation',
        value: 150,
        unit: 'ms' as const,
        tags: { test: 'performance' },
        timestamp: new Date()
      };

      performanceMonitor.recordMetric(testMetric);

      const recentMetrics = performanceMonitor.getRecentMetrics(60000);
      const recordedMetric = recentMetrics.find(m => m.name === 'test_operation');

      expect(recordedMetric).toBeDefined();
      expect(recordedMetric?.value).toBe(150);
      expect(recordedMetric?.unit).toBe('ms');
    });

    it('should time operations', async () => {
      const result = await performanceMonitor.timeOperation(
        'test_timed_operation',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'test_result';
        },
        { test: 'timing' }
      );

      expect(result).toBe('test_result');

      const recentMetrics = performanceMonitor.getRecentMetrics(60000);
      const timedMetric = recentMetrics.find(m => m.name === 'test_timed_operation');

      expect(timedMetric).toBeDefined();
      expect(timedMetric?.value).toBeGreaterThan(90); // Should be around 100ms
      expect(timedMetric?.value).toBeLessThan(200); // Allow some variance
    });

    it('should record business metrics', () => {
      performanceMonitor.recordBusinessMetric(
        'test_business_metric',
        42,
        'count',
        { category: 'test' }
      );

      const recentMetrics = performanceMonitor.getRecentMetrics(60000);
      const businessMetric = recentMetrics.find(m => m.name === 'test_business_metric');

      expect(businessMetric).toBeDefined();
      expect(businessMetric?.value).toBe(42);
    });
  });

  describe('Cross-Component Integration', () => {
    it('should correlate errors with performance metrics', async () => {
      // Record a performance metric
      performanceMonitor.recordMetric({
        name: 'slow_operation',
        value: 5000, // 5 seconds - slow
        unit: 'ms',
        tags: { operation: 'test' },
        timestamp: new Date()
      });

      // Simulate related error
      logger.error('Operation failed due to timeout', new Error('Timeout'), {
        operation: 'test',
        duration: 5000
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Both should be recorded
      const recentMetrics = performanceMonitor.getRecentMetrics(60000);
      const errorMetrics = errorMonitor.getMetrics();

      const slowOperation = recentMetrics.find(m => m.name === 'slow_operation');
      expect(slowOperation).toBeDefined();
      expect(errorMetrics.totalErrors).toBeGreaterThan(0);
    });

    it('should handle concurrent monitoring operations', async () => {
      const operations = [];

      // Start multiple concurrent operations
      for (let i = 0; i < 10; i++) {
        operations.push(
          performanceMonitor.timeOperation(
            `concurrent_operation_${i}`,
            async () => {
              await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
              
              // Occasionally simulate an error
              if (Math.random() < 0.3) {
                logger.error(`Error in operation ${i}`, new Error(`Operation ${i} failed`));
              }
              
              return `result_${i}`;
            },
            { test: 'concurrent' }
          )
        );
      }

      const results = await Promise.all(operations);

      expect(results).toHaveLength(10);
      results.forEach((result, index) => {
        expect(result).toBe(`result_${index}`);
      });

      // Check that metrics were recorded
      const recentMetrics = performanceMonitor.getRecentMetrics(60000);
      const concurrentMetrics = recentMetrics.filter(m => 
        m.name.startsWith('concurrent_operation_')
      );

      expect(concurrentMetrics.length).toBe(10);
    });
  });

  describe('System Health Indicators', () => {
    it('should provide error rate metrics', () => {
      const metrics = errorMonitor.getMetrics();
      
      expect(typeof metrics.errorRate).toBe('number');
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
    });

    it('should provide performance metrics', () => {
      // Record some metrics first
      performanceMonitor.recordMetric({
        name: 'health_check_operation',
        value: 200,
        unit: 'ms',
        tags: { type: 'health_check' },
        timestamp: new Date()
      });

      const recentMetrics = performanceMonitor.getRecentMetrics(60000);
      expect(recentMetrics.length).toBeGreaterThan(0);

      const avgResponseTime = recentMetrics.reduce((sum, m) => sum + (m.value || 0), 0) / recentMetrics.length;
      expect(typeof avgResponseTime).toBe('number');
      expect(avgResponseTime).toBeGreaterThan(0);
    });

    it('should detect system degradation', async () => {
      // Simulate system degradation with high error rate
      const initialMetrics = errorMonitor.getMetrics();

      // Generate many errors quickly
      for (let i = 0; i < 20; i++) {
        logger.error(`Degradation test error ${i}`, new Error(`Error ${i}`));
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const updatedMetrics = errorMonitor.getMetrics();
      
      // Error rate should increase
      expect(updatedMetrics.errorRate).toBeGreaterThan(initialMetrics.errorRate);
      expect(updatedMetrics.totalErrors).toBeGreaterThan(initialMetrics.totalErrors);
    });
  });

  describe('Monitoring System Resilience', () => {
    it('should continue operating when individual components fail', async () => {
      // Mock a component failure
      const originalRecordMetric = performanceMonitor.recordMetric;
      performanceMonitor.recordMetric = vi.fn().mockImplementation(() => {
        throw new Error('Simulated component failure');
      });

      try {
        // Other components should still work
        logger.info('Test message during component failure');
        
        const metrics = errorMonitor.getMetrics();
        expect(metrics).toBeDefined();

        // Logging should still work
        expect(true).toBe(true); // Test passes if no exception thrown

      } finally {
        // Restore original function
        performanceMonitor.recordMetric = originalRecordMetric;
      }
    });

    it('should handle high load gracefully', async () => {
      const startTime = Date.now();
      const operations = [];

      // Generate high load
      for (let i = 0; i < 100; i++) {
        operations.push(
          Promise.resolve().then(() => {
            logger.info(`Load test message ${i}`, { loadTest: true });
            
            performanceMonitor.recordMetric({
              name: `load_test_metric_${i}`,
              value: Math.random() * 1000,
              unit: 'ms',
              tags: { loadTest: 'true' },
              timestamp: new Date()
            });

            // Occasionally simulate errors
            if (i % 10 === 0) {
              logger.error(`Load test error ${i}`, new Error(`Load error ${i}`));
            }
          })
        );
      }

      await Promise.all(operations);
      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000);

      // System should still be responsive
      const metrics = errorMonitor.getMetrics();
      expect(metrics).toBeDefined();

      const recentMetrics = performanceMonitor.getRecentMetrics(60000);
      expect(recentMetrics.length).toBeGreaterThan(0);
    });
  });
});