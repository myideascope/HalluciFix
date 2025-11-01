import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as xray from 'aws-cdk-lib/aws-xray';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface HallucifixLambdaMonitoringStackProps extends cdk.StackProps {
  environment: string;
  lambdaFunctions: lambda.Function[];
  alertEmail?: string;
  slackWebhookUrl?: string;
}

export class HallucifixLambdaMonitoringStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: HallucifixLambdaMonitoringStackProps) {
    super(scope, id, props);

    // Create SNS topic for alerts
    this.alertTopic = new sns.Topic(this, 'LambdaAlertTopic', {
      topicName: `hallucifix-lambda-alerts-${props.environment}`,
      displayName: `HalluciFix Lambda Alerts (${props.environment})`,
    });

    // Add email subscription if provided
    if (props.alertEmail) {
      this.alertTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.alertEmail)
      );
    }

    // Create CloudWatch dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'LambdaDashboard', {
      dashboardName: `hallucifix-lambda-monitoring-${props.environment}`,
    });

    // Set up monitoring for each Lambda function
    props.lambdaFunctions.forEach((lambdaFunction, index) => {
      this.setupLambdaMonitoring(lambdaFunction, index);
    });

    // Create composite alarms for overall system health
    this.createCompositeAlarms(props.lambdaFunctions);

    // Create X-Ray tracing configuration
    this.setupXRayTracing(props.lambdaFunctions);

    // Create log insights queries
    this.createLogInsightsQueries(props.lambdaFunctions);

    // Outputs
    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'SNS Topic ARN for Lambda alerts',
      exportName: `${props.environment}-LambdaAlertTopicArn`,
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
      exportName: `${props.environment}-LambdaDashboardUrl`,
    });
  }

  private setupLambdaMonitoring(lambdaFunction: lambda.Function, index: number) {
    const functionName = lambdaFunction.functionName;

    // Create CloudWatch alarms for the function
    const errorAlarm = new cloudwatch.Alarm(this, `${functionName}ErrorAlarm`, {
      alarmName: `${functionName}-errors`,
      alarmDescription: `Error rate alarm for ${functionName}`,
      metric: lambdaFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5, // Alert if more than 5 errors in 5 minutes
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const durationAlarm = new cloudwatch.Alarm(this, `${functionName}DurationAlarm`, {
      alarmName: `${functionName}-duration`,
      alarmDescription: `Duration alarm for ${functionName}`,
      metric: lambdaFunction.metricDuration({
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: lambdaFunction.timeout ? lambdaFunction.timeout.toMilliseconds() * 0.8 : 30000, // 80% of timeout
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const throttleAlarm = new cloudwatch.Alarm(this, `${functionName}ThrottleAlarm`, {
      alarmName: `${functionName}-throttles`,
      alarmDescription: `Throttle alarm for ${functionName}`,
      metric: lambdaFunction.metricThrottles({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1, // Alert on any throttles
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const concurrentExecutionsAlarm = new cloudwatch.Alarm(this, `${functionName}ConcurrencyAlarm`, {
      alarmName: `${functionName}-concurrency`,
      alarmDescription: `Concurrent executions alarm for ${functionName}`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'ConcurrentExecutions',
        dimensionsMap: {
          FunctionName: functionName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: 900, // Alert at 90% of default concurrent execution limit
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Create custom metrics for business logic
    const businessErrorAlarm = new cloudwatch.Alarm(this, `${functionName}BusinessErrorAlarm`, {
      alarmName: `${functionName}-business-errors`,
      alarmDescription: `Business logic error alarm for ${functionName}`,
      metric: new cloudwatch.Metric({
        namespace: 'HalluciFix/Lambda',
        metricName: 'BusinessErrors',
        dimensionsMap: {
          FunctionName: functionName,
        },
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 3, // Alert if more than 3 business errors in 5 minutes
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add alarms to SNS topic
    errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    durationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    throttleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    concurrentExecutionsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    businessErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

    // Add widgets to dashboard
    const row = Math.floor(index / 2);
    const col = (index % 2) * 12;

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: `${functionName} - Invocations & Errors`,
        left: [
          lambdaFunction.metricInvocations({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        right: [
          lambdaFunction.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Invocations',
          showUnits: false,
        },
        rightYAxis: {
          label: 'Errors',
          showUnits: false,
        },
      }),
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: `${functionName} - Duration & Throttles`,
        left: [
          lambdaFunction.metricDuration({
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
          }),
        ],
        right: [
          lambdaFunction.metricThrottles({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        width: 12,
        height: 6,
        leftYAxis: {
          label: 'Duration (ms)',
          showUnits: false,
        },
        rightYAxis: {
          label: 'Throttles',
          showUnits: false,
        },
      }),
    );

    // Create log group with retention
    const logGroup = new logs.LogGroup(this, `${functionName}LogGroup`, {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create log-based metrics
    const errorLogMetric = new logs.MetricFilter(this, `${functionName}ErrorLogMetric`, {
      logGroup,
      metricNamespace: 'HalluciFix/Lambda',
      metricName: 'LogErrors',
      filterPattern: logs.FilterPattern.anyTerm('ERROR', 'Error', 'error', 'FAILED', 'Failed', 'failed'),
      metricValue: '1',
      defaultValue: 0,
      dimensions: {
        FunctionName: functionName,
      },
    });

    const timeoutLogMetric = new logs.MetricFilter(this, `${functionName}TimeoutLogMetric`, {
      logGroup,
      metricNamespace: 'HalluciFix/Lambda',
      metricName: 'Timeouts',
      filterPattern: logs.FilterPattern.literal('Task timed out'),
      metricValue: '1',
      defaultValue: 0,
      dimensions: {
        FunctionName: functionName,
      },
    });

    const memoryLogMetric = new logs.MetricFilter(this, `${functionName}MemoryLogMetric`, {
      logGroup,
      metricNamespace: 'HalluciFix/Lambda',
      metricName: 'MemoryUtilization',
      filterPattern: logs.FilterPattern.exists('$.memoryUsed'),
      metricValue: '$.memoryUsed',
      dimensions: {
        FunctionName: functionName,
      },
    });
  }

  private createCompositeAlarms(lambdaFunctions: lambda.Function[]) {
    // Create a composite alarm that triggers if multiple functions are failing
    const functionErrorAlarms = lambdaFunctions.map(fn => 
      cloudwatch.Alarm.fromAlarmArn(
        this,
        `${fn.functionName}ErrorAlarmRef`,
        `arn:aws:cloudwatch:${this.region}:${this.account}:alarm:${fn.functionName}-errors`
      )
    );

    const systemHealthAlarm = new cloudwatch.CompositeAlarm(this, 'SystemHealthAlarm', {
      alarmDescription: 'Overall system health based on Lambda function errors',
      alarmRule: cloudwatch.AlarmRule.anyOf(
        ...functionErrorAlarms.map(alarm => cloudwatch.AlarmRule.fromAlarm(alarm, cloudwatch.AlarmState.ALARM))
      ),
    });

    systemHealthAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

    // Add system overview widget to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'System Health Status',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Errors',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Total Invocations (5min)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Invocations',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 6,
        height: 6,
      }),
    );
  }

  private setupXRayTracing(lambdaFunctions: lambda.Function[]) {
    // Enable X-Ray tracing for all functions
    lambdaFunctions.forEach(lambdaFunction => {
      // Note: X-Ray tracing is typically enabled at the function level in the function definition
      // This is a placeholder for any additional X-Ray configuration
      
      // Create X-Ray service map widget
      this.dashboard.addWidgets(
        new cloudwatch.CustomWidget({
          title: 'X-Ray Service Map',
          width: 24,
          height: 8,
          functionArn: 'arn:aws:lambda:us-east-1:123456789012:function:xray-service-map-widget',
          params: {
            region: this.region,
            serviceName: 'hallucifix-lambda-functions',
          },
        }),
      );
    });
  }

  private createLogInsightsQueries(lambdaFunctions: lambda.Function[]) {
    // Create useful CloudWatch Logs Insights queries
    const queries = [
      {
        name: 'Top Errors by Function',
        query: `
          fields @timestamp, @message, @requestId
          | filter @message like /ERROR/
          | stats count() by bin(5m)
          | sort @timestamp desc
        `,
      },
      {
        name: 'Slow Executions',
        query: `
          fields @timestamp, @duration, @requestId, @message
          | filter @duration > 5000
          | sort @duration desc
          | limit 100
        `,
      },
      {
        name: 'Memory Usage Analysis',
        query: `
          fields @timestamp, @maxMemoryUsed, @memorySize, @requestId
          | filter @maxMemoryUsed > 0
          | stats avg(@maxMemoryUsed), max(@maxMemoryUsed), min(@maxMemoryUsed) by bin(5m)
          | sort @timestamp desc
        `,
      },
      {
        name: 'Cold Start Analysis',
        query: `
          fields @timestamp, @duration, @initDuration, @requestId
          | filter ispresent(@initDuration)
          | stats count() by bin(1h)
          | sort @timestamp desc
        `,
      },
    ];

    // Store queries as SSM parameters for easy access
    queries.forEach((query, index) => {
      new cdk.CfnOutput(this, `LogInsightsQuery${index}`, {
        value: query.query,
        description: `CloudWatch Logs Insights Query: ${query.name}`,
        exportName: `${this.stackName}-LogInsightsQuery-${query.name.replace(/\s+/g, '')}`,
      });
    });
  }
}