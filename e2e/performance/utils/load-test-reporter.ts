import { LoadTestSummary, LoadTestResult } from './load-testing';
import { PerformanceAlert } from './performance-alerting';
import { PERFORMANCE_BENCHMARKS } from '../load-testing.config';

export interface LoadTestReport {
  testId: string;
  timestamp: string;
  testConfig: {
    concurrentUsers: number;
    testDuration: number;
    rampUpTime: number;
    scenarios: string[];
  };
  summary: LoadTestSummary;
  alerts: PerformanceAlert[];
  performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendations: string[];
  benchmarkComparison: {
    responseTime: 'excellent' | 'good' | 'acceptable' | 'poor';
    throughput: 'excellent' | 'good' | 'acceptable' | 'poor';
    errorRate: 'excellent' | 'good' | 'acceptable' | 'poor';
  };
}

/**
 * Load test report generator and analyzer
 */
export class LoadTestReporter {
  private reports: LoadTestReport[] = [];

  /**
   * Generate a comprehensive load test report
   */
  generateReport(
    testConfig: any,
    summary: LoadTestSummary,
    alerts: PerformanceAlert[],
    testResults?: LoadTestResult[]
  ): LoadTestReport {
    const testId = `load-test-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    const benchmarkComparison = this.compareToBenchmarks(summary);
    const performanceGrade = this.calculatePerformanceGrade(summary, alerts, benchmarkComparison);
    const recommendations = this.generateRecommendations(summary, alerts, benchmarkComparison);

    const report: LoadTestReport = {
      testId,
      timestamp: new Date().toISOString(),
      testConfig: {
        concurrentUsers: testConfig.concurrentUsers,
        testDuration: testConfig.testDuration,
        rampUpTime: testConfig.rampUpTime,
        scenarios: testConfig.scenarios?.map((s: any) => s.name) || []
      },
      summary,
      alerts,
      performanceGrade,
      recommendations,
      benchmarkComparison
    };

    this.reports.push(report);
    return report;
  }

  /**
   * Compare test results to performance benchmarks
   */
  private compareToBenchmarks(summary: LoadTestSummary): LoadTestReport['benchmarkComparison'] {
    const benchmarks = PERFORMANCE_BENCHMARKS;

    // Response time comparison
    let responseTimeGrade: 'excellent' | 'good' | 'acceptable' | 'poor' = 'poor';
    if (summary.p95ResponseTime <= benchmarks.responseTime.excellent.p95) {
      responseTimeGrade = 'excellent';
    } else if (summary.p95ResponseTime <= benchmarks.responseTime.good.p95) {
      responseTimeGrade = 'good';
    } else if (summary.p95ResponseTime <= benchmarks.responseTime.acceptable.p95) {
      responseTimeGrade = 'acceptable';
    }

    // Throughput comparison
    let throughputGrade: 'excellent' | 'good' | 'acceptable' | 'poor' = 'poor';
    if (summary.throughput >= benchmarks.throughput.excellent) {
      throughputGrade = 'excellent';
    } else if (summary.throughput >= benchmarks.throughput.good) {
      throughputGrade = 'good';
    } else if (summary.throughput >= benchmarks.throughput.acceptable) {
      throughputGrade = 'acceptable';
    }

    // Error rate comparison
    let errorRateGrade: 'excellent' | 'good' | 'acceptable' | 'poor' = 'poor';
    if (summary.errorRate <= benchmarks.errorRate.excellent) {
      errorRateGrade = 'excellent';
    } else if (summary.errorRate <= benchmarks.errorRate.good) {
      errorRateGrade = 'good';
    } else if (summary.errorRate <= benchmarks.errorRate.acceptable) {
      errorRateGrade = 'acceptable';
    }

    return {
      responseTime: responseTimeGrade,
      throughput: throughputGrade,
      errorRate: errorRateGrade
    };
  }

  /**
   * Calculate overall performance grade
   */
  private calculatePerformanceGrade(
    summary: LoadTestSummary,
    alerts: PerformanceAlert[],
    benchmarks: LoadTestReport['benchmarkComparison']
  ): 'A' | 'B' | 'C' | 'D' | 'F' {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const highAlerts = alerts.filter(a => a.severity === 'high').length;

    // Immediate F grade for critical issues
    if (criticalAlerts > 2 || summary.errorRate > 50) {
      return 'F';
    }

    // Calculate score based on benchmarks
    const scores = {
      excellent: 4,
      good: 3,
      acceptable: 2,
      poor: 1
    };

    const totalScore = scores[benchmarks.responseTime] + 
                     scores[benchmarks.throughput] + 
                     scores[benchmarks.errorRate];

    // Adjust score based on alerts
    let adjustedScore = totalScore;
    adjustedScore -= criticalAlerts * 2;
    adjustedScore -= highAlerts * 1;

    // Convert to letter grade
    if (adjustedScore >= 11) return 'A';
    if (adjustedScore >= 9) return 'B';
    if (adjustedScore >= 7) return 'C';
    if (adjustedScore >= 5) return 'D';
    return 'F';
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    summary: LoadTestSummary,
    alerts: PerformanceAlert[],
    benchmarks: LoadTestReport['benchmarkComparison']
  ): string[] {
    const recommendations: string[] = [];

    // Response time recommendations
    if (benchmarks.responseTime === 'poor') {
      recommendations.push('Response times are significantly high. Consider optimizing database queries, implementing caching, or scaling server resources.');
      
      if (summary.p95ResponseTime > 30000) {
        recommendations.push('P95 response time exceeds 30 seconds. This indicates severe performance bottlenecks that need immediate attention.');
      }
    } else if (benchmarks.responseTime === 'acceptable') {
      recommendations.push('Response times are acceptable but could be improved. Consider implementing performance optimizations.');
    }

    // Throughput recommendations
    if (benchmarks.throughput === 'poor') {
      recommendations.push('System throughput is low. Consider horizontal scaling, load balancing, or optimizing application performance.');
    } else if (benchmarks.throughput === 'acceptable') {
      recommendations.push('Throughput is acceptable but could be enhanced with performance tuning.');
    }

    // Error rate recommendations
    if (benchmarks.errorRate === 'poor') {
      recommendations.push('High error rate detected. Investigate application logs, fix bugs, and improve error handling.');
      
      if (summary.errorRate > 30) {
        recommendations.push('Error rate exceeds 30%. This indicates critical system instability that requires immediate investigation.');
      }
    } else if (benchmarks.errorRate === 'acceptable') {
      recommendations.push('Error rate is acceptable but should be monitored and reduced where possible.');
    }

    // Alert-based recommendations
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const concurrentUserAlerts = alerts.filter(a => a.type === 'concurrent_users');
    const webVitalsAlerts = alerts.filter(a => a.type === 'core_web_vitals');

    if (criticalAlerts.length > 0) {
      recommendations.push(`${criticalAlerts.length} critical performance issues detected. Review alerts and implement fixes immediately.`);
    }

    if (concurrentUserAlerts.length > 0) {
      recommendations.push('System shows stress under concurrent user load. Consider implementing connection pooling, rate limiting, or scaling infrastructure.');
    }

    if (webVitalsAlerts.length > 0) {
      recommendations.push('Core Web Vitals metrics are degraded. Optimize frontend performance, reduce bundle sizes, and implement lazy loading.');
    }

    // Scenario-specific recommendations
    const scenarioResults = Object.entries(summary.scenarioResults);
    const poorScenarios = scenarioResults.filter(([_, result]) => result.successRate < 70);
    
    if (poorScenarios.length > 0) {
      recommendations.push(`Poor performance in scenarios: ${poorScenarios.map(([name]) => name).join(', ')}. Focus optimization efforts on these workflows.`);
    }

    // Core Web Vitals recommendations
    if (summary.performanceMetrics.averageFCP > 3000) {
      recommendations.push('First Contentful Paint is slow. Optimize critical rendering path and reduce server response times.');
    }

    if (summary.performanceMetrics.averageLCP > 4000) {
      recommendations.push('Largest Contentful Paint is slow. Optimize images, implement lazy loading, and improve server performance.');
    }

    if (summary.performanceMetrics.averageCLS > 0.1) {
      recommendations.push('Cumulative Layout Shift is high. Ensure proper sizing for images and ads, avoid inserting content above existing content.');
    }

    // General recommendations if no specific issues
    if (recommendations.length === 0) {
      recommendations.push('Performance is within acceptable ranges. Continue monitoring and consider proactive optimizations.');
    }

    return recommendations;
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport(report: LoadTestReport): string {
    const gradeColors = {
      'A': '#4CAF50',
      'B': '#8BC34A',
      'C': '#FFC107',
      'D': '#FF9800',
      'F': '#F44336'
    };

    const benchmarkColors = {
      'excellent': '#4CAF50',
      'good': '#8BC34A',
      'acceptable': '#FFC107',
      'poor': '#F44336'
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Load Test Report - ${report.testId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .grade { font-size: 48px; font-weight: bold; color: ${gradeColors[report.performanceGrade]}; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric-card { background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #007bff; }
        .metric-value { font-size: 24px; font-weight: bold; color: #333; }
        .metric-label { color: #666; font-size: 14px; }
        .benchmark { display: inline-block; padding: 4px 8px; border-radius: 4px; color: white; font-size: 12px; font-weight: bold; }
        .alerts { margin: 20px 0; }
        .alert { padding: 10px; margin: 5px 0; border-radius: 4px; }
        .alert.critical { background: #ffebee; border-left: 4px solid #f44336; }
        .alert.high { background: #fff3e0; border-left: 4px solid #ff9800; }
        .alert.medium { background: #e3f2fd; border-left: 4px solid #2196f3; }
        .alert.low { background: #e8f5e8; border-left: 4px solid #4caf50; }
        .recommendations { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .recommendations ul { margin: 10px 0; padding-left: 20px; }
        .scenarios { margin: 20px 0; }
        .scenario { background: #f8f9fa; padding: 10px; margin: 5px 0; border-radius: 4px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Load Test Performance Report</h1>
            <div class="grade">${report.performanceGrade}</div>
            <p>Test ID: ${report.testId}</p>
            <p>Generated: ${new Date(report.timestamp).toLocaleString()}</p>
        </div>

        <div class="metrics">
            <div class="metric-card">
                <div class="metric-value">${report.summary.totalUsers}</div>
                <div class="metric-label">Total Users</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${((report.summary.successfulUsers / report.summary.totalUsers) * 100).toFixed(1)}%</div>
                <div class="metric-label">Success Rate</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.summary.averageResponseTime.toFixed(0)}ms</div>
                <div class="metric-label">Avg Response Time</div>
                <span class="benchmark" style="background-color: ${benchmarkColors[report.benchmarkComparison.responseTime]}">${report.benchmarkComparison.responseTime}</span>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.summary.throughput.toFixed(3)}</div>
                <div class="metric-label">Throughput (req/s)</div>
                <span class="benchmark" style="background-color: ${benchmarkColors[report.benchmarkComparison.throughput]}">${report.benchmarkComparison.throughput}</span>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.summary.errorRate.toFixed(1)}%</div>
                <div class="metric-label">Error Rate</div>
                <span class="benchmark" style="background-color: ${benchmarkColors[report.benchmarkComparison.errorRate]}">${report.benchmarkComparison.errorRate}</span>
            </div>
            <div class="metric-card">
                <div class="metric-value">${report.summary.p95ResponseTime.toFixed(0)}ms</div>
                <div class="metric-label">P95 Response Time</div>
            </div>
        </div>

        <h2>Test Configuration</h2>
        <table>
            <tr><th>Concurrent Users</th><td>${report.testConfig.concurrentUsers}</td></tr>
            <tr><th>Test Duration</th><td>${(report.testConfig.testDuration / 1000).toFixed(0)} seconds</td></tr>
            <tr><th>Ramp-up Time</th><td>${(report.testConfig.rampUpTime / 1000).toFixed(0)} seconds</td></tr>
            <tr><th>Scenarios</th><td>${report.testConfig.scenarios.join(', ')}</td></tr>
        </table>

        <h2>Performance Alerts (${report.alerts.length})</h2>
        <div class="alerts">
            ${report.alerts.map(alert => `
                <div class="alert ${alert.severity}">
                    <strong>${alert.severity.toUpperCase()}</strong>: ${alert.message}
                    <br><small>Threshold: ${alert.threshold}, Actual: ${alert.actualValue}</small>
                </div>
            `).join('')}
            ${report.alerts.length === 0 ? '<p>No performance alerts generated.</p>' : ''}
        </div>

        <h2>Scenario Performance</h2>
        <div class="scenarios">
            ${Object.entries(report.summary.scenarioResults).map(([scenario, results]) => `
                <div class="scenario">
                    <strong>${scenario}</strong>: ${results.successRate.toFixed(1)}% success rate, ${results.averageTime.toFixed(0)}ms average time (${results.count} users)
                </div>
            `).join('')}
        </div>

        <h2>Core Web Vitals</h2>
        <table>
            <tr><th>Metric</th><th>Average Value</th><th>Status</th></tr>
            <tr>
                <td>First Contentful Paint (FCP)</td>
                <td>${report.summary.performanceMetrics.averageFCP.toFixed(0)}ms</td>
                <td>${report.summary.performanceMetrics.averageFCP <= 2000 ? '✅ Good' : report.summary.performanceMetrics.averageFCP <= 4000 ? '⚠️ Needs Improvement' : '❌ Poor'}</td>
            </tr>
            <tr>
                <td>Largest Contentful Paint (LCP)</td>
                <td>${report.summary.performanceMetrics.averageLCP.toFixed(0)}ms</td>
                <td>${report.summary.performanceMetrics.averageLCP <= 2500 ? '✅ Good' : report.summary.performanceMetrics.averageLCP <= 4000 ? '⚠️ Needs Improvement' : '❌ Poor'}</td>
            </tr>
            <tr>
                <td>Cumulative Layout Shift (CLS)</td>
                <td>${report.summary.performanceMetrics.averageCLS.toFixed(3)}</td>
                <td>${report.summary.performanceMetrics.averageCLS <= 0.1 ? '✅ Good' : report.summary.performanceMetrics.averageCLS <= 0.25 ? '⚠️ Needs Improvement' : '❌ Poor'}</td>
            </tr>
        </table>

        <div class="recommendations">
            <h2>Recommendations</h2>
            <ul>
                ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Save report to file
   */
  async saveReport(report: LoadTestReport, format: 'json' | 'html' = 'json'): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const reportsDir = path.join(process.cwd(), 'test-results', 'load-test-reports');
      await fs.mkdir(reportsDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = path.join(reportsDir, `load-test-report-${timestamp}.${format}`);
      
      if (format === 'html') {
        const htmlContent = this.generateHTMLReport(report);
        await fs.writeFile(filename, htmlContent);
      } else {
        await fs.writeFile(filename, JSON.stringify(report, null, 2));
      }
      
      console.log(`Load test report saved to: ${filename}`);
      return filename;
    } catch (error) {
      console.error('Failed to save load test report:', error);
      throw error;
    }
  }

  /**
   * Get all reports
   */
  getReports(): LoadTestReport[] {
    return [...this.reports];
  }

  /**
   * Get reports by performance grade
   */
  getReportsByGrade(grade: LoadTestReport['performanceGrade']): LoadTestReport[] {
    return this.reports.filter(report => report.performanceGrade === grade);
  }

  /**
   * Generate trend analysis across multiple reports
   */
  generateTrendAnalysis(): {
    averageGrade: number;
    trendDirection: 'improving' | 'stable' | 'degrading';
    keyMetricsTrend: {
      responseTime: 'improving' | 'stable' | 'degrading';
      throughput: 'improving' | 'stable' | 'degrading';
      errorRate: 'improving' | 'stable' | 'degrading';
    };
  } {
    if (this.reports.length < 2) {
      return {
        averageGrade: 0,
        trendDirection: 'stable',
        keyMetricsTrend: {
          responseTime: 'stable',
          throughput: 'stable',
          errorRate: 'stable'
        }
      };
    }

    const gradeValues = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1 };
    const recentReports = this.reports.slice(-5); // Last 5 reports
    
    const averageGrade = recentReports.reduce((sum, report) => 
      sum + gradeValues[report.performanceGrade], 0) / recentReports.length;

    // Compare first half vs second half of recent reports
    const firstHalf = recentReports.slice(0, Math.floor(recentReports.length / 2));
    const secondHalf = recentReports.slice(Math.floor(recentReports.length / 2));

    const firstHalfAvg = firstHalf.reduce((sum, r) => sum + gradeValues[r.performanceGrade], 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, r) => sum + gradeValues[r.performanceGrade], 0) / secondHalf.length;

    let trendDirection: 'improving' | 'stable' | 'degrading' = 'stable';
    if (secondHalfAvg > firstHalfAvg + 0.5) trendDirection = 'improving';
    else if (secondHalfAvg < firstHalfAvg - 0.5) trendDirection = 'degrading';

    // Analyze key metrics trends
    const getMetricTrend = (getMetric: (report: LoadTestReport) => number, lowerIsBetter = true) => {
      const firstHalfMetric = firstHalf.reduce((sum, r) => sum + getMetric(r), 0) / firstHalf.length;
      const secondHalfMetric = secondHalf.reduce((sum, r) => sum + getMetric(r), 0) / secondHalf.length;
      
      const threshold = firstHalfMetric * 0.1; // 10% change threshold
      
      if (lowerIsBetter) {
        if (secondHalfMetric < firstHalfMetric - threshold) return 'improving';
        if (secondHalfMetric > firstHalfMetric + threshold) return 'degrading';
      } else {
        if (secondHalfMetric > firstHalfMetric + threshold) return 'improving';
        if (secondHalfMetric < firstHalfMetric - threshold) return 'degrading';
      }
      
      return 'stable';
    };

    return {
      averageGrade,
      trendDirection,
      keyMetricsTrend: {
        responseTime: getMetricTrend(r => r.summary.averageResponseTime, true),
        throughput: getMetricTrend(r => r.summary.throughput, false),
        errorRate: getMetricTrend(r => r.summary.errorRate, true)
      }
    };
  }
}