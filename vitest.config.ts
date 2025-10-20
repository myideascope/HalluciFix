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
    
    // Coverage configuration with comprehensive thresholds
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'text-summary'],
      reportsDirectory: './coverage',
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
        '**/fixtures/**'
      ],
      include: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        },
        // Critical modules require 90% coverage
        'src/lib/analysisService.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        },
        'src/lib/supabase.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        },
        'src/lib/api.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        },
        'src/hooks/useAuth.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        }
      }
    },
    
    // Test execution configuration
    testTimeout: 15000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    
    // Parallel execution optimization
    threads: true,
    maxThreads: 4,
    minThreads: 1,
    isolate: true,
    
    // File patterns
    include: [
      'src/**/*.{test,spec}.{js,ts,jsx,tsx}'
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
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './test-results/unit-test-results.json',
      html: './test-results/unit-test-report.html'
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