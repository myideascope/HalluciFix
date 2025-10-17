/**
 * Monitoring System Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { APIMonitor } from '../apiMonitor';
import { CostTracker } from '../costTracker';
import { MonitoringService } from '../monitoringService';

describe('APIMonitor', () => {
  let monitor: APIMonitor;

  beforeEach(() => {
    monitor = new APIMonitor({
      responseTimeThreshold: 1000,
      errorRateThreshold: 10,
      costThreshold: 5,
      quotaWarningEnabled: true,
      quotaCriticalEnabled: true
    });
  });

  it('should record API metrics', () => {
    const metric = {
      provider: 'openai',
      endpoint: 'chat/completions',
      responseTime: 500,
      statusCode: 200,
      timestamp: new Date(),
      tokenUsage: { prompt: 100, completion: 50, total: 150 },
      cost: 0.003
    };

    monitor.recordMetric(metric);
    const metrics = monitor.getProviderMetrics('openai');
    
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.avgResponseTime).toBe(500);
    expect(metrics.errorRate).toBe(0);
    expect(metrics.totalTokens).toBe(150);
  });

  it('should calculate error rates correctly', () => {
    // Add successful requests
    for (let i = 0; i < 8; i++) {
      monitor.recordMetric({
        provider: 'openai',
        endpoint: 'test',
        responseTime: 500,
        statusCode: 200,
        timestamp: new Date()
      });
    }

    // Add error requests
    for (let i = 0; i < 2; i++) {
      monitor.recordMetric({
        provider: 'openai',
        endpoint: 'test',
        responseTime: 500,
        statusCode: 500,
        timestamp: new Date()
      });
    }

    const metrics = monitor.getProviderMetrics('openai');
    expect(metrics.errorRate).toBe(20); // 2/10 = 20%
  });

  it('should track quota usage', () => {
    monitor.setQuota({
      provider: 'openai',
      quotaType: 'requests',
      limit: 100,
      used: 0,
      resetDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      warningThreshold: 80,
      criticalThreshold: 95
    });

    // Record some requests
    for (let i = 0; i < 85; i++) {
      monitor.recordMetric({
        provider: 'openai',
        endpoint: 'test',
        responseTime: 500,
        statusCode: 200,
        timestamp: new Date()
      });
    }

    const metrics = monitor.getProviderMetrics('openai');
    const quotaStatus = metrics.quotaStatus.find(q => q.type === 'requests');
    
    expect(quotaStatus?.usagePercentage).toBe(85);
    expect(quotaStatus?.status).toBe('warning');
  });

  it('should trigger alerts for high response times', () => {
    const alerts: any[] = [];
    monitor.onAlert((alert) => alerts.push(alert));

    monitor.recordMetric({
      provider: 'openai',
      endpoint: 'test',
      responseTime: 2000, // Above threshold
      statusCode: 200,
      timestamp: new Date()
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('response_time');
    expect(alerts[0].severity).toBe('warning');
  });
});

describe('CostTracker', () => {
  let costTracker: CostTracker;

  beforeEach(() => {
    costTracker = new CostTracker();
  });

  it('should calculate OpenAI costs correctly', () => {
    const cost = costTracker.calculateCost('openai', {
      inputTokens: 1000,
      outputTokens: 500,
      requests: 1
    });

    // Expected: (1000/1000 * 0.03) + (500/1000 * 0.06) = 0.03 + 0.03 = 0.06
    expect(cost).toBe(0.06);
  });

  it('should calculate Anthropic costs correctly', () => {
    const cost = costTracker.calculateCost('anthropic', {
      inputTokens: 2000,
      outputTokens: 1000,
      requests: 1
    });

    // Expected: (2000/1000 * 0.015) + (1000/1000 * 0.075) = 0.03 + 0.075 = 0.105
    expect(cost).toBe(0.105);
  });

  it('should track cost summaries', () => {
    const breakdown = {
      provider: 'openai',
      period: 'hour' as const,
      costs: {
        input: 0.03,
        output: 0.06,
        requests: 0,
        storage: 0,
        bandwidth: 0,
        total: 0.09
      },
      usage: {
        inputTokens: 1000,
        outputTokens: 1000,
        requests: 1,
        storageGB: 0,
        bandwidthGB: 0
      },
      timestamp: new Date()
    };

    costTracker.recordCostBreakdown(breakdown);
    const summary = costTracker.getCostSummary('openai', 'hour');

    expect(summary.totalCost).toBe(0.09);
    expect(summary.totalRequests).toBe(1);
    expect(summary.totalTokens).toBe(2000);
  });

  it('should trigger budget alerts', () => {
    const alerts: any[] = [];
    costTracker.onCostAlert((alert) => alerts.push(alert));

    costTracker.setBudget('openai', 0.05, 'day', 0.8);

    // Record cost that exceeds budget
    costTracker.recordCostBreakdown({
      provider: 'openai',
      period: 'hour',
      costs: {
        input: 0.03,
        output: 0.06,
        requests: 0,
        storage: 0,
        bandwidth: 0,
        total: 0.09
      },
      usage: {
        inputTokens: 1000,
        outputTokens: 1000,
        requests: 1,
        storageGB: 0,
        bandwidthGB: 0
      },
      timestamp: new Date()
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('budget_exceeded');
  });
});

describe('MonitoringService', () => {
  let monitoringService: MonitoringService;

  beforeEach(() => {
    monitoringService = new MonitoringService({
      enabled: true,
      apiMonitor: {
        responseTimeThreshold: 1000,
        errorRateThreshold: 10,
        costThreshold: 5,
        quotaWarningEnabled: true,
        quotaCriticalEnabled: true
      },
      costTracking: {
        enabled: true,
        budgets: {
          openai: {
            amount: 10,
            period: 'day',
            alertThreshold: 0.8
          }
        }
      }
    });
    monitoringService.initialize();
  });

  it('should wrap API calls and track metrics', async () => {
    const mockApiCall = vi.fn().mockResolvedValue({
      result: 'success',
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      }
    });

    const wrappedCall = monitoringService.wrapAPICall('openai', 'test', mockApiCall);
    const result = await wrappedCall();

    expect(result.result).toBe('success');
    expect(mockApiCall).toHaveBeenCalledOnce();

    const summary = monitoringService.getMetricsSummary();
    expect(summary.totalRequests).toBeGreaterThan(0);
  });

  it('should handle API call errors', async () => {
    const mockApiCall = vi.fn().mockRejectedValue(new Error('API Error'));
    const wrappedCall = monitoringService.wrapAPICall('openai', 'test', mockApiCall);

    await expect(wrappedCall()).rejects.toThrow('API Error');

    const summary = monitoringService.getMetricsSummary();
    expect(summary.errorRate).toBeGreaterThan(0);
  });

  it('should provide status information', () => {
    const status = monitoringService.getStatus();
    
    expect(status.enabled).toBe(true);
    expect(status.initialized).toBe(true);
    expect(status.apiMonitorActive).toBe(true);
    expect(status.costTrackingActive).toBe(true);
  });
});

describe('Integration Tests', () => {
  beforeEach(() => {
    // Clear any existing instances
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should integrate all monitoring components', async () => {
    const { getMonitoringService, getAPIMonitor, getCostTracker } = await import('../index');
    
    const config = {
      enabled: true,
      apiMonitor: {
        responseTimeThreshold: 1000,
        errorRateThreshold: 5,
        costThreshold: 1,
        quotaWarningEnabled: true,
        quotaCriticalEnabled: true
      },
      costTracking: {
        enabled: true,
        budgets: {
          test_provider: {
            amount: 5,
            period: 'day',
            alertThreshold: 0.8
          }
        }
      }
    };

    const monitoringService = getMonitoringService(config);
    const apiMonitor = getAPIMonitor(config.apiMonitor);
    const costTracker = getCostTracker();

    expect(monitoringService).toBeDefined();
    expect(apiMonitor).toBeDefined();
    expect(costTracker).toBeDefined();

    const status = monitoringService.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.initialized).toBe(true);
  });
});