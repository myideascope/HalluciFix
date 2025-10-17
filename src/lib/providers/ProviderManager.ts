/**
 * Provider Manager - Main orchestrator for all API providers
 * Handles initialization, configuration, and lifecycle management
 */

import { providerRegistry } from './registry/ProviderRegistry';
import { providerConfigManager } from './config/ProviderConfigManager';
import { environmentValidator } from './config/EnvironmentValidator';
import { BaseProvider } from './base/BaseProvider';
import { AIProvider } from './interfaces/AIProvider';
import { AuthProvider } from './interfaces/AuthProvider';
import { DriveProvider } from './interfaces/DriveProvider';
import { KnowledgeProvider } from './interfaces/KnowledgeProvider';
import { 
  apiConnectivityValidator, 
  configurationValidator, 
  startupHealthChecker,
  type ConnectivityValidationResult,
  type ConfigurationValidationResult 
} from './validation';

export interface ProviderManagerStatus {
  initialized: boolean;
  totalProviders: number;
  healthyProviders: number;
  configurationValid: boolean;
  securityValid: boolean;
  lastInitialization: Date | null;
  errors: string[];
  warnings: string[];
}

export interface InitializationOptions {
  enableHealthChecks?: boolean;
  healthCheckInterval?: number;
  validateSecurity?: boolean;
  enableMockFallback?: boolean;
  skipProviderValidation?: boolean;
}

export class ProviderManager {
  private static instance: ProviderManager;
  private initialized: boolean = false;
  private initializationDate: Date | null = null;
  private initializationErrors: string[] = [];
  private initializationWarnings: string[] = [];

  private constructor() {}

  static getInstance(): ProviderManager {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager();
    }
    return ProviderManager.instance;
  }

  /**
   * Initialize all providers
   */
  async initialize(options: InitializationOptions = {}): Promise<void> {
    console.log('🚀 Initializing Provider Manager...');
    
    try {
      this.initializationErrors = [];
      this.initializationWarnings = [];

      // Step 1: Validate environment
      await this.validateEnvironment(options);

      // Step 2: Load configurations
      await this.loadConfigurations();

      // Step 3: Initialize providers
      await this.initializeProviders(options);

      // Step 4: Start health checks if enabled
      if (options.enableHealthChecks !== false) {
        this.startHealthChecks(options.healthCheckInterval);
      }

      this.initialized = true;
      this.initializationDate = new Date();

      console.log('✅ Provider Manager initialized successfully');
      this.logInitializationSummary();

    } catch (error) {
      this.initializationErrors.push(`Initialization failed: ${error}`);
      console.error('❌ Provider Manager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Validate environment configuration
   */
  private async validateEnvironment(options: InitializationOptions): Promise<void> {
    console.log('🔍 Validating environment configuration...');

    // Use new configuration validator
    const configValidation = await configurationValidator.validateConfiguration({
      environment: process.env.NODE_ENV as any,
      strictSecurity: options.validateSecurity !== false,
      requireAllProviders: options.skipProviderValidation === false
    });

    if (!configValidation.isValid) {
      const errorMessage = `Configuration validation failed: ${configValidation.errors.join(', ')}`;
      this.initializationErrors.push(errorMessage);
      
      // Add missing required items as errors
      configValidation.missingRequired.forEach(missing => {
        this.initializationErrors.push(`Missing required: ${missing}`);
      });
      
      throw new Error(errorMessage);
    }

    // Add warnings and recommendations
    this.initializationWarnings.push(...configValidation.warnings);
    this.initializationWarnings.push(...configValidation.missingOptional);
    this.initializationWarnings.push(...configValidation.recommendations);

    // Add security issues as errors or warnings based on environment
    if (configValidation.securityIssues.length > 0) {
      const env = process.env.NODE_ENV;
      if (env === 'production') {
        this.initializationErrors.push(...configValidation.securityIssues);
      } else {
        this.initializationWarnings.push(...configValidation.securityIssues);
      }
    }

    console.log('✅ Configuration validation completed');
    console.log('📊 Provider status:', configValidation.providerStatus);
  }

  /**
   * Load provider configurations
   */
  private async loadConfigurations(): Promise<void> {
    console.log('📋 Loading provider configurations...');

    const configurations = await providerConfigManager.loadConfigurations();
    
    // Validate configurations
    const configValidation = providerConfigManager.validateConfigurations();
    if (!configValidation.isValid) {
      const errorMessage = `Configuration validation failed: ${configValidation.errors.join(', ')}`;
      this.initializationErrors.push(errorMessage);
      throw new Error(errorMessage);
    }

    this.initializationWarnings.push(...configValidation.warnings);
    this.initializationWarnings.push(...configValidation.missingOptional);

    console.log('✅ Provider configurations loaded');
    console.log('📊 Configuration summary:', providerConfigManager.getConfigurationSummary());
  }

  /**
   * Initialize all providers
   */
  private async initializeProviders(options: InitializationOptions): Promise<void> {
    console.log('🔧 Initializing providers...');

    const configurations = providerConfigManager.getAllConfigurations();

    // Initialize AI providers
    await this.initializeAIProviders(configurations.ai, options);

    // Initialize Auth providers
    await this.initializeAuthProviders(configurations.auth, options);

    // Initialize Drive providers
    await this.initializeDriveProviders(configurations.drive, options);

    // Initialize Knowledge providers
    await this.initializeKnowledgeProviders(configurations.knowledge, options);

    // Initialize mock providers if enabled
    if (options.enableMockFallback !== false) {
      await this.initializeMockProviders();
    }

    console.log('✅ All providers initialized');
  }

  /**
   * Initialize AI providers
   */
  private async initializeAIProviders(
    aiConfigs: any,
    options: InitializationOptions
  ): Promise<void> {
    // Note: Actual provider implementations will be created in subsequent tasks
    // For now, we'll register placeholder providers that will be replaced

    if (aiConfigs.openai) {
      console.log('🤖 OpenAI provider configuration found');
      // Will be implemented in task 2.1
    }

    if (aiConfigs.anthropic) {
      console.log('🤖 Anthropic provider configuration found');
      // Will be implemented in task 3.1
    }

    if (aiConfigs.hallucifix) {
      console.log('🤖 HalluciFix provider configuration found');
      // Will be implemented in task 9.1
    }
  }

  /**
   * Initialize Auth providers
   */
  private async initializeAuthProviders(
    authConfigs: any,
    options: InitializationOptions
  ): Promise<void> {
    if (authConfigs.google) {
      console.log('🔐 Google OAuth provider configuration found');
      // Will be implemented in task 4.1
    }
  }

  /**
   * Initialize Drive providers
   */
  private async initializeDriveProviders(
    driveConfigs: any,
    options: InitializationOptions
  ): Promise<void> {
    if (driveConfigs.google) {
      console.log('📁 Google Drive provider configuration found');
      // Will be implemented in task 5.1
    }
  }

  /**
   * Initialize Knowledge providers
   */
  private async initializeKnowledgeProviders(
    knowledgeConfigs: any,
    options: InitializationOptions
  ): Promise<void> {
    if (knowledgeConfigs.wikipedia?.enabled) {
      console.log('📚 Wikipedia provider configuration found');
      // Will be implemented in task 6.1
    }

    if (knowledgeConfigs.arxiv?.enabled) {
      console.log('📚 arXiv provider configuration found');
      // Will be implemented in task 6.2
    }

    if (knowledgeConfigs.pubmed?.enabled) {
      console.log('📚 PubMed provider configuration found');
      // Will be implemented in task 6.2
    }

    if (knowledgeConfigs.news?.enabled) {
      console.log('📚 News API provider configuration found');
      // Will be implemented in task 6.3
    }
  }

  /**
   * Initialize mock providers as fallbacks
   */
  private async initializeMockProviders(): Promise<void> {
    console.log('🎭 Initializing mock providers as fallbacks...');
    
    // Mock providers will be implemented to ensure the system always has fallbacks
    // These will be registered with lower priority than real providers
    
    console.log('✅ Mock providers initialized');
  }

  /**
   * Start health checks for all providers
   */
  private startHealthChecks(intervalMs?: number): void {
    console.log('💓 Starting provider health checks...');
    providerRegistry.startHealthChecks(intervalMs);
  }

  /**
   * Get AI provider with automatic fallback
   */
  getAIProvider(preferredProvider?: string): AIProvider | null {
    this.ensureInitialized();
    return providerRegistry.getAIProvider({
      preferredProvider,
      requireHealthy: true,
      fallbackEnabled: true
    });
  }

  /**
   * Get Auth provider with automatic fallback
   */
  getAuthProvider(preferredProvider?: string): AuthProvider | null {
    this.ensureInitialized();
    return providerRegistry.getAuthProvider({
      preferredProvider,
      requireHealthy: true,
      fallbackEnabled: true
    });
  }

  /**
   * Get Drive provider with automatic fallback
   */
  getDriveProvider(preferredProvider?: string): DriveProvider | null {
    this.ensureInitialized();
    return providerRegistry.getDriveProvider({
      preferredProvider,
      requireHealthy: true,
      fallbackEnabled: true
    });
  }

  /**
   * Get Knowledge provider with automatic fallback
   */
  getKnowledgeProvider(preferredProvider?: string): KnowledgeProvider | null {
    this.ensureInitialized();
    return providerRegistry.getKnowledgeProvider({
      preferredProvider,
      requireHealthy: true,
      fallbackEnabled: true
    });
  }

  /**
   * Get all providers of a specific type
   */
  getProvidersByType(type: 'ai' | 'auth' | 'drive' | 'knowledge'): BaseProvider[] {
    this.ensureInitialized();
    return providerRegistry.getProvidersByType(type);
  }

  /**
   * Get provider manager status
   */
  getStatus(): ProviderManagerStatus {
    const registryMetrics = providerRegistry.getMetrics();
    const configValidation = providerConfigManager.validateConfigurations();
    const securityValidation = environmentValidator.validateSecurity();

    return {
      initialized: this.initialized,
      totalProviders: registryMetrics.totalProviders,
      healthyProviders: registryMetrics.healthyProviders,
      configurationValid: configValidation.isValid,
      securityValid: securityValidation.isSecure,
      lastInitialization: this.initializationDate,
      errors: [...this.initializationErrors],
      warnings: [...this.initializationWarnings]
    };
  }

  /**
   * Get detailed health status
   */
  getHealthStatus(): Record<string, any> {
    this.ensureInitialized();
    
    return {
      registry: providerRegistry.getMetrics(),
      providers: providerRegistry.getHealthStatus(),
      configuration: configurationValidator.getConfigurationSummary(),
      lastConnectivityCheck: apiConnectivityValidator.getLastValidationResult(),
      lastHealthCheck: startupHealthChecker.getLastHealthCheckResult()
    };
  }

  /**
   * Reinitialize providers (useful for configuration changes)
   */
  async reinitialize(options: InitializationOptions = {}): Promise<void> {
    console.log('🔄 Reinitializing Provider Manager...');
    
    // Stop health checks
    providerRegistry.stopHealthChecks();
    
    // Clear registry
    providerRegistry.clear();
    
    // Clear validation cache
    environmentValidator.clearCache();
    
    // Reset state
    this.initialized = false;
    this.initializationDate = null;
    
    // Reinitialize
    await this.initialize(options);
  }

  /**
   * Validate API connectivity for all providers
   */
  async validateConnectivity(options?: {
    timeout?: number;
    skipOptional?: boolean;
    enableRetries?: boolean;
  }): Promise<ConnectivityValidationResult> {
    return await apiConnectivityValidator.validateAllConnectivity(options);
  }

  /**
   * Perform comprehensive startup health check
   */
  async performStartupHealthCheck(options?: {
    timeout?: number;
    skipNonCritical?: boolean;
    enableDetailedLogging?: boolean;
    failOnWarnings?: boolean;
  }) {
    return await startupHealthChecker.performStartupHealthCheck({
      ...options,
      enableProviderInitialization: false // Providers should already be initialized
    });
  }

  /**
   * Check if system is ready for production
   */
  async isProductionReady(): Promise<{ ready: boolean; issues: string[]; recommendations: string[] }> {
    return await startupHealthChecker.isProductionReady();
  }

  /**
   * Validate configuration without initializing providers
   */
  async validateConfiguration(options?: {
    environment?: 'development' | 'staging' | 'production';
    strictSecurity?: boolean;
    requireAllProviders?: boolean;
  }): Promise<ConfigurationValidationResult> {
    return await configurationValidator.validateConfiguration(options);
  }

  /**
   * Shutdown provider manager
   */
  shutdown(): void {
    console.log('🛑 Shutting down Provider Manager...');
    
    providerRegistry.stopHealthChecks();
    providerRegistry.clear();
    
    this.initialized = false;
    this.initializationDate = null;
    
    console.log('✅ Provider Manager shutdown complete');
  }

  /**
   * Ensure provider manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Provider Manager not initialized. Call initialize() first.');
    }
  }

  /**
   * Log initialization summary
   */
  private logInitializationSummary(): void {
    const status = this.getStatus();
    
    console.group('📊 Provider Manager Initialization Summary');
    console.log(`Total Providers: ${status.totalProviders}`);
    console.log(`Healthy Providers: ${status.healthyProviders}`);
    console.log(`Configuration Valid: ${status.configurationValid ? '✅' : '❌'}`);
    console.log(`Security Valid: ${status.securityValid ? '✅' : '⚠️'}`);
    
    if (status.warnings.length > 0) {
      console.group('⚠️ Warnings');
      status.warnings.forEach(warning => console.warn(warning));
      console.groupEnd();
    }
    
    if (status.errors.length > 0) {
      console.group('❌ Errors');
      status.errors.forEach(error => console.error(error));
      console.groupEnd();
    }
    
    console.groupEnd();
  }
}

// Export singleton instance
export const providerManager = ProviderManager.getInstance();