import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { 
    ignores: [
      'dist/**',
      'node_modules/**',
      'supabase/**',
      'e2e/**',
      'playwright-report/**',
      'test-results/**',
      'performance-report/**',
      '*.config.js',
      '*.config.ts',
      'scripts/**'
    ] 
  },
  {
    ...js.configs.recommended,
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      'no-unused-vars': 'warn',
      'prefer-const': 'error',
      'no-useless-escape': 'warn',
      'no-console': 'warn',
      'no-debugger': 'error',
    },
  }
];
