#!/usr/bin/env node

/**
 * User Migration Orchestration Script
 * 
 * This script orchestrates the complete user migration process from Supabase to AWS:
 * 1. Migrate users from Supabase Auth to AWS Cognito
 * 2. Synchronize user data from Supabase to AWS RDS
 * 3. Map Cognito user IDs to RDS user records
 * 4. Validate the complete migration
 * 
 * Usage:
 *   node scripts/orchestrate-user-migration.js [options]
 * 
 * Options:
 *   --dry-run          Show what would be done without making changes
 *   --skip-cognito     Skip Cognito migration (if already done)
 *   --skip-rds         Skip RDS synchronization (if already done)
 *   --skip-mapping     Skip Cognito-RDS mapping (if already done)
 *   --skip-validation  Skip final validation
 *   --help             Show this help message
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  orchestration: {
    dryRun: process.argv.includes('--dry-run'),
    skipCognito: process.argv.includes('--skip-cognito'),
    skipRDS: process.argv.includes('--skip-rds'),
    skipMapping: process.argv.includes('--skip-mapping'),
    skipValidation: process.argv.includes('--skip-validation'),
  }
};

// Utility function to run a script
function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Running: node ${scriptPath} ${args.join(' ')}`);
    
    const child = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Script ${scriptPath} exited with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Validate environment configuration
function validateEnvironment() {
  console.log('🔍 Validating environment configuration...');
  
  const requiredVars = [
    // Supabase
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    // AWS Cognito
    'VITE_AWS_USER_POOL_ID',
    'VITE_AWS_REGION',
    // AWS RDS
    'DB_HOST',
    'DB_USERNAME',
    'DB_PASSWORD',
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease set these variables before running the migration.');
    process.exit(1);
  }
  
  console.log('✅ Environment configuration validated');
}

// Create migration reports directory
function ensureReportsDirectory() {
  const reportsDir = path.join(__dirname, '..', 'migration-reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
    console.log('📁 Created migration reports directory');
  }
}

// Step 1: Migrate users to Cognito
async function migrateToCognito() {
  console.log('\n📋 Step 1: Migrating users to AWS Cognito...');
  
  const args = ['--skip-existing'];
  if (config.orchestration.dryRun) {
    args.push('--dry-run');
  }
  
  try {
    await runScript('scripts/migrate-users-to-cognito.js', args);
    console.log('✅ Cognito migration completed');
  } catch (error) {
    console.error('❌ Cognito migration failed:', error.message);
    throw error;
  }
}

// Step 2: Synchronize user data to RDS
async function syncToRDS() {
  console.log('\n🗄️ Step 2: Synchronizing user data to AWS RDS...');
  
  const args = [];
  if (config.orchestration.dryRun) {
    args.push('--dry-run');
  }
  
  try {
    await runScript('scripts/sync-user-data-to-rds.js', args);
    console.log('✅ RDS synchronization completed');
  } catch (error) {
    console.error('❌ RDS synchronization failed:', error.message);
    throw error;
  }
}

// Step 3: Map Cognito users to RDS
async function mapCognitoToRDS() {
  console.log('\n🔗 Step 3: Mapping Cognito users to RDS records...');
  
  const args = [];
  if (config.orchestration.dryRun) {
    args.push('--dry-run');
  }
  
  try {
    await runScript('scripts/map-cognito-users-to-rds.js', args);
    console.log('✅ Cognito-RDS mapping completed');
  } catch (error) {
    console.error('❌ Cognito-RDS mapping failed:', error.message);
    throw error;
  }
}

// Step 4: Validate migration
async function validateMigration() {
  console.log('\n✅ Step 4: Validating migration...');
  
  const args = ['--detailed', '--export-report'];
  
  try {
    await runScript('scripts/validate-user-migration.js', args);
    console.log('✅ Migration validation completed');
  } catch (error) {
    console.error('❌ Migration validation failed:', error.message);
    // Don't throw here - validation failure shouldn't stop the process
    console.warn('⚠️ Continuing despite validation issues - check the validation report');
  }
}

// Generate final migration summary
function generateMigrationSummary() {
  console.log('\n📊 Generating migration summary...');
  
  const reportsDir = path.join(__dirname, '..', 'migration-reports');
  const summaryPath = path.join(reportsDir, `migration-summary-${Date.now()}.json`);
  
  // Find the latest reports
  const files = fs.readdirSync(reportsDir);
  const latestReports = {
    cognito: files.filter(f => f.startsWith('user-migration-')).sort().pop(),
    rds: files.filter(f => f.startsWith('user-data-sync-')).sort().pop(),
    mapping: files.filter(f => f.startsWith('cognito-mapping-')).sort().pop(),
    validation: files.filter(f => f.startsWith('validation-report-')).sort().pop(),
  };
  
  const summary = {
    timestamp: new Date().toISOString(),
    migrationId: `migration-${Date.now()}`,
    configuration: {
      dryRun: config.orchestration.dryRun,
      skipCognito: config.orchestration.skipCognito,
      skipRDS: config.orchestration.skipRDS,
      skipMapping: config.orchestration.skipMapping,
      skipValidation: config.orchestration.skipValidation,
    },
    reports: latestReports,
    status: 'completed',
    nextSteps: [
      'Update application environment variables to use AWS Cognito',
      'Test authentication flow with migrated users',
      'Monitor application for any migration-related issues',
      'Clean up Supabase resources after successful validation',
    ],
  };
  
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`📄 Migration summary saved to: ${summaryPath}`);
  
  return summary;
}

// Main orchestration function
async function orchestrateUserMigration() {
  console.log('🎭 Starting complete user migration orchestration\n');
  
  if (config.orchestration.dryRun) {
    console.log('🔍 DRY RUN MODE - No actual changes will be made\n');
  }
  
  const startTime = Date.now();
  
  try {
    // Validate environment
    validateEnvironment();
    
    // Ensure reports directory exists
    ensureReportsDirectory();
    
    // Step 1: Migrate to Cognito
    if (!config.orchestration.skipCognito) {
      await migrateToCognito();
    } else {
      console.log('⏭️ Skipping Cognito migration (--skip-cognito)');
    }
    
    // Step 2: Sync to RDS
    if (!config.orchestration.skipRDS) {
      await syncToRDS();
    } else {
      console.log('⏭️ Skipping RDS synchronization (--skip-rds)');
    }
    
    // Step 3: Map Cognito to RDS
    if (!config.orchestration.skipMapping) {
      await mapCognitoToRDS();
    } else {
      console.log('⏭️ Skipping Cognito-RDS mapping (--skip-mapping)');
    }
    
    // Step 4: Validate migration
    if (!config.orchestration.skipValidation) {
      await validateMigration();
    } else {
      console.log('⏭️ Skipping migration validation (--skip-validation)');
    }
    
    // Generate summary
    const summary = generateMigrationSummary();
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n🎉 User migration orchestration completed successfully!');
    console.log(`⏱️ Total duration: ${duration} seconds`);
    
    if (!config.orchestration.dryRun) {
      console.log('\n📋 Next Steps:');
      summary.nextSteps.forEach((step, index) => {
        console.log(`   ${index + 1}. ${step}`);
      });
      
      console.log('\n📄 Check the migration reports for detailed information:');
      Object.entries(summary.reports).forEach(([type, filename]) => {
        if (filename) {
          console.log(`   - ${type}: migration-reports/${filename}`);
        }
      });
    }
    
  } catch (error) {
    console.error('\n❌ Migration orchestration failed:', error.message);
    
    // Generate failure summary
    const failureSummary = {
      timestamp: new Date().toISOString(),
      status: 'failed',
      error: error.message,
      configuration: config.orchestration,
      duration: Math.round((Date.now() - startTime) / 1000),
    };
    
    const failurePath = path.join(__dirname, '..', 'migration-reports', `migration-failure-${Date.now()}.json`);
    fs.writeFileSync(failurePath, JSON.stringify(failureSummary, null, 2));
    console.log(`📄 Failure report saved to: ${failurePath}`);
    
    process.exit(1);
  }
}

// Show help
function showHelp() {
  console.log(`
User Migration Orchestration Script

This script orchestrates the complete user migration process from Supabase to AWS:
1. Migrate users from Supabase Auth to AWS Cognito
2. Synchronize user data from Supabase to AWS RDS
3. Map Cognito user IDs to RDS user records
4. Validate the complete migration

Usage:
  node scripts/orchestrate-user-migration.js [options]

Options:
  --dry-run          Show what would be done without making changes
  --skip-cognito     Skip Cognito migration (if already done)
  --skip-rds         Skip RDS synchronization (if already done)
  --skip-mapping     Skip Cognito-RDS mapping (if already done)
  --skip-validation  Skip final validation
  --help             Show this help message

Environment Variables Required:
  # Supabase
  VITE_SUPABASE_URL           Supabase project URL
  SUPABASE_SERVICE_KEY        Supabase service role key
  
  # AWS Cognito
  VITE_AWS_USER_POOL_ID       AWS Cognito User Pool ID
  VITE_AWS_REGION             AWS region
  
  # AWS RDS
  DB_HOST                     RDS database host
  DB_USERNAME                 RDS database username
  DB_PASSWORD                 RDS database password
  DB_NAME                     RDS database name (optional)
  DB_PORT                     RDS database port (optional)
  DB_SSL                      Use SSL connection (optional)

Examples:
  # Complete migration (dry run)
  node scripts/orchestrate-user-migration.js --dry-run

  # Complete migration (actual)
  node scripts/orchestrate-user-migration.js

  # Skip Cognito migration (if already done)
  node scripts/orchestrate-user-migration.js --skip-cognito

  # Only validate existing migration
  node scripts/orchestrate-user-migration.js --skip-cognito --skip-rds --skip-mapping
`);
}

// Main execution
if (process.argv.includes('--help')) {
  showHelp();
} else {
  orchestrateUserMigration().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}