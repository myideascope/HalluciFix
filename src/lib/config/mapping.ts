/**
 * Environment variable to configuration path mapping system
 * Provides centralized mapping between environment variables and configuration structure
 */

import type { EnvironmentMapping } from './types';

/**
 * Comprehensive mapping of environment variables to configuration paths
 */
export const environmentMappings: EnvironmentMapping[] = [
  // Application Configuration
  {
    envKey: 'VITE_APP_NAME',
    configPath: ['app', 'name'],
    required: false,
    type: 'string',
    defaultValue: 'HalluciFix'
  },
  {
    envKey: 'VITE_APP_VERSION',
    configPath: ['app', 'version'],
    required: false,
    type: 'string',
    defaultValue: '1.0.0',
    validation: {
      pattern: /^\d+\.\d+\.\d+$/
    }
  },
  {
    envKey: 'NODE_ENV',
    configPath: ['app', 'environment'],
    required: false,
    type: 'string',
    defaultValue: 'development'
  },
  {
    envKey: 'VITE_APP_URL',
    configPath: ['app', 'url'],
    required: false,
    type: 'string',
    defaultValue: 'http://localhost:5173'
  },
  {
    envKey: 'PORT',
    configPath: ['app', 'port'],
    required: false,
    type: 'number',
    defaultValue: 5173,
    validation: {
      min: 1,
      max: 65535
    }
  },
  {
    envKey: 'LOG_LEVEL',
    configPath: ['app', 'logLevel'],
    required: false,
    type: 'string',
    defaultValue: 'info'
  },

  // Database Configuration
  {
    envKey: 'VITE_SUPABASE_URL',
    configPath: ['database', 'supabaseUrl'],
    required: true,
    type: 'string'
  },
  {
    envKey: 'VITE_SUPABASE_ANON_KEY',
    configPath: ['database', 'supabaseAnonKey'],
    required: true,
    type: 'string',
    validation: {
      minLength: 1
    }
  },
  {
    envKey: 'SUPABASE_SERVICE_KEY',
    configPath: ['database', 'supabaseServiceKey'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'DB_CONNECTION_POOL_SIZE',
    configPath: ['database', 'connectionPoolSize'],
    required: false,
    type: 'number',
    defaultValue: 10,
    validation: {
      min: 1,
      max: 100
    }
  },
  {
    envKey: 'DB_QUERY_TIMEOUT',
    configPath: ['database', 'queryTimeout'],
    required: false,
    type: 'number',
    defaultValue: 30000,
    validation: {
      min: 1000
    }
  },

  // Read Replica Configuration
  {
    envKey: 'VITE_SUPABASE_READ_REPLICA_1_URL',
    configPath: ['database', 'readReplicas', 'replica1', 'url'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'VITE_SUPABASE_READ_REPLICA_1_KEY',
    configPath: ['database', 'readReplicas', 'replica1', 'key'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'VITE_SUPABASE_READ_REPLICA_2_URL',
    configPath: ['database', 'readReplicas', 'replica2', 'url'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'VITE_SUPABASE_READ_REPLICA_2_KEY',
    configPath: ['database', 'readReplicas', 'replica2', 'key'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'VITE_ENABLE_READ_REPLICAS',
    configPath: ['database', 'readReplicas', 'enabled'],
    required: false,
    type: 'boolean',
    defaultValue: false
  },

  // AI Services Configuration
  {
    envKey: 'VITE_OPENAI_API_KEY',
    configPath: ['ai', 'openai', 'apiKey'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^sk-[a-zA-Z0-9]{48}$/
    }
  },
  {
    envKey: 'VITE_OPENAI_MODEL',
    configPath: ['ai', 'openai', 'model'],
    required: false,
    type: 'string',
    defaultValue: 'gpt-4'
  },
  {
    envKey: 'VITE_OPENAI_MAX_TOKENS',
    configPath: ['ai', 'openai', 'maxTokens'],
    required: false,
    type: 'number',
    defaultValue: 4000,
    validation: {
      min: 1,
      max: 8000
    }
  },
  {
    envKey: 'VITE_OPENAI_TEMPERATURE',
    configPath: ['ai', 'openai', 'temperature'],
    required: false,
    type: 'number',
    defaultValue: 0.1,
    validation: {
      min: 0,
      max: 2
    }
  },
  {
    envKey: 'VITE_ANTHROPIC_API_KEY',
    configPath: ['ai', 'anthropic', 'apiKey'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^sk-ant-[a-zA-Z0-9-_]+$/
    }
  },
  {
    envKey: 'VITE_ANTHROPIC_MODEL',
    configPath: ['ai', 'anthropic', 'model'],
    required: false,
    type: 'string',
    defaultValue: 'claude-3-sonnet-20240229'
  },
  {
    envKey: 'VITE_ANTHROPIC_MAX_TOKENS',
    configPath: ['ai', 'anthropic', 'maxTokens'],
    required: false,
    type: 'number',
    defaultValue: 4000,
    validation: {
      min: 1,
      max: 4000
    }
  },
  {
    envKey: 'VITE_HALLUCIFIX_API_KEY',
    configPath: ['ai', 'hallucifix', 'apiKey'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'VITE_HALLUCIFIX_API_URL',
    configPath: ['ai', 'hallucifix', 'apiUrl'],
    required: false,
    type: 'string'
  },

  // Authentication Configuration
  {
    envKey: 'VITE_GOOGLE_CLIENT_ID',
    configPath: ['auth', 'google', 'clientId'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/
    }
  },
  {
    envKey: 'GOOGLE_CLIENT_SECRET',
    configPath: ['auth', 'google', 'clientSecret'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^GOCSPX-[a-zA-Z0-9_-]+$/
    }
  },
  {
    envKey: 'VITE_GOOGLE_REDIRECT_URI',
    configPath: ['auth', 'google', 'redirectUri'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'JWT_SECRET',
    configPath: ['auth', 'jwt', 'secret'],
    required: false,
    type: 'string',
    validation: {
      minLength: 32
    }
  },
  {
    envKey: 'JWT_EXPIRES_IN',
    configPath: ['auth', 'jwt', 'expiresIn'],
    required: false,
    type: 'string',
    defaultValue: '24h',
    validation: {
      pattern: /^\d+[smhd]$/
    }
  },
  {
    envKey: 'JWT_REFRESH_EXPIRES_IN',
    configPath: ['auth', 'jwt', 'refreshExpiresIn'],
    required: false,
    type: 'string',
    defaultValue: '7d',
    validation: {
      pattern: /^\d+[smhd]$/
    }
  },

  // Payment Configuration
  {
    envKey: 'VITE_STRIPE_PUBLISHABLE_KEY',
    configPath: ['payments', 'stripe', 'publishableKey'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^pk_(test|live)_[a-zA-Z0-9]+$/
    }
  },
  {
    envKey: 'STRIPE_SECRET_KEY',
    configPath: ['payments', 'stripe', 'secretKey'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^sk_(test|live)_[a-zA-Z0-9]+$/
    }
  },
  {
    envKey: 'STRIPE_WEBHOOK_SECRET',
    configPath: ['payments', 'stripe', 'webhookSecret'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^whsec_[a-zA-Z0-9]+$/
    }
  },
  {
    envKey: 'STRIPE_PRICE_ID_BASIC_MONTHLY',
    configPath: ['payments', 'stripe', 'priceIds', 'basicMonthly'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^price_[a-zA-Z0-9]+$/
    }
  },
  {
    envKey: 'STRIPE_PRICE_ID_BASIC_YEARLY',
    configPath: ['payments', 'stripe', 'priceIds', 'basicYearly'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^price_[a-zA-Z0-9]+$/
    }
  },
  {
    envKey: 'STRIPE_PRICE_ID_PRO_MONTHLY',
    configPath: ['payments', 'stripe', 'priceIds', 'proMonthly'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^price_[a-zA-Z0-9]+$/
    }
  },
  {
    envKey: 'STRIPE_PRICE_ID_PRO_YEARLY',
    configPath: ['payments', 'stripe', 'priceIds', 'proYearly'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^price_[a-zA-Z0-9]+$/
    }
  },
  {
    envKey: 'STRIPE_PRICE_ID_API_CALLS',
    configPath: ['payments', 'stripe', 'priceIds', 'apiCalls'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^price_[a-zA-Z0-9]+$/
    }
  },

  // Monitoring Configuration
  {
    envKey: 'VITE_SENTRY_DSN',
    configPath: ['monitoring', 'sentry', 'dsn'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'SENTRY_ENVIRONMENT',
    configPath: ['monitoring', 'sentry', 'environment'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'SENTRY_TRACES_SAMPLE_RATE',
    configPath: ['monitoring', 'sentry', 'tracesSampleRate'],
    required: false,
    type: 'number',
    defaultValue: 0.1,
    validation: {
      min: 0,
      max: 1
    }
  },
  {
    envKey: 'SENTRY_AUTH_TOKEN',
    configPath: ['monitoring', 'sentry', 'authToken'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'VITE_GOOGLE_ANALYTICS_ID',
    configPath: ['monitoring', 'analytics', 'googleAnalyticsId'],
    required: false,
    type: 'string',
    validation: {
      pattern: /^G-[A-Z0-9]+$/
    }
  },
  {
    envKey: 'VITE_MIXPANEL_TOKEN',
    configPath: ['monitoring', 'analytics', 'mixpanelToken'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'LOG_FORMAT',
    configPath: ['monitoring', 'logging', 'format'],
    required: false,
    type: 'string',
    defaultValue: 'pretty'
  },
  {
    envKey: 'LOG_DESTINATION',
    configPath: ['monitoring', 'logging', 'destination'],
    required: false,
    type: 'string',
    defaultValue: 'console'
  },

  // Feature Flags
  {
    envKey: 'VITE_ENABLE_ANALYTICS',
    configPath: ['features', 'enableAnalytics'],
    required: false,
    type: 'boolean',
    defaultValue: true
  },
  {
    envKey: 'VITE_ENABLE_PAYMENTS',
    configPath: ['features', 'enablePayments'],
    required: false,
    type: 'boolean',
    defaultValue: false
  },
  {
    envKey: 'VITE_ENABLE_BETA_FEATURES',
    configPath: ['features', 'enableBetaFeatures'],
    required: false,
    type: 'boolean',
    defaultValue: false
  },
  {
    envKey: 'VITE_ENABLE_RAG_ANALYSIS',
    configPath: ['features', 'enableRagAnalysis'],
    required: false,
    type: 'boolean',
    defaultValue: true
  },
  {
    envKey: 'VITE_ENABLE_BATCH_PROCESSING',
    configPath: ['features', 'enableBatchProcessing'],
    required: false,
    type: 'boolean',
    defaultValue: true
  },
  {
    envKey: 'VITE_ENABLE_MOCK_SERVICES',
    configPath: ['features', 'enableMockServices'],
    required: false,
    type: 'boolean',
    defaultValue: true
  },

  // Security Configuration
  {
    envKey: 'CORS_ORIGINS',
    configPath: ['security', 'corsOrigins'],
    required: false,
    type: 'array',
    defaultValue: ['http://localhost:5173']
  },
  {
    envKey: 'RATE_LIMIT_WINDOW',
    configPath: ['security', 'rateLimitWindow'],
    required: false,
    type: 'number',
    defaultValue: 900000,
    validation: {
      min: 1000
    }
  },
  {
    envKey: 'RATE_LIMIT_MAX',
    configPath: ['security', 'rateLimitMax'],
    required: false,
    type: 'number',
    defaultValue: 100,
    validation: {
      min: 1
    }
  },
  {
    envKey: 'ENCRYPTION_KEY',
    configPath: ['security', 'encryptionKey'],
    required: false,
    type: 'string',
    validation: {
      minLength: 32
    }
  },
  {
    envKey: 'SESSION_SECRET',
    configPath: ['security', 'sessionSecret'],
    required: false,
    type: 'string',
    validation: {
      minLength: 32
    }
  },

  // Development Configuration
  {
    envKey: 'WEBHOOK_URL',
    configPath: ['development', 'webhookUrl'],
    required: false,
    type: 'string'
  },
  {
    envKey: 'ENABLE_HOT_RELOAD',
    configPath: ['development', 'hotReload'],
    required: false,
    type: 'boolean',
    defaultValue: true
  },
  {
    envKey: 'DEBUG_MODE',
    configPath: ['development', 'debugMode'],
    required: false,
    type: 'boolean',
    defaultValue: false
  }
];

/**
 * Get mapping by environment variable key
 */
export function getMappingByEnvKey(envKey: string): EnvironmentMapping | undefined {
  return environmentMappings.find(mapping => mapping.envKey === envKey);
}

/**
 * Get mapping by configuration path
 */
export function getMappingByConfigPath(configPath: string[]): EnvironmentMapping | undefined {
  return environmentMappings.find(mapping => 
    mapping.configPath.length === configPath.length &&
    mapping.configPath.every((segment, index) => segment === configPath[index])
  );
}

/**
 * Get all required environment variables
 */
export function getRequiredEnvironmentVariables(): string[] {
  return environmentMappings
    .filter(mapping => mapping.required)
    .map(mapping => mapping.envKey);
}

/**
 * Get all optional environment variables
 */
export function getOptionalEnvironmentVariables(): string[] {
  return environmentMappings
    .filter(mapping => !mapping.required)
    .map(mapping => mapping.envKey);
}

/**
 * Get environment variables by configuration section
 */
export function getEnvironmentVariablesBySection(section: string): EnvironmentMapping[] {
  return environmentMappings.filter(mapping => mapping.configPath[0] === section);
}

/**
 * Validate environment variable value against mapping rules
 */
export function validateEnvironmentValue(
  mapping: EnvironmentMapping,
  value: string
): { isValid: boolean; error?: string } {
  if (!mapping.validation) {
    return { isValid: true };
  }

  const { validation } = mapping;

  // Pattern validation
  if (validation.pattern && !validation.pattern.test(value)) {
    return {
      isValid: false,
      error: `Value does not match required pattern: ${validation.pattern.source}`
    };
  }

  // String length validation
  if (mapping.type === 'string') {
    if (validation.minLength && value.length < validation.minLength) {
      return {
        isValid: false,
        error: `Value must be at least ${validation.minLength} characters long`
      };
    }
    if (validation.maxLength && value.length > validation.maxLength) {
      return {
        isValid: false,
        error: `Value must be no more than ${validation.maxLength} characters long`
      };
    }
  }

  // Numeric validation
  if (mapping.type === 'number') {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      return {
        isValid: false,
        error: 'Value must be a valid number'
      };
    }
    if (validation.min !== undefined && numValue < validation.min) {
      return {
        isValid: false,
        error: `Value must be at least ${validation.min}`
      };
    }
    if (validation.max !== undefined && numValue > validation.max) {
      return {
        isValid: false,
        error: `Value must be no more than ${validation.max}`
      };
    }
  }

  return { isValid: true };
}

/**
 * Get configuration path as dot-separated string
 */
export function getConfigPathString(configPath: string[]): string {
  return configPath.join('.');
}

/**
 * Parse environment variable value according to type
 */
export function parseEnvironmentValue(mapping: EnvironmentMapping, value: string): any {
  switch (mapping.type) {
    case 'boolean':
      return value.toLowerCase() === 'true';
    case 'number':
      return Number(value);
    case 'array':
      return value.split(',').map(item => item.trim());
    case 'string':
    default:
      return value;
  }
}