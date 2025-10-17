import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration specifically for accessibility testing
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e/accessibility',
  
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
    ['html', { outputFolder: 'accessibility-test-report' }],
    ['json', { outputFile: 'test-results/accessibility-results.json' }],
    ['junit', { outputFile: 'test-results/accessibility-results.xml' }],
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
    
    /* Action and navigation timeouts */
    actionTimeout: 10000,
    navigationTimeout: 30000,
    
    /* Expect timeout for assertions */
    expect: {
      timeout: 5000
    }
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium-accessibility',
      use: { 
        ...devices['Desktop Chrome'],
        // Enable accessibility features
        launchOptions: {
          args: [
            '--enable-accessibility-logging',
            '--enable-accessibility-tab-switcher',
            '--force-renderer-accessibility'
          ]
        }
      },
    },

    {
      name: 'firefox-accessibility',
      use: { 
        ...devices['Desktop Firefox'],
        // Firefox accessibility settings
        launchOptions: {
          firefoxUserPrefs: {
            'accessibility.force_disabled': 0,
            'accessibility.tabfocus': 7
          }
        }
      },
    },

    {
      name: 'webkit-accessibility',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports for accessibility */
    {
      name: 'mobile-chrome-accessibility',
      use: { 
        ...devices['Pixel 5'],
        // Mobile accessibility features
        launchOptions: {
          args: [
            '--enable-accessibility-logging',
            '--force-renderer-accessibility'
          ]
        }
      },
    },
    
    {
      name: 'mobile-safari-accessibility',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  
  /* Output directories */
  outputDir: 'test-results/accessibility/',
  
  /* Test timeout */
  timeout: 30000,
  
  /* Expect timeout */
  expect: {
    timeout: 5000,
  },
});