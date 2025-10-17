/**
 * API Usage Optimizer
 * Optimizes API usage to minimize costs and improve performance
 */

import { logger } from '../logging';
import { responseCacheManager } from '../cache/ResponseCacheManager';
import { requestDeduplicator } from './RequestDeduplicator';

export interface APIUsageConfig {
  costLimits: {
    daily?: number;
    monthly?: number;
    perRequest?: number;
  };
  rateLimits: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
  };
  optimization: {
    enableCaching?: boolean;
    enableDeduplication?: boolean;
    enableBatching?: boolean;
    batchSize?: number;
    batchTimeout?: number;
  };
  providers: {
    [providerName: string]: {
      costPerRequest?: number;
      costPerToken?: number;
      rateLimits?: {
        requestsPerMinute?: number;
        tokensPerMinute?: number;
      };
      priority?: number;
    };
  };
}

export interface APIUsageStats {
  totalRequests: number;
  totalCost: number;
  costSavings: number;
  requestsSaved: number;
  cacheHitRate: number;
  deduplicationRate: number;
  averageResponseTime: number;
  providerUsage: {
    [providerName: string]: {
      requests: number;
      cost: number;
      tokens?: number;
      errors: number;
    };
  };
  rateLimitStatus: {
    [providerName: string]: {
      remaining: number;
      resetTime: number;
      isThrottled: boolean;
    };
  };
}

interface BatchRequest {
  id: string;
  request: any;
  resolve: (result: any) => void;
  reject: (error: any) => void;
  timestamp: number;
  provider: string;
}

export class APIUsageOptimizer {
  private config: APIUsageConfig;
  private stats = {
    totalRequests: 0,
    totalCost: 0,
    costSavings: 0,
    requestsSaved: 0,
    totalResponseTime: 0,
    completedRequests: 0,
    providerUsage: new Map<string, any>(),
    rateLimitStatus: new Map<string, any>()
  };

  private batchQueues = new Map<string, BatchRequest[]>();
  private batchTimers = new Map<string, NodeJS.Timeout>();
  private rateLimitTrackers = new Map<string, any>();
  
  private logger = logger.child({ component: 'APIUsageOptimizer' });

  constructor(config: APIUsageConfig) {
    this.config = config;
    this.initializeProviderStats();
    
    this.logger.info('API Usage Optimizer initialized', {
      providersConfigured: Object.keys(config.providers).length,
      cachingEnabled: config.optimization.enableCaching,
      deduplicationEnabled: config.optimization.enableDeduplication,
      batchingEnabled: config.optimization.enableBatching
    });
  }

  /**
   * Optimize API request execution
   */
  async optimizeRequest<T>(
    provider: string,
    requestKey: string,
    requestFn: () => Promise<T>,
    options: {
      cacheable?: boolean;
      cacheTTL?: number;
      batchable?: boolean;
      estimatedCost?: number;
      estimatedTokens?: number;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    try {
      // Check rate limits
      await this.checkRateLimits(provider);

      // Try cache first if enabled and cacheable
      if (this.config.optimization.enableCaching && options.cacheable) {
        const cached = responseCacheManager.get<T>(requestKey);
        if (cached) {
          this.recordCacheHit(provider, options.estimatedCost || 0);
          return cached;
        }
      }

      // Try deduplication if enabled
      if (this.config.optimization.enableDeduplication) {
        return await requestDeduplicator.execute(requestKey, async () => {
          const result = await this.executeRequest(provider, requestFn, options);
          
          // Cache result if cacheable
          if (this.config.optimization.enableCaching && options.cacheable) {
            responseCacheManager.set(requestKey, result, {
              ttl: options.cacheTTL,
              tags: [provider, 'api-response']
            });
          }
          
          return result;
        });
      }

      // Execute request directly
      const result = await this.executeRequest(provider, requestFn, options);
      
      // Cache result if cacheable
      if (this.config.optimization.enableCaching && options.cacheable) {
        responseCacheManager.set(requestKey, result, {
          ttl: options.cacheTTL,
          tags: [provider, 'api-response']
        });
      }
      
      return result;

    } catch (error) {
      this.recordError(provider, error as Error);
      throw error;
    } finally {
      const responseTime = Date.now() - startTime;
      this.stats.totalResponseTime += responseTime;
      this.stats.completedRequests++;
    }
  }

  /**
   * Optimize batch request execution
   */
  async optimizeBatchRequest<T>(
    provider: string,
    requests: Array<{
      key: string;
      request: any;
      options?: {
        cacheable?: boolean;
        estimatedCost?: number;
        estimatedTokens?: number;
      };
    }>,
    batchExecutor: (batchedRequests: any[]) => Promise<T[]>
  ): Promise<T[]> {
    if (!this.config.optimization.enableBatching) {
      // Execute individually if batching is disabled
      const results: T[] = [];
      for (const req of requests) {
        const result = await this.optimizeRequest(
          provider,
          req.key,
          () => batchExecutor([req.request]).then(results => results[0]),
          req.options
        );
        results.push(result);
      }
      return results;
    }

    // Check cache for individual requests first
    const cachedResults = new Map<number, T>();
    const uncachedRequests: typeof requests = [];

    if (this.config.optimization.enableCaching) {
      requests.forEach((req, index) => {
        if (req.options?.cacheable) {
          const cached = responseCacheManager.get<T>(req.key);
          if (cached) {
            cachedResults.set(index, cached);
            this.recordCacheHit(provider, req.options.estimatedCost || 0);
          } else {
            uncachedRequests.push(req);
          }
        } else {
          uncachedRequests.push(req);
        }
      });
    } else {
      uncachedRequests.push(...requests);
    }

    // Execute uncached requests in batch
    let batchResults: T[] = [];
    if (uncachedRequests.length > 0) {
      await this.checkRateLimits(provider);
      
      const batchRequests = uncachedRequests.map(req => req.request);
      batchResults = await this.executeBatchRequest(provider, batchRequests, batchExecutor);

      // Cache results
      if (this.config.optimization.enableCaching) {
        uncachedRequests.forEach((req, index) => {
          if (req.options?.cacheable && batchResults[index]) {
            responseCacheManager.set(req.key, batchResults[index], {
              ttl: req.options.cacheTTL,
              tags: [provider, 'api-response']
            });
          }
        });
      }
    }

    // Combine cached and batch results
    const finalResults: T[] = new Array(requests.length);
    let batchIndex = 0;

    requests.forEach((_, index) => {
      if (cachedResults.has(index)) {
        finalResults[index] = cachedResults.get(index)!;
      } else {
        finalResults[index] = batchResults[batchIndex++];
      }
    });

    return finalResults;
  }

  /**
   * Get current API usage statistics
   */
  getStats(): APIUsageStats {
    const cacheStats = responseCacheManager.getStats();
    const deduplicationStats = requestDeduplicator.getStats();
    
    const averageResponseTime = this.stats.completedRequests > 0
      ? this.stats.totalResponseTime / this.stats.completedRequests
      : 0;

    const providerUsage: { [key: string]: any } = {};
    for (const [provider, stats] of this.stats.providerUsage.entries()) {
      providerUsage[provider] = { ...stats };
    }

    const rateLimitStatus: { [key: string]: any } = {};
    for (const [provider, status] of this.stats.rateLimitStatus.entries()) {
      rateLimitStatus[provider] = { ...status };
    }

    return {
      totalRequests: this.stats.totalRequests,
      totalCost: parseFloat(this.stats.totalCost.toFixed(4)),
      costSavings: parseFloat(this.stats.costSavings.toFixed(4)),
      requestsSaved: this.stats.requestsSaved,
      cacheHitRate: cacheStats.hitRate,
      deduplicationRate: deduplicationStats.deduplicationRate,
      averageResponseTime: parseFloat(averageResponseTime.toFixed(2)),
      providerUsage,
      rateLimitStatus
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<APIUsageConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.providers) {
      this.config.providers = { ...this.config.providers, ...newConfig.providers };
      this.initializeProviderStats();
    }

    this.logger.info('Configuration updated', {
      providersConfigured: Object.keys(this.config.providers).length
    });
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalCost: 0,
      costSavings: 0,
      requestsSaved: 0,
      totalResponseTime: 0,
      completedRequests: 0,
      providerUsage: new Map(),
      rateLimitStatus: new Map()
    };

    this.initializeProviderStats();
    this.logger.info('Statistics reset');
  }

  /**
   * Check if provider is within cost limits
   */
  isWithinCostLimits(provider: string, estimatedCost: number): boolean {
    const providerStats = this.stats.providerUsage.get(provider);
    if (!providerStats) return true;

    const limits = this.config.costLimits;
    const currentCost = providerStats.cost;

    if (limits.perRequest && estimatedCost > limits.perRequest) {
      return false;
    }

    if (limits.daily && currentCost + estimatedCost > limits.daily) {
      return false;
    }

    if (limits.monthly && currentCost + estimatedCost > limits.monthly) {
      return false;
    }

    return true;
  }

  /**
   * Get cost optimization recommendations
   */
  getOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const stats = this.getStats();

    // Cache recommendations
    if (stats.cacheHitRate < 30) {
      recommendations.push('Consider enabling caching for more request types to improve hit rate');
    }

    // Deduplication recommendations
    if (stats.deduplicationRate < 10) {
      recommendations.push('Enable request deduplication to reduce redundant API calls');
    }

    // Cost recommendations
    const highCostProviders = Object.entries(stats.providerUsage)
      .filter(([_, usage]) => usage.cost > this.config.costLimits.daily! * 0.8)
      .map(([provider]) => provider);

    if (highCostProviders.length > 0) {
      recommendations.push(`High cost usage detected for: ${highCostProviders.join(', ')}`);
    }

    // Rate limit recommendations
    const throttledProviders = Object.entries(stats.rateLimitStatus)
      .filter(([_, status]) => status.isThrottled)
      .map(([provider]) => provider);

    if (throttledProviders.length > 0) {
      recommendations.push(`Consider implementing request queuing for throttled providers: ${throttledProviders.join(', ')}`);
    }

    return recommendations;
  }

  private async executeRequest<T>(
    provider: string,
    requestFn: () => Promise<T>,
    options: {
      estimatedCost?: number;
      estimatedTokens?: number;
    }
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await requestFn();
      
      // Record successful request
      this.recordSuccess(provider, {
        cost: options.estimatedCost || 0,
        tokens: options.estimatedTokens || 0,
        responseTime: Date.now() - startTime
      });
      
      return result;
    } catch (error) {
      this.recordError(provider, error as Error);
      throw error;
    }
  }

  private async executeBatchRequest<T>(
    provider: string,
    requests: any[],
    batchExecutor: (requests: any[]) => Promise<T[]>
  ): Promise<T[]> {
    const startTime = Date.now();
    
    try {
      const results = await batchExecutor(requests);
      
      // Record batch success
      this.recordSuccess(provider, {
        cost: 0, // Cost will be calculated based on actual usage
        tokens: 0,
        responseTime: Date.now() - startTime,
        batchSize: requests.length
      });
      
      return results;
    } catch (error) {
      this.recordError(provider, error as Error);
      throw error;
    }
  }

  private async checkRateLimits(provider: string): Promise<void> {
    const providerConfig = this.config.providers[provider];
    if (!providerConfig?.rateLimits) return;

    const tracker = this.rateLimitTrackers.get(provider) || {
      requests: [],
      tokens: [],
      lastReset: Date.now()
    };

    const now = Date.now();
    const oneMinute = 60 * 1000;
    const oneHour = 60 * 60 * 1000;

    // Clean old entries
    tracker.requests = tracker.requests.filter((time: number) => now - time < oneHour);
    tracker.tokens = tracker.tokens.filter((time: number) => now - time < oneHour);

    // Check rate limits
    const recentRequests = tracker.requests.filter((time: number) => now - time < oneMinute);
    
    if (providerConfig.rateLimits.requestsPerMinute && 
        recentRequests.length >= providerConfig.rateLimits.requestsPerMinute) {
      const waitTime = oneMinute - (now - Math.min(...recentRequests));
      throw new Error(`Rate limit exceeded for ${provider}. Wait ${waitTime}ms`);
    }

    // Record this request
    tracker.requests.push(now);
    this.rateLimitTrackers.set(provider, tracker);
  }

  private recordSuccess(provider: string, metrics: {
    cost: number;
    tokens: number;
    responseTime: number;
    batchSize?: number;
  }): void {
    const providerStats = this.stats.providerUsage.get(provider) || {
      requests: 0,
      cost: 0,
      tokens: 0,
      errors: 0
    };

    providerStats.requests += metrics.batchSize || 1;
    providerStats.cost += metrics.cost;
    providerStats.tokens += metrics.tokens;

    this.stats.providerUsage.set(provider, providerStats);
    this.stats.totalCost += metrics.cost;
  }

  private recordError(provider: string, error: Error): void {
    const providerStats = this.stats.providerUsage.get(provider) || {
      requests: 0,
      cost: 0,
      tokens: 0,
      errors: 0
    };

    providerStats.errors++;
    this.stats.providerUsage.set(provider, providerStats);

    this.logger.error('API request failed', error, { provider });
  }

  private recordCacheHit(provider: string, savedCost: number): void {
    this.stats.requestsSaved++;
    this.stats.costSavings += savedCost;
    
    this.logger.debug('Cache hit recorded', { provider, savedCost });
  }

  private initializeProviderStats(): void {
    for (const provider of Object.keys(this.config.providers)) {
      if (!this.stats.providerUsage.has(provider)) {
        this.stats.providerUsage.set(provider, {
          requests: 0,
          cost: 0,
          tokens: 0,
          errors: 0
        });
      }

      if (!this.stats.rateLimitStatus.has(provider)) {
        this.stats.rateLimitStatus.set(provider, {
          remaining: 1000,
          resetTime: Date.now() + 60000,
          isThrottled: false
        });
      }
    }
  }
}

// Export singleton instance with default configuration
export const apiUsageOptimizer = new APIUsageOptimizer({
  costLimits: {
    daily: 100,
    monthly: 2000,
    perRequest: 1
  },
  rateLimits: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000
  },
  optimization: {
    enableCaching: true,
    enableDeduplication: true,
    enableBatching: true,
    batchSize: 10,
    batchTimeout: 1000
  },
  providers: {
    openai: {
      costPerRequest: 0.002,
      costPerToken: 0.00002,
      rateLimits: {
        requestsPerMinute: 60,
        tokensPerMinute: 90000
      },
      priority: 1
    },
    anthropic: {
      costPerRequest: 0.003,
      costPerToken: 0.00003,
      rateLimits: {
        requestsPerMinute: 50,
        tokensPerMinute: 80000
      },
      priority: 2
    }
  }
});