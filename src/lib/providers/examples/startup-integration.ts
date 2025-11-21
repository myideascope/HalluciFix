/**
 * Startup Integration Example
 * Shows how to use API connectivity validation during application startup
 */

import { applicationStartup } from '../startup';
import { validateApiConnectivity, validateConfiguration } from '../validation';

import { logger } from './logging';
// Example 1: Basic application startup with validation
export async function basicStartup() {
  try {
    const result = await applicationStartup.initialize({
      validateConnectivity: true,
      enableDetailedLogging: true,
      failOnWarnings: false
    });

    if (result.success) {
      logger.debug("✅ Application started successfully");
      return true;
    } else {
      logger.error("❌ Application startup failed:", result.errors instanceof Error ? result.errors : new Error(String(result.errors)));
      return false;
    }
  } catch (error) {
    logger.error("❌ Startup error:", error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

// Example 2: Production-ready startup with strict validation
export async function productionStartup() {
  const result = await applicationStartup.initialize({
    validateConnectivity: true,
    connectivityTimeout: 10000,
    failOnWarnings: true,
    strictSecurity: true,
    environment: 'production'
  });

  if (!result.success) {
    throw new Error(`Production startup failed: ${result.errors.join(', ')}`);
  }

  return result;
}

// Example 3: Quick health check without full initialization
export async function quickHealthCheck() {
  return await applicationStartup.quickHealthCheck();
}

// Example 4: Validate configuration before startup
export async function validateBeforeStartup() {
  const configResult = await validateConfiguration({
    environment: 'production',
    strictSecurity: true,
    requireAllProviders: false
  });

  if (!configResult.isValid) {
    logger.error("Configuration validation failed:", configResult.errors instanceof Error ? configResult.errors : new Error(String(configResult.errors)));
    return false;
  }

  const connectivityResult = await validateApiConnectivity({
    timeout: 5000,
    skipOptional: true
  });

  if (!connectivityResult.isValid) {
    logger.error("Connectivity validation failed:", connectivityResult.criticalFailures instanceof Error ? connectivityResult.criticalFailures : new Error(String(connectivityResult.criticalFailures)));
    return false;
  }

  return true;
}