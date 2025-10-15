/**
 * Configuration validation schema using Zod
 * Provides comprehensive validation with detailed error messages
 */

import { z } from 'zod';
import { EnvironmentConfig } from './types.js';

// Custom validation helpers
const urlSchema = z.string().refine((val) => {
  try {
    new URL(val);
    return true;
  } catch {
    return false;
  }
}, { message: "Must be a valid URL" });

const portSchema = z.number().int().min(1).max(65535);

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

const environmentSchema = z.enum(['development', 'staging', 'production']);

// API key validation patterns
const openaiKeySchema = z.string().regex(/^sk-[a-zA-Z0-9]{48,}$/, {
  message: "OpenAI API key must start with 'sk-' followed by at least 48 characters"
});

const anthropicKeySchema = z.string().regex(/^sk-ant-[a-zA-Z0-9\-_]+$/, {
  message: "Anthropic API key must start with 'sk-ant-'"
});

const googleClientIdSchema = z.string().regex(/^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/, {
  message: "Google Client ID must end with '.apps.googleusercontent.com'"
});

const googleClientSecretSchema = z.string().regex(/^GOCSPX-[a-zA-Z0-9_\-]+$/, {
  message: "Google Client Secret must start with 'GOCSPX-'"
});

const stripePublishableKeySchema = z.string().regex(/^pk_(test|live)_[a-zA-Z0-9]+$/, {
  message: "Stripe publishable key must start with 'pk_test_' or 'pk_live_'"
});

const stripeSecretKeySchema = z.string().regex(/^sk_(test|live)_[a-zA-Z0-9]+$/, {
  message: "Stripe secret key must start with 'sk_test_' or 'sk_live_'"
});

const stripeWebhookSecretSchema = z.string().regex(/^whsec_[a-zA-Z0-9]+$/, {
  message: "Stripe webhook secret must start with 'whsec_'"
});

const stripePriceIdSchema = z.string().regex(/^price_[a-zA-Z0-9]+$/, {
  message: "Stripe price ID must start with 'price_'"
});

const jwtSecretSchema = z.string().min(32, {
  message: "JWT secret must be at least 32 characters long for security"
});

const durationSchema = z.string().regex(/^\d+[smhd]$/, {
  message: "Duration must be in format like '24h', '7d', '30m', '60s'"
});

// Main configuration schema
export const configurationSchema = z.object({
  app: z.object({
    name: z.string().default('HalluciFix'),
    version: z.string().default('1.0.0'),
    environment: environmentSchema.default('development'),
    url: z.string().default('http://localhost:5173'),
    port: z.number().int().min(1).max(65535).default(5173),
    logLevel: logLevelSchema.default('info')
  }),

  database: z.object({
    supabaseUrl: z.string().default(''),
    supabaseAnonKey: z.string().default(''),
    supabaseServiceKey: z.string().optional(),
    connectionPoolSize: z.number().int().min(1).max(100).default(10),
    queryTimeout: z.number().int().min(1000).default(30000),
    readReplicas: z.object({
      replica1: z.object({
        url: z.string().optional(),
        key: z.string().optional()
      }).optional(),
      replica2: z.object({
        url: z.string().optional(),
        key: z.string().optional()
      }).optional(),
      enabled: z.boolean().default(false)
    }).optional()
  }),

  ai: z.object({
    openai: z.object({
      apiKey: z.string(),
      model: z.string().default('gpt-4'),
      maxTokens: z.number().int().min(1).max(8000).default(4000),
      temperature: z.number().min(0).max(2).default(0.1)
    }).optional(),

    anthropic: z.object({
      apiKey: z.string(),
      model: z.string().default('claude-3-sonnet-20240229'),
      maxTokens: z.number().int().min(1).max(4000).default(4000)
    }).optional(),

    hallucifix: z.object({
      apiKey: z.string(),
      apiUrl: z.string()
    }).optional()
  }),

  auth: z.object({
    google: z.object({
      clientId: z.string().default(''),
      clientSecret: z.string().default(''),
      redirectUri: z.string().default('')
    }),

    jwt: z.object({
      secret: z.string().default('development-secret-key-not-for-production'),
      expiresIn: z.string().default('24h'),
      refreshExpiresIn: z.string().default('7d')
    })
  }),

  payments: z.object({
    stripe: z.object({
      publishableKey: z.string().min(1),
      secretKey: z.string().min(1),
      webhookSecret: z.string().min(1),
      priceIds: z.object({
        basicMonthly: z.string().min(1),
        basicYearly: z.string().min(1),
        proMonthly: z.string().min(1),
        proYearly: z.string().min(1),
        apiCalls: z.string().optional()
      })
    })
  }).optional(),

  monitoring: z.object({
    sentry: z.object({
      dsn: z.string().min(1),
      environment: z.string().min(1),
      tracesSampleRate: z.number().min(0).max(1).default(0.1),
      authToken: z.string().optional()
    }).optional(),

    analytics: z.object({
      googleAnalyticsId: z.string().min(1),
      mixpanelToken: z.string().min(1)
    }).optional(),

    logging: z.object({
      level: logLevelSchema.default('info'),
      format: z.enum(['json', 'pretty']).default('pretty'),
      destination: z.enum(['console', 'file', 'external']).default('console')
    })
  }),

  features: z.object({
    enableAnalytics: z.boolean().default(true),
    enablePayments: z.boolean().default(false),
    enableBetaFeatures: z.boolean().default(false),
    enableRagAnalysis: z.boolean().default(true),
    enableBatchProcessing: z.boolean().default(true),
    enableMockServices: z.boolean().default(true)
  }),

  security: z.object({
    corsOrigins: z.array(z.string()).default(['http://localhost:5173']),
    rateLimitWindow: z.number().int().min(1000).default(900000), // 15 minutes
    rateLimitMax: z.number().int().min(1).default(100),
    encryptionKey: z.string().default('development-encryption-key-not-for-production'),
    sessionSecret: z.string().default('development-session-secret-not-for-production')
  })
});

export type ValidatedEnvironmentConfig = z.infer<typeof configurationSchema>;

/**
 * Configuration validator class
 */
export class ConfigurationValidator {
  /**
   * Validate configuration and return detailed results
   */
  static validate(config: any): {
    isValid: boolean;
    config?: ValidatedEnvironmentConfig;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    try {
      const validatedConfig = configurationSchema.parse(config);
      const warnings = this.generateWarnings(validatedConfig);
      
      return {
        isValid: true,
        config: validatedConfig,
        errors: [],
        warnings
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = this.formatZodErrors(error);
        return {
          isValid: false,
          errors,
          warnings: []
        };
      }
      
      return {
        isValid: false,
        errors: [{
          path: [],
          message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'VALIDATION_ERROR'
        }],
        warnings: []
      };
    }
  }

  /**
   * Validate configuration for specific environment
   */
  static validateForEnvironment(config: any, environment: string): {
    isValid: boolean;
    config?: ValidatedEnvironmentConfig;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const result = this.validate(config);
    
    if (result.isValid && result.config) {
      const envErrors = this.validateEnvironmentRequirements(result.config, environment);
      const envWarnings = this.generateEnvironmentWarnings(result.config, environment);
      
      return {
        ...result,
        errors: [...result.errors, ...envErrors],
        warnings: [...result.warnings, ...envWarnings]
      };
    }
    
    return result;
  }

  /**
   * Format Zod validation errors into structured format
   */
  private static formatZodErrors(error: z.ZodError): ValidationError[] {
    console.error('Zod validation error details:', {
      errors: error.errors,
      issues: error.issues,
      message: error.message
    });

    // Use issues property (Zod v3+) or fallback to errors (older versions)
    const errorList = error.issues || error.errors || [];
    
    if (!Array.isArray(errorList) || errorList.length === 0) {
      return [{
        path: [],
        message: `Zod validation error: ${error.message}`,
        code: 'ZOD_ERROR'
      }];
    }

    console.error('Individual validation errors:', errorList);

    return errorList.map((err, index) => {
      console.error(`Error ${index + 1}:`, {
        path: err.path,
        pathString: err.path?.join('.'),
        message: err.message,
        code: err.code,
        received: 'received' in err ? err.received : undefined,
        expected: 'expected' in err ? err.expected : undefined
      });
      
      return {
        path: err.path || [],
        message: err.message || 'Validation error',
        code: err.code || 'VALIDATION_ERROR',
        received: 'received' in err ? err.received : undefined,
        expected: 'expected' in err ? err.expected : undefined
      };
    });
  }

  /**
   * Validate environment-specific requirements
   */
  private static validateEnvironmentRequirements(config: ValidatedEnvironmentConfig, environment: string): ValidationError[] {
    const errors: ValidationError[] = [];

    switch (environment) {
      case 'production':
        // Production requires service key
        if (!config.database.supabaseServiceKey) {
          errors.push({
            path: ['database', 'supabaseServiceKey'],
            message: 'Supabase service key is required in production',
            code: 'PRODUCTION_REQUIREMENT'
          });
        }

        // Production requires JWT secret
        if (!config.auth.jwt.secret || config.auth.jwt.secret.length < 64) {
          errors.push({
            path: ['auth', 'jwt', 'secret'],
            message: 'Production requires a strong JWT secret (at least 64 characters)',
            code: 'PRODUCTION_REQUIREMENT'
          });
        }

        // Production should not use mock services
        if (config.features.enableMockServices) {
          errors.push({
            path: ['features', 'enableMockServices'],
            message: 'Mock services should be disabled in production',
            code: 'PRODUCTION_REQUIREMENT'
          });
        }

        // Production should have monitoring
        if (!config.monitoring.sentry) {
          errors.push({
            path: ['monitoring', 'sentry'],
            message: 'Error monitoring (Sentry) is recommended for production',
            code: 'PRODUCTION_RECOMMENDATION'
          });
        }
        break;

      case 'staging':
        // Staging should have service key
        if (!config.database.supabaseServiceKey) {
          errors.push({
            path: ['database', 'supabaseServiceKey'],
            message: 'Supabase service key is recommended for staging',
            code: 'STAGING_RECOMMENDATION'
          });
        }
        break;
    }

    return errors;
  }

  /**
   * Generate configuration warnings
   */
  private static generateWarnings(config: ValidatedEnvironmentConfig): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check for missing optional but recommended services
    if (!config.ai.openai && !config.ai.anthropic && !config.ai.hallucifix) {
      warnings.push({
        path: ['ai'],
        message: 'No AI services configured. The application will use mock responses.',
        severity: 'info'
      });
    }

    if (!config.monitoring.sentry && config.app.environment !== 'development') {
      warnings.push({
        path: ['monitoring', 'sentry'],
        message: 'Error monitoring not configured. Consider adding Sentry for better error tracking.',
        severity: 'warning'
      });
    }

    if (!config.monitoring.analytics && config.features.enableAnalytics) {
      warnings.push({
        path: ['monitoring', 'analytics'],
        message: 'Analytics enabled but no analytics services configured.',
        severity: 'warning'
      });
    }

    if (config.features.enablePayments && !config.payments) {
      warnings.push({
        path: ['payments'],
        message: 'Payments enabled but no payment configuration provided.',
        severity: 'error'
      });
    }

    return warnings;
  }

  /**
   * Generate environment-specific warnings
   */
  private static generateEnvironmentWarnings(config: ValidatedEnvironmentConfig, environment: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    if (environment === 'development') {
      if (!config.features.enableMockServices && (!config.ai.openai && !config.ai.anthropic)) {
        warnings.push({
          path: ['features', 'enableMockServices'],
          message: 'Mock services disabled but no real AI services configured for development.',
          severity: 'warning'
        });
      }
    }

    return warnings;
  }
}

export interface ValidationError {
  path: (string | number)[];
  message: string;
  code: string;
  received?: any;
  expected?: any;
}

export interface ValidationWarning {
  path: (string | number)[];
  message: string;
  severity: 'info' | 'warning' | 'error';
}

/**
 * Startup validation function
 */
export async function validateStartupConfiguration(config: any, environment: string = 'development'): Promise<void> {
  const result = ConfigurationValidator.validateForEnvironment(config, environment);

  if (!result.isValid) {
    console.error('❌ Configuration validation failed:');
    
    // Group errors by category
    const criticalErrors = result.errors.filter(e => 
      e.code === 'PRODUCTION_REQUIREMENT' || 
      e.code === 'VALIDATION_ERROR' ||
      e.code === 'invalid_type'
    );
    
    const warnings = result.errors.filter(e => 
      e.code === 'PRODUCTION_RECOMMENDATION' || 
      e.code === 'STAGING_RECOMMENDATION'
    );

    if (criticalErrors.length > 0) {
      console.error('\n🚨 Critical Errors:');
      criticalErrors.forEach(error => {
        const path = error.path.length > 0 ? error.path.join('.') : 'root';
        console.error(`  - ${path}: ${error.message}`);
      });
    }

    if (warnings.length > 0) {
      console.warn('\n⚠️  Warnings:');
      warnings.forEach(warning => {
        const path = warning.path.length > 0 ? warning.path.join('.') : 'root';
        console.warn(`  - ${path}: ${warning.message}`);
      });
    }

    // Show configuration guidance
    console.error('\n📖 Configuration Help:');
    console.error('  1. Check your .env.local file exists and has the required values');
    console.error('  2. Refer to .env.example for the complete configuration template');
    console.error('  3. Ensure all URLs are valid and API keys have correct formats');
    console.error(`  4. For ${environment} environment, check environment-specific requirements`);

    // Only fail startup for critical errors
    if (criticalErrors.length > 0) {
      throw new Error('Configuration validation failed with critical errors');
    }
  } else {
    console.log('✅ Configuration validation passed');
    
    if (result.warnings.length > 0) {
      console.warn('\n⚠️  Configuration Warnings:');
      result.warnings.forEach(warning => {
        const path = warning.path.length > 0 ? warning.path.join('.') : 'root';
        console.warn(`  - ${path}: ${warning.message}`);
      });
    }
  }
}