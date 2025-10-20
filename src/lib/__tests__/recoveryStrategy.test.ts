/**
 * Tests for ErrorRecoveryManager and recovery strategies
 * Covers error recovery, retry mechanisms, and strategy management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { errorRecoveryManager, ErrorRecoveryManager, withAutoRecovery, useErrorRecovery } from '../errors/recoveryStrategy';
import { ErrorType, ErrorSeverity } from '../errors/types';

// Mock dependencies
vi.mock('../errors/recoveryTracker', () => ({
  recoveryTracker: {
    recordAttempt: vi.fn()
  }
}));

vi.mock('../errors/networkMonitor', () => ({
  networkMonitor: {
    waitForConnection: vi.fn()
  }
}));

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
});

// Mock window for auth service
Object.defineProperty(window, 'authService', {
  writable: true,
  value: {
    refreshToken: vi.fn()
  }
});

describe('ErrorRecoveryManager', () => {
  let recoveryManager: ErrorRecoveryManager;

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
    recoveryManager.clearHistory();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('strategy registration', () => {
    it('should register recovery strategies', () => {
      const mockStrategy = {
        canRecover: true,
        maxAttempts: 3,
        priority: 100,
        strategy: vi.fn().mockResolvedValue({ success: true })
      };

      recoveryManager.registerStrategy(ErrorType.NETWORK, mockStrategy);

      const strategies = recoveryManager.getStrategies(ErrorType.NETWORK);
      expect(strategies).toContain(mockStrategy);
    });

    it('should sort strategies by priority', () => {
      const lowPriorityStrategy = {
        canRecover: true,
        maxAttempts: 1,
        priority: 50,
        strategy: vi.fn()
      };

      const highPriorityStrategy = {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        strategy: vi.fn()
      };

      recoveryManager.registerStrategy(ErrorType.NETWORK, lowPriorityStrategy);
      recoveryManager.registerStrategy(ErrorType.NETWORK, highPriorityStrategy);

      const strategies = recoveryManager.getStrategies(ErrorType.NETWORK);
      expect(strategies[0]).toBe(highPriorityStrategy);
      expect(strategies[1]).toBe(lowPriorityStrategy);
    });
  });

  describe('recovery attempts', () => {
    it('should attempt recovery with registered strategies', async () => {
      const mockStrategy = vi.fn().mockResolvedValue({ success: true, message: 'Recovery successful' });
      
      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 3,
        priority: 100,
        strategy: mockStrategy
      });

      const mockError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'error-123',
        timestamp: new Date().toISOString(),
        message: 'Network error',
        userMessage: 'Network connection failed'
      };

      const result = await recoveryManager.attemptRecovery(mockError);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Recovery successful');
      expect(mockStrategy).toHaveBeenCalledWith(mockError, {}, 1);
    });

    it('should try multiple strategies in priority order', async () => {
      const failingStrategy = vi.fn().mockResolvedValue({ success: false });
      const successfulStrategy = vi.fn().mockResolvedValue({ success: true });

      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        strategy: failingStrategy
      });

      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 1,
        priority: 90,
        strategy: successfulStrategy
      });

      const mockError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'error-123',
        timestamp: new Date().toISOString(),
        message: 'Network error',
        userMessage: 'Network connection failed'
      };

      const result = await recoveryManager.attemptRecovery(mockError);

      expect(result.success).toBe(true);
      expect(failingStrategy).toHaveBeenCalled();
      expect(successfulStrategy).toHaveBeenCalled();
    });

    it('should retry failed strategies up to maxAttempts', async () => {
      const mockStrategy = vi.fn()
        .mockResolvedValueOnce({ success: false, shouldRetry: true })
        .mockResolvedValueOnce({ success: false, shouldRetry: true })
        .mockResolvedValueOnce({ success: true });

      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 3,
        priority: 100,
        strategy: mockStrategy
      });

      const mockError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'error-123',
        timestamp: new Date().toISOString(),
        message: 'Network error',
        userMessage: 'Network connection failed'
      };

      const result = await recoveryManager.attemptRecovery(mockError);

      expect(result.success).toBe(true);
      expect(mockStrategy).toHaveBeenCalledTimes(3);
    });

    it('should respect strategy conditions', async () => {
      const mockStrategy = vi.fn().mockResolvedValue({ success: true });
      const conditionFn = vi.fn().mockReturnValue(false);

      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        strategy: mockStrategy,
        conditions: conditionFn
      });

      const mockError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'error-123',
        timestamp: new Date().toISOString(),
        message: 'Network error',
        userMessage: 'Network connection failed'
      };

      const result = await recoveryManager.attemptRecovery(mockError);

      expect(result.success).toBe(false);
      expect(conditionFn).toHaveBeenCalledWith(mockError, {});
      expect(mockStrategy).not.toHaveBeenCalled();
    });

    it('should handle strategy cooldowns', async () => {
      const mockStrategy = vi.fn().mockResolvedValue({ success: true });

      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        cooldownMs: 5000,
        strategy: mockStrategy
      });

      const mockError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'error-123',
        timestamp: new Date().toISOString(),
        message: 'Network error',
        userMessage: 'Network connection failed'
      };

      // First attempt should succeed
      const result1 = await recoveryManager.attemptRecovery(mockError);
      expect(result1.success).toBe(true);
      expect(mockStrategy).toHaveBeenCalledTimes(1);

      // Second attempt should be blocked by cooldown
      const result2 = await recoveryManager.attemptRecovery(mockError);
      expect(result2.success).toBe(false);
      expect(mockStrategy).toHaveBeenCalledTimes(1); // Not called again

      // After cooldown, should work again
      vi.advanceTimersByTime(5000);
      const result3 = await recoveryManager.attemptRecovery(mockError);
      expect(result3.success).toBe(true);
      expect(mockStrategy).toHaveBeenCalledTimes(2);
    });

    it('should enforce concurrent recovery limits', async () => {
      const slowStrategy = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000))
      );

      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        strategy: slowStrategy
      });

      const mockError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'error-123',
        timestamp: new Date().toISOString(),
        message: 'Network error',
        userMessage: 'Network connection failed'
      };

      // Start multiple concurrent recoveries
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(recoveryManager.attemptRecovery({
          ...mockError,
          errorId: `error-${i}`
        }));
      }

      const results = await Promise.all(promises);

      // Some should be rejected due to concurrent limit
      const rejectedCount = results.filter(r => 
        !r.success && r.message?.includes('Maximum concurrent recoveries')
      ).length;

      expect(rejectedCount).toBeGreaterThan(0);
    });

    it('should enforce global cooldown', async () => {
      const mockStrategy = vi.fn().mockResolvedValue({ success: true });

      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        strategy: mockStrategy
      });

      const mockError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'error-123',
        timestamp: new Date().toISOString(),
        message: 'Network error',
        userMessage: 'Network connection failed'
      };

      // First attempt
      await recoveryManager.attemptRecovery(mockError);

      // Second attempt should be blocked by global cooldown
      const result = await recoveryManager.attemptRecovery(mockError);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Recovery cooldown active');
    });

    it('should handle disabled auto-recovery', async () => {
      const disabledManager = new ErrorRecoveryManager({
        enableAutoRecovery: false
      });

      const mockError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'error-123',
        timestamp: new Date().toISOString(),
        message: 'Network error',
        userMessage: 'Network connection failed'
      };

      const result = await disabledManager.attemptRecovery(mockError);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Auto-recovery disabled');
    });
  });

  describe('default strategies', () => {
    it('should have network error recovery strategy', () => {
      const strategies = recoveryManager.getStrategies(ErrorType.NETWORK);
      expect(strategies.length).toBeGreaterThan(0);
    });

    it('should handle network connectivity recovery', async () => {
      // Mock offline state
      Object.defineProperty(navigator, 'onLine', { value: false });

      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.waitForConnection).mockResolvedValue();

      const mockError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'network-error-123',
        timestamp: new Date().toISOString(),
        message: 'Network connection failed',
        userMessage: 'Unable to connect to server'
      };

      // Simulate network coming back online
      setTimeout(() => {
        Object.defineProperty(navigator, 'onLine', { value: true });
      }, 100);

      const result = await recoveryManager.attemptRecovery(mockError);

      expect(networkMonitor.waitForConnection).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle authentication error recovery', async () => {
      const mockAuthService = {
        refreshToken: vi.fn().mockResolvedValue()
      };
      (window as any).authService = mockAuthService;

      const mockError = {
        type: ErrorType.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        errorId: 'auth-error-123',
        timestamp: new Date().toISOString(),
        message: 'Authentication failed',
        userMessage: 'Please sign in again'
      };

      const result = await recoveryManager.attemptRecovery(mockError);

      expect(mockAuthService.refreshToken).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle rate limit recovery', async () => {
      const mockError = {
        type: ErrorType.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'rate-limit-error-123',
        timestamp: new Date().toISOString(),
        message: 'Rate limit exceeded',
        userMessage: 'Too many requests',
        retryAfter: 1000
      };

      const startTime = Date.now();
      const result = await recoveryManager.attemptRecovery(mockError);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
    });

    it('should handle server error recovery with exponential backoff', async () => {
      const mockError = {
        type: ErrorType.SERVER,
        severity: ErrorSeverity.HIGH,
        errorId: 'server-error-123',
        timestamp: new Date().toISOString(),
        message: 'Internal server error',
        userMessage: 'Server error occurred',
        statusCode: 503
      };

      const startTime = Date.now();
      const result = await recoveryManager.attemptRecovery(mockError);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThan(0); // Should have some delay
    });
  });

  describe('recovery statistics', () => {
    it('should track recovery success rates', async () => {
      const successfulStrategy = vi.fn().mockResolvedValue({ success: true });
      const failingStrategy = vi.fn().mockResolvedValue({ success: false });

      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        strategy: successfulStrategy
      });

      recoveryManager.registerStrategy(ErrorType.VALIDATION, {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        strategy: failingStrategy
      });

      // Perform recoveries
      await recoveryManager.attemptRecovery({
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'network-1',
        timestamp: new Date().toISOString(),
        message: 'Network error',
        userMessage: 'Network failed'
      });

      await recoveryManager.attemptRecovery({
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'validation-1',
        timestamp: new Date().toISOString(),
        message: 'Validation error',
        userMessage: 'Validation failed'
      });

      const stats = recoveryManager.getRecoveryStats();

      expect(stats.totalAttempts).toBe(2);
      expect(stats.successfulAttempts).toBe(1);
      expect(stats.successRate).toBe(50);
      expect(stats.byErrorType[ErrorType.NETWORK].rate).toBe(100);
      expect(stats.byErrorType[ErrorType.VALIDATION].rate).toBe(0);
    });

    it('should calculate average recovery time', async () => {
      const delayedStrategy = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true };
      });

      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        strategy: delayedStrategy
      });

      await recoveryManager.attemptRecovery({
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'timed-error',
        timestamp: new Date().toISOString(),
        message: 'Timed error',
        userMessage: 'Timed error'
      });

      const stats = recoveryManager.getRecoveryStats();
      expect(stats.averageRecoveryTime).toBeGreaterThan(0);
    });

    it('should provide success rate by error type', () => {
      const networkRate = recoveryManager.getSuccessRate(ErrorType.NETWORK);
      expect(typeof networkRate).toBe('number');
      expect(networkRate).toBeGreaterThanOrEqual(0);
      expect(networkRate).toBeLessThanOrEqual(100);
    });

    it('should clear recovery history', async () => {
      await recoveryManager.attemptRecovery({
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'clear-test',
        timestamp: new Date().toISOString(),
        message: 'Clear test',
        userMessage: 'Clear test'
      });

      let stats = recoveryManager.getRecoveryStats();
      expect(stats.totalAttempts).toBeGreaterThan(0);

      recoveryManager.clearHistory();

      stats = recoveryManager.getRecoveryStats();
      expect(stats.totalAttempts).toBe(0);
    });
  });

  describe('recovery tracking', () => {
    it('should record recovery attempts when tracking is enabled', async () => {
      const { recoveryTracker } = await import('../errors/recoveryTracker');

      const mockStrategy = vi.fn().mockResolvedValue({ success: true });
      recoveryManager.registerStrategy(ErrorType.NETWORK, {
        canRecover: true,
        maxAttempts: 1,
        priority: 100,
        strategy: mockStrategy
      });

      const mockError = {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'tracked-error',
        timestamp: new Date().toISOString(),
        message: 'Tracked error',
        userMessage: 'Tracked error'
      };

      await recoveryManager.attemptRecovery(mockError);

      expect(recoveryTracker.recordAttempt).toHaveBeenCalledWith(
        mockError,
        'auto_recovery',
        true,
        false,
        expect.any(Number)
      );
    });
  });
});

describe('withAutoRecovery utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute operation successfully without recovery', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await withAutoRecovery(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should attempt recovery on operation failure', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success after recovery');

    // Mock successful recovery
    const mockStrategy = vi.fn().mockResolvedValue({ success: true });
    errorRecoveryManager.registerStrategy(ErrorType.NETWORK, {
      canRecover: true,
      maxAttempts: 1,
      priority: 100,
      strategy: mockStrategy
    });

    const result = await withAutoRecovery(operation, { component: 'TestComponent' });

    expect(result).toBe('success after recovery');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should throw original error if recovery fails', async () => {
    const error = new Error('Unrecoverable error');
    const operation = vi.fn().mockRejectedValue(error);

    // Mock failed recovery
    const mockStrategy = vi.fn().mockResolvedValue({ success: false });
    errorRecoveryManager.registerStrategy(ErrorType.VALIDATION, {
      canRecover: true,
      maxAttempts: 1,
      priority: 100,
      strategy: mockStrategy
    });

    await expect(withAutoRecovery(operation)).rejects.toThrow('Unrecoverable error');
  });
});

describe('useErrorRecovery hook', () => {
  it('should provide recovery functions', () => {
    const hook = useErrorRecovery();

    expect(hook).toHaveProperty('attemptRecovery');
    expect(hook).toHaveProperty('getStrategies');
    expect(hook).toHaveProperty('getSuccessRate');
    expect(hook).toHaveProperty('getRecoveryStats');
    expect(hook).toHaveProperty('clearHistory');

    expect(typeof hook.attemptRecovery).toBe('function');
    expect(typeof hook.getStrategies).toBe('function');
    expect(typeof hook.getSuccessRate).toBe('function');
    expect(typeof hook.getRecoveryStats).toBe('function');
    expect(typeof hook.clearHistory).toBe('function');
  });

  it('should call manager methods correctly', async () => {
    const hook = useErrorRecovery();

    const mockError = {
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      errorId: 'hook-test',
      timestamp: new Date().toISOString(),
      message: 'Hook test error',
      userMessage: 'Hook test error'
    };

    // Test attemptRecovery
    await hook.attemptRecovery(mockError);

    // Test other methods
    const strategies = hook.getStrategies(ErrorType.NETWORK);
    expect(Array.isArray(strategies)).toBe(true);

    const successRate = hook.getSuccessRate(ErrorType.NETWORK);
    expect(typeof successRate).toBe('number');

    const stats = hook.getRecoveryStats();
    expect(typeof stats).toBe('object');

    // Test clearHistory
    hook.clearHistory();
  });
});