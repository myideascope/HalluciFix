#!/usr/bin/env node

/**
 * Security Scanner Script
 * Performs dependency vulnerability scanning and static code analysis
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SecurityScanner {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.reportPath = path.join(this.projectRoot, 'test-results', 'security-report.json');
    this.packageJsonPath = path.join(this.projectRoot, 'package.json');
    
    // Security thresholds
    this.thresholds = {
      critical: 0,    // No critical vulnerabilities allowed
      high: 2,        // Max 2 high severity vulnerabilities
      moderate: 10,   // Max 10 moderate severity vulnerabilities
      low: 50         // Max 50 low severity vulnerabilities
    };
  }

  /**
   * Run npm audit for dependency vulnerability scanning
   */
  async runNpmAudit() {
    console.log('🔍 Running npm audit...');
    
    try {
      const auditOutput = execSync('npm audit --json', { 
        cwd: this.projectRoot,
        encoding: 'utf8'
      });
      
      const auditData = JSON.parse(auditOutput);
      
      return {
        success: true,
        vulnerabilities: auditData.vulnerabilities || {},
        metadata: auditData.metadata || {},
        summary: this.summarizeAuditResults(auditData)
      };
    } catch (error) {
      // npm audit returns non-zero exit code when vulnerabilities are found
      if (error.stdout) {
        try {
          const auditData = JSON.parse(error.stdout);
          return {
            success: false,
            vulnerabilities: auditData.vulnerabilities || {},
            metadata: auditData.metadata || {},
            summary: this.summarizeAuditResults(auditData)
          };
        } catch (parseError) {
          return {
            success: false,
            error: 'Failed to parse npm audit output',
            rawOutput: error.stdout
          };
        }
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Summarize npm audit results
   */
  summarizeAuditResults(auditData) {
    const summary = {
      total: 0,
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0
    };

    if (auditData.vulnerabilities) {
      Object.values(auditData.vulnerabilities).forEach(vuln => {
        const severity = vuln.severity;
        summary.total++;
        summary[severity] = (summary[severity] || 0) + 1;
      });
    }

    return summary;
  }

  /**
   * Check environment variable security
   */
  checkEnvironmentSecurity() {
    console.log('🔒 Checking environment variable security...');
    
    const issues = [];
    const envFiles = ['.env', '.env.local', '.env.development', '.env.production'];
    
    envFiles.forEach(envFile => {
      const envPath = path.join(this.projectRoot, envFile);
      
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          const trimmedLine = line.trim();
          
          // Skip comments and empty lines
          if (!trimmedLine || trimmedLine.startsWith('#')) return;
          
          // Check for common security issues
          if (trimmedLine.includes('password=') && !trimmedLine.includes('VITE_')) {
            issues.push({
              file: envFile,
              line: index + 1,
              issue: 'Plain text password in environment file',
              severity: 'high',
              recommendation: 'Use secure secret management'
            });
          }
          
          if (trimmedLine.includes('secret=') && trimmedLine.includes('VITE_')) {
            issues.push({
              file: envFile,
              line: index + 1,
              issue: 'Secret exposed to client via VITE_ prefix',
              severity: 'critical',
              recommendation: 'Remove VITE_ prefix for server-only secrets'
            });
          }
          
          if (trimmedLine.match(/api.*key.*=.*[a-zA-Z0-9]{20,}/i) && trimmedLine.includes('VITE_')) {
            issues.push({
              file: envFile,
              line: index + 1,
              issue: 'API key exposed to client',
              severity: 'high',
              recommendation: 'Move API key to server-side environment'
            });
          }
          
          // Check for weak secrets
          const secretMatch = trimmedLine.match(/=(.+)$/);
          if (secretMatch) {
            const value = secretMatch[1].trim();
            if (value.length < 16 && (trimmedLine.includes('secret') || trimmedLine.includes('key'))) {
              issues.push({
                file: envFile,
                line: index + 1,
                issue: 'Weak secret (less than 16 characters)',
                severity: 'moderate',
                recommendation: 'Use longer, more complex secrets'
              });
            }
          }
        });
      }
    });
    
    return {
      issues,
      filesChecked: envFiles.filter(f => fs.existsSync(path.join(this.projectRoot, f)))
    };
  }

  /**
   * Analyze package.json for security issues
   */
  analyzePackageJson() {
    console.log('📦 Analyzing package.json security...');
    
    const issues = [];
    
    if (!fs.existsSync(this.packageJsonPath)) {
      return { issues: [{ issue: 'package.json not found', severity: 'critical' }] };
    }
    
    const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
    
    // Check for known vulnerable packages
    const knownVulnerable = {
      'lodash': ['4.17.15', '4.17.19'],
      'handlebars': ['4.0.0', '4.1.0'],
      'jquery': ['1.x.x', '2.x.x'],
      'moment': ['2.18.0', '2.19.0']
    };
    
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };
    
    Object.entries(allDeps).forEach(([pkg, version]) => {
      if (knownVulnerable[pkg]) {
        const vulnVersions = knownVulnerable[pkg];
        if (vulnVersions.some(v => version.includes(v.replace('.x.x', '')))) {
          issues.push({
            package: pkg,
            version,
            issue: 'Known vulnerable package version',
            severity: 'high',
            recommendation: `Update ${pkg} to latest version`
          });
        }
      }
      
      // Check for packages with security advisories
      if (pkg === 'serialize-javascript' && version.startsWith('^1.')) {
        issues.push({
          package: pkg,
          version,
          issue: 'XSS vulnerability in serialize-javascript < 2.1.1',
          severity: 'high',
          recommendation: 'Update to serialize-javascript@^3.0.0'
        });
      }
    });
    
    // Check for missing security-related packages
    const securityPackages = ['helmet', '@types/node'];
    const missingSecurityPackages = securityPackages.filter(pkg => 
      !allDeps[pkg] && !packageJson.dependencies?.[pkg]
    );
    
    if (missingSecurityPackages.length > 0) {
      issues.push({
        issue: `Missing recommended security packages: ${missingSecurityPackages.join(', ')}`,
        severity: 'low',
        recommendation: 'Consider adding security-focused packages'
      });
    }
    
    return { issues, packagesChecked: Object.keys(allDeps).length };
  }

  /**
   * Check for hardcoded secrets in source code
   */
  scanForHardcodedSecrets() {
    console.log('🔎 Scanning for hardcoded secrets...');
    
    const issues = [];
    const secretPatterns = [
      { pattern: /password\s*[:=]\s*["'][^"']{8,}["']/gi, type: 'password' },
      { pattern: /api[_-]?key\s*[:=]\s*["'][^"']{20,}["']/gi, type: 'api_key' },
      { pattern: /secret[_-]?key\s*[:=]\s*["'][^"']{16,}["']/gi, type: 'secret_key' },
      { pattern: /private[_-]?key\s*[:=]\s*["'][^"']{32,}["']/gi, type: 'private_key' },
      { pattern: /token\s*[:=]\s*["'][^"']{20,}["']/gi, type: 'token' },
      { pattern: /sk_live_[a-zA-Z0-9]{24,}/g, type: 'stripe_secret' },
      { pattern: /pk_live_[a-zA-Z0-9]{24,}/g, type: 'stripe_public' },
      { pattern: /AKIA[0-9A-Z]{16}/g, type: 'aws_access_key' }
    ];
    
    const scanDirectory = (dir, relativePath = '') => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const itemRelativePath = path.join(relativePath, item);
        
        // Skip node_modules, .git, and other irrelevant directories
        if (['node_modules', '.git', 'dist', 'build', '.next'].includes(item)) {
          continue;
        }
        
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          scanDirectory(fullPath, itemRelativePath);
        } else if (stats.isFile()) {
          // Only scan text files
          const ext = path.extname(item).toLowerCase();
          const textExtensions = ['.js', '.ts', '.jsx', '.tsx', '.json', '.env', '.md', '.txt', '.yml', '.yaml'];
          
          if (textExtensions.includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              
              secretPatterns.forEach(({ pattern, type }) => {
                const matches = content.match(pattern);
                if (matches) {
                  matches.forEach(match => {
                    // Skip obvious test/example values
                    const testValues = ['test', 'example', 'demo', 'placeholder', 'your_key_here'];
                    const isTestValue = testValues.some(test => 
                      match.toLowerCase().includes(test)
                    );
                    
                    if (!isTestValue) {
                      issues.push({
                        file: itemRelativePath,
                        type,
                        match: match.substring(0, 50) + '...',
                        severity: type.includes('secret') || type.includes('private') ? 'critical' : 'high',
                        recommendation: 'Move secret to environment variables'
                      });
                    }
                  });
                }
              });
            } catch (error) {
              // Skip binary files or files that can't be read
            }
          }
        }
      }
    };
    
    scanDirectory(path.join(this.projectRoot, 'src'));
    
    return { issues };
  }

  /**
   * Check TypeScript/JavaScript code for security issues
   */
  analyzeCodeSecurity() {
    console.log('🔍 Analyzing code for security issues...');
    
    const issues = [];
    
    // Security anti-patterns to look for
    const securityPatterns = [
      {
        pattern: /eval\s*\(/g,
        issue: 'Use of eval() function',
        severity: 'high',
        recommendation: 'Avoid eval() - use safer alternatives'
      },
      {
        pattern: /innerHTML\s*=\s*[^;]+\+/g,
        issue: 'Potential XSS via innerHTML concatenation',
        severity: 'moderate',
        recommendation: 'Use textContent or sanitize HTML'
      },
      {
        pattern: /document\.write\s*\(/g,
        issue: 'Use of document.write()',
        severity: 'moderate',
        recommendation: 'Use modern DOM manipulation methods'
      },
      {
        pattern: /window\.location\s*=\s*[^;]+\+/g,
        issue: 'Potential open redirect via location concatenation',
        severity: 'moderate',
        recommendation: 'Validate URLs before redirecting'
      },
      {
        pattern: /localStorage\.setItem\s*\([^,]+,\s*[^)]*password[^)]*\)/gi,
        issue: 'Storing password in localStorage',
        severity: 'high',
        recommendation: 'Never store passwords in localStorage'
      }
    ];
    
    const scanFile = (filePath, relativePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        securityPatterns.forEach(({ pattern, issue, severity, recommendation }) => {
          const matches = content.match(pattern);
          if (matches) {
            matches.forEach(match => {
              issues.push({
                file: relativePath,
                issue,
                severity,
                recommendation,
                code: match.trim()
              });
            });
          }
        });
      } catch (error) {
        // Skip files that can't be read
      }
    };
    
    const scanDirectory = (dir, relativePath = '') => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const itemRelativePath = path.join(relativePath, item);
        
        if (['node_modules', '.git', 'dist'].includes(item)) continue;
        
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          scanDirectory(fullPath, itemRelativePath);
        } else if (stats.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
            scanFile(fullPath, itemRelativePath);
          }
        }
      }
    };
    
    scanDirectory(path.join(this.projectRoot, 'src'));
    
    return { issues };
  }

  /**
   * Generate comprehensive security report
   */
  async generateSecurityReport() {
    console.log('🛡️  Generating security report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalIssues: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0
      },
      scans: {}
    };
    
    try {
      // Run npm audit
      report.scans.npmAudit = await this.runNpmAudit();
      
      // Check environment security
      report.scans.environmentSecurity = this.checkEnvironmentSecurity();
      
      // Analyze package.json
      report.scans.packageAnalysis = this.analyzePackageJson();
      
      // Scan for hardcoded secrets
      report.scans.secretScan = this.scanForHardcodedSecrets();
      
      // Analyze code security
      report.scans.codeSecurity = this.analyzeCodeSecurity();
      
      // Calculate summary
      this.calculateReportSummary(report);
      
      // Save report
      this.saveReport(report);
      
      return report;
    } catch (error) {
      console.error('❌ Security scan failed:', error.message);
      throw error;
    }
  }

  /**
   * Calculate report summary
   */
  calculateReportSummary(report) {
    const allIssues = [];
    
    // Collect all issues
    Object.values(report.scans).forEach(scan => {
      if (scan.issues) {
        allIssues.push(...scan.issues);
      }
      if (scan.summary) {
        // Add npm audit vulnerabilities to summary
        report.summary.critical += scan.summary.critical || 0;
        report.summary.high += scan.summary.high || 0;
        report.summary.moderate += scan.summary.moderate || 0;
        report.summary.low += scan.summary.low || 0;
      }
    });
    
    // Count issues by severity
    allIssues.forEach(issue => {
      report.summary.totalIssues++;
      report.summary[issue.severity] = (report.summary[issue.severity] || 0) + 1;
    });
  }

  /**
   * Save security report
   */
  saveReport(report) {
    const reportDir = path.dirname(this.reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(this.reportPath, JSON.stringify(report, null, 2));
  }

  /**
   * Print security report to console
   */
  printReport(report) {
    console.log('\n🛡️  Security Scan Report');
    console.log('========================\n');
    
    console.log('📊 Summary:');
    console.log(`  Total Issues: ${report.summary.totalIssues}`);
    console.log(`  🚨 Critical: ${report.summary.critical}`);
    console.log(`  ⚠️  High: ${report.summary.high}`);
    console.log(`  ⚡ Moderate: ${report.summary.moderate}`);
    console.log(`  ℹ️  Low: ${report.summary.low}`);
    
    // Check against thresholds
    const violations = [];
    if (report.summary.critical > this.thresholds.critical) {
      violations.push(`Critical: ${report.summary.critical} > ${this.thresholds.critical}`);
    }
    if (report.summary.high > this.thresholds.high) {
      violations.push(`High: ${report.summary.high} > ${this.thresholds.high}`);
    }
    if (report.summary.moderate > this.thresholds.moderate) {
      violations.push(`Moderate: ${report.summary.moderate} > ${this.thresholds.moderate}`);
    }
    
    if (violations.length > 0) {
      console.log('\n🚨 Threshold Violations:');
      violations.forEach(violation => console.log(`  ❌ ${violation}`));
    }
    
    console.log(`\n📄 Full report saved to: ${this.reportPath}`);
    
    return violations.length === 0;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'scan';
  
  const scanner = new SecurityScanner();
  
  try {
    switch (command) {
      case 'scan':
        console.log('🔍 Starting security scan...');
        const report = await scanner.generateSecurityReport();
        const passed = scanner.printReport(report);
        
        if (!passed) {
          console.log('\n❌ Security scan failed due to threshold violations.');
          process.exit(1);
        } else {
          console.log('\n✅ Security scan passed.');
        }
        break;
        
      case 'audit':
        const auditResult = await scanner.runNpmAudit();
        console.log('NPM Audit Result:', JSON.stringify(auditResult, null, 2));
        break;
        
      case 'secrets':
        const secretScan = scanner.scanForHardcodedSecrets();
        console.log('Secret Scan Result:', JSON.stringify(secretScan, null, 2));
        break;
        
      default:
        console.log('Usage: node security-scanner.js [scan|audit|secrets]');
        console.log('  scan    - Run comprehensive security scan (default)');
        console.log('  audit   - Run npm audit only');
        console.log('  secrets - Scan for hardcoded secrets only');
    }
  } catch (error) {
    console.error('❌ Security scan failed:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SecurityScanner };