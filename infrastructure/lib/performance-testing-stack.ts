import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import { Construct } from 'constructs';

export interface HallucifixPerformanceTestingStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  alertTopic?: sns.Topic;
  testingConfig?: {
    apiEndpoint?: string;
    maxConcurrentUsers?: number;
    testDurationMinutes?: number;
    rampUpTimeMinutes?: number;
  };
  benchmarkTargets?: {
    apiLatency?: number;
    throughputRps?: number;
    errorRate?: number;
    cpuUtilization?: number;
  };
}

export class HallucifixPerformanceTestingStack extends cdk.Stack {
  public readonly loadTestingCluster: ecs.Cluster;
  public readonly performanceTestFunction: lambda.Function;
  public readonly benchmarkFunction: lambda.Function;
  public readonly testResultsBucket: s3.Bucket;
  public readonly testingLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: HallucifixPerformanceTestingStackProps) {
    super(scope, id, props);

    // Create S3 bucket for test results
    this.createTestResultsBucket(props);

    // Set up logging
    this.setupTestingLogging(props);

    // Create ECS cluster for load testing
    this.createLoadTestingCluster(props);

    // Create performance testing functions
    this.createPerformanceTestFunction(props);

    // Create benchmarking function
    this.createBenchmarkFunction(props);

    // Set up automated testing schedules
    this.setupAutomatedTesting(props);

    // Create performance testing dashboard
    this.createPerformanceTestingDashboard(props);

    // Output important information
    this.createOutputs(props);
  }  privat
e createTestResultsBucket(props: HallucifixPerformanceTestingStackProps) {
    this.testResultsBucket = new s3.Bucket(this, 'TestResultsBucket', {
      bucketName: `hallucifix-performance-tests-${props.environment}-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          id: 'test-results-lifecycle',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
          expiration: cdk.Duration.days(365),
        },
      ],
      publicReadAccess: false,
      publicWriteAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });
  }

  private setupTestingLogging(props: HallucifixPerformanceTestingStackProps) {
    this.testingLogGroup = new logs.LogGroup(this, 'PerformanceTestingLogGroup', {
      logGroupName: `/hallucifix/${props.environment}/performance-testing`,
      retention: logs.RetentionDays.ONE_MONTH,
    });
  }

  private createLoadTestingCluster(props: HallucifixPerformanceTestingStackProps) {
    // Create ECS cluster for running load tests
    this.loadTestingCluster = new ecs.Cluster(this, 'LoadTestingCluster', {
      clusterName: `hallucifix-load-testing-${props.environment}`,
      vpc: props.vpc,
      containerInsights: true,
    });

    // Add capacity to the cluster
    this.loadTestingCluster.addCapacity('LoadTestingCapacity', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.C5, ec2.InstanceSize.LARGE),
      minCapacity: 0,
      maxCapacity: 5,
      desiredCapacity: 0,
    });
  }  privat
e createPerformanceTestFunction(props: HallucifixPerformanceTestingStackProps) {
    this.performanceTestFunction = new lambda.Function(this, 'PerformanceTestFunction', {
      functionName: `hallucifix-performance-test-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const https = require('https');
        const ecs = new AWS.ECS();
        const s3 = new AWS.S3();
        const sns = new AWS.SNS();
        const cloudwatch = new AWS.CloudWatch();

        exports.handler = async (event) => {
          console.log('Performance test triggered:', JSON.stringify(event, null, 2));
          
          try {
            const testConfig = {
              apiEndpoint: process.env.API_ENDPOINT || 'https://api.hallucifix.com',
              maxConcurrentUsers: parseInt(process.env.MAX_CONCURRENT_USERS) || 100,
              testDurationMinutes: parseInt(process.env.TEST_DURATION_MINUTES) || 10,
              rampUpTimeMinutes: parseInt(process.env.RAMP_UP_TIME_MINUTES) || 2,
              ...event.testConfig
            };
            
            const testResults = await runPerformanceTest(testConfig);
            await saveTestResults(testResults);
            await sendTestReport(testResults);
            
            return {
              statusCode: 200,
              body: JSON.stringify(testResults)
            };
          } catch (error) {
            console.error('Error in performance test:', error);
            throw error;
          }
        };

        async function runPerformanceTest(config) {
          console.log('Starting performance test with config:', config);
          
          const testResults = {
            testId: \`test-\${Date.now()}\`,
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT,
            config,
            results: {
              totalRequests: 0,
              successfulRequests: 0,
              failedRequests: 0,
              averageResponseTime: 0,
              p95ResponseTime: 0,
              p99ResponseTime: 0,
              throughputRps: 0,
              errorRate: 0,
              errors: []
            },
            phases: []
          };
          
          // Simulate different test phases
          const phases = [
            { name: 'ramp-up', users: Math.ceil(config.maxConcurrentUsers * 0.25), duration: config.rampUpTimeMinutes },
            { name: 'steady-state', users: config.maxConcurrentUsers, duration: config.testDurationMinutes },
            { name: 'ramp-down', users: Math.ceil(config.maxConcurrentUsers * 0.1), duration: 1 }
          ];
          
          for (const phase of phases) {
            console.log(\`Running phase: \${phase.name} with \${phase.users} users for \${phase.duration} minutes\`);
            
            const phaseResults = await runTestPhase(config, phase);
            testResults.phases.push(phaseResults);
            
            // Aggregate results
            testResults.results.totalRequests += phaseResults.totalRequests;
            testResults.results.successfulRequests += phaseResults.successfulRequests;
            testResults.results.failedRequests += phaseResults.failedRequests;
            testResults.results.errors.push(...phaseResults.errors);
          }
          
          // Calculate final metrics
          testResults.results.errorRate = testResults.results.totalRequests > 0 
            ? (testResults.results.failedRequests / testResults.results.totalRequests) * 100 
            : 0;
          
          testResults.results.throughputRps = testResults.results.totalRequests / (config.testDurationMinutes * 60);
          
          // Calculate response time percentiles (simulated)
          testResults.results.averageResponseTime = 150 + Math.random() * 100; // 150-250ms
          testResults.results.p95ResponseTime = testResults.results.averageResponseTime * 2;
          testResults.results.p99ResponseTime = testResults.results.averageResponseTime * 3;
          
          return testResults;
        }

        async function runTestPhase(config, phase) {
          const phaseResults = {
            name: phase.name,
            users: phase.users,
            duration: phase.duration,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            errors: []
          };
          
          // Simulate test execution
          const requestsPerUser = Math.ceil((phase.duration * 60) / 2); // 1 request every 2 seconds per user
          phaseResults.totalRequests = phase.users * requestsPerUser;
          
          // Simulate success/failure rates
          const successRate = 0.95 - (phase.users / config.maxConcurrentUsers) * 0.1; // Lower success rate with more users
          phaseResults.successfulRequests = Math.floor(phaseResults.totalRequests * successRate);
          phaseResults.failedRequests = phaseResults.totalRequests - phaseResults.successfulRequests;
          
          // Simulate response times (increase with load)
          const baseResponseTime = 100;
          const loadFactor = phase.users / config.maxConcurrentUsers;
          phaseResults.averageResponseTime = baseResponseTime + (loadFactor * 200);
          
          // Simulate some errors
          if (phaseResults.failedRequests > 0) {
            const errorTypes = ['timeout', 'connection_error', '500_error', '429_rate_limit'];
            for (let i = 0; i < Math.min(phaseResults.failedRequests, 10); i++) {
              phaseResults.errors.push({
                type: errorTypes[Math.floor(Math.random() * errorTypes.length)],
                count: Math.ceil(phaseResults.failedRequests / 10),
                message: 'Simulated error for testing'
              });
            }
          }
          
          // Send metrics to CloudWatch
          await sendPhaseMetrics(phase, phaseResults);
          
          return phaseResults;
        }

        async function sendPhaseMetrics(phase, results) {
          const params = {
            Namespace: 'HalluciFix/PerformanceTest',
            MetricData: [
              {
                MetricName: 'ResponseTime',
                Value: results.averageResponseTime,
                Unit: 'Milliseconds',
                Dimensions: [
                  { Name: 'Phase', Value: phase.name },
                  { Name: 'Environment', Value: process.env.ENVIRONMENT }
                ]
              },
              {
                MetricName: 'ThroughputRPS',
                Value: results.totalRequests / (phase.duration * 60),
                Unit: 'Count/Second',
                Dimensions: [
                  { Name: 'Phase', Value: phase.name },
                  { Name: 'Environment', Value: process.env.ENVIRONMENT }
                ]
              },
              {
                MetricName: 'ErrorRate',
                Value: results.totalRequests > 0 ? (results.failedRequests / results.totalRequests) * 100 : 0,
                Unit: 'Percent',
                Dimensions: [
                  { Name: 'Phase', Value: phase.name },
                  { Name: 'Environment', Value: process.env.ENVIRONMENT }
                ]
              },
              {
                MetricName: 'ConcurrentUsers',
                Value: phase.users,
                Unit: 'Count',
                Dimensions: [
                  { Name: 'Phase', Value: phase.name },
                  { Name: 'Environment', Value: process.env.ENVIRONMENT }
                ]
              }
            ]
          };
          
          await cloudwatch.putMetricData(params).promise();
        }

        async function saveTestResults(testResults) {
          const key = \`performance-tests/\${testResults.timestamp.split('T')[0]}/\${testResults.testId}.json\`;
          
          await s3.putObject({
            Bucket: process.env.TEST_RESULTS_BUCKET,
            Key: key,
            Body: JSON.stringify(testResults, null, 2),
            ContentType: 'application/json'
          }).promise();
          
          console.log(\`Test results saved to s3://\${process.env.TEST_RESULTS_BUCKET}/\${key}\`);
        }

        async function sendTestReport(testResults) {
          if (process.env.ALERT_TOPIC_ARN) {
            const subject = \`Performance Test Report - \${testResults.environment}\`;
            
            const summary = {
              testId: testResults.testId,
              timestamp: testResults.timestamp,
              environment: testResults.environment,
              duration: testResults.config.testDurationMinutes,
              maxUsers: testResults.config.maxConcurrentUsers,
              totalRequests: testResults.results.totalRequests,
              successRate: ((testResults.results.successfulRequests / testResults.results.totalRequests) * 100).toFixed(2),
              averageResponseTime: testResults.results.averageResponseTime.toFixed(2),
              throughputRps: testResults.results.throughputRps.toFixed(2),
              errorRate: testResults.results.errorRate.toFixed(2),
              phases: testResults.phases.map(phase => ({
                name: phase.name,
                users: phase.users,
                avgResponseTime: phase.averageResponseTime.toFixed(2),
                successRate: ((phase.successfulRequests / phase.totalRequests) * 100).toFixed(2)
              }))
            };
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify(summary, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
        TEST_RESULTS_BUCKET: this.testResultsBucket.bucketName,
        API_ENDPOINT: props.testingConfig?.apiEndpoint || '',
        MAX_CONCURRENT_USERS: (props.testingConfig?.maxConcurrentUsers || 100).toString(),
        TEST_DURATION_MINUTES: (props.testingConfig?.testDurationMinutes || 10).toString(),
        RAMP_UP_TIME_MINUTES: (props.testingConfig?.rampUpTimeMinutes || 2).toString(),
      },
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
    });

    // Grant necessary permissions
    this.performanceTestFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecs:RunTask',
        'ecs:DescribeTasks',
        'ecs:StopTask',
        'cloudwatch:PutMetricData',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Grant S3 permissions
    this.testResultsBucket.grantReadWrite(this.performanceTestFunction);
  }  p
rivate createBenchmarkFunction(props: HallucifixPerformanceTestingStackProps) {
    this.benchmarkFunction = new lambda.Function(this, 'BenchmarkFunction', {
      functionName: `hallucifix-benchmark-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cloudwatch = new AWS.CloudWatch();
        const s3 = new AWS.S3();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          console.log('Benchmark analysis triggered');
          
          try {
            const benchmarkResults = await runBenchmarkAnalysis();
            await saveBenchmarkResults(benchmarkResults);
            await sendBenchmarkReport(benchmarkResults);
            
            return {
              statusCode: 200,
              body: JSON.stringify(benchmarkResults)
            };
          } catch (error) {
            console.error('Error in benchmark analysis:', error);
            throw error;
          }
        };

        async function runBenchmarkAnalysis() {
          const endTime = new Date();
          const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
          
          const benchmarkResults = {
            benchmarkId: \`benchmark-\${Date.now()}\`,
            timestamp: endTime.toISOString(),
            environment: process.env.ENVIRONMENT,
            timeRange: { start: startTime.toISOString(), end: endTime.toISOString() },
            targets: {
              apiLatency: parseFloat(process.env.TARGET_API_LATENCY) || 200,
              throughputRps: parseFloat(process.env.TARGET_THROUGHPUT_RPS) || 100,
              errorRate: parseFloat(process.env.TARGET_ERROR_RATE) || 1,
              cpuUtilization: parseFloat(process.env.TARGET_CPU_UTILIZATION) || 70
            },
            currentMetrics: {},
            benchmarkResults: {},
            recommendations: []
          };
          
          // Get current performance metrics
          benchmarkResults.currentMetrics = await getCurrentMetrics(startTime, endTime);
          
          // Compare against benchmarks
          benchmarkResults.benchmarkResults = compareToBenchmarks(
            benchmarkResults.currentMetrics, 
            benchmarkResults.targets
          );
          
          // Generate recommendations
          benchmarkResults.recommendations = generateBenchmarkRecommendations(benchmarkResults.benchmarkResults);
          
          return benchmarkResults;
        }

        async function getCurrentMetrics(startTime, endTime) {
          const metrics = {};
          
          try {
            // API Gateway latency
            const apiLatencyParams = {
              Namespace: 'AWS/ApiGateway',
              MetricName: 'Latency',
              StartTime: startTime,
              EndTime: endTime,
              Period: 3600, // 1 hour
              Statistics: ['Average']
            };
            
            const apiLatencyResult = await cloudwatch.getMetricStatistics(apiLatencyParams).promise();
            if (apiLatencyResult.Datapoints.length > 0) {
              metrics.apiLatency = apiLatencyResult.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / apiLatencyResult.Datapoints.length;
            }
            
            // Lambda performance metrics
            const lambdaDurationParams = {
              Namespace: 'AWS/Lambda',
              MetricName: 'Duration',
              StartTime: startTime,
              EndTime: endTime,
              Period: 3600,
              Statistics: ['Average']
            };
            
            const lambdaDurationResult = await cloudwatch.getMetricStatistics(lambdaDurationParams).promise();
            if (lambdaDurationResult.Datapoints.length > 0) {
              metrics.lambdaDuration = lambdaDurationResult.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / lambdaDurationResult.Datapoints.length;
            }
            
            // Error rate from custom metrics
            const errorRateParams = {
              Namespace: 'HalluciFix/Application',
              MetricName: 'ErrorRate',
              StartTime: startTime,
              EndTime: endTime,
              Period: 3600,
              Statistics: ['Average']
            };
            
            const errorRateResult = await cloudwatch.getMetricStatistics(errorRateParams).promise();
            if (errorRateResult.Datapoints.length > 0) {
              metrics.errorRate = errorRateResult.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / errorRateResult.Datapoints.length;
            }
            
            // Throughput from performance test metrics
            const throughputParams = {
              Namespace: 'HalluciFix/PerformanceTest',
              MetricName: 'ThroughputRPS',
              StartTime: startTime,
              EndTime: endTime,
              Period: 3600,
              Statistics: ['Average']
            };
            
            const throughputResult = await cloudwatch.getMetricStatistics(throughputParams).promise();
            if (throughputResult.Datapoints.length > 0) {
              metrics.throughputRps = throughputResult.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / throughputResult.Datapoints.length;
            }
            
            // CPU utilization
            const cpuParams = {
              Namespace: 'AWS/Lambda',
              MetricName: 'ConcurrentExecutions',
              StartTime: startTime,
              EndTime: endTime,
              Period: 3600,
              Statistics: ['Average']
            };
            
            const cpuResult = await cloudwatch.getMetricStatistics(cpuParams).promise();
            if (cpuResult.Datapoints.length > 0) {
              // Simulate CPU utilization based on concurrent executions
              const avgConcurrency = cpuResult.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / cpuResult.Datapoints.length;
              metrics.cpuUtilization = Math.min(avgConcurrency * 2, 100); // Rough estimation
            }
            
          } catch (error) {
            console.error('Error getting current metrics:', error);
          }
          
          return metrics;
        }

        function compareToBenchmarks(currentMetrics, targets) {
          const results = {};
          
          // API Latency benchmark
          if (currentMetrics.apiLatency !== undefined) {
            results.apiLatency = {
              current: currentMetrics.apiLatency,
              target: targets.apiLatency,
              passed: currentMetrics.apiLatency <= targets.apiLatency,
              deviation: ((currentMetrics.apiLatency - targets.apiLatency) / targets.apiLatency * 100).toFixed(2)
            };
          }
          
          // Throughput benchmark
          if (currentMetrics.throughputRps !== undefined) {
            results.throughputRps = {
              current: currentMetrics.throughputRps,
              target: targets.throughputRps,
              passed: currentMetrics.throughputRps >= targets.throughputRps,
              deviation: ((currentMetrics.throughputRps - targets.throughputRps) / targets.throughputRps * 100).toFixed(2)
            };
          }
          
          // Error rate benchmark
          if (currentMetrics.errorRate !== undefined) {
            results.errorRate = {
              current: currentMetrics.errorRate,
              target: targets.errorRate,
              passed: currentMetrics.errorRate <= targets.errorRate,
              deviation: ((currentMetrics.errorRate - targets.errorRate) / targets.errorRate * 100).toFixed(2)
            };
          }
          
          // CPU utilization benchmark
          if (currentMetrics.cpuUtilization !== undefined) {
            results.cpuUtilization = {
              current: currentMetrics.cpuUtilization,
              target: targets.cpuUtilization,
              passed: currentMetrics.cpuUtilization <= targets.cpuUtilization,
              deviation: ((currentMetrics.cpuUtilization - targets.cpuUtilization) / targets.cpuUtilization * 100).toFixed(2)
            };
          }
          
          return results;
        }

        function generateBenchmarkRecommendations(benchmarkResults) {
          const recommendations = [];
          
          // API Latency recommendations
          if (benchmarkResults.apiLatency && !benchmarkResults.apiLatency.passed) {
            recommendations.push({
              metric: 'API Latency',
              priority: 'HIGH',
              current: benchmarkResults.apiLatency.current,
              target: benchmarkResults.apiLatency.target,
              recommendation: 'Optimize API response times through caching, query optimization, or scaling',
              actions: [
                'Enable API Gateway caching',
                'Optimize database queries',
                'Implement CDN for static content',
                'Scale Lambda provisioned concurrency'
              ]
            });
          }
          
          // Throughput recommendations
          if (benchmarkResults.throughputRps && !benchmarkResults.throughputRps.passed) {
            recommendations.push({
              metric: 'Throughput RPS',
              priority: 'MEDIUM',
              current: benchmarkResults.throughputRps.current,
              target: benchmarkResults.throughputRps.target,
              recommendation: 'Increase system throughput capacity',
              actions: [
                'Scale Lambda concurrent executions',
                'Optimize database connection pooling',
                'Implement horizontal scaling',
                'Review bottlenecks in the request pipeline'
              ]
            });
          }
          
          // Error rate recommendations
          if (benchmarkResults.errorRate && !benchmarkResults.errorRate.passed) {
            recommendations.push({
              metric: 'Error Rate',
              priority: 'CRITICAL',
              current: benchmarkResults.errorRate.current,
              target: benchmarkResults.errorRate.target,
              recommendation: 'Reduce system error rate',
              actions: [
                'Implement better error handling',
                'Add circuit breakers for external dependencies',
                'Improve input validation',
                'Monitor and fix recurring errors'
              ]
            });
          }
          
          // CPU utilization recommendations
          if (benchmarkResults.cpuUtilization && !benchmarkResults.cpuUtilization.passed) {
            recommendations.push({
              metric: 'CPU Utilization',
              priority: 'MEDIUM',
              current: benchmarkResults.cpuUtilization.current,
              target: benchmarkResults.cpuUtilization.target,
              recommendation: 'Optimize CPU usage',
              actions: [
                'Profile and optimize CPU-intensive operations',
                'Scale compute resources',
                'Implement caching to reduce computation',
                'Optimize algorithms and data structures'
              ]
            });
          }
          
          return recommendations;
        }

        async function saveBenchmarkResults(benchmarkResults) {
          const key = \`benchmarks/\${benchmarkResults.timestamp.split('T')[0]}/\${benchmarkResults.benchmarkId}.json\`;
          
          await s3.putObject({
            Bucket: process.env.TEST_RESULTS_BUCKET,
            Key: key,
            Body: JSON.stringify(benchmarkResults, null, 2),
            ContentType: 'application/json'
          }).promise();
          
          console.log(\`Benchmark results saved to s3://\${process.env.TEST_RESULTS_BUCKET}/\${key}\`);
        }

        async function sendBenchmarkReport(benchmarkResults) {
          if (process.env.ALERT_TOPIC_ARN) {
            const subject = \`Performance Benchmark Report - \${benchmarkResults.environment}\`;
            
            const passedBenchmarks = Object.values(benchmarkResults.benchmarkResults).filter(result => result.passed).length;
            const totalBenchmarks = Object.keys(benchmarkResults.benchmarkResults).length;
            
            const summary = {
              benchmarkId: benchmarkResults.benchmarkId,
              timestamp: benchmarkResults.timestamp,
              environment: benchmarkResults.environment,
              overallScore: totalBenchmarks > 0 ? ((passedBenchmarks / totalBenchmarks) * 100).toFixed(2) : 0,
              passedBenchmarks,
              totalBenchmarks,
              criticalIssues: benchmarkResults.recommendations.filter(r => r.priority === 'CRITICAL').length,
              highPriorityIssues: benchmarkResults.recommendations.filter(r => r.priority === 'HIGH').length,
              benchmarkResults: benchmarkResults.benchmarkResults,
              topRecommendations: benchmarkResults.recommendations.slice(0, 3)
            };
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify(summary, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
        TEST_RESULTS_BUCKET: this.testResultsBucket.bucketName,
        TARGET_API_LATENCY: (props.benchmarkTargets?.apiLatency || 200).toString(),
        TARGET_THROUGHPUT_RPS: (props.benchmarkTargets?.throughputRps || 100).toString(),
        TARGET_ERROR_RATE: (props.benchmarkTargets?.errorRate || 1).toString(),
        TARGET_CPU_UTILIZATION: (props.benchmarkTargets?.cpuUtilization || 70).toString(),
      },
      timeout: cdk.Duration.minutes(10),
    });

    // Grant necessary permissions
    this.benchmarkFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:GetMetricStatistics',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Grant S3 permissions
    this.testResultsBucket.grantReadWrite(this.benchmarkFunction);
  } 
 private setupAutomatedTesting(props: HallucifixPerformanceTestingStackProps) {
    // Schedule weekly performance tests
    const performanceTestRule = new events.Rule(this, 'PerformanceTestRule', {
      ruleName: `hallucifix-performance-test-${props.environment}`,
      description: 'Weekly performance testing',
      schedule: events.Schedule.cron({ weekDay: '0', hour: '2', minute: '0' }), // Sunday 2 AM
    });

    performanceTestRule.addTarget(new targets.LambdaFunction(this.performanceTestFunction));

    // Schedule daily benchmark analysis
    const benchmarkRule = new events.Rule(this, 'BenchmarkRule', {
      ruleName: `hallucifix-benchmark-${props.environment}`,
      description: 'Daily performance benchmark analysis',
      schedule: events.Schedule.cron({ hour: '6', minute: '30' }), // 6:30 AM daily
    });

    benchmarkRule.addTarget(new targets.LambdaFunction(this.benchmarkFunction));

    // Create stress test function for on-demand testing
    const stressTestFunction = new lambda.Function(this, 'StressTestFunction', {
      functionName: `hallucifix-stress-test-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const ecs = new AWS.ECS();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          console.log('Stress test triggered:', JSON.stringify(event, null, 2));
          
          try {
            const stressTestConfig = {
              maxUsers: event.maxUsers || 500,
              duration: event.duration || 30,
              rampUpTime: event.rampUpTime || 5,
              testType: event.testType || 'load'
            };
            
            const taskArn = await startStressTestTask(stressTestConfig);
            
            return {
              statusCode: 200,
              body: JSON.stringify({
                message: 'Stress test started',
                taskArn,
                config: stressTestConfig
              })
            };
          } catch (error) {
            console.error('Error starting stress test:', error);
            throw error;
          }
        };

        async function startStressTestTask(config) {
          const taskDefinition = {
            family: 'hallucifix-stress-test',
            networkMode: 'awsvpc',
            requiresCompatibilities: ['FARGATE'],
            cpu: '1024',
            memory: '2048',
            containerDefinitions: [
              {
                name: 'stress-test-container',
                image: 'artillery/artillery:latest',
                essential: true,
                logConfiguration: {
                  logDriver: 'awslogs',
                  options: {
                    'awslogs-group': process.env.LOG_GROUP_NAME,
                    'awslogs-region': process.env.AWS_REGION,
                    'awslogs-stream-prefix': 'stress-test'
                  }
                },
                environment: [
                  { name: 'MAX_USERS', value: config.maxUsers.toString() },
                  { name: 'DURATION', value: config.duration.toString() },
                  { name: 'RAMP_UP_TIME', value: config.rampUpTime.toString() },
                  { name: 'TEST_TYPE', value: config.testType }
                ]
              }
            ]
          };
          
          // Register task definition
          const registerResponse = await ecs.registerTaskDefinition(taskDefinition).promise();
          
          // Run task
          const runTaskParams = {
            cluster: process.env.CLUSTER_NAME,
            taskDefinition: registerResponse.taskDefinition.taskDefinitionArn,
            launchType: 'FARGATE',
            networkConfiguration: {
              awsvpcConfiguration: {
                subnets: process.env.SUBNET_IDS.split(','),
                assignPublicIp: 'ENABLED'
              }
            }
          };
          
          const runResponse = await ecs.runTask(runTaskParams).promise();
          
          if (runResponse.tasks && runResponse.tasks.length > 0) {
            return runResponse.tasks[0].taskArn;
          }
          
          throw new Error('Failed to start stress test task');
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        CLUSTER_NAME: this.loadTestingCluster.clusterName,
        LOG_GROUP_NAME: this.testingLogGroup.logGroupName,
        SUBNET_IDS: props.vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
      },
      timeout: cdk.Duration.minutes(5),
    });

    // Grant ECS permissions to stress test function
    stressTestFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecs:RegisterTaskDefinition',
        'ecs:RunTask',
        'ecs:DescribeTasks',
        'iam:PassRole',
      ],
      resources: ['*'],
    }));
  }

  private createPerformanceTestingDashboard(props: HallucifixPerformanceTestingStackProps) {
    const performanceTestingDashboard = new cloudwatch.Dashboard(this, 'PerformanceTestingDashboard', {
      dashboardName: `hallucifix-performance-testing-${props.environment}`,
    });

    performanceTestingDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Latest Test Response Time (ms)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/PerformanceTest',
            metricName: 'ResponseTime',
            period: cdk.Duration.hours(24),
            statistic: 'Average',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Latest Test Throughput (RPS)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/PerformanceTest',
            metricName: 'ThroughputRPS',
            period: cdk.Duration.hours(24),
            statistic: 'Average',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Latest Test Error Rate (%)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/PerformanceTest',
            metricName: 'ErrorRate',
            period: cdk.Duration.hours(24),
            statistic: 'Average',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Max Concurrent Users',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/PerformanceTest',
            metricName: 'ConcurrentUsers',
            period: cdk.Duration.hours(24),
            statistic: 'Maximum',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Performance Test Trends',
        left: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/PerformanceTest',
            metricName: 'ResponseTime',
            period: cdk.Duration.hours(1),
            statistic: 'Average',
            label: 'Response Time (ms)',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/PerformanceTest',
            metricName: 'ThroughputRPS',
            period: cdk.Duration.hours(1),
            statistic: 'Average',
            label: 'Throughput (RPS)',
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Error Rate and Concurrent Users',
        left: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/PerformanceTest',
            metricName: 'ErrorRate',
            period: cdk.Duration.hours(1),
            statistic: 'Average',
            label: 'Error Rate (%)',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/PerformanceTest',
            metricName: 'ConcurrentUsers',
            period: cdk.Duration.hours(1),
            statistic: 'Average',
            label: 'Concurrent Users',
          }),
        ],
        width: 12,
        height: 6,
      })
    );
  }

  private createOutputs(props: HallucifixPerformanceTestingStackProps) {
    new cdk.CfnOutput(this, 'LoadTestingClusterName', {
      value: this.loadTestingCluster.clusterName,
      description: 'ECS cluster name for load testing',
      exportName: `${props.environment}-LoadTestingClusterName`,
    });

    new cdk.CfnOutput(this, 'PerformanceTestFunctionArn', {
      value: this.performanceTestFunction.functionArn,
      description: 'Performance test function ARN',
      exportName: `${props.environment}-PerformanceTestFunctionArn`,
    });

    new cdk.CfnOutput(this, 'BenchmarkFunctionArn', {
      value: this.benchmarkFunction.functionArn,
      description: 'Benchmark function ARN',
      exportName: `${props.environment}-BenchmarkFunctionArn`,
    });

    new cdk.CfnOutput(this, 'TestResultsBucketName', {
      value: this.testResultsBucket.bucketName,
      description: 'S3 bucket for performance test results',
      exportName: `${props.environment}-TestResultsBucketName`,
    });

    new cdk.CfnOutput(this, 'TestingLogGroupName', {
      value: this.testingLogGroup.logGroupName,
      description: 'CloudWatch log group for performance testing',
      exportName: `${props.environment}-TestingLogGroupName`,
    });
  }
}