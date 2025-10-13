/**
 * Configuration error classes tests
 * Tests error creation, formatting, and severity classification
 */

import { describe, it, expect } from 'vitest';
import { 
  ConfigurationError, 
  SecretManagerError, 
  ConnectivityError, 
  EnvironmentFileError 
} from '../errors.js';

describe('Configuration Error Classes', () => {
  describe('ConfigurationError', () => {
    it('should create ConfigurationError with validation errors', () => {
      const validationErrors = ['Invalid API key format', 'Missing required field'];
      const missingKeys = ['VITE_SUPABASE_URL', 'JWT_SECRET'];
      
      const error = new ConfigurationError(
        'Configuration validation failed',
        validationErrors,
        missingKeys
      );

      expect(error.name).toBe('ConfigurationError');
      expect(error.message).toBe('Configuration validation failed');
      expect(error.validationErrors).toEqual(validationErrors);
      expect(error.missingKeys).toEqual(missingKeys);
    });

    it('should create ConfigurationError without optional parameters', () => {
      const error = new ConfigurationError('Simple error');

      expect(error.name).toBe('ConfigurationError');
      expect(error.message).toBe('Simple error');
      expect(error.validationErrors).toBeUndefined();
      expect(error.missingKeys).toBeUndefined();
    });
  });

  describe('SecretManagerError', () => {
    it('should create SecretManagerError with secret key', () => {
      const error = new SecretManagerError(
        'Secret not found',
        'database/password'
      );

      expect(error.name).toBe('SecretManagerError');
      expect(error.message).toBe('Secret not found');
      expect(error.secretKey).toBe('database/password');
    });

    it('should create SecretManagerError without secret key', () => {
      const error = new SecretManagerError('Connection failed');

      expect(error.name).toBe('SecretManagerError');
      expect(error.message).toBe('Connection failed');
      expect(error.secretKey).toBeUndefined();
    });
  });

  describe('ConnectivityError', () => {
    it('should create ConnectivityError with service name', () => {
      const error = new ConnectivityError(
        'Connection timeout',
        'Supabase'
      );

      expect(error.name).toBe('ConnectivityError');
      expect(error.message).toBe('Connection timeout');
      expect(error.service).toBe('Supabase');
    });

    it('should create ConnectivityError without service name', () => {
      const error = new ConnectivityError('Network error');

      expect(error.name).toBe('ConnectivityError');
      expect(error.message).toBe('Network error');
      expect(error.service).toBeUndefined();
    });
  });

  describe('EnvironmentFileError', () => {
    it('should create EnvironmentFileError with file path', () => {
      const error = new EnvironmentFileError(
        'File not found',
        '.env.production'
      );

      expect(error.name).toBe('EnvironmentFileError');
      expect(error.message).toBe('File not found');
      expect(error.filePath).toBe('.env.production');
    });

    it('should create EnvironmentFileError without file path', () => {
      const error = new EnvironmentFileError('Parse error');

      expect(error.name).toBe('EnvironmentFileError');
      expect(error.message).toBe('Parse error');
      expect(error.filePath).toBeUndefined();
    });
  });

  describe('Error Inheritance', () => {
    it('should inherit from Error class', () => {
      const configError = new ConfigurationError('Test');
      const secretError = new SecretManagerError('Test');
      const connectError = new ConnectivityError('Test');
      const fileError = new EnvironmentFileError('Test');

      expect(configError).toBeInstanceOf(Error);
      expect(secretError).toBeInstanceOf(Error);
      expect(connectError).toBeInstanceOf(Error);
      expect(fileError).toBeInstanceOf(Error);
    });

    it('should have proper stack traces', () => {
      const error = new ConfigurationError('Test error');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ConfigurationError');
    });
  });

  describe('Error Properties', () => {
    it('should have correct properties on ConfigurationError', () => {
      const error = new ConfigurationError(
        'Validation failed',
        ['Error 1', 'Error 2'],
        ['KEY1', 'KEY2']
      );

      expect(error.name).toBe('ConfigurationError');
      expect(error.message).toBe('Validation failed');
      expect(error.validationErrors).toEqual(['Error 1', 'Error 2']);
      expect(error.missingKeys).toEqual(['KEY1', 'KEY2']);
    });

    it('should have correct properties on SecretManagerError', () => {
      const error = new SecretManagerError('Secret error', 'test/secret');

      expect(error.name).toBe('SecretManagerError');
      expect(error.message).toBe('Secret error');
      expect(error.secretKey).toBe('test/secret');
    });
  });
});