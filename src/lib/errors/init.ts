/**
 * Error Tracking Initialization
 * Simple initialization for error tracking in the HalluciFix application
 */

import { setupErrorTracking, ErrorTrackingSetupConfig } from './errorTrackingConfig';

/**
 * Initialize error tracking with default configuration for HalluciFix
 */
export async function initializeErrorTracking(): Promise<void> {
  const config: ErrorTrackingSetupConfig = {
    // Sentry configuration from environment variables
    sentry: {
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE || 'development',
      release: import.meta.env.VITE_APP_VERSION || '1.0.0',
      sampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
      tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
      enableUserFeedback: import.meta.env.MODE === 'production'
    },

    // Custom endpoint configuration (if needed)
    custom: {
      endpoint: import.meta.env.VITE_ERROR_TRACKING_ENDPOINT,
      apiKey: import.meta.env.VITE_ERROR_TRACKING_API_KEY
    },

    // Enable common filters and enrichers
    enableCommonFilters: true,
    enableCommonEnrichers: true,
    enableConsoleLogging: import.meta.env.MODE === 'development'
  };

  await setupErrorTracking(config);
}

/**
 * Initialize error tracking with custom configuration
 */
export async function initializeCustomErrorTracking(config: ErrorTrackingSetupConfig): Promise<void> {
  await setupErrorTracking(config);
}

// Auto-initialize in browser environment if not in test mode
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeErrorTracking().catch(error => {
        console.error('Failed to initialize error tracking:', error);
      });
    });
  } else {
    initializeErrorTracking().catch(error => {
      console.error('Failed to initialize error tracking:', error);
    });
  }
}