/**
 * Startup Health Checker
 * Performs comprehensive health checks during application startup
 */

import { logger } from '../../logging';
import { config } from '../../config';
import { apiConnectivityValidator, ConnectivityValidationResult, ValidationOptions } from './ApiConnectivityValidator';
import { providerManager } from '../ProviderManager';

export interface StartupHealthCheckResult {
  success: boolean;
  timestamp: Date;
  duration: number;
  connectivity: ConnectivityValidationResult;
  providerStatus: {
    initialized: boolean;
    totalProviders: number;
    healthyProviders: number;
  };
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
}

export interface StartupHealthCheckOptions extends ValidationOptions {
  skipNonCritical?: boolean;
  enableDetailedLogging?: boolean;
  failOnWarnings?: boolean;
  enableProviderInitialization?: boolean;
}

export class StartupHealthChecker {
  private static instance: StartupHealthChecker;
  private healthLogger = logger.child({ component: 'StartupHealthChecker' });
  private lastHealthCheck: StartupHealthCheckResult | null = null;

  private constructor() {}

  static getInstance(): StartupHealthChecker {
    if (!StartupHealthChecker.instance) {
      StartupHealthChecker.instance = new StartupHealthChecker();
    }
    return StartupHealthChecker.instance;
  }

  /**
   * Perform comprehensive startup health check
   */
  async performStartupHealthCheck(options: StartupHealthCheckOptions = {}): Promise<StartupHealthCheckResult> {
    const startTime = Date.now();
    this.healthLogger.info('Starting comprehensive startup health check');

    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      // Step 1: Validate configuration
      this.validateStartupConfiguration(criticalIssues, warnings, recommendations);

      // Step 2: Initialize providers if requested
      let providerStatus = { initialized: false, totalProviders: 0, healthyProviders: 0 };
      if (options.enableProviderInitialization !== false) {
        providerStatus = await this.initializeProviders(options, criticalIssues, warnings);
      }

      // Step 3: Test API connectivity
      const connectivity = await apiConnectivityValidator.validateAllConnectivity({
        timeout: options.timeout || 15000,
        skipOptional: options.skipNonCritical,
        requireAllCritical: true,
        enableRetries: options.enableRetries !== false,
        maxRetries: options.maxRetries || 2,
        retryDelay: options.retryDelay || 1000
      });

      // Step 4: Analyze results
      criticalIssues.push(...connectivity.criticalFailures);
      warnings.push(...connectivity.warnings);

      // Step 5: Generate recommendations
      this.generateRecommendations(connectivity, providerStatus, recommendations);

      const duration = Date.now() - startTime;
      const success = criticalIssues.length === 0 && (!options.failOnWarnings || warnings.length === 0);

      const result: StartupHealthCheckResult = {
        success,
        timestamp: new Date(),
        duration,
        connectivity,
        providerStatus,
        criticalIssues,
        warnings,
        recommendations
      };

      this.lastHealthCheck = result;

      // Log results
      this.logHealthCheckResults(result, options);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.healthLogger.error('Startup health check failed', error as Error);

      const result: StartupHealthCheckResult = {
        success: false,
        timestamp: new Date(),
        duration,
        connectivity: {
          isValid: false,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          results: [],
          criticalFailures: [`Health check failed: ${(error as Error).message}`],
          warnings: [],
          summary: {
            ai: { available: 0, total: 0 },
            auth: { available: 0, total: 0 },
            drive: { available: 0, total: 0 },
            knowledge: { available: 0, total: 0 },
            database: { available: 0, total: 0 }
          }
        },
        providerStatus: { initialized: false, totalProviders: 0, healthyProviders: 0 },
        criticalIssues: [`Health check failed: ${(error as Error).message}`],
        warnings: [],
        recommendations: ['Check application logs for detailed error information']
      };

      this.lastHealthCheck = result;
      return result;
    }
  }

  /**
   * Validate startup configuration
   */
  private validateStartupConfiguration(
    criticalIssues: string[],
    warnings: string[],
    recommendations: string[]
  ): void {
    this.healthLogger.info('Validating startup configuration');

    // Check required environment variables
    if (!config.database.url) {
      criticalIssues.push('Database URL not configured (VITE_SUPABASE_URL)');
    }
    if (!config.database.anonKey) {
      criticalIssues.push('Database anonymous key not configured (VITE_SUPABASE_ANON_KEY)');
    }

    // Check production-specific requirements
    if (config.app.environment === 'production') {
      if (!config.database.serviceKey) {
        criticalIssues.push('Database service key required in production (SUPABASE_SERVICE_KEY)');
      }
      if (!config.security.jwt.secret) {
        criticalIssues.push('JWT secret required in production (JWT_SECRET)');
      }
      if (!config.security.oauth.tokenEncryptionKey) {
        criticalIssues.push('OAuth token encryption key required in production (OAUTH_TOKEN_ENCRYPTION_KEY)');
      }
    }

    // Check AI provider configuration
    if (!config.features.enableMockServices) {
      const hasAnyAI = config.ai.openai.enabled || config.ai.anthropic.enabled || config.ai.hallucifix?.enabled;
      if (!hasAnyAI) {
        criticalIssues.push('No AI providers configured and mock services disabled');
        recommendations.push('Configure at least one AI provider (OpenAI, Anthropic) or enable mock services');
      }
    }

    // Check authentication configuration
    if (!config.features.enableMockServices && !config.auth.google.enabled) {
      warnings.push('No authentication providers configured, falling back to mock authentication');
      recommendations.push('Configure Google OAuth for production authentication');
    }

    // Check security configuration
    if (config.app.environment !== 'development') {
      if (!config.security.oauth.stateSecret) {
        warnings.push('OAuth state secret not configured, using default (security risk)');
        recommendations.push('Set OAUTH_STATE_SECRET for enhanced security');
      }
      if (!config.security.oauth.sessionSecret) {
        warnings.push('OAuth session secret not configured, using default (security risk)');
        recommendations.push('Set OAUTH_SESSION_SECRET for enhanced security');
      }
    }

    // Check monitoring configuration
    if (config.app.environment === 'production') {
      if (!config.monitoring.sentry?.enabled) {
        warnings.push('Error monitoring not configured for production');
        recommendations.push('Configure Sentry for production error monitoring');
      }
      if (!config.monitoring.analytics?.enabled) {
        warnings.push('Analytics not configured for production');
        recommendations.push('Configure analytics for production insights');
      }
    }

    this.healthLogger.info('Configuration validation completed', {
      criticalIssues: criticalIssues.length,
      warnings: warnings.length,
      recommendations: recommendations.length
    });
  }

  /**
   * Initialize providers
   */
  private async initializeProviders(
    options: StartupHealthCheckOptions,
    criticalIssues: string[],
    warnings: string[]
  ): Promise<{ initialized: boolean; totalProviders: number; healthyProviders: number }> {
    this.healthLogger.info('Initializing providers');

    try {
      await providerManager.initialize({
        enableHealthChecks: true,
        healthCheckInterval: 60000, // 1 minute
        validateSecurity: config.app.environment !== 'development',
        enableMockFallback: config.features.enableMockServices,
        skipProviderValidation: options.skipNonCritical
      });

      const status = providerManager.getStatus();
      
      if (!status.initialized) {
        criticalIssues.push('Provider manager failed to initialize');
        status.errors.forEach(error => criticalIssues.push(`Provider error: ${error}`));
      }

      warnings.push(...status.warnings);

      return {
        initialized: status.initialized,
        totalProviders: status.totalProviders,
        healthyProviders: status.healthyProviders
      };

    } catch (error) {
      criticalIssues.push(`Provider initialization failed: ${(error as Error).message}`);
      return { initialized: false, totalProviders: 0, healthyProviders: 0 };
    }
  }

  /**
   * Generate recommendations based on health check results
   */
  private generateRecommendations(
    connectivity: ConnectivityValidationResult,
    providerStatus: { initialized: boolean; totalProviders: number; healthyProviders: number },
    recommendations: string[]
  ): void {
    // AI provider recommendations
    if (connectivity.summary.ai.available === 0 && connectivity.summary.ai.total > 0) {
      recommendations.push('All AI providers are unavailable. Check API keys and network connectivity.');
    } else if (connectivity.summary.ai.available < connectivity.summary.ai.total) {
      recommendations.push('Some AI providers are unavailable. Consider configuring backup providers.');
    }

    // Database recommendations
    if (connectivity.summary.database.available === 0) {
      recommendations.push('Database is unavailable. Check connection settings and network connectivity.');
    } else if (connectivity.summary.database.available < connectivity.summary.database.total) {
      recommendations.push('Some database replicas are unavailable. Check read replica configuration.');
    }

    // Authentication recommendations
    if (connectivity.summary.auth.available === 0 && connectivity.summary.auth.total > 0) {
      recommendations.push('Authentication providers are unavailable. Users may not be able to log in.');
    }

    // Performance recommendations
    const slowConnections = connectivity.results.filter(r => r.responseTime && r.responseTime > 5000);
    if (slowConnections.length > 0) {
      recommendations.push(`Slow API responses detected (${slowConnections.length} providers). Consider optimizing network or switching providers.`);
    }

    // Provider recommendations
    if (providerStatus.initialized && providerStatus.healthyProviders < providerStatus.totalProviders) {
      const unhealthyCount = providerStatus.totalProviders - providerStatus.healthyProviders;
      recommendations.push(`${unhealthyCount} providers are unhealthy. Check provider configurations and API status.`);
    }

    // Environment-specific recommendations
    if (config.app.environment === 'production') {
      if (config.features.enableMockServices) {
        recommendations.push('Mock services are enabled in production. Disable for production use.');
      }
      if (config.features.enableBetaFeatures) {
        recommendations.push('Beta features are enabled in production. Consider disabling for stability.');
      }
    }
  }

  /**
   * Log health check results
   */
  private logHealthCheckResults(result: StartupHealthCheckResult, options: StartupHealthCheckOptions): void {
    const logLevel = result.success ? 'info' : 'error';
    const statusIcon = result.success ? '✅' : '❌';

    this.healthLogger[logLevel](`${statusIcon} Startup health check completed`, {
      success: result.success,
      duration: result.duration,
      connectivity: {
        isValid: result.connectivity.isValid,
        totalTests: result.connectivity.totalTests,
        passedTests: result.connectivity.passedTests,
        failedTests: result.connectivity.failedTests
      },
      providerStatus: result.providerStatus,
      criticalIssues: result.criticalIssues.length,
      warnings: result.warnings.length,
      recommendations: result.recommendations.length
    });

    if (options.enableDetailedLogging) {
      if (result.criticalIssues.length > 0) {
        this.healthLogger.error('Critical Issues:', result.criticalIssues);
      }
      if (result.warnings.length > 0) {
        this.healthLogger.warn('Warnings:', result.warnings);
      }
      if (result.recommendations.length > 0) {
        this.healthLogger.info('Recommendations:', result.recommendations);
      }
    }

    // Console output for development
    if (config.app.environment === 'development') {
      console.group(`${statusIcon} Startup Health Check`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(`Connectivity: ${result.connectivity.passedTests}/${result.connectivity.totalTests} tests passed`);
      console.log(`Providers: ${result.providerStatus.healthyProviders}/${result.providerStatus.totalProviders} healthy`);
      
      if (result.criticalIssues.length > 0) {
        console.group('❌ Critical Issues');
        result.criticalIssues.forEach(issue => console.error(issue));
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
   * Get last health check result
   */
  getLastHealthCheckResult(): StartupHealthCheckResult | null {
    return this.lastHealthCheck;
  }

  /**
   * Perform quick health check (connectivity only)
   */
  async performQuickHealthCheck(options: ValidationOptions = {}): Promise<ConnectivityValidationResult> {
    this.healthLogger.info('Performing quick health check');
    
    return await apiConnectivityValidator.validateAllConnectivity({
      timeout: options.timeout || 5000,
      skipOptional: true,
      requireAllCritical: false,
      enableRetries: false,
      ...options
    });
  }

  /**
   * Check if system is ready for production
   */
  async isProductionReady(): Promise<{ ready: boolean; issues: string[]; recommendations: string[] }> {
    const healthCheck = await this.performStartupHealthCheck({
      skipNonCritical: false,
      enableDetailedLogging: false,
      failOnWarnings: false,
      enableProviderInitialization: true,
      timeout: 10000
    });

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check critical issues
    issues.push(...healthCheck.criticalIssues);

    // Check production-specific requirements
    if (config.features.enableMockServices) {
      issues.push('Mock services are enabled (not suitable for production)');
    }

    if (!config.monitoring.sentry?.enabled) {
      recommendations.push('Enable error monitoring (Sentry) for production');
    }

    if (!config.monitoring.analytics?.enabled) {
      recommendations.push('Enable analytics for production insights');
    }

    if (healthCheck.connectivity.summary.ai.available === 0) {
      issues.push('No AI providers are available');
    }

    if (healthCheck.connectivity.summary.database.available === 0) {
      issues.push('Database is not available');
    }

    recommendations.push(...healthCheck.recommendations);

    return {
      ready: issues.length === 0,
      issues,
      recommendations
    };
  }
}

// Export singleton instance
export const startupHealthChecker = StartupHealthChecker.getInstance();