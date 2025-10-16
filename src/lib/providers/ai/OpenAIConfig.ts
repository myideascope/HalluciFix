/**
 * OpenAI Configuration Management
 * Handles environment variable loading and validation for OpenAI provider
 */

import { OpenAIProviderConfig } from './OpenAIProvider';

export class OpenAIConfig {
  /**
   * Load OpenAI configuration from environment variables
   */
  static loadFromEnvironment(): OpenAIProviderConfig | null {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    
    if (!apiKey) {
      console.warn('OpenAI API key not found in environment variables');
      return null;
    }

    return {
      name: 'openai',
      enabled: true,
      priority: 1,
      apiKey,
      model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-4',
      maxTokens: parseInt(import.meta.env.VITE_OPENAI_MAX_TOKENS || '4000'),
      temperature: parseFloat(import.meta.env.VITE_OPENAI_TEMPERATURE || '0.1'),
      baseUrl: import.meta.env.VITE_OPENAI_BASE_URL,
      organization: import.meta.env.VITE_OPENAI_ORGANIZATION,
      timeout: 30000, // 30 seconds
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 3000,
        requestsPerDay: 10000
      },
      retryConfig: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
    };
  }

  /**
   * Validate OpenAI configuration
   */
  static validateConfig(config: OpenAIProviderConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push('API key is required');
    } else if (!config.apiKey.startsWith('sk-')) {
      errors.push('API key must start with "sk-"');
    }

    if (!config.model) {
      errors.push('Model is required');
    }

    if (config.maxTokens <= 0) {
      errors.push('Max tokens must be greater than 0');
    }

    if (config.temperature < 0 || config.temperature > 2) {
      errors.push('Temperature must be between 0 and 2');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get default configuration for development/testing
   */
  static getDefaultConfig(): Partial<OpenAIProviderConfig> {
    return {
      name: 'openai',
      enabled: true,
      priority: 1,
      model: 'gpt-4',
      maxTokens: 4000,
      temperature: 0.1,
      timeout: 30000,
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 3000,
        requestsPerDay: 10000
      },
      retryConfig: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
    };
  }

  /**
   * Check if OpenAI is configured in the environment
   */
  static isConfigured(): boolean {
    return !!import.meta.env.VITE_OPENAI_API_KEY;
  }

  /**
   * Get available models based on configuration
   */
  static getAvailableModels(): string[] {
    return [
      'gpt-4',
      'gpt-4-turbo-preview',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k'
    ];
  }

  /**
   * Estimate cost for a request (in USD)
   */
  static estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Pricing as of 2024 (per 1K tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
      'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 }
    };

    const modelPricing = pricing[model] || pricing['gpt-3.5-turbo'];
    
    return (inputTokens / 1000) * modelPricing.input + 
           (outputTokens / 1000) * modelPricing.output;
  }
}