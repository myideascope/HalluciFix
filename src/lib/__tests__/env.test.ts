import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Mock environment variables
const mockEnv = {
  NODE_ENV: 'development',
  VITE_APP_NAME: 'HalluciFix',
  VITE_APP_VERSION: '1.0.0',
  VITE_APP_URL: 'http://localhost:5173',
  VITE_SUPABASE_URL: 'https://test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  VITE_OPENAI_API_KEY: 'test-openai-key',
  VITE_GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-secret',
  VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_stripe_key',
  STRIPE_SECRET_KEY: 'sk_test_stripe_key',
  VITE_ENABLE_ANALYTICS: 'true',
  VITE_ENABLE_PAYMENTS: 'true',
  VITE_ENABLE_BETA_FEATURES: 'false',
  VITE_ENABLE_MOCK_SERVICES: 'false'
};

describe('Environment Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock process.env and import.meta.env
    vi.stubGlobal('process', { env: mockEnv });
    vi.stubGlobal('import', { meta: { env: {} } });
    
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear module cache to ensure fresh imports
    vi.resetModules();
  });

  describe('environment parsing', () => {
    it('should parse valid environment variables correctly', async () => {
      const { env } = await import('../env');

      expect(env.NODE_ENV).toBe('development');
      expect(env.VITE_APP_NAME).toBe('HalluciFix');
      expect(env.VITE_SUPABASE_URL).toBe('https://test.supabase.co');
      expect(env.VITE_ENABLE_ANALYTICS).toBe(true);
      expect(env.VITE_ENABLE_PAYMENTS).toBe(true);
      expect(env.VITE_ENABLE_BETA_FEATURES).toBe(false);
    });

    it('should use default values for optional variables', async () => {
      vi.stubGlobal('process', { 
        env: {
          VITE_SUPABASE_URL: 'https://test.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'test-key'
        }
      });

      const { env } = await import('../env');

      expect(env.VITE_APP_NAME).toBe('HalluciFix');
      expect(env.VITE_APP_VERSION).toBe('1.0.0');
      expect(env.NODE_ENV).toBe('development');
      expect(env.VITE_ENABLE_ANALYTICS).toBe(false);
    });

    it('should throw error for missing required variables', async () => {
      vi.stubGlobal('process', { env: {} });

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow(/Environment validation failed/);
    });

    it('should throw error for invalid URL format', async () => {
      vi.stubGlobal('process', { 
        env: {
          VITE_SUPABASE_URL: 'invalid-url',
          VITE_SUPABASE_ANON_KEY: 'test-key'
        }
      });

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow(/Environment validation failed/);
    });

    it('should handle boolean string transformations', async () => {
      vi.stubGlobal('process', { 
        env: {
          ...mockEnv,
          VITE_ENABLE_ANALYTICS: 'false',
          VITE_ENABLE_PAYMENTS: 'true',
          VITE_ENABLE_BETA_FEATURES: 'invalid'
        }
      });

      const { env } = await import('../env');

      expect(env.VITE_ENABLE_ANALYTICS).toBe(false);
      expect(env.VITE_ENABLE_PAYMENTS).toBe(true);
      expect(env.VITE_ENABLE_BETA_FEATURES).toBe(false); // Invalid values default to false
    });
  });

  describe('validateEnvironment', () => {
    it('should pass validation for development environment', async () => {
      const { validateEnvironment } = await import('../env');

      expect(() => validateEnvironment()).not.toThrow();
      expect(console.log).toHaveBeenCalledWith('✅ Environment validation passed');
    });

    it('should throw error for missing production variables', async () => {
      vi.stubGlobal('process', { 
        env: {
          NODE_ENV: 'production',
          VITE_SUPABASE_ANON_KEY: 'test-key'
          // Missing VITE_SUPABASE_URL
        }
      });

      const { validateEnvironment } = await import('../env');

      expect(() => validateEnvironment()).toThrow(/Missing required production environment variables/);
    });

    it('should warn about missing payment variables when payments enabled', async () => {
      vi.stubGlobal('process', { 
        env: {
          ...mockEnv,
          VITE_ENABLE_PAYMENTS: 'true'
          // Missing STRIPE_SECRET_KEY
        }
      });
      delete mockEnv.STRIPE_SECRET_KEY;

      const { validateEnvironment } = await import('../env');

      validateEnvironment();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Payments enabled but missing variables')
      );
    });

    it('should warn about missing auth variables when not using mock services', async () => {
      vi.stubGlobal('process', { 
        env: {
          ...mockEnv,
          VITE_ENABLE_MOCK_SERVICES: 'false'
          // Missing GOOGLE_CLIENT_SECRET
        }
      });
      delete mockEnv.GOOGLE_CLIENT_SECRET;

      const { validateEnvironment } = await import('../env');

      validateEnvironment();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Real authentication requires')
      );
    });
  });

  describe('config object', () => {
    it('should provide correct app configuration', async () => {
      const { config } = await import('../env');

      expect(config.appName).toBe('HalluciFix');
      expect(config.appVersion).toBe('1.0.0');
      expect(config.appUrl).toBe('http://localhost:5173');
      expect(config.isDevelopment).toBe(true);
      expect(config.isProduction).toBe(false);
    });

    it('should provide correct feature flags', async () => {
      const { config } = await import('../env');

      expect(config.enableAnalytics).toBe(true);
      expect(config.enablePayments).toBe(true);
      expect(config.enableBetaFeatures).toBe(false);
      expect(config.enableMockServices).toBe(false);
    });

    it('should provide correct service availability checks', async () => {
      const { config } = await import('../env');

      expect(config.hasOpenAI).toBe(true);
      expect(config.hasGoogleAuth).toBe(true);
      expect(config.hasStripe).toBe(true);
    });

    it('should handle missing optional services', async () => {
      vi.stubGlobal('process', { 
        env: {
          VITE_SUPABASE_URL: 'https://test.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'test-key'
          // No optional services
        }
      });

      const { config } = await import('../env');

      expect(config.hasOpenAI).toBe(false);
      expect(config.hasGoogleAuth).toBe(false);
      expect(config.hasStripe).toBe(false);
      expect(config.hasSentry).toBe(false);
    });

    it('should throw error when accessing unconfigured service keys', async () => {
      vi.stubGlobal('process', { 
        env: {
          VITE_SUPABASE_URL: 'https://test.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'test-key'
          // No OpenAI key
        }
      });

      const { config } = await import('../env');

      expect(() => config.openaiApiKey).toThrow(/OpenAI API key not configured/);
      expect(() => config.googleClientId).toThrow(/Google Client ID not configured/);
      expect(() => config.stripePublishableKey).toThrow(/Stripe publishable key not configured/);
    });

    it('should provide configured service keys when available', async () => {
      const { config } = await import('../env');

      expect(config.openaiApiKey).toBe('test-openai-key');
      expect(config.googleClientId).toBe('test-google-client-id');
      expect(config.stripePublishableKey).toBe('pk_test_stripe_key');
    });

    it('should always provide Supabase configuration', async () => {
      const { config } = await import('../env');

      expect(config.supabaseUrl).toBe('https://test.supabase.co');
      expect(config.supabaseAnonKey).toBe('test-anon-key');
    });
  });

  describe('logConfigurationStatus', () => {
    it('should log configuration status in development', async () => {
      const { logConfigurationStatus } = await import('../env');

      logConfigurationStatus();

      expect(console.group).toHaveBeenCalledWith('🔧 Configuration Status');
      expect(console.log).toHaveBeenCalledWith('Environment:', 'development');
      expect(console.log).toHaveBeenCalledWith('Mock Services:', '❌ Disabled');
      expect(console.log).toHaveBeenCalledWith('OpenAI:', '✅ Configured');
      expect(console.groupEnd).toHaveBeenCalled();
    });

    it('should not log in production', async () => {
      vi.stubGlobal('process', { 
        env: {
          ...mockEnv,
          NODE_ENV: 'production'
        }
      });

      const { logConfigurationStatus } = await import('../env');

      logConfigurationStatus();

      expect(console.group).not.toHaveBeenCalled();
    });

    it('should show correct service status indicators', async () => {
      vi.stubGlobal('process', { 
        env: {
          VITE_SUPABASE_URL: 'https://test.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'test-key',
          VITE_ENABLE_MOCK_SERVICES: 'true'
          // Missing other services
        }
      });

      const { logConfigurationStatus } = await import('../env');

      logConfigurationStatus();

      expect(console.log).toHaveBeenCalledWith('Mock Services:', '✅ Enabled');
      expect(console.log).toHaveBeenCalledWith('OpenAI:', '⚠️ Not configured (using mocks)');
      expect(console.log).toHaveBeenCalledWith('Google Auth:', '⚠️ Not configured (using mocks)');
      expect(console.log).toHaveBeenCalledWith('Stripe:', '⚠️ Not configured');
    });
  });

  describe('error handling', () => {
    it('should provide detailed error messages for validation failures', async () => {
      vi.stubGlobal('process', { 
        env: {
          VITE_SUPABASE_URL: 'invalid-url',
          VITE_SUPABASE_ANON_KEY: '', // Empty required field
          VITE_APP_URL: 'not-a-url'
        }
      });

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow(/Environment validation failed/);
    });

    it('should handle non-Zod errors gracefully', async () => {
      // Mock Zod to throw a non-Zod error
      vi.doMock('zod', () => ({
        z: {
          object: () => ({
            parse: () => {
              throw new Error('Non-Zod error');
            }
          })
        }
      }));

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow('Non-Zod error');
    });
  });

  describe('environment merging', () => {
    it('should merge process.env and import.meta.env', async () => {
      vi.stubGlobal('process', { 
        env: {
          VITE_SUPABASE_URL: 'https://process.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'process-key'
        }
      });
      
      vi.stubGlobal('import', { 
        meta: { 
          env: {
            VITE_SUPABASE_URL: 'https://meta.supabase.co', // Should override process.env
            VITE_APP_NAME: 'MetaApp'
          }
        }
      });

      const { env } = await import('../env');

      expect(env.VITE_SUPABASE_URL).toBe('https://meta.supabase.co'); // import.meta.env takes precedence
      expect(env.VITE_SUPABASE_ANON_KEY).toBe('process-key'); // From process.env
      expect(env.VITE_APP_NAME).toBe('MetaApp'); // From import.meta.env
    });
  });

  describe('enum validation', () => {
    it('should validate NODE_ENV enum values', async () => {
      vi.stubGlobal('process', { 
        env: {
          ...mockEnv,
          NODE_ENV: 'invalid-env'
        }
      });

      await expect(async () => {
        await import('../env');
      }).rejects.toThrow(/Environment validation failed/);
    });

    it('should accept valid NODE_ENV values', async () => {
      for (const nodeEnv of ['development', 'staging', 'production']) {
        vi.stubGlobal('process', { 
          env: {
            ...mockEnv,
            NODE_ENV: nodeEnv
          }
        });

        vi.resetModules();
        const { env } = await import('../env');
        expect(env.NODE_ENV).toBe(nodeEnv);
      }
    });
  });
});