/**
 * Provider Manager
 * Manages AI providers with failover and load balancing
 */

import { AIProvider, AIAnalysisOptions, AIAnalysisResult } from './interfaces/AIProvider';
import { BedrockProvider } from './bedrock/BedrockProvider';
import { logger } from '../logging';
import { performanceMonitor } from '../performanceMonitor';
import { errorManager } from '../errors';

interface ProviderManagerConfig {
  enableHealthChecks: boolean;
  validateSecurity: boolean;
  enableMockFallback: boolean;
  healthCheckInterval?: number;
  maxRetries?: number;
}

interface ProviderConfig {
  bedrock?: {
    enabled: boolean;
    region: string;
    model: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  fallbackChain?: string[];
  primaryProvider?: string;
}

export class ProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private config: ProviderManagerConfig;
  private providerConfig: ProviderConfig;
  private logger = logger.child({ component: 'ProviderManager' });
  private initialized = false;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor() {
    this.config = {
      enableHealthChecks: true,
      validateSecurity: false,
      enableMockFallback: true,
      healthCheckInterval: 5 * 60 * 1000, // 5 minutes
      maxRetries: 3,
    };

    this.providerConfig = {
      bedrock: {
        enabled: process.env.VITE_BEDROCK_ENABLED === 'true',
        region: process.env.VITE_AWS_REGION || 'us-east-1',
        model: process.env.VITE_BEDROCK_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0',
        accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY,
      },
      primaryProvider: 'bedrock',
      fallbackChain: ['bedrock', 'mock'],
    };
  }

  async initialize(config?: Partial<ProviderManagerConfig>): Promise<void> {
    if (this.initialized) return;

    try {
      this.logger.info('Initializing Provider Manager');

      // Update configuration
      if (config) {
        this.config = { ...this.config, ...config };
      }

      // Initialize providers
      await this.initializeProviders();

      // Start health checks if enabled
      if (this.config.enableHealthChecks) {
        this.startHealthChecks();
      }

      this.initialized = true;
      this.logger.info('Provider Manager initialized successfully', {
        providersCount: this.providers.size,
        enabledProviders: Array.from(this.providers.keys()),
      });

    } catch (error) {
      this.logger.error('Failed to initialize Provider Manager', error as Error);
      throw error;
    }
  }

  async analyzeContent(content: string, options?: AIAnalysisOptions): Promise<AIAnalysisResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const performanceId = performanceMonitor.startOperation('provider_manager_analyze', {
      contentLength: content.length.toString(),
      primaryProvider: this.providerConfig.primaryProvider || 'unknown',
    });

    try {
      this.logger.debug('Starting content analysis with provider failover', {
        contentLength: content.length,
        primaryProvider: this.providerConfig.primaryProvider,
        fallbackChain: this.providerConfig.fallbackChain,
      });

      // Try providers in order of preference
      const providersToTry = this.getProviderChain();
      let lastError: Error | null = null;

      for (const providerName of providersToTry) {
        const provider = this.providers.get(providerName);
        
        if (!provider || !provider.isEnabled()) {
          this.logger.debug(`Skipping disabled provider: ${providerName}`);
          continue;
        }

        if (!provider.isHealthy() && this.config.enableHealthChecks) {
          this.logger.debug(`Skipping unhealthy provider: ${providerName}`);
          continue;
        }

        try {
          this.logger.debug(`Attempting analysis with provider: ${providerName}`);
          
          const result = await this.analyzeWithRetry(provider, content, options);
          
          performanceMonitor.endOperation(performanceId, {
            status: 'success',
            provider: providerName,
            accuracy: result.accuracy.toString(),
          });

          this.logger.info('Content analysis completed successfully', {
            provider: providerName,
            analysisId: result.id,
            accuracy: result.accuracy,
            processingTime: result.processingTime,
          });

          return result;

        } catch (error) {
          lastError = error as Error;
          this.logger.warn(`Provider ${providerName} failed, trying next`, undefined, {
            error: lastError.message,
          });
          
          // Record provider failure
          errorManager.handleError(error, {
            component: 'ProviderManager',
            feature: 'content-analysis',
            operation: 'analyzeWithProvider',
            provider: providerName,
          });
        }
      }

      // All providers failed
      performanceMonitor.endOperation(performanceId, { status: 'all_providers_failed' });
      
      const error = new Error(`All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
      this.logger.error('All AI providers failed', error);
      throw error;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      throw error;
    }
  }

  getAIProvider(): AIProvider | null {
    const primaryProviderName = this.providerConfig.primaryProvider || 'bedrock';
    const provider = this.providers.get(primaryProviderName);
    
    if (provider && provider.isEnabled() && provider.isHealthy()) {
      return provider;
    }

    // Try fallback providers
    for (const providerName of this.providerConfig.fallbackChain || []) {
      const fallbackProvider = this.providers.get(providerName);
      if (fallbackProvider && fallbackProvider.isEnabled() && fallbackProvider.isHealthy()) {
        return fallbackProvider;
      }
    }

    return null;
  }

  getStatus() {
    const providerStatuses = Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      ...provider.getStatus(),
    }));

    return {
      initialized: this.initialized,
      totalProviders: this.providers.size,
      healthyProviders: providerStatuses.filter(p => p.healthy).length,
      enabledProviders: providerStatuses.filter(p => p.enabled).length,
      providers: providerStatuses,
      config: this.config,
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Provider Manager');

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.providers.clear();
    this.initialized = false;

    this.logger.info('Provider Manager shutdown complete');
  }

  private async initializeProviders(): Promise<void> {
    this.logger.debug('Initializing AI providers');

    // Initialize Bedrock provider if configured
    if (this.providerConfig.bedrock?.enabled) {
      try {
        const bedrockProvider = new BedrockProvider(this.providerConfig.bedrock);
        await bedrockProvider.initialize();
        this.providers.set('bedrock', bedrockProvider);
        this.logger.info('Bedrock provider initialized');
      } catch (error) {
        this.logger.error('Failed to initialize Bedrock provider', error as Error);
        if (!this.config.enableMockFallback) {
          throw error;
        }
      }
    }

    // Add mock provider if enabled
    if (this.config.enableMockFallback) {
      const mockProvider = this.createMockProvider();
      this.providers.set('mock', mockProvider);
      this.logger.info('Mock provider initialized');
    }

    if (this.providers.size === 0) {
      throw new Error('No AI providers could be initialized');
    }
  }

  private getProviderChain(): string[] {
    const chain: string[] = [];
    
    // Add primary provider first
    if (this.providerConfig.primaryProvider) {
      chain.push(this.providerConfig.primaryProvider);
    }

    // Add fallback chain
    if (this.providerConfig.fallbackChain) {
      for (const provider of this.providerConfig.fallbackChain) {
        if (!chain.includes(provider)) {
          chain.push(provider);
        }
      }
    }

    // Ensure we have at least some providers to try
    if (chain.length === 0) {
      chain.push(...Array.from(this.providers.keys()));
    }

    return chain;
  }

  private async analyzeWithRetry(
    provider: AIProvider, 
    content: string, 
    options?: AIAnalysisOptions
  ): Promise<AIAnalysisResult> {
    let lastError: Error | null = null;
    const maxRetries = this.config.maxRetries || 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await provider.analyzeContent(content, options);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          this.logger.debug(`Provider attempt ${attempt} failed, retrying in ${delay}ms`, undefined, {
            provider: provider.getName(),
            error: lastError.message,
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  private startHealthChecks(): void {
    if (this.healthCheckTimer) return;

    this.logger.debug('Starting provider health checks', {
      interval: this.config.healthCheckInterval,
    });

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);

    // Perform initial health check
    setTimeout(() => this.performHealthChecks(), 1000);
  }

  private async performHealthChecks(): Promise<void> {
    this.logger.debug('Performing provider health checks');

    const healthCheckPromises = Array.from(this.providers.entries()).map(async ([name, provider]) => {
      try {
        const isHealthy = await provider.healthCheck();
        this.logger.debug(`Health check for ${name}: ${isHealthy ? 'healthy' : 'unhealthy'}`);
      } catch (error) {
        this.logger.warn(`Health check failed for ${name}`, undefined, {
          error: (error as Error).message,
        });
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }

  private createMockProvider(): AIProvider {
    // Create a simple mock provider for fallback
    return {
      getName: () => 'mock',
      getStatus: () => ({
        name: 'mock',
        enabled: true,
        healthy: true,
        lastCheck: new Date().toISOString(),
        errorCount: 0,
        successCount: 0,
        avgResponseTime: 500,
        costToDate: 0,
      }),
      isEnabled: () => true,
      isHealthy: () => true,
      initialize: async () => {},
      healthCheck: async () => true,
      getModels: async () => ['mock-model'],
      estimateCost: async () => 0,
      analyzeContent: async (content: string, options?: AIAnalysisOptions): Promise<AIAnalysisResult> => {
        // Simple mock analysis
        const accuracy = 75 + Math.random() * 20;
        const riskLevel = accuracy > 85 ? 'low' : accuracy > 70 ? 'medium' : 'high';
        
        return {
          id: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          accuracy: parseFloat(accuracy.toFixed(1)),
          riskLevel: riskLevel as any,
          hallucinations: [],
          verificationSources: Math.floor(Math.random() * 10) + 5,
          processingTime: 500 + Math.random() * 1000,
          metadata: {
            provider: 'mock',
            modelVersion: 'mock-v1.0',
            timestamp: new Date().toISOString(),
            contentLength: content.length,
          },
        };
      },
    } as AIProvider;
  }
}

// Export singleton instance
export const providerManager = new ProviderManager();
export default providerManager;