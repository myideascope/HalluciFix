/**
 * Cross-Browser Playwright Configuration
 * Specialized configuration for cross-browser and responsive testing
 */

import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testDir: './e2e/tests',
  testMatch: ['**/cross-browser.spec.ts', '**/responsive.spec.ts'],

  // Extend timeout for cross-browser tests
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  // Run tests in parallel across browsers
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,

  // Retry failed tests
  retries: process.env.CI ? 2 : 1,

  // Reporter configuration for cross-browser results
  reporter: [
    ['html', { outputFolder: 'test-results/cross-browser-report' }],
    ['json', { outputFile: 'test-results/cross-browser-results.json' }],
    ['junit', { outputFile: 'test-results/cross-browser-junit.xml' }],
    ['list'],
  ],

  use: {
    ...baseConfig.use,
    // Capture screenshots on failure for visual debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    // Desktop browsers
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    // Tablet devices
    {
      name: 'ipad',
      use: {
        ...devices['iPad Pro'],
      },
    },
    {
      name: 'ipad-landscape',
      use: {
        ...devices['iPad Pro landscape'],
      },
    },

    // Mobile devices
    {
      name: 'iphone-12',
      use: {
        ...devices['iPhone 12'],
      },
    },
    {
      name: 'pixel-5',
      use: {
        ...devices['Pixel 5'],
      },
    },

    // Legacy browser support (if needed)
    {
      name: 'chromium-legacy',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        // Additional legacy browser flags can be added here
      },
    },
  ],

  /* Run local dev server before starting tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },

  /* Global setup and teardown */
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  /* Output directories */
  outputDir: 'test-results/cross-browser/',

  /* Metadata for cross-browser testing */
  metadata: {
    testType: 'cross-browser',
    environment: process.env.NODE_ENV || 'test',
    timestamp: new Date().toISOString()
  }
});