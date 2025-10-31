#!/usr/bin/env node

/**
 * Branch Protection Validation Script
 * 
 * This script validates that branch protection rules are properly configured
 * according to the security requirements for the HalluciFix repository.
 */

const { Octokit } = require('@octokit/rest');

// Configuration
const REPO_OWNER = process.env.GITHUB_REPOSITORY_OWNER || 'hallucifix';
const REPO_NAME = process.env.GITHUB_REPOSITORY_NAME || 'hallucifix';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Required configurations
const REQUIRED_CONFIG = {
  main: {
    required_status_checks: {
      strict: true,
      contexts: [
        'Unit Tests',
        'Integration Tests',
        'Security Scan',
        'Coverage Check',
        'Build',
        'Lint'
      ]
    },
    required_pull_request_reviews: {
      required_approving_review_count: 2,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true
    },
    enforce_admins: true,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true
  },
  develop: {
    required_status_checks: {
      strict: true,
      contexts: [
        'Unit Tests',
        'Integration Tests',
        'Build',
        'Lint'
      ]
    },
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false
    },
    enforce_admins: false,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true
  }
};

class BranchProtectionValidator {
  constructor() {
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }
    
    this.octokit = new Octokit({
      auth: GITHUB_TOKEN
    });
    
    this.errors = [];
    this.warnings = [];
  }

  async validateRepository() {
    console.log(`🔍 Validating repository: ${REPO_OWNER}/${REPO_NAME}`);
    
    try {
      // Check repository security settings
      await this.validateRepositorySettings();
      
      // Check branch protection rules
      await this.validateBranchProtection('main');
      await this.validateBranchProtection('develop');
      
      // Check code owners file
      await this.validateCodeOwners();
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }

  async validateRepositorySettings() {
    console.log('📋 Checking repository security settings...');
    
    try {
      const { data: repo } = await this.octokit.repos.get({
        owner: REPO_OWNER,
        repo: REPO_NAME
      });

      // Check security features
      const securityFeatures = [
        { name: 'Vulnerability alerts', enabled: repo.security_and_analysis?.advanced_security?.status === 'enabled' },
        { name: 'Secret scanning', enabled: repo.security_and_analysis?.secret_scanning?.status === 'enabled' },
        { name: 'Dependency graph', enabled: repo.has_vulnerability_alerts_enabled }
      ];

      securityFeatures.forEach(feature => {
        if (feature.enabled) {
          console.log(`  ✅ ${feature.name}: Enabled`);
        } else {
          this.errors.push(`${feature.name} is not enabled`);
          console.log(`  ❌ ${feature.name}: Disabled`);
        }
      });

      // Check merge settings
      if (!repo.allow_squash_merge) {
        this.warnings.push('Squash merge is disabled');
      }
      if (repo.allow_merge_commit) {
        this.warnings.push('Merge commits are allowed (consider disabling)');
      }
      if (!repo.delete_branch_on_merge) {
        this.warnings.push('Auto-delete head branches is disabled');
      }

    } catch (error) {
      this.errors.push(`Failed to fetch repository settings: ${error.message}`);
    }
  }

  async validateBranchProtection(branchName) {
    console.log(`🛡️  Checking branch protection for: ${branchName}`);
    
    try {
      const { data: protection } = await this.octokit.repos.getBranchProtection({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        branch: branchName
      });

      const required = REQUIRED_CONFIG[branchName];
      
      // Validate required status checks
      this.validateStatusChecks(branchName, protection, required);
      
      // Validate pull request reviews
      this.validatePullRequestReviews(branchName, protection, required);
      
      // Validate additional protections
      this.validateAdditionalProtections(branchName, protection, required);

    } catch (error) {
      if (error.status === 404) {
        this.errors.push(`Branch protection not configured for ${branchName}`);
      } else {
        this.errors.push(`Failed to fetch branch protection for ${branchName}: ${error.message}`);
      }
    }
  }

  validateStatusChecks(branchName, protection, required) {
    const statusChecks = protection.required_status_checks;
    
    if (!statusChecks) {
      this.errors.push(`${branchName}: Required status checks not configured`);
      return;
    }

    if (statusChecks.strict !== required.required_status_checks.strict) {
      this.errors.push(`${branchName}: Strict status checks should be ${required.required_status_checks.strict}`);
    }

    const missingChecks = required.required_status_checks.contexts.filter(
      check => !statusChecks.contexts.includes(check)
    );

    if (missingChecks.length > 0) {
      this.errors.push(`${branchName}: Missing required status checks: ${missingChecks.join(', ')}`);
    }

    console.log(`  ✅ Status checks configured: ${statusChecks.contexts.length} checks`);
  }

  validatePullRequestReviews(branchName, protection, required) {
    const reviews = protection.required_pull_request_reviews;
    
    if (!reviews) {
      this.errors.push(`${branchName}: Pull request reviews not configured`);
      return;
    }

    const requiredReviews = required.required_pull_request_reviews;

    if (reviews.required_approving_review_count !== requiredReviews.required_approving_review_count) {
      this.errors.push(`${branchName}: Should require ${requiredReviews.required_approving_review_count} approving reviews`);
    }

    if (reviews.dismiss_stale_reviews !== requiredReviews.dismiss_stale_reviews) {
      this.errors.push(`${branchName}: Dismiss stale reviews should be ${requiredReviews.dismiss_stale_reviews}`);
    }

    if (reviews.require_code_owner_reviews !== requiredReviews.require_code_owner_reviews) {
      this.errors.push(`${branchName}: Code owner reviews should be ${requiredReviews.require_code_owner_reviews}`);
    }

    console.log(`  ✅ Pull request reviews: ${reviews.required_approving_review_count} required`);
  }

  validateAdditionalProtections(branchName, protection, required) {
    if (protection.enforce_admins?.enabled !== required.enforce_admins) {
      this.errors.push(`${branchName}: Enforce admins should be ${required.enforce_admins}`);
    }

    if (protection.allow_force_pushes?.enabled !== required.allow_force_pushes) {
      this.errors.push(`${branchName}: Allow force pushes should be ${required.allow_force_pushes}`);
    }

    if (protection.allow_deletions?.enabled !== required.allow_deletions) {
      this.errors.push(`${branchName}: Allow deletions should be ${required.allow_deletions}`);
    }

    console.log(`  ✅ Additional protections configured`);
  }

  async validateCodeOwners() {
    console.log('👥 Checking CODEOWNERS file...');
    
    try {
      await this.octokit.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: '.github/CODEOWNERS'
      });
      
      console.log('  ✅ CODEOWNERS file exists');
    } catch (error) {
      if (error.status === 404) {
        this.errors.push('CODEOWNERS file not found');
      } else {
        this.warnings.push(`Could not validate CODEOWNERS file: ${error.message}`);
      }
    }
  }

  generateReport() {
    console.log('\n📊 Validation Report');
    console.log('===================');
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ All validations passed! Repository security is properly configured.');
      return;
    }

    if (this.errors.length > 0) {
      console.log('\n❌ Errors (must be fixed):');
      this.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings (recommended fixes):');
      this.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }

    if (this.errors.length > 0) {
      console.log('\n❌ Validation failed. Please fix the errors above.');
      process.exit(1);
    } else {
      console.log('\n✅ Validation passed with warnings. Consider addressing the warnings above.');
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new BranchProtectionValidator();
  validator.validateRepository().catch(error => {
    console.error('❌ Validation script failed:', error);
    process.exit(1);
  });
}

module.exports = BranchProtectionValidator;