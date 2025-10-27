#!/usr/bin/env node

/**
 * Apply GitHub Environment Configurations Script
 * 
 * This script applies the environment configurations defined in YAML files
 * to the actual GitHub repository environments with deployment protection rules.
 */

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class GitHubEnvironmentApplicator {
  constructor(token, owner, repo) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.environmentsPath = path.join(__dirname, '../environments');
  }

  async loadEnvironmentConfig(environmentName) {
    const configPath = path.join(this.environmentsPath, `${environmentName}.yml`);
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Environment configuration file not found: ${configPath}`);
    }

    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent);
      console.log(`✅ Loaded configuration for ${environmentName}`);
      return config;
    } catch (error) {
      console.error(`❌ Failed to load configuration for ${environmentName}:`, error.message);
      throw error;
    }
  }

  async createOrUpdateEnvironment(environmentName, config) {
    console.log(`\n🔧 Configuring ${environmentName} environment...`);

    try {
      // Prepare environment data
      const environmentData = {
        wait_timer: config.deployment?.protection_rules?.wait_timer || 0,
        prevent_self_review: config.deployment?.protection_rules?.prevent_self_review || false,
        reviewers: await this.formatReviewers(config.deployment?.protection_rules?.required_reviewers || []),
        deployment_branch_policy: this.formatDeploymentBranchPolicy(config.deployment?.deployment_branch_policy)
      };

      // Create or update the environment
      const response = await this.octokit.rest.repos.createOrUpdateEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName,
        ...environmentData
      });

      console.log(`✅ Environment ${environmentName} configured successfully`);

      // Configure environment variables
      if (config.variables) {
        await this.configureEnvironmentVariables(environmentName, config.variables);
      }

      return response.data;
    } catch (error) {
      console.error(`❌ Failed to configure ${environmentName}:`, error.message);
      throw error;
    }
  }

  async formatReviewers(reviewers) {
    if (!reviewers || reviewers.length === 0) {
      return [];
    }

    const formattedReviewers = [];

    for (const reviewer of reviewers) {
      try {
        // Try to get team information first
        try {
          const { data: team } = await this.octokit.rest.teams.getByName({
            org: this.owner,
            team_slug: reviewer
          });
          
          formattedReviewers.push({
            type: 'Team',
            id: team.id
          });
          console.log(`  ✅ Added team reviewer: ${reviewer} (ID: ${team.id})`);
        } catch (teamError) {
          // If team not found, try as user
          try {
            const { data: user } = await this.octokit.rest.users.getByUsername({
              username: reviewer
            });
            
            formattedReviewers.push({
              type: 'User',
              id: user.id
            });
            console.log(`  ✅ Added user reviewer: ${reviewer} (ID: ${user.id})`);
          } catch (userError) {
            console.warn(`  ⚠️ Reviewer not found: ${reviewer} (skipping)`);
          }
        }
      } catch (error) {
        console.warn(`  ⚠️ Failed to resolve reviewer ${reviewer}:`, error.message);
      }
    }

    return formattedReviewers;
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

    if (policy.custom_branches && policy.custom_branches.length > 0) {
      result.custom_branches = policy.custom_branches;
    }

    return result;
  }

  async configureEnvironmentVariables(environmentName, variables) {
    console.log(`  📝 Configuring variables for ${environmentName}...`);

    const repositoryId = await this.getRepositoryId();

    for (const [name, value] of Object.entries(variables)) {
      try {
        await this.octokit.rest.actions.createOrUpdateEnvironmentVariable({
          repository_id: repositoryId,
          environment_name: environmentName,
          variable_name: name,
          value: String(value)
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

  async validateEnvironmentConfiguration(environmentName, config) {
    console.log(`\n🔍 Validating ${environmentName} environment configuration...`);

    try {
      const { data: environment } = await this.octokit.rest.repos.getEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName
      });

      const issues = [];

      // Validate protection rules
      if (config.deployment?.protection_rules) {
        const protectionRules = environment.protection_rules?.[0];
        
        if (config.deployment.protection_rules.wait_timer !== undefined &&
            protectionRules?.wait_timer !== config.deployment.protection_rules.wait_timer) {
          issues.push(`Wait timer mismatch: expected ${config.deployment.protection_rules.wait_timer}, got ${protectionRules?.wait_timer}`);
        }

        if (config.deployment.protection_rules.prevent_self_review !== undefined &&
            protectionRules?.prevent_self_review !== config.deployment.protection_rules.prevent_self_review) {
          issues.push(`Prevent self review mismatch: expected ${config.deployment.protection_rules.prevent_self_review}, got ${protectionRules?.prevent_self_review}`);
        }
      }

      // Validate deployment branch policy
      if (config.deployment?.deployment_branch_policy) {
        const policy = environment.deployment_branch_policy;
        if (policy?.protected_branches !== config.deployment.deployment_branch_policy.protected_branches) {
          issues.push(`Protected branches policy mismatch`);
        }
      }

      // Validate URL
      if (config.url && environment.url !== config.url) {
        issues.push(`Environment URL mismatch: expected ${config.url}, got ${environment.url}`);
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
    console.log('\n📊 Generating environment configuration report...');

    const report = {
      timestamp: new Date().toISOString(),
      repository: `${this.owner}/${this.repo}`,
      environments: {},
      summary: {
        total_environments: 0,
        configured_environments: 0,
        failed_environments: 0
      }
    };

    const environments = ['development', 'staging', 'production'];

    for (const environmentName of environments) {
      report.summary.total_environments++;
      
      try {
        const { data: environment } = await this.octokit.rest.repos.getEnvironment({
          owner: this.owner,
          repo: this.repo,
          environment_name: environmentName
        });

        const config = await this.loadEnvironmentConfig(environmentName);

        report.environments[environmentName] = {
          status: 'configured',
          id: environment.id,
          url: environment.url,
          protection_rules: environment.protection_rules,
          deployment_branch_policy: environment.deployment_branch_policy,
          created_at: environment.created_at,
          updated_at: environment.updated_at,
          configuration: {
            auto_deploy: config.deployment?.auto_deploy,
            required_reviewers: config.deployment?.protection_rules?.required_reviewers?.length || 0,
            wait_timer: config.deployment?.protection_rules?.wait_timer || 0,
            prevent_self_review: config.deployment?.protection_rules?.prevent_self_review || false,
            variables_count: Object.keys(config.variables || {}).length,
            required_secrets_count: config.validation?.required_secrets?.length || 0
          }
        };

        report.summary.configured_environments++;
        console.log(`  ✅ ${environmentName} environment documented`);
      } catch (error) {
        console.log(`  ⚠️ ${environmentName} environment not found or inaccessible`);
        report.environments[environmentName] = {
          status: 'failed',
          error: error.message
        };
        report.summary.failed_environments++;
      }
    }

    // Save report
    const reportPath = path.join(__dirname, '../reports/environment-deployment-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 Environment deployment report saved to: ${reportPath}`);
    return report;
  }

  async createEnvironmentDocumentation() {
    console.log('\n📝 Creating environment documentation...');

    const environments = ['development', 'staging', 'production'];
    let documentation = `# GitHub Environments Configuration\n\n`;
    documentation += `This document describes the configured GitHub environments for deployment protection rules.\n\n`;
    documentation += `*Generated on: ${new Date().toISOString()}*\n\n`;

    for (const environmentName of environments) {
      try {
        const config = await this.loadEnvironmentConfig(environmentName);
        
        documentation += `## ${environmentName.charAt(0).toUpperCase() + environmentName.slice(1)} Environment\n\n`;
        documentation += `**Description:** ${config.description}\n\n`;
        documentation += `**URL:** ${config.url}\n\n`;
        
        // Deployment configuration
        documentation += `### Deployment Configuration\n\n`;
        documentation += `- **Auto Deploy:** ${config.deployment?.auto_deploy ? 'Yes' : 'No'}\n`;
        
        if (config.deployment?.protection_rules) {
          const rules = config.deployment.protection_rules;
          documentation += `- **Required Reviewers:** ${rules.required_reviewers?.join(', ') || 'None'}\n`;
          documentation += `- **Wait Timer:** ${rules.wait_timer || 0} minutes\n`;
          documentation += `- **Prevent Self Review:** ${rules.prevent_self_review ? 'Yes' : 'No'}\n`;
        }
        
        if (config.deployment?.deployment_branch_policy) {
          const policy = config.deployment.deployment_branch_policy;
          documentation += `- **Protected Branches:** ${policy.protected_branches ? 'Yes' : 'No'}\n`;
          if (policy.custom_branches) {
            documentation += `- **Allowed Branches:** ${policy.custom_branches.join(', ')}\n`;
          }
        }
        
        // Access control
        if (config.access_control) {
          documentation += `\n### Access Control\n\n`;
          documentation += `- **Admin Access:** ${config.access_control.admin_access?.join(', ') || 'None'}\n`;
          documentation += `- **Write Access:** ${config.access_control.write_access?.join(', ') || 'None'}\n`;
          documentation += `- **Read Access:** ${config.access_control.read_access?.join(', ') || 'None'}\n`;
        }
        
        // Variables
        if (config.variables) {
          documentation += `\n### Environment Variables\n\n`;
          for (const [name, value] of Object.entries(config.variables)) {
            documentation += `- **${name}:** \`${value}\`\n`;
          }
        }
        
        // Validation
        if (config.validation) {
          documentation += `\n### Validation Requirements\n\n`;
          if (config.validation.required_secrets) {
            documentation += `**Required Secrets:** ${config.validation.required_secrets.length}\n`;
            config.validation.required_secrets.forEach(secret => {
              documentation += `- ${secret}\n`;
            });
          }
          if (config.validation.optional_secrets) {
            documentation += `\n**Optional Secrets:** ${config.validation.optional_secrets.length}\n`;
            config.validation.optional_secrets.forEach(secret => {
              documentation += `- ${secret}\n`;
            });
          }
        }
        
        documentation += `\n---\n\n`;
      } catch (error) {
        console.warn(`⚠️ Failed to document ${environmentName}:`, error.message);
        documentation += `## ${environmentName.charAt(0).toUpperCase() + environmentName.slice(1)} Environment\n\n`;
        documentation += `*Configuration not available*\n\n---\n\n`;
      }
    }

    // Save documentation
    const docPath = path.join(__dirname, '../ENVIRONMENT_DEPLOYMENT_PROTECTION.md');
    fs.writeFileSync(docPath, documentation);
    
    console.log(`📄 Environment documentation saved to: ${docPath}`);
    return documentation;
  }

  async run() {
    console.log('🚀 Starting GitHub Environment Configuration Application...');
    console.log(`Repository: ${this.owner}/${this.repo}`);

    try {
      const environments = ['development', 'staging', 'production'];
      const results = {};
      const validationResults = {};

      // Load and apply configurations
      for (const env of environments) {
        try {
          console.log(`\n📋 Processing ${env} environment...`);
          
          // Load configuration
          const config = await this.loadEnvironmentConfig(env);
          
          // Apply configuration
          await this.createOrUpdateEnvironment(env, config);
          results[env] = true;
          
          // Validate configuration
          validationResults[env] = await this.validateEnvironmentConfiguration(env, config);
          
        } catch (error) {
          console.error(`❌ Failed to process ${env}:`, error.message);
          results[env] = false;
          validationResults[env] = false;
        }
      }

      // Generate report and documentation
      await this.generateConfigurationReport();
      await this.createEnvironmentDocumentation();

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
        console.log('\n📝 Next steps:');
        console.log('1. Review the generated documentation');
        console.log('2. Configure repository secrets for each environment');
        console.log('3. Test deployment workflows');
        console.log('4. Set up monitoring and alerting');
        
        process.exit(0);
      } else {
        console.log('\n⚠️ Some environments failed to configure properly');
        console.log('Please review the errors above and retry');
        process.exit(1);
      }

    } catch (error) {
      console.error('\n💥 Configuration application failed:', error.message);
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
    console.error('Usage: node apply-environment-configurations.js <owner> <repo>');
    console.error('Or set GITHUB_REPOSITORY_OWNER and GITHUB_REPOSITORY_NAME environment variables');
    process.exit(1);
  }

  const applicator = new GitHubEnvironmentApplicator(token, owner, repo);
  applicator.run();
}

module.exports = GitHubEnvironmentApplicator;