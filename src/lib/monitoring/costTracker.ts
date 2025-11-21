import { logger } from './logging';

/**
 * Cost Tracking Service for API Providers
 * Calculates and tracks costs for different API providers based on their pricing models
 */

export interface CostModel {
  provider: string;
  pricing: {
    input?: number; // Cost per 1K input tokens
    output?: number; // Cost per 1K output tokens
    request?: number; // Cost per request
    storage?: number; // Cost per GB/month
    bandwidth?: number; // Cost per GB transferred
  };
  currency: string;
}

export interface CostBreakdown {
  provider: string;
  period: 'hour' | 'day' | 'month';
  costs: {
    input: number;
    output: number;
    requests: number;
    storage: number;
    bandwidth: number;
    total: number;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    requests: number;
    storageGB: number;
    bandwidthGB: number;
  };
  timestamp: Date;
}

export interface CostAlert {
  type: 'budget_exceeded' | 'unusual_spike' | 'quota_approaching';
  provider: string;
  currentCost: number;
  threshold: number;
  period: string;
  message: string;
  timestamp: Date;
}

class CostTracker {
  private costModels: Map<string, CostModel> = new Map();
  private costHistory: CostBreakdown[] = [];
  private budgets: Map<string, { amount: number; period: 'day' | 'month'; alertThreshold: number }> = new Map();
  private alertCallbacks: ((alert: CostAlert) => void)[] = [];

  constructor() {
    this.initializeDefaultCostModels();
  }

  /**
   * Initialize default cost models for major providers
   */
  private initializeDefaultCostModels(): void {
    // OpenAI GPT-4 pricing (as of 2024)
    this.setCostModel({
      provider: 'openai',
      pricing: {
        input: 0.03, // $0.03 per 1K input tokens
        output: 0.06, // $0.06 per 1K output tokens
        request: 0 // No per-request cost
      },
      currency: 'USD'
    });

    // Anthropic Claude pricing
    this.setCostModel({
      provider: 'anthropic',
      pricing: {
        input: 0.015, // $0.015 per 1K input tokens
        output: 0.075, // $0.075 per 1K output tokens
        request: 0
      },
      currency: 'USD'
    });

    // Google Drive API pricing
    this.setCostModel({
      provider: 'google_drive',
      pricing: {
        request: 0.0004, // $0.0004 per request
        storage: 0.02, // $0.02 per GB/month
        bandwidth: 0.12 // $0.12 per GB
      },
      currency: 'USD'
    });

    // Wikipedia API (free but track for completeness)
    this.setCostModel({
      provider: 'wikipedia',
      pricing: {
        request: 0,
        bandwidth: 0
      },
      currency: 'USD'
    });
  }

  /**
   * Set cost model for a provider
   */
  setCostModel(model: CostModel): void {
    this.costModels.set(model.provider, model);
  }

  /**
   * Calculate cost for API usage
   */
  calculateCost(provider: string, usage: {
    inputTokens?: number;
    outputTokens?: number;
    requests?: number;
    storageGB?: number;
    bandwidthGB?: number;
  }): number {
    const model = this.costModels.get(provider);
    if (!model) {
      console.warn(`No cost model found for provider: ${provider}`);
      return 0;
    }

    let totalCost = 0;

    // Token-based costs
    if (usage.inputTokens && model.pricing.input) {
      totalCost += (usage.inputTokens / 1000) * model.pricing.input;
    }
    if (usage.outputTokens && model.pricing.output) {
      totalCost += (usage.outputTokens / 1000) * model.pricing.output;
    }

    // Request-based costs
    if (usage.requests && model.pricing.request) {
      totalCost += usage.requests * model.pricing.request;
    }

    // Storage costs (monthly)
    if (usage.storageGB && model.pricing.storage) {
      totalCost += usage.storageGB * model.pricing.storage;
    }

    // Bandwidth costs
    if (usage.bandwidthGB && model.pricing.bandwidth) {
      totalCost += usage.bandwidthGB * model.pricing.bandwidth;
    }

    return totalCost;
  }

  /**
   * Record cost breakdown for a period
   */
  recordCostBreakdown(breakdown: CostBreakdown): void {
    this.costHistory.push(breakdown);
    
    // Keep only last 1000 records
    if (this.costHistory.length > 1000) {
      this.costHistory = this.costHistory.slice(-1000);
    }

    // Check budget alerts
    this.checkBudgetAlerts(breakdown);
  }

  /**
   * Set budget for a provider
   */
  setBudget(provider: string, amount: number, period: 'day' | 'month', alertThreshold: number = 0.8): void {
    this.budgets.set(provider, { amount, period, alertThreshold });
  }

  /**
   * Get cost summary for a provider and time period
   */
  getCostSummary(provider: string, period: 'hour' | 'day' | 'month', startDate?: Date): CostSummary {
    const now = new Date();
    const start = startDate || this.getPeriodStart(period, now);
    
    const relevantBreakdowns = this.costHistory.filter(
      breakdown => breakdown.provider === provider && 
                  breakdown.timestamp >= start && 
                  breakdown.timestamp <= now
    );

    const totalCost = relevantBreakdowns.reduce((sum, breakdown) => sum + breakdown.costs.total, 0);
    const totalRequests = relevantBreakdowns.reduce((sum, breakdown) => sum + breakdown.usage.requests, 0);
    const totalTokens = relevantBreakdowns.reduce((sum, breakdown) => 
      sum + breakdown.usage.inputTokens + breakdown.usage.outputTokens, 0);

    const budget = this.budgets.get(provider);
    const budgetUsage = budget ? (totalCost / budget.amount) * 100 : 0;

    return {
      provider,
      period,
      startDate: start,
      endDate: now,
      totalCost,
      totalRequests,
      totalTokens,
      averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
      averageCostPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
      budgetUsage,
      budgetRemaining: budget ? Math.max(0, budget.amount - totalCost) : null,
      costTrend: this.calculateCostTrend(provider, period)
    };
  }

  /**
   * Calculate cost trend (percentage change from previous period)
   */
  private calculateCostTrend(provider: string, period: 'hour' | 'day' | 'month'): number {
    const now = new Date();
    const currentStart = this.getPeriodStart(period, now);
    const previousStart = this.getPeriodStart(period, new Date(currentStart.getTime() - this.getPeriodDuration(period)));

    const currentCost = this.getCostForPeriod(provider, currentStart, now);
    const previousCost = this.getCostForPeriod(provider, previousStart, currentStart);

    if (previousCost === 0) return 0;
    return ((currentCost - previousCost) / previousCost) * 100;
  }

  /**
   * Get total cost for a specific period
   */
  private getCostForPeriod(provider: string, start: Date, end: Date): number {
    return this.costHistory
      .filter(breakdown => 
        breakdown.provider === provider && 
        breakdown.timestamp >= start && 
        breakdown.timestamp <= end
      )
      .reduce((sum, breakdown) => sum + breakdown.costs.total, 0);
  }

  /**
   * Get period start date
   */
  private getPeriodStart(period: 'hour' | 'day' | 'month', date: Date): Date {
    const start = new Date(date);
    
    switch (period) {
      case 'hour':
        start.setMinutes(0, 0, 0);
        break;
      case 'day':
        start.setHours(0, 0, 0, 0);
        break;
      case 'month':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
    }
    
    return start;
  }

  /**
   * Get period duration in milliseconds
   */
  private getPeriodDuration(period: 'hour' | 'day' | 'month'): number {
    switch (period) {
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
      case 'month':
        return 30 * 24 * 60 * 60 * 1000; // Approximate
    }
  }

  /**
   * Check budget alerts
   */
  private checkBudgetAlerts(breakdown: CostBreakdown): void {
    const budget = this.budgets.get(breakdown.provider);
    if (!budget) return;

    const periodStart = this.getPeriodStart(budget.period, breakdown.timestamp);
    const periodCost = this.getCostForPeriod(breakdown.provider, periodStart, breakdown.timestamp);
    const budgetUsage = periodCost / budget.amount;

    // Budget exceeded
    if (budgetUsage >= 1.0) {
      this.triggerCostAlert({
        type: 'budget_exceeded',
        provider: breakdown.provider,
        currentCost: periodCost,
        threshold: budget.amount,
        period: budget.period,
        message: `Budget exceeded for ${breakdown.provider}: $${periodCost.toFixed(2)} / $${budget.amount}`,
        timestamp: new Date()
      });
    }
    // Approaching budget threshold
    else if (budgetUsage >= budget.alertThreshold) {
      this.triggerCostAlert({
        type: 'quota_approaching',
        provider: breakdown.provider,
        currentCost: periodCost,
        threshold: budget.amount * budget.alertThreshold,
        period: budget.period,
        message: `Budget threshold reached for ${breakdown.provider}: ${(budgetUsage * 100).toFixed(1)}% used`,
        timestamp: new Date()
      });
    }

    // Unusual cost spike detection
    const trend = this.calculateCostTrend(breakdown.provider, budget.period);
    if (trend > 200) { // 200% increase
      this.triggerCostAlert({
        type: 'unusual_spike',
        provider: breakdown.provider,
        currentCost: periodCost,
        threshold: 0,
        period: budget.period,
        message: `Unusual cost spike detected for ${breakdown.provider}: ${trend.toFixed(1)}% increase`,
        timestamp: new Date()
      });
    }
  }

  /**
   * Trigger cost alert
   */
  private triggerCostAlert(alert: CostAlert): void {
    console.warn(`[Cost Alert] ${alert.type.toUpperCase()}: ${alert.message}`);
    
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        logger.error("Error in cost alert callback:", error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Register cost alert callback
   */
  onCostAlert(callback: (alert: CostAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get all providers with cost models
   */
  getProviders(): string[] {
    return Array.from(this.costModels.keys());
  }

  /**
   * Get cost model for a provider
   */
  getCostModel(provider: string): CostModel | undefined {
    return this.costModels.get(provider);
  }

  /**
   * Export cost data for reporting
   */
  exportCostData(startDate: Date, endDate: Date): CostBreakdown[] {
    return this.costHistory.filter(
      breakdown => breakdown.timestamp >= startDate && breakdown.timestamp <= endDate
    );
  }
}

// Types
export interface CostSummary {
  provider: string;
  period: 'hour' | 'day' | 'month';
  startDate: Date;
  endDate: Date;
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
  averageCostPerRequest: number;
  averageCostPerToken: number;
  budgetUsage: number;
  budgetRemaining: number | null;
  costTrend: number;
}

// Singleton instance
let costTrackerInstance: CostTracker | null = null;

export function getCostTracker(): CostTracker {
  if (!costTrackerInstance) {
    costTrackerInstance = new CostTracker();
  }
  return costTrackerInstance;
}

export { CostTracker };