/**
 * Configuration Integration Module
 * Integrates configuration system with the main application
 */

import { config } from './index';
import { initializeApplication, type StartupResult } from './startup';
import { ApiKeyManager } from './keyManagement';

// Global configuration state
let configurationInitialized = false;
let startupResult: StartupResult | null = null;
let apiKeyManager: ApiKeyManager | null = null;

// Configuration initialization
export async function initializeConfiguration(): Promise<StartupResult> {
  if (configurationInitialized && startupResult) {
    return startupResult;
  }

  console.log('🔧 Initializing configuration system...');

  try {
    // Initialize application with configuration validation
    const { success, result } = await initializeApplication(config, {
      // Skip health checks in browser environment for faster startup
      skipHealthChecks: typeof window !== 'undefined',
      requiredServices: config.app.environment === 'production' 
        ? ['supabase', 'openai', 'sentry']
        : ['supabase'],
    });

    if (!success) {
      console.error('❌ Configuration initialization failed');
      if (config.app.environment === 'production') {
        throw new Error('Production deployment blocked due to configuration issues');
      }
    }

    // Initialize API key manager if we have database access
    if (config.database.serviceKey) {
      try {
        apiKeyManager = new ApiKeyManager(config);
        console.log('🔑 API key manager initialized');
      } catch (error) {
        console.warn('⚠️ API key manager initialization failed:', error);
      }
    }

    startupResult = result;
    configurationInitialized = true;

    console.log('✅ Configuration system initialized successfully');
    return result;
  } catch (error) {
    console.error('💥 Configuration initialization failed:', error);
    throw error;
  }
}

// Get current configuration status
export function getConfigurationStatus(): {
  initialized: boolean;
  startupResult: StartupResult | null;
  hasApiKeyManager: boolean;
} {
  return {
    initialized: configurationInitialized,
    startupResult,
    hasApiKeyManager: !!apiKeyManager,
  };
}

// Get API key manager instance
export function getApiKeyManager(): ApiKeyManager | null {
  return apiKeyManager;
}

// Configuration-aware service factory
export class ConfigurationAwareServiceFactory {
  private static instance: ConfigurationAwareServiceFactory;

  private constructor() {}

  static getInstance(): ConfigurationAwareServiceFactory {
    if (!ConfigurationAwareServiceFactory.instance) {
      ConfigurationAwareServiceFactory.instance = new ConfigurationAwareServiceFactory();
    }
    return ConfigurationAwareServiceFactory.instance;
  }

  // Create AI service based on configuration
  async createAIService(): Promise<any> {
    if (!configurationInitialized) {
      await initializeConfiguration();
    }

    // Return appropriate AI service based on configuration
    if (config.features.enableMockServices) {
      const { MockAIService } = await import('../providers/mockAIService');
      return new MockAIService();
    }

    // Use real AI providers
    const providers = [];
    
    if (config.ai.openai.enabled) {
      const { OpenAIProvider } = await import('../providers/openaiProvider');
      providers.push(new OpenAIProvider(config.ai.openai));
    }

    if (config.ai.anthropic.enabled) {
      const { AnthropicProvider } = await import('../providers/anthropicProvider');
      providers.push(new AnthropicProvider(config.ai.anthropic));
    }

    if (providers.length === 0) {
      throw new Error('No AI providers configured');
    }

    // Return primary provider with fallbacks
    const { AIServiceWithFallback } = await import('../providers/aiServiceWithFallback');
    return new AIServiceWithFallback(providers, config.ai.fallbackChain);
  }

  // Create authentication service based on configuration
  async createAuthService(): Promise<any> {
    if (!configurationInitialized) {
      await initializeConfiguration();
    }

    if (config.features.enableMockServices) {
      const { MockAuthService } = await import('../providers/mockAuthService');
      return new MockAuthService();
    }

    if (config.auth.google.enabled) {
      const { GoogleAuthService } = await import('../providers/googleAuthService');
      return new GoogleAuthService(config.auth.google);
    }

    throw new Error('No authentication providers configured');
  }

  // Create database service based on configuration
  async createDatabaseService(): Promise<any> {
    if (!configurationInitialized) {
      await initializeConfiguration();
    }

    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(config.database.url, config.database.anonKey);

    if (config.features.enableReadReplicas && config.database.readReplicas?.length > 0) {
      const { ReadReplicaService } = await import('../readReplicaService');
      return new ReadReplicaService(client, config.database.readReplicas);
    }

    return client;
  }

  // Create monitoring service based on configuration
  async createMonitoringService(): Promise<any> {
    if (!configurationInitialized) {
      await initializeConfiguration();
    }

    const services = [];

    if (config.monitoring.sentry?.enabled) {
      const { SentryMonitoringService } = await import('../monitoring/sentryService');
      services.push(new SentryMonitoringService(config.monitoring.sentry));
    }

    if (config.monitoring.datadog?.enabled) {
      const { DatadogMonitoringService } = await import('../monitoring/datadogService');
      services.push(new DatadogMonitoringService(config.monitoring.datadog));
    }

    if (services.length === 0) {
      const { ConsoleMonitoringService } = await import('../monitoring/consoleService');
      return new ConsoleMonitoringService();
    }

    const { CompositeMonitoringService } = await import('../monitoring/compositeService');
    return new CompositeMonitoringService(services);
  }

  // Create payment service based on configuration
  async createPaymentService(): Promise<any> {
    if (!configurationInitialized) {
      await initializeConfiguration();
    }

    if (!config.features.enablePayments) {
      const { MockPaymentService } = await import('../providers/mockPaymentService');
      return new MockPaymentService();
    }

    if (config.payments.stripe?.enabled) {
      const { StripePaymentService } = await import('../providers/stripePaymentService');
      return new StripePaymentService(config.payments.stripe);
    }

    throw new Error('No payment providers configured');
  }
}

// Convenience functions for service creation
export async function createAIService(): Promise<any> {
  const factory = ConfigurationAwareServiceFactory.getInstance();
  return factory.createAIService();
}

export async function createAuthService(): Promise<any> {
  const factory = ConfigurationAwareServiceFactory.getInstance();
  return factory.createAuthService();
}

export async function createDatabaseService(): Promise<any> {
  const factory = ConfigurationAwareServiceFactory.getInstance();
  return factory.createDatabaseService();
}

export async function createMonitoringService(): Promise<any> {
  const factory = ConfigurationAwareServiceFactory.getInstance();
  return factory.createMonitoringService();
}

export async function createPaymentService(): Promise<any> {
  const factory = ConfigurationAwareServiceFactory.getInstance();
  return factory.createPaymentService();
}

// Configuration change handler
export function onConfigurationChange(callback: (config: typeof config) => void): () => void {
  // In a real implementation, this would listen for configuration changes
  // For now, we'll just call the callback immediately with current config
  callback(config);

  // Return unsubscribe function
  return () => {
    // Cleanup logic would go here
  };
}

// Environment-specific initialization
export async function initializeForEnvironment(environment: string): Promise<void> {
  console.log(`🌍 Initializing for ${environment} environment...`);

  const result = await initializeConfiguration();

  // Environment-specific setup
  switch (environment) {
    case 'production':
      if (!result.success) {
        throw new Error('Production initialization failed - critical issues must be resolved');
      }
      console.log('🚀 Production environment initialized');
      break;

    case 'staging':
      if (result.warnings.length > 0) {
        console.warn('⚠️ Staging environment has warnings:', result.warnings);
      }
      console.log('🧪 Staging environment initialized');
      break;

    case 'development':
      if (result.criticalIssues.length > 0) {
        console.warn('⚠️ Development environment has issues:', result.criticalIssues);
      }
      console.log('🛠️ Development environment initialized');
      break;

    default:
      console.log(`✅ ${environment} environment initialized`);
  }
}

// Health check endpoint for monitoring
export async function getHealthStatus(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  configuration: any;
  services: any;
  timestamp: number;
}> {
  if (!configurationInitialized) {
    return {
      status: 'unhealthy',
      configuration: { initialized: false },
      services: {},
      timestamp: Date.now(),
    };
  }

  const status = getConfigurationStatus();
  
  return {
    status: status.startupResult?.success ? 'healthy' : 'degraded',
    configuration: {
      initialized: status.initialized,
      environment: config.app.environment,
      features: config.features,
    },
    services: status.startupResult?.healthCheck.summary || {},
    timestamp: Date.now(),
  };
}

// Export configuration for external use
export { config };
export type { StartupResult };