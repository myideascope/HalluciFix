import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface HallucifixComprehensiveMonitoringStackProps extends cdk.StackProps {
  environment: string;
  alertEmail?: string;
  slackWebhookUrl?: string;
  lambdaFunctions?: lambda.Function[];
  rdsInstance?: rds.DatabaseInstance;
  cacheCluster?: elasticache.CfnCacheCluster;
  apiGateway?: apigateway.RestApi;
  s3Buckets?: s3.Bucket[];
  cloudFrontDistribution?: cloudfront.Distribution;
  monthlyBudgetLimit?: number;
}

export class HallucifixComprehensiveMonitoringStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;
  public readonly applicationDashboard: cloudwatch.Dashboard;
  public readonly infrastructureDashboard: cloudwatch.Dashboard;
  public readonly businessDashboard: cloudwatch.Dashboard;
  public readonly costDashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: HallucifixComprehensiveMonitoringStackProps) {
    super(scope, id, props);

    // Create SNS topic for alerts
    this.alertTopic = new sns.Topic(this, 'ComprehensiveAlertTopic', {
      topicName: `hallucifix-comprehensive-alerts-${props.environment}`,
      displayName: `HalluciFix Comprehensive Alerts (${props.environment})`,
    });

    // Add email subscription if provided
    if (props.alertEmail) {
      this.alertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
    }

    // Create dashboards
    this.applicationDashboard = new cloudwatch.Dashboard(this, 'ApplicationDashboard', {
      dashboardName: `hallucifix-application-${props.environment}`,
    });

    this.infrastructureDashboard = new cloudwatch.Dashboard(this, 'InfrastructureDashboard', {
      dashboardName: `hallucifix-infrastructure-${props.environment}`,
    });

    this.businessDashboard = new cloudwatch.Dashboard(this, 'BusinessDashboard', {
      dashboardName: `hallucifix-business-metrics-${props.environment}`,
    });

    this.costDashboard = new cloudwatch.Dashboard(this, 'CostDashboard', {
      dashboardName: `hallucifix-cost-monitoring-${props.environment}`,
    });

    // Set up application performance monitoring
    this.setupApplicationPerformanceMonitoring(props);

    // Set up infrastructure monitoring
    this.setupInfrastructureMonitoring(props);

    // Set up business metrics monitoring
    this.setupBusinessMetricsMonitoring(props);

    // Set up cost monitoring and budgets
    this.setupCostMonitoring(props);

    // Create log groups and structured logging setup
    this.setupStructuredLogging(props);

    // Set up alerting and notification system
    this.setupAlertingSystem(props);

    // Outputs
    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'SNS Topic ARN for comprehensive alerts',
      exportName: `${props.environment}-ComprehensiveAlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'ApplicationDashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.applicationDashboard.dashboardName}`,
      description: 'Application Performance Dashboard URL',
      exportName: `${props.environment}-ApplicationDashboardUrl`,
    });

    new cdk.CfnOutput(this, 'InfrastructureDashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.infrastructureDashboard.dashboardName}`,
      description: 'Infrastructure Monitoring Dashboard URL',
      exportName: `${props.environment}-InfrastructureDashboardUrl`,
    });

    new cdk.CfnOutput(this, 'BusinessDashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.businessDashboard.dashboardName}`,
      description: 'Business Metrics Dashboard URL',
      exportName: `${props.environment}-BusinessDashboardUrl`,
    });

    new cdk.CfnOutput(this, 'CostDashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.costDashboard.dashboardName}`,
      description: 'Cost Monitoring Dashboard URL',
      exportName: `${props.environment}-CostDashboardUrl`,
    });
  }

  private setupApplicationPerformanceMonitoring(props: HallucifixComprehensiveMonitoringStackProps) {
    // API Gateway Performance Metrics
    if (props.apiGateway) {
      const apiLatencyMetric = new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: {
          ApiName: props.apiGateway.restApiName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      });

      const api4xxErrorsMetric = new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: props.apiGateway.restApiName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      });

      const api5xxErrorsMetric = new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: {
          ApiName: props.apiGateway.restApiName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      });

      const apiRequestsMetric = new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Count',
        dimensionsMap: {
          ApiName: props.apiGateway.restApiName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      });

      // API Gateway Alarms
      const apiLatencyAlarm = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
        alarmName: `${props.apiGateway.restApiName}-latency-high`,
        alarmDescription: 'API Gateway latency is high',
        metric: apiLatencyMetric,
        threshold: 2000, // 2 seconds
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxErrorsAlarm', {
        alarmName: `${props.apiGateway.restApiName}-5xx-errors`,
        alarmDescription: 'API Gateway 5xx errors detected',
        metric: api5xxErrorsMetric,
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      apiLatencyAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
      api5xxAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

      // Add API Gateway widgets to application dashboard
      this.applicationDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'API Gateway - Requests & Latency',
          left: [apiRequestsMetric],
          right: [apiLatencyMetric],
          width: 12,
          height: 6,
          leftYAxis: {
            label: 'Requests (5min)',
            min: 0,
          },
          rightYAxis: {
            label: 'Latency (ms)',
            min: 0,
          },
        }),
        new cloudwatch.GraphWidget({
          title: 'API Gateway - Error Rates',
          left: [api4xxErrorsMetric, api5xxErrorsMetric],
          width: 12,
          height: 6,
          leftYAxis: {
            label: 'Errors (5min)',
            min: 0,
          },
        })
      );
    }

    // Custom Application Metrics
    const analysisRequestsMetric = new cloudwatch.Metric({
      namespace: 'HalluciFix/Application',
      metricName: 'AnalysisRequests',
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });

    const analysisSuccessRateMetric = new cloudwatch.Metric({
      namespace: 'HalluciFix/Application',
      metricName: 'AnalysisSuccessRate',
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const analysisLatencyMetric = new cloudwatch.Metric({
      namespace: 'HalluciFix/Application',
      metricName: 'AnalysisLatency',
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    const userSessionsMetric = new cloudwatch.Metric({
      namespace: 'HalluciFix/Application',
      metricName: 'ActiveUserSessions',
      period: cdk.Duration.minutes(5),
      statistic: 'Average',
    });

    // Application Performance Alarms
    const analysisSuccessRateAlarm = new cloudwatch.Alarm(this, 'AnalysisSuccessRateAlarm', {
      alarmName: 'hallucifix-analysis-success-rate-low',
      alarmDescription: 'Analysis success rate is below threshold',
      metric: analysisSuccessRateMetric,
      threshold: 95, // Alert if success rate drops below 95%
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    const analysisLatencyAlarm = new cloudwatch.Alarm(this, 'AnalysisLatencyAlarm', {
      alarmName: 'hallucifix-analysis-latency-high',
      alarmDescription: 'Analysis latency is above threshold',
      metric: analysisLatencyMetric,
      threshold: 10000, // Alert if average latency exceeds 10 seconds
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    analysisSuccessRateAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
    analysisLatencyAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

    // Add application performance widgets
    this.applicationDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Analysis Performance',
        left: [analysisRequestsMetric],
        right: [analysisLatencyMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Requests (5min)',
          min: 0,
        },
        rightYAxis: {
          label: 'Latency (ms)',
          min: 0,
        },
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Analysis Success Rate',
        metrics: [analysisSuccessRateMetric],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Active User Sessions',
        metrics: [userSessionsMetric],
        width: 6,
        height: 6,
      })
    );
  }

  private setupInfrastructureMonitoring(props: HallucifixComprehensiveMonitoringStackProps) {
    // Lambda Functions Monitoring
    if (props.lambdaFunctions && props.lambdaFunctions.length > 0) {
      const totalInvocationsMetric = new cloudwatch.MathExpression({
        expression: props.lambdaFunctions.map((_, index) => `m${index + 1}`).join(' + '),
        usingMetrics: props.lambdaFunctions.reduce((acc, fn, index) => {
          acc[`m${index + 1}`] = fn.metricInvocations({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          });
          return acc;
        }, {} as Record<string, cloudwatch.IMetric>),
        period: cdk.Duration.minutes(5),
      });

      const totalErrorsMetric = new cloudwatch.MathExpression({
        expression: props.lambdaFunctions.map((_, index) => `e${index + 1}`).join(' + '),
        usingMetrics: props.lambdaFunctions.reduce((acc, fn, index) => {
          acc[`e${index + 1}`] = fn.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          });
          return acc;
        }, {} as Record<string, cloudwatch.IMetric>),
        period: cdk.Duration.minutes(5),
      });

      this.infrastructureDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'Lambda Functions - Total Invocations & Errors',
          left: [totalInvocationsMetric],
          right: [totalErrorsMetric],
          width: 12,
          height: 6,
          leftYAxis: {
            label: 'Invocations (5min)',
            min: 0,
          },
          rightYAxis: {
            label: 'Errors (5min)',
            min: 0,
          },
        })
      );
    }

    // RDS Monitoring
    if (props.rdsInstance) {
      const dbConnectionsMetric = new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnections',
        dimensionsMap: {
          DBInstanceIdentifier: props.rdsInstance.instanceIdentifier,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      });

      const dbCpuMetric = new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          DBInstanceIdentifier: props.rdsInstance.instanceIdentifier,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      });

      const dbFreeMemoryMetric = new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'FreeableMemory',
        dimensionsMap: {
          DBInstanceIdentifier: props.rdsInstance.instanceIdentifier,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      });

      // RDS Alarms
      const dbConnectionsAlarm = new cloudwatch.Alarm(this, 'DbConnectionsAlarm', {
        alarmName: `${props.rdsInstance.instanceIdentifier}-connections-high`,
        alarmDescription: 'RDS connections are high',
        metric: dbConnectionsMetric,
        threshold: 80, // Adjust based on your RDS instance class
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      const dbCpuAlarm = new cloudwatch.Alarm(this, 'DbCpuAlarm', {
        alarmName: `${props.rdsInstance.instanceIdentifier}-cpu-high`,
        alarmDescription: 'RDS CPU utilization is high',
        metric: dbCpuMetric,
        threshold: 80,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      dbConnectionsAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
      dbCpuAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

      this.infrastructureDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'RDS - Connections & CPU',
          left: [dbConnectionsMetric],
          right: [dbCpuMetric],
          width: 12,
          height: 6,
          leftYAxis: {
            label: 'Connections',
            min: 0,
          },
          rightYAxis: {
            label: 'CPU Utilization (%)',
            min: 0,
            max: 100,
          },
        }),
        new cloudwatch.SingleValueWidget({
          title: 'RDS Freeable Memory',
          metrics: [dbFreeMemoryMetric],
          width: 6,
          height: 6,
        })
      );
    }

    // S3 Monitoring
    if (props.s3Buckets && props.s3Buckets.length > 0) {
      props.s3Buckets.forEach((bucket, index) => {
        const bucketSizeMetric = new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'BucketSizeBytes',
          dimensionsMap: {
            BucketName: bucket.bucketName,
            StorageType: 'StandardStorage',
          },
          period: cdk.Duration.days(1),
          statistic: 'Average',
        });

        const numberOfObjectsMetric = new cloudwatch.Metric({
          namespace: 'AWS/S3',
          metricName: 'NumberOfObjects',
          dimensionsMap: {
            BucketName: bucket.bucketName,
            StorageType: 'AllStorageTypes',
          },
          period: cdk.Duration.days(1),
          statistic: 'Average',
        });

        this.infrastructureDashboard.addWidgets(
          new cloudwatch.GraphWidget({
            title: `S3 Bucket: ${bucket.bucketName}`,
            left: [bucketSizeMetric],
            right: [numberOfObjectsMetric],
            width: 12,
            height: 6,
            leftYAxis: {
              label: 'Size (Bytes)',
              min: 0,
            },
            rightYAxis: {
              label: 'Number of Objects',
              min: 0,
            },
          })
        );
      });
    }

    // CloudFront Monitoring
    if (props.cloudFrontDistribution) {
      const cfRequestsMetric = new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: 'Requests',
        dimensionsMap: {
          DistributionId: props.cloudFrontDistribution.distributionId,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      });

      const cfCacheHitRateMetric = new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: 'CacheHitRate',
        dimensionsMap: {
          DistributionId: props.cloudFrontDistribution.distributionId,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      });

      this.infrastructureDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'CloudFront - Requests & Cache Hit Rate',
          left: [cfRequestsMetric],
          right: [cfCacheHitRateMetric],
          width: 12,
          height: 6,
          leftYAxis: {
            label: 'Requests (5min)',
            min: 0,
          },
          rightYAxis: {
            label: 'Cache Hit Rate (%)',
            min: 0,
            max: 100,
          },
        })
      );
    }
  }

  private setupBusinessMetricsMonitoring(props: HallucifixComprehensiveMonitoringStackProps) {
    // Business Metrics
    const dailyActiveUsersMetric = new cloudwatch.Metric({
      namespace: 'HalluciFix/Business',
      metricName: 'DailyActiveUsers',
      period: cdk.Duration.hours(1),
      statistic: 'Maximum',
    });

    const analysisAccuracyMetric = new cloudwatch.Metric({
      namespace: 'HalluciFix/Business',
      metricName: 'AnalysisAccuracy',
      period: cdk.Duration.hours(1),
      statistic: 'Average',
    });

    const subscriptionConversionsMetric = new cloudwatch.Metric({
      namespace: 'HalluciFix/Business',
      metricName: 'SubscriptionConversions',
      period: cdk.Duration.hours(1),
      statistic: 'Sum',
    });

    const revenueMetric = new cloudwatch.Metric({
      namespace: 'HalluciFix/Business',
      metricName: 'Revenue',
      period: cdk.Duration.hours(1),
      statistic: 'Sum',
    });

    const customerSatisfactionMetric = new cloudwatch.Metric({
      namespace: 'HalluciFix/Business',
      metricName: 'CustomerSatisfactionScore',
      period: cdk.Duration.hours(1),
      statistic: 'Average',
    });

    // Business Alarms
    const analysisAccuracyAlarm = new cloudwatch.Alarm(this, 'AnalysisAccuracyAlarm', {
      alarmName: 'hallucifix-analysis-accuracy-low',
      alarmDescription: 'Analysis accuracy has dropped below acceptable threshold',
      metric: analysisAccuracyMetric,
      threshold: 85, // Alert if accuracy drops below 85%
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    analysisAccuracyAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

    // Business Dashboard Widgets
    this.businessDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Daily Active Users',
        metrics: [dailyActiveUsersMetric],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Analysis Accuracy (%)',
        metrics: [analysisAccuracyMetric],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Subscription Conversions (24h)',
        metrics: [subscriptionConversionsMetric],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Revenue (24h)',
        metrics: [revenueMetric],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'User Engagement Trends',
        left: [dailyActiveUsersMetric],
        right: [customerSatisfactionMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Daily Active Users',
          min: 0,
        },
        rightYAxis: {
          label: 'Satisfaction Score',
          min: 0,
          max: 10,
        },
      }),
      new cloudwatch.GraphWidget({
        title: 'Business Performance',
        left: [subscriptionConversionsMetric],
        right: [revenueMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Conversions',
          min: 0,
        },
        rightYAxis: {
          label: 'Revenue ($)',
          min: 0,
        },
      })
    );
  }

  private setupCostMonitoring(props: HallucifixComprehensiveMonitoringStackProps) {
    // AWS Cost and Usage Metrics
    const totalCostMetric = new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      dimensionsMap: {
        Currency: 'USD',
      },
      period: cdk.Duration.hours(6),
      statistic: 'Maximum',
    });

    // Service-specific cost metrics
    const lambdaCostMetric = new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      dimensionsMap: {
        Currency: 'USD',
        ServiceName: 'AWSLambda',
      },
      period: cdk.Duration.hours(6),
      statistic: 'Maximum',
    });

    const rdsCostMetric = new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      dimensionsMap: {
        Currency: 'USD',
        ServiceName: 'AmazonRDS',
      },
      period: cdk.Duration.hours(6),
      statistic: 'Maximum',
    });

    const s3CostMetric = new cloudwatch.Metric({
      namespace: 'AWS/Billing',
      metricName: 'EstimatedCharges',
      dimensionsMap: {
        Currency: 'USD',
        ServiceName: 'AmazonS3',
      },
      period: cdk.Duration.hours(6),
      statistic: 'Maximum',
    });

    // Cost Alarms
    if (props.monthlyBudgetLimit) {
      const dailyBudgetThreshold = props.monthlyBudgetLimit / 30; // Approximate daily budget
      
      const costAlarm = new cloudwatch.Alarm(this, 'DailyCostAlarm', {
        alarmName: 'hallucifix-daily-cost-high',
        alarmDescription: 'Daily AWS costs are approaching budget limit',
        metric: totalCostMetric,
        threshold: dailyBudgetThreshold * 0.8, // Alert at 80% of daily budget
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      costAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

      // Create AWS Budget
      new budgets.CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetName: `hallucifix-monthly-budget-${props.environment}`,
          budgetLimit: {
            amount: props.monthlyBudgetLimit,
            unit: 'USD',
          },
          timeUnit: 'MONTHLY',
          budgetType: 'COST',
          costFilters: {
            TagKey: ['Environment'],
            TagValue: [props.environment],
          },
        },
        notificationsWithSubscribers: [
          {
            notification: {
              notificationType: 'ACTUAL',
              comparisonOperator: 'GREATER_THAN',
              threshold: 80, // Alert at 80% of budget
              thresholdType: 'PERCENTAGE',
            },
            subscribers: props.alertEmail ? [
              {
                subscriptionType: 'EMAIL',
                address: props.alertEmail,
              },
            ] : [],
          },
          {
            notification: {
              notificationType: 'FORECASTED',
              comparisonOperator: 'GREATER_THAN',
              threshold: 100, // Alert when forecasted to exceed budget
              thresholdType: 'PERCENTAGE',
            },
            subscribers: props.alertEmail ? [
              {
                subscriptionType: 'EMAIL',
                address: props.alertEmail,
              },
            ] : [],
          },
        ],
      });
    }

    // Cost Dashboard Widgets
    this.costDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Total Estimated Charges',
        metrics: [totalCostMetric],
        width: 6,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Cost Breakdown by Service',
        left: [lambdaCostMetric, rdsCostMetric, s3CostMetric],
        width: 18,
        height: 6,
        leftYAxis: {
          label: 'Cost (USD)',
          min: 0,
        },
      }),
      new cloudwatch.GraphWidget({
        title: 'Total Cost Trend',
        left: [totalCostMetric],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Total Cost (USD)',
          min: 0,
        },
      })
    );
  }

  private setupStructuredLogging(props: HallucifixComprehensiveMonitoringStackProps) {
    // Create centralized log group for application logs
    const applicationLogGroup = new logs.LogGroup(this, 'ApplicationLogGroup', {
      logGroupName: `/hallucifix/${props.environment}/application`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create log group for business metrics
    const businessLogGroup = new logs.LogGroup(this, 'BusinessLogGroup', {
      logGroupName: `/hallucifix/${props.environment}/business`,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create log group for security events
    const securityLogGroup = new logs.LogGroup(this, 'SecurityLogGroup', {
      logGroupName: `/hallucifix/${props.environment}/security`,
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create metric filters for structured logging
    const errorLogMetric = new logs.MetricFilter(this, 'ErrorLogMetric', {
      logGroup: applicationLogGroup,
      metricNamespace: 'HalluciFix/Application',
      metricName: 'ApplicationErrors',
      filterPattern: logs.FilterPattern.literal('[timestamp, requestId, level="ERROR", ...]'),
      metricValue: '1',
      defaultValue: 0,
    });

    const businessEventMetric = new logs.MetricFilter(this, 'BusinessEventMetric', {
      logGroup: businessLogGroup,
      metricNamespace: 'HalluciFix/Business',
      metricName: 'BusinessEvents',
      filterPattern: logs.FilterPattern.literal('[timestamp, eventType, ...]'),
      metricValue: '1',
      defaultValue: 0,
    });

    const securityEventMetric = new logs.MetricFilter(this, 'SecurityEventMetric', {
      logGroup: securityLogGroup,
      metricNamespace: 'HalluciFix/Security',
      metricName: 'SecurityEvents',
      filterPattern: logs.FilterPattern.literal('[timestamp, eventType="SECURITY", ...]'),
      metricValue: '1',
      defaultValue: 0,
    });

    // Output log group names for application configuration
    new cdk.CfnOutput(this, 'ApplicationLogGroupName', {
      value: applicationLogGroup.logGroupName,
      description: 'Application log group name for structured logging',
      exportName: `${props.environment}-ApplicationLogGroupName`,
    });

    new cdk.CfnOutput(this, 'BusinessLogGroupName', {
      value: businessLogGroup.logGroupName,
      description: 'Business metrics log group name',
      exportName: `${props.environment}-BusinessLogGroupName`,
    });

    new cdk.CfnOutput(this, 'SecurityLogGroupName', {
      value: securityLogGroup.logGroupName,
      description: 'Security events log group name',
      exportName: `${props.environment}-SecurityLogGroupName`,
    });
  }

  private setupAlertingSystem(props: HallucifixComprehensiveMonitoringStackProps) {
    // Create escalation SNS topics
    const criticalAlertTopic = new sns.Topic(this, 'CriticalAlertTopic', {
      topicName: `hallucifix-critical-alerts-${props.environment}`,
      displayName: `HalluciFix Critical Alerts (${props.environment})`,
    });

    const warningAlertTopic = new sns.Topic(this, 'WarningAlertTopic', {
      topicName: `hallucifix-warning-alerts-${props.environment}`,
      displayName: `HalluciFix Warning Alerts (${props.environment})`,
    });

    // Add email subscriptions
    if (props.alertEmail) {
      criticalAlertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
      warningAlertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
    }

    // Create composite alarm for system health
    const systemHealthAlarm = new cloudwatch.CompositeAlarm(this, 'SystemHealthAlarm', {
      alarmName: `hallucifix-system-health-${props.environment}`,
      alarmDescription: 'Overall system health composite alarm',
      compositeAlarmRule: cloudwatch.AlarmRule.anyOf(
        // Add individual alarm rules here as they are created
        cloudwatch.AlarmRule.fromBoolean(false) // Placeholder
      ),
    });

    systemHealthAlarm.addAlarmAction(new cloudwatch.SnsAction(criticalAlertTopic));

    // Output alert topic ARNs
    new cdk.CfnOutput(this, 'CriticalAlertTopicArn', {
      value: criticalAlertTopic.topicArn,
      description: 'Critical alerts SNS topic ARN',
      exportName: `${props.environment}-CriticalAlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'WarningAlertTopicArn', {
      value: warningAlertTopic.topicArn,
      description: 'Warning alerts SNS topic ARN',
      exportName: `${props.environment}-WarningAlertTopicArn`,
    });
  }
}