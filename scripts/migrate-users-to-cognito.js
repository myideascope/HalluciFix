#!/usr/bin/env node

/**
 * User Migration Script: Supabase to AWS Cognito
 * 
 * This script migrates user data from Supabase Auth to AWS Cognito User Pool.
 * It handles user profiles, metadata, and ensures data integrity during migration.
 * 
 * Usage:
 *   node scripts/migrate-users-to-cognito.js [options]
 * 
 * Options:
 *   --dry-run          Show what would be migrated without making changes
 *   --skip-existing    Skip users that already exist in Cognito
 *   --batch-size=N     Process N users at a time (default: 10)
 *   --help             Show this help message
 */

const { createClient } = require('@supabase/supabase-js');
const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminUpdateUserAttributesCommand, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
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
  migration: {
    dryRun: process.argv.includes('--dry-run'),
    skipExisting: process.argv.includes('--skip-existing'),
    batchSize: parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 10,
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
    // Get users from auth.users table
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      throw new Error(`Failed to fetch auth users: ${authError.message}`);
    }
    
    // Get user profiles from users table
    const { data: profiles, error: profileError } = await supabase
      .from('users')
      .select('*');
    
    if (profileError) {
      console.warn('⚠️ Could not fetch user profiles:', profileError.message);
    }
    
    // Merge auth data with profile data
    const users = authUsers.users.map(authUser => {
      const profile = profiles?.find(p => p.id === authUser.id || p.email === authUser.email);
      
      return {
        id: authUser.id,
        email: authUser.email,
        emailConfirmed: authUser.email_confirmed_at !== null,
        createdAt: authUser.created_at,
        lastSignIn: authUser.last_sign_in_at,
        userMetadata: authUser.user_metadata || {},
        appMetadata: authUser.app_metadata || {},
        // Profile data
        name: profile?.name || authUser.user_metadata?.full_name || authUser.user_metadata?.name,
        avatar: profile?.avatar_url || authUser.user_metadata?.avatar_url,
        role: profile?.role_id || 'user',
        department: profile?.department || 'General',
        status: profile?.status || 'active',
      };
    });
    
    console.log(`✅ Found ${users.length} users in Supabase`);
    return users;
    
  } catch (error) {
    console.error('❌ Failed to fetch Supabase users:', error.message);
    throw error;
  }
}

// Check existing users in Cognito
async function getExistingCognitoUsers(cognito) {
  console.log('🔍 Checking existing users in Cognito...');
  
  try {
    const existingUsers = new Set();
    let paginationToken;
    
    do {
      const command = new ListUsersCommand({
        UserPoolId: config.cognito.userPoolId,
        PaginationToken: paginationToken,
        Limit: 60, // Max allowed by AWS
      });
      
      const response = await cognito.send(command);
      
      response.Users?.forEach(user => {
        const email = user.Attributes?.find(attr => attr.Name === 'email')?.Value;
        if (email) {
          existingUsers.add(email.toLowerCase());
        }
      });
      
      paginationToken = response.PaginationToken;
    } while (paginationToken);
    
    console.log(`✅ Found ${existingUsers.size} existing users in Cognito`);
    return existingUsers;
    
  } catch (error) {
    console.error('❌ Failed to fetch Cognito users:', error.message);
    throw error;
  }
}

// Create user in Cognito
async function createCognitoUser(cognito, user) {
  const attributes = [
    { Name: 'email', Value: user.email },
    { Name: 'email_verified', Value: user.emailConfirmed ? 'true' : 'false' },
  ];
  
  // Add optional attributes
  if (user.name) {
    const nameParts = user.name.split(' ');
    attributes.push({ Name: 'given_name', Value: nameParts[0] });
    if (nameParts.length > 1) {
      attributes.push({ Name: 'family_name', Value: nameParts.slice(1).join(' ') });
    }
  }
  
  if (user.avatar) {
    attributes.push({ Name: 'picture', Value: user.avatar });
  }
  
  // Add custom attributes
  if (user.role && user.role !== 'user') {
    attributes.push({ Name: 'custom:role', Value: user.role });
  }
  
  if (user.department && user.department !== 'General') {
    attributes.push({ Name: 'custom:department', Value: user.department });
  }
  
  try {
    const createCommand = new AdminCreateUserCommand({
      UserPoolId: config.cognito.userPoolId,
      Username: user.email,
      UserAttributes: attributes,
      MessageAction: 'SUPPRESS', // Don't send welcome email
      TemporaryPassword: generateTemporaryPassword(),
    });
    
    const result = await cognito.send(createCommand);
    
    // Set permanent password (users will need to reset)
    const passwordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: config.cognito.userPoolId,
      Username: user.email,
      Password: generateTemporaryPassword(),
      Permanent: false, // Force password reset on first login
    });
    
    await cognito.send(passwordCommand);
    
    return {
      success: true,
      cognitoUsername: result.User?.Username,
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Generate temporary password
function generateTemporaryPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  
  // Ensure password meets Cognito requirements
  password += 'A'; // Uppercase
  password += 'a'; // Lowercase
  password += '1'; // Number
  password += '!'; // Symbol
  
  // Add random characters to reach minimum length
  for (let i = 4; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Process users in batches
async function processBatch(cognito, users, existingUsers, batchIndex, totalBatches) {
  console.log(`\n📦 Processing batch ${batchIndex + 1}/${totalBatches} (${users.length} users)...`);
  
  const results = {
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  
  for (const user of users) {
    const email = user.email.toLowerCase();
    
    // Skip if user already exists and skipExisting is enabled
    if (config.migration.skipExisting && existingUsers.has(email)) {
      console.log(`⏭️  Skipping existing user: ${user.email}`);
      results.skipped++;
      continue;
    }
    
    if (config.migration.dryRun) {
      console.log(`🔍 [DRY RUN] Would create user: ${user.email}`);
      results.created++;
      continue;
    }
    
    console.log(`👤 Creating user: ${user.email}`);
    const result = await createCognitoUser(cognito, user);
    
    if (result.success) {
      console.log(`✅ Created user: ${user.email}`);
      results.created++;
    } else {
      console.log(`❌ Failed to create user ${user.email}: ${result.error}`);
      results.failed++;
      results.errors.push({
        email: user.email,
        error: result.error,
      });
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

// Generate migration report
function generateReport(results, outputPath) {
  const report = {
    timestamp: new Date().toISOString(),
    configuration: {
      dryRun: config.migration.dryRun,
      skipExisting: config.migration.skipExisting,
      batchSize: config.migration.batchSize,
    },
    summary: {
      totalUsers: results.totalUsers,
      created: results.created,
      skipped: results.skipped,
      failed: results.failed,
    },
    errors: results.errors,
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`📄 Migration report saved to: ${outputPath}`);
}

// Main migration function
async function migrateUsers() {
  console.log('🚀 Starting user migration from Supabase to AWS Cognito\n');
  
  if (config.migration.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  try {
    // Validate configuration
    validateConfig();
    
    // Initialize clients
    const { supabase, cognito } = initializeClients();
    
    // Fetch users from Supabase
    const supabaseUsers = await fetchSupabaseUsers(supabase);
    
    if (supabaseUsers.length === 0) {
      console.log('ℹ️  No users found in Supabase. Migration complete.');
      return;
    }
    
    // Get existing Cognito users
    const existingUsers = await getExistingCognitoUsers(cognito);
    
    // Filter users if skipExisting is enabled
    let usersToMigrate = supabaseUsers;
    if (config.migration.skipExisting) {
      usersToMigrate = supabaseUsers.filter(user => 
        !existingUsers.has(user.email.toLowerCase())
      );
      console.log(`📊 ${usersToMigrate.length} users will be migrated (${supabaseUsers.length - usersToMigrate.length} already exist)`);
    }
    
    if (usersToMigrate.length === 0) {
      console.log('ℹ️  All users already exist in Cognito. Migration complete.');
      return;
    }
    
    // Process users in batches
    const batches = [];
    for (let i = 0; i < usersToMigrate.length; i += config.migration.batchSize) {
      batches.push(usersToMigrate.slice(i, i + config.migration.batchSize));
    }
    
    const overallResults = {
      totalUsers: usersToMigrate.length,
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
    
    for (let i = 0; i < batches.length; i++) {
      const batchResults = await processBatch(cognito, batches[i], existingUsers, i, batches.length);
      
      overallResults.created += batchResults.created;
      overallResults.skipped += batchResults.skipped;
      overallResults.failed += batchResults.failed;
      overallResults.errors.push(...batchResults.errors);
      
      // Delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        console.log('⏳ Waiting before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Generate report
    const reportPath = path.join(__dirname, '..', 'migration-reports', `user-migration-${Date.now()}.json`);
    const reportDir = path.dirname(reportPath);
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    generateReport(overallResults, reportPath);
    
    // Summary
    console.log('\n🎉 Migration completed!');
    console.log(`📊 Summary:`);
    console.log(`   Total users: ${overallResults.totalUsers}`);
    console.log(`   Created: ${overallResults.created}`);
    console.log(`   Skipped: ${overallResults.skipped}`);
    console.log(`   Failed: ${overallResults.failed}`);
    
    if (overallResults.failed > 0) {
      console.log('\n❌ Some users failed to migrate. Check the report for details.');
      console.log('   Users will need to reset their passwords on first login.');
    }
    
    if (!config.migration.dryRun && overallResults.created > 0) {
      console.log('\n📧 Next steps:');
      console.log('   1. Users will need to reset their passwords on first login');
      console.log('   2. Consider sending notification emails to migrated users');
      console.log('   3. Update your application to use AWS Cognito');
      console.log('   4. Test the authentication flow thoroughly');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Show help
function showHelp() {
  console.log(`
User Migration Script: Supabase to AWS Cognito

Usage:
  node scripts/migrate-users-to-cognito.js [options]

Options:
  --dry-run          Show what would be migrated without making changes
  --skip-existing    Skip users that already exist in Cognito
  --batch-size=N     Process N users at a time (default: 10)
  --help             Show this help message

Environment Variables Required:
  VITE_SUPABASE_URL           Supabase project URL
  SUPABASE_SERVICE_KEY        Supabase service role key
  VITE_AWS_USER_POOL_ID       AWS Cognito User Pool ID
  VITE_AWS_REGION             AWS region (default: us-east-1)

Examples:
  # Dry run to see what would be migrated
  node scripts/migrate-users-to-cognito.js --dry-run

  # Migrate users, skipping those that already exist
  node scripts/migrate-users-to-cognito.js --skip-existing

  # Migrate in smaller batches
  node scripts/migrate-users-to-cognito.js --batch-size=5
`);
}

// Main execution
if (process.argv.includes('--help')) {
  showHelp();
} else {
  migrateUsers().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}