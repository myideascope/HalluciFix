#!/usr/bin/env node

/**
 * Complete Migration Validation Script
 * 
 * This script validates the complete user migration from Supabase to AWS
 * by checking Cognito, RDS, and the mappings between them.
 * 
 * Usage:
 *   node scripts/validate-complete-migration.js [options]
 * 
 * Options:
 *   --detailed         Show detailed comparison for each user
 *   --export-report    Export validation report to JSON file
 *   --help             Show this help message
 */

const { createClient } = require('@supabase/supabase-js');
const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  supabase: {
    url: process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },
  cognito: {
    region: process.env.VITE_AWS_REGION || 'us-east-1',
    userPoolId: process.env.VITE_AWS_USER_POOL_ID,
  },
  rds: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'hallucifix',
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
  },
  validation: {
    detailed: process.argv.includes('--detailed'),
    exportReport: process.argv.includes('--export-report'),
  }
};

// Validate configuration
function validateConfig() {
  const missing = [];
  
  if (!config.supabase.url) missing.push('VITE_SUPABASE_URL');
  if (!config.supabase.serviceKey) missing.push('SUPABASE_SERVICE_KEY');
  if (!config.cognito.userPoolId) missing.push('VITE_AWS_USER_POOL_ID');
  if (!config.rds.host) missing.push('DB_HOST');
  if (!config.rds.username) missing.push('DB_USERNAME');
  if (!config.rds.password) missing.push('DB_PASSWORD');
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(var => console.error(`   - ${var}`));
    console.error('\nPlease set these variables and try again.');
    process.exit(1);
  }
}

// Initialize clients
function initializeClients() {
  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);
  const cognito = new CognitoIdentityProviderClient({ region: config.cognito.region });
  
  const rds = new Client({
    host: config.rds.host,
    port: config.rds.port,
    database: config.rds.database,
    user: config.rds.username,
    password: config.rds.password,
    ssl: config.rds.ssl ? { rejectUnauthorized: false } : false,
  });
  
  return { supabase, cognito, rds };
}

// Fetch all user data from all systems
async function fetchAllUserData(supabase, cognito, rds) {
  console.log('📥 Fetching user data from all systems...');
  
  // Fetch Supabase users
  const { data: supabaseAuthUsers } = await supabase.auth.admin.listUsers();
  const { data: supabaseProfiles } = await supabase.from('users').select('*');
  
  // Fetch Cognito users
  const cognitoUsers = [];
  let paginationToken;
  
  do {
    const command = new ListUsersCommand({
      UserPoolId: config.cognito.userPoolId,
      PaginationToken: paginationToken,
      Limit: 60,
    });
    
    const response = await cognito.send(command);
    
    if (response.Users) {
      for (const user of response.Users) {
        const attributes = {};
        user.Attributes?.forEach(attr => {
          attributes[attr.Name] = attr.Value;
        });
        
        cognitoUsers.push({
          cognitoId: user.Username,
          email: attributes.email,
          sub: attributes.sub,
          status: user.UserStatus,
          enabled: user.Enabled,
          attributes,
        });
      }
    }
    
    paginationToken = response.PaginationToken;
  } while (paginationToken);
  
  // Fetch RDS users
  const rdsResult = await rds.query(`
    SELECT u.*, 
           COUNT(ar.id) as analysis_count,
           COUNT(ss.id) as scan_count
    FROM users u
    LEFT JOIN analysis_results ar ON u.id = ar.user_id
    LEFT JOIN scheduled_scans ss ON u.id = ss.user_id
    GROUP BY u.id
    ORDER BY u.created_at
  `);
  
  return {
    supabase: {
      auth: supabaseAuthUsers.users,
      profiles: supabaseProfiles || [],
    },
    cognito: cognitoUsers,
    rds: rdsResult.rows,
  };
}

// Validate migration completeness
function validateMigrationCompleteness(userData) {
  console.log('🔍 Validating migration completeness...');
  
  const results = {
    supabaseUsers: userData.supabase.auth.length,
    cognitoUsers: userData.cognito.length,
    rdsUsers: userData.rds.length,
    
    // Migration status
    authMigrationComplete: 0,
    dataMigrationComplete: 0,
    mappingComplete: 0,
    
    // Issues
    missingInCognito: [],
    missingInRDS: [],
    unmappedUsers: [],
    dataInconsistencies: [],
  };
  
  // Create lookup maps
  const supabaseByEmail = new Map(userData.supabase.auth.map(user => [user.email?.toLowerCase(), user]));
  const cognitoByEmail = new Map(userData.cognito.map(user => [user.email?.toLowerCase(), user]));
  const rdsByEmail = new Map(userData.rds.map(user => [user.email.toLowerCase(), user]));
  const rdsByCognitoId = new Map(userData.rds.filter(u => u.cognito_id).map(user => [user.cognito_id, user]));
  
  // Check auth migration (Supabase -> Cognito)
  for (const supabaseUser of userData.supabase.auth) {
    if (!supabaseUser.email) continue;
    
    const email = supabaseUser.email.toLowerCase();
    const cognitoUser = cognitoByEmail.get(email);
    
    if (cognitoUser) {
      results.authMigrationComplete++;
    } else {
      results.missingInCognito.push({
        email: supabaseUser.email,
        id: supabaseUser.id,
        createdAt: supabaseUser.created_at,
      });
    }
  }
  
  // Check data migration (Supabase -> RDS)
  for (const supabaseUser of userData.supabase.auth) {
    if (!supabaseUser.email) continue;
    
    const email = supabaseUser.email.toLowerCase();
    const rdsUser = rdsByEmail.get(email);
    
    if (rdsUser) {
      results.dataMigrationComplete++;
      
      // Check if user is mapped to Cognito
      if (rdsUser.cognito_id) {
        results.mappingComplete++;
      } else {
        results.unmappedUsers.push({
          email: rdsUser.email,
          rdsId: rdsUser.id,
          name: rdsUser.name,
        });
      }
    } else {
      results.missingInRDS.push({
        email: supabaseUser.email,
        id: supabaseUser.id,
        createdAt: supabaseUser.created_at,
      });
    }
  }
  
  // Check for data inconsistencies
  for (const cognitoUser of userData.cognito) {
    if (!cognitoUser.email) continue;
    
    const rdsUser = rdsByCognitoId.get(cognitoUser.cognitoId);
    if (rdsUser && rdsUser.email.toLowerCase() !== cognitoUser.email.toLowerCase()) {
      results.dataInconsistencies.push({
        type: 'email_mismatch',
        cognitoId: cognitoUser.cognitoId,
        cognitoEmail: cognitoUser.email,
        rdsEmail: rdsUser.email,
      });
    }
  }
  
  return results;
}

// Calculate migration statistics
function calculateMigrationStats(validationResults, userData) {
  const stats = {
    overall: {
      completeness: 0,
      authMigrationRate: 0,
      dataMigrationRate: 0,
      mappingRate: 0,
    },
    counts: {
      supabaseUsers: validationResults.supabaseUsers,
      cognitoUsers: validationResults.cognitoUsers,
      rdsUsers: validationResults.rdsUsers,
      totalAnalyses: userData.rds.reduce((sum, user) => sum + (user.analysis_count || 0), 0),
      totalScans: userData.rds.reduce((sum, user) => sum + (user.scan_count || 0), 0),
    },
    issues: {
      missingInCognito: validationResults.missingInCognito.length,
      missingInRDS: validationResults.missingInRDS.length,
      unmappedUsers: validationResults.unmappedUsers.length,
      dataInconsistencies: validationResults.dataInconsistencies.length,
    },
  };
  
  // Calculate rates
  if (validationResults.supabaseUsers > 0) {
    stats.overall.authMigrationRate = (validationResults.authMigrationComplete / validationResults.supabaseUsers) * 100;
    stats.overall.dataMigrationRate = (validationResults.dataMigrationComplete / validationResults.supabaseUsers) * 100;
    stats.overall.mappingRate = (validationResults.mappingComplete / validationResults.supabaseUsers) * 100;
  }
  
  // Overall completeness (average of all rates)
  stats.overall.completeness = (
    stats.overall.authMigrationRate + 
    stats.overall.dataMigrationRate + 
    stats.overall.mappingRate
  ) / 3;
  
  return stats;
}

// Print validation results
function printResults(validationResults, stats) {
  console.log('\n📊 Complete Migration Validation Results:');
  console.log('='.repeat(60));
  
  console.log(`\n📈 Overall Migration Status:`);
  console.log(`   Completeness: ${stats.overall.completeness.toFixed(1)}%`);
  console.log(`   Auth Migration: ${stats.overall.authMigrationRate.toFixed(1)}% (${validationResults.authMigrationComplete}/${validationResults.supabaseUsers})`);
  console.log(`   Data Migration: ${stats.overall.dataMigrationRate.toFixed(1)}% (${validationResults.dataMigrationComplete}/${validationResults.supabaseUsers})`);
  console.log(`   ID Mapping: ${stats.overall.mappingRate.toFixed(1)}% (${validationResults.mappingComplete}/${validationResults.supabaseUsers})`);
  
  console.log(`\n📊 Data Summary:`);
  console.log(`   Supabase users: ${stats.counts.supabaseUsers}`);
  console.log(`   Cognito users: ${stats.counts.cognitoUsers}`);
  console.log(`   RDS users: ${stats.counts.rdsUsers}`);
  console.log(`   Total analyses: ${stats.counts.totalAnalyses}`);
  console.log(`   Total scans: ${stats.counts.totalScans}`);
  
  // Issues
  if (stats.issues.missingInCognito > 0) {
    console.log(`\n❌ Missing in Cognito (${stats.issues.missingInCognito}):`);
    validationResults.missingInCognito.slice(0, 5).forEach(user => {
      console.log(`   - ${user.email} (${user.id})`);
    });
    if (stats.issues.missingInCognito > 5) {
      console.log(`   ... and ${stats.issues.missingInCognito - 5} more`);
    }
  }
  
  if (stats.issues.missingInRDS > 0) {
    console.log(`\n❌ Missing in RDS (${stats.issues.missingInRDS}):`);
    validationResults.missingInRDS.slice(0, 5).forEach(user => {
      console.log(`   - ${user.email} (${user.id})`);
    });
    if (stats.issues.missingInRDS > 5) {
      console.log(`   ... and ${stats.issues.missingInRDS - 5} more`);
    }
  }
  
  if (stats.issues.unmappedUsers > 0) {
    console.log(`\n⚠️ Unmapped Users (${stats.issues.unmappedUsers}):`);
    validationResults.unmappedUsers.slice(0, 5).forEach(user => {
      console.log(`   - ${user.email} (${user.name})`);
    });
    if (stats.issues.unmappedUsers > 5) {
      console.log(`   ... and ${stats.issues.unmappedUsers - 5} more`);
    }
  }
  
  if (stats.issues.dataInconsistencies > 0) {
    console.log(`\n⚠️ Data Inconsistencies (${stats.issues.dataInconsistencies}):`);
    validationResults.dataInconsistencies.slice(0, 5).forEach(issue => {
      console.log(`   - ${issue.type}: ${issue.cognitoEmail} vs ${issue.rdsEmail}`);
    });
    if (stats.issues.dataInconsistencies > 5) {
      console.log(`   ... and ${stats.issues.dataInconsistencies - 5} more`);
    }
  }
  
  // Overall status
  console.log('\n🎯 Migration Status:');
  if (stats.overall.completeness >= 95) {
    console.log('   ✅ Migration is complete and successful!');
  } else if (stats.overall.completeness >= 80) {
    console.log('   ⚠️ Migration is mostly complete but has some issues.');
  } else {
    console.log('   ❌ Migration is incomplete or has significant issues.');
  }
}

// Export detailed report
function exportReport(validationResults, stats, userData, outputPath) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      completeness: stats.overall.completeness,
      authMigrationRate: stats.overall.authMigrationRate,
      dataMigrationRate: stats.overall.dataMigrationRate,
      mappingRate: stats.overall.mappingRate,
    },
    counts: stats.counts,
    issues: stats.issues,
    details: {
      missingInCognito: validationResults.missingInCognito,
      missingInRDS: validationResults.missingInRDS,
      unmappedUsers: validationResults.unmappedUsers,
      dataInconsistencies: validationResults.dataInconsistencies,
    },
    recommendations: generateRecommendations(validationResults, stats),
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed validation report exported to: ${outputPath}`);
}

// Generate recommendations based on validation results
function generateRecommendations(validationResults, stats) {
  const recommendations = [];
  
  if (stats.issues.missingInCognito > 0) {
    recommendations.push({
      priority: 'high',
      issue: 'Users missing in Cognito',
      action: 'Run the Cognito migration script again to migrate missing users',
      command: 'npm run migrate:users:to-cognito',
    });
  }
  
  if (stats.issues.missingInRDS > 0) {
    recommendations.push({
      priority: 'high',
      issue: 'Users missing in RDS',
      action: 'Run the RDS synchronization script to sync missing users',
      command: 'npm run sync:user-data:to-rds',
    });
  }
  
  if (stats.issues.unmappedUsers > 0) {
    recommendations.push({
      priority: 'medium',
      issue: 'Users not mapped between Cognito and RDS',
      action: 'Run the mapping script to link Cognito users to RDS records',
      command: 'npm run map:cognito-users:to-rds',
    });
  }
  
  if (stats.issues.dataInconsistencies > 0) {
    recommendations.push({
      priority: 'medium',
      issue: 'Data inconsistencies between systems',
      action: 'Review and manually fix data inconsistencies',
      command: 'Check the detailed report for specific issues',
    });
  }
  
  if (stats.overall.completeness >= 95) {
    recommendations.push({
      priority: 'low',
      issue: 'Migration complete',
      action: 'Update application configuration to use AWS services',
      command: 'Update environment variables and deploy application',
    });
  }
  
  return recommendations;
}

// Main validation function
async function validateCompleteMigration() {
  console.log('🔍 Starting complete migration validation\n');
  
  try {
    // Validate configuration
    validateConfig();
    
    // Initialize clients
    const { supabase, cognito, rds } = initializeClients();
    
    // Connect to RDS
    await rds.connect();
    console.log('✅ Connected to all systems');
    
    // Fetch all user data
    const userData = await fetchAllUserData(supabase, cognito, rds);
    
    // Validate migration
    const validationResults = validateMigrationCompleteness(userData);
    
    // Calculate statistics
    const stats = calculateMigrationStats(validationResults, userData);
    
    // Print results
    printResults(validationResults, stats);
    
    // Export report if requested
    if (config.validation.exportReport) {
      const reportPath = path.join(__dirname, '..', 'migration-reports', `complete-validation-${Date.now()}.json`);
      const reportDir = path.dirname(reportPath);
      
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }
      
      exportReport(validationResults, stats, userData, reportPath);
    }
    
    // Close RDS connection
    await rds.end();
    
    // Exit with appropriate code
    if (stats.overall.completeness >= 95) {
      process.exit(0); // Success
    } else if (stats.overall.completeness >= 80) {
      process.exit(1); // Mostly complete but with issues
    } else {
      process.exit(2); // Incomplete migration
    }
    
  } catch (error) {
    console.error('\n❌ Validation failed:', error.message);
    process.exit(1);
  }
}

// Show help
function showHelp() {
  console.log(`
Complete Migration Validation Script

Usage:
  node scripts/validate-complete-migration.js [options]

Options:
  --detailed         Show detailed comparison for each user
  --export-report    Export validation report to JSON file
  --help             Show this help message

Environment Variables Required:
  VITE_SUPABASE_URL           Supabase project URL
  SUPABASE_SERVICE_KEY        Supabase service role key
  VITE_AWS_USER_POOL_ID       AWS Cognito User Pool ID
  VITE_AWS_REGION             AWS region (default: us-east-1)
  DB_HOST                     RDS database host
  DB_USERNAME                 RDS database username
  DB_PASSWORD                 RDS database password

Exit Codes:
  0    Migration is complete and successful (>= 95%)
  1    Migration is mostly complete but has issues (>= 80%)
  2    Migration is incomplete (< 80%)

Examples:
  # Basic validation
  node scripts/validate-complete-migration.js

  # Detailed validation with report export
  node scripts/validate-complete-migration.js --detailed --export-report
`);
}

// Main execution
if (process.argv.includes('--help')) {
  showHelp();
} else {
  validateCompleteMigration().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}