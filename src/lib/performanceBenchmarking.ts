import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { dbMonitor } from './databasePerformanceMonitor';

interface BenchmarkConfig {
  name: string;
  description: string;
  queryTypes: BenchmarkQuery[];
  iterations: number;
  warmupIterations: number;
  cooldownDelay: number; // ms between iterations
}

interface BenchmarkQuery {
  name: string;
  description: string;
  query: () => Promise<any>;
  expectedResultSize?: number;
  timeout?: number;
}

interface BenchmarkResult {
  configName: string;
  timestamp: Date;
  environment: string;
  version: string;
  queryResults: Map<string, QueryBenchmarkResult>;
  overallMetrics: {
    totalQueries: number;
    totalExecutionTime: number;
    averageExecutionTime: number;
    medianExecutionTime: number;
    p95ExecutionTime: number;
    p99ExecutionTime: number;
    successRate: number;
  };
  systemMetrics?: SystemMetrics;
}

interface QueryBenchmarkResult {
  queryName: string;
  iterations: number;
  executionTimes: number[];
  averageTime: number;
  medianTime: number;
  minTime: number;
  maxTime: number;
  p95Time: number;
  p99Time: number;
  standardDeviation: number;
  successCount: number;
  errorCount: number;
  errors: string[];
  throughput: number; // queries per second
}

interface SystemMetrics {
  cpuUsage?: number;
  memoryUsage?: number;
  diskIOPS?: number;
  networkLatency?: number;
  activeConnections: number;
  connectionPoolUsage: number;
}

interface BenchmarkComparison {
  baseline: BenchmarkResult;
  current: BenchmarkResult;
  comparison: {
    overallPerformanceChange: number;
    queryComparisons: Map<string, QueryComparison>;
    significantChanges: string[];
    recommendations: string[];
  };
}

interface QueryComparison {
  queryName: string;
  averageTimeChange: number;
  medianTimeChange: number;
  p95TimeChange: number;
  throughputChange: number;
  reliabilityChange: number;
  isSignificant: boolean;
  trend: 'improved' | 'degraded' | 'stable';
}

class PerformanceBenchmarking {
  private supabase = createClient(config.database.supabaseUrl, config.database.supabaseAnonKey);
  private benchmarkHistory: BenchmarkResult[] = [];

  async runBenchmark(benchmarkConfig: BenchmarkConfig): Promise<BenchmarkResult> {
    console.log(`Starting benchmark: ${benchmarkConfig.name}`);
    
    const result: BenchmarkResult = {
      configName: benchmarkConfig.name,
      timestamp: new Date(),
      environment: config.app.environment,
      version: config.app.version,
      queryResults: new Map(),
      overallMetrics: {
        totalQueries: 0,
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        medianExecutionTime: 0,
        p95ExecutionTime: 0,
        p99ExecutionTime: 0,
        successRate: 0
      }
    };

    // Collect system metrics before benchmark
    result.systemMetrics = await this.collectSystemMetrics();

    const allExecutionTimes: number[] = [];
    let totalSuccessfulQueries = 0;
    let totalQueries = 0;

    // Run warmup iterations
    if (benchmarkConfig.warmupIterations > 0) {
      console.log(`Running ${benchmarkConfig.warmupIterations} warmup iterations...`);
      await this.runWarmupIterations(benchmarkConfig);
    }

    // Run benchmark for each query type
    for (const queryConfig of benchmarkConfig.queryTypes) {
      console.log(`Benchmarking query: ${queryConfig.name}`);
      
      const queryResult = await this.benchmarkQuery(
        queryConfig,
        benchmarkConfig.iterations,
        benchmarkConfig.cooldownDelay
      );
      
      result.queryResults.set(queryConfig.name, queryResult);
      
      // Aggregate metrics
      allExecutionTimes.push(...queryResult.executionTimes);
      totalSuccessfulQueries += queryResult.successCount;
      totalQueries += queryResult.iterations;
    }

    // Calculate overall metrics
    result.overallMetrics = this.calculateOverallMetrics(allExecutionTimes, totalSuccessfulQueries, totalQueries);

    // Save benchmark result
    await this.saveBenchmarkResult(result);
    this.benchmarkHistory.push(result);

    console.log(`Benchmark completed: ${benchmarkConfig.name}`);
    this.printBenchmarkSummary(result);

    return result;
  }

  private async runWarmupIterations(config: BenchmarkConfig): Promise<void> {
    for (const queryConfig of config.queryTypes) {
      for (let i = 0; i < config.warmupIterations; i++) {
        try {
          await queryConfig.query();
          await new Promise(resolve => setTimeout(resolve, config.cooldownDelay));
        } catch (error) {
          // Ignore warmup errors
        }
      }
    }
  }

  private async benchmarkQuery(
    queryConfig: BenchmarkQuery,
    iterations: number,
    cooldownDelay: number
  ): Promise<QueryBenchmarkResult> {
    const executionTimes: number[] = [];
    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      try {
        const result = await dbMonitor.trackQuery(
          `benchmark_${queryConfig.name}`,
          queryConfig.query,
          { endpoint: 'benchmark' }
        );
        
        const executionTime = Date.now() - startTime;
        executionTimes.push(executionTime);
        successCount++;
        
        // Validate result size if expected
        if (queryConfig.expectedResultSize !== undefined) {
          const resultSize = Array.isArray(result) ? result.length : 1;
          if (resultSize !== queryConfig.expectedResultSize) {
            console.warn(`Query ${queryConfig.name} returned ${resultSize} results, expected ${queryConfig.expectedResultSize}`);
          }
        }
        
      } catch (error) {
        const executionTime = Date.now() - startTime;
        executionTimes.push(executionTime);
        errors.push(error instanceof Error ? error.message : String(error));
      }
      
      // Cooldown between iterations
      if (i < iterations - 1 && cooldownDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, cooldownDelay));
      }
    }

    // Calculate statistics
    const sortedTimes = [...executionTimes].sort((a, b) => a - b);
    const averageTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
    const medianTime = this.calculateMedian(sortedTimes);
    const p95Time = this.calculatePercentile(sortedTimes, 95);
    const p99Time = this.calculatePercentile(sortedTimes, 99);
    const standardDeviation = this.calculateStandardDeviation(executionTimes, averageTime);
    const throughput = (successCount / (executionTimes.reduce((sum, time) => sum + time, 0) / 1000));

    return {
      queryName: queryConfig.name,
      iterations,
      executionTimes,
      averageTime,
      medianTime,
      minTime: Math.min(...executionTimes),
      maxTime: Math.max(...executionTimes),
      p95Time,
      p99Time,
      standardDeviation,
      successCount,
      errorCount: errors.length,
      errors: [...new Set(errors)], // Unique errors only
      throughput
    };
  }

  private calculateOverallMetrics(
    allExecutionTimes: number[],
    totalSuccessfulQueries: number,
    totalQueries: number
  ): BenchmarkResult['overallMetrics'] {
    const sortedTimes = [...allExecutionTimes].sort((a, b) => a - b);
    
    return {
      totalQueries,
      totalExecutionTime: allExecutionTimes.reduce((sum, time) => sum + time, 0),
      averageExecutionTime: allExecutionTimes.reduce((sum, time) => sum + time, 0) / allExecutionTimes.length,
      medianExecutionTime: this.calculateMedian(sortedTimes),
      p95ExecutionTime: this.calculatePercentile(sortedTimes, 95),
      p99ExecutionTime: this.calculatePercentile(sortedTimes, 99),
      successRate: (totalSuccessfulQueries / totalQueries) * 100
    };
  }

  private calculateMedian(sortedArray: number[]): number {
    const mid = Math.floor(sortedArray.length / 2);
    return sortedArray.length % 2 === 0
      ? (sortedArray[mid - 1] + sortedArray[mid]) / 2
      : sortedArray[mid];
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  private calculateStandardDeviation(values: number[], mean: number): number {
    const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
    const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / values.length;
    return Math.sqrt(variance);
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    try {
      // Collect database connection metrics
      const { data: connectionStats } = await this.supabase.rpc('get_connection_stats');
      
      return {
        activeConnections: connectionStats?.[0]?.active_connections || 0,
        connectionPoolUsage: connectionStats?.[0]?.pool_usage_percent || 0
      };
    } catch (error) {
      console.warn('Failed to collect system metrics:', error);
      return {
        activeConnections: 0,
        connectionPoolUsage: 0
      };
    }
  }

  async compareBenchmarks(
    baselineResult: BenchmarkResult,
    currentResult: BenchmarkResult
  ): Promise<BenchmarkComparison> {
    const queryComparisons = new Map<string, QueryComparison>();
    const significantChanges: string[] = [];
    
    // Compare each query
    currentResult.queryResults.forEach((currentQuery, queryName) => {
      const baselineQuery = baselineResult.queryResults.get(queryName);
      
      if (baselineQuery) {
        const comparison = this.compareQueryResults(baselineQuery, currentQuery);
        queryComparisons.set(queryName, comparison);
        
        if (comparison.isSignificant) {
          significantChanges.push(`${queryName}: ${comparison.trend} (${comparison.averageTimeChange.toFixed(1)}% change)`);
        }
      }
    });
    
    // Calculate overall performance change
    const overallPerformanceChange = ((currentResult.overallMetrics.averageExecutionTime - baselineResult.overallMetrics.averageExecutionTime) / baselineResult.overallMetrics.averageExecutionTime) * 100;
    
    // Generate recommendations
    const recommendations = this.generateComparisonRecommendations(queryComparisons, overallPerformanceChange);
    
    return {
      baseline: baselineResult,
      current: currentResult,
      comparison: {
        overallPerformanceChange,
        queryComparisons,
        significantChanges,
        recommendations
      }
    };
  }

  private compareQueryResults(
    baseline: QueryBenchmarkResult,
    current: QueryBenchmarkResult
  ): QueryComparison {
    const averageTimeChange = ((current.averageTime - baseline.averageTime) / baseline.averageTime) * 100;
    const medianTimeChange = ((current.medianTime - baseline.medianTime) / baseline.medianTime) * 100;
    const p95TimeChange = ((current.p95Time - baseline.p95Time) / baseline.p95Time) * 100;
    const throughputChange = ((current.throughput - baseline.throughput) / baseline.throughput) * 100;
    const reliabilityChange = ((current.successCount / current.iterations) - (baseline.successCount / baseline.iterations)) * 100;
    
    // Determine if change is significant (>10% change or >2 standard deviations)
    const isSignificant = Math.abs(averageTimeChange) > 10 || 
                         Math.abs(current.averageTime - baseline.averageTime) > (2 * baseline.standardDeviation);
    
    // Determine trend
    let trend: 'improved' | 'degraded' | 'stable';
    if (isSignificant) {
      trend = averageTimeChange < 0 ? 'improved' : 'degraded';
    } else {
      trend = 'stable';
    }
    
    return {
      queryName: current.queryName,
      averageTimeChange,
      medianTimeChange,
      p95TimeChange,
      throughputChange,
      reliabilityChange,
      isSignificant,
      trend
    };
  }

  private generateComparisonRecommendations(
    queryComparisons: Map<string, QueryComparison>,
    overallPerformanceChange: number
  ): string[] {
    const recommendations: string[] = [];
    
    // Overall performance recommendations
    if (overallPerformanceChange > 15) {
      recommendations.push('Overall performance has degraded significantly. Review recent changes and optimizations.');
    } else if (overallPerformanceChange < -15) {
      recommendations.push('Overall performance has improved significantly. Document the changes for future reference.');
    }
    
    // Query-specific recommendations
    const degradedQueries = Array.from(queryComparisons.values()).filter(q => q.trend === 'degraded');
    const improvedQueries = Array.from(queryComparisons.values()).filter(q => q.trend === 'improved');
    
    if (degradedQueries.length > 0) {
      recommendations.push(`${degradedQueries.length} queries have degraded performance. Focus on: ${degradedQueries.slice(0, 3).map(q => q.queryName).join(', ')}`);
    }
    
    if (improvedQueries.length > 0) {
      recommendations.push(`${improvedQueries.length} queries have improved performance. Consider applying similar optimizations to other queries.`);
    }
    
    // Reliability recommendations
    const unreliableQueries = Array.from(queryComparisons.values()).filter(q => q.reliabilityChange < -5);
    if (unreliableQueries.length > 0) {
      recommendations.push(`Query reliability has decreased for: ${unreliableQueries.map(q => q.queryName).join(', ')}`);
    }
    
    return recommendations;
  }

  private async saveBenchmarkResult(result: BenchmarkResult): Promise<void> {
    try {
      await this.supabase
        .from('performance_benchmarks')
        .insert({
          config_name: result.configName,
          timestamp: result.timestamp.toISOString(),
          environment: result.environment,
          version: result.version,
          query_results: Object.fromEntries(result.queryResults),
          overall_metrics: result.overallMetrics,
          system_metrics: result.systemMetrics
        });
    } catch (error) {
      console.error('Failed to save benchmark result:', error);
    }
  }

  private printBenchmarkSummary(result: BenchmarkResult): void {
    console.log('\n=== Benchmark Summary ===');
    console.log(`Config: ${result.configName}`);
    console.log(`Environment: ${result.environment}`);
    console.log(`Version: ${result.version}`);
    console.log(`Timestamp: ${result.timestamp.toISOString()}`);
    
    console.log('\n--- Overall Metrics ---');
    console.log(`Total Queries: ${result.overallMetrics.totalQueries}`);
    console.log(`Success Rate: ${result.overallMetrics.successRate.toFixed(2)}%`);
    console.log(`Average Execution Time: ${result.overallMetrics.averageExecutionTime.toFixed(2)}ms`);
    console.log(`Median Execution Time: ${result.overallMetrics.medianExecutionTime.toFixed(2)}ms`);
    console.log(`95th Percentile: ${result.overallMetrics.p95ExecutionTime.toFixed(2)}ms`);
    console.log(`99th Percentile: ${result.overallMetrics.p99ExecutionTime.toFixed(2)}ms`);
    
    console.log('\n--- Query Results ---');
    result.queryResults.forEach((queryResult, queryName) => {
      console.log(`${queryName}:`);
      console.log(`  Average: ${queryResult.averageTime.toFixed(2)}ms`);
      console.log(`  Median: ${queryResult.medianTime.toFixed(2)}ms`);
      console.log(`  Min/Max: ${queryResult.minTime}ms / ${queryResult.maxTime}ms`);
      console.log(`  P95/P99: ${queryResult.p95Time.toFixed(2)}ms / ${queryResult.p99Time.toFixed(2)}ms`);
      console.log(`  Throughput: ${queryResult.throughput.toFixed(2)} queries/sec`);
      console.log(`  Success Rate: ${((queryResult.successCount / queryResult.iterations) * 100).toFixed(2)}%`);
      if (queryResult.errorCount > 0) {
        console.log(`  Errors: ${queryResult.errorCount} (${queryResult.errors.slice(0, 2).join(', ')})`);
      }
    });
    
    if (result.systemMetrics) {
      console.log('\n--- System Metrics ---');
      console.log(`Active Connections: ${result.systemMetrics.activeConnections}`);
      console.log(`Connection Pool Usage: ${result.systemMetrics.connectionPoolUsage.toFixed(2)}%`);
    }
  }

  // Predefined benchmark configurations
  getStandardBenchmarks(): BenchmarkConfig[] {
    return [
      {
        name: 'Core Query Performance',
        description: 'Benchmark core database queries',
        iterations: 100,
        warmupIterations: 10,
        cooldownDelay: 50,
        queryTypes: [
          {
            name: 'user_analysis_list',
            description: 'List user analysis results',
            query: () => this.supabase
              .from('analysis_results')
              .select('id, accuracy, risk_level, created_at')
              .eq('user_id', 'benchmark-user')
              .order('created_at', { ascending: false })
              .limit(20),
            expectedResultSize: 20
          },
          {
            name: 'dashboard_analytics',
            description: 'Dashboard analytics query',
            query: () => this.supabase
              .rpc('get_user_analytics', {
                p_user_id: 'benchmark-user',
                p_start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                p_end_date: new Date().toISOString()
              })
          },
          {
            name: 'search_content',
            description: 'Full-text search query',
            query: () => this.supabase
              .from('analysis_results')
              .select('id, content, accuracy')
              .textSearch('content_search', 'test content')
              .limit(10)
          }
        ]
      },
      {
        name: 'Write Operation Performance',
        description: 'Benchmark write operations',
        iterations: 50,
        warmupIterations: 5,
        cooldownDelay: 100,
        queryTypes: [
          {
            name: 'single_insert',
            description: 'Single record insert',
            query: () => this.supabase
              .from('analysis_results')
              .insert({
                user_id: 'benchmark-user',
                content: `Benchmark content ${Date.now()}`,
                content_hash: `hash-${Date.now()}`,
                accuracy: Math.random() * 100,
                risk_level: 'low',
                processing_time: 100,
                analysis_type: 'benchmark'
              })
          },
          {
            name: 'batch_insert',
            description: 'Batch record insert',
            query: () => {
              const records = Array(10).fill(null).map((_, i) => ({
                user_id: 'benchmark-user',
                content: `Batch benchmark content ${Date.now()}-${i}`,
                content_hash: `batch-hash-${Date.now()}-${i}`,
                accuracy: Math.random() * 100,
                risk_level: 'low',
                processing_time: 100,
                analysis_type: 'benchmark'
              }));
              
              return this.supabase
                .from('analysis_results')
                .insert(records);
            }
          }
        ]
      }
    ];
  }

  async runStandardBenchmarks(): Promise<BenchmarkResult[]> {
    const benchmarks = this.getStandardBenchmarks();
    const results: BenchmarkResult[] = [];
    
    for (const benchmark of benchmarks) {
      const result = await this.runBenchmark(benchmark);
      results.push(result);
      
      // Wait between benchmarks
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    return results;
  }

  getBenchmarkHistory(): BenchmarkResult[] {
    return [...this.benchmarkHistory];
  }

  async getHistoricalBenchmarks(configName: string, limit: number = 10): Promise<BenchmarkResult[]> {
    try {
      const { data, error } = await this.supabase
        .from('performance_benchmarks')
        .select('*')
        .eq('config_name', configName)
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (error) {
        throw error;
      }
      
      return data || [];
    } catch (error) {
      console.error('Failed to get historical benchmarks:', error);
      return [];
    }
  }
}

export { PerformanceBenchmarking, BenchmarkConfig, BenchmarkResult, BenchmarkComparison, QueryBenchmarkResult };