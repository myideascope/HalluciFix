/**
 * API Monitoring System
 * Tracks response times, error rates, costs, and usage quotas for all API providers
 */

export interface APIMetrics {
  provider: string;
  endpoint: string;
  responseTime: number;
  statusCode: number;
  timestamp: Date;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost?: number;
  errorType?: string;
}

export interface ProviderQuota {
  provider: string;
  quotaType: 'requests' | 'tokens' | 'cost';
  limit: number;
  used: number;
  resetDate: Date;
  warningThreshold: number; // Percentage (e.g., 80 for 80%)
  criticalThreshold: number; // Percentage (e.g., 95 for 95%)
}

export interface AlertConfig {
  responseTimeThreshold: number; // milliseconds
  errorRateThreshold: number; // percentage
  costThreshold: number; // dollars per hour
  quotaWarningEnabled: boolean;
  quotaCriticalEnabled: boolean;
  webhookUrl?: string;
  emailRecipients?: string[];
}

class APIMonitor {
  private metrics: APIMetrics[] = [];
  private quotas: Map<string, ProviderQuota> = new Map();
  private alertConfig: AlertConfig;
  private alertCallbacks: ((alert: Alert) => void)[] = [];

  constructor(config: AlertConfig) {
    this.alertConfig = config;
    this.startPeriodicChecks();
  }

  /**
   * Record API call metrics
   */
  recordMetric(metric: APIMetrics): void {
    this.metrics.push(metric);
    
    // Keep only last 1000 metrics to prevent memory issues
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    // Update quota usage
    this.updateQuotaUsage(metric);

    // Check for alerts
    this.checkAlerts(metric);
  }

  /**
   * Update quota usage for a provider
   */
  private updateQuotaUsage(metric: APIMetrics): void {
    const quotaKey = `${metric.provider}_requests`;
    const quota = this.quotas.get(quotaKey);
    
    if (quota) {
      quota.used += 1;
      
      // Update token usage if available
      if (metric.tokenUsage) {
        const tokenQuotaKey = `${metric.provider}_tokens`;
        const tokenQuota = this.quotas.get(tokenQuotaKey);
        if (tokenQuota) {
          tokenQuota.used += metric.tokenUsage.total;
        }
      }

      // Update cost if available
      if (metric.cost) {
        const costQuotaKey = `${metric.provider}_cost`;
        const costQuota = this.quotas.get(costQuotaKey);
        if (costQuota) {
          costQuota.used += metric.cost;
        }
      }
    }
  }

  /**
   * Set quota limits for a provider
   */
  setQuota(quota: ProviderQuota): void {
    const key = `${quota.provider}_${quota.quotaType}`;
    this.quotas.set(key, quota);
  }

  /**
   * Get current metrics for a provider
   */
  getProviderMetrics(provider: string, timeWindow: number = 3600000): ProviderMetrics {
    const cutoff = new Date(Date.now() - timeWindow);
    const providerMetrics = this.metrics.filter(
      m => m.provider === provider && m.timestamp >= cutoff
    );

    const totalRequests = providerMetrics.length;
    const errorRequests = providerMetrics.filter(m => m.statusCode >= 400).length;
    const avgResponseTime = totalRequests > 0 
      ? providerMetrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests 
      : 0;
    const totalCost = providerMetrics.reduce((sum, m) => sum + (m.cost || 0), 0);
    const totalTokens = providerMetrics.reduce((sum, m) => sum + (m.tokenUsage?.total || 0), 0);

    return {
      provider,
      timeWindow,
      totalRequests,
      errorRate: totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0,
      avgResponseTime,
      totalCost,
      totalTokens,
      quotaStatus: this.getQuotaStatus(provider)
    };
  }

  /**
   * Get quota status for a provider
   */
  private getQuotaStatus(provider: string): QuotaStatus[] {
    const status: QuotaStatus[] = [];
    
    for (const [key, quota] of this.quotas) {
      if (quota.provider === provider) {
        const usagePercentage = (quota.used / quota.limit) * 100;
        status.push({
          type: quota.quotaType,
          limit: quota.limit,
          used: quota.used,
          usagePercentage,
          resetDate: quota.resetDate,
          status: usagePercentage >= quota.criticalThreshold ? 'critical' :
                  usagePercentage >= quota.warningThreshold ? 'warning' : 'ok'
        });
      }
    }
    
    return status;
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(metric: APIMetrics): void {
    // Response time alert
    if (metric.responseTime > this.alertConfig.responseTimeThreshold) {
      this.triggerAlert({
        type: 'response_time',
        severity: 'warning',
        provider: metric.provider,
        message: `High response time: ${metric.responseTime}ms (threshold: ${this.alertConfig.responseTimeThreshold}ms)`,
        timestamp: new Date(),
        metadata: { responseTime: metric.responseTime, endpoint: metric.endpoint }
      });
    }

    // Error rate alert (check last 10 requests)
    const recentMetrics = this.metrics
      .filter(m => m.provider === metric.provider)
      .slice(-10);
    
    if (recentMetrics.length >= 5) {
      const errorRate = (recentMetrics.filter(m => m.statusCode >= 400).length / recentMetrics.length) * 100;
      if (errorRate > this.alertConfig.errorRateThreshold) {
        this.triggerAlert({
          type: 'error_rate',
          severity: 'critical',
          provider: metric.provider,
          message: `High error rate: ${errorRate.toFixed(1)}% (threshold: ${this.alertConfig.errorRateThreshold}%)`,
          timestamp: new Date(),
          metadata: { errorRate, recentRequests: recentMetrics.length }
        });
      }
    }

    // Quota alerts
    this.checkQuotaAlerts(metric.provider);
  }

  /**
   * Check quota alerts for a provider
   */
  private checkQuotaAlerts(provider: string): void {
    for (const [key, quota] of this.quotas) {
      if (quota.provider === provider) {
        const usagePercentage = (quota.used / quota.limit) * 100;
        
        if (usagePercentage >= quota.criticalThreshold && this.alertConfig.quotaCriticalEnabled) {
          this.triggerAlert({
            type: 'quota_critical',
            severity: 'critical',
            provider,
            message: `Critical quota usage: ${usagePercentage.toFixed(1)}% of ${quota.quotaType} quota`,
            timestamp: new Date(),
            metadata: { quotaType: quota.quotaType, usage: quota.used, limit: quota.limit }
          });
        } else if (usagePercentage >= quota.warningThreshold && this.alertConfig.quotaWarningEnabled) {
          this.triggerAlert({
            type: 'quota_warning',
            severity: 'warning',
            provider,
            message: `High quota usage: ${usagePercentage.toFixed(1)}% of ${quota.quotaType} quota`,
            timestamp: new Date(),
            metadata: { quotaType: quota.quotaType, usage: quota.used, limit: quota.limit }
          });
        }
      }
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(alert: Alert): void {
    console.warn(`[API Monitor Alert] ${alert.severity.toUpperCase()}: ${alert.message}`);
    
    // Call registered callbacks
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        console.error('Error in alert callback:', error);
      }
    });

    // Send webhook if configured
    if (this.alertConfig.webhookUrl) {
      this.sendWebhookAlert(alert);
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: Alert): Promise<void> {
    try {
      await fetch(this.alertConfig.webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert)
      });
    } catch (error) {
      console.error('Failed to send webhook alert:', error);
    }
  }

  /**
   * Register alert callback
   */
  onAlert(callback: (alert: Alert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Start periodic checks for cost and quota monitoring
   */
  private startPeriodicChecks(): void {
    // Check cost thresholds every 5 minutes
    setInterval(() => {
      this.checkCostThresholds();
    }, 5 * 60 * 1000);

    // Reset daily quotas at midnight
    setInterval(() => {
      this.resetDailyQuotas();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Check cost thresholds
   */
  private checkCostThresholds(): void {
    const hourAgo = new Date(Date.now() - 3600000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= hourAgo);
    
    const costByProvider = new Map<string, number>();
    recentMetrics.forEach(metric => {
      if (metric.cost) {
        const current = costByProvider.get(metric.provider) || 0;
        costByProvider.set(metric.provider, current + metric.cost);
      }
    });

    costByProvider.forEach((cost, provider) => {
      if (cost > this.alertConfig.costThreshold) {
        this.triggerAlert({
          type: 'cost_threshold',
          severity: 'warning',
          provider,
          message: `High API costs: $${cost.toFixed(2)} in the last hour (threshold: $${this.alertConfig.costThreshold})`,
          timestamp: new Date(),
          metadata: { hourlyCost: cost, threshold: this.alertConfig.costThreshold }
        });
      }
    });
  }

  /**
   * Reset daily quotas
   */
  private resetDailyQuotas(): void {
    const now = new Date();
    for (const [key, quota] of this.quotas) {
      if (quota.resetDate <= now) {
        quota.used = 0;
        quota.resetDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      }
    }
  }

  /**
   * Get all current metrics
   */
  getAllMetrics(): APIMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear old metrics
   */
  clearOldMetrics(olderThan: Date): void {
    this.metrics = this.metrics.filter(m => m.timestamp >= olderThan);
  }
}

// Types
export interface ProviderMetrics {
  provider: string;
  timeWindow: number;
  totalRequests: number;
  errorRate: number;
  avgResponseTime: number;
  totalCost: number;
  totalTokens: number;
  quotaStatus: QuotaStatus[];
}

export interface QuotaStatus {
  type: 'requests' | 'tokens' | 'cost';
  limit: number;
  used: number;
  usagePercentage: number;
  resetDate: Date;
  status: 'ok' | 'warning' | 'critical';
}

export interface Alert {
  type: 'response_time' | 'error_rate' | 'quota_warning' | 'quota_critical' | 'cost_threshold';
  severity: 'warning' | 'critical';
  provider: string;
  message: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

// Singleton instance
let apiMonitorInstance: APIMonitor | null = null;

export function getAPIMonitor(config?: AlertConfig): APIMonitor {
  if (!apiMonitorInstance && config) {
    apiMonitorInstance = new APIMonitor(config);
  }
  if (!apiMonitorInstance) {
    throw new Error('API Monitor not initialized. Provide config on first call.');
  }
  return apiMonitorInstance;
}

export { APIMonitor };