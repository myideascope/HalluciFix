import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    // Bundle analyzer plugin
    visualizer({
      filename: 'dist/stats.html',
      open: false, // Don't auto-open, just generate file
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    // Enable detailed logging
    reportCompressedSize: true,
    // Manual chunk splitting for optimization
    rollupOptions: {
      output: {
        manualChunks: {
          // Split large AWS SDK dependencies
          'aws-sdk-cloudwatch': ['@aws-sdk/client-cloudwatch'],
          'aws-sdk-bedrock': ['@aws-sdk/client-bedrock', '@aws-sdk/client-bedrock-runtime'],
          'aws-sdk-cognito': ['@aws-sdk/client-cognito-identity-provider'],
          'aws-sdk-s3': ['@aws-sdk/client-s3'],
          // Split analytics and monitoring
          'analytics': ['@sentry/browser', '@sentry/tracing'],
          // Split database utilities
          'database': ['pg', '@supabase/supabase-js'],
          // Split Redis utilities
          'redis': ['ioredis'],
        },
      },
    },
  },
});