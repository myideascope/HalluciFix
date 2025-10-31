/**
 * AWS Lambda Function: Monitoring Agent
 * Custom monitoring and alerting for HalluciFix Lambda functions
 */

const { CloudWatchClient, PutMetricDataCommand, GetMetricStatisticsCommand } = require('@aws-sdk/client-cloudwatch');
const { LambdaClient, ListFunctionsCommand, GetFunctionCommand } = require('@aws-sdk/client-lambda');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { ElastiCacheClient, DescribeCacheClustersCommand } = require('@aws-sdk/client-elasticache');

// AWS clients
const cloudWatchClient = new CloudWatchClient({ region: process.env.AWS_REGION });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });
const logsClient = new CloudWatchLogsClient({ region: process.env.AWS_REGION });
const elastiCacheClient = new ElastiCacheClient({ region: process.env.AWS_REGION });

// Environment variables
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN;
const FUNCTION_PREFIX = process.env.FUNCTION_PREFIX || 'hallucifix';
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const CACHE_CLUSTER_PREFIX = process.env.CACHE_CLUSTER_PREFIX || 'hallucifix-cache';

// Monitoring thresholds
const THRESHOLDS = {
  errorRate: 0.05, // 5% error rate
  avgDuration: 30000, // 30 seconds
  memoryUtilization: 0.8, // 80% memory usage
  coldStartRate: 0.3, // 30% cold starts
  concurrentExecutions: 800, // 80% of default limit
  // Cache thresholds
  cacheHitRate: 80, // 80% minimum hit rate
  cacheMissRate: 20, // 20% maximum miss rate
  cacheMemoryUsage: 80, // 80% memory usage
  cacheConnections: 50, // 50 connections threshold
  cacheLatency: 1, // 1ms latency threshold
  cacheEvictions: 10, // 10 evictions per 5 minutes
  cacheCpuUtilization: 75, // 75% CPU utilization
};

// Health check functions
class LambdaHealthChecker {
  constructor() {
    this.metrics = [];
    this.alerts = [];
  }

  async checkAllFunctions() {
    console.log('Starting Lambda health check...');
    
    try {
      // Get all HalluciFix Lambda functions
      const functions = await this.getHallucifixFunctions();
      console.log(`Found ${functions.length} functions to monitor`);

      // Check each function
      for (const func of functions) {
        await this.checkFunctionHealth(func);
      }

      // Check ElastiCache clusters
      await this.checkCacheClusters();

      // Analyze system-wide metrics
      await this.checkSystemHealth();

      // Send alerts if needed
      await this.processAlerts();

      // Publish custom metrics
      await this.publishMetrics();

      return {
        functionsChecked: functions.length,
        metricsPublished: this.metrics.length,
        alertsSent: this.alerts.length,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      console.error('Health check failed:', error);
      await this.sendAlert('CRITICAL', 'Health Check Failed', error.message);
      throw error;
    }
  }

  async getHallucifixFunctions() {
    const functions = [];
    let nextMarker;

    do {
      const command = new ListFunctionsCommand({
        Marker: nextMarker,
        MaxItems: 50,
      });

      const response = await lambdaClient.send(command);
      
      // Filter for HalluciFix functions
      const hallucifixFunctions = response.Functions.filter(func => 
        func.FunctionName.includes(FUNCTION_PREFIX)
      );

      functions.push(...hallucifixFunctions);
      nextMarker = response.NextMarker;

    } while (nextMarker);

    return functions;
  }

  async checkFunctionHealth(func) {
    const functionName = func.FunctionName;
    console.log(`Checking health for function: ${functionName}`);

    try {
      // Get function configuration
      const funcConfig = await this.getFunctionConfig(functionName);
      
      // Check error rate
      await this.checkErrorRate(functionName);
      
      // Check duration
      await this.checkDuration(functionName, funcConfig.Timeout);
      
      // Check memory utilization
      await this.checkMemoryUtilization(functionName);
      
      // Check throttles
      await this.checkThrottles(functionName);
      
      // Check cold starts
      await this.checkColdStarts(functionName);

      // Check custom business metrics
      await this.checkBusinessMetrics(functionName);

    } catch (error) {
      console.error(`Error checking function ${functionName}:`, error);
      await this.sendAlert('HIGH', `Function Check Failed: ${functionName}`, error.message);
    }
  }

  async getFunctionConfig(functionName) {
    const command = new GetFunctionCommand({ FunctionName: functionName });
    const response = await lambdaClient.send(command);
    return response.Configuration;
  }

  async checkErrorRate(functionName) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 15 * 60 * 1000); // Last 15 minutes

    // Get invocations
    const invocationsMetric = await this.getMetricStatistics({
      Namespace: 'AWS/Lambda',
      MetricName: 'Invocations',
      Dimensions: [{ Name: 'FunctionName', Value: functionName }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300, // 5 minutes
      Statistics: ['Sum'],
    });

    // Get errors
    const errorsMetric = await this.getMetricStatistics({
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
      Dimensions: [{ Name: 'FunctionName', Value: functionName }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Sum'],
    });

    const totalInvocations = invocationsMetric.Datapoints.reduce((sum, dp) => sum + dp.Sum, 0);
    const totalErrors = errorsMetric.Datapoints.reduce((sum, dp) => sum + dp.Sum, 0);

    if (totalInvocations > 0) {
      const errorRate = totalErrors / totalInvocations;
      
      // Publish custom metric
      this.addMetric('ErrorRate', errorRate, 'Percent', functionName);

      if (errorRate > THRESHOLDS.errorRate) {
        await this.sendAlert(
          'HIGH',
          `High Error Rate: ${functionName}`,
          `Error rate is ${(errorRate * 100).toFixed(2)}% (${totalErrors}/${totalInvocations})`
        );
      }
    }
  }

  async checkDuration(functionName, timeoutMs) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 15 * 60 * 1000);

    const durationMetric = await this.getMetricStatistics({
      Namespace: 'AWS/Lambda',
      MetricName: 'Duration',
      Dimensions: [{ Name: 'FunctionName', Value: functionName }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average', 'Maximum'],
    });

    if (durationMetric.Datapoints.length > 0) {
      const avgDuration = durationMetric.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / durationMetric.Datapoints.length;
      const maxDuration = Math.max(...durationMetric.Datapoints.map(dp => dp.Maximum));

      // Publish custom metrics
      this.addMetric('AverageDuration', avgDuration, 'Milliseconds', functionName);
      this.addMetric('MaxDuration', maxDuration, 'Milliseconds', functionName);

      // Check against timeout (80% threshold)
      const timeoutThreshold = timeoutMs * 0.8;
      if (avgDuration > timeoutThreshold) {
        await this.sendAlert(
          'MEDIUM',
          `High Duration: ${functionName}`,
          `Average duration ${avgDuration.toFixed(0)}ms is approaching timeout (${timeoutMs}ms)`
        );
      }

      if (maxDuration > timeoutMs * 0.95) {
        await this.sendAlert(
          'HIGH',
          `Near Timeout: ${functionName}`,
          `Maximum duration ${maxDuration.toFixed(0)}ms is very close to timeout (${timeoutMs}ms)`
        );
      }
    }
  }

  async checkMemoryUtilization(functionName) {
    // Query CloudWatch Logs for memory usage
    const query = `
      fields @timestamp, @maxMemoryUsed, @memorySize
      | filter @maxMemoryUsed > 0
      | stats avg(@maxMemoryUsed), max(@maxMemoryUsed), avg(@memorySize) by bin(5m)
      | sort @timestamp desc
      | limit 10
    `;

    try {
      const logGroupName = `/aws/lambda/${functionName}`;
      const endTime = Date.now();
      const startTime = endTime - (15 * 60 * 1000); // 15 minutes ago

      const startQueryCommand = new StartQueryCommand({
        logGroupName,
        startTime: Math.floor(startTime / 1000),
        endTime: Math.floor(endTime / 1000),
        queryString: query,
      });

      const queryResponse = await logsClient.send(startQueryCommand);
      
      // Wait for query to complete
      await this.waitForQuery(queryResponse.queryId);
      
      const resultsCommand = new GetQueryResultsCommand({
        queryId: queryResponse.queryId,
      });

      const results = await logsClient.send(resultsCommand);

      if (results.results && results.results.length > 0) {
        const latestResult = results.results[0];
        const avgMemoryUsed = parseFloat(latestResult[0]?.value || '0');
        const maxMemoryUsed = parseFloat(latestResult[1]?.value || '0');
        const memorySize = parseFloat(latestResult[2]?.value || '0');

        if (memorySize > 0) {
          const memoryUtilization = avgMemoryUsed / memorySize;
          
          // Publish custom metric
          this.addMetric('MemoryUtilization', memoryUtilization, 'Percent', functionName);

          if (memoryUtilization > THRESHOLDS.memoryUtilization) {
            await this.sendAlert(
              'MEDIUM',
              `High Memory Usage: ${functionName}`,
              `Memory utilization is ${(memoryUtilization * 100).toFixed(1)}% (${avgMemoryUsed.toFixed(0)}MB/${memorySize}MB)`
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error checking memory utilization for ${functionName}:`, error);
    }
  }

  async checkThrottles(functionName) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 15 * 60 * 1000);

    const throttlesMetric = await this.getMetricStatistics({
      Namespace: 'AWS/Lambda',
      MetricName: 'Throttles',
      Dimensions: [{ Name: 'FunctionName', Value: functionName }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Sum'],
    });

    const totalThrottles = throttlesMetric.Datapoints.reduce((sum, dp) => sum + dp.Sum, 0);

    if (totalThrottles > 0) {
      await this.sendAlert(
        'HIGH',
        `Function Throttled: ${functionName}`,
        `Function was throttled ${totalThrottles} times in the last 15 minutes`
      );
    }

    // Publish custom metric
    this.addMetric('Throttles', totalThrottles, 'Count', functionName);
  }

  async checkColdStarts(functionName) {
    // Query for cold starts using init duration
    const query = `
      fields @timestamp, @initDuration, @duration
      | filter ispresent(@initDuration)
      | stats count() as coldStarts by bin(5m)
      | sort @timestamp desc
      | limit 10
    `;

    try {
      const logGroupName = `/aws/lambda/${functionName}`;
      const endTime = Date.now();
      const startTime = endTime - (15 * 60 * 1000);

      const startQueryCommand = new StartQueryCommand({
        logGroupName,
        startTime: Math.floor(startTime / 1000),
        endTime: Math.floor(endTime / 1000),
        queryString: query,
      });

      const queryResponse = await logsClient.send(startQueryCommand);
      await this.waitForQuery(queryResponse.queryId);
      
      const resultsCommand = new GetQueryResultsCommand({
        queryId: queryResponse.queryId,
      });

      const results = await logsClient.send(resultsCommand);

      if (results.results && results.results.length > 0) {
        const totalColdStarts = results.results.reduce((sum, result) => {
          return sum + parseInt(result[0]?.value || '0');
        }, 0);

        // Publish custom metric
        this.addMetric('ColdStarts', totalColdStarts, 'Count', functionName);

        // Get total invocations for cold start rate
        const invocationsMetric = await this.getMetricStatistics({
          Namespace: 'AWS/Lambda',
          MetricName: 'Invocations',
          Dimensions: [{ Name: 'FunctionName', Value: functionName }],
          StartTime: new Date(startTime),
          EndTime: new Date(endTime),
          Period: 300,
          Statistics: ['Sum'],
        });

        const totalInvocations = invocationsMetric.Datapoints.reduce((sum, dp) => sum + dp.Sum, 0);

        if (totalInvocations > 0) {
          const coldStartRate = totalColdStarts / totalInvocations;
          this.addMetric('ColdStartRate', coldStartRate, 'Percent', functionName);

          if (coldStartRate > THRESHOLDS.coldStartRate) {
            await this.sendAlert(
              'MEDIUM',
              `High Cold Start Rate: ${functionName}`,
              `Cold start rate is ${(coldStartRate * 100).toFixed(1)}% (${totalColdStarts}/${totalInvocations})`
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error checking cold starts for ${functionName}:`, error);
    }
  }

  async checkBusinessMetrics(functionName) {
    // Check custom business metrics specific to HalluciFix
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 15 * 60 * 1000);

    try {
      // Check business error metrics
      const businessErrorsMetric = await this.getMetricStatistics({
        Namespace: 'HalluciFix/Lambda',
        MetricName: 'BusinessErrors',
        Dimensions: [{ Name: 'FunctionName', Value: functionName }],
        StartTime: startTime,
        EndTime: endTime,
        Period: 300,
        Statistics: ['Sum'],
      });

      const totalBusinessErrors = businessErrorsMetric.Datapoints.reduce((sum, dp) => sum + dp.Sum, 0);

      if (totalBusinessErrors > 5) {
        await this.sendAlert(
          'MEDIUM',
          `Business Logic Errors: ${functionName}`,
          `${totalBusinessErrors} business logic errors detected in the last 15 minutes`
        );
      }

      // Check analysis accuracy metrics (for analysis functions)
      if (functionName.includes('analysis') || functionName.includes('document')) {
        const accuracyMetric = await this.getMetricStatistics({
          Namespace: 'HalluciFix/Analysis',
          MetricName: 'AverageAccuracy',
          Dimensions: [{ Name: 'FunctionName', Value: functionName }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 300,
          Statistics: ['Average'],
        });

        if (accuracyMetric.Datapoints.length > 0) {
          const avgAccuracy = accuracyMetric.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / accuracyMetric.Datapoints.length;
          
          if (avgAccuracy < 70) { // Alert if accuracy drops below 70%
            await this.sendAlert(
              'HIGH',
              `Low Analysis Accuracy: ${functionName}`,
              `Average analysis accuracy is ${avgAccuracy.toFixed(1)}%`
            );
          }
        }
      }

    } catch (error) {
      console.error(`Error checking business metrics for ${functionName}:`, error);
    }
  }

  async checkCacheClusters() {
    console.log('Checking ElastiCache clusters...');

    try {
      // Get all HalluciFix cache clusters
      const clusters = await this.getHallucifixCacheClusters();
      console.log(`Found ${clusters.length} cache clusters to monitor`);

      // Check each cluster
      for (const cluster of clusters) {
        await this.checkCacheClusterHealth(cluster);
      }

    } catch (error) {
      console.error('Cache cluster check failed:', error);
      await this.sendAlert('HIGH', 'Cache Monitoring Failed', error.message);
    }
  }

  async getHallucifixCacheClusters() {
    const clusters = [];
    let marker;

    do {
      const command = new DescribeCacheClustersCommand({
        Marker: marker,
        MaxRecords: 100,
      });

      const response = await elastiCacheClient.send(command);
      
      // Filter for HalluciFix cache clusters
      const hallucifixClusters = response.CacheClusters.filter(cluster => 
        cluster.CacheClusterId.includes(CACHE_CLUSTER_PREFIX)
      );

      clusters.push(...hallucifixClusters);
      marker = response.Marker;

    } while (marker);

    return clusters;
  }

  async checkCacheClusterHealth(cluster) {
    const clusterId = cluster.CacheClusterId;
    console.log(`Checking health for cache cluster: ${clusterId}`);

    try {
      // Check cache hit/miss rates
      await this.checkCacheHitMissRates(clusterId);
      
      // Check memory usage
      await this.checkCacheMemoryUsage(clusterId);
      
      // Check connections
      await this.checkCacheConnections(clusterId);
      
      // Check latency
      await this.checkCacheLatency(clusterId);
      
      // Check evictions
      await this.checkCacheEvictions(clusterId);
      
      // Check CPU utilization
      await this.checkCacheCpuUtilization(clusterId);

    } catch (error) {
      console.error(`Error checking cache cluster ${clusterId}:`, error);
      await this.sendAlert('HIGH', `Cache Cluster Check Failed: ${clusterId}`, error.message);
    }
  }

  async checkCacheHitMissRates(clusterId) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 15 * 60 * 1000); // Last 15 minutes

    // Get cache hit rate
    const hitRateMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'CacheHitRate',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average'],
    });

    // Get cache miss rate
    const missRateMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'CacheMissRate',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average'],
    });

    if (hitRateMetric.Datapoints.length > 0) {
      const avgHitRate = hitRateMetric.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / hitRateMetric.Datapoints.length;
      
      this.addMetric('CacheHitRate', avgHitRate, 'Percent', clusterId);

      if (avgHitRate < THRESHOLDS.cacheHitRate) {
        await this.sendAlert(
          'MEDIUM',
          `Low Cache Hit Rate: ${clusterId}`,
          `Cache hit rate is ${avgHitRate.toFixed(1)}% (below ${THRESHOLDS.cacheHitRate}% threshold)`
        );
      }
    }

    if (missRateMetric.Datapoints.length > 0) {
      const avgMissRate = missRateMetric.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / missRateMetric.Datapoints.length;
      
      this.addMetric('CacheMissRate', avgMissRate, 'Percent', clusterId);

      if (avgMissRate > THRESHOLDS.cacheMissRate) {
        await this.sendAlert(
          'MEDIUM',
          `High Cache Miss Rate: ${clusterId}`,
          `Cache miss rate is ${avgMissRate.toFixed(1)}% (above ${THRESHOLDS.cacheMissRate}% threshold)`
        );
      }
    }
  }

  async checkCacheMemoryUsage(clusterId) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 15 * 60 * 1000);

    // Get memory usage percentage
    const memoryUsageMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'DatabaseMemoryUsagePercentage',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average', 'Maximum'],
    });

    // Get freeable memory
    const freeableMemoryMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'FreeableMemory',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average'],
    });

    if (memoryUsageMetric.Datapoints.length > 0) {
      const avgMemoryUsage = memoryUsageMetric.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / memoryUsageMetric.Datapoints.length;
      const maxMemoryUsage = Math.max(...memoryUsageMetric.Datapoints.map(dp => dp.Maximum));
      
      this.addMetric('CacheMemoryUsage', avgMemoryUsage, 'Percent', clusterId);
      this.addMetric('CacheMaxMemoryUsage', maxMemoryUsage, 'Percent', clusterId);

      if (avgMemoryUsage > THRESHOLDS.cacheMemoryUsage) {
        await this.sendAlert(
          'HIGH',
          `High Cache Memory Usage: ${clusterId}`,
          `Memory usage is ${avgMemoryUsage.toFixed(1)}% (above ${THRESHOLDS.cacheMemoryUsage}% threshold)`
        );
      }
    }

    if (freeableMemoryMetric.Datapoints.length > 0) {
      const avgFreeableMemory = freeableMemoryMetric.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / freeableMemoryMetric.Datapoints.length;
      
      this.addMetric('CacheFreeableMemory', avgFreeableMemory, 'Bytes', clusterId);

      // Alert if freeable memory is below 50MB
      if (avgFreeableMemory < 50 * 1024 * 1024) {
        await this.sendAlert(
          'HIGH',
          `Low Cache Freeable Memory: ${clusterId}`,
          `Freeable memory is ${(avgFreeableMemory / 1024 / 1024).toFixed(1)}MB`
        );
      }
    }
  }

  async checkCacheConnections(clusterId) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 15 * 60 * 1000);

    // Get current connections
    const connectionsMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'CurrConnections',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average', 'Maximum'],
    });

    // Get new connections
    const newConnectionsMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'NewConnections',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Sum'],
    });

    if (connectionsMetric.Datapoints.length > 0) {
      const avgConnections = connectionsMetric.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / connectionsMetric.Datapoints.length;
      const maxConnections = Math.max(...connectionsMetric.Datapoints.map(dp => dp.Maximum));
      
      this.addMetric('CacheConnections', avgConnections, 'Count', clusterId);
      this.addMetric('CacheMaxConnections', maxConnections, 'Count', clusterId);

      if (avgConnections > THRESHOLDS.cacheConnections) {
        await this.sendAlert(
          'MEDIUM',
          `High Cache Connections: ${clusterId}`,
          `Average connections: ${avgConnections.toFixed(0)} (above ${THRESHOLDS.cacheConnections} threshold)`
        );
      }
    }

    if (newConnectionsMetric.Datapoints.length > 0) {
      const totalNewConnections = newConnectionsMetric.Datapoints.reduce((sum, dp) => sum + dp.Sum, 0);
      
      this.addMetric('CacheNewConnections', totalNewConnections, 'Count', clusterId);

      if (totalNewConnections > 100) {
        await this.sendAlert(
          'MEDIUM',
          `High New Connection Rate: ${clusterId}`,
          `${totalNewConnections} new connections in the last 15 minutes`
        );
      }
    }
  }

  async checkCacheLatency(clusterId) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 15 * 60 * 1000);

    // Get GET command latency
    const getLatencyMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'GetTypeCmdsLatency',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average', 'Maximum'],
    });

    // Get SET command latency
    const setLatencyMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'SetTypeCmdsLatency',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average', 'Maximum'],
    });

    if (getLatencyMetric.Datapoints.length > 0) {
      const avgGetLatency = getLatencyMetric.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / getLatencyMetric.Datapoints.length;
      const maxGetLatency = Math.max(...getLatencyMetric.Datapoints.map(dp => dp.Maximum));
      
      this.addMetric('CacheGetLatency', avgGetLatency, 'Milliseconds', clusterId);
      this.addMetric('CacheMaxGetLatency', maxGetLatency, 'Milliseconds', clusterId);

      if (avgGetLatency > THRESHOLDS.cacheLatency) {
        await this.sendAlert(
          'MEDIUM',
          `High Cache GET Latency: ${clusterId}`,
          `Average GET latency: ${avgGetLatency.toFixed(2)}ms (above ${THRESHOLDS.cacheLatency}ms threshold)`
        );
      }
    }

    if (setLatencyMetric.Datapoints.length > 0) {
      const avgSetLatency = setLatencyMetric.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / setLatencyMetric.Datapoints.length;
      const maxSetLatency = Math.max(...setLatencyMetric.Datapoints.map(dp => dp.Maximum));
      
      this.addMetric('CacheSetLatency', avgSetLatency, 'Milliseconds', clusterId);
      this.addMetric('CacheMaxSetLatency', maxSetLatency, 'Milliseconds', clusterId);

      if (avgSetLatency > THRESHOLDS.cacheLatency) {
        await this.sendAlert(
          'MEDIUM',
          `High Cache SET Latency: ${clusterId}`,
          `Average SET latency: ${avgSetLatency.toFixed(2)}ms (above ${THRESHOLDS.cacheLatency}ms threshold)`
        );
      }
    }
  }

  async checkCacheEvictions(clusterId) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 15 * 60 * 1000);

    // Get evictions
    const evictionsMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'Evictions',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Sum'],
    });

    // Get reclaimed items
    const reclaimedMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'Reclaimed',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Sum'],
    });

    if (evictionsMetric.Datapoints.length > 0) {
      const totalEvictions = evictionsMetric.Datapoints.reduce((sum, dp) => sum + dp.Sum, 0);
      
      this.addMetric('CacheEvictions', totalEvictions, 'Count', clusterId);

      if (totalEvictions > THRESHOLDS.cacheEvictions) {
        await this.sendAlert(
          'MEDIUM',
          `High Cache Evictions: ${clusterId}`,
          `${totalEvictions} evictions in the last 15 minutes (above ${THRESHOLDS.cacheEvictions} threshold)`
        );
      }
    }

    if (reclaimedMetric.Datapoints.length > 0) {
      const totalReclaimed = reclaimedMetric.Datapoints.reduce((sum, dp) => sum + dp.Sum, 0);
      
      this.addMetric('CacheReclaimed', totalReclaimed, 'Count', clusterId);
    }
  }

  async checkCacheCpuUtilization(clusterId) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 15 * 60 * 1000);

    // Get CPU utilization
    const cpuMetric = await this.getMetricStatistics({
      Namespace: 'AWS/ElastiCache',
      MetricName: 'CPUUtilization',
      Dimensions: [{ Name: 'CacheClusterId', Value: clusterId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average', 'Maximum'],
    });

    if (cpuMetric.Datapoints.length > 0) {
      const avgCpuUtilization = cpuMetric.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / cpuMetric.Datapoints.length;
      const maxCpuUtilization = Math.max(...cpuMetric.Datapoints.map(dp => dp.Maximum));
      
      this.addMetric('CacheCpuUtilization', avgCpuUtilization, 'Percent', clusterId);
      this.addMetric('CacheMaxCpuUtilization', maxCpuUtilization, 'Percent', clusterId);

      if (avgCpuUtilization > THRESHOLDS.cacheCpuUtilization) {
        await this.sendAlert(
          'HIGH',
          `High Cache CPU Utilization: ${clusterId}`,
          `CPU utilization: ${avgCpuUtilization.toFixed(1)}% (above ${THRESHOLDS.cacheCpuUtilization}% threshold)`
        );
      }
    }
  }

  async checkSystemHealth() {
    console.log('Checking overall system health...');

    // Check concurrent executions across all functions
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // Last 5 minutes

    const concurrentExecutionsMetric = await this.getMetricStatistics({
      Namespace: 'AWS/Lambda',
      MetricName: 'ConcurrentExecutions',
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Maximum'],
    });

    if (concurrentExecutionsMetric.Datapoints.length > 0) {
      const maxConcurrentExecutions = Math.max(...concurrentExecutionsMetric.Datapoints.map(dp => dp.Maximum));
      
      this.addMetric('SystemConcurrentExecutions', maxConcurrentExecutions, 'Count');

      if (maxConcurrentExecutions > THRESHOLDS.concurrentExecutions) {
        await this.sendAlert(
          'HIGH',
          'High System Concurrent Executions',
          `System concurrent executions reached ${maxConcurrentExecutions}`
        );
      }
    }
  }

  async getMetricStatistics(params) {
    const command = new GetMetricStatisticsCommand(params);
    return await cloudWatchClient.send(command);
  }

  async waitForQuery(queryId, maxWaitTime = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const command = new GetQueryResultsCommand({ queryId });
      const result = await logsClient.send(command);
      
      if (result.status === 'Complete') {
        return result;
      }
      
      if (result.status === 'Failed') {
        throw new Error('Log query failed');
      }
      
      // Wait 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Log query timed out');
  }

  addMetric(metricName, value, unit, resourceName = null) {
    const metric = {
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: new Date(),
      Dimensions: [
        { Name: 'Environment', Value: ENVIRONMENT },
      ],
    };

    if (resourceName) {
      // Determine if this is a function or cache cluster
      if (resourceName.includes('cache') || resourceName.includes('redis')) {
        metric.Dimensions.push({ Name: 'CacheClusterId', Value: resourceName });
      } else {
        metric.Dimensions.push({ Name: 'FunctionName', Value: resourceName });
      }
    }

    this.metrics.push(metric);
  }

  async sendAlert(severity, subject, message) {
    const alert = {
      severity,
      subject,
      message,
      timestamp: new Date().toISOString(),
      environment: ENVIRONMENT,
    };

    this.alerts.push(alert);

    if (ALERT_TOPIC_ARN) {
      try {
        const command = new PublishCommand({
          TopicArn: ALERT_TOPIC_ARN,
          Subject: `[${severity}] ${subject}`,
          Message: JSON.stringify(alert, null, 2),
          MessageAttributes: {
            severity: {
              DataType: 'String',
              StringValue: severity,
            },
            environment: {
              DataType: 'String',
              StringValue: ENVIRONMENT,
            },
          },
        });

        await snsClient.send(command);
        console.log(`Alert sent: ${subject}`);
      } catch (error) {
        console.error('Failed to send alert:', error);
      }
    }
  }

  async publishMetrics() {
    if (this.metrics.length === 0) return;

    // Batch metrics by namespace
    const metricsByNamespace = this.metrics.reduce((acc, metric) => {
      const namespace = 'HalluciFix/Monitoring';
      if (!acc[namespace]) acc[namespace] = [];
      acc[namespace].push(metric);
      return acc;
    }, {});

    // Publish metrics in batches of 20 (CloudWatch limit)
    for (const [namespace, metrics] of Object.entries(metricsByNamespace)) {
      const batches = [];
      for (let i = 0; i < metrics.length; i += 20) {
        batches.push(metrics.slice(i, i + 20));
      }

      for (const batch of batches) {
        try {
          const command = new PutMetricDataCommand({
            Namespace: namespace,
            MetricData: batch,
          });

          await cloudWatchClient.send(command);
          console.log(`Published ${batch.length} metrics to ${namespace}`);
        } catch (error) {
          console.error(`Failed to publish metrics to ${namespace}:`, error);
        }
      }
    }
  }

  async processAlerts() {
    console.log(`Processing ${this.alerts.length} alerts`);
    
    // Group alerts by severity
    const alertsBySeverity = this.alerts.reduce((acc, alert) => {
      if (!acc[alert.severity]) acc[alert.severity] = [];
      acc[alert.severity].push(alert);
      return acc;
    }, {});

    // Log summary
    Object.entries(alertsBySeverity).forEach(([severity, alerts]) => {
      console.log(`${severity}: ${alerts.length} alerts`);
    });
  }
}

// Main Lambda handler
exports.handler = async (event, context) => {
  const executionId = context.awsRequestId;
  console.log(`[${executionId}] Monitoring agent started`);

  try {
    const healthChecker = new LambdaHealthChecker();
    const result = await healthChecker.checkAllFunctions();

    console.log(`[${executionId}] Monitoring completed:`, result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        executionId,
        result,
        timestamp: new Date().toISOString(),
      }),
    };

  } catch (error) {
    console.error(`[${executionId}] Monitoring failed:`, error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        executionId,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};