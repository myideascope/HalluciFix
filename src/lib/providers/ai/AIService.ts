/**
 * AI Service
 * High-level service for AI operations with caching and optimization
 */

import { AIAnalysisOptions, AIAnalysisResult } from '../interfaces/AIProvider';
import { providerManager } from '../ProviderManager';
import { logger } from '../../logging';
import { performanceMonitor } from '../../performanceMonitor';
import { errorManager } from '../../errors';

interface AIServiceConfig {
  enableCaching: boolean;
  cacheTimeout: number;
  enableRateLimiting: boolean;
  maxRequestsPerMinute: number;
  enableCostTracking: boolean;
}

interface CachedAnalysis {
  result: AIAnalysisResult;
  timestamp: number;
  contentHash: string;
}

export class AIService {
  private config: AIServiceConfig;
  private logger = logger.child({ component: 'AIService' });
  private initialized = false;
  private analysisCache: Map<string, CachedAnalysis> = new Map();
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();

  constructor() {
    this.config = {
      enableCaching: true,
      cacheTimeout: 30 * 60 * 1000, // 30 minutes
      enableRateLimiting: true,
      maxRequestsPerMinute: 60,
      enableCostTracking: true,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.logger.info('Initializing AI Service');

      // Initialize provider manager
      await providerManager.initialize();

      // Start cache cleanup
      this.startCacheCleanup();

      this.initialized = true;
      this.logger.info('AI Service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize AI Service', error as Error);
      throw error;
    }
  }

  async analyzeContent(content: string, options?: AIAnalysisOptions): Promise<AIAnalysisResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const performanceId = performanceMonitor.startOperation('ai_service_analyze', {
      contentLength: content.length.toString(),
      cacheEnabled: this.config.enableCaching.toString(),
    });

    try {
      // Check rate limiting
      if (this.config.enableRateLimiting) {
        this.checkRateLimit();
      }

      // Check cache first
      if (this.config.enableCaching) {
        const cached = this.getCachedAnalysis(content, options);
        if (cached) {
          performanceMonitor.endOperation(performanceId, {
            status: 'cache_hit',
            accuracy: cached.accuracy.toString(),
          });

          this.logger.debug('Returning cached analysis result', {
            analysisId: cached.id,
            cacheAge: Date.now() - cached.metadata.timestamp,
          });

          return cached;
        }
      }

      // Try Bedrock first if enabled, then fallback to provider manager
      let result: AIAnalysisResult;
      
      try {
        // Import Bedrock service dynamically
        const { bedrockService } = await import('../bedrock/BedrockService');
        const bedrockStatus = bedrockService.getStatus();
        
        if (bedrockStatus.initialized && !bedrockStatus.costLimitReached) {
          this.logger.debug('Using Bedrock for analysis');
          result = await bedrockService.analyzeContent(content, 'ai-service', options);
        } else {
          this.logger.debug('Bedrock not available, using provider manager fallback');
          result = await providerManager.analyzeContent(content, options);
        }
      } catch (bedrockError) {
        this.logger.warn('Bedrock analysis failed, falling back to provider manager', undefined, {
          error: (bedrockError as Error).message,
        });
        result = await providerManager.analyzeContent(content, options);
      }

      // Cache the result
      if (this.config.enableCaching) {
        this.cacheAnalysis(content, options, result);
      }

      // Record rate limiting
      if (this.config.enableRateLimiting) {
        this.recordRequest();
      }

      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        provider: result.metadata.provider,
        accuracy: result.accuracy.toString(),
      });

      return result;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      const handledError = errorManager.handleError(error, {
        component: 'AIService',
        feature: 'content-analysis',
        operation: 'analyzeContent',
      });

      this.logger.error('AI Service analysis failed', handledError);
      throw handledError;
    }
  }

  async estimateAnalysisCost(content: string, options?: AIAnalysisOptions): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Try Bedrock first for cost estimation
      try {
        const { bedrockService } = await import('../bedrock/BedrockService');
        const bedrockStatus = bedrockService.getStatus();
        
        if (bedrockStatus.initialized) {
          return await bedrockService.estimateCost(content, options);
        }
      } catch (bedrockError) {
        this.logger.debug('Bedrock cost estimation failed, using provider manager', undefined, {
          error: (bedrockError as Error).message,
        });
      }

      // Fallback to provider manager
      const provider = providerManager.getAIProvider();
      if (!provider) {
        return 0;
      }

      return await provider.estimateCost(content, options);
    } catch (error) {
      this.logger.error('Failed to estimate analysis cost', error as Error);
      return 0;
    }
  }

  getStatus() {
    return {
      initialized: this.initialized,
      config: this.config,
      cacheSize: this.analysisCache.size,
      providerStatus: providerManager.getStatus(),
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down AI Service');

    this.analysisCache.clear();
    this.requestCounts.clear();
    
    await providerManager.shutdown();
    
    this.initialized = false;
    this.logger.info('AI Service shutdown complete');
  }

  private getCachedAnalysis(content: string, options?: AIAnalysisOptions): AIAnalysisResult | null {
    const cacheKey = this.generateCacheKey(content, options);
    const cached = this.analysisCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if cache is expired
    const age = Date.now() - cached.timestamp;
    if (age > this.config.cacheTimeout) {
      this.analysisCache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  private cacheAnalysis(content: string, options: AIAnalysisOptions | undefined, result: AIAnalysisResult): void {
    const cacheKey = this.generateCacheKey(content, options);
    const contentHash = this.hashContent(content);

    this.analysisCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      contentHash,
    });

    this.logger.debug('Analysis result cached', {
      cacheKey: cacheKey.substring(0, 16) + '...',
      analysisId: result.id,
    });
  }

  private generateCacheKey(content: string, options?: AIAnalysisOptions): string {
    const contentHash = this.hashContent(content);
    const optionsHash = this.hashContent(JSON.stringify(options || {}));
    return `${contentHash}_${optionsHash}`;
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

  private checkRateLimit(): void {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const key = minute.toString();

    const current = this.requestCounts.get(key);
    if (current && current.count >= this.config.maxRequestsPerMinute) {
      throw new Error(`Rate limit exceeded: ${this.config.maxRequestsPerMinute} requests per minute`);
    }
  }

  private recordRequest(): void {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const key = minute.toString();

    const current = this.requestCounts.get(key);
    if (current) {
      current.count++;
    } else {
      this.requestCounts.set(key, { count: 1, resetTime: (minute + 1) * 60000 });
    }

    // Clean up old entries
    for (const [k, v] of this.requestCounts.entries()) {
      if (v.resetTime < now) {
        this.requestCounts.delete(k);
      }
    }
  }

  private startCacheCleanup(): void {
    // Clean up expired cache entries every 10 minutes
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [key, cached] of this.analysisCache.entries()) {
        const age = now - cached.timestamp;
        if (age > this.config.cacheTimeout) {
          this.analysisCache.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        this.logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
      }
    }, 10 * 60 * 1000);
  }
}

// Export singleton instance
export const aiService = new AIService();
export default aiService;