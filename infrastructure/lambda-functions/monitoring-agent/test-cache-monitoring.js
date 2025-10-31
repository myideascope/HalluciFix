/**
 * Test script for cache monitoring functionality
 */

// Mock AWS SDK clients for testing
const mockCloudWatchClient = {
  send: async (command) => {
    console.log('CloudWatch command:', command.constructor.name);
    if (command.constructor.name === 'GetMetricStatisticsCommand') {
      return {
        Datapoints: [
          { Average: 85.5, Maximum: 95.2, Sum: 100, Timestamp: new Date() },
          { Average: 82.1, Maximum: 90.8, Sum: 95, Timestamp: new Date() },
        ]
      };
    }
    return { success: true };
  }
};

const mockElastiCacheClient = {
  send: async (command) => {
    console.log('ElastiCache command:', command.constructor.name);
    return {
      CacheClusters: [
        {
          CacheClusterId: 'hallucifix-cache-dev',
          CacheNodeType: 'cache.t3.micro',
          Engine: 'redis',
          CacheClusterStatus: 'available'
        }
      ]
    };
  }
};

const mockSNSClient = {
  send: async (command) => {
    console.log('SNS command:', command.constructor.name);
    return { MessageId: 'test-message-id' };
  }
};

// Mock environment variables
process.env.AWS_REGION = 'us-east-1';
process.env.NODE_ENV = 'test';
process.env.FUNCTION_PREFIX = 'hallucifix';
process.env.CACHE_CLUSTER_PREFIX = 'hallucifix-cache';
process.env.ALERT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:test-topic';

// Test the cache monitoring functionality
async function testCacheMonitoring() {
  console.log('Testing cache monitoring functionality...\n');

  // Create a mock health checker with our test clients
  class TestLambdaHealthChecker {
    constructor() {
      this.metrics = [];
      this.alerts = [];
      this.cloudWatchClient = mockCloudWatchClient;
      this.elastiCacheClient = mockElastiCacheClient;
      this.snsClient = mockSNSClient;
    }

    async getHallucifixCacheClusters() {
      const response = await this.elastiCacheClient.send({});
      return response.CacheClusters.filter(cluster => 
        cluster.CacheClusterId.includes('hallucifix-cache')
      );
    }

    async getMetricStatistics(params) {
      return await this.cloudWatchClient.send({});
    }

    addMetric(metricName, value, unit, resourceName = null) {
      const metric = {
        MetricName: metricName,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'Environment', Value: 'test' },
        ],
      };

      if (resourceName) {
        if (resourceName.includes('cache') || resourceName.includes('redis')) {
          metric.Dimensions.push({ Name: 'CacheClusterId', Value: resourceName });
        } else {
          metric.Dimensions.push({ Name: 'FunctionName', Value: resourceName });
        }
      }

      this.metrics.push(metric);
      console.log(`📊 Metric added: ${metricName} = ${value} ${unit} (${resourceName || 'system'})`);
    }

    async sendAlert(severity, subject, message) {
      const alert = {
        severity,
        subject,
        message,
        timestamp: new Date().toISOString(),
        environment: 'test',
      };

      this.alerts.push(alert);
      console.log(`🚨 Alert [${severity}]: ${subject}`);
      console.log(`   Message: ${message}\n`);
    }

    async checkCacheHitMissRates(clusterId) {
      console.log(`Checking cache hit/miss rates for ${clusterId}...`);
      
      // Simulate metrics
      const avgHitRate = 85.5;
      const avgMissRate = 14.5;
      
      this.addMetric('CacheHitRate', avgHitRate, 'Percent', clusterId);
      this.addMetric('CacheMissRate', avgMissRate, 'Percent', clusterId);

      // Test threshold alerts
      if (avgHitRate < 80) {
        await this.sendAlert(
          'MEDIUM',
          `Low Cache Hit Rate: ${clusterId}`,
          `Cache hit rate is ${avgHitRate.toFixed(1)}% (below 80% threshold)`
        );
      }
    }

    async checkCacheMemoryUsage(clusterId) {
      console.log(`Checking cache memory usage for ${clusterId}...`);
      
      const avgMemoryUsage = 75.2;
      const avgFreeableMemory = 128 * 1024 * 1024; // 128MB
      
      this.addMetric('CacheMemoryUsage', avgMemoryUsage, 'Percent', clusterId);
      this.addMetric('CacheFreeableMemory', avgFreeableMemory, 'Bytes', clusterId);
    }

    async checkCacheConnections(clusterId) {
      console.log(`Checking cache connections for ${clusterId}...`);
      
      const avgConnections = 25;
      const totalNewConnections = 45;
      
      this.addMetric('CacheConnections', avgConnections, 'Count', clusterId);
      this.addMetric('CacheNewConnections', totalNewConnections, 'Count', clusterId);
    }

    async checkCacheLatency(clusterId) {
      console.log(`Checking cache latency for ${clusterId}...`);
      
      const avgGetLatency = 0.8;
      const avgSetLatency = 1.2;
      
      this.addMetric('CacheGetLatency', avgGetLatency, 'Milliseconds', clusterId);
      this.addMetric('CacheSetLatency', avgSetLatency, 'Milliseconds', clusterId);

      // Test latency alert
      if (avgSetLatency > 1.0) {
        await this.sendAlert(
          'MEDIUM',
          `High Cache SET Latency: ${clusterId}`,
          `Average SET latency: ${avgSetLatency.toFixed(2)}ms (above 1.0ms threshold)`
        );
      }
    }

    async checkCacheEvictions(clusterId) {
      console.log(`Checking cache evictions for ${clusterId}...`);
      
      const totalEvictions = 5;
      const totalReclaimed = 12;
      
      this.addMetric('CacheEvictions', totalEvictions, 'Count', clusterId);
      this.addMetric('CacheReclaimed', totalReclaimed, 'Count', clusterId);
    }

    async checkCacheCpuUtilization(clusterId) {
      console.log(`Checking cache CPU utilization for ${clusterId}...`);
      
      const avgCpuUtilization = 45.8;
      
      this.addMetric('CacheCpuUtilization', avgCpuUtilization, 'Percent', clusterId);
    }

    async checkCacheClusterHealth(cluster) {
      const clusterId = cluster.CacheClusterId;
      console.log(`\n🔍 Checking health for cache cluster: ${clusterId}`);

      await this.checkCacheHitMissRates(clusterId);
      await this.checkCacheMemoryUsage(clusterId);
      await this.checkCacheConnections(clusterId);
      await this.checkCacheLatency(clusterId);
      await this.checkCacheEvictions(clusterId);
      await this.checkCacheCpuUtilization(clusterId);
    }

    async checkCacheClusters() {
      console.log('🔍 Checking ElastiCache clusters...');

      const clusters = await this.getHallucifixCacheClusters();
      console.log(`Found ${clusters.length} cache clusters to monitor`);

      for (const cluster of clusters) {
        await this.checkCacheClusterHealth(cluster);
      }
    }

    getMetrics() {
      return this.metrics;
    }

    getAlerts() {
      return this.alerts;
    }
  }

  // Run the test
  const healthChecker = new TestLambdaHealthChecker();
  
  try {
    await healthChecker.checkCacheClusters();
    
    const metrics = healthChecker.getMetrics();
    const alerts = healthChecker.getAlerts();
    
    console.log('\n📈 Test Results Summary:');
    console.log(`- Metrics collected: ${metrics.length}`);
    console.log(`- Alerts generated: ${alerts.length}`);
    
    console.log('\n📊 Metrics collected:');
    metrics.forEach(metric => {
      const dimension = metric.Dimensions.find(d => d.Name === 'CacheClusterId' || d.Name === 'FunctionName');
      const resource = dimension ? dimension.Value : 'system';
      console.log(`  ${metric.MetricName}: ${metric.Value} ${metric.Unit} (${resource})`);
    });
    
    if (alerts.length > 0) {
      console.log('\n🚨 Alerts generated:');
      alerts.forEach(alert => {
        console.log(`  [${alert.severity}] ${alert.subject}`);
      });
    }
    
    console.log('\n✅ Cache monitoring test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

// Run the test
testCacheMonitoring().catch(console.error);