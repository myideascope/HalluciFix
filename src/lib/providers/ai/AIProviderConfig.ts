/**
 * AI Provider Configuration Management
 * Handles configuration for AI providers and failover settings
 */

export interface AIProviderSettings {
  enabled: boolean;
  priority: number;
  fallbackOrder: number;
  healthCheckEnabled: boolean;
  circuitBreakerEnabled: boolean;
  rateLimits?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
    tokensPerMinute?: number;
    tokensPerHour?: number;
    tokensPerDay?: number;
  };
}

export interface AIProviderConfiguration {
  openai?: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    baseUrl?: string;
    organization?: string;
    settings: AIProviderSettings;
  };
  anthropic?: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    baseUrl?: string;
    settings: AIProviderSettings;
  };
  failover: {
    enabled: boolean;
    maxRetries: number;
    retryDelay: number;
    fallbackOrder: string[];
    healthCheck: {
      enabled: boolean;
      interval: number;
      timeout: number;
      failureThreshold: number;
      recoveryThreshold: number;
    };
    circuitBreaker: {
      enabled: boolean;
      failureThreshold: number;
      recoveryTimeout: number;
      successThreshold: number;
      monitoringWindow: number;
    };
  };
}

export class AIProviderConfig {
  private static readonly DEFAULT_CONFIG: AIProviderConfiguration = {
    openai: {
      apiKey: '',
      model: 'gpt-4',
      maxTokens: 4096,
      temperature: 0.1,
      settings: {
        enabled: true,
        priority: 1,
        fallbackOrder: 0,
        healthCheckEnabled: true,
        circuitBreakerEnabled: true,
        rateLimits: {
          requestsPerMinute: 50,
          requestsPerHour: 1000,
          requestsPerDay: 10000,
          tokensPerMinute: 150000,
          tokensPerHour: 1000000,
          tokensPerDay: 10000000
        }
      }
    },
    anthropic: {
      apiKey: '',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 8192,
      temperature: 0.1,
      settings: {
        enabled: true,
        priority: 2,
        fallbackOrder: 1,
        healthCheckEnabled: true,
        circuitBreakerEnabled: true,
        rateLimits: {
          requestsPerMinute: 50,
          requestsPerHour: 1000,
          requestsPerDay: 10000,
          tokensPerMinute: 40000,
          tokensPerHour: 100000,
          tokensPerDay: 500000
        }
      }
    },
    failover: {
      enabled: true,
      maxRetries: 3,
      retryDelay: 1000,
      fallbackOrder: ['openai', 'anthropic'],
      healthCheck: {
        enabled: true,
        interval: 60000, // 1 minute
        timeout: 10000, // 10 seconds
        failureThreshold: 3,
        recoveryThreshold: 2
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        recoveryTimeout: 30000, // 30 seconds
        successThreshold: 3,
        monitoringWindow: 300000 // 5 minutes
      }
    }
  };

  private config: AIProviderConfiguration;

  constructor(config?: Partial<AIProviderConfiguration>) {
    this.config = this.mergeConfig(AIProviderConfig.DEFAULT_CONFIG, config || {});
  }

  /**
   * Get the complete configuration
   */
  getConfig(): AIProviderConfiguration {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Get OpenAI configuration
   */
  getOpenAIConfig() {
    return this.config.openai;
  }

  /**
   * Get Anthropic configuration
   */
  getAnthropicConfig() {
    return this.config.anthropic;
  }

  /**
   * Get failover configuration
   */
  getFailoverConfig() {
    return this.config.failover;
  }

  /**
   * Update OpenAI configuration
   */
  updateOpenAIConfig(config: Partial<NonNullable<AIProviderConfiguration['openai']>>): void {
    if (this.config.openai) {
      this.config.openai = this.mergeConfig(this.config.openai, config);
    }
  }

  /**
   * Update Anthropic configuration
   */
  updateAnthropicConfig(config: Partial<NonNullable<AIProviderConfiguration['anthropic']>>): void {
    if (this.config.anthropic) {
      this.config.anthropic = this.mergeConfig(this.config.anthropic, config);
    }
  }

  /**
   * Update failover configuration
   */
  updateFailoverConfig(config: Partial<AIProviderConfiguration['failover']>): void {
    this.config.failover = this.mergeConfig(this.config.failover, config);
  }

  /**
   * Enable or disable a provider
   */
  setProviderEnabled(provider: 'openai' | 'anthropic', enabled: boolean): void {
    const providerConfig = this.config[provider];
    if (providerConfig) {
      providerConfig.settings.enabled = enabled;
    }
  }

  /**
   * Set provider priority
   */
  setProviderPriority(provider: 'openai' | 'anthropic', priority: number): void {
    const providerConfig = this.config[provider];
    if (providerConfig) {
      providerConfig.settings.priority = priority;
    }
  }

  /**
   * Set fallback order
   */
  setFallbackOrder(order: string[]): void {
    this.config.failover.fallbackOrder = [...order];
    
    // Update individual provider fallback orders
    order.forEach((providerName, index) => {
      if (providerName === 'openai' && this.config.openai) {
        this.config.openai.settings.fallbackOrder = index;
      } else if (providerName === 'anthropic' && this.config.anthropic) {
        this.config.anthropic.settings.fallbackOrder = index;
      }
    });
  }

  /**
   * Get enabled providers in priority order
   */
  getEnabledProviders(): string[] {
    const providers: Array<{ name: string; priority: number; fallbackOrder: number }> = [];

    if (this.config.openai?.settings.enabled) {
      providers.push({
        name: 'openai',
        priority: this.config.openai.settings.priority,
        fallbackOrder: this.config.openai.settings.fallbackOrder
      });
    }

    if (this.config.anthropic?.settings.enabled) {
      providers.push({
        name: 'anthropic',
        priority: this.config.anthropic.settings.priority,
        fallbackOrder: this.config.anthropic.settings.fallbackOrder
      });
    }

    // Sort by priority (higher first), then by fallback order (lower first)
    return providers
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.fallbackOrder - b.fallbackOrder;
      })
      .map(p => p.name);
  }

  /**
   * Validate configuration
   */
  validate(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if at least one provider is enabled
    const enabledProviders = this.getEnabledProviders();
    if (enabledProviders.length === 0) {
      errors.push('At least one AI provider must be enabled');
    }

    // Validate OpenAI configuration
    if (this.config.openai?.settings.enabled) {
      if (!this.config.openai.apiKey) {
        errors.push('OpenAI API key is required when OpenAI provider is enabled');
      }
      if (!this.config.openai.model) {
        errors.push('OpenAI model is required');
      }
    }

    // Validate Anthropic configuration
    if (this.config.anthropic?.settings.enabled) {
      if (!this.config.anthropic.apiKey) {
        errors.push('Anthropic API key is required when Anthropic provider is enabled');
      }
      if (!this.config.anthropic.model) {
        errors.push('Anthropic model is required');
      }
    }

    // Validate failover configuration
    if (this.config.failover.enabled) {
      if (this.config.failover.fallbackOrder.length === 0) {
        warnings.push('Failover is enabled but no fallback order is specified');
      }

      // Check if fallback order includes only enabled providers
      const invalidProviders = this.config.failover.fallbackOrder.filter(
        provider => !enabledProviders.includes(provider)
      );
      if (invalidProviders.length > 0) {
        warnings.push(`Fallback order includes disabled providers: ${invalidProviders.join(', ')}`);
      }
    }

    // Validate rate limits
    for (const providerName of ['openai', 'anthropic'] as const) {
      const providerConfig = this.config[providerName];
      if (providerConfig?.settings.enabled && providerConfig.settings.rateLimits) {
        const rateLimits = providerConfig.settings.rateLimits;
        
        if (rateLimits.requestsPerMinute && rateLimits.requestsPerHour) {
          if (rateLimits.requestsPerMinute * 60 > rateLimits.requestsPerHour) {
            warnings.push(`${providerName}: requests per minute * 60 exceeds requests per hour limit`);
          }
        }
        
        if (rateLimits.tokensPerMinute && rateLimits.tokensPerHour) {
          if (rateLimits.tokensPerMinute * 60 > rateLimits.tokensPerHour) {
            warnings.push(`${providerName}: tokens per minute * 60 exceeds tokens per hour limit`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Load configuration from environment variables
   */
  static fromEnvironment(): AIProviderConfig {
    const config: Partial<AIProviderConfiguration> = {};

    // OpenAI configuration
    if (process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY) {
      config.openai = {
        apiKey: process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
        model: process.env.VITE_OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-4',
        maxTokens: parseInt(process.env.VITE_OPENAI_MAX_TOKENS || process.env.OPENAI_MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.VITE_OPENAI_TEMPERATURE || process.env.OPENAI_TEMPERATURE || '0.1'),
        baseUrl: process.env.VITE_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
        organization: process.env.VITE_OPENAI_ORGANIZATION || process.env.OPENAI_ORGANIZATION,
        settings: {
          enabled: (process.env.VITE_OPENAI_ENABLED || process.env.OPENAI_ENABLED || 'true').toLowerCase() === 'true',
          priority: parseInt(process.env.VITE_OPENAI_PRIORITY || process.env.OPENAI_PRIORITY || '1'),
          fallbackOrder: parseInt(process.env.VITE_OPENAI_FALLBACK_ORDER || process.env.OPENAI_FALLBACK_ORDER || '0'),
          healthCheckEnabled: true,
          circuitBreakerEnabled: true
        }
      };
    }

    // Anthropic configuration
    if (process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY) {
      config.anthropic = {
        apiKey: process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '',
        model: process.env.VITE_ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        maxTokens: parseInt(process.env.VITE_ANTHROPIC_MAX_TOKENS || process.env.ANTHROPIC_MAX_TOKENS || '8192'),
        temperature: parseFloat(process.env.VITE_ANTHROPIC_TEMPERATURE || process.env.ANTHROPIC_TEMPERATURE || '0.1'),
        baseUrl: process.env.VITE_ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL,
        settings: {
          enabled: (process.env.VITE_ANTHROPIC_ENABLED || process.env.ANTHROPIC_ENABLED || 'true').toLowerCase() === 'true',
          priority: parseInt(process.env.VITE_ANTHROPIC_PRIORITY || process.env.ANTHROPIC_PRIORITY || '2'),
          fallbackOrder: parseInt(process.env.VITE_ANTHROPIC_FALLBACK_ORDER || process.env.ANTHROPIC_FALLBACK_ORDER || '1'),
          healthCheckEnabled: true,
          circuitBreakerEnabled: true
        }
      };
    }

    // Failover configuration
    const fallbackOrder = (process.env.VITE_AI_FALLBACK_ORDER || process.env.AI_FALLBACK_ORDER || 'openai,anthropic')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    config.failover = {
      enabled: (process.env.VITE_AI_FAILOVER_ENABLED || process.env.AI_FAILOVER_ENABLED || 'true').toLowerCase() === 'true',
      maxRetries: parseInt(process.env.VITE_AI_FAILOVER_MAX_RETRIES || process.env.AI_FAILOVER_MAX_RETRIES || '3'),
      retryDelay: parseInt(process.env.VITE_AI_FAILOVER_RETRY_DELAY || process.env.AI_FAILOVER_RETRY_DELAY || '1000'),
      fallbackOrder,
      healthCheck: {
        enabled: true,
        interval: 60000,
        timeout: 10000,
        failureThreshold: 3,
        recoveryThreshold: 2
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        recoveryTimeout: 30000,
        successThreshold: 3,
        monitoringWindow: 300000
      }
    };

    return new AIProviderConfig(config);
  }

  private mergeConfig<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== undefined) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this.mergeConfig(result[key] || {}, source[key]);
        } else {
          result[key] = source[key] as T[Extract<keyof T, string>];
        }
      }
    }
    
    return result;
  }
}