#!/usr/bin/env node

/**
 * Test Failure Analyzer
 * Analyzes test results and generates data for issue creation
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

class TestFailureAnalyzer {
  constructor(testResultsPath) {
    this.testResultsPath = testResultsPath;
    this.failureData = [];
  }

  async analyze() {
    if (!fs.existsSync(this.testResultsPath)) {
      console.error(`Test results path not found: ${this.testResultsPath}`);
      return [];
    }

    // Find all test result files
    const resultFiles = glob.sync(`${this.testResultsPath}/**/*.{json,xml}`, { 
      ignore: ['**/node_modules/**'] 
    });

    for (const file of resultFiles) {
      await this.analyzeResultFile(file);
    }

    return this.failureData;
  }

  async analyzeResultFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      if (filePath.endsWith('.json')) {
        await this.analyzeJsonResults(content, filePath);
      } else if (filePath.endsWith('.xml')) {
        await this.analyzeXmlResults(content, filePath);
      }
    } catch (error) {
      console.error(`Error analyzing ${filePath}:`, error.message);
    }
  }

  async analyzeJsonResults(content, filePath) {
    try {
      const results = JSON.parse(content);
      
      // Handle Vitest results format
      if (results.testResults) {
        for (const testResult of results.testResults) {
          if (testResult.status === 'failed') {
            this.processFailedTest(testResult, 'vitest', filePath);
          }
        }
      }

      // Handle Playwright results format
      if (results.suites) {
        this.processPlaywrightResults(results, filePath);
      }

      // Handle Jest results format
      if (results.numFailedTests > 0) {
        this.processJestResults(results, filePath);
      }
    } catch (error) {
      console.error(`Error parsing JSON results from ${filePath}:`, error.message);
    }
  }

  async analyzeXmlResults(content, filePath) {
    // Basic XML parsing for JUnit format
    const failureMatches = content.match(/<testcase[^>]*>[\s\S]*?<failure[^>]*>([\s\S]*?)<\/failure>[\s\S]*?<\/testcase>/g);
    
    if (failureMatches) {
      for (const match of failureMatches) {
        const testName = this.extractXmlAttribute(match, 'testcase', 'name');
        const className = this.extractXmlAttribute(match, 'testcase', 'classname');
        const failureMessage = this.extractXmlContent(match, 'failure');
        
        this.failureData.push({
          testSuite: this.determineTestSuite(filePath),
          failureType: this.classifyFailureType(failureMessage),
          testName: testName || 'Unknown Test',
          className: className || 'Unknown Class',
          errorMessage: failureMessage || 'No error message available',
          stackTrace: failureMessage || '',
          testFramework: 'junit',
          affectedFiles: [filePath],
          severity: this.determineSeverity(failureMessage),
          isFlaky: false, // Will be determined by flaky test analyzer
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  processFailedTest(testResult, framework, filePath) {
    const failureData = {
      testSuite: this.determineTestSuite(filePath),
      failureType: this.classifyFailureType(testResult.message || testResult.failureMessage),
      testName: testResult.fullName || testResult.title || testResult.name,
      errorMessage: testResult.message || testResult.failureMessage || 'Test failed',
      stackTrace: testResult.stack || testResult.trace || '',
      testFramework: framework,
      affectedFiles: this.extractAffectedFiles(testResult),
      severity: this.determineSeverity(testResult.message || testResult.failureMessage),
      isFlaky: this.checkIfFlaky(testResult),
      timestamp: new Date().toISOString(),
      executionTime: testResult.duration || 0,
      retryCount: testResult.retries || 0
    };

    this.failureData.push(failureData);
  }

  processPlaywrightResults(results, filePath) {
    const processTests = (tests) => {
      for (const test of tests) {
        if (test.outcome === 'failed' || test.outcome === 'timedOut') {
          this.processFailedTest({
            fullName: test.title,
            message: test.error?.message || 'Test failed',
            stack: test.error?.stack || '',
            duration: test.duration,
            retries: test.retry || 0
          }, 'playwright', filePath);
        }
      }
    };

    const processSuites = (suites) => {
      for (const suite of suites) {
        if (suite.tests) {
          processTests(suite.tests);
        }
        if (suite.suites) {
          processSuites(suite.suites);
        }
      }
    };

    processSuites(results.suites);
  }

  processJestResults(results, filePath) {
    for (const testResult of results.testResults) {
      if (testResult.status === 'failed') {
        for (const assertionResult of testResult.assertionResults) {
          if (assertionResult.status === 'failed') {
            this.processFailedTest({
              fullName: assertionResult.fullName,
              message: assertionResult.failureMessages?.join('\n') || 'Test failed',
              stack: assertionResult.failureMessages?.join('\n') || '',
              duration: assertionResult.duration
            }, 'jest', filePath);
          }
        }
      }
    }
  }

  determineTestSuite(filePath) {
    if (filePath.includes('unit')) return 'Unit Tests';
    if (filePath.includes('integration')) return 'Integration Tests';
    if (filePath.includes('e2e')) return 'E2E Tests';
    if (filePath.includes('visual')) return 'Visual Tests';
    if (filePath.includes('performance')) return 'Performance Tests';
    if (filePath.includes('security')) return 'Security Tests';
    return 'Unknown Test Suite';
  }

  classifyFailureType(errorMessage) {
    if (!errorMessage) return 'unknown';
    
    const message = errorMessage.toLowerCase();
    
    if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
    if (message.includes('assertion') || message.includes('expect')) return 'assertion';
    if (message.includes('network') || message.includes('fetch')) return 'network';
    if (message.includes('element not found') || message.includes('selector')) return 'element-not-found';
    if (message.includes('permission') || message.includes('unauthorized')) return 'permission';
    if (message.includes('database') || message.includes('sql')) return 'database';
    if (message.includes('memory') || message.includes('heap')) return 'memory';
    
    return 'assertion';
  }

  determineSeverity(errorMessage) {
    if (!errorMessage) return 'medium';
    
    const message = errorMessage.toLowerCase();
    
    if (message.includes('critical') || message.includes('security') || message.includes('data loss')) {
      return 'critical';
    }
    if (message.includes('timeout') || message.includes('network') || message.includes('database')) {
      return 'high';
    }
    if (message.includes('assertion') || message.includes('expect')) {
      return 'medium';
    }
    
    return 'low';
  }

  extractAffectedFiles(testResult) {
    const files = [];
    
    if (testResult.ancestorTitles) {
      // Try to extract file path from test structure
      const filePath = testResult.ancestorTitles[0];
      if (filePath && filePath.includes('.')) {
        files.push(filePath);
      }
    }
    
    if (testResult.stack) {
      // Extract file paths from stack trace
      const stackLines = testResult.stack.split('\n');
      for (const line of stackLines) {
        const match = line.match(/at .* \(([^)]+)\)/);
        if (match && match[1] && match[1].includes('.')) {
          files.push(match[1]);
        }
      }
    }
    
    return [...new Set(files)]; // Remove duplicates
  }

  checkIfFlaky(testResult) {
    // Basic flaky test detection - will be enhanced by flaky test analyzer
    return testResult.retries > 0 || 
           (testResult.message && testResult.message.includes('intermittent'));
  }

  extractXmlAttribute(xml, element, attribute) {
    const regex = new RegExp(`<${element}[^>]*${attribute}="([^"]*)"`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  extractXmlContent(xml, element) {
    const regex = new RegExp(`<${element}[^>]*>(.*?)<\/${element}>`, 'is');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }
}

// CLI interface
if (require.main === module) {
  const testResultsPath = process.argv[2] || 'test-results';
  
  (async () => {
    try {
      const analyzer = new TestFailureAnalyzer(testResultsPath);
      const failures = await analyzer.analyze();
      
      if (failures.length > 0) {
        console.log(JSON.stringify(failures, null, 2));
      } else {
        console.log('[]'); // Empty array for no failures
      }
    } catch (error) {
      console.error('Test failure analysis failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = TestFailureAnalyzer;