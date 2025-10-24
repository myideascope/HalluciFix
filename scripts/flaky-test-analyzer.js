#!/usr/bin/env node

/**
 * Flaky Test Analyzer
 * Analyzes test results to identify flaky tests
 */

const fs = require('fs');
const path = require('path');

class FlakyTestAnalyzer {
  constructor(testResultsPath) {
    this.testResultsPath = testResultsPath;
    this.flakyThreshold = 10; // 10% failure rate to be considered flaky
    this.minRuns = 5; // Minimum runs to consider for flaky analysis
    this.historyPath = path.join(process.cwd(), '.github', 'test-history.json');
  }

  async analyze() {
    if (!fs.existsSync(this.testResultsPath)) {
      console.error(`Test results path not found: ${this.testResultsPath}`);
      return [];
    }

    const currentResults = await this.loadCurrentResults();
    const testHistory = await this.loadTestHistory();
    
    const updatedHistory = this.updateTestHistory(testHistory, currentResults);
    await this.saveTestHistory(updatedHistory);
    
    const flakyTests = this.identifyFlakyTests(updatedHistory);
    
    return flakyTests.map(test => this.generateFlakyTestData(test, updatedHistory));
  }

  async loadCurrentResults() {
    const results = [];
    const resultFiles = this.findResultFiles(this.testResultsPath);
    
    for (const file of resultFiles) {
      const fileResults = await this.parseResultFile(file);
      results.push(...fileResults);
    }
    
    return results;
  }

  findResultFiles(dir) {
    const files = [];
    
    if (!fs.existsSync(dir)) return files;
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        files.push(...this.findResultFiles(fullPath));
      } else if (entry.name.endsWith('.json') || entry.name.endsWith('.xml')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  async parseResultFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      if (filePath.endsWith('.json')) {
        return this.parseJsonResults(content, filePath);
      } else if (filePath.endsWith('.xml')) {
        return this.parseXmlResults(content, filePath);
      }
    } catch (error) {
      console.error(`Error parsing ${filePath}:`, error.message);
      return [];
    }
    
    return [];
  }

  parseJsonResults(content, filePath) {
    const results = [];
    
    try {
      const data = JSON.parse(content);
      
      // Handle Vitest results
      if (data.testResults) {
        for (const testResult of data.testResults) {
          results.push({
            name: testResult.fullName || testResult.name,
            file: testResult.ancestorTitles?.[0] || filePath,
            status: testResult.status,
            duration: testResult.duration || 0,
            error: testResult.message || null,
            timestamp: new Date().toISOString(),
            framework: 'vitest'
          });
        }
      }
      
      // Handle Playwright results
      if (data.suites) {
        this.extractPlaywrightTests(data.suites, results, filePath);
      }
      
      // Handle Jest results
      if (data.testResults && Array.isArray(data.testResults)) {
        for (const testFile of data.testResults) {
          for (const assertion of testFile.assertionResults || []) {
            results.push({
              name: assertion.fullName,
              file: testFile.name,
              status: assertion.status,
              duration: assertion.duration || 0,
              error: assertion.failureMessages?.join('\n') || null,
              timestamp: new Date().toISOString(),
              framework: 'jest'
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error parsing JSON from ${filePath}:`, error.message);
    }
    
    return results;
  }

  extractPlaywrightTests(suites, results, filePath) {
    for (const suite of suites) {
      if (suite.tests) {
        for (const test of suite.tests) {
          results.push({
            name: test.title,
            file: suite.title || filePath,
            status: test.outcome === 'expected' ? 'passed' : test.outcome,
            duration: test.duration || 0,
            error: test.error?.message || null,
            timestamp: new Date().toISOString(),
            framework: 'playwright'
          });
        }
      }
      
      if (suite.suites) {
        this.extractPlaywrightTests(suite.suites, results, filePath);
      }
    }
  }

  parseXmlResults(content, filePath) {
    const results = [];
    
    // Basic XML parsing for JUnit format
    const testcaseRegex = /<testcase[^>]*name="([^"]*)"[^>]*time="([^"]*)"[^>]*>(.*?)<\/testcase>/gs;
    let match;
    
    while ((match = testcaseRegex.exec(content)) !== null) {
      const [, name, time, body] = match;
      const hasFailure = body.includes('<failure') || body.includes('<error');
      
      results.push({
        name: name,
        file: filePath,
        status: hasFailure ? 'failed' : 'passed',
        duration: parseFloat(time) * 1000, // Convert to ms
        error: hasFailure ? this.extractXmlFailureMessage(body) : null,
        timestamp: new Date().toISOString(),
        framework: 'junit'
      });
    }
    
    return results;
  }

  extractXmlFailureMessage(body) {
    const failureMatch = body.match(/<failure[^>]*>(.*?)<\/failure>/s);
    if (failureMatch) return failureMatch[1].trim();
    
    const errorMatch = body.match(/<error[^>]*>(.*?)<\/error>/s);
    if (errorMatch) return errorMatch[1].trim();
    
    return 'Test failed';
  }

  async loadTestHistory() {
    if (fs.existsSync(this.historyPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.historyPath, 'utf8'));
      } catch (error) {
        console.error('Error loading test history:', error.message);
      }
    }
    
    return {};
  }

  updateTestHistory(history, currentResults) {
    const now = new Date().toISOString();
    
    for (const result of currentResults) {
      const testKey = `${result.file}::${result.name}`;
      
      if (!history[testKey]) {
        history[testKey] = {
          name: result.name,
          file: result.file,
          framework: result.framework,
          runs: [],
          firstSeen: now,
          lastSeen: now
        };
      }
      
      history[testKey].runs.push({
        timestamp: result.timestamp,
        status: result.status,
        duration: result.duration,
        error: result.error
      });
      
      history[testKey].lastSeen = now;
      
      // Keep only last 100 runs to prevent unbounded growth
      if (history[testKey].runs.length > 100) {
        history[testKey].runs = history[testKey].runs.slice(-100);
      }
    }
    
    return history;
  }

  async saveTestHistory(history) {
    try {
      const dir = path.dirname(this.historyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.historyPath, JSON.stringify(history, null, 2));
    } catch (error) {
      console.error('Error saving test history:', error.message);
    }
  }

  identifyFlakyTests(history) {
    const flakyTests = [];
    
    for (const [testKey, testData] of Object.entries(history)) {
      if (testData.runs.length < this.minRuns) continue;
      
      const recentRuns = testData.runs.slice(-20); // Last 20 runs
      const failures = recentRuns.filter(run => run.status === 'failed' || run.status === 'timedOut');
      const failureRate = (failures.length / recentRuns.length) * 100;
      
      // Consider flaky if failure rate is between threshold and 90% (not consistently failing)
      if (failureRate >= this.flakyThreshold && failureRate < 90) {
        flakyTests.push({
          testKey,
          testData,
          failureRate,
          recentFailures: failures,
          recentRuns: recentRuns.length,
          totalRuns: testData.runs.length
        });
      }
    }
    
    return flakyTests.sort((a, b) => b.failureRate - a.failureRate);
  }

  generateFlakyTestData(flakyTest, history) {
    const { testData, failureRate, recentFailures, recentRuns, totalRuns } = flakyTest;
    
    return {
      testName: testData.name,
      testFile: testData.file,
      testSuite: this.determineTestSuite(testData.file),
      failureRate: failureRate.toFixed(1),
      failures: recentFailures.length,
      totalRuns: totalRuns,
      firstFailureDate: this.getFirstFailureDate(testData.runs),
      recentFailuresCount: recentFailures.length,
      timePeriod: '20 runs',
      failureFrequency: this.calculateFailureFrequency(testData.runs),
      recentFailures: this.formatRecentFailures(recentFailures),
      errorPatterns: this.analyzeErrorPatterns(recentFailures),
      environmentData: this.analyzeEnvironmentCorrelation(testData.runs),
      avgExecutionTime: this.calculateAverageExecutionTime(testData.runs),
      timeoutThreshold: this.estimateTimeoutThreshold(testData.runs),
      timingVariance: this.calculateTimingVariance(testData.runs),
      affectedFiles: [testData.file]
    };
  }

  determineTestSuite(filePath) {
    if (filePath.includes('unit') || filePath.includes('src/')) return 'Unit Tests';
    if (filePath.includes('integration')) return 'Integration Tests';
    if (filePath.includes('e2e')) return 'E2E Tests';
    if (filePath.includes('visual')) return 'Visual Tests';
    if (filePath.includes('performance')) return 'Performance Tests';
    return 'Unknown Test Suite';
  }

  getFirstFailureDate(runs) {
    const firstFailure = runs.find(run => run.status === 'failed' || run.status === 'timedOut');
    return firstFailure ? firstFailure.timestamp : 'Unknown';
  }

  calculateFailureFrequency(runs) {
    if (runs.length < 2) return 'Insufficient data';
    
    const failures = runs.filter(run => run.status === 'failed' || run.status === 'timedOut');
    const totalDays = (new Date(runs[runs.length - 1].timestamp) - new Date(runs[0].timestamp)) / (1000 * 60 * 60 * 24);
    
    if (totalDays < 1) return 'Multiple times per day';
    
    const failuresPerDay = failures.length / totalDays;
    
    if (failuresPerDay > 1) return 'Daily';
    if (failuresPerDay > 0.2) return 'Weekly';
    if (failuresPerDay > 0.03) return 'Monthly';
    
    return 'Rarely';
  }

  formatRecentFailures(failures) {
    return failures.slice(0, 3).map(failure => ({
      date: failure.timestamp,
      error: failure.error || 'No error message'
    }));
  }

  analyzeErrorPatterns(failures) {
    const patterns = {};
    
    for (const failure of failures) {
      if (!failure.error) continue;
      
      const error = failure.error.toLowerCase();
      let pattern = 'unknown';
      
      if (error.includes('timeout')) pattern = 'timeout';
      else if (error.includes('element not found')) pattern = 'element-not-found';
      else if (error.includes('network')) pattern = 'network';
      else if (error.includes('assertion')) pattern = 'assertion';
      else if (error.includes('permission')) pattern = 'permission';
      
      patterns[pattern] = (patterns[pattern] || 0) + 1;
    }
    
    return Object.entries(patterns).map(([type, count]) => ({
      type: type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: this.getPatternDescription(type),
      frequency: ((count / failures.length) * 100).toFixed(1)
    }));
  }

  getPatternDescription(pattern) {
    const descriptions = {
      'timeout': 'Test execution exceeded time limit',
      'element-not-found': 'UI elements not found or not ready',
      'network': 'Network connectivity or API issues',
      'assertion': 'Test assertions failed unexpectedly',
      'permission': 'Permission or authentication issues',
      'unknown': 'Unclassified error pattern'
    };
    
    return descriptions[pattern] || 'Unknown error pattern';
  }

  analyzeEnvironmentCorrelation(runs) {
    // Simple environment analysis - in production, this would be more sophisticated
    const environments = {
      ci: { failures: 0, total: 0 },
      local: { failures: 0, total: 0 },
      staging: { failures: 0, total: 0 },
      production: { failures: 0, total: 0 }
    };
    
    for (const run of runs) {
      // Heuristic environment detection based on timing and patterns
      let env = 'ci'; // Default assumption
      
      if (run.duration > 30000) env = 'local'; // Slow execution suggests local
      
      environments[env].total++;
      if (run.status === 'failed' || run.status === 'timedOut') {
        environments[env].failures++;
      }
    }
    
    const result = {};
    for (const [env, data] of Object.entries(environments)) {
      if (data.total > 0) {
        result[env] = {
          failureRate: ((data.failures / data.total) * 100).toFixed(1),
          notes: data.failures > 0 ? `${data.failures}/${data.total} failures` : 'No failures'
        };
      }
    }
    
    return result;
  }

  calculateAverageExecutionTime(runs) {
    const durations = runs.map(run => run.duration || 0).filter(d => d > 0);
    if (durations.length === 0) return 0;
    
    return Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);
  }

  estimateTimeoutThreshold(runs) {
    const durations = runs.map(run => run.duration || 0).filter(d => d > 0);
    if (durations.length === 0) return 30000; // Default 30s
    
    const maxDuration = Math.max(...durations);
    return Math.max(maxDuration * 1.5, 30000); // 1.5x max or 30s minimum
  }

  calculateTimingVariance(runs) {
    const durations = runs.map(run => run.duration || 0).filter(d => d > 0);
    if (durations.length < 2) return 0;
    
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
    
    return Math.round(Math.sqrt(variance));
  }
}

// CLI interface
if (require.main === module) {
  const testResultsPath = process.argv[2] || 'test-results';
  
  (async () => {
    try {
      const analyzer = new FlakyTestAnalyzer(testResultsPath);
      const flakyTests = await analyzer.analyze();
      
      if (flakyTests.length > 0) {
        console.log(JSON.stringify(flakyTests, null, 2));
      } else {
        console.log('[]'); // Empty array for no flaky tests
      }
    } catch (error) {
      console.error('Flaky test analysis failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = FlakyTestAnalyzer;