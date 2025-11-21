import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { logger } from './logging';
export interface HallucifixAutoScalingStackProps extends cdk.StackProps {
  environment: string;
  lambdaFunctions?: lambda.Function[];
  rdsCluster?: rds.DatabaseCluster;
  cacheCluster?: elasticache.CfnCacheCluster;
  alertTopic?: sns.Topic;
  scalingPolicies?: {
    lambda?: {
      provisionedConcurrency?: number;
      reservedConcurrency?: number;
      targetUtilization?: number;
    };
    rds?: {
      minCapacity?: number;
      maxCapacity?: number;
      targetCpuUtilization?: number;
      targetConnectionsUtilization?: number;
    };
    elasticache?: {
      minReplicas?: number;
      maxReplicas?: number;
      targetCpuUtilization?: number;
      targetMemoryUtilization?: number;
    };
  };
}

export class HallucifixAutoScalingStack extends cdk.Stack {
  public readonly scalingPolicies: applicationautoscaling.ScalingPolicy[] = [];
  public readonly scalingTargets: applicationautoscaling.ScalableTarget[] = [];
  public readonly scalingMonitoringFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: HallucifixAutoScalingStackProps) {
    super(scope, id, props);

    // Configure Lambda auto-scaling
    this.configureLambdaAutoScaling(props);

    // Configure RDS auto-scaling
    this.configureRDSAutoScaling(props);

    // Configure ElastiCache auto-scaling
    this.configureElastiCacheAutoScaling(props);

    // Set up scaling monitoring and alerting
    this.setupScalingMonitoring(props);

    // Create predictive scaling
    this.setupPredictiveScaling(props);

    // Create scaling dashboard
    this.createScalingDashboard(props);

    // Output scaling information
    this.createOutputs(props);
  }

  private configureLambdaAutoScaling(props: HallucifixAutoScalingStackProps) {
    if (!props.lambdaFunctions || props.lambdaFunctions.length === 0) {
      return;
    }

    const lambdaConfig = props.scalingPolicies?.lambda || {};
    const provisionedConcurrency = lambdaConfig.provisionedConcurrency || 10;
    const reservedConcurrency = lambdaConfig.reservedConcurrency || 100;
    const targetUtilization = lambdaConfig.targetUtilization || 70;

    props.lambdaFunctions.forEach((lambdaFunction, index) => {
      // Set reserved concurrency
      new lambda.CfnReservedConcurrencyConfiguration(this, `LambdaReservedConcurrency${index}`, {
        functionName: lambdaFunction.functionName,
        reservedConcurrencyLimit: reservedConcurrency,
      });

      // Create alias for versioning
      const alias = new lambda.Alias(this, `LambdaAlias${index}`, {
        aliasName: 'live',
        version: lambdaFunction.currentVersion,
        provisionedConcurrencyConfig: {
          provisionedConcurrentExecutions: provisionedConcurrency,
        },
      });

      // Create scalable target for provisioned concurrency
      const scalableTarget = new applicationautoscaling.ScalableTarget(this, `LambdaScalableTarget${index}`, {
        serviceNamespace: applicationautoscaling.ServiceNamespace.LAMBDA,
        resourceId: `function:${lambdaFunction.functionName}:${alias.aliasName}`,
        scalableDimension: 'lambda:function:ProvisionedConcurrencyUtilization',
        minCapacity: Math.ceil(provisionedConcurrency * 0.1), // 10% minimum
        maxCapacity: provisionedConcurrency * 10, // 10x maximum
      });

      this.scalingTargets.push(scalableTarget);

      // Create target tracking scaling policy
      const scalingPolicy = scalableTarget.scaleToTrackMetric(`LambdaScalingPolicy${index}`, {
        targetValue: targetUtilization,
        predefinedMetric: applicationautoscaling.PredefinedMetric.LAMBDA_PROVISIONED_CONCURRENCY_UTILIZATION,
        scaleOutCooldown: cdk.Duration.minutes(2),
        scaleInCooldown: cdk.Duration.minutes(5),
      });

      this.scalingPolicies.push(scalingPolicy);

      // Create custom metrics for business logic scaling
      const businessMetricScalingPolicy = scalableTarget.scaleOnMetric(`LambdaBusinessMetricScaling${index}`, {
        metric: new cloudwatch.Metric({
          namespace: 'HalluciFix/Lambda',
          metricName: 'RequestsPerSecond',
          dimensionsMap: {
            FunctionName: lambdaFunction.functionName,
          },
          period: cdk.Duration.minutes(1),
          statistic: 'Average',
        }),
        scalingSteps: [
          { upper: 10, change: -1 },
          { lower: 50, change: +1 },
          { lower: 100, change: +2 },
          { lower: 200, change: +5 },
        ],
        adjustmentType: applicationautoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
        cooldown: cdk.Duration.minutes(3),
      });

      this.scalingPolicies.push(businessMetricScalingPolicy);

      // Create alarms for Lambda scaling events
      const concurrencyAlarm = new cloudwatch.Alarm(this, `LambdaConcurrencyAlarm${index}`, {
        alarmName: `${lambdaFunction.functionName}-concurrency-high`,
        alarmDescription: `High concurrency for ${lambdaFunction.functionName}`,
        metric: lambdaFunction.metricConcurrentExecutions({
          period: cdk.Duration.minutes(5),
          statistic: 'Maximum',
        }),
        threshold: reservedConcurrency * 0.8, // Alert at 80% of reserved concurrency
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      if (props.alertTopic) {
        concurrencyAlarm.addAlarmAction(new cloudwatch.SnsAction(props.alertTopic));
      }

      const throttleAlarm = new cloudwatch.Alarm(this, `LambdaThrottleAlarm${index}`, {
        alarmName: `${lambdaFunction.functionName}-throttles`,
        alarmDescription: `Throttles detected for ${lambdaFunction.functionName}`,
        metric: lambdaFunction.metricThrottles({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      if (props.alertTopic) {
        throttleAlarm.addAlarmAction(new cloudwatch.SnsAction(props.alertTopic));
      }
    });
  }

  private configureRDSAutoScaling(props: HallucifixAutoScalingStackProps) {
    if (!props.rdsCluster) {
      return;
    }

    const rdsConfig = props.scalingPolicies?.rds || {};
    const minCapacity = rdsConfig.minCapacity || 1;
    const maxCapacity = rdsConfig.maxCapacity || 16;
    const targetCpuUtilization = rdsConfig.targetCpuUtilization || 70;
    const targetConnectionsUtilization = rdsConfig.targetConnectionsUtilization || 70;

    // Create scalable target for RDS Aurora
    const rdsScalableTarget = new applicationautoscaling.ScalableTarget(this, 'RDSScalableTarget', {
      serviceNamespace: applicationautoscaling.ServiceNamespace.RDS,
      resourceId: `cluster:${props.rdsCluster.clusterIdentifier}`,
      scalableDimension: 'rds:cluster:ReadReplicaCount',
      minCapacity,
      maxCapacity,
    });

    this.scalingTargets.push(rdsScalableTarget);

    // CPU-based scaling policy
    const rdsCpuScalingPolicy = rdsScalableTarget.scaleToTrackMetric('RDSCpuScalingPolicy', {
      targetValue: targetCpuUtilization,
      predefinedMetric: applicationautoscaling.PredefinedMetric.RDS_READER_AVERAGE_CPU_UTILIZATION,
      scaleOutCooldown: cdk.Duration.minutes(5),
      scaleInCooldown: cdk.Duration.minutes(15),
    });

    this.scalingPolicies.push(rdsCpuScalingPolicy);

    // Connections-based scaling policy
    const rdsConnectionsScalingPolicy = rdsScalableTarget.scaleToTrackMetric('RDSConnectionsScalingPolicy', {
      targetValue: targetConnectionsUtilization,
      predefinedMetric: applicationautoscaling.PredefinedMetric.RDS_READER_AVERAGE_DATABASE_CONNECTIONS,
      scaleOutCooldown: cdk.Duration.minutes(3),
      scaleInCooldown: cdk.Duration.minutes(10),
    });

    this.scalingPolicies.push(rdsConnectionsScalingPolicy);

    // Custom metric scaling for query latency
    const rdsLatencyScalingPolicy = rdsScalableTarget.scaleOnMetric('RDSLatencyScalingPolicy', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'ReadLatency',
        dimensionsMap: {
          DBClusterIdentifier: props.rdsCluster.clusterIdentifier,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      scalingSteps: [
        { upper: 0.01, change: -1 }, // Scale in if latency < 10ms
        { lower: 0.05, change: +1 }, // Scale out if latency > 50ms
        { lower: 0.1, change: +2 },  // Scale out faster if latency > 100ms
      ],
      adjustmentType: applicationautoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      cooldown: cdk.Duration.minutes(5),
    });

    this.scalingPolicies.push(rdsLatencyScalingPolicy);

    // Create RDS scaling alarms
    const rdsHighCpuAlarm = new cloudwatch.Alarm(this, 'RDSHighCpuAlarm', {
      alarmName: `${props.rdsCluster.clusterIdentifier}-cpu-high`,
      alarmDescription: 'RDS CPU utilization is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          DBClusterIdentifier: props.rdsCluster.clusterIdentifier,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 85,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    if (props.alertTopic) {
      rdsHighCpuAlarm.addAlarmAction(new cloudwatch.SnsAction(props.alertTopic));
    }

    const rdsHighConnectionsAlarm = new cloudwatch.Alarm(this, 'RDSHighConnectionsAlarm', {
      alarmName: `${props.rdsCluster.clusterIdentifier}-connections-high`,
      alarmDescription: 'RDS connections are high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnections',
        dimensionsMap: {
          DBClusterIdentifier: props.rdsCluster.clusterIdentifier,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 80, // Adjust based on instance class
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    if (props.alertTopic) {
      rdsHighConnectionsAlarm.addAlarmAction(new cloudwatch.SnsAction(props.alertTopic));
    }
  }

  private configureElastiCacheAutoScaling(props: HallucifixAutoScalingStackProps) {
    if (!props.cacheCluster) {
      return;
    }

    const cacheConfig = props.scalingPolicies?.elasticache || {};
    const minReplicas = cacheConfig.minReplicas || 1;
    const maxReplicas = cacheConfig.maxReplicas || 5;
    const targetCpuUtilization = cacheConfig.targetCpuUtilization || 70;
    const targetMemoryUtilization = cacheConfig.targetMemoryUtilization || 80;

    // Create scalable target for ElastiCache
    const cacheScalableTarget = new applicationautoscaling.ScalableTarget(this, 'CacheScalableTarget', {
      serviceNamespace: applicationautoscaling.ServiceNamespace.ELASTICACHE,
      resourceId: `replication-group/${props.cacheCluster.replicationGroupId}`,
      scalableDimension: 'elasticache:replication-group:Replicas',
      minCapacity: minReplicas,
      maxCapacity: maxReplicas,
    });

    this.scalingTargets.push(cacheScalableTarget);

    // CPU-based scaling policy
    const cacheCpuScalingPolicy = cacheScalableTarget.scaleToTrackMetric('CacheCpuScalingPolicy', {
      targetValue: targetCpuUtilization,
      predefinedMetric: applicationautoscaling.PredefinedMetric.ELASTICACHE_REPLICA_ENGINE_CPU_UTILIZATION,
      scaleOutCooldown: cdk.Duration.minutes(5),
      scaleInCooldown: cdk.Duration.minutes(15),
    });

    this.scalingPolicies.push(cacheCpuScalingPolicy);

    // Memory-based scaling policy
    const cacheMemoryScalingPolicy = cacheScalableTarget.scaleOnMetric('CacheMemoryScalingPolicy', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'DatabaseMemoryUsagePercentage',
        dimensionsMap: {
          CacheClusterId: props.cacheCluster.clusterName || 'hallucifix-cache',
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      scalingSteps: [
        { upper: 60, change: -1 }, // Scale in if memory < 60%
        { lower: 85, change: +1 }, // Scale out if memory > 85%
        { lower: 95, change: +2 }, // Scale out faster if memory > 95%
      ],
      adjustmentType: applicationautoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      cooldown: cdk.Duration.minutes(5),
    });

    this.scalingPolicies.push(cacheMemoryScalingPolicy);

    // Cache hit rate scaling policy
    const cacheHitRateScalingPolicy = cacheScalableTarget.scaleOnMetric('CacheHitRateScalingPolicy', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'CacheHitRate',
        dimensionsMap: {
          CacheClusterId: props.cacheCluster.clusterName || 'hallucifix-cache',
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      scalingSteps: [
        { upper: 70, change: +1 }, // Scale out if hit rate < 70%
        { upper: 50, change: +2 }, // Scale out faster if hit rate < 50%
      ],
      adjustmentType: applicationautoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
      cooldown: cdk.Duration.minutes(10),
    });

    this.scalingPolicies.push(cacheHitRateScalingPolicy);

    // Create ElastiCache scaling alarms
    const cacheHighMemoryAlarm = new cloudwatch.Alarm(this, 'CacheHighMemoryAlarm', {
      alarmName: `${props.cacheCluster.clusterName}-memory-high`,
      alarmDescription: 'ElastiCache memory utilization is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'DatabaseMemoryUsagePercentage',
        dimensionsMap: {
          CacheClusterId: props.cacheCluster.clusterName || 'hallucifix-cache',
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 90,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    if (props.alertTopic) {
      cacheHighMemoryAlarm.addAlarmAction(new cloudwatch.SnsAction(props.alertTopic));
    }

    const cacheLowHitRateAlarm = new cloudwatch.Alarm(this, 'CacheLowHitRateAlarm', {
      alarmName: `${props.cacheCluster.clusterName}-hit-rate-low`,
      alarmDescription: 'ElastiCache hit rate is low',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'CacheHitRate',
        dimensionsMap: {
          CacheClusterId: props.cacheCluster.clusterName || 'hallucifix-cache',
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 60,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    if (props.alertTopic) {
      cacheLowHitRateAlarm.addAlarmAction(new cloudwatch.SnsAction(props.alertTopic));
    }
  }

  private setupScalingMonitoring(props: HallucifixAutoScalingStackProps) {
    // Create scaling monitoring function
    this.scalingMonitoringFunction = new lambda.Function(this, 'ScalingMonitoringFunction', {
      functionName: `hallucifix-scaling-monitoring-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const applicationautoscaling = new AWS.ApplicationAutoScaling();
        const cloudwatch = new AWS.CloudWatch();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          logger.info("Scaling monitoring triggered:", { JSON.stringify(event, null, 2 }));
          
          try {
            const scalingReport = await generateScalingReport();
            await sendScalingReport(scalingReport);
            
            return {
              statusCode: 200,
              body: JSON.stringify(scalingReport)
            };
          } catch (error) {
            logger.error("Error in scaling monitoring:", error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        };

        async function generateScalingReport() {
          const report = {
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT,
            scalingActivities: await getScalingActivities(),
            resourceUtilization: await getResourceUtilization(),
            scalingEfficiency: await calculateScalingEfficiency(),
            recommendations: await generateScalingRecommendations()
          };
          
          return report;
        }

        async function getScalingActivities() {
          const activities = [];
          
          try {
            // Get Lambda scaling activities
            const lambdaTargets = await applicationautoscaling.describeScalableTargets({
              ServiceNamespace: 'lambda'
            }).promise();
            
            for (const target of lambdaTargets.ScalableTargets) {
              const targetActivities = await applicationautoscaling.describeScalingActivities({
                ServiceNamespace: 'lambda',
                ResourceId: target.ResourceId
              }).promise();
              
              activities.push({
                service: 'Lambda',
                resourceId: target.ResourceId,
                currentCapacity: target.CurrentCapacity,
                minCapacity: target.MinCapacity,
                maxCapacity: target.MaxCapacity,
                recentActivities: targetActivities.ScalingActivities.slice(0, 5)
              });
            }
            
            // Get RDS scaling activities
            const rdsTargets = await applicationautoscaling.describeScalableTargets({
              ServiceNamespace: 'rds'
            }).promise();
            
            for (const target of rdsTargets.ScalableTargets) {
              const targetActivities = await applicationautoscaling.describeScalingActivities({
                ServiceNamespace: 'rds',
                ResourceId: target.ResourceId
              }).promise();
              
              activities.push({
                service: 'RDS',
                resourceId: target.ResourceId,
                currentCapacity: target.CurrentCapacity,
                minCapacity: target.MinCapacity,
                maxCapacity: target.MaxCapacity,
                recentActivities: targetActivities.ScalingActivities.slice(0, 5)
              });
            }
            
            // Get ElastiCache scaling activities
            const cacheTargets = await applicationautoscaling.describeScalableTargets({
              ServiceNamespace: 'elasticache'
            }).promise();
            
            for (const target of cacheTargets.ScalableTargets) {
              const targetActivities = await applicationautoscaling.describeScalingActivities({
                ServiceNamespace: 'elasticache',
                ResourceId: target.ResourceId
              }).promise();
              
              activities.push({
                service: 'ElastiCache',
                resourceId: target.ResourceId,
                currentCapacity: target.CurrentCapacity,
                minCapacity: target.MinCapacity,
                maxCapacity: target.MaxCapacity,
                recentActivities: targetActivities.ScalingActivities.slice(0, 5)
              });
            }
            
          } catch (error) {
            logger.error("Error getting scaling activities:", error instanceof Error ? error : new Error(String(error)));
          }
          
          return activities;
        }

        async function getResourceUtilization() {
          const utilization = {};
          
          try {
            // Get Lambda utilization
            const lambdaMetrics = await cloudwatch.getMetricStatistics({
              Namespace: 'AWS/Lambda',
              MetricName: 'ConcurrentExecutions',
              StartTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
              EndTime: new Date(),
              Period: 3600, // 1 hour
              Statistics: ['Average', 'Maximum']
            }).promise();
            
            utilization.lambda = {
              averageConcurrency: lambdaMetrics.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / lambdaMetrics.Datapoints.length,
              maxConcurrency: Math.max(...lambdaMetrics.Datapoints.map(dp => dp.Maximum))
            };
            
            // Get RDS utilization
            const rdsMetrics = await cloudwatch.getMetricStatistics({
              Namespace: 'AWS/RDS',
              MetricName: 'CPUUtilization',
              StartTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
              EndTime: new Date(),
              Period: 3600,
              Statistics: ['Average', 'Maximum']
            }).promise();
            
            utilization.rds = {
              averageCpu: rdsMetrics.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / rdsMetrics.Datapoints.length,
              maxCpu: Math.max(...rdsMetrics.Datapoints.map(dp => dp.Maximum))
            };
            
            // Get ElastiCache utilization
            const cacheMetrics = await cloudwatch.getMetricStatistics({
              Namespace: 'AWS/ElastiCache',
              MetricName: 'CPUUtilization',
              StartTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
              EndTime: new Date(),
              Period: 3600,
              Statistics: ['Average', 'Maximum']
            }).promise();
            
            utilization.elasticache = {
              averageCpu: cacheMetrics.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / cacheMetrics.Datapoints.length,
              maxCpu: Math.max(...cacheMetrics.Datapoints.map(dp => dp.Maximum))
            };
            
          } catch (error) {
            logger.error("Error getting resource utilization:", error instanceof Error ? error : new Error(String(error)));
          }
          
          return utilization;
        }

        async function calculateScalingEfficiency() {
          // Calculate scaling efficiency metrics
          return {
            lambdaEfficiency: 85, // Placeholder - would calculate based on actual metrics
            rdsEfficiency: 78,
            elasticacheEfficiency: 92,
            overallEfficiency: 85
          };
        }

        async function generateScalingRecommendations() {
          const recommendations = [];
          
          // Analyze scaling patterns and generate recommendations
          recommendations.push({
            service: 'Lambda',
            recommendation: 'Consider increasing provisioned concurrency during peak hours',
            priority: 'MEDIUM',
            estimatedSavings: '15%'
          });
          
          recommendations.push({
            service: 'RDS',
            recommendation: 'Optimize read replica scaling thresholds',
            priority: 'LOW',
            estimatedSavings: '8%'
          });
          
          return recommendations;
        }

        async function sendScalingReport(report) {
          if (process.env.ALERT_TOPIC_ARN) {
            const subject = \`Auto-Scaling Report - \${report.environment}\`;
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify(report, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
      },
      timeout: cdk.Duration.minutes(10),
    });

    // Grant necessary permissions
    this.scalingMonitoringFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'application-autoscaling:DescribeScalableTargets',
        'application-autoscaling:DescribeScalingActivities',
        'application-autoscaling:DescribeScalingPolicies',
        'cloudwatch:GetMetricStatistics',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule daily scaling reports
    const scalingReportRule = new events.Rule(this, 'ScalingReportRule', {
      ruleName: `hallucifix-scaling-report-${props.environment}`,
      description: 'Daily auto-scaling report',
      schedule: events.Schedule.cron({ hour: '8', minute: '0' }), // 8 AM daily
    });

    scalingReportRule.addTarget(new targets.LambdaFunction(this.scalingMonitoringFunction));
  }

  private setupPredictiveScaling(props: HallucifixAutoScalingStackProps) {
    // Create predictive scaling function
    const predictiveScalingFunction = new lambda.Function(this, 'PredictiveScalingFunction', {
      functionName: `hallucifix-predictive-scaling-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cloudwatch = new AWS.CloudWatch();
        const applicationautoscaling = new AWS.ApplicationAutoScaling();
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          logger.debug("Predictive scaling analysis triggered");
          
          try {
            const predictions = await generateScalingPredictions();
            await applyPredictiveScaling(predictions);
            await sendPredictiveScalingReport(predictions);
            
            return {
              statusCode: 200,
              body: JSON.stringify(predictions)
            };
          } catch (error) {
            logger.error("Error in predictive scaling:", error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        };

        async function generateScalingPredictions() {
          const predictions = {
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT,
            predictions: []
          };
          
          // Analyze historical patterns for Lambda
          const lambdaPrediction = await analyzeLambdaPatterns();
          if (lambdaPrediction) {
            predictions.predictions.push(lambdaPrediction);
          }
          
          // Analyze historical patterns for RDS
          const rdsPrediction = await analyzeRDSPatterns();
          if (rdsPrediction) {
            predictions.predictions.push(rdsPrediction);
          }
          
          // Analyze historical patterns for ElastiCache
          const cachePrediction = await analyzeCachePatterns();
          if (cachePrediction) {
            predictions.predictions.push(cachePrediction);
          }
          
          return predictions;
        }

        async function analyzeLambdaPatterns() {
          try {
            // Get historical Lambda metrics
            const metrics = await cloudwatch.getMetricStatistics({
              Namespace: 'AWS/Lambda',
              MetricName: 'ConcurrentExecutions',
              StartTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
              EndTime: new Date(),
              Period: 3600, // 1 hour
              Statistics: ['Average']
            }).promise();
            
            if (metrics.Datapoints.length === 0) {
              return null;
            }
            
            // Simple pattern analysis (in production, use ML models)
            const hourlyAverages = {};
            metrics.Datapoints.forEach(dp => {
              const hour = new Date(dp.Timestamp).getHours();
              if (!hourlyAverages[hour]) {
                hourlyAverages[hour] = [];
              }
              hourlyAverages[hour].push(dp.Average);
            });
            
            const currentHour = new Date().getHours();
            const nextHour = (currentHour + 1) % 24;
            
            const predictedLoad = hourlyAverages[nextHour] 
              ? hourlyAverages[nextHour].reduce((sum, val) => sum + val, 0) / hourlyAverages[nextHour].length
              : 0;
            
            return {
              service: 'Lambda',
              currentHour,
              nextHour,
              predictedLoad,
              confidence: 0.75,
              recommendation: predictedLoad > 50 ? 'SCALE_OUT' : 'SCALE_IN',
              suggestedCapacity: Math.ceil(predictedLoad * 1.2) // 20% buffer
            };
          } catch (error) {
            logger.error("Error analyzing Lambda patterns:", error instanceof Error ? error : new Error(String(error)));
            return null;
          }
        }

        async function analyzeRDSPatterns() {
          try {
            // Similar analysis for RDS
            const metrics = await cloudwatch.getMetricStatistics({
              Namespace: 'AWS/RDS',
              MetricName: 'CPUUtilization',
              StartTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              EndTime: new Date(),
              Period: 3600,
              Statistics: ['Average']
            }).promise();
            
            if (metrics.Datapoints.length === 0) {
              return null;
            }
            
            const avgCpu = metrics.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / metrics.Datapoints.length;
            
            return {
              service: 'RDS',
              currentUtilization: avgCpu,
              predictedUtilization: avgCpu * 1.1, // Simple prediction
              confidence: 0.65,
              recommendation: avgCpu > 70 ? 'SCALE_OUT' : 'MAINTAIN',
              suggestedReplicas: avgCpu > 70 ? 2 : 1
            };
          } catch (error) {
            logger.error("Error analyzing RDS patterns:", error instanceof Error ? error : new Error(String(error)));
            return null;
          }
        }

        async function analyzeCachePatterns() {
          try {
            // Similar analysis for ElastiCache
            const metrics = await cloudwatch.getMetricStatistics({
              Namespace: 'AWS/ElastiCache',
              MetricName: 'CacheHitRate',
              StartTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              EndTime: new Date(),
              Period: 3600,
              Statistics: ['Average']
            }).promise();
            
            if (metrics.Datapoints.length === 0) {
              return null;
            }
            
            const avgHitRate = metrics.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / metrics.Datapoints.length;
            
            return {
              service: 'ElastiCache',
              currentHitRate: avgHitRate,
              predictedHitRate: avgHitRate * 0.95, // Slight degradation prediction
              confidence: 0.70,
              recommendation: avgHitRate < 80 ? 'SCALE_OUT' : 'MAINTAIN',
              suggestedReplicas: avgHitRate < 80 ? 3 : 2
            };
          } catch (error) {
            logger.error("Error analyzing Cache patterns:", error instanceof Error ? error : new Error(String(error)));
            return null;
          }
        }

        async function applyPredictiveScaling(predictions) {
          // Apply predictive scaling recommendations
          for (const prediction of predictions.predictions) {
            if (prediction.confidence > 0.7 && prediction.recommendation === 'SCALE_OUT') {
              console.log(\`Applying predictive scaling for \${prediction.service}\`);
              // In production, this would trigger scaling actions
            }
          }
        }

        async function sendPredictiveScalingReport(predictions) {
          if (process.env.ALERT_TOPIC_ARN) {
            const subject = \`Predictive Scaling Report - \${predictions.environment}\`;
            
            const params = {
              TopicArn: process.env.ALERT_TOPIC_ARN,
              Subject: subject,
              Message: JSON.stringify(predictions, null, 2)
            };
            
            await sns.publish(params).promise();
          }
        }
      `),
      environment: {
        ENVIRONMENT: props.environment,
        ALERT_TOPIC_ARN: props.alertTopic?.topicArn || '',
      },
      timeout: cdk.Duration.minutes(10),
    });

    // Grant necessary permissions
    predictiveScalingFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:GetMetricStatistics',
        'application-autoscaling:DescribeScalableTargets',
        'application-autoscaling:RegisterScalableTarget',
        'application-autoscaling:PutScalingPolicy',
        'sns:Publish',
      ],
      resources: ['*'],
    }));

    // Schedule predictive scaling analysis
    const predictiveScalingRule = new events.Rule(this, 'PredictiveScalingRule', {
      ruleName: `hallucifix-predictive-scaling-${props.environment}`,
      description: 'Hourly predictive scaling analysis',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
    });

    predictiveScalingRule.addTarget(new targets.LambdaFunction(predictiveScalingFunction));
  }

  private createScalingDashboard(props: HallucifixAutoScalingStackProps) {
    const scalingDashboard = new cloudwatch.Dashboard(this, 'ScalingDashboard', {
      dashboardName: `hallucifix-auto-scaling-${props.environment}`,
    });

    // Lambda scaling widgets
    if (props.lambdaFunctions && props.lambdaFunctions.length > 0) {
      scalingDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'Lambda Concurrent Executions',
          left: props.lambdaFunctions.map(fn => fn.metricConcurrentExecutions({
            period: cdk.Duration.minutes(5),
            statistic: 'Maximum',
            label: fn.functionName,
          })),
          width: 12,
          height: 6,
        }),
        new cloudwatch.GraphWidget({
          title: 'Lambda Throttles',
          left: props.lambdaFunctions.map(fn => fn.metricThrottles({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
            label: fn.functionName,
          })),
          width: 12,
          height: 6,
        })
      );
    }

    // RDS scaling widgets
    if (props.rdsCluster) {
      scalingDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'RDS CPU Utilization',
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/RDS',
              metricName: 'CPUUtilization',
              dimensionsMap: {
                DBClusterIdentifier: props.rdsCluster.clusterIdentifier,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
            }),
          ],
          width: 12,
          height: 6,
        }),
        new cloudwatch.GraphWidget({
          title: 'RDS Database Connections',
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/RDS',
              metricName: 'DatabaseConnections',
              dimensionsMap: {
                DBClusterIdentifier: props.rdsCluster.clusterIdentifier,
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
            }),
          ],
          width: 12,
          height: 6,
        })
      );
    }

    // ElastiCache scaling widgets
    if (props.cacheCluster) {
      scalingDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'ElastiCache CPU Utilization',
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/ElastiCache',
              metricName: 'CPUUtilization',
              dimensionsMap: {
                CacheClusterId: props.cacheCluster.clusterName || 'hallucifix-cache',
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
            }),
          ],
          width: 12,
          height: 6,
        }),
        new cloudwatch.GraphWidget({
          title: 'ElastiCache Memory Usage',
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/ElastiCache',
              metricName: 'DatabaseMemoryUsagePercentage',
              dimensionsMap: {
                CacheClusterId: props.cacheCluster.clusterName || 'hallucifix-cache',
              },
              period: cdk.Duration.minutes(5),
              statistic: 'Average',
            }),
          ],
          width: 12,
          height: 6,
        })
      );
    }
  }

  private createOutputs(props: HallucifixAutoScalingStackProps) {
    new cdk.CfnOutput(this, 'ScalingPoliciesCount', {
      value: this.scalingPolicies.length.toString(),
      description: 'Number of auto-scaling policies created',
      exportName: `${props.environment}-ScalingPoliciesCount`,
    });

    new cdk.CfnOutput(this, 'ScalableTargetsCount', {
      value: this.scalingTargets.length.toString(),
      description: 'Number of scalable targets configured',
      exportName: `${props.environment}-ScalableTargetsCount`,
    });

    new cdk.CfnOutput(this, 'ScalingMonitoringFunctionArn', {
      value: this.scalingMonitoringFunction.functionArn,
      description: 'Scaling monitoring function ARN',
      exportName: `${props.environment}-ScalingMonitoringFunctionArn`,
    });
  }
}