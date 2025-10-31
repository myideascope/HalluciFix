#!/usr/bin/env node

/**
 * Production Environment Protection Configuration Script
 * 
 * This script configures enhanced protection rules specifically for the production environment
 * including multiple reviewers, wait timers, and strict deployment policies.
 */

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

class ProductionProtectionConfigurator {
  constructor(token, owner, repo) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  async configureProductionEnvironment() {
    console.log('🔒 Configuring production environment protection rules...');

    try {
      // Enhanced production environment configuration
      const productionConfig = {
        wait_timer: 30, // 30 minutes wait time
        prevent_self_review: true,
        reviewers: [
          // Note: In real implementation, these would be actual team/user IDs
          { type: 'Team', id: 'production-approvers' },
          { type: 'Team', id: 'security-team' },
          { type: 'Team', id: 'devops-lead' }
        ],
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: true,
          custom_branches: ['main']
        }
      };

      await this.octokit.rest.repos.createOrUpdateEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: 'production',
        ...productionConfig
      });

      console.log('✅ Production environment protection rules configured');
      return true;

    } catch (error) {
      console.error('❌ Failed to configure production protection:', error.message);
      return false;
    }
  }

  async configureBranchProtectionRules() {
    console.log('🛡️ Configuring branch protection rules for production...');

    try {
      // Enhanced branch protection for main branch
      const branchProtection = {
        required_status_checks: {
          strict: true,
          checks: [
            { context: 'Unit Tests', app_id: null },
            { context: 'Integration Tests', app_id: null },
            { context: 'Security Scan', app_id: null },
            { context: 'Performance Tests', app_id: null },
            { context: 'Staging Deployment', app_id: null }
          ]
        },
        enforce_admins: true,
        required_pull_request_reviews: {
          required_approving_review_count: 3, // Require 3 approvals for production
          dismiss_stale_reviews: true,
          require_code_owner_reviews: true,
          require_last_push_approval: true
        },
        restrictions: {
          users: [],
          teams: ['production-approvers', 'security-team'],
          apps: []
        },
        required_signatures: true,
        allow_force_pushes: false,
        allow_deletions: false,
        block_creations: false,
        required_conversation_resolution: true
      };

      await this.octokit.rest.repos.updateBranchProtection({
        owner: this.owner,
        repo: this.repo,
        branch: 'main',
        ...branchProtection
      });

      console.log('✅ Branch protection rules configured for main branch');
      return true;

    } catch (error) {
      console.error('❌ Failed to configure branch protection:', error.message);
      return false;
    }
  }

  async configureRepositorySecuritySettings() {
    console.log('🔐 Configuring repository security settings...');

    try {
      // Enable security features
      const securitySettings = {
        security_and_analysis: {
          secret_scanning: { status: 'enabled' },
          secret_scanning_push_protection: { status: 'enabled' },
          dependency_graph: { status: 'enabled' },
          dependabot_security_updates: { status: 'enabled' }
        },
        vulnerability_alerts: true,
        automated_security_fixes: true
      };

      await this.octokit.rest.repos.update({
        owner: this.owner,
        repo: this.repo,
        ...securitySettings
      });

      console.log('✅ Repository security settings configured');
      return true;

    } catch (error) {
      console.error('❌ Failed to configure security settings:', error.message);
      return false;
    }
  }

  async createProductionDeploymentRules() {
    console.log('📋 Creating production deployment rules documentation...');

    const deploymentRules = `# Production Deployment Rules

## Overview
This document outlines the mandatory rules and procedures for production deployments.

## Deployment Requirements

### Pre-Deployment Checklist
- [ ] All tests pass in staging environment
- [ ] Security scan completed with no critical issues
- [ ] Performance benchmarks meet requirements
- [ ] Database migrations tested in staging
- [ ] Rollback plan documented and tested
- [ ] Monitoring and alerting configured
- [ ] Team notifications prepared

### Approval Process
1. **Security Team Approval** - Required for all production deployments
2. **DevOps Lead Approval** - Required for infrastructure changes
3. **Product Owner Approval** - Required for feature releases
4. **30-minute Wait Timer** - Mandatory cooling-off period

### Deployment Windows
- **Preferred**: Tuesday-Thursday, 10:00-16:00 UTC
- **Restricted**: Friday-Monday (emergency only)
- **Blackout**: Major holidays and known high-traffic periods

### Emergency Deployment Process
1. Incident commander authorization required
2. Abbreviated approval process (2 approvers minimum)
3. Immediate post-deployment review scheduled
4. Full retrospective within 24 hours

## Post-Deployment Requirements

### Immediate (0-15 minutes)
- [ ] Health checks pass
- [ ] Critical user journeys verified
- [ ] Error rates within normal bounds
- [ ] Performance metrics stable

### Short-term (15-60 minutes)
- [ ] Full monitoring dashboard review
- [ ] User feedback monitoring
- [ ] Support ticket volume check
- [ ] Business metrics validation

### Long-term (1-24 hours)
- [ ] Comprehensive performance analysis
- [ ] Security posture verification
- [ ] User engagement metrics review
- [ ] Financial impact assessment

## Rollback Procedures

### Automatic Rollback Triggers
- Error rate > 5% for 5 minutes
- Response time > 10 seconds for 3 minutes
- Critical service unavailability
- Security incident detection

### Manual Rollback Process
1. Incident commander decision
2. Immediate team notification
3. Rollback execution (< 5 minutes)
4. Root cause analysis initiation
5. Stakeholder communication

## Compliance and Audit

### Audit Trail Requirements
- All deployment actions logged
- Approval chain documented
- Performance metrics recorded
- Security scan results archived
- Rollback procedures tested monthly

### Compliance Checks
- SOC 2 Type II requirements
- GDPR data protection standards
- Industry-specific regulations
- Internal security policies

## Contact Information

### Emergency Contacts
- **Incident Commander**: [On-call rotation]
- **Security Team**: security@hallucifix.com
- **DevOps Lead**: devops-lead@hallucifix.com
- **Product Owner**: product@hallucifix.com

### Escalation Path
1. Team Lead → Engineering Manager
2. Engineering Manager → VP Engineering
3. VP Engineering → CTO
4. CTO → CEO (for critical incidents)

---

*This document is automatically maintained and updated with each production deployment configuration change.*
`;

    const rulesPath = path.join(__dirname, '../docs/PRODUCTION_DEPLOYMENT_RULES.md');
    fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
    fs.writeFileSync(rulesPath, deploymentRules);

    console.log('✅ Production deployment rules documentation created');
    return true;
  }

  async validateProductionConfiguration() {
    console.log('🔍 Validating production configuration...');

    try {
      // Check environment configuration
      const { data: environment } = await this.octokit.rest.repos.getEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: 'production'
      });

      const validationResults = {
        environment_exists: true,
        wait_timer_configured: false,
        prevent_self_review: false,
        reviewers_configured: false,
        branch_policy_configured: false
      };

      // Validate wait timer
      if (environment.protection_rules?.[0]?.wait_timer >= 30) {
        validationResults.wait_timer_configured = true;
        console.log('✅ Wait timer properly configured (30+ minutes)');
      } else {
        console.log('❌ Wait timer not configured or too short');
      }

      // Validate prevent self review
      if (environment.protection_rules?.[0]?.prevent_self_review === true) {
        validationResults.prevent_self_review = true;
        console.log('✅ Prevent self review enabled');
      } else {
        console.log('❌ Prevent self review not enabled');
      }

      // Validate reviewers
      if (environment.protection_rules?.[0]?.reviewers?.length >= 2) {
        validationResults.reviewers_configured = true;
        console.log('✅ Multiple reviewers configured');
      } else {
        console.log('❌ Insufficient reviewers configured');
      }

      // Validate branch policy
      if (environment.deployment_branch_policy?.protected_branches === true) {
        validationResults.branch_policy_configured = true;
        console.log('✅ Protected branches policy enabled');
      } else {
        console.log('❌ Protected branches policy not enabled');
      }

      // Check branch protection
      try {
        const { data: branchProtection } = await this.octokit.rest.repos.getBranchProtection({
          owner: this.owner,
          repo: this.repo,
          branch: 'main'
        });

        if (branchProtection.required_pull_request_reviews?.required_approving_review_count >= 2) {
          console.log('✅ Branch protection requires multiple approvals');
        } else {
          console.log('❌ Branch protection insufficient');
        }

        if (branchProtection.required_signatures === true) {
          console.log('✅ Signed commits required');
        } else {
          console.log('❌ Signed commits not required');
        }

      } catch (error) {
        console.log('❌ Branch protection not configured');
      }

      const overallValid = Object.values(validationResults).every(result => result === true);
      
      if (overallValid) {
        console.log('✅ Production configuration validation passed');
      } else {
        console.log('⚠️ Production configuration validation failed');
      }

      return overallValid;

    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      return false;
    }
  }

  async generateConfigurationReport() {
    console.log('📊 Generating production configuration report...');

    const report = {
      timestamp: new Date().toISOString(),
      repository: `${this.owner}/${this.repo}`,
      environment: 'production',
      configuration_status: 'unknown',
      protection_rules: {},
      security_settings: {},
      compliance_status: {},
      recommendations: []
    };

    try {
      // Get environment details
      const { data: environment } = await this.octokit.rest.repos.getEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: 'production'
      });

      report.protection_rules = {
        wait_timer: environment.protection_rules?.[0]?.wait_timer || 0,
        prevent_self_review: environment.protection_rules?.[0]?.prevent_self_review || false,
        reviewers_count: environment.protection_rules?.[0]?.reviewers?.length || 0,
        deployment_branch_policy: environment.deployment_branch_policy
      };

      // Get repository security settings
      const { data: repo } = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });

      report.security_settings = {
        vulnerability_alerts: repo.security_and_analysis?.secret_scanning?.status === 'enabled',
        secret_scanning: repo.security_and_analysis?.secret_scanning?.status === 'enabled',
        push_protection: repo.security_and_analysis?.secret_scanning_push_protection?.status === 'enabled',
        dependency_graph: repo.security_and_analysis?.dependency_graph?.status === 'enabled'
      };

      // Determine configuration status
      const criticalRequirements = [
        report.protection_rules.wait_timer >= 30,
        report.protection_rules.prevent_self_review === true,
        report.protection_rules.reviewers_count >= 2,
        report.security_settings.secret_scanning === true
      ];

      const passedRequirements = criticalRequirements.filter(req => req === true).length;
      const totalRequirements = criticalRequirements.length;

      if (passedRequirements === totalRequirements) {
        report.configuration_status = 'compliant';
      } else if (passedRequirements >= totalRequirements * 0.8) {
        report.configuration_status = 'mostly_compliant';
      } else {
        report.configuration_status = 'non_compliant';
      }

      // Add recommendations
      if (report.protection_rules.wait_timer < 30) {
        report.recommendations.push('Increase wait timer to at least 30 minutes for production');
      }

      if (!report.protection_rules.prevent_self_review) {
        report.recommendations.push('Enable prevent self review for production environment');
      }

      if (report.protection_rules.reviewers_count < 3) {
        report.recommendations.push('Configure at least 3 reviewers for production deployments');
      }

      if (!report.security_settings.push_protection) {
        report.recommendations.push('Enable secret scanning push protection');
      }

      // Save report
      const reportPath = path.join(__dirname, '../reports/production-configuration-report.json');
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      console.log('📄 Production configuration report saved');
      console.log(`Status: ${report.configuration_status}`);
      console.log(`Requirements met: ${passedRequirements}/${totalRequirements}`);

      return report;

    } catch (error) {
      console.error('❌ Failed to generate report:', error.message);
      report.configuration_status = 'error';
      report.error = error.message;
      return report;
    }
  }

  async run() {
    console.log('🚀 Starting Production Environment Protection Configuration...');
    console.log(`Repository: ${this.owner}/${this.repo}`);

    try {
      const results = {
        environment_configured: false,
        branch_protection_configured: false,
        security_settings_configured: false,
        documentation_created: false,
        validation_passed: false
      };

      // Configure production environment
      results.environment_configured = await this.configureProductionEnvironment();

      // Configure branch protection
      results.branch_protection_configured = await this.configureBranchProtectionRules();

      // Configure security settings
      results.security_settings_configured = await this.configureRepositorySecuritySettings();

      // Create documentation
      results.documentation_created = await this.createProductionDeploymentRules();

      // Validate configuration
      results.validation_passed = await this.validateProductionConfiguration();

      // Generate report
      const report = await this.generateConfigurationReport();

      // Summary
      console.log('\n📋 Configuration Summary:');
      console.log(`Environment Configuration: ${results.environment_configured ? '✅' : '❌'}`);
      console.log(`Branch Protection: ${results.branch_protection_configured ? '✅' : '❌'}`);
      console.log(`Security Settings: ${results.security_settings_configured ? '✅' : '❌'}`);
      console.log(`Documentation: ${results.documentation_created ? '✅' : '❌'}`);
      console.log(`Validation: ${results.validation_passed ? '✅' : '❌'}`);
      console.log(`Overall Status: ${report.configuration_status}`);

      const allSuccessful = Object.values(results).every(result => result === true);
      if (allSuccessful) {
        console.log('\n🎉 Production environment protection configured successfully!');
        process.exit(0);
      } else {
        console.log('\n⚠️ Some configuration steps failed or need attention');
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
    console.error('Usage: node configure-production-protection.js <owner> <repo>');
    console.error('Or set GITHUB_REPOSITORY_OWNER and GITHUB_REPOSITORY_NAME environment variables');
    process.exit(1);
  }

  const configurator = new ProductionProtectionConfigurator(token, owner, repo);
  configurator.run();
}

module.exports = ProductionProtectionConfigurator;