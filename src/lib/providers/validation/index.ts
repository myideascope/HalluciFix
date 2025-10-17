/**
 * Provider Validation - Main exports
 * Provides comprehensive validation for API connectivity and configuration
 */

// API Connectivity Validator
export { 
  ApiConnectivityValidator,
  apiConnectivityValidator 
} from './ApiConnectivityValidator';

export type {
  ConnectivityTestResult,
  ConnectivityValidationResult,
  ValidationOptions
} from './ApiConnectivityValidator';

// Startup Health Checker
export {
  StartupHealthChecker,
  startupHealthChecker
} from './StartupHealthChecker';

export type {
  StartupHealthCheckResult,
  StartupHealthCheckOptions
} from './StartupHealthChecker';

// Configuration Validator
export {
  ConfigurationValidator,
  configurationValidator
} from './ConfigurationValidator';

export type {
  ConfigurationValidationResult,
  ValidationOptions as ConfigValidationOptions
} from './ConfigurationValidator';

// Convenience functions for common validation tasks
export async function validateStartupHealth(options?: {
  timeout?: number;
  skipNonCritical?: boolean;
  enableDetailedLogging?: boolean;
}) {
  const { startupHealthChecker } = await import('./StartupHealthChecker');
  return startupHealthChecker.performStartupHealthCheck(options);
}

export async function validateApiConnectivity(options?: {
  timeout?: number;
  skipOptional?: boolean;
  enableRetries?: boolean;
}) {
  const { apiConnectivityValidator } = await import('./ApiConnectivityValidator');
  return apiConnectivityValidator.validateAllConnectivity(options);
}

export async function validateConfiguration(options?: {
  environment?: 'development' | 'staging' | 'production';
  strictSecurity?: boolean;
  requireAllProviders?: boolean;
}) {
  const { configurationValidator } = await import('./ConfigurationValidator');
  return configurationValidator.validateConfiguration(options);
}

export async function isProductionReady() {
  const { startupHealthChecker } = await import('./StartupHealthChecker');
  return startupHealthChecker.isProductionReady();
}

// Quick validation functions
export async function quickHealthCheck() {
  const { startupHealthChecker } = await import('./StartupHealthChecker');
  return startupHealthChecker.performQuickHealthCheck();
}

export function getConfigurationSummary() {
  const { configurationValidator } = require('./ConfigurationValidator');
  return configurationValidator.getConfigurationSummary();
}