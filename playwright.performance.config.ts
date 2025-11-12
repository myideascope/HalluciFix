import { defineConfig, devices } from '@playwright/test';

/**
 * Performance Testing Configuration
 * Optimized for performance measurement and load testing
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/performance.spec.ts',
  
  /* Run tests in files in parallel */
  fullyParallel: false, // Sequential for accurate performance measurement
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0, // Reduced retries for performance tests
  
  /* Single worker for consistent performance measurement */
  workers: 1,
  
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'performance-report' }],
    ['json', { outputFile: 'test-results/performance-results.json' }],
    ['junit', { outputFile: 'test-results/performance-results.xml' }],
    ['list']
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL */
    baseURL: 'http://localhost:5173',

    /* Collect trace for performance analysis */
    trace: 'on',
    
    /* Take screenshots for performance analysis */
    screenshot: 'on',
    
    /* Record video for performance debugging */
    video: 'on',
    
    /* Extended timeouts for performance tests */
    actionTimeout: 30000,
    navigationTimeout: 60000,

    /* Performance-specific settings */
    extraHTTPHeaders: {
      'Accept-Encoding': 'gzip, deflate, br'
    }
  },

  /* Performance testing projects */
  projects: [
    {
      name: 'performance-desktop',
      use: { 
        ...devices['Desktop Chrome'],
        // Consistent viewport for performance measurement
        viewport: { width: 1920, height: 1080 },
        // Disable cache for accurate measurement
        storageState: undefined,
      },
    },
    
    {
      name: 'performance-mobile',
      use: { 
        ...devices['Pixel 5'],
        // Mobile performance testing
        viewport: { width: 393, height: 851 },
      },
    },
    
    {
      name: 'performance-tablet',
      use: { 
        ...devices['iPad Pro'],
        viewport: { width: 1024, height: 1366 },
      },
    },
    
    // Network condition testing
    {
      name: 'performance-slow-3g',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        // Slow 3G simulation will be handled in test code
      },
    },
    
    {
      name: 'performance-fast-3g',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        // Fast 3G simulation will be handled in test code
      },
    }
  ],

  /* Run local dev server before starting tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      // Performance testing environment variables
      NODE_ENV: 'test',
      VITE_PERFORMANCE_TESTING: 'true'
    }
  },
  
  /* Global setup and teardown */
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  
  /* Output directories */
  outputDir: 'test-results/performance/',
  
  /* Extended timeout for performance tests */
  timeout: 60000,
  
  /* Performance-specific expect timeout */
  expect: {
    timeout: 10000,
  },
  
  /* Metadata for performance testing */
  metadata: {
    testType: 'performance',
    environment: process.env.NODE_ENV || 'test',
    timestamp: new Date().toISOString()
  }
});