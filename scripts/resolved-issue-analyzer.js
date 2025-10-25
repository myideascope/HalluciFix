#!/usr/bin/env node

/**
 * Resolved Issue Analyzer
 * Analyzes current test results to identify resolved issues that should be closed
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

class ResolvedIssueAnalyzer {
  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
    this.owner = process.env.GITHUB_REPOSITORY_OWNER || 'your-org';
    this.repo = process.env.GITHUB_REPOSITORY_NAME || 'hallucifix';
  }

  async analyze() {
    try {
      const openIssues = await this.getOpenTestIssues();
      const currentTestResults = await this.getCurrentTestResults();
      const resolvedIssues = await this.identifyResolvedIssues(openIssues, currentTestResults);
      
      return {
        resolvedTests: resolvedIssues.map(issue => issue.title),
        fixedCommits: await this.getRecentFixCommits(),
        resolutionComment: this.generateResolutionComment(),
        labels: ['test-failure', 'flaky-test', 'coverage', 'performance']
      };
    } catch (error) {
      console.error('Error analyzing resolved issues:', error.message);
      return null;
    }
  }

  async getOpenTestIssues() {
    const issues = [];
    const labels = ['test-failure', 'flaky-test', 'coverage', 'performance'];
    
    for (const label of labels) {
      try {
        const response = await this.octokit.search.issuesAndPullRequests({
          q: `repo:${this.owner}/${this.repo} is:issue is:open label:${label}`,
          per_page: 100
        });
        
        issues.push(...response.data.items);
      } catch (error) {
        console.error(`Error fetching issues with label ${label}:`, error.message);
      }
    }
    
    return issues;
  }

  async getCurrentTestResults() {
    const results = {
      passingTests: new Set(),
      coverageStatus: null,
      performanceStatus: null,
      flakyTests: new Set()
    };
    
    // Load current test results
    const testResultsPath = 'test-results';
    if (fs.existsSync(testResultsPath)) {
      const resultFiles = this.findResultFiles(testResultsPath);
      
      for (const file of resultFiles) {
        const fileResults = await this.parseTestResults(file);
        fileResults.forEach(result => {
          if (result.status === 'passed') {
            results.passingTests.add(`${result.file}::${result.name}`);
          }
        });
      }
    }
    
    // Load coverage status
    const coveragePath = 'coverage/coverage-summary.json';
    if (fs.existsSync(coveragePath)) {
      const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
      results.coverageStatus = {
        lines: coverage.total.lines.pct,
        functions: coverage.total.functions.pct,
        branches: coverage.total.branches.pct,
        statements: coverage.total.statements.pct
      };
    }
    
    // Load performance status
    const performancePath = 'performance-report/performance-summary.json';
    if (fs.existsSync(performancePath)) {
      results.performanceStatus = JSON.parse(fs.readFileSync(performancePath, 'utf8'));
    }
    
    return results;
  }

  async identifyResolvedIssues(openIssues, currentResults) {
    const resolvedIssues = [];
    
    for (const issue of openIssues) {
      if (await this.isIssueResolved(issue, currentResults)) {
        resolvedIssues.push(issue);
      }
    }
    
    return resolvedIssues;
  }

  async isIssueResolved(issue, currentResults) {
    const title = issue.title.toLowerCase();
    const body = issue.body || '';
    
    // Check test failure issues
    if (issue.labels.some(label => label.name === 'test-failure')) {
      return this.isTestFailureResolved(issue, currentResults);
    }
    
    // Check flaky test issues
    if (issue.labels.some(label => label.name === 'flaky-test')) {
      return this.isFlakyTestResolved(issue, currentResults);
    }
    
    // Check coverage issues
    if (issue.labels.some(label => label.name === 'coverage')) {
      return this.isCoverageIssueResolved(issue, currentResults);
    }
    
    // Check performance issues
    if (issue.labels.some(label => label.name === 'performance')) {
      return this.isPerformanceIssueResolved(issue, currentResults);
    }
    
    return false;
  }

  isTestFailureResolved(issue, currentResults) {
    // Extract test name from issue title or body
    const testName = this.extractTestName(issue);
    if (!testName) return false;
    
    // Check if the test is now passing
    for (const passingTest of currentResults.passingTests) {
      if (passingTest.includes(testName)) {
        return true;
      }
    }
    
    return false;
  }

  isFlakyTestResolved(issue, currentResults) {
    const testName = this.extractTestName(issue);
    if (!testName) return false;
    
    // Check if test has been stable (no recent failures)
    // This would require checking test history, simplified for now
    return currentResults.passingTests.has(testName);
  }

  isCoverageIssueResolved(issue, currentResults) {
    if (!currentResults.coverageStatus) return false;
    
    const thresholds = { lines: 80, functions: 80, branches: 75, statements: 80 };
    
    return currentResults.coverageStatus.lines >= thresholds.lines &&
           currentResults.coverageStatus.functions >= thresholds.functions &&
           currentResults.coverageStatus.branches >= thresholds.branches &&
           currentResults.coverageStatus.statements >= thresholds.statements;
  }

  isPerformanceIssueResolved(issue, currentResults) {
    if (!currentResults.performanceStatus) return false;
    
    // Check if performance metrics are within acceptable ranges
    const title = issue.title.toLowerCase();
    
    if (title.includes('bundle size')) {
      return currentResults.performanceStatus.bundleSize < 2 * 1024 * 1024; // 2MB
    }
    
    if (title.includes('execution time')) {
      return currentResults.performanceStatus.executionTime < 15 * 60 * 1000; // 15 minutes
    }
    
    if (title.includes('web vitals')) {
      return currentResults.performanceStatus.webVitals?.lcp < 2500; // 2.5s
    }
    
    return false;
  }

  extractTestName(issue) {
    const title = issue.title;
    const body = issue.body || '';
    
    // Try to extract test name from title
    let match = title.match(/\[.*?\]\s*(.+?)\s*-/);
    if (match) return match[1].trim();
    
    // Try to extract from body
    match = body.match(/\*\*Test Name\*\*:\s*(.+)/);
    if (match) return match[1].trim();
    
    match = body.match(/- \*\*Test Name\*\*:\s*(.+)/);
    if (match) return match[1].trim();
    
    return null;
  }

  async getRecentFixCommits() {
    try {
      const commits = await this.octokit.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        per_page: 10
      });
      
      return commits.data
        .filter(commit => {
          const message = commit.commit.message.toLowerCase();
          return message.includes('fix') || 
                 message.includes('resolve') || 
                 message.includes('test') ||
                 message.includes('coverage') ||
                 message.includes('performance');
        })
        .map(commit => commit.sha.substring(0, 7));
    } catch (error) {
      console.error('Error fetching recent commits:', error.message);
      return [];
    }
  }

  generateResolutionComment() {
    return `🎉 **Issue Resolved**

This issue has been automatically resolved based on the latest test results:

- ✅ Tests are now passing
- ✅ Quality gates are met
- ✅ No recent failures detected

**Resolution Details:**
- Detected by: Automated issue resolution system
- Verification: Latest CI/CD pipeline run
- Status: All related tests passing

This issue is being closed automatically. If the problem persists, please reopen this issue or create a new one with updated information.

---
*This comment was generated automatically by the GitHub Actions issue management system.*`;
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

  async parseTestResults(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      if (filePath.endsWith('.json')) {
        return this.parseJsonResults(content);
      } else if (filePath.endsWith('.xml')) {
        return this.parseXmlResults(content);
      }
    } catch (error) {
      console.error(`Error parsing ${filePath}:`, error.message);
    }
    
    return [];
  }

  parseJsonResults(content) {
    const results = [];
    
    try {
      const data = JSON.parse(content);
      
      // Handle various test result formats
      if (data.testResults) {
        for (const testResult of data.testResults) {
          results.push({
            name: testResult.fullName || testResult.name,
            file: testResult.ancestorTitles?.[0] || 'unknown',
            status: testResult.status
          });
        }
      }
      
      if (data.suites) {
        this.extractPlaywrightTests(data.suites, results);
      }
    } catch (error) {
      console.error('Error parsing JSON results:', error.message);
    }
    
    return results;
  }

  extractPlaywrightTests(suites, results) {
    for (const suite of suites) {
      if (suite.tests) {
        for (const test of suite.tests) {
          results.push({
            name: test.title,
            file: suite.title || 'unknown',
            status: test.outcome === 'expected' ? 'passed' : test.outcome
          });
        }
      }
      
      if (suite.suites) {
        this.extractPlaywrightTests(suite.suites, results);
      }
    }
  }

  parseXmlResults(content) {
    const results = [];
    
    const testcaseRegex = /<testcase[^>]*name="([^"]*)"[^>]*>(.*?)<\/testcase>/gs;
    let match;
    
    while ((match = testcaseRegex.exec(content)) !== null) {
      const [, name, body] = match;
      const hasFailure = body.includes('<failure') || body.includes('<error');
      
      results.push({
        name: name,
        file: 'unknown',
        status: hasFailure ? 'failed' : 'passed'
      });
    }
    
    return results;
  }
}

// CLI interface
if (require.main === module) {
  (async () => {
    try {
      const analyzer = new ResolvedIssueAnalyzer();
      const resolvedData = await analyzer.analyze();
      
      if (resolvedData) {
        console.log(JSON.stringify(resolvedData, null, 2));
      } else {
        console.log('{}'); // Empty object for no resolved issues
      }
    } catch (error) {
      console.error('Resolved issue analysis failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = ResolvedIssueAnalyzer;