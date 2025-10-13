import { defineConfig, devices } from '@playwright/test';

/**
 * Performance testing configuration for Playwright
 * Focuses on Core Web Vitals and performance benchmarks
 */
export default defineConfig({
  testDir: './e2e/performance',
  fullyParallel: false, // Run performance tests sequentially for consistent results
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // Fewer retries for performance tests
  workers: 1, // Single worker for consistent performance measurements
  
  reporter: [
    ['html', { outputFolder: 'performance-report' }],
    ['json', { outputFile: 'performance-results/results.json' }],
    ['junit', { outputFile: 'performance-results/results.xml' }],
    ['list']
  ],
  
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    actionTimeout: 30000,
    navigationTimeout: 60000,
    
    // Performance-specific settings
    launchOptions: {
      args: [
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    }
  },

  projects: [
    {
      name: 'performance-desktop',
      use: {
        ...devices['Desktop Chrome'],
        // Network throttling for realistic conditions
        contextOptions: {
          // Simulate slow 3G connection
          offline: false,
          // Custom network conditions will be set per test
        }
      }
    },
    {
      name: 'performance-mobile',
      use: {
        ...devices['Pixel 5'],
        // Mobile performance testing
        contextOptions: {
          offline: false,
        }
      }
    }
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  
  outputDir: 'performance-results/',
  timeout: 60000, // Longer timeout for performance tests
  
  expect: {
    timeout: 10000,
  },
});