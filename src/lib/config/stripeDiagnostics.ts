/**
 * Stripe Configuration Diagnostics
 * Provides diagnostic tools and testing utilities for Stripe integration
 */

import { config } from './index';
import { getStripeStatus, validateStripeConfig, testStripeConnection } from '../stripe';
import { runStripeSystemHealthCheck, formatStripeHealthCheckResults } from './stripeHealthCheck';

// =============================================================================
// DIAGNOSTIC INTERFACES
// =============================================================================

export interface StripeDiagnosticResult {
  category: string;
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
    details?: any;
  }>;
}

export interface StripeSystemDiagnostics {
  timestamp: string;
  environment: string;
  overall: 'pass' | 'warn' | 'fail';
  categories: StripeDiagnosticResult[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failures: number;
  };
}

// =============================================================================
// CONFIGURATION DIAGNOSTICS
// =============================================================================

/**
 * Run configuration diagnostics
 */
export async function runConfigurationDiagnostics(): Promise<StripeDiagnosticResult> {
  const checks: StripeDiagnosticResult['checks'] = [];
  const stripeStatus = getStripeStatus();
  const validation = validateStripeConfig();

  // Check if Stripe is enabled
  checks.push({
    name: 'Stripe Enabled',
    status: stripeStatus.enabled ? 'pass' : 'warn',
    message: stripeStatus.enabled ? 'Stripe payments are enabled' : 'Stripe payments are disabled',
    details: { enabled: stripeStatus.enabled },
  });

  // Check publishable key
  checks.push({
    name: 'Publishable Key',
    status: stripeStatus.publishableKey ? 'pass' : 'fail',
    message: stripeStatus.publishableKey ? 'Publishable key is configured' : 'Publishable key is missing',
    details: { 
      configured: stripeStatus.publishableKey,
      keyPrefix: config.payments.stripe?.publishableKey?.substring(0, 12) + '...' || 'Not set',
    },
  });

  // Check secret key (server-side only)
  if (typeof window === 'undefined') {
    checks.push({
      name: 'Secret Key',
      status: stripeStatus.secretKey ? 'pass' : 'fail',
      message: stripeStatus.secretKey ? 'Secret key is configured' : 'Secret key is missing',
      details: { 
        configured: stripeStatus.secretKey,
        keyPrefix: config.payments.stripe?.secretKey?.substring(0, 12) + '...' || 'Not set',
      },
    });

    checks.push({
      name: 'Webhook Secret',
      status: stripeStatus.webhookSecret ? 'pass' : 'warn',
      message: stripeStatus.webhookSecret ? 'Webhook secret is configured' : 'Webhook secret is missing',
      details: { configured: stripeStatus.webhookSecret },
    });
  }

  // Check price IDs
  const priceIdChecks = [
    { name: 'Basic Monthly', key: 'basicMonthly' },
    { name: 'Basic Yearly', key: 'basicYearly' },
    { name: 'Pro Monthly', key: 'proMonthly' },
    { name: 'Pro Yearly', key: 'proYearly' },
    { name: 'API Calls', key: 'apiCalls' },
  ];

  priceIdChecks.forEach(({ name, key }) => {
    const configured = stripeStatus.priceIds[key as keyof typeof stripeStatus.priceIds];
    checks.push({
      name: `Price ID - ${name}`,
      status: configured ? 'pass' : 'warn',
      message: configured ? `${name} price ID is configured` : `${name} price ID is missing`,
      details: { configured },
    });
  });

  // Overall validation
  checks.push({
    name: 'Configuration Validation',
    status: validation.isValid ? 'pass' : 'fail',
    message: validation.isValid ? 'All configuration is valid' : `Configuration errors: ${validation.errors.join(', ')}`,
    details: { errors: validation.errors },
  });

  return {
    category: 'Configuration',
    checks,
  };
}

// =============================================================================
// CONNECTIVITY DIAGNOSTICS
// =============================================================================

/**
 * Run connectivity diagnostics
 */
export async function runConnectivityDiagnostics(): Promise<StripeDiagnosticResult> {
  const checks: StripeDiagnosticResult['checks'] = [];

  // Test Stripe API connection (server-side only)
  if (typeof window === 'undefined') {
    try {
      const connectionTest = await testStripeConnection();
      checks.push({
        name: 'Stripe API Connection',
        status: connectionTest.success ? 'pass' : 'fail',
        message: connectionTest.success ? 'Successfully connected to Stripe API' : `Connection failed: ${connectionTest.error}`,
        details: connectionTest,
      });
    } catch (error) {
      checks.push({
        name: 'Stripe API Connection',
        status: 'fail',
        message: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    // Test webhook endpoint reachability (if configured)
    if (config.payments.stripe?.webhookSecret) {
      checks.push({
        name: 'Webhook Configuration',
        status: 'pass',
        message: 'Webhook secret is configured (endpoint reachability not tested)',
        details: { note: 'Webhook endpoint testing requires external setup' },
      });
    } else {
      checks.push({
        name: 'Webhook Configuration',
        status: 'warn',
        message: 'Webhook secret not configured - webhooks will not work',
      });
    }
  } else {
    checks.push({
      name: 'Client-side Configuration',
      status: config.payments.stripe?.publishableKey ? 'pass' : 'fail',
      message: config.payments.stripe?.publishableKey ? 'Stripe.js can be initialized' : 'Publishable key missing for Stripe.js',
    });
  }

  return {
    category: 'Connectivity',
    checks,
  };
}

// =============================================================================
// DATABASE DIAGNOSTICS
// =============================================================================

/**
 * Run database diagnostics
 */
export async function runDatabaseDiagnostics(): Promise<StripeDiagnosticResult> {
  const checks: StripeDiagnosticResult['checks'] = [];

  try {
    // Import Supabase client
    const { supabase } = await import('../supabase');

    // Test each payment table
    const tables = [
      'user_subscriptions',
      'payment_history',
      'usage_records',
      'subscription_plans',
      'customer_portal_sessions',
    ];

    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('count', { count: 'exact', head: true });

        if (error) {
          checks.push({
            name: `Table: ${table}`,
            status: 'fail',
            message: `Table access failed: ${error.message}`,
            details: { error: error.message },
          });
        } else {
          checks.push({
            name: `Table: ${table}`,
            status: 'pass',
            message: `Table is accessible`,
            details: { count: data?.length || 0 },
          });
        }
      } catch (error) {
        checks.push({
          name: `Table: ${table}`,
          status: 'fail',
          message: `Table check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    // Test database functions
    const functions = [
      'get_user_active_subscription',
      'get_current_usage',
      'check_usage_limit',
      'record_usage',
    ];

    for (const func of functions) {
      try {
        // Test function existence by calling with null parameters (will fail but function exists)
        const { error } = await supabase.rpc(func, {});
        
        if (error && error.message.includes('function') && error.message.includes('does not exist')) {
          checks.push({
            name: `Function: ${func}`,
            status: 'fail',
            message: 'Function does not exist',
          });
        } else {
          checks.push({
            name: `Function: ${func}`,
            status: 'pass',
            message: 'Function exists and is callable',
          });
        }
      } catch (error) {
        checks.push({
          name: `Function: ${func}`,
          status: 'warn',
          message: `Function test inconclusive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

  } catch (error) {
    checks.push({
      name: 'Database Connection',
      status: 'fail',
      message: `Failed to connect to database: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  return {
    category: 'Database',
    checks,
  };
}

// =============================================================================
// SUBSCRIPTION PLANS DIAGNOSTICS
// =============================================================================

/**
 * Run subscription plans diagnostics
 */
export async function runSubscriptionPlansDiagnostics(): Promise<StripeDiagnosticResult> {
  const checks: StripeDiagnosticResult['checks'] = [];

  try {
    // Import Supabase client
    const { supabase } = await import('../supabase');

    // Check if subscription plans exist
    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('active', true);

    if (error) {
      checks.push({
        name: 'Load Subscription Plans',
        status: 'fail',
        message: `Failed to load plans: ${error.message}`,
      });
      return { category: 'Subscription Plans', checks };
    }

    if (!plans || plans.length === 0) {
      checks.push({
        name: 'Active Plans Count',
        status: 'fail',
        message: 'No active subscription plans found',
      });
      return { category: 'Subscription Plans', checks };
    }

    checks.push({
      name: 'Active Plans Count',
      status: 'pass',
      message: `Found ${plans.length} active subscription plans`,
      details: { count: plans.length },
    });

    // Check each plan
    plans.forEach((plan, index) => {
      const planChecks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message: string }> = [];

      // Check required fields
      if (!plan.stripe_price_id || plan.stripe_price_id.includes('placeholder')) {
        planChecks.push({
          name: 'Stripe Price ID',
          status: 'fail',
          message: 'Missing or placeholder Stripe price ID',
        });
      } else {
        planChecks.push({
          name: 'Stripe Price ID',
          status: 'pass',
          message: 'Valid Stripe price ID configured',
        });
      }

      if (plan.price < 0) {
        planChecks.push({
          name: 'Price Validation',
          status: 'fail',
          message: 'Invalid price (negative)',
        });
      } else {
        planChecks.push({
          name: 'Price Validation',
          status: 'pass',
          message: `Price: ${plan.price / 100} ${plan.currency.toUpperCase()}`,
        });
      }

      if (!plan.features || !Array.isArray(plan.features) || plan.features.length === 0) {
        planChecks.push({
          name: 'Features',
          status: 'warn',
          message: 'No features defined',
        });
      } else {
        planChecks.push({
          name: 'Features',
          status: 'pass',
          message: `${plan.features.length} features defined`,
        });
      }

      // Aggregate plan status
      const hasFailures = planChecks.some(check => check.status === 'fail');
      const hasWarnings = planChecks.some(check => check.status === 'warn');
      
      let overallStatus: 'pass' | 'warn' | 'fail';
      if (hasFailures) overallStatus = 'fail';
      else if (hasWarnings) overallStatus = 'warn';
      else overallStatus = 'pass';

      checks.push({
        name: `Plan: ${plan.name} (${plan.id})`,
        status: overallStatus,
        message: `Plan validation ${overallStatus === 'pass' ? 'passed' : overallStatus === 'warn' ? 'has warnings' : 'failed'}`,
        details: {
          id: plan.id,
          name: plan.name,
          price: plan.price,
          currency: plan.currency,
          interval: plan.interval,
          stripePriceId: plan.stripe_price_id,
          analysisLimit: plan.analysis_limit,
          checks: planChecks,
        },
      });
    });

  } catch (error) {
    checks.push({
      name: 'Subscription Plans Check',
      status: 'fail',
      message: `Diagnostics failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  return {
    category: 'Subscription Plans',
    checks,
  };
}

// =============================================================================
// COMPREHENSIVE DIAGNOSTICS
// =============================================================================

/**
 * Run comprehensive Stripe system diagnostics
 */
export async function runStripeSystemDiagnostics(): Promise<StripeSystemDiagnostics> {
  const timestamp = new Date().toISOString();
  const environment = config.app.environment;

  // Run all diagnostic categories
  const [configDiag, connectivityDiag, databaseDiag, plansDiag] = await Promise.all([
    runConfigurationDiagnostics(),
    runConnectivityDiagnostics(),
    runDatabaseDiagnostics(),
    runSubscriptionPlansDiagnostics(),
  ]);

  const categories = [configDiag, connectivityDiag, databaseDiag, plansDiag];

  // Calculate summary statistics
  let total = 0;
  let passed = 0;
  let warnings = 0;
  let failures = 0;

  categories.forEach(category => {
    category.checks.forEach(check => {
      total++;
      switch (check.status) {
        case 'pass': passed++; break;
        case 'warn': warnings++; break;
        case 'fail': failures++; break;
      }
    });
  });

  // Determine overall status
  let overall: 'pass' | 'warn' | 'fail';
  if (failures > 0) {
    overall = 'fail';
  } else if (warnings > 0) {
    overall = 'warn';
  } else {
    overall = 'pass';
  }

  return {
    timestamp,
    environment,
    overall,
    categories,
    summary: {
      total,
      passed,
      warnings,
      failures,
    },
  };
}

// =============================================================================
// DIAGNOSTIC UTILITIES
// =============================================================================

/**
 * Format diagnostics results for console output
 */
export function formatDiagnosticsResults(diagnostics: StripeSystemDiagnostics): string {
  const lines = [
    `🔍 Stripe System Diagnostics - ${diagnostics.overall.toUpperCase()}`,
    `Environment: ${diagnostics.environment}`,
    `Timestamp: ${diagnostics.timestamp}`,
    `Summary: ${diagnostics.summary.passed}/${diagnostics.summary.total} passed, ${diagnostics.summary.warnings} warnings, ${diagnostics.summary.failures} failures`,
    '',
  ];

  diagnostics.categories.forEach(category => {
    lines.push(`📋 ${category.category}`);
    
    category.checks.forEach(check => {
      const emoji = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
      lines.push(`  ${emoji} ${check.name}: ${check.message}`);
      
      if (check.details && typeof check.details === 'object') {
        Object.entries(check.details).forEach(([key, value]) => {
          if (key !== 'checks') { // Skip nested checks to avoid clutter
            lines.push(`     ${key}: ${JSON.stringify(value)}`);
          }
        });
      }
    });
    
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Generate diagnostic report for support
 */
export async function generateDiagnosticReport(): Promise<{
  report: string;
  healthCheck: string;
  timestamp: string;
}> {
  const timestamp = new Date().toISOString();
  
  // Run diagnostics and health check
  const [diagnostics, healthCheck] = await Promise.all([
    runStripeSystemDiagnostics(),
    runStripeSystemHealthCheck(),
  ]);

  const report = formatDiagnosticsResults(diagnostics);
  const healthCheckFormatted = formatStripeHealthCheckResults(healthCheck);

  return {
    report,
    healthCheck: healthCheckFormatted,
    timestamp,
  };
}

/**
 * Test Stripe integration end-to-end (development only)
 */
export async function testStripeIntegration(): Promise<{
  success: boolean;
  results: Array<{ test: string; success: boolean; message: string; duration: number }>;
}> {
  if (config.app.environment === 'production') {
    throw new Error('Integration testing is not allowed in production');
  }

  const results: Array<{ test: string; success: boolean; message: string; duration: number }> = [];

  // Test 1: Configuration validation
  const configStart = Date.now();
  try {
    const validation = validateStripeConfig();
    results.push({
      test: 'Configuration Validation',
      success: validation.isValid,
      message: validation.isValid ? 'Configuration is valid' : `Errors: ${validation.errors.join(', ')}`,
      duration: Date.now() - configStart,
    });
  } catch (error) {
    results.push({
      test: 'Configuration Validation',
      success: false,
      message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: Date.now() - configStart,
    });
  }

  // Test 2: Database connectivity
  const dbStart = Date.now();
  try {
    const dbHealth = await checkPaymentDatabaseHealth();
    results.push({
      test: 'Database Connectivity',
      success: dbHealth.status !== 'unhealthy',
      message: dbHealth.message,
      duration: Date.now() - dbStart,
    });
  } catch (error) {
    results.push({
      test: 'Database Connectivity',
      success: false,
      message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: Date.now() - dbStart,
    });
  }

  // Test 3: Stripe API connectivity (server-side only)
  if (typeof window === 'undefined') {
    const apiStart = Date.now();
    try {
      const apiTest = await testStripeConnection();
      results.push({
        test: 'Stripe API Connectivity',
        success: apiTest.success,
        message: apiTest.success ? 'API connection successful' : `API error: ${apiTest.error}`,
        duration: Date.now() - apiStart,
      });
    } catch (error) {
      results.push({
        test: 'Stripe API Connectivity',
        success: false,
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - apiStart,
      });
    }
  }

  const success = results.every(result => result.success);

  return { success, results };
}