import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface BedrockStackProps extends cdk.StackProps {
  environment: 'development' | 'staging' | 'production';
  projectName: string;
}

export class BedrockStack extends cdk.Stack {
  public readonly bedrockExecutionRole: iam.Role;
  public readonly bedrockLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: BedrockStackProps) {
    super(scope, id, props);

    const { environment, projectName } = props;

    // Create log group for Bedrock operations
    this.bedrockLogGroup = new logs.LogGroup(this, 'BedrockLogGroup', {
      logGroupName: `/hallucifix/bedrock/${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: environment === 'production' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create IAM policy for Bedrock access
    const bedrockPolicy = new iam.PolicyDocument({
      statements: [
        // Bedrock model access
        new iam.PolicyStatement({
          sid: 'BedrockModelAccess',
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
          ],
          resources: [
            `arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
            `arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
            `arn:aws:bedrock:*::foundation-model/anthropic.claude-3-opus-20240229-v1:0`,
            `arn:aws:bedrock:*::foundation-model/amazon.titan-text-express-v1`,
          ],
        }),
        // Model discovery
        new iam.PolicyStatement({
          sid: 'BedrockModelDiscovery',
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:ListFoundationModels',
            'bedrock:GetFoundationModel',
          ],
          resources: ['*'],
        }),
        // Logging permissions
        new iam.PolicyStatement({
          sid: 'BedrockLogging',
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'logs:DescribeLogStreams',
          ],
          resources: [this.bedrockLogGroup.logGroupArn],
        }),
        // CloudWatch metrics
        new iam.PolicyStatement({
          sid: 'CloudWatchMetrics',
          effect: iam.Effect.ALLOW,
          actions: [
            'cloudwatch:PutMetricData',
            'cloudwatch:GetMetricStatistics',
            'cloudwatch:ListMetrics',
          ],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'cloudwatch:namespace': ['AWS/Bedrock', 'HalluciFix/AI'],
            },
          },
        }),
      ],
    });

    // Create execution role for Bedrock operations
    this.bedrockExecutionRole = new iam.Role(this, 'BedrockExecutionRole', {
      roleName: `${projectName}-bedrock-execution-${environment}`,
      assumedBy: new iam.CompositePrincipal(
        // Allow Lambda functions to assume this role
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        // Allow ECS tasks to assume this role
        new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        // Allow EC2 instances to assume this role (for development)
        new iam.ServicePrincipal('ec2.amazonaws.com'),
      ),
      inlinePolicies: {
        BedrockAccess: bedrockPolicy,
      },
      managedPolicies: [
        // Basic execution role for Lambda
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      description: `Execution role for AWS Bedrock operations in ${environment} environment`,
    });

    // Create instance profile for EC2 instances (development/testing)
    const instanceProfile = new iam.CfnInstanceProfile(this, 'BedrockInstanceProfile', {
      roles: [this.bedrockExecutionRole.roleName],
      instanceProfileName: `${projectName}-bedrock-instance-profile-${environment}`,
    });

    // Create user for programmatic access (development only)
    if (environment === 'development') {
      const bedrockUser = new iam.User(this, 'BedrockDevelopmentUser', {
        userName: `${projectName}-bedrock-dev-user`,
        managedPolicies: [
          // Attach the same policy as the role for consistency
          new iam.ManagedPolicy(this, 'BedrockUserPolicy', {
            document: bedrockPolicy,
            description: 'Policy for Bedrock development user access',
          }),
        ],
      });

      // Create access key for development user
      const accessKey = new iam.CfnAccessKey(this, 'BedrockDevelopmentAccessKey', {
        userName: bedrockUser.userName,
      });

      // Output the access key information (for development only)
      new cdk.CfnOutput(this, 'BedrockDevelopmentAccessKeyId', {
        value: accessKey.ref,
        description: 'Access Key ID for Bedrock development user',
        exportName: `${projectName}-bedrock-dev-access-key-id-${environment}`,
      });

      new cdk.CfnOutput(this, 'BedrockDevelopmentSecretAccessKey', {
        value: accessKey.attrSecretAccessKey,
        description: 'Secret Access Key for Bedrock development user (store securely)',
        exportName: `${projectName}-bedrock-dev-secret-key-${environment}`,
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'BedrockExecutionRoleArn', {
      value: this.bedrockExecutionRole.roleArn,
      description: 'ARN of the Bedrock execution role',
      exportName: `${projectName}-bedrock-execution-role-arn-${environment}`,
    });

    new cdk.CfnOutput(this, 'BedrockLogGroupName', {
      value: this.bedrockLogGroup.logGroupName,
      description: 'Name of the Bedrock log group',
      exportName: `${projectName}-bedrock-log-group-${environment}`,
    });

    // Tags
    cdk.Tags.of(this).add('Project', projectName);
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Service', 'Bedrock');
    cdk.Tags.of(this).add('Component', 'AI');
  }
}