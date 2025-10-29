#!/usr/bin/env node

/**
 * User Migration Validation Script
 * 
 * This script validates that users were successfully migrated from Supabase to Cognito
 * and checks data integrity between the two systems.
 */

const { createClient } = require('@supabase/supabase-js');
const { CognitoIdentityProviderClient, AdminGetUserCommand, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const config = {
  supabase: {
    url: process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },
  cognito: {
    userPoolId: process.env.VITE_COGNITO_USER_POOL_ID,
    region: process.env.VITE_COGNITO_REGION || 'us-east-1',
  },
  validation: {
    outputFile: 'migration-validation-report.json',
    checkSampleSize: 10, // Number of users to validate in detail
  }
};

class MigrationValidator {
  constructor() {
    this.supabase = null;
    this.cognitoClient = null;
    this.validationReport = {
      startTime: new Date().toISOString(),
      supabaseUserCount: 0,
      cognitoUserCount: 0,
      matchedUsers: 0,
      missingInCognito: [],
      extraInCognito: [],
      dataIntegrityIssues: [],
      sampleValidation: [],
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

    // Initialize clients
    this.supabase = createClient(config.supabase.url, config.supabase.serviceKey);
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: config.cognito.region,
    });

    console.log('✅ Validation service initialized');
  }

  async getSupabaseUsers() {
    console.log('📤 Fetching users from Supabase...');

    try {
      const { data: authUsers, error: authError } = await this.supabase.auth.admin.listUsers();

      if (authError) {
        throw new Error(`Failed to fetch Supabase users: ${authError.message}`);
      }

      const users = authUsers.users.map(user => ({
        id: user.id,
        email: user.email,
        emailConfirmed: user.email_confirmed_at !== null,
        createdAt: user.created_at,
        userMetadata: user.user_metadata || {},
      }));

      this.validationReport.supabaseUserCount = users.length;
      console.log(`✅ Found ${users.length} users in Supabase`);

      return users;
    } catch (error) {
      console.error('❌ Failed to fetch Supabase users:', error);
      throw error;
    }
  }

  async getCognitoUsers() {
    console.log('📥 Fetching users from Cognito...');

    try {
      const users = [];
      let paginationToken = null;

      do {
        const command = new ListUsersCommand({
          UserPoolId: config.cognito.userPoolId,
          Limit: 60, // Maximum allowed by AWS
          PaginationToken: paginationToken,
        });

        const response = await this.cognitoClient.send(command);
        
        const batchUsers = response.Users.map(user => ({
          username: user.Username,
          email: user.Attributes?.find(attr => attr.Name === 'email')?.Value,
          emailVerified: user.Attributes?.find(attr => attr.Name === 'email_verified')?.Value === 'true',
          createdAt: user.UserCreateDate,
          status: user.UserStatus,
          attributes: user.Attributes?.reduce((acc, attr) => {
            acc[attr.Name] = attr.Value;
            return acc;
          }, {}),
        }));

        users.push(...batchUsers);
        paginationToken = response.PaginationToken;

      } while (paginationToken);

      this.validationReport.cognitoUserCount = users.length;
      console.log(`✅ Found ${users.length} users in Cognito`);

      return users;
    } catch (error) {
      console.error('❌ Failed to fetch Cognito users:', error);
      throw error;
    }
  }

  async validateUserMigration(supabaseUsers, cognitoUsers) {
    console.log('🔍 Validating user migration...');

    // Create lookup maps
    const supabaseEmailMap = new Map(supabaseUsers.map(user => [user.email, user]));
    const cognitoEmailMap = new Map(cognitoUsers.map(user => [user.email, user]));

    // Find missing users in Cognito
    for (const supabaseUser of supabaseUsers) {
      if (!cognitoEmailMap.has(supabaseUser.email)) {
        this.validationReport.missingInCognito.push({
          email: supabaseUser.email,
          supabaseId: supabaseUser.id,
          createdAt: supabaseUser.createdAt,
        });
      } else {
        this.validationReport.matchedUsers++;
      }
    }

    // Find extra users in Cognito (not in Supabase)
    for (const cognitoUser of cognitoUsers) {
      if (cognitoUser.email && !supabaseEmailMap.has(cognitoUser.email)) {
        this.validationReport.extraInCognito.push({
          email: cognitoUser.email,
          cognitoUsername: cognitoUser.username,
          createdAt: cognitoUser.createdAt,
        });
      }
    }

    console.log(`✅ Matched users: ${this.validationReport.matchedUsers}`);
    console.log(`⚠️  Missing in Cognito: ${this.validationReport.missingInCognito.length}`);
    console.log(`ℹ️  Extra in Cognito: ${this.validationReport.extraInCognito.length}`);
  }

  async validateDataIntegrity(supabaseUsers, cognitoUsers) {
    console.log('🔍 Validating data integrity...');

    const cognitoEmailMap = new Map(cognitoUsers.map(user => [user.email, user]));
    
    // Sample validation for detailed checking
    const sampleUsers = supabaseUsers
      .filter(user => cognitoEmailMap.has(user.email))
      .slice(0, config.validation.checkSampleSize);

    for (const supabaseUser of sampleUsers) {
      const cognitoUser = cognitoEmailMap.get(supabaseUser.email);
      const issues = [];

      // Check email verification status
      if (supabaseUser.emailConfirmed !== cognitoUser.emailVerified) {
        issues.push({
          field: 'emailVerified',
          supabaseValue: supabaseUser.emailConfirmed,
          cognitoValue: cognitoUser.emailVerified,
        });
      }

      // Check name consistency
      const supabaseName = supabaseUser.userMetadata?.full_name || supabaseUser.userMetadata?.name;
      const cognitoName = cognitoUser.attributes?.name;
      
      if (supabaseName && cognitoName && supabaseName !== cognitoName) {
        issues.push({
          field: 'name',
          supabaseValue: supabaseName,
          cognitoValue: cognitoName,
        });
      }

      const validationResult = {
        email: supabaseUser.email,
        supabaseId: supabaseUser.id,
        cognitoUsername: cognitoUser.username,
        issues: issues,
        status: issues.length === 0 ? 'valid' : 'issues',
      };

      this.validationReport.sampleValidation.push(validationResult);

      if (issues.length > 0) {
        this.validationReport.dataIntegrityIssues.push(validationResult);
      }
    }

    console.log(`✅ Sample validation completed: ${sampleUsers.length} users checked`);
    console.log(`⚠️  Data integrity issues: ${this.validationReport.dataIntegrityIssues.length}`);
  }

  async checkCognitoUserDetails(email) {
    try {
      const command = new AdminGetUserCommand({
        UserPoolId: config.cognito.userPoolId,
        Username: email,
      });

      const response = await this.cognitoClient.send(command);
      
      return {
        username: response.Username,
        userStatus: response.UserStatus,
        enabled: response.Enabled,
        attributes: response.UserAttributes?.reduce((acc, attr) => {
          acc[attr.Name] = attr.Value;
          return acc;
        }, {}),
        mfaOptions: response.MFAOptions,
      };
    } catch (error) {
      return {
        error: error.message,
      };
    }
  }

  async generateValidationReport() {
    this.validationReport.endTime = new Date().toISOString();
    this.validationReport.duration = new Date(this.validationReport.endTime).getTime() - new Date(this.validationReport.startTime).getTime();

    // Calculate migration success rate
    const totalSupabaseUsers = this.validationReport.supabaseUserCount;
    const successfulMigrations = this.validationReport.matchedUsers;
    const migrationSuccessRate = totalSupabaseUsers > 0 ? (successfulMigrations / totalSupabaseUsers * 100).toFixed(2) : 0;

    this.validationReport.migrationSuccessRate = `${migrationSuccessRate}%`;

    const reportPath = path.join(process.cwd(), config.validation.outputFile);
    await fs.writeFile(reportPath, JSON.stringify(this.validationReport, null, 2));

    console.log('\n📊 Validation Report:');
    console.log(`   Supabase Users: ${this.validationReport.supabaseUserCount}`);
    console.log(`   Cognito Users: ${this.validationReport.cognitoUserCount}`);
    console.log(`   Matched Users: ${this.validationReport.matchedUsers}`);
    console.log(`   Migration Success Rate: ${migrationSuccessRate}%`);
    console.log(`   Missing in Cognito: ${this.validationReport.missingInCognito.length}`);
    console.log(`   Extra in Cognito: ${this.validationReport.extraInCognito.length}`);
    console.log(`   Data Integrity Issues: ${this.validationReport.dataIntegrityIssues.length}`);
    console.log(`   Duration: ${Math.round(this.validationReport.duration / 1000)}s`);
    console.log(`   Report saved: ${reportPath}`);

    // Show detailed issues if any
    if (this.validationReport.missingInCognito.length > 0) {
      console.log('\n❌ Users missing in Cognito:');
      this.validationReport.missingInCognito.slice(0, 5).forEach(user => {
        console.log(`   ${user.email} (Supabase ID: ${user.supabaseId})`);
      });
      if (this.validationReport.missingInCognito.length > 5) {
        console.log(`   ... and ${this.validationReport.missingInCognito.length - 5} more`);
      }
    }

    if (this.validationReport.dataIntegrityIssues.length > 0) {
      console.log('\n⚠️  Data integrity issues:');
      this.validationReport.dataIntegrityIssues.slice(0, 3).forEach(issue => {
        console.log(`   ${issue.email}:`);
        issue.issues.forEach(i => {
          console.log(`     ${i.field}: "${i.supabaseValue}" → "${i.cognitoValue}"`);
        });
      });
      if (this.validationReport.dataIntegrityIssues.length > 3) {
        console.log(`   ... and ${this.validationReport.dataIntegrityIssues.length - 3} more`);
      }
    }
  }

  async run() {
    try {
      await this.initialize();

      // Fetch users from both systems
      const [supabaseUsers, cognitoUsers] = await Promise.all([
        this.getSupabaseUsers(),
        this.getCognitoUsers(),
      ]);

      // Validate migration
      await this.validateUserMigration(supabaseUsers, cognitoUsers);

      // Validate data integrity
      await this.validateDataIntegrity(supabaseUsers, cognitoUsers);

      // Generate report
      await this.generateValidationReport();

      // Determine overall status
      const hasIssues = this.validationReport.missingInCognito.length > 0 || 
                       this.validationReport.dataIntegrityIssues.length > 0;

      if (hasIssues) {
        console.log('\n⚠️  Migration validation completed with issues');
        console.log('   Review the validation report for details');
        process.exit(1);
      } else {
        console.log('\n🎉 Migration validation passed!');
        console.log('   All users successfully migrated with data integrity intact');
      }

    } catch (error) {
      console.error('💥 Validation failed:', error);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  console.log('🔍 HalluciFix User Migration Validation\n');

  const validator = new MigrationValidator();
  await validator.run();
}

// Handle command line execution
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { MigrationValidator };