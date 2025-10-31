#!/usr/bin/env node

/**
 * Environment Secret Validator
 * 
 * Validates environment-specific secrets for format, security, and compliance
 * Usage: node environment-secret-validator.cjs [environment] [validation-type]
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class EnvironmentSecretValidator {
  constructor() {
    this.configPath = path.join(__dirname, 'environment-secrets.yml');
    this.config = this.loadConfig();
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      errors: []
    };
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
   * Validate secret format according to environment-specific patterns
   */
  validateFormat(environment, secretName, secretValue) {
    const envConfig = this.config[environment];
    if (!envConfig || !envConfig.secrets[secretName]) {
      this.addError(`Secret ${secretName} not configured for ${environment} environment`);
      return false;
    }

    const secretConfig = envConfig.secrets[secretName];
    
    // Validate naming convention
    if (!this.validateNamingConvention(environment, secretName)) {
      return false;
    }

    // Validate format pattern
    if (secretConfig.validation_pattern) {
      const pattern = new RegExp(secretConfig.validation_pattern);
      if (!pattern.test(secretValue)) {
        this.addError(`Secret ${secretName} format validation failed. Expected pattern: ${secretConfig.validation_pattern}`);
        return false;
      }
    }

    // Validate security level requirements
    if (!this.validateSecurityLevel(secretConfig)) {
      return false;
    }

    this.results.passed++;
    return true;
  }

  /**
   * Validate naming convention based on environment
   */
  validateNamingConvention(environment, secretName) {
    const namingRules = this.config.validation_rules?.secret_naming?.[environment];
    if (!namingRules) {
      this.addWarning(`No naming rules defined for ${environment} environment`);
      return true;
    }

    const prefixPattern = new RegExp(namingRules.prefix_pattern);
    if (!prefixPattern.test(secretName)) {
      this.addError(`Secret ${secretName} does not match naming convention for ${environment}: ${namingRules.description}`);
      return false;
    }

    return true;
  }

  /**
   * Validate security level requirements
   */
  validateSecurityLevel(secretConfig) {
    const securityLevel = secretConfig.security_level;
    if (!securityLevel) {
      this.addWarning(`No security level defined for secret ${secretConfig.description}`);
      return true;
    }

    const securityRules = this.config.validation_rules?.security_levels?.[securityLevel];
    if (!securityRules) {
      this.addError(`Invalid security level: ${securityLevel}`);
      return false;
    }

    // Check rotation schedule compliance
    const rotationSchedule = secretConfig.rotation_schedule;
    const maxRotationDays = securityRules.max_rotation_days;
    
    if (rotationSchedule && maxRotationDays) {
      const rotationDays = this.getRotationDays(rotationSchedule);
      if (rotationDays > maxRotationDays) {
        this.addError(`Rotation schedule ${rotationSchedule} exceeds maximum ${maxRotationDays} days for security level ${securityLevel}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Convert rotation schedule to days
   */
  getRotationDays(schedule) {
    const scheduleMap = {
      'monthly': 30,
      'quarterly': 90,
      'semi-annually': 180,
      'yearly': 365,
      'as_needed': 365
    };
    return scheduleMap[schedule] || 365;
  }

  /**
   * Validate environment configuration
   */
  validateEnvironmentConfig(environment) {
    const envConfig = this.config[environment];
    if (!envConfig) {
      this.addError(`Environment ${environment} not found in configuration`);
      return false;
    }

    // Validate protection rules
    if (!this.validateProtectionRules(environment, envConfig.protection_rules)) {
      return false;
    }

    // Validate secrets configuration
    if (!envConfig.secrets || Object.keys(envConfig.secrets).length === 0) {
      this.addError(`No secrets configured for ${environment} environment`);
      return false;
    }

    // Validate each secret configuration
    let allValid = true;
    for (const [secretName, secretConfig] of Object.entries(envConfig.secrets)) {
      if (!this.validateSecretConfig(environment, secretName, secretConfig)) {
        allValid = false;
      }
    }

    return allValid;
  }

  /**
   * Validate protection rules for environment
   */
  validateProtectionRules(environment, protectionRules) {
    if (!protectionRules) {
      this.addError(`No protection rules defined for ${environment} environment`);
      return false;
    }

    // Validate required reviewers based on environment
    const expectedReviewers = this.getExpectedReviewers(environment);
    if (expectedReviewers.length > 0) {
      const actualReviewers = protectionRules.required_reviewers || [];
      const missingReviewers = expectedReviewers.filter(reviewer => !actualReviewers.includes(reviewer));
      
      if (missingReviewers.length > 0) {
        this.addError(`Missing required reviewers for ${environment}: ${missingReviewers.join(', ')}`);
        return false;
      }
    }

    // Validate wait timer requirements
    const expectedWaitTime = this.getExpectedWaitTime(environment);
    const actualWaitTime = protectionRules.wait_timer || 0;
    
    if (actualWaitTime < expectedWaitTime) {
      this.addError(`Wait timer ${actualWaitTime} minutes is less than required ${expectedWaitTime} minutes for ${environment}`);
      return false;
    }

    return true;
  }

  /**
   * Get expected reviewers for environment
   */
  getExpectedReviewers(environment) {
    const reviewerMap = {
      'development': [],
      'staging': ['staging-approvers'],
      'production': ['production-approvers', 'security-team']
    };
    return reviewerMap[environment] || [];
  }

  /**
   * Get expected wait time for environment
   */
  getExpectedWaitTime(environment) {
    const waitTimeMap = {
      'development': 0,
      'staging': 5,
      'production': 30
    };
    return waitTimeMap[environment] || 0;
  }

  /**
   * Validate individual secret configuration
   */
  validateSecretConfig(environment, secretName, secretConfig) {
    let isValid = true;

    // Required fields validation
    const requiredFields = ['description', 'required', 'security_level', 'usage'];
    for (const field of requiredFields) {
      if (!secretConfig[field]) {
        this.addError(`Secret ${secretName} missing required field: ${field}`);
        isValid = false;
      }
    }

    // Validate format and validation pattern
    if (secretConfig.format && !secretConfig.validation_pattern) {
      this.addWarning(`Secret ${secretName} has format but no validation pattern`);
    }

    // Validate security level
    const validSecurityLevels = ['low', 'medium', 'high', 'critical'];
    if (secretConfig.security_level && !validSecurityLevels.includes(secretConfig.security_level)) {
      this.addError(`Secret ${secretName} has invalid security level: ${secretConfig.security_level}`);
      isValid = false;
    }

    // Validate rotation schedule
    const validRotationSchedules = ['monthly', 'quarterly', 'semi-annually', 'yearly', 'as_needed'];
    if (secretConfig.rotation_schedule && !validRotationSchedules.includes(secretConfig.rotation_schedule)) {
      this.addError(`Secret ${secretName} has invalid rotation schedule: ${secretConfig.rotation_schedule}`);
      isValid = false;
    }

    return isValid;
  }

  /**
   * Validate cross-environment consistency
   */
  validateCrossEnvironment() {
    const environments = ['development', 'staging', 'production'];
    const secretsByType = {};

    // Group secrets by type across environments
    for (const env of environments) {
      const envConfig = this.config[env];
      if (!envConfig || !envConfig.secrets) continue;

      for (const [secretName, secretConfig] of Object.entries(envConfig.secrets)) {
        const baseType = this.getSecretBaseType(secretName);
        if (!secretsByType[baseType]) {
          secretsByType[baseType] = {};
        }
        secretsByType[baseType][env] = { name: secretName, config: secretConfig };
      }
    }

    // Validate consistency across environments
    for (const [secretType, envSecrets] of Object.entries(secretsByType)) {
      this.validateSecretTypeConsistency(secretType, envSecrets);
    }
  }

  /**
   * Get base type of secret (remove environment prefix)
   */
  getSecretBaseType(secretName) {
    return secretName.replace(/^(DEV_|STAGING_|PROD_)/, '');
  }

  /**
   * Validate consistency of secret type across environments
   */
  validateSecretTypeConsistency(secretType, envSecrets) {
    const environments = Object.keys(envSecrets);
    if (environments.length < 2) return; // No consistency check needed

    const baseConfig = envSecrets[environments[0]].config;
    
    for (let i = 1; i < environments.length; i++) {
      const env = environments[i];
      const config = envSecrets[env].config;

      // Check security level progression (should increase or stay same)
      if (!this.validateSecurityLevelProgression(baseConfig.security_level, config.security_level, env)) {
        this.addWarning(`Security level for ${secretType} may not be appropriate for ${env} environment`);
      }

      // Check rotation schedule consistency
      if (!this.validateRotationScheduleConsistency(baseConfig.rotation_schedule, config.rotation_schedule, env)) {
        this.addWarning(`Rotation schedule for ${secretType} may not be appropriate for ${env} environment`);
      }
    }
  }

  /**
   * Validate security level progression across environments
   */
  validateSecurityLevelProgression(baseLevel, currentLevel, environment) {
    const levelOrder = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
    const envOrder = { 'development': 1, 'staging': 2, 'production': 3 };

    const baseLevelNum = levelOrder[baseLevel] || 1;
    const currentLevelNum = levelOrder[currentLevel] || 1;
    const envNum = envOrder[environment] || 1;

    // Security level should generally increase with environment criticality
    return currentLevelNum >= Math.max(baseLevelNum, envNum);
  }

  /**
   * Validate rotation schedule consistency across environments
   */
  validateRotationScheduleConsistency(baseSchedule, currentSchedule, environment) {
    const scheduleOrder = { 'yearly': 1, 'semi-annually': 2, 'quarterly': 3, 'monthly': 4 };
    const envOrder = { 'development': 1, 'staging': 2, 'production': 3 };

    const baseScheduleNum = scheduleOrder[baseSchedule] || 1;
    const currentScheduleNum = scheduleOrder[currentSchedule] || 1;
    const envNum = envOrder[environment] || 1;

    // Rotation frequency should generally increase with environment criticality
    return currentScheduleNum >= Math.max(baseScheduleNum, Math.min(envNum, 3));
  }

  /**
   * Generate validation report
   */
  generateReport(environment, validationType) {
    const report = {
      timestamp: new Date().toISOString(),
      environment: environment || 'all',
      validation_type: validationType || 'comprehensive',
      summary: {
        total_checks: this.results.passed + this.results.failed,
        passed: this.results.passed,
        failed: this.results.failed,
        warnings: this.results.warnings,
        success_rate: this.results.passed / (this.results.passed + this.results.failed) * 100
      },
      errors: this.results.errors,
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  /**
   * Generate recommendations based on validation results
   */
  generateRecommendations() {
    const recommendations = [];

    if (this.results.failed > 0) {
      recommendations.push({
        priority: 'high',
        category: 'security',
        message: 'Address all validation failures before deployment',
        action: 'Review and fix configuration errors'
      });
    }

    if (this.results.warnings > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'best_practices',
        message: 'Review warnings to improve security posture',
        action: 'Consider implementing suggested improvements'
      });
    }

    if (this.results.passed > 0 && this.results.failed === 0) {
      recommendations.push({
        priority: 'low',
        category: 'maintenance',
        message: 'Configuration is valid, continue regular monitoring',
        action: 'Schedule next validation check'
      });
    }

    return recommendations;
  }

  /**
   * Add error to results
   */
  addError(message) {
    this.results.failed++;
    this.results.errors.push({
      type: 'error',
      message: message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Add warning to results
   */
  addWarning(message) {
    this.results.warnings++;
    this.results.errors.push({
      type: 'warning',
      message: message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Run validation based on command line arguments
   */
  async run() {
    const args = process.argv.slice(2);
    const environment = args[0];
    const validationType = args[1] || 'comprehensive';

    console.log(`Starting ${validationType} validation for ${environment || 'all environments'}...`);

    try {
      switch (validationType) {
        case 'format':
          await this.runFormatValidation(environment);
          break;
        case 'config':
          await this.runConfigValidation(environment);
          break;
        case 'cross-environment':
          await this.runCrossEnvironmentValidation();
          break;
        case 'comprehensive':
        default:
          await this.runComprehensiveValidation(environment);
          break;
      }

      const report = this.generateReport(environment, validationType);
      
      // Output report
      console.log('\n' + '='.repeat(60));
      console.log('VALIDATION REPORT');
      console.log('='.repeat(60));
      console.log(`Environment: ${report.environment}`);
      console.log(`Validation Type: ${report.validation_type}`);
      console.log(`Timestamp: ${report.timestamp}`);
      console.log('\nSummary:');
      console.log(`  Total Checks: ${report.summary.total_checks}`);
      console.log(`  Passed: ${report.summary.passed}`);
      console.log(`  Failed: ${report.summary.failed}`);
      console.log(`  Warnings: ${report.summary.warnings}`);
      console.log(`  Success Rate: ${report.summary.success_rate.toFixed(2)}%`);

      if (report.errors.length > 0) {
        console.log('\nIssues:');
        report.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. [${error.type.toUpperCase()}] ${error.message}`);
        });
      }

      if (report.recommendations.length > 0) {
        console.log('\nRecommendations:');
        report.recommendations.forEach((rec, index) => {
          console.log(`  ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.message}`);
          console.log(`     Action: ${rec.action}`);
        });
      }

      // Save report to file
      const reportPath = path.join(__dirname, `validation-report-${environment || 'all'}-${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\nDetailed report saved to: ${reportPath}`);

      // Exit with appropriate code
      process.exit(this.results.failed > 0 ? 1 : 0);

    } catch (error) {
      console.error('Validation failed with error:', error.message);
      process.exit(1);
    }
  }

  /**
   * Run format validation
   */
  async runFormatValidation(environment) {
    if (environment) {
      this.validateEnvironmentConfig(environment);
    } else {
      const environments = ['development', 'staging', 'production'];
      for (const env of environments) {
        this.validateEnvironmentConfig(env);
      }
    }
  }

  /**
   * Run configuration validation
   */
  async runConfigValidation(environment) {
    await this.runFormatValidation(environment);
  }

  /**
   * Run cross-environment validation
   */
  async runCrossEnvironmentValidation() {
    this.validateCrossEnvironment();
  }

  /**
   * Run comprehensive validation
   */
  async runComprehensiveValidation(environment) {
    await this.runFormatValidation(environment);
    if (!environment) {
      await this.runCrossEnvironmentValidation();
    }
  }
}

// Run validator if called directly
if (require.main === module) {
  const validator = new EnvironmentSecretValidator();
  validator.run().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

module.exports = EnvironmentSecretValidator;