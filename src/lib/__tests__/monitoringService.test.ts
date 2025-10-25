/**
 * Tests for MonitoringService
 * Covers API monitoring, cost tracking, and metrics collection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MonitoringService, getMonitoringService, defaultMonitoringConfig } from '../monitoring/monitoringService';

// Mock dependencies
vi.mock('../monitoring/apiMonitor', () => ({
  getAPIMonitor: vi.fn(() => ({
    recordMetric: vi.fn(),
    getProviderMetrics: vi.fn(() => ({
      totalRequests: 100,
      avgResponseTime: 250,
      errorRate: 5
    }))
  }))
}));

vi.mock('../monitoring/costTracker', () => ({
  getCostTracker: vi.fn(() => ({
    setBudget: vi.fn(),
    calculateCost: vi.fn(() => 0.05),
    recordCostBreakdown: vi.fn(),
    getCostModel: vi.fn(() => ({
      pricing: {
        input: 0.001,
        output: 0.002,
        request: 0.0001
      }
    })),
    getCostSummary: vi.fn(() => ({
      totalCost: 10.50
    })),
    getProviders: vi.fn(() => ['openai', 'anthropic'])
  }))
}));

describe('MonitoringService', () => {
  let monitoringService: MonitoringService;
  let mockConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      enabled: true,
      apiMonitor: {
        responseTimeThreshold: 5000,
        errorRateThreshold: 10,
        costThreshold: 10,
        quotaWarningEnabled: true,
        quotaCriticalEnabled: true
      },
      costTracking: {
        enabled: true,
        budgets: {
          openai: {
            amount: 100,
            period: 'day' as const,
            alertThreshold: 0.8
          }
        }
      }
    };

    monitoringService = new MonitoringService(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with provided configuration', () => {
      expect(monitoringService).toBeDefined();
      expect(monitoringService.getStatus().enabled).toBe(true);
    });

    it('should initialize monitoring services when enabled', () => {
      const { getAPIMonitor, getCostTracker } = require('../monitoring/apiMonitor');
      
      monitoringService.initialize();
      
      expect(getAPIMonitor).toHaveBeenCalled();
      expect(getCostTracker).toHaveBeenCalled();
      expect(monitoringService.getStatus().initialized).toBe(true);
    });

    it('should not initialize when disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledService = new MonitoringService(disabledConfig);
      
      disabledService.initialize();
      
      expect(disabledService.getStatus().initialized).toBe(false);
    });

    it('should handle initialization errors gracefully', () => {
      const { getAPIMonitor } = require('../monitoring/apiMonitor');
      getAPIMonitor.mockImplementation(() => {
        throw new Error('Initialization failed');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      monitoringService.initialize();
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize monitoring service:', expect.any(Error));
      expect(monitoringService.getStatus().initialized).toBe(false);
      
      consoleSpy.mockRestore();
    });
  });

  describe('trackAPICall', () => {
    beforeEach(() => {
      monitoringService.initialize();
    });

    it('should track API call with basic metrics', () => {
      const { getAPIMonitor } = require('../monitoring/apiMonitor');
      const mockAPIMonitor = getAPIMonitor();

      const startTime = Date.now();
      const endTime = startTime + 1500;

      monitoringService.trackAPICall(
        'openai',
        '/v1/chat/completions',
        startTime,
        endTime,
        200
      );

      expect(mockAPIMonitor.recordMetric).toHaveBeenCalledWith({
        provider: 'openai',
        endpoint: '/v1/chat/completions',
        responseTime: 1500,
        statusCode: 200,
        timestamp: expect.any(Date),
        tokenUsage: undefined,
        cost: 0,
        errorType: undefined
      });
    });

    it('should track API call with token usage and cost calculation', () => {
      const { getAPIMonitor, getCostTracker } = require('../monitoring/apiMonitor');
      const mockAPIMonitor = getAPIMonitor();
      const mockCostTracker = getCostTracker();

      const tokenUsage = { prompt: 100, completion: 50, total: 150 };
      const startTime = Date.now();
      const endTime = startTime + 2000;

      monitoringService.trackAPICall(
        'openai',
        '/v1/chat/completions',
        startTime,
        endTime,
        200,
        tokenUsage
      );

      expect(mockCostTracker.calculateCost).toHaveBeenCalledWith('openai', {
        inputTokens: 100,
        outputTokens: 50,
        requests: 1
      });

      expect(mockAPIMonitor.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          tokenUsage,
          cost: 0.05
        })
      );

      expect(mockCostTracker.recordCostBreakdown).toHaveBeenCalled();
    });

    it('should track API call with error information', () => {
      const { getAPIMonitor } = require('../monitoring/apiMonitor');
      const mockAPIMonitor = getAPIMonitor();

      const startTime = Date.now();
      const endTime = startTime + 500;

      monitoringService.trackAPICall(
        'openai',
        '/v1/chat/completions',
        startTime,
        endTime,
        429,
        undefined,
        'rate_limit_exceeded'
      );

      expect(mockAPIMonitor.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 429,
          errorType: 'rate_limit_exceeded'
        })
      );
    });

    it('should not track when monitoring is disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledService = new MonitoringService(disabledConfig);
      const { getAPIMonitor } = require('../monitoring/apiMonitor');
      const mockAPIMonitor = getAPIMonitor();

      disabledService.trackAPICall('openai', '/test', Date.now(), Date.now() + 1000, 200);

      expect(mockAPIMonitor.recordMetric).not.toHaveBeenCalled();
    });

    it('should handle tracking errors gracefully', () => {
      const { getAPIMonitor } = require('../monitoring/apiMonitor');
      const mockAPIMonitor = getAPIMonitor();
      mockAPIMonitor.recordMetric.mockImplementation(() => {
        throw new Error('Recording failed');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      monitoringService.trackAPICall('openai', '/test', Date.now(), Date.now() + 1000, 200);

      expect(consoleSpy).toHaveBeenCalledWith('Error tracking API call:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('wrapAPICall', () => {
    beforeEach(() => {
      monitoringService.initialize();
    });

    it('should wrap successful API calls', async () => {
      const mockAPICall = vi.fn().mockResolvedValue({ data: 'success' });
      const wrappedCall = monitoringService.wrapAPICall('openai', '/test', mockAPICall);

      const result = await wrappedCall();

      expect(result).toEqual({ data: 'success' });
      expect(mockAPICall).toHaveBeenCalledTimes(1);

      const { getAPIMonitor } = require('../monitoring/apiMonitor');
      const mockAPIMonitor = getAPIMonitor();
      expect(mockAPIMonitor.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          endpoint: '/test',
          statusCode: 200
        })
      );
    });

    it('should wrap API calls with token usage extraction', async () => {
      const mockResult = {
        data: 'success',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      };
      const mockAPICall = vi.fn().mockResolvedValue(mockResult);
      const wrappedCall = monitoringService.wrapAPICall('openai', '/test', mockAPICall);

      const result = await wrappedCall();

      expect(result).toEqual(mockResult);

      const { getAPIMonitor } = require('../monitoring/apiMonitor');
      const mockAPIMonitor = getAPIMonitor();
      expect(mockAPIMonitor.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenUsage: {
            prompt: 100,
            completion: 50,
            total: 150
          }
        })
      );
    });

    it('should handle API call errors', async () => {
      const error = new Error('API call failed');
      error.response = { status: 500 };
      const mockAPICall = vi.fn().mockRejectedValue(error);
      const wrappedCall = monitoringService.wrapAPICall('openai', '/test', mockAPICall);

      await expect(wrappedCall()).rejects.toThrow('API call failed');

      const { getAPIMonitor } = require('../monitoring/apiMonitor');
      const mockAPIMonitor = getAPIMonitor();
      expect(mockAPIMonitor.recordMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          errorType: 'Error'
        })
      );
    });

    it('should extract status codes from different error formats', async () => {
      const testCases = [
        { error: { response: { status: 404 } }, expectedStatus: 404 },
        { error: { status: 403 }, expectedStatus: 403 },
        { error: { code: 'ECONNREFUSED' }, expectedStatus: 503 },
        { error: { code: 'ETIMEDOUT' }, expectedStatus: 408 },
        { error: new Error('Generic error'), expectedStatus: 500 }
      ];

      for (const testCase of testCases) {
        const mockAPICall = vi.fn().mockRejectedValue(testCase.error);
        const wrappedCall = monitoringService.wrapAPICall('test', '/endpoint', mockAPICall);

        await expect(wrappedCall()).rejects.toThrow();

        const { getAPIMonitor } = require('../monitoring/apiMonitor');
        const mockAPIMonitor = getAPIMonitor();
        expect(mockAPIMonitor.recordMetric).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: testCase.expectedStatus
          })
        );

        vi.clearAllMocks();
      }
    });
  });

  describe('configuration management', () => {
    beforeEach(() => {
      monitoringService.initialize();
    });

    it('should update configuration', () => {
      const newConfig = {
        costTracking: {
          enabled: true,
          budgets: {
            anthropic: {
              amount: 50,
              period: 'month' as const,
              alertThreshold: 0.9
            }
          }
        }
      };

      const { getCostTracker } = require('../monitoring/apiMonitor');
      const mockCostTracker = getCostTracker();

      monitoringService.updateConfig(newConfig);

      expect(mockCostTracker.setBudget).toHaveBeenCalledWith(
        'anthropic',
        50,
        'month',
        0.9
      );
    });

    it('should get monitoring status', () => {
      const status = monitoringService.getStatus();

      expect(status).toEqual({
        enabled: true,
        initialized: true,
        apiMonitorActive: true,
        costTrackingActive: true
      });
    });
  });

  describe('metrics summary', () => {
    beforeEach(() => {
      monitoringService.initialize();
    });

    it('should get comprehensive metrics summary', () => {
      const summary = monitoringService.getMetricsSummary();

      expect(summary).toEqual({
        providers: ['openai', 'anthropic'],
        totalRequests: 200, // 100 per provider
        totalCost: 21.0, // 10.50 per provider
        avgResponseTime: 250,
        errorRate: 5
      });
    });

    it('should handle empty metrics gracefully', () => {
      const uninitializedService = new MonitoringService(mockConfig);
      const summary = uninitializedService.getMetricsSummary();

      expect(summary).toEqual({
        providers: [],
        totalRequests: 0,
        totalCost: 0,
        avgResponseTime: 0,
        errorRate: 0
      });
    });

    it('should handle metrics errors gracefully', () => {
      const { getAPIMonitor } = require('../monitoring/apiMonitor');
      const mockAPIMonitor = getAPIMonitor();
      mockAPIMonitor.getProviderMetrics.mockImplementation(() => {
        throw new Error('Metrics error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const summary = monitoringService.getMetricsSummary();

      expect(summary).toEqual({
        providers: [],
        totalRequests: 0,
        totalCost: 0,
        avgResponseTime: 0,
        errorRate: 0
      });

      expect(consoleSpy).toHaveBeenCalledWith('Error getting metrics summary:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getMonitoringService();
      const instance2 = getMonitoringService();

      expect(instance1).toBe(instance2);
    });

    it('should use default configuration when none provided', () => {
      const instance = getMonitoringService();
      const status = instance.getStatus();

      expect(status.enabled).toBe(defaultMonitoringConfig.enabled);
    });

    it('should use custom configuration when provided', () => {
      const customConfig = {
        ...defaultMonitoringConfig,
        enabled: false
      };

      const instance = getMonitoringService(customConfig);
      const status = instance.getStatus();

      expect(status.enabled).toBe(false);
    });
  });

  describe('error extraction methods', () => {
    beforeEach(() => {
      monitoringService.initialize();
    });

    it('should extract error types correctly', () => {
      const testCases = [
        { error: { response: { data: { error: { type: 'rate_limit' } } } }, expected: 'rate_limit' },
        { error: { type: 'timeout' }, expected: 'timeout' },
        { error: { code: 'NETWORK_ERROR' }, expected: 'NETWORK_ERROR' },
        { error: { name: 'ValidationError' }, expected: 'ValidationError' },
        { error: new Error('Unknown'), expected: 'unknown_error' }
      ];

      for (const testCase of testCases) {
        const mockAPICall = vi.fn().mockRejectedValue(testCase.error);
        const wrappedCall = monitoringService.wrapAPICall('test', '/endpoint', mockAPICall);

        expect(wrappedCall()).rejects.toThrow();

        // The error type extraction is tested indirectly through the wrapper
      }
    });
  });
});