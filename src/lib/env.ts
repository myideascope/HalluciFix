/**
 * Environment variable validation and configuration
 * Provides runtime validation and type-safe access to environment variables
 */

import { z } from "zod";

import { logger } from './logging';
// Validation schema for environment variables
const envSchema = z.object({
  // Application Configuration (Required)
  NODE_ENV: z.enum(["development", "staging", "production"]).default(
    "development",
  ),
  VITE_APP_NAME: z.string().default("HalluciFix"),
  VITE_APP_VERSION: z.string().default("1.0.0"),
  VITE_APP_URL: z.string().url().default("http://localhost:5173"),

  // Supabase Configuration (Legacy - will be replaced by Cognito)
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  SUPABASE_PROJECT_ID: z.string().optional(),

  // AWS Cognito Configuration (Required for AWS migration)
  VITE_COGNITO_USER_POOL_ID: z.string().optional(),
  VITE_COGNITO_USER_POOL_CLIENT_ID: z.string().optional(),
  VITE_COGNITO_REGION: z.string().default("us-east-1"),
  VITE_COGNITO_IDENTITY_POOL_ID: z.string().optional(),
  VITE_COGNITO_DOMAIN: z.string().optional(),

  // Read Replica Configuration (Optional)
  VITE_SUPABASE_READ_REPLICA_1_URL: z.string().url().optional(),
  VITE_SUPABASE_READ_REPLICA_1_KEY: z.string().optional(),
  VITE_SUPABASE_READ_REPLICA_2_URL: z.string().url().optional(),
  VITE_SUPABASE_READ_REPLICA_2_KEY: z.string().optional(),
  VITE_ENABLE_READ_REPLICAS: z.string().transform((val) => val === "true")
    .default("false"),

  // AI Services (Optional)
  VITE_OPENAI_API_KEY: z.string().optional(),
  VITE_OPENAI_MODEL: z.string().default("gpt-4"),
  VITE_OPENAI_MAX_TOKENS: z.string().default("4000"),
  VITE_OPENAI_TEMPERATURE: z.string().default("0.1"),
  VITE_HALLUCIFIX_API_KEY: z.string().optional(),
  VITE_HALLUCIFIX_API_URL: z.string().url().optional(),

  // Google OAuth & Drive (Optional)
  VITE_GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  VITE_GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_OAUTH_SCOPES: z.string().default("openid email profile https://www.googleapis.com/auth/drive.readonly"),

  // OAuth Security Configuration (Optional)
  OAUTH_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  OAUTH_STATE_SECRET: z.string().optional(),
  OAUTH_SESSION_SECRET: z.string().optional(),

  // OAuth Service Configuration (Optional)
  OAUTH_REFRESH_CHECK_INTERVAL_MS: z.string().transform((val) => parseInt(val) || 300000).default("300000"),
  OAUTH_REFRESH_BUFFER_MS: z.string().transform((val) => parseInt(val) || 300000).default("300000"),
  OAUTH_CLEANUP_INTERVAL_MS: z.string().transform((val) => parseInt(val) || 3600000).default("3600000"),
  OAUTH_TOKEN_GRACE_PERIOD_MS: z.string().transform((val) => parseInt(val) || 86400000).default("86400000"),

  // Authentication (Optional)
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default("24h"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

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
  VITE_ENABLE_ANALYTICS: z.string().transform((val) => val === "true").default(
    "false",
  ),
  VITE_ENABLE_PAYMENTS: z.string().transform((val) => val === "true").default(
    "false",
  ),
  VITE_ENABLE_BETA_FEATURES: z.string().transform((val) => val === "true")
    .default("false"),
  VITE_ENABLE_MOCK_SERVICES: z.string().transform((val) => val === "true")
    .default("true"),

  // Development & Logging (Optional)
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  LOG_FORMAT: z.enum(["json", "pretty"]).default("pretty"),
  WEBHOOK_URL: z.string().url().optional(),

  // Logging & Monitoring Services (Optional)
  DATADOG_API_KEY: z.string().optional(),
  DATADOG_SITE: z.string().default("datadoghq.com"),
  LOG_RETENTION_DAYS: z.string().transform((val) => parseInt(val) || 30).default("30"),
  LOG_MAX_SIZE_MB: z.string().transform((val) => parseInt(val) || 100).default("100"),
  ENABLE_LOG_AGGREGATION: z.string().transform((val) => val === "true").default("false"),
});

// Parse and validate environment variables
function parseEnvironment() {
  try {
    // Get environment variables - use import.meta.env in browser, process.env in Node.js
    const envVars = import.meta.env;

    return envSchema.parse(envVars);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .filter((err) =>
          err.code === "invalid_type" && err.received === "undefined"
        )
        .map((err) => err.path.join("."));

      const invalidVars = error.errors
        .filter((err) =>
          err.code !== "invalid_type" || err.received !== "undefined"
        )
        .map((err) => `${err.path.join(".")}: ${err.message}`);

      let errorMessage = "Environment validation failed:\n";

      if (missingVars.length > 0) {
        errorMessage += `\nMissing required variables:\n${
          missingVars.map((v) => `  - ${v}`).join("\n")
        }`;
      }

      if (invalidVars.length > 0) {
        errorMessage += `\nInvalid variables:\n${
          invalidVars.map((v) => `  - ${v}`).join("\n")
        }`;
      }

      errorMessage +=
        "\n\nPlease check your .env.local file and ensure all required variables are set.";

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
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
  ];

  const requiredForPayments = [
    "VITE_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_SECRET_KEY",
  ];

  const requiredForAuth = [
    "VITE_GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ];

  // Check production requirements
  if (env.NODE_ENV === "production") {
    const missingProd = requiredForProduction.filter(
      (varName) => !env[varName as keyof typeof env],
    );

    if (missingProd.length > 0) {
      throw new Error(
        `Missing required production environment variables: ${
          missingProd.join(", ")
        }`,
      );
    }
  }

  // Check payment requirements if payments are enabled
  if (env.VITE_ENABLE_PAYMENTS) {
    const missingPayment = requiredForPayments.filter(
      (varName) => !env[varName as keyof typeof env],
    );

    if (missingPayment.length > 0) {
      console.warn(
        `Payments enabled but missing variables: ${
          missingPayment.join(", ")
        }. Payment features will be disabled.`,
      );
    }
  }

  // Check auth requirements if not using mock services
  if (!env.VITE_ENABLE_MOCK_SERVICES) {
    const missingAuth = requiredForAuth.filter(
      (varName) => !env[varName as keyof typeof env],
    );

    if (missingAuth.length > 0) {
      console.warn(
        `Real authentication requires: ${
          missingAuth.join(", ")
        }. Falling back to mock authentication.`,
      );
    }
  }

  logger.debug("✅ Environment validation passed");
}

// Helper functions for common environment checks
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
  get isProduction() {
    return env.NODE_ENV === "production";
  },
  get isDevelopment() {
    return env.NODE_ENV === "development";
  },

  // Feature flags
  get enableAnalytics() {
    return env.VITE_ENABLE_ANALYTICS;
  },
  get enablePayments() {
    return env.VITE_ENABLE_PAYMENTS;
  },
  get enableBetaFeatures() {
    return env.VITE_ENABLE_BETA_FEATURES;
  },
  get enableMockServices() {
    return env.VITE_ENABLE_MOCK_SERVICES;
  },

  // Service availability checks
  get hasOpenAI() {
    return !!env.VITE_OPENAI_API_KEY;
  },
  get hasGoogleAuth() {
    // In browser environment, only client ID is needed (client secret is server-side only)
    if (typeof window !== 'undefined') {
      return !!env.VITE_GOOGLE_CLIENT_ID;
    }
    // In server environment, both are needed
    return !!(env.VITE_GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  },
  get hasOAuthSecurity() {
    // In browser environment, OAuth security is handled server-side
    if (typeof window !== 'undefined') {
      return true; // Assume security is configured server-side
    }
    // In server environment, check for actual values
    return !!(env.OAUTH_TOKEN_ENCRYPTION_KEY && env.OAUTH_STATE_SECRET && env.OAUTH_SESSION_SECRET);
  },
  get hasCompleteOAuth() {
    return this.hasGoogleAuth && this.hasOAuthSecurity;
  },
  get hasStripe() {
    return !!(env.VITE_STRIPE_PUBLISHABLE_KEY && env.STRIPE_SECRET_KEY);
  },
  get hasSentry() {
    return !!env.VITE_SENTRY_DSN;
  },
  get hasDataDog() {
    return !!env.DATADOG_API_KEY;
  },
  get hasLogAggregation() {
    return env.ENABLE_LOG_AGGREGATION;
  },

  // Service configuration getters with validation
  get openaiApiKey() {
    if (!env.VITE_OPENAI_API_KEY) {
      throw new Error(
        "OpenAI API key not configured. Set VITE_OPENAI_API_KEY in your environment.",
      );
    }
    return env.VITE_OPENAI_API_KEY;
  },

  get googleClientId() {
    if (!env.VITE_GOOGLE_CLIENT_ID) {
      throw new Error(
        "Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in your environment.",
      );
    }
    return env.VITE_GOOGLE_CLIENT_ID;
  },

  get stripePublishableKey() {
    if (!env.VITE_STRIPE_PUBLISHABLE_KEY) {
      throw new Error(
        "Stripe publishable key not configured. Set VITE_STRIPE_PUBLISHABLE_KEY in your environment.",
      );
    }
    return env.VITE_STRIPE_PUBLISHABLE_KEY;
  },

  // OAuth configuration getters
  get googleClientSecret() {
    if (!env.GOOGLE_CLIENT_SECRET) {
      throw new Error(
        "Google Client Secret not configured. Set GOOGLE_CLIENT_SECRET in your environment.",
      );
    }
    return env.GOOGLE_CLIENT_SECRET;
  },

  get oauthTokenEncryptionKey() {
    if (!env.OAUTH_TOKEN_ENCRYPTION_KEY) {
      throw new Error(
        "OAuth token encryption key not configured. Set OAUTH_TOKEN_ENCRYPTION_KEY in your environment.",
      );
    }
    return env.OAUTH_TOKEN_ENCRYPTION_KEY;
  },

  get oauthStateSecret() {
    if (!env.OAUTH_STATE_SECRET) {
      throw new Error(
        "OAuth state secret not configured. Set OAUTH_STATE_SECRET in your environment.",
      );
    }
    return env.OAUTH_STATE_SECRET;
  },

  get oauthSessionSecret() {
    if (!env.OAUTH_SESSION_SECRET) {
      throw new Error(
        "OAuth session secret not configured. Set OAUTH_SESSION_SECRET in your environment.",
      );
    }
    return env.OAUTH_SESSION_SECRET;
  },

  // Supabase configuration (legacy)
  get supabaseUrl() {
    return env.VITE_SUPABASE_URL;
  },
  get supabaseAnonKey() {
    return env.VITE_SUPABASE_ANON_KEY;
  },
  get supabaseServiceKey() {
    return env.SUPABASE_SERVICE_KEY;
  },

  // AWS Cognito configuration
  get cognitoUserPoolId() {
    return env.VITE_COGNITO_USER_POOL_ID;
  },
  get cognitoUserPoolClientId() {
    return env.VITE_COGNITO_USER_POOL_CLIENT_ID;
  },
  get cognitoRegion() {
    return env.VITE_COGNITO_REGION;
  },
  get cognitoIdentityPoolId() {
    return env.VITE_COGNITO_IDENTITY_POOL_ID;
  },
  get cognitoDomain() {
    return env.VITE_COGNITO_DOMAIN;
  },

  // Authentication provider selection
  get useCognito() {
    return !!(env.VITE_COGNITO_USER_POOL_ID && env.VITE_COGNITO_USER_POOL_CLIENT_ID);
  },
  get useSupabase() {
    return !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
  },

  // Database configuration
  database: {
    get supabaseUrl() {
      return env.VITE_SUPABASE_URL;
    },
    get supabaseAnonKey() {
      return env.VITE_SUPABASE_ANON_KEY;
    },
    get readReplica1Url() {
      return env.VITE_SUPABASE_READ_REPLICA_1_URL;
    },
    get readReplica1Key() {
      return env.VITE_SUPABASE_READ_REPLICA_1_KEY;
    },
    get readReplica2Url() {
      return env.VITE_SUPABASE_READ_REPLICA_2_URL;
    },
    get readReplica2Key() {
      return env.VITE_SUPABASE_READ_REPLICA_2_KEY;
    },
    get enableReadReplicas() {
      return env.VITE_ENABLE_READ_REPLICAS;
    },
  },

  // OAuth configuration
  oauth: {
    get clientId() {
      return env.VITE_GOOGLE_CLIENT_ID;
    },
    get clientSecret() {
      return env.GOOGLE_CLIENT_SECRET;
    },
    get redirectUri() {
      return env.VITE_GOOGLE_REDIRECT_URI || `${env.VITE_APP_URL}/auth/callback`;
    },
    get scopes() {
      return env.GOOGLE_OAUTH_SCOPES.split(' ').filter(Boolean);
    },
    get tokenEncryptionKey() {
      return env.OAUTH_TOKEN_ENCRYPTION_KEY;
    },
    get stateSecret() {
      return env.OAUTH_STATE_SECRET;
    },
    get sessionSecret() {
      return env.OAUTH_SESSION_SECRET;
    },
    get refreshCheckIntervalMs() {
      return env.OAUTH_REFRESH_CHECK_INTERVAL_MS;
    },
    get refreshBufferMs() {
      return env.OAUTH_REFRESH_BUFFER_MS;
    },
    get cleanupIntervalMs() {
      return env.OAUTH_CLEANUP_INTERVAL_MS;
    },
    get tokenGracePeriodMs() {
      return env.OAUTH_TOKEN_GRACE_PERIOD_MS;
    },
  },

  // Logging configuration
  logging: {
    get level() {
      return env.LOG_LEVEL;
    },
    get format() {
      return env.LOG_FORMAT;
    },
    get dataDogApiKey() {
      return env.DATADOG_API_KEY;
    },
    get dataDogSite() {
      return env.DATADOG_SITE;
    },
    get retentionDays() {
      return env.LOG_RETENTION_DAYS;
    },
    get maxSizeMB() {
      return env.LOG_MAX_SIZE_MB;
    },
    get enableAggregation() {
      return env.ENABLE_LOG_AGGREGATION;
    },
  },
};

// Development helper to log configuration status
export function logConfigurationStatus(): void {
  if (env.NODE_ENV === "development") {
    console.group("🔧 Configuration Status");
    logger.info("Environment:", { env.NODE_ENV });
    logger.info("Mock Services:", { config.enableMockServices ? "✅ Enabled" : "❌ Disabled",
     });
    logger.info("OpenAI:", { config.hasOpenAI ? "✅ Configured" : "⚠️ Not configured (using mocks })",
    );
    logger.info("Google Auth:", { config.hasGoogleAuth ? "✅ Configured" : "⚠️ Not configured (using mocks })",
    );
    logger.info("OAuth Security:", { config.hasOAuthSecurity ? "✅ Configured" : "⚠️ Not configured",
     });
    logger.info("Complete OAuth:", { config.hasCompleteOAuth ? "✅ Ready" : "⚠️ Incomplete configuration",
     });
    logger.info("Stripe:", { config.hasStripe ? "✅ Configured" : "⚠️ Not configured",
     });
    logger.info("Analytics:", { config.enableAnalytics ? "✅ Enabled" : "❌ Disabled",
     });
    logger.info("Payments:", { config.enablePayments ? "✅ Enabled" : "❌ Disabled",
     });
    console.groupEnd();
  }
}
