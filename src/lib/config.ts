/**
 * Configuration Service
 * Centralized configuration management for environment variables
 * Supports both Supabase (legacy) and AWS RDS configurations
 */

import { logger } from './logging';

const configLogger = logger.child({ component: 'ConfigService' });

// Configuration interfaces
export interface DatabaseConfig {
  // RDS PostgreSQL configuration
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  maxConnections?: number;
  
  // Legacy Supabase configuration (for migration period)
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  
  // Connection string (takes precedence)
  databaseUrl?: string;
}

export interface AWSConfig {
  region: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
  cognitoIdentityPoolId?: string;
  s3BucketName?: string;
  cloudFrontDomain?: string;
  lambdaFunctionPrefix?: string;
}

export interface AIConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  bedrockRegion?: string;
  bedrockAccessKeyId?: string;
  bedrockSecretAccessKey?: string;
}

export interface PaymentConfig {
  stripePublishableKey?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
}

export interface AppConfig {
  environment: 'development' | 'staging' | 'production';
  appUrl: string;
  apiUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableAnalytics: boolean;
  enableErrorReporting: boolean;
}

export interface FullConfig {
  app: AppConfig;
  database: DatabaseConfig;
  aws: AWSConfig;
  ai: AIConfig;
  payment: PaymentConfig;
}

class ConfigService {
  private _config: FullConfig | null = null;
  private _initialized = false;

  /**
   * Initialize configuration from environment variables
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    try {
      this._config = {
        app: this.getAppConfig(),
        database: this.getDatabaseConfig(),
        aws: this.getAWSConfig(),
        ai: this.getAIConfig(),
        payment: this.getPaymentConfig(),
      };

      this._initialized = true;
      
      configLogger.info('Configuration initialized successfully', {
        environment: this._config.app.environment,
        hasDatabase: !!this._config.database.databaseUrl || !!this._config.database.host,
        hasSupabase: !!this._config.database.supabaseUrl,
        hasAWS: !!this._config.aws.cognitoUserPoolId,
        hasAI: !!this._config.ai.openaiApiKey || !!this._config.ai.anthropicApiKey,
        hasPayment: !!this._config.payment.stripePublishableKey,
      });

    } catch (error) {
      configLogger.error('Failed to initialize configuration', error as Error);
      throw error;
    }
  }

  /**
   * Get full configuration (async to ensure initialization)
   */
  async getConfig(): Promise<FullConfig> {
    if (!this._initialized) {
      await this.initialize();
    }
    return this._config!;
  }

  /**
   * Get database configuration (async to ensure initialization)
   */
  async getDatabase(): Promise<DatabaseConfig> {
    const config = await this.getConfig();
    return config.database;
  }

  /**
   * Get AWS configuration (async to ensure initialization)
   */
  async getAWS(): Promise<AWSConfig> {
    const config = await this.getConfig();
    return config.aws;
  }

  /**
   * Get AI configuration (async to ensure initialization)
   */
  async getAI(): Promise<AIConfig> {
    const config = await this.getConfig();
    return config.ai;
  }

  /**
   * Get payment configuration (async to ensure initialization)
   */
  async getPayment(): Promise<PaymentConfig> {
    const config = await this.getConfig();
    return config.payment;
  }

  /**
   * Get app configuration (async to ensure initialization)
   */
  async getApp(): Promise<AppConfig> {
    const config = await this.getConfig();
    return config.app;
  }

  /**
   * Check if we're in migration mode (both Supabase and RDS configured)
   */
  async isMigrationMode(): Promise<boolean> {
    const db = await this.getDatabase();
    return !!(db.supabaseUrl && (db.databaseUrl || db.host));
  }

  /**
   * Check if we should use RDS (post-migration)
   */
  async shouldUseRDS(): Promise<boolean> {
    const db = await this.getDatabase();
    return !!(db.databaseUrl || db.host);
  }

  // Private methods for parsing environment variables

  private getAppConfig(): AppConfig {
    const environment = (process.env.NODE_ENV || 'development') as AppConfig['environment'];
    
    return {
      environment,
      appUrl: process.env.VITE_APP_URL || 'http://localhost:5173',
      apiUrl: process.env.VITE_API_GATEWAY_URL || process.env.VITE_API_URL || 'http://localhost:3000',
      logLevel: (process.env.LOG_LEVEL || 'info') as AppConfig['logLevel'],
      enableAnalytics: process.env.VITE_ENABLE_ANALYTICS === 'true' || process.env.ENABLE_ANALYTICS === 'true',
      enableErrorReporting: process.env.VITE_ENABLE_ERROR_REPORTING === 'true' || process.env.ENABLE_ERROR_REPORTING === 'true',
    };
  }

  private getDatabaseConfig(): DatabaseConfig {
    const config: DatabaseConfig = {};

    // AWS RDS PostgreSQL configuration (primary)
    config.databaseUrl = process.env.DATABASE_URL;
    config.host = process.env.DB_HOST;
    config.port = process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432;
    config.database = process.env.DB_NAME || process.env.DB_DATABASE;
    config.username = process.env.DB_USER || process.env.DB_USERNAME;
    config.password = process.env.DB_PASSWORD;
    config.ssl = process.env.DB_SSL !== 'false'; // Default to true for AWS RDS
    config.maxConnections = process.env.DB_MAX_CONNECTIONS ? parseInt(process.env.DB_MAX_CONNECTIONS) : 20;

    // Legacy Supabase configuration (for migration period only)
    config.supabaseUrl = process.env.VITE_SUPABASE_URL;
    config.supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
    config.supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    return config;
  }

  private getAWSConfig(): AWSConfig {
    return {
      region: process.env.AWS_REGION || process.env.VITE_AWS_REGION || 'us-east-1',
      cognitoUserPoolId: process.env.VITE_COGNITO_USER_POOL_ID,
      cognitoClientId: process.env.VITE_COGNITO_USER_POOL_CLIENT_ID || process.env.VITE_COGNITO_CLIENT_ID,
      cognitoIdentityPoolId: process.env.VITE_COGNITO_IDENTITY_POOL_ID,
      s3BucketName: process.env.VITE_S3_BUCKET_NAME,
      cloudFrontDomain: process.env.VITE_CLOUDFRONT_DOMAIN,
      lambdaFunctionPrefix: process.env.LAMBDA_FUNCTION_PREFIX || 'hallucifix',
    };
  }

  private getAIConfig(): AIConfig {
    return {
      openaiApiKey: process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
      bedrockRegion: process.env.VITE_BEDROCK_REGION || process.env.BEDROCK_REGION || process.env.AWS_REGION || process.env.VITE_AWS_REGION,
      bedrockAccessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.BEDROCK_ACCESS_KEY_ID,
      bedrockSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.BEDROCK_SECRET_ACCESS_KEY,
    };
  }

  private getPaymentConfig(): PaymentConfig {
    return {
      stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY,
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    };
  }

  /**
   * Validate configuration
   */
  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      const config = await this.getConfig();

      // Validate database configuration
      if (!config.database.databaseUrl && !config.database.host && !config.database.supabaseUrl) {
        errors.push('No database configuration found. Set DATABASE_URL, DB_HOST, or VITE_SUPABASE_URL');
      }

      // Validate AWS configuration for production
      if (config.app.environment === 'production') {
        if (!config.aws.cognitoUserPoolId) {
          errors.push('VITE_COGNITO_USER_POOL_ID is required for production');
        }
        if (!config.aws.s3BucketName) {
          errors.push('VITE_S3_BUCKET_NAME is required for production');
        }
      }

      // Validate AI configuration
      if (!config.ai.openaiApiKey && !config.ai.anthropicApiKey && !config.ai.bedrockAccessKeyId) {
        errors.push('At least one AI provider must be configured (OpenAI, Anthropic, or Bedrock)');
      }

      // Validate payment configuration for production
      if (config.app.environment === 'production' && !config.payment.stripeSecretKey) {
        errors.push('STRIPE_SECRET_KEY is required for production');
      }

      return {
        valid: errors.length === 0,
        errors,
      };

    } catch (error) {
      errors.push(`Configuration validation failed: ${(error as Error).message}`);
      return {
        valid: false,
        errors,
      };
    }
  }
}

// Create singleton instance
export const config = new ConfigService();

// Helper functions for backward compatibility
export async function getDatabase(): Promise<DatabaseConfig> {
  return config.getDatabase();
}

export async function getAWS(): Promise<AWSConfig> {
  return config.getAWS();
}

export async function getAI(): Promise<AIConfig> {
  return config.getAI();
}

export async function getPayment(): Promise<PaymentConfig> {
  return config.getPayment();
}

export async function getApp(): Promise<AppConfig> {
  return config.getApp();
}