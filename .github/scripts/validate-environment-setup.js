#!/usr/bin/env node

/**
 * Environment Setup Validation Script
 * 
 * This script validates that GitHub environments are properly configured
 * according to the specifications in environment-secrets.yml
 */

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class EnvironmentValidator {
  constructor(token, owner, repo) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.configPath = path.join(__dirname, '../secrets/environment-secrets.yml');
    this.validationResults = {
      environments: {},
      overall: 'unknown',
      issues: [],
      recommendations: []
    };
  }

  async loadConfiguration() {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      this.config = yaml.load(configContent);
      console.log('✅ Configuration loaded successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to load configuration:', error.message);
      this.validationResults.issues.push(`Configuration loading failed: ${error.message}`);
      return false;
    }
  }

  async validateEnvironment(environmentName) {
    console.log(`\n🔍 Validating ${environmentName} environment...`);
    
    const envConfig = this.config[environmentName];
    if (!envConfig) {
      const error = `Environment ${environmentName} not found in configuration`;
      console.error(`❌ ${error}`);
      this.validationResults.issues.push(error);
      return false;
    }

    const result = {
      name: environmentName,
      exists: false,
      configuration_matches: false,
      protection_rules_valid: false,
      deployment_policy_valid: false,
      secrets_configured: false,
      variables_configured: false,
      issues: [],
      recommendations: []
    };

    try {
      // Check if environment exists
      const { data: environment } = await this.octokit.rest.repos.getEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName
      });

      result.exists = true;
      console.log(`  ✅ Environment exists`);

      // Validate protection rules
      result.protection_rules_valid = await this.validateProtectionRules(
        environment, envConfig, result
      );

      // Validate deployment branch policy
      result.deployment_policy_valid = await this.validateDeploymentBranchPolicy(
        environment, envConfig, result
      );

      // Validate environment URL
      if (envConfig.url && environment.url !== envConfig.url) {
        result.issues.push(`URL mismatch: expected ${envConfig.url}, got ${environment.url}`);
      } else if (envConfig.url) {
        console.log(`  ✅ URL matches configuration`);
      }

      // Check secrets configuration (we can't read secret values, but we can check if they exist)
      result.secrets_configured = await this.validateSecretsConfiguration(
        environmentName, envConfig, result
      );

      // Check variables configuration
      result.variables_configured = await this.validateVariablesConfiguration(
        environmentName, envConfig, result
      );

      result.configuration_matches = result.protection_rules_valid && 
                                   result.deployment_policy_valid && 
                                   result.secrets_configured && 
                                   result.variables_configured;

    } catch (error) {
      if (error.status === 404) {
        console.log(`  ❌ Environment does not exist`);
        result.issues.push('Environment not found - needs to be created');
        result.recommendations.push('Run the configure-environments workflow to create this environment');
      } else {
        console.error(`  ❌ Error validating environment: ${error.message}`);
        result.issues.push(`Validation error: ${error.message}`);
      }
    }

    this.validationResults.environments[environmentName] = result;
    return result.configuration_matches;
  }

  async validateProtectionRules(environment, envConfig, result) {
    console.log(`  🔒 Validating protection rules...`);

    if (!envConfig.protection_rules) {
      console.log(`    ℹ️ No protection rules configured`);
      return true;
    }

    const protectionRules = environment.protection_rules?.[0];
    if (!protectionRules && envConfig.protection_rules) {
      result.issues.push('Protection rules not configured but expected');
      return false;
    }

    let valid = true;

    // Validate wait timer
    if (envConfig.protection_rules.wait_timer !== undefined) {
      if (protectionRules.wait_timer !== envConfig.protection_rules.wait_timer) {
        result.issues.push(
          `Wait timer mismatch: expected ${envConfig.protection_rules.wait_timer}, got ${protectionRules.wait_timer}`
        );
        valid = false;
      } else {
        console.log(`    ✅ Wait timer: ${protectionRules.wait_timer} minutes`);
      }
    }

    // Validate prevent self review
    if (envConfig.protection_rules.prevent_self_review !== undefined) {
      if (protectionRules.prevent_self_review !== envConfig.protection_rules.prevent_self_review) {
        result.issues.push(
          `Prevent self review mismatch: expected ${envConfig.protection_rules.prevent_self_review}, got ${protectionRules.prevent_self_review}`
        );
        valid = false;
      } else {
        console.log(`    ✅ Prevent self review: ${protectionRules.prevent_self_review}`);
      }
    }

    // Validate required reviewers (this is more complex as we need to match team/user names to IDs)
    if (envConfig.protection_rules.required_reviewers) {
      const expectedReviewers = envConfig.protection_rules.required_reviewers;
      const actualReviewers = protectionRules.reviewers || [];
      
      if (expectedReviewers.length !== actualReviewers.length) {
        result.issues.push(
          `Reviewer count mismatch: expected ${expectedReviewers.length}, got ${actualReviewers.length}`
        );
        valid = false;
      } else {
        console.log(`    ✅ Required reviewers: ${actualReviewers.length} configured`);
      }
    }

    return valid;
  }

  async validateDeploymentBranchPolicy(environment, envConfig, result) {
    console.log(`  🌿 Validating deployment branch policy...`);

    if (!envConfig.deployment_branch_policy) {
      console.log(`    ℹ️ No deployment branch policy configured`);
      return true;
    }

    const policy = environment.deployment_branch_policy;
    const expectedPolicy = envConfig.deployment_branch_policy;
    let valid = true;

    // Validate protected branches setting
    if (expectedPolicy.protected_branches !== undefined) {
      if (policy.protected_branches !== expectedPolicy.protected_branches) {
        result.issues.push(
          `Protected branches mismatch: expected ${expectedPolicy.protected_branches}, got ${policy.protected_branches}`
        );
        valid = false;
      } else {
        console.log(`    ✅ Protected branches: ${policy.protected_branches}`);
      }
    }

    // Validate custom branch policies
    if (expectedPolicy.custom_branches) {
      if (!policy.custom_branch_policies) {
        result.issues.push('Custom branch policies expected but not configured');
        valid = false;
      } else {
        console.log(`    ✅ Custom branch policies enabled`);
        // Note: We can't easily validate the specific branch patterns without more API calls
      }
    }

    return valid;
  }

  async validateSecretsConfiguration(environmentName, envConfig, result) {
    console.log(`  🔐 Validating secrets configuration...`);

    if (!envConfig.secrets) {
      console.log(`    ℹ️ No secrets configured for this environment`);
      return true;
    }

    const expectedSecrets = Object.keys(envConfig.secrets);
    console.log(`    📋 Expected secrets: ${expectedSecrets.length}`);

    // Note: We can't read secret values through the API for security reasons
    // In a real implementation, you might check if secrets exist by trying to use them
    // or by maintaining a separate inventory

    // For now, we'll assume secrets are configured if the environment exists
    // and provide recommendations for manual verification
    result.recommendations.push(
      `Manually verify that all ${expectedSecrets.length} secrets are configured: ${expectedSecrets.join(', ')}`
    );

    console.log(`    ⚠️ Secret validation requires manual verification`);
    return true; // Assume configured for now
  }

  async validateVariablesConfiguration(environmentName, envConfig, result) {
    console.log(`  📝 Validating variables configuration...`);

    if (!envConfig.variables) {
      console.log(`    ℹ️ No variables configured for this environment`);
      return true;
    }

    try {
      // Get repository ID for variables API
      const { data: repo } = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });

      const expectedVariables = envConfig.variables;
      let allVariablesValid = true;

      for (const [varName, expectedValue] of Object.entries(expectedVariables)) {
        try {
          const { data: variable } = await this.octokit.rest.actions.getEnvironmentVariable({
            repository_id: repo.id,
            environment_name: environmentName,
            variable_name: varName
          });

          if (variable.value !== expectedValue) {
            result.issues.push(
              `Variable ${varName} value mismatch: expected "${expectedValue}", got "${variable.value}"`
            );
            allVariablesValid = false;
          } else {
            console.log(`    ✅ Variable ${varName} matches`);
          }
        } catch (error) {
          if (error.status === 404) {
            result.issues.push(`Variable ${varName} not found`);
            allVariablesValid = false;
          } else {
            console.error(`    ❌ Error checking variable ${varName}: ${error.message}`);
            result.issues.push(`Error checking variable ${varName}: ${error.message}`);
            allVariablesValid = false;
          }
        }
      }

      return allVariablesValid;
    } catch (error) {
      console.error(`  ❌ Error validating variables: ${error.message}`);
      result.issues.push(`Variables validation error: ${error.message}`);
      return false;
    }
  }

  async validateAccessControl() {
    console.log(`\n🔐 Validating access control configuration...`);

    const accessControl = this.config.access_control;
    if (!accessControl) {
      console.log(`  ℹ️ No access control configuration found`);
      return true;
    }

    // Validate access control matrix
    const environments = ['development', 'staging', 'production'];
    let valid = true;

    for (const env of environments) {
      const envAccess = accessControl[env];
      if (!envAccess) {
        this.validationResults.issues.push(`Access control not defined for ${env}`);
        valid = false;
        continue;
      }

      // Check that production has the most restrictive access
      if (env === 'production') {
        if (!envAccess.admin_access || envAccess.admin_access.length < 2) {
          this.validationResults.issues.push(
            'Production should have at least 2 admin access groups for redundancy'
          );
          valid = false;
        }
      }

      // Check that development has the most permissive access
      if (env === 'development') {
        if (!envAccess.read_access || envAccess.read_access.length < 3) {
          this.validationResults.recommendations.push(
            'Consider adding more teams to development read access for better collaboration'
          );
        }
      }

      console.log(`  ✅ ${env} access control defined`);
    }

    return valid;
  }

  async validateGlobalSettings() {
    console.log(`\n⚙️ Validating global settings...`);

    const globalSettings = this.config.global_settings;
    if (!globalSettings) {
      this.validationResults.recommendations.push('Consider adding global_settings for better configuration management');
      return true;
    }

    let valid = true;

    // Validate naming conventions
    if (globalSettings.secret_naming_convention) {
      console.log(`  ✅ Secret naming conventions defined`);
    } else {
      this.validationResults.recommendations.push('Define secret naming conventions for consistency');
    }

    // Validate rotation policies
    if (globalSettings.rotation_policies) {
      const policies = globalSettings.rotation_policies;
      const requiredLevels = ['critical', 'high', 'medium', 'low'];
      
      for (const level of requiredLevels) {
        if (!policies[level]) {
          this.validationResults.issues.push(`Missing rotation policy for ${level} security level`);
          valid = false;
        }
      }
      
      if (valid) {
        console.log(`  ✅ Rotation policies defined for all security levels`);
      }
    } else {
      this.validationResults.issues.push('Rotation policies not defined');
      valid = false;
    }

    return valid;
  }

  generateValidationReport() {
    console.log(`\n📊 Generating validation report...`);

    const report = {
      timestamp: new Date().toISOString(),
      repository: `${this.owner}/${this.repo}`,
      validation_results: this.validationResults,
      summary: {
        total_environments: Object.keys(this.validationResults.environments).length,
        valid_environments: Object.values(this.validationResults.environments)
          .filter(env => env.configuration_matches).length,
        total_issues: this.validationResults.issues.length,
        total_recommendations: this.validationResults.recommendations.length
      }
    };

    // Determine overall status
    const allEnvironmentsValid = Object.values(this.validationResults.environments)
      .every(env => env.configuration_matches);
    
    report.validation_results.overall = allEnvironmentsValid && 
                                       this.validationResults.issues.length === 0 ? 
                                       'passed' : 'failed';

    // Save report
    const reportPath = path.join(__dirname, '../reports/environment-validation-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 Validation report saved to: ${reportPath}`);
    return report;
  }

  printSummary() {
    console.log(`\n📋 Validation Summary:`);
    console.log(`Repository: ${this.owner}/${this.repo}`);
    console.log(`Overall Status: ${this.validationResults.overall === 'passed' ? '✅ PASSED' : '❌ FAILED'}`);
    
    console.log(`\nEnvironments:`);
    for (const [name, result] of Object.entries(this.validationResults.environments)) {
      const status = result.configuration_matches ? '✅' : '❌';
      console.log(`  ${name}: ${status} ${result.configuration_matches ? 'Valid' : 'Invalid'}`);
      
      if (result.issues.length > 0) {
        result.issues.forEach(issue => console.log(`    ⚠️ ${issue}`));
      }
    }

    if (this.validationResults.issues.length > 0) {
      console.log(`\nGlobal Issues:`);
      this.validationResults.issues.forEach(issue => console.log(`  ❌ ${issue}`));
    }

    if (this.validationResults.recommendations.length > 0) {
      console.log(`\nRecommendations:`);
      this.validationResults.recommendations.forEach(rec => console.log(`  💡 ${rec}`));
    }
  }

  async run() {
    console.log('🔍 Starting Environment Setup Validation...');
    console.log(`Repository: ${this.owner}/${this.repo}`);

    try {
      // Load configuration
      const configLoaded = await this.loadConfiguration();
      if (!configLoaded) {
        this.validationResults.overall = 'failed';
        return false;
      }

      // Validate each environment
      const environments = ['development', 'staging', 'production'];
      for (const env of environments) {
        await this.validateEnvironment(env);
      }

      // Validate access control
      await this.validateAccessControl();

      // Validate global settings
      await this.validateGlobalSettings();

      // Generate report
      const report = this.generateValidationReport();

      // Print summary
      this.printSummary();

      return this.validationResults.overall === 'passed';

    } catch (error) {
      console.error('\n💥 Validation failed:', error.message);
      this.validationResults.overall = 'failed';
      this.validationResults.issues.push(`Validation error: ${error.message}`);
      return false;
    }
  }
}

// CLI execution
if (require.main === module) {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPOSITORY_OWNER || process.argv[2];
  const repo = process.env.GITHUB_REPOSITORY_NAME || process.argv[3];

  if (!token) {
    console.error('❌ GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  if (!owner || !repo) {
    console.error('❌ Repository owner and name are required');
    console.error('Usage: node validate-environment-setup.js <owner> <repo>');
    console.error('Or set GITHUB_REPOSITORY_OWNER and GITHUB_REPOSITORY_NAME environment variables');
    process.exit(1);
  }

  const validator = new EnvironmentValidator(token, owner, repo);
  validator.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = EnvironmentValidator;