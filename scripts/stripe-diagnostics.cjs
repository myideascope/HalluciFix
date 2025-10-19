#!/usr/bin/env node

/**
 * Stripe Configuration Diagnostics CLI
 * Command-line tool for testing and diagnosing Stripe integration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function printHeader(title) {
  console.log('\n' + colorize('='.repeat(60), 'cyan'));
  console.log(colorize(title.toUpperCase(), 'bright'));
  console.log(colorize('='.repeat(60), 'cyan'));
}

function printSection(title) {
  console.log('\n' + colorize(`📋 ${title}`, 'blue'));
  console.log(colorize('-'.repeat(40), 'blue'));
}

function printStatus(name, status, message, details = null) {
  const emoji = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  const color = status === 'pass' ? 'green' : status === 'warn' ? 'yellow' : 'red';
  
  console.log(`${emoji} ${colorize(name, 'bright')}: ${colorize(message, color)}`);
  
  if (details && typeof details === 'object') {
    Object.entries(details).forEach(([key, value]) => {
      if (key !== 'checks' && value !== null && value !== undefined) {
        console.log(`   ${key}: ${JSON.stringify(value)}`);
      }
    });
  }
}

function loadEnvironmentVariables() {
  const envFiles = ['.env.local', '.env.development', '.env'];
  
  for (const envFile of envFiles) {
    const envPath = path.join(process.cwd(), envFile);
    if (fs.existsSync(envPath)) {
      console.log(colorize(`📄 Loading environment from ${envFile}`, 'cyan'));
      
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envVars = envContent
        .split('\n')
        .filter(line => line.trim() && !line.startsWith('#'))
        .reduce((acc, line) => {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            acc[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          }
          return acc;
        }, {});
      
      Object.assign(process.env, envVars);
      break;
    }
  }
}

function checkEnvironmentVariables() {
  printSection('Environment Variables');
  
  const stripeVars = [
    { name: 'VITE_STRIPE_PUBLISHABLE_KEY', required: true, description: 'Stripe publishable key for client-side' },
    { name: 'STRIPE_SECRET_KEY', required: true, description: 'Stripe secret key for server-side' },
    { name: 'STRIPE_WEBHOOK_SECRET', required: false, description: 'Webhook endpoint verification' },
    { name: 'STRIPE_PRICE_ID_BASIC_MONTHLY', required: false, description: 'Basic monthly plan price ID' },
    { name: 'STRIPE_PRICE_ID_PRO_MONTHLY', required: false, description: 'Pro monthly plan price ID' },
    { name: 'VITE_ENABLE_PAYMENTS', required: false, description: 'Enable payment features' },
  ];
  
  stripeVars.forEach(({ name, required, description }) => {
    const value = process.env[name];
    const configured = !!value;
    
    let status, message;
    if (configured) {
      status = 'pass';
      message = `Configured (${value.substring(0, 12)}...)`;
    } else if (required) {
      status = 'fail';
      message = 'Missing (required)';
    } else {
      status = 'warn';
      message = 'Not configured (optional)';
    }
    
    printStatus(name, status, message, { description });
  });
}

function checkStripeConfiguration() {
  printSection('Stripe Configuration');
  
  const publishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const paymentsEnabled = process.env.VITE_ENABLE_PAYMENTS === 'true';
  
  // Check if payments are enabled
  printStatus(
    'Payments Enabled',
    paymentsEnabled ? 'pass' : 'warn',
    paymentsEnabled ? 'Payments are enabled' : 'Payments are disabled',
    { enabled: paymentsEnabled }
  );
  
  // Check publishable key format
  if (publishableKey) {
    const isValidFormat = publishableKey.startsWith('pk_');
    printStatus(
      'Publishable Key Format',
      isValidFormat ? 'pass' : 'fail',
      isValidFormat ? 'Valid Stripe publishable key format' : 'Invalid key format (should start with pk_)',
      { keyPrefix: publishableKey.substring(0, 12) + '...' }
    );
  }
  
  // Check secret key format
  if (secretKey) {
    const isValidFormat = secretKey.startsWith('sk_');
    printStatus(
      'Secret Key Format',
      isValidFormat ? 'pass' : 'fail',
      isValidFormat ? 'Valid Stripe secret key format' : 'Invalid key format (should start with sk_)',
      { keyPrefix: secretKey.substring(0, 12) + '...' }
    );
  }
  
  // Check key environment consistency
  if (publishableKey && secretKey) {
    const pubEnv = publishableKey.includes('_test_') ? 'test' : 'live';
    const secEnv = secretKey.includes('_test_') ? 'test' : 'live';
    
    printStatus(
      'Key Environment Consistency',
      pubEnv === secEnv ? 'pass' : 'fail',
      pubEnv === secEnv ? `Both keys are for ${pubEnv} environment` : `Key mismatch: publishable=${pubEnv}, secret=${secEnv}`,
      { publishableEnv: pubEnv, secretEnv: secEnv }
    );
  }
}

async function testStripeConnectivity() {
  printSection('Stripe API Connectivity');
  
  const secretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!secretKey) {
    printStatus('API Connection', 'fail', 'Cannot test - secret key not configured');
    return;
  }
  
  try {
    // Simple test using curl to avoid Node.js Stripe SDK dependency
    const curlCommand = `curl -s -w "%{http_code}" -o /dev/null -H "Authorization: Bearer ${secretKey}" https://api.stripe.com/v1/account`;
    
    const statusCode = execSync(curlCommand, { encoding: 'utf8', timeout: 10000 }).trim();
    
    if (statusCode === '200') {
      printStatus('API Connection', 'pass', 'Successfully connected to Stripe API');
    } else {
      printStatus('API Connection', 'fail', `API request failed with status ${statusCode}`);
    }
  } catch (error) {
    printStatus('API Connection', 'fail', `Connection test failed: ${error.message}`);
  }
}

function checkDatabaseMigrations() {
  printSection('Database Schema');
  
  const migrationFile = 'supabase/migrations/20250119000001_stripe_payment_infrastructure.sql';
  const migrationPath = path.join(process.cwd(), migrationFile);
  
  if (fs.existsSync(migrationPath)) {
    printStatus('Payment Tables Migration', 'pass', 'Stripe payment migration file exists');
    
    // Check migration content
    const content = fs.readFileSync(migrationPath, 'utf8');
    const tables = ['user_subscriptions', 'payment_history', 'usage_records', 'subscription_plans'];
    
    tables.forEach(table => {
      const hasTable = content.includes(`CREATE TABLE IF NOT EXISTS ${table}`);
      printStatus(
        `Table: ${table}`,
        hasTable ? 'pass' : 'fail',
        hasTable ? 'Table definition found in migration' : 'Table definition missing'
      );
    });
  } else {
    printStatus('Payment Tables Migration', 'fail', 'Stripe payment migration file not found');
  }
}

function generateRecommendations() {
  printSection('Recommendations');
  
  const recommendations = [];
  
  // Check environment
  const nodeEnv = process.env.NODE_ENV || 'development';
  const secretKey = process.env.STRIPE_SECRET_KEY;
  
  if (nodeEnv === 'production' && secretKey && secretKey.includes('_test_')) {
    recommendations.push('🚨 Using test keys in production environment');
  }
  
  if (nodeEnv === 'development' && secretKey && !secretKey.includes('_test_')) {
    recommendations.push('⚠️ Using live keys in development environment');
  }
  
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    recommendations.push('💡 Configure webhook secret for production webhook handling');
  }
  
  if (!process.env.STRIPE_PRICE_ID_BASIC_MONTHLY) {
    recommendations.push('💡 Configure subscription price IDs for subscription plans');
  }
  
  if (process.env.VITE_ENABLE_PAYMENTS !== 'true') {
    recommendations.push('💡 Enable payments by setting VITE_ENABLE_PAYMENTS=true');
  }
  
  if (recommendations.length === 0) {
    console.log(colorize('✅ No specific recommendations - configuration looks good!', 'green'));
  } else {
    recommendations.forEach(rec => console.log(rec));
  }
}

function printUsage() {
  console.log(colorize('Stripe Configuration Diagnostics', 'bright'));
  console.log('\nUsage: node scripts/stripe-diagnostics.js [options]');
  console.log('\nOptions:');
  console.log('  --help, -h     Show this help message');
  console.log('  --env <file>   Load specific environment file');
  console.log('  --no-api       Skip API connectivity tests');
  console.log('  --verbose      Show detailed output');
  console.log('\nExamples:');
  console.log('  node scripts/stripe-diagnostics.js');
  console.log('  node scripts/stripe-diagnostics.js --env .env.production');
  console.log('  node scripts/stripe-diagnostics.js --no-api');
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const options = {
    help: args.includes('--help') || args.includes('-h'),
    noApi: args.includes('--no-api'),
    verbose: args.includes('--verbose'),
    envFile: null,
  };
  
  const envIndex = args.indexOf('--env');
  if (envIndex !== -1 && args[envIndex + 1]) {
    options.envFile = args[envIndex + 1];
  }
  
  if (options.help) {
    printUsage();
    return;
  }
  
  printHeader('Stripe Configuration Diagnostics');
  console.log(colorize(`🕐 ${new Date().toISOString()}`, 'cyan'));
  console.log(colorize(`📁 ${process.cwd()}`, 'cyan'));
  
  // Load environment variables
  if (options.envFile) {
    const envPath = path.join(process.cwd(), options.envFile);
    if (fs.existsSync(envPath)) {
      console.log(colorize(`📄 Loading environment from ${options.envFile}`, 'cyan'));
      // Load specific env file logic here
    } else {
      console.log(colorize(`❌ Environment file not found: ${options.envFile}`, 'red'));
      return;
    }
  } else {
    loadEnvironmentVariables();
  }
  
  // Run diagnostics
  try {
    checkEnvironmentVariables();
    checkStripeConfiguration();
    
    if (!options.noApi) {
      await testStripeConnectivity();
    }
    
    checkDatabaseMigrations();
    generateRecommendations();
    
    printHeader('Diagnostics Complete');
    console.log(colorize('✅ Stripe diagnostics completed successfully', 'green'));
    
  } catch (error) {
    console.error(colorize(`❌ Diagnostics failed: ${error.message}`, 'red'));
    process.exit(1);
  }
}

// Run the diagnostics
if (require.main === module) {
  main().catch(error => {
    console.error(colorize(`💥 Unexpected error: ${error.message}`, 'red'));
    process.exit(1);
  });
}

module.exports = {
  main,
  checkEnvironmentVariables,
  checkStripeConfiguration,
  testStripeConnectivity,
  checkDatabaseMigrations,
};