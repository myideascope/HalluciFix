/**
 * Configuration loader tests
 * Tests configuration loading from multiple sources, validation, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigurationLoader, EnvironmentSecretProvider } from '../loader.js';
import { ConfigurationError } from '../errors.js';
import { SecretManagerProvider } from '../types.js';

// Mock file system for testing
const mockFs = {
  existsSync: vi.fn(),
  readFileSync: vi.fn()
};

const mockPath = {
  resolve: vi.fn()
};

// Mock dynamic imports
vi.mock('fs', () => mockFs);
vi.mock('path', () => mockPath);

describe('ConfigurationLoader', () => {
  let loader: ConfigurationLoader;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear environment
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('VITE_') || key.startsWith('NODE_ENV')) {
        delete process.env[key];
      }
    });

    // Reset mocks
    vi.clearAllMocks();
    mockPath.resolve.mockImplementation((...args) => args.join('/'));
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Environment Variable Loading', () => {
    it('should load configuration from environment variables', async () => {
      // Arrange
      process.env.VITE_APP_NAME = 'Test App';
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
      process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.NODE_ENV = 'development';
      
      loader = new ConfigurationLoader();

      // Act
      const config = await loader.loadConfiguration();

      // Assert
      expect(config.app?.name).toBe('Test App');
      expect(config.database?.supabaseUrl).toBe('https://test.supabase.co');
      expect(config.database?.supabaseAnonKey).toBe('test-anon-key');
      expect(config.app?.environment).toBe('development');
    });

    it('should parse boolean values correctly', async () => {
      // Arrange
      process.env.VITE_ENABLE_ANALYTICS = 'true';
      process.env.VITE_ENABLE_PAYMENTS = 'false';
      
      loader = new ConfigurationLoader();

      // Act
      const config = await loader.loadConfiguration();

      // Assert
      expect(config.features?.enableAnalytics).toBe(true);
      expect(config.features?.enablePayments).toBe(false);
    });

    it('should parse numeric values correctly', async () => {
      // Arrange
      process.env.PORT = '3000';
      process.env.DB_CONNECTION_POOL_SIZE = '15';
      process.env.VITE_OPENAI_TEMPERATURE = '0.7';
      
      loader = new ConfigurationLoader();

      // Act
      const config = await loader.loadConfiguration();

      // Assert
      expect(config.app?.port).toBe(3000);
      expect(config.database?.connectionPoolSize).toBe(15);
      expect(config.ai?.openai?.temperature).toBe(0.7);
    });

    it('should parse array values correctly', async () => {
      // Arrange
      process.env.CORS_ORIGINS = 'http://localhost:3000,https://app.example.com';
      
      loader = new ConfigurationLoader();

      // Act
      const config = await loader.loadConfiguration();

      // Assert
      expect(config.security?.corsOrigins).toEqual([
        'http://localhost:3000',
        'https://app.example.com'
      ]);
    });
  });

  describe('Environment File Loading', () => {
    it('should load configuration from environment files', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      
      mockFs.existsSync.mockImplementation((path: string) => {
        return path.includes('.env.development') || path.includes('.env.example');
      });
      
      mockFs.readFileSync.mockImplementation((path: string) => {
        if (path.includes('.env.example')) {
          return 'VITE_APP_NAME=Example App\nVITE_SUPABASE_URL=https://example.supabase.co';
        }
        if (path.includes('.env.development')) {
          return 'VITE_APP_NAME=Dev App\nLOG_LEVEL=debug';
        }
        return '';
      });

      loader = new ConfigurationLoader();

      // Act
      const config = await loader.loadConfiguration();

      // Assert
      expect(config.app?.name).toBe('Dev App'); // .env.development should override .env.example
      expect(config.database?.supabaseUrl).toBe('https://example.supabase.co');
      expect(config.app?.logLevel).toBe('debug');
    });

    it('should handle missing environment files gracefully', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      mockFs.existsSync.mockReturnValue(false);
      
      loader = new ConfigurationLoader();

      // Act & Assert
      await expect(loader.loadConfiguration()).resolves.toBeDefined();
    });

    it('should parse environment file content correctly', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(`
        # Comment line
        VITE_APP_NAME=Test App
        VITE_ENABLE_ANALYTICS=true
        PORT=3000
        
        # Another comment
        VITE_SUPABASE_URL="https://test.supabase.co"
        EMPTY_LINE_ABOVE=value
      `);

      loader = new ConfigurationLoader();

      // Act
      const config = await loader.loadConfiguration();

      // Assert
      expect(config.app?.name).toBe('Test App');
      expect(config.features?.enableAnalytics).toBe(true);
      expect(config.app?.port).toBe(3000);
      expect(config.database?.supabaseUrl).toBe('https://test.supabase.co');
    });
  });

  describe('Secret Manager Integration', () => {
    it('should load configuration from secret manager', async () => {
      // Arrange
      const mockSecretManager: SecretManagerProvider = {
        getSecret: vi.fn(),
        getSecrets: vi.fn().mockResolvedValue({
          'database/supabase-service-key': 'secret-service-key',
          'auth/jwt-secret': 'super-secret-jwt-key',
          'ai/openai-api-key': 'sk-test-openai-key'
        }),
        setSecret: vi.fn(),
        deleteSecret: vi.fn()
      };

      loader = new ConfigurationLoader(mockSecretManager);

      // Act
      const config = await loader.loadConfiguration();

      // Assert
      expect(config.database?.supabaseServiceKey).toBe('secret-service-key');
      expect(config.auth?.jwt?.secret).toBe('super-secret-jwt-key');
      expect(config.ai?.openai?.apiKey).toBe('sk-test-openai-key');
    });

    it('should handle secret manager failures gracefully', async () => {
      // Arrange
      const mockSecretManager: SecretManagerProvider = {
        getSecret: vi.fn(),
        getSecrets: vi.fn().mockRejectedValue(new Error('Secret manager unavailable')),
        setSecret: vi.fn(),
        deleteSecret: vi.fn()
      };

      loader = new ConfigurationLoader(mockSecretManager);

      // Act & Assert
      await expect(loader.loadConfiguration()).resolves.toBeDefined();
    });
  });

  describe('Configuration Precedence', () => {
    it('should apply correct precedence order', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      process.env.VITE_APP_NAME = 'Env Var App'; // Environment variable
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation((path: string) => {
        if (path.includes('.env.example')) {
          return 'VITE_APP_NAME=Example App';
        }
        if (path.includes('.env.development')) {
          return 'VITE_APP_NAME=Dev App';
        }
        if (path.includes('.env.local')) {
          return 'VITE_APP_NAME=Local App';
        }
        return '';
      });

      const mockSecretManager: SecretManagerProvider = {
        getSecret: vi.fn(),
        getSecrets: vi.fn().mockResolvedValue({}),
        setSecret: vi.fn(),
        deleteSecret: vi.fn()
      };

      loader = new ConfigurationLoader(mockSecretManager);

      // Act
      const config = await loader.loadConfiguration();

      // Assert
      // .env.local should have highest precedence
      expect(config.app?.name).toBe('Local App');
    });

    it('should allow runtime overrides', async () => {
      // Arrange
      process.env.VITE_APP_NAME = 'Original App';
      loader = new ConfigurationLoader();

      // Act
      loader.setRuntimeOverride(['app', 'name'], 'Override App');
      const config = await loader.loadConfiguration();

      // Assert
      expect(config.app?.name).toBe('Override App');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate and return valid configuration', async () => {
      // Arrange
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
      process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.VITE_GOOGLE_CLIENT_ID = '123456789-abc.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX-test-secret';
      process.env.VITE_GOOGLE_REDIRECT_URI = 'http://localhost:5173/auth/callback';
      process.env.JWT_SECRET = 'super-secret-jwt-key-that-is-long-enough';
      process.env.CORS_ORIGINS = 'http://localhost:5173';
      process.env.ENCRYPTION_KEY = 'encryption-key-that-is-long-enough';
      process.env.SESSION_SECRET = 'session-secret-that-is-long-enough';
      
      loader = new ConfigurationLoader();

      // Act & Assert
      await expect(loader.loadAndValidateConfiguration()).resolves.toBeDefined();
    });

    it('should throw ConfigurationError for invalid configuration', async () => {
      // Arrange
      process.env.VITE_SUPABASE_URL = 'invalid-url';
      process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
      
      loader = new ConfigurationLoader();

      // Act & Assert
      await expect(loader.loadAndValidateConfiguration()).rejects.toThrow(ConfigurationError);
    });

    it('should provide detailed error messages for missing required fields', async () => {
      // Arrange - missing required fields
      loader = new ConfigurationLoader();

      // Act & Assert
      try {
        await loader.loadAndValidateConfiguration();
        expect.fail('Should have thrown ConfigurationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        const configError = error as ConfigurationError;
        expect(configError.validationErrors).toBeDefined();
        expect(configError.validationErrors!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Deep Merge Functionality', () => {
    it('should deep merge nested objects correctly', async () => {
      // Arrange
      process.env.VITE_OPENAI_API_KEY = 'sk-test-key';
      process.env.VITE_OPENAI_MODEL = 'gpt-4';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('VITE_OPENAI_TEMPERATURE=0.5');

      loader = new ConfigurationLoader();

      // Act
      const config = await loader.loadConfiguration();

      // Assert
      expect(config.ai?.openai?.apiKey).toBe('sk-test-key');
      expect(config.ai?.openai?.model).toBe('gpt-4');
      expect(config.ai?.openai?.temperature).toBe(0.5);
    });

    it('should not overwrite objects with primitives', async () => {
      // Arrange
      process.env.VITE_OPENAI_API_KEY = 'sk-test-key';
      
      loader = new ConfigurationLoader();
      loader.setRuntimeOverride(['ai', 'openai', 'model'], 'gpt-3.5-turbo');

      // Act
      const config = await loader.loadConfiguration();

      // Assert
      expect(config.ai?.openai?.apiKey).toBe('sk-test-key');
      expect(config.ai?.openai?.model).toBe('gpt-3.5-turbo');
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      loader = new ConfigurationLoader();

      // Act & Assert
      await expect(loader.loadConfiguration()).resolves.toBeDefined();
    });

    it('should provide helpful error messages', async () => {
      // Arrange
      loader = new ConfigurationLoader();

      // Act & Assert
      try {
        await loader.loadAndValidateConfiguration();
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(error.message).toContain('Configuration validation failed');
      }
    });
  });
});

describe('EnvironmentSecretProvider', () => {
  let provider: EnvironmentSecretProvider;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    provider = new EnvironmentSecretProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getSecret', () => {
    it('should retrieve secret from environment variable', async () => {
      // Arrange
      process.env.DATABASE_SUPABASE_SERVICE_KEY = 'test-service-key';

      // Act
      const secret = await provider.getSecret('database/supabase-service-key');

      // Assert
      expect(secret).toBe('test-service-key');
    });

    it('should return null for missing secret', async () => {
      // Act
      const secret = await provider.getSecret('nonexistent/secret');

      // Assert
      expect(secret).toBeNull();
    });

    it('should handle different key formats', async () => {
      // Arrange
      process.env.AUTH_JWT_SECRET = 'jwt-secret';

      // Act
      const secret = await provider.getSecret('auth/jwt-secret');

      // Assert
      expect(secret).toBe('jwt-secret');
    });
  });

  describe('getSecrets', () => {
    it('should retrieve multiple secrets', async () => {
      // Arrange
      process.env.DATABASE_SUPABASE_SERVICE_KEY = 'service-key';
      process.env.AUTH_JWT_SECRET = 'jwt-secret';

      // Act
      const secrets = await provider.getSecrets([
        'database/supabase-service-key',
        'auth/jwt-secret',
        'nonexistent/secret'
      ]);

      // Assert
      expect(secrets).toEqual({
        'database/supabase-service-key': 'service-key',
        'auth/jwt-secret': 'jwt-secret'
      });
    });
  });

  describe('setSecret and deleteSecret', () => {
    it('should throw error for setSecret', async () => {
      // Act & Assert
      await expect(provider.setSecret('test', 'value')).rejects.toThrow();
    });

    it('should throw error for deleteSecret', async () => {
      // Act & Assert
      await expect(provider.deleteSecret('test')).rejects.toThrow();
    });
  });
});