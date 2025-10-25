import { defineConfig, devices } from '@playwright/test';

/**
 * Security Testing Configuration
 * Specialized configuration for security vulnerability testing
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/security.spec.ts',
  
  /* Run tests sequentially for security testing */
  fullyParallel: false,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  
  /* Single worker for consistent security testing */
  workers: 1,
  
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'security-test-report' }],
    ['json', { outputFile: 'test-results/security-results.json' }],
    ['junit', { outputFile: 'test-results/security-results.xml' }],
    ['list']
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL */
    baseURL: 'http://localhost:5173',

    /* Collect trace for security analysis */
    trace: 'on',
    
    /* Take screenshots for security issues */
    screenshot: 'only-on-failure',
    
    /* Record video for security debugging */
    video: 'retain-on-failure',
    
    /* Security testing timeouts */
    actionTimeout: 15000,
    navigationTimeout: 30000,
    
    /* Expect timeout */
    expect: {
      timeout: 10000
    },
    
    /* Security-specific settings */
    ignoreHTTPSErrors: false, // Strict HTTPS checking
    
    /* Extra HTTP headers for security testing */
    extraHTTPHeaders: {
      'X-Security-Test': 'true',
      'User-Agent': 'Security-Test-Bot/1.0'
    }
  },

  /* Security testing projects */
  projects: [
    {
      name: 'security-chrome',
      use: { 
        ...devices['Desktop Chrome'],
        // Security testing with Chrome
        viewport: { width: 1280, height: 720 },
        // Clear storage for each test
        storageState: undefined,
      },
    },
    
    {
      name: 'security-firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        storageState: undefined,
      },
    },
    
    // Mobile security testing
    {
      name: 'security-mobile',
      use: { 
        ...devices['Pixel 5'],
        storageState: undefined,
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
      NODE_ENV: 'test',
      VITE_SECURITY_TESTING: 'true'
    }
  },
  
  /* Global setup and teardown */
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  
  /* Output directories */
  outputDir: 'test-results/security/',
  
  /* Test timeout */
  timeout: 45000,
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
  
  /* Metadata for security testing */
  metadata: {
    testType: 'security',
    environment: process.env.NODE_ENV || 'test',
    timestamp: new Date().toISOString()
  }
});