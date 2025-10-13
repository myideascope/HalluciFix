import { createClient } from '@supabase/supabase-js';
import { config } from '../../lib/env';
import { dbMonitor } from '../../lib/databasePerformanceMonitor';

interface LoadTestConfig {
  concurrentUsers: number;
  testDuration: number; // in seconds
  operationsPerUser: number;
  queryTypes: string[];
}

interface LoadTestResult {
  testName: string;
  config: LoadTestConfig;
  startTime: Date;
  endTime: Date;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number; // operations per second
  errorRate: number;
  queryResults: Map<string, QueryPerformanceResult>;
}

interface QueryPerformanceResult {
  queryType: string;
  totalExecutions: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p95Time: number;
  p99Time: number;
  errorCount: number;
}

class DatabaseLoadTester {
  private supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  private testResults: LoadTestResult[] = [];

  async runLoadTest(testName: string, config: LoadTestConfig): Promise<LoadTestResult> {
    console.log(`Starting load test: ${testName}`);
    console.log(`Config: ${JSON.stringify(config, null, 2)}`);

    const startTime = new Date();
    const responseTimes: number[] = [];
    const queryResults = new Map<string, QueryPerformanceResult>();
    let successfulOperations = 0;
    let failedOperations = 0;

    // Initialize query results tracking
    config.queryTypes.forEach(queryType => {
      queryResults.set(queryType, {
        queryType,
        totalExecutions: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        p95Time: 0,
        p99Time: 0,
        errorCount: 0
      });
    });

    // Create concurrent user simulations
    const userPromises = Array(config.concurrentUsers).fill(null).map(async (_, userIndex) => {
      const userResults: number[] = [];
      
      for (let i = 0; i < config.operationsPerUser; i++) {
        const queryType = config.queryTypes[Math.floor(Math.random() * config.queryTypes.length)];
        
        try {
          const operationStart = Date.now();
          await this.executeQuery(queryType, userIndex);
          const operationTime = Date.now() - operationStart;
          
          userResults.push(operationTime);
          responseTimes.push(operationTime);
          successfulOperations++;
          
          // Update query-specific results
          const queryResult = queryResults.get(queryType)!;
          queryResult.totalExecutions++;
          queryResult.minTime = Math.min(queryResult.minTime, operationTime);
          queryResult.maxTime = Math.max(queryResult.maxTime, operationTime);
          
        } catch (error) {
          failedOperations++;
          const queryResult = queryResults.get(queryType)!;
          queryResult.errorCount++;
          console.error(`Query ${queryType} failed for user ${userIndex}:`, error);
        }
        
        // Add small delay to simulate realistic usage
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      }
      
      return userResults;
    });

    // Wait for all users to complete
    await Promise.all(userPromises);
    
    const endTime = new Date();
    const totalOperations = successfulOperations + failedOperations;
    const testDurationMs = endTime.getTime() - startTime.getTime();
    
    // Calculate percentiles
    responseTimes.sort((a, b) => a - b);
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);
    
    // Calculate query-specific statistics
    queryResults.forEach((result, queryType) => {
      if (result.totalExecutions > 0) {
        const queryTimes = responseTimes.slice(0, result.totalExecutions).sort((a, b) => a - b);
        result.averageTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
        result.p95Time = queryTimes[Math.floor(queryTimes.length * 0.95)] || 0;
        result.p99Time = queryTimes[Math.floor(queryTimes.length * 0.99)] || 0;
      }
    });

    const result: LoadTestResult = {
      testName,
      config,
      startTime,
      endTime,
      totalOperations,
      successfulOperations,
      failedOperations,
      averageResponseTime: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      p95ResponseTime: responseTimes[p95Index] || 0,
      p99ResponseTime: responseTimes[p99Index] || 0,
      throughput: (successfulOperations / testDurationMs) * 1000, // ops per second
      errorRate: (failedOperations / totalOperations) * 100,
      queryResults
    };

    this.testResults.push(result);
    await this.saveTestResult(result);
    
    console.log(`Load test completed: ${testName}`);
    this.printTestSummary(result);
    
    return result;
  }

  private async executeQuery(queryType: string, userIndex: number): Promise<any> {
    const userId = `test-user-${userIndex % 100}`; // Simulate 100 different users
    
    switch (queryType) {
      case 'user_analysis_list':
        return await dbMonitor.trackQuery(
          'load_test_user_analysis_list',
          () => this.supabase
            .from('analysis_results')
            .select('id, accuracy, risk_level, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20),
          { userId, endpoint: 'load_test' }
        );

      case 'dashboard_analytics':
        return await dbMonitor.trackQuery(
          'load_test_dashboard_analytics',
          () => this.supabase
            .rpc('get_user_analytics', {
              p_user_id: userId,
              p_start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              p_end_date: new Date().toISOString()
            }),
          { userId, endpoint: 'load_test' }
        );

      case 'search_content':
        return await dbMonitor.trackQuery(
          'load_test_search_content',
          () => this.supabase
            .from('analysis_results')
            .select('id, content, accuracy, risk_level')
            .textSearch('content_search', 'test content')
            .limit(10),
          { userId, endpoint: 'load_test' }
        );

      case 'risk_level_filter':
        return await dbMonitor.trackQuery(
          'load_test_risk_level_filter',
          () => this.supabase
            .from('analysis_results')
            .select('id, accuracy, risk_level, created_at')
            .eq('risk_level', 'high')
            .order('created_at', { ascending: false })
            .limit(50),
          { userId, endpoint: 'load_test' }
        );

      case 'batch_insert':
        const testData = Array(10).fill(null).map((_, i) => ({
          user_id: userId,
          content: `Load test content ${Date.now()}-${i}`,
          content_hash: `hash-${Date.now()}-${i}`,
          accuracy: Math.random() * 100,
          risk_level: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
          processing_time: Math.floor(Math.random() * 1000) + 100,
          analysis_type: 'load_test'
        }));
        
        return await dbMonitor.trackQuery(
          'load_test_batch_insert',
          () => this.supabase
            .from('analysis_results')
            .insert(testData),
          { userId, endpoint: 'load_test' }
        );

      case 'complex_aggregation':
        return await dbMonitor.trackQuery(
          'load_test_complex_aggregation',
          () => this.supabase
            .from('analysis_results')
            .select('risk_level, accuracy')
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
          { userId, endpoint: 'load_test' }
        );

      default:
        throw new Error(`Unknown query type: ${queryType}`);
    }
  }

  private async saveTestResult(result: LoadTestResult): Promise<void> {
    try {
      await this.supabase
        .from('load_test_results')
        .insert({
          test_name: result.testName,
          config: result.config,
          start_time: result.startTime.toISOString(),
          end_time: result.endTime.toISOString(),
          total_operations: result.totalOperations,
          successful_operations: result.successfulOperations,
          failed_operations: result.failedOperations,
          average_response_time: result.averageResponseTime,
          p95_response_time: result.p95ResponseTime,
          p99_response_time: result.p99ResponseTime,
          throughput: result.throughput,
          error_rate: result.errorRate,
          query_results: Object.fromEntries(result.queryResults)
        });
    } catch (error) {
      console.error('Failed to save load test result:', error);
    }
  }

  private printTestSummary(result: LoadTestResult): void {
    console.log('\n=== Load Test Summary ===');
    console.log(`Test: ${result.testName}`);
    console.log(`Duration: ${(result.endTime.getTime() - result.startTime.getTime()) / 1000}s`);
    console.log(`Total Operations: ${result.totalOperations}`);
    console.log(`Successful: ${result.successfulOperations}`);
    console.log(`Failed: ${result.failedOperations}`);
    console.log(`Error Rate: ${result.errorRate.toFixed(2)}%`);
    console.log(`Throughput: ${result.throughput.toFixed(2)} ops/sec`);
    console.log(`Average Response Time: ${result.averageResponseTime.toFixed(2)}ms`);
    console.log(`95th Percentile: ${result.p95ResponseTime.toFixed(2)}ms`);
    console.log(`99th Percentile: ${result.p99ResponseTime.toFixed(2)}ms`);
    
    console.log('\n=== Query Performance ===');
    result.queryResults.forEach((queryResult, queryType) => {
      console.log(`${queryType}:`);
      console.log(`  Executions: ${queryResult.totalExecutions}`);
      console.log(`  Avg Time: ${queryResult.averageTime.toFixed(2)}ms`);
      console.log(`  Min/Max: ${queryResult.minTime}ms / ${queryResult.maxTime}ms`);
      console.log(`  P95/P99: ${queryResult.p95Time}ms / ${queryResult.p99Time}ms`);
      console.log(`  Errors: ${queryResult.errorCount}`);
    });
  }

  // Predefined load test scenarios
  async runStandardLoadTests(): Promise<LoadTestResult[]> {
    const scenarios = [
      {
        name: 'Light Load - 5 Concurrent Users',
        config: {
          concurrentUsers: 5,
          testDuration: 60,
          operationsPerUser: 20,
          queryTypes: ['user_analysis_list', 'dashboard_analytics', 'search_content']
        }
      },
      {
        name: 'Medium Load - 20 Concurrent Users',
        config: {
          concurrentUsers: 20,
          testDuration: 120,
          operationsPerUser: 30,
          queryTypes: ['user_analysis_list', 'dashboard_analytics', 'search_content', 'risk_level_filter']
        }
      },
      {
        name: 'Heavy Load - 50 Concurrent Users',
        config: {
          concurrentUsers: 50,
          testDuration: 180,
          operationsPerUser: 25,
          queryTypes: ['user_analysis_list', 'dashboard_analytics', 'search_content', 'risk_level_filter', 'complex_aggregation']
        }
      },
      {
        name: 'Write-Heavy Load - Batch Operations',
        config: {
          concurrentUsers: 10,
          testDuration: 60,
          operationsPerUser: 15,
          queryTypes: ['batch_insert', 'user_analysis_list']
        }
      }
    ];

    const results: LoadTestResult[] = [];
    
    for (const scenario of scenarios) {
      const result = await this.runLoadTest(scenario.name, scenario.config);
      results.push(result);
      
      // Wait between tests to avoid interference
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    return results;
  }

  getTestResults(): LoadTestResult[] {
    return this.testResults;
  }

  async compareWithBaseline(currentResult: LoadTestResult, baselineResult: LoadTestResult): Promise<{
    performanceChange: number;
    throughputChange: number;
    errorRateChange: number;
    recommendations: string[];
  }> {
    const performanceChange = ((currentResult.averageResponseTime - baselineResult.averageResponseTime) / baselineResult.averageResponseTime) * 100;
    const throughputChange = ((currentResult.throughput - baselineResult.throughput) / baselineResult.throughput) * 100;
    const errorRateChange = currentResult.errorRate - baselineResult.errorRate;
    
    const recommendations: string[] = [];
    
    if (performanceChange > 10) {
      recommendations.push('Performance degraded by more than 10%. Consider reviewing recent changes.');
    }
    
    if (throughputChange < -5) {
      recommendations.push('Throughput decreased by more than 5%. Check for resource constraints.');
    }
    
    if (errorRateChange > 1) {
      recommendations.push('Error rate increased. Investigate failing queries.');
    }
    
    if (currentResult.p95ResponseTime > 1000) {
      recommendations.push('95th percentile response time exceeds 1 second. Optimize slow queries.');
    }
    
    return {
      performanceChange,
      throughputChange,
      errorRateChange,
      recommendations
    };
  }
}

export { DatabaseLoadTester, LoadTestConfig, LoadTestResult, QueryPerformanceResult };