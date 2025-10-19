/**
 * Stripe Health Check System
 * Provides health monitoring and diagnostics for Stripe payment configuration
 */

import { getStripeStatus, validateStripeConfig, testStripeConnection } from '../stripe';
import { config } from './index';

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

export interface StripeHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: HealthCheckResult[];
  timestamp: string;
}

// =============================================================================
// STRIPE HEALTH CHECKS
// =============================================================================

/**
 * Check Stripe configuration health
 */
export async function checkStripeConfigHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const stripeStatus = getStripeStatus();
    const validation = validateStripeConfig();
    const responseTime = Date.now() - startTime;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    let message: string;
    
    if (!stripeStatus.enabled) {
      status = 'degraded';
      message = 'Stripe payments are disabled';
    } else if (!validation.isValid) {
      status = 'unhealthy';
      message = `Configuration errors: ${validation.errors.join(', ')}`;
    } else if (!stripeStatus.configured) {
      status = 'unhealthy';
      message = 'Stripe is not fully configured';
    } else {
      status = 'healthy';
      message = 'Stripe configuration is valid';
    }
    
    return {
      service: 'stripe-config',
      status,
      timestamp: new Date().toISOString(),
      responseTime,
      message,
      details: {
        enabled: stripeStatus.enabled,
        configured: stripeStatus.configured,
        publishableKey: stripeStatus.publishableKey,
        secretKey: stripeStatus.secretKey,
        webhookSecret: stripeStatus.webhookSecret,
        priceIds: stripeStatus.priceIds,
        errors: validation.errors,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      service: 'stripe-config',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: `Configuration check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check Stripe API connectivity
 */
export async function checkStripeConnectivity(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    if (!config.payments.stripe?.enabled) {
      return {
        service: 'stripe-connectivity',
        status: 'degraded',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        message: 'Stripe is disabled',
      };
    }

    if (!config.payments.stripe?.secretKey) {
      return {
        service: 'stripe-connectivity',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        message: 'Stripe secret key not configured',
      };
    }

    // Test Stripe API connection (server-side only)
    if (typeof window === 'undefined') {
      const connectionTest = await testStripeConnection();
      const responseTime = Date.now() - startTime;
      
      if (connectionTest.success) {
        return {
          service: 'stripe-connectivity',
          status: 'healthy',
          timestamp: new Date().toISOString(),
          responseTime,
          message: 'Stripe API is accessible',
        };
      } else {
        return {
          service: 'stripe-connectivity',
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          responseTime,
          message: `Stripe API connection failed: ${connectionTest.error}`,
        };
      }
    } else {
      // Client-side: just check if publishable key is available
      const responseTime = Date.now() - startTime;
      
      if (config.payments.stripe?.publishableKey) {
        return {
          service: 'stripe-connectivity',
          status: 'healthy',
          timestamp: new Date().toISOString(),
          responseTime,
          message: 'Stripe publishable key is configured',
          details: {
            note: 'Full connectivity test only available server-side',
          },
        };
      } else {
        return {
          service: 'stripe-connectivity',
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          responseTime,
          message: 'Stripe publishable key not configured',
        };
      }
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      service: 'stripe-connectivity',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: `Connectivity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check database connectivity for payment tables
 */
export async function checkPaymentDatabaseHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    // Import Supabase client
    const { supabase } = await import('../supabase');
    
    // Test connection by checking if payment tables exist
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('count', { count: 'exact', head: true });

    const responseTime = Date.now() - startTime;

    if (error) {
      return {
        service: 'payment-database',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        message: `Database check failed: ${error.message}`,
      };
    }

    // Also check other payment tables
    const tableChecks = await Promise.allSettled([
      supabase.from('payment_history').select('count', { count: 'exact', head: true }),
      supabase.from('usage_records').select('count', { count: 'exact', head: true }),
      supabase.from('subscription_plans').select('count', { count: 'exact', head: true }),
    ]);

    const failedChecks = tableChecks.filter(result => result.status === 'rejected');
    
    if (failedChecks.length > 0) {
      return {
        service: 'payment-database',
        status: 'degraded',
        timestamp: new Date().toISOString(),
        responseTime,
        message: `Some payment tables are not accessible (${failedChecks.length} failed)`,
        details: {
          tablesChecked: ['user_subscriptions', 'payment_history', 'usage_records', 'subscription_plans'],
          failedCount: failedChecks.length,
        },
      };
    }

    return {
      service: 'payment-database',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: 'Payment database tables are accessible',
      details: {
        tablesChecked: ['user_subscriptions', 'payment_history', 'usage_records', 'subscription_plans'],
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      service: 'payment-database',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: `Database connectivity failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check subscription plans configuration
 */
export async function checkSubscriptionPlansHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    // Import Supabase client
    const { supabase } = await import('../supabase');
    
    // Check if subscription plans are configured
    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('active', true);

    const responseTime = Date.now() - startTime;

    if (error) {
      return {
        service: 'subscription-plans',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        message: `Failed to load subscription plans: ${error.message}`,
      };
    }

    if (!plans || plans.length === 0) {
      return {
        service: 'subscription-plans',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        message: 'No active subscription plans configured',
      };
    }

    // Check if plans have valid Stripe price IDs
    const plansWithoutPriceIds = plans.filter(plan => !plan.stripe_price_id || plan.stripe_price_id.includes('placeholder'));
    
    if (plansWithoutPriceIds.length > 0) {
      return {
        service: 'subscription-plans',
        status: 'degraded',
        timestamp: new Date().toISOString(),
        responseTime,
        message: `${plansWithoutPriceIds.length} plans have placeholder Stripe price IDs`,
        details: {
          totalPlans: plans.length,
          plansWithPlaceholders: plansWithoutPriceIds.length,
          planIds: plansWithoutPriceIds.map(p => p.id),
        },
      };
    }

    return {
      service: 'subscription-plans',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: `${plans.length} active subscription plans configured`,
      details: {
        totalPlans: plans.length,
        planIds: plans.map(p => p.id),
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      service: 'subscription-plans',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime,
      message: `Subscription plans check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// =============================================================================
// COMPREHENSIVE HEALTH CHECK
// =============================================================================

/**
 * Run comprehensive Stripe system health check
 */
export async function runStripeSystemHealthCheck(): Promise<StripeHealthStatus> {
  // Run all health checks in parallel
  const [configHealth, connectivityHealth, databaseHealth, plansHealth] = await Promise.all([
    checkStripeConfigHealth(),
    checkStripeConnectivity(),
    checkPaymentDatabaseHealth(),
    checkSubscriptionPlansHealth(),
  ]);

  const services = [configHealth, connectivityHealth, databaseHealth, plansHealth];
  
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
export function formatStripeHealthCheckResults(health: StripeHealthStatus): string {
  const lines = [
    `💳 Stripe System Health Check - ${health.overall.toUpperCase()}`,
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
 * Check if Stripe system is ready for use
 */
export async function isStripeSystemReady(): Promise<boolean> {
  try {
    const health = await runStripeSystemHealthCheck();
    return health.overall !== 'unhealthy';
  } catch {
    return false;
  }
}

/**
 * Get Stripe system status summary
 */
export async function getStripeSystemStatus(): Promise<{
  ready: boolean;
  enabled: boolean;
  configured: boolean;
  message: string;
}> {
  const stripeStatus = getStripeStatus();
  
  if (!stripeStatus.enabled) {
    return {
      ready: false,
      enabled: false,
      configured: stripeStatus.configured,
      message: 'Stripe payments are disabled.',
    };
  }

  if (!stripeStatus.configured) {
    return {
      ready: false,
      enabled: true,
      configured: false,
      message: 'Stripe is enabled but not configured. Please set up environment variables.',
    };
  }

  try {
    const health = await runStripeSystemHealthCheck();
    
    switch (health.overall) {
      case 'healthy':
        return {
          ready: true,
          enabled: true,
          configured: true,
          message: 'Stripe system is ready and healthy.',
        };
        
      case 'degraded':
        return {
          ready: true,
          enabled: true,
          configured: true,
          message: 'Stripe system is ready but has some warnings.',
        };
        
      case 'unhealthy':
        return {
          ready: false,
          enabled: true,
          configured: true,
          message: 'Stripe system is configured but not healthy.',
        };
        
      default:
        return {
          ready: false,
          enabled: true,
          configured: true,
          message: 'Stripe system status is unknown.',
        };
    }
  } catch (error) {
    return {
      ready: false,
      enabled: true,
      configured: true,
      message: `Failed to check Stripe system status: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// =============================================================================
// MONITORING INTEGRATION
// =============================================================================

/**
 * Create health check endpoint data
 */
export async function createStripeHealthCheckEndpoint(): Promise<{
  status: number;
  body: any;
}> {
  try {
    const health = await runStripeSystemHealthCheck();
    
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

// =============================================================================
// STARTUP VALIDATION
// =============================================================================

/**
 * Validate Stripe configuration on startup
 */
export async function validateStripeOnStartup(): Promise<{
  success: boolean;
  warnings: string[];
  errors: string[];
}> {
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    const stripeStatus = getStripeStatus();
    const validation = validateStripeConfig();

    // Check if payments are enabled
    if (!stripeStatus.enabled) {
      warnings.push('Stripe payments are disabled');
    }

    // Check configuration
    if (stripeStatus.enabled && !stripeStatus.configured) {
      errors.push('Stripe is enabled but not properly configured');
    }

    // Add validation errors
    if (!validation.isValid) {
      errors.push(...validation.errors);
    }

    // Check database connectivity
    try {
      const dbHealth = await checkPaymentDatabaseHealth();
      if (dbHealth.status === 'unhealthy') {
        errors.push(`Payment database: ${dbHealth.message}`);
      } else if (dbHealth.status === 'degraded') {
        warnings.push(`Payment database: ${dbHealth.message}`);
      }
    } catch (error) {
      errors.push(`Payment database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check subscription plans
    try {
      const plansHealth = await checkSubscriptionPlansHealth();
      if (plansHealth.status === 'unhealthy') {
        errors.push(`Subscription plans: ${plansHealth.message}`);
      } else if (plansHealth.status === 'degraded') {
        warnings.push(`Subscription plans: ${plansHealth.message}`);
      }
    } catch (error) {
      warnings.push(`Subscription plans check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      success: errors.length === 0,
      warnings,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      warnings,
      errors: [`Stripe startup validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}