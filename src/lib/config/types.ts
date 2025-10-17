/**
 * Configuration type definitions
 * Defines the complete configuration structure for the application
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
      temperature?: number;
    };
    hallucifix?: {
      apiKey: string;
      apiUrl: string;
    };
  };
  
  // Authentication Configuration
  auth: {
    google: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
    };
    jwt: {
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
      level: string;
      format: 'json' | 'pretty';
      destination: 'console' | 'file' | 'external';
      externalService?: {
        apiKey: string;
        endpoint: string;
      };
    };
    performance: {
      enabled: boolean;
      batchSize: number;
      flushIntervalMs: number;
      aggregationIntervalMs: number;
      retentionPeriodMs: number;
    };
    datadog?: {
      apiKey: string;
      site?: string;
    };
    newrelic?: {
      apiKey: string;
      accountId: string;
    };
    customEndpoint?: string;
  };
  
  // Feature Flags
  features: {
    enableAnalytics: boolean;
    enablePayments: boolean;
    enableBetaFeatures: boolean;
    enableRagAnalysis: boolean;
    enableBatchProcessing: boolean;
    enableMockServices: boolean;
  };
  
  // Security Configuration
  security: {
    corsOrigins: string[];
    rateLimitWindow: number;
    rateLimitMax: number;
    encryptionKey: string;
    sessionSecret: string;
  };
}

export interface ConfigurationSource {
  name: string;
  priority: number;
  load(): Promise<Partial<EnvironmentConfig>> | Partial<EnvironmentConfig>;
}

export interface SecretManagerProvider {
  getSecret(key: string): Promise<string | null>;
  getSecrets(keys: string[]): Promise<Record<string, string>>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}