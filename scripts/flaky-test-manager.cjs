#!/usr/bin/env node

/**
 * Flaky Test Management System
 * 
 * Detects, tracks, and manages flaky tests with intelligent retry mechanisms
 * and quarantine recommendations.
 */

const fs = require('fs');
const path = require('path');
const TestHistoryTracker = require('./test-history-tracker.cjs');

class FlakyTestManager {
  constructor(options = {}) {
    this.historyTracker = new TestHistoryTracker(options);
    this.quarantineFile = options.quarantineFile || '.github/quarantined-tests.json';
    this.retryConfigFile = options.retryConfigFile || '.github/retry-config.json';
    
    this.loadQuarantineList();
    this.loadRetryConfig();
  }

  /**
   * Load quarantined tests list
   */
  loadQuarantineList() {
    try {
      if (fs.existsSync(this.quarantineFile)) {
        this.quarantinedTests = JSON.parse(fs.readFileSync(this.quarantineFile, 'utf8'));
      } else {
        this.quarantinedTests = {
          tests: [],
          metadata: {
            lastUpdated: new Date().toISOString(),
            totalQuarantined: 0
          }
        };
      }
    } catch (error) {
      console.warn(`Warning: Could not load quarantine list: ${error.message}`);
      this.quarantinedTests = { tests: [], metadata: {} };
    }
  }

  /**
   * Load retry configuration
   */
  loadRetryConfig() {
    const defaultConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      backoffMultiplier: 2,
      maxDelay: 30000,
      retryPatterns: {
        'network': {
          patterns: ['ECONNRESET', 'ETIMEDOUT', 'fetch failed'],
          maxRetries: 5,
          baseDelay: 2000
        },
        'database': {
          patterns: ['connection timeout', 'deadlock', 'lock timeout'],
          maxRetries: 4,
          baseDelay: 3000
        },
        'browser': {
          patterns: ['page crashed', 'browser disconnected', 'navigation timeout'],
          maxRetries: 3,
          baseDelay: 5000
        },
        'flaky': {
          patterns: ['intermittent', 'race condition', 'timing'],
          maxRetries: 2,
          baseDelay: 1000
        }
      },
      quarantineThreshold: 0.5, // 50% failure rate triggers quarantine
      autoQuarantine: true
    };

    try {
      if (fs.existsSync(this.retryConfigFile)) {
        const userConfig = JSON.parse(fs.readFileSync(this.retryConfigFile, 'utf8'));
        this.retryConfig = { ...defaultConfig, ...userConfig };
      } else {
        this.retryConfig = defaultConfig;
      }
    } catch (error) {
      console.warn(`Warning: Could not load retry config: ${error.message}`);
      this.retryConfig = defaultConfig;
    }
  }

  /**
   * Analyze test failure and determine retry strategy
   */
  analyzeFailure(testResult) {
    const analysis = {
      shouldRetry: false,
      retryConfig: null,
      failureCategory: 'unknown',
      confidence: 0
    };

    if (!testResult.error) {
      return analysis;
    }

    const errorMessage = testResult.error.toLowerCase();
    
    // Check against known patterns
    for (const [category, config] of Object.entries(this.retryConfig.retryPatterns)) {
      for (const pattern of config.patterns) {
        if (errorMessage.includes(pattern.toLowerCase())) {
          analysis.shouldRetry = true;
          analysis.retryConfig = config;
          analysis.failureCategory = category;
          analysis.confidence = 0.8;
          break;
        }
      }
      if (analysis.shouldRetry) break;
    }

    // Check test history for flaky patterns
    if (!analysis.shouldRetry) {
      const testKey = this.getTestKey(testResult);
      const flakyTests = this.historyTracker.history.flakyTests;
      
      if (flakyTests[testKey]) {
        const flakyTest = flakyTests[testKey];
        if (flakyTest.failureRate > 0.1 && flakyTest.failureRate < 0.9) {
          analysis.shouldRetry = true;
          analysis.retryConfig = this.retryConfig.retryPatterns.flaky;
          analysis.failureCategory = 'flaky';
          analysis.confidence = Math.min(flakyTest.failureRate * 2, 0.9);
        }
      }
    }

    return analysis;
  }

  /**
   * Generate test key for tracking
   */
  getTestKey(testResult) {
    return `${testResult.suite || 'unknown'}:${testResult.file || 'unknown'}:${testResult.name || 'unknown'}`;
  }

  /**
   * Execute test with intelligent retry mechanism
   */
  async executeWithRetry(testCommand, testResult, options = {}) {
    const analysis = this.analyzeFailure(testResult);
    const maxRetries = analysis.retryConfig?.maxRetries || this.retryConfig.maxRetries;
    const baseDelay = analysis.retryConfig?.baseDelay || this.retryConfig.baseDelay;
    
    let attempt = 0;
    let lastError = null;
    const retryLog = [];

    while (attempt <= maxRetries) {
      try {
        const startTime = Date.now();
        
        // Execute test command
        const result = await this.executeTest(testCommand, options);
        
        const duration = Date.now() - startTime;
        
        // Record successful execution
        retryLog.push({
          attempt: attempt + 1,
          success: true,
          duration,
          timestamp: new Date().toISOString()
        });

        // Update test history
        this.recordTestExecution(testResult, true, duration, attempt);
        
        return {
          success: true,
          attempts: attempt + 1,
          duration,
          retryLog
        };
        
      } catch (error) {
        lastError = error;
        attempt++;
        
        retryLog.push({
          attempt,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });

        if (attempt <= maxRetries) {
          const delay = this.calculateDelay(baseDelay, attempt);
          console.log(`Test failed on attempt ${attempt}, retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    this.recordTestExecution(testResult, false, 0, attempt - 1);
    
    // Check if test should be quarantined
    await this.checkForQuarantine(testResult);
    
    return {
      success: false,
      attempts: attempt,
      error: lastError,
      retryLog
    };
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateDelay(baseDelay, attempt) {
    const delay = baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute test command (mock implementation)
   */
  async executeTest(command, options) {
    // This would be replaced with actual test execution logic
    // For now, it's a placeholder that simulates test execution
    const { execSync } = require('child_process');
    
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        timeout: options.timeout || 30000,
        ...options
      });
      return result;
    } catch (error) {
      throw new Error(`Test execution failed: ${error.message}`);
    }
  }

  /**
   * Record test execution in history
   */
  recordTestExecution(testResult, success, duration, retries) {
    const executionData = {
      sha: process.env.GITHUB_SHA || 'unknown',
      branch: process.env.GITHUB_REF_NAME || 'unknown',
      trigger: process.env.GITHUB_EVENT_NAME || 'unknown',
      testResults: [{
        ...testResult,
        success,
        duration,
        retries,
        timestamp: new Date().toISOString()
      }]
    };
    
    this.historyTracker.recordExecution(executionData);
  }

  /**
   * Check if test should be quarantined
   */
  async checkForQuarantine(testResult) {
    if (!this.retryConfig.autoQuarantine) {
      return false;
    }

    const testKey = this.getTestKey(testResult);
    const flakyTests = this.historyTracker.history.flakyTests;
    
    if (flakyTests[testKey]) {
      const flakyTest = flakyTests[testKey];
      
      if (flakyTest.failureRate >= this.retryConfig.quarantineThreshold) {
        await this.quarantineTest(testResult, flakyTest);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Quarantine a flaky test
   */
  async quarantineTest(testResult, flakyData) {
    const testKey = this.getTestKey(testResult);
    
    // Check if already quarantined
    if (this.quarantinedTests.tests.some(t => t.key === testKey)) {
      return;
    }

    const quarantineEntry = {
      key: testKey,
      name: testResult.name,
      suite: testResult.suite,
      file: testResult.file,
      quarantinedAt: new Date().toISOString(),
      reason: 'automatic_flaky_detection',
      failureRate: flakyData.failureRate,
      totalRuns: flakyData.totalRuns,
      failures: flakyData.failures,
      lastFailure: flakyData.lastFailure,
      severity: flakyData.severity,
      pattern: flakyData.pattern,
      autoQuarantined: true
    };

    this.quarantinedTests.tests.push(quarantineEntry);
    this.quarantinedTests.metadata.totalQuarantined++;
    this.quarantinedTests.metadata.lastUpdated = new Date().toISOString();

    this.saveQuarantineList();
    
    console.log(`⚠️  Test quarantined: ${testResult.name} (failure rate: ${Math.round(flakyData.failureRate * 100)}%)`);
    
    // Create GitHub issue for quarantined test
    if (process.env.GITHUB_TOKEN) {
      await this.createQuarantineIssue(quarantineEntry);
    }
  }

  /**
   * Create GitHub issue for quarantined test
   */
  async createQuarantineIssue(quarantineEntry) {
    try {
      const { Octokit } = require('@octokit/rest');
      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
      });

      const title = `🚨 Flaky Test Quarantined: ${quarantineEntry.name}`;
      const body = `
## Flaky Test Detected

**Test:** \`${quarantineEntry.name}\`
**Suite:** \`${quarantineEntry.suite}\`
**File:** \`${quarantineEntry.file}\`

### Statistics
- **Failure Rate:** ${Math.round(quarantineEntry.failureRate * 100)}%
- **Total Runs:** ${quarantineEntry.totalRuns}
- **Failures:** ${quarantineEntry.failures}
- **Severity:** ${quarantineEntry.severity}
- **Pattern:** ${quarantineEntry.pattern}

### Last Failure
${quarantineEntry.lastFailure}

### Recommended Actions
1. Investigate the root cause of the flaky behavior
2. Fix the underlying issue (timing, race conditions, etc.)
3. Remove from quarantine once fixed
4. Consider rewriting the test if the issue persists

### Quarantine Details
- **Quarantined At:** ${quarantineEntry.quarantinedAt}
- **Reason:** ${quarantineEntry.reason}
- **Auto-Quarantined:** ${quarantineEntry.autoQuarantined}

This test has been automatically quarantined due to consistent flaky behavior. It will be skipped in CI runs until the issue is resolved.
      `;

      const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
      
      if (owner && repo) {
        await octokit.rest.issues.create({
          owner,
          repo,
          title,
          body,
          labels: ['flaky-test', 'quarantined', 'bug']
        });
        
        console.log(`📝 Created GitHub issue for quarantined test: ${quarantineEntry.name}`);
      }
    } catch (error) {
      console.warn(`Warning: Could not create GitHub issue: ${error.message}`);
    }
  }

  /**
   * Remove test from quarantine
   */
  removeFromQuarantine(testKey, reason = 'manual') {
    const index = this.quarantinedTests.tests.findIndex(t => t.key === testKey);
    
    if (index !== -1) {
      const test = this.quarantinedTests.tests[index];
      this.quarantinedTests.tests.splice(index, 1);
      this.quarantinedTests.metadata.lastUpdated = new Date().toISOString();
      
      this.saveQuarantineList();
      
      console.log(`✅ Test removed from quarantine: ${test.name} (reason: ${reason})`);
      return true;
    }
    
    return false;
  }

  /**
   * Get quarantine report
   */
  getQuarantineReport() {
    const tests = this.quarantinedTests.tests;
    
    return {
      total: tests.length,
      byseverity: {
        high: tests.filter(t => t.severity === 'high').length,
        medium: tests.filter(t => t.severity === 'medium').length,
        low: tests.filter(t => t.severity === 'low').length
      },
      bySuite: tests.reduce((acc, test) => {
        acc[test.suite] = (acc[test.suite] || 0) + 1;
        return acc;
      }, {}),
      autoQuarantined: tests.filter(t => t.autoQuarantined).length,
      tests: tests.sort((a, b) => new Date(b.quarantinedAt) - new Date(a.quarantinedAt))
    };
  }

  /**
   * Generate flaky test analysis report
   */
  generateAnalysisReport() {
    const flakyReport = this.historyTracker.getFlakyTestsReport();
    const quarantineReport = this.getQuarantineReport();
    
    return {
      summary: {
        totalFlaky: flakyReport.total,
        quarantined: quarantineReport.total,
        needsAttention: flakyReport.high + flakyReport.medium
      },
      flakyTests: flakyReport,
      quarantinedTests: quarantineReport,
      recommendations: this.generateRecommendations(flakyReport, quarantineReport),
      trends: this.analyzeTrends()
    };
  }

  /**
   * Generate recommendations for flaky test management
   */
  generateRecommendations(flakyReport, quarantineReport) {
    const recommendations = [];
    
    // High-priority flaky tests
    if (flakyReport.high > 0) {
      recommendations.push({
        priority: 'high',
        type: 'flaky_tests',
        message: `${flakyReport.high} highly flaky tests need immediate attention`,
        action: 'Investigate and fix or quarantine these tests',
        tests: flakyReport.tests.filter(t => t.severity === 'high').slice(0, 5)
      });
    }
    
    // Quarantine cleanup
    if (quarantineReport.total > 10) {
      recommendations.push({
        priority: 'medium',
        type: 'quarantine_cleanup',
        message: `${quarantineReport.total} tests are quarantined`,
        action: 'Review and fix quarantined tests to improve test coverage',
        oldestQuarantined: quarantineReport.tests.slice(-3)
      });
    }
    
    // Suite-specific issues
    for (const [suite, count] of Object.entries(quarantineReport.bySuite)) {
      if (count >= 3) {
        recommendations.push({
          priority: 'medium',
          type: 'suite_issues',
          message: `Test suite '${suite}' has ${count} quarantined tests`,
          action: 'Review test suite for systematic issues',
          suite
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Analyze flaky test trends
   */
  analyzeTrends() {
    const executions = this.historyTracker.history.executions.slice(-50);
    const flakyTests = this.historyTracker.history.flakyTests;
    
    // Calculate trend over time
    const recentFlaky = Object.values(flakyTests).filter(t => {
      const detectedDate = new Date(t.detectedAt);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return detectedDate > weekAgo;
    }).length;
    
    const olderFlaky = Object.values(flakyTests).length - recentFlaky;
    
    return {
      recentlyDetected: recentFlaky,
      historical: olderFlaky,
      trend: recentFlaky > olderFlaky ? 'increasing' : recentFlaky < olderFlaky ? 'decreasing' : 'stable',
      avgFailureRate: Object.values(flakyTests).reduce((sum, t) => sum + t.failureRate, 0) / Object.values(flakyTests).length || 0
    };
  }

  /**
   * Save quarantine list to file
   */
  saveQuarantineList() {
    try {
      const dir = path.dirname(this.quarantineFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.quarantineFile, JSON.stringify(this.quarantinedTests, null, 2));
    } catch (error) {
      console.error(`Error saving quarantine list: ${error.message}`);
    }
  }

  /**
   * Generate GitHub Actions retry script
   */
  generateRetryScript(testCommand, testName) {
    return `#!/bin/bash
# Auto-generated retry script for: ${testName}

MAX_RETRIES=3
RETRY_COUNT=0
BASE_DELAY=1000

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  echo "Attempt $((RETRY_COUNT + 1)) of $MAX_RETRIES for test: ${testName}"
  
  if ${testCommand}; then
    echo "✅ Test passed on attempt $((RETRY_COUNT + 1))"
    exit 0
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      DELAY=$((BASE_DELAY * RETRY_COUNT))
      echo "❌ Test failed, retrying in ${DELAY}ms..."
      sleep $((DELAY / 1000))
    fi
  fi
done

echo "❌ Test failed after $MAX_RETRIES attempts"
exit 1
`;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const manager = new FlakyTestManager();
  
  switch (command) {
    case 'analyze':
      // Analyze test failure
      const testResult = JSON.parse(args[1] || '{}');
      const analysis = manager.analyzeFailure(testResult);
      console.log(JSON.stringify(analysis, null, 2));
      break;
      
    case 'quarantine':
      // Get quarantine report
      const report = manager.getQuarantineReport();
      console.log(JSON.stringify(report, null, 2));
      break;
      
    case 'remove-quarantine':
      // Remove test from quarantine
      const testKey = args[1];
      const reason = args[2] || 'manual';
      const removed = manager.removeFromQuarantine(testKey, reason);
      console.log(removed ? 'Test removed from quarantine' : 'Test not found in quarantine');
      break;
      
    case 'report':
      // Generate full analysis report
      const fullReport = manager.generateAnalysisReport();
      console.log(JSON.stringify(fullReport, null, 2));
      break;
      
    case 'retry-script':
      // Generate retry script
      const testCommand = args[1];
      const testName = args[2] || 'unknown';
      const script = manager.generateRetryScript(testCommand, testName);
      console.log(script);
      break;
      
    default:
      console.log('Usage: flaky-test-manager.js <command> [args]');
      console.log('Commands:');
      console.log('  analyze <test-result-json>  - Analyze test failure');
      console.log('  quarantine                  - Get quarantine report');
      console.log('  remove-quarantine <key>     - Remove test from quarantine');
      console.log('  report                      - Generate full analysis report');
      console.log('  retry-script <command> <name> - Generate retry script');
  }
}

module.exports = FlakyTestManager;