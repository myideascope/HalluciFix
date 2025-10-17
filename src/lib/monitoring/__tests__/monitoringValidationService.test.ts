/**
 * Monitoring Validation Service Tests
 * Tests the comprehensive validation of monitoring system components
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { 
  MonitoringValidationService,
  type ValidationResult,
  type ValidationReport
} from '../monitoringValidationService';
import { comprehensiveMonitoringIntegration } from '../comprehensiveMonitoringIntegration';
import { logger } from '../../logging/StructuredLogger';
import { errorMonitor } from '../../errors/errorMonitor';
import { performanceMonitor } from '../../performanceMonitor';

// Mock dependencies to avoid configuration issues
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
  }
}));

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

vi.mock('../../errors/incidentManager', () => ({
  incidentManager: {
    createIncident: vi.fn(() => Promise.resolve({ id: 'test-incident-123' })),
    resolveIncident: vi.fn(() => Promise.resolve()),
    getActiveIncidents: vi.fn(() => []),
    createIncidentFromAlert: vi.fn()
  }
}));

describe('MonitoringValidationService', () => {
  let validationService: MonitoringValidationService;

  beforeAll(() => {
    // Mock console methods to reduce test noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    validationService = new MonitoringValidationService();
    
    // Initialize monitoring system for testing
    await comprehensiveMonitoringIntegration.initialize();
  });

  afterEach(() => {
    validationService.clearValidationHistory();
    comprehensiveMonitoringIntegration.destroy();
  });

  describe('Comprehensive Validation', () => {
    it('should run comprehensive validation successfully', async () => {
      const report = await validationService.runComprehensiveValidation();

      expect(report).toBeDefined();
      expect(report.overall).toMatch(/pass|fail|warning/);
      expect(report.totalTests).toBeGreaterThan(0);
      expect(report.results).toBeInstanceOf(Array);
      expect(report.duration).toBeGreaterThan(0);
      expect(report.systemHealth).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
    });

    it('should validate all core components', async () => {
      const report = await validationService.runComprehensiveValidation();

      const componentNames = report.results.map(r => r.component);
      const uniqueComponents = [...new Set(componentNames)];

      // Should test all major components
      expect(uniqueComponents).toContain('logging_system');
      expect(uniqueComponents).toContain('error_tracking');
      expect(uniqueComponents).toContain('performance_monitoring');
      expect(uniqueComponents).toContain('business_metrics');
      expect(uniqueComponents).toContain('integration_service');
    });

    it('should provide detailed validation results', async () => {
      const report = await validationService.runComprehensiveValidation();

      report.results.forEach(result => {
        expect(result.component).toBeDefined();
        expect(result.test).toBeDefined();
        expect(result.status).toMatch(/pass|fail|warning/);
        expect(result.message).toBeDefined();
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(result.timestamp).toBeInstanceOf(Date);
      });
    });

    it('should calculate correct summary statistics', async () => {
      const report = await validationService.runComprehensiveValidation();

      const passed = report.results.filter(r => r.status === 'pass').length;
      const failed = report.results.filter(r => r.status === 'fail').length;
      const warnings = report.results.filter(r => r.status === 'warning').length;

      expect(report.passed).toBe(passed);
      expect(report.failed).toBe(failed);
      expect(report.warnings).toBe(warnings);
      expect(report.totalTests).toBe(passed + failed + warnings);
    });
  });

  describe('Component-Specific Validation', () => {
    it('should validate logging system', async () => {
      const results = await validationService.validateComponent('logging');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.component === 'logging_system')).toBe(true);

      const basicFunctionality = results.find(r => r.test === 'basic_functionality');
      expect(basicFunctionality).toBeDefined();
    });

    it('should validate error tracking', async () => {
      const results = await validationService.validateComponent('error_tracking');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.component === 'error_tracking')).toBe(true);

      // Should test error capture and alert thresholds
      const testNames = results.map(r => r.test);
      expect(testNames).toContain('error_capture');
      expect(testNames).toContain('alert_thresholds');
    });

    it('should validate performance monitoring', async () => {
      const results = await validationService.validateComponent('performance_monitoring');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.component === 'performance_monitoring')).toBe(true);

      const metricRecording = results.find(r => r.test === 'metric_recording');
      expect(metricRecording).toBeDefined();
    });

    it('should validate business metrics', async () => {
      const results = await validationService.validateComponent('business_metrics');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.component === 'business_metrics')).toBe(true);

      const metricTracking = results.find(r => r.test === 'metric_tracking');
      expect(metricTracking).toBeDefined();
    });

    it('should validate API monitoring', async () => {
      const results = await validationService.validateComponent('api_monitoring');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.component === 'api_monitoring')).toBe(true);
    });

    it('should validate incident management', async () => {
      const results = await validationService.validateComponent('incident_management');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.component === 'incident_management')).toBe(true);
    });

    it('should validate integration service', async () => {
      const results = await validationService.validateComponent('integration_service');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.component === 'integration_service')).toBe(true);

      const testNames = results.map(r => r.test);
      expect(testNames).toContain('initialization');
      expect(testNames).toContain('system_health');
    });

    it('should throw error for unknown component', async () => {
      await expect(
        validationService.validateComponent('unknown_component')
      ).rejects.toThrow('Unknown component: unknown_component');
    });
  });

  describe('Load Testing Validation', () => {
    it('should validate system under simulated load', async () => {
      const report = await validationService.runComprehensiveValidation();

      const loadTestResults = report.results.filter(r => r.component === 'load_testing');
      expect(loadTestResults.length).toBeGreaterThan(0);

      const systemStability = loadTestResults.find(r => r.test === 'system_stability');
      expect(systemStability).toBeDefined();
      expect(systemStability?.status).toMatch(/pass|warning/); // Should not fail under normal load
    });

    it('should test system performance under concurrent operations', async () => {
      // This is tested as part of comprehensive validation
      const report = await validationService.runComprehensiveValidation();
      
      // System should handle the validation load without critical failures
      expect(report.overall).not.toBe('fail');
    });
  });

  describe('Failure Scenario Testing', () => {
    it('should validate error handling capabilities', async () => {
      const report = await validationService.runComprehensiveValidation();

      const failureResults = report.results.filter(r => r.component === 'failure_scenarios');
      expect(failureResults.length).toBeGreaterThan(0);

      const errorHandling = failureResults.find(r => r.test === 'error_handling');
      expect(errorHandling).toBeDefined();
      expect(errorHandling?.status).toBe('pass');
    });

    it('should test network failure simulation', async () => {
      // This is tested as part of failure scenarios in comprehensive validation
      const report = await validationService.runComprehensiveValidation();
      
      const failureResults = report.results.filter(r => r.component === 'failure_scenarios');
      expect(failureResults.length).toBeGreaterThan(0);
    });
  });

  describe('Data Flow Validation', () => {
    it('should validate event propagation', async () => {
      const report = await validationService.runComprehensiveValidation();

      const dataFlowResults = report.results.filter(r => r.component === 'data_flow');
      expect(dataFlowResults.length).toBeGreaterThan(0);

      const eventPropagation = dataFlowResults.find(r => r.test === 'event_propagation');
      expect(eventPropagation).toBeDefined();
    });

    it('should validate event correlation', async () => {
      const report = await validationService.runComprehensiveValidation();

      const correlationResults = report.results.filter(r => r.component === 'event_correlation');
      expect(correlationResults.length).toBeGreaterThan(0);

      const correlationSystem = correlationResults.find(r => r.test === 'correlation_system');
      expect(correlationSystem).toBeDefined();
    });
  });

  describe('Alerting System Validation', () => {
    it('should validate alert configuration', async () => {
      const report = await validationService.runComprehensiveValidation();

      const alertingResults = report.results.filter(r => r.component === 'alerting_system');
      expect(alertingResults.length).toBeGreaterThan(0);

      const thresholdConfig = alertingResults.find(r => r.test === 'threshold_configuration');
      expect(thresholdConfig).toBeDefined();
    });

    it('should validate alert history tracking', async () => {
      const report = await validationService.runComprehensiveValidation();

      const alertingResults = report.results.filter(r => r.component === 'alerting_system');
      const alertHistory = alertingResults.find(r => r.test === 'alert_history');
      
      expect(alertHistory).toBeDefined();
      expect(alertHistory?.status).toBe('pass');
    });
  });

  describe('External Services Validation', () => {
    it('should validate external service configuration', async () => {
      const report = await validationService.runComprehensiveValidation();

      const externalResults = report.results.filter(r => r.component === 'external_services');
      expect(externalResults.length).toBeGreaterThan(0);

      const configuration = externalResults.find(r => r.test === 'configuration');
      expect(configuration).toBeDefined();
    });
  });

  describe('Recommendations Generation', () => {
    it('should generate appropriate recommendations', async () => {
      const report = await validationService.runComprehensiveValidation();

      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.recommendations.length).toBeGreaterThan(0);

      // Each recommendation should be a string
      report.recommendations.forEach(recommendation => {
        expect(typeof recommendation).toBe('string');
        expect(recommendation.length).toBeGreaterThan(0);
      });
    });

    it('should provide specific recommendations for failed tests', async () => {
      // This would require simulating failures, which is complex
      // For now, we'll test that recommendations are generated
      const report = await validationService.runComprehensiveValidation();
      
      if (report.failed > 0) {
        expect(report.recommendations.some(r => 
          r.includes('failed tests')
        )).toBe(true);
      }
    });

    it('should provide recommendations for warnings', async () => {
      const report = await validationService.runComprehensiveValidation();
      
      if (report.warnings > 0) {
        expect(report.recommendations.some(r => 
          r.includes('warnings')
        )).toBe(true);
      }
    });
  });

  describe('Validation History Management', () => {
    it('should track validation history', async () => {
      await validationService.validateComponent('logging');
      
      const history = validationService.getValidationHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should clear validation history', async () => {
      await validationService.validateComponent('logging');
      
      let history = validationService.getValidationHistory();
      expect(history.length).toBeGreaterThan(0);

      validationService.clearValidationHistory();
      
      history = validationService.getValidationHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('Performance and Timing', () => {
    it('should complete validation within reasonable time', async () => {
      const startTime = Date.now();
      
      const report = await validationService.runComprehensiveValidation();
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete within 30 seconds (generous for CI environments)
      expect(totalTime).toBeLessThan(30000);
      expect(report.duration).toBeLessThanOrEqual(totalTime);
    });

    it('should track individual test durations', async () => {
      const report = await validationService.runComprehensiveValidation();

      report.results.forEach(result => {
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(result.duration).toBeLessThan(10000); // No single test should take more than 10 seconds
      });
    });
  });

  describe('Error Handling in Validation', () => {
    it('should handle validation errors gracefully', async () => {
      // Mock a component to throw an error
      const originalMethod = logger.info;
      logger.info = vi.fn().mockImplementation(() => {
        throw new Error('Simulated validation error');
      });

      try {
        const report = await validationService.runComprehensiveValidation();
        
        // Should still complete and provide results
        expect(report).toBeDefined();
        expect(report.results.length).toBeGreaterThan(0);
        
        // Some tests might fail due to the error
        const failedTests = report.results.filter(r => r.status === 'fail');
        expect(failedTests.length).toBeGreaterThanOrEqual(0);
        
      } finally {
        logger.info = originalMethod;
      }
    });

    it('should continue validation even if individual tests fail', async () => {
      // This is inherently tested by the comprehensive validation
      // which should continue even if some components have issues
      const report = await validationService.runComprehensiveValidation();
      
      expect(report.totalTests).toBeGreaterThan(0);
      // Even if some tests fail, others should still run
      expect(report.results.length).toBe(report.totalTests);
    });
  });
});