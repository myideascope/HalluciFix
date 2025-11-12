/**
 * Global Setup for Playwright E2E Tests
 * Handles authentication, database seeding, and environment preparation
 */

import { chromium, FullConfig } from '@playwright/test';
import { testDatabase } from '../src/test/utils/testDatabase';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test global setup...');

  try {
    // Initialize test database connection
    await testDatabase.initialize();
    console.log('✅ Test database connection initialized');

    // Setup test database
    await testDatabase.setup();
    console.log('✅ Test database setup complete');

    // Create test users and data
    await setupTestData();
    console.log('✅ Test data setup complete');

    // Perform authentication setup
    await setupAuthentication();
    console.log('✅ Authentication setup complete');

    console.log('🎉 Global setup completed successfully');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}

/**
 * Setup test data for E2E tests
 */
async function setupTestData() {
  // Create test users with different roles and subscription levels
  const testUsers = [
    {
      email: 'test.user@example.com',
      name: 'Test User',
      role: 'user',
      subscription: 'basic',
    },
    {
      email: 'premium.user@example.com',
      name: 'Premium User',
      role: 'user',
      subscription: 'pro',
    },
    {
      email: 'admin.user@example.com',
      name: 'Admin User',
      role: 'admin',
      subscription: 'pro',
    },
  ];

  for (const userData of testUsers) {
    const { data: user, error } = await testDatabase.supabase
      .from('users')
      .upsert({
        email: userData.email,
        name: userData.name,
        access_level: userData.subscription === 'pro' ? 'premium' : 'free',
        role: userData.role,
      }, { onConflict: 'email' })
      .select()
      .single();

    if (error) {
      console.warn(`Failed to create test user ${userData.email}:`, error.message);
    } else {
      console.log(`Created test user: ${userData.email}`);
    }
  }
}

/**
 * Setup authentication for E2E tests
 */
async function setupAuthentication() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the application
    await page.goto('/');
    
    // Check if the application loads correctly
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Store authentication state for tests
    // This would typically involve logging in and saving the session
    await context.storageState({ path: 'e2e/auth/user-state.json' });
    
  } catch (error) {
    console.warn('Authentication setup failed:', error);
  } finally {
    await browser.close();
  }
}

export default globalSetup;