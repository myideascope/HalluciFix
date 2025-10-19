/**
 * OpenAI Provider Implementation
 * Provides AI analysis using OpenAI's GPT models for hallucination detection
 */

import OpenAI from 'openai';
import { AIProvider, AIProviderConfig, AIAnalysisOptions, AIAnalysisResult, RateLimitInfo } from '../interfaces/AIProvider';
import { ProviderHealthStatus } from '../base/BaseProvider';
import { RateLimiter, RateLimitConfig } from './RateLimiter';
import { RequestQueue } from './RequestQueue';
import { UsageTracker } from './UsageTracker';
import { OpenAIConfig } from './OpenAIConfig';
import { OpenAIErrorHandler, OpenAIErrorType } from './OpenAIErrorHandler';
import { CircuitBreaker, CircuitBreakerState } from './CircuitBreaker';
import { OpenAILogger, LogLevel } from './OpenAILogger';

export interface OpenAIProviderConfig extends AIProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  baseUrl?: string;
  organization?: string;
}

export class OpenAIProvider extends AIProvider {
  private client: OpenAI;
  private openaiConfig: OpenAIProviderConfig;
  private rateLimiter: RateLimiter;
  private requestQueue: RequestQueue;
  private usageTracker: UsageTracker;
  private circuitBreaker: CircuitBreaker;
  private logger: OpenAILogger;

  constructor(config: OpenAIProviderConfig) {
    super(config);
    this.openaiConfig = config;
    
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      organization: config.organization,
      dangerouslyAllowBrowser: true // Required for client-side usage
    });

    // Initialize rate limiting and quota management
    this.rateLimiter = new RateLimiter(config.rateLimits || {});
    this.requestQueue = new RequestQueue({
      maxQueueSize: 100,
      defaultMaxWaitTime: 300000 // 5 minutes
    });
    this.usageTracker = new UsageTracker({
      maxRequestsPerHour: config.rateLimits?.requestsPerHour || 1000,
      maxRequestsPerDay: config.rateLimits?.requestsPerDay || 10000,
      maxTokensPerHour: 150000,
      maxTokensPerDay: 1000000,
      maxCostPerHour: 50,
      maxCostPerDay: 200
    });

    // Initialize circuit breaker and logging
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 30000, // 30 seconds
      successThreshold: 3,
      monitoringWindow: 300000 // 5 minutes
    });
    this.logger = new OpenAILogger();
  }

  async analyzeContent(content: string, options?: AIAnalysisOptions): Promise<AIAnalysisResult> {
    // Estimate tokens and cost for this request
    const estimatedTokens = this.estimateTokens(content) + 1000; // Add buffer for response
    const estimatedCost = OpenAIConfig.estimateCost(
      this.openaiConfig.model,
      estimatedTokens,
      500 // Estimated response tokens
    );

    // Check quotas before proceeding
    const quotaCheck = this.usageTracker.wouldExceedQuota(estimatedTokens, estimatedCost);
    if (!quotaCheck.allowed) {
      throw new Error(`Request blocked: ${quotaCheck.reason}`);
    }

    // Check rate limits
    const rateLimitStatus = this.rateLimiter.checkRequest(estimatedTokens);
    if (!rateLimitStatus.allowed) {
      // If rate limited, queue the request
      return this.requestQueue.enqueue(
        () => this.performAnalysis(content, options),
        {
          priority: options?.sensitivity === 'high' ? 2 : 1,
          estimatedTokens,
          maxWaitTime: 300000 // 5 minutes
        }
      );
    }

    // Execute immediately if rate limits allow
    return this.performAnalysis(content, options);
  }

  private async performAnalysis(content: string, options?: AIAnalysisOptions): Promise<AIAnalysisResult> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return this.circuitBreaker.execute(async () => {
      return this.executeWithRetryAndLogging(async () => {
        const startTime = Date.now();
        
        this.logger.debug('Starting content analysis', 'analysis', {
          contentLength: content.length,
          model: this.openaiConfig.model,
          options
        }, requestId);
        
        // Create the analysis prompt based on sensitivity level
        const prompt = this.createAnalysisPrompt(content, options);
        
        const completion = await this.client.chat.completions.create({
          model: this.openaiConfig.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert AI content analyst specializing in detecting hallucinations, false claims, and inaccuracies in text. Analyze the provided content and return a detailed JSON response with your findings.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: options?.temperature ?? this.openaiConfig.temperature,
          max_tokens: options?.maxTokens ?? this.openaiConfig.maxTokens,
          response_format: { type: 'json_object' }
        });

        const processingTime = Date.now() - startTime;
        const response = completion.choices[0]?.message?.content;
        
        if (!response) {
          throw new Error('No response received from OpenAI');
        }

        // Parse the JSON response
        let analysisData;
        try {
          analysisData = JSON.parse(response);
        } catch (error) {
          throw new Error(`Failed to parse OpenAI response: ${error}`);
        }

        // Calculate actual cost
        const actualCost = OpenAIConfig.estimateCost(
          this.openaiConfig.model,
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0
        );

        // Record usage for tracking
        this.usageTracker.recordUsage({
          requests: 1,
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          cost: actualCost,
          model: this.openaiConfig.model,
          success: true
        });

        // Log successful API call
        this.logger.logApiCall({
          requestId,
          method: 'chat.completions.create',
          model: this.openaiConfig.model,
          inputTokens: completion.usage?.prompt_tokens || 0,
          outputTokens: completion.usage?.completion_tokens || 0,
          cost: actualCost,
          duration: processingTime,
          success: true,
          retryCount: 0
        });

        // Convert to our standard format
        const result: AIAnalysisResult = {
          id: `openai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          accuracy: analysisData.accuracy || 85,
          riskLevel: this.determineRiskLevel(analysisData.accuracy || 85),
          hallucinations: this.parseHallucinations(analysisData.hallucinations || [], content),
          verificationSources: analysisData.verificationSources || 0,
          processingTime,
          metadata: {
            contentLength: content.length,
            timestamp: new Date().toISOString(),
            modelVersion: this.openaiConfig.model,
            provider: 'openai',
            tokenUsage: {
              prompt: completion.usage?.prompt_tokens || 0,
              completion: completion.usage?.completion_tokens || 0,
              total: completion.usage?.total_tokens || 0
            }
          }
        };

        this.logger.info('Content analysis completed successfully', 'analysis', {
          accuracy: result.accuracy,
          riskLevel: result.riskLevel,
          hallucinationCount: result.hallucinations.length,
          processingTime
        }, requestId);

        return result;
      }, 'analyzeContent', requestId);
    }, 'analyzeContent');
  }

  async getRateLimit(): Promise<RateLimitInfo> {
    const rateLimitStatus = this.rateLimiter.getStatus();
    const quotaStatus = this.usageTracker.checkQuotas();
    
    return {
      requestsRemaining: rateLimitStatus.remaining.requests,
      resetTime: rateLimitStatus.resetTime.requests,
      tokensRemaining: rateLimitStatus.remaining.tokens,
      tokensResetTime: rateLimitStatus.resetTime.tokens
    };
  }

  async getAvailableModels(): Promise<string[]> {
    return this.executeWithRetry(async () => {
      const models = await this.client.models.list();
      return models.data
        .filter(model => model.id.includes('gpt'))
        .map(model => model.id)
        .sort();
    }, 'getAvailableModels');
  }

  estimateTokens(content: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(content.length / 4);
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      console.error('OpenAI credential validation failed:', error);
      return false;
    }
  }

  async performHealthCheck(): Promise<ProviderHealthStatus> {
    const startTime = Date.now();
    
    try {
      // Simple health check using a minimal API call
      await this.client.models.list();
      
      const responseTime = Date.now() - startTime;
      
      this.healthStatus = {
        isHealthy: true,
        lastHealthCheck: new Date(),
        consecutiveFailures: 0,
        responseTime
      };
    } catch (error) {
      this.healthStatus = {
        isHealthy: false,
        lastHealthCheck: new Date(),
        consecutiveFailures: this.healthStatus.consecutiveFailures + 1,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
    
    return this.healthStatus;
  }



  private createAnalysisPrompt(content: string, options?: AIAnalysisOptions): string {
    const sensitivity = options?.sensitivity || 'medium';
    const maxHallucinations = options?.maxHallucinations || 5;
    
    const sensitivityInstructions = {
      low: 'Focus on obvious factual errors and clear misinformation. Be conservative in flagging content.',
      medium: 'Identify factual errors, unsupported claims, and potential misinformation with balanced scrutiny.',
      high: 'Thoroughly examine all claims for accuracy, including subtle inaccuracies and questionable statements.'
    };

    return `
Analyze the following content for hallucinations, false claims, and inaccuracies. Use ${sensitivity} sensitivity: ${sensitivityInstructions[sensitivity]}

Content to analyze:
"""
${content}
"""

Return your analysis as a JSON object with the following structure:
{
  "accuracy": <number between 0-100 representing overall accuracy percentage>,
  "hallucinations": [
    {
      "text": "<exact text from content that is problematic>",
      "type": "<type of hallucination: False Fact, Unverifiable Claim, Exaggerated Statement, etc.>",
      "confidence": <number between 0-1 representing confidence in this being a hallucination>,
      "explanation": "<detailed explanation of why this is problematic>",
      "startIndex": <character position where the problematic text starts>,
      "endIndex": <character position where the problematic text ends>
    }
  ],
  "verificationSources": <number of sources that would be needed to verify claims>,
  "summary": "<brief summary of the analysis findings>"
}

Guidelines:
- Only identify up to ${maxHallucinations} hallucinations
- Be specific about character positions (startIndex/endIndex)
- Provide clear, actionable explanations
- Consider context and nuance in your analysis
- Focus on factual accuracy rather than opinion or style
`;
  }

  private parseHallucinations(hallucinations: any[], content: string): AIAnalysisResult['hallucinations'] {
    return hallucinations.map(h => ({
      text: h.text || '',
      type: h.type || 'Unknown',
      confidence: Math.min(Math.max(h.confidence || 0.5, 0), 1),
      explanation: h.explanation || 'No explanation provided',
      startIndex: Math.max(h.startIndex || 0, 0),
      endIndex: Math.min(h.endIndex || h.text?.length || 0, content.length)
    }));
  }

  private determineRiskLevel(accuracy: number): 'low' | 'medium' | 'high' | 'critical' {
    if (accuracy >= 85) return 'low';
    if (accuracy >= 70) return 'medium';
    if (accuracy >= 50) return 'high';
    return 'critical';
  }

  /**
   * Get usage metrics and quota status
   */
  getUsageMetrics() {
    return this.usageTracker.getUsageMetrics();
  }

  /**
   * Get quota status with warnings
   */
  getQuotaStatus() {
    return this.usageTracker.checkQuotas();
  }

  /**
   * Get request queue status
   */
  getQueueStatus() {
    return this.requestQueue.getStatus();
  }

  /**
   * Reset usage tracking and rate limits
   */
  resetUsageTracking() {
    this.usageTracker.reset();
    this.rateLimiter.reset();
    this.requestQueue.clear();
  }

  /**
   * Enhanced retry logic with comprehensive error handling
   */
  private async executeWithRetryAndLogging<T>(
    operation: () => Promise<T>,
    operationName: string,
    requestId: string
  ): Promise<T> {
    let lastError: Error | null = null;
    let retryCount = 0;

    while (true) {
      try {
        const result = await operation();
        
        if (retryCount > 0) {
          this.logger.info(`Operation succeeded after ${retryCount} retries`, 'retry', {
            operation: operationName,
            retryCount
          }, requestId);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        const errorInfo = OpenAIErrorHandler.handleError(error);
        
        // Log the error
        OpenAIErrorHandler.logError(errorInfo, operationName);
        this.logger.error(`Operation failed: ${operationName}`, 'error', {
          errorType: errorInfo.type,
          errorMessage: errorInfo.message,
          retryCount,
          isRetryable: errorInfo.isRetryable
        }, requestId);

        // Record failed usage
        this.usageTracker.recordUsage({
          requests: 1,
          promptTokens: 0,
          completionTokens: 0,
          cost: 0,
          model: this.openaiConfig.model,
          success: false,
          rateLimited: errorInfo.type === OpenAIErrorType.RATE_LIMIT
        });

        // Log failed API call
        this.logger.logApiCall({
          requestId,
          method: operationName,
          model: this.openaiConfig.model,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          duration: 0,
          success: false,
          errorType: errorInfo.type,
          errorMessage: errorInfo.message,
          retryCount
        });

        // Get retry strategy
        const retryStrategy = OpenAIErrorHandler.getRetryStrategy(errorInfo, retryCount);
        
        if (!retryStrategy.shouldRetry) {
          this.logger.error(`Operation failed permanently after ${retryCount} retries`, 'retry', {
            operation: operationName,
            finalError: errorInfo.type,
            totalRetries: retryCount
          }, requestId);
          throw lastError;
        }

        retryCount++;
        
        this.logger.warn(`Retrying operation in ${retryStrategy.delay}ms (attempt ${retryCount}/${retryStrategy.maxRetries})`, 'retry', {
          operation: operationName,
          errorType: errorInfo.type,
          delay: retryStrategy.delay
        }, requestId);

        // Wait before retry
        await this.sleep(retryStrategy.delay);
      }
    }
  }

  /**
   * Get comprehensive error and performance metrics
   */
  getErrorMetrics() {
    return {
      circuitBreaker: this.circuitBreaker.getMetrics(),
      performance: this.logger.getPerformanceMetrics(),
      recentErrors: this.logger.getLogs({ level: LogLevel.ERROR, limit: 10 }),
      recentApiCalls: this.logger.getApiCallLogs({ limit: 20 })
    };
  }

  /**
   * Get detailed logs for debugging
   */
  getLogs(options: {
    level?: LogLevel;
    limit?: number;
    since?: Date;
  } = {}) {
    return this.logger.getLogs(options);
  }

  /**
   * Reset all error tracking and circuit breaker
   */
  resetErrorTracking() {
    this.circuitBreaker.reset();
    this.logger.clearLogs();
  }

  protected isRateLimitError(error: Error): boolean {
    const errorInfo = OpenAIErrorHandler.handleError(error);
    return errorInfo.type === OpenAIErrorType.RATE_LIMIT;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}