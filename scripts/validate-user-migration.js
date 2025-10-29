#!/usr/bin/env node

/**
 * User Migration Validation Script
 * 
 * This script validates that user migration from Supabase to Cognito was successful.
 * It compares user data between both systems and reports any discrepancies.
 * 
 * Usage:
 *   node scripts/validate-user-migration.js [options]
 * 
 * Options:
 *   --detailed         Show detailed comparison for each user
 *   --export-report    Export validation report to JSON file
 *   --help             Show this help message
 */

const { createClient } = require('@supabase/supabase-js');
const { 
  CognitoIdentityProviderClient, 
  ListUsersCommand,
  AdminGetUserCommand
} = require('@aws-sdk/client-cognito-identity-provider');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const config = {
  supabase: {
    url: process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },
  cognito: {
    region: process.env.VITE_AWS_REGION || 'us-east-1',
    userPoolId: process.env.VITE_COGNITO_USER_POOL_ID,
  },
  validation: {
    detailed: false,
    exportReport: false,
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
for (const arg of args) {
  if (arg === '--detailed') {
    config.validation.detailed = true;
  } else if (arg === '--export-report') {
    config.validation.exportReport = true;
  } else if (arg === '--help') {
    console.log(`
User Migration Validation Script

Usage:
  node scripts/validate-user-migration.js [options]

Options:
  --detailed         Show detailed comparison for each user
  --export-report    Export validation report to JSON file
  --help             Show this help message

Environment Variables Required:
  VITE_SUPABASE_URL              Supabase project URL
  SUPABASE_SERVICE_KEY           Supabase service role key
  VITE_AWS_REGION               AWS region (default: us-east-1)
  VITE_COGNITO_USER_POOL_ID     Cognito User Pool ID

Example:
  # Basic validation
  node scripts/validate-user-migration.js
  
  # Detailed validation with report export
  node scripts/validate-user-migration.js --detailed --export-report
`);
    process.exit(0);
  }
}

// Validate configuration
function validateConfig() {
  const required = [
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'VITE_COGNITO_USER_POOL_ID'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   ${key}`));
    console.error('\nPlease set these variables and try again.');
    process.exit(1);
  }
}

// Initialize clients
function initializeClients() {
  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);
  
  const cognito = new CognitoIdentityProviderClient({
    region: config.cognito.region,
  });
  
  return { supabase, cognito };
}

// Fetch users from Supabase
async function fetchSupabaseUsers(supabase) {
  console.log('📥 Fetching users from Supabase...');
  
  try {
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      throw new Error(`Failed to fetch auth users: ${authError.message}`);
    }
    
    const { data: userProfiles, error: profileError } = await supabase
      .from('users')
      .select('*');
    
    if (profileError) {
      console.warn('⚠️ Failed to fetch user profiles:', profileError.message);
    }
    
    const users = authUsers.users.map(authUser => {
      const profile = userProfiles?.find(p => p.email === authUser.email) || {};
      
      return {
        id: authUser.id,
        email: authUser.email,
        emailConfirmed: authUser.email_confirmed_at !== null,
        createdAt: authUser.created_at,
        name: profile.name || authUser.user_metadata?.full_name || authUser.user_metadata?.name,
        avatar: profile.avatar_url || authUser.user_metadata?.avatar_url,
        role: profile.role_id || 'user',
        department: profile.department || 'General',
        status: profile.status || 'active',
      };
    });
    
    console.log(`✅ Found ${users.length} users in Supabase`);
    return users;
    
  } catch (error) {
    console.error('❌ Error fetching Supabase users:', error);
    throw error;
  }
}

// Fetch users from Cognito
async function fetchCognitoUsers(cognito) {
  console.log('📥 Fetching users from Cognito...');
  
  try {
    const users = [];
    let paginationToken = undefined;
    
    do {
      const command = new ListUsersCommand({
        UserPoolId: config.cognito.userPoolId,
        Limit: 60, // Maximum allowed by AWS
        PaginationToken: paginationToken,
      });
      
      const response = await cognito.send(command);
      
      for (const user of response.Users) {
        const attributes = {};
        user.Attributes.forEach(attr => {
          attributes[attr.Name] = attr.Value;
        });
        
        users.push({
          username: user.Username,
          email: attributes.email,
          emailVerified: attributes.email_verified === 'true',
          enabled: user.Enabled,
          status: user.UserStatus,
          createdAt: user.UserCreateDate,
          name: attributes.name,
          avatar: attributes.picture,
          role: attributes['custom:role'],
          department: attributes['custom:department'],
          userStatus: attributes['custom:status'],
        });
      }
      
      paginationToken = response.PaginationToken;
    } while (paginationToken);
    
    console.log(`✅ Found ${users.length} users in Cognito`);
    return users;
    
  } catch (error) {
    console.error('❌ Error fetching Cognito users:', error);
    throw error;
  }
}

// Compare user data
function compareUsers(supabaseUsers, cognitoUsers) {
  console.log('\n🔍 Comparing user data...');
  
  const validation = {
    summary: {
      supabaseTotal: supabaseUsers.length,
      cognitoTotal: cognitoUsers.length,
      matched: 0,
      missingInCognito: 0,
      extraInCognito: 0,
      dataDiscrepancies: 0,
    },
    details: {
      matched: [],
      missingInCognito: [],
      extraInCognito: [],
      discrepancies: [],
    }
  };
  
  // Create lookup maps
  const supabaseMap = new Map(supabaseUsers.map(user => [user.email, user]));
  const cognitoMap = new Map(cognitoUsers.map(user => [user.email, user]));
  
  // Check for users missing in Cognito
  for (const supabaseUser of supabaseUsers) {
    const cognitoUser = cognitoMap.get(supabaseUser.email);
    
    if (!cognitoUser) {
      validation.summary.missingInCognito++;
      validation.details.missingInCognito.push(supabaseUser);
    } else {
      // Compare user data
      const discrepancies = compareUserData(supabaseUser, cognitoUser);
      
      if (discrepancies.length > 0) {
        validation.summary.dataDiscrepancies++;
        validation.details.discrepancies.push({
          email: supabaseUser.email,
          discrepancies
        });
      } else {
        validation.summary.matched++;
        validation.details.matched.push(supabaseUser.email);
      }
    }
  }
  
  // Check for extra users in Cognito
  for (const cognitoUser of cognitoUsers) {
    if (!supabaseMap.has(cognitoUser.email)) {
      validation.summary.extraInCognito++;
      validation.details.extraInCognito.push(cognitoUser);
    }
  }
  
  return validation;
}

// Compare individual user data
function compareUserData(supabaseUser, cognitoUser) {
  const discrepancies = [];
  
  // Compare name
  if (supabaseUser.name !== cognitoUser.name) {
    discrepancies.push({
      field: 'name',
      supabase: supabaseUser.name,
      cognito: cognitoUser.name
    });
  }
  
  // Compare avatar
  if (supabaseUser.avatar !== cognitoUser.avatar) {
    discrepancies.push({
      field: 'avatar',
      supabase: supabaseUser.avatar,
      cognito: cognitoUser.avatar
    });
  }
  
  // Compare role
  if (supabaseUser.role !== cognitoUser.role) {
    discrepancies.push({
      field: 'role',
      supabase: supabaseUser.role,
      cognito: cognitoUser.role
    });
  }
  
  // Compare department
  if (supabaseUser.department !== cognitoUser.department) {
    discrepancies.push({
      field: 'department',
      supabase: supabaseUser.department,
      cognito: cognitoUser.department
    });
  }
  
  // Compare status
  if (supabaseUser.status !== cognitoUser.userStatus) {
    discrepancies.push({
      field: 'status',
      supabase: supabaseUser.status,
      cognito: cognitoUser.userStatus
    });
  }
  
  // Compare email verification status
  if (supabaseUser.emailConfirmed !== cognitoUser.emailVerified) {
    discrepancies.push({
      field: 'emailVerified',
      supabase: supabaseUser.emailConfirmed,
      cognito: cognitoUser.emailVerified
    });
  }
  
  return discrepancies;
}

// Print validation results
function printValidationResults(validation) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION VALIDATION RESULTS');
  console.log('='.repeat(60));
  
  const { summary } = validation;
  
  console.log(`Total users in Supabase: ${summary.supabaseTotal}`);
  console.log(`Total users in Cognito: ${summary.cognitoTotal}`);
  console.log(`\n✅ Successfully matched: ${summary.matched}`);
  console.log(`❌ Missing in Cognito: ${summary.missingInCognito}`);
  console.log(`⚠️  Extra in Cognito: ${summary.extraInCognito}`);
  console.log(`🔄 Data discrepancies: ${summary.dataDiscrepancies}`);
  
  // Calculate success rate
  const successRate = summary.supabaseTotal > 0 
    ? ((summary.matched / summary.supabaseTotal) * 100).toFixed(1)
    : 0;
  
  console.log(`\n📈 Migration success rate: ${successRate}%`);
  
  // Show detailed results if requested
  if (config.validation.detailed) {
    console.log('\n' + '-'.repeat(40));
    console.log('📋 DETAILED RESULTS');
    console.log('-'.repeat(40));
    
    if (validation.details.missingInCognito.length > 0) {
      console.log('\n❌ USERS MISSING IN COGNITO:');
      validation.details.missingInCognito.forEach(user => {
        console.log(`   ${user.email} (${user.name || 'No name'})`);
      });
    }
    
    if (validation.details.extraInCognito.length > 0) {
      console.log('\n⚠️  EXTRA USERS IN COGNITO:');
      validation.details.extraInCognito.forEach(user => {
        console.log(`   ${user.email} (${user.name || 'No name'})`);
      });
    }
    
    if (validation.details.discrepancies.length > 0) {
      console.log('\n🔄 DATA DISCREPANCIES:');
      validation.details.discrepancies.forEach(item => {
        console.log(`\n   ${item.email}:`);
        item.discrepancies.forEach(disc => {
          console.log(`     ${disc.field}: "${disc.supabase}" → "${disc.cognito}"`);
        });
      });
    }
  }
  
  // Provide recommendations
  console.log('\n' + '-'.repeat(40));
  console.log('💡 RECOMMENDATIONS');
  console.log('-'.repeat(40));
  
  if (summary.missingInCognito > 0) {
    console.log('• Re-run migration script for missing users');
  }
  
  if (summary.dataDiscrepancies > 0) {
    console.log('• Review and fix data discrepancies');
    console.log('• Consider updating Cognito user attributes');
  }
  
  if (summary.extraInCognito > 0) {
    console.log('• Review extra users in Cognito');
    console.log('• These may be test users or users created after migration');
  }
  
  if (successRate >= 95) {
    console.log('• ✅ Migration appears successful!');
    console.log('• Consider running integration tests');
  } else if (successRate >= 80) {
    console.log('• ⚠️  Migration mostly successful but needs attention');
    console.log('• Address missing users and discrepancies');
  } else {
    console.log('• ❌ Migration needs significant attention');
    console.log('• Review migration process and re-run if necessary');
  }
  
  console.log('='.repeat(60));
}

// Export validation report
async function exportValidationReport(validation) {
  if (!config.validation.exportReport) {
    return;
  }
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `user-migration-validation-${timestamp}.json`;
    const filepath = path.join(process.cwd(), 'reports', filename);
    
    // Ensure reports directory exists
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    
    const report = {
      timestamp: new Date().toISOString(),
      validation,
      config: {
        cognitoUserPoolId: config.cognito.userPoolId,
        region: config.cognito.region,
      }
    };
    
    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Validation report exported to: ${filepath}`);
    
  } catch (error) {
    console.error('❌ Failed to export validation report:', error.message);
  }
}

// Main validation function
async function main() {
  try {
    console.log('🔍 HalluciFix User Migration Validation\n');
    
    // Validate configuration
    validateConfig();
    
    // Initialize clients
    const { supabase, cognito } = initializeClients();
    
    // Fetch users from both systems
    const [supabaseUsers, cognitoUsers] = await Promise.all([
      fetchSupabaseUsers(supabase),
      fetchCognitoUsers(cognito)
    ]);
    
    // Compare users
    const validation = compareUsers(supabaseUsers, cognitoUsers);
    
    // Print results
    printValidationResults(validation);
    
    // Export report if requested
    await exportValidationReport(validation);
    
    // Exit with appropriate code
    const hasIssues = validation.summary.missingInCognito > 0 || 
                     validation.summary.dataDiscrepancies > 0;
    
    process.exit(hasIssues ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ Validation failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run the validation
if (require.main === module) {
  main();
}

module.exports = {
  main,
  compareUsers,
  compareUserData
};