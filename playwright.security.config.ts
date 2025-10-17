import { defineConfig, devices } from '@playwright/test';

/**
 * Security testing configuration for Playwright
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e/security',
  
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
    ['html', { outputFolder: 'security-test-report' }],
    ['json', { outputFile: 'test-results/security-results.json' }],
    ['junit', { outputFile: 'test-results/security-results.xml' }],
    ['list']
  ],
  
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
    
    /* Take screenshot only on failures */
    screenshot: 'only-on-failure',
    
    /* Record video only on failures */
    video: 'retain-on-failure',
    
    /* Action and navigation timeouts */
    actionTimeout: 10000,
    navigationTimeout: 30000,
    
    /* Expect timeout for assertions */
    expect: {
      timeout: 5000
    },
    
    /* Extra HTTP headers */
    extraHTTPHeaders: {
      // Test with security headers
      'X-Forwarded-Proto': 'https',
      'X-Real-IP': '127.0.0.1'
    }
  },

  /* Configure projects for security testing */
  projects: [
    {
      name: 'security-chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Test with different user agents to check for user agent based vulnerabilities
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
    },
    {
      name: 'security-firefox',
      use: { 
        ...devices['Desktop Firefox'],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
      },
    },
    {
      name: 'security-mobile',
      use: { 
        ...devices['iPhone 12'],
        // Test mobile security
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
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
  outputDir: 'test-results/security/',
  
  /* Test timeout */
  timeout: 60000, // Longer timeout for security tests
  
  /* Global setup for security tests */
  globalSetup: require.resolve('./e2e/security/security-setup.ts'),
});