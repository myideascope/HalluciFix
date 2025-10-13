import { test, expect } from '@playwright/test';
import { LoadTester, LOAD_TEST_SCENARIOS, LoadTestConfig } from './utils/load-testing';
import { PerformanceAlerting } from './utils/performance-alerting';
import { LoadTestReporter } from './utils/load-test-reporter';
import { getCurrentEnvironment, getAlertingConfig } from './load-testing.config';

test.describe('Load Testing for Concurrent Users', () => {
  let loadTester: LoadTester;
  let performanceAlerting: PerformanceAlerting;
  let loadTestReporter: LoadTestReporter;

  test.beforeAll(async () => {
    loadTester = new LoadTester();
    await loadTester.initialize();
    
    // Initialize performance alerting based on environment
    const environment = getCurrentEnvironment();
    const alertingConfig = getAlertingConfig(environment);
    performanceAlerting = new PerformanceAlerting(alertingConfig);
    
    // Initialize load test reporter
    loadTestReporter = new LoadTestReporter();
    
    console.log(`Running load tests in ${environment} environment`);
  });

  test.afterAll(async () => {
    if (loadTester) {
      await loadTester.cleanup();
    }
    
    // Generate final performance report
    if (performanceAlerting && loadTestReporter) {
      const allAlerts = performanceAlerting.getAlerts();
      const allReports = loadTestReporter.getReports();
      
      console.log(`\n=== LOAD TESTING PERFORMANCE SUMMARY ===`);
      console.log(`Total tests executed: ${allReports.length}`);
      console.log(`Total alerts generated: ${allAlerts.length}`);
      console.log(`Critical alerts: ${performanceAlerting.getAlertsBySeverity('critical').length}`);
      console.log(`High severity alerts: ${performanceAlerting.getAlertsBySeverity('high').length}`);
      console.log(`Medium severity alerts: ${performanceAlerting.getAlertsBySeverity('medium').length}`);
      console.log(`Low severity alerts: ${performanceAlerting.getAlertsBySeverity('low').length}`);
      
      // Performance grade distribution
      const gradeDistribution = allReports.reduce((acc, report) => {
        acc[report.performanceGrade] = (acc[report.performanceGrade] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(`Performance grade distribution:`, gradeDistribution);
      
      // Generate trend analysis if we have multiple reports
      if (allReports.length > 1) {
        const trendAnalysis = loadTestReporter.generateTrendAnalysis();
        console.log(`Performance trend: ${trendAnalysis.trendDirection}`);
        console.log(`Average grade: ${trendAnalysis.averageGrade.toFixed(1)}`);
      }
      
      console.log(`==========================================\n`);
      
      // Save consolidated report
      try {
        const consolidatedReport = {
          timestamp: new Date().toISOString(),
          environment: getCurrentEnvironment(),
          summary: {
            totalTests: allReports.length,
            totalAlerts: allAlerts.length,
            gradeDistribution,
            trendAnalysis: allReports.length > 1 ? loadTestReporter.generateTrendAnalysis() : null
          },
          reports: allReports,
          alerts: allAlerts
        };
        
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const reportsDir = path.join(process.cwd(), 'test-results', 'load-test-reports');
        await fs.mkdir(reportsDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(reportsDir, `consolidated-load-test-report-${timestamp}.json`);
        
        await fs.writeFile(filename, JSON.stringify(consolidatedReport, null, 2));
        console.log(`Consolidated load test report saved to: ${filename}`);
      } catch (error) {
        console.error('Failed to save consolidated report:', error);
      }
    }
  });

  test('light load - 5 concurrent users', async () => {
    const config: LoadTestConfig = {
      concurrentUsers: 5,
      testDuration: 30000, // 30 seconds
      rampUpTime: 5000, // 5 seconds to reach full load
      scenarios: [
        LOAD_TEST_SCENARIOS.basicAnalysis,
        LOAD_TEST_SCENARIOS.casualBrowser
      ]
    };

    const summary = await loadTester.runLoadTest(config);

    console.log('Light Load Test Results:', summary);

    // Generate performance alerts and report
    const alerts = await performanceAlerting.analyzeLoadTestResults(summary, config);
    const report = loadTestReporter.generateReport(config, summary, alerts);
    
    // Log any alerts generated
    if (alerts.length > 0) {
      console.log(`Generated ${alerts.length} performance alerts for light load test`);
    }
    
    console.log(`Light load test performance grade: ${report.performanceGrade}`);
    
    // Save individual test report
    try {
      await loadTestReporter.saveReport(report, 'json');
      await loadTestReporter.saveReport(report, 'html');
    } catch (error) {
      console.warn('Failed to save individual test report:', error);
    }

    // Performance assertions for light load
    expect(summary.successfulUsers).toBeGreaterThanOrEqual(4); // At least 80% success rate
    expect(summary.errorRate).toBeLessThan(20); // Less than 20% error rate
    expect(summary.averageResponseTime).toBeLessThan(10000); // Average response under 10s
    expect(summary.p95ResponseTime).toBeLessThan(15000); // 95th percentile under 15s
    
    // Performance metrics should be reasonable
    if (summary.performanceMetrics.averageFCP > 0) {
      expect(summary.performanceMetrics.averageFCP).toBeLessThan(3000);
    }
    if (summary.performanceMetrics.averageLCP > 0) {
      expect(summary.performanceMetrics.averageLCP).toBeLessThan(4000);
    }

    // Should not generate critical alerts for light load
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    expect(criticalAlerts.length).toBe(0);
  });

  test('moderate load - 10 concurrent users', async () => {
    const config: LoadTestConfig = {
      concurrentUsers: 10,
      testDuration: 60000, // 1 minute
      rampUpTime: 10000, // 10 seconds ramp-up
      scenarios: [
        LOAD_TEST_SCENARIOS.basicAnalysis,
        LOAD_TEST_SCENARIOS.powerUser,
        LOAD_TEST_SCENARIOS.casualBrowser
      ]
    };

    const summary = await loadTester.runLoadTest(config);

    console.log('Moderate Load Test Results:', summary);

    // Generate and analyze performance alerts
    const alerts = await performanceAlerting.analyzeLoadTestResults(summary, config);
    
    if (alerts.length > 0) {
      console.log(`Generated ${alerts.length} performance alerts for moderate load test`);
      alerts.forEach(alert => {
        console.log(`  - ${alert.severity}: ${alert.message}`);
      });
    }

    // Performance assertions for moderate load
    expect(summary.successfulUsers).toBeGreaterThanOrEqual(8); // At least 80% success rate
    expect(summary.errorRate).toBeLessThan(25); // Less than 25% error rate
    expect(summary.averageResponseTime).toBeLessThan(15000); // Average response under 15s
    expect(summary.p95ResponseTime).toBeLessThan(25000); // 95th percentile under 25s
    expect(summary.throughput).toBeGreaterThan(0.1); // At least 0.1 actions per second

    // Check scenario-specific performance
    Object.values(summary.scenarioResults).forEach(scenarioResult => {
      expect(scenarioResult.successRate).toBeGreaterThan(70); // Each scenario should have >70% success
    });

    // Moderate load should not generate too many critical alerts
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    expect(criticalAlerts.length).toBeLessThanOrEqual(2);
  });

  test('heavy load - 20 concurrent users', async () => {
    const config: LoadTestConfig = {
      concurrentUsers: 20,
      testDuration: 90000, // 1.5 minutes
      rampUpTime: 20000, // 20 seconds ramp-up
      scenarios: [
        LOAD_TEST_SCENARIOS.basicAnalysis,
        LOAD_TEST_SCENARIOS.powerUser,
        LOAD_TEST_SCENARIOS.casualBrowser,
        LOAD_TEST_SCENARIOS.configurationUser
      ]
    };

    const summary = await loadTester.runLoadTest(config);

    console.log('Heavy Load Test Results:', summary);

    // Generate and analyze performance alerts for heavy load
    const alerts = await performanceAlerting.analyzeLoadTestResults(summary, config);
    
    console.log(`Generated ${alerts.length} performance alerts for heavy load test`);
    
    // Log critical and high severity alerts
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const highAlerts = alerts.filter(a => a.severity === 'high');
    
    if (criticalAlerts.length > 0) {
      console.log(`Critical alerts (${criticalAlerts.length}):`);
      criticalAlerts.forEach(alert => console.log(`  - ${alert.message}`));
    }
    
    if (highAlerts.length > 0) {
      console.log(`High severity alerts (${highAlerts.length}):`);
      highAlerts.forEach(alert => console.log(`  - ${alert.message}`));
    }

    // Performance assertions for heavy load (more relaxed)
    expect(summary.successfulUsers).toBeGreaterThanOrEqual(15); // At least 75% success rate
    expect(summary.errorRate).toBeLessThan(30); // Less than 30% error rate
    expect(summary.averageResponseTime).toBeLessThan(25000); // Average response under 25s
    expect(summary.p95ResponseTime).toBeLessThan(45000); // 95th percentile under 45s

    // System should still be responsive under heavy load
    expect(summary.throughput).toBeGreaterThan(0.05); // At least 0.05 actions per second

    // Check that the system doesn't completely fail
    expect(summary.successfulUsers).toBeGreaterThan(0);

    // Heavy load may generate alerts, but system should still function
    // We expect some performance degradation alerts at this load level
    expect(summary.successfulUsers / summary.totalUsers).toBeGreaterThan(0.6); // At least 60% success
  });

  test('stress test - analysis-focused load', async () => {
    // Focus on analysis operations which are CPU intensive
    const analysisHeavyConfig: LoadTestConfig = {
      concurrentUsers: 15,
      testDuration: 120000, // 2 minutes
      rampUpTime: 15000, // 15 seconds ramp-up
      scenarios: [
        {
          name: 'Heavy Analysis',
          weight: 80,
          actions: [
            { type: 'navigate', target: '/analyzer' },
            { type: 'wait', timeout: 1000 },
            { 
              type: 'analyze', 
              value: 'This comprehensive AI system achieves exactly 99.7% accuracy with zero false positives across all test cases. ' +
                     'The revolutionary algorithm processes millions of data points in real-time with unprecedented precision. ' +
                     'All users report perfect satisfaction with 100% success rates in every deployment scenario.',
              timeout: 60000
            },
            { type: 'wait', timeout: 2000 }
          ]
        },
        LOAD_TEST_SCENARIOS.casualBrowser
      ]
    };

    const summary = await loadTester.runLoadTest(analysisHeavyConfig);

    console.log('Analysis-Heavy Stress Test Results:', summary);

    // Generate performance alerts for stress test
    const alerts = await performanceAlerting.analyzeLoadTestResults(summary, analysisHeavyConfig);
    
    console.log(`Generated ${alerts.length} performance alerts for analysis-heavy stress test`);
    
    // Categorize alerts by severity
    const alertsBySeverity = {
      critical: alerts.filter(a => a.severity === 'critical'),
      high: alerts.filter(a => a.severity === 'high'),
      medium: alerts.filter(a => a.severity === 'medium'),
      low: alerts.filter(a => a.severity === 'low')
    };
    
    Object.entries(alertsBySeverity).forEach(([severity, severityAlerts]) => {
      if (severityAlerts.length > 0) {
        console.log(`${severity.toUpperCase()} alerts (${severityAlerts.length}):`);
        severityAlerts.forEach(alert => console.log(`  - ${alert.message}`));
      }
    });

    // Stress test assertions (focus on system stability)
    expect(summary.successfulUsers).toBeGreaterThanOrEqual(10); // At least 67% success under stress
    expect(summary.errorRate).toBeLessThan(40); // Less than 40% error rate under stress
    
    // Analysis operations should still complete (even if slowly)
    const heavyAnalysisResults = summary.scenarioResults['Heavy Analysis'];
    if (heavyAnalysisResults) {
      expect(heavyAnalysisResults.successRate).toBeGreaterThan(50); // At least 50% of analyses should succeed
      expect(heavyAnalysisResults.averageTime).toBeLessThan(90000); // Should complete within 90 seconds on average
    }

    // System should maintain some level of throughput
    expect(summary.throughput).toBeGreaterThan(0.02);

    // Stress tests are expected to generate alerts, but system should not completely fail
    expect(summary.successfulUsers).toBeGreaterThan(0);
    
    // Log performance degradation insights
    if (alertsBySeverity.critical.length > 0) {
      console.log('⚠️  Critical performance issues detected under analysis-heavy stress load');
    }
  });

  test('burst load - rapid user increase', async () => {
    // Simulate sudden traffic spike
    const burstConfig: LoadTestConfig = {
      concurrentUsers: 25,
      testDuration: 45000, // 45 seconds
      rampUpTime: 5000, // Very fast ramp-up (5 seconds)
      scenarios: [
        LOAD_TEST_SCENARIOS.basicAnalysis,
        LOAD_TEST_SCENARIOS.casualBrowser
      ]
    };

    const summary = await loadTester.runLoadTest(burstConfig);

    console.log('Burst Load Test Results:', summary);

    // Generate performance alerts for burst load
    const alerts = await performanceAlerting.analyzeLoadTestResults(summary, burstConfig);
    
    console.log(`Generated ${alerts.length} performance alerts for burst load test`);
    
    // Focus on concurrent user capacity alerts for burst testing
    const concurrentUserAlerts = alerts.filter(a => a.type === 'concurrent_users');
    const responseTimeAlerts = alerts.filter(a => a.type === 'response_time');
    
    if (concurrentUserAlerts.length > 0) {
      console.log('Concurrent user capacity alerts:');
      concurrentUserAlerts.forEach(alert => console.log(`  - ${alert.message}`));
    }
    
    if (responseTimeAlerts.length > 0) {
      console.log('Response time alerts during burst:');
      responseTimeAlerts.forEach(alert => console.log(`  - ${alert.message}`));
    }

    // Burst load assertions (system should handle sudden spikes)
    expect(summary.successfulUsers).toBeGreaterThanOrEqual(18); // At least 72% success during burst
    expect(summary.errorRate).toBeLessThan(35); // Less than 35% error rate during burst
    
    // Response times may be higher during burst, but should still be reasonable
    expect(summary.p99ResponseTime).toBeLessThan(60000); // 99th percentile under 1 minute

    // System should recover and maintain throughput
    expect(summary.throughput).toBeGreaterThan(0.03);

    // Burst load testing specifically validates system resilience to traffic spikes
    // We expect some performance degradation alerts but system should remain functional
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      console.log(`⚠️  System shows stress under burst load: ${criticalAlerts.length} critical alerts`);
    }
    
    // System should not completely fail under burst conditions
    expect(summary.successfulUsers / summary.totalUsers).toBeGreaterThan(0.5); // At least 50% success
  });

  test('endurance test - sustained load', async () => {
    // Test system stability over longer period
    const enduranceConfig: LoadTestConfig = {
      concurrentUsers: 8,
      testDuration: 300000, // 5 minutes
      rampUpTime: 30000, // 30 seconds ramp-up
      scenarios: [
        LOAD_TEST_SCENARIOS.basicAnalysis,
        LOAD_TEST_SCENARIOS.powerUser,
        LOAD_TEST_SCENARIOS.casualBrowser,
        LOAD_TEST_SCENARIOS.configurationUser
      ]
    };

    const summary = await loadTester.runLoadTest(enduranceConfig);

    console.log('Endurance Test Results:', summary);

    // Generate performance alerts for endurance test
    const alerts = await performanceAlerting.analyzeLoadTestResults(summary, enduranceConfig);
    
    console.log(`Generated ${alerts.length} performance alerts for endurance test`);
    
    // Analyze performance trends over time
    const performanceAlerts = alerts.filter(a => 
      a.type === 'response_time' || a.type === 'throughput' || a.type === 'core_web_vitals'
    );
    
    if (performanceAlerts.length > 0) {
      console.log('Performance degradation over time:');
      performanceAlerts.forEach(alert => console.log(`  - ${alert.message}`));
    }

    // Endurance test assertions (focus on stability over time)
    expect(summary.successfulUsers).toBeGreaterThanOrEqual(6); // At least 75% success over time
    expect(summary.errorRate).toBeLessThan(25); // Less than 25% error rate over extended period
    
    // Performance should remain consistent over time
    expect(summary.averageResponseTime).toBeLessThan(20000); // Average should stay reasonable
    expect(summary.throughput).toBeGreaterThan(0.08); // Should maintain good throughput

    // All scenarios should remain functional
    Object.values(summary.scenarioResults).forEach(scenarioResult => {
      expect(scenarioResult.successRate).toBeGreaterThan(60); // Each scenario should maintain >60% success
    });

    // Performance metrics should not degrade significantly
    if (summary.performanceMetrics.averageFCP > 0) {
      expect(summary.performanceMetrics.averageFCP).toBeLessThan(4000); // FCP should remain reasonable
    }

    // Endurance testing validates system stability over extended periods
    // Minimal performance degradation is expected
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    expect(criticalAlerts.length).toBeLessThanOrEqual(1); // Should have minimal critical issues
    
    // Log endurance test insights
    console.log(`Endurance test completed: ${summary.successfulUsers}/${summary.totalUsers} users successful`);
    console.log(`Average response time: ${summary.averageResponseTime.toFixed(0)}ms`);
    console.log(`Throughput: ${summary.throughput.toFixed(3)} req/s`);
    console.log(`Error rate: ${summary.errorRate.toFixed(1)}%`);
  });

  test('mixed workload - realistic usage patterns', async () => {
    // Simulate realistic mix of user behaviors
    const realisticConfig: LoadTestConfig = {
      concurrentUsers: 12,
      testDuration: 180000, // 3 minutes
      rampUpTime: 15000, // 15 seconds ramp-up
      scenarios: [
        { ...LOAD_TEST_SCENARIOS.basicAnalysis, weight: 50 }, // Most users do basic analysis
        { ...LOAD_TEST_SCENARIOS.casualBrowser, weight: 25 }, // Some just browse
        { ...LOAD_TEST_SCENARIOS.powerUser, weight: 20 }, // Fewer power users
        { ...LOAD_TEST_SCENARIOS.configurationUser, weight: 5 } // Occasional settings changes
      ]
    };

    const summary = await loadTester.runLoadTest(realisticConfig);

    console.log('Realistic Mixed Workload Results:', summary);

    // Generate performance alerts for realistic workload
    const alerts = await performanceAlerting.analyzeLoadTestResults(summary, realisticConfig);
    
    console.log(`Generated ${alerts.length} performance alerts for realistic mixed workload`);
    
    // Analyze scenario-specific performance
    const scenarioAlerts = new Map<string, typeof alerts>();
    alerts.forEach(alert => {
      const scenario = alert.testConfig?.scenario || 'Unknown';
      if (!scenarioAlerts.has(scenario)) {
        scenarioAlerts.set(scenario, []);
      }
      scenarioAlerts.get(scenario)!.push(alert);
    });
    
    scenarioAlerts.forEach((scenarioAlertList, scenario) => {
      if (scenarioAlertList.length > 0) {
        console.log(`Alerts for ${scenario}:`);
        scenarioAlertList.forEach(alert => console.log(`  - ${alert.severity}: ${alert.message}`));
      }
    });

    // Realistic workload assertions
    expect(summary.successfulUsers).toBeGreaterThanOrEqual(10); // At least 83% success
    expect(summary.errorRate).toBeLessThan(20); // Less than 20% error rate
    expect(summary.averageResponseTime).toBeLessThan(12000); // Average under 12 seconds
    expect(summary.throughput).toBeGreaterThan(0.1); // Good throughput for mixed workload

    // Verify different user types perform as expected
    const basicAnalysisResults = summary.scenarioResults['Basic Analysis'];
    const powerUserResults = summary.scenarioResults['Power User'];
    
    if (basicAnalysisResults) {
      expect(basicAnalysisResults.successRate).toBeGreaterThan(80); // Basic analysis should work well
    }
    
    if (powerUserResults) {
      expect(powerUserResults.successRate).toBeGreaterThan(70); // Power user features should be stable
    }

    // Performance should be good for the majority of users
    if (summary.performanceMetrics.averageLCP > 0) {
      expect(summary.performanceMetrics.averageLCP).toBeLessThan(3500);
    }

    // Realistic workload should have minimal critical alerts
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    expect(criticalAlerts.length).toBeLessThanOrEqual(1);
    
    // Generate workload performance summary
    console.log('\n=== MIXED WORKLOAD PERFORMANCE SUMMARY ===');
    console.log(`Total Users: ${summary.totalUsers}`);
    console.log(`Success Rate: ${((summary.successfulUsers / summary.totalUsers) * 100).toFixed(1)}%`);
    console.log(`Average Response Time: ${summary.averageResponseTime.toFixed(0)}ms`);
    console.log(`P95 Response Time: ${summary.p95ResponseTime.toFixed(0)}ms`);
    console.log(`Throughput: ${summary.throughput.toFixed(3)} req/s`);
    console.log(`Error Rate: ${summary.errorRate.toFixed(1)}%`);
    
    // Scenario breakdown
    console.log('\nScenario Performance:');
    Object.entries(summary.scenarioResults).forEach(([scenario, results]) => {
      console.log(`  ${scenario}: ${results.successRate.toFixed(1)}% success, ${results.averageTime.toFixed(0)}ms avg`);
    });
    console.log('==========================================\n');
  });
});