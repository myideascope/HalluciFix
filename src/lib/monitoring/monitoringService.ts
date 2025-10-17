/**
 * Monitoring Service Integration
 * Automatically tracks API calls and integrates with existing services
 */

import { getAPIMonitor, APIMetrics } from './apiMonitor';
import { getCostTracker, CostBreakdown } from './costTracker';

export interface MonitoringConfig {
  enabled: boolean;
  apiMonitor: {
    responseTimeThreshold: number;
    errorRateThreshold: number;
    costThreshold: number;
    quotaWarningEnabled: boolean;
    quotaCriticalEnabled: boolean;
    webhookUrl?: string;
  };
  costTracking: {
    enabled: boolean;
    budgets: Record<string, {
      amount: number;
      period: 'day' | 'month';
      alertThreshold: number;
    }>;
  };
}

class MonitoringService {
  private config: MonitoringConfig;
  private initialized = false;

  constructor(config: MonitoringConfig) {
    this.config = config;
  }

  /**
   * Initialize monitoring services
   */
  initialize(): void {
    if (!this.config.enabled || this.initialized) return;

    try {
      // Initialize API monitor
      const apiMonitor = getAPIMonitor(this.config.apiMonitor);
      
      // Initialize cost tracker and set budgets
      const costTracker = getCostTracker();
      
      if (this.config.costTracking.enabled) {
        Object.entries(this.config.costTracking.budgets).forEach(([provider, budget]) => {
          costTracker.setBudget(provider, budget.amount, budget.period, budget.alertThreshold);
        });
      }

      this.initialized = true;
      console.log('Monitoring service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize monitoring service:', error);
    }
  }

  /**
   * Track API call with automatic cost calculation
   */
  trackAPICall(
    provider: string,
    endpoint: string,
    startTime: number,
    endTime: number,
    statusCode: number,
    tokenUsage?: { prompt: number; completion: number; total: number },
    errorType?: string
  ): void {
    if (!this.config.enabled || !this.initialized) return;

    try {
      const responseTime = endTime - startTime;
      const timestamp = new Date();

      // Calculate cost if token usage is provided
      let cost = 0;
      if (tokenUsage && this.config.costTracking.enabled) {
        const costTracker = getCostTracker();
        cost = costTracker.calculateCost(provider, {
          inputTokens: tokenUsage.prompt,
          outputTokens: tokenUsage.completion,
          requests: 1
        });
      }

      // Record API metrics
      const apiMonitor = getAPIMonitor();
      const metric: APIMetrics = {
        provider,
        endpoint,
        responseTime,
        statusCode,
        timestamp,
        tokenUsage,
        cost,
        errorType
      };

      apiMonitor.recordMetric(metric);

      // Record cost breakdown if cost tracking is enabled
      if (this.config.costTracking.enabled && cost > 0) {
        const costTracker = getCostTracker();
        const breakdown: CostBreakdown = {
          provider,
          period: 'hour',
          costs: {
            input: tokenUsage ? (tokenUsage.prompt / 1000) * (costTracker.getCostModel(provider)?.pricing.input || 0) : 0,
            output: tokenUsage ? (tokenUsage.completion / 1000) * (costTracker.getCostModel(provider)?.pricing.output || 0) : 0,
            requests: costTracker.getCostModel(provider)?.pricing.request || 0,
            storage: 0,
            bandwidth: 0,
            total: cost
          },
          usage: {
            inputTokens: tokenUsage?.prompt || 0,
            outputTokens: tokenUsage?.completion || 0,
            requests: 1,
            storageGB: 0,
            bandwidthGB: 0
          },
          timestamp
        };

        costTracker.recordCostBreakdown(breakdown);
      }
    } catch (error) {
      console.error('Error tracking API call:', error);
    }
  }

  /**
   * Create a wrapper function for API calls that automatically tracks metrics
   */
  wrapAPICall<T>(
    provider: string,
    endpoint: string,
    apiCall: () => Promise<T>
  ): () => Promise<T> {
    return async () => {
      const startTime = Date.now();
      let statusCode = 200;
      let errorType: string | undefined;
      let tokenUsage: { prompt: number; completion: number; total: number } | undefined;

      try {
        const result = await apiCall();
        
        // Extract token usage if available in result
        if (typeof result === 'object' && result !== null && 'usage' in result) {
          const usage = (result as any).usage;
          if (usage && typeof usage === 'object') {
            tokenUsage = {
              prompt: usage.prompt_tokens || 0,
              completion: usage.completion_tokens || 0,
              total: usage.total_tokens || 0
            };
          }
        }

        return result;
      } catch (error) {
        statusCode = this.extractStatusCode(error);
        errorType = this.extractErrorType(error);
        throw error;
      } finally {
        const endTime = Date.now();
        this.trackAPICall(provider, endpoint, startTime, endTime, statusCode, tokenUsage, errorType);
      }
    };
  }

  /**
   * Extract status code from error
   */
  private extractStatusCode(error: any): number {
    if (error?.response?.status) return error.response.status;
    if (error?.status) return error.status;
    if (error?.code === 'ECONNREFUSED') return 503;
    if (error?.code === 'ETIMEDOUT') return 408;
    return 500;
  }

  /**
   * Extract error type from error
   */
  private extractErrorType(error: any): string {
    if (error?.response?.data?.error?.type) return error.response.data.error.type;
    if (error?.type) return error.type;
    if (error?.code) return error.code;
    if (error?.name) return error.name;
    return 'unknown_error';
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    enabled: boolean;
    initialized: boolean;
    apiMonitorActive: boolean;
    costTrackingActive: boolean;
  } {
    return {
      enabled: this.config.enabled,
      initialized: this.initialized,
      apiMonitorActive: this.config.enabled && this.initialized,
      costTrackingActive: this.config.enabled && this.initialized && this.config.costTracking.enabled
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.initialized && newConfig.costTracking?.budgets) {
      const costTracker = getCostTracker();
      Object.entries(newConfig.costTracking.budgets).forEach(([provider, budget]) => {
        costTracker.setBudget(provider, budget.amount, budget.period, budget.alertThreshold);
      });
    }
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary(): {
    providers: string[];
    totalRequests: number;
    totalCost: number;
    avgResponseTime: number;
    errorRate: number;
  } {
    if (!this.initialized) {
      return {
        providers: [],
        totalRequests: 0,
        totalCost: 0,
        avgResponseTime: 0,
        errorRate: 0
      };
    }

    try {
      const apiMonitor = getAPIMonitor();
      const costTracker = getCostTracker();
      const providers = costTracker.getProviders();

      let totalRequests = 0;
      let totalCost = 0;
      let totalResponseTime = 0;
      let totalErrors = 0;

      providers.forEach(provider => {
        const metrics = apiMonitor.getProviderMetrics(provider);
        const costSummary = costTracker.getCostSummary(provider, 'hour');
        
        totalRequests += metrics.totalRequests;
        totalCost += costSummary.totalCost;
        totalResponseTime += metrics.avgResponseTime * metrics.totalRequests;
        totalErrors += (metrics.errorRate / 100) * metrics.totalRequests;
      });

      return {
        providers,
        totalRequests,
        totalCost,
        avgResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
        errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting metrics summary:', error);
      return {
        providers: [],
        totalRequests: 0,
        totalCost: 0,
        avgResponseTime: 0,
        errorRate: 0
      };
    }
  }
}

// Default configuration
export const defaultMonitoringConfig: MonitoringConfig = {
  enabled: true,
  apiMonitor: {
    responseTimeThreshold: 5000, // 5 seconds
    errorRateThreshold: 10, // 10%
    costThreshold: 10, // $10 per hour
    quotaWarningEnabled: true,
    quotaCriticalEnabled: true
  },
  costTracking: {
    enabled: true,
    budgets: {
      openai: {
        amount: 100, // $100 per day
        period: 'day',
        alertThreshold: 0.8 // 80%
      },
      anthropic: {
        amount: 50, // $50 per day
        period: 'day',
        alertThreshold: 0.8
      },
      google_drive: {
        amount: 10, // $10 per day
        period: 'day',
        alertThreshold: 0.8
      }
    }
  }
};

// Singleton instance
let monitoringServiceInstance: MonitoringService | null = null;

export function getMonitoringService(config?: MonitoringConfig): MonitoringService {
  if (!monitoringServiceInstance) {
    monitoringServiceInstance = new MonitoringService(config || defaultMonitoringConfig);
    monitoringServiceInstance.initialize();
  }
  return monitoringServiceInstance;
}

export { MonitoringService };