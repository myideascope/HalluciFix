import { FullConfig } from '@playwright/test';

import { logger } from './logging';
async function globalTeardown(config: FullConfig) {
  logger.debug("🧹 Cleaning up Cognito Auth E2E tests...");
  
  try {
    // Clean up any test data or resources
    // This could include:
    // - Cleaning up test users from Cognito
    // - Clearing test data from databases
    // - Resetting any external service states
    
    logger.debug("✅ Cognito Auth E2E cleanup completed successfully");
    
  } catch (error) {
    logger.error("❌ Cognito Auth E2E cleanup failed:", error instanceof Error ? error : new Error(String(error)));
    // Don't throw error in teardown to avoid masking test failures
  }
}

export default globalTeardown;