/**
 * Configuration health checks and monitoring
 * Provides health check endpoints and connectivity validation for all configured services
 */

import { EnvironmentConfig } from './types.js';
import { ConfigurationService } from './index.js';

import { logger } from './logging';
export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy' | 'warning';
  message: string;
  responseTime?: number;
  lastChecked: Date;
  metadata?: Record<string, any>;
}

export interface ServiceHealthCheck {
  name: string;
  check: (config: EnvironmentConfig) => Promise<HealthCheckResult>;
  required: boolean;
  timeout: number;
}

export interface ConfigurationHealthStatus {
  overall: 'healthy' | 'unhealthy' | 'warning';
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    warnings: number;
  };
  lastUpdated: Date;
}

/**
 * Configuration health check service
 */
export class ConfigurationHealthChecker {
  private checks: ServiceHealthCheck[] = [];
  private lastHealthStatus: ConfigurationHealthStatus | null = null;
  private configService: ConfigurationService;

  constructor(configService: ConfigurationService) {
    this.configService = configService;
    this.initializeHealthChecks();
  }

  private initializeHealthChecks(): void {
    this.checks = [
      {
        name: 'supabase-connectivity',
        check: this.checkSupabaseConnectivity.bind(this),
        required: true,
        timeout: 5000
      },
      {
        name: 'openai-api',
        check: this.checkOpenAIConnectivity.bind(this),
        required: false,
        timeout: 10000
      },
      {
        name: 'anthropic-api',
        check: this.checkAnthropicConnectivity.bind(this),
        required: false,
        timeout: 10000
      },
      {
        name: 'google-oauth',
        check: this.checkGoogleOAuthConfiguration.bind(this),
        required: true,
        timeout: 5000
      },
      {
        name: 'stripe-api',
        check: this.checkStripeConnectivity.bind(this),
        required: false,
        timeout: 5000
      },
      {
        name: 'sentry-dsn',
        check: this.checkSentryConfiguration.bind(this),
        required: false,
        timeout: 5000
      },
      {
        name: 'configuration-validation',
        check: this.checkConfigurationValidation.bind(this),
        required: true,
        timeout: 1000
      }
    ];
  }

  /**
   * Run all health checks
   */
  async runHealthChecks(): Promise<ConfigurationHealthStatus> {
    const config = await this.getConfiguration();
    const startTime = Date.now();
    
    logger.debug("🔍 Running configuration health checks...");

    const checkPromises = this.checks.map(async (healthCheck) => {
      const checkStartTime = Date.now();
      
      try {
        // Run check with timeout
        const result = await Promise.race([
          healthCheck.check(config),
          this.createTimeoutPromise(healthCheck.timeout, healthCheck.name)
        ]);
        
        result.responseTime = Date.now() - checkStartTime;
        return result;
      } catch (error) {
        return {
          name: healthCheck.name,
          status: 'unhealthy' as const,
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          responseTime: Date.now() - checkStartTime,
          lastChecked: new Date()
        };
      }
    });

    const results = await Promise.all(checkPromises);
    
    // Calculate overall status
    const summary = {
      total: results.length,
      healthy: results.filter(r => r.status === 'healthy').length,
      unhealthy: results.filter(r => r.status === 'unhealthy').length,
      warnings: results.filter(r => r.status === 'warning').length
    };

    // Determine overall status
    let overall: 'healthy' | 'unhealthy' | 'warning' = 'healthy';
    
    // Check if any required services are unhealthy
    const requiredChecks = this.checks.filter(c => c.required);
    const requiredResults = results.filter(r => 
      requiredChecks.some(c => c.name === r.name)
    );
    
    if (requiredResults.some(r => r.status === 'unhealthy')) {
      overall = 'unhealthy';
    } else if (results.some(r => r.status === 'unhealthy') || results.some(r => r.status === 'warning')) {
      overall = 'warning';
    }

    const healthStatus: ConfigurationHealthStatus = {
      overall,
      checks: results,
      summary,
      lastUpdated: new Date()
    };

    this.lastHealthStatus = healthStatus;
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ Health checks completed in ${totalTime}ms - Overall status: ${overall}`);
    
    return healthStatus;
  }

  /**
   * Get the last health check results
   */
  getLastHealthStatus(): ConfigurationHealthStatus | null {
    return this.lastHealthStatus;
  }

  /**
   * Check Supabase connectivity
   */
  private async checkSupabaseConnectivity(config: EnvironmentConfig): Promise<HealthCheckResult> {
    try {
      const response = await fetch(`${config.database.supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': config.database.supabaseAnonKey,
          'Authorization': `Bearer ${config.database.supabaseAnonKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return {
          name: 'supabase-connectivity',
          status: 'healthy',
          message: 'Supabase connection successful',
          lastChecked: new Date(),
          metadata: {
            url: config.database.supabaseUrl,
            status: response.status
          }
        };
      } else {
        return {
          name: 'supabase-connectivity',
          status: 'unhealthy',
          message: `Supabase connection failed: ${response.status} ${response.statusText}`,
          lastChecked: new Date(),
          metadata: {
            url: config.database.supabaseUrl,
            status: response.status,
            statusText: response.statusText
          }
        };
      }
    } catch (error) {
      return {
        name: 'supabase-connectivity',
        status: 'unhealthy',
        message: `Supabase connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Check OpenAI API connectivity
   */
  private async checkOpenAIConnectivity(config: EnvironmentConfig): Promise<HealthCheckResult> {
    if (!config.ai.openai?.apiKey) {
      return {
        name: 'openai-api',
        status: 'warning',
        message: 'OpenAI API key not configured',
        lastChecked: new Date()
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.ai.openai.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return {
          name: 'openai-api',
          status: 'healthy',
          message: 'OpenAI API connection successful',
          lastChecked: new Date(),
          metadata: {
            status: response.status,
            model: config.ai.openai.model
          }
        };
      } else {
        return {
          name: 'openai-api',
          status: 'unhealthy',
          message: `OpenAI API connection failed: ${response.status} ${response.statusText}`,
          lastChecked: new Date(),
          metadata: {
            status: response.status,
            statusText: response.statusText
          }
        };
      }
    } catch (error) {
      return {
        name: 'openai-api',
        status: 'unhealthy',
        message: `OpenAI API connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Check Anthropic API connectivity
   */
  private async checkAnthropicConnectivity(config: EnvironmentConfig): Promise<HealthCheckResult> {
    if (!config.ai.anthropic?.apiKey) {
      return {
        name: 'anthropic-api',
        status: 'warning',
        message: 'Anthropic API key not configured',
        lastChecked: new Date()
      };
    }

    try {
      // Anthropic doesn't have a simple health check endpoint, so we'll validate the key format
      const keyPattern = /^sk-ant-[a-zA-Z0-9-_]+$/;
      if (!keyPattern.test(config.ai.anthropic.apiKey)) {
        return {
          name: 'anthropic-api',
          status: 'unhealthy',
          message: 'Anthropic API key format is invalid',
          lastChecked: new Date()
        };
      }

      return {
        name: 'anthropic-api',
        status: 'healthy',
        message: 'Anthropic API key format is valid',
        lastChecked: new Date(),
        metadata: {
          model: config.ai.anthropic.model
        }
      };
    } catch (error) {
      return {
        name: 'anthropic-api',
        status: 'unhealthy',
        message: `Anthropic API validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Check Google OAuth configuration
   */
  private async checkGoogleOAuthConfiguration(config: EnvironmentConfig): Promise<HealthCheckResult> {
    try {
      // Validate client ID format
      const clientIdPattern = /^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/;
      if (!clientIdPattern.test(config.auth.google.clientId)) {
        return {
          name: 'google-oauth',
          status: 'unhealthy',
          message: 'Google OAuth client ID format is invalid',
          lastChecked: new Date()
        };
      }

      // Validate client secret format
      const clientSecretPattern = /^GOCSPX-[a-zA-Z0-9_-]+$/;
      if (!clientSecretPattern.test(config.auth.google.clientSecret)) {
        return {
          name: 'google-oauth',
          status: 'unhealthy',
          message: 'Google OAuth client secret format is invalid',
          lastChecked: new Date()
        };
      }

      // Validate redirect URI format
      try {
        new URL(config.auth.google.redirectUri);
      } catch {
        return {
          name: 'google-oauth',
          status: 'unhealthy',
          message: 'Google OAuth redirect URI is not a valid URL',
          lastChecked: new Date()
        };
      }

      return {
        name: 'google-oauth',
        status: 'healthy',
        message: 'Google OAuth configuration is valid',
        lastChecked: new Date(),
        metadata: {
          clientId: config.auth.google.clientId,
          redirectUri: config.auth.google.redirectUri
        }
      };
    } catch (error) {
      return {
        name: 'google-oauth',
        status: 'unhealthy',
        message: `Google OAuth validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Check Stripe API connectivity
   */
  private async checkStripeConnectivity(config: EnvironmentConfig): Promise<HealthCheckResult> {
    if (!config.payments?.stripe) {
      return {
        name: 'stripe-api',
        status: 'warning',
        message: 'Stripe configuration not provided',
        lastChecked: new Date()
      };
    }

    try {
      // Validate key formats
      const pubKeyPattern = /^pk_(test|live)_[a-zA-Z0-9]+$/;
      const secKeyPattern = /^sk_(test|live)_[a-zA-Z0-9]+$/;
      
      if (!pubKeyPattern.test(config.payments.stripe.publishableKey)) {
        return {
          name: 'stripe-api',
          status: 'unhealthy',
          message: 'Stripe publishable key format is invalid',
          lastChecked: new Date()
        };
      }

      if (!secKeyPattern.test(config.payments.stripe.secretKey)) {
        return {
          name: 'stripe-api',
          status: 'unhealthy',
          message: 'Stripe secret key format is invalid',
          lastChecked: new Date()
        };
      }

      // Check if we're using test keys in production
      const isTestKey = config.payments.stripe.secretKey.startsWith('sk_test_');
      const isProduction = config.app.environment === 'production';
      
      if (isProduction && isTestKey) {
        return {
          name: 'stripe-api',
          status: 'warning',
          message: 'Using Stripe test keys in production environment',
          lastChecked: new Date(),
          metadata: {
            environment: config.app.environment,
            keyType: 'test'
          }
        };
      }

      return {
        name: 'stripe-api',
        status: 'healthy',
        message: 'Stripe configuration is valid',
        lastChecked: new Date(),
        metadata: {
          keyType: isTestKey ? 'test' : 'live',
          environment: config.app.environment
        }
      };
    } catch (error) {
      return {
        name: 'stripe-api',
        status: 'unhealthy',
        message: `Stripe validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Check Sentry configuration
   */
  private async checkSentryConfiguration(config: EnvironmentConfig): Promise<HealthCheckResult> {
    if (!config.monitoring.sentry?.dsn) {
      return {
        name: 'sentry-dsn',
        status: 'warning',
        message: 'Sentry DSN not configured',
        lastChecked: new Date()
      };
    }

    try {
      // Validate DSN format
      const dsn = new URL(config.monitoring.sentry.dsn);
      
      if (!dsn.hostname.includes('sentry.io') && !dsn.hostname.includes('sentry')) {
        return {
          name: 'sentry-dsn',
          status: 'warning',
          message: 'Sentry DSN hostname appears invalid',
          lastChecked: new Date(),
          metadata: {
            hostname: dsn.hostname
          }
        };
      }

      return {
        name: 'sentry-dsn',
        status: 'healthy',
        message: 'Sentry DSN format is valid',
        lastChecked: new Date(),
        metadata: {
          hostname: dsn.hostname,
          environment: config.monitoring.sentry.environment
        }
      };
    } catch (error) {
      return {
        name: 'sentry-dsn',
        status: 'unhealthy',
        message: `Sentry DSN validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Check overall configuration validation
   */
  private async checkConfigurationValidation(config: EnvironmentConfig): Promise<HealthCheckResult> {
    try {
      // This check assumes the configuration has already been validated during loading
      // We'll perform some additional runtime checks here
      
      const issues: string[] = [];
      
      // Check for missing required services in production
      if (config.app.environment === 'production') {
        if (!config.database.supabaseServiceKey) {
          issues.push('Supabase service key not configured for production');
        }
        
        if (!config.monitoring.sentry?.dsn) {
          issues.push('Sentry monitoring not configured for production');
        }
        
        if (config.features.enablePayments && !config.payments?.stripe) {
          issues.push('Payments enabled but Stripe not configured');
        }
      }
      
      // Check for development-specific issues
      if (config.app.environment === 'development') {
        if (!config.ai.openai?.apiKey && !config.features.enableMockServices) {
          issues.push('OpenAI API key not configured and mock services disabled');
        }
      }
      
      if (issues.length > 0) {
        return {
          name: 'configuration-validation',
          status: 'warning',
          message: `Configuration issues found: ${issues.join(', ')}`,
          lastChecked: new Date(),
          metadata: {
            issues,
            environment: config.app.environment
          }
        };
      }

      return {
        name: 'configuration-validation',
        status: 'healthy',
        message: 'Configuration validation passed',
        lastChecked: new Date(),
        metadata: {
          environment: config.app.environment,
          featuresEnabled: Object.entries(config.features)
            .filter(([_, enabled]) => enabled)
            .map(([feature, _]) => feature)
        }
      };
    } catch (error) {
      return {
        name: 'configuration-validation',
        status: 'unhealthy',
        message: `Configuration validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Create a timeout promise for health checks
   */
  private createTimeoutPromise(timeout: number, checkName: string): Promise<HealthCheckResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check '${checkName}' timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Get configuration from service
   */
  private async getConfiguration(): Promise<EnvironmentConfig> {
    try {
      // Ensure configuration is initialized
      if (!this.configService) {
        throw new Error('Configuration service not available');
      }
      
      // Access configuration properties to trigger initialization if needed
      return {
        app: this.configService.app,
        database: this.configService.database,
        ai: this.configService.ai,
        auth: this.configService.auth,
        payments: this.configService.payments,
        monitoring: this.configService.monitoring,
        features: this.configService.features,
        security: this.configService.security
      };
    } catch (error) {
      throw new Error(`Failed to get configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Configuration drift detection
 */
export class ConfigurationDriftDetector {
  private baselineConfig: EnvironmentConfig | null = null;
  private configService: ConfigurationService;

  constructor(configService: ConfigurationService) {
    this.configService = configService;
  }

  /**
   * Set baseline configuration for drift detection
   */
  setBaseline(config: EnvironmentConfig): void {
    this.baselineConfig = JSON.parse(JSON.stringify(config)); // Deep clone
  }

  /**
   * Detect configuration drift from baseline
   */
  async detectDrift(): Promise<ConfigurationDriftResult> {
    if (!this.baselineConfig) {
      throw new Error('No baseline configuration set for drift detection');
    }

    const currentConfig = await this.getCurrentConfiguration();
    const driftItems: ConfigurationDriftItem[] = [];

    this.compareConfigurations('', this.baselineConfig, currentConfig, driftItems);

    return {
      hasDrift: driftItems.length > 0,
      driftItems,
      detectedAt: new Date(),
      summary: {
        total: driftItems.length,
        added: driftItems.filter(item => item.type === 'added').length,
        removed: driftItems.filter(item => item.type === 'removed').length,
        modified: driftItems.filter(item => item.type === 'modified').length
      }
    };
  }

  private compareConfigurations(
    path: string,
    baseline: any,
    current: any,
    driftItems: ConfigurationDriftItem[]
  ): void {
    // Check for removed or modified properties
    for (const key in baseline) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (!(key in current)) {
        driftItems.push({
          type: 'removed',
          path: currentPath,
          baselineValue: baseline[key],
          currentValue: undefined
        });
      } else if (typeof baseline[key] === 'object' && baseline[key] !== null) {
        if (typeof current[key] === 'object' && current[key] !== null) {
          this.compareConfigurations(currentPath, baseline[key], current[key], driftItems);
        } else {
          driftItems.push({
            type: 'modified',
            path: currentPath,
            baselineValue: baseline[key],
            currentValue: current[key]
          });
        }
      } else if (baseline[key] !== current[key]) {
        driftItems.push({
          type: 'modified',
          path: currentPath,
          baselineValue: baseline[key],
          currentValue: current[key]
        });
      }
    }

    // Check for added properties
    for (const key in current) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (!(key in baseline)) {
        driftItems.push({
          type: 'added',
          path: currentPath,
          baselineValue: undefined,
          currentValue: current[key]
        });
      }
    }
  }

  private async getCurrentConfiguration(): Promise<EnvironmentConfig> {
    return {
      app: this.configService.app,
      database: this.configService.database,
      ai: this.configService.ai,
      auth: this.configService.auth,
      payments: this.configService.payments,
      monitoring: this.configService.monitoring,
      features: this.configService.features,
      security: this.configService.security
    };
  }
}

export interface ConfigurationDriftItem {
  type: 'added' | 'removed' | 'modified';
  path: string;
  baselineValue: any;
  currentValue: any;
}

export interface ConfigurationDriftResult {
  hasDrift: boolean;
  driftItems: ConfigurationDriftItem[];
  detectedAt: Date;
  summary: {
    total: number;
    added: number;
    removed: number;
    modified: number;
  };
}