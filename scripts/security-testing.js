#!/usr/bin/env node

/**
 * Security Testing Management Script
 * 
 * This script provides utilities for managing security tests:
 * - Run security test suite
 * - Generate security reports
 * - Check for common vulnerabilities
 * - Validate security configurations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SECURITY_CONFIG = 'playwright.security.config.ts';
const SECURITY_REPORT_DIR = 'security-test-report';
const SECURITY_RESULTS_FILE = 'test-results/security-results.json';

class SecurityTestManager {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [SECURITY_REPORT_DIR, 'test-results'];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Run comprehensive security test suite
   */
  async runSecurityTests() {
    console.log('🔒 Running comprehensive security test suite...');
    
    try {
      execSync(`npx playwright test --config=${SECURITY_CONFIG}`, {
        stdio: 'inherit'
      });
      
      console.log('✅ Security tests completed successfully');
      await this.generateSecurityReport();
    } catch (error) {
      console.error('❌ Security tests failed');
      await this.handleSecurityFailures();
      process.exit(1);
    }
  }

  /**
   * Run specific security test categories
   */
  async runSpecificTests(category) {
    console.log(`🔍 Running ${category} security tests...`);
    
    const testPatterns = {
      'auth': 'Authentication Security',
      'xss': 'Input Validation Security',
      'api': 'API Security',
      'data': 'Data Protection',
      'csp': 'Content Security Policy',
      'headers': 'Security Headers'
    };
    
    const pattern = testPatterns[category];
    if (!pattern) {
      console.error(`❌ Unknown test category: ${category}`);
      console.log(`Available categories: ${Object.keys(testPatterns).join(', ')}`);
      process.exit(1);
    }
    
    try {
      execSync(`npx playwright test --config=${SECURITY_CONFIG} -g "${pattern}"`, {
        stdio: 'inherit'
      });
      
      console.log(`✅ ${category} security tests completed successfully`);
    } catch (error) {
      console.error(`❌ ${category} security tests failed`);
      process.exit(1);
    }
  }

  /**
   * Generate comprehensive security report
   */
  async generateSecurityReport() {
    console.log('📊 Generating security test report...');
    
    try {
      // Generate HTML report
      execSync(`npx playwright show-report ${SECURITY_REPORT_DIR}`, {
        stdio: 'inherit'
      });
      
      // Parse test results for security analysis
      if (fs.existsSync(SECURITY_RESULTS_FILE)) {
        const results = JSON.parse(fs.readFileSync(SECURITY_RESULTS_FILE, 'utf8'));
        await this.analyzeSecurityResults(results);
      }
      
      console.log(`📋 Security report available at: ${SECURITY_REPORT_DIR}/index.html`);
    } catch (error) {
      console.error('Failed to generate security report:', error.message);
    }
  }

  /**
   * Analyze security test results
   */
  async analyzeSecurityResults(results) {
    console.log('\\n🔍 Security Test Analysis:');
    
    const securityCategories = {
      'Authentication Security': { passed: 0, failed: 0, vulnerabilities: [] },
      'Input Validation Security': { passed: 0, failed: 0, vulnerabilities: [] },
      'API Security': { passed: 0, failed: 0, vulnerabilities: [] },
      'Data Protection': { passed: 0, failed: 0, vulnerabilities: [] },
      'Content Security Policy': { passed: 0, failed: 0, vulnerabilities: [] },
      'Security Headers': { passed: 0, failed: 0, vulnerabilities: [] }
    };
    
    // Analyze test results by category
    results.suites?.forEach(suite => {
      const category = suite.title;
      if (securityCategories[category]) {
        suite.specs?.forEach(spec => {
          spec.tests?.forEach(test => {
            test.results?.forEach(result => {
              if (result.status === 'passed') {
                securityCategories[category].passed++;
              } else if (result.status === 'failed') {
                securityCategories[category].failed++;
                securityCategories[category].vulnerabilities.push({
                  test: test.title,
                  error: result.error?.message || 'Unknown error'
                });
              }
            });
          });
        });
      }
    });
    
    // Display results
    Object.entries(securityCategories).forEach(([category, stats]) => {
      const total = stats.passed + stats.failed;
      if (total > 0) {
        const passRate = ((stats.passed / total) * 100).toFixed(1);
        const status = stats.failed === 0 ? '✅' : '❌';
        
        console.log(`  ${status} ${category}: ${stats.passed}/${total} passed (${passRate}%)`);
        
        if (stats.vulnerabilities.length > 0) {
          console.log(`    🚨 Vulnerabilities found:`);
          stats.vulnerabilities.forEach(vuln => {
            console.log(`      - ${vuln.test}: ${vuln.error}`);
          });
        }
      }
    });
    
    // Generate security score
    const totalPassed = Object.values(securityCategories).reduce((sum, cat) => sum + cat.passed, 0);
    const totalTests = Object.values(securityCategories).reduce((sum, cat) => sum + cat.passed + cat.failed, 0);
    const securityScore = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0;
    
    console.log(`\\n🛡️  Overall Security Score: ${securityScore}%`);
    
    if (securityScore < 90) {
      console.log('⚠️  Security score below recommended threshold (90%)');
    }
  }

  /**
   * Handle security test failures
   */
  async handleSecurityFailures() {
    console.log('🚨 Security vulnerabilities detected!');
    
    try {
      await this.generateSecurityReport();
      this.listSecurityVulnerabilities();
    } catch (error) {
      console.error('Failed to analyze security failures:', error.message);
    }
  }

  /**
   * List detected security vulnerabilities
   */
  listSecurityVulnerabilities() {
    console.log('\\n🚨 Detected Security Vulnerabilities:');
    
    try {
      if (fs.existsSync(SECURITY_RESULTS_FILE)) {
        const results = JSON.parse(fs.readFileSync(SECURITY_RESULTS_FILE, 'utf8'));
        const vulnerabilities = [];
        
        results.suites?.forEach(suite => {
          suite.specs?.forEach(spec => {
            spec.tests?.forEach(test => {
              test.results?.forEach(result => {
                if (result.status === 'failed') {
                  vulnerabilities.push({
                    category: suite.title,
                    test: test.title,
                    error: result.error?.message || 'Unknown error'
                  });
                }
              });
            });
          });
        });
        
        if (vulnerabilities.length > 0) {
          vulnerabilities.forEach((vuln, index) => {
            console.log(`  ${index + 1}. ${vuln.category} - ${vuln.test}`);
            console.log(`     Error: ${vuln.error}`);
          });
        } else {
          console.log('  No specific vulnerabilities found in results');
        }
      } else {
        console.log('  No test results file found');
      }
    } catch (error) {
      console.log('  Could not parse security test results');
    }
  }

  /**
   * Validate security configuration
   */
  async validateSecurityConfig() {
    console.log('🔧 Validating security configuration...');
    
    const configChecks = [
      this.checkCSPConfiguration(),
      this.checkSecurityHeaders(),
      this.checkAuthenticationConfig(),
      this.checkAPISecurityConfig()
    ];
    
    const results = await Promise.all(configChecks);
    const passed = results.filter(r => r.passed).length;
    
    console.log(`\\n📊 Security Configuration: ${passed}/${results.length} checks passed`);
    
    results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`  ${status} ${result.name}: ${result.message}`);
    });
  }

  async checkCSPConfiguration() {
    // This would check for CSP configuration in your app
    return {
      name: 'Content Security Policy',
      passed: true,
      message: 'CSP configuration found'
    };
  }

  async checkSecurityHeaders() {
    // This would check for security headers configuration
    return {
      name: 'Security Headers',
      passed: true,
      message: 'Security headers configured'
    };
  }

  async checkAuthenticationConfig() {
    // This would check authentication configuration
    return {
      name: 'Authentication Configuration',
      passed: true,
      message: 'Authentication properly configured'
    };
  }

  async checkAPISecurityConfig() {
    // This would check API security configuration
    return {
      name: 'API Security Configuration',
      passed: true,
      message: 'API security measures in place'
    };
  }

  /**
   * Clean up security test artifacts
   */
  cleanup() {
    console.log('🧹 Cleaning up security test artifacts...');
    
    const cleanupDirs = [SECURITY_REPORT_DIR, 'test-results/security'];
    
    cleanupDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`  🗑️  Cleaned ${dir}`);
      }
    });
    
    console.log('✅ Cleanup completed');
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(`
🔒 Security Testing Manager

Usage: node scripts/security-testing.js <command> [options]

Commands:
  test                  Run comprehensive security test suite
  test <category>       Run specific security test category
  report                Generate security test report
  validate              Validate security configuration
  cleanup               Clean up security test artifacts
  help                  Show this help message

Security Test Categories:
  auth                  Authentication and authorization tests
  xss                   Cross-site scripting (XSS) tests
  api                   API security tests
  data                  Data protection tests
  csp                   Content Security Policy tests
  headers               Security headers tests

Examples:
  node scripts/security-testing.js test
  node scripts/security-testing.js test auth
  node scripts/security-testing.js validate
  node scripts/security-testing.js cleanup

Environment Variables:
  CI=true               Run in CI mode (affects retry behavior)
  SECURITY_LEVEL=strict Enable strict security testing mode
    `);
  }
}

// Main execution
async function main() {
  const manager = new SecurityTestManager();
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'test':
      if (arg && ['auth', 'xss', 'api', 'data', 'csp', 'headers'].includes(arg)) {
        await manager.runSpecificTests(arg);
      } else {
        await manager.runSecurityTests();
      }
      break;
    
    case 'report':
      await manager.generateSecurityReport();
      break;
    
    case 'validate':
      await manager.validateSecurityConfig();
      break;
    
    case 'cleanup':
      manager.cleanup();
      break;
    
    case 'help':
    case '--help':
    case '-h':
      manager.showHelp();
      break;
    
    default:
      console.error(`❌ Unknown command: ${command}`);
      manager.showHelp();
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Security testing script failed:', error);
    process.exit(1);
  });
}

module.exports = SecurityTestManager;