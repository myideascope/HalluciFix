import { defineConfig, devices } from '@playwright/test';

/**
 * Accessibility Testing Configuration
 * Specialized configuration for WCAG 2.1 AA compliance testing
 */
export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/accessibility.spec.ts',
  
  /* Run tests sequentially for consistent accessibility testing */
  fullyParallel: false,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  
  /* Single worker for consistent accessibility testing */
  workers: 1,
  
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'accessibility-test-report' }],
    ['json', { outputFile: 'test-results/accessibility-results.json' }],
    ['junit', { outputFile: 'test-results/accessibility-results.xml' }],
    ['list']
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL */
    baseURL: 'http://localhost:5173',

    /* Collect trace for accessibility analysis */
    trace: 'on',
    
    /* Take screenshots for accessibility issues */
    screenshot: 'only-on-failure',
    
    /* Record video for accessibility debugging */
    video: 'retain-on-failure',
    
    /* Accessibility testing timeouts */
    actionTimeout: 15000,
    navigationTimeout: 30000,
    
    /* Expect timeout */
    expect: {
      timeout: 10000
    },
    
    /* Accessibility-specific settings */
    reducedMotion: 'reduce', // Test with reduced motion by default
    
    /* Extra HTTP headers for accessibility testing */
    extraHTTPHeaders: {
      'X-Accessibility-Test': 'true'
    }
  },

  /* Accessibility testing projects */
  projects: [
    {
      name: 'accessibility-desktop',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Test with high contrast mode
        colorScheme: 'dark',
      },
    },
    
    {
      name: 'accessibility-mobile',
      use: { 
        ...devices['Pixel 5'],
        // Mobile accessibility testing
        hasTouch: true,
      },
    },
    
    {
      name: 'accessibility-tablet',
      use: { 
        ...devices['iPad Pro'],
        hasTouch: true,
      },
    },
    
    // High contrast testing
    {
      name: 'accessibility-high-contrast',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        colorScheme: 'dark',
        // Simulate high contrast mode
        extraHTTPHeaders: {
          'X-High-Contrast': 'true'
        }
      },
    },
    
    // Reduced motion testing
    {
      name: 'accessibility-reduced-motion',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        reducedMotion: 'reduce',
      },
    },
    
    // Large text testing (simulating zoom)
    {
      name: 'accessibility-large-text',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Will be handled in test code with CSS zoom
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
      VITE_ACCESSIBILITY_TESTING: 'true'
    }
  },
  
  /* Global setup and teardown */
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  
  /* Output directories */
  outputDir: 'test-results/accessibility/',
  
  /* Test timeout */
  timeout: 45000,
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
  
  /* Metadata for accessibility testing */
  metadata: {
    testType: 'accessibility',
    wcagLevel: 'AA',
    wcagVersion: '2.1',
    environment: process.env.NODE_ENV || 'test',
    timestamp: new Date().toISOString()
  }
});