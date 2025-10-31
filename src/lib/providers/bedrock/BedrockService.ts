/**
 * Bedrock Service Layer
 * High-level service for AWS Bedrock operations with caching, monitoring, and cost tracking
 */

import { BedrockProvider } from './BedrockProvider';
import { AIAnalysisOptions, AIAnalysisResult } from '../interfaces/AIProvider';
import { bedrockConfig, validateBedrockConfig } from '../../aws-config';
import { logger } from '../../logging';
import { performanceMonitor } from '../../performanceMonitor';
import { aiCostMonitoringService } from '../../aiCostMonitoringService';

interface BedrockServiceConfig {
  enableCostTracking: boolean;
  enablePerformanceMonitoring: boolean;
  enableCaching: boolean;
  maxDailyCost: number;
  maxRequestsPerMinute: number;
}

interface CachedAnalysis {
  result: AIAnalysisResult;
  timestamp: number;
  cost: number;
}

export class BedrockService {
  private provider: BedrockProvider | null = null;
  private config: BedrockServiceConfig;
  private logger = logger.child({ component: 'BedrockService' });
  private initialized = false;
  private analysisCache: Map<string, CachedAnalysis> = new Map();
  private requestCounts: Map<string, number> = new Map();
  private dailyCost = 0;
  private lastCostReset = new Date().toDateString();

  constructor() {
    this.config = {
      enableCostTracking: bedrockConfig.enableCostTracking,
      enablePerformanceMonitoring: true,
      enableCaching: bedrockConfig.enableCaching,
      maxDailyCost: bedrockConfig.dailyCostLimit,
      maxRequestsPerMinute: bedrockConfig.maxRequestsPerMinute,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.logger.info('Initializing Bedrock Service');

      // Validate configuration
      if (!validateBedrockConfig()) {
        throw new Error('Invalid Bedrock configuration');
      }

      // Initialize Bedrock provider
      this.provider = new BedrockProvider({
        enabled: bedrockConfig.enabled,
        region: bedrockConfig.region,
        model: bedrockConfig.model,
        accessKeyId: bedrockConfig.credentials.accessKeyId,
        secretAccessKey: bedrockConfig.credentials.secretAccessKey,
      });

      await this.provider.initialize();

      // Start cleanup tasks
      this.startCleanupTasks();

      this.initialized = true;
      this.logger.info('Bedrock Service initialized successfully', {
        region: bedrockConfig.region,
        model: bedrockConfig.model,
        costTrackingEnabled: this.config.enableCostTracking,
        cachingEnabled: this.config.enableCaching,
      });

    } catch (error) {
      this.logger.error('Failed to initialize Bedrock Service', error as Error);
      throw error;
    }
  }

  async analyzeContent(
    content: string, 
    userId: string, 
    options?: AIAnalysisOptions
  ): Promise<AIAnalysisResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.provider) {
      throw new Error('Bedrock provider not initialized');
    }

    const performanceId = performanceMonitor.startOperation('bedrock_service_analyze', {
      userId,
      contentLength: content.length.toString(),
      cacheEnabled: this.config.enableCaching.toString(),
    });

    try {
      // Check rate limiting
      this.checkRateLimit();

      // Check daily cost limit
      if (this.config.enableCostTracking) {
        await this.checkCostLimit(content, options);
      }

      // Check cache first
      if (this.config.enableCaching) {
        const cached = this.getCachedAnalysis(content, options);
        if (cached) {
          performanceMonitor.endOperation(performanceId, {
            status: 'cache_hit',
            accuracy: cached.accuracy.toString(),
          });

          this.logger.debug('Returning cached Bedrock analysis', {
            analysisId: cached.id,
            userId,
            cacheAge: Date.now() - cached.metadata.timestamp,
          });

          return cached;
        }
      }

      // Perform analysis
      const result = await this.provider.analyzeContent(content, options);

      // Record cost and usage
      if (this.config.enableCostTracking && result.metadata.tokenUsage) {
        const cost = await this.provider.estimateCost(content, options);
        this.recordCost(cost);
        
        // Record usage with cost monitoring service
        await aiCostMonitoringService.recordUsage({
          userId,
          provider: 'bedrock',
          model: result.metadata.modelVersion,
          tokensUsed: result.metadata.tokenUsage.total,
          estimatedCost: cost,
          timestamp: new Date().toISOString(),
          analysisType: 'content_analysis',
        });
      }

      // Cache the result
      if (this.config.enableCaching) {
        this.cacheAnalysis(content, options, result);
      }

      // Record request for rate limiting
      this.recordRequest();

      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        accuracy: result.accuracy.toString(),
        processingTime: result.processingTime.toString(),
      });

      this.logger.info('Bedrock analysis completed', {
        analysisId: result.id,
        userId,
        accuracy: result.accuracy,
        processingTime: result.processingTime,
        tokenUsage: result.metadata.tokenUsage,
      });

      return result;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      this.logger.error('Bedrock Service analysis failed', error as Error, {
        userId,
        contentLength: content.length,
      });
      
      throw error;
    }
  }

  async estimateCost(content: string, options?: AIAnalysisOptions): Promise<number> {
    if (!this.provider) {
      await this.initialize();
    }

    return this.provider!.estimateCost(content, options);
  }

  async healthCheck(): Promise<boolean> {
    if (!this.provider) {
      return false;
    }

    return this.provider.healthCheck();
  }

  getStatus() {
    return {
      initialized: this.initialized,
      providerStatus: this.provider?.getStatus(),
      config: this.config,
      cacheSize: this.analysisCache.size,
      dailyCost: this.dailyCost,
      costLimitReached: this.dailyCost >= this.config.maxDailyCost,
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Bedrock Service');

    this.analysisCache.clear();
    this.requestCounts.clear();
    
    if (this.provider) {
      // Bedrock provider doesn't have shutdown method, but we can clean up
      this.provider = null;
    }
    
    this.initialized = false;
    this.logger.info('Bedrock Service shutdown complete');
  }

  private checkRateLimit(): void {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const key = minute.toString();

    const currentCount = this.requestCounts.get(key) || 0;
    if (currentCount >= this.config.maxRequestsPerMinute) {
      throw new Error(`Bedrock rate limit exceeded: ${this.config.maxRequestsPerMinute} requests per minute`);
    }
  }

  private async checkCostLimit(content: string, options?: AIAnalysisOptions): Promise<void> {
    // Reset daily cost if it's a new day
    const today = new Date().toDateString();
    if (this.lastCostReset !== today) {
      this.dailyCost = 0;
      this.lastCostReset = today;
    }

    // Check if we're at the daily limit
    if (this.dailyCost >= this.config.maxDailyCost) {
      throw new Error(`Daily Bedrock cost limit reached: $${this.config.maxDailyCost}`);
    }

    // Estimate cost for this request
    const estimatedCost = await this.estimateCost(content, options);
    if (this.dailyCost + estimatedCost > this.config.maxDailyCost) {
      throw new Error(`Request would exceed daily Bedrock cost limit. Current: $${this.dailyCost.toFixed(4)}, Estimated: $${estimatedCost.toFixed(4)}, Limit: $${this.config.maxDailyCost}`);
    }
  }

  private recordCost(cost: number): void {
    this.dailyCost += cost;
    this.logger.debug('Recorded Bedrock cost', {
      requestCost: cost,
      dailyCost: this.dailyCost,
      dailyLimit: this.config.maxDailyCost,
    });
  }

  private recordRequest(): void {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const key = minute.toString();

    const currentCount = this.requestCounts.get(key) || 0;
    this.requestCounts.set(key, currentCount + 1);

    // Clean up old entries
    for (const [k] of this.requestCounts.entries()) {
      const entryMinute = parseInt(k);
      if (entryMinute < minute - 5) { // Keep last 5 minutes
        this.requestCounts.delete(k);
      }
    }
  }

  private getCachedAnalysis(content: string, options?: AIAnalysisOptions): AIAnalysisResult | null {
    const cacheKey = this.generateCacheKey(content, options);
    const cached = this.analysisCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if cache is expired
    const age = Date.now() - cached.timestamp;
    if (age > bedrockConfig.cacheTimeout) {
      this.analysisCache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  private cacheAnalysis(content: string, options: AIAnalysisOptions | undefined, result: AIAnalysisResult): void {
    const cacheKey = this.generateCacheKey(content, options);
    const cost = result.metadata.tokenUsage ? 
      this.calculateCostFromTokenUsage(result.metadata.tokenUsage, result.metadata.modelVersion) : 0;

    this.analysisCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      cost,
    });

    this.logger.debug('Bedrock analysis result cached', {
      cacheKey: cacheKey.substring(0, 16) + '...',
      analysisId: result.id,
      cost,
    });
  }

  private generateCacheKey(content: string, options?: AIAnalysisOptions): string {
    const contentHash = this.hashContent(content);
    const optionsHash = this.hashContent(JSON.stringify(options || {}));
    return `bedrock_${contentHash}_${optionsHash}`;
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private calculateCostFromTokenUsage(tokenUsage: any, modelVersion: string): number {
    // This is a simplified version - the actual calculation is in BedrockProvider
    const inputCost = (tokenUsage.input / 1000) * 0.003; // Approximate
    const outputCost = (tokenUsage.output / 1000) * 0.015; // Approximate
    return inputCost + outputCost;
  }

  private startCleanupTasks(): void {
    // Clean up expired cache entries every 10 minutes
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [key, cached] of this.analysisCache.entries()) {
        const age = now - cached.timestamp;
        if (age > bedrockConfig.cacheTimeout) {
          this.analysisCache.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        this.logger.debug(`Cleaned up ${cleanedCount} expired Bedrock cache entries`);
      }
    }, 10 * 60 * 1000);
  }
}

// Export singleton instance
export const bedrockService = new BedrockService();
export default bedrockService;