/**
 * Anthropic Configuration and Pricing
 * Configuration constants and cost calculation for Anthropic API
 */

export interface AnthropicModelPricing {
  inputTokensPerDollar: number;
  outputTokensPerDollar: number;
  inputCostPer1000: number;
  outputCostPer1000: number;
}

export class AnthropicConfig {
  // Anthropic model pricing (as of 2024)
  private static readonly MODEL_PRICING: Record<string, AnthropicModelPricing> = {
    'claude-3-5-sonnet-20241022': {
      inputTokensPerDollar: 333333, // $3 per million input tokens
      outputTokensPerDollar: 66667, // $15 per million output tokens
      inputCostPer1000: 0.003,
      outputCostPer1000: 0.015
    },
    'claude-3-5-haiku-20241022': {
      inputTokensPerDollar: 1000000, // $1 per million input tokens
      outputTokensPerDollar: 200000, // $5 per million output tokens
      inputCostPer1000: 0.001,
      outputCostPer1000: 0.005
    },
    'claude-3-opus-20240229': {
      inputTokensPerDollar: 66667, // $15 per million input tokens
      outputTokensPerDollar: 13333, // $75 per million output tokens
      inputCostPer1000: 0.015,
      outputCostPer1000: 0.075
    },
    'claude-3-sonnet-20240229': {
      inputTokensPerDollar: 333333, // $3 per million input tokens
      outputTokensPerDollar: 66667, // $15 per million output tokens
      inputCostPer1000: 0.003,
      outputCostPer1000: 0.015
    },
    'claude-3-haiku-20240307': {
      inputTokensPerDollar: 4000000, // $0.25 per million input tokens
      outputTokensPerDollar: 800000, // $1.25 per million output tokens
      inputCostPer1000: 0.00025,
      outputCostPer1000: 0.00125
    }
  };

  // Default model configurations
  public static readonly DEFAULT_MODELS = {
    CLAUDE_3_5_SONNET: 'claude-3-5-sonnet-20241022',
    CLAUDE_3_5_HAIKU: 'claude-3-5-haiku-20241022',
    CLAUDE_3_OPUS: 'claude-3-opus-20240229',
    CLAUDE_3_SONNET: 'claude-3-sonnet-20240229',
    CLAUDE_3_HAIKU: 'claude-3-haiku-20240307'
  };

  // Model capabilities and limits
  public static readonly MODEL_LIMITS = {
    'claude-3-5-sonnet-20241022': {
      maxTokens: 8192,
      contextWindow: 200000,
      supportsStreaming: true,
      supportsVision: true
    },
    'claude-3-5-haiku-20241022': {
      maxTokens: 8192,
      contextWindow: 200000,
      supportsStreaming: true,
      supportsVision: true
    },
    'claude-3-opus-20240229': {
      maxTokens: 4096,
      contextWindow: 200000,
      supportsStreaming: true,
      supportsVision: true
    },
    'claude-3-sonnet-20240229': {
      maxTokens: 4096,
      contextWindow: 200000,
      supportsStreaming: true,
      supportsVision: true
    },
    'claude-3-haiku-20240307': {
      maxTokens: 4096,
      contextWindow: 200000,
      supportsStreaming: true,
      supportsVision: true
    }
  };

  // Rate limits (conservative estimates)
  public static readonly RATE_LIMITS = {
    requestsPerMinute: 50,
    requestsPerHour: 1000,
    requestsPerDay: 10000,
    tokensPerMinute: 40000,
    tokensPerHour: 100000,
    tokensPerDay: 500000
  };

  /**
   * Estimate cost for a request
   */
  static estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = this.MODEL_PRICING[model];
    if (!pricing) {
      // Use Claude 3.5 Sonnet pricing as default
      const defaultPricing = this.MODEL_PRICING[this.DEFAULT_MODELS.CLAUDE_3_5_SONNET];
      return (inputTokens * defaultPricing.inputCostPer1000 / 1000) + 
             (outputTokens * defaultPricing.outputCostPer1000 / 1000);
    }

    return (inputTokens * pricing.inputCostPer1000 / 1000) + 
           (outputTokens * pricing.outputCostPer1000 / 1000);
  }

  /**
   * Get model pricing information
   */
  static getModelPricing(model: string): AnthropicModelPricing | null {
    return this.MODEL_PRICING[model] || null;
  }

  /**
   * Get model limits and capabilities
   */
  static getModelLimits(model: string) {
    return this.MODEL_LIMITS[model] || null;
  }

  /**
   * Check if model supports streaming
   */
  static supportsStreaming(model: string): boolean {
    const limits = this.getModelLimits(model);
    return limits?.supportsStreaming || false;
  }

  /**
   * Check if model supports vision
   */
  static supportsVision(model: string): boolean {
    const limits = this.getModelLimits(model);
    return limits?.supportsVision || false;
  }

  /**
   * Get recommended model for different use cases
   */
  static getRecommendedModel(useCase: 'speed' | 'balance' | 'quality'): string {
    switch (useCase) {
      case 'speed':
        return this.DEFAULT_MODELS.CLAUDE_3_5_HAIKU;
      case 'balance':
        return this.DEFAULT_MODELS.CLAUDE_3_5_SONNET;
      case 'quality':
        return this.DEFAULT_MODELS.CLAUDE_3_OPUS;
      default:
        return this.DEFAULT_MODELS.CLAUDE_3_5_SONNET;
    }
  }

  /**
   * Validate model name
   */
  static isValidModel(model: string): boolean {
    return model in this.MODEL_PRICING;
  }

  /**
   * Get all available models
   */
  static getAvailableModels(): string[] {
    return Object.keys(this.MODEL_PRICING);
  }

  /**
   * Get cost comparison between models for a given token usage
   */
  static compareModelCosts(inputTokens: number, outputTokens: number): Record<string, number> {
    const costs: Record<string, number> = {};
    
    for (const model of this.getAvailableModels()) {
      costs[model] = this.estimateCost(model, inputTokens, outputTokens);
    }
    
    return costs;
  }

  /**
   * Get the most cost-effective model for given token usage
   */
  static getMostCostEffectiveModel(inputTokens: number, outputTokens: number): {
    model: string;
    cost: number;
  } {
    const costs = this.compareModelCosts(inputTokens, outputTokens);
    const sortedModels = Object.entries(costs).sort(([, a], [, b]) => a - b);
    
    return {
      model: sortedModels[0][0],
      cost: sortedModels[0][1]
    };
  }
}