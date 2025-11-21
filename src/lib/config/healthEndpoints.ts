/**
 * Health check endpoints for configuration monitoring
 * Provides HTTP endpoints for configuration health checks and monitoring
 */

import { ConfigurationHealthChecker, ConfigurationDriftDetector, ConfigurationHealthStatus } from './healthChecks.js';
import { ConfigurationService } from './index.js';

import { logger } from './logging';
export interface HealthEndpointResponse {
  status: 'healthy' | 'unhealthy' | 'warning';
  timestamp: string;
  data?: any;
  error?: string;
}

/**
 * Configuration health endpoints manager
 */
export class ConfigurationHealthEndpoints {
  private healthChecker: ConfigurationHealthChecker;
  private driftDetector: ConfigurationDriftDetector;
  private configService: ConfigurationService;

  constructor(configService: ConfigurationService) {
    this.configService = configService;
    this.healthChecker = new ConfigurationHealthChecker(configService);
    this.driftDetector = new ConfigurationDriftDetector(configService);
  }

  /**
   * Initialize drift detection baseline
   */
  async initializeDriftDetection(): Promise<void> {
    try {
      const config = {
        app: this.configService.app,
        database: this.configService.database,
        ai: this.configService.ai,
        auth: this.configService.auth,
        payments: this.configService.payments,
        monitoring: this.configService.monitoring,
        features: this.configService.features,
        security: this.configService.security
      };
      
      this.driftDetector.setBaseline(config);
      logger.debug("✅ Configuration drift detection baseline set");
    } catch (error) {
      logger.error("Failed to initialize drift detection:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Health check endpoint - returns overall health status
   */
  async healthCheck(): Promise<HealthEndpointResponse> {
    try {
      const healthStatus = await this.healthChecker.runHealthChecks();
      
      return {
        status: healthStatus.overall,
        timestamp: new Date().toISOString(),
        data: {
          overall: healthStatus.overall,
          summary: healthStatus.summary,
          lastUpdated: healthStatus.lastUpdated.toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Detailed health check endpoint - returns full health check results
   */
  async detailedHealthCheck(): Promise<HealthEndpointResponse> {
    try {
      const healthStatus = await this.healthChecker.runHealthChecks();
      
      return {
        status: healthStatus.overall,
        timestamp: new Date().toISOString(),
        data: {
          overall: healthStatus.overall,
          checks: healthStatus.checks.map(check => ({
            name: check.name,
            status: check.status,
            message: check.message,
            responseTime: check.responseTime,
            lastChecked: check.lastChecked.toISOString(),
            metadata: check.metadata
          })),
          summary: healthStatus.summary,
          lastUpdated: healthStatus.lastUpdated.toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Configuration drift endpoint - checks for configuration drift
   */
  async configurationDrift(): Promise<HealthEndpointResponse> {
    try {
      const driftResult = await this.driftDetector.detectDrift();
      
      return {
        status: driftResult.hasDrift ? 'warning' : 'healthy',
        timestamp: new Date().toISOString(),
        data: {
          hasDrift: driftResult.hasDrift,
          summary: driftResult.summary,
          driftItems: driftResult.driftItems.map(item => ({
            type: item.type,
            path: item.path,
            baselineValue: this.sanitizeValue(item.baselineValue),
            currentValue: this.sanitizeValue(item.currentValue)
          })),
          detectedAt: driftResult.detectedAt.toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Configuration validation endpoint - validates current configuration
   */
  async configurationValidation(): Promise<HealthEndpointResponse> {
    try {
      // Get the last health status or run a new check
      let healthStatus = this.healthChecker.getLastHealthStatus();
      if (!healthStatus) {
        healthStatus = await this.healthChecker.runHealthChecks();
      }

      // Find the configuration validation check
      const validationCheck = healthStatus.checks.find(
        check => check.name === 'configuration-validation'
      );

      if (!validationCheck) {
        return {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Configuration validation check not found'
        };
      }

      return {
        status: validationCheck.status,
        timestamp: new Date().toISOString(),
        data: {
          status: validationCheck.status,
          message: validationCheck.message,
          lastChecked: validationCheck.lastChecked.toISOString(),
          metadata: validationCheck.metadata
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Service connectivity endpoint - checks connectivity to external services
   */
  async serviceConnectivity(): Promise<HealthEndpointResponse> {
    try {
      const healthStatus = await this.healthChecker.runHealthChecks();
      
      // Filter to only connectivity checks
      const connectivityChecks = healthStatus.checks.filter(check => 
        ['supabase-connectivity', 'openai-api', 'anthropic-api', 'stripe-api'].includes(check.name)
      );

      const overallStatus = connectivityChecks.some(check => check.status === 'unhealthy') 
        ? 'unhealthy' 
        : connectivityChecks.some(check => check.status === 'warning')
        ? 'warning'
        : 'healthy';

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        data: {
          overall: overallStatus,
          services: connectivityChecks.map(check => ({
            name: check.name,
            status: check.status,
            message: check.message,
            responseTime: check.responseTime,
            lastChecked: check.lastChecked.toISOString(),
            metadata: check.metadata
          })),
          summary: {
            total: connectivityChecks.length,
            healthy: connectivityChecks.filter(c => c.status === 'healthy').length,
            unhealthy: connectivityChecks.filter(c => c.status === 'unhealthy').length,
            warnings: connectivityChecks.filter(c => c.status === 'warning').length
          }
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Configuration readiness endpoint - checks if configuration is ready for use
   */
  async configurationReadiness(): Promise<HealthEndpointResponse> {
    try {
      const healthStatus = await this.healthChecker.runHealthChecks();
      
      // Check if all required services are healthy
      const requiredServices = ['supabase-connectivity', 'google-oauth', 'configuration-validation'];
      const requiredChecks = healthStatus.checks.filter(check => 
        requiredServices.includes(check.name)
      );

      const isReady = requiredChecks.every(check => check.status === 'healthy');
      const hasWarnings = healthStatus.checks.some(check => check.status === 'warning');

      return {
        status: isReady ? (hasWarnings ? 'warning' : 'healthy') : 'unhealthy',
        timestamp: new Date().toISOString(),
        data: {
          ready: isReady,
          requiredServices: requiredChecks.map(check => ({
            name: check.name,
            status: check.status,
            message: check.message
          })),
          warnings: healthStatus.checks
            .filter(check => check.status === 'warning')
            .map(check => ({
              name: check.name,
              message: check.message
            })),
          environment: this.configService.app.environment,
          featuresEnabled: Object.entries(this.configService.features)
            .filter(([_, enabled]) => enabled)
            .map(([feature, _]) => feature)
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Sanitize sensitive values for API responses
   */
  private sanitizeValue(value: any): any {
    if (typeof value === 'string') {
      // Check if it looks like a secret (API key, token, etc.)
      if (this.isSensitiveValue(value)) {
        return `[REDACTED:${value.length}chars]`;
      }
    }
    
    if (typeof value === 'object' && value !== null) {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = this.sanitizeValue(val);
      }
      return sanitized;
    }
    
    return value;
  }

  /**
   * Check if a value appears to be sensitive
   */
  private isSensitiveValue(value: string): boolean {
    const sensitivePatterns = [
      /^sk-[a-zA-Z0-9]{48}$/, // OpenAI API key
      /^sk-ant-[a-zA-Z0-9-_]+$/, // Anthropic API key
      /^sk_(test|live)_[a-zA-Z0-9]+$/, // Stripe secret key
      /^GOCSPX-[a-zA-Z0-9_-]+$/, // Google client secret
      /^whsec_[a-zA-Z0-9]+$/, // Stripe webhook secret
      /^https:\/\/[a-zA-Z0-9]+@[a-zA-Z0-9]+\.ingest\.sentry\.io\/[0-9]+$/ // Sentry DSN
    ];

    return sensitivePatterns.some(pattern => pattern.test(value)) || 
           value.length > 32; // Assume long strings might be secrets
  }
}

/**
 * Express.js middleware factory for health check endpoints
 */
export function createHealthCheckMiddleware(configService: ConfigurationService) {
  const endpoints = new ConfigurationHealthEndpoints(configService);
  
  // Initialize drift detection
  endpoints.initializeDriftDetection().catch(error => {
    logger.warn("Failed to initialize drift detection:", { error });
  });

  return {
    // Basic health check
    health: async (req: any, res: any) => {
      const result = await endpoints.healthCheck();
      res.status(result.status === 'healthy' ? 200 : result.status === 'warning' ? 200 : 503)
         .json(result);
    },

    // Detailed health check
    healthDetailed: async (req: any, res: any) => {
      const result = await endpoints.detailedHealthCheck();
      res.status(result.status === 'healthy' ? 200 : result.status === 'warning' ? 200 : 503)
         .json(result);
    },

    // Configuration drift check
    drift: async (req: any, res: any) => {
      const result = await endpoints.configurationDrift();
      res.status(result.status === 'healthy' ? 200 : 200) // Always 200 for drift checks
         .json(result);
    },

    // Configuration validation
    validation: async (req: any, res: any) => {
      const result = await endpoints.configurationValidation();
      res.status(result.status === 'healthy' ? 200 : result.status === 'warning' ? 200 : 503)
         .json(result);
    },

    // Service connectivity
    connectivity: async (req: any, res: any) => {
      const result = await endpoints.serviceConnectivity();
      res.status(result.status === 'healthy' ? 200 : result.status === 'warning' ? 200 : 503)
         .json(result);
    },

    // Configuration readiness
    readiness: async (req: any, res: any) => {
      const result = await endpoints.configurationReadiness();
      res.status(result.status === 'healthy' ? 200 : result.status === 'warning' ? 200 : 503)
         .json(result);
    }
  };
}

/**
 * Standalone health check functions for use without Express
 */
export async function runConfigurationHealthCheck(configService: ConfigurationService) {
  const endpoints = new ConfigurationHealthEndpoints(configService);
  return await endpoints.detailedHealthCheck();
}

export async function runConfigurationDriftCheck(configService: ConfigurationService) {
  const endpoints = new ConfigurationHealthEndpoints(configService);
  await endpoints.initializeDriftDetection();
  return await endpoints.configurationDrift();
}