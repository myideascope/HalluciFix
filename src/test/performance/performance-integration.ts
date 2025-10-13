import { DatabaseLoadTester, LoadTestResult } from './database-load-testing';
import { DatabaseStressTester, StressTestResult } from './stress-testing';
import { DatabaseRegressionTester, RegressionTestResult } from './regression-testing';
import { dbMonitor } from '../../lib/databasePerformanceMonitor';
import { healthChecker } from '../../lib/databaseHealthChecker';

interface PerformanceTestSuite {
  name: string;
  description: string;
  tests: PerformanceTest[];
}

interface PerformanceTest {
  type: 'load' | 'stress' | 'regression';
  name: string;
  config: any;
  enabled: boolean;
  schedule?: string; // Cron expression for automated runs
}

interface PerformanceTestReport {
  suiteId: string;
  suiteName: string;
  timestamp: Date;
  duration: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: {
    loadTests: LoadTestResult[];
    stressTests: StressTestResult[];
    regressionTests: RegressionTestResult[];
  };
  overallStatus: 'passed' | 'failed' | 'warning';
  summary: string;
  recommendations: string[];
}

class PerformanceTestIntegration {
  private loadTester = new DatabaseLoadTester();
  private stressTester = new DatabaseStressTester();
  private regressionTester = new DatabaseRegressionTester();

  async runPerformanceTestSuite(suite: PerformanceTestSuite): Promise<PerformanceTestReport> {
    console.log(`Starting performance test suite: ${suite.name}`);
    const startTime = Date.now();
    
    const report: PerformanceTestReport = {
      suiteId: `suite_${Date.now()}`,
      suiteName: suite.name,
      timestamp: new Date(),
      duration: 0,
      totalTests: suite.tests.filter(t => t.enabled).length,
      passedTests: 0,
      failedTests: 0,
      results: {
        loadTests: [],
        stressTests: [],
        regressionTests: []
      },
      overallStatus: 'passed',
      summary: '',
      recommendations: []
    };

    // Pre-test health check
    const preTestHealth = await healthChecker.performHealthCheck();
    if (preTestHealth.status === 'critical') {
      console.warn('Database health is critical before testing. Proceeding with caution.');
    }

    // Run each enabled test
    for (const test of suite.tests.filter(t => t.enabled)) {
      try {
        console.log(`Running ${test.type} test: ${test.name}`);
        
        switch (test.type) {
          case 'load':
            const loadResult = await this.loadTester.runLoadTest(test.name, test.config);
            report.results.loadTests.push(loadResult);
            
            // Consider test passed if error rate < 5% and avg response time < 1000ms
            if (loadResult.errorRate < 5 && loadResult.averageResponseTime < 1000) {
              report.passedTests++;
            } else {
              report.failedTests++;
            }
            break;

          case 'stress':
            const stressResult = await this.stressTester.runStressTest(test.name, test.config);
            report.results.stressTests.push(stressResult);
            
            // Consider test passed if sustained phase error rate < 10%
            if (stressResult.phases.sustained.errorRate < 10) {
              report.passedTests++;
            } else {
              report.failedTests++;
            }
            break;

          case 'regression':
            const regressionResult = await this.regressionTester.runRegressionTest(test.name, test.config);
            report.results.regressionTests.push(regressionResult);
            
            if (regressionResult.passed) {
              report.passedTests++;
            } else {
              report.failedTests++;
            }
            break;
        }
        
        // Wait between tests to avoid interference
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        console.error(`Test ${test.name} failed with error:`, error);
        report.failedTests++;
      }
    }

    // Post-test health check
    const postTestHealth = await healthChecker.performHealthCheck();
    
    // Calculate final metrics
    report.duration = Date.now() - startTime;
    report.overallStatus = this.determineOverallStatus(report);
    report.summary = this.generateSummary(report);
    report.recommendations = this.generateSuiteRecommendations(report, preTestHealth, postTestHealth);

    // Save report
    await this.savePerformanceReport(report);
    
    // Print summary
    this.printSuiteReport(report);
    
    return report;
  }

  private determineOverallStatus(report: PerformanceTestReport): 'passed' | 'failed' | 'warning' {
    const failureRate = report.failedTests / report.totalTests;
    
    if (failureRate === 0) {
      return 'passed';
    } else if (failureRate < 0.3) {
      return 'warning';
    } else {
      return 'failed';
    }
  }

  private generateSummary(report: PerformanceTestReport): string {
    const passRate = ((report.passedTests / report.totalTests) * 100).toFixed(1);
    const durationMinutes = (report.duration / 60000).toFixed(1);
    
    return `Performance test suite completed in ${durationMinutes} minutes. ` +
           `${report.passedTests}/${report.totalTests} tests passed (${passRate}% pass rate).`;
  }

  private generateSuiteRecommendations(
    report: PerformanceTestReport,
    preTestHealth: any,
    postTestHealth: any
  ): string[] {
    const recommendations: string[] = [];
    
    // Analyze overall test results
    if (report.failedTests > 0) {
      recommendations.push(`${report.failedTests} tests failed. Review individual test results for specific issues.`);
    }
    
    // Analyze load test results
    const avgLoadTestErrorRate = report.results.loadTests.reduce((sum, test) => sum + test.errorRate, 0) / report.results.loadTests.length;
    if (avgLoadTestErrorRate > 2) {
      recommendations.push('High average error rate in load tests. Consider optimizing database queries and connection handling.');
    }
    
    // Analyze stress test results
    const stressTestsWithBreakingPoint = report.results.stressTests.filter(test => test.breakingPoint);
    if (stressTestsWithBreakingPoint.length > 0) {
      recommendations.push('Breaking points identified in stress tests. Plan capacity scaling accordingly.');
    }
    
    // Analyze regression test results
    const failedRegressionTests = report.results.regressionTests.filter(test => !test.passed);
    if (failedRegressionTests.length > 0) {
      recommendations.push('Performance regressions detected. Review recent code changes and optimizations.');
    }
    
    // Compare health before and after
    if (postTestHealth.status !== preTestHealth.status) {
      recommendations.push(`Database health changed from ${preTestHealth.status} to ${postTestHealth.status} during testing.`);
    }
    
    // Collect recommendations from individual tests
    const allTestRecommendations = [
      ...report.results.stressTests.flatMap(test => test.recommendations),
      ...report.results.regressionTests.flatMap(test => test.recommendations)
    ];
    
    // Add unique recommendations
    const uniqueRecommendations = [...new Set(allTestRecommendations)];
    recommendations.push(...uniqueRecommendations.slice(0, 5)); // Limit to top 5
    
    return recommendations;
  }

  private async savePerformanceReport(report: PerformanceTestReport): Promise<void> {
    try {
      // Save to monitoring system
      await dbMonitor.trackQuery(
        'performance_test_suite',
        async () => {
          // This would save to your monitoring database
          console.log('Performance report saved to monitoring system');
          return { success: true };
        },
        { endpoint: 'performance_testing' }
      );
      
      // Could also integrate with external monitoring services
      if (process.env.DATADOG_API_KEY) {
        await this.sendToDatadog(report);
      }
      
    } catch (error) {
      console.error('Failed to save performance report:', error);
    }
  }

  private async sendToDatadog(report: PerformanceTestReport): Promise<void> {
    const metrics = [
      {
        metric: 'performance.test.suite.duration',
        points: [[Math.floor(Date.now() / 1000), report.duration]],
        tags: [`suite:${report.suiteName}`, `status:${report.overallStatus}`]
      },
      {
        metric: 'performance.test.suite.pass_rate',
        points: [[Math.floor(Date.now() / 1000), (report.passedTests / report.totalTests) * 100]],
        tags: [`suite:${report.suiteName}`]
      }
    ];
    
    // Add load test metrics
    report.results.loadTests.forEach(test => {
      metrics.push(
        {
          metric: 'performance.load_test.response_time',
          points: [[Math.floor(Date.now() / 1000), test.averageResponseTime]],
          tags: [`test:${test.testName}`, `suite:${report.suiteName}`]
        },
        {
          metric: 'performance.load_test.throughput',
          points: [[Math.floor(Date.now() / 1000), test.throughput]],
          tags: [`test:${test.testName}`, `suite:${report.suiteName}`]
        },
        {
          metric: 'performance.load_test.error_rate',
          points: [[Math.floor(Date.now() / 1000), test.errorRate]],
          tags: [`test:${test.testName}`, `suite:${report.suiteName}`]
        }
      );
    });
    
    try {
      await fetch('https://api.datadoghq.com/api/v1/series', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': process.env.DATADOG_API_KEY!
        },
        body: JSON.stringify({ series: metrics })
      });
    } catch (error) {
      console.error('Failed to send metrics to Datadog:', error);
    }
  }

  private printSuiteReport(report: PerformanceTestReport): void {
    console.log('\n=== Performance Test Suite Report ===');
    console.log(`Suite: ${report.suiteName}`);
    console.log(`Status: ${report.overallStatus.toUpperCase()}`);
    console.log(`Duration: ${(report.duration / 60000).toFixed(1)} minutes`);
    console.log(`Tests: ${report.passedTests}/${report.totalTests} passed`);
    
    console.log('\n--- Test Results Summary ---');
    console.log(`Load Tests: ${report.results.loadTests.length}`);
    console.log(`Stress Tests: ${report.results.stressTests.length}`);
    console.log(`Regression Tests: ${report.results.regressionTests.length}`);
    
    if (report.results.loadTests.length > 0) {
      const avgResponseTime = report.results.loadTests.reduce((sum, test) => sum + test.averageResponseTime, 0) / report.results.loadTests.length;
      const avgThroughput = report.results.loadTests.reduce((sum, test) => sum + test.throughput, 0) / report.results.loadTests.length;
      console.log(`Average Load Test Response Time: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`Average Load Test Throughput: ${avgThroughput.toFixed(2)} ops/sec`);
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n--- Recommendations ---');
      report.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
  }

  // Predefined test suites
  getStandardTestSuites(): PerformanceTestSuite[] {
    return [
      {
        name: 'Core Database Performance',
        description: 'Essential database operations performance validation',
        tests: [
          {
            type: 'load',
            name: 'core_operations_load_test',
            config: {
              concurrentUsers: 20,
              testDuration: 120,
              operationsPerUser: 30,
              queryTypes: ['user_analysis_list', 'dashboard_analytics', 'search_content']
            },
            enabled: true
          },
          {
            type: 'regression',
            name: 'core_operations_regression',
            config: {
              testSuites: ['core_queries'],
              performanceThresholds: {
                maxResponseTimeDegradation: 15,
                maxThroughputDegradation: 10,
                maxErrorRateIncrease: 2
              },
              comparisonMetrics: ['responseTime', 'throughput', 'errorRate']
            },
            enabled: true
          }
        ]
      },
      {
        name: 'Scalability Validation',
        description: 'Database scalability and stress testing',
        tests: [
          {
            type: 'stress',
            name: 'scalability_stress_test',
            config: {
              concurrentUsers: 10,
              testDuration: 300,
              operationsPerUser: 50,
              queryTypes: ['user_analysis_list', 'dashboard_analytics'],
              rampUpDuration: 60,
              sustainedDuration: 180,
              rampDownDuration: 60,
              maxConcurrentUsers: 100,
              resourceMonitoring: true
            },
            enabled: true
          },
          {
            type: 'load',
            name: 'high_concurrency_load_test',
            config: {
              concurrentUsers: 50,
              testDuration: 180,
              operationsPerUser: 25,
              queryTypes: ['user_analysis_list', 'search_content', 'risk_level_filter']
            },
            enabled: true
          }
        ]
      },
      {
        name: 'Write Performance Validation',
        description: 'Database write operations and batch processing performance',
        tests: [
          {
            type: 'load',
            name: 'write_operations_load_test',
            config: {
              concurrentUsers: 15,
              testDuration: 120,
              operationsPerUser: 20,
              queryTypes: ['batch_insert', 'user_analysis_list']
            },
            enabled: true
          },
          {
            type: 'stress',
            name: 'write_heavy_stress_test',
            config: {
              concurrentUsers: 5,
              testDuration: 240,
              operationsPerUser: 30,
              queryTypes: ['batch_insert'],
              rampUpDuration: 30,
              sustainedDuration: 180,
              rampDownDuration: 30,
              maxConcurrentUsers: 25,
              resourceMonitoring: true
            },
            enabled: true
          }
        ]
      }
    ];
  }

  async runAllStandardSuites(): Promise<PerformanceTestReport[]> {
    const suites = this.getStandardTestSuites();
    const reports: PerformanceTestReport[] = [];
    
    for (const suite of suites) {
      const report = await this.runPerformanceTestSuite(suite);
      reports.push(report);
      
      // Wait between suites for system recovery
      console.log('Waiting for system recovery between test suites...');
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
    }
    
    return reports;
  }
}

export { PerformanceTestIntegration, PerformanceTestSuite, PerformanceTest, PerformanceTestReport };