#!/usr/bin/env node

/**
 * User Migration Script: Supabase to AWS Cognito
 * 
 * This script migrates user data from Supabase Auth to AWS Cognito User Pool.
 * It handles user profiles, authentication data, and maintains user relationships.
 * 
 * Usage:
 *   node scripts/migrate-users-to-cognito.js [options]
 * 
 * Options:
 *   --dry-run          Show what would be migrated without making changes
 *   --skip-existing    Skip users that already exist in Cognito
 *   --batch-size=N     Process users in batches of N (default: 10)
 *   --help             Show this help message
 */

const { createClient } = require('@supabase/supabase-js');
const { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
  AdminGetUserCommand
} = require('@aws-sdk/client-cognito-identity-provider');

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
  migration: {
    batchSize: 10,
    dryRun: false,
    skipExisting: false,
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
for (const arg of args) {
  if (arg === '--dry-run') {
    config.migration.dryRun = true;
  } else if (arg === '--skip-existing') {
    config.migration.skipExisting = true;
  } else if (arg.startsWith('--batch-size=')) {
    config.migration.batchSize = parseInt(arg.split('=')[1]) || 10;
  } else if (arg === '--help') {
    console.log(`
User Migration Script: Supabase to AWS Cognito

Usage:
  node scripts/migrate-users-to-cognito.js [options]

Options:
  --dry-run          Show what would be migrated without making changes
  --skip-existing    Skip users that already exist in Cognito
  --batch-size=N     Process users in batches of N (default: 10)
  --help             Show this help message

Environment Variables Required:
  VITE_SUPABASE_URL              Supabase project URL
  SUPABASE_SERVICE_KEY           Supabase service role key
  VITE_AWS_REGION               AWS region (default: us-east-1)
  VITE_COGNITO_USER_POOL_ID     Cognito User Pool ID

Example:
  # Dry run to see what would be migrated
  node scripts/migrate-users-to-cognito.js --dry-run
  
  # Migrate users, skipping existing ones
  node scripts/migrate-users-to-cognito.js --skip-existing
  
  # Migrate in smaller batches
  node scripts/migrate-users-to-cognito.js --batch-size=5
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
  
  if (!config.supabase.url || !config.supabase.serviceKey) {
    console.error('❌ Invalid Supabase configuration');
    process.exit(1);
  }
  
  if (!config.cognito.userPoolId) {
    console.error('❌ Invalid Cognito configuration');
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
    // Fetch auth users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      throw new Error(`Failed to fetch auth users: ${authError.message}`);
    }
    
    // Fetch user profiles from users table
    const { data: userProfiles, error: profileError } = await supabase
      .from('users')
      .select('*');
    
    if (profileError) {
      console.warn('⚠️ Failed to fetch user profiles:', profileError.message);
    }
    
    // Merge auth data with profile data
    const users = authUsers.users.map(authUser => {
      const profile = userProfiles?.find(p => p.email === authUser.email) || {};
      
      return {
        id: authUser.id,
        email: authUser.email,
        emailConfirmed: authUser.email_confirmed_at !== null,
        createdAt: authUser.created_at,
        lastSignIn: authUser.last_sign_in_at,
        userMetadata: authUser.user_metadata || {},
        appMetadata: authUser.app_metadata || {},
        // Profile data
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

// Check if user exists in Cognito
async function checkCognitoUserExists(cognito, email) {
  try {
    await cognito.send(new AdminGetUserCommand({
      UserPoolId: config.cognito.userPoolId,
      Username: email,
    }));
    return true;
  } catch (error) {
    if (error.name === 'UserNotFoundException') {
      return false;
    }
    throw error;
  }
}

// Create user in Cognito
async function createCognitoUser(cognito, user) {
  const userAttributes = [
    { Name: 'email', Value: user.email },
    { Name: 'email_verified', Value: user.emailConfirmed ? 'true' : 'false' },
  ];
  
  // Add optional attributes
  if (user.name) {
    userAttributes.push({ Name: 'name', Value: user.name });
  }
  
  if (user.avatar) {
    userAttributes.push({ Name: 'picture', Value: user.avatar });
  }
  
  // Add custom attributes
  if (user.role) {
    userAttributes.push({ Name: 'custom:role', Value: user.role });
  }
  
  if (user.department) {
    userAttributes.push({ Name: 'custom:department', Value: user.department });
  }
  
  if (user.status) {
    userAttributes.push({ Name: 'custom:status', Value: user.status });
  }
  
  try {
    const createCommand = new AdminCreateUserCommand({
      UserPoolId: config.cognito.userPoolId,
      Username: user.email,
      UserAttributes: userAttributes,
      MessageAction: 'SUPPRESS', // Don't send welcome email
      TemporaryPassword: generateTemporaryPassword(),
    });
    
    const result = await cognito.send(createCommand);
    
    // Set permanent password (users will need to reset on first login)
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: config.cognito.userPoolId,
      Username: user.email,
      Password: generateTemporaryPassword(),
      Permanent: false, // Force password change on first login
    });
    
    await cognito.send(setPasswordCommand);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error creating user ${user.email}:`, error.message);
    throw error;
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
  password += '!'; // Special character
  
  // Add random characters to reach 12 characters
  for (let i = 4; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Migrate users in batches
async function migrateUsers(supabase, cognito, users) {
  const results = {
    total: users.length,
    created: 0,
    skipped: 0,
    errors: 0,
    errorDetails: []
  };
  
  console.log(`\n🚀 Starting migration of ${users.length} users...`);
  console.log(`📊 Batch size: ${config.migration.batchSize}`);
  console.log(`🔄 Dry run: ${config.migration.dryRun ? 'Yes' : 'No'}`);
  console.log(`⏭️  Skip existing: ${config.migration.skipExisting ? 'Yes' : 'No'}\n`);
  
  for (let i = 0; i < users.length; i += config.migration.batchSize) {
    const batch = users.slice(i, i + config.migration.batchSize);
    const batchNum = Math.floor(i / config.migration.batchSize) + 1;
    const totalBatches = Math.ceil(users.length / config.migration.batchSize);
    
    console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} users)...`);
    
    for (const user of batch) {
      try {
        // Check if user already exists in Cognito
        const exists = await checkCognitoUserExists(cognito, user.email);
        
        if (exists && config.migration.skipExisting) {
          console.log(`⏭️  Skipping existing user: ${user.email}`);
          results.skipped++;
          continue;
        }
        
        if (exists && !config.migration.skipExisting) {
          console.log(`⚠️  User already exists: ${user.email} (will be updated)`);
        }
        
        if (config.migration.dryRun) {
          console.log(`🔍 [DRY RUN] Would migrate user: ${user.email}`);
          console.log(`   Name: ${user.name || 'N/A'}`);
          console.log(`   Role: ${user.role || 'user'}`);
          console.log(`   Department: ${user.department || 'General'}`);
          console.log(`   Email Confirmed: ${user.emailConfirmed ? 'Yes' : 'No'}`);
          results.created++;
        } else {
          if (!exists) {
            await createCognitoUser(cognito, user);
            console.log(`✅ Created user: ${user.email}`);
            results.created++;
          } else {
            // Update existing user attributes
            const updateCommand = new AdminUpdateUserAttributesCommand({
              UserPoolId: config.cognito.userPoolId,
              Username: user.email,
              UserAttributes: [
                { Name: 'name', Value: user.name || '' },
                { Name: 'picture', Value: user.avatar || '' },
                { Name: 'custom:role', Value: user.role || 'user' },
                { Name: 'custom:department', Value: user.department || 'General' },
                { Name: 'custom:status', Value: user.status || 'active' },
              ].filter(attr => attr.Value), // Only include non-empty values
            });
            
            await cognito.send(updateCommand);
            console.log(`🔄 Updated user: ${user.email}`);
            results.created++;
          }
        }
        
      } catch (error) {
        console.error(`❌ Error processing user ${user.email}:`, error.message);
        results.errors++;
        results.errorDetails.push({
          email: user.email,
          error: error.message
        });
      }
    }
    
    // Small delay between batches to avoid rate limiting
    if (i + config.migration.batchSize < users.length) {
      console.log('⏳ Waiting 2 seconds before next batch...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return results;
}

// Print migration summary
function printSummary(results) {
  console.log('\n' + '='.repeat(50));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total users processed: ${results.total}`);
  console.log(`Successfully migrated: ${results.created}`);
  console.log(`Skipped (existing): ${results.skipped}`);
  console.log(`Errors: ${results.errors}`);
  
  if (results.errors > 0) {
    console.log('\n❌ ERRORS:');
    results.errorDetails.forEach(error => {
      console.log(`   ${error.email}: ${error.error}`);
    });
  }
  
  if (config.migration.dryRun) {
    console.log('\n🔍 This was a dry run - no actual changes were made.');
    console.log('Run without --dry-run to perform the actual migration.');
  } else {
    console.log('\n✅ Migration completed!');
    console.log('\n📝 NEXT STEPS:');
    console.log('1. Users will need to reset their passwords on first login');
    console.log('2. Verify user data in AWS Cognito console');
    console.log('3. Test authentication with migrated users');
    console.log('4. Update application to use Cognito authentication');
  }
  
  console.log('='.repeat(50));
}

// Main migration function
async function main() {
  try {
    console.log('🔄 HalluciFix User Migration: Supabase → AWS Cognito\n');
    
    // Validate configuration
    validateConfig();
    
    // Initialize clients
    const { supabase, cognito } = initializeClients();
    
    // Fetch users from Supabase
    const users = await fetchSupabaseUsers(supabase);
    
    if (users.length === 0) {
      console.log('ℹ️  No users found to migrate.');
      return;
    }
    
    // Migrate users
    const results = await migrateUsers(supabase, cognito, users);
    
    // Print summary
    printSummary(results);
    
    // Exit with appropriate code
    process.exit(results.errors > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  main();
}

module.exports = {
  main,
  fetchSupabaseUsers,
  createCognitoUser,
  migrateUsers
};