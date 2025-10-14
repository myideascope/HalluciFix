#!/usr/bin/env node

/**
 * Test Reporter Script
 * 
 * Generates comprehensive test reports for local development
 * and provides insights into test health and trends.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestReporter {
  constructor() {
    this.projectRoot = process.cwd();
    this.reportsDir = path.join(this.projectRoot, 'test-reports');
    this.coverageDir = path.join(this.projectRoot, 'coverage');
    this.testResultsDir = path.join(this.projectRoot, 'test-results');
    
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async generateReport(options = {}) {
    console.log('📊 Generating comprehensive test report...\n');

    try {
      const reportData = {
        timestamp: new Date().toISOString(),
        project: this.getProjectInfo(),
        testResults: await this.collectTestResults(),
        coverage: await this.collectCoverageData(),
        performance: await this.collectPerformanceData(),
        trends: await this.analyzeTrends()
      };

      await this.generateHTMLReport(reportData);
      await this.generateMarkdownReport(reportData);
      await this.generateJSONReport(reportData);

      console.log('✅ Test report generated successfully!');
      console.log(`📁 Reports available in: ${this.reportsDir}`);

    } catch (error) {
      console.error('❌ Failed to generate test report:', error.message);
      process.exit(1);
    }
  }

  getProjectInfo() {
    const packageJson = JSON.parse(fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8'));
    
    return {
      name: packageJson.name || 'Unknown Project',
      version: packageJson.version || '0.0.0',
      description: packageJson.description || '',
      scripts: Object.keys(packageJson.scripts || {}).filter(script => script.includes('test'))
    };
  }

  async collectTestResults() {
    const results = {
      unit: { status: 'unknown', duration: 0, tests: 0, passed: 0, failed: 0 },
      integration: { status: 'unknown', duration: 0, tests: 0, passed: 0, failed: 0 },
      e2e: { status: 'unknown', duration: 0, tests: 0, passed: 0, failed: 0 }
    };

    try {
      // Run unit tests and capture results
      console.log('🧪 Running unit tests...');
      const unitStart = Date.now();
      execSync('npm run test:run', { stdio: 'pipe' });
      results.unit.duration = Date.now() - unitStart;
      results.unit.status = 'success';
    } catch (error) {
      results.unit.status = 'failure';
      console.log('⚠️  Unit tests failed or not available');
    }

    try {
      // Run integration tests
      console.log('🔗 Running integration tests...');
      const integrationStart = Date.now();
      execSync('npm run test:integration', { stdio: 'pipe' });
      results.integration.duration = Date.now() - integrationStart;
      results.integration.status = 'success';
    } catch (error) {
      results.integration.status = 'failure';
      console.log('⚠️  Integration tests failed or not available');
    }

    // Note: E2E tests are not run automatically due to their complexity
    console.log('ℹ️  E2E tests skipped (run manually with npm run test:e2e)');

    return results;
  }

  async collectCoverageData() {
    const coverageSummaryPath = path.join(this.coverageDir, 'coverage-summary.json');
    
    if (!fs.existsSync(coverageSummaryPath)) {
      console.log('⚠️  No coverage data found. Run tests with coverage first.');
      return null;
    }

    try {
      const coverageData = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
      return {
        total: coverageData.total,
        files: Object.keys(coverageData).filter(key => key !== 'total').length,
        timestamp: fs.statSync(coverageSummaryPath).mtime
      };
    } catch (error) {
      console.log('⚠️  Failed to parse coverage data:', error.message);
      return null;
    }
  }

  async collectPerformanceData() {
    // Check for Playwright performance results
    const performanceDir = path.join(this.testResultsDir);
    
    if (!fs.existsSync(performanceDir)) {
      return null;
    }

    try {
      const performanceFiles = fs.readdirSync(performanceDir)
        .filter(file => file.includes('performance') && file.endsWith('.json'));
      
      if (performanceFiles.length === 0) {
        return null;
      }

      // Read the most recent performance file
      const latestFile = performanceFiles.sort().pop();
      const performanceData = JSON.parse(
        fs.readFileSync(path.join(performanceDir, latestFile), 'utf8')
      );

      return {
        file: latestFile,
        data: performanceData,
        timestamp: fs.statSync(path.join(performanceDir, latestFile)).mtime
      };
    } catch (error) {
      console.log('⚠️  Failed to collect performance data:', error.message);
      return null;
    }
  }

  async analyzeTrends() {
    const trendsFile = path.join(this.reportsDir, 'trends.json');
    
    let trends = [];
    if (fs.existsSync(trendsFile)) {
      try {
        trends = JSON.parse(fs.readFileSync(trendsFile, 'utf8'));
      } catch (error) {
        console.log('⚠️  Failed to load trends data:', error.message);
      }
    }

    // Add current data point
    const currentData = {
      timestamp: new Date().toISOString(),
      coverage: this.coverage ? this.coverage.total.lines.pct : 0,
      testCount: 0 // Would be populated from actual test results
    };

    trends.push(currentData);

    // Keep only last 30 data points
    if (trends.length > 30) {
      trends = trends.slice(-30);
    }

    // Save updated trends
    fs.writeFileSync(trendsFile, JSON.stringify(trends, null, 2));

    return trends;
  }

  async generateHTMLReport(data) {
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Report - ${data.project.name}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 30px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-value { font-size: 2.5em; font-weight: bold; margin-bottom: 10px; }
        .metric-label { color: #666; font-size: 1.1em; }
        .status-success { color: #28a745; }
        .status-failure { color: #dc3545; }
        .status-warning { color: #ffc107; }
        .status-unknown { color: #6c757d; }
        .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .test-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .test-item { padding: 15px; border: 1px solid #eee; border-radius: 4px; }
        .coverage-bar { width: 100%; height: 20px; background: #eee; border-radius: 10px; overflow: hidden; margin: 10px 0; }
        .coverage-fill { height: 100%; background: linear-gradient(90deg, #dc3545 0%, #ffc107 50%, #28a745 100%); transition: width 0.3s ease; }
        .footer { text-align: center; color: #666; margin-top: 40px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 Test Report</h1>
            <h2>${data.project.name} v${data.project.version}</h2>
            <p><strong>Generated:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
        </div>

        <div class="metrics">
            <div class="metric-card">
                <div class="metric-value status-${data.testResults.unit.status}">
                    ${data.testResults.unit.status === 'success' ? '✅' : data.testResults.unit.status === 'failure' ? '❌' : '❓'}
                </div>
                <div class="metric-label">Unit Tests</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value status-${data.testResults.integration.status}">
                    ${data.testResults.integration.status === 'success' ? '✅' : data.testResults.integration.status === 'failure' ? '❌' : '❓'}
                </div>
                <div class="metric-label">Integration Tests</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value ${data.coverage ? 'status-success' : 'status-unknown'}">
                    ${data.coverage ? data.coverage.total.lines.pct.toFixed(1) + '%' : 'N/A'}
                </div>
                <div class="metric-label">Code Coverage</div>
            </div>
            
            <div class="metric-card">
                <div class="metric-value status-${data.testResults.e2e.status}">
                    ${data.testResults.e2e.status === 'success' ? '✅' : data.testResults.e2e.status === 'failure' ? '❌' : '⏭️'}
                </div>
                <div class="metric-label">E2E Tests</div>
            </div>
        </div>

        ${data.coverage ? `
        <div class="section">
            <h3>📊 Coverage Details</h3>
            <div class="test-grid">
                <div class="test-item">
                    <strong>Lines Coverage</strong>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${data.coverage.total.lines.pct}%"></div>
                    </div>
                    <span>${data.coverage.total.lines.pct.toFixed(1)}% (${data.coverage.total.lines.covered}/${data.coverage.total.lines.total})</span>
                </div>
                <div class="test-item">
                    <strong>Functions Coverage</strong>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${data.coverage.total.functions.pct}%"></div>
                    </div>
                    <span>${data.coverage.total.functions.pct.toFixed(1)}% (${data.coverage.total.functions.covered}/${data.coverage.total.functions.total})</span>
                </div>
                <div class="test-item">
                    <strong>Branches Coverage</strong>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${data.coverage.total.branches.pct}%"></div>
                    </div>
                    <span>${data.coverage.total.branches.pct.toFixed(1)}% (${data.coverage.total.branches.covered}/${data.coverage.total.branches.total})</span>
                </div>
                <div class="test-item">
                    <strong>Statements Coverage</strong>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${data.coverage.total.statements.pct}%"></div>
                    </div>
                    <span>${data.coverage.total.statements.pct.toFixed(1)}% (${data.coverage.total.statements.covered}/${data.coverage.total.statements.total})</span>
                </div>
            </div>
        </div>
        ` : ''}

        <div class="section">
            <h3>⏱️ Test Execution Times</h3>
            <div class="test-grid">
                <div class="test-item">
                    <strong>Unit Tests</strong><br>
                    Duration: ${data.testResults.unit.duration}ms<br>
                    Status: <span class="status-${data.testResults.unit.status}">${data.testResults.unit.status}</span>
                </div>
                <div class="test-item">
                    <strong>Integration Tests</strong><br>
                    Duration: ${data.testResults.integration.duration}ms<br>
                    Status: <span class="status-${data.testResults.integration.status}">${data.testResults.integration.status}</span>
                </div>
                <div class="test-item">
                    <strong>E2E Tests</strong><br>
                    Duration: Not run<br>
                    Status: <span class="status-${data.testResults.e2e.status}">Skipped</span>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>Generated by HalluciFix Test Reporter • ${new Date().toISOString()}</p>
        </div>
    </div>
</body>
</html>`;

    const reportPath = path.join(this.reportsDir, 'test-report.html');
    fs.writeFileSync(reportPath, htmlTemplate);
    console.log(`📄 HTML report: ${reportPath}`);
  }

  async generateMarkdownReport(data) {
    const markdown = `# Test Report

**Project:** ${data.project.name} v${data.project.version}  
**Generated:** ${new Date(data.timestamp).toLocaleString()}

## Summary

| Test Type | Status | Duration |
|-----------|--------|----------|
| Unit Tests | ${data.testResults.unit.status} | ${data.testResults.unit.duration}ms |
| Integration Tests | ${data.testResults.integration.status} | ${data.testResults.integration.duration}ms |
| E2E Tests | ${data.testResults.e2e.status} | Skipped |

## Coverage

${data.coverage ? `
| Metric | Coverage | Covered/Total |
|--------|----------|---------------|
| Lines | ${data.coverage.total.lines.pct.toFixed(1)}% | ${data.coverage.total.lines.covered}/${data.coverage.total.lines.total} |
| Functions | ${data.coverage.total.functions.pct.toFixed(1)}% | ${data.coverage.total.functions.covered}/${data.coverage.total.functions.total} |
| Branches | ${data.coverage.total.branches.pct.toFixed(1)}% | ${data.coverage.total.branches.covered}/${data.coverage.total.branches.total} |
| Statements | ${data.coverage.total.statements.pct.toFixed(1)}% | ${data.coverage.total.statements.covered}/${data.coverage.total.statements.total} |
` : 'No coverage data available. Run tests with coverage to see detailed metrics.'}

## Recommendations

${this.generateRecommendations(data)}

---
*Generated by HalluciFix Test Reporter*`;

    const reportPath = path.join(this.reportsDir, 'test-report.md');
    fs.writeFileSync(reportPath, markdown);
    console.log(`📄 Markdown report: ${reportPath}`);
  }

  async generateJSONReport(data) {
    const reportPath = path.join(this.reportsDir, 'test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(data, null, 2));
    console.log(`📄 JSON report: ${reportPath}`);
  }

  generateRecommendations(data) {
    const recommendations = [];

    // Test status recommendations
    if (data.testResults.unit.status === 'failure') {
      recommendations.push('- ❌ Fix failing unit tests before proceeding');
    }
    if (data.testResults.integration.status === 'failure') {
      recommendations.push('- ❌ Address integration test failures');
    }

    // Coverage recommendations
    if (data.coverage) {
      if (data.coverage.total.lines.pct < 80) {
        recommendations.push('- 📊 Increase line coverage to at least 80%');
      }
      if (data.coverage.total.functions.pct < 80) {
        recommendations.push('- 🔧 Add tests for uncovered functions');
      }
      if (data.coverage.total.branches.pct < 80) {
        recommendations.push('- 🌿 Test more conditional branches and edge cases');
      }
    } else {
      recommendations.push('- 📊 Run tests with coverage to get detailed metrics');
    }

    // E2E recommendations
    if (data.testResults.e2e.status === 'unknown') {
      recommendations.push('- 🎭 Run E2E tests to ensure end-to-end functionality');
    }

    // Performance recommendations
    if (data.testResults.unit.duration > 30000) {
      recommendations.push('- ⚡ Unit tests are slow (>30s), consider optimization');
    }
    if (data.testResults.integration.duration > 60000) {
      recommendations.push('- ⚡ Integration tests are slow (>60s), consider optimization');
    }

    if (recommendations.length === 0) {
      recommendations.push('- ✅ All tests look good! Keep up the excellent work.');
    }

    return recommendations.join('\n');
  }
}

// CLI interface
if (require.main === module) {
  const reporter = new TestReporter();
  
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  args.forEach(arg => {
    if (arg === '--verbose') options.verbose = true;
    if (arg === '--coverage-only') options.coverageOnly = true;
  });

  reporter.generateReport(options).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = TestReporter;