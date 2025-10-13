/**
 * Environment file manager tests
 * Tests environment file loading, parsing, validation, and generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnvironmentFileManager } from '../envFileManager.js';

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

describe('EnvironmentFileManager', () => {
  let manager: EnvironmentFileManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPath.resolve.mockImplementation((...args) => args.join('/'));
  });

  describe('Environment File Loading', () => {
    it('should get correct environment files for development', () => {
      // Arrange
      manager = new EnvironmentFileManager('development');

      // Act
      const files = manager.getEnvironmentFiles();

      // Assert
      expect(files).toEqual([
        '.env.example',
        '.env.development',
        '.env.local'
      ]);
    });

    it('should get correct environment files for production', () => {
      // Arrange
      manager = new EnvironmentFileManager('production');

      // Act
      const files = manager.getEnvironmentFiles();

      // Assert
      expect(files).toEqual([
        '.env.example',
        '.env.production',
        '.env.local'
      ]);
    });

    it('should load and merge all environment files', async () => {
      // Arrange
      manager = new EnvironmentFileManager('development');
      
      mockFs.existsSync.mockImplementation((path: string) => {
        return path.includes('.env.example') || path.includes('.env.development');
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

      // Act
      const config = await manager.loadAllEnvironmentFiles();

      // Assert
      expect(config.VITE_APP_NAME).toBe('Dev App'); // Later file should override
      expect(config.VITE_SUPABASE_URL).toBe('https://example.supabase.co');
      expect(config.LOG_LEVEL).toBe('debug');
    });

    it('should handle missing files gracefully', async () => {
      // Arrange
      manager = new EnvironmentFileManager('development');
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const config = await manager.loadAllEnvironmentFiles();

      // Assert
      expect(config).toEqual({});
    });
  });

  describe('Environment File Parsing', () => {
    beforeEach(() => {
      manager = new EnvironmentFileManager('development');
    });

    it('should parse simple key-value pairs', () => {
      // Arrange
      const content = 'KEY1=value1\nKEY2=value2';

      // Act
      const result = manager.parseEnvironmentFileContent(content);

      // Assert
      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value2'
      });
    });

    it('should skip comments and empty lines', () => {
      // Arrange
      const content = `
        # This is a comment
        KEY1=value1
        
        # Another comment
        KEY2=value2
        
      `;

      // Act
      const result = manager.parseEnvironmentFileContent(content);

      // Assert
      expect(result).toEqual({
        KEY1: 'value1',
        KEY2: 'value2'
      });
    });

    it('should handle quoted values', () => {
      // Arrange
      const content = `
        KEY1="quoted value"
        KEY2='single quoted'
        KEY3=unquoted
      `;

      // Act
      const result = manager.parseEnvironmentFileContent(content);

      // Assert
      expect(result).toEqual({
        KEY1: 'quoted value',
        KEY2: 'single quoted',
        KEY3: 'unquoted'
      });
    });

    it('should handle multiline values', () => {
      // Arrange
      const content = `
        KEY1="line1
        line2
        line3"
        KEY2=simple
      `;

      // Act
      const result = manager.parseEnvironmentFileContent(content);

      // Assert
      expect(result.KEY1).toBe('line1\nline2\nline3');
      expect(result.KEY2).toBe('simple');
    });

    it('should handle escape sequences', () => {
      // Arrange
      const content = `
        KEY1="line1\\nline2\\tindented"
        KEY2="quote: \\"hello\\""
      `;

      // Act
      const result = manager.parseEnvironmentFileContent(content);

      // Assert
      expect(result.KEY1).toBe('line1\nline2\tindented');
      expect(result.KEY2).toBe('quote: "hello"');
    });

    it('should handle malformed lines gracefully', () => {
      // Arrange
      const content = `
        VALID_KEY=valid_value
        INVALID_LINE_NO_EQUALS
        =VALUE_WITHOUT_KEY
        ANOTHER_VALID=value
      `;

      // Act
      const result = manager.parseEnvironmentFileContent(content);

      // Assert
      expect(result).toEqual({
        VALID_KEY: 'valid_value',
        ANOTHER_VALID: 'value'
      });
    });
  });

  describe('Environment File Validation', () => {
    beforeEach(() => {
      manager = new EnvironmentFileManager('development');
    });

    it('should validate correct configuration', () => {
      // Arrange
      const config = {
        VITE_SUPABASE_URL: 'https://test.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key',
        VITE_APP_URL: 'http://localhost:5173'
      };

      // Act
      const result = manager.validateEnvironmentFile(config);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required variables', () => {
      // Arrange
      const config = {
        VITE_APP_NAME: 'Test App'
        // Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
      };

      // Act
      const result = manager.validateEnvironmentFile(config);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('VITE_SUPABASE_URL'))).toBe(true);
      expect(result.errors.some(e => e.includes('VITE_SUPABASE_ANON_KEY'))).toBe(true);
    });

    it('should validate URL formats', () => {
      // Arrange
      const config = {
        VITE_SUPABASE_URL: 'not-a-url',
        VITE_SUPABASE_ANON_KEY: 'test-key',
        VITE_APP_URL: 'also-not-a-url'
      };

      // Act
      const result = manager.validateEnvironmentFile(config);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid URL format'))).toBe(true);
    });

    it('should validate API key formats', () => {
      // Arrange
      const config = {
        VITE_SUPABASE_URL: 'https://test.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-key',
        VITE_OPENAI_API_KEY: 'invalid-openai-key',
        VITE_GOOGLE_CLIENT_ID: 'invalid-google-id',
        GOOGLE_CLIENT_SECRET: 'invalid-google-secret',
        VITE_STRIPE_PUBLISHABLE_KEY: 'invalid-stripe-key',
        STRIPE_SECRET_KEY: 'invalid-stripe-secret'
      };

      // Act
      const result = manager.validateEnvironmentFile(config);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('OpenAI API key'))).toBe(true);
      expect(result.errors.some(e => e.includes('Google Client ID'))).toBe(true);
      expect(result.errors.some(e => e.includes('Google Client Secret'))).toBe(true);
      expect(result.errors.some(e => e.includes('Stripe publishable key'))).toBe(true);
      expect(result.errors.some(e => e.includes('Stripe secret key'))).toBe(true);
    });
  });

  describe('Environment File Generation', () => {
    beforeEach(() => {
      manager = new EnvironmentFileManager('development');
    });

    it('should generate development environment file', () => {
      // Act
      const content = manager.generateEnvironmentFile('development');

      // Assert
      expect(content).toContain('NODE_ENV=development');
      expect(content).toContain('VITE_ENABLE_MOCK_SERVICES=true');
      expect(content).toContain('LOG_LEVEL=debug');
      expect(content).toContain('LOG_FORMAT=pretty');
    });

    it('should generate staging environment file', () => {
      // Act
      const content = manager.generateEnvironmentFile('staging');

      // Assert
      expect(content).toContain('NODE_ENV=staging');
      expect(content).toContain('VITE_ENABLE_MOCK_SERVICES=false');
      expect(content).toContain('LOG_LEVEL=info');
      expect(content).toContain('LOG_FORMAT=json');
    });

    it('should generate production environment file', () => {
      // Act
      const content = manager.generateEnvironmentFile('production');

      // Assert
      expect(content).toContain('NODE_ENV=production');
      expect(content).toContain('VITE_ENABLE_MOCK_SERVICES=false');
      expect(content).toContain('LOG_LEVEL=warn');
      expect(content).toContain('VITE_ENABLE_PAYMENTS=true');
    });

    it('should include base configuration in generated file', () => {
      // Arrange
      const baseConfig = {
        VITE_APP_NAME: 'Custom App',
        VITE_SUPABASE_URL: 'https://custom.supabase.co'
      };

      // Act
      const content = manager.generateEnvironmentFile('development', baseConfig);

      // Assert
      expect(content).toContain('VITE_APP_NAME=Custom App');
      expect(content).toContain('VITE_SUPABASE_URL=https://custom.supabase.co');
    });

    it('should escape values with special characters', () => {
      // Arrange
      const baseConfig = {
        COMPLEX_VALUE: 'value with spaces and "quotes"',
        MULTILINE_VALUE: 'line1\nline2\ttab'
      };

      // Act
      const content = manager.generateEnvironmentFile('development', baseConfig);

      // Assert
      expect(content).toContain('COMPLEX_VALUE="value with spaces and \\"quotes\\""');
      expect(content).toContain('MULTILINE_VALUE="line1\\nline2\\ttab"');
    });
  });

  describe('Environment Recommendations', () => {
    beforeEach(() => {
      manager = new EnvironmentFileManager('development');
    });

    it('should provide development recommendations', () => {
      // Act
      const recommendations = manager.getEnvironmentRecommendations('development');

      // Assert
      expect(recommendations.required).toContain('VITE_SUPABASE_URL');
      expect(recommendations.required).toContain('VITE_SUPABASE_ANON_KEY');
      expect(recommendations.recommended).toContain('VITE_ENABLE_MOCK_SERVICES');
      expect(recommendations.optional).toContain('VITE_OPENAI_API_KEY');
    });

    it('should provide staging recommendations', () => {
      // Act
      const recommendations = manager.getEnvironmentRecommendations('staging');

      // Assert
      expect(recommendations.required).toContain('SUPABASE_SERVICE_KEY');
      expect(recommendations.recommended).toContain('VITE_OPENAI_API_KEY');
      expect(recommendations.recommended).toContain('VITE_GOOGLE_CLIENT_ID');
      expect(recommendations.optional).toContain('VITE_SENTRY_DSN');
    });

    it('should provide production recommendations', () => {
      // Act
      const recommendations = manager.getEnvironmentRecommendations('production');

      // Assert
      expect(recommendations.required).toContain('SUPABASE_SERVICE_KEY');
      expect(recommendations.required).toContain('JWT_SECRET');
      expect(recommendations.recommended).toContain('VITE_SENTRY_DSN');
      expect(recommendations.optional).toContain('VITE_STRIPE_PUBLISHABLE_KEY');
    });
  });
});