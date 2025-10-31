#!/usr/bin/env node

/**
 * Environment Access Control Manager
 * 
 * Manages access controls for environment-specific secrets
 * Usage: node environment-access-control.cjs [command] [environment] [options]
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class EnvironmentAccessControl {
  constructor() {
    this.configPath = path.join(__dirname, 'environment-secrets.yml');
    this.config = this.loadConfig();
    this.accessMatrix = this.config.access_control || {};
  }

  loadConfig() {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      return yaml.load(configContent);
    } catch (error) {
      console.error('Failed to load environment secrets configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Validate user access to environment secrets
   */
  validateAccess(environment, user, accessType = 'read') {
    const envAccess = this.accessMatrix[environment];
    if (!envAccess) {
      throw new Error(`Environment ${environment} not found in access control matrix`);
    }

    const accessKey = `${accessType}_access`;
    const allowedGroups = envAccess[accessKey] || [];
    
    // Check if user belongs to any allowed group
    const userGroups = this.getUserGroups(user);
    const hasAccess = allowedGroups.some(group => userGroups.includes(group));

    return {
      hasAccess,
      environment,
      user,
      accessType,
      allowedGroups,
      userGroups,
      reason: hasAccess ? 'Access granted' : `User not in required groups: ${allowedGroups.join(', ')}`
    };
  }

  /**
   * Get user groups (in real implementation, this would query GitHub API or LDAP)
   */
  getUserGroups(user) {
    // Mock implementation - in real scenario, this would query actual user groups
    const mockUserGroups = {
      'developer1': ['developers'],
      'developer2': ['developers', 'qa-team'],
      'devops1': ['devops-team', 'staging-approvers'],
      'devops-lead': ['devops-team', 'production-approvers', 'devops-lead'],
      'security1': ['security-team', 'production-approvers'],
      'admin1': ['security-team', 'devops-team', 'production-approvers', 'devops-lead']
    };

    return mockUserGroups[user] || [];
  }

  /**
   * Generate access control report for environment
   */
  generateAccessReport(environment) {
    const envAccess = this.accessMatrix[environment];
    if (!envAccess) {
      throw new Error(`Environment ${environment} not found`);
    }

    const envConfig = this.config[environment];
    const secrets = envConfig?.secrets || {};

    const report = {
      environment,
      timestamp: new Date().toISOString(),
      protection_rules: envConfig.protection_rules,
      access_control: envAccess,
      secrets_summary: {
        total_secrets: Object.keys(secrets).length,
        by_security_level: this.getSecretsBySecurityLevel(secrets),
        critical_secrets: this.getCriticalSecrets(secrets)
      },
      compliance_status: this.checkComplianceStatus(environment, envAccess, envConfig.protection_rules),
      recommendations: this.generateAccessRecommendations(environment, envAccess)
    };

    return report;
  }

  /**
   * Get secrets grouped by security level
   */
  getSecretsBySecurityLevel(secrets) {
    const levels = { low: 0, medium: 0, high: 0, critical: 0 };
    
    for (const secret of Object.values(secrets)) {
      const level = secret.security_level || 'low';
      levels[level] = (levels[level] || 0) + 1;
    }

    return levels;
  }

  /**
   * Get list of critical secrets
   */
  getCriticalSecrets(secrets) {
    return Object.entries(secrets)
      .filter(([name, config]) => config.security_level === 'critical')
      .map(([name, config]) => ({
        name,
        description: config.description,
        rotation_schedule: config.rotation_schedule
      }));
  }

  /**
   * Check compliance status for environment
   */
  checkComplianceStatus(environment, accessControl, protectionRules) {
    const issues = [];
    const warnings = [];

    // Check reviewer requirements
    const requiredReviewers = this.getRequiredReviewers(environment);
    const actualReviewers = protectionRules?.required_reviewers || [];
    
    for (const required of requiredReviewers) {
      if (!actualReviewers.includes(required)) {
        issues.push(`Missing required reviewer: ${required}`);
      }
    }

    // Check wait timer requirements
    const requiredWaitTime = this.getRequiredWaitTime(environment);
    const actualWaitTime = protectionRules?.wait_timer || 0;
    
    if (actualWaitTime < requiredWaitTime) {
      issues.push(`Wait timer ${actualWaitTime} minutes is less than required ${requiredWaitTime} minutes`);
    }

    // Check access control appropriateness
    if (environment === 'production') {
      const adminAccess = accessControl.admin_access || [];
      if (adminAccess.length < 2) {
        warnings.push('Production should have at least 2 admin access groups');
      }
      
      if (!adminAccess.includes('security-team')) {
        issues.push('Production admin access should include security-team');
      }
    }

    // Check self-review prevention for production
    if (environment === 'production' && !protectionRules?.prevent_self_review) {
      issues.push('Production should prevent self-review');
    }

    return {
      compliant: issues.length === 0,
      issues,
      warnings,
      score: Math.max(0, 100 - (issues.length * 20) - (warnings.length * 5))
    };
  }

  /**
   * Get required reviewers for environment
   */
  getRequiredReviewers(environment) {
    const reviewerMap = {
      'development': [],
      'staging': ['staging-approvers'],
      'production': ['production-approvers', 'security-team']
    };
    return reviewerMap[environment] || [];
  }

  /**
   * Get required wait time for environment
   */
  getRequiredWaitTime(environment) {
    const waitTimeMap = {
      'development': 0,
      'staging': 5,
      'production': 30
    };
    return waitTimeMap[environment] || 0;
  }

  /**
   * Generate access control recommendations
   */
  generateAccessRecommendations(environment, accessControl) {
    const recommendations = [];

    // Environment-specific recommendations
    switch (environment) {
      case 'development':
        if (!accessControl.read_access?.includes('qa-team')) {
          recommendations.push({
            priority: 'low',
            category: 'access_expansion',
            message: 'Consider adding qa-team to development read access',
            rationale: 'QA team often needs to verify development configurations'
          });
        }
        break;

      case 'staging':
        if (!accessControl.write_access?.includes('devops-team')) {
          recommendations.push({
            priority: 'medium',
            category: 'access_control',
            message: 'Ensure devops-team has write access to staging',
            rationale: 'DevOps team needs to manage staging deployments'
          });
        }
        break;

      case 'production':
        if (accessControl.read_access?.length > 3) {
          recommendations.push({
            priority: 'high',
            category: 'security',
            message: 'Consider reducing production read access groups',
            rationale: 'Production access should follow principle of least privilege'
          });
        }
        
        if (!accessControl.admin_access?.includes('devops-lead')) {
          recommendations.push({
            priority: 'high',
            category: 'governance',
            message: 'Add devops-lead to production admin access',
            rationale: 'DevOps lead should have admin access for incident response'
          });
        }
        break;
    }

    return recommendations;
  }

  /**
   * Validate secret access for specific operation
   */
  validateSecretAccess(environment, secretName, user, operation = 'read') {
    // First check environment-level access
    const envAccess = this.validateAccess(environment, user, operation);
    if (!envAccess.hasAccess) {
      return envAccess;
    }

    // Then check secret-specific requirements
    const envConfig = this.config[environment];
    const secretConfig = envConfig?.secrets?.[secretName];
    
    if (!secretConfig) {
      return {
        hasAccess: false,
        environment,
        secretName,
        user,
        operation,
        reason: `Secret ${secretName} not found in ${environment} environment`
      };
    }

    // Check security level requirements
    const securityLevel = secretConfig.security_level;
    const userGroups = this.getUserGroups(user);
    
    if (securityLevel === 'critical' && operation === 'write') {
      const criticalWriteGroups = ['security-team', 'devops-lead'];
      const hasCriticalAccess = criticalWriteGroups.some(group => userGroups.includes(group));
      
      if (!hasCriticalAccess) {
        return {
          hasAccess: false,
          environment,
          secretName,
          user,
          operation,
          securityLevel,
          reason: `Critical secret write access requires one of: ${criticalWriteGroups.join(', ')}`
        };
      }
    }

    return {
      hasAccess: true,
      environment,
      secretName,
      user,
      operation,
      securityLevel,
      reason: 'Access granted for secret operation'
    };
  }

  /**
   * Generate audit log entry
   */
  generateAuditLog(environment, secretName, user, operation, result, metadata = {}) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      environment,
      secret_name: secretName,
      user,
      operation,
      result: result ? 'success' : 'denied',
      source_ip: metadata.sourceIP || 'unknown',
      user_agent: metadata.userAgent || 'unknown',
      session_id: metadata.sessionId || 'unknown',
      justification: metadata.justification || '',
      additional_context: metadata.context || {}
    };

    // In real implementation, this would be sent to audit logging system
    console.log('AUDIT LOG:', JSON.stringify(auditEntry));
    
    return auditEntry;
  }

  /**
   * Check for access anomalies
   */
  detectAccessAnomalies(accessLogs) {
    const anomalies = [];
    const userPatterns = {};

    // Analyze access patterns
    for (const log of accessLogs) {
      const userKey = log.user;
      if (!userPatterns[userKey]) {
        userPatterns[userKey] = {
          environments: new Set(),
          operations: new Set(),
          times: [],
          ips: new Set()
        };
      }

      const pattern = userPatterns[userKey];
      pattern.environments.add(log.environment);
      pattern.operations.add(log.operation);
      pattern.times.push(new Date(log.timestamp));
      pattern.ips.add(log.source_ip);
    }

    // Detect anomalies
    for (const [user, pattern] of Object.entries(userPatterns)) {
      // Multiple IP addresses
      if (pattern.ips.size > 3) {
        anomalies.push({
          type: 'multiple_ips',
          user,
          severity: 'medium',
          details: `User accessed from ${pattern.ips.size} different IP addresses`,
          ips: Array.from(pattern.ips)
        });
      }

      // Unusual time patterns (accessing outside business hours frequently)
      const businessHourAccess = pattern.times.filter(time => {
        const hour = time.getUTCHours();
        return hour >= 9 && hour <= 17; // 9 AM to 5 PM UTC
      });
      
      if (businessHourAccess.length / pattern.times.length < 0.5 && pattern.times.length > 10) {
        anomalies.push({
          type: 'unusual_time_pattern',
          user,
          severity: 'low',
          details: `${Math.round((1 - businessHourAccess.length / pattern.times.length) * 100)}% of access outside business hours`,
          total_access: pattern.times.length,
          business_hour_access: businessHourAccess.length
        });
      }

      // Cross-environment access (development user accessing production)
      const userGroups = this.getUserGroups(user);
      const hasProductionAccess = userGroups.some(group => 
        ['security-team', 'production-approvers', 'devops-lead'].includes(group)
      );
      
      if (pattern.environments.has('production') && !hasProductionAccess) {
        anomalies.push({
          type: 'unauthorized_production_access',
          user,
          severity: 'high',
          details: 'User without production privileges accessed production secrets',
          user_groups: userGroups,
          environments: Array.from(pattern.environments)
        });
      }
    }

    return anomalies;
  }

  /**
   * Generate comprehensive security report
   */
  generateSecurityReport() {
    const environments = ['development', 'staging', 'production'];
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_environments: environments.length,
        total_secrets: 0,
        critical_secrets: 0,
        compliance_issues: 0
      },
      environments: {},
      cross_environment_analysis: {},
      security_recommendations: []
    };

    // Analyze each environment
    for (const env of environments) {
      const envReport = this.generateAccessReport(env);
      report.environments[env] = envReport;
      
      report.summary.total_secrets += envReport.secrets_summary.total_secrets;
      report.summary.critical_secrets += envReport.secrets_summary.critical_secrets.length;
      report.summary.compliance_issues += envReport.compliance_status.issues.length;
    }

    // Cross-environment analysis
    report.cross_environment_analysis = this.analyzeCrossEnvironmentSecurity();

    // Generate overall recommendations
    report.security_recommendations = this.generateOverallSecurityRecommendations(report);

    return report;
  }

  /**
   * Analyze cross-environment security
   */
  analyzeCrossEnvironmentSecurity() {
    const analysis = {
      access_escalation_paths: [],
      shared_access_groups: [],
      security_level_progression: {},
      isolation_violations: []
    };

    // Check for access escalation paths
    const environments = ['development', 'staging', 'production'];
    for (let i = 0; i < environments.length - 1; i++) {
      const currentEnv = environments[i];
      const nextEnv = environments[i + 1];
      
      const currentAccess = this.accessMatrix[currentEnv];
      const nextAccess = this.accessMatrix[nextEnv];
      
      // Find shared groups between environments
      const sharedGroups = currentAccess.write_access?.filter(group => 
        nextAccess.read_access?.includes(group)
      ) || [];
      
      if (sharedGroups.length > 0) {
        analysis.shared_access_groups.push({
          from: currentEnv,
          to: nextEnv,
          shared_groups: sharedGroups
        });
      }
    }

    return analysis;
  }

  /**
   * Generate overall security recommendations
   */
  generateOverallSecurityRecommendations(report) {
    const recommendations = [];

    // Check overall compliance score
    const avgComplianceScore = Object.values(report.environments)
      .reduce((sum, env) => sum + env.compliance_status.score, 0) / 3;

    if (avgComplianceScore < 80) {
      recommendations.push({
        priority: 'high',
        category: 'compliance',
        message: `Overall compliance score is ${avgComplianceScore.toFixed(1)}% - below recommended 80%`,
        action: 'Review and address compliance issues across all environments'
      });
    }

    // Check critical secret distribution
    const prodCriticalSecrets = report.environments.production?.secrets_summary.critical_secrets.length || 0;
    const totalCriticalSecrets = report.summary.critical_secrets;
    
    if (prodCriticalSecrets / totalCriticalSecrets < 0.6) {
      recommendations.push({
        priority: 'medium',
        category: 'security_classification',
        message: 'Consider reviewing security classifications - production should have majority of critical secrets',
        action: 'Review and update security levels for environment-specific secrets'
      });
    }

    return recommendations;
  }

  /**
   * Main execution function
   */
  async run() {
    const args = process.argv.slice(2);
    const command = args[0];
    const environment = args[1];
    const user = args[2];

    try {
      switch (command) {
        case 'validate-access':
          if (!environment || !user) {
            throw new Error('Usage: validate-access <environment> <user> [access-type]');
          }
          const accessType = args[3] || 'read';
          const result = this.validateAccess(environment, user, accessType);
          console.log(JSON.stringify(result, null, 2));
          process.exit(result.hasAccess ? 0 : 1);
          break;

        case 'validate-secret-access':
          if (!environment || !user || !args[3]) {
            throw new Error('Usage: validate-secret-access <environment> <user> <secret-name> [operation]');
          }
          const secretName = args[3];
          const operation = args[4] || 'read';
          const secretResult = this.validateSecretAccess(environment, secretName, user, operation);
          console.log(JSON.stringify(secretResult, null, 2));
          process.exit(secretResult.hasAccess ? 0 : 1);
          break;

        case 'generate-report':
          if (!environment) {
            throw new Error('Usage: generate-report <environment>');
          }
          const report = this.generateAccessReport(environment);
          console.log(JSON.stringify(report, null, 2));
          break;

        case 'security-report':
          const securityReport = this.generateSecurityReport();
          console.log(JSON.stringify(securityReport, null, 2));
          
          // Save to file
          const reportPath = path.join(__dirname, `security-report-${Date.now()}.json`);
          fs.writeFileSync(reportPath, JSON.stringify(securityReport, null, 2));
          console.error(`Security report saved to: ${reportPath}`);
          break;

        case 'audit-log':
          if (args.length < 6) {
            throw new Error('Usage: audit-log <environment> <secret-name> <user> <operation> <result> [metadata-json]');
          }
          const metadata = args[6] ? JSON.parse(args[6]) : {};
          const auditEntry = this.generateAuditLog(
            args[1], // environment
            args[2], // secret-name
            args[3], // user
            args[4], // operation
            args[5] === 'true', // result
            metadata
          );
          console.log(JSON.stringify(auditEntry, null, 2));
          break;

        case 'detect-anomalies':
          // This would typically read from actual audit logs
          console.log('Anomaly detection requires access log data');
          console.log('Usage: detect-anomalies <access-logs-file>');
          break;

        default:
          console.log('Available commands:');
          console.log('  validate-access <environment> <user> [access-type]');
          console.log('  validate-secret-access <environment> <user> <secret-name> [operation]');
          console.log('  generate-report <environment>');
          console.log('  security-report');
          console.log('  audit-log <environment> <secret-name> <user> <operation> <result> [metadata-json]');
          console.log('  detect-anomalies <access-logs-file>');
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const accessControl = new EnvironmentAccessControl();
  accessControl.run().catch(error => {
    console.error('Access control failed:', error);
    process.exit(1);
  });
}

module.exports = EnvironmentAccessControl;