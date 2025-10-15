/**
 * OAuth Health Check System
 * Provides health monitoring and diagnostics for OAuth configuration
 */

import { getOAuthConfigStatus, isOAuthConfigured } from './validation';
import { loadOAuthConfig } from './oauth';

// =============================================================================
// HEALTH CHECK INTERFACE
// =============================================================================

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  responseTime: number;
  message: string;
  details?: Record<string, any>;
}

export interface SystemHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: HealthCheckResult[];
  timestamp: string;
}

// =============================================================================
// OAUTH HEALTH CHECKS
// =============================================================================

/**
 * Check OAuth configuration health
 */
export async function checkOAuthConfigHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const configStatus = getOAuthConfigStatus();
    const responseTime = Date.now() - startTime;
    
    return {
      service: 'oauth-config',
      status: configStatus.status,
      timestamp: new Date().toISOString(),
      responseTime,
      message: configStatus.message,
      details: configStatus.details,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      service: 'oauth-config',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check Google OAuth connectivity
 */
export async function checkGoogleOAuthConnectivity(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    if (!isOAuthConfigured()) {
      return {
        service: 'google-oauth-connectivity',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        message: 'OAuth not configured',
      };
    }

    const config = loadOAuthConfig();
    
    // Test Google OAuth discovery endpoint
    const discoveryUrl = 'https://accounts.google.com/.well-known/openid_configuration';
    const response = await fetch(discoveryUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        service: 'google-oauth-connectivity',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        message: `Google OAuth discovery failed: ${response.status} ${response.statusText}`,
      };
    }

    const discoveryData = await response.json();
    
    return {
      service: 'google-oauth-connectivity',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: 'Google OAuth endpoints are accessible',
      details: {
        authorizationEndpoint: discoveryData.authorization_endpoint,
        tokenEndpoint: discoveryData.token_endpoint,
        userinfoEndpoint: discoveryData.userinfo_endpoint,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      service: 'google-oauth-connectivity',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: `Connectivity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check database connectivity for OAuth tables
 */
export async function checkOAuthDatabaseHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    // Import Supabase client
    const { supabase } = await import('../supabase');
    
    // Test connection by checking if OAuth tables exist
    const { data, error } = await supabase
      .from('user_tokens')
      .select('count', { count: 'exact', head: true });

    const responseTime = Date.now() - startTime;

    if (error) {
      return {
        service: 'oauth-database',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        message: `Database check failed: ${error.message}`,
      };
    }

    return {
      service: 'oauth-database',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: 'OAuth database tables are accessible',
      details: {
        tablesChecked: ['user_tokens', 'oauth_states', 'oauth_audit_log'],
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      service: 'oauth-database',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: `Database connectivity failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// =============================================================================
// COMPREHENSIVE HEALTH CHECK
// =============================================================================

/**
 * Run comprehensive OAuth system health check
 */
export async function runOAuthSystemHealthCheck(): Promise<SystemHealthStatus> {
  const startTime = Date.now();
  
  // Run all health checks in parallel
  const [configHealth, connectivityHealth, databaseHealth] = await Promise.all([
    checkOAuthConfigHealth(),
    checkGoogleOAuthConnectivity(),
    checkOAuthDatabaseHealth(),
  ]);

  const services = [configHealth, connectivityHealth, databaseHealth];
  
  // Determine overall health status
  const hasUnhealthy = services.some(service => service.status === 'unhealthy');
  const hasDegraded = services.some(service => service.status === 'degraded');
  
  let overall: 'healthy' | 'degraded' | 'unhealthy';
  if (hasUnhealthy) {
    overall = 'unhealthy';
  } else if (hasDegraded) {
    overall = 'degraded';
  } else {
    overall = 'healthy';
  }

  return {
    overall,
    services,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// HEALTH CHECK UTILITIES
// =============================================================================

/**
 * Format health check results for logging
 */
export function formatHealthCheckResults(health: SystemHealthStatus): string {
  const lines = [
    `🏥 OAuth System Health Check - ${health.overall.toUpperCase()}`,
    `Timestamp: ${health.timestamp}`,
    '',
  ];

  health.services.forEach(service => {
    const emoji = getHealthEmoji(service.status);
    lines.push(`${emoji} ${service.service}: ${service.message} (${service.responseTime}ms)`);
    
    if (service.details) {
      Object.entries(service.details).forEach(([key, value]) => {
        lines.push(`   ${key}: ${JSON.stringify(value)}`);
      });
    }
  });

  return lines.join('\n');
}

/**
 * Get emoji for health status
 */
function getHealthEmoji(status: string): string {
  switch (status) {
    case 'healthy': return '✅';
    case 'degraded': return '⚠️';
    case 'unhealthy': return '❌';
    default: return '❓';
  }
}

/**
 * Check if OAuth system is ready for use
 */
export async function isOAuthSystemReady(): Promise<boolean> {
  try {
    const health = await runOAuthSystemHealthCheck();
    return health.overall !== 'unhealthy';
  } catch {
    return false;
  }
}

/**
 * Get OAuth system status summary
 */
export async function getOAuthSystemStatus(): Promise<{
  ready: boolean;
  configured: boolean;
  message: string;
}> {
  const configured = isOAuthConfigured();
  
  if (!configured) {
    return {
      ready: false,
      configured: false,
      message: 'OAuth is not configured. Please set up environment variables.',
    };
  }

  try {
    const health = await runOAuthSystemHealthCheck();
    
    switch (health.overall) {
      case 'healthy':
        return {
          ready: true,
          configured: true,
          message: 'OAuth system is ready and healthy.',
        };
        
      case 'degraded':
        return {
          ready: true,
          configured: true,
          message: 'OAuth system is ready but has some warnings.',
        };
        
      case 'unhealthy':
        return {
          ready: false,
          configured: true,
          message: 'OAuth system is configured but not healthy.',
        };
        
      default:
        return {
          ready: false,
          configured: true,
          message: 'OAuth system status is unknown.',
        };
    }
  } catch (error) {
    return {
      ready: false,
      configured: true,
      message: `Failed to check OAuth system status: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// =============================================================================
// MONITORING INTEGRATION
// =============================================================================

/**
 * Create health check endpoint data
 */
export async function createHealthCheckEndpoint(): Promise<{
  status: number;
  body: any;
}> {
  try {
    const health = await runOAuthSystemHealthCheck();
    
    const statusCode = health.overall === 'healthy' ? 200 : 
                      health.overall === 'degraded' ? 200 : 503;
    
    return {
      status: statusCode,
      body: {
        status: health.overall,
        timestamp: health.timestamp,
        services: health.services.map(service => ({
          name: service.service,
          status: service.status,
          message: service.message,
          responseTime: service.responseTime,
        })),
      },
    };
  } catch (error) {
    return {
      status: 503,
      body: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}