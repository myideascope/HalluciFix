#!/usr/bin/env node

/**
 * User Migration Script: Supabase to AWS Cognito
 * 
 * This script migrates users from Supabase Auth to AWS Cognito User Pool
 * while preserving user data and maintaining data integrity.
 */

const { createClient } = require('@supabase/supabase-js');
const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminUpdateUserAttributesCommand } = require('@aws-sdk/client-cognito-identity-provider');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const config = {
  supabase: {
    url: process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY, // Service key needed for admin operations
  },
  cognito: {
    userPoolId: process.env.VITE_COGNITO_USER_POOL_ID,
    region: process.env.VITE_COGNITO_REGION || 'us-east-1',
  },
  migration: {
    batchSize: 10, // Process users in batches
    dryRun: process.argv.includes('--dry-run'),
    skipExisting: process.argv.includes('--skip-existing'),
    outputFile: 'migration-report.json',
  }
};

class UserMigrationService {
  constructor() {
    this.supabase = null;
    this.cognitoClient = null;
    this.migrationReport = {
      startTime: new Date().toISOString(),
      totalUsers: 0,
      successfulMigrations: 0,
      failedMigrations: 0,
      skippedUsers: 0,
      errors: [],
      migratedUsers: [],
    };
  }

  async initialize() {
    // Validate configuration
    if (!config.supabase.url || !config.supabase.serviceKey) {
      throw new Error('Supabase configuration missing. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY');
    }

    if (!config.cognito.userPoolId) {
      throw new Error('Cognito configuration missing. Set VITE_COGNITO_USER_POOL_ID');
    }

    // Initialize Supabase client
    this.supabase = createClient(config.supabase.url, config.supabase.serviceKey);

    // Initialize Cognito client
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: config.cognito.region,
    });

    console.log('✅ Migration service initialized');
    console.log(`📊 Configuration:`);
    console.log(`   - Supabase URL: ${config.supabase.url}`);
    console.log(`   - Cognito User Pool: ${config.cognito.userPoolId}`);
    console.log(`   - Cognito Region: ${config.cognito.region}`);
    console.log(`   - Batch Size: ${config.migration.batchSize}`);
    console.log(`   - Dry Run: ${config.migration.dryRun}`);
    console.log(`   - Skip Existing: ${config.migration.skipExisting}`);
  }

  async exportSupabaseUsers() {
    console.log('📤 Exporting users from Supabase...');

    try {
      // Get users from Supabase Auth (requires service key)
      const { data: authUsers, error: authError } = await this.supabase.auth.admin.listUsers();

      if (authError) {
        throw new Error(`Failed to fetch Supabase auth users: ${authError.message}`);
      }

      // Get user profiles from the users table
      const { data: userProfiles, error: profileError } = await this.supabase
        .from('users')
        .select('*');

      if (profileError) {
        console.warn(`Warning: Failed to fetch user profiles: ${profileError.message}`);
      }

      // Combine auth data with profile data
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
          // Profile data from users table
          name: profile.name || authUser.user_metadata?.full_name || authUser.user_metadata?.name,
          avatarUrl: profile.avatar_url || authUser.user_metadata?.avatar_url,
          role: profile.role_id || 'user',
          department: profile.department || 'General',
          status: profile.status || 'active',
        };
      });

      this.migrationReport.totalUsers = users.length;
      console.log(`✅ Exported ${users.length} users from Supabase`);

      return users;
    } catch (error) {
      console.error('❌ Failed to export Supabase users:', error);
      throw error;
    }
  }

  async createCognitoUser(user) {
    try {
      const userAttributes = [
        { Name: 'email', Value: user.email },
        { Name: 'email_verified', Value: user.emailConfirmed ? 'true' : 'false' },
      ];

      // Add optional attributes
      if (user.name) {
        userAttributes.push({ Name: 'name', Value: user.name });
      }

      if (user.userMetadata?.given_name) {
        userAttributes.push({ Name: 'given_name', Value: user.userMetadata.given_name });
      }

      if (user.userMetadata?.family_name) {
        userAttributes.push({ Name: 'family_name', Value: user.userMetadata.family_name });
      }

      if (user.avatarUrl) {
        userAttributes.push({ Name: 'picture', Value: user.avatarUrl });
      }

      // Add custom attributes
      if (user.role) {
        userAttributes.push({ Name: 'custom:role', Value: user.role });
      }

      if (user.department) {
        userAttributes.push({ Name: 'custom:department', Value: user.department });
      }

      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: config.cognito.userPoolId,
        Username: user.email,
        UserAttributes: userAttributes,
        MessageAction: 'SUPPRESS', // Don't send welcome email
        TemporaryPassword: this.generateTemporaryPassword(),
      });

      if (!config.migration.dryRun) {
        const result = await this.cognitoClient.send(createUserCommand);
        
        // Set permanent password (users will need to reset it)
        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: config.cognito.userPoolId,
          Username: user.email,
          Password: this.generateTemporaryPassword(),
          Permanent: false, // Force password change on first login
        });

        await this.cognitoClient.send(setPasswordCommand);

        return {
          success: true,
          cognitoUserId: result.User.Username,
          message: 'User created successfully',
        };
      } else {
        return {
          success: true,
          cognitoUserId: 'dry-run-user-id',
          message: 'Dry run - user would be created',
        };
      }
    } catch (error) {
      if (error.name === 'UsernameExistsException') {
        if (config.migration.skipExisting) {
          return {
            success: true,
            skipped: true,
            message: 'User already exists - skipped',
          };
        } else {
          return {
            success: false,
            error: 'User already exists',
          };
        }
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  generateTemporaryPassword() {
    // Generate a secure temporary password
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  async migrateUsers(users) {
    console.log(`🚀 Starting migration of ${users.length} users...`);

    for (let i = 0; i < users.length; i += config.migration.batchSize) {
      const batch = users.slice(i, i + config.migration.batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / config.migration.batchSize) + 1}/${Math.ceil(users.length / config.migration.batchSize)}`);

      const batchPromises = batch.map(async (user) => {
        try {
          const result = await this.createCognitoUser(user);
          
          if (result.success) {
            if (result.skipped) {
              this.migrationReport.skippedUsers++;
              console.log(`⏭️  Skipped: ${user.email}`);
            } else {
              this.migrationReport.successfulMigrations++;
              this.migrationReport.migratedUsers.push({
                originalId: user.id,
                email: user.email,
                cognitoUserId: result.cognitoUserId,
                migratedAt: new Date().toISOString(),
              });
              console.log(`✅ Migrated: ${user.email}`);
            }
          } else {
            this.migrationReport.failedMigrations++;
            this.migrationReport.errors.push({
              email: user.email,
              error: result.error,
              timestamp: new Date().toISOString(),
            });
            console.log(`❌ Failed: ${user.email} - ${result.error}`);
          }
        } catch (error) {
          this.migrationReport.failedMigrations++;
          this.migrationReport.errors.push({
            email: user.email,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          console.log(`❌ Error: ${user.email} - ${error.message}`);
        }
      });

      await Promise.all(batchPromises);

      // Add delay between batches to avoid rate limiting
      if (i + config.migration.batchSize < users.length) {
        console.log('⏳ Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async generateMigrationReport() {
    this.migrationReport.endTime = new Date().toISOString();
    this.migrationReport.duration = new Date(this.migrationReport.endTime).getTime() - new Date(this.migrationReport.startTime).getTime();

    const reportPath = path.join(process.cwd(), config.migration.outputFile);
    await fs.writeFile(reportPath, JSON.stringify(this.migrationReport, null, 2));

    console.log('\n📊 Migration Report:');
    console.log(`   Total Users: ${this.migrationReport.totalUsers}`);
    console.log(`   Successful: ${this.migrationReport.successfulMigrations}`);
    console.log(`   Failed: ${this.migrationReport.failedMigrations}`);
    console.log(`   Skipped: ${this.migrationReport.skippedUsers}`);
    console.log(`   Duration: ${Math.round(this.migrationReport.duration / 1000)}s`);
    console.log(`   Report saved: ${reportPath}`);

    if (this.migrationReport.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.migrationReport.errors.forEach(error => {
        console.log(`   ${error.email}: ${error.error}`);
      });
    }
  }

  async createUserMappingTable() {
    if (config.migration.dryRun) {
      console.log('📝 Dry run - would create user mapping table');
      return;
    }

    try {
      // Create a mapping table in Supabase to track migrated users
      const { error } = await this.supabase.rpc('create_user_migration_mapping', {
        mappings: this.migrationReport.migratedUsers
      });

      if (error) {
        console.warn(`Warning: Failed to create user mapping table: ${error.message}`);
      } else {
        console.log('✅ Created user migration mapping table');
      }
    } catch (error) {
      console.warn(`Warning: Failed to create user mapping table: ${error.message}`);
    }
  }

  async run() {
    try {
      await this.initialize();

      // Export users from Supabase
      const users = await this.exportSupabaseUsers();

      if (users.length === 0) {
        console.log('ℹ️  No users to migrate');
        return;
      }

      // Confirm migration
      if (!config.migration.dryRun) {
        console.log(`\n⚠️  This will migrate ${users.length} users to Cognito.`);
        console.log('   Users will need to reset their passwords on first login.');
        console.log('   Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');
        
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      // Migrate users
      await this.migrateUsers(users);

      // Create user mapping table
      await this.createUserMappingTable();

      // Generate report
      await this.generateMigrationReport();

      console.log('\n🎉 Migration completed!');
      
      if (!config.migration.dryRun) {
        console.log('\n📧 Next steps:');
        console.log('1. Notify users that they need to reset their passwords');
        console.log('2. Update your application to use Cognito authentication');
        console.log('3. Test the authentication flow thoroughly');
        console.log('4. Consider running the migration validation script');
      }

    } catch (error) {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 HalluciFix User Migration: Supabase → AWS Cognito\n');

  const migrationService = new UserMigrationService();
  await migrationService.run();
}

// Handle command line execution
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { UserMigrationService };