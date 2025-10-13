import { DatabaseLoadTester, LoadTestConfig } from './database-load-testing';
import { dbMonitor } from '../../lib/databasePerformanceMonitor';
import { healthChecker } from '../../lib/databaseHealthChecker';

interface StressTestConfig extends LoadTestConfig {
  rampUpDuration: number; // seconds to gradually increase load
  sustainedDuration: number; // seconds to maintain peak load
  rampDownDuration: number; // seconds to gradually decrease load
  maxConcurrentUsers: number;
  resourceMonitoring: boolean;
}

interface StressTestResult {
  testName: string;
  config: StressTestConfig;
  phases: {
    rampUp: PhaseResult;
    sustained: PhaseResult;
    rampDown: PhaseResult;
  };
  resourceMetrics: ResourceMetrics[];
  breakingPoint?: {
    concurrentUsers: number;
    errorRate: number;
    avgResponseTime: number;
  };
  recommendations: string[];
}

interface PhaseResult {
  phase: 'rampUp' | 'sustained' | 'rampDown';
  startTime: Date;
  endTime: Date;
  avgResponseTime: number;
  throughput: number;
  errorRate: number;
  peakConcurrentUsers: number;
}

interface ResourceMetrics {
  timestamp: Date;
  concurrentUsers: number;
  cpuUsage?: number;
  memoryUsage?: number;
  activeConnections: number;
  queuedConnections: number;
  diskIOPS?: number;
}

class DatabaseStressTester {
  private loadTester = new DatabaseLoadTester();
  private resourceMetrics: ResourceMetrics[] = [];
  private monitoringInterval?: NodeJS.Timeout;

  async runStressTest(testName: string, config: StressTestConfig): Promise<StressTestResult> {
    console.log(`Starting stress test: ${testName}`);
    
    const result: StressTestResult = {
      testName,
      config,
      phases: {
        rampUp: {} as PhaseResult,
        sustained: {} as PhaseResult,
        rampDown: {} as PhaseResult
      },
      resourceMetrics: [],
      recommendations: []
    };

    // Start resource monitoring if enabled
    if (config.resourceMonitoring) {
      this.startResourceMonitoring();
    }

    try {
      // Phase 1: Ramp Up
      result.phases.rampUp = await this.runRampUpPhase(config);
      
      // Phase 2: Sustained Load
      result.phases.sustained = await this.runSustainedPhase(config);
      
      // Phase 3: Ramp Down
      result.phases.rampDown = await this.runRampDownPhase(config);
      
      // Find breaking point if it occurred
      result.breakingPoint = this.findBreakingPoint();
      
      // Generate recommendations
      result.recommendations = this.generateStressTestRecommendations(result);
      
    } finally {
      // Stop resource monitoring
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }
      
      result.resourceMetrics = [...this.resourceMetrics];
      this.resourceMetrics = [];
    }

    await this.saveStressTestResult(result);
    this.printStressTestSummary(result);
    
    return result;
  }

  private async runRampUpPhase(config: StressTestConfig): Promise<PhaseResult> {
    console.log('Starting ramp-up phase...');
    const startTime = new Date();
    
    const stepDuration = config.rampUpDuration / 10; // 10 steps
    const userIncrement = config.maxConcurrentUsers / 10;
    
    let totalOperations = 0;
    let totalResponseTime = 0;
    let totalErrors = 0;
    
    for (let step = 1; step <= 10; step++) {
      const currentUsers = Math.floor(userIncrement * step);
      
      const stepConfig: LoadTestConfig = {
        concurrentUsers: currentUsers,
        testDuration: stepDuration,
        operationsPerUser: Math.floor(config.operationsPerUser / 10),
        queryTypes: config.queryTypes
      };
      
      const stepResult = await this.loadTester.runLoadTest(
        `ramp-up-step-${step}`,
        stepConfig
      );
      
      totalOperations += stepResult.totalOperations;
      totalResponseTime += stepResult.averageResponseTime * stepResult.totalOperations;
      totalErrors += stepResult.failedOperations;
      
      // Record resource metrics
      await this.recordResourceMetrics(currentUsers);
    }
    
    const endTime = new Date();
    
    return {
      phase: 'rampUp',
      startTime,
      endTime,
      avgResponseTime: totalResponseTime / totalOperations,
      throughput: totalOperations / config.rampUpDuration,
      errorRate: (totalErrors / totalOperations) * 100,
      peakConcurrentUsers: config.maxConcurrentUsers
    };
  }

  private async runSustainedPhase(config: StressTestConfig): Promise<PhaseResult> {
    console.log('Starting sustained load phase...');
    const startTime = new Date();
    
    const sustainedConfig: LoadTestConfig = {
      concurrentUsers: config.maxConcurrentUsers,
      testDuration: config.sustainedDuration,
      operationsPerUser: config.operationsPerUser,
      queryTypes: config.queryTypes
    };
    
    const result = await this.loadTester.runLoadTest(
      'sustained-load',
      sustainedConfig
    );
    
    const endTime = new Date();
    
    return {
      phase: 'sustained',
      startTime,
      endTime,
      avgResponseTime: result.averageResponseTime,
      throughput: result.throughput,
      errorRate: result.errorRate,
      peakConcurrentUsers: config.maxConcurrentUsers
    };
  }

  private async runRampDownPhase(config: StressTestConfig): Promise<PhaseResult> {
    console.log('Starting ramp-down phase...');
    const startTime = new Date();
    
    const stepDuration = config.rampDownDuration / 5; // 5 steps
    const userDecrement = config.maxConcurrentUsers / 5;
    
    let totalOperations = 0;
    let totalResponseTime = 0;
    let totalErrors = 0;
    
    for (let step = 4; step >= 0; step--) {
      const currentUsers = Math.floor(userDecrement * step) || 1;
      
      const stepConfig: LoadTestConfig = {
        concurrentUsers: currentUsers,
        testDuration: stepDuration,
        operationsPerUser: Math.floor(config.operationsPerUser / 5),
        queryTypes: config.queryTypes
      };
      
      const stepResult = await this.loadTester.runLoadTest(
        `ramp-down-step-${step}`,
        stepConfig
      );
      
      totalOperations += stepResult.totalOperations;
      totalResponseTime += stepResult.averageResponseTime * stepResult.totalOperations;
      totalErrors += stepResult.failedOperations;
      
      await this.recordResourceMetrics(currentUsers);
    }
    
    const endTime = new Date();
    
    return {
      phase: 'rampDown',
      startTime,
      endTime,
      avgResponseTime: totalResponseTime / totalOperations,
      throughput: totalOperations / config.rampDownDuration,
      errorRate: (totalErrors / totalOperations) * 100,
      peakConcurrentUsers: config.maxConcurrentUsers
    };
  }

  private startResourceMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.recordResourceMetrics(0); // Will be updated with actual user count
    }, 5000); // Every 5 seconds
  }

  private async recordResourceMetrics(concurrentUsers: number): Promise<void> {
    try {
      const healthCheck = await healthChecker.performHealthCheck();
      
      const metrics: ResourceMetrics = {
        timestamp: new Date(),
        concurrentUsers,
        activeConnections: healthCheck.metrics.activeConnections,
        queuedConnections: 0 // Would need to implement this in health checker
      };
      
      this.resourceMetrics.push(metrics);
    } catch (error) {
      console.error('Failed to record resource metrics:', error);
    }
  }

  private findBreakingPoint(): { concurrentUsers: number; errorRate: number; avgResponseTime: number } | undefined {
    // Analyze resource metrics to find when system started degrading significantly
    for (let i = 1; i < this.resourceMetrics.length; i++) {
      const current = this.resourceMetrics[i];
      const previous = this.resourceMetrics[i - 1];
      
      // Check for significant performance degradation indicators
      if (current.activeConnections > 80 || // High connection usage
          (previous.activeConnections > 0 && 
           (current.activeConnections / previous.activeConnections) > 2)) { // Sudden spike
        
        return {
          concurrentUsers: current.concurrentUsers,
          errorRate: 0, // Would need to correlate with actual error data
          avgResponseTime: 0 // Would need to correlate with actual response time data
        };
      }
    }
    
    return undefined;
  }

  private generateStressTestRecommendations(result: StressTestResult): string[] {
    const recommendations: string[] = [];
    
    // Analyze sustained phase performance
    if (result.phases.sustained.errorRate > 5) {
      recommendations.push('High error rate during sustained load. Consider increasing connection pool size or optimizing queries.');
    }
    
    if (result.phases.sustained.avgResponseTime > 1000) {
      recommendations.push('Average response time exceeds 1 second under load. Review query optimization and indexing.');
    }
    
    // Analyze resource usage patterns
    const maxConnections = Math.max(...this.resourceMetrics.map(m => m.activeConnections));
    if (maxConnections > 80) {
      recommendations.push('Connection pool usage exceeded 80%. Consider increasing pool size or implementing connection pooling optimization.');
    }
    
    // Analyze breaking point
    if (result.breakingPoint) {
      recommendations.push(`System breaking point identified at ${result.breakingPoint.concurrentUsers} concurrent users. Plan capacity accordingly.`);
    }
    
    // Performance comparison between phases
    const rampUpToSustained = ((result.phases.sustained.avgResponseTime - result.phases.rampUp.avgResponseTime) / result.phases.rampUp.avgResponseTime) * 100;
    if (rampUpToSustained > 50) {
      recommendations.push('Significant performance degradation from ramp-up to sustained phase. System may not handle sustained load well.');
    }
    
    return recommendations;
  }

  private async saveStressTestResult(result: StressTestResult): Promise<void> {
    try {
      // Save to database for historical analysis
      // Implementation would depend on your database schema
      console.log('Stress test result saved (implementation needed for database storage)');
    } catch (error) {
      console.error('Failed to save stress test result:', error);
    }
  }

  private printStressTestSummary(result: StressTestResult): void {
    console.log('\n=== Stress Test Summary ===');
    console.log(`Test: ${result.testName}`);
    console.log(`Max Concurrent Users: ${result.config.maxConcurrentUsers}`);
    
    console.log('\n--- Phase Results ---');
    Object.entries(result.phases).forEach(([phaseName, phase]) => {
      console.log(`${phaseName.toUpperCase()}:`);
      console.log(`  Duration: ${(phase.endTime.getTime() - phase.startTime.getTime()) / 1000}s`);
      console.log(`  Avg Response Time: ${phase.avgResponseTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${phase.throughput.toFixed(2)} ops/sec`);
      console.log(`  Error Rate: ${phase.errorRate.toFixed(2)}%`);
    });
    
    if (result.breakingPoint) {
      console.log('\n--- Breaking Point ---');
      console.log(`Concurrent Users: ${result.breakingPoint.concurrentUsers}`);
      console.log(`Error Rate: ${result.breakingPoint.errorRate}%`);
      console.log(`Avg Response Time: ${result.breakingPoint.avgResponseTime}ms`);
    }
    
    if (result.recommendations.length > 0) {
      console.log('\n--- Recommendations ---');
      result.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
  }

  // Predefined stress test scenarios
  async runStandardStressTests(): Promise<StressTestResult[]> {
    const scenarios = [
      {
        name: 'Gradual Load Increase',
        config: {
          concurrentUsers: 10,
          testDuration: 300,
          operationsPerUser: 50,
          queryTypes: ['user_analysis_list', 'dashboard_analytics', 'search_content'],
          rampUpDuration: 60,
          sustainedDuration: 180,
          rampDownDuration: 60,
          maxConcurrentUsers: 100,
          resourceMonitoring: true
        }
      },
      {
        name: 'Write-Heavy Stress Test',
        config: {
          concurrentUsers: 5,
          testDuration: 240,
          operationsPerUser: 30,
          queryTypes: ['batch_insert', 'user_analysis_list'],
          rampUpDuration: 30,
          sustainedDuration: 180,
          rampDownDuration: 30,
          maxConcurrentUsers: 25,
          resourceMonitoring: true
        }
      },
      {
        name: 'Search-Heavy Stress Test',
        config: {
          concurrentUsers: 20,
          testDuration: 180,
          operationsPerUser: 25,
          queryTypes: ['search_content', 'complex_aggregation'],
          rampUpDuration: 30,
          sustainedDuration: 120,
          rampDownDuration: 30,
          maxConcurrentUsers: 75,
          resourceMonitoring: true
        }
      }
    ];

    const results: StressTestResult[] = [];
    
    for (const scenario of scenarios) {
      const result = await this.runStressTest(scenario.name, scenario.config);
      results.push(result);
      
      // Wait between tests for system recovery
      console.log('Waiting for system recovery...');
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
    }
    
    return results;
  }
}

export { DatabaseStressTester, StressTestConfig, StressTestResult, ResourceMetrics };