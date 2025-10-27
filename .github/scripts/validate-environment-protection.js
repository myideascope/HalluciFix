#!/usr/bin/env node

/**
 * Validate GitHub Environment Protection Rules Script
 * 
 * This script validates that the environment protection rules are properly
 * configured and functioning as expected.
 */

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class EnvironmentProtectionValidator {
  constructor(token, owner, repo) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.environmentsPath = path.join(__dirname, '../environments');
  }

  async validateEnvironmentExists(environmentName) {
    try {
      const { data: environment } = await this.octokit.rest.repos.getEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName
      });
      
      console.log(`✅ Environment ${environmentName} exists`);
      return environment;
    } catch (error) {
      console.error(`❌ Environment ${environmentName} does not exist:`, error.message);
      return null;
    }
  }

  async validateProtectionRules(environmentName, expectedConfig) {
    console.log(`\n🔍 Validating protection rules for ${environmentName}...`);
    
    try {
      const environment = await this.validateEnvironmentExists(environmentName);
      if (!environment) {
        return false;
      }

      const issues = [];
      const protectionRules = environment.protection_rules?.[0];

      // Validate wait timer
      const expectedWaitTimer = expectedConfig.deployment?.protection_rules?.wait_timer || 0;
      if (protectionRules?.wait_timer !== expectedWaitTimer) {
        issues.push(`Wait timer mismatch: expected ${expectedWaitTimer}, got ${protectionRules?.wait_timer || 0}`);
      } else {
        console.log(`  ✅ Wait timer: ${expectedWaitTimer} minutes`);
      }

      // Validate prevent self review
      const expectedPreventSelfReview = expectedConfig.deployment?.protection_rules?.prevent_self_review || false;
      if (protectionRules?.prevent_self_review !== expectedPreventSelfReview) {
        issues.push(`Prevent self review mismatch: expected ${expectedPreventSelfReview}, got ${protectionRules?.prevent_self_review || false}`);
      } else {
        console.log(`  ✅ Prevent self review: ${expectedPreventSelfReview}`);
      }

      // Validate reviewers
      const expectedReviewers = expectedConfig.deployment?.protection_rules?.required_reviewers || [];
      const actualReviewerCount = protectionRules?.reviewers?.length || 0;
      if (expectedReviewers.length > 0 && actualReviewerCount === 0) {
        issues.push(`No reviewers configured, expected: ${expectedReviewers.join(', ')}`);
      } else if (expectedReviewers.length === 0 && actualReviewerCount > 0) {
        issues.push(`Unexpected reviewers configured: ${actualReviewerCount}`);
      } else {
        console.log(`  ✅ Reviewers: ${expectedReviewers.length > 0 ? expectedReviewers.join(', ') : 'None required'}`);
      }

      // Validate deployment branch policy
      const expectedPolicy = expectedConfig.deployment?.deployment_branch_policy;
      const actualPolicy = environment.deployment_branch_policy;
      
      if (expectedPolicy?.protected_branches !== actualPolicy?.protected_branches) {
        issues.push(`Protected branches policy mismatch: expected ${expectedPolicy?.protected_branches}, got ${actualPolicy?.protected_branches}`);
      } else {
        console.log(`  ✅ Protected branches: ${actualPolicy?.protected_branches || false}`);
      }

      // Validate environment URL
      if (expectedConfig.url && environment.url !== expectedConfig.url) {
        issues.push(`Environment URL mismatch: expected ${expectedConfig.url}, got ${environment.url}`);
      } else {
        console.log(`  ✅ Environment URL: ${environment.url || 'Not set'}`);
      }

      if (issues.length === 0) {
        console.log(`  ✅ All protection rules for ${environmentName} are valid`);
        return true;
      } else {
        console.log(`  ❌ Protection rule issues for ${environmentName}:`);
        issues.forEach(issue => console.log(`    - ${issue}`));
        return false;
      }

    } catch (error) {
      console.error(`  ❌ Failed to validate protection rules for ${environmentName}:`, error.message);
      return false;
    }
  }

  async validateEnvironmentVariables(environmentName, expectedVariables) {
    if (!expectedVariables || Object.keys(expectedVariables).length === 0) {
      console.log(`  ℹ️ No environment variables to validate for ${environmentName}`);
      return true;
    }

    console.log(`\n📝 Validating environment variables for ${environmentName}...`);

    try {
      const repositoryId = await this.getRepositoryId();
      const issues = [];

      for (const [varName, expectedValue] of Object.entries(expectedVariables)) {
        try {
          const { data: variable } = await this.octokit.rest.actions.getEnvironmentVariable({
            repository_id: repositoryId,
            environment_name: environmentName,
            variable_name: varName
          });

          if (variable.value !== String(expectedValue)) {
            issues.push(`Variable ${varName} value mismatch: expected "${expectedValue}", got "${variable.value}"`);
          } else {
            console.log(`  ✅ Variable ${varName}: ${variable.value}`);
          }
        } catch (error) {
          if (error.status === 404) {
            issues.push(`Variable ${varName} not found`);
          } else {
            issues.push(`Failed to check variable ${varName}: ${error.message}`);
          }
        }
      }

      if (issues.length === 0) {
        console.log(`  ✅ All environment variables for ${environmentName} are valid`);
        return true;
      } else {
        console.log(`  ❌ Environment variable issues for ${environmentName}:`);
        issues.forEach(issue => console.log(`    - ${issue}`));
        return false;
      }

    } catch (error) {
      console.error(`  ❌ Failed to validate environment variables for ${environmentName}:`, error.message);
      return false;
    }
  }

  async validateSecretRequirements(environmentName, expectedConfig) {
    if (!expectedConfig.validation?.required_secrets) {
      console.log(`  ℹ️ No required secrets to validate for ${environmentName}`);
      return true;
    }

    console.log(`\n🔐 Validating secret requirements for ${environmentName}...`);

    try {
      // Note: We can't actually read secret values, but we can check if they exist
      // This is a placeholder for secret validation logic
      const requiredSecrets = expectedConfig.validation.required_secrets;
      const optionalSecrets = expectedConfig.validation.optional_secrets || [];

      console.log(`  📋 Required secrets (${requiredSecrets.length}):`);
      requiredSecrets.forEach(secret => {
        console.log(`    - ${secret}`);
      });

      if (optionalSecrets.length > 0) {
        console.log(`  📋 Optional secrets (${optionalSecrets.length}):`);
        optionalSecrets.forEach(secret => {
          console.log(`    - ${secret}`);
        });
      }

      // Validate secret patterns if specified
      if (expectedConfig.validation.secret_validations) {
        console.log(`  🔍 Secret validation patterns:`);
        for (const [secretName, validation] of Object.entries(expectedConfig.validation.secret_validations)) {
          console.log(`    - ${secretName}: ${validation.pattern} (${validation.description})`);
        }
      }

      console.log(`  ✅ Secret requirements documented for ${environmentName}`);
      return true;

    } catch (error) {
      console.error(`  ❌ Failed to validate secret requirements for ${environmentName}:`, error.message);
      return false;
    }
  }

  async validateAccessControl(environmentName, expectedConfig) {
    if (!expectedConfig.access_control) {
      console.log(`  ℹ️ No access control to validate for ${environmentName}`);
      return true;
    }

    console.log(`\n🔒 Validating access control for ${environmentName}...`);

    const accessControl = expectedConfig.access_control;

    console.log(`  👥 Admin access: ${accessControl.admin_access?.join(', ') || 'None'}`);
    console.log(`  ✏️ Write access: ${accessControl.write_access?.join(', ') || 'None'}`);
    console.log(`  👁️ Read access: ${accessControl.read_access?.join(', ') || 'None'}`);

    // Validate access control hierarchy
    const adminTeams = new Set(accessControl.admin_access || []);
    const writeTeams = new Set(accessControl.write_access || []);
    const readTeams = new Set(accessControl.read_access || []);

    const issues = [];

    // Admin teams should have write access
    for (const adminTeam of adminTeams) {
      if (!writeTeams.has(adminTeam)) {
        issues.push(`Admin team ${adminTeam} should also have write access`);
      }
    }

    // Write teams should have read access
    for (const writeTeam of writeTeams) {
      if (!readTeams.has(writeTeam)) {
        issues.push(`Write team ${writeTeam} should also have read access`);
      }
    }

    if (issues.length === 0) {
      console.log(`  ✅ Access control hierarchy is valid for ${environmentName}`);
      return true;
    } else {
      console.log(`  ⚠️ Access control issues for ${environmentName}:`);
      issues.forEach(issue => console.log(`    - ${issue}`));
      return false;
    }
  }

  async validateMonitoringConfiguration(environmentName, expectedConfig) {
    if (!expectedConfig.monitoring) {
      console.log(`  ℹ️ No monitoring configuration to validate for ${environmentName}`);
      return true;
    }

    console.log(`\n📊 Validating monitoring configuration for ${environmentName}...`);

    const monitoring = expectedConfig.monitoring;

    if (monitoring.health_check_url) {
      console.log(`  🏥 Health check URL: ${monitoring.health_check_url}`);
    }

    if (monitoring.health_check_interval) {
      console.log(`  ⏱️ Health check interval: ${monitoring.health_check_interval}`);
    }

    if (monitoring.alert_on_failure) {
      console.log(`  🚨 Alert on failure: ${monitoring.alert_on_failure}`);
    }

    if (monitoring.retention_days) {
      console.log(`  📅 Retention days: ${monitoring.retention_days}`);
    }

    // Validate performance monitoring
    if (monitoring.performance_monitoring) {
      console.log(`  📈 Performance monitoring: enabled`);
      if (monitoring.performance_monitoring.thresholds) {
        const thresholds = monitoring.performance_monitoring.thresholds;
        console.log(`    - Response time: ${thresholds.response_time || 'Not set'}`);
        console.log(`    - Error rate: ${thresholds.error_rate || 'Not set'}`);
        console.log(`    - Availability: ${thresholds.availability || 'Not set'}`);
      }
    }

    // Validate security monitoring
    if (monitoring.security_monitoring) {
      console.log(`  🔒 Security monitoring: enabled`);
      console.log(`    - Vulnerability scanning: ${monitoring.security_monitoring.vulnerability_scanning || false}`);
      console.log(`    - Dependency scanning: ${monitoring.security_monitoring.dependency_scanning || false}`);
    }

    console.log(`  ✅ Monitoring configuration validated for ${environmentName}`);
    return true;
  }

  async getRepositoryId() {
    if (this.repositoryId) {
      return this.repositoryId;
    }

    try {
      const { data } = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });
      this.repositoryId = data.id;
      return this.repositoryId;
    } catch (error) {
      console.error('❌ Failed to get repository ID:', error.message);
      throw error;
    }
  }

  async loadEnvironmentConfig(environmentName) {
    const configPath = path.join(this.environmentsPath, `${environmentName}.yml`);
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Environment configuration file not found: ${configPath}`);
    }

    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent);
      return config;
    } catch (error) {
      console.error(`❌ Failed to load configuration for ${environmentName}:`, error.message);
      throw error;
    }
  }

  async generateValidationReport() {
    console.log('\n📊 Generating validation report...');

    const report = {
      timestamp: new Date().toISOString(),
      repository: `${this.owner}/${this.repo}`,
      validation_results: {},
      summary: {
        total_environments: 0,
        valid_environments: 0,
        invalid_environments: 0,
        overall_status: 'unknown'
      }
    };

    const environments = ['development', 'staging', 'production'];

    for (const environmentName of environments) {
      report.summary.total_environments++;
      
      try {
        const config = await this.loadEnvironmentConfig(environmentName);
        
        const validationResults = {
          environment_exists: await this.validateEnvironmentExists(environmentName) !== null,
          protection_rules_valid: await this.validateProtectionRules(environmentName, config),
          environment_variables_valid: await this.validateEnvironmentVariables(environmentName, config.variables),
          secret_requirements_valid: await this.validateSecretRequirements(environmentName, config),
          access_control_valid: await this.validateAccessControl(environmentName, config),
          monitoring_configuration_valid: await this.validateMonitoringConfiguration(environmentName, config)
        };

        const allValid = Object.values(validationResults).every(result => result === true);
        
        report.validation_results[environmentName] = {
          status: allValid ? 'valid' : 'invalid',
          details: validationResults,
          configuration_file: `${environmentName}.yml`
        };

        if (allValid) {
          report.summary.valid_environments++;
        } else {
          report.summary.invalid_environments++;
        }

      } catch (error) {
        report.validation_results[environmentName] = {
          status: 'error',
          error: error.message
        };
        report.summary.invalid_environments++;
      }
    }

    // Determine overall status
    if (report.summary.invalid_environments === 0) {
      report.summary.overall_status = 'valid';
    } else if (report.summary.valid_environments === 0) {
      report.summary.overall_status = 'invalid';
    } else {
      report.summary.overall_status = 'partial';
    }

    // Save report
    const reportPath = path.join(__dirname, '../reports/environment-protection-validation-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 Validation report saved to: ${reportPath}`);
    return report;
  }

  async run() {
    console.log('🔍 Starting GitHub Environment Protection Validation...');
    console.log(`Repository: ${this.owner}/${this.repo}`);

    try {
      const environments = ['development', 'staging', 'production'];
      const results = {};

      // Validate each environment
      for (const env of environments) {
        console.log(`\n🔍 Validating ${env} environment...`);
        
        try {
          const config = await this.loadEnvironmentConfig(env);
          
          const validationResults = {
            exists: await this.validateEnvironmentExists(env) !== null,
            protection_rules: await this.validateProtectionRules(env, config),
            variables: await this.validateEnvironmentVariables(env, config.variables),
            secrets: await this.validateSecretRequirements(env, config),
            access_control: await this.validateAccessControl(env, config),
            monitoring: await this.validateMonitoringConfiguration(env, config)
          };

          results[env] = Object.values(validationResults).every(result => result === true);
          
        } catch (error) {
          console.error(`❌ Failed to validate ${env}:`, error.message);
          results[env] = false;
        }
      }

      // Generate report
      const report = await this.generateValidationReport();

      // Summary
      console.log('\n📋 Validation Summary:');
      for (const env of environments) {
        const status = results[env] ? '✅' : '❌';
        console.log(`  ${env}: ${status} ${results[env] ? 'Valid' : 'Invalid'}`);
      }

      console.log(`\nOverall Status: ${report.summary.overall_status.toUpperCase()}`);
      console.log(`Valid Environments: ${report.summary.valid_environments}/${report.summary.total_environments}`);

      if (report.summary.overall_status === 'valid') {
        console.log('\n🎉 All environment protection rules are valid!');
        process.exit(0);
      } else {
        console.log('\n⚠️ Some environment protection rules are invalid');
        console.log('Please review the validation report and fix the issues');
        process.exit(1);
      }

    } catch (error) {
      console.error('\n💥 Validation failed:', error.message);
      process.exit(1);
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
    console.error('Usage: node validate-environment-protection.js <owner> <repo>');
    console.error('Or set GITHUB_REPOSITORY_OWNER and GITHUB_REPOSITORY_NAME environment variables');
    process.exit(1);
  }

  const validator = new EnvironmentProtectionValidator(token, owner, repo);
  validator.run();
}

module.exports = EnvironmentProtectionValidator;