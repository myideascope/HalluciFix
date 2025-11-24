/**
 * Application Startup Service
 * Handles complete application initialization with API connectivity validation
 */

import { logger } from '../../logging';
import { config } from '../../config';
import { providerManager } from '../ProviderManager';
import { startupHealthChecker, type StartupHealthCheckResult } from '../validation/StartupHealthChecker';

import { logger } from './logging';
export interface StartupOptions {
  // Validation options
  validateConnectivity?: boolean;
  connectivityTimeout?: number;
  skipNonCriticalValidation?: boolean;
  failOnWarnings?: boolean;
  
  // Provider options
  initializeProviders?: boolean;
  enableHealthChecks?: boolean;
  healthCheckInterval?: number;
  enableMockFallback?: boolean;
  
  // Logging options
  enableDetailedLogging?: boolean;
  logConfigurationStatus?: boolean;
  
  // Environment options
  environment?: 'development' | 'staging' | 'production';
  strictSecurity?: boolean;
}

export interface StartupResult {
  success: boolean;
  duration: number;
  timestamp: Date;
  environment: string;
  healthCheck?: StartupHealthCheckResult;
  errors: string[];
  warnings: string[];
  recommendations: string[];
  services: {
    providersInitialized: boolean;
    connectivityValidated: boolean;
    healthChecksEnabled: boolean;
  };
}

export class ApplicationStartup {
  private static instance: ApplicationStartup;
  private startupLogger = logger.child({ component: 'ApplicationStartup' });
  private isStarted = false;
  private lastStartupResult: StartupResult | null = null;

  private constructor() {}

  static getInstance(): ApplicationStartup {
    if (!ApplicationStartup.instance) {
      ApplicationStartup.instance = new ApplicationStartup();
    }
    return ApplicationStartup.instance;
  }

  /**
   * Initialize the complete application
   */
  async initialize(options: StartupOptions = {}): Promise<StartupResult> {
    if (this.isStarted) {
      this.startupLogger.warn('Application already started, skipping initialization');
      return this.lastStartupResult!;
    }

    const startTime = Date.now();
    this.startupLogger.info('🚀 Starting application initialization');

    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let healthCheck: StartupHealthCheckResult | undefined;

    try {
      // Set default options
      const opts: Required<StartupOptions> = {
        validateConnectivity: true,
        connectivityTimeout: 15000,
        skipNonCriticalValidation: false,
        failOnWarnings: false,
        initializeProviders: true,
        enableHealthChecks: true,
        healthCheckInterval: 60000,
        enableMockFallback: config.features.enableMockServices,
        enableDetailedLogging: config.app.environment === 'development',
        logConfigurationStatus: config.app.environment === 'development',
        environment: config.app.environment as any,
        strictSecurity: config.app.environment === 'production',
        ...options
      };

      // Log configuration status if requested
      if (opts.logConfigurationStatus) {
        this.logConfigurationStatus();
      }

      // Step 1: Initialize providers if requested
      let providersInitialized = false;
      if (opts.initializeProviders) {
        await this.initializeProviders(opts, errors, warnings);
        providersInitialized = true;
      }

      // Step 2: Perform comprehensive health check
      let connectivityValidated = false;
      if (opts.validateConnectivity) {
        healthCheck = await this.performHealthCheck(opts, errors, warnings, recommendations);
        connectivityValidated = true;
      }

      // Step 3: Analyze results and determine success
      const success = errors.length === 0 && (!opts.failOnWarnings || warnings.length === 0);

      const duration = Date.now() - startTime;
      const result: StartupResult = {
        success,
        duration,
        timestamp: new Date(),
        environment: opts.environment,
        healthCheck,
        errors,
        warnings,
        recommendations,
        services: {
          providersInitialized,
          connectivityValidated,
          healthChecksEnabled: opts.enableHealthChecks
        }
      };

      this.lastStartupResult = result;
      this.isStarted = success;

      // Log final results
      this.logStartupResults(result, opts);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = `Application initialization failed: ${(error as Error).message}`;
      
      this.startupLogger.error('❌ Application initialization failed', error as Error);
      
      const result: StartupResult = {
        success: false,
        duration,
        timestamp: new Date(),
        environment: options.environment || config.app.environment,
        errors: [errorMessage],
        warnings,
        recommendations: ['Check application logs for detailed error information'],
        services: {
          providersInitialized: false,
          connectivityValidated: false,
          healthChecksEnabled: false
        }
      };

      this.lastStartupResult = result;
      return result;
    }
  }

  /**
   * Initialize providers
   */
  private async initializeProviders(
    options: Required<StartupOptions>,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    this.startupLogger.info('🔧 Initializing providers');

    try {
      await providerManager.initialize({
        enableHealthChecks: options.enableHealthChecks,
        healthCheckInterval: options.healthCheckInterval,
        validateSecurity: options.strictSecurity,
        enableMockFallback: options.enableMockFallback,
        skipProviderValidation: options.skipNonCriticalValidation
      });

      const status = providerManager.getStatus();
      if (!status.initialized) {
        errors.push('Provider manager failed to initialize');
        errors.push(...status.errors);
      }
      warnings.push(...status.warnings);

      this.startupLogger.info('✅ Providers initialized', {
        totalProviders: status.totalProviders,
        healthyProviders: status.healthyProviders
      });

    } catch (error) {
      const errorMessage = `Provider initialization failed: ${(error as Error).message}`;
      errors.push(errorMessage);
      this.startupLogger.error('❌ Provider initialization failed', error as Error);
    }
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(
    options: Required<StartupOptions>,
    errors: string[],
    warnings: string[],
    recommendations: string[]
  ): Promise<StartupHealthCheckResult> {
    this.startupLogger.info('💓 Performing startup health check');

    const healthCheck = await startupHealthChecker.performStartupHealthCheck({
      timeout: options.connectivityTimeout,
      skipNonCritical: options.skipNonCriticalValidation,
      enableDetailedLogging: options.enableDetailedLogging,
      failOnWarnings: options.failOnWarnings,
      enableProviderInitialization: false // Already initialized
    });

    errors.push(...healthCheck.criticalIssues);
    warnings.push(...healthCheck.warnings);
    recommendations.push(...healthCheck.recommendations);

    return healthCheck;
  }

  /**
   * Log configuration status
   */
  private logConfigurationStatus(): void {
    this.startupLogger.info('📋 Application Configuration Status');
    
    console.group('🔧 Configuration Status');
    logger.info("Environment:", { environment: config.app.environment });
    logger.info("App Version:", { version: config.app.version });
    logger.info("Mock Services:", { enabled: config.features.enableMockServices ? '✅ Enabled' : '❌ Disabled' });
    
    console.group('🤖 AI Providers');
    logger.info("OpenAI:", { configured: config.ai.openai.enabled ? '✅ Configured' : '❌ Not configured' });
    logger.info("Anthropic:", { configured: config.ai.anthropic.enabled ? '✅ Configured' : '❌ Not configured' });
    logger.info("HalluciFix:", { configured: config.ai.hallucifix?.enabled ? '✅ Configured' : '❌ Not configured' });
    console.groupEnd();
    
    console.group('🔐 Authentication');
    logger.info("Google OAuth:", { config.auth.google.enabled ? '✅ Configured' : '❌ Not configured' });
    console.groupEnd();
    
    console.group('📊 Monitoring');
    logger.info("Sentry:", { config.monitoring.sentry?.enabled ? '✅ Enabled' : '❌ Disabled' });
    logger.info("Analytics:", { config.monitoring.analytics?.enabled ? '✅ Enabled' : '❌ Disabled' });
    logger.info("DataDog:", { config.monitoring.datadog?.enabled ? '✅ Enabled' : '❌ Disabled' });
    console.groupEnd();
    
    console.group('💳 Features');
    logger.info("Payments:", { config.features.enablePayments ? '✅ Enabled' : '❌ Disabled' });
    logger.info("Beta Features:", { config.features.enableBetaFeatures ? '✅ Enabled' : '❌ Disabled' });
    logger.info("Analytics:", { config.features.enableAnalytics ? '✅ Enabled' : '❌ Disabled' });
    console.groupEnd();
    
    console.groupEnd();
  }

  /**
   * Log startup results
   */
  private logStartupResults(result: StartupResult, options: Required<StartupOptions>): void {
    const logLevel = result.success ? 'info' : 'error';
    const statusIcon = result.success ? '✅' : '❌';

    this.startupLogger[logLevel](`${statusIcon} Application initialization completed`, {
      success: result.success,
      duration: result.duration,
      environment: result.environment,
      services: result.services,
      errors: result.errors.length,
      warnings: result.warnings.length,
      recommendations: result.recommendations.length
    });

    if (options.enableDetailedLogging) {
      if (result.errors.length > 0) {
        this.startupLogger.error('Critical Issues:', result.errors);
      }
      if (result.warnings.length > 0) {
        this.startupLogger.warn('Warnings:', result.warnings);
      }
      if (result.recommendations.length > 0) {
        this.startupLogger.info('Recommendations:', result.recommendations);
      }
    }

    // Console output for development
    if (config.app.environment === 'development') {
      console.group(`${statusIcon} Application Startup`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(`Environment: ${result.environment}`);
      console.log(`Services: ${Object.entries(result.services).filter(([_, enabled]) => enabled).map(([name]) => name).join(', ')}`);
      
      if (result.healthCheck) {
        console.log(`Health Check: ${result.healthCheck.connectivity.passedTests}/${result.healthCheck.connectivity.totalTests} tests passed`);
      }
      
      if (result.errors.length > 0) {
        console.group('❌ Critical Issues');
        result.errors.forEach(error => console.error(error));
        console.groupEnd();
      }
      
      if (result.warnings.length > 0) {
        console.group('⚠️ Warnings');
        result.warnings.forEach(warning => console.warn(warning));
        console.groupEnd();
      }
      
      if (result.recommendations.length > 0) {
        console.group('💡 Recommendations');
        result.recommendations.forEach(rec => console.info(rec));
        console.groupEnd();
      }
      
      console.groupEnd();
    }
  }

  /**
   * Check if application is started
   */
  isApplicationStarted(): boolean {
    return this.isStarted;
  }

  /**
   * Get last startup result
   */
  getLastStartupResult(): StartupResult | null {
    return this.lastStartupResult;
  }

  /**
   * Restart application (useful for configuration changes)
   */
  async restart(options: StartupOptions = {}): Promise<StartupResult> {
    this.startupLogger.info('🔄 Restarting application');
    
    // Shutdown current instance
    if (this.isStarted) {
      await this.shutdown();
    }
    
    // Reinitialize
    return await this.initialize(options);
  }

  /**
   * Shutdown application
   */
  async shutdown(): Promise<void> {
    this.startupLogger.info('🛑 Shutting down application');
    
    // Shutdown provider manager
    providerManager.shutdown();
    
    this.isStarted = false;
    this.lastStartupResult = null;
    
    this.startupLogger.info('✅ Application shutdown complete');
  }

  /**
   * Quick health check (without full initialization)
   */
  async quickHealthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    try {
      const result = await startupHealthChecker.performQuickHealthCheck({
        timeout: 5000,
        skipOptional: true
      });

      return {
        healthy: result.isValid,
        issues: result.criticalFailures
      };
    } catch (error) {
      return {
        healthy: false,
        issues: [`Health check failed: ${(error as Error).message}`]
      };
    }
  }
}

// Export singleton instance
export const applicationStartup = ApplicationStartup.getInstance();