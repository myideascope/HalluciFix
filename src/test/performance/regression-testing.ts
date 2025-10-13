import { DatabaseLoadTester, LoadTestResult } from './database-load-testing';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../lib/env';

interface RegressionTestConfig {
  baselineBranch?: string;
  currentBranch?: string;
  testSuites: string[];
  performanceThresholds: {
    maxResponseTimeDegradation: number; // percentage
    maxThroughputDegradation: number; // percentage
    maxErrorRateIncrease: number; // percentage points
  };
  comparisonMetrics: string[];
}

interface RegressionTestResult {
  testName: string;
  timestamp: Date;
  baselineResult?: LoadTestResult;
  currentResult: LoadTestResult;
  comparison: PerformanceComparison;
  passed: boolean;
  failedChecks: string[];
  recommendations: string[];
}

interface PerformanceComparison {
  responseTimeChange: number; // percentage change
  throughputChange: number; // percentage change
  errorRateChange: number; // percentage point change
  p95ResponseTimeChange: number;
  p99ResponseTimeChange: number;
  queryPerformanceChanges: Map<string, QueryPerformanceChange>;
}

interface QueryPerformanceChange {
  queryType: string;
  responseTimeChange: number;
  executionCountChange: number;
  errorRateChange: number;
}

interface BaselineData {
  id: string;
  testName: string;
  branch: string;
  commitHash: string;
  timestamp: Date;
  result: LoadTestResult;
}

class DatabaseRegressionTester {
  private loadTester = new DatabaseLoadTester();
  private supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

  async runRegressionTest(
    testName: string,
    config: RegressionTestConfig
  ): Promise<RegressionTestResult> {
    console.log(`Starting regression test: ${testName}`);
    
    // Get baseline data
    const baseline = await this.getBaselineData(testName, config.baselineBranch);
    
    // Run current performance test
    const currentResult = await this.runCurrentPerformanceTest(testName);
    
    // Compare results
    const comparison = this.comparePerformance(baseline?.result, currentResult);
    
    // Evaluate against thresholds
    const { passed, failedChecks } = this.evaluateThresholds(comparison, config.performanceThresholds);
    
    // Generate recommendations
    const recommendations = this.generateRegressionRecommendations(comparison, failedChecks);
    
    const result: RegressionTestResult = {
      testName,
      timestamp: new Date(),
      baselineResult: baseline?.result,
      currentResult,
      comparison,
      passed,
      failedChecks,
      recommendations
    };
    
    // Save results for future comparisons
    await this.saveRegressionResult(result, config.currentBranch);
    
    this.printRegressionSummary(result);
    
    return result;
  }

  private async getBaselineData(testName: string, branch?: string): Promise<BaselineData | null> {
    try {
      let query = this.supabase
        .from('performance_baselines')
        .select('*')
        .eq('test_name', testName)
        .order('timestamp', { ascending: false });
      
      if (branch) {
        query = query.eq('branch', branch);
      }
      
      const { data, error } = await query.limit(1);
      
      if (error || !data || data.length === 0) {
        console.warn(`No baseline data found for test: ${testName}`);
        return null;
      }
      
      return data[0] as BaselineData;
    } catch (error) {
      console.error('Failed to get baseline data:', error);
      return null;
    }
  }

  private async runCurrentPerformanceTest(testName: string): Promise<LoadTestResult> {
    // Define standard regression test configuration
    const testConfig = {
      concurrentUsers: 20,
      testDuration: 120,
      operationsPerUser: 30,
      queryTypes: [
        'user_analysis_list',
        'dashboard_analytics',
        'search_content',
        'risk_level_filter',
        'complex_aggregation'
      ]
    };
    
    return await this.loadTester.runLoadTest(`regression_${testName}`, testConfig);
  }

  private comparePerformance(
    baseline?: LoadTestResult,
    current?: LoadTestResult
  ): PerformanceComparison {
    if (!baseline || !current) {
      return {
        responseTimeChange: 0,
        throughputChange: 0,
        errorRateChange: 0,
        p95ResponseTimeChange: 0,
        p99ResponseTimeChange: 0,
        queryPerformanceChanges: new Map()
      };
    }
    
    const responseTimeChange = ((current.averageResponseTime - baseline.averageResponseTime) / baseline.averageResponseTime) * 100;
    const throughputChange = ((current.throughput - baseline.throughput) / baseline.throughput) * 100;
    const errorRateChange = current.errorRate - baseline.errorRate;
    const p95ResponseTimeChange = ((current.p95ResponseTime - baseline.p95ResponseTime) / baseline.p95ResponseTime) * 100;
    const p99ResponseTimeChange = ((current.p99ResponseTime - baseline.p99ResponseTime) / baseline.p99ResponseTime) * 100;
    
    // Compare query-specific performance
    const queryPerformanceChanges = new Map<string, QueryPerformanceChange>();
    
    current.queryResults.forEach((currentQuery, queryType) => {
      const baselineQuery = baseline.queryResults.get(queryType);
      
      if (baselineQuery) {
        const queryResponseTimeChange = ((currentQuery.averageTime - baselineQuery.averageTime) / baselineQuery.averageTime) * 100;
        const queryExecutionCountChange = ((currentQuery.totalExecutions - baselineQuery.totalExecutions) / baselineQuery.totalExecutions) * 100;
        const queryErrorRateChange = ((currentQuery.errorCount / currentQuery.totalExecutions) - (baselineQuery.errorCount / baselineQuery.totalExecutions)) * 100;
        
        queryPerformanceChanges.set(queryType, {
          queryType,
          responseTimeChange: queryResponseTimeChange,
          executionCountChange: queryExecutionCountChange,
          errorRateChange: queryErrorRateChange
        });
      }
    });
    
    return {
      responseTimeChange,
      throughputChange,
      errorRateChange,
      p95ResponseTimeChange,
      p99ResponseTimeChange,
      queryPerformanceChanges
    };
  }

  private evaluateThresholds(
    comparison: PerformanceComparison,
    thresholds: RegressionTestConfig['performanceThresholds']
  ): { passed: boolean; failedChecks: string[] } {
    const failedChecks: string[] = [];
    
    // Check response time degradation
    if (comparison.responseTimeChange > thresholds.maxResponseTimeDegradation) {
      failedChecks.push(`Response time degraded by ${comparison.responseTimeChange.toFixed(2)}% (threshold: ${thresholds.maxResponseTimeDegradation}%)`);
    }
    
    // Check throughput degradation
    if (comparison.throughputChange < -thresholds.maxThroughputDegradation) {
      failedChecks.push(`Throughput degraded by ${Math.abs(comparison.throughputChange).toFixed(2)}% (threshold: ${thresholds.maxThroughputDegradation}%)`);
    }
    
    // Check error rate increase
    if (comparison.errorRateChange > thresholds.maxErrorRateIncrease) {
      failedChecks.push(`Error rate increased by ${comparison.errorRateChange.toFixed(2)} percentage points (threshold: ${thresholds.maxErrorRateIncrease})`);
    }
    
    // Check P95 response time
    if (comparison.p95ResponseTimeChange > thresholds.maxResponseTimeDegradation) {
      failedChecks.push(`P95 response time degraded by ${comparison.p95ResponseTimeChange.toFixed(2)}% (threshold: ${thresholds.maxResponseTimeDegradation}%)`);
    }
    
    // Check query-specific performance
    comparison.queryPerformanceChanges.forEach((queryChange, queryType) => {
      if (queryChange.responseTimeChange > thresholds.maxResponseTimeDegradation) {
        failedChecks.push(`Query '${queryType}' response time degraded by ${queryChange.responseTimeChange.toFixed(2)}%`);
      }
    });
    
    return {
      passed: failedChecks.length === 0,
      failedChecks
    };
  }

  private generateRegressionRecommendations(
    comparison: PerformanceComparison,
    failedChecks: string[]
  ): string[] {
    const recommendations: string[] = [];
    
    if (failedChecks.length === 0) {
      recommendations.push('All performance metrics are within acceptable thresholds.');
      return recommendations;
    }
    
    // Response time recommendations
    if (comparison.responseTimeChange > 10) {
      recommendations.push('Significant response time degradation detected. Review recent code changes and query optimizations.');
    }
    
    // Throughput recommendations
    if (comparison.throughputChange < -10) {
      recommendations.push('Throughput has decreased significantly. Check for resource constraints or inefficient queries.');
    }
    
    // Error rate recommendations
    if (comparison.errorRateChange > 1) {
      recommendations.push('Error rate has increased. Investigate failing queries and connection issues.');
    }
    
    // Query-specific recommendations
    comparison.queryPerformanceChanges.forEach((queryChange, queryType) => {
      if (queryChange.responseTimeChange > 20) {
        recommendations.push(`Query '${queryType}' performance degraded significantly. Review query optimization and indexing.`);
      }
    });
    
    // General recommendations
    if (failedChecks.length > 2) {
      recommendations.push('Multiple performance metrics have degraded. Consider reverting recent changes and investigating systematically.');
    }
    
    return recommendations;
  }

  private async saveRegressionResult(
    result: RegressionTestResult,
    branch?: string
  ): Promise<void> {
    try {
      // Save as new baseline if test passed
      if (result.passed) {
        await this.supabase
          .from('performance_baselines')
          .insert({
            test_name: result.testName,
            branch: branch || 'main',
            commit_hash: process.env.GIT_COMMIT || 'unknown',
            timestamp: result.timestamp.toISOString(),
            result: result.currentResult
          });
      }
      
      // Save regression test result
      await this.supabase
        .from('regression_test_results')
        .insert({
          test_name: result.testName,
          timestamp: result.timestamp.toISOString(),
          baseline_result: result.baselineResult,
          current_result: result.currentResult,
          comparison: result.comparison,
          passed: result.passed,
          failed_checks: result.failedChecks,
          recommendations: result.recommendations
        });
        
    } catch (error) {
      console.error('Failed to save regression result:', error);
    }
  }

  private printRegressionSummary(result: RegressionTestResult): void {
    console.log('\n=== Regression Test Summary ===');
    console.log(`Test: ${result.testName}`);
    console.log(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`Timestamp: ${result.timestamp.toISOString()}`);
    
    if (result.baselineResult) {
      console.log('\n--- Performance Comparison ---');
      console.log(`Response Time Change: ${result.comparison.responseTimeChange.toFixed(2)}%`);
      console.log(`Throughput Change: ${result.comparison.throughputChange.toFixed(2)}%`);
      console.log(`Error Rate Change: ${result.comparison.errorRateChange.toFixed(2)} percentage points`);
      console.log(`P95 Response Time Change: ${result.comparison.p95ResponseTimeChange.toFixed(2)}%`);
      console.log(`P99 Response Time Change: ${result.comparison.p99ResponseTimeChange.toFixed(2)}%`);
      
      if (result.comparison.queryPerformanceChanges.size > 0) {
        console.log('\n--- Query Performance Changes ---');
        result.comparison.queryPerformanceChanges.forEach((change, queryType) => {
          console.log(`${queryType}: ${change.responseTimeChange.toFixed(2)}% response time change`);
        });
      }
    } else {
      console.log('\n--- No Baseline Available ---');
      console.log('This result will be used as the new baseline.');
    }
    
    if (result.failedChecks.length > 0) {
      console.log('\n--- Failed Checks ---');
      result.failedChecks.forEach((check, index) => {
        console.log(`${index + 1}. ${check}`);
      });
    }
    
    if (result.recommendations.length > 0) {
      console.log('\n--- Recommendations ---');
      result.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
  }

  // Standard regression test suites
  async runStandardRegressionTests(): Promise<RegressionTestResult[]> {
    const standardConfig: RegressionTestConfig = {
      testSuites: ['core_queries', 'dashboard_performance', 'search_performance'],
      performanceThresholds: {
        maxResponseTimeDegradation: 15, // 15% max degradation
        maxThroughputDegradation: 10, // 10% max degradation
        maxErrorRateIncrease: 2 // 2 percentage points max increase
      },
      comparisonMetrics: ['responseTime', 'throughput', 'errorRate', 'p95', 'p99']
    };
    
    const testSuites = [
      'core_database_operations',
      'dashboard_analytics_performance',
      'search_and_filtering_performance',
      'batch_operations_performance'
    ];
    
    const results: RegressionTestResult[] = [];
    
    for (const testSuite of testSuites) {
      const result = await this.runRegressionTest(testSuite, standardConfig);
      results.push(result);
      
      // Short delay between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return results;
  }

  async createBaseline(testName: string, branch: string = 'main'): Promise<void> {
    console.log(`Creating baseline for test: ${testName} on branch: ${branch}`);
    
    const result = await this.runCurrentPerformanceTest(testName);
    
    await this.supabase
      .from('performance_baselines')
      .insert({
        test_name: testName,
        branch,
        commit_hash: process.env.GIT_COMMIT || 'unknown',
        timestamp: new Date().toISOString(),
        result
      });
    
    console.log(`Baseline created successfully for ${testName}`);
  }
}

export { DatabaseRegressionTester, RegressionTestConfig, RegressionTestResult, PerformanceComparison };