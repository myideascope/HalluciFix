/**
 * Configuration Service
 * Centralized configuration management for environment variables
 * Supports both Supabase (legacy) and AWS RDS configurations
 */

// Logger is imported lazily to avoid circular dependencies

// Configuration interfaces
export interface DatabaseConfig {
  // AWS RDS PostgreSQL configuration
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  maxConnections?: number;
  
  // Connection string (takes precedence)
  databaseUrl?: string;
  
  // AWS RDS IAM authentication
  useIamAuth?: boolean;
  awsRegion?: string;
}

export interface AuthConfig {
  google?: {
    clientId?: string;
    clientSecret?: string;
  };
}

export interface MonitoringConfig {
  sentry?: {
    dsn?: string;
    environment?: string;
  };
  analytics?: {
    enabled: boolean;
  };
}

export interface AWSConfig {
  region: string;
  cognitoUserPoolId?: string;
  cognitoClientId?: string;
  cognitoIdentityPoolId?: string;
  cognitoUserPoolDomain?: string;
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

export interface FeatureConfig {
  enableMockServices: boolean;
  enablePayments: boolean;
  enableAnalytics: boolean;
  enableBetaFeatures: boolean;
  enableReadReplicas: boolean;
}

export interface FullConfig {
  app: AppConfig;
  database: DatabaseConfig;
  aws: AWSConfig;
  ai: AIConfig;
  payment: PaymentConfig;
  features: FeatureConfig;
  auth: AuthConfig;
  monitoring: MonitoringConfig;
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
        features: this.getFeatureConfig(),
        auth: this.getAuthConfig(),
        monitoring: this.getMonitoringConfig(),
      };

      this._initialized = true;
      
      const { logger } = await import('./logging');
      const configLogger = logger.child({ component: 'ConfigService' });
      configLogger.info('Configuration initialized successfully', {
        environment: this._config.app.environment,
        hasDatabase: !!(this._config.database.databaseUrl || this._config.database.host),
        hasAWS: !!this._config.aws.cognitoUserPoolId,
        hasAI: !!this._config.ai.openaiApiKey || !!this._config.ai.anthropicApiKey,
        hasPayment: !!this._config.payment.stripePublishableKey,
      });

    } catch (error) {
      const { logger } = await import('./logging');
      const configLogger = logger.child({ component: 'ConfigService' });
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
    * Get full configuration synchronously (throws if not initialized)
    */
  getConfigSync(): FullConfig {
    if (!this._initialized) {
      throw new Error('Configuration not initialized. Call initialize() first.');
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
    * Get feature configuration (async to ensure initialization)
    */
  async getFeatures(): Promise<FeatureConfig> {
    const config = await this.getConfig();
    return config.features;
  }

  /**
    * Get auth configuration (async to ensure initialization)
    */
  async getAuth(): Promise<AuthConfig> {
    const config = await this.getConfig();
    return config.auth;
  }

  /**
    * Get monitoring configuration (async to ensure initialization)
    */
  async getMonitoring(): Promise<MonitoringConfig> {
    const config = await this.getConfig();
    return config.monitoring;
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
    return !!(db.databaseUrl || db.host);
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

    // AWS RDS PostgreSQL configuration (primary database)
    config.databaseUrl = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
    config.host = process.env.DB_HOST;
    config.port = process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined;
    config.database = process.env.DB_NAME;
    config.username = process.env.DB_USERNAME;
    config.password = process.env.DB_PASSWORD;
    config.ssl = process.env.DB_SSL !== 'false';
    config.maxConnections = process.env.DB_MAX_CONNECTIONS ? parseInt(process.env.DB_MAX_CONNECTIONS) : 20;
    
    // AWS RDS IAM authentication (optional)
    config.useIamAuth = process.env.DB_USE_IAM_AUTH === 'true';
    config.awsRegion = process.env.DB_AWS_REGION || process.env.AWS_REGION || 'us-east-1';

    return config;
  }

  private getAWSConfig(): AWSConfig {
    return {
      region: process.env.AWS_REGION || process.env.VITE_AWS_REGION || 'us-east-1',
      cognitoUserPoolId: process.env.VITE_COGNITO_USER_POOL_ID,
      cognitoClientId: process.env.VITE_COGNITO_USER_POOL_CLIENT_ID || process.env.VITE_COGNITO_CLIENT_ID,
      cognitoIdentityPoolId: process.env.VITE_COGNITO_IDENTITY_POOL_ID,
      cognitoUserPoolDomain: process.env.VITE_COGNITO_USER_POOL_DOMAIN,
      s3BucketName: process.env.VITE_AWS_S3_BUCKET || process.env.VITE_S3_BUCKET_NAME,
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

  private getFeatureConfig(): FeatureConfig {
    return {
      enableMockServices: process.env.VITE_ENABLE_MOCK_SERVICES === 'true',
      enablePayments: process.env.VITE_ENABLE_PAYMENTS === 'true',
      enableAnalytics: process.env.VITE_ENABLE_ANALYTICS === 'true',
      enableBetaFeatures: process.env.VITE_ENABLE_BETA_FEATURES === 'true',
      enableReadReplicas: process.env.VITE_ENABLE_READ_REPLICAS === 'true',
    };
  }

  private getAuthConfig(): AuthConfig {
    return {
      google: {
        clientId: process.env.VITE_GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    };
  }

  private getMonitoringConfig(): MonitoringConfig {
    return {
      sentry: {
        dsn: process.env.VITE_SENTRY_DSN,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      },
      analytics: {
        enabled: process.env.VITE_ENABLE_ANALYTICS === 'true',
      },
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
      if (!config.database.databaseUrl && !config.database.host) {
        errors.push('No database configuration found. Set DATABASE_URL or DB_HOST');
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

export async function getFeatures(): Promise<FeatureConfig> {
  return config.getFeatures();
}

export async function getAuth(): Promise<AuthConfig> {
  return config.getAuth();
}

export async function getMonitoring(): Promise<MonitoringConfig> {
  return config.getMonitoring();
}