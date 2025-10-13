/**
 * TypeScript interfaces for comprehensive environment configuration
 * Provides type-safe access to all configuration sections
 */

export interface EnvironmentConfig {
  // Application Configuration
  app: {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
    url: string;
    port: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  
  // Database Configuration
  database: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseServiceKey?: string;
    connectionPoolSize: number;
    queryTimeout: number;
    readReplicas?: {
      replica1?: {
        url: string;
        key: string;
      };
      replica2?: {
        url: string;
        key: string;
      };
      enabled: boolean;
    };
  };
  
  // AI Services Configuration
  ai: {
    openai?: {
      apiKey: string;
      model: string;
      maxTokens: number;
      temperature: number;
    };
    anthropic?: {
      apiKey: string;
      model: string;
      maxTokens: number;
    };
    hallucifix?: {
      apiKey: string;
      apiUrl: string;
    };
  };
  
  // Authentication Configuration
  auth: {
    google?: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    };
    jwt?: {
      secret: string;
      expiresIn: string;
      refreshExpiresIn: string;
    };
  };
  
  // Payment Configuration
  payments?: {
    stripe: {
      publishableKey: string;
      secretKey: string;
      webhookSecret: string;
      priceIds: {
        basicMonthly: string;
        basicYearly: string;
        proMonthly: string;
        proYearly: string;
        apiCalls?: string;
      };
    };
  };
  
  // Monitoring Configuration
  monitoring: {
    sentry?: {
      dsn: string;
      environment: string;
      tracesSampleRate: number;
      authToken?: string;
    };
    analytics?: {
      googleAnalyticsId: string;
      mixpanelToken: string;
    };
    logging: {
      level: 'debug' | 'info' | 'warn' | 'error';
      format: 'json' | 'pretty';
      destination: 'console' | 'file' | 'external';
    };
  };
  
  // Feature Flags
  features: {
    enableAnalytics: boolean;
    enablePayments: boolean;
    enableBetaFeatures: boolean;
    enableRagAnalysis: boolean;
    enableBatchProcessing: boolean;
    enableMockServices: boolean;
    enableReadReplicas: boolean;
  };
  
  // Security Configuration
  security: {
    corsOrigins: string[];
    rateLimitWindow: number;
    rateLimitMax: number;
    encryptionKey?: string;
    sessionSecret?: string;
  };
  
  // Development Configuration
  development?: {
    webhookUrl?: string;
    hotReload: boolean;
    debugMode: boolean;
  };
}

/**
 * Configuration source types for precedence handling
 */
export type ConfigurationSource = 
  | 'runtime'
  | 'local'
  | 'environment-specific'
  | 'default'
  | 'secrets';

/**
 * Configuration validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingRequired: string[];
  missingOptional: string[];
}

/**
 * Environment variable mapping configuration
 */
export interface EnvironmentMapping {
  envKey: string;
  configPath: string[];
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'array';
  defaultValue?: any;
  validation?: {
    pattern?: RegExp;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
}