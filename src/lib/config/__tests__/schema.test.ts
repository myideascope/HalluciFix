/**
 * Configuration schema validation tests
 * Tests validation logic, error reporting, and environment-specific requirements
 */

import { describe, it, expect } from 'vitest';
import { ConfigurationValidator, validateStartupConfiguration } from '../schema.js';

describe('ConfigurationValidator', () => {
  const validBaseConfig = {
    app: {
      name: 'Test App',
      version: '1.0.0',
      environment: 'development',
      url: 'http://localhost:5173',
      port: 5173,
      logLevel: 'info'
    },
    database: {
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
      connectionPoolSize: 10,
      queryTimeout: 30000
    },
    ai: {},
    auth: {
      google: {
        clientId: '123456789-abc.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-test-secret',
        redirectUri: 'http://localhost:5173/auth/callback'
      },
      jwt: {
        secret: 'super-secret-jwt-key-that-is-long-enough-for-security',
        expiresIn: '24h',
        refreshExpiresIn: '7d'
      }
    },
    monitoring: {
      logging: {
        level: 'info',
        format: 'pretty',
        destination: 'console'
      }
    },
    features: {
      enableAnalytics: true,
      enablePayments: false,
      enableBetaFeatures: false,
      enableRagAnalysis: true,
      enableBatchProcessing: true,
      enableMockServices: true
    },
    security: {
      corsOrigins: ['http://localhost:5173'],
      rateLimitWindow: 900000,
      rateLimitMax: 100,
      encryptionKey: 'encryption-key-that-is-long-enough-for-security',
      sessionSecret: 'session-secret-that-is-long-enough-for-security'
    }
  };

  describe('Basic Validation', () => {
    it('should validate correct configuration', () => {
      // Act
      const result = ConfigurationValidator.validate(validBaseConfig);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });

    it('should reject configuration with missing required fields', () => {
      // Arrange
      const invalidConfig = {
        ...validBaseConfig,
        database: {
          // Missing supabaseUrl and supabaseAnonKey
          connectionPoolSize: 10,
          queryTimeout: 30000
        }
      };

      // Act
      const result = ConfigurationValidator.validate(invalidConfig);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.path.includes('supabaseUrl'))).toBe(true);
      expect(result.errors.some(e => e.path.includes('supabaseAnonKey'))).toBe(true);
    });

    it('should reject invalid URL formats', () => {
      // Arrange
      const invalidConfig = {
        ...validBaseConfig,
        app: {
          ...validBaseConfig.app,
          url: 'not-a-valid-url'
        },
        database: {
          ...validBaseConfig.database,
          supabaseUrl: 'also-not-a-url'
        }
      };

      // Act
      const result = ConfigurationValidator.validate(invalidConfig);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.path.includes('url'))).toBe(true);
      expect(result.errors.some(e => e.path.includes('supabaseUrl'))).toBe(true);
    });

    it('should reject invalid port numbers', () => {
      // Arrange
      const invalidConfig = {
        ...validBaseConfig,
        app: {
          ...validBaseConfig.app,
          port: 70000 // Invalid port number
        }
      };

      // Act
      const result = ConfigurationValidator.validate(invalidConfig);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.path.includes('port'))).toBe(true);
    });

    it('should reject invalid version format', () => {
      // Arrange
      const invalidConfig = {
        ...validBaseConfig,
        app: {
          ...validBaseConfig.app,
          version: 'not-semver'
        }
      };

      // Act
      const result = ConfigurationValidator.validate(invalidConfig);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.path.includes('version'))).toBe(true);
    });
  });

  describe('API Key Validation', () => {
    it('should validate OpenAI API key format', () => {
      // Arrange
      const configWithOpenAI = {
        ...validBaseConfig,
        ai: {
          openai: {
            apiKey: 'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
            model: 'gpt-4',
            maxTokens: 4000,
            temperature: 0.1
          }
        }
      };

      // Act
      const result = ConfigurationValidator.validate(configWithOpenAI);

      // Assert
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid OpenAI API key format', () => {
      // Arrange
      const configWithInvalidOpenAI = {
        ...validBaseConfig,
        ai: {
          openai: {
            apiKey: 'invalid-openai-key',
            model: 'gpt-4',
            maxTokens: 4000,
            temperature: 0.1
          }
        }
      };

      // Act
      const result = ConfigurationValidator.validate(configWithInvalidOpenAI);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('OpenAI API key'))).toBe(true);
    });

    it('should validate Anthropic API key format', () => {
      // Arrange
      const configWithAnthropic = {
        ...validBaseConfig,
        ai: {
          anthropic: {
            apiKey: 'sk-ant-api03-test-key',
            model: 'claude-3-sonnet-20240229',
            maxTokens: 4000
          }
        }
      };

      // Act
      const result = ConfigurationValidator.validate(configWithAnthropic);

      // Assert
      expect(result.isValid).toBe(true);
    });

    it('should validate Google OAuth credentials format', () => {
      // Arrange - validBaseConfig already has valid Google OAuth

      // Act
      const result = ConfigurationValidator.validate(validBaseConfig);

      // Assert
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid Google Client ID format', () => {
      // Arrange
      const invalidConfig = {
        ...validBaseConfig,
        auth: {
          ...validBaseConfig.auth,
          google: {
            ...validBaseConfig.auth.google,
            clientId: 'invalid-client-id'
          }
        }
      };

      // Act
      const result = ConfigurationValidator.validate(invalidConfig);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Google Client ID'))).toBe(true);
    });

    it('should validate Stripe key formats', () => {
      // Arrange
      const configWithStripe = {
        ...validBaseConfig,
        payments: {
          stripe: {
            publishableKey: 'pk_test_1234567890abcdef',
            secretKey: 'sk_test_1234567890abcdef',
            webhookSecret: 'whsec_1234567890abcdef',
            priceIds: {
              basicMonthly: 'price_1234567890abcdef',
              basicYearly: 'price_abcdef1234567890',
              proMonthly: 'price_fedcba0987654321',
              proYearly: 'price_123456fedcba0987'
            }
          }
        }
      };

      // Act
      const result = ConfigurationValidator.validate(configWithStripe);

      // Assert
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid Stripe key formats', () => {
      // Arrange
      const configWithInvalidStripe = {
        ...validBaseConfig,
        payments: {
          stripe: {
            publishableKey: 'invalid-publishable-key',
            secretKey: 'invalid-secret-key',
            webhookSecret: 'invalid-webhook-secret',
            priceIds: {
              basicMonthly: 'invalid-price-id',
              basicYearly: 'price_valid',
              proMonthly: 'price_valid2',
              proYearly: 'price_valid3'
            }
          }
        }
      };

      // Act
      const result = ConfigurationValidator.validate(configWithInvalidStripe);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('publishable key'))).toBe(true);
      expect(result.errors.some(e => e.message.includes('secret key'))).toBe(true);
      expect(result.errors.some(e => e.message.includes('webhook secret'))).toBe(true);
      expect(result.errors.some(e => e.message.includes('price ID'))).toBe(true);
    });
  });

  describe('Security Validation', () => {
    it('should require minimum JWT secret length', () => {
      // Arrange
      const configWithShortJWT = {
        ...validBaseConfig,
        auth: {
          ...validBaseConfig.auth,
          jwt: {
            ...validBaseConfig.auth.jwt,
            secret: 'short'
          }
        }
      };

      // Act
      const result = ConfigurationValidator.validate(configWithShortJWT);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('32 characters'))).toBe(true);
    });

    it('should require minimum encryption key length', () => {
      // Arrange
      const configWithShortKey = {
        ...validBaseConfig,
        security: {
          ...validBaseConfig.security,
          encryptionKey: 'short'
        }
      };

      // Act
      const result = ConfigurationValidator.validate(configWithShortKey);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('32 characters'))).toBe(true);
    });

    it('should validate CORS origins format', () => {
      // Arrange
      const configWithInvalidCORS = {
        ...validBaseConfig,
        security: {
          ...validBaseConfig.security,
          corsOrigins: ['not-a-url', 'also-not-a-url']
        }
      };

      // Act
      const result = ConfigurationValidator.validate(configWithInvalidCORS);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.path.includes('corsOrigins'))).toBe(true);
    });
  });

  describe('Environment-Specific Validation', () => {
    it('should require service key for production', () => {
      // Arrange
      const productionConfig = {
        ...validBaseConfig,
        app: {
          ...validBaseConfig.app,
          environment: 'production'
        }
        // Missing supabaseServiceKey
      };

      // Act
      const result = ConfigurationValidator.validateForEnvironment(productionConfig, 'production');

      // Assert
      expect(result.errors.some(e => 
        e.code === 'PRODUCTION_REQUIREMENT' && 
        e.path.includes('supabaseServiceKey')
      )).toBe(true);
    });

    it('should require strong JWT secret for production', () => {
      // Arrange
      const productionConfig = {
        ...validBaseConfig,
        app: {
          ...validBaseConfig.app,
          environment: 'production'
        },
        database: {
          ...validBaseConfig.database,
          supabaseServiceKey: 'service-key'
        },
        auth: {
          ...validBaseConfig.auth,
          jwt: {
            ...validBaseConfig.auth.jwt,
            secret: 'short-secret-for-production' // Less than 64 characters
          }
        }
      };

      // Act
      const result = ConfigurationValidator.validateForEnvironment(productionConfig, 'production');

      // Assert
      expect(result.errors.some(e => 
        e.code === 'PRODUCTION_REQUIREMENT' && 
        e.message.includes('64 characters')
      )).toBe(true);
    });

    it('should warn about mock services in production', () => {
      // Arrange
      const productionConfig = {
        ...validBaseConfig,
        app: {
          ...validBaseConfig.app,
          environment: 'production'
        },
        database: {
          ...validBaseConfig.database,
          supabaseServiceKey: 'service-key'
        },
        auth: {
          ...validBaseConfig.auth,
          jwt: {
            ...validBaseConfig.auth.jwt,
            secret: 'super-long-jwt-secret-for-production-that-is-more-than-64-characters'
          }
        },
        features: {
          ...validBaseConfig.features,
          enableMockServices: true
        }
      };

      // Act
      const result = ConfigurationValidator.validateForEnvironment(productionConfig, 'production');

      // Assert
      expect(result.errors.some(e => 
        e.code === 'PRODUCTION_REQUIREMENT' && 
        e.message.includes('Mock services')
      )).toBe(true);
    });

    it('should recommend monitoring for production', () => {
      // Arrange
      const productionConfig = {
        ...validBaseConfig,
        app: {
          ...validBaseConfig.app,
          environment: 'production'
        },
        database: {
          ...validBaseConfig.database,
          supabaseServiceKey: 'service-key'
        },
        auth: {
          ...validBaseConfig.auth,
          jwt: {
            ...validBaseConfig.auth.jwt,
            secret: 'super-long-jwt-secret-for-production-that-is-more-than-64-characters'
          }
        },
        features: {
          ...validBaseConfig.features,
          enableMockServices: false
        },
        monitoring: {
          ...validBaseConfig.monitoring
          // Missing sentry configuration
        }
      };

      // Act
      const result = ConfigurationValidator.validateForEnvironment(productionConfig, 'production');

      // Assert
      expect(result.errors.some(e => 
        e.code === 'PRODUCTION_RECOMMENDATION' && 
        e.message.includes('monitoring')
      )).toBe(true);
    });
  });

  describe('Warning Generation', () => {
    it('should warn when no AI services are configured', () => {
      // Act
      const result = ConfigurationValidator.validate(validBaseConfig);

      // Assert
      expect(result.warnings.some(w => 
        w.message.includes('No AI services configured')
      )).toBe(true);
    });

    it('should warn when payments enabled but not configured', () => {
      // Arrange
      const configWithPaymentsEnabled = {
        ...validBaseConfig,
        features: {
          ...validBaseConfig.features,
          enablePayments: true
        }
        // No payments configuration
      };

      // Act
      const result = ConfigurationValidator.validate(configWithPaymentsEnabled);

      // Assert
      expect(result.warnings.some(w => 
        w.message.includes('Payments enabled but no payment configuration')
      )).toBe(true);
    });

    it('should warn when analytics enabled but not configured', () => {
      // Arrange
      const configWithAnalyticsEnabled = {
        ...validBaseConfig,
        features: {
          ...validBaseConfig.features,
          enableAnalytics: true
        },
        monitoring: {
          ...validBaseConfig.monitoring
          // No analytics configuration
        }
      };

      // Act
      const result = ConfigurationValidator.validate(configWithAnalyticsEnabled);

      // Assert
      expect(result.warnings.some(w => 
        w.message.includes('Analytics enabled but no analytics services')
      )).toBe(true);
    });
  });

  describe('Startup Validation', () => {
    it('should pass startup validation for valid configuration', async () => {
      // Act & Assert
      await expect(validateStartupConfiguration(validBaseConfig, 'development')).resolves.toBeUndefined();
    });

    it('should throw for invalid configuration', async () => {
      // Arrange
      const invalidConfig = {
        ...validBaseConfig,
        database: {
          supabaseUrl: 'invalid-url'
        }
      };

      // Act & Assert
      await expect(validateStartupConfiguration(invalidConfig, 'development')).rejects.toThrow();
    });
  });
});