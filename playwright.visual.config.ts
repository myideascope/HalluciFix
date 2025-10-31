import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression testing configuration
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e/tests/visual',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report/visual' }],
    ['json', { outputFile: 'test-results/visual-results.json' }],
    ['list']
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL */
    baseURL: 'http://localhost:5173',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Always take screenshots for visual tests */
    screenshot: 'only-on-failure',
    
    /* Action and navigation timeouts */
    actionTimeout: 10000,
    navigationTimeout: 30000,
    
    /* Expect timeout for assertions */
    expect: {
      timeout: 10000,
      // Visual comparison settings
      threshold: 0.2, // Allow 20% pixel difference
      maxDiffPixels: 1000, // Maximum different pixels allowed
    }
  },

  /* Configure projects for visual testing */
  projects: [
    {
      name: 'chromium-desktop',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 }
      },
    },
    {
      name: 'chromium-tablet',
      use: { 
        ...devices['iPad Pro'],
        viewport: { width: 1024, height: 768 }
      },
    },
    {
      name: 'chromium-mobile',
      use: { 
        ...devices['iPhone 12'],
        viewport: { width: 390, height: 844 }
      },
    },
    // Test dark mode variations
    {
      name: 'chromium-desktop-dark',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        colorScheme: 'dark'
      },
    },
    {
      name: 'chromium-mobile-dark',
      use: { 
        ...devices['iPhone 12'],
        viewport: { width: 390, height: 844 },
        colorScheme: 'dark'
      },
    }
  ],

  /* Run your local dev server before starting the tests */
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
  outputDir: 'test-results/visual/',
  
  /* Test timeout */
  timeout: 60000,
});