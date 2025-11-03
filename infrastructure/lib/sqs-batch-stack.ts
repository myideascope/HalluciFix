import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface HallucifixSQSBatchStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  database: rds.DatabaseInstance;
  bucket: s3.Bucket;
  alertTopic: sns.Topic;
  commonLayer: lambda.LayerVersion;
  lambdaRole: iam.Role;
}

export class HallucifixSQSBatchStack extends cdk.Stack {
  public readonly highPriorityQueue: sqs.Queue;
  public readonly normalPriorityQueue: sqs.Queue;
  public readonly lowPriorityQueue: sqs.Queue;
  public readonly batchProcessorFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: HallucifixSQSBatchStackProps) {
    super(scope, id, props);

    // Create Dead Letter Queues
    const highPriorityDLQ = new sqs.Queue(this, 'HighPriorityDLQ', {
      queueName: `hallucifix-batch-high-priority-dlq-${props.environment}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    const normalPriorityDLQ = new sqs.Queue(this, 'NormalPriorityDLQ', {
      queueName: `hallucifix-batch-normal-priority-dlq-${props.environment}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    const lowPriorityDLQ = new sqs.Queue(this, 'LowPriorityDLQ', {
      queueName: `hallucifix-batch-low-priority-dlq-${props.environment}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Create Processing Queues with different configurations
    this.highPriorityQueue = new sqs.Queue(this, 'HighPriorityQueue', {
      queueName: `hallucifix-batch-high-priority-${props.environment}`,
      visibilityTimeout: cdk.Duration.minutes(15),
      retentionPeriod: cdk.Duration.days(14),
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: highPriorityDLQ,
        maxReceiveCount: 3,
      },
    });

    this.normalPriorityQueue = new sqs.Queue(this, 'NormalPriorityQueue', {
      queueName: `hallucifix-batch-normal-priority-${props.environment}`,
      visibilityTimeout: cdk.Duration.minutes(15),
      retentionPeriod: cdk.Duration.days(14),
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      deadLetterQueue: {
        queue: normalPriorityDLQ,
        maxReceiveCount: 3,
      },
    });

    this.lowPriorityQueue = new sqs.Queue(this, 'LowPriorityQueue', {
      queueName: `hallucifix-batch-low-priority-${props.environment}`,
      visibilityTimeout: cdk.Duration.minutes(15),
      retentionPeriod: cdk.Duration.days(14),
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      deadLetterQueue: {
        queue: lowPriorityDLQ,
        maxReceiveCount: 3,
      },
    });

    // Create Batch Processor Lambda Function
    this.batchProcessorFunction = new lambda.Function(this, 'BatchProcessorFunction', {
      functionName: `hallucifix-batch-processor-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-functions/batch-processor'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        NODE_ENV: props.environment,
        DB_CLUSTER_ARN: props.database.instanceArn,
        DB_SECRET_ARN: props.database.secret?.secretArn || '',
        S3_BUCKET_NAME: props.bucket.bucketName,
        ALERT_TOPIC_ARN: props.alertTopic.topicArn,
        HIGH_PRIORITY_QUEUE_URL: this.highPriorityQueue.queueUrl,
        NORMAL_PRIORITY_QUEUE_URL: this.normalPriorityQueue.queueUrl,
        LOW_PRIORITY_QUEUE_URL: this.lowPriorityQueue.queueUrl,
      },
      role: props.lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [props.commonLayer],
      tracing: lambda.Tracing.ACTIVE,
      reservedConcurrentExecutions: 50, // Limit concurrent executions
    });

    // Grant SQS permissions to Lambda function
    this.highPriorityQueue.grantConsumeMessages(this.batchProcessorFunction);
    this.normalPriorityQueue.grantConsumeMessages(this.batchProcessorFunction);
    this.lowPriorityQueue.grantConsumeMessages(this.batchProcessorFunction);

    // Grant permissions to send messages to queues (for client applications)
    this.highPriorityQueue.grantSendMessages(props.lambdaRole);
    this.normalPriorityQueue.grantSendMessages(props.lambdaRole);
    this.lowPriorityQueue.grantSendMessages(props.lambdaRole);

    // Set up SQS event sources for Lambda function with different batch sizes
    this.batchProcessorFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.highPriorityQueue, {
        batchSize: 1, // Process high priority messages immediately
        maxBatchingWindow: cdk.Duration.seconds(0),
        reportBatchItemFailures: true,
      })
    );

    this.batchProcessorFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.normalPriorityQueue, {
        batchSize: 5, // Process normal priority in small batches
        maxBatchingWindow: cdk.Duration.seconds(5),
        reportBatchItemFailures: true,
      })
    );

    this.batchProcessorFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.lowPriorityQueue, {
        batchSize: 10, // Process low priority in larger batches
        maxBatchingWindow: cdk.Duration.seconds(10),
        reportBatchItemFailures: true,
      })
    );

    // Create CloudWatch Alarms for queue monitoring
    this.createQueueAlarms();

    // Create CloudWatch Dashboard for SQS monitoring
    this.createSQSDashboard();

    // Outputs
    new cdk.CfnOutput(this, 'HighPriorityQueueUrl', {
      value: this.highPriorityQueue.queueUrl,
      description: 'High Priority SQS Queue URL',
      exportName: `${props.environment}-HighPriorityQueueUrl`,
    });

    new cdk.CfnOutput(this, 'NormalPriorityQueueUrl', {
      value: this.normalPriorityQueue.queueUrl,
      description: 'Normal Priority SQS Queue URL',
      exportName: `${props.environment}-NormalPriorityQueueUrl`,
    });

    new cdk.CfnOutput(this, 'LowPriorityQueueUrl', {
      value: this.lowPriorityQueue.queueUrl,
      description: 'Low Priority SQS Queue URL',
      exportName: `${props.environment}-LowPriorityQueueUrl`,
    });

    new cdk.CfnOutput(this, 'BatchProcessorFunctionArn', {
      value: this.batchProcessorFunction.functionArn,
      description: 'Batch Processor Lambda Function ARN',
      exportName: `${props.environment}-BatchProcessorFunctionArn`,
    });
  }

  private createQueueAlarms(): void {
    const queues = [
      { name: 'HighPriority', queue: this.highPriorityQueue, threshold: 100 },
      { name: 'NormalPriority', queue: this.normalPriorityQueue, threshold: 500 },
      { name: 'LowPriority', queue: this.lowPriorityQueue, threshold: 1000 },
    ];

    queues.forEach(({ name, queue, threshold }) => {
      // Queue depth alarm
      const queueDepthAlarm = new cloudwatch.Alarm(this, `${name}QueueDepthAlarm`, {
        alarmName: `hallucifix-${name.toLowerCase()}-queue-depth`,
        alarmDescription: `${name} queue depth is too high`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfVisibleMessages',
          dimensionsMap: {
            QueueName: queue.queueName,
          },
          period: cdk.Duration.minutes(5),
          statistic: 'Average',
        }),
        threshold,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Message age alarm
      const messageAgeAlarm = new cloudwatch.Alarm(this, `${name}MessageAgeAlarm`, {
        alarmName: `hallucifix-${name.toLowerCase()}-message-age`,
        alarmDescription: `${name} queue messages are too old`,
        metric: queue.metricApproximateAgeOfOldestMessage({
          period: cdk.Duration.minutes(5),
          statistic: 'Maximum',
        }),
        threshold: 1800, // 30 minutes
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Add alarms to SNS topic (assuming alertTopic is available)
      // queueDepthAlarm.addAlarmAction(new SnsAction(props.alertTopic));
      // messageAgeAlarm.addAlarmAction(new SnsAction(props.alertTopic));
    });
  }

  private createSQSDashboard(): void {
    const dashboard = new cloudwatch.Dashboard(this, 'SQSBatchDashboard', {
      dashboardName: `hallucifix-sqs-batch-${this.stackName}`,
    });

    // Queue metrics widgets
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Queue Depth - All Priorities',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: {
              QueueName: this.highPriorityQueue.queueName,
            },
            label: 'High Priority',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: {
              QueueName: this.normalPriorityQueue.queueName,
            },
            label: 'Normal Priority',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: {
              QueueName: this.lowPriorityQueue.queueName,
            },
            label: 'Low Priority',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Message Processing Rate',
        left: [
          this.highPriorityQueue.metricNumberOfMessagesSent({
            label: 'High Priority Sent',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          this.normalPriorityQueue.metricNumberOfMessagesSent({
            label: 'Normal Priority Sent',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          this.lowPriorityQueue.metricNumberOfMessagesSent({
            label: 'Low Priority Sent',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        right: [
          this.highPriorityQueue.metricNumberOfMessagesReceived({
            label: 'High Priority Received',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          this.normalPriorityQueue.metricNumberOfMessagesReceived({
            label: 'Normal Priority Received',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          this.lowPriorityQueue.metricNumberOfMessagesReceived({
            label: 'Low Priority Received',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Batch Processor Lambda Metrics',
        left: [
          this.batchProcessorFunction.metricInvocations({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        right: [
          this.batchProcessorFunction.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          this.batchProcessorFunction.metricThrottles({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        width: 12,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Current Queue Depths',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: {
              QueueName: this.highPriorityQueue.queueName,
            },
            label: 'High Priority',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: {
              QueueName: this.normalPriorityQueue.queueName,
            },
            label: 'Normal Priority',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfVisibleMessages',
            dimensionsMap: {
              QueueName: this.lowPriorityQueue.queueName,
            },
            label: 'Low Priority',
          }),
        ],
        width: 12,
        height: 6,
      }),
    );
  }
}