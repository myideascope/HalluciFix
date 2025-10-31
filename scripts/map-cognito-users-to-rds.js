#!/usr/bin/env node

/**
 * Cognito User Mapping Script
 * 
 * This script maps Cognito user IDs to RDS user records after both
 * Cognito migration and RDS synchronization are complete.
 * 
 * Usage:
 *   node scripts/map-cognito-users-to-rds.js [options]
 * 
 * Options:
 *   --dry-run          Show what would be mapped without making changes
 *   --force-update     Update existing mappings
 *   --help             Show this help message
 */

const { CognitoIdentityProviderClient, ListUsersCommand, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
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
  mapping: {
    dryRun: process.argv.includes('--dry-run'),
    forceUpdate: process.argv.includes('--force-update'),
  }
};

// Validate configuration
function validateConfig() {
  const missing = [];
  
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
  const cognito = new CognitoIdentityProviderClient({ region: config.cognito.region });
  
  const rds = new Client({
    host: config.rds.host,
    port: config.rds.port,
    database: config.rds.database,
    user: config.rds.username,
    password: config.rds.password,
    ssl: config.rds.ssl ? { rejectUnauthorized: false } : false,
  });
  
  return { cognito, rds };
}

// Fetch Cognito users
async function fetchCognitoUsers(cognito) {
  console.log('🔍 Fetching users from Cognito...');
  
  try {
    const users = [];
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
          
          users.push({
            cognitoId: user.Username,
            email: attributes.email,
            sub: attributes.sub,
            emailVerified: attributes.email_verified === 'true',
            status: user.UserStatus,
            enabled: user.Enabled,
            createdAt: user.UserCreateDate,
            // Migration metadata
            migratedFrom: attributes['custom:migrated_from'],
            migrationDate: attributes['custom:migration_date'],
            originalCreatedAt: attributes['custom:original_created_at'],
          });
        }
      }
      
      paginationToken = response.PaginationToken;
    } while (paginationToken);
    
    console.log(`✅ Found ${users.length} users in Cognito`);
    return users;
    
  } catch (error) {
    console.error('❌ Failed to fetch Cognito users:', error.message);
    throw error;
  }
}

// Fetch RDS users
async function fetchRDSUsers(rds) {
  console.log('🗄️ Fetching users from RDS...');
  
  try {
    const result = await rds.query(`
      SELECT id, email, name, supabase_id, cognito_id, created_at, migrated_at
      FROM users
      ORDER BY created_at
    `);
    
    console.log(`✅ Found ${result.rows.length} users in RDS`);
    return result.rows;
    
  } catch (error) {
    console.error('❌ Failed to fetch RDS users:', error.message);
    throw error;
  }
}

// Map Cognito users to RDS users
function createUserMapping(cognitoUsers, rdsUsers) {
  console.log('🔗 Creating user mappings...');
  
  const mappings = [];
  const unmappedCognito = [];
  const unmappedRDS = [];
  
  // Create lookup maps
  const cognitoByEmail = new Map(cognitoUsers.map(user => [user.email?.toLowerCase(), user]));
  const rdsByEmail = new Map(rdsUsers.map(user => [user.email.toLowerCase(), user]));
  
  // Map by email address
  for (const rdsUser of rdsUsers) {
    const email = rdsUser.email.toLowerCase();
    const cognitoUser = cognitoByEmail.get(email);
    
    if (cognitoUser) {
      mappings.push({
        rdsId: rdsUser.id,
        rdsEmail: rdsUser.email,
        cognitoId: cognitoUser.cognitoId,
        cognitoSub: cognitoUser.sub,
        cognitoEmail: cognitoUser.email,
        confidence: 'high', // Email match
        needsUpdate: !rdsUser.cognito_id || config.mapping.forceUpdate,
        currentCognitoId: rdsUser.cognito_id,
      });
    } else {
      unmappedRDS.push(rdsUser);
    }
  }
  
  // Find unmapped Cognito users
  for (const cognitoUser of cognitoUsers) {
    if (cognitoUser.email) {
      const email = cognitoUser.email.toLowerCase();
      if (!rdsByEmail.has(email)) {
        unmappedCognito.push(cognitoUser);
      }
    }
  }
  
  console.log(`✅ Created ${mappings.length} user mappings`);
  console.log(`⚠️ ${unmappedRDS.length} RDS users without Cognito match`);
  console.log(`⚠️ ${unmappedCognito.length} Cognito users without RDS match`);
  
  return {
    mappings,
    unmappedCognito,
    unmappedRDS,
  };
}

// Update RDS with Cognito mappings
async function updateRDSMappings(rds, mappings) {
  console.log(`🔄 Updating ${mappings.length} user mappings in RDS...`);
  
  const results = {
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  
  for (const mapping of mappings) {
    try {
      if (config.mapping.dryRun) {
        console.log(`🔍 [DRY RUN] Would map ${mapping.rdsEmail} -> ${mapping.cognitoId}`);
        results.updated++;
        continue;
      }
      
      if (!mapping.needsUpdate) {
        console.log(`⏭️ Skipping ${mapping.rdsEmail}: already mapped`);
        results.skipped++;
        continue;
      }
      
      await rds.query(`
        UPDATE users 
        SET cognito_id = $1, updated_at = now()
        WHERE id = $2
      `, [mapping.cognitoId, mapping.rdsId]);
      
      console.log(`✅ Mapped ${mapping.rdsEmail} -> ${mapping.cognitoId}`);
      results.updated++;
      
    } catch (error) {
      console.error(`❌ Failed to map ${mapping.rdsEmail}:`, error.message);
      results.failed++;
      results.errors.push({
        email: mapping.rdsEmail,
        error: error.message,
      });
    }
  }
  
  return results;
}

// Generate mapping report
function generateReport(mappingData, updateResults, outputPath) {
  const report = {
    timestamp: new Date().toISOString(),
    configuration: {
      dryRun: config.mapping.dryRun,
      forceUpdate: config.mapping.forceUpdate,
    },
    summary: {
      totalMappings: mappingData.mappings.length,
      updated: updateResults.updated,
      skipped: updateResults.skipped,
      failed: updateResults.failed,
      unmappedRDS: mappingData.unmappedRDS.length,
      unmappedCognito: mappingData.unmappedCognito.length,
    },
    details: {
      mappings: mappingData.mappings,
      unmappedRDS: mappingData.unmappedRDS,
      unmappedCognito: mappingData.unmappedCognito,
      errors: updateResults.errors,
    },
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`📄 Mapping report saved to: ${outputPath}`);
}

// Main mapping function
async function mapCognitoUsers() {
  console.log('🔗 Starting Cognito user mapping to RDS\n');
  
  if (config.mapping.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  try {
    // Validate configuration
    validateConfig();
    
    // Initialize clients
    const { cognito, rds } = initializeClients();
    
    // Connect to RDS
    await rds.connect();
    console.log('✅ Connected to RDS');
    
    // Fetch users from both systems
    const [cognitoUsers, rdsUsers] = await Promise.all([
      fetchCognitoUsers(cognito),
      fetchRDSUsers(rds),
    ]);
    
    // Create user mappings
    const mappingData = createUserMapping(cognitoUsers, rdsUsers);
    
    // Update RDS with mappings
    const updateResults = await updateRDSMappings(rds, mappingData.mappings);
    
    // Generate report
    const reportPath = path.join(__dirname, '..', 'migration-reports', `cognito-mapping-${Date.now()}.json`);
    const reportDir = path.dirname(reportPath);
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    generateReport(mappingData, updateResults, reportPath);
    
    // Summary
    console.log('\n🎉 Cognito user mapping completed!');
    console.log(`📊 Summary:`);
    console.log(`   Total mappings: ${mappingData.mappings.length}`);
    console.log(`   Updated: ${updateResults.updated}`);
    console.log(`   Skipped: ${updateResults.skipped}`);
    console.log(`   Failed: ${updateResults.failed}`);
    console.log(`   Unmapped RDS users: ${mappingData.unmappedRDS.length}`);
    console.log(`   Unmapped Cognito users: ${mappingData.unmappedCognito.length}`);
    
    if (mappingData.unmappedRDS.length > 0) {
      console.log('\n⚠️ Unmapped RDS users (no Cognito match):');
      mappingData.unmappedRDS.slice(0, 5).forEach(user => {
        console.log(`   - ${user.email} (${user.name})`);
      });
      if (mappingData.unmappedRDS.length > 5) {
        console.log(`   ... and ${mappingData.unmappedRDS.length - 5} more`);
      }
    }
    
    if (mappingData.unmappedCognito.length > 0) {
      console.log('\n⚠️ Unmapped Cognito users (no RDS match):');
      mappingData.unmappedCognito.slice(0, 5).forEach(user => {
        console.log(`   - ${user.email} (${user.cognitoId})`);
      });
      if (mappingData.unmappedCognito.length > 5) {
        console.log(`   ... and ${mappingData.unmappedCognito.length - 5} more`);
      }
    }
    
    // Close RDS connection
    await rds.end();
    
  } catch (error) {
    console.error('\n❌ Mapping failed:', error.message);
    process.exit(1);
  }
}

// Show help
function showHelp() {
  console.log(`
Cognito User Mapping Script

Usage:
  node scripts/map-cognito-users-to-rds.js [options]

Options:
  --dry-run          Show what would be mapped without making changes
  --force-update     Update existing mappings
  --help             Show this help message

Environment Variables Required:
  VITE_AWS_USER_POOL_ID       AWS Cognito User Pool ID
  VITE_AWS_REGION             AWS region (default: us-east-1)
  DB_HOST                     RDS database host
  DB_PORT                     RDS database port (default: 5432)
  DB_NAME                     RDS database name (default: hallucifix)
  DB_USERNAME                 RDS database username
  DB_PASSWORD                 RDS database password
  DB_SSL                      Use SSL connection (default: false)

Examples:
  # Dry run to see what would be mapped
  node scripts/map-cognito-users-to-rds.js --dry-run

  # Map users and update existing mappings
  node scripts/map-cognito-users-to-rds.js --force-update
`);
}

// Main execution
if (process.argv.includes('--help')) {
  showHelp();
} else {
  mapCognitoUsers().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}