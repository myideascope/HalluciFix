/**
 * AI Service with Provider Failover
 * Main service for AI analysis with automatic provider failover
 */

import { AIProvider, AIAnalysisOptions, AIAnalysisResult } from '../interfaces/AIProvider';
import { OpenAIProvider, OpenAIProviderConfig } from './OpenAIProvider';
import { AnthropicProvider, AnthropicProviderConfig } from './AnthropicProvider';
import { AIProviderFailover, FailoverConfig } from './AIProviderFailover';
import { AIProviderHealthChecker, HealthCheckConfig } from './AIProviderHealthChecker';
import { AIProviderConfig, AIProviderConfiguration } from './AIProviderConfig';
import { providerRegistry } from '../registry/ProviderRegistry';

export interface AIServiceConfig {
  providers: AIProviderConfiguration;
  failover: FailoverConfig;
  healthCheck: HealthCheckConfig;
}

export interface AIServiceStatus {
  initialized: boolean;
  enabledProviders: string[];
  healthyProviders: string[];
  unhealthyProviders: string[];
  failoverEnabled: boolean;
  healthCheckEnabled: boolean;
  lastHealthCheck?: Date;
}

export class AIService {
  private static instance: AIService;
  private config: AIProviderConfig;
  private failover: AIProviderFailover;
  private healthChecker: AIProviderHealthChecker;
  private providers: Map<string, AIProvider> = new Map();
  private initialized = false;

  private constructor() {
    // Initialize with default configuration
    this.config = AIProviderConfig.fromEnvironment();
    
    const failoverConfig = this.config.getFailoverConfig();
    this.failover = new AIProviderFailover({
      maxRetries: failoverConfig.maxRetries,
      retryDelay: failoverConfig.retryDelay,
      enableCircuitBreaker: failoverConfig.circuitBreaker.enabled,
      fallbackOrder: failoverConfig.fallbackOrder
    });

    const healthCheckConfig = failoverConfig.healthCheck;
    this.healthChecker = new AIProviderHealthChecker({
      interval: healthCheckConfig.interval,
      timeout: healthCheckConfig.timeout,
      retryAttempts: 2,
      retryDelay: 5000,
      failureThreshold: healthCheckConfig.failureThreshold,
      recoveryThreshold: healthCheckConfig.recoveryThreshold
    });
  }

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * Initialize the AI service
   */
  async initialize(customConfig?: Partial<AIProviderConfiguration>): Promise<void> {
    if (this.initialized) {
      console.warn('AI Service is already initialized');
      return;
    }

    console.log('🤖 Initializing AI Service...');

    try {
      // Update configuration if provided
      if (customConfig) {
        if (customConfig.openai) {
          this.config.updateOpenAIConfig(customConfig.openai);
        }
        if (customConfig.anthropic) {
          this.config.updateAnthropicConfig(customConfig.anthropic);
        }
        if (customConfig.failover) {
          this.config.updateFailoverConfig(customConfig.failover);
        }
      }

      // Validate configuration
      const validation = this.config.validate();
      if (!validation.isValid) {
        throw new Error(`AI Service configuration is invalid: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        console.warn('AI Service configuration warnings:', validation.warnings);
      }

      // Initialize providers
      await this.initializeProviders();

      // Start health checking if enabled
      const failoverConfig = this.config.getFailoverConfig();
      if (failoverConfig.healthCheck.enabled) {
        this.healthChecker.start();
      }

      this.initialized = true;
      console.log('✅ AI Service initialized successfully');
      this.logStatus();

    } catch (error) {
      console.error('❌ AI Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Analyze content with automatic failover
   */
  async analyzeContent(
    content: string,
    options?: AIAnalysisOptions,
    preferredProvider?: string
  ): Promise<AIAnalysisResult> {
    if (!this.initialized) {
      throw new Error('AI Service not initialized. Call initialize() first.');
    }

    const failoverConfig = this.config.getFailoverConfig();
    
    if (failoverConfig.enabled) {
      return this.failover.analyzeContent(content, options, preferredProvider);
    } else {
      // Use direct provider without failover
      const provider = this.getBestProvider(preferredProvider);
      if (!provider) {
        throw new Error('No AI providers available');
      }
      return provider.analyzeContent(content, options);
    }
  }

  /**
   * Get the best available provider
   */
  getBestProvider(preferredProvider?: string): AIProvider | null {
    const failoverConfig = this.config.getFailoverConfig();
    
    if (failoverConfig.enabled) {
      return this.failover.getBestProvider(preferredProvider);
    } else {
      // Return preferred provider or first available
      if (preferredProvider && this.providers.has(preferredProvider)) {
        return this.providers.get(preferredProvider) || null;
      }
      
      const enabledProviders = this.config.getEnabledProviders();
      for (const providerName of enabledProviders) {
        const provider = this.providers.get(providerName);
        if (provider) {
          return provider;
        }
      }
      
      return null;
    }
  }

  /**
   * Get service status
   */
  getStatus(): AIServiceStatus {
    const enabledProviders = this.config.getEnabledProviders();
    const healthyProviders = this.healthChecker.getHealthyProviders();
    const unhealthyProviders = this.healthChecker.getUnhealthyProviders();
    const failoverConfig = this.config.getFailoverConfig();

    return {
      initialized: this.initialized,
      enabledProviders,
      healthyProviders,
      unhealthyProviders,
      failoverEnabled: failoverConfig.enabled,
      healthCheckEnabled: failoverConfig.healthCheck.enabled,
      lastHealthCheck: this.healthChecker.getAllHealthMetrics()[0]?.lastHealthCheck
    };
  }

  /**
   * Get failover metrics
   */
  getFailoverMetrics() {
    return this.failover.getMetrics();
  }

  /**
   * Get health metrics for all providers
   */
  getHealthMetrics() {
    return this.healthChecker.getAllHealthMetrics();
  }

  /**
   * Get health metrics for a specific provider
   */
  getProviderHealthMetrics(providerName: string) {
    return this.healthChecker.getProviderHealthMetrics(providerName);
  }

  /**
   * Update configuration
   */
  async updateConfiguration(newConfig: Partial<AIProviderConfiguration>): Promise<void> {
    console.log('🔄 Updating AI Service configuration...');

    const wasInitialized = this.initialized;
    
    if (wasInitialized) {
      await this.shutdown();
    }

    // Update configuration
    if (newConfig.openai) {
      this.config.updateOpenAIConfig(newConfig.openai);
    }
    if (newConfig.anthropic) {
      this.config.updateAnthropicConfig(newConfig.anthropic);
    }
    if (newConfig.failover) {
      this.config.updateFailoverConfig(newConfig.failover);
    }

    if (wasInitialized) {
      await this.initialize();
    }

    console.log('✅ AI Service configuration updated');
  }

  /**
   * Enable or disable a provider
   */
  async setProviderEnabled(provider: 'openai' | 'anthropic', enabled: boolean): Promise<void> {
    this.config.setProviderEnabled(provider, enabled);
    
    if (this.initialized) {
      if (enabled) {
        await this.initializeProvider(provider);
      } else {
        this.shutdownProvider(provider);
      }
    }
  }

  /**
   * Set fallback order
   */
  setFallbackOrder(order: string[]): void {
    this.config.setFallbackOrder(order);
    
    const failoverConfig = this.config.getFailoverConfig();
    this.failover.updateConfig({
      fallbackOrder: failoverConfig.fallbackOrder
    });
  }

  /**
   * Force provider health status
   */
  setProviderHealth(providerName: string, isHealthy: boolean): void {
    this.healthChecker.setProviderHealth(providerName, isHealthy);
  }

  /**
   * Shutdown the AI service
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down AI Service...');

    this.healthChecker.stop();
    this.failover.resetMetrics();
    
    // Unregister providers from registry
    for (const providerName of this.providers.keys()) {
      providerRegistry.unregisterProvider(providerName);
    }
    
    this.providers.clear();
    this.initialized = false;

    console.log('✅ AI Service shutdown complete');
  }

  private async initializeProviders(): Promise<void> {
    console.log('🔧 Initializing AI providers...');

    const enabledProviders = this.config.getEnabledProviders();
    
    for (const providerName of enabledProviders) {
      await this.initializeProvider(providerName as 'openai' | 'anthropic');
    }

    console.log(`✅ Initialized ${this.providers.size} AI providers`);
  }

  private async initializeProvider(providerName: 'openai' | 'anthropic'): Promise<void> {
    try {
      let provider: AIProvider;

      if (providerName === 'openai') {
        const config = this.config.getOpenAIConfig();
        if (!config) {
          throw new Error('OpenAI configuration not found');
        }

        const providerConfig: OpenAIProviderConfig = {
          name: 'openai',
          enabled: config.settings.enabled,
          priority: config.settings.priority,
          apiKey: config.apiKey,
          model: config.model,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          baseUrl: config.baseUrl,
          organization: config.organization,
          rateLimits: config.settings.rateLimits
        };

        provider = new OpenAIProvider(providerConfig);

      } else if (providerName === 'anthropic') {
        const config = this.config.getAnthropicConfig();
        if (!config) {
          throw new Error('Anthropic configuration not found');
        }

        const providerConfig: AnthropicProviderConfig = {
          name: 'anthropic',
          enabled: config.settings.enabled,
          priority: config.settings.priority,
          apiKey: config.apiKey,
          model: config.model,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          baseUrl: config.baseUrl,
          rateLimits: config.settings.rateLimits
        };

        provider = new AnthropicProvider(providerConfig);

      } else {
        throw new Error(`Unknown provider: ${providerName}`);
      }

      // Validate credentials
      const isValid = await provider.validateCredentials();
      if (!isValid) {
        console.warn(`⚠️ Provider ${providerName} credentials validation failed`);
      }

      // Store provider
      this.providers.set(providerName, provider);

      // Register with provider registry
      const config = this.config.getConfig()[providerName];
      if (config) {
        providerRegistry.registerAIProvider(
          providerName,
          provider,
          providerName as any,
          config.settings.priority === 1,
          config.settings.fallbackOrder
        );
      }

      console.log(`✅ Initialized ${providerName} provider`);

    } catch (error) {
      console.error(`❌ Failed to initialize ${providerName} provider:`, error);
      throw error;
    }
  }

  private shutdownProvider(providerName: string): void {
    const provider = this.providers.get(providerName);
    if (provider) {
      providerRegistry.unregisterProvider(providerName);
      this.providers.delete(providerName);
      console.log(`🛑 Shutdown ${providerName} provider`);
    }
  }

  private logStatus(): void {
    const status = this.getStatus();
    
    console.group('📊 AI Service Status');
    console.log(`Initialized: ${status.initialized ? '✅' : '❌'}`);
    console.log(`Enabled Providers: ${status.enabledProviders.join(', ')}`);
    console.log(`Healthy Providers: ${status.healthyProviders.join(', ')}`);
    console.log(`Failover Enabled: ${status.failoverEnabled ? '✅' : '❌'}`);
    console.log(`Health Check Enabled: ${status.healthCheckEnabled ? '✅' : '❌'}`);
    
    if (status.unhealthyProviders.length > 0) {
      console.warn(`Unhealthy Providers: ${status.unhealthyProviders.join(', ')}`);
    }
    
    console.groupEnd();
  }
}

// Export singleton instance
export const aiService = AIService.getInstance();