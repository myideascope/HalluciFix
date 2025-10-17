#!/usr/bin/env node

/**
 * Test Performance Monitor
 * 
 * Monitors test execution performance, identifies bottlenecks,
 * and provides optimization recommendations.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestPerformanceMonitor {
  constructor() {
    this.projectRoot = process.cwd();
    this.performanceDataDir = path.join(this.projectRoot, '.test-performance');
    this.benchmarksFile = path.join(this.performanceDataDir, 'benchmarks.json');
    this.trendsFile = path.join(this.performanceDataDir, 'trends.json');
    
    // Performance thresholds (in milliseconds)
    this.thresholds = {
      unit: {
        total: 30000,      // 30 seconds for all unit tests
        individual: 5000,  // 5 seconds for individual test file
        single: 1000       // 1 second for single test
      },
      integration: {
        total: 120000,     // 2 minutes for all integration tests
        individual: 30000, // 30 seconds for individual test file
        single: 10000      // 10 seconds for single test
      },
      e2e: {
        total: 600000,     // 10 minutes for all E2E tests
        individual: 60000, // 1 minute for individual test file
        single: 30000      // 30 seconds for single test
      }
    };
    
    // Ensure performance data directory exists
    if (!fs.existsSync(this.performanceDataDir)) {
      fs.mkdirSync(this.performanceDataDir, { recursive: true });
    }
  }

  async monitor(options = {}) {
    console.log('⚡ Starting test performance monitoring...\n');

    try {
      const performanceData = {
        timestamp: new Date().toISOString(),
        environment: this.getEnvironmentInfo(),
        measurements: await this.measureTestPerformance(),
        analysis: {},
        recommendations: []
      };

      performanceData.analysis = this.analyzePerformance(performanceData.measurements);
      performanceData.recommendations = this.generateRecommendations(performanceData.analysis);

      await this.saveBenchmarks(performanceData);
      await this.updateTrends(performanceData);
      await this.generatePerformanceReport(performanceData);

      console.log('✅ Test performance monitoring completed!');
      console.log(`📊 Performance data saved to: ${this.performanceDataDir}`);

      // Alert on performance issues
      const criticalIssues = performanceData.recommendations.filter(r => r.priority === 'critical');
      if (criticalIssues.length > 0) {
        console.log(`🚨 ${criticalIssues.length} critical performance issues detected`);
      }

    } catch (error) {
      console.error('❌ Test performance monitoring failed:', error.message);
      process.exit(1);
    }
  }

  getEnvironmentInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: require('os').cpus().length,
      totalMemory: Math.round(require('os').totalmem() / 1024 / 1024 / 1024) + 'GB',
      freeMemory: Math.round(require('os').freemem() / 1024 / 1024 / 1024) + 'GB'
    };
  }

  async measureTestPerformance() {
    console.log('📊 Measuring test performance...');
    
    const measurements = {
      unit: await this.measureUnitTests(),
      integration: await this.measureIntegrationTests(),
      e2e: await this.measureE2ETests(),
      individual: await this.measureIndividualTests()
    };

    return measurements;
  }

  async measureUnitTests() {
    console.log('  🧪 Measuring unit tests...');
    
    try {
      const start = Date.now();
      const output = execSync('npm run test:run -- --reporter=json', { 
        encoding: 'utf8',
        timeout: this.thresholds.unit.total + 30000 // Add 30s buffer
      });
      const duration = Date.now() - start;
      
      let testResults = {};
      try {
        testResults = JSON.parse(output);
      } catch (parseError) {
        console.log('  ⚠️  Could not parse unit test JSON output');
      }

      return {
        status: 'success',
        totalDuration: duration,
        testCount: testResults.numTotalTests || 0,
        passedTests: testResults.numPassedTests || 0,
        failedTests: testResults.numFailedTests || 0,
        avgTestDuration: testResults.numTotalTests ? duration / testResults.numTotalTests : 0,
        testResults: testResults.testResults || []
      };
      
    } catch (error) {
      return {
        status: 'failed',
        totalDuration: 0,
        testCount: 0,
        error: error.message
      };
    }
  }

  async measureIntegrationTests() {
    console.log('  🔗 Measuring integration tests...');
    
    try {
      const start = Date.now();
      execSync('npm run test:integration', { 
        stdio: 'pipe',
        timeout: this.thresholds.integration.total + 30000
      });
      const duration = Date.now() - start;
      
      return {
        status: 'success',
        totalDuration: duration,
        testCount: 0, // Would need to parse output for exact count
        avgTestDuration: 0
      };
      
    } catch (error) {
      if (error.message.includes('script not found')) {
        return {
          status: 'not_available',
          message: 'Integration test script not found'
        };
      }
      
      return {
        status: 'failed',
        totalDuration: 0,
        error: error.message
      };
    }
  }

  async measureE2ETests() {
    console.log('  🎭 Measuring E2E tests...');
    
    // E2E tests are typically not run in performance monitoring due to complexity
    return {
      status: 'skipped',
      message: 'E2E tests skipped in performance monitoring (run manually)'
    };
  }

  async measureIndividualTests() {
    console.log('  📁 Measuring individual test files...');
    
    const testFiles = this.findTestFiles();
    const individualResults = [];
    
    // Measure a sample of test files to avoid long execution times
    const sampleSize = Math.min(10, testFiles.length);
    const sampleFiles = testFiles.slice(0, sampleSize);
    
    for (const testFile of sampleFiles) {
      try {
        const start = Date.now();
        execSync(`npm run test:run -- ${testFile}`, { 
          stdio: 'pipe',
          timeout: this.thresholds.unit.individual + 10000
        });
        const duration = Date.now() - start;
        
        individualResults.push({
          file: path.relative(this.projectRoot, testFile),
          duration: duration,
          status: 'success'
        });
        
      } catch (error) {
        individualResults.push({
          file: path.relative(this.projectRoot, testFile),
          duration: 0,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return {
      sampleSize: sampleSize,
      totalFiles: testFiles.length,
      results: individualResults,
      avgDuration: individualResults.reduce((sum, result) => sum + result.duration, 0) / individualResults.length || 0
    };
  }

  analyzePerformance(measurements) {
    console.log('🔍 Analyzing performance data...');
    
    const analysis = {
      overall: this.analyzeOverallPerformance(measurements),
      bottlenecks: this.identifyBottlenecks(measurements),
      trends: this.analyzeTrends(measurements),
      thresholdViolations: this.checkThresholds(measurements)
    };

    return analysis;
  }

  analyzeOverallPerformance(measurements) {
    const totalDuration = (measurements.unit.totalDuration || 0) + 
                         (measurements.integration.totalDuration || 0);
    
    const totalTests = (measurements.unit.testCount || 0);
    
    return {
      totalExecutionTime: totalDuration,
      totalTestCount: totalTests,
      averageTestTime: totalTests > 0 ? totalDuration / totalTests : 0,
      testsPerSecond: totalDuration > 0 ? (totalTests / totalDuration) * 1000 : 0,
      efficiency: this.calculateEfficiency(measurements)
    };
  }

  calculateEfficiency(measurements) {
    // Efficiency score based on tests per second and threshold compliance
    const unit = measurements.unit;
    if (!unit.totalDuration || !unit.testCount) return 0;
    
    const testsPerSecond = (unit.testCount / unit.totalDuration) * 1000;
    const thresholdCompliance = unit.totalDuration <= this.thresholds.unit.total ? 1 : 0.5;
    
    // Normalize to 0-100 scale
    return Math.min(100, testsPerSecond * 10 * thresholdCompliance);
  }

  identifyBottlenecks(measurements) {
    const bottlenecks = [];
    
    // Check unit test bottlenecks
    if (measurements.unit.status === 'success') {
      if (measurements.unit.totalDuration > this.thresholds.unit.total) {
        bottlenecks.push({
          type: 'unit_tests_slow',
          severity: 'high',
          description: `Unit tests exceed threshold (${measurements.unit.totalDuration}ms > ${this.thresholds.unit.total}ms)`,
          impact: 'Slows down development feedback loop'
        });
      }
      
      // Check for slow individual test files
      measurements.individual.results?.forEach(result => {
        if (result.duration > this.thresholds.unit.individual) {
          bottlenecks.push({
            type: 'slow_test_file',
            severity: 'medium',
            description: `Test file ${result.file} is slow (${result.duration}ms)`,
            impact: 'Contributes to overall slow test suite'
          });
        }
      });
    }
    
    // Check integration test bottlenecks
    if (measurements.integration.status === 'success' && 
        measurements.integration.totalDuration > this.thresholds.integration.total) {
      bottlenecks.push({
        type: 'integration_tests_slow',
        severity: 'medium',
        description: `Integration tests exceed threshold (${measurements.integration.totalDuration}ms > ${this.thresholds.integration.total}ms)`,
        impact: 'Slows down CI/CD pipeline'
      });
    }
    
    return bottlenecks;
  }

  analyzeTrends(measurements) {
    const historicalData = this.loadTrends();
    
    if (historicalData.length < 2) {
      return {
        status: 'insufficient_data',
        message: 'Need more historical data for trend analysis'
      };
    }
    
    const recent = historicalData.slice(-5); // Last 5 measurements
    const older = historicalData.slice(-10, -5); // Previous 5 measurements
    
    const recentAvg = recent.reduce((sum, data) => sum + (data.measurements.unit.totalDuration || 0), 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((sum, data) => sum + (data.measurements.unit.totalDuration || 0), 0) / older.length : recentAvg;
    
    const trendDirection = recentAvg > olderAvg ? 'degrading' : recentAvg < olderAvg ? 'improving' : 'stable';
    const trendMagnitude = Math.abs(recentAvg - olderAvg);
    const trendPercentage = olderAvg > 0 ? (trendMagnitude / olderAvg) * 100 : 0;
    
    return {
      status: 'available',
      direction: trendDirection,
      magnitude: trendMagnitude,
      percentage: trendPercentage,
      message: `Performance is ${trendDirection} by ${trendPercentage.toFixed(1)}% over recent runs`
    };
  }

  checkThresholds(measurements) {
    const violations = [];
    
    // Check unit test thresholds
    if (measurements.unit.status === 'success') {
      if (measurements.unit.totalDuration > this.thresholds.unit.total) {
        violations.push({
          type: 'unit_total_time',
          threshold: this.thresholds.unit.total,
          actual: measurements.unit.totalDuration,
          severity: 'high'
        });
      }
      
      if (measurements.unit.avgTestDuration > this.thresholds.unit.single) {
        violations.push({
          type: 'unit_avg_time',
          threshold: this.thresholds.unit.single,
          actual: measurements.unit.avgTestDuration,
          severity: 'medium'
        });
      }
    }
    
    // Check integration test thresholds
    if (measurements.integration.status === 'success' && 
        measurements.integration.totalDuration > this.thresholds.integration.total) {
      violations.push({
        type: 'integration_total_time',
        threshold: this.thresholds.integration.total,
        actual: measurements.integration.totalDuration,
        severity: 'medium'
      });
    }
    
    return violations;
  }

  generateRecommendations(analysis) {
    console.log('💡 Generating optimization recommendations...');
    
    const recommendations = [];
    
    // Overall performance recommendations
    if (analysis.overall.efficiency < 50) {
      recommendations.push({
        priority: 'critical',
        category: 'overall',
        title: 'Low Test Suite Efficiency',
        description: `Test suite efficiency is ${analysis.overall.efficiency.toFixed(1)}% - consider optimization`,
        actions: [
          'Review and optimize slow test files',
          'Implement test parallelization',
          'Consider test splitting strategies',
          'Review test setup and teardown procedures'
        ]
      });
    }
    
    // Bottleneck recommendations
    analysis.bottlenecks.forEach(bottleneck => {
      const priority = bottleneck.severity === 'high' ? 'critical' : 'warning';
      
      recommendations.push({
        priority: priority,
        category: 'bottleneck',
        title: bottleneck.description,
        description: `Impact: ${bottleneck.impact}`,
        actions: this.getBottleneckActions(bottleneck.type)
      });
    });
    
    // Threshold violation recommendations
    analysis.thresholdViolations.forEach(violation => {
      recommendations.push({
        priority: violation.severity === 'high' ? 'critical' : 'warning',
        category: 'threshold',
        title: `${violation.type} exceeds threshold`,
        description: `Actual: ${violation.actual}ms, Threshold: ${violation.threshold}ms`,
        actions: this.getThresholdActions(violation.type)
      });
    });
    
    // Trend-based recommendations
    if (analysis.trends.status === 'available' && analysis.trends.direction === 'degrading') {
      recommendations.push({
        priority: 'warning',
        category: 'trend',
        title: 'Performance Degradation Detected',
        description: analysis.trends.message,
        actions: [
          'Review recent changes that may have impacted performance',
          'Analyze performance trends over time',
          'Consider implementing performance regression tests'
        ]
      });
    }
    
    // General optimization recommendations
    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'info',
        category: 'optimization',
        title: 'Performance Optimization Opportunities',
        description: 'Consider these general optimizations',
        actions: [
          'Implement test result caching',
          'Use test parallelization where possible',
          'Optimize test data setup and cleanup',
          'Consider using test doubles for external dependencies'
        ]
      });
    }
    
    return recommendations;
  }

  getBottleneckActions(bottleneckType) {
    const actions = {
      unit_tests_slow: [
        'Profile individual test files to identify slow tests',
        'Implement test parallelization',
        'Optimize test setup and teardown',
        'Consider mocking expensive operations'
      ],
      slow_test_file: [
        'Profile the specific test file',
        'Break down large test files into smaller ones',
        'Optimize test data setup',
        'Use more efficient assertions'
      ],
      integration_tests_slow: [
        'Optimize database operations in tests',
        'Use test database transactions for faster cleanup',
        'Implement test data factories',
        'Consider using test containers'
      ]
    };
    
    return actions[bottleneckType] || ['Review and optimize the identified bottleneck'];
  }

  getThresholdActions(violationType) {
    const actions = {
      unit_total_time: [
        'Implement parallel test execution',
        'Optimize slow test files',
        'Consider test splitting',
        'Review test configuration'
      ],
      unit_avg_time: [
        'Profile individual tests',
        'Optimize test setup',
        'Use more efficient test patterns',
        'Consider test refactoring'
      ],
      integration_total_time: [
        'Optimize database operations',
        'Use test transactions',
        'Implement better test data management',
        'Consider test parallelization'
      ]
    };
    
    return actions[violationType] || ['Review and optimize to meet threshold'];
  }

  // Helper methods
  findTestFiles() {
    const testFiles = [];
    const testDirs = ['src/components/__tests__', 'src/lib/__tests__', 'src/hooks/__tests__'];
    
    testDirs.forEach(testDir => {
      const fullPath = path.join(this.projectRoot, testDir);
      if (fs.existsSync(fullPath)) {
        const files = fs.readdirSync(fullPath);
        files.forEach(file => {
          if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
            testFiles.push(path.join(fullPath, file));
          }
        });
      }
    });
    
    return testFiles;
  }

  // Data persistence methods
  async saveBenchmarks(performanceData) {
    const benchmarks = {
      timestamp: performanceData.timestamp,
      environment: performanceData.environment,
      measurements: performanceData.measurements,
      analysis: performanceData.analysis
    };
    
    fs.writeFileSync(this.benchmarksFile, JSON.stringify(benchmarks, null, 2));
  }

  async updateTrends(performanceData) {
    const trends = this.loadTrends();
    
    trends.push({
      timestamp: performanceData.timestamp,
      measurements: performanceData.measurements,
      analysis: performanceData.analysis
    });
    
    // Keep only last 50 data points
    if (trends.length > 50) {
      trends.splice(0, trends.length - 50);
    }
    
    fs.writeFileSync(this.trendsFile, JSON.stringify(trends, null, 2));
  }

  loadTrends() {
    if (fs.existsSync(this.trendsFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.trendsFile, 'utf8'));
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  async generatePerformanceReport(data) {
    const reportPath = path.join(this.performanceDataDir, 'performance-report.md');
    
    const report = `# Test Performance Report

**Generated:** ${new Date(data.timestamp).toLocaleString()}

## Environment

- **Node.js:** ${data.environment.nodeVersion}
- **Platform:** ${data.environment.platform} (${data.environment.arch})
- **CPUs:** ${data.environment.cpus}
- **Memory:** ${data.environment.totalMemory} total, ${data.environment.freeMemory} free

## Performance Summary

### Overall Metrics
- **Total Execution Time:** ${data.analysis.overall.totalExecutionTime.toFixed(0)}ms
- **Total Tests:** ${data.analysis.overall.totalTestCount}
- **Average Test Time:** ${data.analysis.overall.averageTestTime.toFixed(2)}ms
- **Tests per Second:** ${data.analysis.overall.testsPerSecond.toFixed(2)}
- **Efficiency Score:** ${data.analysis.overall.efficiency.toFixed(1)}%

### Test Suite Performance

#### Unit Tests
- **Status:** ${data.measurements.unit.status}
- **Duration:** ${data.measurements.unit.totalDuration || 0}ms
- **Test Count:** ${data.measurements.unit.testCount || 0}
- **Pass Rate:** ${data.measurements.unit.testCount ? ((data.measurements.unit.passedTests || 0) / data.measurements.unit.testCount * 100).toFixed(1) : 0}%

#### Integration Tests
- **Status:** ${data.measurements.integration.status}
- **Duration:** ${data.measurements.integration.totalDuration || 0}ms

## Performance Analysis

### Bottlenecks Identified
${data.analysis.bottlenecks.length === 0 ? 
  '✅ No significant bottlenecks detected' : 
  data.analysis.bottlenecks.map(b => `- **${b.severity.toUpperCase()}:** ${b.description}`).join('\n')
}

### Threshold Violations
${data.analysis.thresholdViolations.length === 0 ? 
  '✅ All performance thresholds met' : 
  data.analysis.thresholdViolations.map(v => `- **${v.type}:** ${v.actual}ms (threshold: ${v.threshold}ms)`).join('\n')
}

### Performance Trends
${data.analysis.trends.status === 'available' ? 
  `📈 ${data.analysis.trends.message}` : 
  '📊 Insufficient data for trend analysis'
}

## Recommendations

${data.recommendations.map(rec => `
### ${rec.title} (${rec.priority.toUpperCase()})
${rec.description}

**Actions:**
${rec.actions.map(action => `- ${action}`).join('\n')}
`).join('\n')}

## Individual Test File Performance

${data.measurements.individual.results ? 
  data.measurements.individual.results.map(result => 
    `- **${result.file}:** ${result.duration}ms ${result.status === 'success' ? '✅' : '❌'}`
  ).join('\n') : 
  'No individual test performance data available'
}

## Next Steps

1. Address critical performance issues first
2. Implement recommended optimizations
3. Monitor performance trends regularly
4. Set up automated performance regression detection
5. Consider performance budgets for CI/CD

---
*Generated by HalluciFix Test Performance Monitor*`;

    fs.writeFileSync(reportPath, report);
    console.log(`📄 Performance report generated: ${reportPath}`);
  }
}

// CLI interface
if (require.main === module) {
  const monitor = new TestPerformanceMonitor();
  
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  args.forEach(arg => {
    if (arg === '--quick') options.quick = true;
    if (arg === '--detailed') options.detailed = true;
  });

  monitor.monitor(options).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = TestPerformanceMonitor;