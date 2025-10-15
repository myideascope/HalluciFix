/**
 * OAuth Health Check Service
 * Provides real-time health monitoring and connectivity checks for OAuth services
 */

import { oauthConfig } from './oauthConfig';
import { OAuthDiagnostics } from './oauthDiagnostics';
import { config } from '../env';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
  timestamp: string;
  checks: {
    configuration: HealthCheck;
    service: HealthCheck;
    connectivity?: HealthCheck;
  };
  summary: string;
  uptime?: number;
}

export interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: any;
  responseTime?: number;
}

export class OAuthHealthChecker {
  private static startTime = Date.now();

  /**
   * Perform comprehensive health check
   */
  static async performHealthCheck(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const uptime = Date.now() - this.startTime;

    // If mock services are enabled, OAuth is unavailable
    if (config.enableMockServices) {
      return {
        status: 'unavailable',
        timestamp,
        checks: {
          configuration: {
            status: 'warn',
            message: 'Mock services enabled - OAuth unavailable'
          },
          service: {
            status: 'warn',
            message: 'OAuth service not initialized (mock mode)'
          }
        },
        summary: 'OAuth is unavailable because mock services are enabled',
        uptime
      };
    }

    const checks = {
      configuration: await this.checkConfiguration(),
      service: await this.checkService(),
      connectivity: await this.checkConnectivity()
    };

    const status = this.determineOverallStatus(checks);
    const summary = this.generateSummary(status, checks);

    return {
      status,
      timestamp,
      checks,
      summary,
      uptime
    };
  }

  /**
   * Quick health status check
   */
  static async getQuickStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';
    message: string;
  }> {
    try {
      if (config.enableMockServices) {
        return {
          status: 'unavailable',
          message: 'OAuth unavailable (mock services enabled)'
        };
      }

      const availability = oauthConfig.getAvailabilityStatus();
      if (!availability.available) {
        return {
          status: 'unhealthy',
          message: availability.reason || 'OAuth not available'
        };
      }

      return {
        status: 'healthy',
        message: 'OAuth is operational'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }

  /**
   * Check OAuth configuration health
   */
  private static async checkConfiguration(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const availability = oauthConfig.getAvailabilityStatus();
      const responseTime = Date.now() - startTime;

      if (!availability.available) {
        return {
          status: 'fail',
          message: 'OAuth configuration is incomplete',
          details: { reason: availability.reason },
          responseTime
        };
      }

      const configSummary = oauthConfig.getConfigSummary();
      if (!configSummary.valid) {
        return {
          status: 'fail',
          message: 'OAuth configuration has errors',
          details: { errors: configSummary.errors },
          responseTime
        };
      }

      return {
        status: 'pass',
        message: 'OAuth configuration is valid',
        details: {
          clientId: configSummary.google?.clientId,
          scopes: configSummary.google?.scopes?.length
        },
        responseTime
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Configuration check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check OAuth service health
   */
  private static async checkService(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Try to initialize OAuth service
      const config = oauthConfig.getConfig();
      const responseTime = Date.now() - startTime;

      // Basic service validation
      if (!config.google.clientId || !config.google.clientSecret) {
        return {
          status: 'fail',
          message: 'OAuth service cannot initialize - missing credentials',
          responseTime
        };
      }

      return {
        status: 'pass',
        message: 'OAuth service is ready',
        details: {
          autoStart: config.autoStartServices,
          refreshInterval: config.refreshConfig?.checkIntervalMs,
          cleanupInterval: config.cleanupConfig?.cleanupIntervalMs
        },
        responseTime
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'OAuth service initialization failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check external connectivity (basic)
   */
  private static async checkConnectivity(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // In a browser environment, we can't directly test connectivity to Google
      // This is a placeholder for server-side connectivity checks
      
      // Check if we can access the current domain (basic connectivity test)
      const response = await fetch(window.location.origin + '/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache'
      }).catch(() => null);

      const responseTime = Date.now() - startTime;

      if (response && response.ok) {
        return {
          status: 'pass',
          message: 'Basic connectivity is working',
          details: { 
            note: 'Full Google OAuth connectivity requires server-side testing',
            localConnectivity: true
          },
          responseTime
        };
      } else {
        return {
          status: 'warn',
          message: 'Connectivity test inconclusive',
          details: { 
            note: 'Could not verify basic connectivity',
            recommendation: 'Check network connection'
          },
          responseTime
        };
      }
    } catch (error) {
      return {
        status: 'warn',
        message: 'Connectivity check failed',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          note: 'This may not affect OAuth functionality'
        },
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Determine overall health status
   */
  private static determineOverallStatus(checks: HealthCheckResult['checks']): HealthCheckResult['status'] {
    const { configuration, service, connectivity } = checks;

    // If configuration or service fails, system is unhealthy
    if (configuration.status === 'fail' || service.status === 'fail') {
      return 'unhealthy';
    }

    // If there are warnings or connectivity issues, system is degraded
    if (configuration.status === 'warn' || service.status === 'warn' || connectivity?.status === 'warn') {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Generate summary message
   */
  private static generateSummary(status: HealthCheckResult['status'], checks: HealthCheckResult['checks']): string {
    switch (status) {
      case 'healthy':
        return 'All OAuth systems are operational';
      case 'degraded':
        return 'OAuth is operational but has some issues that should be addressed';
      case 'unhealthy':
        return 'OAuth has critical issues that prevent normal operation';
      case 'unavailable':
        return 'OAuth is not available in current configuration';
      default:
        return 'OAuth health status is unknown';
    }
  }

  /**
   * Start periodic health monitoring
   */
  static startHealthMonitoring(intervalMs: number = 300000): () => void {
    const interval = setInterval(async () => {
      try {
        const health = await this.performHealthCheck();
        
        if (health.status === 'unhealthy') {
          console.error('🚨 OAuth Health Alert:', health.summary);
        } else if (health.status === 'degraded') {
          console.warn('⚠️ OAuth Health Warning:', health.summary);
        }
      } catch (error) {
        console.error('Health monitoring error:', error);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }

  /**
   * Get health metrics for monitoring systems
   */
  static async getHealthMetrics(): Promise<{
    oauth_available: boolean;
    oauth_configured: boolean;
    oauth_service_ready: boolean;
    oauth_response_time_ms: number;
    oauth_uptime_ms: number;
  }> {
    const health = await this.performHealthCheck();
    
    return {
      oauth_available: health.status !== 'unavailable',
      oauth_configured: health.checks.configuration.status === 'pass',
      oauth_service_ready: health.checks.service.status === 'pass',
      oauth_response_time_ms: Math.max(
        health.checks.configuration.responseTime || 0,
        health.checks.service.responseTime || 0,
        health.checks.connectivity?.responseTime || 0
      ),
      oauth_uptime_ms: health.uptime || 0
    };
  }
}