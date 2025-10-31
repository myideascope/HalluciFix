/**
 * Global Teardown for Playwright E2E Tests
 * Handles cleanup of test data and resources
 */

import { FullConfig } from '@playwright/test';
import { testDatabase } from '../src/test/utils/testDatabase';
import { promises as fs } from 'fs';
import path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test global teardown...');

  try {
    // Clean up test database
    await testDatabase.cleanup();
    console.log('✅ Test database cleanup complete');

    // Clean up authentication files
    await cleanupAuthFiles();
    console.log('✅ Authentication cleanup complete');

    // Clean up temporary files
    await cleanupTempFiles();
    console.log('✅ Temporary files cleanup complete');

    console.log('🎉 Global teardown completed successfully');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error to avoid masking test failures
  }
}

/**
 * Clean up authentication state files
 */
async function cleanupAuthFiles() {
  const authDir = path.join(__dirname, 'auth');
  
  try {
    const files = await fs.readdir(authDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await fs.unlink(path.join(authDir, file));
      }
    }
  } catch (error) {
    // Directory might not exist, which is fine
    console.log('Auth directory cleanup skipped (directory not found)');
  }
}

/**
 * Clean up temporary test files
 */
async function cleanupTempFiles() {
  const tempDirs = [
    'test-results',
    'playwright-report',
    'e2e/screenshots',
    'e2e/videos',
  ];

  for (const dir of tempDirs) {
    try {
      const fullPath = path.resolve(dir);
      await fs.access(fullPath);
      
      // Clean up old files (keep recent ones for debugging)
      const files = await fs.readdir(fullPath);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const file of files) {
        const filePath = path.join(fullPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      // Directory might not exist or be inaccessible, which is fine
      console.log(`Cleanup skipped for ${dir}: ${error.message}`);
    }
  }
}

export default globalTeardown;