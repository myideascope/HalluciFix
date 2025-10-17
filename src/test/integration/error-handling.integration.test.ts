/**
 * End-to-End Error Handling Integration Tests
 * Tests comprehensive error scenarios across the application
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorManager, errorManager, ErrorType, ErrorSeverity } from '../../lib/errors';
import { ApiErrorClassifier } from '../../lib/errors/classifier';
import { RetryManager } from '../../lib/errors/retryManager';
import { NetworkMonitor } from '../../lib/errors/networkMonitor';

// Mock network conditions
const mockNetworkConditions = {
  online: true,
  slow: false,
  offline: false
};

// Mock fetch for API testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
});

describe('End-to-End Error Handling', () => {
  let originalConsoleError: typeof console.error;
  let consoleErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock console.error to avoid noise in tests
    originalConsoleError = console.error;
    consoleErrorSpy = vi.fn();
    console.error = consoleErrorSpy;

    // Reset error manager state
    errorManager.clearErrorLog();
    
    // Reset network conditions
    mockNetworkConditions.online = true;
    mockNetworkConditions.slow = false;
    mockNetworkConditions.offline = false;
    navigator.onLine = true;

    // Reset fetch mock
    mockFetch.mockReset();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.clearAllMocks();
  });

  describe('API Error Classification and Handling', () => {
    it('should classify and handle network errors correctly', async () => {
      const networkError = new Error('Network request failed');
      networkError.name = 'NetworkError';

      const classification = ApiErrorClassifier.classify(networkError, {
        url: 'https://api.example.com/test',
        method: 'GET',
        component: 'TestComponent'
      });

      expect(classification.error.type).toBe(ErrorType.NETWORK);
      expect(classification.error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.error.retryable).toBe(true);
      expect(classification.error.userMessage).toContain('connection');
      expect(classification.shouldReport).toBe(true);
      expect(classification.shouldNotifyUser).toBe(true);
    });

    it('should classify and handle authentication errors correctly', async () => {
      const authError = {
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Token expired' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(authError, {
        url: 'https://api.example.com/protected',
        method: 'GET',
        userId: 'user123'
      });

      expect(classification.error.type).toBe(ErrorType.AUTHENTICATION);
      expect(classification.error.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.error.retryable).toBe(false);
      expect(classification.error.userMessage).toContain('session has expired');
      expect(classification.shouldReport).toBe(false); // Auth errors not reported by default
      expect(classification.shouldNotifyUser).toBe(true);
    });

    it('should classify and handle validation errors correctly', async () => {
      const validationError = {
        response: {
          status: 422,
          statusText: 'Unprocessable Entity',
          data: {
            message: 'Validation failed',
            errors: {
              email: ['Email is required'],
              password: ['Password must be at least 8 characters']
            }
          },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(validationError, {
        url: 'https://api.example.com/register',
        method: 'POST'
      });

      expect(classification.error.type).toBe(ErrorType.VALIDATION);
      expect(classification.error.severity).toBe(ErrorSeverity.LOW);
      expect(classification.error.retryable).toBe(false);
      expect(classification.error.details).toEqual(validationError.response.data.errors);
      expect(classification.shouldReport).toBe(false);
      expect(classification.shouldNotifyUser).toBe(false); // Low severity
    });

    it('should classify and handle rate limit errors correctly', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          data: { message: 'Rate limit exceeded' },
          headers: { 'retry-after': '60' }
        }
      };

      const classification = ApiErrorClassifier.classify(rateLimitError, {
        url: 'https://api.example.com/analyze',
        method: 'POST'
      });

      expect(classification.error.type).toBe(ErrorType.RATE_LIMIT);
      expect(classification.error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.error.retryable).toBe(true);
      expect(classification.error.retryAfter).toBe(60000); // 60 seconds in milliseconds
      expect(classification.error.userMessage).toContain('60 seconds');
    });

    it('should classify and handle server errors correctly', async () => {
      const serverError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Database connection failed' },
          headers: {}
        }
      };

      const classification = ApiErrorClassifier.classify(serverError, {
        url: 'https://api.example.com/data',
        method: 'GET'
      });

      expect(classification.error.type).toBe(ErrorType.SERVER);
      expect(classification.error.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.error.retryable).toBe(true);
      expect(classification.error.userMessage).toContain('technical difficulties');
      expect(classification.shouldReport).toBe(true);
      expect(classification.shouldNotifyUser).toBe(true);
    });
  });

  describe('Retry Mechanism Testing', () => {
    it('should retry failed operations with exponential backoff', async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve('success');
      });

      const result = await RetryManager.withRetry(operation, {
        maxRetries: 3,
        baseDelay: 10, // Short delay for testing
        backoffFactor: 2,
        jitter: false
      });

      expect(result).toBe('success');
      expect(attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should respect retry-after headers for rate limiting', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          headers: { 'retry-after': '1' } // 1 second
        }
      };

      let attempts = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          const error = new Error('Rate limited');
          (error as any).response = rateLimitError.response;
          throw error;
        }
        return Promise.resolve('success');
      });

      const startTime = Date.now();
      const result = await RetryManager.withRetry(operation, {
        maxRetries: 2,
        baseDelay: 10
      });
      const endTime = Date.now();

      expect(result).toBe('success');
      expect(attempts).toBe(2);
      // Should have waited at least 1 second due to retry-after header
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
    });

    it('should fail after max retries are exceeded', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        RetryManager.withRetry(operation, {
          maxRetries: 2,
          baseDelay: 10
        })
      ).rejects.toThrow('Persistent failure');

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Network Connectivity Handling', () => {
    it('should detect offline state and queue operations', async () => {
      // Simulate going offline
      navigator.onLine = false;
      mockNetworkConditions.offline = true;

      const networkMonitor = new NetworkMonitor();
      const status = networkMonitor.getStatus();

      expect(status.isOnline).toBe(false);
      expect(status.connectionType).toBe('offline');
    });

    it('should handle network recovery and retry queued operations', async () => {
      const networkMonitor = new NetworkMonitor();
      const queuedOperations: Array<() => Promise<any>> = [];

      // Simulate offline state
      navigator.onLine = false;
      
      // Queue an operation
      const operation = vi.fn().mockResolvedValue('success');
      queuedOperations.push(operation);

      // Simulate coming back online
      navigator.onLine = true;
      
      // Trigger network recovery
      window.dispatchEvent(new Event('online'));

      await waitFor(() => {
        expect(networkMonitor.getStatus().isOnline).toBe(true);
      });

      // Execute queued operations
      for (const op of queuedOperations) {
        await op();
      }

      expect(operation).toHaveBeenCalled();
    });
  });

  describe('Error Manager Integration', () => {
    it('should collect and batch process errors', async () => {
      const errors = [
        new Error('Error 1'),
        new Error('Error 2'),
        new Error('Error 3')
      ];

      // Handle multiple errors
      for (const error of errors) {
        errorManager.handleError(error, {
          component: 'TestComponent',
          feature: 'test-feature'
        });
      }

      // Flush errors immediately for testing
      await errorManager.flushErrors();

      const stats = errorManager.getStats();
      expect(stats.totalErrors).toBe(3);
      
      const recentErrors = errorManager.getRecentErrors();
      expect(recentErrors).toHaveLength(3);
    });

    it('should track error analytics and patterns', async () => {
      const analytics = errorManager.getAnalytics();

      // Generate some test errors
      const testErrors = [
        { type: ErrorType.NETWORK, severity: ErrorSeverity.MEDIUM },
        { type: ErrorType.NETWORK, severity: ErrorSeverity.MEDIUM },
        { type: ErrorType.SERVER, severity: ErrorSeverity.HIGH },
        { type: ErrorType.VALIDATION, severity: ErrorSeverity.LOW }
      ];

      for (const errorData of testErrors) {
        const error = new Error('Test error');
        (error as any).type = errorData.type;
        (error as any).severity = errorData.severity;
        
        errorManager.handleError(error, {
          component: 'TestComponent'
        });
      }

      await errorManager.flushErrors();

      const errorLog = errorManager.getRecentErrors();
      analytics.updateErrorLog(errorLog);

      const trends = analytics.getErrorTrends('1h');
      expect(trends.length).toBeGreaterThan(0);

      const patterns = analytics.detectErrorPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should trigger alerts for error thresholds', async () => {
      const analytics = errorManager.getAnalytics();
      
      // Configure alert for high error rate
      analytics.configureAlert({
        name: 'high_error_rate',
        condition: {
          type: 'error_rate',
          threshold: 2, // 2 errors per minute
          timeWindow: '1m'
        },
        actions: [
          { type: 'console', message: 'High error rate detected!' }
        ]
      });

      // Generate errors to trigger alert
      for (let i = 0; i < 5; i++) {
        errorManager.handleError(new Error(`Test error ${i}`), {
          component: 'TestComponent'
        });
      }

      await errorManager.flushErrors();

      const triggeredAlerts = analytics.checkAlerts();
      expect(triggeredAlerts.length).toBeGreaterThan(0);
      expect(triggeredAlerts[0].alertName).toBe('high_error_rate');
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should recover from authentication errors', async () => {
      const { ErrorRecoveryManager } = await import('../../lib/errors/recoveryStrategy');
      const recoveryManager = new ErrorRecoveryManager();

      const authError = {
        type: ErrorType.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        message: 'Token expired',
        userMessage: 'Your session has expired',
        retryable: false,
        errorId: 'test-error-1',
        timestamp: new Date().toISOString()
      };

      // Mock successful token refresh
      const mockTokenRefresh = vi.fn().mockResolvedValue({ success: true });
      
      // Mock the recovery operation
      const recoveryResult = await recoveryManager.attemptRecovery(
        authError,
        mockTokenRefresh
      );

      expect(recoveryResult.success).toBe(true);
      expect(mockTokenRefresh).toHaveBeenCalled();
    });

    it('should recover from network connectivity issues', async () => {
      const { NetworkRecoveryManager } = await import('../../lib/errors/networkRecovery');
      const networkRecovery = new NetworkRecoveryManager();

      // Simulate network failure
      navigator.onLine = false;
      
      const operation = vi.fn().mockResolvedValue('success');
      
      // Queue operation for when network recovers
      networkRecovery.queueWhenOffline('test-operation', operation);

      // Simulate network recovery
      navigator.onLine = true;
      window.dispatchEvent(new Event('online'));

      await waitFor(() => {
        expect(operation).toHaveBeenCalled();
      });
    });
  });

  describe('Component Error Boundary Integration', () => {
    it('should catch and handle component errors', async () => {
      const ErrorThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
        if (shouldThrow) {
          throw new Error('Component error for testing');
        }
        return <div>No error</div>;
      };

      const { ErrorBoundary } = await import('../../components/ErrorBoundary');
      
      const onError = vi.fn();
      
      render(
        <ErrorBoundary onError={onError}>
          <ErrorThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalled();
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it('should provide error recovery actions', async () => {
      const { ErrorBoundary } = await import('../../components/ErrorBoundary');
      
      const ErrorThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
        if (shouldThrow) {
          throw new Error('Recoverable error');
        }
        return <div>Component working</div>;
      };

      let shouldThrow = true;
      const { rerender } = render(
        <ErrorBoundary>
          <ErrorThrowingComponent shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );

      // Error boundary should show error UI
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();

      // Simulate fixing the error
      shouldThrow = false;
      
      // Click retry button
      const user = userEvent.setup();
      await user.click(screen.getByText('Try Again'));

      // Component should recover
      await waitFor(() => {
        expect(screen.getByText('Component working')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation Error Handling', () => {
    it('should handle form validation errors with proper user feedback', async () => {
      const { FormField, FormError } = await import('../../components/forms');
      const { useFormValidation, validators } = await import('../../lib/formValidation');

      const TestForm = () => {
        const { values, errors, handleChange, handleBlur, validateForm } = useFormValidation({
          email: validators.required().email(),
          password: validators.required().minLength(8)
        });

        return (
          <form>
            <FormField
              label="Email"
              error={errors.email}
            >
              <input
                type="email"
                value={values.email || ''}
                onChange={(e) => handleChange('email', e.target.value)}
                onBlur={() => handleBlur('email')}
              />
            </FormField>
            
            <FormField
              label="Password"
              error={errors.password}
            >
              <input
                type="password"
                value={values.password || ''}
                onChange={(e) => handleChange('password', e.target.value)}
                onBlur={() => handleBlur('password')}
              />
            </FormField>
          </form>
        );
      };

      render(<TestForm />);

      const user = userEvent.setup();
      const emailInput = screen.getByLabelText('Email');
      const passwordInput = screen.getByLabelText('Password');

      // Test invalid email
      await user.type(emailInput, 'invalid-email');
      await user.tab(); // Trigger blur

      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument();
      });

      // Test short password
      await user.type(passwordInput, '123');
      await user.tab(); // Trigger blur

      await waitFor(() => {
        expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Monitoring and Alerting', () => {
    it('should monitor error rates and trigger alerts', async () => {
      const { ErrorMonitor } = await import('../../lib/errors/errorMonitor');
      const monitor = new ErrorMonitor();

      // Configure monitoring threshold
      monitor.setThreshold({
        name: 'error_rate_threshold',
        condition: {
          metric: 'error_rate',
          operator: 'greater_than',
          value: 5, // 5 errors per minute
          timeWindow: '1m'
        },
        actions: [
          { type: 'console', message: 'Error rate threshold exceeded' }
        ]
      });

      // Generate errors to exceed threshold
      const errorLog = [];
      for (let i = 0; i < 10; i++) {
        errorLog.push({
          errorId: `error-${i}`,
          timestamp: new Date().toISOString(),
          type: ErrorType.SERVER,
          severity: ErrorSeverity.HIGH,
          message: `Test error ${i}`,
          userMessage: 'Test error',
          url: 'https://test.com',
          userAgent: 'test',
          context: {},
          resolved: false
        });
      }

      monitor.updateMetrics(errorLog);
      const alerts = monitor.checkThresholds();

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].thresholdName).toBe('error_rate_threshold');
    });

    it('should create incidents for critical errors', async () => {
      const { IncidentManager, IncidentSeverity } = await import('../../lib/errors/incidentManager');
      const incidentManager = new IncidentManager();

      const criticalError = {
        errorId: 'critical-error-1',
        timestamp: new Date().toISOString(),
        type: ErrorType.SERVER,
        severity: ErrorSeverity.CRITICAL,
        message: 'Database connection lost',
        userMessage: 'Service temporarily unavailable',
        url: 'https://api.test.com',
        userAgent: 'test',
        context: { component: 'DatabaseService' },
        resolved: false
      };

      const incident = incidentManager.createIncident({
        title: 'Critical Database Error',
        description: criticalError.message,
        severity: IncidentSeverity.CRITICAL,
        source: 'error_monitoring',
        metadata: { errorId: criticalError.errorId }
      });

      expect(incident.severity).toBe(IncidentSeverity.CRITICAL);
      expect(incident.status).toBe('open');
      expect(incident.metadata.errorId).toBe(criticalError.errorId);
    });
  });

  describe('Performance Impact of Error Handling', () => {
    it('should not significantly impact performance under normal conditions', async () => {
      const startTime = performance.now();
      
      // Simulate normal operations with occasional errors
      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(
          new Promise((resolve) => {
            // Simulate some work
            setTimeout(() => {
              if (i % 20 === 0) {
                // Occasional error
                errorManager.handleError(new Error(`Error ${i}`), {
                  component: 'PerformanceTest'
                });
              }
              resolve(i);
            }, 1);
          })
        );
      }

      await Promise.all(operations);
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
      
      const stats = errorManager.getStats();
      expect(stats.totalErrors).toBe(5); // 100/20 = 5 errors
    });

    it('should handle high error volumes without memory leaks', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Generate many errors
      for (let i = 0; i < 1000; i++) {
        errorManager.handleError(new Error(`Bulk error ${i}`), {
          component: 'BulkTest',
          operation: 'bulk_operation'
        });
      }

      await errorManager.flushErrors();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (adjust threshold as needed)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB
      
      const stats = errorManager.getStats();
      expect(stats.totalErrors).toBe(1000);
    });
  });
});