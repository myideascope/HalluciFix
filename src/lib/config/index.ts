/**
 * Configuration system main exports
 * Provides a unified interface for the configuration system
 */

// Core types and interfaces
export type { 
  EnvironmentConfig, 
  ConfigurationSource, 
  SecretManagerProvider 
} from './types.js';

// Feature flag system exports
export {
  featureFlagManager,
  type FeatureFlagKey,
  type FeatureFlagValue,
  type FeatureFlagOverride,
  type FeatureFlagSource,
  type FeatureFlagEvaluationContext
} from './featureFlags.js';

export {
  featureFlagLogger,
  type FeatureFlagEvent,
  type FeatureFlagUsageStats,
  type FeatureFlagAnalytics
} from './featureFlagLogger.js';

export {
  featureFlagDocs,
  type FeatureFlagDocumentation
} from './featureFlagDocs.js';

export {
  featureFlagConsole
} from './featureFlagConsole.js';

// Configuration loader and validation
export { 
  ConfigurationLoader, 
  EnvironmentSecretProvider 
} from './loader.js';

export { 
  ConfigurationValidator, 
  validateStartupConfiguration,
  type ValidatedEnvironmentConfig,
  type ValidationError,
  type ValidationWarning
} from './schema.js';

// Environment file management
export { EnvironmentFileManager } from './envFileManager.js';

// Error classes
export { 
  ConfigurationError, 
  SecretManagerError, 
  ConnectivityError, 
  EnvironmentFileError 
} from './errors.js';

// Secret encryption and secure storage
export {
  SecretEncryptionService,
  SecretRotationManager,
  type EncryptedSecret,
  type SecretRotationConfig,
  type SecretAccessLog
} from './secretEncryption.js';

export {
  SecureSecretStorage,
  FileSecretPersistenceProvider,
  AWSSecretsManagerPersistenceProvider,
  type SecretAccessControl,
  type SecretMetadata,
  type StoredSecret,
  type SecretPersistenceProvider
} from './secureSecretStorage.js';

export {
  SecretRotationProcedures,
  type RotationProcedure,
  type RotationResult
} from './secretRotationProcedures.js';

// Utility functions
export { 
  getConfigPath, 
  parseValue, 
  setNestedValue, 
  ENV_VAR_MAPPINGS 
} from './mapping.js';

// Import types for internal use
import type { EnvironmentConfig } from './types.js';
import { ConfigurationLoader } from './loader.js';

/**
 * Type-safe configuration service singleton
 */
export class ConfigurationService {
  private static instance: ConfigurationService;
  private config: EnvironmentConfig | null = null;
  private loader: ConfigurationLoader;

  private constructor() {
    this.loader = new ConfigurationLoader();
  }

  static getInstance(): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService();
    }
    return ConfigurationService.instance;
  }

  async initialize(): Promise<void> {
    this.config = await this.loader.loadAndValidateConfiguration();
    
    // Initialize feature flag system with debugging tools
    await this.initializeFeatureFlags();
  }

  private async initializeFeatureFlags(): Promise<void> {
    try {
      // Import feature flag modules
      const { featureFlagManager } = await import('./featureFlags.js');
      const { featureFlagConsole } = await import('./featureFlagConsole.js');
      
      // Initialize feature flag manager
      await featureFlagManager.initialize();
      
      // Initialize console debugging utilities (development only)
      if (this.isDevelopment) {
        featureFlagConsole.initialize();
      }
    } catch (error) {
      console.warn('Failed to initialize feature flag system:', error);
      // Don't fail configuration initialization if feature flags fail
    }
  }

  get app() {
    this.ensureInitialized();
    return this.config!.app;
  }

  get database() {
    this.ensureInitialized();
    return this.config!.database;
  }

  get ai() {
    this.ensureInitialized();
    return this.config!.ai;
  }

  get auth() {
    this.ensureInitialized();
    return this.config!.auth;
  }

  get payments() {
    this.ensureInitialized();
    return this.config!.payments;
  }

  get monitoring() {
    this.ensureInitialized();
    return this.config!.monitoring;
  }

  get features() {
    this.ensureInitialized();
    return this.config!.features;
  }

  get security() {
    this.ensureInitialized();
    return this.config!.security;
  }

  // Convenience methods
  get isDevelopment(): boolean {
    return this.app.environment === 'development';
  }

  get isProduction(): boolean {
    return this.app.environment === 'production';
  }

  get isStaging(): boolean {
    return this.app.environment === 'staging';
  }

  hasOpenAI(): boolean {
    return !!this.ai.openai?.apiKey;
  }

  hasAnthropic(): boolean {
    return !!this.ai.anthropic?.apiKey;
  }

  hasStripe(): boolean {
    return !!this.payments?.stripe;
  }

  hasSentry(): boolean {
    return !!this.monitoring.sentry?.dsn;
  }

  private ensureInitialized(): void {
    if (!this.config) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
  }
}

// Export singleton instance
export const config = ConfigurationService.getInstance();