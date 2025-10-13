/**
 * Zod validation schema for comprehensive environment configuration
 * Provides runtime validation with detailed error reporting
 */

import { z } from 'zod';
import type { EnvironmentConfig } from './types';

// Helper schemas for common patterns
const urlSchema = z.string().url();
const nonEmptyString = z.string().min(1);
const positiveNumber = z.number().int().positive();
const portNumber = z.number().int().min(1).max(65535);
const logLevel = z.enum(['debug', 'info', 'warn', 'error']);

// OpenAI API key pattern: sk-...
const openaiKeySchema = z.string().regex(
  /^sk-[a-zA-Z0-9]{48}$/,
  'OpenAI API key must start with "sk-" followed by 48 characters'
);

// Anthropic API key pattern: sk-ant-...
const anthropicKeySchema = z.string().regex(
  /^sk-ant-[a-zA-Z0-9-_]+$/,
  'Anthropic API key must start with "sk-ant-"'
);

// Google OAuth client ID pattern
const googleClientIdSchema = z.string().regex(
  /^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/,
  'Google Client ID must be in format: numbers-chars.apps.googleusercontent.com'
);

// Google OAuth client secret pattern
const googleClientSecretSchema = z.string().regex(
  /^GOCSPX-[a-zA-Z0-9_-]+$/,
  'Google Client Secret must start with "GOCSPX-"'
);

// Stripe key patterns
const stripePublishableKeySchema = z.string().regex(
  /^pk_(test|live)_[a-zA-Z0-9]+$/,
  'Stripe publishable key must start with "pk_test_" or "pk_live_"'
);

const stripeSecretKeySchema = z.string().regex(
  /^sk_(test|live)_[a-zA-Z0-9]+$/,
  'Stripe secret key must start with "sk_test_" or "sk_live_"'
);

const stripeWebhookSecretSchema = z.string().regex(
  /^whsec_[a-zA-Z0-9]+$/,
  'Stripe webhook secret must start with "whsec_"'
);

const stripePriceIdSchema = z.string().regex(
  /^price_[a-zA-Z0-9]+$/,
  'Stripe price ID must start with "price_"'
);

// JWT secret validation (minimum 32 characters for security)
const jwtSecretSchema = z.string().min(32, 'JWT secret must be at least 32 characters');

// Time duration pattern (e.g., "24h", "7d", "30m")
const durationSchema = z.string().regex(
  /^\d+[smhd]$/,
  'Duration must be in format: number followed by s/m/h/d (e.g., "24h", "7d")'
);

// Google Analytics ID pattern
const googleAnalyticsIdSchema = z.string().regex(
  /^G-[A-Z0-9]+$/,
  'Google Analytics ID must start with "G-"'
);

// Application configuration schema
const appConfigSchema = z.object({
  name: nonEmptyString.default('HalluciFix'),
  version: z.string().regex(
    /^\d+\.\d+\.\d+$/,
    'Version must be in semantic versioning format (e.g., "1.0.0")'
  ).default('1.0.0'),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  url: urlSchema.default('http://localhost:5173'),
  port: portNumber.default(5173),
  logLevel: logLevel.default('info')
});

// Database configuration schema
const databaseConfigSchema = z.object({
  supabaseUrl: urlSchema,
  supabaseAnonKey: nonEmptyString,
  supabaseServiceKey: nonEmptyString.optional(),
  connectionPoolSize: positiveNumber.max(100).default(10),
  queryTimeout: positiveNumber.min(1000).default(30000),
  readReplicas: z.object({
    replica1: z.object({
      url: urlSchema,
      key: nonEmptyString
    }).optional(),
    replica2: z.object({
      url: urlSchema,
      key: nonEmptyString
    }).optional(),
    enabled: z.boolean().default(false)
  }).optional()
});

// AI services configuration schema
const aiConfigSchema = z.object({
  openai: z.object({
    apiKey: openaiKeySchema,
    model: nonEmptyString.default('gpt-4'),
    maxTokens: z.number().int().min(1).max(8000).default(4000),
    temperature: z.number().min(0).max(2).default(0.1)
  }).optional(),
  anthropic: z.object({
    apiKey: anthropicKeySchema,
    model: nonEmptyString.default('claude-3-sonnet-20240229'),
    maxTokens: z.number().int().min(1).max(4000).default(4000)
  }).optional(),
  hallucifix: z.object({
    apiKey: nonEmptyString,
    apiUrl: urlSchema
  }).optional()
});

// Authentication configuration schema
const authConfigSchema = z.object({
  google: z.object({
    clientId: googleClientIdSchema,
    clientSecret: googleClientSecretSchema,
    redirectUri: urlSchema
  }).optional(),
  jwt: z.object({
    secret: jwtSecretSchema,
    expiresIn: durationSchema.default('24h'),
    refreshExpiresIn: durationSchema.default('7d')
  }).optional()
});

// Payment configuration schema
const paymentsConfigSchema = z.object({
  stripe: z.object({
    publishableKey: stripePublishableKeySchema,
    secretKey: stripeSecretKeySchema,
    webhookSecret: stripeWebhookSecretSchema,
    priceIds: z.object({
      basicMonthly: stripePriceIdSchema,
      basicYearly: stripePriceIdSchema,
      proMonthly: stripePriceIdSchema,
      proYearly: stripePriceIdSchema,
      apiCalls: stripePriceIdSchema.optional()
    })
  })
}).optional();

// Monitoring configuration schema
const monitoringConfigSchema = z.object({
  sentry: z.object({
    dsn: urlSchema,
    environment: nonEmptyString,
    tracesSampleRate: z.number().min(0).max(1).default(0.1),
    authToken: nonEmptyString.optional()
  }).optional(),
  analytics: z.object({
    googleAnalyticsId: googleAnalyticsIdSchema,
    mixpanelToken: nonEmptyString
  }).optional(),
  logging: z.object({
    level: logLevel.default('info'),
    format: z.enum(['json', 'pretty']).default('pretty'),
    destination: z.enum(['console', 'file', 'external']).default('console')
  })
});

// Feature flags configuration schema
const featuresConfigSchema = z.object({
  enableAnalytics: z.boolean().default(true),
  enablePayments: z.boolean().default(false),
  enableBetaFeatures: z.boolean().default(false),
  enableRagAnalysis: z.boolean().default(true),
  enableBatchProcessing: z.boolean().default(true),
  enableMockServices: z.boolean().default(true),
  enableReadReplicas: z.boolean().default(false)
});

// Security configuration schema
const securityConfigSchema = z.object({
  corsOrigins: z.array(urlSchema).default(['http://localhost:5173']),
  rateLimitWindow: positiveNumber.default(900000), // 15 minutes
  rateLimitMax: positiveNumber.default(100),
  encryptionKey: z.string().min(32).optional(),
  sessionSecret: z.string().min(32).optional()
});

// Development configuration schema
const developmentConfigSchema = z.object({
  webhookUrl: urlSchema.optional(),
  hotReload: z.boolean().default(true),
  debugMode: z.boolean().default(false)
}).optional();

// Main environment configuration schema
export const environmentSchema = z.object({
  app: appConfigSchema,
  database: databaseConfigSchema,
  ai: aiConfigSchema,
  auth: authConfigSchema,
  payments: paymentsConfigSchema,
  monitoring: monitoringConfigSchema,
  features: featuresConfigSchema,
  security: securityConfigSchema,
  development: developmentConfigSchema
});

// Type inference from schema
export type ValidatedEnvironmentConfig = z.infer<typeof environmentSchema>;

// Validation function with detailed error reporting
export function validateConfiguration(config: unknown): ValidatedEnvironmentConfig {
  try {
    return environmentSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = formatZodErrors(error);
      throw new ConfigurationValidationError(
        'Configuration validation failed',
        formattedErrors.errors,
        formattedErrors.missingRequired,
        formattedErrors.warnings
      );
    }
    throw error;
  }
}

// Helper function to format Zod validation errors
function formatZodErrors(error: z.ZodError) {
  const errors: string[] = [];
  const missingRequired: string[] = [];
  const warnings: string[] = [];

  if (error.errors && Array.isArray(error.errors)) {
    error.errors.forEach(err => {
      const path = err.path.join('.');
      const message = err.message;

      if (err.code === 'invalid_type' && err.received === 'undefined') {
        missingRequired.push(`${path}: ${message}`);
      } else if (err.code === 'invalid_string' || err.code === 'invalid_literal') {
        errors.push(`${path}: ${message}`);
      } else {
        warnings.push(`${path}: ${message}`);
      }
    });
  }

  return { errors, missingRequired, warnings };
}

// Custom error class for configuration validation
export class ConfigurationValidationError extends Error {
  readonly errorCode = 'CONFIG_VALIDATION_ERROR';

  constructor(
    message: string,
    public validationErrors: string[] = [],
    public missingRequired: string[] = [],
    public warnings: string[] = []
  ) {
    super(message);
    this.name = 'ConfigurationValidationError';
  }

  toString(): string {
    let errorMessage = this.message + '\n';

    if (this.missingRequired.length > 0) {
      errorMessage += '\n❌ Missing required configuration:\n';
      errorMessage += this.missingRequired.map(err => `  • ${err}`).join('\n');
    }

    if (this.validationErrors.length > 0) {
      errorMessage += '\n❌ Invalid configuration:\n';
      errorMessage += this.validationErrors.map(err => `  • ${err}`).join('\n');
    }

    if (this.warnings.length > 0) {
      errorMessage += '\n⚠️  Configuration warnings:\n';
      errorMessage += this.warnings.map(warn => `  • ${warn}`).join('\n');
    }

    errorMessage += '\n\n📖 Please check your environment configuration and the .env.example file for guidance.';

    return errorMessage;
  }
}