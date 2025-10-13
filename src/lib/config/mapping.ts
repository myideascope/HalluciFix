/**
 * Environment variable to configuration path mapping
 * Maps flat environment variables to nested configuration structure
 */

export const ENV_VAR_MAPPINGS: Record<string, string[]> = {
  // Application Configuration
  'VITE_APP_NAME': ['app', 'name'],
  'VITE_APP_VERSION': ['app', 'version'],
  'NODE_ENV': ['app', 'environment'],
  'VITE_APP_URL': ['app', 'url'],
  'PORT': ['app', 'port'],
  'LOG_LEVEL': ['app', 'logLevel'],
  
  // Database Configuration
  'VITE_SUPABASE_URL': ['database', 'supabaseUrl'],
  'VITE_SUPABASE_ANON_KEY': ['database', 'supabaseAnonKey'],
  'SUPABASE_SERVICE_KEY': ['database', 'supabaseServiceKey'],
  'DB_CONNECTION_POOL_SIZE': ['database', 'connectionPoolSize'],
  'DB_QUERY_TIMEOUT': ['database', 'queryTimeout'],
  
  // Read Replica Configuration
  'VITE_SUPABASE_READ_REPLICA_1_URL': ['database', 'readReplicas', 'replica1', 'url'],
  'VITE_SUPABASE_READ_REPLICA_1_KEY': ['database', 'readReplicas', 'replica1', 'key'],
  'VITE_SUPABASE_READ_REPLICA_2_URL': ['database', 'readReplicas', 'replica2', 'url'],
  'VITE_SUPABASE_READ_REPLICA_2_KEY': ['database', 'readReplicas', 'replica2', 'key'],
  'VITE_ENABLE_READ_REPLICAS': ['database', 'readReplicas', 'enabled'],
  
  // AI Services Configuration
  'VITE_OPENAI_API_KEY': ['ai', 'openai', 'apiKey'],
  'VITE_OPENAI_MODEL': ['ai', 'openai', 'model'],
  'VITE_OPENAI_MAX_TOKENS': ['ai', 'openai', 'maxTokens'],
  'VITE_OPENAI_TEMPERATURE': ['ai', 'openai', 'temperature'],
  
  'VITE_ANTHROPIC_API_KEY': ['ai', 'anthropic', 'apiKey'],
  'VITE_ANTHROPIC_MODEL': ['ai', 'anthropic', 'model'],
  'VITE_ANTHROPIC_MAX_TOKENS': ['ai', 'anthropic', 'maxTokens'],
  
  'VITE_HALLUCIFIX_API_KEY': ['ai', 'hallucifix', 'apiKey'],
  'VITE_HALLUCIFIX_API_URL': ['ai', 'hallucifix', 'apiUrl'],
  
  // Authentication Configuration
  'VITE_GOOGLE_CLIENT_ID': ['auth', 'google', 'clientId'],
  'GOOGLE_CLIENT_SECRET': ['auth', 'google', 'clientSecret'],
  'VITE_GOOGLE_REDIRECT_URI': ['auth', 'google', 'redirectUri'],
  
  'JWT_SECRET': ['auth', 'jwt', 'secret'],
  'JWT_EXPIRES_IN': ['auth', 'jwt', 'expiresIn'],
  'JWT_REFRESH_EXPIRES_IN': ['auth', 'jwt', 'refreshExpiresIn'],
  
  // Payment Configuration
  'VITE_STRIPE_PUBLISHABLE_KEY': ['payments', 'stripe', 'publishableKey'],
  'STRIPE_SECRET_KEY': ['payments', 'stripe', 'secretKey'],
  'STRIPE_WEBHOOK_SECRET': ['payments', 'stripe', 'webhookSecret'],
  'STRIPE_PRICE_ID_BASIC_MONTHLY': ['payments', 'stripe', 'priceIds', 'basicMonthly'],
  'STRIPE_PRICE_ID_BASIC_YEARLY': ['payments', 'stripe', 'priceIds', 'basicYearly'],
  'STRIPE_PRICE_ID_PRO_MONTHLY': ['payments', 'stripe', 'priceIds', 'proMonthly'],
  'STRIPE_PRICE_ID_PRO_YEARLY': ['payments', 'stripe', 'priceIds', 'proYearly'],
  'STRIPE_PRICE_ID_API_CALLS': ['payments', 'stripe', 'priceIds', 'apiCalls'],
  
  // Monitoring Configuration
  'VITE_SENTRY_DSN': ['monitoring', 'sentry', 'dsn'],
  'SENTRY_ENVIRONMENT': ['monitoring', 'sentry', 'environment'],
  'SENTRY_TRACES_SAMPLE_RATE': ['monitoring', 'sentry', 'tracesSampleRate'],
  'SENTRY_AUTH_TOKEN': ['monitoring', 'sentry', 'authToken'],
  
  'VITE_GOOGLE_ANALYTICS_ID': ['monitoring', 'analytics', 'googleAnalyticsId'],
  'VITE_MIXPANEL_TOKEN': ['monitoring', 'analytics', 'mixpanelToken'],
  
  'LOG_FORMAT': ['monitoring', 'logging', 'format'],
  'LOG_DESTINATION': ['monitoring', 'logging', 'destination'],
  
  // Feature Flags
  'VITE_ENABLE_ANALYTICS': ['features', 'enableAnalytics'],
  'VITE_ENABLE_PAYMENTS': ['features', 'enablePayments'],
  'VITE_ENABLE_BETA_FEATURES': ['features', 'enableBetaFeatures'],
  'VITE_ENABLE_RAG_ANALYSIS': ['features', 'enableRagAnalysis'],
  'VITE_ENABLE_BATCH_PROCESSING': ['features', 'enableBatchProcessing'],
  'VITE_ENABLE_MOCK_SERVICES': ['features', 'enableMockServices'],
  
  // Security Configuration
  'CORS_ORIGINS': ['security', 'corsOrigins'],
  'RATE_LIMIT_WINDOW': ['security', 'rateLimitWindow'],
  'RATE_LIMIT_MAX': ['security', 'rateLimitMax'],
  'ENCRYPTION_KEY': ['security', 'encryptionKey'],
  'SESSION_SECRET': ['security', 'sessionSecret'],
};

/**
 * Parse a value from string to appropriate type
 */
export function parseValue(value: string): any {
  // Parse boolean values
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  
  // Parse numeric values
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  
  // Parse arrays (comma-separated)
  if (value.includes(',')) {
    return value.split(',').map(item => item.trim());
  }
  
  return value;
}

/**
 * Set a nested value in an object using a path array
 */
export function setNestedValue(obj: any, path: string[], value: any): void {
  const lastKey = path.pop()!;
  const target = path.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

/**
 * Get the configuration path for an environment variable
 */
export function getConfigPath(envKey: string): string[] | null {
  return ENV_VAR_MAPPINGS[envKey] || null;
}