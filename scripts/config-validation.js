#!/usr/bin/env node

/**
 * Configuration Validation CLI Tool
 * Provides command-line interface for validating and testing configuration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
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

// Helper functions
function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(message, color));
}

function logSection(title) {
  console.log('\n' + colorize('='.repeat(50), 'cyan'));
  console.log(colorize(title, 'bright'));
  console.log(colorize('='.repeat(50), 'cyan'));
}

function logSubsection(title) {
  console.log('\n' + colorize(title, 'blue'));
  console.log(colorize('-'.repeat(title.length), 'blue'));
}

// Configuration validation functions
async function validateEnvironmentFiles() {
  logSection('Environment Files Validation');

  const envFiles = [
    '.env.example',
    '.env.development',
    '.env.staging',
    '.env.production',
    '.env.local'
  ];

  const results = {};

  for (const file of envFiles) {
    const filePath = path.join(process.cwd(), file);
    const exists = fs.existsSync(filePath);
    
    results[file] = {
      exists,
      size: exists ? fs.statSync(filePath).size : 0,
      variables: exists ? parseEnvFile(filePath) : []
    };

    const status = exists ? colorize('✅ EXISTS', 'green') : colorize('❌ MISSING', 'red');
    const size = exists ? `(${results[file].size} bytes, ${results[file].variables.length} variables)` : '';
    log(`${file}: ${status} ${size}`);
  }

  // Check for .env.local
  if (!results['.env.local'].exists) {
    log('\n💡 Recommendation: Create .env.local file for local configuration overrides', 'yellow');
    log('   Run: cp .env.example .env.local', 'cyan');
  }

  return results;
}

function parseEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const variables = [];
    
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const [key] = line.split('=');
        variables.push(key.trim());
      }
    });

    return variables;
  } catch (error) {
    return [];
  }
}

async function validateConfiguration() {
  logSection('Configuration Validation');

  try {
    // Import and validate configuration
    const configPath = path.join(process.cwd(), 'src/lib/config/index.ts');
    
    if (!fs.existsSync(configPath)) {
      log('❌ Configuration module not found', 'red');
      return false;
    }

    log('✅ Configuration module found', 'green');

    // Try to compile and validate TypeScript
    try {
      execSync('npx tsc --noEmit --skipLibCheck', { stdio: 'pipe' });
      log('✅ TypeScript compilation successful', 'green');
    } catch (error) {
      log('❌ TypeScript compilation failed', 'red');
      log('   Run: npm run type-check for details', 'cyan');
      return false;
    }

    return true;
  } catch (error) {
    log(`❌ Configuration validation failed: ${error.message}`, 'red');
    return false;
  }
}

async function testConnectivity() {
  logSection('API Connectivity Tests');

  const tests = [
    {
      name: 'Supabase',
      url: process.env.VITE_SUPABASE_URL,
      test: async (url) => {
        if (!url) return { status: 'not_configured', message: 'URL not configured' };
        
        try {
          const response = await fetch(`${url}/rest/v1/`, {
            method: 'HEAD',
            headers: {
              'apikey': process.env.VITE_SUPABASE_ANON_KEY || '',
            }
          });
          return { 
            status: response.ok ? 'connected' : 'failed', 
            message: response.ok ? 'Connected' : `HTTP ${response.status}`,
            responseTime: Date.now()
          };
        } catch (error) {
          return { status: 'failed', message: error.message };
        }
      }
    },
    {
      name: 'OpenAI',
      url: 'https://api.openai.com/v1/models',
      test: async () => {
        const apiKey = process.env.VITE_OPENAI_API_KEY;
        if (!apiKey) return { status: 'not_configured', message: 'API key not configured' };
        
        try {
          const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
            }
          });
          return { 
            status: response.ok ? 'connected' : 'failed', 
            message: response.ok ? 'Connected' : `HTTP ${response.status}` 
          };
        } catch (error) {
          return { status: 'failed', message: error.message };
        }
      }
    },
    {
      name: 'Google OAuth',
      url: 'https://accounts.google.com/.well-known/openid_configuration',
      test: async () => {
        const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
        if (!clientId) return { status: 'not_configured', message: 'Client ID not configured' };
        
        try {
          const response = await fetch('https://accounts.google.com/.well-known/openid_configuration');
          return { 
            status: response.ok ? 'connected' : 'failed', 
            message: response.ok ? 'OAuth endpoint accessible' : `HTTP ${response.status}` 
          };
        } catch (error) {
          return { status: 'failed', message: error.message };
        }
      }
    }
  ];

  for (const test of tests) {
    const startTime = Date.now();
    const result = await test.test(test.url);
    const duration = Date.now() - startTime;

    let statusColor = 'yellow';
    let statusIcon = '⚪';
    
    if (result.status === 'connected') {
      statusColor = 'green';
      statusIcon = '✅';
    } else if (result.status === 'failed') {
      statusColor = 'red';
      statusIcon = '❌';
    }

    log(`${statusIcon} ${test.name}: ${colorize(result.status.toUpperCase(), statusColor)} (${duration}ms)`);
    if (result.message) {
      log(`   ${result.message}`, 'cyan');
    }
  }
}

async function checkRequiredVariables() {
  logSection('Required Variables Check');

  const environment = process.env.NODE_ENV || 'development';
  log(`Environment: ${colorize(environment, 'bright')}`);

  const requiredByEnv = {
    development: [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY'
    ],
    staging: [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_KEY',
      'VITE_SENTRY_DSN'
    ],
    production: [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_KEY',
      'JWT_SECRET',
      'OAUTH_TOKEN_ENCRYPTION_KEY',
      'OAUTH_STATE_SECRET',
      'OAUTH_SESSION_SECRET',
      'VITE_SENTRY_DSN'
    ]
  };

  const required = requiredByEnv[environment] || requiredByEnv.development;
  const missing = [];
  const present = [];

  for (const variable of required) {
    if (process.env[variable]) {
      present.push(variable);
      log(`✅ ${variable}`, 'green');
    } else {
      missing.push(variable);
      log(`❌ ${variable}`, 'red');
    }
  }

  logSubsection('Summary');
  log(`Present: ${present.length}/${required.length}`, present.length === required.length ? 'green' : 'yellow');
  
  if (missing.length > 0) {
    log(`Missing: ${missing.length}`, 'red');
    log('\n💡 Add missing variables to your .env.local file:', 'yellow');
    missing.forEach(variable => {
      log(`   ${variable}=your_value_here`, 'cyan');
    });
  }

  return missing.length === 0;
}

async function generateConfigReport() {
  logSection('Configuration Report Generation');

  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    environmentFiles: {},
    configuration: {},
    connectivity: {},
    validation: {}
  };

  // Environment files
  const envFiles = await validateEnvironmentFiles();
  report.environmentFiles = envFiles;

  // Configuration validation
  const configValid = await validateConfiguration();
  report.validation.configurationValid = configValid;

  // Required variables
  const requiredValid = await checkRequiredVariables();
  report.validation.requiredVariablesValid = requiredValid;

  // Write report
  const reportPath = path.join(process.cwd(), 'config-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  log(`\n📄 Report saved to: ${reportPath}`, 'green');
  
  return report;
}

async function fixCommonIssues() {
  logSection('Automatic Issue Resolution');

  const fixes = [];

  // Check if .env.local exists
  if (!fs.existsSync('.env.local')) {
    log('🔧 Creating .env.local from .env.example...', 'yellow');
    try {
      fs.copyFileSync('.env.example', '.env.local');
      fixes.push('Created .env.local file');
      log('✅ .env.local created successfully', 'green');
    } catch (error) {
      log(`❌ Failed to create .env.local: ${error.message}`, 'red');
    }
  }

  // Check TypeScript configuration
  if (!fs.existsSync('tsconfig.json')) {
    log('⚠️ tsconfig.json not found', 'yellow');
  }

  // Check package.json scripts
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const recommendedScripts = {
      'config:validate': 'node scripts/config-validation.js validate',
      'config:health': 'node scripts/config-validation.js health',
      'config:report': 'node scripts/config-validation.js report'
    };

    const missingScripts = Object.entries(recommendedScripts)
      .filter(([script]) => !packageJson.scripts?.[script]);

    if (missingScripts.length > 0) {
      log('\n💡 Recommended package.json scripts:', 'yellow');
      missingScripts.forEach(([script, command]) => {
        log(`   "${script}": "${command}"`, 'cyan');
      });
    }
  }

  if (fixes.length > 0) {
    log('\n✅ Applied fixes:', 'green');
    fixes.forEach(fix => log(`   • ${fix}`, 'green'));
  } else {
    log('✅ No automatic fixes needed', 'green');
  }

  return fixes;
}

// Main CLI function
async function main() {
  const command = process.argv[2] || 'all';

  log(colorize('🔧 HalluciFix Configuration Validator', 'bright'));
  log(colorize('=====================================', 'cyan'));

  try {
    switch (command) {
      case 'env':
        await validateEnvironmentFiles();
        break;
      
      case 'config':
        await validateConfiguration();
        break;
      
      case 'health':
      case 'connectivity':
        await testConnectivity();
        break;
      
      case 'required':
        await checkRequiredVariables();
        break;
      
      case 'report':
        await generateConfigReport();
        break;
      
      case 'fix':
        await fixCommonIssues();
        break;
      
      case 'validate':
        const envValid = await validateEnvironmentFiles();
        const configValid = await validateConfiguration();
        const requiredValid = await checkRequiredVariables();
        
        const allValid = configValid && requiredValid;
        
        logSection('Validation Summary');
        log(`Overall Status: ${allValid ? colorize('✅ VALID', 'green') : colorize('❌ INVALID', 'red')}`);
        
        process.exit(allValid ? 0 : 1);
        break;
      
      case 'all':
      default:
        await validateEnvironmentFiles();
        await validateConfiguration();
        await checkRequiredVariables();
        await testConnectivity();
        await generateConfigReport();
        break;
    }

    log('\n✅ Configuration validation complete', 'green');
  } catch (error) {
    log(`\n❌ Validation failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Show help
function showHelp() {
  console.log(`
${colorize('HalluciFix Configuration Validator', 'bright')}

Usage: node scripts/config-validation.js [command]

Commands:
  ${colorize('all', 'cyan')}          Run all validation checks (default)
  ${colorize('env', 'cyan')}          Validate environment files
  ${colorize('config', 'cyan')}       Validate configuration module
  ${colorize('health', 'cyan')}       Test API connectivity
  ${colorize('required', 'cyan')}     Check required environment variables
  ${colorize('validate', 'cyan')}     Run validation and exit with status code
  ${colorize('report', 'cyan')}       Generate detailed configuration report
  ${colorize('fix', 'cyan')}          Attempt to fix common issues automatically
  ${colorize('help', 'cyan')}         Show this help message

Examples:
  node scripts/config-validation.js
  node scripts/config-validation.js health
  node scripts/config-validation.js validate
  npm run config:validate
`);
}

// Handle help command
if (process.argv[2] === 'help' || process.argv[2] === '--help' || process.argv[2] === '-h') {
  showHelp();
  process.exit(0);
}

// Run main function
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  validateEnvironmentFiles,
  validateConfiguration,
  testConnectivity,
  checkRequiredVariables,
  generateConfigReport,
  fixCommonIssues
};