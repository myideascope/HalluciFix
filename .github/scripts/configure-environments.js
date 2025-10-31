#!/usr/bin/env node

/**
 * GitHub Environments Configuration Script
 * 
 * This script configures GitHub repository environments with appropriate
 * protection rules, reviewers, and deployment policies.
 */

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class GitHubEnvironmentConfigurator {
  constructor(token, owner, repo) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.configPath = path.join(__dirname, '../secrets/environment-secrets.yml');
  }

  async loadConfiguration() {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      this.config = yaml.load(configContent);
      console.log('✅ Configuration loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load configuration:', error.message);
      throw error;
    }
  }

  async configureEnvironment(environmentName) {
    const envConfig = this.config[environmentName];
    if (!envConfig) {
      throw new Error(`Environment ${environmentName} not found in configuration`);
    }

    console.log(`\n🔧 Configuring ${environmentName} environment...`);

    try {
      // Create or update environment
      const environmentData = {
        wait_timer: envConfig.protection_rules?.wait_timer || 0,
        prevent_self_review: envConfig.protection_rules?.prevent_self_review || false,
        reviewers: this.formatReviewers(envConfig.protection_rules?.required_reviewers || []),
        deployment_branch_policy: this.formatDeploymentBranchPolicy(envConfig.deployment_branch_policy)
      };

      await this.octokit.rest.repos.createOrUpdateEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName,
        ...environmentData
      });

      console.log(`✅ Environment ${environmentName} configured successfully`);

      // Configure environment variables
      await this.configureEnvironmentVariables(environmentName, envConfig.variables || {});

      return true;
    } catch (error) {
      console.error(`❌ Failed to configure ${environmentName}:`, error.message);
      return false;
    }
  }

  formatReviewers(reviewers) {
    if (!reviewers || reviewers.length === 0) {
      return [];
    }

    return reviewers.map(reviewer => {
      // Assume team names for now - in real implementation, you'd need to
      // distinguish between users and teams and get their IDs
      return {
        type: 'Team',
        id: reviewer // This would need to be the actual team ID
      };
    });
  }

  formatDeploymentBranchPolicy(policy) {
    if (!policy) {
      return {
        protected_branches: false,
        custom_branch_policies: false
      };
    }

    const result = {
      protected_branches: policy.protected_branches || false,
      custom_branch_policies: !!policy.custom_branches
    };

    if (policy.custom_branches) {
      result.custom_branches = policy.custom_branches;
    }

    return result;
  }

  async configureEnvironmentVariables(environmentName, variables) {
    console.log(`  📝 Configuring variables for ${environmentName}...`);

    for (const [name, value] of Object.entries(variables)) {
      try {
        await this.octokit.rest.actions.createOrUpdateEnvironmentVariable({
          repository_id: await this.getRepositoryId(),
          environment_name: environmentName,
          variable_name: name,
          value: value
        });

        console.log(`    ✅ Variable ${name} configured`);
      } catch (error) {
        console.error(`    ❌ Failed to configure variable ${name}:`, error.message);
      }
    }
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

  async validateEnvironmentConfiguration(environmentName) {
    console.log(`\n🔍 Validating ${environmentName} environment configuration...`);

    try {
      const { data: environment } = await this.octokit.rest.repos.getEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName
      });

      const envConfig = this.config[environmentName];
      const issues = [];

      // Validate protection rules
      if (envConfig.protection_rules) {
        if (envConfig.protection_rules.wait_timer && 
            environment.protection_rules[0]?.wait_timer !== envConfig.protection_rules.wait_timer) {
          issues.push(`Wait timer mismatch: expected ${envConfig.protection_rules.wait_timer}, got ${environment.protection_rules[0]?.wait_timer}`);
        }

        if (envConfig.protection_rules.prevent_self_review !== undefined &&
            environment.protection_rules[0]?.prevent_self_review !== envConfig.protection_rules.prevent_self_review) {
          issues.push(`Prevent self review mismatch: expected ${envConfig.protection_rules.prevent_self_review}, got ${environment.protection_rules[0]?.prevent_self_review}`);
        }
      }

      // Validate deployment branch policy
      if (envConfig.deployment_branch_policy) {
        const policy = environment.deployment_branch_policy;
        if (policy.protected_branches !== envConfig.deployment_branch_policy.protected_branches) {
          issues.push(`Protected branches policy mismatch`);
        }
      }

      if (issues.length === 0) {
        console.log(`  ✅ ${environmentName} configuration is valid`);
        return true;
      } else {
        console.log(`  ⚠️ ${environmentName} configuration issues:`);
        issues.forEach(issue => console.log(`    - ${issue}`));
        return false;
      }
    } catch (error) {
      console.error(`  ❌ Failed to validate ${environmentName}:`, error.message);
      return false;
    }
  }

  async generateConfigurationReport() {
    console.log('\n📊 Generating configuration report...');

    const report = {
      timestamp: new Date().toISOString(),
      repository: `${this.owner}/${this.repo}`,
      environments: {}
    };

    for (const environmentName of ['development', 'staging', 'production']) {
      try {
        const { data: environment } = await this.octokit.rest.repos.getEnvironment({
          owner: this.owner,
          repo: this.repo,
          environment_name: environmentName
        });

        report.environments[environmentName] = {
          id: environment.id,
          url: environment.url,
          protection_rules: environment.protection_rules,
          deployment_branch_policy: environment.deployment_branch_policy,
          created_at: environment.created_at,
          updated_at: environment.updated_at
        };

        console.log(`  ✅ ${environmentName} environment documented`);
      } catch (error) {
        console.log(`  ⚠️ ${environmentName} environment not found or inaccessible`);
        report.environments[environmentName] = {
          error: error.message
        };
      }
    }

    // Save report
    const reportPath = path.join(__dirname, '../reports/environment-configuration-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 Configuration report saved to: ${reportPath}`);
    return report;
  }

  async run() {
    console.log('🚀 Starting GitHub Environments Configuration...');
    console.log(`Repository: ${this.owner}/${this.repo}`);

    try {
      // Load configuration
      await this.loadConfiguration();

      // Configure each environment
      const environments = ['development', 'staging', 'production'];
      const results = {};

      for (const env of environments) {
        results[env] = await this.configureEnvironment(env);
      }

      // Validate configurations
      console.log('\n🔍 Validating configurations...');
      const validationResults = {};
      for (const env of environments) {
        if (results[env]) {
          validationResults[env] = await this.validateEnvironmentConfiguration(env);
        }
      }

      // Generate report
      await this.generateConfigurationReport();

      // Summary
      console.log('\n📋 Configuration Summary:');
      for (const env of environments) {
        const configured = results[env] ? '✅' : '❌';
        const validated = validationResults[env] ? '✅' : '⚠️';
        console.log(`  ${env}: ${configured} Configured | ${validated} Validated`);
      }

      const allSuccessful = Object.values(results).every(result => result === true);
      if (allSuccessful) {
        console.log('\n🎉 All environments configured successfully!');
        process.exit(0);
      } else {
        console.log('\n⚠️ Some environments failed to configure properly');
        process.exit(1);
      }

    } catch (error) {
      console.error('\n💥 Configuration failed:', error.message);
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
    console.error('Usage: node configure-environments.js <owner> <repo>');
    console.error('Or set GITHUB_REPOSITORY_OWNER and GITHUB_REPOSITORY_NAME environment variables');
    process.exit(1);
  }

  const configurator = new GitHubEnvironmentConfigurator(token, owner, repo);
  configurator.run();
}

module.exports = GitHubEnvironmentConfigurator;