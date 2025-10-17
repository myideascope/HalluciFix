/**
 * Provider Infrastructure - Main exports
 * Provides a unified interface for all API provider functionality
 */

// Base provider exports
export { BaseProvider } from './base/BaseProvider';
export type { ProviderConfig, ProviderMetrics, ProviderHealthStatus } from './base/BaseProvider';

// Provider interfaces
export { AIProvider } from './interfaces/AIProvider';
export type { 
  AIProviderConfig, 
  AIAnalysisOptions, 
  AIAnalysisResult, 
  RateLimitInfo,
  AIProviderType 
} from './interfaces/AIProvider';

// AI Provider implementations
export { OpenAIProvider } from './ai/OpenAIProvider';
export type { OpenAIProviderConfig } from './ai/OpenAIProvider';

export { AnthropicProvider } from './ai/AnthropicProvider';
export type { AnthropicProviderConfig } from './ai/AnthropicProvider';

// AI Provider Failover System
export { AIProviderFailover } from './ai/AIProviderFailover';
export type { FailoverConfig, FailoverMetrics, FailoverAttempt } from './ai/AIProviderFailover';

export { AIProviderHealthChecker } from './ai/AIProviderHealthChecker';
export type { HealthCheckConfig, ProviderHealthMetrics, HealthCheckResult } from './ai/AIProviderHealthChecker';

export { AIProviderConfig } from './ai/AIProviderConfig';
export type { AIProviderConfiguration, AIProviderSettings } from './ai/AIProviderConfig';

export { AIService, aiService } from './ai/AIService';
export type { AIServiceConfig, AIServiceStatus } from './ai/AIService';

export { AuthProvider } from './interfaces/AuthProvider';
export type { 
  AuthProviderConfig, 
  AuthResult, 
  TokenSet, 
  UserProfile, 
  AuthUrl, 
  TokenRefreshResult,
  AuthProviderType 
} from './interfaces/AuthProvider';

export { DriveProvider } from './interfaces/DriveProvider';
export type { 
  DriveProviderConfig, 
  DriveFile, 
  DriveFolder, 
  FileContent, 
  ListOptions, 
  SearchFilters, 
  UploadOptions, 
  DriveQuota,
  DriveProviderType 
} from './interfaces/DriveProvider';

export { KnowledgeProvider } from './interfaces/KnowledgeProvider';
export type { 
  KnowledgeProviderConfig, 
  KnowledgeDocument, 
  SearchOptions, 
  FactCheckResult, 
  SourceMetadata,
  KnowledgeProviderType 
} from './interfaces/KnowledgeProvider';

// Registry exports
export { ProviderRegistry, providerRegistry } from './registry/ProviderRegistry';
export type { 
  ProviderType, 
  ProviderRegistration, 
  ProviderSelectionOptions, 
  RegistryMetrics 
} from './registry/ProviderRegistry';

// Configuration exports
export { ProviderConfigManager, providerConfigManager } from './config/ProviderConfigManager';
export type { 
  ProviderConfigurations, 
  ConfigValidationResult 
} from './config/ProviderConfigManager';

export { EnvironmentValidator, environmentValidator } from './config/EnvironmentValidator';
export type { 
  ValidatedEnvironment, 
  ValidationResult, 
  SecurityValidationResult 
} from './config/EnvironmentValidator';

// Main provider manager
export { ProviderManager, providerManager } from './ProviderManager';
export type { 
  ProviderManagerStatus, 
  InitializationOptions 
} from './ProviderManager';

// Validation exports
export * from './validation';

// Startup exports
export * from './startup';

// Utility functions for provider management
export const ProviderUtils = {
  /**
   * Initialize the provider system with default options
   */
  async initializeProviders(options?: Partial<InitializationOptions>): Promise<void> {
    const { providerManager } = await import('./ProviderManager');
    const defaultOptions: InitializationOptions = {
      enableHealthChecks: true,
      healthCheckInterval: 60000, // 1 minute
      validateSecurity: true,
      enableMockFallback: true,
      skipProviderValidation: false,
      ...options
    };

    await providerManager.initialize(defaultOptions);
  },

  /**
   * Get the status of all providers
   */
  getProviderStatus(): ProviderManagerStatus {
    const { providerManager } = require('./ProviderManager');
    return providerManager.getStatus();
  },

  /**
   * Get health status of all providers
   */
  getHealthStatus(): Record<string, any> {
    const { providerManager } = require('./ProviderManager');
    return providerManager.getHealthStatus();
  },

  /**
   * Check if a specific provider type is available
   */
  isProviderAvailable(type: 'ai' | 'auth' | 'drive' | 'knowledge'): boolean {
    try {
      const { providerManager } = require('./ProviderManager');
      const providers = providerManager.getProvidersByType(type);
      return providers.length > 0 && providers.some(p => p.getHealthStatus().isHealthy);
    } catch {
      return false;
    }
  },

  /**
   * Get configuration status for debugging
   */
  getConfigurationStatus(): Record<string, boolean> {
    const { environmentValidator } = require('./config/EnvironmentValidator');
    return environmentValidator.getConfigurationStatus();
  },

  /**
   * Validate environment without initializing providers
   */
  validateEnvironment(): ValidationResult {
    const { environmentValidator } = require('./config/EnvironmentValidator');
    return environmentValidator.validateEnvironment();
  },

  /**
   * Validate security configuration
   */
  validateSecurity(): SecurityValidationResult {
    const { environmentValidator } = require('./config/EnvironmentValidator');
    return environmentValidator.validateSecurity();
  },

  /**
   * Validate API connectivity for all providers
   */
  async validateConnectivity(options?: {
    timeout?: number;
    skipOptional?: boolean;
    enableRetries?: boolean;
  }) {
    const { apiConnectivityValidator } = await import('./validation');
    return apiConnectivityValidator.validateAllConnectivity(options);
  },

  /**
   * Perform comprehensive startup health check
   */
  async performStartupHealthCheck(options?: {
    timeout?: number;
    skipNonCritical?: boolean;
    enableDetailedLogging?: boolean;
  }) {
    const { startupHealthChecker } = await import('./validation');
    return startupHealthChecker.performStartupHealthCheck(options);
  },

  /**
   * Check if system is ready for production
   */
  async isProductionReady() {
    const { startupHealthChecker } = await import('./validation');
    return startupHealthChecker.isProductionReady();
  },

  /**
   * Initialize complete application with validation
   */
  async initializeApplication(options?: {
    validateConnectivity?: boolean;
    enableDetailedLogging?: boolean;
    failOnWarnings?: boolean;
  }) {
    const { applicationStartup } = await import('./startup');
    return applicationStartup.initialize(options);
  },

  /**
   * Reinitialize providers (useful after configuration changes)
   */
  async reinitializeProviders(options?: Partial<InitializationOptions>): Promise<void> {
    const { providerManager } = await import('./ProviderManager');
    const defaultOptions: InitializationOptions = {
      enableHealthChecks: true,
      healthCheckInterval: 60000,
      validateSecurity: true,
      enableMockFallback: true,
      skipProviderValidation: false,
      ...options
    };

    await providerManager.reinitialize(defaultOptions);
  },

  /**
   * Shutdown provider system
   */
  shutdownProviders(): void {
    const { providerManager } = require('./ProviderManager');
    providerManager.shutdown();
  }
};

// Export provider type constants for convenience
export const PROVIDER_TYPES = {
  AI: 'ai' as const,
  AUTH: 'auth' as const,
  DRIVE: 'drive' as const,
  KNOWLEDGE: 'knowledge' as const
};

export const AI_PROVIDER_TYPES = {
  OPENAI: 'openai' as const,
  ANTHROPIC: 'anthropic' as const,
  HALLUCIFIX: 'hallucifix' as const,
  MOCK: 'mock' as const
};

export const AUTH_PROVIDER_TYPES = {
  GOOGLE: 'google' as const,
  GITHUB: 'github' as const,
  MICROSOFT: 'microsoft' as const,
  MOCK: 'mock' as const
};

export const DRIVE_PROVIDER_TYPES = {
  GOOGLE: 'google' as const,
  ONEDRIVE: 'onedrive' as const,
  DROPBOX: 'dropbox' as const,
  MOCK: 'mock' as const
};

export const KNOWLEDGE_PROVIDER_TYPES = {
  WIKIPEDIA: 'wikipedia' as const,
  ARXIV: 'arxiv' as const,
  PUBMED: 'pubmed' as const,
  NEWS: 'news' as const,
  MOCK: 'mock' as const
};

// Default export for convenience
export default ProviderUtils;