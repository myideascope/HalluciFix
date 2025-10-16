/**
 * AI Provider interface for content analysis services
 */

import { BaseProvider, ProviderConfig } from '../base/BaseProvider';

export interface AIAnalysisOptions {
  sensitivity?: 'low' | 'medium' | 'high';
  includeSourceVerification?: boolean;
  maxHallucinations?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface AIAnalysisResult {
  id: string;
  accuracy: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hallucinations: Array<{
    text: string;
    type: string;
    confidence: number;
    explanation: string;
    startIndex: number;
    endIndex: number;
  }>;
  verificationSources: number;
  processingTime: number;
  metadata: {
    contentLength: number;
    timestamp: string;
    modelVersion: string;
    provider: string;
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
  };
}

export interface AIProviderConfig extends ProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  baseUrl?: string;
}

export interface RateLimitInfo {
  requestsRemaining: number;
  resetTime: Date;
  tokensRemaining?: number;
  tokensResetTime?: Date;
}

export abstract class AIProvider extends BaseProvider {
  protected aiConfig: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    super(config);
    this.aiConfig = config;
  }

  /**
   * Analyze content for hallucinations and accuracy
   */
  abstract analyzeContent(
    content: string, 
    options?: AIAnalysisOptions
  ): Promise<AIAnalysisResult>;

  /**
   * Get current rate limit status
   */
  abstract getRateLimit(): Promise<RateLimitInfo>;

  /**
   * Get available models for this provider
   */
  abstract getAvailableModels(): Promise<string[]>;

  /**
   * Estimate token count for content
   */
  abstract estimateTokens(content: string): number;

  /**
   * Get model information
   */
  getModel(): string {
    return this.aiConfig.model;
  }

  /**
   * Get API key (masked for security)
   */
  getMaskedApiKey(): string {
    const key = this.aiConfig.apiKey;
    if (key.length <= 8) return '***';
    return key.substring(0, 4) + '***' + key.substring(key.length - 4);
  }

  /**
   * Update AI-specific configuration
   */
  updateAIConfig(newConfig: Partial<AIProviderConfig>): void {
    this.aiConfig = { ...this.aiConfig, ...newConfig };
    this.updateConfig(newConfig);
  }
}

export type AIProviderType = 'openai' | 'anthropic' | 'hallucifix' | 'mock';