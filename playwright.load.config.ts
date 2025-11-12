import { defineConfig, devices } from '@playwright/test';

/**
 * Load Testing Configuration
 * Tests application performance under various load conditions
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/performance.spec.ts',

  /* Run tests sequentially for accurate load measurement */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,

  /* Single worker for consistent load testing */
  workers: 1,

  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'load-test-report' }],
    ['json', { outputFile: 'test-results/load-test-results.json' }],
    ['junit', { outputFile: 'test-results/load-test-results.xml' }],
    ['list']
  ],

  /* Shared settings for all projects */
  use: {
    /* Base URL */
    baseURL: 'http://localhost:5173',

    /* Collect trace for load analysis */
    trace: 'retain-on-failure',

    /* Take screenshots for load debugging */
    screenshot: 'only-on-failure',

    /* Record video for load debugging */
    video: 'retain-on-failure',

    /* Extended timeouts for load tests */
    actionTimeout: 30000,
    navigationTimeout: 60000,

    /* Load testing specific headers */
    extraHTTPHeaders: {
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
    }
  },

  /* Load testing projects */
  projects: [
    {
      name: 'load-baseline',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: 'load-concurrent-users',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: 'load-memory-stress',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: 'load-network-slow',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: 'load-mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 393, height: 851 },
      },
    },
  ],

  /* Run local dev server before starting tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
      VITE_LOAD_TESTING: 'true',
      // Increase memory limits for load testing
      NODE_OPTIONS: '--max-old-space-size=4096'
    }
  },

  /* Global setup and teardown */
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  /* Output directories */
  outputDir: 'test-results/load-test/',

  /* Extended timeout for load tests */
  timeout: 300000, // 5 minutes

  /* Load testing specific expect timeout */
  expect: {
    timeout: 30000,
  },

  /* Metadata for load testing */
  metadata: {
    testType: 'load',
    environment: process.env.NODE_ENV || 'test',
    timestamp: new Date().toISOString()
  }
});