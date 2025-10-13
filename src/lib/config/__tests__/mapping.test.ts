/**
 * Configuration mapping tests
 * Tests environment variable to configuration path mapping and value parsing
 */

import { describe, it, expect } from 'vitest';
import { getConfigPath, parseValue, setNestedValue, ENV_VAR_MAPPINGS } from '../mapping.js';

describe('Configuration Mapping', () => {
  describe('getConfigPath', () => {
    it('should return correct path for app configuration variables', () => {
      expect(getConfigPath('VITE_APP_NAME')).toEqual(['app', 'name']);
      expect(getConfigPath('NODE_ENV')).toEqual(['app', 'environment']);
      expect(getConfigPath('PORT')).toEqual(['app', 'port']);
      expect(getConfigPath('LOG_LEVEL')).toEqual(['app', 'logLevel']);
    });

    it('should return correct path for database configuration variables', () => {
      expect(getConfigPath('VITE_SUPABASE_URL')).toEqual(['database', 'supabaseUrl']);
      expect(getConfigPath('VITE_SUPABASE_ANON_KEY')).toEqual(['database', 'supabaseAnonKey']);
      expect(getConfigPath('SUPABASE_SERVICE_KEY')).toEqual(['database', 'supabaseServiceKey']);
    });

    it('should return correct path for AI service configuration variables', () => {
      expect(getConfigPath('VITE_OPENAI_API_KEY')).toEqual(['ai', 'openai', 'apiKey']);
      expect(getConfigPath('VITE_OPENAI_MODEL')).toEqual(['ai', 'openai', 'model']);
      expect(getConfigPath('VITE_ANTHROPIC_API_KEY')).toEqual(['ai', 'anthropic', 'apiKey']);
      expect(getConfigPath('VITE_HALLUCIFIX_API_KEY')).toEqual(['ai', 'hallucifix', 'apiKey']);
    });

    it('should return correct path for authentication configuration variables', () => {
      expect(getConfigPath('VITE_GOOGLE_CLIENT_ID')).toEqual(['auth', 'google', 'clientId']);
      expect(getConfigPath('GOOGLE_CLIENT_SECRET')).toEqual(['auth', 'google', 'clientSecret']);
      expect(getConfigPath('JWT_SECRET')).toEqual(['auth', 'jwt', 'secret']);
    });

    it('should return correct path for payment configuration variables', () => {
      expect(getConfigPath('VITE_STRIPE_PUBLISHABLE_KEY')).toEqual(['payments', 'stripe', 'publishableKey']);
      expect(getConfigPath('STRIPE_SECRET_KEY')).toEqual(['payments', 'stripe', 'secretKey']);
      expect(getConfigPath('STRIPE_PRICE_ID_BASIC_MONTHLY')).toEqual(['payments', 'stripe', 'priceIds', 'basicMonthly']);
    });

    it('should return correct path for monitoring configuration variables', () => {
      expect(getConfigPath('VITE_SENTRY_DSN')).toEqual(['monitoring', 'sentry', 'dsn']);
      expect(getConfigPath('VITE_GOOGLE_ANALYTICS_ID')).toEqual(['monitoring', 'analytics', 'googleAnalyticsId']);
      expect(getConfigPath('LOG_FORMAT')).toEqual(['monitoring', 'logging', 'format']);
    });

    it('should return correct path for feature flag variables', () => {
      expect(getConfigPath('VITE_ENABLE_ANALYTICS')).toEqual(['features', 'enableAnalytics']);
      expect(getConfigPath('VITE_ENABLE_PAYMENTS')).toEqual(['features', 'enablePayments']);
      expect(getConfigPath('VITE_ENABLE_MOCK_SERVICES')).toEqual(['features', 'enableMockServices']);
    });

    it('should return correct path for security configuration variables', () => {
      expect(getConfigPath('CORS_ORIGINS')).toEqual(['security', 'corsOrigins']);
      expect(getConfigPath('ENCRYPTION_KEY')).toEqual(['security', 'encryptionKey']);
      expect(getConfigPath('SESSION_SECRET')).toEqual(['security', 'sessionSecret']);
    });

    it('should return null for unmapped variables', () => {
      expect(getConfigPath('UNKNOWN_VARIABLE')).toBeNull();
      expect(getConfigPath('RANDOM_ENV_VAR')).toBeNull();
    });
  });

  describe('parseValue', () => {
    it('should parse boolean values correctly', () => {
      expect(parseValue('true')).toBe(true);
      expect(parseValue('false')).toBe(false);
      expect(parseValue('TRUE')).toBe(true);
      expect(parseValue('FALSE')).toBe(false);
      expect(parseValue('True')).toBe(true);
      expect(parseValue('False')).toBe(false);
    });

    it('should parse integer values correctly', () => {
      expect(parseValue('123')).toBe(123);
      expect(parseValue('0')).toBe(0);
      expect(parseValue('999')).toBe(999);
    });

    it('should parse float values correctly', () => {
      expect(parseValue('123.45')).toBe(123.45);
      expect(parseValue('0.1')).toBe(0.1);
      expect(parseValue('99.99')).toBe(99.99);
    });

    it('should parse array values correctly', () => {
      expect(parseValue('item1,item2,item3')).toEqual(['item1', 'item2', 'item3']);
      expect(parseValue('http://localhost:3000,https://app.example.com')).toEqual([
        'http://localhost:3000',
        'https://app.example.com'
      ]);
      expect(parseValue('single')).toBe('single'); // No comma, not an array
    });

    it('should trim whitespace in array values', () => {
      expect(parseValue('item1, item2 , item3')).toEqual(['item1', 'item2', 'item3']);
    });

    it('should return string values unchanged', () => {
      expect(parseValue('hello world')).toBe('hello world');
      expect(parseValue('sk-1234567890abcdef')).toBe('sk-1234567890abcdef');
      expect(parseValue('https://example.com')).toBe('https://example.com');
    });

    it('should handle edge cases', () => {
      expect(parseValue('')).toBe('');
      expect(parseValue('0.0')).toBe(0);
      expect(parseValue('false,')).toEqual(['false', '']); // Trailing comma
    });
  });

  describe('setNestedValue', () => {
    it('should set simple nested values', () => {
      const obj = {};
      setNestedValue(obj, ['app', 'name'], 'Test App');
      
      expect(obj).toEqual({
        app: {
          name: 'Test App'
        }
      });
    });

    it('should set deeply nested values', () => {
      const obj = {};
      setNestedValue(obj, ['ai', 'openai', 'apiKey'], 'sk-test');
      
      expect(obj).toEqual({
        ai: {
          openai: {
            apiKey: 'sk-test'
          }
        }
      });
    });

    it('should not overwrite existing objects', () => {
      const obj = {
        app: {
          name: 'Existing App',
          version: '1.0.0'
        }
      };
      
      setNestedValue(obj, ['app', 'port'], 3000);
      
      expect(obj).toEqual({
        app: {
          name: 'Existing App',
          version: '1.0.0',
          port: 3000
        }
      });
    });

    it('should handle array paths', () => {
      const obj = {};
      setNestedValue(obj, ['payments', 'stripe', 'priceIds', 'basicMonthly'], 'price_123');
      
      expect(obj).toEqual({
        payments: {
          stripe: {
            priceIds: {
              basicMonthly: 'price_123'
            }
          }
        }
      });
    });

    it('should overwrite primitive values', () => {
      const obj = {
        app: {
          name: 'Old Name'
        }
      };
      
      setNestedValue(obj, ['app', 'name'], 'New Name');
      
      expect(obj).toEqual({
        app: {
          name: 'New Name'
        }
      });
    });

    it('should handle single-level paths', () => {
      const obj = {};
      setNestedValue(obj, ['simpleKey'], 'simpleValue');
      
      expect(obj).toEqual({
        simpleKey: 'simpleValue'
      });
    });
  });

  describe('ENV_VAR_MAPPINGS completeness', () => {
    it('should have mappings for all expected application variables', () => {
      const expectedAppVars = [
        'VITE_APP_NAME',
        'VITE_APP_VERSION',
        'NODE_ENV',
        'VITE_APP_URL',
        'PORT',
        'LOG_LEVEL'
      ];

      expectedAppVars.forEach(varName => {
        expect(ENV_VAR_MAPPINGS[varName]).toBeDefined();
        expect(ENV_VAR_MAPPINGS[varName][0]).toBe('app');
      });
    });

    it('should have mappings for all expected database variables', () => {
      const expectedDbVars = [
        'VITE_SUPABASE_URL',
        'VITE_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_KEY'
      ];

      expectedDbVars.forEach(varName => {
        expect(ENV_VAR_MAPPINGS[varName]).toBeDefined();
        expect(ENV_VAR_MAPPINGS[varName][0]).toBe('database');
      });
    });

    it('should have mappings for all expected AI service variables', () => {
      const expectedAiVars = [
        'VITE_OPENAI_API_KEY',
        'VITE_ANTHROPIC_API_KEY',
        'VITE_HALLUCIFIX_API_KEY'
      ];

      expectedAiVars.forEach(varName => {
        expect(ENV_VAR_MAPPINGS[varName]).toBeDefined();
        expect(ENV_VAR_MAPPINGS[varName][0]).toBe('ai');
      });
    });

    it('should have mappings for all expected authentication variables', () => {
      const expectedAuthVars = [
        'VITE_GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'JWT_SECRET'
      ];

      expectedAuthVars.forEach(varName => {
        expect(ENV_VAR_MAPPINGS[varName]).toBeDefined();
        expect(ENV_VAR_MAPPINGS[varName][0]).toBe('auth');
      });
    });

    it('should have mappings for all expected feature flag variables', () => {
      const expectedFeatureVars = [
        'VITE_ENABLE_ANALYTICS',
        'VITE_ENABLE_PAYMENTS',
        'VITE_ENABLE_BETA_FEATURES',
        'VITE_ENABLE_MOCK_SERVICES'
      ];

      expectedFeatureVars.forEach(varName => {
        expect(ENV_VAR_MAPPINGS[varName]).toBeDefined();
        expect(ENV_VAR_MAPPINGS[varName][0]).toBe('features');
      });
    });
  });

  describe('Integration tests', () => {
    it('should correctly transform environment variables to configuration', () => {
      const envVars = {
        VITE_APP_NAME: 'Test App',
        VITE_SUPABASE_URL: 'https://test.supabase.co',
        VITE_ENABLE_ANALYTICS: 'true',
        PORT: '3000',
        CORS_ORIGINS: 'http://localhost:3000,https://app.example.com'
      };

      const config = {};
      
      Object.entries(envVars).forEach(([key, value]) => {
        const path = getConfigPath(key);
        if (path) {
          setNestedValue(config, path, parseValue(value));
        }
      });

      expect(config).toEqual({
        app: {
          name: 'Test App',
          port: 3000
        },
        database: {
          supabaseUrl: 'https://test.supabase.co'
        },
        features: {
          enableAnalytics: true
        },
        security: {
          corsOrigins: ['http://localhost:3000', 'https://app.example.com']
        }
      });
    });
  });
});