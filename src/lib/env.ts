/**
 * Minimal Environment Configuration for Supabase Replacement
 * Simplified configuration to get the migration working
 */

import { z } from "zod";

import { logger } from './logging';

// Minimal environment schema for immediate needs
const envSchema = z.object({
  // Basic app configuration
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  VITE_APP_NAME: z.string().default("HalluciFix"),
  VITE_APP_VERSION: z.string().default("1.0.0"),
  VITE_APP_URL: z.string().url().default("http://localhost:5173"),
  
  // Database configuration (for AWS replacement)
  VITE_SUPABASE_URL: z.string().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().optional(),
  
  // AWS Database configuration
  AWS_REGION: z.string().default("us-east-1"),
  RDS_CLUSTER_ARN: z.string().optional(),
  RDS_SECRET_ARN: z.string().optional(),
  RDS_RESOURCE_ARN: z.string().optional(),
  RDS_DATABASE_NAME: z.string().optional(),
  
  // AI Provider Configuration (minimal)
  VITE_OPENAI_API_KEY: z.string().optional(),
  VITE_OPENAI_MODEL: z.string().default("gpt-4o"),
  VITE_OPENAI_MAX_TOKENS: z.string().default("4000"),
  VITE_OPENAI_TEMPERATURE: z.string().default("0.7"),
  VITE_ANTHROPIC_API_KEY: z.string().optional(),
  VITE_ANTHROPIC_MODEL: z.string().default("claude-3-sonnet-20240229"),
  VITE_ANTHROPIC_MAX_TOKENS: z.string().default("4000"),
  
  // Feature flags (simple boolean strings)
  VITE_ENABLE_ANALYTICS: z.string().default("false"),
  VITE_ENABLE_PAYMENTS: z.string().default("false"),
  VITE_ENABLE_BETA_FEATURES: z.string().default("false"),
});

// Parse environment variables
function parseEnvironment() {
  try {
    const envVars = import.meta.env;
    return envSchema.parse(envVars);
  } catch (error) {
    logger.error("Environment validation failed:", error);
    throw error;
  }
}

// Parsed environment
const env = parseEnvironment();

// Export environment variables with type-safe access
export { env };

// Export simplified configuration object
export const config = {
  // App configuration
  get appName() {
    return env.VITE_APP_NAME;
  },
  get appVersion() {
    return env.VITE_APP_VERSION;
  },
  get appUrl() {
    return env.VITE_APP_URL;
  },
  get environment() {
    return env.NODE_ENV;
  },
  
  // Database configuration
  get supabaseUrl() {
    return env.VITE_SUPABASE_URL;
  },
  get supabaseAnonKey() {
    return env.VITE_SUPABASE_ANON_KEY;
  },
  
  // AWS Database configuration
  get awsRegion() {
    return env.AWS_REGION;
  },
  get rdsClusterArn() {
    return env.RDS_CLUSTER_ARN;
  },
  get rdsSecretArn() {
    return env.RDS_SECRET_ARN;
  },
  get rdsResourceArn() {
    return env.RDS_RESOURCE_ARN;
  },
  get rdsDatabaseName() {
    return env.RDS_DATABASE_NAME;
  },
  
  // AI configuration
  get openaiApiKey() {
    return env.VITE_OPENAI_API_KEY;
  },
  get openaiModel() {
    return env.VITE_OPENAI_MODEL;
  },
  get openaiMaxTokens() {
    return parseInt(env.VITE_OPENAI_MAX_TOKENS);
  },
  get openaiTemperature() {
    return parseFloat(env.VITE_OPENAI_TEMPERATURE);
  },
  get anthropicApiKey() {
    return env.VITE_ANTHROPIC_API_KEY;
  },
  get anthropicModel() {
    return env.VITE_ANTHROPIC_MODEL;
  },
  get anthropicMaxTokens() {
    return parseInt(env.VITE_ANTHROPIC_MAX_TOKENS);
  },
  
  // Feature flags
  get enableAnalytics() {
    return env.VITE_ENABLE_ANALYTICS === "true";
  },
  get enablePayments() {
    return env.VITE_ENABLE_PAYMENTS === "true";
  },
  get enableBetaFeatures() {
    return env.VITE_ENABLE_BETA_FEATURES === "true";
  },
  
  // Environment checks
  get isProduction() {
    return env.NODE_ENV === "production";
  },
  get isDevelopment() {
    return env.NODE_ENV === "development";
  },
  get isStaging() {
    return env.NODE_ENV === "staging";
  },
};

// Export type for the config object
export type Config = typeof config;

// Export validation function for backward compatibility
export function validateEnvironment(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Basic validation - in a real implementation, add more checks
  if (!config.appName) {
    errors.push('App name is required');
  }
  
  if (!config.environment) {
    errors.push('Environment is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}