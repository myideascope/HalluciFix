#!/usr/bin/env node

/**
 * User Migration Validation Script
 * 
 * This script validates the user migration from Supabase to AWS Cognito
 * by comparing user data and ensuring data integrity.
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
const { CognitoIdentityProviderClient, ListUsersCommand, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
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
    
    const { data: profiles, error: profileError } = await supabase
      .from('users')
      .select('*');
    
    if (profileError) {
      console.warn('⚠️ Could not fetch user profiles:', profileError.message);
    }
    
    const users = authUsers.users.map(authUser => {
      const profile = profiles?.find(p => p.id === authUser.id || p.email === authUser.email);
      
      return {
        id: authUser.id,
        email: authUser.email,
        emailConfirmed: authUser.email_confirmed_at !== null,
        createdAt: authUser.created_at,
        name: profile?.name || authUser.user_metadata?.full_name || authUser.user_metadata?.name,
        avatar: profile?.avatar_url || authUser.user_metadata?.avatar_url,
        role: profile?.role_id || 'user',
        department: profile?.department || 'General',
      };
    });
    
    console.log(`✅ Found ${users.length} users in Supabase`);
    return users;
    
  } catch (error) {
    console.error('❌ Failed to fetch Supabase users:', error.message);
    throw error;
  }
}

// Fetch users from Cognito
async function fetchCognitoUsers(cognito) {
  console.log('📥 Fetching users from Cognito...');
  
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
            username: user.Username,
            email: attributes.email,
            emailVerified: attributes.email_verified === 'true',
            createdAt: user.UserCreateDate,
            status: user.UserStatus,
            enabled: user.Enabled,
            givenName: attributes.given_name,
            familyName: attributes.family_name,
            picture: attributes.picture,
            customRole: attributes['custom:role'],
            customDepartment: attributes['custom:department'],
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

// Compare user data
function compareUsers(supabaseUsers, cognitoUsers) {
  console.log('\n🔍 Comparing user data...');
  
  const results = {
    total: {
      supabase: supabaseUsers.length,
      cognito: cognitoUsers.length,
    },
    matched: 0,
    missing: [],
    mismatched: [],
    extra: [],
  };
  
  // Create lookup maps
  const supabaseMap = new Map(supabaseUsers.map(user => [user.email.toLowerCase(), user]));
  const cognitoMap = new Map(cognitoUsers.map(user => [user.email?.toLowerCase(), user]));
  
  // Check for missing users (in Supabase but not in Cognito)
  for (const supabaseUser of supabaseUsers) {
    const email = supabaseUser.email.toLowerCase();
    const cognitoUser = cognitoMap.get(email);
    
    if (!cognitoUser) {
      results.missing.push({
        email: supabaseUser.email,
        name: supabaseUser.name,
        role: supabaseUser.role,
      });
    } else {
      // Compare user attributes
      const comparison = compareUserAttributes(supabaseUser, cognitoUser);
      
      if (comparison.matches) {
        results.matched++;
      } else {
        results.mismatched.push({
          email: supabaseUser.email,
          differences: comparison.differences,
        });
      }
    }
  }
  
  // Check for extra users (in Cognito but not in Supabase)
  for (const cognitoUser of cognitoUsers) {
    if (!cognitoUser.email) continue;
    
    const email = cognitoUser.email.toLowerCase();
    if (!supabaseMap.has(email)) {
      results.extra.push({
        email: cognitoUser.email,
        username: cognitoUser.username,
        status: cognitoUser.status,
      });
    }
  }
  
  return results;
}

// Compare individual user attributes
function compareUserAttributes(supabaseUser, cognitoUser) {
  const differences = [];
  
  // Email verification status
  if (supabaseUser.emailConfirmed !== cognitoUser.emailVerified) {
    differences.push({
      field: 'emailVerified',
      supabase: supabaseUser.emailConfirmed,
      cognito: cognitoUser.emailVerified,
    });
  }
  
  // Name comparison
  const supabaseName = supabaseUser.name || '';
  const cognitoName = [cognitoUser.givenName, cognitoUser.familyName].filter(Boolean).join(' ');
  
  if (supabaseName !== cognitoName && supabaseName !== '') {
    differences.push({
      field: 'name',
      supabase: supabaseName,
      cognito: cognitoName,
    });
  }
  
  // Role comparison
  if (supabaseUser.role !== (cognitoUser.customRole || 'user')) {
    differences.push({
      field: 'role',
      supabase: supabaseUser.role,
      cognito: cognitoUser.customRole || 'user',
    });
  }
  
  // Department comparison
  if (supabaseUser.department !== (cognitoUser.customDepartment || 'General')) {
    differences.push({
      field: 'department',
      supabase: supabaseUser.department,
      cognito: cognitoUser.customDepartment || 'General',
    });
  }
  
  return {
    matches: differences.length === 0,
    differences,
  };
}

// Print validation results
function printResults(results) {
  console.log('\n📊 Validation Results:');
  console.log('='.repeat(50));
  
  console.log(`\n📈 Summary:`);
  console.log(`   Supabase users: ${results.total.supabase}`);
  console.log(`   Cognito users: ${results.total.cognito}`);
  console.log(`   Matched users: ${results.matched}`);
  console.log(`   Missing users: ${results.missing.length}`);
  console.log(`   Mismatched users: ${results.mismatched.length}`);
  console.log(`   Extra users: ${results.extra.length}`);
  
  // Migration completeness
  const completeness = results.total.supabase > 0 
    ? ((results.matched + results.mismatched.length) / results.total.supabase * 100).toFixed(1)
    : 0;
  
  console.log(`\n📊 Migration Completeness: ${completeness}%`);
  
  if (results.missing.length > 0) {
    console.log(`\n❌ Missing Users (${results.missing.length}):`);
    results.missing.forEach(user => {
      console.log(`   - ${user.email} (${user.name || 'No name'}, ${user.role})`);
    });
  }
  
  if (results.mismatched.length > 0) {
    console.log(`\n⚠️  Mismatched Users (${results.mismatched.length}):`);
    results.mismatched.forEach(user => {
      console.log(`   - ${user.email}:`);
      user.differences.forEach(diff => {
        console.log(`     ${diff.field}: "${diff.supabase}" → "${diff.cognito}"`);
      });
    });
  }
  
  if (results.extra.length > 0) {
    console.log(`\n➕ Extra Users in Cognito (${results.extra.length}):`);
    results.extra.forEach(user => {
      console.log(`   - ${user.email} (${user.username}, ${user.status})`);
    });
  }
  
  // Overall status
  console.log('\n🎯 Overall Status:');
  if (results.missing.length === 0 && results.mismatched.length === 0) {
    console.log('   ✅ Migration appears to be complete and accurate!');
  } else if (results.missing.length === 0) {
    console.log('   ⚠️  Migration is complete but some data mismatches exist.');
  } else {
    console.log('   ❌ Migration is incomplete. Some users are missing.');
  }
}

// Export detailed report
function exportReport(results, outputPath) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      supabaseUsers: results.total.supabase,
      cognitoUsers: results.total.cognito,
      matchedUsers: results.matched,
      missingUsers: results.missing.length,
      mismatchedUsers: results.mismatched.length,
      extraUsers: results.extra.length,
      completeness: results.total.supabase > 0 
        ? ((results.matched + results.mismatched.length) / results.total.supabase * 100)
        : 0,
    },
    details: {
      missing: results.missing,
      mismatched: results.mismatched,
      extra: results.extra,
    },
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report exported to: ${outputPath}`);
}

// Main validation function
async function validateMigration() {
  console.log('🔍 Starting user migration validation\n');
  
  try {
    // Validate configuration
    validateConfig();
    
    // Initialize clients
    const { supabase, cognito } = initializeClients();
    
    // Fetch users from both systems
    const [supabaseUsers, cognitoUsers] = await Promise.all([
      fetchSupabaseUsers(supabase),
      fetchCognitoUsers(cognito),
    ]);
    
    // Compare users
    const results = compareUsers(supabaseUsers, cognitoUsers);
    
    // Print results
    printResults(results);
    
    // Export report if requested
    if (config.validation.exportReport) {
      const reportPath = path.join(__dirname, '..', 'migration-reports', `validation-report-${Date.now()}.json`);
      const reportDir = path.dirname(reportPath);
      
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }
      
      exportReport(results, reportPath);
    }
    
    // Exit with appropriate code
    if (results.missing.length > 0) {
      process.exit(1); // Incomplete migration
    } else if (results.mismatched.length > 0) {
      process.exit(2); // Complete but with data issues
    } else {
      process.exit(0); // Success
    }
    
  } catch (error) {
    console.error('\n❌ Validation failed:', error.message);
    process.exit(1);
  }
}

// Show help
function showHelp() {
  console.log(`
User Migration Validation Script

Usage:
  node scripts/validate-user-migration.js [options]

Options:
  --detailed         Show detailed comparison for each user
  --export-report    Export validation report to JSON file
  --help             Show this help message

Environment Variables Required:
  VITE_SUPABASE_URL           Supabase project URL
  SUPABASE_SERVICE_KEY        Supabase service role key
  VITE_AWS_USER_POOL_ID       AWS Cognito User Pool ID
  VITE_AWS_REGION             AWS region (default: us-east-1)

Exit Codes:
  0    Migration is complete and accurate
  1    Migration is incomplete (missing users)
  2    Migration is complete but has data mismatches

Examples:
  # Basic validation
  node scripts/validate-user-migration.js

  # Detailed validation with report export
  node scripts/validate-user-migration.js --detailed --export-report
`);
}

// Main execution
if (process.argv.includes('--help')) {
  showHelp();
} else {
  validateMigration().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}