#!/usr/bin/env node

/**
 * AWS Configuration Validation Script
 * Validates AWS environment variables and configuration
 */

const fs = require('fs');
const path = require('path');

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Required AWS environment variables by environment
const requiredVars = {
  development: [
    'AWS_REGION',
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_USER_POOL_CLIENT_ID',
    'VITE_COGNITO_IDENTITY_POOL_ID',
    'VITE_COGNITO_DOMAIN',
    'VITE_API_GATEWAY_URL',
    'VITE_S3_BUCKET_NAME',
    'DATABASE_URL'
  ],
  staging: [
    'AWS_REGION',
    'AWS_PROFILE',
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_USER_POOL_CLIENT_ID',
    'VITE_COGNITO_IDENTITY_POOL_ID',
    'VITE_COGNITO_DOMAIN',
    'VITE_API_GATEWAY_URL',
    'VITE_S3_BUCKET_NAME',
    'DATABASE_URL'
  ],
  production: [
    'AWS_REGION',
    'AWS_PROFILE',
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_USER_POOL_CLIENT_ID',
    'VITE_COGNITO_IDENTITY_POOL_ID',
    'VITE_COGNITO_DOMAIN',
    'VITE_API_GATEWAY_URL',
    'VITE_S3_BUCKET_NAME',
    'DATABASE_URL'
  ]
};

// Optional variables that enhance functionality
const optionalVars = [
  'VITE_BEDROCK_ENABLED',
  'VITE_BEDROCK_MODEL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'VITE_CLOUDFRONT_DOMAIN',
  'REDIS_CLUSTER_ENDPOINT',
  'LAMBDA_FUNCTION_PREFIX'
];

// Legacy Supabase variables (should be removed after migration)
const legacyVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_PROJECT_ID'
];

function loadEnvironmentFile(environment) {
  const envFile = `.env.${environment}`;
  const localEnvFile = '.env.local';
  
  let config = {};
  
  // Load environment-specific file
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    config = { ...config, ...parseEnvFile(content) };
    log(`✅ Loaded ${envFile}`, 'green');
  } else {
    log(`⚠️  Environment file ${envFile} not found`, 'yellow');
  }
  
  // Load local overrides
  if (fs.existsSync(localEnvFile)) {
    const content = fs.readFileSync(localEnvFile, 'utf8');
    config = { ...config, ...parseEnvFile(content) };
    log(`✅ Loaded ${localEnvFile}`, 'green');
  }
  
  // Include process environment variables
  config = { ...config, ...process.env };
  
  return config;
}

function parseEnvFile(content) {
  const config = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      config[key.trim()] = value;
    }
  }
  
  return config;
}

function validateConfiguration(environment, config) {
  log(`\n🔍 Validating AWS configuration for ${environment}...`, 'blue');
  
  const errors = [];
  const warnings = [];
  const info = [];
  
  // Check required variables
  const required = requiredVars[environment] || requiredVars.development;
  const missing = required.filter(varName => !config[varName]);
  
  if (missing.length > 0) {
    errors.push(`Missing required variables: ${missing.join(', ')}`);
  }
  
  // Check for legacy variables
  const foundLegacy = legacyVars.filter(varName => config[varName]);
  if (foundLegacy.length > 0) {
    warnings.push(`Legacy Supabase variables found: ${foundLegacy.join(', ')}`);
    warnings.push('These should be removed after migration is complete');
  }
  
  // Validate AWS region format
  if (config.AWS_REGION && !/^[a-z]{2}-[a-z]+-\d+$/.test(config.AWS_REGION)) {
    errors.push(`Invalid AWS region format: ${config.AWS_REGION}`);
  }
  
  // Validate Cognito User Pool ID format
  if (config.VITE_COGNITO_USER_POOL_ID && !/^[a-z0-9-]+_[A-Za-z0-9]+$/.test(config.VITE_COGNITO_USER_POOL_ID)) {
    errors.push(`Invalid Cognito User Pool ID format: ${config.VITE_COGNITO_USER_POOL_ID}`);
  }
  
  // Validate API Gateway URL format
  if (config.VITE_API_GATEWAY_URL && !config.VITE_API_GATEWAY_URL.startsWith('https://')) {
    errors.push(`API Gateway URL should use HTTPS: ${config.VITE_API_GATEWAY_URL}`);
  }
  
  // Validate S3 bucket name format
  if (config.VITE_S3_BUCKET_NAME) {
    const bucketName = config.VITE_S3_BUCKET_NAME;
    if (!/^[a-z0-9.-]+$/.test(bucketName) || bucketName.length < 3 || bucketName.length > 63) {
      errors.push(`Invalid S3 bucket name format: ${bucketName}`);
    }
  }
  
  // Check database configuration
  if (!config.DATABASE_URL && (!config.DB_HOST || !config.DB_NAME)) {
    errors.push('Database configuration incomplete - need DATABASE_URL or DB_HOST + DB_NAME');
  }
  
  // Check optional but recommended variables
  const missingOptional = optionalVars.filter(varName => !config[varName]);
  if (missingOptional.length > 0) {
    info.push(`Optional variables not set: ${missingOptional.join(', ')}`);
  }
  
  // Environment-specific validations
  if (environment === 'production') {
    if (!config.AWS_PROFILE) {
      warnings.push('AWS_PROFILE not set for production - ensure proper credentials are configured');
    }
    
    if (config.VITE_ENABLE_MOCK_SERVICES === 'true') {
      errors.push('Mock services should be disabled in production');
    }
    
    if (!config.VITE_BEDROCK_ENABLED && !config.VITE_OPENAI_API_KEY) {
      warnings.push('No AI provider configured - application may not function correctly');
    }
  }
  
  return { errors, warnings, info };
}

function generateConfigReport(environment, config, validation) {
  log(`\n📊 Configuration Report for ${environment.toUpperCase()}`, 'blue');
  log('='.repeat(50), 'blue');
  
  // Show configured services
  log('\n🔧 Configured Services:', 'green');
  
  if (config.VITE_COGNITO_USER_POOL_ID) {
    log(`  ✅ AWS Cognito: ${config.VITE_COGNITO_USER_POOL_ID}`, 'green');
  }
  
  if (config.DATABASE_URL || config.DB_HOST) {
    const dbInfo = config.DATABASE_URL ? 'via DATABASE_URL' : `${config.DB_HOST}:${config.DB_PORT || 5432}`;
    log(`  ✅ RDS Database: ${dbInfo}`, 'green');
  }
  
  if (config.VITE_S3_BUCKET_NAME) {
    log(`  ✅ S3 Storage: ${config.VITE_S3_BUCKET_NAME}`, 'green');
  }
  
  if (config.VITE_API_GATEWAY_URL) {
    log(`  ✅ API Gateway: ${config.VITE_API_GATEWAY_URL}`, 'green');
  }
  
  if (config.VITE_BEDROCK_ENABLED === 'true') {
    log(`  ✅ AWS Bedrock: ${config.VITE_BEDROCK_MODEL || 'default model'}`, 'green');
  } else if (config.VITE_OPENAI_API_KEY) {
    log(`  ✅ OpenAI: configured`, 'green');
  }
  
  if (config.REDIS_CLUSTER_ENDPOINT) {
    log(`  ✅ ElastiCache Redis: ${config.REDIS_CLUSTER_ENDPOINT}`, 'green');
  }
  
  // Show validation results
  if (validation.errors.length > 0) {
    log('\n❌ Errors:', 'red');
    validation.errors.forEach(error => log(`  • ${error}`, 'red'));
  }
  
  if (validation.warnings.length > 0) {
    log('\n⚠️  Warnings:', 'yellow');
    validation.warnings.forEach(warning => log(`  • ${warning}`, 'yellow'));
  }
  
  if (validation.info.length > 0) {
    log('\nℹ️  Information:', 'blue');
    validation.info.forEach(info => log(`  • ${info}`, 'blue'));
  }
  
  // Overall status
  log('\n🎯 Overall Status:', 'blue');
  if (validation.errors.length === 0) {
    log('  ✅ Configuration is valid for deployment', 'green');
  } else {
    log('  ❌ Configuration has errors that must be fixed', 'red');
  }
}

function main() {
  const args = process.argv.slice(2);
  const environment = args[0] || 'development';
  
  if (!['development', 'staging', 'production'].includes(environment)) {
    log('❌ Invalid environment. Use: development, staging, or production', 'red');
    process.exit(1);
  }
  
  log('🔍 AWS Configuration Validator', 'blue');
  log(`Environment: ${environment}`, 'blue');
  
  try {
    // Load configuration
    const config = loadEnvironmentFile(environment);
    
    // Validate configuration
    const validation = validateConfiguration(environment, config);
    
    // Generate report
    generateConfigReport(environment, config, validation);
    
    // Exit with appropriate code
    if (validation.errors.length > 0) {
      log('\n❌ Configuration validation failed', 'red');
      process.exit(1);
    } else {
      log('\n✅ Configuration validation passed', 'green');
      process.exit(0);
    }
    
  } catch (error) {
    log(`❌ Error validating configuration: ${error.message}`, 'red');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadEnvironmentFile,
  validateConfiguration,
  generateConfigReport
};