/**
 * Environment variable validation and configuration
 * Provides runtime validation and type-safe access to environment variables
 */

import { z } from 'zod';

// Validation schema for environment variables
const envSchema = z.object({
  // Application Configuration (Required)
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  VITE_APP_NAME: z.string().default('HalluciFix'),
  VITE_APP_VERSION: z.string().default('1.0.0'),
  VITE_APP_URL: z.string().url().default('http://localhost:5173'),

  // Supabase Configuration (Required)
  VITE_SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anonymous key is required'),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  SUPABASE_PROJECT_ID: z.string().optional(),

  // AI Services (Optional)
  VITE_OPENAI_API_KEY: z.string().optional(),
  VITE_OPENAI_MODEL: z.string().default('gpt-4'),
  VITE_OPENAI_MAX_TOKENS: z.string().default('4000'),
  VITE_OPENAI_TEMPERATURE: z.string().default('0.1'),
  VITE_HALLUCIFIX_API_KEY: z.string().optional(),
  VITE_HALLUCIFIX_API_URL: z.string().url().optional(),

  // Google OAuth & Drive (Optional)
  VITE_GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  VITE_GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // Authentication (Optional)
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Stripe Payment Processing (Optional)
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID_BASIC_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ID_BASIC_YEARLY: z.string().optional(),
  STRIPE_PRICE_ID_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ID_PRO_YEARLY: z.string().optional(),
  STRIPE_PRICE_ID_API_CALLS: z.string().optional(),

  // Monitoring & Analytics (Optional)
  VITE_SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  VITE_GOOGLE_ANALYTICS_ID: z.string().optional(),
  VITE_MIXPANEL_TOKEN: z.string().optional(),

  // Feature Flags (Optional)
  VITE_ENABLE_ANALYTICS: z.string().transform(val => val === 'true').default('false'),
  VITE_ENABLE_PAYMENTS: z.string().transform(val => val === 'true').default('false'),
  VITE_ENABLE_BETA_FEATURES: z.string().transform(val => val === 'true').default('false'),
  VITE_ENABLE_MOCK_SERVICES: z.string().transform(val => val === 'true').default('true'),

  // Development & Logging (Optional)
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('pretty'),
  WEBHOOK_URL: z.string().url().optional(),
});

// Parse and validate environment variables
function parseEnvironment() {
  try {
    // Get environment variables from both process.env and import.meta.env
    const envVars = {
      ...process.env,
      ...import.meta.env,
    };

    return envSchema.parse(envVars);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .filter(err => err.code === 'invalid_type' && err.received === 'undefined')
        .map(err => err.path.join('.'));
      
      const invalidVars = error.errors
        .filter(err => err.code !== 'invalid_type' || err.received !== 'undefined')
        .map(err => `${err.path.join('.')}: ${err.message}`);

      let errorMessage = 'Environment validation failed:\n';
      
      if (missingVars.length > 0) {
        errorMessage += `\nMissing required variables:\n${missingVars.map(v => `  - ${v}`).join('\n')}`;
      }
      
      if (invalidVars.length > 0) {
        errorMessage += `\nInvalid variables:\n${invalidVars.map(v => `  - ${v}`).join('\n')}`;
      }

      errorMessage += '\n\nPlease check your .env.local file and ensure all required variables are set.';
      
      throw new Error(errorMessage);
    }
    throw error;
  }
}

// Export validated environment configuration
export const env = parseEnvironment();

// Validation function to call on app startup
export function validateEnvironment(): void {
  const requiredForProduction = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ];

  const requiredForPayments = [
    'VITE_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
  ];

  const requiredForAuth = [
    'VITE_GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
  ];

  // Check production requirements
  if (env.NODE_ENV === 'production') {
    const missingProd = requiredForProduction.filter(
      varName => !env[varName as keyof typeof env]
    );
    
    if (missingProd.length > 0) {
      throw new Error(
        `Missing required production environment variables: ${missingProd.join(', ')}`
      );
    }
  }

  // Check payment requirements if payments are enabled
  if (env.VITE_ENABLE_PAYMENTS) {
    const missingPayment = requiredForPayments.filter(
      varName => !env[varName as keyof typeof env]
    );
    
    if (missingPayment.length > 0) {
      console.warn(
        `Payments enabled but missing variables: ${missingPayment.join(', ')}. Payment features will be disabled.`
      );
    }
  }

  // Check auth requirements if not using mock services
  if (!env.VITE_ENABLE_MOCK_SERVICES) {
    const missingAuth = requiredForAuth.filter(
      varName => !env[varName as keyof typeof env]
    );
    
    if (missingAuth.length > 0) {
      console.warn(
        `Real authentication requires: ${missingAuth.join(', ')}. Falling back to mock authentication.`
      );
    }
  }

  console.log('✅ Environment validation passed');
}

// Helper functions for common environment checks
export const config = {
  // App configuration
  get appName() { return env.VITE_APP_NAME; },
  get appVersion() { return env.VITE_APP_VERSION; },
  get appUrl() { return env.VITE_APP_URL; },
  get isProduction() { return env.NODE_ENV === 'production'; },
  get isDevelopment() { return env.NODE_ENV === 'development'; },

  // Feature flags
  get enableAnalytics() { return env.VITE_ENABLE_ANALYTICS; },
  get enablePayments() { return env.VITE_ENABLE_PAYMENTS; },
  get enableBetaFeatures() { return env.VITE_ENABLE_BETA_FEATURES; },
  get enableMockServices() { return env.VITE_ENABLE_MOCK_SERVICES; },

  // Service availability checks
  get hasOpenAI() { return !!env.VITE_OPENAI_API_KEY; },
  get hasGoogleAuth() { return !!(env.VITE_GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET); },
  get hasStripe() { return !!(env.VITE_STRIPE_PUBLISHABLE_KEY && env.STRIPE_SECRET_KEY); },
  get hasSentry() { return !!env.VITE_SENTRY_DSN; },

  // Service configuration getters with validation
  get openaiApiKey() {
    if (!env.VITE_OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured. Set VITE_OPENAI_API_KEY in your environment.');
    }
    return env.VITE_OPENAI_API_KEY;
  },

  get googleClientId() {
    if (!env.VITE_GOOGLE_CLIENT_ID) {
      throw new Error('Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in your environment.');
    }
    return env.VITE_GOOGLE_CLIENT_ID;
  },

  get stripePublishableKey() {
    if (!env.VITE_STRIPE_PUBLISHABLE_KEY) {
      throw new Error('Stripe publishable key not configured. Set VITE_STRIPE_PUBLISHABLE_KEY in your environment.');
    }
    return env.VITE_STRIPE_PUBLISHABLE_KEY;
  },

  // Supabase configuration (always required)
  get supabaseUrl() { return env.VITE_SUPABASE_URL; },
  get supabaseAnonKey() { return env.VITE_SUPABASE_ANON_KEY; },
  get supabaseServiceKey() { return env.SUPABASE_SERVICE_KEY; },
};

// Development helper to log configuration status
export function logConfigurationStatus(): void {
  if (env.NODE_ENV === 'development') {
    console.group('🔧 Configuration Status');
    console.log('Environment:', env.NODE_ENV);
    console.log('Mock Services:', config.enableMockServices ? '✅ Enabled' : '❌ Disabled');
    console.log('OpenAI:', config.hasOpenAI ? '✅ Configured' : '⚠️ Not configured (using mocks)');
    console.log('Google Auth:', config.hasGoogleAuth ? '✅ Configured' : '⚠️ Not configured (using mocks)');
    console.log('Stripe:', config.hasStripe ? '✅ Configured' : '⚠️ Not configured');
    console.log('Analytics:', config.enableAnalytics ? '✅ Enabled' : '❌ Disabled');
    console.log('Payments:', config.enablePayments ? '✅ Enabled' : '❌ Disabled');
    console.groupEnd();
  }
}