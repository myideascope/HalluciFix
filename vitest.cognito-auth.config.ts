import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'cognito-auth',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup-cognito-auth.ts'],
    include: ['src/**/*.cognito-auth.test.{ts,tsx}'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/cognito-auth',
      include: [
        'src/lib/cognitoAuth.ts',
        'src/lib/aws-config.ts',
        'src/hooks/useAuth.ts',
        'src/components/auth/**/*.tsx'
      ],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**/*'
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.VITE_AWS_REGION': JSON.stringify('us-east-1'),
    'import.meta.env.VITE_AWS_USER_POOL_ID': JSON.stringify('us-east-1_TEST123'),
    'import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID': JSON.stringify('test-client-id'),
    'import.meta.env.VITE_AWS_IDENTITY_POOL_ID': JSON.stringify('us-east-1:test-identity-pool'),
    'import.meta.env.VITE_AWS_USER_POOL_DOMAIN': JSON.stringify('test-domain.auth.us-east-1.amazoncognito.com'),
  },
});