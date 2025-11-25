/**
 * Anthropic Provider Implementation
 * Provides AI analysis using Anthropic's Claude models for hallucination detection
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIProviderConfig, AIAnalysisOptions, AIAnalysisResult, RateLimitInfo } from '../interfaces/AIProvider';
import { ProviderHealthStatus } from '../base/BaseProvider';
import { RateLimiter, RateLimitConfig } from './RateLimiter';
import { RequestQueue } from './RequestQueue';
import { UsageTracker } from './UsageTracker';
import { AnthropicConfig } from './AnthropicConfig';
import { AnthropicErrorHandler, AnthropicErrorType } from './AnthropicErrorHandler';
import { CircuitBreaker, CircuitBreakerState } from './CircuitBreaker';
import { AnthropicLogger, LogLevel } from './AnthropicLogger';

import { logger } from '../../logging';
export interface AnthropicProviderConfig extends AIProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  baseUrl?: string;
}

export class AnthropicProvider extends AIProvider {
  private client: Anthropic;
  private anthropicConfig: AnthropicProviderConfig;
  private rateLimiter: RateLimiter;
  private requestQueue: RequestQueue;
  private usageTracker: UsageTracker;
  private circuitBreaker: CircuitBreaker;
  private logger: AnthropicLogger;

  constructor(config: AnthropicProviderConfig) {
    super(config);
    this.anthropicConfig = config;
    
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
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
      maxTokensPerHour: 100000,
      maxTokensPerDay: 500000,
      maxCostPerHour: 30,
      maxCostPerDay: 150
    });

    // Initialize circuit breaker and logging
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 30000, // 30 seconds
      successThreshold: 3,
      monitoringWindow: 300000 // 5 minutes
    });
    this.logger = new AnthropicLogger();
  }

  async analyzeContent(content: string, options?: AIAnalysisOptions): Promise<AIAnalysisResult> {
    // Estimate tokens and cost for this request
    const estimatedTokens = this.estimateTokens(content) + 1000; // Add buffer for response
    const estimatedCost = AnthropicConfig.estimateCost(
      this.anthropicConfig.model,
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
          model: this.anthropicConfig.model,
          options
        }, requestId);
        
        // Create the analysis prompt based on sensitivity level
        const prompt = this.createAnalysisPrompt(content, options);
        
        const message = await this.client.messages.create({
          model: this.anthropicConfig.model,
          max_tokens: options?.maxTokens ?? this.anthropicConfig.maxTokens,
          temperature: options?.temperature ?? this.anthropicConfig.temperature,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        });

        const processingTime = Date.now() - startTime;
        const response = message.content[0];
        
        if (!response || response.type !== 'text') {
          throw new Error('No valid response received from Anthropic');
        }

        // Parse the JSON response
        let analysisData;
        try {
          analysisData = JSON.parse(response.text);
        } catch (error) {
          throw new Error(`Failed to parse Anthropic response: ${error}`);
        }

        // Calculate actual cost
        const actualCost = AnthropicConfig.estimateCost(
          this.anthropicConfig.model,
          message.usage?.input_tokens || 0,
          message.usage?.output_tokens || 0
        );

        // Record usage for tracking
        this.usageTracker.recordUsage({
          requests: 1,
          promptTokens: message.usage?.input_tokens || 0,
          completionTokens: message.usage?.output_tokens || 0,
          cost: actualCost,
          model: this.anthropicConfig.model,
          success: true
        });

        // Log successful API call
        this.logger.logApiCall({
          requestId,
          method: 'messages.create',
          model: this.anthropicConfig.model,
          inputTokens: message.usage?.input_tokens || 0,
          outputTokens: message.usage?.output_tokens || 0,
          cost: actualCost,
          duration: processingTime,
          success: true,
          retryCount: 0
        });

        // Convert to our standard format
        const result: AIAnalysisResult = {
          id: `anthropic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          accuracy: analysisData.accuracy || 85,
          riskLevel: this.determineRiskLevel(analysisData.accuracy || 85),
          hallucinations: this.parseHallucinations(analysisData.hallucinations || [], content),
          verificationSources: analysisData.verificationSources || 0,
          processingTime,
          metadata: {
            contentLength: content.length,
            timestamp: new Date().toISOString(),
            modelVersion: this.anthropicConfig.model,
            provider: 'anthropic',
            tokenUsage: {
              prompt: message.usage?.input_tokens || 0,
              completion: message.usage?.output_tokens || 0,
              total: (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0)
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
    // Anthropic doesn't have a models endpoint, so return known models
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }

  estimateTokens(content: string): number {
    // Rough estimation: ~4 characters per token for English text
    // Claude models have similar tokenization to GPT models
    return Math.ceil(content.length / 4);
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // Test with a minimal message
      await this.client.messages.create({
        model: this.anthropicConfig.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });
      return true;
    } catch (error) {
      logger.error("Anthropic credential validation failed:", error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  async performHealthCheck(): Promise<ProviderHealthStatus> {
    const startTime = Date.now();
    
    try {
      // Simple health check using a minimal API call
      await this.client.messages.create({
        model: this.anthropicConfig.model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Test' }]
      });
      
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

  protected isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || 
           message.includes('too many requests') ||
           message.includes('quota exceeded') ||
           message.includes('429');
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
You are an expert AI content analyst specializing in detecting hallucinations, false claims, and inaccuracies in text. Analyze the provided content and return a detailed JSON response with your findings.

Use ${sensitivity} sensitivity: ${sensitivityInstructions[sensitivity]}

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
        const errorInfo = AnthropicErrorHandler.handleError(error);
        
        // Log the error
        AnthropicErrorHandler.logError(errorInfo, operationName);
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
          model: this.anthropicConfig.model,
          success: false,
          rateLimited: errorInfo.type === AnthropicErrorType.RATE_LIMIT
        });

        // Log failed API call
        this.logger.logApiCall({
          requestId,
          method: operationName,
          model: this.anthropicConfig.model,
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
        const retryStrategy = AnthropicErrorHandler.getRetryStrategy(errorInfo, retryCount);
        
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}