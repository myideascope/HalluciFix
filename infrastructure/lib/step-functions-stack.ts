import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as sfnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface HallucifixStepFunctionsStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  database: rds.DatabaseInstance;
  bucket: s3.Bucket;
  commonLayer: lambda.LayerVersion;
  lambdaRole: iam.Role;
}

export class HallucifixStepFunctionsStack extends cdk.Stack {
  public readonly batchAnalysisStateMachine: stepfunctions.StateMachine;
  public readonly batchProcessingQueue: sqs.Queue;
  public readonly batchResultsQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: HallucifixStepFunctionsStackProps) {
    super(scope, id, props);

    // Create SQS queues for batch processing
    this.batchProcessingQueue = new sqs.Queue(this, 'BatchProcessingQueue', {
      queueName: `hallucifix-batch-processing-${props.environment}`,
      visibilityTimeout: cdk.Duration.minutes(15), // Match Lambda timeout
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'BatchProcessingDLQ', {
          queueName: `hallucifix-batch-processing-dlq-${props.environment}`,
          retentionPeriod: cdk.Duration.days(14),
        }),
        maxReceiveCount: 3,
      },
    });

    this.batchResultsQueue = new sqs.Queue(this, 'BatchResultsQueue', {
      queueName: `hallucifix-batch-results-${props.environment}`,
      visibilityTimeout: cdk.Duration.minutes(5),
      retentionPeriod: cdk.Duration.days(7),
    });

    // Create Lambda functions for Step Functions workflow

    // 1. Batch Preparation Function
    const batchPreparationFunction = new lambda.Function(this, 'BatchPreparationFunction', {
      functionName: `hallucifix-batch-preparation-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-functions/batch-preparation'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        NODE_ENV: props.environment,
        AWS_REGION: this.region,
        DB_CLUSTER_ARN: props.database.instanceArn,
        DB_SECRET_ARN: props.database.secret?.secretArn || '',
        BATCH_PROCESSING_QUEUE_URL: this.batchProcessingQueue.queueUrl,
        S3_BUCKET_NAME: props.bucket.bucketName,
      },
      role: props.lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [props.commonLayer],
    });

    // 2. Document Analysis Function
    const documentAnalysisFunction = new lambda.Function(this, 'DocumentAnalysisFunction', {
      functionName: `hallucifix-document-analysis-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-functions/document-analysis'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        NODE_ENV: props.environment,
        AWS_REGION: this.region,
        DB_CLUSTER_ARN: props.database.instanceArn,
        DB_SECRET_ARN: props.database.secret?.secretArn || '',
        S3_BUCKET_NAME: props.bucket.bucketName,
        BATCH_RESULTS_QUEUE_URL: this.batchResultsQueue.queueUrl,
      },
      role: props.lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [props.commonLayer],
    });

    // 3. Batch Aggregation Function
    const batchAggregationFunction = new lambda.Function(this, 'BatchAggregationFunction', {
      functionName: `hallucifix-batch-aggregation-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-functions/batch-aggregation'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      environment: {
        NODE_ENV: props.environment,
        AWS_REGION: this.region,
        DB_CLUSTER_ARN: props.database.instanceArn,
        DB_SECRET_ARN: props.database.secret?.secretArn || '',
        S3_BUCKET_NAME: props.bucket.bucketName,
      },
      role: props.lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [props.commonLayer],
    });

    // 4. Error Handler Function
    const errorHandlerFunction = new lambda.Function(this, 'ErrorHandlerFunction', {
      functionName: `hallucifix-batch-error-handler-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-functions/batch-error-handler'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        NODE_ENV: props.environment,
        AWS_REGION: this.region,
        DB_CLUSTER_ARN: props.database.instanceArn,
        DB_SECRET_ARN: props.database.secret?.secretArn || '',
      },
      role: props.lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [props.commonLayer],
    });

    // Grant SQS permissions to Lambda functions
    this.batchProcessingQueue.grantSendMessages(batchPreparationFunction);
    this.batchProcessingQueue.grantConsumeMessages(documentAnalysisFunction);
    this.batchResultsQueue.grantSendMessages(documentAnalysisFunction);
    this.batchResultsQueue.grantConsumeMessages(batchAggregationFunction);

    // Create CloudWatch Log Group for Step Functions
    const stepFunctionLogGroup = new logs.LogGroup(this, 'BatchAnalysisStateMachineLogGroup', {
      logGroupName: `/aws/stepfunctions/hallucifix-batch-analysis-${props.environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Define Step Functions state machine for batch analysis
    const batchPreparationTask = new sfnTasks.LambdaInvoke(this, 'BatchPreparationTask', {
      lambdaFunction: batchPreparationFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    // Map state for parallel document processing
    const documentProcessingMap = new stepfunctions.Map(this, 'DocumentProcessingMap', {
      maxConcurrency: 10, // Process up to 10 documents concurrently
      itemsPath: '$.documents',
      parameters: {
        'document.$': '$$.Map.Item.Value',
        'batchId.$': '$.batchId',
        'userId.$': '$.userId',
        'options.$': '$.options',
      },
    });

    const documentAnalysisTask = new sfnTasks.LambdaInvoke(this, 'DocumentAnalysisTask', {
      lambdaFunction: documentAnalysisFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    documentProcessingMap.iterator(documentAnalysisTask);

    const batchAggregationTask = new sfnTasks.LambdaInvoke(this, 'BatchAggregationTask', {
      lambdaFunction: batchAggregationFunction,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
    });

    // Success state
    const successState = new stepfunctions.Succeed(this, 'BatchAnalysisSuccess', {
      comment: 'Batch analysis completed successfully',
    });

    // Failure state
    const failureState = new stepfunctions.Fail(this, 'BatchAnalysisFailure', {
      comment: 'Batch analysis failed',
      cause: 'Unrecoverable error in batch processing',
    });

    // Global error handler
    const globalErrorHandler = new sfnTasks.LambdaInvoke(this, 'GlobalErrorHandler', {
      lambdaFunction: errorHandlerFunction,
      outputPath: '$.Payload',
    });

    // Define the workflow
    const definition = batchPreparationTask
      .next(
        new stepfunctions.Choice(this, 'CheckPreparationResult')
          .when(
            stepfunctions.Condition.numberEquals('$.documentCount', 0),
            new stepfunctions.Pass(this, 'EmptyBatchPass', {
              result: stepfunctions.Result.fromObject({
                batchId: stepfunctions.JsonPath.stringAt('$.batchId'),
                status: 'completed',
                message: 'No documents to process',
                results: [],
              }),
            }).next(successState)
          )
          .otherwise(
            documentProcessingMap
              .next(batchAggregationTask)
              .next(
                new stepfunctions.Choice(this, 'CheckAggregationResult')
                  .when(
                    stepfunctions.Condition.stringEquals('$.status', 'success'),
                    successState
                  )
                  .otherwise(failureState)
              )
          )
      );

    // Create the state machine
    this.batchAnalysisStateMachine = new stepfunctions.StateMachine(this, 'BatchAnalysisStateMachine', {
      stateMachineName: `hallucifix-batch-analysis-${props.environment}`,
      definition,
      timeout: cdk.Duration.hours(2), // Maximum execution time
      logs: {
        destination: stepFunctionLogGroup,
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true,
      },
      tracingEnabled: true,
    });

    // Create IAM role for API Gateway to invoke Step Functions
    const stepFunctionExecutionRole = new iam.Role(this, 'StepFunctionExecutionRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      inlinePolicies: {
        StepFunctionExecutionPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'states:StartExecution',
                'states:DescribeExecution',
                'states:StopExecution',
              ],
              resources: [this.batchAnalysisStateMachine.stateMachineArn],
            }),
          ],
        }),
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'BatchAnalysisStateMachineArn', {
      value: this.batchAnalysisStateMachine.stateMachineArn,
      description: 'Batch Analysis Step Functions State Machine ARN',
      exportName: `${props.environment}-BatchAnalysisStateMachineArn`,
    });

    new cdk.CfnOutput(this, 'BatchProcessingQueueUrl', {
      value: this.batchProcessingQueue.queueUrl,
      description: 'Batch Processing SQS Queue URL',
      exportName: `${props.environment}-BatchProcessingQueueUrl`,
    });

    new cdk.CfnOutput(this, 'BatchResultsQueueUrl', {
      value: this.batchResultsQueue.queueUrl,
      description: 'Batch Results SQS Queue URL',
      exportName: `${props.environment}-BatchResultsQueueUrl`,
    });

    new cdk.CfnOutput(this, 'StepFunctionExecutionRoleArn', {
      value: stepFunctionExecutionRole.roleArn,
      description: 'Step Function Execution Role ARN',
      exportName: `${props.environment}-StepFunctionExecutionRoleArn`,
    });
  }
}