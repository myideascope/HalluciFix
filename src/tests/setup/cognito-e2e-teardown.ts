import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Cleaning up Cognito Auth E2E tests...');
  
  try {
    // Clean up any test data or resources
    // This could include:
    // - Cleaning up test users from Cognito
    // - Clearing test data from databases
    // - Resetting any external service states
    
    console.log('✅ Cognito Auth E2E cleanup completed successfully');
    
  } catch (error) {
    console.error('❌ Cognito Auth E2E cleanup failed:', error);
    // Don't throw error in teardown to avoid masking test failures
  }
}

export default globalTeardown;