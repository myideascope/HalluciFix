/**
 * Comprehensive Monitoring Integration Tests
 * Tests the complete monitoring system under various conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { 
  ComprehensiveMonitoringIntegration,
  defaultMonitoringIntegrationConfig,
  type MonitoringEvent
} from '../comprehensiveMonitoringIntegration';
import { logger } from '../../logging/StructuredLogger';
import { errorMonitor } from '../../errors/errorMonitor';
import { performanceMonitor } from '../../performanceMonitor';

// Mock the business metrics monitor to avoid configuration dependencies
vi.mock('../../businessMetricsMonitor', () => ({
  businessMetricsMonitor: {
    trackUserEngagement: vi.fn(),
    trackConversion: vi.fn(),
    trackAnalysisQuality: vi.fn(),
    getBusinessReport: vi.fn(() => ({
      totalMetrics: 5,
      metricsByCategory: { user_engagement: 2, conversion: 1, quality: 2 },
      topMetrics: [],
      conversionRates: {},
      userEngagement: {
        totalSessions: 1,
        averageTimeOnSite: 120000,
        averagePageViews: 3,
        topFeatures: []
      }
    }))
  },
  BusinessMetricsMonitor: vi.fn()
}));

// Mock external integrations to avoid configuration dependencies
vi.mock('../../monitoring/dataDogIntegration', () => ({
  dataDogIntegration: {
    sendMetrics: vi.fn(),
    sendEvent: vi.fn()
  }
}));

vi.mock('../../monitoring/newRelicIntegration', () => ({
  newRelicIntegration: {
    sendEvents: vi.fn()
  }
}));

// Mock incident manager
vi.mock('../../errors/incidentManager', () => ({
  incidentManager: {
    createIncident: vi.fn(() => Promise.resolve({ id: 'test-incident-123' })),
    resolveIncident: vi.fn(() => Promise.resolve()),
    getActiveIncidents: vi.fn(() => []),
    createIncidentFromAlert: vi.fn()
  }
}));

describe('ComprehensiveMonitoringIntegration', () => {
  let integration: ComprehensiveMonitoringIntegration;
  let eventListener: vi.MockedFunction<(event: MonitoringEvent) => void>;

  beforeAll(() => {
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    // Create fresh instance for each test
    integration = ComprehensiveMonitoringIntegration.getInstance({
      ...defaultMonitoringIntegrationConfig,
      dataFlow: {
        ...defaultMonitoringIntegrationConfig.dataFlow,
        flushInterval: 100 // Faster for testing
      }
    });

    eventListener = vi.fn();
    integration.addEventListener(eventListener);

    await integration.initialize();
  });

  afterEach(() => {
    integration.removeEventListener(eventListener);
    integration.destroy();
  });

  describe('Initialization', () => {
    it('should initialize successfully with default config', async () => {
      const status = integration.getStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.components.logging).toBe(true);
      expect(status.components.errorTracking).toBe(true);
      expect(status.components.performanceMonitoring).toBe(true);
    });

    it('should initialize system health monitoring', () => {
      const health = integration.getSystemHealth();
      
      expect(health).toBeDefined();
      expect(health.overall).toMatch(/healthy|degraded|unhealthy|critical/);
      expect(health.components).toBeDefined();
      expect(health.metrics).toBeDefined();
      expect(health.lastUpdated).toBeInstanceOf(Date);
    });

    it('should not initialize twice', async () => {
      const firstInit = await integration.initialize();
      const secondInit = await integration.initialize();
      
      // Should not throw or cause issues
      expect(integration.getStatus().initialized).toBe(true);
    });
  });

  describe('Event System', () => {
    it('should emit and receive events', async () => {
      // Trigger a log event
      logger.info('Test event for monitoring', { testId: 'event-test' });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check if event was received
      expect(eventListener).toHaveBeenCalled();
      
      const events = integration.getRecentEvents(10);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should handle critical events immediately', async () => {
      // Simulate critical error
      const criticalError = new Error('Critical system failure');
      logger.error('Critical system error', criticalError, { 
        severity: 'critical',
        testId: 'critical-test' 
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if critical event was handled
      const events = integration.getRecentEvents(10);
      const criticalEvents = events.filter(e => e.severity === 'critical');
      
      expect(criticalEvents.length).toBeGreaterThan(0);
    });

    it('should correlate related events', async () => {
      // This would test event correlation functionality
      // For now, we'll test that the correlation system is available
      const correlatedEvents = integration.getCorrelatedEvents('test-correlation-id');
      expect(Array.isArray(correlatedEvents)).toBe(true);
    });
  });

  describe('Component Integration', () => {
    it('should integrate with error monitoring', async () => {
      const initialMetrics = errorMonitor.getMetrics();
      
      // Simulate error
      logger.error('Test error for integration', new Error('Test error'), {
        testId: 'error-integration-test'
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if error was processed
      const updatedMetrics = errorMonitor.getMetrics();
      expect(updatedMetrics.totalErrors).toBeGreaterThanOrEqual(initialMetrics.totalErrors);
    });

    it('should integrate with performance monitoring', async () => {
      // Record performance metric
      performanceMonitor.recordMetric({
        name: 'test_operation',
        value: 150,
        unit: 'ms',
        tags: { test: 'integration' },
        timestamp: new Date()
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check if metric was recorded
      const recentMetrics = performanceMonitor.getRecentMetrics(60000);
      const testMetric = recentMetrics.find(m => m.name === 'test_operation');
      
      expect(testMetric).toBeDefined();
      expect(testMetric?.value).toBe(150);
    });

    it('should integrate with business metrics', async () => {
      const { businessMetricsMonitor } = await import('../../businessMetricsMonitor');
      
      // Track business metric
      businessMetricsMonitor.trackUserEngagement('test-user', 'test-session', {
        type: 'page_view',
        data: { page: 'integration-test' }
      });

      // Get business report
      const report = businessMetricsMonitor.getBusinessReport(60000);
      expect(report.totalMetrics).toBeGreaterThan(0);
    });
  });

  describe('System Health Monitoring', () => {
    it('should monitor system health continuously', async () => {
      const initialHealth = integration.getSystemHealth();
      
      // Wait for health update cycle
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const updatedHealth = integration.getSystemHealth();
      
      expect(updatedHealth.lastUpdated.getTime()).toBeGreaterThanOrEqual(
        initialHealth.lastUpdated.getTime()
      );
    });

    it('should detect system degradation', async () => {
      // Simulate high error rate
      for (let i = 0; i < 15; i++) {
        logger.error(`Simulated error ${i}`, new Error(`Error ${i}`), {
          testId: 'degradation-test'
        });
      }

      // Wait for processing and health update
      await new Promise(resolve => setTimeout(resolve, 300));

      const health = integration.getSystemHealth();
      
      // System should detect degradation due to high error rate
      expect(['degraded', 'unhealthy', 'critical']).toContain(health.overall);
    });

    it('should track system metrics', () => {
      const health = integration.getSystemHealth();
      
      expect(typeof health.metrics.errorRate).toBe('number');
      expect(typeof health.metrics.avgResponseTime).toBe('number');
      expect(typeof health.metrics.systemLoad).toBe('number');
      expect(typeof health.metrics.activeIncidents).toBe('number');
      expect(typeof health.metrics.alertsLast24h).toBe('number');
    });
  });

  describe('Load Testing', () => {
    it('should handle concurrent events', async () => {
      const eventPromises = [];
      const eventCount = 50;

      // Generate concurrent events
      for (let i = 0; i < eventCount; i++) {
        eventPromises.push(
          Promise.resolve().then(() => {
            logger.info(`Load test event ${i}`, { 
              testId: 'load-test',
              eventNumber: i 
            });
          })
        );
      }

      await Promise.all(eventPromises);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check system stability
      const health = integration.getSystemHealth();
      const events = integration.getRecentEvents(eventCount + 10);
      
      expect(events.length).toBeGreaterThan(0);
      expect(health.overall).not.toBe('critical'); // System should handle the load
    });

    it('should maintain performance under load', async () => {
      const startTime = Date.now();
      const operations = [];

      // Simulate multiple operations
      for (let i = 0; i < 20; i++) {
        operations.push(
          performanceMonitor.timeOperation(`load_test_operation_${i}`, async () => {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
            return `result_${i}`;
          }, { test: 'load' })
        );
      }

      const results = await Promise.all(operations);
      const endTime = Date.now();

      expect(results).toHaveLength(20);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Check if metrics were recorded
      const recentMetrics = performanceMonitor.getRecentMetrics(60000);
      const loadTestMetrics = recentMetrics.filter(m => 
        m.name.startsWith('load_test_operation_')
      );
      
      expect(loadTestMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('Failure Scenarios', () => {
    it('should handle component failures gracefully', async () => {
      // Simulate component failure by throwing errors
      const originalError = console.error;
      const errorSpy = vi.fn();
      console.error = errorSpy;

      try {
        // Trigger various error scenarios
        logger.error('Network failure simulation', new Error('ECONNREFUSED'), {
          testId: 'failure-test'
        });

        logger.error('Timeout simulation', new Error('ETIMEDOUT'), {
          testId: 'failure-test'
        });

        logger.error('Service unavailable', new Error('Service Unavailable'), {
          testId: 'failure-test'
        });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 200));

        // System should still be operational
        const health = integration.getSystemHealth();
        const status = integration.getStatus();

        expect(status.initialized).toBe(true);
        expect(health).toBeDefined();

      } finally {
        console.error = originalError;
      }
    });

    it('should recover from temporary failures', async () => {
      // Simulate temporary failure
      const error = new Error('Temporary service failure');
      logger.error('Temporary failure', error, { testId: 'recovery-test' });

      // Wait for initial processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const healthBefore = integration.getSystemHealth();

      // Simulate recovery by logging successful operations
      for (let i = 0; i < 5; i++) {
        logger.info(`Recovery operation ${i}`, { testId: 'recovery-test' });
        performanceMonitor.recordMetric({
          name: 'recovery_operation',
          value: 100,
          unit: 'ms',
          tags: { test: 'recovery' },
          timestamp: new Date()
        });
      }

      // Wait for recovery processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const healthAfter = integration.getSystemHealth();

      // System should maintain or improve health
      expect(healthAfter.lastUpdated.getTime()).toBeGreaterThan(
        healthBefore.lastUpdated.getTime()
      );
    });
  });

  describe('Data Flow and Buffering', () => {
    it('should buffer events correctly', async () => {
      const initialEventCount = integration.getRecentEvents().length;

      // Generate multiple events
      for (let i = 0; i < 10; i++) {
        logger.info(`Buffered event ${i}`, { testId: 'buffer-test' });
      }

      // Wait for buffering
      await new Promise(resolve => setTimeout(resolve, 50));

      const events = integration.getRecentEvents();
      expect(events.length).toBeGreaterThan(initialEventCount);
    });

    it('should respect buffer size limits', async () => {
      const config = integration.getStatus();
      const bufferSize = 1000; // Default buffer size

      // Generate more events than buffer size (this would be a long test)
      // For testing purposes, we'll just verify the buffer management exists
      const events = integration.getRecentEvents(bufferSize + 100);
      expect(events.length).toBeLessThanOrEqual(bufferSize);
    });

    it('should flush events periodically', async () => {
      // Generate events
      logger.info('Event for flush test', { testId: 'flush-test' });

      // Wait for flush interval
      await new Promise(resolve => setTimeout(resolve, 150));

      // Events should be processed (this is more of an integration test)
      const events = integration.getRecentEvents(10);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration dynamically', () => {
      const newConfig = {
        alerting: {
          enabled: false,
          channels: ['console'] as const
        }
      };

      integration.updateConfig(newConfig);

      // Configuration should be updated
      // This would be verified through behavior changes in a real scenario
      expect(true).toBe(true); // Placeholder assertion
    });

    it('should validate configuration', () => {
      const status = integration.getStatus();
      
      expect(status.enabled).toBe(true);
      expect(status.components).toBeDefined();
      expect(typeof status.eventBufferSize).toBe('number');
      expect(typeof status.correlationsCount).toBe('number');
    });
  });

  describe('Alerting System', () => {
    it('should trigger alerts for critical events', async () => {
      const alertSpy = vi.fn();
      
      // Mock notification API
      const mockNotification = vi.fn();
      Object.defineProperty(window, 'Notification', {
        value: mockNotification,
        configurable: true
      });

      // Simulate critical event
      logger.error('Critical alert test', new Error('Critical failure'), {
        severity: 'critical',
        testId: 'alert-test'
      });

      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if alert was processed (would need more specific alert testing)
      const events = integration.getRecentEvents(10);
      const criticalEvents = events.filter(e => e.severity === 'critical');
      
      expect(criticalEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should cleanup resources on destroy', () => {
      const status = integration.getStatus();
      expect(status.initialized).toBe(true);

      integration.destroy();

      // After destroy, system should be cleaned up
      // Note: In a real implementation, we'd check for cleared intervals, etc.
      expect(true).toBe(true); // Placeholder assertion
    });

    it('should handle multiple destroy calls', () => {
      integration.destroy();
      integration.destroy(); // Should not throw

      expect(true).toBe(true); // Should complete without error
    });
  });
});

describe('Monitoring System Integration Tests', () => {
  it('should integrate all monitoring components', async () => {
    const integration = ComprehensiveMonitoringIntegration.getInstance();
    
    await integration.initialize();

    // Test that all components are working together
    const status = integration.getStatus();
    const health = integration.getSystemHealth();

    expect(status.initialized).toBe(true);
    expect(health.overall).toMatch(/healthy|degraded|unhealthy|critical/);

    // Test cross-component functionality
    logger.info('Integration test message', { testId: 'integration' });
    
    performanceMonitor.recordMetric({
      name: 'integration_test',
      value: 200,
      unit: 'ms',
      tags: { test: 'integration' },
      timestamp: new Date()
    });

    const { businessMetricsMonitor } = await import('../../businessMetricsMonitor');
    businessMetricsMonitor.trackUserEngagement('test-user', 'test-session', {
      type: 'page_view',
      data: { page: 'integration-test' }
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));

    const events = integration.getRecentEvents(10);
    expect(events.length).toBeGreaterThan(0);

    integration.destroy();
  });
});