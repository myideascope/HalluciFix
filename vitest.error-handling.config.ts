import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'error-handling-integration',
    include: [
      'src/test/integration/error-handling.integration.test.ts',
      'src/test/integration/error-boundaries.integration.test.tsx',
      'src/test/integration/error-monitoring.integration.test.ts'
    ],
    environment: 'jsdom',
    setupFiles: ['src/test/setup.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/lib/errors/**/*',
        'src/components/*ErrorBoundary*',
        'src/contexts/ErrorBoundaryContext.tsx',
        'src/hooks/useErrorBoundary.ts'
      ],
      exclude: [
        'src/test/**/*',
        'src/**/*.test.*',
        'src/**/*.spec.*'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    testTimeout: 10000, // 10 seconds for integration tests
    hookTimeout: 5000,  // 5 seconds for setup/teardown
    teardownTimeout: 5000,
    reporters: ['verbose', 'json'],
    outputFile: {
      json: './test-results/error-handling-integration-results.json'
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/components': resolve(__dirname, './src/components'),
      '@/lib': resolve(__dirname, './src/lib'),
      '@/hooks': resolve(__dirname, './src/hooks'),
      '@/contexts': resolve(__dirname, './src/contexts'),
      '@/types': resolve(__dirname, './src/types')
    }
  },
  define: {
    'process.env.NODE_ENV': '"test"'
  }
});