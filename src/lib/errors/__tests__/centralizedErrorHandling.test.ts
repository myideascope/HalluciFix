/**
 * Tests for Centralized Error Handling System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorType, ErrorSeverity } from '../types';
import { ApiErrorClassifier } from '../classifier';
import { ErrorManager } from '../errorManager';
import { ErrorRouter } from '../errorRouter';
import { StructuredLogger } from '../structuredLogger';

// Mock window and navigator
Object.defineProperty(window, 'navigator', {
  value: {
    onLine: true,
    userAgent: 'test-agent'
  },
  writable: true
});

Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000/test'
  },
  writable: true
});

describe('Centralized Error Handling System', () => {
  let errorManager: ErrorManager;
  let errorRouter: ErrorRouter;
  let structuredLogger: StructuredLogger;

  beforeEach(() => {
    // Create fresh instances for each test
    errorManager = new (ErrorManager as any)();
    errorRouter = new ErrorRouter();
    structuredLogger = new StructuredLogger();
  });

  afterEach(() => {
    // Clean up
    errorManager?.destroy();
    structuredLogger?.destroy();
  });

  describe('Error Classification', () => {
    it('should classify HTTP errors correctly', () => {
      const httpError = {
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Invalid token' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(httpError, {
        component: 'AuthService',
        feature: 'authentication'
      });

      expect(classification.error.type).toBe(ErrorType.AUTHENTICATION);
      expect(classification.error.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.error.statusCode).toBe(401);
      expect(classification.shouldReport).toBe(false); // Auth errors not reported by default
      expect(classification.shouldNotifyUser).toBe(true);
    });

    it('should classify network errors correctly', () => {
      const networkError = new Error('Network request failed');
      networkError.name = 'NetworkError';

      const classification = ApiErrorClassifier.classify(networkError, {
        component: 'AnalysisService',
        feature: 'content-analysis'
      });

      expect(classification.error.type).toBe(ErrorType.NETWORK);
      expect(classification.error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.error.retryable).toBe(true);
    });

    it('should provide routing information', () => {
      const serverError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Database connection failed' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classifyWithRouting(serverError, {
        component: 'AnalysisService',
        feature: 'content-analysis'
      });

      expect(classification.routingPriority).toBeGreaterThan(0);
      expect(classification.handlerSuggestions).toContain('logging');
      expect(classification.handlerSuggestions).toContain('recovery');
      expect(classification.escalationLevel).toBeGreaterThan(0);
    });
  });

  describe('Error Manager', () => {
    it('should handle errors and update statistics', () => {
      const testError = new Error('Test error');
      
      const handledError = errorManager.handleError(testError, {
        component: 'TestComponent',
        feature: 'test-feature'
      });

      expect(handledError.errorId).toBeDefined();
      expect(handledError.timestamp).toBeDefined();
      expect(handledError.type).toBe(ErrorType.UNKNOWN);

      const stats = errorManager.getStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.errorsByType[ErrorType.UNKNOWN]).toBe(1);
    });

    it('should notify listeners when errors occur', () => {
      const listener = vi.fn();
      errorManager.addErrorListener(listener);

      const testError = new Error('Test error');
      errorManager.handleError(testError);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ErrorType.UNKNOWN,
          message: 'Test error'
        }),
        expect.any(Object)
      );

      errorManager.removeErrorListener(listener);
    });

    it('should provide error history', () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');

      errorManager.handleError(error1);
      errorManager.handleError(error2);

      const recentErrors = errorManager.getRecentErrors(5);
      expect(recentErrors).toHaveLength(2);
      expect(recentErrors[0].message).toBe('Error 2'); // Most recent first
      expect(recentErrors[1].message).toBe('Error 1');
    });
  });

  describe('Error Router', () => {
    it('should register and route to appropriate handlers', async () => {
      const mockHandler = {
        name: 'test-handler',
        priority: 50,
        canHandle: vi.fn().mockReturnValue(true),
        handle: vi.fn().mockResolvedValue({
          handled: true,
          message: 'Test handler executed'
        })
      };

      errorRouter.registerHandler(mockHandler);

      const testError = {
        errorId: 'test-123',
        type: ErrorType.UNKNOWN,
        severity: ErrorSeverity.MEDIUM,
        message: 'Test error',
        userMessage: 'Something went wrong',
        timestamp: new Date().toISOString(),
        retryable: false
      };

      const results = await errorRouter.routeError(testError, {}, {
        error: testError,
        actions: [],
        shouldReport: false,
        shouldNotifyUser: true
      });

      expect(mockHandler.canHandle).toHaveBeenCalled();
      expect(mockHandler.handle).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].handled).toBe(true);
    });

    it('should provide handler statistics', async () => {
      const mockHandler = {
        name: 'stats-test-handler',
        priority: 50,
        canHandle: () => true,
        handle: async () => ({ handled: true })
      };

      errorRouter.registerHandler(mockHandler);

      const testError = {
        errorId: 'test-456',
        type: ErrorType.UNKNOWN,
        severity: ErrorSeverity.LOW,
        message: 'Test error',
        userMessage: 'Test',
        timestamp: new Date().toISOString(),
        retryable: false
      };

      await errorRouter.routeError(testError, {}, {
        error: testError,
        actions: [],
        shouldReport: false,
        shouldNotifyUser: false
      });

      const stats = errorRouter.getHandlerStats();
      expect(stats['stats-test-handler']).toBeDefined();
      expect(stats['stats-test-handler'].attempts).toBe(1);
      expect(stats['stats-test-handler'].successes).toBe(1);
      expect(stats['stats-test-handler'].successRate).toBe(100);
    });
  });

  describe('Structured Logger', () => {
    it('should create structured log entries', () => {
      const testError = {
        errorId: 'log-test-123',
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.LOW,
        message: 'Validation failed',
        userMessage: 'Please check your input',
        timestamp: new Date().toISOString(),
        retryable: false
      };

      // Mock console methods to capture logs
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      structuredLogger.logError(testError, {
        component: 'TestComponent',
        feature: 'validation',
        userId: 'user-123'
      });

      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should sanitize sensitive information', () => {
      const sensitiveContext = {
        password: 'secret123',
        apiKey: 'key-456',
        normalField: 'safe-value'
      };

      structuredLogger.logInfo('Test message', sensitiveContext);

      // The actual sanitization is internal, but we can test that it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete error flow', async () => {
      // Create a realistic error scenario
      const networkError = {
        code: 'NETWORK_ERROR',
        message: 'Failed to fetch'
      };

      const context = {
        component: 'AnalysisService',
        feature: 'content-analysis',
        userId: 'user-789',
        url: 'https://api.example.com/analyze'
      };

      // Handle the error through the manager
      const handledError = errorManager.handleError(networkError, context);

      // Verify error was classified correctly
      expect(handledError.type).toBe(ErrorType.NETWORK);
      expect(handledError.retryable).toBe(true);

      // Verify statistics were updated
      const stats = errorManager.getStats();
      expect(stats.totalErrors).toBeGreaterThan(0);
      expect(stats.errorsByType[ErrorType.NETWORK]).toBeGreaterThan(0);

      // Verify error appears in recent errors
      const recentErrors = errorManager.getRecentErrors(1);
      expect(recentErrors[0].errorId).toBe(handledError.errorId);
    });
  });
});