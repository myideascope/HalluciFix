/**
 * Environment variable type definitions
 * Provides type safety for all environment variables used in the application
 */

export interface EnvironmentVariables {
  // Application Configuration
  NODE_ENV: 'development' | 'staging' | 'production';
  VITE_APP_NAME: string;
  VITE_APP_VERSION: string;
  VITE_APP_URL: string;
  VITE_API_BASE_URL?: string;

  // Supabase Configuration
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY?: string;
  SUPABASE_PROJECT_ID?: string;

  // AI Services
  VITE_OPENAI_API_KEY?: string;
  VITE_OPENAI_MODEL?: string;
  VITE_OPENAI_MAX_TOKENS?: string;
  VITE_OPENAI_TEMPERATURE?: string;
  VITE_HALLUCIFIX_API_KEY?: string;
  VITE_HALLUCIFIX_API_URL?: string;

  // Google OAuth & Drive
  VITE_GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  VITE_GOOGLE_REDIRECT_URI?: string;

  // Authentication
  JWT_SECRET?: string;
  JWT_EXPIRES_IN?: string;
  JWT_REFRESH_EXPIRES_IN?: string;

  // Stripe Payment Processing
  VITE_STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID_BASIC_MONTHLY?: string;
  STRIPE_PRICE_ID_BASIC_YEARLY?: string;
  STRIPE_PRICE_ID_PRO_MONTHLY?: string;
  STRIPE_PRICE_ID_PRO_YEARLY?: string;
  STRIPE_PRICE_ID_API_CALLS?: string;

  // Monitoring & Analytics
  VITE_SENTRY_DSN?: string;
  SENTRY_AUTH_TOKEN?: string;
  VITE_GOOGLE_ANALYTICS_ID?: string;
  VITE_MIXPANEL_TOKEN?: string;

  // Feature Flags
  VITE_ENABLE_ANALYTICS?: string;
  VITE_ENABLE_PAYMENTS?: string;
  VITE_ENABLE_BETA_FEATURES?: string;
  VITE_ENABLE_MOCK_SERVICES?: string;

  // Development & Logging
  LOG_LEVEL?: string;
  LOG_FORMAT?: string;
  WEBHOOK_URL?: string;
}

export type RequiredEnvVars = Pick<
  EnvironmentVariables,
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_ANON_KEY'
  | 'NODE_ENV'
>;

export type OptionalEnvVars = Omit<EnvironmentVariables, keyof RequiredEnvVars>;