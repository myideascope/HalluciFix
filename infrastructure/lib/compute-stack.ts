import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface HallucifixComputeStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  database: rds.DatabaseInstance;
  cache: elasticache.CfnCacheCluster;
  bucket: s3.Bucket;
  distribution?: cloudfront.Distribution;
  batchAnalysisStateMachine?: stepfunctions.StateMachine;
}

export class HallucifixComputeStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly api: apigateway.RestApi;
  public readonly lambdaFunctions: lambda.Function[] = [];
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: HallucifixComputeStackProps) {
    super(scope, id, props);

    // Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'HallucifixUserPool', {
      userPoolName: `hallucifix-users-${props.environment}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: false,
          mutable: true,
        },
        familyName: {
          required: false,
          mutable: true,
        },
      },
      customAttributes: {
        subscriptionTier: new cognito.StringAttribute({ mutable: true }),
        usageQuota: new cognito.NumberAttribute({ mutable: true }),
      },
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Google OAuth Identity Provider (placeholder - requires Google OAuth credentials)
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      userPool: this.userPool,
      clientId: 'GOOGLE_CLIENT_ID_PLACEHOLDER', // Will be replaced with actual Google OAuth client ID
      clientSecret: 'GOOGLE_CLIENT_SECRET_PLACEHOLDER', // Will be replaced with actual secret
      scopes: ['email', 'profile', 'openid', 'https://www.googleapis.com/auth/drive.readonly'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
      },
    });

    // Cognito User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'HallucifixUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `hallucifix-client-${props.environment}`,
      generateSecret: false, // For web applications
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: props.environment === 'prod' 
          ? ['https://app.hallucifix.com/callback']
          : props.distribution 
            ? ['http://localhost:3000/callback', `https://${props.distribution.distributionDomainName}/callback`]
            : ['http://localhost:3000/callback'],
        logoutUrls: props.environment === 'prod'
          ? ['https://app.hallucifix.com/logout']
          : props.distribution
            ? ['http://localhost:3000/logout', `https://${props.distribution.distributionDomainName}/logout`]
            : ['http://localhost:3000/logout'],
      },
    });

    // Ensure the client depends on the Google provider
    this.userPoolClient.node.addDependency(googleProvider);

    // Cognito User Pool Domain for OAuth
    const userPoolDomain = new cognito.UserPoolDomain(this, 'HallucifixUserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: `hallucifix-${props.environment}-${Math.random().toString(36).substring(2, 8)}`,
      },
    });

    // Cognito Identity Pool
    this.identityPool = new cognito.CfnIdentityPool(this, 'HallucifixIdentityPool', {
      identityPoolName: `hallucifix_identity_pool_${props.environment}`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
          serverSideTokenCheck: true,
        },
      ],
      supportedLoginProviders: {
        'accounts.google.com': 'GOOGLE_CLIENT_ID_PLACEHOLDER', // Will be replaced with actual Google OAuth client ID
      },
    });

    // IAM roles for authenticated and unauthenticated users
    const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        CognitoAuthenticatedPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-sync:*',
                'cognito-identity:*',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
              ],
              resources: [`${props.bucket.bucketArn}/user-uploads/\${cognito-identity.amazonaws.com:sub}/*`],
            }),
          ],
        }),
      },
    });

    // Identity Pool Role Attachment
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // Create SNS topic for alerts
    this.alertTopic = new sns.Topic(this, 'LambdaAlertTopic', {
      topicName: `hallucifix-lambda-alerts-${props.environment}`,
      displayName: `HalluciFix Lambda Alerts (${props.environment})`,
    });

    // Lambda execution role
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
      ],
      inlinePolicies: {
        HallucifixLambdaPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'rds-data:ExecuteStatement',
                'rds-data:BatchExecuteStatement',
                'rds-data:BeginTransaction',
                'rds-data:CommitTransaction',
                'rds-data:RollbackTransaction',
              ],
              resources: [props.database.instanceArn],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
              ],
              resources: [`${props.bucket.bucketArn}/*`],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:ListBucket',
              ],
              resources: [props.bucket.bucketArn],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
              ],
              resources: ['*'], // Will be restricted to specific secrets
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
              ],
              resources: ['*'], // Bedrock model ARNs
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-idp:GetUser',
                'cognito-idp:AdminGetUser',
                'cognito-idp:ListUsers',
              ],
              resources: ['*'], // Will be restricted to specific user pools
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ses:SendEmail',
                'ses:SendRawEmail',
              ],
              resources: ['*'], // Will be restricted to specific email addresses
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cloudwatch:PutMetricData',
                'cloudwatch:GetMetricStatistics',
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:StartQuery',
                'logs:GetQueryResults',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sns:Publish',
              ],
              resources: [this.alertTopic.topicArn],
            }),
          ],
        }),
      },
    });

    // Lambda Layer for common dependencies
    const commonLayer = new lambda.LayerVersion(this, 'CommonLayer', {
      layerVersionName: `hallucifix-common-${props.environment}`,
      code: lambda.Code.fromAsset('lambda-layers/common'), // Will be created later
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Common dependencies for HalluciFix Lambda functions',
    });

    // API Gateway
    this.api = new apigateway.RestApi(this, 'HallucifixApi', {
      restApiName: `hallucifix-api-${props.environment}`,
      description: 'HalluciFix API Gateway',
      defaultCorsPreflightOptions: {
        allowOrigins: props.environment === 'prod' 
          ? ['https://app.hallucifix.com']
          : props.distribution
            ? ['http://localhost:3000', `https://${props.distribution.distributionDomainName}`]
            : ['http://localhost:3000'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: props.environment,
      },
    });

    // Cognito Authorizer
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [this.userPool],
      authorizerName: 'HallucifixAuthorizer',
    });

    // Scan Executor Lambda Function (migrated from Supabase Edge Function)
    const scanExecutorFunction = new lambda.Function(this, 'ScanExecutorFunction', {
      functionName: `hallucifix-scan-executor-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-functions/scan-executor'),
      timeout: cdk.Duration.minutes(15),
      memorySize: props.environment === 'prod' ? 1024 : 512,
      environment: {
        NODE_ENV: props.environment,
        AWS_REGION: this.region,
        DB_CLUSTER_ARN: props.database.instanceArn,
        DB_SECRET_ARN: props.database.secret?.secretArn || '',
        HALLUCIFIX_API_KEY_SECRET: `hallucifix-api-key-${props.environment}`,
      },
      role: lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [commonLayer],
      tracing: lambda.Tracing.ACTIVE, // Enable X-Ray tracing
    });

    this.lambdaFunctions.push(scanExecutorFunction);

    // Billing API Lambda Function (migrated from Supabase Edge Function)
    const billingApiFunction = new lambda.Function(this, 'BillingApiFunction', {
      functionName: `hallucifix-billing-api-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-functions/billing-api'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        NODE_ENV: props.environment,
        AWS_REGION: this.region,
        DB_CLUSTER_ARN: props.database.instanceArn,
        DB_SECRET_ARN: props.database.secret?.secretArn || '',
        STRIPE_SECRET_KEY_ARN: `stripe-secret-key-${props.environment}`,
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
      },
      role: lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [commonLayer],
      tracing: lambda.Tracing.ACTIVE,
    });

    this.lambdaFunctions.push(billingApiFunction);

    // Payment Methods API Lambda Function (migrated from Supabase Edge Function)
    const paymentMethodsApiFunction = new lambda.Function(this, 'PaymentMethodsApiFunction', {
      functionName: `hallucifix-payment-methods-api-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-functions/payment-methods-api'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        NODE_ENV: props.environment,
        AWS_REGION: this.region,
        DB_CLUSTER_ARN: props.database.instanceArn,
        DB_SECRET_ARN: props.database.secret?.secretArn || '',
        STRIPE_SECRET_KEY_ARN: `stripe-secret-key-${props.environment}`,
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
      },
      role: lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [commonLayer],
      tracing: lambda.Tracing.ACTIVE,
    });

    this.lambdaFunctions.push(paymentMethodsApiFunction);

    // Stripe Webhook Lambda Function (migrated from Supabase Edge Function)
    const stripeWebhookFunction = new lambda.Function(this, 'StripeWebhookFunction', {
      functionName: `hallucifix-stripe-webhook-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-functions/stripe-webhook'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        NODE_ENV: props.environment,
        AWS_REGION: this.region,
        DB_CLUSTER_ARN: props.database.instanceArn,
        DB_SECRET_ARN: props.database.secret?.secretArn || '',
        STRIPE_SECRET_KEY_ARN: `stripe-secret-key-${props.environment}`,
        STRIPE_WEBHOOK_SECRET_ARN: `stripe-webhook-secret-${props.environment}`,
        FROM_EMAIL: `noreply@hallucifix.com`,
      },
      role: lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [commonLayer],
      tracing: lambda.Tracing.ACTIVE,
    });

    this.lambdaFunctions.push(stripeWebhookFunction);

    // API Gateway routes for migrated functions
    
    // Billing API routes
    const billingResource = this.api.root.addResource('billing');
    billingResource.addMethod('GET', new apigateway.LambdaIntegration(billingApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    billingResource.addMethod('POST', new apigateway.LambdaIntegration(billingApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const billingInfoResource = billingResource.addResource('info');
    billingInfoResource.addMethod('GET', new apigateway.LambdaIntegration(billingApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const billingUsageResource = billingResource.addResource('usage');
    const billingAnalyticsResource = billingUsageResource.addResource('analytics');
    billingAnalyticsResource.addMethod('GET', new apigateway.LambdaIntegration(billingApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const billingInvoicesResource = billingResource.addResource('invoices');
    billingInvoicesResource.addMethod('GET', new apigateway.LambdaIntegration(billingApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const billingPortalResource = billingResource.addResource('portal');
    billingPortalResource.addMethod('POST', new apigateway.LambdaIntegration(billingApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const billingCancelResource = billingResource.addResource('cancel');
    billingCancelResource.addMethod('POST', new apigateway.LambdaIntegration(billingApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Payment Methods API routes
    const paymentMethodsResource = this.api.root.addResource('payment-methods');
    paymentMethodsResource.addMethod('GET', new apigateway.LambdaIntegration(paymentMethodsApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    paymentMethodsResource.addMethod('POST', new apigateway.LambdaIntegration(paymentMethodsApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const setupIntentResource = this.api.root.addResource('setup-intent');
    setupIntentResource.addMethod('POST', new apigateway.LambdaIntegration(paymentMethodsApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const paymentMethodResource = paymentMethodsResource.addResource('{paymentMethodId}');
    paymentMethodResource.addMethod('DELETE', new apigateway.LambdaIntegration(paymentMethodsApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const paymentMethodDefaultResource = paymentMethodResource.addResource('default');
    paymentMethodDefaultResource.addMethod('PUT', new apigateway.LambdaIntegration(paymentMethodsApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const paymentMethodValidateResource = paymentMethodResource.addResource('validate');
    paymentMethodValidateResource.addMethod('GET', new apigateway.LambdaIntegration(paymentMethodsApiFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Stripe Webhook route (no authorization required for webhooks)
    const webhookResource = this.api.root.addResource('webhook');
    const stripeWebhookResource = webhookResource.addResource('stripe');
    stripeWebhookResource.addMethod('POST', new apigateway.LambdaIntegration(stripeWebhookFunction));

    // EventBridge rule to trigger scan executor function every 5 minutes
    const scanExecutorRule = new events.Rule(this, 'ScanExecutorRule', {
      ruleName: `hallucifix-scan-executor-${props.environment}`,
      description: 'Trigger scan executor function every 5 minutes',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    });

    scanExecutorRule.addTarget(new targets.LambdaFunction(scanExecutorFunction));

    // Scan Executor function manual trigger endpoint for testing
    const scanResource = this.api.root.addResource('scan');
    const executeScanResource = scanResource.addResource('execute');
    executeScanResource.addMethod('POST', new apigateway.LambdaIntegration(scanExecutorFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Step Functions integration for batch analysis
    if (props.batchAnalysisStateMachine) {
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
                resources: [props.batchAnalysisStateMachine.stateMachineArn],
              }),
            ],
          }),
        },
      });

      // Batch analysis endpoints
      const batchResource = this.api.root.addResource('batch');
      
      // Start batch analysis
      const startBatchResource = batchResource.addResource('start');
      startBatchResource.addMethod('POST', new apigateway.AwsIntegration({
        service: 'states',
        action: 'StartExecution',
        integrationHttpMethod: 'POST',
        options: {
          credentialsRole: stepFunctionExecutionRole,
          requestTemplates: {
            'application/json': JSON.stringify({
              stateMachineArn: props.batchAnalysisStateMachine.stateMachineArn,
              input: '$util.escapeJavaScript($input.body)',
            }),
          },
          integrationResponses: [
            {
              statusCode: '200',
              responseTemplates: {
                'application/json': JSON.stringify({
                  executionArn: '$input.path(\'$.executionArn\')',
                  startDate: '$input.path(\'$.startDate\')',
                }),
              },
            },
            {
              statusCode: '400',
              selectionPattern: '4\\d{2}',
              responseTemplates: {
                'application/json': JSON.stringify({
                  error: 'Bad Request',
                  message: '$input.path(\'$.errorMessage\')',
                }),
              },
            },
          ],
        },
      }), {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          { statusCode: '200' },
          { statusCode: '400' },
        ],
      });

      // Get batch execution status
      const statusBatchResource = batchResource.addResource('status').addResource('{executionArn+}');
      statusBatchResource.addMethod('GET', new apigateway.AwsIntegration({
        service: 'states',
        action: 'DescribeExecution',
        integrationHttpMethod: 'POST',
        options: {
          credentialsRole: stepFunctionExecutionRole,
          requestTemplates: {
            'application/json': JSON.stringify({
              executionArn: '$method.request.path.executionArn',
            }),
          },
          integrationResponses: [
            {
              statusCode: '200',
              responseTemplates: {
                'application/json': JSON.stringify({
                  executionArn: '$input.path(\'$.executionArn\')',
                  status: '$input.path(\'$.status\')',
                  startDate: '$input.path(\'$.startDate\')',
                  stopDate: '$input.path(\'$.stopDate\')',
                  output: '$input.path(\'$.output\')',
                }),
              },
            },
          ],
        },
      }), {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          { statusCode: '200' },
        ],
      });
    }

    // Monitoring Agent Lambda Function
    const monitoringAgentFunction = new lambda.Function(this, 'MonitoringAgentFunction', {
      functionName: `hallucifix-monitoring-agent-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda-functions/monitoring-agent'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      environment: {
        NODE_ENV: props.environment,
        AWS_REGION: this.region,
        ALERT_TOPIC_ARN: this.alertTopic.topicArn,
        FUNCTION_PREFIX: 'hallucifix',
      },
      role: lambdaRole,
      tracing: lambda.Tracing.ACTIVE,
    });

    this.lambdaFunctions.push(monitoringAgentFunction);

    // Set up monitoring infrastructure
    this.setupLambdaMonitoring();

    // Schedule monitoring agent to run every 5 minutes
    const monitoringRule = new events.Rule(this, 'MonitoringAgentRule', {
      ruleName: `hallucifix-monitoring-agent-${props.environment}`,
      description: 'Trigger monitoring agent every 5 minutes',
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    });

    monitoringRule.addTarget(new targets.LambdaFunction(monitoringAgentFunction));

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${props.environment}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${props.environment}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: `${props.environment}-IdentityPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: userPoolDomain.domainName,
      description: 'Cognito User Pool Domain',
      exportName: `${props.environment}-UserPoolDomain`,
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: `${props.environment}-ApiGatewayUrl`,
    });

    new cdk.CfnOutput(this, 'ScanExecutorFunctionArn', {
      value: scanExecutorFunction.functionArn,
      description: 'Scan Executor Lambda Function ARN',
      exportName: `${props.environment}-ScanExecutorFunctionArn`,
    });

    new cdk.CfnOutput(this, 'BillingApiFunctionArn', {
      value: billingApiFunction.functionArn,
      description: 'Billing API Lambda Function ARN',
      exportName: `${props.environment}-BillingApiFunctionArn`,
    });

    new cdk.CfnOutput(this, 'PaymentMethodsApiFunctionArn', {
      value: paymentMethodsApiFunction.functionArn,
      description: 'Payment Methods API Lambda Function ARN',
      exportName: `${props.environment}-PaymentMethodsApiFunctionArn`,
    });

    new cdk.CfnOutput(this, 'StripeWebhookFunctionArn', {
      value: stripeWebhookFunction.functionArn,
      description: 'Stripe Webhook Lambda Function ARN',
      exportName: `${props.environment}-StripeWebhookFunctionArn`,
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'SNS Topic ARN for Lambda alerts',
      exportName: `${props.environment}-AlertTopicArn`,
    });
  }

  private setupLambdaMonitoring() {
    // Create CloudWatch dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'LambdaDashboard', {
      dashboardName: `hallucifix-lambda-monitoring-${this.stackName}`,
    });

    // Set up monitoring for each Lambda function
    this.lambdaFunctions.forEach((lambdaFunction, index) => {
      this.setupFunctionMonitoring(lambdaFunction, dashboard, index);
    });

    // Create system-wide alarms
    this.createSystemAlarms();
  }

  private setupFunctionMonitoring(lambdaFunction: lambda.Function, dashboard: cloudwatch.Dashboard, index: number) {
    const functionName = lambdaFunction.functionName;

    // Create CloudWatch alarms
    const errorAlarm = new cloudwatch.Alarm(this, `${functionName}ErrorAlarm`, {
      alarmName: `${functionName}-errors`,
      alarmDescription: `Error rate alarm for ${functionName}`,
      metric: lambdaFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
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
      threshold: lambdaFunction.timeout ? lambdaFunction.timeout.toMilliseconds() * 0.8 : 30000,
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
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add alarms to SNS topic
    errorAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
    durationAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
    throttleAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

    // Add widgets to dashboard
    dashboard.addWidgets(
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
      }),
    );

    // Create log group with retention
    new logs.LogGroup(this, `${functionName}LogGroup`, {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }

  private createSystemAlarms() {
    // Create composite alarm for overall system health
    const systemHealthAlarm = new cloudwatch.Alarm(this, 'SystemHealthAlarm', {
      alarmName: 'hallucifix-system-health',
      alarmDescription: 'Overall system health based on Lambda function errors',
      metric: new cloudwatch.MathExpression({
        expression: 'SUM(METRICS())',
        usingMetrics: this.lambdaFunctions.reduce((acc, func, index) => {
          acc[`e${index}`] = func.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          });
          return acc;
        }, {} as Record<string, cloudwatch.IMetric>),
      }),
      threshold: 10, // Alert if total errors across all functions > 10
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    systemHealthAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
  }
}