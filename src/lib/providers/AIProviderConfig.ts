/**
 * AI Provider Configuration Service
 * Manages configuration and model selection for AI providers
 */

import { bedrockConfig } from '../aws-config';
import { logger } from '../logging';

export interface ModelCapabilities {
  analysis: boolean;
  reasoning: boolean;
  code: boolean;
  speed: boolean;
  'complex-tasks': boolean;
  'text-generation': boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  inputCostPer1K: number;
  outputCostPer1K: number;
  maxTokens: number;
  contextWindow: number;
  capabilities: ModelCapabilities;
  recommendedFor: string[];
  description?: string;
}

export interface ProviderConfig {
  enabled: boolean;
  priority: number;
  models: ModelInfo[];
  defaultModel: string;
  costLimits: {
    dailyLimit: number;
    perRequestLimit: number;
  };
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export class AIProviderConfigService {
  private logger = logger.child({ component: 'AIProviderConfigService' });
  private providers: Map<string, ProviderConfig> = new Map();

  constructor() {
    this.initializeProviders();
  }

  /**
   * Get optimal model for content analysis based on requirements
   */
  getOptimalModel(requirements: {
    contentLength: number;
    sensitivity: 'low' | 'medium' | 'high';
    maxCost?: number;
    requiresReasoning?: boolean;
    requiresSpeed?: boolean;
  }): ModelInfo | null {
    const availableModels = this.getAvailableModels();
    
    if (availableModels.length === 0) {
      return null;
    }

    // Filter models based on requirements
    let candidateModels = availableModels.filter(model => {
      // Check content length against context window
      if (requirements.contentLength > model.contextWindow * 0.8) { // Use 80% of context window
        return false;
      }

      // Check cost constraints
      if (requirements.maxCost) {
        const estimatedCost = this.estimateModelCost(model, requirements.contentLength);
        if (estimatedCost > requirements.maxCost) {
          return false;
        }
      }

      // Check capability requirements
      if (requirements.requiresReasoning && !model.capabilities.reasoning) {
        return false;
      }

      if (requirements.requiresSpeed && !model.capabilities.speed) {
        return false;
      }

      return true;
    });

    if (candidateModels.length === 0) {
      // If no models meet requirements, return the cheapest available model
      candidateModels = availableModels;
    }

    // Select model based on sensitivity and requirements
    return this.selectModelBySensitivity(candidateModels, requirements.sensitivity);
  }

  /**
   * Get all available models from enabled providers
   */
  getAvailableModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
    
    for (const [providerName, config] of this.providers.entries()) {
      if (config.enabled) {
        models.push(...config.models);
      }
    }

    return models.sort((a, b) => {
      // Sort by provider priority, then by cost
      const providerA = this.providers.get(a.provider);
      const providerB = this.providers.get(b.provider);
      
      if (providerA && providerB) {
        if (providerA.priority !== providerB.priority) {
          return providerB.priority - providerA.priority; // Higher priority first
        }
      }
      
      return a.inputCostPer1K - b.inputCostPer1K; // Lower cost first
    });
  }

  /**
   * Get provider configuration
   */
  getProviderConfig(providerName: string): ProviderConfig | null {
    return this.providers.get(providerName) || null;
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(providerName: string, config: Partial<ProviderConfig>): void {
    const existing = this.providers.get(providerName);
    if (existing) {
      this.providers.set(providerName, { ...existing, ...config });
      this.logger.info('Updated provider configuration', { providerName, config });
    }
  }

  /**
   * Estimate cost for a model given content length
   */
  estimateModelCost(model: ModelInfo, contentLength: number, outputTokens: number = 2000): number {
    const inputTokens = Math.ceil(contentLength / 4); // Rough estimation
    const inputCost = (inputTokens / 1000) * model.inputCostPer1K;
    const outputCost = (outputTokens / 1000) * model.outputCostPer1K;
    return inputCost + outputCost;
  }

  /**
   * Get model recommendations for different use cases
   */
  getModelRecommendations(): {
    fastAnalysis: ModelInfo | null;
    balancedAnalysis: ModelInfo | null;
    highAccuracyAnalysis: ModelInfo | null;
    costEffective: ModelInfo | null;
  } {
    const models = this.getAvailableModels();

    return {
      fastAnalysis: models.find(m => m.capabilities.speed) || null,
      balancedAnalysis: models.find(m => m.recommendedFor.includes('balanced')) || null,
      highAccuracyAnalysis: models.find(m => m.recommendedFor.includes('high-accuracy')) || null,
      costEffective: models.find(m => m.recommendedFor.includes('cost-effective')) || null,
    };
  }

  private initializeProviders(): void {
    // Initialize Bedrock provider
    this.providers.set('bedrock', {
      enabled: bedrockConfig.enabled,
      priority: 10, // Highest priority
      defaultModel: bedrockConfig.model,
      models: [
        {
          id: 'anthropic.claude-3-sonnet-20240229-v1:0',
          name: 'Claude 3 Sonnet',
          provider: 'bedrock',
          inputCostPer1K: 0.003,
          outputCostPer1K: 0.015,
          maxTokens: 200000,
          contextWindow: 200000,
          capabilities: {
            analysis: true,
            reasoning: true,
            code: true,
            speed: false,
            'complex-tasks': true,
            'text-generation': true,
          },
          recommendedFor: ['balanced', 'production'],
          description: 'Balanced model with strong reasoning capabilities',
        },
        {
          id: 'anthropic.claude-3-haiku-20240307-v1:0',
          name: 'Claude 3 Haiku',
          provider: 'bedrock',
          inputCostPer1K: 0.00025,
          outputCostPer1K: 0.00125,
          maxTokens: 200000,
          contextWindow: 200000,
          capabilities: {
            analysis: true,
            reasoning: false,
            code: false,
            speed: true,
            'complex-tasks': false,
            'text-generation': true,
          },
          recommendedFor: ['fast', 'cost-effective'],
          description: 'Fast and cost-effective model for simple analysis',
        },
        {
          id: 'anthropic.claude-3-opus-20240229-v1:0',
          name: 'Claude 3 Opus',
          provider: 'bedrock',
          inputCostPer1K: 0.015,
          outputCostPer1K: 0.075,
          maxTokens: 200000,
          contextWindow: 200000,
          capabilities: {
            analysis: true,
            reasoning: true,
            code: true,
            speed: false,
            'complex-tasks': true,
            'text-generation': true,
          },
          recommendedFor: ['high-accuracy', 'complex'],
          description: 'Most capable model for complex analysis tasks',
        },
        {
          id: 'amazon.titan-text-express-v1',
          name: 'Amazon Titan Text Express',
          provider: 'bedrock',
          inputCostPer1K: 0.0008,
          outputCostPer1K: 0.0016,
          maxTokens: 8000,
          contextWindow: 8000,
          capabilities: {
            analysis: true,
            reasoning: false,
            code: false,
            speed: true,
            'complex-tasks': false,
            'text-generation': true,
          },
          recommendedFor: ['cost-effective', 'simple'],
          description: 'Amazon\'s cost-effective model for basic analysis',
        },
      ],
      costLimits: {
        dailyLimit: bedrockConfig.dailyCostLimit,
        perRequestLimit: 1.0,
      },
      rateLimits: {
        requestsPerMinute: bedrockConfig.maxRequestsPerMinute,
        tokensPerMinute: 100000,
      },
    });

    // Initialize mock provider for fallback
    this.providers.set('mock', {
      enabled: true,
      priority: 1, // Lowest priority
      defaultModel: 'mock-v1.0',
      models: [
        {
          id: 'mock-v1.0',
          name: 'Mock Analysis Model',
          provider: 'mock',
          inputCostPer1K: 0,
          outputCostPer1K: 0,
          maxTokens: 100000,
          contextWindow: 100000,
          capabilities: {
            analysis: true,
            reasoning: false,
            code: false,
            speed: true,
            'complex-tasks': false,
            'text-generation': true,
          },
          recommendedFor: ['development', 'fallback'],
          description: 'Mock model for development and fallback scenarios',
        },
      ],
      costLimits: {
        dailyLimit: 0,
        perRequestLimit: 0,
      },
      rateLimits: {
        requestsPerMinute: 1000,
        tokensPerMinute: 1000000,
      },
    });

    this.logger.info('AI provider configurations initialized', {
      providers: Array.from(this.providers.keys()),
      enabledProviders: Array.from(this.providers.entries())
        .filter(([_, config]) => config.enabled)
        .map(([name]) => name),
    });
  }

  private selectModelBySensitivity(models: ModelInfo[], sensitivity: 'low' | 'medium' | 'high'): ModelInfo {
    switch (sensitivity) {
      case 'high':
        // Prefer high-accuracy models
        return models.find(m => m.recommendedFor.includes('high-accuracy')) ||
               models.find(m => m.capabilities.reasoning) ||
               models[0];
      
      case 'low':
        // Prefer fast/cost-effective models
        return models.find(m => m.recommendedFor.includes('cost-effective')) ||
               models.find(m => m.capabilities.speed) ||
               models[0];
      
      case 'medium':
      default:
        // Prefer balanced models
        return models.find(m => m.recommendedFor.includes('balanced')) ||
               models.find(m => m.capabilities.analysis && m.capabilities.reasoning) ||
               models[0];
    }
  }
}

// Export singleton instance
export const aiProviderConfig = new AIProviderConfigService();
export default aiProviderConfig;