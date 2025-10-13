import { defineConfig, devices } from '@playwright/test';

/**
 * Mobile-specific Playwright configuration
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: ['**/mobile-*.spec.ts', '**/responsive-*.spec.ts'],
  
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
    ['html', { outputFolder: 'playwright-report-mobile' }],
    ['json', { outputFile: 'test-results/mobile-results.json' }],
    ['junit', { outputFile: 'test-results/mobile-results.xml' }],
    ['list']
  ],
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot only on failures */
    screenshot: 'only-on-failure',
    
    /* Record video only on failures */
    video: 'retain-on-failure',
    
    /* Action and navigation timeouts - longer for mobile */
    actionTimeout: 15000,
    navigationTimeout: 45000,
    
    /* Expect timeout for assertions */
    expect: {
      timeout: 10000
    }
  },

  /* Configure projects for mobile devices */
  projects: [
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
        // Additional mobile-specific settings
        hasTouch: true,
        isMobile: true
      },
    },
    {
      name: 'Mobile Safari',
      use: { 
        ...devices['iPhone 12'],
        hasTouch: true,
        isMobile: true
      },
    },
    {
      name: 'Mobile Safari Landscape',
      use: { 
        ...devices['iPhone 12 landscape'],
        hasTouch: true,
        isMobile: true
      },
    },
    {
      name: 'Tablet iPad',
      use: { 
        ...devices['iPad Pro'],
        hasTouch: true,
        isMobile: false // Tablet, not mobile
      },
    },
    {
      name: 'Tablet Android',
      use: { 
        ...devices['Galaxy Tab S4'],
        hasTouch: true,
        isMobile: false
      },
    },
    {
      name: 'Small Mobile',
      use: {
        ...devices['iPhone SE'],
        hasTouch: true,
        isMobile: true
      },
    },
    {
      name: 'Large Mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 414, height: 896 }, // iPhone 11 Pro Max size
        hasTouch: true,
        isMobile: true
      },
    },
    
    // Custom responsive breakpoints
    {
      name: 'Mobile Portrait 320px',
      use: {
        viewport: { width: 320, height: 568 },
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
      },
    },
    {
      name: 'Mobile Portrait 375px',
      use: {
        viewport: { width: 375, height: 667 },
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
      },
    },
    {
      name: 'Mobile Portrait 414px',
      use: {
        viewport: { width: 414, height: 736 },
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
      },
    },
    {
      name: 'Tablet Portrait 768px',
      use: {
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        isMobile: false,
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  
  /* Global setup and teardown */
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  globalTeardown: require.resolve('./e2e/global-teardown.ts'),
  
  /* Output directories */
  outputDir: 'test-results/mobile/',
  
  /* Test timeout - longer for mobile */
  timeout: 60000,
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
});