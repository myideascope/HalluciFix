/**
 * Configuration system main exports
 * Browser-compatible version that excludes server-side modules
 */

// Core types and interfaces
export type { 
  EnvironmentConfig, 
  ConfigurationSource 
} from './types.js';

// Feature flag system exports (browser-compatible)
export {
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

// Browser-compatible configuration loader
export { BrowserConfigurationLoader } from './browserLoader.js';

// Error classes (browser-compatible)
export { 
  ConfigurationError
} from './errors.js';

// Utility functions (browser-compatible)
export { 
  parseValue, 
  setNestedValue, 
  ENV_VAR_MAPPINGS 
} from './mapping.js';

// Import types for internal use
import type { EnvironmentConfig } from './types.js';
import { BrowserConfigurationLoader } from './browserLoader.js';

/**
 * Browser-compatible configuration service singleton
 */
export class ConfigurationService {
  private static instance: ConfigurationService;
  private config: EnvironmentConfig | null = null;
  private loader: BrowserConfigurationLoader;

  private constructor() {
    this.loader = new BrowserConfigurationLoader();
  }

  static getInstance(): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService();
    }
    return ConfigurationService.instance;
  }

  async initialize(): Promise<void> {
    this.config = await this.loader.loadAndValidateConfiguration();
    
    // Initialize feature flag system
    await this.initializeFeatureFlags();
  }

  private async initializeFeatureFlags(): Promise<void> {
    try {
      // Import feature flag modules
      const { featureFlagManager } = await import('./featureFlags.js');
      const { featureFlagConsole } = await import('./featureFlagConsole.js');
      
      // Initialize feature flag manager with environment
      await featureFlagManager.initialize(this.config?.app.environment);
      
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

  // Async getters for lazy initialization
  async getApp() {
    await this.ensureInitializedAsync();
    return this.config!.app;
  }

  async getDatabase() {
    await this.ensureInitializedAsync();
    return this.config!.database;
  }

  async getAi() {
    await this.ensureInitializedAsync();
    return this.config!.ai;
  }

  async getAuth() {
    await this.ensureInitializedAsync();
    return this.config!.auth;
  }

  async getPayments() {
    await this.ensureInitializedAsync();
    return this.config!.payments;
  }

  async getMonitoring() {
    await this.ensureInitializedAsync();
    return this.config!.monitoring;
  }

  async getFeatures() {
    await this.ensureInitializedAsync();
    return this.config!.features;
  }

  async getSecurity() {
    await this.ensureInitializedAsync();
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

  /**
   * Get the feature flag manager instance
   */
  async getFeatureFlagManager() {
    const { featureFlagManager } = await import('./featureFlags.js');
    return featureFlagManager;
  }

  /**
   * Browser-compatible reload (just re-initializes from environment)
   */
  async reloadConfiguration(): Promise<void> {
    this.config = await this.loader.loadAndValidateConfiguration();
  }

  private ensureInitialized(): void {
    if (!this.config) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
  }

  private async ensureInitializedAsync(): Promise<void> {
    if (!this.config) {
      await this.initialize();
    }
  }
}

// Export singleton instance
export const config = ConfigurationService.getInstance();