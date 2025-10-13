/**
 * Tests for configuration error classes
 */

import { describe, it, expect } from 'vitest';
import {
  ConfigurationValidationError,
  ConfigurationLoadError,
  SecretManagerError,
  ServiceConnectivityError,
  EnvironmentFileError,
  ConfigurationInitializationError,
  FeatureFlagError,
  ConfigurationAccessError,
  getErrorSeverity,
  ErrorSeverity
} from '../errors';

describe('Configuration Error Classes', () => {
  it('should create ConfigurationValidationError with proper formatting', () => {
    const error = new ConfigurationValidationError(
      'Validation failed',
      ['Invalid API key format'],
      ['Missing SUPABASE_URL'],
      ['Deprecated setting used']
    );

    expect(error.name).toBe('ConfigurationValidationError');
    expect(error.errorCode).toBe('CONFIG_VALIDATION_ERROR');
    expect(error.validationErrors).toEqual(['Invalid API key format']);
    expect(error.missingRequired).toEqual(['Missing SUPABASE_URL']);
    expect(error.warnings).toEqual(['Deprecated setting used']);

    const errorString = error.toString();
    expect(errorString).toContain('❌ Missing required configuration');
    expect(errorString).toContain('❌ Invalid configuration');
    expect(errorString).toContain('⚠️  Configuration warnings');
  });

  it('should create ConfigurationLoadError with source information', () => {
    const originalError = new Error('File not found');
    const error = new ConfigurationLoadError(
      'Failed to load configuration',
      '.env.local',
      originalError
    );

    expect(error.name).toBe('ConfigurationLoadError');
    expect(error.errorCode).toBe('CONFIG_LOAD_ERROR');
    expect(error.source).toBe('.env.local');
    expect(error.originalError).toBe(originalError);

    const errorString = error.toString();
    expect(errorString).toContain('Source: .env.local');
    expect(errorString).toContain('Original Error: File not found');
  });

  it('should create SecretManagerError with operation details', () => {
    const error = new SecretManagerError(
      'Failed to retrieve secret',
      'database/password',
      'get'
    );

    expect(error.name).toBe('SecretManagerError');
    expect(error.errorCode).toBe('SECRET_MANAGER_ERROR');
    expect(error.secretKey).toBe('database/password');
    expect(error.operation).toBe('get');

    const errorString = error.toString();
    expect(errorString).toContain('Secret Key: database/password');
    expect(errorString).toContain('Operation: get');
  });

  it('should create ServiceConnectivityError with service details', () => {
    const error = new ServiceConnectivityError(
      'Connection failed',
      'Supabase',
      'https://test.supabase.co',
      404
    );

    expect(error.name).toBe('ServiceConnectivityError');
    expect(error.errorCode).toBe('SERVICE_CONNECTIVITY_ERROR');
    expect(error.service).toBe('Supabase');
    expect(error.endpoint).toBe('https://test.supabase.co');
    expect(error.statusCode).toBe(404);

    const errorString = error.toString();
    expect(errorString).toContain('Service: Supabase');
    expect(errorString).toContain('Endpoint: https://test.supabase.co');
    expect(errorString).toContain('Status Code: 404');
  });

  it('should create EnvironmentFileError with file operation details', () => {
    const error = new EnvironmentFileError(
      'Cannot read file',
      '.env.production',
      'read'
    );

    expect(error.name).toBe('EnvironmentFileError');
    expect(error.errorCode).toBe('ENV_FILE_ERROR');
    expect(error.filePath).toBe('.env.production');
    expect(error.operation).toBe('read');

    const errorString = error.toString();
    expect(errorString).toContain('File Path: .env.production');
    expect(errorString).toContain('Operation: read');
  });

  it('should create ConfigurationInitializationError with phase information', () => {
    const originalError = new Error('Validation failed');
    const error = new ConfigurationInitializationError(
      'Initialization failed',
      'validation',
      originalError
    );

    expect(error.name).toBe('ConfigurationInitializationError');
    expect(error.errorCode).toBe('CONFIG_INIT_ERROR');
    expect(error.phase).toBe('validation');
    expect(error.originalError).toBe(originalError);

    const errorString = error.toString();
    expect(errorString).toContain('Phase: validation');
    expect(errorString).toContain('Original Error: Validation failed');
  });

  it('should create FeatureFlagError with flag details', () => {
    const error = new FeatureFlagError(
      'Flag not found',
      'enableNewFeature',
      'get'
    );

    expect(error.name).toBe('FeatureFlagError');
    expect(error.errorCode).toBe('FEATURE_FLAG_ERROR');
    expect(error.flagName).toBe('enableNewFeature');
    expect(error.operation).toBe('get');

    const errorString = error.toString();
    expect(errorString).toContain('Flag Name: enableNewFeature');
    expect(errorString).toContain('Operation: get');
  });

  it('should create ConfigurationAccessError with access details', () => {
    const error = new ConfigurationAccessError(
      'Access denied',
      'database.secretKey',
      'get'
    );

    expect(error.name).toBe('ConfigurationAccessError');
    expect(error.errorCode).toBe('CONFIG_ACCESS_ERROR');
    expect(error.configPath).toBe('database.secretKey');
    expect(error.accessType).toBe('get');

    const errorString = error.toString();
    expect(errorString).toContain('Config Path: database.secretKey');
    expect(errorString).toContain('Access Type: get');
  });

  it('should include context in error messages', () => {
    const context = { environment: 'production', timestamp: '2023-01-01' };
    const error = new ConfigurationValidationError(
      'Validation failed',
      [],
      [],
      [],
      context
    );

    const errorString = error.toString();
    expect(errorString).toContain('Context:');
    expect(errorString).toContain('environment: "production"');
    expect(errorString).toContain('timestamp: "2023-01-01"');
  });

  describe('Error Severity', () => {
    it('should return CRITICAL for validation errors with missing required fields', () => {
      const error = new ConfigurationValidationError(
        'Validation failed',
        [],
        ['Missing required field']
      );

      expect(getErrorSeverity(error)).toBe(ErrorSeverity.CRITICAL);
    });

    it('should return HIGH for validation errors with invalid fields', () => {
      const error = new ConfigurationValidationError(
        'Validation failed',
        ['Invalid format'],
        []
      );

      expect(getErrorSeverity(error)).toBe(ErrorSeverity.HIGH);
    });

    it('should return MEDIUM for validation errors with only warnings', () => {
      const error = new ConfigurationValidationError(
        'Validation failed',
        [],
        [],
        ['Deprecated setting']
      );

      expect(getErrorSeverity(error)).toBe(ErrorSeverity.MEDIUM);
    });

    it('should return HIGH for secret manager errors', () => {
      const error = new SecretManagerError('Secret not found');
      expect(getErrorSeverity(error)).toBe(ErrorSeverity.HIGH);
    });

    it('should return HIGH for service connectivity errors', () => {
      const error = new ServiceConnectivityError('Connection failed', 'TestService');
      expect(getErrorSeverity(error)).toBe(ErrorSeverity.HIGH);
    });

    it('should return CRITICAL for initialization errors', () => {
      const error = new ConfigurationInitializationError('Init failed', 'loading');
      expect(getErrorSeverity(error)).toBe(ErrorSeverity.CRITICAL);
    });

    it('should return MEDIUM for load errors', () => {
      const error = new ConfigurationLoadError('Load failed', 'test.env');
      expect(getErrorSeverity(error)).toBe(ErrorSeverity.MEDIUM);
    });

    it('should return LOW for feature flag errors', () => {
      const error = new FeatureFlagError('Flag not found', 'testFlag', 'get');
      expect(getErrorSeverity(error)).toBe(ErrorSeverity.LOW);
    });

    it('should return LOW for access errors', () => {
      const error = new ConfigurationAccessError('Access denied', 'test.path', 'get');
      expect(getErrorSeverity(error)).toBe(ErrorSeverity.LOW);
    });
  });
});