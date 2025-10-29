/**
 * AI Cost Monitoring Service
 * Monitors and controls AI service costs and usage
 */

import { logger } from './logging';
import { performanceMonitor } from './performanceMonitor';
import { errorManager } from './errors';

interface CostUsage {
  userId: string;
  provider: string;
  model: string;
  tokensUsed: number;
  estimatedCost: number;
  timestamp: string;
  analysisType: string;
}

interface UserCostSummary {
  userId: string;
  dailyCost: number;
  weeklyCost: number;
  monthlyCost: number;
  totalTokens: number;
  analysisCount: number;
  lastAnalysis: string;
  topModels: Array<{
    model: string;
    cost: number;
    usage: number;
  }>;
}

interface CostLimits {
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  perAnalysisLimit: number;
  warningThreshold: number; // Percentage of limit
}

interface CostAlert {
  userId: string;
  alertType: 'warning' | 'limit_exceeded' | 'daily_summary';
  message: string;
  currentCost: number;
  limit: number;
  timestamp: string;
}

export class AICostMonitoringService {
  private logger = logger.child({ component: 'AICostMonitoringService' });
  private costUsage: Map<string, CostUsage[]> = new Map();
  private userLimits: Map<string, CostLimits> = new Map();
  private isInitialized = false;

  // Default cost limits
  private defaultLimits: CostLimits = {
    dailyLimit: parseFloat(process.env.VITE_AI_DAILY_COST_LIMIT || '10.00'),
    weeklyLimit: parseFloat(process.env.VITE_AI_WEEKLY_COST_LIMIT || '50.00'),
    monthlyLimit: parseFloat(process.env.VITE_AI_MONTHLY_COST_LIMIT || '200.00'),
    perAnalysisLimit: parseFloat(process.env.VITE_AI_PER_ANALYSIS_LIMIT || '1.00'),
    warningThreshold: parseFloat(process.env.VITE_AI_WARNING_THRESHOLD || '0.8'), // 80%
  };

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.logger.info('Initializing AI Cost Monitoring Service');

      // Load existing usage data from storage
      await this.loadUsageData();

      // Start periodic cleanup and reporting
      this.startPeriodicTasks();

      this.isInitialized = true;
      this.logger.info('AI Cost Monitoring Service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize AI Cost Monitoring Service', error as Error);
      throw error;
    }
  }

  /**
   * Record AI usage and cost
   */
  async recordUsage(usage: CostUsage): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const performanceId = performanceMonitor.startOperation('cost_monitoring_record_usage', {
      userId: usage.userId,
      provider: usage.provider,
      cost: usage.estimatedCost.toString(),
    });

    try {
      this.logger.debug('Recording AI usage', {
        userId: usage.userId,
        provider: usage.provider,
        model: usage.model,
        cost: usage.estimatedCost,
        tokens: usage.tokensUsed,
      });

      // Get user's usage history
      const userUsage = this.costUsage.get(usage.userId) || [];
      userUsage.push(usage);
      this.costUsage.set(usage.userId, userUsage);

      // Check cost limits
      await this.checkCostLimits(usage.userId, usage.estimatedCost);

      // Persist usage data
      await this.persistUsageData(usage);

      performanceMonitor.endOperation(performanceId, { status: 'success' });

      // Record business metrics
      performanceMonitor.recordBusinessMetric('ai_cost_recorded', usage.estimatedCost, 'currency', {
        userId: usage.userId,
        provider: usage.provider,
        model: usage.model,
      });

      performanceMonitor.recordBusinessMetric('ai_tokens_recorded', usage.tokensUsed, 'count', {
        userId: usage.userId,
        provider: usage.provider,
        model: usage.model,
      });

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      const handledError = errorManager.handleError(error, {
        component: 'AICostMonitoringService',
        feature: 'usage-recording',
        operation: 'recordUsage',
        userId: usage.userId,
      });

      this.logger.error('Failed to record AI usage', handledError);
      throw handledError;
    }
  }

  /**
   * Check if user can perform analysis within cost limits
   */
  async canPerformAnalysis(userId: string, estimatedCost: number): Promise<{
    allowed: boolean;
    reason?: string;
    currentCost: number;
    limit: number;
    remainingBudget: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const limits = this.getUserLimits(userId);
      const currentCost = await this.getDailyCost(userId);

      // Check per-analysis limit
      if (estimatedCost > limits.perAnalysisLimit) {
        return {
          allowed: false,
          reason: `Analysis cost ($${estimatedCost.toFixed(4)}) exceeds per-analysis limit ($${limits.perAnalysisLimit})`,
          currentCost,
          limit: limits.perAnalysisLimit,
          remainingBudget: limits.dailyLimit - currentCost,
        };
      }

      // Check daily limit
      const projectedDailyCost = currentCost + estimatedCost;
      if (projectedDailyCost > limits.dailyLimit) {
        return {
          allowed: false,
          reason: `Analysis would exceed daily cost limit ($${limits.dailyLimit})`,
          currentCost,
          limit: limits.dailyLimit,
          remainingBudget: Math.max(0, limits.dailyLimit - currentCost),
        };
      }

      return {
        allowed: true,
        currentCost,
        limit: limits.dailyLimit,
        remainingBudget: limits.dailyLimit - projectedDailyCost,
      };

    } catch (error) {
      this.logger.error('Error checking analysis permission', error as Error, { userId });
      
      // Allow analysis on error to avoid blocking users
      return {
        allowed: true,
        currentCost: 0,
        limit: this.defaultLimits.dailyLimit,
        remainingBudget: this.defaultLimits.dailyLimit,
      };
    }
  }

  /**
   * Get user's cost summary
   */
  async getUserCostSummary(userId: string): Promise<UserCostSummary> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const userUsage = this.costUsage.get(userId) || [];
      const now = new Date();

      // Calculate time ranges
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(dayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Calculate costs for different periods
      const dailyCost = this.calculateCostForPeriod(userUsage, dayStart);
      const weeklyCost = this.calculateCostForPeriod(userUsage, weekStart);
      const monthlyCost = this.calculateCostForPeriod(userUsage, monthStart);

      // Calculate totals
      const totalTokens = userUsage.reduce((sum, usage) => sum + usage.tokensUsed, 0);
      const analysisCount = userUsage.length;
      const lastAnalysis = userUsage.length > 0 ? 
        userUsage[userUsage.length - 1].timestamp : 
        new Date(0).toISOString();

      // Calculate top models
      const modelUsage = new Map<string, { cost: number; usage: number }>();
      userUsage.forEach(usage => {
        const existing = modelUsage.get(usage.model) || { cost: 0, usage: 0 };
        existing.cost += usage.estimatedCost;
        existing.usage += usage.tokensUsed;
        modelUsage.set(usage.model, existing);
      });

      const topModels = Array.from(modelUsage.entries())
        .map(([model, data]) => ({ model, ...data }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5);

      return {
        userId,
        dailyCost,
        weeklyCost,
        monthlyCost,
        totalTokens,
        analysisCount,
        lastAnalysis,
        topModels,
      };

    } catch (error) {
      this.logger.error('Error getting user cost summary', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Set custom cost limits for a user
   */
  async setUserLimits(userId: string, limits: Partial<CostLimits>): Promise<void> {
    const currentLimits = this.getUserLimits(userId);
    const newLimits = { ...currentLimits, ...limits };
    
    this.userLimits.set(userId, newLimits);
    
    this.logger.info('Updated user cost limits', {
      userId,
      limits: newLimits,
    });

    // Persist limits
    await this.persistUserLimits(userId, newLimits);
  }

  /**
   * Get system-wide cost statistics
   */
  async getSystemCostStats(): Promise<{
    totalUsers: number;
    totalCostToday: number;
    totalCostThisMonth: number;
    totalTokensUsed: number;
    totalAnalyses: number;
    topUsers: Array<{ userId: string; cost: number; analyses: number }>;
    topModels: Array<{ model: string; cost: number; usage: number }>;
  }> {
    try {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      let totalCostToday = 0;
      let totalCostThisMonth = 0;
      let totalTokensUsed = 0;
      let totalAnalyses = 0;

      const userStats = new Map<string, { cost: number; analyses: number }>();
      const modelStats = new Map<string, { cost: number; usage: number }>();

      // Aggregate data from all users
      for (const [userId, userUsage] of this.costUsage.entries()) {
        const dailyCost = this.calculateCostForPeriod(userUsage, dayStart);
        const monthlyCost = this.calculateCostForPeriod(userUsage, monthStart);
        const userTokens = userUsage.reduce((sum, usage) => sum + usage.tokensUsed, 0);

        totalCostToday += dailyCost;
        totalCostThisMonth += monthlyCost;
        totalTokensUsed += userTokens;
        totalAnalyses += userUsage.length;

        userStats.set(userId, { cost: monthlyCost, analyses: userUsage.length });

        // Aggregate model stats
        userUsage.forEach(usage => {
          const existing = modelStats.get(usage.model) || { cost: 0, usage: 0 };
          existing.cost += usage.estimatedCost;
          existing.usage += usage.tokensUsed;
          modelStats.set(usage.model, existing);
        });
      }

      // Get top users and models
      const topUsers = Array.from(userStats.entries())
        .map(([userId, stats]) => ({ userId, ...stats }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10);

      const topModels = Array.from(modelStats.entries())
        .map(([model, stats]) => ({ model, ...stats }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10);

      return {
        totalUsers: this.costUsage.size,
        totalCostToday,
        totalCostThisMonth,
        totalTokensUsed,
        totalAnalyses,
        topUsers,
        topModels,
      };

    } catch (error) {
      this.logger.error('Error getting system cost stats', error as Error);
      throw error;
    }
  }

  private getUserLimits(userId: string): CostLimits {
    return this.userLimits.get(userId) || { ...this.defaultLimits };
  }

  private async getDailyCost(userId: string): Promise<number> {
    const userUsage = this.costUsage.get(userId) || [];
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    
    return this.calculateCostForPeriod(userUsage, dayStart);
  }

  private calculateCostForPeriod(usage: CostUsage[], startDate: Date): number {
    return usage
      .filter(u => new Date(u.timestamp) >= startDate)
      .reduce((sum, u) => sum + u.estimatedCost, 0);
  }

  private async checkCostLimits(userId: string, newCost: number): Promise<void> {
    const limits = this.getUserLimits(userId);
    const currentDailyCost = await this.getDailyCost(userId);
    const projectedCost = currentDailyCost + newCost;

    // Check warning threshold
    const warningThreshold = limits.dailyLimit * limits.warningThreshold;
    if (projectedCost >= warningThreshold && currentDailyCost < warningThreshold) {
      await this.sendCostAlert({
        userId,
        alertType: 'warning',
        message: `Daily AI cost approaching limit: $${projectedCost.toFixed(4)} of $${limits.dailyLimit}`,
        currentCost: projectedCost,
        limit: limits.dailyLimit,
        timestamp: new Date().toISOString(),
      });
    }

    // Check if limit exceeded
    if (projectedCost > limits.dailyLimit) {
      await this.sendCostAlert({
        userId,
        alertType: 'limit_exceeded',
        message: `Daily AI cost limit exceeded: $${projectedCost.toFixed(4)} exceeds $${limits.dailyLimit}`,
        currentCost: projectedCost,
        limit: limits.dailyLimit,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async sendCostAlert(alert: CostAlert): Promise<void> {
    this.logger.warn('Cost alert triggered', alert);

    // Record alert metric
    performanceMonitor.recordBusinessMetric('ai_cost_alert', 1, 'count', {
      userId: alert.userId,
      alertType: alert.alertType,
    });

    // In a real implementation, this would send notifications via email, Slack, etc.
    // For now, we just log the alert
  }

  private async loadUsageData(): Promise<void> {
    // In a real implementation, this would load from a database or persistent storage
    // For now, we start with empty data
    this.logger.debug('Loading usage data from storage');
  }

  private async persistUsageData(usage: CostUsage): Promise<void> {
    // In a real implementation, this would save to a database
    this.logger.debug('Persisting usage data', { userId: usage.userId, cost: usage.estimatedCost });
  }

  private async persistUserLimits(userId: string, limits: CostLimits): Promise<void> {
    // In a real implementation, this would save to a database
    this.logger.debug('Persisting user limits', { userId, limits });
  }

  private startPeriodicTasks(): void {
    // Clean up old usage data every hour
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000);

    // Send daily cost summaries at midnight
    setInterval(() => {
      this.sendDailyCostSummaries();
    }, 24 * 60 * 60 * 1000);
  }

  private cleanupOldData(): void {
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
    let cleanedCount = 0;

    for (const [userId, userUsage] of this.costUsage.entries()) {
      const filteredUsage = userUsage.filter(usage => new Date(usage.timestamp) > cutoffDate);
      if (filteredUsage.length !== userUsage.length) {
        this.costUsage.set(userId, filteredUsage);
        cleanedCount += userUsage.length - filteredUsage.length;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} old usage records`);
    }
  }

  private async sendDailyCostSummaries(): Promise<void> {
    this.logger.debug('Sending daily cost summaries');

    for (const userId of this.costUsage.keys()) {
      try {
        const summary = await this.getUserCostSummary(userId);
        
        if (summary.dailyCost > 0) {
          await this.sendCostAlert({
            userId,
            alertType: 'daily_summary',
            message: `Daily AI usage summary: $${summary.dailyCost.toFixed(4)} spent on ${summary.analysisCount} analyses`,
            currentCost: summary.dailyCost,
            limit: this.getUserLimits(userId).dailyLimit,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        this.logger.error('Error sending daily summary', error as Error, { userId });
      }
    }
  }
}

// Export singleton instance
export const aiCostMonitoringService = new AICostMonitoringService();
export default aiCostMonitoringService;