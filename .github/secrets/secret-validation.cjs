#!/usr/bin/env node

/**
 * Secret Validation and Management Script
 * 
 * This script validates secret naming conventions, formats, and rotation compliance
 * for the HalluciFix repository secrets management system.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const SECRETS_CONFIG_PATH = '.github/secrets/repository-secrets.yml';
const ROTATION_LOG_PATH = '.github/secrets/rotation.log';

// Validation patterns for different secret types
const VALIDATION_PATTERNS = {
  // Supabase
  SUPABASE_URL: /^https:\/\/[a-z0-9]{20}\.supabase\.co$/,
  JWT_TOKEN: /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  
  // AI Services
  OPENAI_API_KEY: /^sk-(proj-)?[A-Za-z0-9]{48,}$/,
  ANTHROPIC_API_KEY: /^sk-ant-[A-Za-z0-9-]{40,}$/,
  
  // Google Services
  GOOGLE_CLIENT_ID: /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
  GOOGLE_CLIENT_SECRET: /^GOCSPX-[A-Za-z0-9_-]{28}$/,
  
  // Stripe
  STRIPE_SECRET_KEY: /^sk_(test|live)_[A-Za-z0-9]{99}$/,
  STRIPE_PUBLISHABLE_KEY: /^pk_(test|live)_[A-Za-z0-9]{99}$/,
  STRIPE_WEBHOOK_SECRET: /^whsec_[A-Za-z0-9]{32,}$/,
  
  // URLs
  HTTPS_URL: /^https:\/\/[^\/]+(\/.*)?\$/,
  SLACK_WEBHOOK: /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]{9}\/[A-Z0-9]{9}\/[A-Za-z0-9]{24}$/,
  
  // Tokens
  GITHUB_TOKEN: /^(ghp_|github_pat_)[A-Za-z0-9]{36,}$/,
  SLACK_BOT_TOKEN: /^xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]{24}$/,
  
  // Generic patterns
  UUID: /^[a-f0-9-]{36}$/,
  BASE64: /^[A-Za-z0-9+\/]+=*$/,
  ALPHANUMERIC: /^[A-Za-z0-9_-]{20,}$/
};

// Security level definitions
const SECURITY_LEVELS = {
  critical: { maxAge: 30, leadTime: 14, gracePeriod: 7 },
  high: { maxAge: 90, leadTime: 21, gracePeriod: 14 },
  medium: { maxAge: 180, leadTime: 30, gracePeriod: 30 },
  low: { maxAge: 365, leadTime: 45, gracePeriod: 60 }
};

class SecretValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.secretsConfig = null;
    this.githubSecrets = [];
  }

  async validateAll() {
    console.log('🔍 Starting comprehensive secret validation...\n');
    
    try {
      // Load configuration
      await this.loadConfiguration();
      
      // Get GitHub secrets
      await this.loadGitHubSecrets();
      
      // Run all validations
      this.validateNamingConventions();
      this.validateSecretFormats();
      this.validateRotationCompliance();
      this.validateSecretInventory();
      this.validateSecurityClassifications();
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }

  async loadConfiguration() {
    console.log('📋 Loading secrets configuration...');
    
    if (!fs.existsSync(SECRETS_CONFIG_PATH)) {
      throw new Error(`Secrets configuration not found: ${SECRETS_CONFIG_PATH}`);
    }
    
    try {
      // For this example, we'll parse YAML manually since we don't have yaml parser
      // In a real implementation, you'd use a YAML parser like 'js-yaml'
      const configContent = fs.readFileSync(SECRETS_CONFIG_PATH, 'utf8');
      this.secretsConfig = this.parseSecretsConfig(configContent);
      console.log(`  ✅ Loaded configuration for ${Object.keys(this.secretsConfig).length} secrets`);
    } catch (error) {
      throw new Error(`Failed to parse secrets configuration: ${error.message}`);
    }
  }

  parseSecretsConfig(content) {
    // Simple YAML parser for our specific format
    const secrets = {};
    const lines = content.split('\n');
    let currentSecret = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '') continue;
      
      // Check for secret name (no indentation, ends with colon)
      if (!line.startsWith(' ') && trimmed.endsWith(':')) {
        currentSecret = trimmed.slice(0, -1);
        secrets[currentSecret] = {};
        continue;
      }
      
      // Parse properties (indented lines)
      if (currentSecret && line.startsWith('  ') && trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
        secrets[currentSecret][key.trim()] = value;
      }
    }
    
    return secrets;
  }

  async loadGitHubSecrets() {
    console.log('🔐 Loading GitHub repository secrets...');
    
    try {
      const output = execSync('gh secret list --json name,updatedAt', { encoding: 'utf8' });
      this.githubSecrets = JSON.parse(output);
      console.log(`  ✅ Found ${this.githubSecrets.length} GitHub secrets`);
    } catch (error) {
      console.warn('  ⚠️  Could not load GitHub secrets (gh CLI not available or not authenticated)');
      this.githubSecrets = [];
    }
  }

  validateNamingConventions() {
    console.log('📝 Validating naming conventions...');
    
    for (const secretName of Object.keys(this.secretsConfig)) {
      // Check case convention (SCREAMING_SNAKE_CASE)
      if (!/^[A-Z][A-Z0-9_]*[A-Z0-9]$/.test(secretName)) {
        this.errors.push(`${secretName}: Must use SCREAMING_SNAKE_CASE`);
      }
      
      // Check length limits
      if (secretName.length < 5) {
        this.errors.push(`${secretName}: Name too short (minimum 5 characters)`);
      }
      if (secretName.length > 100) {
        this.errors.push(`${secretName}: Name too long (maximum 100 characters)`);
      }
      
      // Check for proper prefixes
      const validPrefixes = [
        'SUPABASE_', 'OPENAI_', 'ANTHROPIC_', 'GOOGLE_', 'STRIPE_',
        'SLACK_', 'SENTRY_', 'GITHUB_', 'DOCKER_', 'NPM_', 'VITE_'
      ];
      
      const hasValidPrefix = validPrefixes.some(prefix => secretName.startsWith(prefix));
      if (!hasValidPrefix && !secretName.includes('_')) {
        this.warnings.push(`${secretName}: Consider using a service prefix for better organization`);
      }
      
      // Check for proper suffixes
      const validSuffixes = [
        '_API_KEY', '_SECRET_KEY', '_CLIENT_ID', '_CLIENT_SECRET',
        '_WEBHOOK_URL', '_WEBHOOK_SECRET', '_TOKEN', '_URL', '_DSN'
      ];
      
      const hasValidSuffix = validSuffixes.some(suffix => secretName.endsWith(suffix));
      if (!hasValidSuffix) {
        this.warnings.push(`${secretName}: Consider using a descriptive suffix (_API_KEY, _TOKEN, etc.)`);
      }
    }
    
    console.log(`  ✅ Validated ${Object.keys(this.secretsConfig).length} secret names`);
  }

  validateSecretFormats() {
    console.log('🔍 Validating secret formats...');
    
    for (const [secretName, config] of Object.entries(this.secretsConfig)) {
      const validationPattern = config.validation_pattern;
      
      if (validationPattern) {
        try {
          const regex = new RegExp(validationPattern);
          
          // We can't validate actual secret values for security reasons
          // But we can validate the pattern syntax
          console.log(`  📋 ${secretName}: Pattern validation configured`);
        } catch (error) {
          this.errors.push(`${secretName}: Invalid validation pattern: ${validationPattern}`);
        }
      } else {
        this.warnings.push(`${secretName}: No validation pattern defined`);
      }
      
      // Validate required fields
      const requiredFields = ['description', 'scope', 'required'];
      for (const field of requiredFields) {
        if (!config[field]) {
          this.errors.push(`${secretName}: Missing required field: ${field}`);
        }
      }
      
      // Validate security level
      if (config.security_level && !SECURITY_LEVELS[config.security_level]) {
        this.errors.push(`${secretName}: Invalid security level: ${config.security_level}`);
      }
    }
    
    console.log(`  ✅ Validated format configuration for ${Object.keys(this.secretsConfig).length} secrets`);
  }

  validateRotationCompliance() {
    console.log('🔄 Validating rotation compliance...');
    
    const now = new Date();
    
    for (const [secretName, config] of Object.entries(this.secretsConfig)) {
      const githubSecret = this.githubSecrets.find(s => s.name === secretName);
      
      if (!githubSecret) {
        if (config.required === 'true') {
          this.errors.push(`${secretName}: Required secret not found in GitHub repository`);
        }
        continue;
      }
      
      const lastUpdated = new Date(githubSecret.updatedAt);
      const daysSinceUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
      
      // Determine rotation schedule
      const rotationSchedule = config.rotation_schedule || 'quarterly';
      const securityLevel = config.security_level || 'medium';
      
      let maxAge;
      switch (rotationSchedule) {
        case 'monthly': maxAge = 30; break;
        case 'quarterly': maxAge = 90; break;
        case 'semi-annually': maxAge = 180; break;
        case 'yearly': maxAge = 365; break;
        default: maxAge = SECURITY_LEVELS[securityLevel]?.maxAge || 90;
      }
      
      if (daysSinceUpdate > maxAge) {
        this.errors.push(`${secretName}: Rotation overdue (${daysSinceUpdate} days, max ${maxAge})`);
      } else if (daysSinceUpdate > maxAge * 0.8) {
        this.warnings.push(`${secretName}: Rotation due soon (${daysSinceUpdate} days, max ${maxAge})`);
      }
    }
    
    console.log(`  ✅ Validated rotation compliance for ${this.githubSecrets.length} secrets`);
  }

  validateSecretInventory() {
    console.log('📊 Validating secret inventory...');
    
    // Check for secrets in GitHub that aren't in configuration
    const configuredSecrets = new Set(Object.keys(this.secretsConfig));
    const githubSecretNames = new Set(this.githubSecrets.map(s => s.name));
    
    // Secrets in GitHub but not in config
    const undocumentedSecrets = [...githubSecretNames].filter(name => !configuredSecrets.has(name));
    for (const secretName of undocumentedSecrets) {
      this.warnings.push(`${secretName}: Found in GitHub but not documented in configuration`);
    }
    
    // Required secrets not in GitHub
    const missingSecrets = Object.entries(this.secretsConfig)
      .filter(([name, config]) => config.required === 'true' && !githubSecretNames.has(name))
      .map(([name]) => name);
    
    for (const secretName of missingSecrets) {
      this.errors.push(`${secretName}: Required secret missing from GitHub repository`);
    }
    
    console.log(`  ✅ Inventory check completed`);
    console.log(`    📋 Configured: ${configuredSecrets.size}`);
    console.log(`    🔐 In GitHub: ${githubSecretNames.size}`);
    console.log(`    ❓ Undocumented: ${undocumentedSecrets.length}`);
    console.log(`    ❌ Missing: ${missingSecrets.length}`);
  }

  validateSecurityClassifications() {
    console.log('🛡️  Validating security classifications...');
    
    const securityStats = { critical: 0, high: 0, medium: 0, low: 0, unclassified: 0 };
    
    for (const [secretName, config] of Object.entries(this.secretsConfig)) {
      const securityLevel = config.security_level || 'unclassified';
      
      if (SECURITY_LEVELS[securityLevel]) {
        securityStats[securityLevel]++;
      } else {
        securityStats.unclassified++;
        if (securityLevel !== 'unclassified') {
          this.warnings.push(`${secretName}: Unrecognized security level: ${securityLevel}`);
        }
      }
      
      // Validate security level appropriateness
      if (secretName.includes('SERVICE_ROLE') || secretName.includes('SECRET_KEY')) {
        if (securityLevel !== 'critical' && securityLevel !== 'high') {
          this.warnings.push(`${secretName}: Consider higher security classification for service keys`);
        }
      }
      
      if (secretName.includes('CLIENT_ID') || secretName.includes('PUBLISHABLE')) {
        if (securityLevel === 'critical') {
          this.warnings.push(`${secretName}: Public credentials may not need critical classification`);
        }
      }
    }
    
    console.log(`  ✅ Security classification summary:`);
    console.log(`    🔴 Critical: ${securityStats.critical}`);
    console.log(`    🟠 High: ${securityStats.high}`);
    console.log(`    🟡 Medium: ${securityStats.medium}`);
    console.log(`    🟢 Low: ${securityStats.low}`);
    console.log(`    ⚪ Unclassified: ${securityStats.unclassified}`);
  }

  generateReport() {
    console.log('\n📊 Secret Validation Report');
    console.log('='.repeat(50));
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ All validations passed! Secret management is properly configured.');
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
    
    // Generate summary statistics
    console.log('\n📈 Summary Statistics:');
    console.log(`  📋 Total secrets configured: ${Object.keys(this.secretsConfig).length}`);
    console.log(`  🔐 Secrets in GitHub: ${this.githubSecrets.length}`);
    console.log(`  ❌ Validation errors: ${this.errors.length}`);
    console.log(`  ⚠️  Validation warnings: ${this.warnings.length}`);
    
    if (this.errors.length > 0) {
      console.log('\n❌ Validation failed. Please fix the errors above.');
      process.exit(1);
    } else {
      console.log('\n✅ Validation passed with warnings. Consider addressing the warnings above.');
    }
  }

  // Utility methods for specific validations
  async validateSecretFormat(secretName, secretValue) {
    const config = this.secretsConfig[secretName];
    if (!config || !config.validation_pattern) {
      return { valid: false, error: 'No validation pattern configured' };
    }
    
    try {
      const regex = new RegExp(config.validation_pattern);
      const isValid = regex.test(secretValue);
      
      return {
        valid: isValid,
        error: isValid ? null : `Value does not match expected pattern: ${config.validation_pattern}`
      };
    } catch (error) {
      return { valid: false, error: `Invalid validation pattern: ${error.message}` };
    }
  }

  async generateRotationReport() {
    console.log('📅 Generating rotation compliance report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_secrets: Object.keys(this.secretsConfig).length,
        overdue: 0,
        due_soon: 0,
        compliant: 0
      },
      details: []
    };
    
    const now = new Date();
    
    for (const [secretName, config] of Object.entries(this.secretsConfig)) {
      const githubSecret = this.githubSecrets.find(s => s.name === secretName);
      
      if (!githubSecret) continue;
      
      const lastUpdated = new Date(githubSecret.updatedAt);
      const daysSinceUpdate = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
      
      const rotationSchedule = config.rotation_schedule || 'quarterly';
      let maxAge;
      switch (rotationSchedule) {
        case 'monthly': maxAge = 30; break;
        case 'quarterly': maxAge = 90; break;
        case 'semi-annually': maxAge = 180; break;
        case 'yearly': maxAge = 365; break;
        default: maxAge = 90;
      }
      
      let status;
      if (daysSinceUpdate > maxAge) {
        status = 'overdue';
        report.summary.overdue++;
      } else if (daysSinceUpdate > maxAge * 0.8) {
        status = 'due_soon';
        report.summary.due_soon++;
      } else {
        status = 'compliant';
        report.summary.compliant++;
      }
      
      report.details.push({
        secret_name: secretName,
        last_updated: githubSecret.updatedAt,
        days_since_update: daysSinceUpdate,
        rotation_schedule: rotationSchedule,
        max_age_days: maxAge,
        status: status,
        security_level: config.security_level || 'medium'
      });
    }
    
    // Write report to file
    const reportPath = '.github/secrets/rotation-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`  ✅ Rotation report generated: ${reportPath}`);
    console.log(`    🔴 Overdue: ${report.summary.overdue}`);
    console.log(`    🟡 Due soon: ${report.summary.due_soon}`);
    console.log(`    ✅ Compliant: ${report.summary.compliant}`);
    
    return report;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'validate';
  
  const validator = new SecretValidator();
  
  switch (command) {
    case 'validate':
      await validator.validateAll();
      break;
      
    case 'rotation-report':
      await validator.loadConfiguration();
      await validator.loadGitHubSecrets();
      await validator.generateRotationReport();
      break;
      
    case 'format-check':
      const secretName = args[1];
      const secretValue = args[2];
      if (!secretName || !secretValue) {
        console.error('Usage: node secret-validation.js format-check SECRET_NAME SECRET_VALUE');
        process.exit(1);
      }
      await validator.loadConfiguration();
      const result = await validator.validateSecretFormat(secretName, secretValue);
      if (result.valid) {
        console.log('✅ Secret format is valid');
      } else {
        console.log(`❌ Secret format is invalid: ${result.error}`);
        process.exit(1);
      }
      break;
      
    case 'help':
      console.log('Secret Validation Tool');
      console.log('');
      console.log('Commands:');
      console.log('  validate         - Run all validations');
      console.log('  rotation-report  - Generate rotation compliance report');
      console.log('  format-check     - Validate specific secret format');
      console.log('  help            - Show this help message');
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "node secret-validation.js help" for usage information');
      process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = SecretValidator;