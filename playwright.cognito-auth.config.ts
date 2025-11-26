import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Cognito Authentication E2E tests
 */
export default defineConfig({
  testDir: './src/test/e2e',
  testMatch: '**/cognito-auth-flow.spec.ts',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report-cognito-auth' }],
    ['json', { outputFile: 'test-results/cognito-auth-results.json' }],
    ['junit', { outputFile: 'test-results/cognito-auth-junit.xml' }],
  ],
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Global timeout for each test */
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    
    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      VITE_ENABLE_MIGRATION_MODE: 'true',
      VITE_DEFAULT_AUTH_MODE: 'cognito',
      VITE_ENABLE_AUTH_SWITCHER: 'true',
    },
  },
  
  /* Global setup and teardown */
  globalSetup: './src/test/setup/cognito-e2e-setup.ts',
  globalTeardown: './src/test/setup/cognito-e2e-teardown.ts',
  
  /* Test output directory */
  outputDir: 'test-results/cognito-auth-e2e',
  
  /* Timeout for each test */
  timeout: 60000,
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
});