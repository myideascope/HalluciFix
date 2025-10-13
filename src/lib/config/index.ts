/**
 * Configuration system main exports
 * Provides comprehensive environment configuration with validation and type safety
 */

// Type definitions
export type {
  EnvironmentConfig,
  ConfigurationSource,
  ValidationResult,
  EnvironmentMapping
} from './types';

// Validation schema and functions
export {
  environmentSchema,
  validateConfiguration,
  ConfigurationValidationError,
  type ValidatedEnvironmentConfig
} from './schema';

// Error classes
export {
  ConfigurationError,
  ConfigurationValidationError as ValidationError,
  ConfigurationLoadError,
  SecretManagerError,
  ServiceConnectivityError,
  EnvironmentFileError,
  ConfigurationInitializationError,
  FeatureFlagError,
  ConfigurationAccessError,
  createConfigurationError,
  wrapConfigurationError,
  ErrorSeverity,
  getErrorSeverity
} from './errors';

// Environment variable mapping
export {
  environmentMappings,
  getMappingByEnvKey,
  getMappingByConfigPath,
  getRequiredEnvironmentVariables,
  getOptionalEnvironmentVariables,
  getEnvironmentVariablesBySection,
  validateEnvironmentValue,
  getConfigPathString,
  parseEnvironmentValue
} from './mapping';

// Re-export for backward compatibility
export { validateConfiguration as validate } from './schema';
export { environmentMappings as mappings } from './mapping';