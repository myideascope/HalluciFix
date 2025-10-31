#!/usr/bin/env node

/**
 * Quality Gates System
 * Implements configurable quality gates with automated enforcement
 */

const fs = require('fs');
const path = require('path');

class QualityGates {
  constructor() {
    this.configFile = 'quality-gates.config.json';
    this.reportsDir = 'quality-reports';
    this.defaultConfig = {
      coverage: {
        enabled: true,
        thresholds: {
          global: {
            lines: 80,
            functions: 80,
            branches: 75,
            statements: 80
          },
          critical: {
            lines: 90,
            functions: 90,
            branches: 85,
            statements: 90
          }
        },
        criticalModules: [
          'src/lib/analysisService.ts',
          'src/lib/supabase.ts',
          'src/lib/api.ts',
          'src/hooks/useAuth.ts'
        ]
      },
      tests: {
        enabled: true,
        requirements: {
          unit: { required: true, failureThreshold: 0 },
          integration: { required: true, failureThreshold: 0 },
          e2e: { required: false, failureThreshold: 1 },
          security: { required: true, failureThreshold: 0 }
        }
      },
      performance: {
        enabled: true,
        thresholds: {
          bundleSize: 2097152, // 2MB
          apiResponseTime: 2000, // 2 seconds
          webVitals: {
            fcp: 1500, // First Contentful Paint
            lcp: 2500, // Largest Contentful Paint
            cls: 0.1   // Cumulative Layout Shift
          }
        }
      },
      security: {
        enabled: true,
        requirements: {
          vulnerabilities: {
            critical: 0,
            high: 0,
            moderate: 5
          },
          secretsFound: false,
          codeqlIssues: 0
        }
      },
      deployment: {
        blockOnFailure: true,
        allowEmergencyOverride: true,
        overrideRequiresApproval: true,
        notificationChannels: ['github', 'slack']
      }
    };
  }

  /**
   * Load quality gates configuration
   */
  loadConfig() {
    if (!fs.existsSync(this.configFile)) {
      console.log('📝 Creating default quality gates configuration...');
      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    }

    try {
      const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      return { ...this.defaultConfig, ...config };
    } catch (error) {
      console.warn('⚠️ Failed to load config, using defaults:', error.message);
      return this.defaultConfig;
    }
  }

  /**
   * Save quality gates configuration
   */
  saveConfig(config) {
    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
  }

  /**
   * Load test results from artifacts
   */
  loadTestResults() {
    const results = {
      unit: { status: 'unknown', failures: 0 },
      integration: { status: 'unknown', failures: 0 },
      e2e: { status: 'unknown', failures: 0 },
      security: { status: 'unknown', failures: 0 }
    };

    // Check for test result files
    const testResultsDir = 'test-results';
    if (fs.existsSync(testResultsDir)) {
      try {
        // Look for JUnit XML files or JSON results
        const files = fs.readdirSync(testResultsDir);
        
        for (const file of files) {
          if (file.includes('unit') && file.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(path.join(testResultsDir, file), 'utf8'));
            results.unit = this.parseTestResults(data);
          } else if (file.includes('integration') && file.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(path.join(testResultsDir, file), 'utf8'));
            results.integration = this.parseTestResults(data);
          } else if (file.includes('e2e') && file.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(path.join(testResultsDir, file), 'utf8'));
            results.e2e = this.parseTestResults(data);
          }
        }
      } catch (error) {
        console.warn('⚠️ Failed to parse test results:', error.message);
      }
    }

    return results;
  }

  /**
   * Parse test results from various formats
   */
  parseTestResults(data) {
    // Handle different test result formats
    if (data.numFailedTests !== undefined) {
      // Jest format
      return {
        status: data.numFailedTests === 0 ? 'passed' : 'failed',
        failures: data.numFailedTests,
        total: data.numTotalTests
      };
    } else if (data.stats) {
      // Mocha format
      return {
        status: data.stats.failures === 0 ? 'passed' : 'failed',
        failures: data.stats.failures,
        total: data.stats.tests
      };
    } else if (data.testResults) {
      // Custom format
      const failures = data.testResults.filter(t => t.status === 'failed').length;
      return {
        status: failures === 0 ? 'passed' : 'failed',
        failures: failures,
        total: data.testResults.length
      };
    }

    return { status: 'unknown', failures: 0 };
  }

  /**
   * Load coverage data
   */
  loadCoverageData() {
    const coverageFile = 'coverage-reports/latest-coverage-report.json';
    if (!fs.existsSync(coverageFile)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
    } catch (error) {
      console.warn('⚠️ Failed to load coverage data:', error.message);
      return null;
    }
  }

  /**
   * Load performance data
   */
  loadPerformanceData() {
    const performanceFiles = [
      'performance-report/bundle-metrics.json',
      'performance-report/api-performance-results.json',
      'performance-report/web-vitals.json'
    ];

    const data = {};

    for (const file of performanceFiles) {
      if (fs.existsSync(file)) {
        try {
          const content = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (file.includes('bundle')) {
            data.bundle = content;
          } else if (file.includes('api')) {
            data.api = content;
          } else if (file.includes('vitals')) {
            data.webVitals = content;
          }
        } catch (error) {
          console.warn(`⚠️ Failed to load ${file}:`, error.message);
        }
      }
    }

    return data;
  }

  /**
   * Load security scan results
   */
  loadSecurityData() {
    const securityFiles = [
      'security-results/npm-audit-results.json',
      'security-results/security-scan-results.json'
    ];

    const data = {
      vulnerabilities: { critical: 0, high: 0, moderate: 0 },
      secretsFound: false,
      codeqlIssues: 0
    };

    for (const file of securityFiles) {
      if (fs.existsSync(file)) {
        try {
          const content = JSON.parse(fs.readFileSync(file, 'utf8'));
          
          if (file.includes('audit')) {
            if (content.metadata && content.metadata.vulnerabilities) {
              data.vulnerabilities = {
                critical: content.metadata.vulnerabilities.critical || 0,
                high: content.metadata.vulnerabilities.high || 0,
                moderate: content.metadata.vulnerabilities.moderate || 0
              };
            }
          }
        } catch (error) {
          console.warn(`⚠️ Failed to load ${file}:`, error.message);
        }
      }
    }

    return data;
  }

  /**
   * Evaluate coverage quality gate
   */
  evaluateCoverageGate(config, coverageData) {
    if (!config.coverage.enabled || !coverageData) {
      return { passed: true, skipped: true, reason: 'Coverage gate disabled or no data' };
    }

    const failures = [];
    const { summary, thresholdResults } = coverageData;

    // Check global thresholds
    if (!thresholdResults.global.passed) {
      for (const failure of thresholdResults.global.failures) {
        failures.push({
          type: 'global-threshold',
          metric: failure.metric,
          actual: failure.actual,
          threshold: failure.threshold,
          message: `Global ${failure.metric} coverage (${failure.actual.toFixed(1)}%) below threshold (${failure.threshold}%)`
        });
      }
    }

    // Check critical module thresholds
    if (!thresholdResults.critical.passed) {
      for (const failure of thresholdResults.critical.failures) {
        failures.push({
          type: 'critical-module',
          module: failure.module,
          metric: failure.metric,
          actual: failure.actual,
          threshold: failure.threshold,
          message: failure.issue || `Critical module ${failure.module} ${failure.metric} coverage (${failure.actual?.toFixed(1)}%) below threshold (${failure.threshold}%)`
        });
      }
    }

    return {
      passed: failures.length === 0,
      failures,
      summary: {
        globalCoverage: summary.global,
        criticalModulesPassed: thresholdResults.critical.passed
      }
    };
  }

  /**
   * Evaluate test quality gate
   */
  evaluateTestGate(config, testResults) {
    if (!config.tests.enabled) {
      return { passed: true, skipped: true, reason: 'Test gate disabled' };
    }

    const failures = [];
    const { requirements } = config.tests;

    for (const [testType, requirement] of Object.entries(requirements)) {
      const result = testResults[testType];
      
      if (requirement.required && result.status === 'unknown') {
        failures.push({
          type: 'missing-tests',
          testType,
          message: `Required ${testType} tests not found or not executed`
        });
      } else if (result.status === 'failed' && result.failures > requirement.failureThreshold) {
        failures.push({
          type: 'test-failures',
          testType,
          failures: result.failures,
          threshold: requirement.failureThreshold,
          message: `${testType} tests failed (${result.failures} failures, threshold: ${requirement.failureThreshold})`
        });
      }
    }

    return {
      passed: failures.length === 0,
      failures,
      summary: testResults
    };
  }

  /**
   * Evaluate performance quality gate
   */
  evaluatePerformanceGate(config, performanceData) {
    if (!config.performance.enabled) {
      return { passed: true, skipped: true, reason: 'Performance gate disabled' };
    }

    const failures = [];
    const { thresholds } = config.performance;

    // Check bundle size
    if (performanceData.bundle && performanceData.bundle.total_size > thresholds.bundleSize) {
      failures.push({
        type: 'bundle-size',
        actual: performanceData.bundle.total_size,
        threshold: thresholds.bundleSize,
        message: `Bundle size (${(performanceData.bundle.total_size / 1024 / 1024).toFixed(2)}MB) exceeds threshold (${(thresholds.bundleSize / 1024 / 1024).toFixed(2)}MB)`
      });
    }

    // Check API performance
    if (performanceData.api && performanceData.api.average_duration > thresholds.apiResponseTime) {
      failures.push({
        type: 'api-performance',
        actual: performanceData.api.average_duration,
        threshold: thresholds.apiResponseTime,
        message: `API response time (${performanceData.api.average_duration.toFixed(0)}ms) exceeds threshold (${thresholds.apiResponseTime}ms)`
      });
    }

    // Check Web Vitals
    if (performanceData.webVitals) {
      const vitals = performanceData.webVitals;
      if (vitals.fcp > thresholds.webVitals.fcp) {
        failures.push({
          type: 'web-vitals',
          metric: 'FCP',
          actual: vitals.fcp,
          threshold: thresholds.webVitals.fcp,
          message: `First Contentful Paint (${vitals.fcp}ms) exceeds threshold (${thresholds.webVitals.fcp}ms)`
        });
      }
      if (vitals.lcp > thresholds.webVitals.lcp) {
        failures.push({
          type: 'web-vitals',
          metric: 'LCP',
          actual: vitals.lcp,
          threshold: thresholds.webVitals.lcp,
          message: `Largest Contentful Paint (${vitals.lcp}ms) exceeds threshold (${thresholds.webVitals.lcp}ms)`
        });
      }
      if (vitals.cls > thresholds.webVitals.cls) {
        failures.push({
          type: 'web-vitals',
          metric: 'CLS',
          actual: vitals.cls,
          threshold: thresholds.webVitals.cls,
          message: `Cumulative Layout Shift (${vitals.cls}) exceeds threshold (${thresholds.webVitals.cls})`
        });
      }
    }

    return {
      passed: failures.length === 0,
      failures,
      summary: performanceData
    };
  }

  /**
   * Evaluate security quality gate
   */
  evaluateSecurityGate(config, securityData) {
    if (!config.security.enabled) {
      return { passed: true, skipped: true, reason: 'Security gate disabled' };
    }

    const failures = [];
    const { requirements } = config.security;

    // Check vulnerabilities
    const vulns = securityData.vulnerabilities;
    if (vulns.critical > requirements.vulnerabilities.critical) {
      failures.push({
        type: 'critical-vulnerabilities',
        actual: vulns.critical,
        threshold: requirements.vulnerabilities.critical,
        message: `Critical vulnerabilities found (${vulns.critical}, threshold: ${requirements.vulnerabilities.critical})`
      });
    }
    if (vulns.high > requirements.vulnerabilities.high) {
      failures.push({
        type: 'high-vulnerabilities',
        actual: vulns.high,
        threshold: requirements.vulnerabilities.high,
        message: `High severity vulnerabilities found (${vulns.high}, threshold: ${requirements.vulnerabilities.high})`
      });
    }
    if (vulns.moderate > requirements.vulnerabilities.moderate) {
      failures.push({
        type: 'moderate-vulnerabilities',
        actual: vulns.moderate,
        threshold: requirements.vulnerabilities.moderate,
        message: `Moderate vulnerabilities exceed threshold (${vulns.moderate}, threshold: ${requirements.vulnerabilities.moderate})`
      });
    }

    // Check for secrets
    if (securityData.secretsFound && !requirements.secretsFound) {
      failures.push({
        type: 'secrets-found',
        message: 'Secrets detected in code'
      });
    }

    // Check CodeQL issues
    if (securityData.codeqlIssues > requirements.codeqlIssues) {
      failures.push({
        type: 'codeql-issues',
        actual: securityData.codeqlIssues,
        threshold: requirements.codeqlIssues,
        message: `CodeQL security issues found (${securityData.codeqlIssues}, threshold: ${requirements.codeqlIssues})`
      });
    }

    return {
      passed: failures.length === 0,
      failures,
      summary: securityData
    };
  }

  /**
   * Generate quality gates report
   */
  generateReport(results, config) {
    const timestamp = new Date().toISOString();
    const overallPassed = Object.values(results).every(r => r.passed);

    const report = {
      timestamp,
      commit: process.env.GITHUB_SHA || 'unknown',
      branch: process.env.GITHUB_REF_NAME || 'unknown',
      overallStatus: overallPassed ? 'PASSED' : 'FAILED',
      gates: results,
      config: config,
      deployment: {
        blocked: !overallPassed && config.deployment.blockOnFailure,
        canOverride: config.deployment.allowEmergencyOverride,
        requiresApproval: config.deployment.overrideRequiresApproval
      }
    };

    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    // Save detailed report
    const reportFile = path.join(this.reportsDir, `quality-gates-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    // Save latest report
    const latestReportFile = path.join(this.reportsDir, 'latest-quality-gates.json');
    fs.writeFileSync(latestReportFile, JSON.stringify(report, null, 2));

    return report;
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(report) {
    const { gates, deployment } = report;

    let markdown = `# 🚦 Quality Gates Report

**Status:** ${report.overallStatus === 'PASSED' ? '✅ PASSED' : '❌ FAILED'}
**Generated:** ${new Date(report.timestamp).toLocaleString()}
**Commit:** ${report.commit}
**Branch:** ${report.branch}

## Gate Results

| Gate | Status | Issues |
|------|--------|--------|
`;

    for (const [gateName, result] of Object.entries(gates)) {
      const status = result.skipped ? '⏭️ Skipped' : result.passed ? '✅ Passed' : '❌ Failed';
      const issues = result.failures ? result.failures.length : 0;
      markdown += `| ${gateName.charAt(0).toUpperCase() + gateName.slice(1)} | ${status} | ${issues} |\n`;
    }

    // Add deployment status
    markdown += `\n## Deployment Status

`;
    if (deployment.blocked) {
      markdown += `🚫 **Deployment Blocked** - Quality gates failed

`;
      if (deployment.canOverride) {
        markdown += `⚠️ Emergency override available${deployment.requiresApproval ? ' (requires approval)' : ''}

`;
      }
    } else {
      markdown += `✅ **Deployment Allowed** - All quality gates passed

`;
    }

    // Add detailed failures
    for (const [gateName, result] of Object.entries(gates)) {
      if (result.failures && result.failures.length > 0) {
        markdown += `\n### ${gateName.charAt(0).toUpperCase() + gateName.slice(1)} Gate Failures

`;
        for (const failure of result.failures) {
          markdown += `- **${failure.type}**: ${failure.message}\n`;
        }
      }
    }

    return markdown;
  }

  /**
   * Check for emergency override
   */
  checkEmergencyOverride() {
    const overrideFile = '.emergency-override';
    if (fs.existsSync(overrideFile)) {
      try {
        const override = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
        const now = new Date();
        const overrideTime = new Date(override.timestamp);
        const hoursSinceOverride = (now - overrideTime) / (1000 * 60 * 60);

        // Override expires after 24 hours
        if (hoursSinceOverride < 24) {
          return {
            active: true,
            reason: override.reason,
            approver: override.approver,
            timestamp: override.timestamp,
            expiresIn: 24 - hoursSinceOverride
          };
        } else {
          // Remove expired override
          fs.unlinkSync(overrideFile);
        }
      } catch (error) {
        console.warn('⚠️ Failed to parse emergency override:', error.message);
      }
    }

    return { active: false };
  }

  /**
   * Main evaluation function
   */
  async evaluate(options = {}) {
    try {
      console.log('🚦 Evaluating quality gates...');

      // Load configuration
      const config = this.loadConfig();
      console.log('📋 Configuration loaded');

      // Load data
      const testResults = this.loadTestResults();
      const coverageData = this.loadCoverageData();
      const performanceData = this.loadPerformanceData();
      const securityData = this.loadSecurityData();

      console.log('📊 Data loaded successfully');

      // Evaluate each gate
      const results = {
        coverage: this.evaluateCoverageGate(config, coverageData),
        tests: this.evaluateTestGate(config, testResults),
        performance: this.evaluatePerformanceGate(config, performanceData),
        security: this.evaluateSecurityGate(config, securityData)
      };

      // Generate report
      const report = this.generateReport(results, config);
      
      // Generate markdown report
      const markdownReport = this.generateMarkdownReport(report);
      const markdownFile = path.join(this.reportsDir, 'quality-gates-report.md');
      fs.writeFileSync(markdownFile, markdownReport);

      console.log('📝 Reports generated:');
      console.log(`   - JSON: ${path.join(this.reportsDir, 'latest-quality-gates.json')}`);
      console.log(`   - Markdown: ${markdownFile}`);

      // Check emergency override
      const override = this.checkEmergencyOverride();
      if (override.active) {
        console.log(`🚨 Emergency override active: ${override.reason}`);
        console.log(`   Approved by: ${override.approver}`);
        console.log(`   Expires in: ${override.expiresIn.toFixed(1)} hours`);
        report.overallStatus = 'OVERRIDE';
        report.deployment.blocked = false;
      }

      // Output results
      console.log(`\n🚦 Quality Gates Status: ${report.overallStatus}`);
      
      for (const [gateName, result] of Object.entries(results)) {
        const status = result.skipped ? 'SKIPPED' : result.passed ? 'PASSED' : 'FAILED';
        const icon = result.skipped ? '⏭️' : result.passed ? '✅' : '❌';
        console.log(`   ${icon} ${gateName}: ${status}`);
        
        if (result.failures && result.failures.length > 0) {
          for (const failure of result.failures.slice(0, 3)) { // Show first 3 failures
            console.log(`      - ${failure.message}`);
          }
          if (result.failures.length > 3) {
            console.log(`      ... and ${result.failures.length - 3} more`);
          }
        }
      }

      if (report.deployment.blocked) {
        console.log('\n🚫 Deployment blocked due to quality gate failures');
        if (options.failOnBlock) {
          process.exit(1);
        }
      } else {
        console.log('\n✅ Deployment allowed - all quality gates passed');
      }

      return report;

    } catch (error) {
      console.error('❌ Quality gates evaluation failed:', error.message);
      if (options.failOnError) {
        process.exit(1);
      }
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    failOnBlock: args.includes('--fail-on-block'),
    failOnError: args.includes('--fail-on-error')
  };

  const gates = new QualityGates();
  gates.evaluate(options).catch(console.error);
}

module.exports = QualityGates;