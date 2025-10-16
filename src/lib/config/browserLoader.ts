/**
 * Browser-compatible configuration loader
 * Loads configuration from environment variables available in the browser
 */

import { EnvironmentConfig } from './types.js';
import { ConfigurationError } from './errors.js';
import { parseValue, setNestedValue } from './mapping.js';
import { ConfigurationValidator, validateStartupConfiguration } from './schema.js';

export class BrowserConfigurationLoader {
  async loadAndValidateConfiguration(): Promise<EnvironmentConfig> {
    const config = await this.loadConfiguration();
    // Force development mode for browser builds unless explicitly set to production
    const environment = import.meta.env.VITE_NODE_ENV || 'development';
    
    console.log('🔧 Configuration loaded:', config);
    console.log('🌍 Environment:', environment);
    
    // In development mode, skip strict validation and just return the config
    if (environment === 'development') {
      console.log('🚀 Development mode: Skipping strict validation');
      return config as EnvironmentConfig;
    }
    
    const validation = ConfigurationValidator.validateForEnvironment(config, environment);
    
    if (!validation.isValid) {
      console.error('❌ Configuration validation failed:', validation.errors);
      throw new ConfigurationError(
        `Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`
      );
    }

    console.log('✅ Configuration validation passed');
    return config;
  }

  private async loadConfiguration(): Promise<EnvironmentConfig> {
    // In browser, we only have access to import.meta.env (Vite environment variables)
    const envVars = import.meta.env;
    
    // Create base configuration structure
    const config: Partial<EnvironmentConfig> = {
      app: {
        name: this.parseValue(envVars.VITE_APP_NAME, 'HalluciFix'),
        version: this.parseValue(envVars.VITE_APP_VERSION, '1.0.0'),
        environment: this.parseValue(envVars.NODE_ENV || envVars.MODE, 'development') as 'development' | 'staging' | 'production',
        url: this.parseValue(envVars.VITE_APP_URL, 'http://localhost:5173'),
        port: this.parseValue(envVars.PORT, 5173),
        logLevel: this.parseValue(envVars.LOG_LEVEL, 'info') as 'error' | 'warn' | 'info' | 'debug'
      },
      database: {
        supabaseUrl: this.parseValue(envVars.VITE_SUPABASE_URL, ''),
        supabaseAnonKey: this.parseValue(envVars.VITE_SUPABASE_ANON_KEY, ''),
        supabaseServiceKey: this.parseValue(envVars.SUPABASE_SERVICE_KEY),
        connectionPoolSize: this.parseValue(envVars.DB_CONNECTION_POOL_SIZE, 10),
        queryTimeout: this.parseValue(envVars.DB_QUERY_TIMEOUT, 30000)
      },
      ai: {
        openai: envVars.VITE_OPENAI_API_KEY ? {
          apiKey: envVars.VITE_OPENAI_API_KEY,
          model: this.parseValue(envVars.VITE_OPENAI_MODEL, 'gpt-4'),
          maxTokens: this.parseValue(envVars.VITE_OPENAI_MAX_TOKENS, 4000),
          temperature: this.parseValue(envVars.VITE_OPENAI_TEMPERATURE, 0.1)
        } : undefined,
        anthropic: envVars.VITE_ANTHROPIC_API_KEY ? {
          apiKey: envVars.VITE_ANTHROPIC_API_KEY,
          model: this.parseValue(envVars.VITE_ANTHROPIC_MODEL, 'claude-3-sonnet-20240229'),
          maxTokens: this.parseValue(envVars.VITE_ANTHROPIC_MAX_TOKENS, 4000),
          temperature: this.parseValue(envVars.VITE_ANTHROPIC_TEMPERATURE, 0.1)
        } : undefined,
        hallucifix: envVars.VITE_HALLUCIFIX_API_KEY ? {
          apiKey: envVars.VITE_HALLUCIFIX_API_KEY,
          apiUrl: this.parseValue(envVars.VITE_HALLUCIFIX_API_URL, 'https://api.hallucifix.com')
        } : undefined
      },
      auth: {
        google: {
          clientId: this.parseValue(envVars.VITE_GOOGLE_CLIENT_ID, ''),
          clientSecret: '', // Client secret should never be exposed to browser
          redirectUri: this.parseValue(envVars.VITE_GOOGLE_REDIRECT_URI, '')
        },
        jwt: {
          secret: this.parseValue(envVars.JWT_SECRET, ''),
          expiresIn: this.parseValue(envVars.JWT_EXPIRES_IN, '24h'),
          refreshExpiresIn: this.parseValue(envVars.JWT_REFRESH_EXPIRES_IN, '7d')
        }
      },
      payments: envVars.VITE_STRIPE_PUBLISHABLE_KEY ? {
        stripe: {
          publishableKey: envVars.VITE_STRIPE_PUBLISHABLE_KEY,
          secretKey: this.parseValue(envVars.STRIPE_SECRET_KEY, ''),
          webhookSecret: this.parseValue(envVars.STRIPE_WEBHOOK_SECRET, ''),
          priceIds: {
            basicMonthly: this.parseValue(envVars.STRIPE_PRICE_ID_BASIC_MONTHLY, ''),
            basicYearly: this.parseValue(envVars.STRIPE_PRICE_ID_BASIC_YEARLY, ''),
            proMonthly: this.parseValue(envVars.STRIPE_PRICE_ID_PRO_MONTHLY, ''),
            proYearly: this.parseValue(envVars.STRIPE_PRICE_ID_PRO_YEARLY, ''),
            apiCalls: this.parseValue(envVars.STRIPE_PRICE_ID_API_CALLS, '')
          }
        }
      } : undefined,
      monitoring: {
        sentry: envVars.VITE_SENTRY_DSN ? {
          dsn: envVars.VITE_SENTRY_DSN,
          authToken: this.parseValue(envVars.SENTRY_AUTH_TOKEN, ''),
          environment: this.parseValue(envVars.NODE_ENV || envVars.MODE, 'development')
        } : undefined,
        analytics: envVars.VITE_GOOGLE_ANALYTICS_ID || envVars.VITE_MIXPANEL_TOKEN ? {
          googleAnalyticsId: this.parseValue(envVars.VITE_GOOGLE_ANALYTICS_ID, ''),
          mixpanelToken: this.parseValue(envVars.VITE_MIXPANEL_TOKEN, '')
        } : undefined,
        logging: {
          level: this.parseValue(envVars.LOG_LEVEL, 'info') as 'error' | 'warn' | 'info' | 'debug',
          format: this.parseValue(envVars.LOG_FORMAT, 'pretty') as 'json' | 'pretty'
        }
      },
      features: {
        enableAnalytics: this.parseValue(envVars.VITE_ENABLE_ANALYTICS, false),
        enablePayments: this.parseValue(envVars.VITE_ENABLE_PAYMENTS, false),
        enableBetaFeatures: this.parseValue(envVars.VITE_ENABLE_BETA_FEATURES, false),
        enableRagAnalysis: this.parseValue(envVars.VITE_ENABLE_RAG_ANALYSIS, true),
        enableBatchProcessing: this.parseValue(envVars.VITE_ENABLE_BATCH_PROCESSING, true)
      },
      security: {
        encryptionKey: this.parseValue(envVars.ENCRYPTION_KEY, ''),
        corsOrigins: this.parseValue(envVars.CORS_ORIGINS, 'http://localhost:5173').split(','),
        rateLimiting: {
          windowMs: this.parseValue(envVars.RATE_LIMIT_WINDOW_MS, 900000), // 15 minutes
          maxRequests: this.parseValue(envVars.RATE_LIMIT_MAX_REQUESTS, 100)
        }
      }
    };

    return config as EnvironmentConfig;
  }

  private parseValue(value: any, defaultValue?: any): any {
    return parseValue(value, defaultValue);
  }
}