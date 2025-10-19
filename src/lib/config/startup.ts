/**
 * Startup Configuration and Health Check System
 * Validates configuration and performs health checks before service initialization
 */

import { config, type EnvironmentConfig } from './index';
import { validateConfiguration, type ValidationResult } from './validation';
import { 
  performStartupHealthCheck, 
  validateConfigurationBeforeInit,
  type HealthCheckResult 
} from './connectivity';
import { validateStripeOnStartup } from './stripeHealthCheck';

// Startup result types
export interface StartupResult {
  success: boolean;
  canProceed: boolean;
  validation: ValidationResult;
  healthCheck: HealthCheckResult;
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
  timestamp: number;
}

export interface StartupOptions {
  skipHealthChecks?: boolean;
  skipValidation?: boolean;
  timeout?: number;
  requiredServices?: string[];
  optionalServices?: string[];
}

// Main startup validation class
export class StartupValidator {
  private config: EnvironmentConfig;
  private options: StartupOptions;

  constructor(config: EnvironmentConfig, options: StartupOptions = {}) {
    this.config = config;
    this.options = {
      skipHealthChecks: false,
      skipValidation: false,
      timeout: 30000,
      requiredServices: ['supabase'],
      optionalServices: ['openai', 'anthropic', 'google-auth', 'stripe', 'sentry'],
      ...options,
    };
  }

  // Perform complete startup validation
  async performStartupValidation(): Promise<StartupResult> {
    const startTime = Date.now();
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    console.log('🚀 Starting application validation...');

    // Step 1: Configuration validation
    let validation: ValidationResult;
    if (this.options.skipValidation) {
      validation = { isValid: true, errors: [], warnings: [] };
      console.log('⏭️ Skipping configuration validation');
    } else {
      console.log('🔍 Validating configuration...');
      validation = validateConfiguration(this.config);
      
      if (!validation.isValid) {
        validation.errors.forEach(error => {
          if (error.severity === 'error') {
            criticalIssues.push(`Configuration error: ${error.message} (${error.path})`);
          } else {
            warnings.push(`Configuration warning: ${error.message} (${error.path})`);
          }
        });
      }

      validation.warnings.forEach(warning => {
        warnings.push(`Configuration: ${warning.message} (${warning.path})`);
        if (warning.recommendation) {
          recommendations.push(warning.recommendation);
        }
      });

      console.log(`✅ Configuration validation complete (${validation.errors.length} errors, ${validation.warnings.length} warnings)`);
    }

    // Step 2: Health checks
    let healthCheck: HealthCheckResult;
    if (this.options.skipHealthChecks) {
      healthCheck = {
        overall: 'healthy',
        results: [],
        summary: { total: 0, connected: 0, failed: 0, notConfigured: 0 },
        timestamp: Date.now(),
      };
      console.log('⏭️ Skipping health checks');
    } else {
      console.log('🏥 Performing health checks...');
      healthCheck = await performStartupHealthCheck(this.config);
      
      // Check required services
      const requiredServiceResults = healthCheck.results.filter(r => 
        this.options.requiredServices?.includes(r.provider)
      );

      const failedRequiredServices = requiredServiceResults.filter(r => r.status === 'failed');
      if (failedRequiredServices.length > 0) {
        failedRequiredServices.forEach(service => {
          criticalIssues.push(`Required service '${service.provider}' is unavailable: ${service.error}`);
        });
      }

      // Check optional services
      const optionalServiceResults = healthCheck.results.filter(r => 
        this.options.optionalServices?.includes(r.provider)
      );

      const failedOptionalServices = optionalServiceResults.filter(r => r.status === 'failed');
      if (failedOptionalServices.length > 0) {
        failedOptionalServices.forEach(service => {
          warnings.push(`Optional service '${service.provider}' is unavailable: ${service.error}`);
          recommendations.push(`Consider configuring ${service.provider} for full functionality`);
        });
      }

      console.log(`✅ Health checks complete (${healthCheck.summary.connected}/${healthCheck.summary.total} services healthy)`);
    }

    // Step 3: Environment-specific validation
    console.log('🌍 Performing environment-specific validation...');
    this.performEnvironmentValidation(criticalIssues, warnings, recommendations);

    // Step 4: Feature compatibility validation
    console.log('🔧 Validating feature compatibility...');
    await this.performFeatureValidation(criticalIssues, warnings, recommendations);

    const success = criticalIssues.length === 0;
    const canProceed = success || this.config.app.environment === 'development';

    const result: StartupResult = {
      success,
      canProceed,
      validation,
      healthCheck,
      criticalIssues,
      warnings,
      recommendations,
      timestamp: Date.now(),
    };

    // Log results
    this.logStartupResults(result, Date.now() - startTime);

    return result;
  }

  // Environment-specific validation
  private performEnvironmentValidation(
    criticalIssues: string[],
    warnings: string[],
    recommendations: string[]
  ): void {
    const env = this.config.app.environment;

    switch (env) {
      case 'production':
        this.validateProductionEnvironment(criticalIssues, warnings, recommendations);
        break;
      case 'staging':
        this.validateStagingEnvironment(criticalIssues, warnings, recommendations);
        break;
      case 'development':
        this.validateDevelopmentEnvironment(criticalIssues, warnings, recommendations);
        break;
    }
  }

  // Production environment validation
  private validateProductionEnvironment(
    criticalIssues: string[],
    warnings: string[],
    recommendations: string[]
  ): void {
    // Security requirements
    if (!this.config.security.jwt.secret || this.config.security.jwt.secret.length < 32) {
      criticalIssues.push('Production requires a strong JWT secret (32+ characters)');
    }

    if (!this.config.security.oauth.tokenEncryptionKey || this.config.security.oauth.tokenEncryptionKey.length < 32) {
      criticalIssues.push('Production requires a strong OAuth encryption key (32+ characters)');
    }

    // Mock services check
    if (this.config.features.enableMockServices) {
      criticalIssues.push('Mock services must be disabled in production');
    }

    // Beta features check
    if (this.config.features.enableBetaFeatures) {
      warnings.push('Beta features are enabled in production');
      recommendations.push('Consider disabling beta features for production stability');
    }

    // Monitoring requirements
    if (!this.config.monitoring.sentry?.enabled) {
      warnings.push('Error monitoring (Sentry) is not configured for production');
      recommendations.push('Configure Sentry for production error tracking');
    }

    // Database requirements
    if (!this.config.database.serviceKey) {
      criticalIssues.push('Database service key is required in production');
    }

    // AI provider requirements
    if (!this.config.features.enableMockServices) {
      const hasAnyAIProvider = this.config.ai.openai.enabled || 
                              this.config.ai.anthropic.enabled || 
                              this.config.ai.hallucifix?.enabled;
      if (!hasAnyAIProvider) {
        criticalIssues.push('At least one AI provider must be configured in production');
      }
    }
  }

  // Staging environment validation
  private validateStagingEnvironment(
    criticalIssues: string[],
    warnings: string[],
    recommendations: string[]
  ): void {
    // Mock services should be disabled
    if (this.config.features.enableMockServices) {
      warnings.push('Mock services are enabled in staging');
      recommendations.push('Disable mock services to test real integrations');
    }

    // Monitoring should be configured
    if (!this.config.monitoring.sentry?.enabled) {
      warnings.push('Error monitoring is not configured for staging');
      recommendations.push('Configure monitoring to catch issues before production');
    }

    // Database service key recommended
    if (!this.config.database.serviceKey) {
      warnings.push('Database service key is recommended for staging');
    }
  }

  // Development environment validation
  private validateDevelopmentEnvironment(
    criticalIssues: string[],
    warnings: string[],
    recommendations: string[]
  ): void {
    // Check if real services are configured
    if (!this.config.features.enableMockServices) {
      const hasAnyAIProvider = this.config.ai.openai.enabled || 
                              this.config.ai.anthropic.enabled;
      if (!hasAnyAIProvider) {
        warnings.push('No AI providers configured - falling back to mock services');
        recommendations.push('Configure at least one AI provider for real testing');
      }
    }

    // Security warnings for development
    if (this.config.security.jwt.secret === 'dev_jwt_secret_key_for_development_only') {
      warnings.push('Using default development JWT secret');
      recommendations.push('Consider using a unique JWT secret even in development');
    }
  }

  // Feature compatibility validation
  private async performFeatureValidation(
    criticalIssues: string[],
    warnings: string[],
    recommendations: string[]
  ): Promise<void> {
    // Payments feature validation
    if (this.config.features.enablePayments) {
      if (!this.config.payments.stripe?.enabled) {
        criticalIssues.push('Payments are enabled but Stripe is not configured');
      } else {
        // Perform Stripe startup validation
        try {
          const stripeValidation = await validateStripeOnStartup();
          
          if (!stripeValidation.success) {
            stripeValidation.errors.forEach(error => {
              criticalIssues.push(`Stripe: ${error}`);
            });
          }
          
          stripeValidation.warnings.forEach(warning => {
            warnings.push(`Stripe: ${warning}`);
          });
        } catch (error) {
          warnings.push(`Stripe validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Analytics feature validation
    if (this.config.features.enableAnalytics) {
      const hasAnalytics = this.config.monitoring.analytics?.googleAnalyticsId || 
                          this.config.monitoring.analytics?.mixpanelToken;
      if (!hasAnalytics) {
        warnings.push('Analytics are enabled but no analytics providers are configured');
        recommendations.push('Configure Google Analytics or Mixpanel for user tracking');
      }
    }

    // Read replicas validation
    if (this.config.features.enableReadReplicas) {
      if (!this.config.database.readReplicas || this.config.database.readReplicas.length === 0) {
        warnings.push('Read replicas are enabled but no replicas are configured');
        recommendations.push('Configure read replica URLs for improved performance');
      }
    }

    // Log aggregation validation
    if (this.config.features.enableLogAggregation) {
      if (!this.config.monitoring.datadog?.enabled) {
        warnings.push('Log aggregation is enabled but no log aggregation service is configured');
        recommendations.push('Configure Datadog or another log aggregation service');
      }
    }
  }

  // Log startup results
  private logStartupResults(result: StartupResult, duration: number): void {
    console.log('\n📊 Startup Validation Results');
    console.log('================================');
    console.log(`Environment: ${this.config.app.environment}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Overall Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Can Proceed: ${result.canProceed ? '✅ YES' : '❌ NO'}`);

    if (result.criticalIssues.length > 0) {
      console.log('\n🚨 Critical Issues:');
      result.criticalIssues.forEach(issue => console.log(`  ❌ ${issue}`));
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      result.warnings.forEach(warning => console.log(`  ⚠️ ${warning}`));
    }

    if (result.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      result.recommendations.forEach(rec => console.log(`  💡 ${rec}`));
    }

    // Health check summary
    if (!this.options.skipHealthChecks) {
      console.log('\n🏥 Service Health:');
      result.healthCheck.results.forEach(service => {
        const status = service.status === 'connected' ? '✅' : 
                      service.status === 'failed' ? '❌' : '⚪';
        const time = service.responseTime ? ` (${service.responseTime}ms)` : '';
        console.log(`  ${status} ${service.provider}${time}`);
        if (service.error) {
          console.log(`      Error: ${service.error}`);
        }
      });
    }

    console.log('================================\n');
  }
}

// Convenience functions for common startup scenarios
export async function performQuickStartupCheck(config: EnvironmentConfig): Promise<boolean> {
  const validator = new StartupValidator(config, {
    skipHealthChecks: true,
    requiredServices: ['supabase'],
  });

  const result = await validator.performStartupValidation();
  return result.canProceed;
}

export async function performFullStartupValidation(config: EnvironmentConfig): Promise<StartupResult> {
  const validator = new StartupValidator(config);
  return validator.performStartupValidation();
}

export async function performProductionStartupCheck(config: EnvironmentConfig): Promise<StartupResult> {
  const validator = new StartupValidator(config, {
    requiredServices: ['supabase', 'openai', 'sentry'],
    optionalServices: ['anthropic', 'google-auth', 'stripe', 'datadog'],
    timeout: 60000, // Longer timeout for production
  });

  return validator.performStartupValidation();
}

// Application initialization function
export async function initializeApplication(
  config: EnvironmentConfig,
  options: StartupOptions = {}
): Promise<{ success: boolean; result: StartupResult }> {
  try {
    console.log('🚀 Initializing HalluciFix application...');
    
    const validator = new StartupValidator(config, options);
    const result = await validator.performStartupValidation();

    if (!result.canProceed) {
      console.error('❌ Application initialization failed');
      console.error('Critical issues must be resolved before proceeding');
      return { success: false, result };
    }

    if (result.criticalIssues.length > 0 && config.app.environment === 'production') {
      console.error('❌ Production deployment blocked due to critical issues');
      return { success: false, result };
    }

    console.log('✅ Application initialization successful');
    
    // Initialize services based on configuration
    await initializeServices(config);

    return { success: true, result };
  } catch (error) {
    console.error('💥 Application initialization failed with error:', error);
    throw error;
  }
}

// Service initialization
async function initializeServices(config: EnvironmentConfig): Promise<void> {
  console.log('🔧 Initializing services...');

  // Initialize database connections
  if (config.database.url && config.database.anonKey) {
    console.log('  📊 Database client initialized');
  }

  // Initialize AI providers
  const aiProviders = [];
  if (config.ai.openai.enabled) aiProviders.push('OpenAI');
  if (config.ai.anthropic.enabled) aiProviders.push('Anthropic');
  if (config.ai.hallucifix?.enabled) aiProviders.push('HalluciFix');
  
  if (aiProviders.length > 0) {
    console.log(`  🤖 AI providers initialized: ${aiProviders.join(', ')}`);
  }

  // Initialize authentication
  if (config.auth.google.enabled) {
    console.log('  🔐 Google OAuth initialized');
  }

  // Initialize monitoring
  const monitoring = [];
  if (config.monitoring.sentry?.enabled) monitoring.push('Sentry');
  if (config.monitoring.datadog?.enabled) monitoring.push('Datadog');
  if (config.monitoring.analytics?.enabled) monitoring.push('Analytics');
  
  if (monitoring.length > 0) {
    console.log(`  📈 Monitoring initialized: ${monitoring.join(', ')}`);
  }

  // Initialize payments
  if (config.payments.stripe?.enabled) {
    try {
      // Test Stripe initialization (server-side only)
      if (typeof window === 'undefined') {
        const { getStripe } = await import('../stripe');
        getStripe(); // This will initialize and validate Stripe
      }
      console.log('  💳 Stripe payments initialized');
    } catch (error) {
      console.warn(`  ⚠️ Stripe initialization warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('✅ All services initialized successfully');
}

// Export types and main functions
export type {
  StartupResult,
  StartupOptions,
};