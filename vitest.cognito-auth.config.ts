import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'cognito-auth',
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup/cognito-auth-setup.ts'],
    include: [
      'src/tests/auth/**/*.test.{ts,tsx}',
      'src/tests/integration/**/*.test.{ts,tsx}',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'src/tests/e2e/**',
    ],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/cognito-auth',
      include: [
        'src/lib/cognito-auth.ts',
        'src/lib/aws-config.ts',
        'src/hooks/useCognitoAuth.ts',
        'src/components/CognitoApp.tsx',
      ],
      exclude: [
        'src/tests/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.VITE_ENABLE_MIGRATION_MODE': '"true"',
    'import.meta.env.VITE_DEFAULT_AUTH_MODE': '"cognito"',
    'import.meta.env.DEV': 'true',
  },
});