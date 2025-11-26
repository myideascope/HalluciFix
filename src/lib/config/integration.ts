/**
 * Configuration Integration Module
 * Integrates configuration system with the main application
 */

import { config } from './index';
import { applicationStartup, type StartupResult } from '../providers/startup';
import { ApiKeyManager } from './keyManagement';

import { logger } from '../logging';
// Global configuration state
let configurationInitialized = false;
let startupResult: StartupResult | null = null;
let apiKeyManager: ApiKeyManager | null = null;

// Configuration initialization
export async function initializeConfiguration(): Promise<StartupResult> {
  if (configurationInitialized && startupResult) {
    return startupResult;
  }

  logger.debug("🔧 Initializing configuration system...");

  try {
    // Initialize application with configuration validation
    const result = await applicationStartup.initialize({
      // Skip health checks in browser environment for faster startup
      validateConnectivity: typeof window === 'undefined',
      enableDetailedLogging: config.app.environment === 'development',
      failOnWarnings: config.app.environment === 'production',
    });
    
    const success = result.success;

    if (!success) {
      logger.error("❌ Configuration initialization failed");
      if (config.app.environment === 'production') {
        throw new Error('Production deployment blocked due to configuration issues');
      }
    }

    // Initialize API key manager if we have database access
    if (config.database.serviceKey) {
      try {
        apiKeyManager = new ApiKeyManager(config);
        logger.debug("🔑 API key manager initialized");
      } catch (error) {
        logger.warn("⚠️ API key manager initialization failed:", { error });
      }
    }

    startupResult = result;
    configurationInitialized = true;

    logger.debug("✅ Configuration system initialized successfully");
    return result;
  } catch (error) {
    logger.error("💥 Configuration initialization failed:", error instanceof Error ? error : new Error(String(error)));
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
      // Return a simple mock service for now
      return {
        analyzeContent: async (content: string) => ({
          id: 'mock-' + Date.now(),
          accuracy: 85,
          riskLevel: 'low' as const,
          hallucinations: [],
          verificationSources: 0,
          processingTime: 100,
          metadata: {
            contentLength: content.length,
            timestamp: new Date().toISOString(),
            modelVersion: 'mock-1.0',
            provider: 'mock'
          }
        })
      };
    }

    // Use real AI providers through provider manager
    const { providerManager } = await import('../providers');
    const aiProvider = providerManager.getAIProvider();
    
    if (!aiProvider) {
      throw new Error('No AI providers available');
    }

    return aiProvider;
  }

  // Create authentication service based on configuration
  async createAuthService(): Promise<any> {
    if (!configurationInitialized) {
      await initializeConfiguration();
    }

    if (config.features.enableMockServices) {
      // Return a simple mock auth service
      return {
        login: async () => ({ success: true, user: { id: 'mock-user', email: 'mock@example.com' } }),
        logout: async () => ({ success: true }),
        getCurrentUser: async () => ({ id: 'mock-user', email: 'mock@example.com' })
      };
    }

    // For now, return a mock auth provider since we don't have auth provider manager
    const mockAuthProvider = {
      authenticate: async () => ({ success: true, user: null }),
      logout: async () => {},
      getCurrentUser: () => null,
      isSignedIn: () => false,
    };
    
    return mockAuthProvider;
  }

  // Create database service based on configuration
  async createDatabaseService(): Promise<any> {
    if (!configurationInitialized) {
      await initializeConfiguration();
    }

    const { getSupabase } = await import('../supabase');
    return await getSupabase();
  }

  // Create monitoring service based on configuration
  async createMonitoringService(): Promise<any> {
    if (!configurationInitialized) {
      await initializeConfiguration();
    }

    // Return a simple monitoring service for now
    return {
      log: (level: string, message: string, data?: any) => {
        logger.info(message, data);
      },
      error: (error: Error, context?: any) => {
        logger.error("Monitoring:", error, context instanceof Error ? error : new Error(String(context)));
      },
      metric: (name: string, value: number, tags?: any) => {
        logger.info(`Metric: ${name} = ${value}`, { tags });
      }
    };
  }

  // Create payment service based on configuration
  async createPaymentService(): Promise<any> {
    if (!configurationInitialized) {
      await initializeConfiguration();
    }

    if (!config.features.enablePayments) {
      // Return a simple mock payment service
      return {
        createPayment: async () => ({ success: true, paymentId: 'mock-payment' }),
        processPayment: async () => ({ success: true, status: 'completed' }),
        refundPayment: async () => ({ success: true, refundId: 'mock-refund' })
      };
    }

    // For now, return mock service even if payments are enabled
    // Real Stripe integration will be implemented in a future task
    return {
      createPayment: async () => ({ success: false, error: 'Stripe not implemented yet' }),
      processPayment: async () => ({ success: false, error: 'Stripe not implemented yet' }),
      refundPayment: async () => ({ success: false, error: 'Stripe not implemented yet' })
    };
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
export function onConfigurationChange(callback: (config: any) => void): () => void {
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
logger.info(`🌍 Initializing for ${environment} environment...`);

  const result = await initializeConfiguration();

  // Environment-specific setup
  switch (environment) {
    case 'production':
      if (!result.success) {
        throw new Error('Production initialization failed - critical issues must be resolved');
      }
      logger.debug("🚀 Production environment initialized");
      break;

    case 'staging':
      if (result.warnings.length > 0) {
        logger.warn("⚠️ Staging environment has warnings:", { warnings: result.warnings });
      }
      logger.debug("🧪 Staging environment initialized");
      break;

    case 'development':
      if (result.errors.length > 0) {
        logger.warn("⚠️ Development environment has issues:", { issues: result.errors });
      }
      logger.debug("🛠️ Development environment initialized");
      break;

default:
      logger.info(`✅ ${environment} environment initialized`);
      break;
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
    services: status.startupResult?.healthCheck?.connectivity?.summary || {},
    timestamp: Date.now(),
  };
}

// Export configuration for external use
export { config };
export type { StartupResult };