/**
 * Usage Tracker and Quota Monitor
 * Tracks API usage, costs, and monitors quotas
 */

export interface UsageMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    rateLimited: number;
  };
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  costs: {
    total: number;
    byModel: Record<string, number>;
  };
  timeWindows: {
    lastHour: UsageWindow;
    lastDay: UsageWindow;
    lastMonth: UsageWindow;
  };
}

export interface UsageWindow {
  requests: number;
  tokens: number;
  cost: number;
  startTime: number;
  endTime: number;
}

export interface QuotaConfig {
  maxRequestsPerHour?: number;
  maxRequestsPerDay?: number;
  maxRequestsPerMonth?: number;
  maxTokensPerHour?: number;
  maxTokensPerDay?: number;
  maxTokensPerMonth?: number;
  maxCostPerHour?: number;
  maxCostPerDay?: number;
  maxCostPerMonth?: number;
}

export interface QuotaStatus {
  requests: {
    hourly: { used: number; limit: number; percentage: number };
    daily: { used: number; limit: number; percentage: number };
    monthly: { used: number; limit: number; percentage: number };
  };
  tokens: {
    hourly: { used: number; limit: number; percentage: number };
    daily: { used: number; limit: number; percentage: number };
    monthly: { used: number; limit: number; percentage: number };
  };
  costs: {
    hourly: { used: number; limit: number; percentage: number };
    daily: { used: number; limit: number; percentage: number };
    monthly: { used: number; limit: number; percentage: number };
  };
  warnings: string[];
}

interface UsageRecord {
  timestamp: number;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  model: string;
  success: boolean;
  rateLimited: boolean;
}

export class UsageTracker {
  private records: UsageRecord[] = [];
  private quotaConfig: QuotaConfig;
  private warningThresholds = [0.8, 0.9, 0.95]; // 80%, 90%, 95%

  constructor(quotaConfig: QuotaConfig = {}) {
    this.quotaConfig = {
      maxRequestsPerHour: 1000,
      maxRequestsPerDay: 10000,
      maxRequestsPerMonth: 100000,
      maxTokensPerHour: 150000,
      maxTokensPerDay: 1000000,
      maxTokensPerMonth: 10000000,
      maxCostPerHour: 50,
      maxCostPerDay: 200,
      maxCostPerMonth: 1000,
      ...quotaConfig
    };

    // Clean up old records periodically
    setInterval(() => this.cleanupOldRecords(), 3600000); // Every hour
  }

  /**
   * Record API usage
   */
  recordUsage(usage: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    cost: number;
    model: string;
    success: boolean;
    rateLimited?: boolean;
  }): void {
    const record: UsageRecord = {
      timestamp: Date.now(),
      requests: usage.requests,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cost: usage.cost,
      model: usage.model,
      success: usage.success,
      rateLimited: usage.rateLimited || false
    };

    this.records.push(record);
  }

  /**
   * Get current usage metrics
   */
  getUsageMetrics(): UsageMetrics {
    const now = Date.now();
    const hourAgo = now - 3600000;
    const dayAgo = now - 86400000;
    const monthAgo = now - 2592000000; // 30 days

    const allRecords = this.records;
    const hourRecords = this.records.filter(r => r.timestamp >= hourAgo);
    const dayRecords = this.records.filter(r => r.timestamp >= dayAgo);
    const monthRecords = this.records.filter(r => r.timestamp >= monthAgo);

    return {
      requests: {
        total: allRecords.reduce((sum, r) => sum + r.requests, 0),
        successful: allRecords.filter(r => r.success).reduce((sum, r) => sum + r.requests, 0),
        failed: allRecords.filter(r => !r.success).reduce((sum, r) => sum + r.requests, 0),
        rateLimited: allRecords.filter(r => r.rateLimited).reduce((sum, r) => sum + r.requests, 0)
      },
      tokens: {
        prompt: allRecords.reduce((sum, r) => sum + r.promptTokens, 0),
        completion: allRecords.reduce((sum, r) => sum + r.completionTokens, 0),
        total: allRecords.reduce((sum, r) => sum + r.promptTokens + r.completionTokens, 0)
      },
      costs: {
        total: allRecords.reduce((sum, r) => sum + r.cost, 0),
        byModel: this.getCostsByModel(allRecords)
      },
      timeWindows: {
        lastHour: this.calculateWindow(hourRecords, hourAgo, now),
        lastDay: this.calculateWindow(dayRecords, dayAgo, now),
        lastMonth: this.calculateWindow(monthRecords, monthAgo, now)
      }
    };
  }

  /**
   * Check quota status and get warnings
   */
  checkQuotas(): QuotaStatus {
    const metrics = this.getUsageMetrics();
    const warnings: string[] = [];

    const requestsHourly = this.calculateQuotaUsage(
      metrics.timeWindows.lastHour.requests,
      this.quotaConfig.maxRequestsPerHour!
    );
    const requestsDaily = this.calculateQuotaUsage(
      metrics.timeWindows.lastDay.requests,
      this.quotaConfig.maxRequestsPerDay!
    );
    const requestsMonthly = this.calculateQuotaUsage(
      metrics.timeWindows.lastMonth.requests,
      this.quotaConfig.maxRequestsPerMonth!
    );

    const tokensHourly = this.calculateQuotaUsage(
      metrics.timeWindows.lastHour.tokens,
      this.quotaConfig.maxTokensPerHour!
    );
    const tokensDaily = this.calculateQuotaUsage(
      metrics.timeWindows.lastDay.tokens,
      this.quotaConfig.maxTokensPerDay!
    );
    const tokensMonthly = this.calculateQuotaUsage(
      metrics.timeWindows.lastMonth.tokens,
      this.quotaConfig.maxTokensPerMonth!
    );

    const costsHourly = this.calculateQuotaUsage(
      metrics.timeWindows.lastHour.cost,
      this.quotaConfig.maxCostPerHour!
    );
    const costsDaily = this.calculateQuotaUsage(
      metrics.timeWindows.lastDay.cost,
      this.quotaConfig.maxCostPerDay!
    );
    const costsMonthly = this.calculateQuotaUsage(
      metrics.timeWindows.lastMonth.cost,
      this.quotaConfig.maxCostPerMonth!
    );

    // Generate warnings
    this.checkThresholdWarnings('requests (hourly)', requestsHourly.percentage, warnings);
    this.checkThresholdWarnings('requests (daily)', requestsDaily.percentage, warnings);
    this.checkThresholdWarnings('requests (monthly)', requestsMonthly.percentage, warnings);
    this.checkThresholdWarnings('tokens (hourly)', tokensHourly.percentage, warnings);
    this.checkThresholdWarnings('tokens (daily)', tokensDaily.percentage, warnings);
    this.checkThresholdWarnings('tokens (monthly)', tokensMonthly.percentage, warnings);
    this.checkThresholdWarnings('costs (hourly)', costsHourly.percentage, warnings);
    this.checkThresholdWarnings('costs (daily)', costsDaily.percentage, warnings);
    this.checkThresholdWarnings('costs (monthly)', costsMonthly.percentage, warnings);

    return {
      requests: {
        hourly: requestsHourly,
        daily: requestsDaily,
        monthly: requestsMonthly
      },
      tokens: {
        hourly: tokensHourly,
        daily: tokensDaily,
        monthly: tokensMonthly
      },
      costs: {
        hourly: costsHourly,
        daily: costsDaily,
        monthly: costsMonthly
      },
      warnings
    };
  }

  /**
   * Check if a request would exceed quotas
   */
  wouldExceedQuota(estimatedTokens: number, estimatedCost: number): { allowed: boolean; reason?: string } {
    const quotaStatus = this.checkQuotas();

    // Check if any quota is already at 100%
    if (quotaStatus.requests.hourly.percentage >= 100) {
      return { allowed: false, reason: 'Hourly request quota exceeded' };
    }
    if (quotaStatus.tokens.hourly.percentage >= 100) {
      return { allowed: false, reason: 'Hourly token quota exceeded' };
    }
    if (quotaStatus.costs.hourly.percentage >= 100) {
      return { allowed: false, reason: 'Hourly cost quota exceeded' };
    }

    // Check if this request would exceed quotas
    const newTokenUsage = quotaStatus.tokens.hourly.used + estimatedTokens;
    const newCostUsage = quotaStatus.costs.hourly.used + estimatedCost;

    if (newTokenUsage > quotaStatus.tokens.hourly.limit) {
      return { allowed: false, reason: 'Request would exceed hourly token quota' };
    }
    if (newCostUsage > quotaStatus.costs.hourly.limit) {
      return { allowed: false, reason: 'Request would exceed hourly cost quota' };
    }

    return { allowed: true };
  }

  /**
   * Reset usage tracking
   */
  reset(): void {
    this.records = [];
  }

  private calculateWindow(records: UsageRecord[], startTime: number, endTime: number): UsageWindow {
    return {
      requests: records.reduce((sum, r) => sum + r.requests, 0),
      tokens: records.reduce((sum, r) => sum + r.promptTokens + r.completionTokens, 0),
      cost: records.reduce((sum, r) => sum + r.cost, 0),
      startTime,
      endTime
    };
  }

  private getCostsByModel(records: UsageRecord[]): Record<string, number> {
    const costsByModel: Record<string, number> = {};
    
    records.forEach(record => {
      if (!costsByModel[record.model]) {
        costsByModel[record.model] = 0;
      }
      costsByModel[record.model] += record.cost;
    });

    return costsByModel;
  }

  private calculateQuotaUsage(used: number, limit: number): { used: number; limit: number; percentage: number } {
    return {
      used,
      limit,
      percentage: limit > 0 ? (used / limit) * 100 : 0
    };
  }

  private checkThresholdWarnings(type: string, percentage: number, warnings: string[]): void {
    for (const threshold of this.warningThresholds) {
      if (percentage >= threshold * 100) {
        warnings.push(`${type} usage is at ${percentage.toFixed(1)}% of quota`);
        break; // Only add the highest threshold warning
      }
    }
  }

  private cleanupOldRecords(): void {
    const monthAgo = Date.now() - 2592000000; // 30 days
    this.records = this.records.filter(record => record.timestamp >= monthAgo);
  }
}