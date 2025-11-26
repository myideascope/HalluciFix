/**
 * Tests for ErrorManager
 * Covers error handling, classification, routing, and analytics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { errorManager, ErrorManager } from '../../lib/errors/errorManager';
import { ErrorType, ErrorSeverity } from '../../lib/errors/types';

// Mock dependencies
vi.mock('../errors/classifier', () => ({
  ApiErrorClassifier: {
    classifyWithRouting: vi.fn((error, context) => ({
      error: {
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'error-123',
        timestamp: new Date().toISOString(),
        message: error.message || 'Test error',
        userMessage: 'A validation error occurred',
        retryable: false,
        context: context
      },
      routing: {
        handlers: ['validation'],
        priority: 'medium'
      }
    }))
  }
}));

vi.mock('../errors/errorAnalytics', () => ({
  errorAnalytics: {
    updateErrorLog: vi.fn(),
    checkAlerts: vi.fn(() => [])
  }
}));

vi.mock('../errors/externalErrorTracking', () => ({
  externalErrorTracking: {
    reportError: vi.fn(),
    reportErrorBatch: vi.fn()
  }
}));

vi.mock('../errors/errorMonitor', () => ({
  errorMonitor: {
    updateMetrics: vi.fn()
  }
}));

vi.mock('../errors/errorRouter', () => ({
  errorRouter: {
    routeError: vi.fn(() => Promise.resolve([
      { handled: true, escalate: false, message: 'Handled successfully' }
    ]))
  }
}));

vi.mock('../errors/structuredLogger', () => ({
  structuredLogger: {
    logError: vi.fn(),
    logInfo: vi.fn(),
    logWarning: vi.fn(),
    logDebug: vi.fn()
  }
}));

vi.mock('../errors/errorGrouping', () => ({
  errorGrouping: {
    processError: vi.fn(() => 'group-123')
  }
}));

vi.mock('../errors/errorAlerting', () => ({
  errorAlerting: {
    processError: vi.fn()
  }
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock document for visibility change events
Object.defineProperty(document, 'visibilityState', {
  value: 'visible',
  writable: true
});

describe('ErrorManager', () => {
  let testErrorManager: ErrorManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Create a fresh instance for testing
    testErrorManager = ErrorManager.getInstance({
      batchSize: 3,
      flushInterval: 1000,
      enableConsoleLogging: true,
      enableLocalStorage: true
    });
    
    testErrorManager.clearErrorLog();
  });

  afterEach(() => {
    vi.useRealTimers();
    testErrorManager.clearErrorLog();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ErrorManager.getInstance();
      const instance2 = ErrorManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('error handling', () => {
    it('should handle and classify errors', () => {
      const error = new Error('Test validation error');
      const context = { component: 'TestComponent', userId: 'user-123' };

      const result = testErrorManager.handleError(error, context);

      expect(result).toMatchObject({
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        errorId: 'error-123',
        message: 'Test validation error',
        userMessage: 'A validation error occurred'
      });

      const { ApiErrorClassifier } = require('../errors/classifier');
      expect(ApiErrorClassifier.classifyWithRouting).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          component: 'TestComponent',
          userId: 'user-123',
          timestamp: expect.any(String),
          url: expect.any(String)
        })
      );
    });

    it('should enhance error context with additional information', () => {
      const error = new Error('Test error');
      const context = { component: 'TestComponent' };

      testErrorManager.handleError(error, context);

      const { ApiErrorClassifier } = require('../errors/classifier');
      const enhancedContext = ApiErrorClassifier.classifyWithRouting.mock.calls[0][1];

      expect(enhancedContext).toMatchObject({
        component: 'TestComponent',
        timestamp: expect.any(String),
        url: expect.any(String),
        userAgent: expect.any(String)
      });
    });

    it('should log errors using structured logger', () => {
      const error = new Error('Test error');
      const context = { component: 'TestComponent' };

      testErrorManager.handleError(error, context);

      const { structuredLogger } = require('../errors/structuredLogger');
      expect(structuredLogger.logError).toHaveBeenCalled();
    });

    it('should process error grouping and alerting', () => {
      const error = new Error('Test error');
      const context = { component: 'TestComponent' };

      testErrorManager.handleError(error, context);

      const { errorGrouping } = require('../errors/errorGrouping');
      const { errorAlerting } = require('../errors/errorAlerting');

      expect(errorGrouping.processError).toHaveBeenCalled();
      expect(errorAlerting.processError).toHaveBeenCalled();
    });

    it('should route errors to appropriate handlers', async () => {
      const error = new Error('Test error');
      const context = { component: 'TestComponent' };

      testErrorManager.handleError(error, context);

      // Wait for async routing
      await vi.runAllTimersAsync();

      const { errorRouter } = require('../errors/errorRouter');
      expect(errorRouter.routeError).toHaveBeenCalled();
    });

    it('should handle critical errors immediately', async () => {
      const { ApiErrorClassifier } = require('../errors/classifier');
      ApiErrorClassifier.classifyWithRouting.mockReturnValue({
        error: {
          type: ErrorType.SYSTEM,
          severity: ErrorSeverity.CRITICAL,
          errorId: 'critical-error-123',
          timestamp: new Date().toISOString(),
          message: 'Critical system error',
          userMessage: 'A critical error occurred'
        }
      });

      const error = new Error('Critical system error');
      testErrorManager.handleError(error);

      const { externalErrorTracking } = require('../errors/externalErrorTracking');
      expect(externalErrorTracking.reportError).toHaveBeenCalled();
    });

    it('should notify error listeners', () => {
      const listener = vi.fn();
      testErrorManager.addErrorListener(listener);

      const error = new Error('Test error');
      testErrorManager.handleError(error);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test error'
        }),
        expect.any(Object)
      );

      testErrorManager.removeErrorListener(listener);
    });

    it('should log to console in development mode', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new Error('Test error');
      testErrorManager.handleError(error);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ErrorManager]'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error statistics', () => {
    it('should track error statistics', () => {
      const error1 = new Error('Validation error');
      const error2 = new Error('Network error');

      // Mock different error types
      const { ApiErrorClassifier } = require('../errors/classifier');
      ApiErrorClassifier.classifyWithRouting
        .mockReturnValueOnce({
          error: {
            type: ErrorType.VALIDATION,
            severity: ErrorSeverity.MEDIUM,
            errorId: 'error-1',
            timestamp: new Date().toISOString(),
            message: 'Validation error',
            userMessage: 'Validation failed'
          }
        })
        .mockReturnValueOnce({
          error: {
            type: ErrorType.NETWORK,
            severity: ErrorSeverity.HIGH,
            errorId: 'error-2',
            timestamp: new Date().toISOString(),
            message: 'Network error',
            userMessage: 'Network failed'
          }
        });

      testErrorManager.handleError(error1);
      testErrorManager.handleError(error2);

      const stats = testErrorManager.getStats();

      expect(stats.totalErrors).toBe(2);
      expect(stats.errorsByType[ErrorType.VALIDATION]).toBe(1);
      expect(stats.errorsByType[ErrorType.NETWORK]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(stats.lastErrorTime).toBeDefined();
    });

    it('should calculate error rate', () => {
      // Add some errors
      for (let i = 0; i < 5; i++) {
        testErrorManager.handleError(new Error(`Error ${i}`));
      }

      const stats = testErrorManager.getStats();
      expect(stats.errorRate).toBeGreaterThan(0);
    });

    it('should provide recent errors', () => {
      const error1 = new Error('Recent error 1');
      const error2 = new Error('Recent error 2');

      testErrorManager.handleError(error1);
      testErrorManager.handleError(error2);

      const recentErrors = testErrorManager.getRecentErrors(5);
      expect(recentErrors).toHaveLength(2);
      expect(recentErrors[0].message).toBe('Recent error 2'); // Most recent first
      expect(recentErrors[1].message).toBe('Recent error 1');
    });
  });

  describe('error batching and flushing', () => {
    it('should batch errors and flush when batch size is reached', async () => {
      const { externalErrorTracking } = require('../errors/externalErrorTracking');

      // Add errors up to batch size
      testErrorManager.handleError(new Error('Error 1'));
      testErrorManager.handleError(new Error('Error 2'));
      testErrorManager.handleError(new Error('Error 3')); // Should trigger flush

      await vi.runAllTimersAsync();

      expect(externalErrorTracking.reportErrorBatch).toHaveBeenCalled();
    });

    it('should flush errors periodically', async () => {
      const { externalErrorTracking } = require('../errors/externalErrorTracking');

      testErrorManager.handleError(new Error('Periodic error'));

      // Advance time to trigger periodic flush
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(externalErrorTracking.reportErrorBatch).toHaveBeenCalled();
    });

    it('should flush errors manually', async () => {
      const { externalErrorTracking } = require('../errors/externalErrorTracking');

      testErrorManager.handleError(new Error('Manual flush error'));

      await testErrorManager.flushErrors();

      expect(externalErrorTracking.reportErrorBatch).toHaveBeenCalled();
    });

    it('should handle flush errors gracefully', async () => {
      const { externalErrorTracking } = require('../errors/externalErrorTracking');
      externalErrorTracking.reportErrorBatch.mockRejectedValue(new Error('Flush failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      testErrorManager.handleError(new Error('Test error'));
      await testErrorManager.flushErrors();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to process error batch:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('localStorage persistence', () => {
    it('should save error log to localStorage', async () => {
      testErrorManager.handleError(new Error('Persistent error'));

      // Trigger flush to save to localStorage
      await testErrorManager.flushErrors();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String)
      );
    });

    it('should load error log from localStorage on initialization', () => {
      const mockErrorLog = JSON.stringify([
        {
          errorId: 'stored-error-1',
          timestamp: new Date().toISOString(),
          type: ErrorType.VALIDATION,
          severity: ErrorSeverity.MEDIUM,
          message: 'Stored error',
          userMessage: 'Stored error message'
        }
      ]);

      mockLocalStorage.getItem.mockReturnValue(mockErrorLog);

      // Create new instance to trigger loading
      const newErrorManager = ErrorManager.getInstance();
      
      expect(mockLocalStorage.getItem).toHaveBeenCalled();
    });

    it('should handle localStorage errors gracefully', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      testErrorManager.handleError(new Error('Storage error'));
      await testErrorManager.flushErrors();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save to localStorage:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error analytics integration', () => {
    it('should update analytics with error log', async () => {
      const { errorAnalytics } = require('../errors/errorAnalytics');

      testErrorManager.handleError(new Error('Analytics error'));
      await testErrorManager.flushErrors();

      expect(errorAnalytics.updateErrorLog).toHaveBeenCalled();
    });

    it('should check and handle triggered alerts', async () => {
      const { errorAnalytics } = require('../errors/errorAnalytics');
      const mockAlert = {
        alertName: 'High Error Rate',
        condition: { type: 'error_rate_threshold' },
        actions: [
          { type: 'console', message: 'High error rate detected' }
        ]
      };

      errorAnalytics.checkAlerts.mockReturnValue([mockAlert]);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      testErrorManager.handleError(new Error('Alert trigger error'));
      await testErrorManager.flushErrors();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Alert] High Error Rate')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('error monitoring integration', () => {
    it('should update monitoring metrics', async () => {
      const { errorMonitor } = require('../errors/errorMonitor');

      testErrorManager.handleError(new Error('Monitoring error'));
      await testErrorManager.flushErrors();

      expect(errorMonitor.updateMetrics).toHaveBeenCalled();
    });
  });

  describe('error log management', () => {
    it('should clear error log', () => {
      testErrorManager.handleError(new Error('Clear test error'));

      let stats = testErrorManager.getStats();
      expect(stats.totalErrors).toBe(1);

      testErrorManager.clearErrorLog();

      stats = testErrorManager.getStats();
      expect(stats.totalErrors).toBe(0);
      expect(mockLocalStorage.setItem).toHaveBeenCalled(); // Should save empty log
    });

    it('should limit error log size', async () => {
      // Add many errors to exceed limit
      for (let i = 0; i < 200; i++) {
        testErrorManager.handleError(new Error(`Error ${i}`));
      }

      await testErrorManager.flushErrors();

      const recentErrors = testErrorManager.getRecentErrors(200);
      expect(recentErrors.length).toBeLessThanOrEqual(100); // Should be trimmed
    });
  });

  describe('error escalation', () => {
    it('should escalate errors when handlers request it', async () => {
      const { errorRouter } = require('../errors/errorRouter');
      const { structuredLogger } = require('../errors/structuredLogger');

      errorRouter.routeError.mockResolvedValue([
        { handled: false, escalate: true, message: 'Handler failed' }
      ]);

      testErrorManager.handleError(new Error('Escalation test'));

      await vi.runAllTimersAsync();

      expect(structuredLogger.logWarning).toHaveBeenCalledWith(
        'Error escalation triggered',
        expect.any(Object),
        ['escalation']
      );
    });
  });

  describe('service access', () => {
    it('should provide access to analytics service', () => {
      const analytics = testErrorManager.getAnalytics();
      expect(analytics).toBeDefined();
    });

    it('should provide access to external tracking service', () => {
      const externalTracking = testErrorManager.getExternalTracking();
      expect(externalTracking).toBeDefined();
    });
  });

  describe('cleanup and destruction', () => {
    it('should cleanup resources on destroy', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      testErrorManager.handleError(new Error('Cleanup test'));
      testErrorManager.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should flush remaining errors on destroy', async () => {
      const { externalErrorTracking } = require('../errors/externalErrorTracking');

      testErrorManager.handleError(new Error('Final error'));
      testErrorManager.destroy();

      expect(externalErrorTracking.reportErrorBatch).toHaveBeenCalled();
    });
  });

  describe('page lifecycle events', () => {
    it('should flush errors on page visibility change', async () => {
      const { externalErrorTracking } = require('../errors/externalErrorTracking');

      testErrorManager.handleError(new Error('Visibility test'));

      // Simulate page becoming hidden
      Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));

      await vi.runAllTimersAsync();

      expect(externalErrorTracking.reportErrorBatch).toHaveBeenCalled();
    });

    it('should flush errors on page unload', async () => {
      const { externalErrorTracking } = require('../errors/externalErrorTracking');

      testErrorManager.handleError(new Error('Unload test'));

      // Simulate page unload
      window.dispatchEvent(new Event('beforeunload'));

      expect(externalErrorTracking.reportErrorBatch).toHaveBeenCalled();
    });
  });
});