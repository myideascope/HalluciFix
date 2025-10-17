/**
 * API Connectivity Validation System
 * Provides health checks and connectivity validation for all API providers
 */

import type { EnvironmentConfig } from './index';

// Connectivity check result types
export interface ConnectivityResult {
  provider: string;
  status: 'connected' | 'failed' | 'not_configured';
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
  timestamp: number;
}

export interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  results: ConnectivityResult[];
  summary: {
    total: number;
    connected: number;
    failed: number;
    notConfigured: number;
  };
  timestamp: number;
}

// Provider health check functions
export class ConnectivityValidator {
  private config: EnvironmentConfig;
  private timeout: number;

  constructor(config: EnvironmentConfig, timeout = 10000) {
    this.config = config;
    this.timeout = timeout;
  }

  // Main health check function
  async performHealthCheck(): Promise<HealthCheckResult> {
    const results: ConnectivityResult[] = [];

    // Check all providers in parallel
    const checks = [
      this.checkDatabase(),
      this.checkOpenAI(),
      this.checkAnthropic(),
      this.checkHalluciFix(),
      this.checkGoogleAuth(),
      this.checkGoogleDrive(),
      this.checkStripe(),
      this.checkSentry(),
      this.checkDatadog(),
    ];

    const checkResults = await Promise.allSettled(checks);
    
    checkResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          provider: 'unknown',
          status: 'failed',
          error: result.reason?.message || 'Unknown error',
          timestamp: Date.now(),
        });
      }
    });

    // Calculate summary
    const summary = {
      total: results.length,
      connected: results.filter(r => r.status === 'connected').length,
      failed: results.filter(r => r.status === 'failed').length,
      notConfigured: results.filter(r => r.status === 'not_configured').length,
    };

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (summary.failed === 0) {
      overall = 'healthy';
    } else if (summary.connected > summary.failed) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    return {
      overall,
      results,
      summary,
      timestamp: Date.now(),
    };
  }

  // Database connectivity check
  private async checkDatabase(): Promise<ConnectivityResult> {
    const startTime = Date.now();
    
    if (!this.config.database.url || !this.config.database.anonKey) {
      return {
        provider: 'supabase',
        status: 'not_configured',
        error: 'Database URL or anonymous key not configured',
        timestamp: Date.now(),
      };
    }

    try {
      // Import Supabase client dynamically to avoid issues in different environments
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(this.config.database.url, this.config.database.anonKey);

      // Simple connectivity test
      const { data, error } = await supabase
        .from('_health_check')
        .select('*')
        .limit(1)
        .maybeSingle();

      const responseTime = Date.now() - startTime;

      if (error && !error.message.includes('relation "_health_check" does not exist')) {
        throw error;
      }

      return {
        provider: 'supabase',
        status: 'connected',
        responseTime,
        details: {
          url: this.config.database.url,
          hasServiceKey: !!this.config.database.serviceKey,
          readReplicas: this.config.database.readReplicas?.length || 0,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        provider: 'supabase',
        status: 'failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown database error',
        timestamp: Date.now(),
      };
    }
  }

  // OpenAI connectivity check
  private async checkOpenAI(): Promise<ConnectivityResult> {
    const startTime = Date.now();

    if (!this.config.ai.openai.enabled || !this.config.ai.openai.apiKey) {
      return {
        provider: 'openai',
        status: 'not_configured',
        error: 'OpenAI API key not configured',
        timestamp: Date.now(),
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.ai.openai.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        provider: 'openai',
        status: 'connected',
        responseTime,
        details: {
          modelsAvailable: data.data?.length || 0,
          configuredModel: this.config.ai.openai.model,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        provider: 'openai',
        status: 'failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown OpenAI error',
        timestamp: Date.now(),
      };
    }
  }

  // Anthropic connectivity check
  private async checkAnthropic(): Promise<ConnectivityResult> {
    const startTime = Date.now();

    if (!this.config.ai.anthropic.enabled || !this.config.ai.anthropic.apiKey) {
      return {
        provider: 'anthropic',
        status: 'not_configured',
        error: 'Anthropic API key not configured',
        timestamp: Date.now(),
      };
    }

    try {
      // Anthropic doesn't have a simple health check endpoint, so we'll do a minimal request
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.config.ai.anthropic.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.ai.anthropic.model || 'claude-3-sonnet-20240229',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      const responseTime = Date.now() - startTime;

      if (response.status === 401) {
        throw new Error('Invalid API key');
      }

      if (response.status === 429) {
        // Rate limited but API key is valid
        return {
          provider: 'anthropic',
          status: 'connected',
          responseTime,
          details: {
            configuredModel: this.config.ai.anthropic.model,
            note: 'Rate limited but API key is valid',
          },
          timestamp: Date.now(),
        };
      }

      if (!response.ok && response.status !== 400) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        provider: 'anthropic',
        status: 'connected',
        responseTime,
        details: {
          configuredModel: this.config.ai.anthropic.model,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        provider: 'anthropic',
        status: 'failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown Anthropic error',
        timestamp: Date.now(),
      };
    }
  }

  // HalluciFix API connectivity check
  private async checkHalluciFix(): Promise<ConnectivityResult> {
    const startTime = Date.now();

    if (!this.config.ai.hallucifix?.enabled || !this.config.ai.hallucifix.apiKey) {
      return {
        provider: 'hallucifix',
        status: 'not_configured',
        error: 'HalluciFix API key not configured',
        timestamp: Date.now(),
      };
    }

    try {
      const apiUrl = this.config.ai.hallucifix.apiUrl || 'https://api.hallucifix.com';
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.ai.hallucifix.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        provider: 'hallucifix',
        status: 'connected',
        responseTime,
        details: {
          apiUrl,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        provider: 'hallucifix',
        status: 'failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown HalluciFix error',
        timestamp: Date.now(),
      };
    }
  }

  // Google OAuth connectivity check
  private async checkGoogleAuth(): Promise<ConnectivityResult> {
    const startTime = Date.now();

    if (!this.config.auth.google.enabled || !this.config.auth.google.clientId) {
      return {
        provider: 'google-auth',
        status: 'not_configured',
        error: 'Google OAuth client ID not configured',
        timestamp: Date.now(),
      };
    }

    try {
      // Check Google OAuth discovery document
      const response = await fetch('https://accounts.google.com/.well-known/openid_configuration', {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        provider: 'google-auth',
        status: 'connected',
        responseTime,
        details: {
          clientId: this.config.auth.google.clientId,
          hasClientSecret: !!this.config.auth.google.clientSecret,
          scopes: this.config.auth.google.scopes?.length || 0,
          authorizationEndpoint: data.authorization_endpoint,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        provider: 'google-auth',
        status: 'failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown Google Auth error',
        timestamp: Date.now(),
      };
    }
  }

  // Google Drive API connectivity check
  private async checkGoogleDrive(): Promise<ConnectivityResult> {
    const startTime = Date.now();

    if (!this.config.auth.google.enabled || !this.config.auth.google.clientId) {
      return {
        provider: 'google-drive',
        status: 'not_configured',
        error: 'Google OAuth not configured',
        timestamp: Date.now(),
      };
    }

    try {
      // Check Google Drive API discovery document
      const response = await fetch('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest', {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        provider: 'google-drive',
        status: 'connected',
        responseTime,
        details: {
          apiVersion: 'v3',
          requiresAuth: true,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        provider: 'google-drive',
        status: 'failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown Google Drive error',
        timestamp: Date.now(),
      };
    }
  }

  // Stripe connectivity check
  private async checkStripe(): Promise<ConnectivityResult> {
    const startTime = Date.now();

    if (!this.config.payments.stripe?.enabled || !this.config.payments.stripe.secretKey) {
      return {
        provider: 'stripe',
        status: 'not_configured',
        error: 'Stripe secret key not configured',
        timestamp: Date.now(),
      };
    }

    try {
      const response = await fetch('https://api.stripe.com/v1/account', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.payments.stripe.secretKey}`,
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        provider: 'stripe',
        status: 'connected',
        responseTime,
        details: {
          accountId: data.id,
          country: data.country,
          hasPublishableKey: !!this.config.payments.stripe.publishableKey,
          hasWebhookSecret: !!this.config.payments.stripe.webhookSecret,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        provider: 'stripe',
        status: 'failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown Stripe error',
        timestamp: Date.now(),
      };
    }
  }

  // Sentry connectivity check
  private async checkSentry(): Promise<ConnectivityResult> {
    const startTime = Date.now();

    if (!this.config.monitoring.sentry?.enabled || !this.config.monitoring.sentry.dsn) {
      return {
        provider: 'sentry',
        status: 'not_configured',
        error: 'Sentry DSN not configured',
        timestamp: Date.now(),
      };
    }

    try {
      // Parse DSN to get the API endpoint
      const dsn = new URL(this.config.monitoring.sentry.dsn);
      const projectId = dsn.pathname.substring(1);
      const apiUrl = `https://${dsn.hostname}/api/0/projects/${projectId}/`;

      const response = await fetch(apiUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.timeout),
      });

      const responseTime = Date.now() - startTime;

      return {
        provider: 'sentry',
        status: 'connected',
        responseTime,
        details: {
          projectId,
          environment: this.config.monitoring.sentry.environment,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        provider: 'sentry',
        status: 'failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown Sentry error',
        timestamp: Date.now(),
      };
    }
  }

  // Datadog connectivity check
  private async checkDatadog(): Promise<ConnectivityResult> {
    const startTime = Date.now();

    if (!this.config.monitoring.datadog?.enabled || !this.config.monitoring.datadog.apiKey) {
      return {
        provider: 'datadog',
        status: 'not_configured',
        error: 'Datadog API key not configured',
        timestamp: Date.now(),
      };
    }

    try {
      const site = this.config.monitoring.datadog.site || 'datadoghq.com';
      const response = await fetch(`https://api.${site}/api/v1/validate`, {
        method: 'GET',
        headers: {
          'DD-API-KEY': this.config.monitoring.datadog.apiKey,
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        provider: 'datadog',
        status: 'connected',
        responseTime,
        details: {
          site,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        provider: 'datadog',
        status: 'failed',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown Datadog error',
        timestamp: Date.now(),
      };
    }
  }

  // Check specific provider
  async checkProvider(provider: string): Promise<ConnectivityResult> {
    const methods: Record<string, () => Promise<ConnectivityResult>> = {
      supabase: () => this.checkDatabase(),
      openai: () => this.checkOpenAI(),
      anthropic: () => this.checkAnthropic(),
      hallucifix: () => this.checkHalluciFix(),
      'google-auth': () => this.checkGoogleAuth(),
      'google-drive': () => this.checkGoogleDrive(),
      stripe: () => this.checkStripe(),
      sentry: () => this.checkSentry(),
      datadog: () => this.checkDatadog(),
    };

    const method = methods[provider];
    if (!method) {
      return {
        provider,
        status: 'failed',
        error: `Unknown provider: ${provider}`,
        timestamp: Date.now(),
      };
    }

    return method();
  }
}

// Startup health check function
export async function performStartupHealthCheck(config: EnvironmentConfig): Promise<HealthCheckResult> {
  const validator = new ConnectivityValidator(config);
  return validator.performHealthCheck();
}

// Provider availability testing
export async function testProviderAvailability(
  config: EnvironmentConfig,
  providers: string[]
): Promise<ConnectivityResult[]> {
  const validator = new ConnectivityValidator(config);
  const results = await Promise.allSettled(
    providers.map(provider => validator.checkProvider(provider))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        provider: providers[index],
        status: 'failed',
        error: result.reason?.message || 'Unknown error',
        timestamp: Date.now(),
      };
    }
  });
}

// Configuration validation before service initialization
export async function validateConfigurationBeforeInit(config: EnvironmentConfig): Promise<{
  canInitialize: boolean;
  criticalIssues: string[];
  warnings: string[];
  healthCheck: HealthCheckResult;
}> {
  const criticalIssues: string[] = [];
  const warnings: string[] = [];

  // Check critical configuration
  if (!config.database.url || !config.database.anonKey) {
    criticalIssues.push('Database configuration is incomplete');
  }

  if (config.app.environment === 'production') {
    if (!config.security.jwt.secret) {
      criticalIssues.push('JWT secret is required in production');
    }
    if (!config.security.oauth.tokenEncryptionKey) {
      criticalIssues.push('OAuth encryption key is required in production');
    }
    if (config.features.enableMockServices) {
      criticalIssues.push('Mock services should not be enabled in production');
    }
  }

  // Perform health check
  const healthCheck = await performStartupHealthCheck(config);

  // Check for critical service failures
  const criticalServices = ['supabase'];
  const failedCriticalServices = healthCheck.results
    .filter(r => criticalServices.includes(r.provider) && r.status === 'failed')
    .map(r => r.provider);

  if (failedCriticalServices.length > 0) {
    criticalIssues.push(`Critical services are unavailable: ${failedCriticalServices.join(', ')}`);
  }

  // Check for warnings
  if (healthCheck.summary.failed > 0) {
    warnings.push(`${healthCheck.summary.failed} services are currently unavailable`);
  }

  return {
    canInitialize: criticalIssues.length === 0,
    criticalIssues,
    warnings,
    healthCheck,
  };
}

// Export types and utilities
export type {
  ConnectivityResult,
  HealthCheckResult,
};