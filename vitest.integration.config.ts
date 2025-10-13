import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts', './src/test/integration-setup.ts'],
    globals: true,
    mockReset: false, // Don't reset mocks for integration tests
    restoreMocks: false,
    clearMocks: false,
    
    // Integration test specific configuration
    testTimeout: 30000, // Longer timeout for integration tests
    hookTimeout: 15000,
    
    // Sequential execution for integration tests to avoid database conflicts
    threads: false,
    maxThreads: 1,
    minThreads: 1,
    
    // Include integration test files
    include: [
      'src/**/*.integration.test.{ts,tsx}',
      'src/test/integration/**/*.test.{ts,tsx}'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'src/**/*.test.{ts,tsx}', // Exclude unit tests
      'src/**/*.spec.{ts,tsx}',
      '**/*.d.ts',
      '**/*.config.*'
    ],
    
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
        'scripts/'
      ],
      thresholds: {
        global: {
          branches: 70, // Lower thresholds for integration tests
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },
    
    // Environment variables for integration tests
    env: {
      NODE_ENV: 'test',
      VITE_TEST_MODE: 'integration',
      VITE_TEST_DATABASE_ISOLATION: 'true',
      VITE_SUPABASE_URL: process.env.VITE_TEST_SUPABASE_URL || 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_TEST_SUPABASE_ANON_KEY || 'test-anon-key',
      VITE_HALLUCIFIX_API_KEY: process.env.VITE_TEST_HALLUCIFIX_API_KEY || 'test-api-key',
      VITE_GOOGLE_CLIENT_ID: process.env.VITE_TEST_GOOGLE_CLIENT_ID || 'test-google-client-id',
      VITE_GOOGLE_CLIENT_SECRET: process.env.VITE_TEST_GOOGLE_CLIENT_SECRET || 'test-google-secret'
    },
    
    // Retry configuration for flaky integration tests
    retry: 2,
    
    // Watch mode configuration
    watch: {
      ignore: [
        'node_modules/**',
        'dist/**',
        'build/**',
        'coverage/**',
        'supabase/**'
      ]
    }
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './src/test')
    }
  }
});