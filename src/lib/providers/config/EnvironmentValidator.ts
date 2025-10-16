/**
 * Environment Variable Validator for Provider Configurations
 * Validates and securely loads environment variables for API providers
 */

import { z } from 'zod';

// Validation schemas for different provider types
const aiProviderSchema = z.object({
  VITE_OPENAI_API_KEY: z.string().optional(),
  VITE_OPENAI_MODEL: z.string().default('gpt-4'),
  VITE_OPENAI_MAX_TOKENS: z.string().transform(val => parseInt(val) || 4000).default('4000'),
  VITE_OPENAI_TEMPERATURE: z.string().transform(val => parseFloat(val) || 0.1).default('0.1'),
  
  VITE_ANTHROPIC_API_KEY: z.string().optional(),
  VITE_ANTHROPIC_MODEL: z.string().default('claude-3-sonnet-20240229'),
  VITE_ANTHROPIC_MAX_TOKENS: z.string().transform(val => parseInt(val) || 4000).default('4000'),
  VITE_ANTHROPIC_TEMPERATURE: z.string().transform(val => parseFloat(val) || 0.1).default('0.1'),
  
  VITE_HALLUCIFIX_API_KEY: z.string().optional(),
  VITE_HALLUCIFIX_API_URL: z.string().url().default('https://api.hallucifix.com'),
});

const authProviderSchema = z.object({
  VITE_GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  VITE_GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_OAUTH_SCOPES: z.string().default('openid email profile https://www.googleapis.com/auth/drive.readonly'),
  
  // OAuth Security
  OAUTH_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
  OAUTH_STATE_SECRET: z.string().min(16).optional(),
  OAUTH_SESSION_SECRET: z.string().min(16).optional(),
  
  // OAuth Service Configuration
  OAUTH_REFRESH_CHECK_INTERVAL_MS: z.string().transform(val => parseInt(val) || 300000).default('300000'),
  OAUTH_REFRESH_BUFFER_MS: z.string().transform(val => parseInt(val) || 300000).default('300000'),
  OAUTH_CLEANUP_INTERVAL_MS: z.string().transform(val => parseInt(val) || 3600000).default('3600000'),
  OAUTH_TOKEN_GRACE_PERIOD_MS: z.string().transform(val => parseInt(val) || 86400000).default('86400000'),
});

const knowledgeProviderSchema = z.object({
  // News API (optional)
  NEWS_API_KEY: z.string().optional(),
  
  // Wikipedia settings
  WIKIPEDIA_LANGUAGE: z.string().default('en'),
  WIKIPEDIA_CACHE_TTL: z.string().transform(val => parseInt(val) || 3600000).default('3600000'),
  
  // Academic sources settings
  ARXIV_CACHE_TTL: z.string().transform(val => parseInt(val) || 7200000).default('7200000'),
  PUBMED_CACHE_TTL: z.string().transform(val => parseInt(val) || 7200000).default('7200000'),
  
  // General knowledge provider settings
  KNOWLEDGE_MAX_CONCURRENT_REQUESTS: z.string().transform(val => parseInt(val) || 10).default('10'),
  KNOWLEDGE_RELIABILITY_THRESHOLD: z.string().transform(val => parseFloat(val) || 0.8).default('0.8'),
});

const generalSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  VITE_ENABLE_MOCK_SERVICES: z.string().transform(val => val === 'true').default('true'),
  
  // Rate limiting
  PROVIDER_RATE_LIMIT_WINDOW_MS: z.string().transform(val => parseInt(val) || 60000).default('60000'),
  PROVIDER_MAX_REQUESTS_PER_WINDOW: z.string().transform(val => parseInt(val) || 100).default('100'),
  
  // Circuit breaker
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.string().transform(val => parseInt(val) || 5).default('5'),
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: z.string().transform(val => parseInt(val) || 30000).default('30000'),
  
  // Health checks
  PROVIDER_HEALTH_CHECK_INTERVAL_MS: z.string().transform(val => parseInt(val) || 60000).default('60000'),
  PROVIDER_HEALTH_CHECK_TIMEOUT_MS: z.string().transform(val => parseInt(val) || 10000).default('10000'),
});

export interface ValidatedEnvironment {
  ai: z.infer<typeof aiProviderSchema>;
  auth: z.infer<typeof authProviderSchema>;
  knowledge: z.infer<typeof knowledgeProviderSchema>;
  general: z.infer<typeof generalSchema>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  environment: ValidatedEnvironment | null;
}

export interface SecurityValidationResult {
  isSecure: boolean;
  issues: string[];
  recommendations: string[];
}

export class EnvironmentValidator {
  private static instance: EnvironmentValidator;
  private validatedEnv: ValidatedEnvironment | null = null;
  private lastValidation: Date | null = null;

  private constructor() {}

  static getInstance(): EnvironmentValidator {
    if (!EnvironmentValidator.instance) {
      EnvironmentValidator.instance = new EnvironmentValidator();
    }
    return EnvironmentValidator.instance;
  }

  /**
   * Validate all environment variables
   */
  validateEnvironment(): ValidationResult {
    try {
      const envVars = this.getEnvironmentVariables();
      
      const ai = aiProviderSchema.parse(envVars);
      const auth = authProviderSchema.parse(envVars);
      const knowledge = knowledgeProviderSchema.parse(envVars);
      const general = generalSchema.parse(envVars);

      const environment: ValidatedEnvironment = {
        ai,
        auth,
        knowledge,
        general
      };

      this.validatedEnv = environment;
      this.lastValidation = new Date();

      const warnings = this.generateWarnings(environment);

      return {
        isValid: true,
        errors: [],
        warnings,
        environment
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = (error.errors || []).map(err => 
          `${err.path?.join('.') || 'unknown'}: ${err.message}`
        );
        
        return {
          isValid: false,
          errors,
          warnings: [],
          environment: null
        };
      }
      
      return {
        isValid: false,
        errors: [`Validation failed: ${error}`],
        warnings: [],
        environment: null
      };
    }
  }

  /**
   * Validate security configuration
   */
  validateSecurity(): SecurityValidationResult {
    const result: SecurityValidationResult = {
      isSecure: true,
      issues: [],
      recommendations: []
    };

    if (!this.validatedEnv) {
      const validation = this.validateEnvironment();
      if (!validation.isValid) {
        result.isSecure = false;
        result.issues.push('Environment validation failed');
        return result;
      }
    }

    const env = this.validatedEnv!;

    // Check API key security
    this.validateApiKeySecurity(env, result);
    
    // Check OAuth security
    this.validateOAuthSecurity(env, result);
    
    // Check general security settings
    this.validateGeneralSecurity(env, result);

    return result;
  }

  /**
   * Validate API key security
   */
  private validateApiKeySecurity(env: ValidatedEnvironment, result: SecurityValidationResult): void {
    // Check OpenAI API key format
    if (env.ai.VITE_OPENAI_API_KEY) {
      if (!env.ai.VITE_OPENAI_API_KEY.startsWith('sk-')) {
        result.isSecure = false;
        result.issues.push('OpenAI API key format is invalid');
      }
      if (env.ai.VITE_OPENAI_API_KEY.length < 40) {
        result.isSecure = false;
        result.issues.push('OpenAI API key appears to be too short');
      }
    }

    // Check Anthropic API key format
    if (env.ai.VITE_ANTHROPIC_API_KEY) {
      if (env.ai.VITE_ANTHROPIC_API_KEY.length < 20) {
        result.isSecure = false;
        result.issues.push('Anthropic API key appears to be too short');
      }
    }

    // Warn about API keys in client-side environment variables
    if (typeof window !== 'undefined') {
      if (env.ai.VITE_OPENAI_API_KEY) {
        result.recommendations.push('Consider moving OpenAI API key to server-side for production');
      }
      if (env.ai.VITE_ANTHROPIC_API_KEY) {
        result.recommendations.push('Consider moving Anthropic API key to server-side for production');
      }
    }
  }

  /**
   * Validate OAuth security
   */
  private validateOAuthSecurity(env: ValidatedEnvironment, result: SecurityValidationResult): void {
    // Check OAuth secrets
    if (env.auth.VITE_GOOGLE_CLIENT_ID && !env.auth.GOOGLE_CLIENT_SECRET) {
      result.recommendations.push('Google OAuth client secret is missing (required for server-side auth)');
    }

    // Check encryption keys
    if (env.auth.OAUTH_TOKEN_ENCRYPTION_KEY && env.auth.OAUTH_TOKEN_ENCRYPTION_KEY.length < 32) {
      result.isSecure = false;
      result.issues.push('OAuth token encryption key must be at least 32 characters');
    }

    if (env.auth.OAUTH_STATE_SECRET && env.auth.OAUTH_STATE_SECRET.length < 16) {
      result.isSecure = false;
      result.issues.push('OAuth state secret must be at least 16 characters');
    }

    if (env.auth.OAUTH_SESSION_SECRET && env.auth.OAUTH_SESSION_SECRET.length < 16) {
      result.isSecure = false;
      result.issues.push('OAuth session secret must be at least 16 characters');
    }

    // Check redirect URI
    if (env.auth.VITE_GOOGLE_REDIRECT_URI) {
      const redirectUri = env.auth.VITE_GOOGLE_REDIRECT_URI;
      if (env.general.NODE_ENV === 'production' && redirectUri.includes('localhost')) {
        result.isSecure = false;
        result.issues.push('Production OAuth redirect URI should not use localhost');
      }
      if (!redirectUri.startsWith('https://') && env.general.NODE_ENV === 'production') {
        result.isSecure = false;
        result.issues.push('Production OAuth redirect URI must use HTTPS');
      }
    }
  }

  /**
   * Validate general security settings
   */
  private validateGeneralSecurity(env: ValidatedEnvironment, result: SecurityValidationResult): void {
    // Check production settings
    if (env.general.NODE_ENV === 'production') {
      if (env.general.VITE_ENABLE_MOCK_SERVICES) {
        result.isSecure = false;
        result.issues.push('Mock services should be disabled in production');
      }
    }

    // Check rate limiting
    if (env.general.PROVIDER_MAX_REQUESTS_PER_WINDOW > 1000) {
      result.recommendations.push('Consider lowering rate limit for better security');
    }
  }

  /**
   * Generate warnings for missing optional configurations
   */
  private generateWarnings(env: ValidatedEnvironment): string[] {
    const warnings: string[] = [];

    // AI provider warnings
    if (!env.ai.VITE_OPENAI_API_KEY && !env.ai.VITE_ANTHROPIC_API_KEY && !env.ai.VITE_HALLUCIFIX_API_KEY) {
      warnings.push('No AI providers configured - will use mock analysis');
    }

    // Auth provider warnings
    if (!env.auth.VITE_GOOGLE_CLIENT_ID) {
      warnings.push('No OAuth providers configured - will use mock authentication');
    }

    // Security warnings
    if (!env.auth.OAUTH_TOKEN_ENCRYPTION_KEY && env.auth.VITE_GOOGLE_CLIENT_ID) {
      warnings.push('OAuth token encryption key not set - tokens will not be encrypted');
    }

    // Development warnings
    if (env.general.NODE_ENV === 'development' && env.general.VITE_ENABLE_MOCK_SERVICES) {
      warnings.push('Mock services enabled - some features will use simulated data');
    }

    return warnings;
  }

  /**
   * Get environment variables from appropriate source
   */
  private getEnvironmentVariables(): Record<string, string> {
    // In browser, use import.meta.env; in Node.js, use process.env
    if (typeof window !== 'undefined') {
      return { ...import.meta.env } as Record<string, string>;
    } else {
      return { ...process.env, ...import.meta.env } as Record<string, string>;
    }
  }

  /**
   * Get validated environment (cached)
   */
  getValidatedEnvironment(): ValidatedEnvironment | null {
    if (!this.validatedEnv || !this.lastValidation) {
      const validation = this.validateEnvironment();
      return validation.environment;
    }

    // Re-validate if cache is older than 5 minutes
    const cacheAge = Date.now() - this.lastValidation.getTime();
    if (cacheAge > 300000) { // 5 minutes
      const validation = this.validateEnvironment();
      return validation.environment;
    }

    return this.validatedEnv;
  }

  /**
   * Check if specific provider type is configured
   */
  isProviderConfigured(type: 'ai' | 'auth' | 'knowledge'): boolean {
    const env = this.getValidatedEnvironment();
    if (!env) return false;

    switch (type) {
      case 'ai':
        return !!(env.ai.VITE_OPENAI_API_KEY || env.ai.VITE_ANTHROPIC_API_KEY || env.ai.VITE_HALLUCIFIX_API_KEY);
      case 'auth':
        return !!env.auth.VITE_GOOGLE_CLIENT_ID;
      case 'knowledge':
        return true; // Knowledge providers don't require API keys
      default:
        return false;
    }
  }

  /**
   * Get configuration status summary
   */
  getConfigurationStatus(): Record<string, boolean> {
    const env = this.getValidatedEnvironment();
    if (!env) return {};

    return {
      openai: !!env.ai.VITE_OPENAI_API_KEY,
      anthropic: !!env.ai.VITE_ANTHROPIC_API_KEY,
      hallucifix: !!env.ai.VITE_HALLUCIFIX_API_KEY,
      googleAuth: !!env.auth.VITE_GOOGLE_CLIENT_ID,
      googleAuthComplete: !!(env.auth.VITE_GOOGLE_CLIENT_ID && env.auth.GOOGLE_CLIENT_SECRET),
      oauthSecurity: !!(env.auth.OAUTH_TOKEN_ENCRYPTION_KEY && env.auth.OAUTH_STATE_SECRET),
      mockServices: env.general.VITE_ENABLE_MOCK_SERVICES,
      production: env.general.NODE_ENV === 'production'
    };
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validatedEnv = null;
    this.lastValidation = null;
  }
}

// Export singleton instance
export const environmentValidator = EnvironmentValidator.getInstance();