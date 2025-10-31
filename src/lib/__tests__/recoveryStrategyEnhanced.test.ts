/**
 * Enhanced tests for ErrorRecoveryManager
 * Covers recovery strategies, automatic recovery, and strategy management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorRecoveryManager, withAutoRecovery, useErrorRecovery } from '../errors/recoveryStrategy';
import { ErrorType, ErrorSeverity } from '../errors/types';

// Mock dependencies
vi.mock('../errors/recoveryTracker', () => ({
  recoveryTracker: {
    recordAttempt: vi.fn()
  }
}));

vi.mock('../errors/networkMonitor', () => ({
  networkMonitor: {
    waitForConnection: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../errors/enhancedRecoveryStrategies', () => ({
  enhancedRecoveryStrategies: {
    AuthenticationRecoveryStrategy: vi.fn().mockImplementation(() => ({
      canRecover: true,
      maxAttempts: 2,
      priority: 95,
      strategy: vi.fn().mockResolvedValue({ success: true, message: 'Auth recovered' })
    })),
    NetworkRecoveryStrategy: vi.fn().mockImplementation(() => ({
      canRecover: true,
      maxAttempts: 3,
      priority: 90,
      strategy: vi.fn().mockResolvedValue({ success: true, message: 'Network recovered' })
    })),
    RateLimitRecoveryStrategy: vi.fn().mockImplementation(() => ({
      canRecover: true,
      maxAttempts: 1,
      priority: 85,
      strategy: vi.fn().mockResolvedValue({ success: true, message: 'Rate limit recovered' })
    })),
    AnalysisServiceRecoveryStrategy: vi.fn().mockImplementation(() => ({
      canRecover: true,
      maxAttempts: 2,
      priority: 80,
      strategy: vi.fn().mockResolvedValue({ success: true, message: 'Analysis service recovered' })
    }))
  }
}));

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    onLine: true
  },
  writable: true
});

// Mock window for event listeners
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
});

// Mock auth service
Object.defineProperty(global, 'window', {
  value: {
    ...global.window,
    authService: {
      refreshToken: vi.fn().mockResolvedValue(true)
    }
  }
});

describe('ErrorRecoveryManager', () => {
  let recoveryManager: ErrorRecoveryManager;
  let mockError: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    recoveryManager = new ErrorRecoveryManager({
      maxConcurrentRecoveries: 3,
      globalCooldownMs: 1000,
      enableAutoRecovery: true,
      escalationThreshold: 2,
      trackingEnabled: true
    });

    mockError = {
      errorId: 'test-error-123',
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      message: 'Network error',
      timestamp: Date.now().toString(),
      retryAfter: 5000
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    recoveryManager.clearHistory();
  });

  describe('initialization', () => {
    it('should initialize with default strategies', () => {
      const networkStrategies = recoveryManager.getStrategies(ErrorType.NETWORK);
      const authStrategies = recoveryManager.getStrategies(ErrorType.AUTHENTICATION);
      
      expect(networkStrategies.length).toBeGreaterThan(0);
      expect(authStrategies.length).toBeGreaterThan(0);
    });

    it('should register custom strategies', () => {
      const customStrategy = {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        strategy: vi.fn().mockResolvedValue({ success: true })
      };

      recoveryManager.registerStrategy(ErrorType.VALIDATION, customStrategy);
      
      const strategies = recoveryManager.getStrategies(ErrorType.VALIDATION);
      expect(strategies).toContain(customStrategy);
    });

    it('should sort strategies by priority', () => {
      const lowPriorityStrategy = {
        canRecover: true,
        maxAttempts: 1,
        priority: 10,
        strategy: vi.fn()
      };

      const highPriorityStrategy = {
        canRecover: true,
        maxAttempts: 1,
        priority: 90,
        strategy: vi.fn()
      };

      recoveryManager.registerStrategy(ErrorType.VALIDATION, lowPriorityStrategy);
      recoveryManager.registerStrategy(ErrorType.VALIDATION, highPriorityStrategy);
      
      const strategies = recoveryManager.getStrategies(ErrorType.VALIDATION);
      expect(strategies[0]).toBe(highPriorityStrategy);
      expect(strategies[1]).toBe(lowPriorityStrategy);
    });
  });

  describe('recovery attempts', () => {
    it('should attempt recovery for network errors', async () => {
      const { networkMonitor } = await import('../errors/networkMonitor');
      
      const result = await recoveryManager.attemptRecovery(mockError);

      expect(result.success).toBe(true);
      expect(networkMonitor.waitForConnection).toHaveBeenCalledWith(30000);
    });

    it('should handle offline network recovery', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      
      const result = await recoveryManager.attemptRecovery(mockError);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Network still unavailable');
      expect(result.shouldRetry).toBe(true);
    });

    it('should attempt authentication recovery', async () => {
      const authError = {
        ...mockError,
        type: ErrorType.AUTHENTICATION
      };

      const result = await recoveryManager.attemptRecovery(authError);

      expect(result.success).toBe(true);
      expect(global.window.authService.refreshToken).toHaveBeenCalled();
    });

    it('should handle authentication recovery failure', async () => {
      global.window.authService.refreshToken.mockRejectedValue(new Error('Refresh failed'));
      
      const authError = {
        ...mockError,
        type: ErrorType.AUTHENTICATION
      };

      const result = await recoveryManager.attemptRecovery(authError);

      expect(result.success).toBe(false);
      expect(result.escalate).toBe(true);
    });

    it('should handle rate limit recovery', async () => {
      const rateLimitError = {
        ...mockError,
        type: ErrorType.RATE_LIMIT,
        retryAfter: 1000
      };

      const recoveryPromise = recoveryManager.attemptRecovery(rateLimitError);
      
      // Advance time to simulate waiting
      vi.advanceTimersByTime(1000);
      
      const result = await recoveryPromise;

      expect(result.success).toBe(true);
      expect(result.message).toContain('Waited 1000ms for rate limit reset');
    });

    it('should handle server error recovery with exponential backoff', async () => {
      const serverError = {
        ...mockError,
        type: ErrorType.SERVER,
        statusCode: 503
      };

      const recoveryPromise = recoveryManager.attemptRecovery(serverError);
      
      // Advance time for backoff delay
      vi.advanceTimersByTime(1000);
      
      const result = await recoveryPromise;

      expect(result.success).toBe(true);
      expect(result.message).toContain('Waited 1000ms before retry');
    });

    it('should skip server error recovery for 500 errors', async () => {
      const serverError = {
        ...mockError,
        type: ErrorType.SERVER,
        statusCode: 500
      };

      const result = await recoveryManager.attemptRecovery(serverError);

      expect(result.success).toBe(false);
      expect(result.message).toBe('No recovery strategies available for server');
    });

    it('should handle timeout error recovery', async () => {
      const timeoutError = {
        ...mockError,
        type: ErrorType.TIMEOUT
      };

      const recoveryPromise = recoveryManager.attemptRecovery(timeoutError);
      
      // Advance time for delay
      vi.advanceTimersByTime(2000);
      
      const result = await recoveryPromise;

      expect(result.success).toBe(true);
      expect(result.message).toContain('Retry after 2000ms delay');
    });

    it('should handle service unavailable recovery', async () => {
      const serviceError = {
        ...mockError,
        type: ErrorType.SERVICE_UNAVAILABLE
      };

      const recoveryPromise = recoveryManager.attemptRecovery(serviceError);
      
      // Advance time for longer delay
      vi.advanceTimersByTime(10000);
      
      const result = await recoveryPromise;

      expect(result.success).toBe(true);
      expect(result.message).toContain('Service recovery attempt after 10000ms');
    });
  });

  describe('recovery constraints', () => {
    it('should respect max concurrent recoveries limit', async () => {
      const promises = [];
      
      // Start multiple recoveries
      for (let i = 0; i < 5; i++) {
        const error = { ...mockError, errorId: `error-${i}` };
        promises.push(recoveryManager.attemptRecovery(error));
      }

      const results = await Promise.all(promises);
      
      // Some should be rejected due to concurrent limit
      const rejectedResults = results.filter(r => !r.success && r.message?.includes('Maximum concurrent recoveries'));
      expect(rejectedResults.length).toBeGreaterThan(0);
    });

    it('should respect global cooldown', async () => {
      await recoveryManager.attemptRecovery(mockError);
      
      // Immediate retry should be rejected
      const result = await recoveryManager.attemptRecovery(mockError);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Recovery cooldown active');
      expect(result.shouldRetry).toBe(true);
    });

    it('should respect strategy cooldown', async () => {
      const strategyWithCooldown = {
        canRecover: true,
        maxAttempts: 2,
        priority: 100,
        cooldownMs: 5000,
        strategy: vi.fn().mockResolvedValue({ success: true })
      };

      recoveryManager.registerStrategy(ErrorType.VALIDATION, strategyWithCooldown);
      
      const validationError = { ...mockError, type: ErrorType.VALIDATION };
      
      await recoveryManager.attemptRecovery(validationError);
      
      // Immediate retry should skip this strategy due to cooldown
      const result = await recoveryManager.attemptRecovery(validationError);
      
      expect(result.success).toBe(false);
    });

    it('should disable recovery when configured', async () => {
      const disabledManager = new ErrorRecoveryManager({
        enableAutoRecovery: false
      });

      const result = await disabledManager.attemptRecovery(mockError);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Auto-recovery disabled');
    });
  });

  describe('strategy execution', () => {
    it('should try multiple attempts for a strategy', async () => {
      const failingStrategy = {
        canRecover: true,
        maxAttempts: 3,
        priority: 100,
        strategy: vi.fn()
          .mockResolvedValueOnce({ success: false, shouldRetry: true })
          .mockResolvedValueOnce({ success: false, shouldRetry: true })
          .mockResolvedValueOnce({ success: true, message: 'Success on third try' })
      };

      recoveryManager.registerStrategy(ErrorType.VALIDATION, failingStrategy);
      
      const validationError = { ...mockError, type: ErrorType.VALIDATION };
      const result = await recoveryManager.attemptRecovery(validationError);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Success on third try');
      expect(failingStrategy.strategy).toHaveBeenCalledTimes(3);
    });

    it('should stop retrying when strategy says not to retry', async () => {
      const noRetryStrategy = {
        canRecover: true,
        maxAttempts: 3,
        priority: 100,
        strategy: vi.fn().mockResolvedValue({ success: false, shouldRetry: false })
      };

      recoveryManager.registerStrategy(ErrorType.VALIDATION, noRetryStrategy);
      
      const validationError = { ...mockError, type: ErrorType.VALIDATION };
      const result = await recoveryManager.attemptRecovery(validationError);

      expect(result.success).toBe(false);
      expect(noRetryStrategy.strategy).toHaveBeenCalledTimes(1);
    });

    it('should handle strategy errors gracefully', async () => {
      const errorStrategy = {
        canRecover: true,
        maxAttempts: 2,
        priority: 100,
        strategy: vi.fn().mockRejectedValue(new Error('Strategy error'))
      };

      recoveryManager.registerStrategy(ErrorType.VALIDATION, errorStrategy);
      
      const validationError = { ...mockError, type: ErrorType.VALIDATION };
      const result = await recoveryManager.attemptRecovery(validationError);

      expect(result.success).toBe(false);
      expect(result.escalate).toBe(true);
    });

    it('should wait for next attempt delay', async () => {
      const delayStrategy = {
        canRecover: true,
        maxAttempts: 2,
        priority: 100,
        strategy: vi.fn()
          .mockResolvedValueOnce({ success: false, shouldRetry: true, nextAttemptDelay: 1000 })
          .mockResolvedValueOnce({ success: true })
      };

      recoveryManager.registerStrategy(ErrorType.VALIDATION, delayStrategy);
      
      const validationError = { ...mockError, type: ErrorType.VALIDATION };
      const recoveryPromise = recoveryManager.attemptRecovery(validationError);
      
      // Advance time for delay
      vi.advanceTimersByTime(1000);
      
      const result = await recoveryPromise;

      expect(result.success).toBe(true);
      expect(delayStrategy.strategy).toHaveBeenCalledTimes(2);
    });

    it('should test operation after successful recovery', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Operation failed'))
        .mockResolvedValueOnce('Operation succeeded');

      const result = await recoveryManager.attemptRecovery(mockError, {}, mockOperation);

      expect(result.success).toBe(true);
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should continue to next strategy if operation still fails', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('Operation always fails'));

      const result = await recoveryManager.attemptRecovery(mockError, {}, mockOperation);

      expect(result.success).toBe(false);
      expect(result.escalate).toBe(true);
    });
  });

  describe('recovery tracking', () => {
    it('should record recovery attempts when tracking is enabled', async () => {
      const { recoveryTracker } = await import('../errors/recoveryTracker');
      
      await recoveryManager.attemptRecovery(mockError);

      expect(recoveryTracker.recordAttempt).toHaveBeenCalledWith(
        mockError,
        'auto_recovery',
        true,
        false,
        expect.any(Number)
      );
    });

    it('should not record attempts when tracking is disabled', async () => {
      const noTrackingManager = new ErrorRecoveryManager({
        trackingEnabled: false
      });
      
      const { recoveryTracker } = await import('../errors/recoveryTracker');
      
      await noTrackingManager.attemptRecovery(mockError);

      expect(recoveryTracker.recordAttempt).not.toHaveBeenCalled();
    });

    it('should maintain recovery statistics', async () => {
      // Perform some recoveries
      await recoveryManager.attemptRecovery(mockError);
      await recoveryManager.attemptRecovery({ ...mockError, errorId: 'error-2' });

      const stats = recoveryManager.getRecoveryStats();

      expect(stats.totalAttempts).toBeGreaterThan(0);
      expect(stats.successfulAttempts).toBeGreaterThan(0);
      expect(stats.successRate).toBeGreaterThan(0);
      expect(stats.averageRecoveryTime).toBeGreaterThanOrEqual(0);
    });

    it('should calculate success rate by error type', async () => {
      const authError = { ...mockError, type: ErrorType.AUTHENTICATION };
      
      await recoveryManager.attemptRecovery(mockError); // Network error
      await recoveryManager.attemptRecovery(authError); // Auth error

      const networkSuccessRate = recoveryManager.getSuccessRate(ErrorType.NETWORK);
      const authSuccessRate = recoveryManager.getSuccessRate(ErrorType.AUTHENTICATION);

      expect(networkSuccessRate).toBeGreaterThanOrEqual(0);
      expect(authSuccessRate).toBeGreaterThanOrEqual(0);
    });

    it('should clear recovery history', () => {
      recoveryManager.attemptRecovery(mockError);
      
      expect(recoveryManager.getRecoveryStats().totalAttempts).toBeGreaterThan(0);
      
      recoveryManager.clearHistory();
      
      expect(recoveryManager.getRecoveryStats().totalAttempts).toBe(0);
    });
  });

  describe('withAutoRecovery utility', () => {
    it('should wrap operations with automatic recovery', async () => {
      const { ApiErrorClassifier } = await import('../errors/classifier');
      
      // Mock classification
      vi.doMock('../errors/classifier', () => ({
        ApiErrorClassifier: {
          classify: vi.fn(() => ({
            error: mockError
          }))
        }
      }));

      const failingOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Operation failed'))
        .mockResolvedValueOnce('Operation succeeded');

      const result = await withAutoRecovery(failingOperation);

      expect(result).toBe('Operation succeeded');
      expect(failingOperation).toHaveBeenCalledTimes(2);
    });

    it('should throw original error if recovery fails', async () => {
      const { ApiErrorClassifier } = await import('../errors/classifier');
      
      // Mock classification for unrecoverable error
      vi.doMock('../errors/classifier', () => ({
        ApiErrorClassifier: {
          classify: vi.fn(() => ({
            error: { ...mockError, type: ErrorType.SYSTEM }
          }))
        }
      }));

      const failingOperation = vi.fn().mockRejectedValue(new Error('Unrecoverable error'));

      await expect(withAutoRecovery(failingOperation)).rejects.toThrow('Unrecoverable error');
    });
  });

  describe('useErrorRecovery hook', () => {
    it('should provide recovery functions', () => {
      const hook = useErrorRecovery();

      expect(hook.attemptRecovery).toBeDefined();
      expect(hook.getStrategies).toBeDefined();
      expect(hook.getSuccessRate).toBeDefined();
      expect(hook.getRecoveryStats).toBeDefined();
      expect(hook.clearHistory).toBeDefined();
    });

    it('should call recovery manager methods', async () => {
      const hook = useErrorRecovery();
      const spy = vi.spyOn(recoveryManager, 'attemptRecovery');

      await hook.attemptRecovery(mockError);

      expect(spy).toHaveBeenCalledWith(mockError);
    });
  });

  describe('enhanced strategies integration', () => {
    it('should load enhanced strategies on initialization', async () => {
      // Enhanced strategies should be automatically loaded
      const authStrategies = recoveryManager.getStrategies(ErrorType.AUTHENTICATION);
      const networkStrategies = recoveryManager.getStrategies(ErrorType.NETWORK);
      
      expect(authStrategies.length).toBeGreaterThan(1); // Default + enhanced
      expect(networkStrategies.length).toBeGreaterThan(1); // Default + enhanced
    });

    it('should handle enhanced strategy loading errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Create manager that will fail to load enhanced strategies
      vi.doMock('../errors/enhancedRecoveryStrategies', () => {
        throw new Error('Enhanced strategies not available');
      });

      new ErrorRecoveryManager();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize enhanced recovery strategies:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('strategy conditions', () => {
    it('should respect strategy conditions', async () => {
      const conditionalStrategy = {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        conditions: vi.fn(() => false), // Always false
        strategy: vi.fn().mockResolvedValue({ success: true })
      };

      recoveryManager.registerStrategy(ErrorType.VALIDATION, conditionalStrategy);
      
      const validationError = { ...mockError, type: ErrorType.VALIDATION };
      const result = await recoveryManager.attemptRecovery(validationError);

      expect(conditionalStrategy.conditions).toHaveBeenCalledWith(validationError, {});
      expect(conditionalStrategy.strategy).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it('should execute strategy when conditions are met', async () => {
      const conditionalStrategy = {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        conditions: vi.fn(() => true), // Always true
        strategy: vi.fn().mockResolvedValue({ success: true })
      };

      recoveryManager.registerStrategy(ErrorType.VALIDATION, conditionalStrategy);
      
      const validationError = { ...mockError, type: ErrorType.VALIDATION };
      const result = await recoveryManager.attemptRecovery(validationError);

      expect(conditionalStrategy.conditions).toHaveBeenCalledWith(validationError, {});
      expect(conditionalStrategy.strategy).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});