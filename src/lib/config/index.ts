/**
 * Configuration Management System
 * Provides environment-specific configuration with validation and hot-reload support
 */

import { env, config as envConfig } from '../env';

import { logger } from '../logging';
// Re-export environment configuration for backward compatibility
export { env, config as envConfig } from '../env';

// Configuration interfaces
export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  apiUrl?: string;
  enabled: boolean;
}

export interface AuthProviderConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
  enabled: boolean;
}

export interface DatabaseConfig {
  url: string;
  anonKey: string;
  serviceKey?: string;
  connectionPoolSize?: number;
  queryTimeout?: number;
  enableReadReplicas?: boolean;
  readReplicas?: Array<{
    url: string;
    key: string;
  }>;
}

export interface MonitoringConfig {
  sentry?: {
    dsn?: string;
    environment?: string;
    tracesSampleRate?: number;
    enabled: boolean;
  };
  datadog?: {
    apiKey?: string;
    site?: string;
    enabled: boolean;
  };
  analytics?: {
    googleAnalyticsId?: string;
    mixpanelToken?: string;
    enabled: boolean;
  };
}

export interface PaymentConfig {
  stripe?: {
    publishableKey?: string;
    secretKey?: string;
    webhookSecret?: string;
    priceIds?: {
      basicMonthly?: string;
      basicYearly?: string;
      proMonthly?: string;
      proYearly?: string;
      apiCalls?: string;
    };
    enabled: boolean;
  };
}

export interface FeatureFlags {
  enableAnalytics: boolean;
  enablePayments: boolean;
  enableBetaFeatures: boolean;
  enableMockServices: boolean;
  enableReadReplicas: boolean;
  enableLogAggregation: boolean;
}

export interface SecurityConfig {
  oauth: {
    tokenEncryptionKey?: string;
    stateSecret?: string;
    sessionSecret?: string;
    refreshCheckIntervalMs: number;
    refreshBufferMs: number;
    cleanupIntervalMs: number;
    tokenGracePeriodMs: number;
  };
  jwt: {
    secret?: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
  };
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'pretty';
  destination: 'console' | 'external' | 'both';
  retentionDays: number;
  maxSizeMB: number;
  enableAggregation: boolean;
}

export interface EnvironmentConfig {
  app: {
    name: string;
    version: string;
    url: string;
    environment: 'development' | 'staging' | 'production';
  };
  ai: {
    openai: AIProviderConfig;
    anthropic: AIProviderConfig;
    hallucifix?: AIProviderConfig;
    primaryProvider: string;
    fallbackChain: string[];
  };
  auth: {
    google: AuthProviderConfig;
    providers: string[];
  };
  database: DatabaseConfig;
  monitoring: MonitoringConfig;
  payments: PaymentConfig;
  features: FeatureFlags;
  security: SecurityConfig;
  logging: LoggingConfig;
}

// Configuration change event types
export interface ConfigurationChangeEvent {
  type: 'config-changed' | 'config-reloaded' | 'config-error';
  changes?: Partial<EnvironmentConfig>;
  error?: Error;
  timestamp: number;
}

// Create configuration from environment variables
function createConfiguration(): EnvironmentConfig {
  return {
    app: {
      name: env.VITE_APP_NAME,
      version: env.VITE_APP_VERSION,
      url: env.VITE_APP_URL,
      environment: env.NODE_ENV,
    },
    ai: {
      openai: {
        apiKey: env.VITE_OPENAI_API_KEY,
        model: env.VITE_OPENAI_MODEL,
        maxTokens: parseInt(env.VITE_OPENAI_MAX_TOKENS),
        temperature: parseFloat(env.VITE_OPENAI_TEMPERATURE),
        enabled: !!env.VITE_OPENAI_API_KEY,
      },
      anthropic: {
        apiKey: env.VITE_ANTHROPIC_API_KEY,
        model: env.VITE_ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
        maxTokens: parseInt(env.VITE_ANTHROPIC_MAX_TOKENS || '4000'),
        enabled: !!env.VITE_ANTHROPIC_API_KEY,
      },
      hallucifix: env.VITE_HALLUCIFIX_API_KEY ? {
        apiKey: env.VITE_HALLUCIFIX_API_KEY,
        apiUrl: env.VITE_HALLUCIFIX_API_URL,
        enabled: true,
      } : undefined,
      primaryProvider: env.VITE_PRIMARY_AI_PROVIDER || 'openai',
      fallbackChain: (env.VITE_AI_FALLBACK_CHAIN || 'anthropic,hallucifix').split(',').filter(Boolean),
    },
    auth: {
      google: {
        clientId: env.VITE_GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.VITE_GOOGLE_REDIRECT_URI,
        scopes: env.GOOGLE_OAUTH_SCOPES?.split(' ').filter(Boolean) || [],
        enabled: !!env.VITE_GOOGLE_CLIENT_ID,
      },
      providers: ['google'], // Can be extended for other providers
    },
    database: {
      url: env.VITE_SUPABASE_URL,
      anonKey: env.VITE_SUPABASE_ANON_KEY,
      serviceKey: env.SUPABASE_SERVICE_KEY,
      connectionPoolSize: parseInt(env.DB_CONNECTION_POOL_SIZE || '10'),
      queryTimeout: parseInt(env.DB_QUERY_TIMEOUT || '30000'),
      enableReadReplicas: env.VITE_ENABLE_READ_REPLICAS,
      readReplicas: [
        env.VITE_SUPABASE_READ_REPLICA_1_URL && env.VITE_SUPABASE_READ_REPLICA_1_KEY ? {
          url: env.VITE_SUPABASE_READ_REPLICA_1_URL,
          key: env.VITE_SUPABASE_READ_REPLICA_1_KEY,
        } : null,
        env.VITE_SUPABASE_READ_REPLICA_2_URL && env.VITE_SUPABASE_READ_REPLICA_2_KEY ? {
          url: env.VITE_SUPABASE_READ_REPLICA_2_URL,
          key: env.VITE_SUPABASE_READ_REPLICA_2_KEY,
        } : null,
      ].filter(Boolean) as Array<{ url: string; key: string }>,
    },
    monitoring: {
      sentry: {
        dsn: env.VITE_SENTRY_DSN,
        environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
        tracesSampleRate: parseFloat(env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
        enabled: !!env.VITE_SENTRY_DSN,
      },
      datadog: {
        apiKey: env.DATADOG_API_KEY,
        site: env.DATADOG_SITE,
        enabled: !!env.DATADOG_API_KEY,
      },
      analytics: {
        googleAnalyticsId: env.VITE_GOOGLE_ANALYTICS_ID,
        mixpanelToken: env.VITE_MIXPANEL_TOKEN,
        enabled: env.VITE_ENABLE_ANALYTICS,
      },
    },
    payments: {
      stripe: {
        publishableKey: env.VITE_STRIPE_PUBLISHABLE_KEY,
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        priceIds: {
          basicMonthly: env.STRIPE_PRICE_ID_BASIC_MONTHLY,
          basicYearly: env.STRIPE_PRICE_ID_BASIC_YEARLY,
          proMonthly: env.STRIPE_PRICE_ID_PRO_MONTHLY,
          proYearly: env.STRIPE_PRICE_ID_PRO_YEARLY,
          apiCalls: env.STRIPE_PRICE_ID_API_CALLS,
        },
        enabled: env.VITE_ENABLE_PAYMENTS && !!env.VITE_STRIPE_PUBLISHABLE_KEY,
      },
    },
    features: {
      enableAnalytics: env.VITE_ENABLE_ANALYTICS,
      enablePayments: env.VITE_ENABLE_PAYMENTS,
      enableBetaFeatures: env.VITE_ENABLE_BETA_FEATURES,
      enableMockServices: env.VITE_ENABLE_MOCK_SERVICES,
      enableReadReplicas: env.VITE_ENABLE_READ_REPLICAS,
      enableLogAggregation: env.ENABLE_LOG_AGGREGATION,
    },
    security: {
      oauth: {
        tokenEncryptionKey: env.OAUTH_TOKEN_ENCRYPTION_KEY,
        stateSecret: env.OAUTH_STATE_SECRET,
        sessionSecret: env.OAUTH_SESSION_SECRET,
        refreshCheckIntervalMs: env.OAUTH_REFRESH_CHECK_INTERVAL_MS,
        refreshBufferMs: env.OAUTH_REFRESH_BUFFER_MS,
        cleanupIntervalMs: env.OAUTH_CLEANUP_INTERVAL_MS,
        tokenGracePeriodMs: env.OAUTH_TOKEN_GRACE_PERIOD_MS,
      },
      jwt: {
        secret: env.JWT_SECRET,
        expiresIn: env.JWT_EXPIRES_IN,
        refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
      },
      rateLimiting: {
        windowMs: parseInt(env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
        maxRequests: parseInt(env.RATE_LIMIT_MAX || '100'),
      },
    },
    logging: {
      level: env.LOG_LEVEL,
      format: env.LOG_FORMAT,
      destination: env.LOG_DESTINATION as 'console' | 'external' | 'both' || 'console',
      retentionDays: env.LOG_RETENTION_DAYS,
      maxSizeMB: env.LOG_MAX_SIZE_MB,
      enableAggregation: env.ENABLE_LOG_AGGREGATION,
    },
  };
}

// Main configuration instance
export const config = createConfiguration();

// Configuration validation functions
export function validateConfiguration(config: EnvironmentConfig): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate required fields
  if (!config.database.url) {
    errors.push('Database URL is required');
  }
  if (!config.database.anonKey) {
    errors.push('Database anonymous key is required');
  }

  // Validate production requirements
  if (config.app.environment === 'production') {
    if (!config.database.serviceKey) {
      errors.push('Database service key is required in production');
    }
    if (config.features.enablePayments && !config.payments.stripe?.secretKey) {
      errors.push('Stripe secret key is required when payments are enabled in production');
    }
    if (!config.security.jwt.secret) {
      errors.push('JWT secret is required in production');
    }
    if (!config.security.oauth.tokenEncryptionKey) {
      errors.push('OAuth token encryption key is required in production');
    }
  }

  // Validate AI provider configuration
  if (!config.features.enableMockServices) {
    const hasAnyAIProvider = config.ai.openai.enabled || 
                            config.ai.anthropic.enabled || 
                            config.ai.hallucifix?.enabled;
    if (!hasAnyAIProvider) {
      errors.push('At least one AI provider must be configured when mock services are disabled');
    }
  }

  // Validate OAuth configuration
  if (!config.features.enableMockServices && config.auth.google.enabled) {
    if (!config.auth.google.clientId) {
      errors.push('Google OAuth client ID is required when Google auth is enabled');
    }
    // Client secret is only required server-side
    if (typeof window === 'undefined' && !config.auth.google.clientSecret) {
      errors.push('Google OAuth client secret is required on server-side');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Configuration status checker
export function getConfigurationStatus(): {
  environment: string;
  services: {
    database: boolean;
    ai: { openai: boolean; anthropic: boolean; hallucifix: boolean };
    auth: { google: boolean };
    payments: { stripe: boolean };
    monitoring: { sentry: boolean; datadog: boolean; analytics: boolean };
  };
  features: FeatureFlags;
  validation: { isValid: boolean; errors: string[] };
} {
  const validation = validateConfiguration(config);
  
  return {
    environment: config.app.environment,
    services: {
      database: !!(config.database.url && config.database.anonKey),
      ai: {
        openai: config.ai.openai.enabled,
        anthropic: config.ai.anthropic.enabled,
        hallucifix: config.ai.hallucifix?.enabled || false,
      },
      auth: {
        google: config.auth.google.enabled,
      },
      payments: {
        stripe: config.payments.stripe?.enabled || false,
      },
      monitoring: {
        sentry: config.monitoring.sentry?.enabled || false,
        datadog: config.monitoring.datadog?.enabled || false,
        analytics: config.monitoring.analytics?.enabled || false,
      },
    },
    features: config.features,
    validation,
  };
}

// Environment-specific configuration helpers
export function isProduction(): boolean {
  return config.app.environment === 'production';
}

export function isDevelopment(): boolean {
  return config.app.environment === 'development';
}

export function isStaging(): boolean {
  return config.app.environment === 'staging';
}

// Service availability helpers
export function getAvailableAIProviders(): string[] {
  const providers: string[] = [];
  if (config.ai.openai.enabled) providers.push('openai');
  if (config.ai.anthropic.enabled) providers.push('anthropic');
  if (config.ai.hallucifix?.enabled) providers.push('hallucifix');
  return providers;
}

export function getAvailableAuthProviders(): string[] {
  const providers: string[] = [];
  if (config.auth.google.enabled) providers.push('google');
  return providers;
}

// Configuration logging
export function logConfigurationStatus(): void {
  if (isDevelopment()) {
    const status = getConfigurationStatus();
    console.group('🔧 Configuration Status');
    logger.info("Environment:", { environment: status.environment });
    logger.info("Database:", { configured: status.services.database ? '✅ Connected' : '❌ Not configured' });
    logger.info("AI Providers:", { providers: {
      OpenAI: status.services.ai.openai ? '✅' : '❌',
      Anthropic: status.services.ai.anthropic ? '✅' : '❌',
      HalluciFix: status.services.ai.hallucifix ? '✅' : '❌',
    } });
    logger.info("Auth Providers:", { providers: {
      Google: status.services.auth.google ? '✅' : '❌',
    } });
    logger.info("Features:", { features: status.features });
    if (!status.validation.isValid) {
      logger.warn("Configuration Issues:", { errors: status.validation.errors });
    }
    console.groupEnd();
  }
}

// Export types for external use
export type {
  AIProviderConfig,
  AuthProviderConfig,
  DatabaseConfig,
  MonitoringConfig,
  PaymentConfig,
  FeatureFlags,
  SecurityConfig,
  LoggingConfig,
  ConfigurationChangeEvent,
};