#!/usr/bin/env node

/**
 * Test Health Monitor
 * 
 * Monitors test suite health, detects flaky tests, and provides
 * maintenance recommendations for the testing infrastructure.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestHealthMonitor {
  constructor() {
    this.projectRoot = process.cwd();
    this.healthDataDir = path.join(this.projectRoot, '.test-health');
    this.historyFile = path.join(this.healthDataDir, 'test-history.json');
    this.flakyTestsFile = path.join(this.healthDataDir, 'flaky-tests.json');
    this.performanceFile = path.join(this.healthDataDir, 'performance-history.json');
    
    // Ensure health data directory exists
    if (!fs.existsSync(this.healthDataDir)) {
      fs.mkdirSync(this.healthDataDir, { recursive: true });
    }
  }

  async monitor(options = {}) {
    console.log('🏥 Starting test health monitoring...\n');

    try {
      const healthData = {
        timestamp: new Date().toISOString(),
        testRuns: await this.runTestSuite(),
        flakyTests: await this.detectFlakyTests(),
        performance: await this.analyzePerformance(),
        coverage: await this.analyzeCoverage(),
        maintenance: await this.generateMaintenanceRecommendations()
      };

      await this.saveHealthData(healthData);
      await this.generateHealthReport(healthData);
      
      console.log('✅ Test health monitoring completed!');
      console.log(`📊 Health data saved to: ${this.healthDataDir}`);

      // Alert on critical issues
      if (healthData.flakyTests.length > 0) {
        console.log(`⚠️  Found ${healthData.flakyTests.length} flaky tests that need attention`);
      }

      if (healthData.maintenance.critical.length > 0) {
        console.log(`🚨 ${healthData.maintenance.critical.length} critical maintenance issues detected`);
      }

    } catch (error) {
      console.error('❌ Test health monitoring failed:', error.message);
      process.exit(1);
    }
  }

  async runTestSuite() {
    console.log('🧪 Running test suite for health analysis...');
    
    const testResults = {
      unit: { runs: [], avgDuration: 0, successRate: 0 },
      integration: { runs: [], avgDuration: 0, successRate: 0 },
      e2e: { runs: [], avgDuration: 0, successRate: 0 }
    };

    // Run tests multiple times to detect flakiness
    const runCount = 3;
    
    for (let i = 0; i < runCount; i++) {
      console.log(`  Run ${i + 1}/${runCount}...`);
      
      // Unit tests
      try {
        const start = Date.now();
        execSync('npm run test:run', { stdio: 'pipe' });
        const duration = Date.now() - start;
        testResults.unit.runs.push({ success: true, duration, timestamp: new Date().toISOString() });
      } catch (error) {
        testResults.unit.runs.push({ success: false, duration: 0, timestamp: new Date().toISOString(), error: error.message });
      }

      // Integration tests (if available)
      try {
        const start = Date.now();
        execSync('npm run test:integration', { stdio: 'pipe' });
        const duration = Date.now() - start;
        testResults.integration.runs.push({ success: true, duration, timestamp: new Date().toISOString() });
      } catch (error) {
        testResults.integration.runs.push({ success: false, duration: 0, timestamp: new Date().toISOString(), error: error.message });
      }

      // Small delay between runs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Calculate statistics
    Object.keys(testResults).forEach(testType => {
      const runs = testResults[testType].runs;
      if (runs.length > 0) {
        const successfulRuns = runs.filter(run => run.success);
        testResults[testType].successRate = (successfulRuns.length / runs.length) * 100;
        testResults[testType].avgDuration = successfulRuns.reduce((sum, run) => sum + run.duration, 0) / successfulRuns.length || 0;
      }
    });

    return testResults;
  }

  async detectFlakyTests() {
    console.log('🔍 Detecting flaky tests...');
    
    const flakyTests = [];
    
    // Load historical test data
    const history = this.loadTestHistory();
    
    // Analyze test patterns for flakiness
    const testPatterns = this.analyzeTestPatterns(history);
    
    testPatterns.forEach(pattern => {
      if (pattern.flakinessScore > 0.2) { // 20% failure rate threshold
        flakyTests.push({
          testName: pattern.testName,
          flakinessScore: pattern.flakinessScore,
          failureRate: pattern.failureRate,
          lastFailure: pattern.lastFailure,
          commonErrors: pattern.commonErrors,
          recommendation: this.getFlakyTestRecommendation(pattern)
        });
      }
    });

    // Save flaky tests data
    this.saveFlakyTests(flakyTests);
    
    return flakyTests;
  }

  analyzeTestPatterns(history) {
    const patterns = new Map();
    
    history.forEach(run => {
      run.tests?.forEach(test => {
        if (!patterns.has(test.name)) {
          patterns.set(test.name, {
            testName: test.name,
            runs: [],
            failures: 0,
            successes: 0
          });
        }
        
        const pattern = patterns.get(test.name);
        pattern.runs.push({
          success: test.success,
          duration: test.duration,
          timestamp: run.timestamp,
          error: test.error
        });
        
        if (test.success) {
          pattern.successes++;
        } else {
          pattern.failures++;
        }
      });
    });

    return Array.from(patterns.values()).map(pattern => ({
      ...pattern,
      flakinessScore: pattern.failures / (pattern.failures + pattern.successes),
      failureRate: (pattern.failures / pattern.runs.length) * 100,
      lastFailure: pattern.runs.filter(run => !run.success).pop()?.timestamp,
      commonErrors: this.getCommonErrors(pattern.runs.filter(run => !run.success))
    }));
  }

  getCommonErrors(failedRuns) {
    const errorCounts = {};
    
    failedRuns.forEach(run => {
      if (run.error) {
        const errorKey = run.error.split('\n')[0]; // First line of error
        errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
      }
    });

    return Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([error, count]) => ({ error, count }));
  }

  getFlakyTestRecommendation(pattern) {
    const recommendations = [];
    
    if (pattern.flakinessScore > 0.5) {
      recommendations.push('High flakiness - consider rewriting or removing test');
    } else if (pattern.flakinessScore > 0.3) {
      recommendations.push('Moderate flakiness - investigate timing issues');
    } else {
      recommendations.push('Low flakiness - monitor and add retry logic if needed');
    }

    // Analyze common error patterns
    pattern.commonErrors.forEach(({ error }) => {
      if (error.includes('timeout') || error.includes('Timeout')) {
        recommendations.push('Add longer timeouts or improve test stability');
      }
      if (error.includes('Element not found') || error.includes('not visible')) {
        recommendations.push('Add proper wait conditions for UI elements');
      }
      if (error.includes('Network') || error.includes('fetch')) {
        recommendations.push('Improve network mocking or add retry logic');
      }
    });

    return recommendations;
  }

  async analyzePerformance() {
    console.log('⚡ Analyzing test performance...');
    
    const performanceData = {
      trends: this.loadPerformanceHistory(),
      currentMetrics: {
        unitTestDuration: 0,
        integrationTestDuration: 0,
        e2eTestDuration: 0,
        totalTestCount: 0,
        slowTests: []
      },
      recommendations: []
    };

    // Analyze current performance
    try {
      const testOutput = execSync('npm run test:run -- --reporter=json', { encoding: 'utf8' });
      const testResults = JSON.parse(testOutput);
      
      performanceData.currentMetrics.totalTestCount = testResults.numTotalTests || 0;
      performanceData.currentMetrics.unitTestDuration = testResults.testResults?.reduce((sum, result) => sum + (result.perfStats?.runtime || 0), 0) || 0;
      
      // Identify slow tests (>5 seconds)
      testResults.testResults?.forEach(result => {
        if (result.perfStats?.runtime > 5000) {
          performanceData.currentMetrics.slowTests.push({
            name: result.testFilePath,
            duration: result.perfStats.runtime,
            recommendation: 'Consider optimizing or splitting this test'
          });
        }
      });
      
    } catch (error) {
      console.log('⚠️  Could not analyze detailed performance metrics');
    }

    // Generate performance recommendations
    if (performanceData.currentMetrics.unitTestDuration > 30000) {
      performanceData.recommendations.push('Unit tests are slow (>30s) - consider parallelization or optimization');
    }
    
    if (performanceData.currentMetrics.slowTests.length > 0) {
      performanceData.recommendations.push(`${performanceData.currentMetrics.slowTests.length} slow tests detected - review and optimize`);
    }

    // Save performance data
    this.savePerformanceHistory(performanceData);
    
    return performanceData;
  }

  async analyzeCoverage() {
    console.log('📊 Analyzing coverage trends...');
    
    const coveragePath = path.join(this.projectRoot, 'coverage', 'coverage-summary.json');
    
    if (!fs.existsSync(coveragePath)) {
      return { status: 'unavailable', message: 'No coverage data found' };
    }

    try {
      const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
      const trends = this.loadCoverageTrends();
      
      const currentCoverage = {
        lines: coverageData.total.lines.pct,
        functions: coverageData.total.functions.pct,
        branches: coverageData.total.branches.pct,
        statements: coverageData.total.statements.pct,
        timestamp: new Date().toISOString()
      };

      trends.push(currentCoverage);
      
      // Keep only last 30 data points
      if (trends.length > 30) {
        trends.splice(0, trends.length - 30);
      }

      this.saveCoverageTrends(trends);

      return {
        status: 'available',
        current: currentCoverage,
        trends: trends,
        analysis: this.analyzeCoverageTrends(trends)
      };
      
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  analyzeCoverageTrends(trends) {
    if (trends.length < 2) {
      return { trend: 'insufficient-data', message: 'Need more data points for trend analysis' };
    }

    const recent = trends.slice(-5); // Last 5 data points
    const older = trends.slice(-10, -5); // Previous 5 data points
    
    const recentAvg = recent.reduce((sum, point) => sum + point.lines, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((sum, point) => sum + point.lines, 0) / older.length : recentAvg;
    
    const trendDirection = recentAvg > olderAvg ? 'improving' : recentAvg < olderAvg ? 'declining' : 'stable';
    const trendMagnitude = Math.abs(recentAvg - olderAvg);
    
    return {
      trend: trendDirection,
      magnitude: trendMagnitude,
      message: `Coverage is ${trendDirection} by ${trendMagnitude.toFixed(1)}% over recent runs`
    };
  }

  async generateMaintenanceRecommendations() {
    console.log('🔧 Generating maintenance recommendations...');
    
    const recommendations = {
      critical: [],
      warning: [],
      info: []
    };

    // Check test file organization
    const testFiles = this.findTestFiles();
    
    if (testFiles.orphaned.length > 0) {
      recommendations.warning.push(`${testFiles.orphaned.length} test files may be orphaned (no corresponding source file)`);
    }
    
    if (testFiles.missing.length > 0) {
      recommendations.info.push(`${testFiles.missing.length} source files lack corresponding test files`);
    }

    // Check test dependencies
    const packageJson = JSON.parse(fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8'));
    const testDeps = Object.keys(packageJson.devDependencies || {}).filter(dep => 
      dep.includes('test') || dep.includes('jest') || dep.includes('vitest') || dep.includes('playwright')
    );
    
    if (testDeps.length === 0) {
      recommendations.critical.push('No testing dependencies found in package.json');
    }

    // Check for outdated test patterns
    const outdatedPatterns = this.checkForOutdatedPatterns();
    if (outdatedPatterns.length > 0) {
      recommendations.warning.push(`${outdatedPatterns.length} test files use outdated patterns`);
    }

    // Check test configuration
    const configIssues = this.checkTestConfiguration();
    recommendations.critical.push(...configIssues.critical);
    recommendations.warning.push(...configIssues.warning);

    return recommendations;
  }

  findTestFiles() {
    const sourceFiles = this.findFiles('src', /\.(ts|tsx|js|jsx)$/, /\.test\.|\.spec\.|__tests__/);
    const testFiles = this.findFiles('src', /\.(test|spec)\.(ts|tsx|js|jsx)$|__tests__/);
    
    const orphaned = [];
    const missing = [];
    
    testFiles.forEach(testFile => {
      const sourceFile = testFile
        .replace(/\.(test|spec)\./, '.')
        .replace(/__tests__\//, '')
        .replace(/\.test$/, '')
        .replace(/\.spec$/, '');
      
      if (!sourceFiles.includes(sourceFile)) {
        orphaned.push(testFile);
      }
    });
    
    sourceFiles.forEach(sourceFile => {
      const possibleTestFiles = [
        sourceFile.replace(/\.([^.]+)$/, '.test.$1'),
        sourceFile.replace(/\.([^.]+)$/, '.spec.$1'),
        sourceFile.replace(/src\//, 'src/__tests__/')
      ];
      
      const hasTest = possibleTestFiles.some(testFile => testFiles.includes(testFile));
      if (!hasTest) {
        missing.push(sourceFile);
      }
    });
    
    return { orphaned, missing, total: testFiles.length };
  }

  findFiles(dir, pattern, exclude = null) {
    const files = [];
    
    const walk = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (pattern.test(item) && (!exclude || !exclude.test(item))) {
          files.push(fullPath);
        }
      });
    };
    
    if (fs.existsSync(dir)) {
      walk(dir);
    }
    
    return files;
  }

  checkForOutdatedPatterns() {
    const outdatedPatterns = [];
    const testFiles = this.findFiles('src', /\.(test|spec)\.(ts|tsx|js|jsx)$/);
    
    testFiles.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for outdated patterns
        if (content.includes('enzyme')) {
          outdatedPatterns.push({ file, issue: 'Uses deprecated Enzyme library' });
        }
        
        if (content.includes('jest.fn()') && !content.includes('vi.fn()')) {
          outdatedPatterns.push({ file, issue: 'Uses Jest mocks instead of Vitest' });
        }
        
        if (content.includes('shallow(') || content.includes('mount(')) {
          outdatedPatterns.push({ file, issue: 'Uses shallow/mount rendering (deprecated)' });
        }
        
      } catch (error) {
        // Skip files that can't be read
      }
    });
    
    return outdatedPatterns;
  }

  checkTestConfiguration() {
    const issues = { critical: [], warning: [] };
    
    // Check for Vitest config
    const vitestConfig = path.join(this.projectRoot, 'vitest.config.ts');
    if (!fs.existsSync(vitestConfig)) {
      issues.critical.push('Missing vitest.config.ts configuration file');
    }
    
    // Check for Playwright config
    const playwrightConfig = path.join(this.projectRoot, 'playwright.config.ts');
    if (!fs.existsSync(playwrightConfig)) {
      issues.warning.push('Missing playwright.config.ts for E2E testing');
    }
    
    // Check test setup files
    const testSetup = path.join(this.projectRoot, 'src/test/setup.ts');
    if (!fs.existsSync(testSetup)) {
      issues.warning.push('Missing test setup file (src/test/setup.ts)');
    }
    
    return issues;
  }

  // Data persistence methods
  loadTestHistory() {
    if (fs.existsSync(this.historyFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  saveHealthData(data) {
    const history = this.loadTestHistory();
    history.push({
      timestamp: data.timestamp,
      testRuns: data.testRuns,
      performance: data.performance.currentMetrics
    });
    
    // Keep only last 50 runs
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
    
    fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));
  }

  saveFlakyTests(flakyTests) {
    fs.writeFileSync(this.flakyTestsFile, JSON.stringify(flakyTests, null, 2));
  }

  loadPerformanceHistory() {
    if (fs.existsSync(this.performanceFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.performanceFile, 'utf8'));
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  savePerformanceHistory(data) {
    fs.writeFileSync(this.performanceFile, JSON.stringify(data, null, 2));
  }

  loadCoverageTrends() {
    const trendsFile = path.join(this.healthDataDir, 'coverage-trends.json');
    if (fs.existsSync(trendsFile)) {
      try {
        return JSON.parse(fs.readFileSync(trendsFile, 'utf8'));
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  saveCoverageTrends(trends) {
    const trendsFile = path.join(this.healthDataDir, 'coverage-trends.json');
    fs.writeFileSync(trendsFile, JSON.stringify(trends, null, 2));
  }

  async generateHealthReport(data) {
    const reportPath = path.join(this.healthDataDir, 'health-report.md');
    
    const report = `# Test Health Report

**Generated:** ${new Date(data.timestamp).toLocaleString()}

## Test Suite Health

### Success Rates
- **Unit Tests:** ${data.testRuns.unit.successRate.toFixed(1)}% (${data.testRuns.unit.runs.length} runs)
- **Integration Tests:** ${data.testRuns.integration.successRate.toFixed(1)}% (${data.testRuns.integration.runs.length} runs)
- **E2E Tests:** ${data.testRuns.e2e.successRate.toFixed(1)}% (${data.testRuns.e2e.runs.length} runs)

### Performance Metrics
- **Average Unit Test Duration:** ${data.testRuns.unit.avgDuration.toFixed(0)}ms
- **Average Integration Test Duration:** ${data.testRuns.integration.avgDuration.toFixed(0)}ms
- **Slow Tests Detected:** ${data.performance.currentMetrics.slowTests.length}

## Flaky Tests

${data.flakyTests.length === 0 ? 
  '✅ No flaky tests detected!' : 
  data.flakyTests.map(test => `
### ${test.testName}
- **Flakiness Score:** ${(test.flakinessScore * 100).toFixed(1)}%
- **Failure Rate:** ${test.failureRate.toFixed(1)}%
- **Last Failure:** ${test.lastFailure || 'N/A'}
- **Recommendations:** ${test.recommendation.join(', ')}
`).join('\n')
}

## Coverage Analysis

${data.coverage.status === 'available' ? `
- **Current Line Coverage:** ${data.coverage.current.lines.toFixed(1)}%
- **Trend:** ${data.coverage.analysis.message}
` : `
⚠️ Coverage data not available
`}

## Maintenance Recommendations

### Critical Issues
${data.maintenance.critical.length === 0 ? 
  '✅ No critical issues detected' : 
  data.maintenance.critical.map(issue => `- ❌ ${issue}`).join('\n')
}

### Warnings
${data.maintenance.warning.length === 0 ? 
  '✅ No warnings' : 
  data.maintenance.warning.map(issue => `- ⚠️ ${issue}`).join('\n')
}

### Information
${data.maintenance.info.length === 0 ? 
  '✅ All good' : 
  data.maintenance.info.map(issue => `- ℹ️ ${issue}`).join('\n')
}

## Next Steps

1. Address any critical maintenance issues
2. Investigate and fix flaky tests
3. Optimize slow-running tests
4. Monitor coverage trends
5. Run this health check regularly

---
*Generated by HalluciFix Test Health Monitor*`;

    fs.writeFileSync(reportPath, report);
    console.log(`📄 Health report generated: ${reportPath}`);
  }
}

// CLI interface
if (require.main === module) {
  const monitor = new TestHealthMonitor();
  
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  args.forEach(arg => {
    if (arg === '--verbose') options.verbose = true;
    if (arg === '--quick') options.quick = true;
  });

  monitor.monitor(options).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = TestHealthMonitor;