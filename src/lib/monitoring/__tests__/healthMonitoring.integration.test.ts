/**
 * Health Monitoring Integration Tests
 * Tests the integration between health checks, infrastructure metrics, and incident tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { healthCheckSystem, HealthStatus } from '../healthCheckSystem';
import { infrastructureMetrics } from '../infrastructureMetrics';
import { incidentTracker } from '../incidentTracker';

// Mock external dependencies
vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    }))
  }
}));

vi.mock('../../performanceMonitor', () => ({
  performanceMonitor: {
    getPerformanceReport: vi.fn(() => ({
      averageExecutionTime: 100,
      totalQueries: 50,
      errorRate: 0.02,
      slowQueries: []
    }))
  }
}));

describe('Health Monitoring Integration', () => {
  beforeEach(() => {
    // Reset all systems
    healthCheckSystem.stopPeriodicChecks();
    infrastructureMetrics.stopMonitoring();
    incidentTracker.stopMonitoring();
  });

  afterEach(() => {
    // Cleanup
    healthCheckSystem.stopPeriodicChecks();
    infrastructureMetrics.stopMonitoring();
    incidentTracker.stopMonitoring();
  });

  describe('Health Check System', () => {
    it('should register and execute health checks', async () => {
      // Register a test health check
      healthCheckSystem.registerCheck({
        name: 'test_check',
        description: 'Test health check',
        check: async () => ({
          status: HealthStatus.HEALTHY,
          message: 'Test check passed',
          duration: 0,
          timestamp: ''
        })
      });

      // Execute the check
      const result = await healthCheckSystem.executeCheck('test_check');
      
      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.message).toBe('Test check passed');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeTruthy();
    });

    it('should execute all checks and determine overall status', async () => {
      // Register multiple checks
      healthCheckSystem.registerCheck({
        name: 'healthy_check',
        description: 'Healthy check',
        check: async () => ({
          status: HealthStatus.HEALTHY,
          message: 'All good',
          duration: 0,
          timestamp: ''
        })
      });

      healthCheckSystem.registerCheck({
        name: 'degraded_check',
        description: 'Degraded check',
        check: async () => ({
          status: HealthStatus.DEGRADED,
          message: 'Some issues',
          duration: 0,
          timestamp: ''
        })
      });

      const result = await healthCheckSystem.executeAllChecks();
      
      expect(result.status).toBe(HealthStatus.DEGRADED);
      expect(result.summary.total).toBeGreaterThan(0);
      expect(result.summary.degraded).toBeGreaterThan(0);
    });

    it('should handle check timeouts', async () => {
      healthCheckSystem.registerCheck({
        name: 'timeout_check',
        description: 'Check that times out',
        timeout: 100,
        check: async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return {
            status: HealthStatus.HEALTHY,
            message: 'Should not reach here',
            duration: 0,
            timestamp: ''
          };
        }
      });

      const result = await healthCheckSystem.executeCheck('timeout_check');
      
      expect(result.status).toBe(HealthStatus.CRITICAL);
      expect(result.message).toContain('timeout');
    });
  });

  describe('Infrastructure Metrics', () => {
    it('should collect resource metrics', async () => {
      const metrics = await infrastructureMetrics.collectMetrics();
      
      expect(metrics.timestamp).toBeTruthy();
      expect(metrics.memory).toBeDefined();
      expect(metrics.network).toBeDefined();
      expect(metrics.storage).toBeDefined();
    });

    it('should register and monitor services', () => {
      infrastructureMetrics.registerService('test_service', 'http://example.com/health');
      
      const services = infrastructureMetrics.getServiceAvailability();
      const testService = services.find(s => s.serviceName === 'test_service');
      
      expect(testService).toBeDefined();
      expect(testService?.serviceName).toBe('test_service');
    });

    it('should trigger alerts when thresholds are exceeded', async () => {
      const alerts: any[] = [];
      const unsubscribe = infrastructureMetrics.onAlert((alert) => {
        alerts.push(alert);
      });

      // Add a threshold that should trigger
      infrastructureMetrics.addThreshold('test_threshold', {
        metric: 'memory.percentage',
        operator: 'greater_than',
        value: 0, // This should always trigger
        severity: 'high',
        enabled: true
      });

      // Collect metrics to trigger threshold check
      await infrastructureMetrics.collectMetrics();

      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(alerts.length).toBeGreaterThan(0);
      
      unsubscribe();
    });
  });

  describe('Incident Tracker', () => {
    it('should create incident from health check failure', async () => {
      const healthResult = await healthCheckSystem.executeAllChecks();
      
      // Mock a critical health result
      const criticalHealthResult = {
        ...healthResult,
        status: HealthStatus.CRITICAL,
        summary: {
          ...healthResult.summary,
          critical: 1
        }
      };

      const incident = incidentTracker.createIncidentFromHealthCheck(criticalHealthResult);
      
      expect(incident).toBeDefined();
      expect(incident?.title).toContain('System Health Check Failed');
      expect(incident?.severity).toBe('critical');
      expect(incident?.sourceType).toBe('health_check');
    });

    it('should create manual incident', () => {
      const incident = incidentTracker.createManualIncident(
        'Test Incident',
        'This is a test incident',
        'high' as any,
        'test_user'
      );

      expect(incident.title).toBe('Test Incident');
      expect(incident.description).toBe('This is a test incident');
      expect(incident.severity).toBe('high');
      expect(incident.sourceType).toBe('manual');
    });

    it('should update incident status', () => {
      const incident = incidentTracker.createManualIncident(
        'Test Incident',
        'Test description',
        'medium' as any
      );

      const updated = incidentTracker.updateIncident(incident.id, {
        status: 'resolved' as any,
        resolution: 'Test resolution'
      });

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('resolved');
      expect(updated?.resolution).toBe('Test resolution');
      expect(updated?.resolvedAt).toBeTruthy();
    });

    it('should create post-mortem for incident', () => {
      const incident = incidentTracker.createManualIncident(
        'Test Incident',
        'Test description',
        'high' as any
      );

      const postMortem = incidentTracker.createPostMortem(
        incident.id,
        'Test Post-Mortem',
        'Summary of the incident',
        'test_user'
      );

      expect(postMortem.incidentId).toBe(incident.id);
      expect(postMortem.title).toBe('Test Post-Mortem');
      expect(postMortem.summary).toBe('Summary of the incident');
      expect(postMortem.status).toBe('draft');
    });
  });

  describe('System Integration', () => {
    it('should integrate health checks with incident creation', async () => {
      const incidents: any[] = [];
      const unsubscribe = incidentTracker.onIncident((incident) => {
        incidents.push(incident);
      });

      // Register a failing health check
      healthCheckSystem.registerCheck({
        name: 'failing_check',
        description: 'Check that always fails',
        critical: true,
        check: async () => ({
          status: HealthStatus.CRITICAL,
          message: 'Critical failure',
          duration: 0,
          timestamp: ''
        })
      });

      // Execute health checks
      const healthResult = await healthCheckSystem.executeAllChecks();
      
      // Create incident from health result
      if (healthResult.status !== HealthStatus.HEALTHY) {
        incidentTracker.createIncidentFromHealthCheck(healthResult);
      }

      expect(incidents.length).toBeGreaterThan(0);
      expect(incidents[0].sourceType).toBe('health_check');
      
      unsubscribe();
    });

    it('should start and stop monitoring systems', () => {
      expect(() => {
        healthCheckSystem.startPeriodicChecks(1000);
        infrastructureMetrics.startMonitoring(1000, 2000);
        incidentTracker.startMonitoring(1000);
      }).not.toThrow();

      expect(() => {
        healthCheckSystem.stopPeriodicChecks();
        infrastructureMetrics.stopMonitoring();
        incidentTracker.stopMonitoring();
      }).not.toThrow();
    });
  });
});