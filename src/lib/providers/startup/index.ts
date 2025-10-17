/**
 * Application Startup - Main exports
 * Provides complete application initialization with validation
 */

export {
  ApplicationStartup,
  applicationStartup
} from './ApplicationStartup';

export type {
  StartupOptions,
  StartupResult
} from './ApplicationStartup';

// Convenience functions for common startup tasks
export async function initializeApplication(options?: {
  validateConnectivity?: boolean;
  enableDetailedLogging?: boolean;
  failOnWarnings?: boolean;
}) {
  const { applicationStartup } = await import('./ApplicationStartup');
  return applicationStartup.initialize(options);
}

export async function quickHealthCheck() {
  const { applicationStartup } = await import('./ApplicationStartup');
  return applicationStartup.quickHealthCheck();
}

export async function restartApplication(options?: {
  validateConnectivity?: boolean;
  enableDetailedLogging?: boolean;
}) {
  const { applicationStartup } = await import('./ApplicationStartup');
  return applicationStartup.restart(options);
}

export function isApplicationStarted() {
  const { applicationStartup } = require('./ApplicationStartup');
  return applicationStartup.isApplicationStarted();
}