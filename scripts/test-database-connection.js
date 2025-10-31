#!/usr/bin/env node

/**
 * Database Connection Test Script
 * Tests the database connection and configuration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
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

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${colors.bright}${colors.blue}=== ${title} ===${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.cyan);
}

async function testDatabaseConnection() {
  logSection('Database Connection Test');

  try {
    // Check if required dependencies are installed
    logInfo('Checking dependencies...');
    
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const hasPg = packageJson.dependencies?.pg || packageJson.devDependencies?.pg;
    
    if (!hasPg) {
      logError('PostgreSQL client (pg) not installed. Run: npm install pg @types/pg');
      return false;
    }
    
    logSuccess('Dependencies check passed');

    // Check environment configuration
    logInfo('Checking environment configuration...');
    
    const envFiles = ['.env.local', '.env.development', '.env'];
    let envFound = false;
    
    for (const envFile of envFiles) {
      if (fs.existsSync(envFile)) {
        logInfo(`Found environment file: ${envFile}`);
        envFound = true;
        break;
      }
    }
    
    if (!envFound) {
      logWarning('No environment file found. Create .env.local with database configuration');
    }

    // Check for database configuration
    const databaseUrl = process.env.DATABASE_URL;
    const dbHost = process.env.DB_HOST;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    
    if (databaseUrl) {
      logSuccess(`DATABASE_URL configured: ${databaseUrl.replace(/:[^:@]*@/, ':***@')}`);
    } else if (dbHost) {
      logSuccess(`DB_HOST configured: ${dbHost}`);
    } else if (supabaseUrl) {
      logInfo(`Using Supabase configuration: ${supabaseUrl}`);
    } else {
      logError('No database configuration found');
      logInfo('Set DATABASE_URL, DB_HOST, or VITE_SUPABASE_URL');
      return false;
    }

    // Test database connection using Node.js
    logInfo('Testing database connection...');
    
    try {
      // Create a simple test script
      const testScript = `
        const { config } = require('./dist/lib/config.js');
        const { initializeDatabaseConnection, checkDatabaseHealth } = require('./dist/lib/initializeDatabase.js');
        
        async function test() {
          try {
            const result = await initializeDatabaseConnection();
            console.log('Connection result:', JSON.stringify(result, null, 2));
            
            const health = await checkDatabaseHealth();
            console.log('Health check:', JSON.stringify(health, null, 2));
            
            process.exit(health.healthy ? 0 : 1);
          } catch (error) {
            console.error('Test failed:', error.message);
            process.exit(1);
          }
        }
        
        test();
      `;
      
      // Write test script
      fs.writeFileSync('temp-db-test.js', testScript);
      
      // Build the project first
      logInfo('Building project...');
      execSync('npm run build', { stdio: 'pipe' });
      
      // Run the test
      const output = execSync('node temp-db-test.js', { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      logSuccess('Database connection test passed');
      logInfo('Test output:');
      console.log(output);
      
      // Clean up
      fs.unlinkSync('temp-db-test.js');
      
      return true;
      
    } catch (error) {
      logError(`Database connection test failed: ${error.message}`);
      
      // Clean up
      if (fs.existsSync('temp-db-test.js')) {
        fs.unlinkSync('temp-db-test.js');
      }
      
      return false;
    }

  } catch (error) {
    logError(`Test script failed: ${error.message}`);
    return false;
  }
}

async function main() {
  log(`${colors.bright}${colors.magenta}Database Connection Test${colors.reset}`);
  log('Testing database configuration and connectivity...\n');

  const success = await testDatabaseConnection();
  
  if (success) {
    logSection('Test Results');
    logSuccess('All database tests passed!');
    logInfo('Your database configuration is working correctly.');
  } else {
    logSection('Test Results');
    logError('Database tests failed!');
    logInfo('Please check your database configuration and try again.');
    logInfo('See the RDS setup guide in docs/ for help.');
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main().catch(error => {
    logError(`Unexpected error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { testDatabaseConnection };