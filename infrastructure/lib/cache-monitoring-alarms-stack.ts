import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

export interface CacheMonitoringAlarmsStackProps extends cdk.StackProps {
  elastiCacheClusterId: string;
  alertEmail: string;
  environment: string;
}

export class CacheMonitoringAlarmsStack extends cdk.Stack {
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: CacheMonitoringAlarmsStackProps) {
    super(scope, id, props);

    // Create SNS topic for cache alerts
    this.alarmTopic = new sns.Topic(this, 'CacheAlarmTopic', {
      topicName: `hallucifix-cache-alarms-${props.environment}`,
      displayName: 'HalluciFix Cache Performance Alarms',
    });

    // Subscribe email to alarm topic
    this.alarmTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(props.alertEmail)
    );

    // Create CloudWatch dashboard for cache monitoring
    const dashboard = new cloudwatch.Dashboard(this, 'CacheDashboard', {
      dashboardName: `HalluciFix-Cache-Performance-${props.environment}`,
    });

    // Cache Hit Rate Alarm (Critical if < 70%)
    const hitRateAlarm = new cloudwatch.Alarm(this, 'CacheHitRateAlarm', {
      alarmName: `HalluciFix-Cache-LowHitRate-${props.environment}`,
      alarmDescription: 'Cache hit rate is below acceptable threshold',
      metric: new cloudwatch.Metric({
        namespace: 'HalluciFix/Cache',
        metricName: 'CacheHitRate',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 70,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    hitRateAlarm.addAlarmAction(
      new cloudwatch.SnsAction(this.alarmTopic)
    );

    // High Latency Alarm (Critical if > 20ms)
    const latencyAlarm = new cloudwatch.Alarm(this, 'CacheLatencyAlarm', {
      alarmName: `HalluciFix-Cache-HighLatency-${props.environment}`,
      alarmDescription: 'Cache operations are experiencing high latency',
      metric: new cloudwatch.Metric({
        namespace: 'HalluciFix/Cache',
        metricName: 'AverageLatency',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 20,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    latencyAlarm.addAlarmAction(
      new cloudwatch.SnsAction(this.alarmTopic)
    );

    // Connection Errors Alarm
    const connectionErrorsAlarm = new cloudwatch.Alarm(this, 'CacheConnectionErrorsAlarm', {
      alarmName: `HalluciFix-Cache-ConnectionErrors-${props.environment}`,
      alarmDescription: 'Cache is experiencing connection errors',
      metric: new cloudwatch.Metric({
        namespace: 'HalluciFix/Cache',
        metricName: 'ConnectionErrors',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    connectionErrorsAlarm.addAlarmAction(
      new cloudwatch.SnsAction(this.alarmTopic)
    );

    // ElastiCache CPU Utilization Alarm
    const cpuAlarm = new cloudwatch.Alarm(this, 'ElastiCacheCpuAlarm', {
      alarmName: `HalluciFix-ElastiCache-HighCPU-${props.environment}`,
      alarmDescription: 'ElastiCache cluster CPU utilization is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          CacheClusterId: props.elastiCacheClusterId,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    cpuAlarm.addAlarmAction(
      new cloudwatch.SnsAction(this.alarmTopic)
    );

    // ElastiCache Memory Utilization Alarm
    const memoryAlarm = new cloudwatch.Alarm(this, 'ElastiCacheMemoryAlarm', {
      alarmName: `HalluciFix-ElastiCache-HighMemory-${props.environment}`,
      alarmDescription: 'ElastiCache cluster memory utilization is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'DatabaseMemoryUsagePercentage',
        dimensionsMap: {
          CacheClusterId: props.elastiCacheClusterId,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 85,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    memoryAlarm.addAlarmAction(
      new cloudwatch.SnsAction(this.alarmTopic)
    );

    // ElastiCache Evictions Alarm
    const evictionsAlarm = new cloudwatch.Alarm(this, 'ElastiCacheEvictionsAlarm', {
      alarmName: `HalluciFix-ElastiCache-HighEvictions-${props.environment}`,
      alarmDescription: 'ElastiCache cluster is experiencing high eviction rate',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'Evictions',
        dimensionsMap: {
          CacheClusterId: props.elastiCacheClusterId,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 100,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    evictionsAlarm.addAlarmAction(
      new cloudwatch.SnsAction(this.alarmTopic)
    );

    // Add widgets to dashboard
    dashboard.addWidgets(
      // Top row - Key metrics
      new cloudwatch.GraphWidget({
        title: 'Cache Hit Rate',
        left: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Cache',
            metricName: 'CacheHitRate',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Cache Latency',
        left: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Cache',
            metricName: 'AverageLatency',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      // Second row - Operations and errors
      new cloudwatch.GraphWidget({
        title: 'Cache Operations',
        left: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Cache',
            metricName: 'TotalOperations',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Cache',
            metricName: 'CacheHits',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Cache',
            metricName: 'CacheMisses',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Cache Errors',
        left: [
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Cache',
            metricName: 'GetErrors',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Cache',
            metricName: 'SetErrors',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'HalluciFix/Cache',
            metricName: 'ConnectionErrors',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      // Third row - ElastiCache infrastructure metrics
      new cloudwatch.GraphWidget({
        title: 'ElastiCache CPU Utilization',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ElastiCache',
            metricName: 'CPUUtilization',
            dimensionsMap: {
              CacheClusterId: props.elastiCacheClusterId,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ElastiCache Memory Usage',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ElastiCache',
            metricName: 'DatabaseMemoryUsagePercentage',
            dimensionsMap: {
              CacheClusterId: props.elastiCacheClusterId,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'ElastiCache Network',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ElastiCache',
            metricName: 'NetworkBytesIn',
            dimensionsMap: {
              CacheClusterId: props.elastiCacheClusterId,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ElastiCache',
            metricName: 'NetworkBytesOut',
            dimensionsMap: {
              CacheClusterId: props.elastiCacheClusterId,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 8,
        height: 6,
      }),
    );

    // Output important information
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic ARN for cache alarms',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL for cache monitoring',
    });
  }
}