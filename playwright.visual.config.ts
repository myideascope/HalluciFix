import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression testing configuration for Playwright
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e/visual',
  
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
    ['html', { outputFolder: 'visual-regression-report' }],
    ['json', { outputFile: 'test-results/visual-results.json' }],
    ['list']
  ],
  
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
    
    /* Take screenshot for visual comparison */
    screenshot: 'only-on-failure',
    
    /* Action and navigation timeouts */
    actionTimeout: 10000,
    navigationTimeout: 30000,
    
    /* Expect timeout for assertions */
    expect: {
      timeout: 5000,
      // Visual comparison settings
      threshold: 0.2, // Allow 20% pixel difference
      maxDiffPixels: 1000 // Maximum different pixels allowed
    }
  },

  /* Configure projects for visual regression testing */
  projects: [
    {
      name: 'visual-chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Consistent viewport for visual testing
        viewport: { width: 1280, height: 720 }
      },
    },
    {
      name: 'visual-firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 }
      },
    },
    {
      name: 'visual-mobile',
      use: { 
        ...devices['iPhone 12'],
        // Mobile viewport for responsive testing
        viewport: { width: 390, height: 844 }
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
  
  /* Output directories */
  outputDir: 'test-results/visual/',
  
  /* Test timeout */
  timeout: 30000,
  
  /* Global setup for visual tests */
  globalSetup: require.resolve('./e2e/visual/visual-setup.ts'),
});