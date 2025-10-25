/**
 * Enhanced tests for ErrorManager
 * Covers comprehensive error management, queuing, and analytics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorManager, createErrorManager } from '../errors/errorManager';
import { ErrorType, ErrorSeverity } from '../errors/types';

// Mock dependencies
vi.mock('../errors/classifier', () => ({
  ApiErrorClassifier: {
    classifyWithRouting: vi.fn((error, context) => ({
      error: {
        errorId: 'test-error-123',
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        message: error.message || 'Test error',
        userMessage: 'User friendly message',
        timestamp: new Date().toISOString(),
        retryable: false
      },
      routing: {
        handlers: ['validation'],
        priority: 'medium'
      }
    }))
  },
  generateErrorId: vi.fn(() => 'test-error-123')
}));

vi.mock('../errors/errorAnalytics', () => ({
  errorAnalytics: {
    updateErrorLog: vi.fn(),
    checkAlerts: vi.fn(() => [])
  }
}));

vi.mock('../errors/externalErrorTracking', () => ({
  externalErrorTracking: {
    reportError: vi.fn().mockResolvedValue(undefined),
    reportErrorBatch: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../errors/errorMonitor', () => ({
  errorMonitor: {
    updateMetrics: vi.fn()
  }
}));

vi.mock('../errors/errorRouter', () => ({
  errorRouter: {
    routeError: vi.fn().mockResolvedValue([
      { handled: true, escalate: false, message: 'Handled successfully' }
    ])
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
    processError: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });

// Mock window and document
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: vi.fn(),
    currentUser: { id: 'user-123' },
    sessionId: 'session-456'
  }
});

Object.defineProperty(global, 'document', {
  value: {
    addEventListener: vi.fn(),
    hidden: false
  }
});

Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Test User Agent'
  }
});

describe('ErrorManager', () => {
  let errorManager: ErrorManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Reset localStorage mocks
    mockLocalStorage.getItem.mockReturnValue(null);
    
    errorManager = createErrorManager({
      batchSize: 3,
      flushInterval: 1000,
      maxQueueSize: 10,
      enableConsoleLogging: true,
      enableLocalStorage: true
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    errorManager.destroy();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultManager = ErrorManager.getInstance();
      expect(defaultManager).toBeDefined();
    });

    it('should load existing error log from localStorage', () => {
      const existingLog = [
        {
          errorId: 'existing-1',
          timestamp: new Date().toISOString(),
          type: ErrorType.NETWORK,
          severity: ErrorSeverity.LOW,
          message: 'Existing error',
          userMessage: 'User message',
          url: 'http://test.com',
          userAgent: 'Test Agent',
          context: {},
          resolved: false
        }
      ];
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(existingLog));
      
      const managerWithExisting = createErrorManager();
      const stats = managerWithExisting.getStats();
      
      expect(stats.totalErrors).toBe(1);
      expect(stats.errorsByType[ErrorType.NETWORK]).toBe(1);
    });

    it('should handle corrupted localStorage data gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const managerWithCorrupted = createErrorManager();
      const stats = managerWithCorrupted.getStats();
      
      expect(stats.totalErrors).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load error log from localStorage:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle basic error with context enhancement', () => {
      const error = new Error('Test error');
      const context = { component: 'TestComponent' };

      const result = errorManager.handleError(error, context);

      expect(result.errorId).toBe('test-error-123');
      expect(result.type).toBe(ErrorType.VALIDATION);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.message).toBe('Test error');

      const stats = errorManager.getStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.errorsByType[ErrorType.VALIDATION]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(1);
    });

    it('should enhance error context with additional information', () => {
      const { structuredLogger } = require('../errors/structuredLogger');
      
      const error = new Error('Context test');
      errorManager.handleError(error, { feature: 'testing' });

      expect(structuredLogger.logError).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          feature: 'testing',
          timestamp: expect.any(String),
          url: expect.any(String),
          userAgent: 'Test User Agent',
          userId: 'user-123',
          sessionId: 'session-456'
        })
      );
    });

    it('should process error grouping and alerting', () => {
      const { errorGrouping, errorAlerting } = require('../errors/errorGrouping');
      
      const error = new Error('Grouping test');
      errorManager.handleError(error);

      expect(errorGrouping.processError).toHaveBeenCalled();
      expect(errorAlerting.processError).toHaveBeenCalled();
    });

    it('should route errors through error router', async () => {
      const { errorRouter } = require('../errors/errorRouter');
      
      const error = new Error('Routing test');
      errorManager.handleError(error);

      // Wait for async routing
      await vi.runAllTimersAsync();

      expect(errorRouter.routeError).toHaveBeenCalled();
    });

    it('should handle critical errors immediately', async () => {
      const { ApiErrorClassifier, externalErrorTracking } = require('../errors/classifier');
      
      // Mock critical error classification
      ApiErrorClassifier.classifyWithRouting.mockReturnValue({
        error: {
          errorId: 'critical-error',
          type: ErrorType.SYSTEM,
          severity: ErrorSeverity.CRITICAL,
          message: 'Critical system error',
          userMessage: 'System error occurred',
          timestamp: new Date().toISOString(),
          retryable: false
        },
        routing: { handlers: ['system'], priority: 'critical' }
      });

      const error = new Error('Critical error');
      errorManager.handleError(error);

      expect(externalErrorTracking.reportError).toHaveBeenCalled();
    });

    it('should notify error listeners', () => {
      const listener = vi.fn();
      errorManager.addErrorListener(listener);

      const error = new Error('Listener test');
      errorManager.handleError(error);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Listener test' }),
        expect.any(Object)
      );

      errorManager.removeErrorListener(listener);
    });

    it('should handle listener errors gracefully', () => {
      const faultyListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorManager.addErrorListener(faultyListener);
      errorManager.handleError(new Error('Test'));

      expect(consoleSpy).toHaveBeenCalledWith('Error in error listener:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('batch processing', () => {
    it('should queue errors and flush when batch size is reached', async () => {
      const { externalErrorTracking } = require('../errors/externalErrorTracking');

      // Add errors up to batch size
      errorManager.handleError(new Error('Error 1'));
      errorManager.handleError(new Error('Error 2'));
      errorManager.handleError(new Error('Error 3')); // Should trigger flush

      await vi.runAllTimersAsync();

      expect(externalErrorTracking.reportErrorBatch).toHaveBeenCalled();
    });

    it('should flush errors on timer interval', async () => {
      const { externalErrorTracking } = require('../errors/externalErrorTracking');

      errorManager.handleError(new Error('Timer test'));

      // Advance timer to trigger flush
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      expect(externalErrorTracking.reportErrorBatch).toHaveBeenCalled();
    });

    it('should handle queue size limit', () => {
      // Fill queue beyond limit
      for (let i = 0; i < 15; i++) {
        errorManager.handleError(new Error(`Error ${i}`));
      }

      const stats = errorManager.getStats();
      expect(stats.totalErrors).toBe(15);
      // Queue should be limited but stats should track all errors
    });

    it('should handle batch processing errors gracefully', async () => {
      const { externalErrorTracking } = require('../errors/externalErrorTracking');
      externalErrorTracking.reportErrorBatch.mockRejectedValue(new Error('Batch failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorManager.handleError(new Error('Batch error test'));
      await errorManager.flushErrors();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to send errors to external services:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('analytics integration', () => {
    it('should update analytics with error log', async () => {
      const { errorAnalytics } = require('../errors/errorAnalytics');

      errorManager.handleError(new Error('Analytics test'));
      await errorManager.flushErrors();

      expect(errorAnalytics.updateErrorLog).toHaveBeenCalled();
    });

    it('should check and handle triggered alerts', async () => {
      const { errorAnalytics } = require('../errors/errorAnalytics');
      
      const mockAlerts = [
        {
          alertName: 'High Error Rate',
          condition: { type: 'error_rate' },
          actions: [
            { type: 'console', message: 'Error rate exceeded' }
          ]
        }
      ];
      
      errorAnalytics.checkAlerts.mockReturnValue(mockAlerts);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      errorManager.handleError(new Error('Alert test'));
      await errorManager.flushErrors();

      expect(consoleSpy).toHaveBeenCalledWith('[Alert] High Error Rate: Error rate exceeded');
      
      consoleSpy.mockRestore();
    });

    it('should handle notification alerts', async () => {
      const { errorAnalytics } = require('../errors/errorAnalytics');
      
      // Mock Notification API
      const mockNotification = vi.fn();
      Object.defineProperty(global, 'Notification', { value: mockNotification });
      Object.defineProperty(global, 'window', {
        value: { ...global.window, Notification: mockNotification }
      });

      const mockAlerts = [
        {
          alertName: 'Critical Error',
          condition: { type: 'critical_error' },
          actions: [
            { type: 'notification', message: 'Critical error detected' }
          ]
        }
      ];
      
      errorAnalytics.checkAlerts.mockReturnValue(mockAlerts);

      errorManager.handleError(new Error('Notification test'));
      await errorManager.flushErrors();

      expect(mockNotification).toHaveBeenCalledWith(
        'Error Alert: Critical Error',
        expect.objectContaining({
          body: 'Critical error detected'
        })
      );
    });
  });

  describe('localStorage integration', () => {
    it('should save error log to localStorage', async () => {
      errorManager.handleError(new Error('Storage test'));
      await errorManager.flushErrors();

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'hallucifix_error_log',
        expect.any(String)
      );
    });

    it('should handle localStorage save errors gracefully', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage full');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorManager.handleError(new Error('Storage error test'));
      await errorManager.flushErrors();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to save to localStorage:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    it('should trim error log when it gets too large', async () => {
      // Add many errors to exceed limit
      for (let i = 0; i < 120; i++) {
        errorManager.handleError(new Error(`Error ${i}`));
      }

      await errorManager.flushErrors();

      const recentErrors = errorManager.getRecentErrors(200);
      expect(recentErrors.length).toBeLessThanOrEqual(100); // Should be trimmed
    });
  });

  describe('error statistics', () => {
    it('should calculate error rate correctly', () => {
      // Add errors over time
      errorManager.handleError(new Error('Rate test 1'));
      
      vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes
      errorManager.handleError(new Error('Rate test 2'));
      
      vi.advanceTimersByTime(30 * 60 * 1000); // Another 30 minutes
      errorManager.handleError(new Error('Rate test 3'));

      const stats = errorManager.getStats();
      expect(stats.errorRate).toBeGreaterThan(0);
      expect(stats.lastErrorTime).toBeDefined();
    });

    it('should track errors by type and severity', () => {
      const { ApiErrorClassifier } = require('../errors/classifier');
      
      // Mock different error types
      ApiErrorClassifier.classifyWithRouting
        .mockReturnValueOnce({
          error: { type: ErrorType.NETWORK, severity: ErrorSeverity.HIGH, errorId: '1', message: 'Network error', userMessage: 'Network issue', timestamp: new Date().toISOString(), retryable: true }
        })
        .mockReturnValueOnce({
          error: { type: ErrorType.VALIDATION, severity: ErrorSeverity.LOW, errorId: '2', message: 'Validation error', userMessage: 'Invalid input', timestamp: new Date().toISOString(), retryable: false }
        })
        .mockReturnValueOnce({
          error: { type: ErrorType.NETWORK, severity: ErrorSeverity.MEDIUM, errorId: '3', message: 'Another network error', userMessage: 'Connection issue', timestamp: new Date().toISOString(), retryable: true }
        });

      errorManager.handleError(new Error('Network error'));
      errorManager.handleError(new Error('Validation error'));
      errorManager.handleError(new Error('Another network error'));

      const stats = errorManager.getStats();
      expect(stats.errorsByType[ErrorType.NETWORK]).toBe(2);
      expect(stats.errorsByType[ErrorType.VALIDATION]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.LOW]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(1);
    });

    it('should provide recent errors', () => {
      errorManager.handleError(new Error('Recent 1'));
      errorManager.handleError(new Error('Recent 2'));
      errorManager.handleError(new Error('Recent 3'));

      const recentErrors = errorManager.getRecentErrors(2);
      expect(recentErrors).toHaveLength(2);
      expect(recentErrors[0].message).toBe('Recent 3'); // Most recent first
    });
  });

  describe('console logging', () => {
    it('should log to console in development mode', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorManager.handleError(new Error('Console test'));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ErrorManager] validation: Console test',
        expect.objectContaining({
          errorId: 'test-error-123',
          severity: ErrorSeverity.MEDIUM
        })
      );
      
      consoleSpy.mockRestore();
    });

    it('should use appropriate log levels for different severities', () => {
      const { ApiErrorClassifier } = require('../errors/classifier');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      // Test different severities
      ApiErrorClassifier.classifyWithRouting.mockReturnValueOnce({
        error: { type: ErrorType.SYSTEM, severity: ErrorSeverity.CRITICAL, errorId: '1', message: 'Critical', userMessage: 'Critical error', timestamp: new Date().toISOString(), retryable: false }
      });
      errorManager.handleError(new Error('Critical'));

      ApiErrorClassifier.classifyWithRouting.mockReturnValueOnce({
        error: { type: ErrorType.VALIDATION, severity: ErrorSeverity.MEDIUM, errorId: '2', message: 'Medium', userMessage: 'Medium error', timestamp: new Date().toISOString(), retryable: false }
      });
      errorManager.handleError(new Error('Medium'));

      ApiErrorClassifier.classifyWithRouting.mockReturnValueOnce({
        error: { type: ErrorType.VALIDATION, severity: ErrorSeverity.LOW, errorId: '3', message: 'Low', userMessage: 'Low error', timestamp: new Date().toISOString(), retryable: false }
      });
      errorManager.handleError(new Error('Low'));

      expect(errorSpy).toHaveBeenCalledWith('[ErrorManager] system: Critical', expect.any(Object));
      expect(warnSpy).toHaveBeenCalledWith('[ErrorManager] validation: Medium', expect.any(Object));
      expect(infoSpy).toHaveBeenCalledWith('[ErrorManager] validation: Low', expect.any(Object));

      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });
  });

  describe('cleanup and management', () => {
    it('should clear error log and reset statistics', () => {
      errorManager.handleError(new Error('Clear test'));
      
      expect(errorManager.getStats().totalErrors).toBe(1);
      
      errorManager.clearErrorLog();
      
      const stats = errorManager.getStats();
      expect(stats.totalErrors).toBe(0);
      expect(stats.errorsByType).toEqual({});
      expect(stats.errorsBySeverity).toEqual({});
    });

    it('should flush errors on page unload', () => {
      const flushSpy = vi.spyOn(errorManager, 'flushErrors');
      
      errorManager.handleError(new Error('Unload test'));
      
      // Simulate page unload
      const unloadHandler = vi.mocked(global.window.addEventListener).mock.calls
        .find(call => call[0] === 'beforeunload')?.[1];
      
      if (unloadHandler) {
        unloadHandler();
      }

      expect(flushSpy).toHaveBeenCalledWith(true);
    });

    it('should destroy resources properly', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const flushSpy = vi.spyOn(errorManager, 'flushErrors');

      errorManager.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(flushSpy).toHaveBeenCalledWith(true);
    });
  });

  describe('error escalation', () => {
    it('should handle error escalation when routing fails', async () => {
      const { errorRouter, structuredLogger } = require('../errors/errorRouter');
      
      // Mock routing results with escalation
      errorRouter.routeError.mockResolvedValue([
        { handled: false, escalate: true, message: 'Handler failed' }
      ]);

      errorManager.handleError(new Error('Escalation test'));
      await vi.runAllTimersAsync();

      expect(structuredLogger.logWarning).toHaveBeenCalledWith(
        'Error escalation triggered',
        expect.objectContaining({
          errorId: 'test-error-123',
          errorType: ErrorType.VALIDATION,
          severity: ErrorSeverity.MEDIUM
        }),
        ['escalation']
      );
    });

    it('should handle routing errors gracefully', async () => {
      const { errorRouter, structuredLogger } = require('../errors/errorRouter');
      
      errorRouter.routeError.mockRejectedValue(new Error('Routing failed'));

      errorManager.handleError(new Error('Routing error test'));
      await vi.runAllTimersAsync();

      expect(structuredLogger.logError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          errorId: 'test-error-123',
          component: 'ErrorManager',
          feature: 'error-routing'
        })
      );
    });
  });
});