/**
 * Tests for the retry manager with exponential backoff
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RetryManager, withRetry, withRetryFallback, makeRetryable, DEFAULT_RETRY_CONFIG } from '../retryManager';
import { ErrorType, ErrorSeverity } from '../types';

describe('RetryManager', () => {
  let retryManager: RetryManager;

  beforeEach(() => {
    retryManager = new RetryManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Retry Logic', () => {
    it('should succeed on first attempt if operation succeeds', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await retryManager.withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry failed operations up to maxRetries', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Attempt 1'))
        .mockRejectedValueOnce(new Error('Attempt 2'))
        .mockResolvedValue('success');

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      const result = await retryManager.withRetry(operation, { 
        maxRetries: 2,
        baseDelay: 100 
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw error after exhausting all retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      await expect(retryManager.withRetry(operation, { maxRetries: 2 })).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate correct delays with exponential backoff', async () => {
      const delays: number[] = [];
      
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay) => {
        delays.push(delay as number);
        callback(); // Execute immediately for test
        return 1 as any;
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const config = {
        maxRetries: 2,
        baseDelay: 1000,
        backoffFactor: 2,
        jitter: false // Disable jitter for predictable testing
      };

      await retryManager.withRetry(operation, config);

      expect(delays).toHaveLength(2);
      expect(delays[0]).toBe(1000); // First retry: 1000 * 2^0 = 1000
      expect(delays[1]).toBe(2000); // Second retry: 1000 * 2^1 = 2000
    });

    it('should respect maximum delay limit', async () => {
      const delays: number[] = [];
      
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay) => {
        delays.push(delay as number);
        callback();
        return 1 as any;
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const config = {
        maxRetries: 2,
        baseDelay: 10000,
        backoffFactor: 3,
        maxDelay: 15000,
        jitter: false
      };

      await retryManager.withRetry(operation, config);

      expect(delays[0]).toBe(10000); // First retry: 10000 * 3^0 = 10000
      expect(delays[1]).toBe(15000); // Second retry: capped at maxDelay
    });

    it('should add jitter when enabled', async () => {
      const delays: number[] = [];
      
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay) => {
        delays.push(delay as number);
        callback();
        return 1 as any;
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const config = {
        maxRetries: 2,
        baseDelay: 1000,
        backoffFactor: 2,
        jitter: true
      };

      await retryManager.withRetry(operation, config);

      // With jitter, delays should be between base delay and base delay + 50%
      expect(delays[0]).toBeGreaterThanOrEqual(1000);
      expect(delays[0]).toBeLessThanOrEqual(1500);
      expect(delays[1]).toBeGreaterThanOrEqual(2000);
      expect(delays[1]).toBeLessThanOrEqual(3000);
    });
  });

  describe('Error Type Handling', () => {
    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = {
        type: ErrorType.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        errorId: 'test-error',
        timestamp: new Date().toISOString(),
        message: 'Authentication failed',
        userMessage: 'Please log in again',
        retryable: false
      };

      const operation = vi.fn().mockRejectedValue(nonRetryableError);

      await expect(retryManager.withRetry(operation)).rejects.toMatchObject({
        type: ErrorType.AUTHENTICATION,
        retryable: false
      });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry validation errors even if marked retryable', async () => {
      const validationError = {
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.LOW,
        errorId: 'test-error',
        timestamp: new Date().toISOString(),
        message: 'Validation failed',
        userMessage: 'Please check your input',
        retryable: true // Even though marked retryable, validation errors shouldn't be retried
      };

      const operation = vi.fn().mockRejectedValue(validationError);

      await expect(retryManager.withRetry(operation)).rejects.toMatchObject({
        type: ErrorType.VALIDATION,
        retryable: true
      });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry network errors', async () => {
      const networkError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'test-error',
        timestamp: new Date().toISOString(),
        message: 'Network error',
        userMessage: 'Connection failed',
        retryable: true
      };

      const operation = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('success');

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      const result = await retryManager.withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should respect retry-after header for rate limit errors', async () => {
      const delays: number[] = [];
      
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay) => {
        delays.push(delay as number);
        callback();
        return 1 as any;
      });

      const rateLimitError = {
        type: ErrorType.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'test-error',
        timestamp: new Date().toISOString(),
        message: 'Rate limit exceeded',
        userMessage: 'Too many requests',
        retryable: true,
        retryAfter: 5000 // 5 seconds
      };

      const operation = vi.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue('success');

      await retryManager.withRetry(operation, { baseDelay: 1000 });

      expect(delays[0]).toBe(5000); // Should use retryAfter instead of calculated delay
    });
  });

  describe('Retry Fallback', () => {
    it('should try operations in sequence until one succeeds', async () => {
      const operation1 = vi.fn().mockRejectedValue(new Error('Operation 1 failed'));
      const operation2 = vi.fn().mockRejectedValue(new Error('Operation 2 failed'));
      const operation3 = vi.fn().mockResolvedValue('success');

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      const result = await retryManager.withRetryFallback([operation1, operation2, operation3]);

      expect(result).toBe('success');
      expect(operation1).toHaveBeenCalled();
      expect(operation2).toHaveBeenCalled();
      expect(operation3).toHaveBeenCalled();
    });

    it('should throw last error if all operations fail', async () => {
      const operation1 = vi.fn().mockRejectedValue(new Error('Operation 1 failed'));
      const operation2 = vi.fn().mockRejectedValue(new Error('Operation 2 failed'));

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      await expect(retryManager.withRetryFallback([operation1, operation2])).rejects.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when none provided', () => {
      const config = retryManager.getConfig();
      
      expect(config).toEqual(DEFAULT_RETRY_CONFIG);
    });

    it('should merge custom configuration with defaults', () => {
      const customRetryManager = new RetryManager({ maxRetries: 5, baseDelay: 2000 });
      const config = customRetryManager.getConfig();
      
      expect(config.maxRetries).toBe(5);
      expect(config.baseDelay).toBe(2000);
      expect(config.backoffFactor).toBe(DEFAULT_RETRY_CONFIG.backoffFactor);
    });

    it('should allow updating configuration', () => {
      retryManager.updateConfig({ maxRetries: 10 });
      const config = retryManager.getConfig();
      
      expect(config.maxRetries).toBe(10);
    });
  });

  describe('Convenience Functions', () => {
    it('should work with withRetry function', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should work with withRetryFallback function', async () => {
      const operation1 = vi.fn().mockRejectedValue(new Error('Fail'));
      const operation2 = vi.fn().mockResolvedValue('success');

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      const result = await withRetryFallback([operation1, operation2]);

      expect(result).toBe('success');
    });

    it('should work with makeRetryable function', async () => {
      const originalFn = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const retryableFn = makeRetryable(originalFn);
      
      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      const result = await retryableFn();

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Context', () => {
    it('should include retry information in final error', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      // Mock setTimeout to resolve immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return 1 as any;
      });

      try {
        await retryManager.withRetry(operation, { maxRetries: 2 });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.context.retryAttempts).toBe(3); // Initial + 2 retries
        expect(error.context.attempts).toHaveLength(3);
        expect(error.context.totalDuration).toBeGreaterThanOrEqual(0);
      }
    });
  });
});