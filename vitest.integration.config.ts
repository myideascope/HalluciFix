import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    
    // Integration test specific configuration
    testTimeout: 30000, // Longer timeout for integration tests
    hookTimeout: 15000,
    teardownTimeout: 10000,
    
    // Coverage configuration for integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage/integration',
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
        '**/*.stories.*',
        'dist/',
        'build/',
        'supabase/',
        'docs/',
        'scripts/',
        '**/*.test.*',
        '**/*.spec.*',
        '**/mocks/**',
        '**/fixtures/**',
        '**/factories/**'
      ],
      include: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/test/**'
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        },
        // Integration tests focus on service integration
        'src/lib/supabase.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        },
        'src/lib/api.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        },
        'src/lib/analysisService.ts': {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75
        }
      }
    },
    
    // Parallel execution for integration tests
    threads: true,
    maxThreads: 2, // Fewer threads for integration tests to avoid conflicts
    minThreads: 1,
    isolate: true,
    
    // File patterns for integration tests
    include: [
      'src/**/*.integration.{test,spec}.{js,ts,jsx,tsx}',
      'src/test/integration/**/*.{test,spec}.{js,ts,jsx,tsx}'
    ],
    exclude: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      'e2e/',
      'playwright-report/',
      'test-results/'
    ],
    
    // Watch mode configuration
    watch: {
      ignore: [
        'node_modules/**',
        'dist/**',
        'build/**',
        'coverage/**',
        'playwright-report/**',
        'test-results/**'
      ]
    },
    
    // Reporter configuration
    reporter: ['verbose', 'json'],
    outputFile: {
      json: './test-results/integration-test-results.json'
    },
    
    // Environment variables for integration tests
    env: {
      VITE_TEST_MODE: 'integration',
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_GOOGLE_CLIENT_ID: 'test-google-client-id',
      VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_stripe_key'
    }
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './src/test'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@types': path.resolve(__dirname, './src/types')
    }
  }
});