/**
 * Configuration Validation System
 * Provides comprehensive validation for all configuration aspects
 */

import { z } from 'zod';
import type { EnvironmentConfig } from './index';

// Validation schemas
const aiProviderSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  apiUrl: z.string().url().optional(),
  enabled: z.boolean(),
});

const authProviderSchema = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  enabled: z.boolean(),
});

const databaseConfigSchema = z.object({
  url: z.string().url('Invalid database URL'),
  anonKey: z.string().min(1, 'Database anonymous key is required'),
  serviceKey: z.string().optional(),
  connectionPoolSize: z.number().positive().optional(),
  queryTimeout: z.number().positive().optional(),
  enableReadReplicas: z.boolean().optional(),
  readReplicas: z.array(z.object({
    url: z.string().url(),
    key: z.string().min(1),
  })).optional(),
});

const monitoringConfigSchema = z.object({
  sentry: z.object({
    dsn: z.string().url().optional(),
    environment: z.string().optional(),
    tracesSampleRate: z.number().min(0).max(1).optional(),
    enabled: z.boolean(),
  }).optional(),
  datadog: z.object({
    apiKey: z.string().optional(),
    site: z.string().optional(),
    enabled: z.boolean(),
  }).optional(),
  analytics: z.object({
    googleAnalyticsId: z.string().optional(),
    mixpanelToken: z.string().optional(),
    enabled: z.boolean(),
  }).optional(),
});

const paymentConfigSchema = z.object({
  stripe: z.object({
    publishableKey: z.string().optional(),
    secretKey: z.string().optional(),
    webhookSecret: z.string().optional(),
    priceIds: z.object({
      basicMonthly: z.string().optional(),
      basicYearly: z.string().optional(),
      proMonthly: z.string().optional(),
      proYearly: z.string().optional(),
      apiCalls: z.string().optional(),
    }).optional(),
    enabled: z.boolean(),
  }).optional(),
});

const featureFlagsSchema = z.object({
  enableAnalytics: z.boolean(),
  enablePayments: z.boolean(),
  enableBetaFeatures: z.boolean(),
  enableMockServices: z.boolean(),
  enableReadReplicas: z.boolean(),
  enableLogAggregation: z.boolean(),
});

const securityConfigSchema = z.object({
  oauth: z.object({
    tokenEncryptionKey: z.string().optional(),
    stateSecret: z.string().optional(),
    sessionSecret: z.string().optional(),
    refreshCheckIntervalMs: z.number().positive(),
    refreshBufferMs: z.number().positive(),
    cleanupIntervalMs: z.number().positive(),
    tokenGracePeriodMs: z.number().positive(),
  }),
  jwt: z.object({
    secret: z.string().optional(),
    expiresIn: z.string(),
    refreshExpiresIn: z.string(),
  }),
  rateLimiting: z.object({
    windowMs: z.number().positive(),
    maxRequests: z.number().positive(),
  }),
});

const loggingConfigSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']),
  format: z.enum(['json', 'pretty']),
  destination: z.enum(['console', 'external', 'both']),
  retentionDays: z.number().positive(),
  maxSizeMB: z.number().positive(),
  enableAggregation: z.boolean(),
});

// Main configuration schema
const environmentConfigSchema = z.object({
  app: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    url: z.string().url(),
    environment: z.enum(['development', 'staging', 'production']),
  }),
  ai: z.object({
    openai: aiProviderSchema,
    anthropic: aiProviderSchema,
    hallucifix: aiProviderSchema.optional(),
    primaryProvider: z.string(),
    fallbackChain: z.array(z.string()),
  }),
  auth: z.object({
    google: authProviderSchema,
    providers: z.array(z.string()),
  }),
  database: databaseConfigSchema,
  monitoring: monitoringConfigSchema,
  payments: paymentConfigSchema,
  features: featureFlagsSchema,
  security: securityConfigSchema,
  logging: loggingConfigSchema,
});

// Validation result types
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  path: string;
  message: string;
  recommendation?: string;
}

// Environment-specific validation rules
export interface EnvironmentValidationRules {
  required: string[];
  recommended: string[];
  forbidden: string[];
}

const environmentRules: Record<string, EnvironmentValidationRules> = {
  development: {
    required: ['database.url', 'database.anonKey'],
    recommended: ['ai.openai.apiKey', 'auth.google.clientId'],
    forbidden: [],
  },
  staging: {
    required: [
      'database.url',
      'database.anonKey',
      'database.serviceKey',
      'monitoring.sentry.dsn',
    ],
    recommended: [
      'ai.openai.apiKey',
      'auth.google.clientId',
      'auth.google.clientSecret',
      'security.jwt.secret',
    ],
    forbidden: ['features.enableMockServices'],
  },
  production: {
    required: [
      'database.url',
      'database.anonKey',
      'database.serviceKey',
      'security.jwt.secret',
      'security.oauth.tokenEncryptionKey',
      'security.oauth.stateSecret',
      'security.oauth.sessionSecret',
      'monitoring.sentry.dsn',
    ],
    recommended: [
      'ai.openai.apiKey',
      'ai.anthropic.apiKey',
      'auth.google.clientId',
      'auth.google.clientSecret',
      'monitoring.datadog.apiKey',
    ],
    forbidden: [
      'features.enableMockServices',
      'features.enableBetaFeatures',
    ],
  },
};

// Main validation function
export function validateConfiguration(config: EnvironmentConfig): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  try {
    // Schema validation
    environmentConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        errors.push({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
          severity: 'error',
        });
      });
    }
  }

  // Environment-specific validation
  const envRules = environmentRules[config.app.environment];
  if (envRules) {
    // Check required fields
    envRules.required.forEach((path) => {
      if (!getNestedValue(config, path)) {
        errors.push({
          path,
          message: `${path} is required in ${config.app.environment} environment`,
          code: 'required_field_missing',
          severity: 'error',
        });
      }
    });

    // Check recommended fields
    envRules.recommended.forEach((path) => {
      if (!getNestedValue(config, path)) {
        warnings.push({
          path,
          message: `${path} is recommended in ${config.app.environment} environment`,
          recommendation: `Consider configuring ${path} for optimal functionality`,
        });
      }
    });

    // Check forbidden fields
    envRules.forbidden.forEach((path) => {
      if (getNestedValue(config, path)) {
        errors.push({
          path,
          message: `${path} should not be enabled in ${config.app.environment} environment`,
          code: 'forbidden_field_enabled',
          severity: 'error',
        });
      }
    });
  }

  // Business logic validation
  validateBusinessLogic(config, errors, warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// Business logic validation
function validateBusinessLogic(
  config: EnvironmentConfig,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  // AI provider validation
  if (!config.features.enableMockServices) {
    const hasAnyAIProvider = config.ai.openai.enabled || 
                            config.ai.anthropic.enabled || 
                            config.ai.hallucifix?.enabled;
    if (!hasAnyAIProvider) {
      errors.push({
        path: 'ai',
        message: 'At least one AI provider must be enabled when mock services are disabled',
        code: 'no_ai_provider',
        severity: 'error',
      });
    }
  }

  // Primary provider validation
  const availableProviders = [];
  if (config.ai.openai.enabled) availableProviders.push('openai');
  if (config.ai.anthropic.enabled) availableProviders.push('anthropic');
  if (config.ai.hallucifix?.enabled) availableProviders.push('hallucifix');

  if (!availableProviders.includes(config.ai.primaryProvider)) {
    errors.push({
      path: 'ai.primaryProvider',
      message: `Primary provider '${config.ai.primaryProvider}' is not available or enabled`,
      code: 'invalid_primary_provider',
      severity: 'error',
    });
  }

  // OAuth validation
  if (config.auth.google.enabled) {
    if (!config.auth.google.clientId) {
      errors.push({
        path: 'auth.google.clientId',
        message: 'Google OAuth client ID is required when Google auth is enabled',
        code: 'missing_oauth_client_id',
        severity: 'error',
      });
    }

    // Server-side validation
    if (typeof window === 'undefined' && !config.auth.google.clientSecret) {
      errors.push({
        path: 'auth.google.clientSecret',
        message: 'Google OAuth client secret is required on server-side',
        code: 'missing_oauth_client_secret',
        severity: 'error',
      });
    }
  }

  // Payment validation
  if (config.features.enablePayments) {
    if (!config.payments.stripe?.publishableKey || !config.payments.stripe?.secretKey) {
      errors.push({
        path: 'payments.stripe',
        message: 'Stripe keys are required when payments are enabled',
        code: 'missing_payment_config',
        severity: 'error',
      });
    }
  }

  // Security validation for production
  if (config.app.environment === 'production') {
    if (!config.security.oauth.tokenEncryptionKey || config.security.oauth.tokenEncryptionKey.length < 32) {
      errors.push({
        path: 'security.oauth.tokenEncryptionKey',
        message: 'OAuth token encryption key must be at least 32 characters in production',
        code: 'weak_encryption_key',
        severity: 'error',
      });
    }

    if (!config.security.jwt.secret || config.security.jwt.secret.length < 32) {
      errors.push({
        path: 'security.jwt.secret',
        message: 'JWT secret must be at least 32 characters in production',
        code: 'weak_jwt_secret',
        severity: 'error',
      });
    }
  }

  // Read replica validation
  if (config.features.enableReadReplicas) {
    if (!config.database.readReplicas || config.database.readReplicas.length === 0) {
      warnings.push({
        path: 'database.readReplicas',
        message: 'Read replicas are enabled but no replicas are configured',
        recommendation: 'Configure read replica URLs and keys for improved performance',
      });
    }
  }

  // Monitoring validation
  if (config.app.environment === 'production' && !config.monitoring.sentry?.enabled) {
    warnings.push({
      path: 'monitoring.sentry',
      message: 'Error monitoring is not configured for production',
      recommendation: 'Configure Sentry for production error tracking',
    });
  }
}

// Helper function to get nested object values
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// API key validation
export function validateApiKey(key: string, provider: string): boolean {
  const patterns: Record<string, RegExp> = {
    openai: /^sk-[a-zA-Z0-9]{48}$/,
    anthropic: /^sk-ant-[a-zA-Z0-9-]{95}$/,
    google: /^[a-zA-Z0-9-_]{72}\.apps\.googleusercontent\.com$/,
    stripe_pk: /^pk_(test|live)_[a-zA-Z0-9]{24}$/,
    stripe_sk: /^sk_(test|live)_[a-zA-Z0-9]{24}$/,
    sentry: /^https:\/\/[a-f0-9]{32}@[a-z0-9.-]+\/[0-9]+$/,
  };

  const pattern = patterns[provider];
  return pattern ? pattern.test(key) : true; // Default to true for unknown providers
}

// Configuration completeness checker
export function getConfigurationCompleteness(config: EnvironmentConfig): {
  overall: number;
  categories: Record<string, { score: number; total: number; configured: number }>;
} {
  const categories = {
    database: {
      fields: ['database.url', 'database.anonKey', 'database.serviceKey'],
      configured: 0,
      total: 3,
    },
    ai: {
      fields: ['ai.openai.apiKey', 'ai.anthropic.apiKey', 'ai.hallucifix.apiKey'],
      configured: 0,
      total: 3,
    },
    auth: {
      fields: ['auth.google.clientId', 'auth.google.clientSecret'],
      configured: 0,
      total: 2,
    },
    payments: {
      fields: ['payments.stripe.publishableKey', 'payments.stripe.secretKey'],
      configured: 0,
      total: 2,
    },
    monitoring: {
      fields: ['monitoring.sentry.dsn', 'monitoring.datadog.apiKey', 'monitoring.analytics.googleAnalyticsId'],
      configured: 0,
      total: 3,
    },
    security: {
      fields: ['security.jwt.secret', 'security.oauth.tokenEncryptionKey', 'security.oauth.stateSecret'],
      configured: 0,
      total: 3,
    },
  };

  let totalConfigured = 0;
  let totalFields = 0;

  Object.entries(categories).forEach(([category, info]) => {
    info.configured = info.fields.filter(field => !!getNestedValue(config, field)).length;
    info.score = Math.round((info.configured / info.total) * 100);
    totalConfigured += info.configured;
    totalFields += info.total;
  });

  return {
    overall: Math.round((totalConfigured / totalFields) * 100),
    categories: Object.fromEntries(
      Object.entries(categories).map(([key, value]) => [key, {
        score: value.score,
        total: value.total,
        configured: value.configured,
      }])
    ),
  };
}

// Export validation utilities
export {
  environmentConfigSchema,
  environmentRules,
};