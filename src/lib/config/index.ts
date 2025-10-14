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

// Hot reload functionality (development only)
export {
  ConfigurationHotReload,
  DevelopmentConfigurationUtils,
  type ConfigurationChangeEvent,
  type HotReloadOptions
} from './hotReload.js';

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

// Health checks and monitoring
export {
  ConfigurationHealthChecker,
  ConfigurationDriftDetector,
  type HealthCheckResult,
  type ServiceHealthCheck,
  type ConfigurationHealthStatus,
  type ConfigurationDriftItem,
  type ConfigurationDriftResult
} from './healthChecks.js';

export {
  ConfigurationHealthEndpoints,
  createHealthCheckMiddleware,
  runConfigurationHealthCheck,
  runConfigurationDriftCheck,
  type HealthEndpointResponse
} from './healthEndpoints.js';

// Configuration monitoring and logging
export {
  ConfigurationAuditLogger,
  ConfigurationMetricsCollector,
  ConfigurationAlertManager,
  ConfigurationMonitoringService,
  type ConfigurationChangeEvent,
  type ConfigurationChange,
  type ConfigurationMetrics,
  type ConfigurationAlert
} from './monitoring.js';

// Configuration diagnostics and troubleshooting
export {
  ConfigurationDiagnosticService,
  type DiagnosticResult,
  type ConfigurationDiagnosticReport,
  type TroubleshootingStep,
  type ConfigurationValidationGuidance
} from './diagnostics.js';

export {
  ConfigurationDiagnosticsCli,
  runConfigurationDiagnosticsCli,
  type CliOptions
} from './diagnosticsCli.js';

// Import types for internal use
import type { EnvironmentConfig } from './types.js';
import { ConfigurationLoader } from './loader.js';
import { ConfigurationHotReload, DevelopmentConfigurationUtils } from './hotReload.js';

/**
 * Type-safe configuration service singleton
 */
export class ConfigurationService {
  private static instance: ConfigurationService;
  private config: EnvironmentConfig | null = null;
  private loader: ConfigurationLoader;
  private hotReload: ConfigurationHotReload | null = null;
  private devUtils: DevelopmentConfigurationUtils | null = null;

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
    
    // Initialize hot reload for development
    await this.initializeHotReload();
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

  private async initializeHotReload(): Promise<void> {
    // Only enable hot reload in development
    if (!this.isDevelopment) {
      return;
    }

    try {
      // Initialize hot reload system
      this.hotReload = new ConfigurationHotReload(this.loader, {
        enabled: true,
        onConfigChange: (event) => {
          if (event.type === 'config-reloaded' && event.config) {
            // Update the cached configuration
            this.config = event.config;
            console.log('🔄 Configuration service updated with new config');
          }
        },
        onError: (error) => {
          console.error('Configuration hot reload error:', error);
        }
      });

      // Start watching for changes
      await this.hotReload.start();

      // Initialize development utilities
      this.devUtils = new DevelopmentConfigurationUtils(this.hotReload);
      
      // Enable browser notifications if in browser environment
      if (typeof window !== 'undefined') {
        this.devUtils.enableBrowserNotifications();
        this.devUtils.enableVisualNotifications();
        
        // Create debug panel
        setTimeout(() => {
          this.devUtils?.createDebugPanel();
        }, 1000);
      }

      console.log('🔥 Configuration hot reload initialized');
    } catch (error) {
      console.warn('Failed to initialize configuration hot reload:', error);
      // Don't fail configuration initialization if hot reload fails
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

  /**
   * Manually reload configuration (development only)
   */
  async reloadConfiguration(): Promise<void> {
    if (!this.hotReload) {
      throw new Error('Hot reload not available. Only supported in development environment.');
    }
    
    const newConfig = await this.hotReload.reload();
    this.config = newConfig;
  }

  /**
   * Check if hot reload is active
   */
  isHotReloadActive(): boolean {
    return this.hotReload?.isRunning() ?? false;
  }

  /**
   * Stop hot reload (cleanup)
   */
  async stopHotReload(): Promise<void> {
    if (this.hotReload) {
      await this.hotReload.stop();
      this.hotReload = null;
      this.devUtils = null;
    }
  }

  /**
   * Get hot reload instance for advanced usage
   */
  getHotReload(): ConfigurationHotReload | null {
    return this.hotReload;
  }

  private ensureInitialized(): void {
    if (!this.config) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
  }
}

// Export singleton instance
export const config = ConfigurationService.getInstance();