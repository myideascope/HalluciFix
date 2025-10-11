#!/usr/bin/env node

/**
 * Environment validation script
 * Validates environment configuration and provides helpful feedback
 */

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return env;
}

function validateEnvironment() {
  log('blue', '🔍 HalluciFix Environment Validation');
  log('blue', '=====================================\n');

  // Load environment files
  const envLocal = loadEnvFile('.env.local');
  const envExample = loadEnvFile('.env.example');

  let hasErrors = false;
  let hasWarnings = false;

  // Required variables
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY'
  ];

  // Check required variables
  log('bold', '📋 Required Configuration:');
  required.forEach(key => {
    if (!envLocal[key] || envLocal[key].includes('your_')) {
      log('red', `❌ ${key}: Missing or not configured`);
      hasErrors = true;
    } else {
      log('green', `✅ ${key}: Configured`);
    }
  });

  // Optional but important variables
  const optional = {
    'VITE_OPENAI_API_KEY': 'Real AI analysis (currently using mocks)',
    'VITE_GOOGLE_CLIENT_ID': 'Google OAuth authentication',
    'VITE_STRIPE_PUBLISHABLE_KEY': 'Payment processing',
    'VITE_SENTRY_DSN': 'Error tracking and monitoring'
  };

  log('bold', '\n🔧 Optional Configuration:');
  Object.entries(optional).forEach(([key, description]) => {
    if (!envLocal[key] || envLocal[key].includes('your_')) {
      log('yellow', `⚠️  ${key}: Not configured - ${description}`);
      hasWarnings = true;
    } else {
      log('green', `✅ ${key}: Configured`);
    }
  });

  // Feature flags
  log('bold', '\n🚩 Feature Flags:');
  const featureFlags = {
    'VITE_ENABLE_MOCK_SERVICES': 'Mock services (disable for production)',
    'VITE_ENABLE_PAYMENTS': 'Payment processing',
    'VITE_ENABLE_ANALYTICS': 'Analytics tracking',
    'VITE_ENABLE_BETA_FEATURES': 'Beta features'
  };

  Object.entries(featureFlags).forEach(([key, description]) => {
    const value = envLocal[key] || 'false';
    const enabled = value === 'true';
    const icon = enabled ? '🟢' : '🔴';
    const status = enabled ? 'Enabled' : 'Disabled';
    log('blue', `${icon} ${key}: ${status} - ${description}`);
  });

  // URL validation
  log('bold', '\n🌐 URL Validation:');
  const urls = ['VITE_SUPABASE_URL', 'VITE_APP_URL', 'VITE_HALLUCIFIX_API_URL'];
  urls.forEach(key => {
    const value = envLocal[key];
    if (value && !value.includes('your_')) {
      try {
        new URL(value);
        log('green', `✅ ${key}: Valid URL`);
      } catch {
        log('red', `❌ ${key}: Invalid URL format`);
        hasErrors = true;
      }
    }
  });

  // Security checks
  log('bold', '\n🔒 Security Checks:');
  
  // Check for placeholder values
  const placeholders = Object.entries(envLocal).filter(([key, value]) => 
    value.includes('your_') || value.includes('sk_test_your') || value.includes('pk_test_your')
  );
  
  if (placeholders.length > 0) {
    log('yellow', '⚠️  Found placeholder values that should be replaced:');
    placeholders.forEach(([key]) => {
      log('yellow', `   - ${key}`);
    });
    hasWarnings = true;
  }

  // Check NODE_ENV
  const nodeEnv = envLocal.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    log('green', '✅ NODE_ENV: Production mode');
    
    // Additional production checks
    if (envLocal.VITE_ENABLE_MOCK_SERVICES === 'true') {
      log('red', '❌ Mock services enabled in production');
      hasErrors = true;
    }
  } else {
    log('blue', `🔧 NODE_ENV: ${nodeEnv} mode`);
  }

  // Summary
  log('bold', '\n📊 Summary:');
  if (hasErrors) {
    log('red', '❌ Configuration has errors that must be fixed');
    log('yellow', '💡 Edit .env.local to fix the issues above');
    process.exit(1);
  } else if (hasWarnings) {
    log('yellow', '⚠️  Configuration is functional but has warnings');
    log('blue', '💡 Consider configuring optional services for full functionality');
  } else {
    log('green', '✅ Configuration is complete and valid');
  }

  // Next steps
  log('bold', '\n🚀 Next Steps:');
  if (hasErrors) {
    log('yellow', '1. Fix the configuration errors above');
    log('yellow', '2. Run this validation again');
  } else {
    log('green', '1. Start development server: npm run dev');
    log('green', '2. Check browser console for any runtime issues');
    if (hasWarnings) {
      log('yellow', '3. Consider configuring optional services');
    }
  }

  console.log('');
}

// Run validation
try {
  validateEnvironment();
} catch (error) {
  log('red', `❌ Validation failed: ${error.message}`);
  process.exit(1);
}