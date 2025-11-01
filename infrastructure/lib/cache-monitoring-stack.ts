import * as cdk from 'aws-cdk-lib';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as logs from 'aws-cdk-lib/aws-logs';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface HallucifixCacheMonitoringStackProps extends cdk.StackProps {
  environment: string;
  cacheCluster: elasticache.CfnCacheCluster;
  alertEmail?: string;
  slackWebhookUrl?: string;
}

export class HallucifixCacheMonitoringStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: HallucifixCacheMonitoringStackProps) {
    super(scope, id, props);

    // Create SNS topic for cache alerts
    this.alertTopic = new sns.Topic(this, 'CacheAlertTopic', {
      topicName: `hallucifix-cache-alerts-${props.environment}`,
      displayName: `HalluciFix Cache Alerts (${props.environment})`,
    });

    // Add email subscription if provided
    if (props.alertEmail) {
      this.alertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
    }

    // Create CloudWatch dashboard for cache monitoring
    this.dashboard = new cloudwatch.Dashboard(this, 'CacheDashboard', {
      dashboardName: `hallucifix-cache-monitoring-${props.environment}`,
    });

    // Set up comprehensive cache monitoring
    this.setupCachePerformanceMonitoring(props.cacheCluster);
    this.setupCacheMemoryMonitoring(props.cacheCluster);
    this.setupCacheConnectionMonitoring(props.cacheCluster);
    this.setupCacheLatencyMonitoring(props.cacheCluster);
    this.setupCacheEvictionMonitoring(props.cacheCluster);

    // Create composite alarms for overall cache health
    this.createCacheHealthAlarms(props.cacheCluster);

    // Outputs
    new cdk.CfnOutput(this, 'CacheAlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'SNS Topic ARN for cache alerts',
      exportName: `${props.environment}-CacheAlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'CacheDashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Cache Dashboard URL',
      exportName: `${props.environment}-CacheDashboardUrl`,
    });
  }

  private setupCachePerformanceMonitoring(cacheCluster: elasticache.CfnCacheCluster) {
    const clusterName = cacheCluster.clusterName || 'hallucifix-cache';

    // Cache Hit Ratio Monitoring
    const cacheHitRatioMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'CacheHitRate',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const cacheHitRatioAlarm = new cloudwatch.Alarm(this, 'CacheHitRatioAlarm', {
      alarmName: `${clusterName}-hit-ratio-low`,
      alarmDescription: `Cache hit ratio is below threshold for ${clusterName}`,
      metric: cacheHitRatioMetric,
      threshold: 80, // Alert if hit ratio drops below 80%
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    cacheHitRatioAlarm.addAlarmAction(new SnsAction(this.alertTopic));

    // Cache Miss Ratio Monitoring
    const cacheMissRatioMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'CacheMissRate',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const cacheMissRatioAlarm = new cloudwatch.Alarm(this, 'CacheMissRatioAlarm', {
      alarmName: `${clusterName}-miss-ratio-high`,
      alarmDescription: `Cache miss ratio is above threshold for ${clusterName}`,
      metric: cacheMissRatioMetric,
      threshold: 20, // Alert if miss ratio exceeds 20%
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    cacheMissRatioAlarm.addAlarmAction(new SnsAction(this.alertTopic));

    // Add cache performance widgets to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Cache Hit/Miss Rates',
        left: [cacheHitRatioMetric],
        right: [cacheMissRatioMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Hit Rate (%)',
          min: 0,
          max: 100,
        },
        rightYAxis: {
          label: 'Miss Rate (%)',
          min: 0,
          max: 100,
        },
      })
    );
  }

  private setupCacheMemoryMonitoring(cacheCluster: elasticache.CfnCacheCluster) {
    const clusterName = cacheCluster.clusterName || 'hallucifix-cache';

    // Memory Usage Monitoring
    const memoryUsageMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'DatabaseMemoryUsagePercentage',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const memoryUsageAlarm = new cloudwatch.Alarm(this, 'CacheMemoryUsageAlarm', {
      alarmName: `${clusterName}-memory-usage-high`,
      alarmDescription: `Memory usage is high for ${clusterName}`,
      metric: memoryUsageMetric,
      threshold: 80, // Alert if memory usage exceeds 80%
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    memoryUsageAlarm.addAlarmAction(new SnsAction(this.alertTopic));

    // Freeable Memory Monitoring
    const freeableMemoryMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'FreeableMemory',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const freeableMemoryAlarm = new cloudwatch.Alarm(this, 'CacheFreeableMemoryAlarm', {
      alarmName: `${clusterName}-freeable-memory-low`,
      alarmDescription: `Freeable memory is low for ${clusterName}`,
      metric: freeableMemoryMetric,
      threshold: 50 * 1024 * 1024, // Alert if freeable memory is below 50MB
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    freeableMemoryAlarm.addAlarmAction(new SnsAction(this.alertTopic));

    // Add memory monitoring widgets to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Memory Usage',
        left: [memoryUsageMetric],
        right: [freeableMemoryMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Usage (%)',
          min: 0,
          max: 100,
        },
        rightYAxis: {
          label: 'Freeable Memory (Bytes)',
          min: 0,
        },
      })
    );
  }

  private setupCacheConnectionMonitoring(cacheCluster: elasticache.CfnCacheCluster) {
    const clusterName = cacheCluster.clusterName || 'hallucifix-cache';

    // Current Connections Monitoring
    const currentConnectionsMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'CurrConnections',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const currentConnectionsAlarm = new cloudwatch.Alarm(this, 'CacheConnectionsAlarm', {
      alarmName: `${clusterName}-connections-high`,
      alarmDescription: `Current connections are high for ${clusterName}`,
      metric: currentConnectionsMetric,
      threshold: 50, // Alert if connections exceed 50 (adjust based on your needs)
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    currentConnectionsAlarm.addAlarmAction(new SnsAction(this.alertTopic));

    // New Connections Monitoring
    const newConnectionsMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'NewConnections',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    const newConnectionsAlarm = new cloudwatch.Alarm(this, 'CacheNewConnectionsAlarm', {
      alarmName: `${clusterName}-new-connections-high`,
      alarmDescription: `New connections rate is high for ${clusterName}`,
      metric: newConnectionsMetric,
      threshold: 100, // Alert if new connections exceed 100 per 5 minutes
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    newConnectionsAlarm.addAlarmAction(new SnsAction(this.alertTopic));

    // Add connection monitoring widgets to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Connection Metrics',
        left: [currentConnectionsMetric],
        right: [newConnectionsMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Current Connections',
          min: 0,
        },
        rightYAxis: {
          label: 'New Connections (5min)',
          min: 0,
        },
      })
    );
  }

  private setupCacheLatencyMonitoring(cacheCluster: elasticache.CfnCacheCluster) {
    const clusterName = cacheCluster.clusterName || 'hallucifix-cache';

    // Redis Command Latency Monitoring
    const getLatencyMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'GetTypeCmdsLatency',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const getLatencyAlarm = new cloudwatch.Alarm(this, 'CacheGetLatencyAlarm', {
      alarmName: `${clusterName}-get-latency-high`,
      alarmDescription: `GET command latency is high for ${clusterName}`,
      metric: getLatencyMetric,
      threshold: 1, // Alert if average GET latency exceeds 1ms
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    getLatencyAlarm.addAlarmAction(new SnsAction(this.alertTopic));

    const setLatencyMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'SetTypeCmdsLatency',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const setLatencyAlarm = new cloudwatch.Alarm(this, 'CacheSetLatencyAlarm', {
      alarmName: `${clusterName}-set-latency-high`,
      alarmDescription: `SET command latency is high for ${clusterName}`,
      metric: setLatencyMetric,
      threshold: 1, // Alert if average SET latency exceeds 1ms
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    setLatencyAlarm.addAlarmAction(new SnsAction(this.alertTopic));

    // Add latency monitoring widgets to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Command Latency',
        left: [getLatencyMetric, setLatencyMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Latency (ms)',
          min: 0,
        },
      })
    );
  }

  private setupCacheEvictionMonitoring(cacheCluster: elasticache.CfnCacheCluster) {
    const clusterName = cacheCluster.clusterName || 'hallucifix-cache';

    // Evictions Monitoring
    const evictionsMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'Evictions',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    const evictionsAlarm = new cloudwatch.Alarm(this, 'CacheEvictionsAlarm', {
      alarmName: `${clusterName}-evictions-high`,
      alarmDescription: `Cache evictions are high for ${clusterName}`,
      metric: evictionsMetric,
      threshold: 10, // Alert if more than 10 evictions in 5 minutes
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    evictionsAlarm.addAlarmAction(new SnsAction(this.alertTopic));

    // Reclaimed Memory Monitoring
    const reclaimedMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'Reclaimed',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    // Add eviction monitoring widgets to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Cache Evictions & Reclaimed Items',
        left: [evictionsMetric],
        right: [reclaimedMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Evictions (5min)',
          min: 0,
        },
        rightYAxis: {
          label: 'Reclaimed Items (5min)',
          min: 0,
        },
      })
    );
  }

  private createCacheHealthAlarms(cacheCluster: elasticache.CfnCacheCluster) {
    const clusterName = cacheCluster.clusterName || 'hallucifix-cache';

    // CPU Utilization Monitoring
    const cpuUtilizationMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'CPUUtilization',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const cpuUtilizationAlarm = new cloudwatch.Alarm(this, 'CacheCPUUtilizationAlarm', {
      alarmName: `${clusterName}-cpu-utilization-high`,
      alarmDescription: `CPU utilization is high for ${clusterName}`,
      metric: cpuUtilizationMetric,
      threshold: 75, // Alert if CPU utilization exceeds 75%
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    cpuUtilizationAlarm.addAlarmAction(new SnsAction(this.alertTopic));

    // Network Bytes In/Out Monitoring
    const networkBytesInMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'NetworkBytesIn',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    const networkBytesOutMetric = new cloudwatch.Metric({
      namespace: 'AWS/ElastiCache',
      metricName: 'NetworkBytesOut',
      dimensionsMap: {
        CacheClusterId: clusterName,
      },
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    // Add system health widgets to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'System Health - CPU & Network',
        left: [cpuUtilizationMetric],
        right: [networkBytesInMetric, networkBytesOutMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'CPU Utilization (%)',
          min: 0,
          max: 100,
        },
        rightYAxis: {
          label: 'Network Bytes (5min)',
          min: 0,
        },
      })
    );

    // Create a summary widget for overall cache health
    this.dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Cache Hit Rate',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/ElastiCache',
            metricName: 'CacheHitRate',
            dimensionsMap: {
              CacheClusterId: clusterName,
            },
            period: cdk.Duration.minutes(15),
            statistic: 'Average',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Current Connections',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/ElastiCache',
            metricName: 'CurrConnections',
            dimensionsMap: {
              CacheClusterId: clusterName,
            },
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Memory Usage %',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/ElastiCache',
            metricName: 'DatabaseMemoryUsagePercentage',
            dimensionsMap: {
              CacheClusterId: clusterName,
            },
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'CPU Utilization %',
        metrics: [cpuUtilizationMetric],
        width: 6,
        height: 6,
      })
    );
  }
}