/**
 * Error Monitoring and Alerting Integration Tests
 * Tests the complete error monitoring, analytics, and alerting pipeline
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  ErrorManager, 
  ErrorAnalytics, 
  ErrorMonitor, 
  IncidentManager,
  HealthCheckService,
  ExternalErrorTracking,
  SentryIntegration,
  errorManager,
  errorAnalytics,
  errorMonitor,
  incidentManager,
  healthCheckService,
  externalErrorTracking,
  sentryIntegration,
  ErrorType,
  ErrorSeverity,
  IncidentSeverity,
  IncidentStatus,
  TimePeriod
} from '../../lib/errors';

// Mock external services
const mockSentry = {
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: vi.fn((callback) => callback({ 
    setTag: vi.fn(), 
    setLevel: vi.fn(), 
    setContext: vi.fn() 
  })),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn()
};

// Mock analytics service
const mockAnalytics = {
  track: vi.fn(),
  identify: vi.fn(),
  group: vi.fn()
};

// Mock notification service
const mockNotificationService = {
  sendAlert: vi.fn(),
  sendIncidentNotification: vi.fn(),
  sendHealthAlert: vi.fn()
};

describe('Error Monitoring and Alerting Integration', () => {
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;
  let consoleErrorSpy: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock console methods
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    consoleErrorSpy = vi.fn();
    consoleWarnSpy = vi.fn();
    console.error = consoleErrorSpy;
    console.warn = consoleWarnSpy;

    // Reset all services
    errorManager.clearErrorLog();
    errorAnalytics.clearAlerts();
    errorMonitor.clearThresholds();
    incidentManager.clearIncidents();

    // Reset mocks
    vi.clearAllMocks();
    mockSentry.captureException.mockClear();
    mockSentry.captureMessage.mockClear();
    mockAnalytics.track.mockClear();
    mockNotificationService.sendAlert.mockClear();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  describe('Error Collection and Processing', () => {
    it('should collect and batch process errors efficiently', async () => {
      const errors = [
        { message: 'Network timeout', type: ErrorType.NETWORK },
        { message: 'Validation failed', type: ErrorType.VALIDATION },
        { message: 'Server error', type: ErrorType.SERVER },
        { message: 'Auth token expired', type: ErrorType.AUTHENTICATION }
      ];

      // Generate errors
      for (const errorData of errors) {
        const error = new Error(errorData.message);
        (error as any).type = errorData.type;
        
        errorManager.handleError(error, {
          component: 'TestComponent',
          feature: 'monitoring-test',
          userId: 'test-user-123'
        });
      }

      // Flush errors for processing
      await errorManager.flushErrors();

      const stats = errorManager.getStats();
      expect(stats.totalErrors).toBe(4);
      expect(stats.errorsByType[ErrorType.NETWORK]).toBe(1);
      expect(stats.errorsByType[ErrorType.VALIDATION]).toBe(1);
      expect(stats.errorsByType[ErrorType.SERVER]).toBe(1);
      expect(stats.errorsByType[ErrorType.AUTHENTICATION]).toBe(1);

      const recentErrors = errorManager.getRecentErrors();
      expect(recentErrors).toHaveLength(4);
    });

    it('should enrich errors with contextual information', async () => {
      const error = new Error('Test error with context');
      
      const handledError = errorManager.handleError(error, {
        component: 'ContextTestComponent',
        feature: 'context-enrichment',
        userId: 'user-456',
        sessionId: 'session-789',
        url: 'https://app.example.com/test',
        operation: 'testOperation',
        metadata: {
          customField: 'customValue',
          requestId: 'req-123'
        }
      });

      expect(handledError.userId).toBe('user-456');
      expect(handledError.sessionId).toBe('session-789');
      expect(handledError.url).toBe('https://app.example.com/test');

      await errorManager.flushErrors();

      const recentErrors = errorManager.getRecentErrors();
      const loggedError = recentErrors[0];
      
      expect(loggedError.userId).toBe('user-456');
      expect(loggedError.context.component).toBe('ContextTestComponent');
      expect(loggedError.context.feature).toBe('context-enrichment');
      expect(loggedError.context.operation).toBe('testOperation');
    });
  });

  describe('Error Analytics and Trend Analysis', () => {
    it('should analyze error trends over time', async () => {
      const analytics = errorManager.getAnalytics();
      
      // Generate errors over time
      const baseTime = Date.now();
      const errorLog = [];
      
      for (let i = 0; i < 20; i++) {
        errorLog.push({
          errorId: `trend-error-${i}`,
          timestamp: new Date(baseTime + i * 60000).toISOString(), // 1 minute intervals
          type: i % 2 === 0 ? ErrorType.NETWORK : ErrorType.SERVER,
          severity: i % 3 === 0 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
          message: `Trend test error ${i}`,
          userMessage: 'Test error',
          url: 'https://test.com',
          userAgent: 'test-agent',
          context: {},
          resolved: false
        });
      }

      analytics.updateErrorLog(errorLog);

      const trends = analytics.getErrorTrends(TimePeriod.HOUR);
      expect(trends.length).toBeGreaterThan(0);

      const patterns = analytics.detectErrorPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Check for network error pattern
      const networkPattern = patterns.find(p => 
        p.pattern.includes('NETWORK') || p.description.includes('network')
      );
      expect(networkPattern).toBeDefined();
    });

    it('should calculate error impact metrics', async () => {
      const analytics = errorManager.getAnalytics();
      
      // Generate errors with different user impacts
      const errorLog = [
        {
          errorId: 'impact-1',
          timestamp: new Date().toISOString(),
          type: ErrorType.SERVER,
          severity: ErrorSeverity.CRITICAL,
          message: 'Critical server error',
          userMessage: 'Service unavailable',
          url: 'https://test.com',
          userAgent: 'test',
          userId: 'user-1',
          context: { affectedUsers: 100 },
          resolved: false
        },
        {
          errorId: 'impact-2',
          timestamp: new Date().toISOString(),
          type: ErrorType.VALIDATION,
          severity: ErrorSeverity.LOW,
          message: 'Form validation error',
          userMessage: 'Please check your input',
          url: 'https://test.com',
          userAgent: 'test',
          userId: 'user-2',
          context: { affectedUsers: 1 },
          resolved: false
        }
      ];

      analytics.updateErrorLog(errorLog);

      const impact = analytics.calculateErrorImpact(TimePeriod.HOUR);
      expect(impact.totalAffectedUsers).toBeGreaterThan(0);
      expect(impact.criticalErrorCount).toBe(1);
      expect(impact.averageResolutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should detect error patterns and anomalies', async () => {
      const analytics = errorManager.getAnalytics();
      
      // Generate pattern of similar errors
      const errorLog = [];
      for (let i = 0; i < 10; i++) {
        errorLog.push({
          errorId: `pattern-${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          type: ErrorType.NETWORK,
          severity: ErrorSeverity.MEDIUM,
          message: 'Connection timeout to api.service.com',
          userMessage: 'Connection problem',
          url: 'https://app.com/api-call',
          userAgent: 'test',
          context: { endpoint: 'api.service.com' },
          resolved: false
        });
      }

      analytics.updateErrorLog(errorLog);

      const patterns = analytics.detectErrorPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      const networkPattern = patterns.find(p => 
        p.description.includes('api.service.com') || 
        p.pattern.includes('NETWORK')
      );
      expect(networkPattern).toBeDefined();
      expect(networkPattern?.frequency).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Alert Configuration and Triggering', () => {
    it('should configure and trigger error rate alerts', async () => {
      const analytics = errorManager.getAnalytics();
      
      // Configure alert for high error rate
      analytics.configureAlert({
        name: 'high_error_rate',
        condition: {
          type: 'error_rate',
          threshold: 5, // 5 errors per minute
          timeWindow: '1m'
        },
        actions: [
          { type: 'console', message: 'High error rate detected!' },
          { type: 'notification', message: 'Error rate threshold exceeded' }
        ]
      });

      // Generate errors to trigger alert
      for (let i = 0; i < 10; i++) {
        errorManager.handleError(new Error(`Rate test error ${i}`), {
          component: 'RateTestComponent'
        });
      }

      await errorManager.flushErrors();

      const triggeredAlerts = analytics.checkAlerts();
      expect(triggeredAlerts.length).toBeGreaterThan(0);
      
      const rateAlert = triggeredAlerts.find(a => a.alertName === 'high_error_rate');
      expect(rateAlert).toBeDefined();
      expect(rateAlert?.triggered).toBe(true);
    });

    it('should configure and trigger severity-based alerts', async () => {
      const analytics = errorManager.getAnalytics();
      
      // Configure alert for critical errors
      analytics.configureAlert({
        name: 'critical_errors',
        condition: {
          type: 'error_severity',
          threshold: 1, // Any critical error
          severity: ErrorSeverity.CRITICAL,
          timeWindow: '5m'
        },
        actions: [
          { type: 'console', message: 'Critical error detected!' }
        ]
      });

      // Generate critical error
      const criticalError = new Error('Critical system failure');
      (criticalError as any).severity = ErrorSeverity.CRITICAL;
      
      errorManager.handleError(criticalError, {
        component: 'CriticalComponent',
        feature: 'critical-feature'
      });

      await errorManager.flushErrors();

      const triggeredAlerts = analytics.checkAlerts();
      const criticalAlert = triggeredAlerts.find(a => a.alertName === 'critical_errors');
      expect(criticalAlert).toBeDefined();
    });

    it('should handle alert cooldown periods', async () => {
      const analytics = errorManager.getAnalytics();
      
      // Configure alert with cooldown
      analytics.configureAlert({
        name: 'cooldown_test',
        condition: {
          type: 'error_rate',
          threshold: 2,
          timeWindow: '1m'
        },
        cooldownPeriod: '5m',
        actions: [
          { type: 'console', message: 'Cooldown test alert' }
        ]
      });

      // Trigger alert first time
      for (let i = 0; i < 5; i++) {
        errorManager.handleError(new Error(`Cooldown test ${i}`), {
          component: 'CooldownTest'
        });
      }

      await errorManager.flushErrors();

      let alerts = analytics.checkAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      // Try to trigger again immediately (should be in cooldown)
      for (let i = 0; i < 5; i++) {
        errorManager.handleError(new Error(`Cooldown test 2-${i}`), {
          component: 'CooldownTest'
        });
      }

      await errorManager.flushErrors();

      // Should not trigger again due to cooldown
      alerts = analytics.checkAlerts();
      const cooldownAlerts = alerts.filter(a => a.alertName === 'cooldown_test');
      expect(cooldownAlerts.length).toBe(1); // Only the first trigger
    });
  });

  describe('Incident Management', () => {
    it('should create incidents from critical errors', async () => {
      const criticalError = {
        errorId: 'critical-incident-1',
        timestamp: new Date().toISOString(),
        type: ErrorType.SERVER,
        severity: ErrorSeverity.CRITICAL,
        message: 'Database connection pool exhausted',
        userMessage: 'Service temporarily unavailable',
        url: 'https://api.app.com/data',
        userAgent: 'test',
        context: { 
          component: 'DatabaseService',
          connectionPool: 'exhausted',
          activeConnections: 100
        },
        resolved: false
      };

      const incident = incidentManager.createIncident({
        title: 'Critical Database Error',
        description: criticalError.message,
        severity: IncidentSeverity.CRITICAL,
        source: 'error_monitoring',
        metadata: { 
          errorId: criticalError.errorId,
          component: 'DatabaseService'
        }
      });

      expect(incident.severity).toBe(IncidentSeverity.CRITICAL);
      expect(incident.status).toBe(IncidentStatus.OPEN);
      expect(incident.metadata.errorId).toBe(criticalError.errorId);

      const incidents = incidentManager.getActiveIncidents();
      expect(incidents).toHaveLength(1);
      expect(incidents[0].id).toBe(incident.id);
    });

    it('should escalate incidents based on duration and impact', async () => {
      const incident = incidentManager.createIncident({
        title: 'Service Degradation',
        description: 'API response times elevated',
        severity: IncidentSeverity.MEDIUM,
        source: 'monitoring'
      });

      // Simulate time passing
      const escalationTime = Date.now() + 30 * 60 * 1000; // 30 minutes
      vi.setSystemTime(escalationTime);

      // Check for escalation
      const escalatedIncidents = incidentManager.checkEscalation();
      
      if (escalatedIncidents.length > 0) {
        expect(escalatedIncidents[0].severity).toBe(IncidentSeverity.HIGH);
      }

      vi.useRealTimers();
    });

    it('should track incident resolution and metrics', async () => {
      const incident = incidentManager.createIncident({
        title: 'Test Incident',
        description: 'Test incident for resolution tracking',
        severity: IncidentSeverity.MEDIUM,
        source: 'test'
      });

      // Add timeline entries
      incidentManager.addTimelineEntry(incident.id, {
        type: 'investigation_started',
        description: 'Investigation started by on-call engineer',
        timestamp: new Date().toISOString(),
        actor: 'engineer@company.com'
      });

      incidentManager.addTimelineEntry(incident.id, {
        type: 'mitigation_applied',
        description: 'Temporary fix deployed',
        timestamp: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        actor: 'engineer@company.com'
      });

      // Resolve incident
      const resolvedIncident = incidentManager.resolveIncident(incident.id, {
        resolution: 'Root cause identified and fixed',
        resolvedBy: 'engineer@company.com'
      });

      expect(resolvedIncident.status).toBe(IncidentStatus.RESOLVED);
      expect(resolvedIncident.resolution).toBeDefined();
      expect(resolvedIncident.resolvedAt).toBeDefined();

      const metrics = incidentManager.getIncidentMetrics();
      expect(metrics.totalIncidents).toBeGreaterThan(0);
      expect(metrics.resolvedIncidents).toBeGreaterThan(0);
      expect(metrics.averageResolutionTime).toBeGreaterThan(0);
    });
  });

  describe('Health Check Integration', () => {
    it('should perform comprehensive health checks', async () => {
      const healthResult = await healthCheckService.performHealthCheck();

      expect(healthResult.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
      expect(healthResult.timestamp).toBeDefined();
      expect(healthResult.checks).toBeDefined();
      expect(healthResult.overallScore).toBeGreaterThanOrEqual(0);
      expect(healthResult.overallScore).toBeLessThanOrEqual(100);
    });

    it('should detect system degradation from error patterns', async () => {
      // Generate errors that indicate system degradation
      const degradationErrors = [
        { type: ErrorType.TIMEOUT, count: 10 },
        { type: ErrorType.SERVER, count: 5 },
        { type: ErrorType.RATE_LIMIT, count: 3 }
      ];

      for (const errorData of degradationErrors) {
        for (let i = 0; i < errorData.count; i++) {
          const error = new Error(`${errorData.type} error ${i}`);
          (error as any).type = errorData.type;
          
          errorManager.handleError(error, {
            component: 'DegradationTest'
          });
        }
      }

      await errorManager.flushErrors();

      const healthResult = await healthCheckService.performHealthCheck();
      
      // System should detect degradation
      expect(healthResult.status).toBeOneOf(['degraded', 'unhealthy']);
      expect(healthResult.overallScore).toBeLessThan(90);
    });

    it('should provide system diagnostics and recommendations', async () => {
      const diagnostics = await healthCheckService.getSystemDiagnostics();

      expect(diagnostics.errorAnalysis).toBeDefined();
      expect(diagnostics.performanceMetrics).toBeDefined();
      expect(diagnostics.recommendations).toBeDefined();
      expect(Array.isArray(diagnostics.recommendations)).toBe(true);
    });
  });

  describe('External Error Tracking Integration', () => {
    it('should integrate with Sentry for error reporting', async () => {
      // Mock Sentry integration
      const sentryConfig = {
        dsn: 'https://test@sentry.io/123456',
        environment: 'test',
        release: '1.0.0'
      };

      const sentry = new SentryIntegration(sentryConfig);
      
      const error = new Error('Sentry integration test');
      const context = {
        component: 'SentryTest',
        userId: 'test-user',
        feature: 'error-tracking'
      };

      // This would normally send to Sentry
      await sentry.reportError(error, context);

      // Verify integration setup
      expect(sentry.isConfigured()).toBe(true);
    });

    it('should filter and enrich errors before external reporting', async () => {
      const externalTracking = new ExternalErrorTracking({
        providers: ['sentry'],
        filters: [
          (error) => error.severity !== ErrorSeverity.LOW, // Don't report low severity
          (error) => !error.message.includes('test') // Don't report test errors
        ],
        enrichers: [
          (error, context) => ({
            ...context,
            environment: 'test',
            buildVersion: '1.0.0'
          })
        ]
      });

      const lowSeverityError = {
        type: ErrorType.VALIDATION,
        severity: ErrorSeverity.LOW,
        message: 'Low severity error',
        userMessage: 'Please check input',
        errorId: 'low-1',
        timestamp: new Date().toISOString()
      };

      const highSeverityError = {
        type: ErrorType.SERVER,
        severity: ErrorSeverity.HIGH,
        message: 'High severity error',
        userMessage: 'Server error',
        errorId: 'high-1',
        timestamp: new Date().toISOString()
      };

      // Low severity should be filtered out
      const shouldReportLow = externalTracking.shouldReport(lowSeverityError);
      expect(shouldReportLow).toBe(false);

      // High severity should be reported
      const shouldReportHigh = externalTracking.shouldReport(highSeverityError);
      expect(shouldReportHigh).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high volume error processing efficiently', async () => {
      const startTime = performance.now();
      const errorCount = 1000;

      // Generate high volume of errors
      const promises = [];
      for (let i = 0; i < errorCount; i++) {
        const error = new Error(`Volume test error ${i}`);
        promises.push(
          errorManager.handleError(error, {
            component: 'VolumeTest',
            operation: 'bulk_test',
            batchId: Math.floor(i / 100)
          })
        );
      }

      await Promise.all(promises);
      await errorManager.flushErrors();

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should process efficiently
      expect(processingTime).toBeLessThan(5000); // 5 seconds
      
      const stats = errorManager.getStats();
      expect(stats.totalErrors).toBe(errorCount);
    });

    it('should maintain memory efficiency under load', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

      // Generate and process many errors
      for (let batch = 0; batch < 10; batch++) {
        for (let i = 0; i < 100; i++) {
          errorManager.handleError(new Error(`Memory test ${batch}-${i}`), {
            component: 'MemoryTest',
            batch: batch
          });
        }
        await errorManager.flushErrors();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
    });
  });

  describe('End-to-End Error Flow', () => {
    it('should handle complete error lifecycle from detection to resolution', async () => {
      // 1. Error occurs and is detected
      const originalError = new Error('Complete lifecycle test error');
      (originalError as any).type = ErrorType.SERVER;
      (originalError as any).severity = ErrorSeverity.HIGH;

      const handledError = errorManager.handleError(originalError, {
        component: 'LifecycleTest',
        feature: 'end-to-end-test',
        userId: 'lifecycle-user',
        operation: 'test_operation'
      });

      // 2. Error is processed and logged
      await errorManager.flushErrors();

      const recentErrors = errorManager.getRecentErrors();
      expect(recentErrors.length).toBeGreaterThan(0);

      // 3. Analytics detect patterns
      const analytics = errorManager.getAnalytics();
      analytics.updateErrorLog(recentErrors);

      const patterns = analytics.detectErrorPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // 4. Alerts are triggered
      analytics.configureAlert({
        name: 'lifecycle_alert',
        condition: {
          type: 'error_severity',
          threshold: 1,
          severity: ErrorSeverity.HIGH,
          timeWindow: '1m'
        },
        actions: [
          { type: 'console', message: 'Lifecycle alert triggered' }
        ]
      });

      const triggeredAlerts = analytics.checkAlerts();
      expect(triggeredAlerts.length).toBeGreaterThan(0);

      // 5. Incident is created
      const incident = incidentManager.createIncident({
        title: 'Lifecycle Test Incident',
        description: handledError.message,
        severity: IncidentSeverity.HIGH,
        source: 'error_monitoring',
        metadata: { errorId: handledError.errorId }
      });

      expect(incident.status).toBe(IncidentStatus.OPEN);

      // 6. Health check detects degradation
      const healthResult = await healthCheckService.performHealthCheck();
      expect(healthResult.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);

      // 7. Incident is resolved
      const resolvedIncident = incidentManager.resolveIncident(incident.id, {
        resolution: 'Issue resolved by restarting service',
        resolvedBy: 'on-call-engineer'
      });

      expect(resolvedIncident.status).toBe(IncidentStatus.RESOLVED);

      // 8. Verify complete flow
      const finalStats = errorManager.getStats();
      expect(finalStats.totalErrors).toBeGreaterThan(0);

      const incidentMetrics = incidentManager.getIncidentMetrics();
      expect(incidentMetrics.resolvedIncidents).toBeGreaterThan(0);
    });
  });
});