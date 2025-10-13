/**
 * Multi-source configuration loader
 * Loads and merges configuration from multiple sources with proper precedence
 */

import { EnvironmentConfig, ConfigurationSource, SecretManagerProvider } from './types.js';
import { ConfigurationError, SecretManagerError, EnvironmentFileError } from './errors.js';
import { getConfigPath, parseValue, setNestedValue } from './mapping.js';
import { EnvironmentFileManager } from './envFileManager.js';
import { ConfigurationValidator, validateStartupConfiguration } from './schema.js';

/**
 * Environment variable configuration source
 */
class EnvironmentVariableSource implements ConfigurationSource {
  name = 'environment-variables';
  priority = 1; // Lowest priority

  load(): Partial<EnvironmentConfig> {
    return this.transformEnvVars(process.env);
  }

  private transformEnvVars(envVars: Record<string, string | undefined>): Partial<EnvironmentConfig> {
    const config: any = {};

    // Transform flat environment variables to nested configuration
    Object.entries(envVars).forEach(([key, value]) => {
      if (!value) return;

      const path = getConfigPath(key);
      if (path) {
        setNestedValue(config, path, parseValue(value));
      }
    });

    return config;
  }
}

/**
 * Environment file configuration source
 */
class EnvironmentFileSource implements ConfigurationSource {
  name = 'environment-files';
  priority = 2;

  private fileManager: EnvironmentFileManager;

  constructor(private environment: string = 'development') {
    this.fileManager = new EnvironmentFileManager(environment);
  }

  async load(): Promise<Partial<EnvironmentConfig>> {
    try {
      const envConfig = await this.fileManager.loadAllEnvironmentFiles();
      
      // Validate the loaded configuration
      const validation = this.fileManager.validateEnvironmentFile(envConfig);
      if (!validation.isValid) {
        console.warn('Environment file validation warnings:', validation.errors);
      }

      return this.transformEnvVars(envConfig);
    } catch (error) {
      console.warn('Failed to load environment files:', error);
      return {};
    }
  }

  private transformEnvVars(envVars: Record<string, string>): Partial<EnvironmentConfig> {
    const config: any = {};

    Object.entries(envVars).forEach(([key, value]) => {
      const path = getConfigPath(key);
      if (path) {
        setNestedValue(config, path, parseValue(value));
      }
    });

    return config;
  }

  /**
   * Get environment file manager for additional operations
   */
  getFileManager(): EnvironmentFileManager {
    return this.fileManager;
  }
}

/**
 * Secret manager configuration source
 */
class SecretManagerSource implements ConfigurationSource {
  name = 'secret-manager';
  priority = 3;

  constructor(private secretManager: SecretManagerProvider) {}

  async load(): Promise<Partial<EnvironmentConfig>> {
    try {
      const secrets = await this.secretManager.getSecrets([
        'database/supabase-service-key',
        'auth/jwt-secret',
        'auth/google-client-secret',
        'ai/openai-api-key',
        'ai/anthropic-api-key',
        'payments/stripe-secret-key',
        'payments/stripe-webhook-secret',
        'monitoring/sentry-dsn',
        'monitoring/sentry-auth-token',
        'security/encryption-key',
        'security/session-secret'
      ]);

      return this.mapSecretsToConfig(secrets);
    } catch (error) {
      console.warn('Failed to load secrets from secret manager:', error);
      return {};
    }
  }

  private mapSecretsToConfig(secrets: Record<string, string>): Partial<EnvironmentConfig> {
    const config: any = {};

    const secretMappings: Record<string, string[]> = {
      'database/supabase-service-key': ['database', 'supabaseServiceKey'],
      'auth/jwt-secret': ['auth', 'jwt', 'secret'],
      'auth/google-client-secret': ['auth', 'google', 'clientSecret'],
      'ai/openai-api-key': ['ai', 'openai', 'apiKey'],
      'ai/anthropic-api-key': ['ai', 'anthropic', 'apiKey'],
      'payments/stripe-secret-key': ['payments', 'stripe', 'secretKey'],
      'payments/stripe-webhook-secret': ['payments', 'stripe', 'webhookSecret'],
      'monitoring/sentry-dsn': ['monitoring', 'sentry', 'dsn'],
      'monitoring/sentry-auth-token': ['monitoring', 'sentry', 'authToken'],
      'security/encryption-key': ['security', 'encryptionKey'],
      'security/session-secret': ['security', 'sessionSecret']
    };

    Object.entries(secrets).forEach(([secretKey, value]) => {
      const path = secretMappings[secretKey];
      if (path && value) {
        setNestedValue(config, path, value);
      }
    });

    return config;
  }
}

/**
 * Runtime override configuration source
 */
class RuntimeOverrideSource implements ConfigurationSource {
  name = 'runtime-overrides';
  priority = 4; // Highest priority

  constructor(private overrides: Partial<EnvironmentConfig> = {}) {}

  load(): Partial<EnvironmentConfig> {
    return this.overrides;
  }

  setOverride(path: string[], value: any): void {
    setNestedValue(this.overrides, path, value);
  }

  clearOverrides(): void {
    this.overrides = {};
  }
}

/**
 * Main configuration loader class
 */
export class ConfigurationLoader {
  private sources: ConfigurationSource[] = [];
  private secretManager?: SecretManagerProvider;
  private runtimeOverrides: RuntimeOverrideSource;

  constructor(secretManager?: SecretManagerProvider) {
    this.secretManager = secretManager;
    this.runtimeOverrides = new RuntimeOverrideSource();
    this.initializeSources();
  }

  private initializeSources(): void {
    const environment = process.env.NODE_ENV || 'development';

    // Add sources in order of precedence (lowest to highest)
    this.sources = [
      new EnvironmentVariableSource(),
      new EnvironmentFileSource(environment),
      ...(this.secretManager ? [new SecretManagerSource(this.secretManager)] : []),
      this.runtimeOverrides
    ];

    // Sort by priority to ensure correct precedence
    this.sources.sort((a, b) => a.priority - b.priority);
  }

  async loadConfiguration(): Promise<Partial<EnvironmentConfig>> {
    try {
      // Load from all sources
      const configSources = await Promise.allSettled(
        this.sources.map(async source => ({
          name: source.name,
          config: await source.load()
        }))
      );

      // Merge configurations with later sources taking precedence
      let mergedConfig = {};
      
      configSources.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { name, config } = result.value;
          console.debug(`Loaded configuration from ${name}:`, Object.keys(config));
          mergedConfig = this.deepMerge(mergedConfig, config);
        } else {
          console.warn(`Failed to load configuration from ${this.sources[index].name}:`, result.reason);
        }
      });

      return mergedConfig;
    } catch (error) {
      throw new ConfigurationError(
        `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Load and validate configuration
   */
  async loadAndValidateConfiguration(): Promise<EnvironmentConfig> {
    const config = await this.loadConfiguration();
    const environment = process.env.NODE_ENV || 'development';
    
    const validation = ConfigurationValidator.validateForEnvironment(config, environment);
    
    if (!validation.isValid) {
      const errorMessages = validation.errors.map(err => {
        const path = err.path.length > 0 ? err.path.join('.') : 'root';
        return `${path}: ${err.message}`;
      });
      
      throw new ConfigurationError(
        'Configuration validation failed',
        errorMessages,
        validation.errors.filter(e => e.code === 'invalid_type' && e.received === 'undefined')
          .map(e => e.path.join('.'))
      );
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      console.warn('Configuration warnings:');
      validation.warnings.forEach(warning => {
        const path = warning.path.length > 0 ? warning.path.join('.') : 'root';
        console.warn(`  ${warning.severity.toUpperCase()}: ${path} - ${warning.message}`);
      });
    }

    return validation.config!;
  }

  /**
   * Add a runtime configuration override
   */
  setRuntimeOverride(path: string[], value: any): void {
    this.runtimeOverrides.setOverride(path, value);
  }

  /**
   * Clear all runtime overrides
   */
  clearRuntimeOverrides(): void {
    this.runtimeOverrides.clearOverrides();
  }

  /**
   * Deep merge two configuration objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}

/**
 * Simple secret manager implementation for development
 */
export class EnvironmentSecretProvider implements SecretManagerProvider {
  async getSecret(key: string): Promise<string | null> {
    // Map secret keys to environment variables for development
    const envKey = key.replace(/[\/\-]/g, '_').toUpperCase();
    return process.env[envKey] || null;
  }

  async getSecrets(keys: string[]): Promise<Record<string, string>> {
    const secrets: Record<string, string> = {};
    
    for (const key of keys) {
      const value = await this.getSecret(key);
      if (value) {
        secrets[key] = value;
      }
    }
    
    return secrets;
  }

  async setSecret(key: string, value: string): Promise<void> {
    throw new SecretManagerError('Setting secrets not supported in development environment');
  }

  async deleteSecret(key: string): Promise<void> {
    throw new SecretManagerError('Deleting secrets not supported in development environment');
  }
}