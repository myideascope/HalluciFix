#!/usr/bin/env node

/**
 * Test History Tracker
 * 
 * Tracks test execution history, identifies flaky tests, and maintains
 * performance baselines for intelligent test optimization.
 */

const fs = require('fs');
const path = require('path');

class TestHistoryTracker {
  constructor(options = {}) {
    this.historyFile = options.historyFile || '.github/test-history.json';
    this.maxHistoryEntries = options.maxHistoryEntries || 1000;
    this.flakyThreshold = options.flakyThreshold || 0.1;
    this.minExecutionsForFlaky = options.minExecutionsForFlaky || 5;
    
    this.loadHistory();
  }

  /**
   * Load existing test history
   */
  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        this.history = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
      } else {
        this.history = this.createEmptyHistory();
      }
      
      // Ensure all required properties exist
      this.history = {
        ...this.createEmptyHistory(),
        ...this.history
      };
      
    } catch (error) {
      console.warn(`Warning: Could not load test history: ${error.message}`);
      this.history = this.createEmptyHistory();
    }
  }

  /**
   * Create empty history structure
   */
  createEmptyHistory() {
    return {
      executions: [],
      testResults: {},
      flakyTests: {},
      performanceBaselines: {},
      riskAnalysis: {},
      metadata: {
        version: '1.0.0',
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * Record a test execution
   */
  recordExecution(executionData) {
    const execution = {
      id: this.generateExecutionId(),
      timestamp: new Date().toISOString(),
      sha: executionData.sha || 'unknown',
      branch: executionData.branch || 'unknown',
      trigger: executionData.trigger || 'unknown',
      riskLevel: executionData.riskLevel || 'medium',
      testSuites: executionData.testSuites || [],
      duration: executionData.duration || 0,
      success: executionData.success || false,
      coverage: executionData.coverage || {},
      changedFiles: executionData.changedFiles || [],
      parallelism: executionData.parallelism || 1,
      retries: executionData.retries || 0
    };

    this.history.executions.push(execution);
    
    // Process individual test results
    if (executionData.testResults) {
      this.processTestResults(execution.id, executionData.testResults);
    }
    
    // Update performance baselines
    this.updatePerformanceBaselines(execution);
    
    // Update risk analysis
    this.updateRiskAnalysis(execution);
    
    // Cleanup old entries
    this.cleanupHistory();
    
    // Update metadata
    this.history.metadata.lastUpdated = new Date().toISOString();
    
    this.saveHistory();
    
    return execution.id;
  }

  /**
   * Generate unique execution ID
   */
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Process individual test results for flaky test detection
   */
  processTestResults(executionId, testResults) {
    for (const result of testResults) {
      const testKey = this.getTestKey(result);
      
      if (!this.history.testResults[testKey]) {
        this.history.testResults[testKey] = {
          name: result.name,
          suite: result.suite,
          file: result.file,
          executions: [],
          stats: {
            totalRuns: 0,
            failures: 0,
            successes: 0,
            avgDuration: 0,
            lastFailure: null,
            lastSuccess: null
          }
        };
      }
      
      const testHistory = this.history.testResults[testKey];
      
      // Record execution
      testHistory.executions.push({
        executionId,
        timestamp: new Date().toISOString(),
        success: result.success,
        duration: result.duration || 0,
        error: result.error || null,
        retries: result.retries || 0
      });
      
      // Update stats
      testHistory.stats.totalRuns++;
      if (result.success) {
        testHistory.stats.successes++;
        testHistory.stats.lastSuccess = new Date().toISOString();
      } else {
        testHistory.stats.failures++;
        testHistory.stats.lastFailure = new Date().toISOString();
      }
      
      // Update average duration
      const durations = testHistory.executions
        .filter(e => e.duration > 0)
        .map(e => e.duration);
      
      if (durations.length > 0) {
        testHistory.stats.avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      }
      
      // Keep only last 50 executions per test
      if (testHistory.executions.length > 50) {
        testHistory.executions = testHistory.executions.slice(-50);
      }
      
      // Update flaky test detection
      this.updateFlakyTestDetection(testKey, testHistory);
    }
  }

  /**
   * Generate test key for tracking
   */
  getTestKey(result) {
    return `${result.suite || 'unknown'}:${result.file || 'unknown'}:${result.name || 'unknown'}`;
  }

  /**
   * Update flaky test detection
   */
  updateFlakyTestDetection(testKey, testHistory) {
    const stats = testHistory.stats;
    
    if (stats.totalRuns >= this.minExecutionsForFlaky) {
      const failureRate = stats.failures / stats.totalRuns;
      
      // Detect flaky tests (failing sometimes but not always)
      if (failureRate >= this.flakyThreshold && failureRate < 0.9) {
        this.history.flakyTests[testKey] = {
          name: testHistory.name,
          suite: testHistory.suite,
          file: testHistory.file,
          failureRate,
          totalRuns: stats.totalRuns,
          failures: stats.failures,
          lastFailure: stats.lastFailure,
          detectedAt: this.history.flakyTests[testKey]?.detectedAt || new Date().toISOString(),
          severity: this.calculateFlakySeverity(failureRate, stats.totalRuns),
          pattern: this.analyzeFailurePattern(testHistory.executions)
        };
      } else if (this.history.flakyTests[testKey] && failureRate < this.flakyThreshold) {
        // Test is no longer flaky
        delete this.history.flakyTests[testKey];
      }
    }
  }

  /**
   * Calculate flaky test severity
   */
  calculateFlakySeverity(failureRate, totalRuns) {
    if (failureRate > 0.3) return 'high';
    if (failureRate > 0.2) return 'medium';
    return 'low';
  }

  /**
   * Analyze failure patterns in test executions
   */
  analyzeFailurePattern(executions) {
    const recentExecutions = executions.slice(-10);
    const failures = recentExecutions.filter(e => !e.success);
    
    if (failures.length === 0) return 'stable';
    if (failures.length === recentExecutions.length) return 'consistently_failing';
    
    // Check for patterns
    const failureIndices = recentExecutions
      .map((e, i) => e.success ? null : i)
      .filter(i => i !== null);
    
    if (failureIndices.length >= 2) {
      const gaps = [];
      for (let i = 1; i < failureIndices.length; i++) {
        gaps.push(failureIndices[i] - failureIndices[i - 1]);
      }
      
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avgGap <= 2) return 'frequent';
      if (avgGap >= 5) return 'sporadic';
    }
    
    return 'intermittent';
  }

  /**
   * Update performance baselines
   */
  updatePerformanceBaselines(execution) {
    const suite = execution.testSuites.join(',');
    
    if (!this.history.performanceBaselines[suite]) {
      this.history.performanceBaselines[suite] = {
        durations: [],
        avgDuration: 0,
        p95Duration: 0,
        trend: 'stable'
      };
    }
    
    const baseline = this.history.performanceBaselines[suite];
    baseline.durations.push({
      timestamp: execution.timestamp,
      duration: execution.duration,
      parallelism: execution.parallelism,
      success: execution.success
    });
    
    // Keep only last 100 measurements
    if (baseline.durations.length > 100) {
      baseline.durations = baseline.durations.slice(-100);
    }
    
    // Calculate statistics
    const successfulRuns = baseline.durations.filter(d => d.success);
    if (successfulRuns.length > 0) {
      const durations = successfulRuns.map(d => d.duration).sort((a, b) => a - b);
      baseline.avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      baseline.p95Duration = durations[Math.floor(durations.length * 0.95)] || baseline.avgDuration;
      
      // Analyze trend
      if (successfulRuns.length >= 10) {
        const recent = successfulRuns.slice(-5).map(d => d.duration);
        const older = successfulRuns.slice(-10, -5).map(d => d.duration);
        
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        
        const change = (recentAvg - olderAvg) / olderAvg;
        
        if (change > 0.1) baseline.trend = 'degrading';
        else if (change < -0.1) baseline.trend = 'improving';
        else baseline.trend = 'stable';
      }
    }
  }

  /**
   * Update risk analysis based on execution patterns
   */
  updateRiskAnalysis(execution) {
    const riskKey = execution.riskLevel;
    
    if (!this.history.riskAnalysis[riskKey]) {
      this.history.riskAnalysis[riskKey] = {
        executions: 0,
        successes: 0,
        failures: 0,
        avgDuration: 0,
        successRate: 0
      };
    }
    
    const analysis = this.history.riskAnalysis[riskKey];
    analysis.executions++;
    
    if (execution.success) {
      analysis.successes++;
    } else {
      analysis.failures++;
    }
    
    analysis.successRate = analysis.successes / analysis.executions;
    
    // Update average duration
    const recentExecutions = this.history.executions
      .filter(e => e.riskLevel === riskKey)
      .slice(-20);
    
    if (recentExecutions.length > 0) {
      analysis.avgDuration = recentExecutions
        .reduce((sum, e) => sum + e.duration, 0) / recentExecutions.length;
    }
  }

  /**
   * Get flaky tests report
   */
  getFlakyTestsReport() {
    const flakyTests = Object.values(this.history.flakyTests)
      .sort((a, b) => b.failureRate - a.failureRate);
    
    return {
      total: flakyTests.length,
      high: flakyTests.filter(t => t.severity === 'high').length,
      medium: flakyTests.filter(t => t.severity === 'medium').length,
      low: flakyTests.filter(t => t.severity === 'low').length,
      tests: flakyTests
    };
  }

  /**
   * Get performance trends report
   */
  getPerformanceTrends() {
    const trends = {};
    
    for (const [suite, baseline] of Object.entries(this.history.performanceBaselines)) {
      trends[suite] = {
        avgDuration: Math.round(baseline.avgDuration),
        p95Duration: Math.round(baseline.p95Duration),
        trend: baseline.trend,
        measurements: baseline.durations.length
      };
    }
    
    return trends;
  }

  /**
   * Get risk analysis report
   */
  getRiskAnalysis() {
    return this.history.riskAnalysis;
  }

  /**
   * Get recommendations based on history
   */
  getRecommendations() {
    const recommendations = [];
    
    // Flaky test recommendations
    const flakyReport = this.getFlakyTestsReport();
    if (flakyReport.high > 0) {
      recommendations.push({
        type: 'flaky_tests',
        severity: 'high',
        message: `${flakyReport.high} highly flaky tests detected. Consider quarantining or fixing.`,
        tests: flakyReport.tests.filter(t => t.severity === 'high').map(t => t.name)
      });
    }
    
    // Performance recommendations
    const trends = this.getPerformanceTrends();
    for (const [suite, trend] of Object.entries(trends)) {
      if (trend.trend === 'degrading') {
        recommendations.push({
          type: 'performance',
          severity: 'medium',
          message: `Test suite '${suite}' showing performance degradation. Average duration: ${trend.avgDuration}s`,
          suite
        });
      }
    }
    
    // Risk-based recommendations
    const riskAnalysis = this.getRiskAnalysis();
    for (const [risk, analysis] of Object.entries(riskAnalysis)) {
      if (analysis.successRate < 0.9 && analysis.executions >= 10) {
        recommendations.push({
          type: 'risk_analysis',
          severity: 'medium',
          message: `${risk} risk changes have low success rate (${Math.round(analysis.successRate * 100)}%). Consider additional validation.`,
          riskLevel: risk
        });
      }
    }
    
    return recommendations;
  }

  /**
   * Cleanup old history entries
   */
  cleanupHistory() {
    // Keep only recent executions
    if (this.history.executions.length > this.maxHistoryEntries) {
      this.history.executions = this.history.executions.slice(-this.maxHistoryEntries);
    }
    
    // Remove test results for tests that haven't run recently
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days
    
    for (const [testKey, testData] of Object.entries(this.history.testResults)) {
      const lastExecution = testData.executions[testData.executions.length - 1];
      if (lastExecution && new Date(lastExecution.timestamp) < cutoffDate) {
        delete this.history.testResults[testKey];
        delete this.history.flakyTests[testKey];
      }
    }
  }

  /**
   * Save history to file
   */
  saveHistory() {
    try {
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
    } catch (error) {
      console.error(`Error saving test history: ${error.message}`);
    }
  }

  /**
   * Export history data
   */
  exportHistory() {
    return {
      ...this.history,
      summary: {
        totalExecutions: this.history.executions.length,
        flakyTests: this.getFlakyTestsReport(),
        performanceTrends: this.getPerformanceTrends(),
        riskAnalysis: this.getRiskAnalysis(),
        recommendations: this.getRecommendations()
      }
    };
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const tracker = new TestHistoryTracker();
  
  switch (command) {
    case 'record':
      // Record execution from JSON input
      const executionData = JSON.parse(args[1] || '{}');
      const executionId = tracker.recordExecution(executionData);
      console.log(`Recorded execution: ${executionId}`);
      break;
      
    case 'flaky':
      // Get flaky tests report
      const flakyReport = tracker.getFlakyTestsReport();
      console.log(JSON.stringify(flakyReport, null, 2));
      break;
      
    case 'performance':
      // Get performance trends
      const trends = tracker.getPerformanceTrends();
      console.log(JSON.stringify(trends, null, 2));
      break;
      
    case 'recommendations':
      // Get recommendations
      const recommendations = tracker.getRecommendations();
      console.log(JSON.stringify(recommendations, null, 2));
      break;
      
    case 'export':
      // Export full history
      const history = tracker.exportHistory();
      console.log(JSON.stringify(history, null, 2));
      break;
      
    default:
      console.log('Usage: test-history-tracker.js <command> [args]');
      console.log('Commands:');
      console.log('  record <json>     - Record test execution');
      console.log('  flaky             - Get flaky tests report');
      console.log('  performance       - Get performance trends');
      console.log('  recommendations   - Get optimization recommendations');
      console.log('  export            - Export full history');
  }
}

module.exports = TestHistoryTracker;