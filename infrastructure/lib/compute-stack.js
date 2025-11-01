"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HallucifixComputeStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatchActions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
class HallucifixComputeStack extends cdk.Stack {
    userPool;
    userPoolClient;
    identityPool;
    api;
    lambdaFunctions = [];
    alertTopic;
    constructor(scope, id, props) {
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
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
                StringEquals: {
                    'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
                },
                'ForAnyValue:StringLike': {
                    'cognito-identity.amazonaws.com:amr': 'authenticated',
                },
            }, 'sts:AssumeRoleWithWebIdentity'),
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
                                'bedrock:ListFoundationModels',
                                'bedrock:GetFoundationModel',
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
        // File Processor Lambda Function (for S3 file processing)
        const fileProcessorFunction = new lambda.Function(this, 'FileProcessorFunction', {
            functionName: `hallucifix-file-processor-${props.environment}`,
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda-functions/file-processor'),
            timeout: cdk.Duration.minutes(5),
            memorySize: 1024, // Higher memory for file processing
            layers: [commonLayer],
            environment: {
                ENVIRONMENT: props.environment,
                DATABASE_HOST: props.database.instanceEndpoint.hostname,
                DATABASE_PORT: props.database.instanceEndpoint.port.toString(),
                CACHE_HOST: props.cache.attrRedisEndpointAddress,
                CACHE_PORT: '6379',
                S3_BUCKET_NAME: props.bucket.bucketName,
                PROCESSING_RESULTS_TABLE: `hallucifix-processing-results-${props.environment}`,
            },
            vpc: props.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [props.lambdaSecurityGroup],
        });
        // Grant S3 permissions to file processor
        props.bucket.grantReadWrite(fileProcessorFunction);
        this.lambdaFunctions.push(fileProcessorFunction);
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
        // File processing API routes
        const filesResource = this.api.root.addResource('files');
        const processFileResource = filesResource.addResource('process');
        processFileResource.addMethod('POST', new apigateway.LambdaIntegration(fileProcessorFunction), {
            authorizer: cognitoAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const processingStatusResource = filesResource.addResource('processing-status');
        processingStatusResource.addMethod('GET', new apigateway.LambdaIntegration(fileProcessorFunction), {
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
        new cdk.CfnOutput(this, 'FileProcessorFunctionArn', {
            value: fileProcessorFunction.functionArn,
            description: 'File Processor Lambda Function ARN',
            exportName: `${props.environment}-FileProcessorFunctionArn`,
        });
        new cdk.CfnOutput(this, 'AlertTopicArn', {
            value: this.alertTopic.topicArn,
            description: 'SNS Topic ARN for Lambda alerts',
            exportName: `${props.environment}-AlertTopicArn`,
        });
    }
    setupLambdaMonitoring() {
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
    setupFunctionMonitoring(lambdaFunction, dashboard, index) {
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
        errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
        durationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
        throttleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
        // Add widgets to dashboard
        dashboard.addWidgets(new cloudwatch.GraphWidget({
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
        }));
        // Create log group with retention
        new logs.LogGroup(this, `${functionName}LogGroup`, {
            logGroupName: `/aws/lambda/${functionName}`,
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
    }
    createSystemAlarms() {
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
                }, {}),
            }),
            threshold: 10, // Alert if total errors across all functions > 10
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        systemHealthAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
    }
}
exports.HallucifixComputeStack = HallucifixComputeStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHV0ZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvbXB1dGUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsK0RBQWlEO0FBQ2pELHVFQUF5RDtBQUN6RCxpRUFBbUQ7QUFDbkQseURBQTJDO0FBQzNDLHlEQUEyQztBQUszQywrREFBaUQ7QUFDakQsd0VBQTBEO0FBRTFELHVFQUF5RDtBQUN6RCxzRkFBd0U7QUFDeEUseURBQTJDO0FBQzNDLDJEQUE2QztBQWM3QyxNQUFhLHNCQUF1QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ25DLFFBQVEsQ0FBbUI7SUFDM0IsY0FBYyxDQUF5QjtJQUN2QyxZQUFZLENBQTBCO0lBQ3RDLEdBQUcsQ0FBcUI7SUFDeEIsZUFBZSxHQUFzQixFQUFFLENBQUM7SUFDeEMsVUFBVSxDQUFZO0lBRXRDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBa0M7UUFDMUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsb0JBQW9CO1FBQ3BCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUMvRCxZQUFZLEVBQUUsb0JBQW9CLEtBQUssQ0FBQyxXQUFXLEVBQUU7WUFDckQsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixhQUFhLEVBQUU7Z0JBQ2IsS0FBSyxFQUFFLElBQUk7YUFDWjtZQUNELFVBQVUsRUFBRTtnQkFDVixLQUFLLEVBQUUsSUFBSTthQUNaO1lBQ0QsY0FBYyxFQUFFO2dCQUNkLFNBQVMsRUFBRSxDQUFDO2dCQUNaLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLGFBQWEsRUFBRSxJQUFJO2dCQUNuQixjQUFjLEVBQUUsSUFBSTthQUNyQjtZQUNE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QUM3QyxDQUFDO1lBQ0YsU0FBUyxFQUFFLEVBQUUsRUFBRSxrREFBa0Q7WUFDakUsaUJBQWlCLEVBQUUsQ0FBQztZQUNwQixnQkFBZ0IsRUFBRSxVQUFVLENBQUMsZ0JBQWdCLENBQUMsYUFBYTtTQUM1RCxDQUFDLENBQUM7UUFFSCxpQkFBaUIsQ0FBQyxjQUFjLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDckYsQ0FBQztDQUNGO0FBdjNCRCx3REF1M0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyByZHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJkcyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBlbGFzdGljYWNoZSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2FjaGUnO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgc3RlcGZ1bmN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3RlcGZ1bmN0aW9ucyc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2hBY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoLWFjdGlvbnMnO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGludGVyZmFjZSBIYWxsdWNpZml4Q29tcHV0ZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIHZwYzogZWMyLlZwYztcbiAgbGFtYmRhU2VjdXJpdHlHcm91cDogZWMyLlNlY3VyaXR5R3JvdXA7XG4gIGRhdGFiYXNlOiByZHMuRGF0YWJhc2VJbnN0YW5jZTtcbiAgY2FjaGU6IGVsYXN0aWNhY2hlLkNmbkNhY2hlQ2x1c3RlcjtcbiAgYnVja2V0OiBzMy5CdWNrZXQ7XG4gIGRpc3RyaWJ1dGlvbj86IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uO1xuICBiYXRjaEFuYWx5c2lzU3RhdGVNYWNoaW5lPzogc3RlcGZ1bmN0aW9ucy5TdGF0ZU1hY2hpbmU7XG59XG5cbmV4cG9ydCBjbGFzcyBIYWxsdWNpZml4Q29tcHV0ZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG8uVXNlclBvb2xDbGllbnQ7XG4gIHB1YmxpYyByZWFkb25seSBpZGVudGl0eVBvb2w6IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sO1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG4gIHB1YmxpYyByZWFkb25seSBsYW1iZGFGdW5jdGlvbnM6IGxhbWJkYS5GdW5jdGlvbltdID0gW107XG4gIHB1YmxpYyByZWFkb25seSBhbGVydFRvcGljOiBzbnMuVG9waWM7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEhhbGx1Y2lmaXhDb21wdXRlU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2xcbiAgICB0aGlzLnVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ0hhbGx1Y2lmaXhVc2VyUG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogYGhhbGx1Y2lmaXgtdXNlcnMtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICBtZmE6IGNvZ25pdG8uTWZhLk9QVElPTkFMLFxuICAgICAgbWZhU2Vjb25kRmFjdG9yOiB7XG4gICAgICAgIHNtczogdHJ1ZSxcbiAgICAgICAgb3RwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGdpdmVuTmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBmYW1pbHlOYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xuICAgICAgICBzdWJzY3JpcHRpb25UaWVyOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgICB1c2FnZVF1b3RhOiBuZXcgY29nbml0by5OdW1iZXJBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgXG4gICAgICAgID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIFxuICAgICAgICA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBHb29nbGUgT0F1dGggSWRlbnRpdHkgUHJvdmlkZXIgKHBsYWNlaG9sZGVyIC0gcmVxdWlyZXMgR29vZ2xlIE9BdXRoIGNyZWRlbnRpYWxzKVxuICAgIGNvbnN0IGdvb2dsZVByb3ZpZGVyID0gbmV3IGNvZ25pdG8uVXNlclBvb2xJZGVudGl0eVByb3ZpZGVyR29vZ2xlKHRoaXMsICdHb29nbGVQcm92aWRlcicsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgY2xpZW50SWQ6ICdHT09HTEVfQ0xJRU5UX0lEX1BMQUNFSE9MREVSJywgLy8gV2lsbCBiZSByZXBsYWNlZCB3aXRoIGFjdHVhbCBHb29nbGUgT0F1dGggY2xpZW50IElEXG4gICAgICBjbGllbnRTZWNyZXQ6ICdHT09HTEVfQ0xJRU5UX1NFQ1JFVF9QTEFDRUhPTERFUicsIC8vIFdpbGwgYmUgcmVwbGFjZWQgd2l0aCBhY3R1YWwgc2VjcmV0XG4gICAgICBzY29wZXM6IFsnZW1haWwnLCAncHJvZmlsZScsICdvcGVuaWQnLCAnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9kcml2ZS5yZWFkb25seSddLFxuICAgICAgYXR0cmlidXRlTWFwcGluZzoge1xuICAgICAgICBlbWFpbDogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRU1BSUwsXG4gICAgICAgIGdpdmVuTmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfR0lWRU5fTkFNRSxcbiAgICAgICAgZmFtaWx5TmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRkFNSUxZX05BTUUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50XG4gICAgdGhpcy51c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdIYWxsdWNpZml4VXNlclBvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYGhhbGx1Y2lmaXgtY2xpZW50LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSwgLy8gRm9yIHdlYiBhcHBsaWNhdGlvbnNcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyU3JwOiB0cnVlLFxuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgc3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuR09PR0xFLFxuICAgICAgXSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgICBpbXBsaWNpdENvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEUsXG4gICAgICAgIF0sXG4gICAgICAgIGNhbGxiYWNrVXJsczogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyBcbiAgICAgICAgICA/IFsnaHR0cHM6Ly9hcHAuaGFsbHVjaWZpeC5jb20vY2FsbGJhY2snXVxuICAgICAgICAgIDogcHJvcHMuZGlzdHJpYnV0aW9uIFxuICAgICAgICAgICAgPyBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9jYWxsYmFjaycsIGBodHRwczovLyR7cHJvcHMuZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9L2NhbGxiYWNrYF1cbiAgICAgICAgICAgIDogWydodHRwOi8vbG9jYWxob3N0OjMwMDAvY2FsbGJhY2snXSxcbiAgICAgICAgbG9nb3V0VXJsczogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJ1xuICAgICAgICAgID8gWydodHRwczovL2FwcC5oYWxsdWNpZml4LmNvbS9sb2dvdXQnXVxuICAgICAgICAgIDogcHJvcHMuZGlzdHJpYnV0aW9uXG4gICAgICAgICAgICA/IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwL2xvZ291dCcsIGBodHRwczovLyR7cHJvcHMuZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9L2xvZ291dGBdXG4gICAgICAgICAgICA6IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwL2xvZ291dCddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSB0aGUgY2xpZW50IGRlcGVuZHMgb24gdGhlIEdvb2dsZSBwcm92aWRlclxuICAgIHRoaXMudXNlclBvb2xDbGllbnQubm9kZS5hZGREZXBlbmRlbmN5KGdvb2dsZVByb3ZpZGVyKTtcblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIERvbWFpbiBmb3IgT0F1dGhcbiAgICBjb25zdCB1c2VyUG9vbERvbWFpbiA9IG5ldyBjb2duaXRvLlVzZXJQb29sRG9tYWluKHRoaXMsICdIYWxsdWNpZml4VXNlclBvb2xEb21haW4nLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIGNvZ25pdG9Eb21haW46IHtcbiAgICAgICAgZG9tYWluUHJlZml4OiBgaGFsbHVjaWZpeC0ke3Byb3BzLmVudmlyb25tZW50fS0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygyLCA4KX1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gSWRlbnRpdHkgUG9vbFxuICAgIHRoaXMuaWRlbnRpdHlQb29sID0gbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sKHRoaXMsICdIYWxsdWNpZml4SWRlbnRpdHlQb29sJywge1xuICAgICAgaWRlbnRpdHlQb29sTmFtZTogYGhhbGx1Y2lmaXhfaWRlbnRpdHlfcG9vbF8ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBhbGxvd1VuYXV0aGVudGljYXRlZElkZW50aXRpZXM6IGZhbHNlLFxuICAgICAgY29nbml0b0lkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBjbGllbnRJZDogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICAgIHByb3ZpZGVyTmFtZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbFByb3ZpZGVyTmFtZSxcbiAgICAgICAgICBzZXJ2ZXJTaWRlVG9rZW5DaGVjazogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBzdXBwb3J0ZWRMb2dpblByb3ZpZGVyczoge1xuICAgICAgICAnYWNjb3VudHMuZ29vZ2xlLmNvbSc6ICdHT09HTEVfQ0xJRU5UX0lEX1BMQUNFSE9MREVSJywgLy8gV2lsbCBiZSByZXBsYWNlZCB3aXRoIGFjdHVhbCBHb29nbGUgT0F1dGggY2xpZW50IElEXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gSUFNIHJvbGVzIGZvciBhdXRoZW50aWNhdGVkIGFuZCB1bmF1dGhlbnRpY2F0ZWQgdXNlcnNcbiAgICBjb25zdCBhdXRoZW50aWNhdGVkUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ29nbml0b0F1dGhlbnRpY2F0ZWRSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcbiAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbScsXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkJzogdGhpcy5pZGVudGl0eVBvb2wucmVmLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgJ0ZvckFueVZhbHVlOlN0cmluZ0xpa2UnOiB7XG4gICAgICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtcic6ICdhdXRoZW50aWNhdGVkJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICAnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknXG4gICAgICApLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgQ29nbml0b0F1dGhlbnRpY2F0ZWRQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2NvZ25pdG8tc3luYzoqJyxcbiAgICAgICAgICAgICAgICAnY29nbml0by1pZGVudGl0eToqJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYCR7cHJvcHMuYnVja2V0LmJ1Y2tldEFybn0vdXNlci11cGxvYWRzL1xcJHtjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206c3VifS8qYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBJZGVudGl0eSBQb29sIFJvbGUgQXR0YWNobWVudFxuICAgIG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50KHRoaXMsICdJZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudCcsIHtcbiAgICAgIGlkZW50aXR5UG9vbElkOiB0aGlzLmlkZW50aXR5UG9vbC5yZWYsXG4gICAgICByb2xlczoge1xuICAgICAgICBhdXRoZW50aWNhdGVkOiBhdXRoZW50aWNhdGVkUm9sZS5yb2xlQXJuLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBTTlMgdG9waWMgZm9yIGFsZXJ0c1xuICAgIHRoaXMuYWxlcnRUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ0xhbWJkYUFsZXJ0VG9waWMnLCB7XG4gICAgICB0b3BpY05hbWU6IGBoYWxsdWNpZml4LWxhbWJkYS1hbGVydHMtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgZGlzcGxheU5hbWU6IGBIYWxsdWNpRml4IExhbWJkYSBBbGVydHMgKCR7cHJvcHMuZW52aXJvbm1lbnR9KWAsXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZXhlY3V0aW9uIHJvbGVcbiAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdMYW1iZGFFeGVjdXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhVlBDQWNjZXNzRXhlY3V0aW9uUm9sZScpLFxuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FXU1hSYXlEYWVtb25Xcml0ZUFjY2VzcycpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIEhhbGx1Y2lmaXhMYW1iZGFQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3Jkcy1kYXRhOkV4ZWN1dGVTdGF0ZW1lbnQnLFxuICAgICAgICAgICAgICAgICdyZHMtZGF0YTpCYXRjaEV4ZWN1dGVTdGF0ZW1lbnQnLFxuICAgICAgICAgICAgICAgICdyZHMtZGF0YTpCZWdpblRyYW5zYWN0aW9uJyxcbiAgICAgICAgICAgICAgICAncmRzLWRhdGE6Q29tbWl0VHJhbnNhY3Rpb24nLFxuICAgICAgICAgICAgICAgICdyZHMtZGF0YTpSb2xsYmFja1RyYW5zYWN0aW9uJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMuZGF0YWJhc2UuaW5zdGFuY2VBcm5dLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgJHtwcm9wcy5idWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5idWNrZXQuYnVja2V0QXJuXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLCAvLyBXaWxsIGJlIHJlc3RyaWN0ZWQgdG8gc3BlY2lmaWMgc2VjcmV0c1xuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAgICAgICAgICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbFdpdGhSZXNwb25zZVN0cmVhbScsXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6TGlzdEZvdW5kYXRpb25Nb2RlbHMnLFxuICAgICAgICAgICAgICAgICdiZWRyb2NrOkdldEZvdW5kYXRpb25Nb2RlbCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sIC8vIEJlZHJvY2sgbW9kZWwgQVJOc1xuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdjb2duaXRvLWlkcDpHZXRVc2VyJyxcbiAgICAgICAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyxcbiAgICAgICAgICAgICAgICAnY29nbml0by1pZHA6TGlzdFVzZXJzJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSwgLy8gV2lsbCBiZSByZXN0cmljdGVkIHRvIHNwZWNpZmljIHVzZXIgcG9vbHNcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnc2VzOlNlbmRFbWFpbCcsXG4gICAgICAgICAgICAgICAgJ3NlczpTZW5kUmF3RW1haWwnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLCAvLyBXaWxsIGJlIHJlc3RyaWN0ZWQgdG8gc3BlY2lmaWMgZW1haWwgYWRkcmVzc2VzXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2Nsb3Vkd2F0Y2g6UHV0TWV0cmljRGF0YScsXG4gICAgICAgICAgICAgICAgJ2Nsb3Vkd2F0Y2g6R2V0TWV0cmljU3RhdGlzdGljcycsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJyxcbiAgICAgICAgICAgICAgICAnbG9nczpTdGFydFF1ZXJ5JyxcbiAgICAgICAgICAgICAgICAnbG9nczpHZXRRdWVyeVJlc3VsdHMnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzbnM6UHVibGlzaCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW3RoaXMuYWxlcnRUb3BpYy50b3BpY0Fybl0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgTGF5ZXIgZm9yIGNvbW1vbiBkZXBlbmRlbmNpZXNcbiAgICBjb25zdCBjb21tb25MYXllciA9IG5ldyBsYW1iZGEuTGF5ZXJWZXJzaW9uKHRoaXMsICdDb21tb25MYXllcicsIHtcbiAgICAgIGxheWVyVmVyc2lvbk5hbWU6IGBoYWxsdWNpZml4LWNvbW1vbi0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS1sYXllcnMvY29tbW9uJyksIC8vIFdpbGwgYmUgY3JlYXRlZCBsYXRlclxuICAgICAgY29tcGF0aWJsZVJ1bnRpbWVzOiBbbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1hdLFxuICAgICAgZGVzY3JpcHRpb246ICdDb21tb24gZGVwZW5kZW5jaWVzIGZvciBIYWxsdWNpRml4IExhbWJkYSBmdW5jdGlvbnMnLFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXlcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ0hhbGx1Y2lmaXhBcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYGhhbGx1Y2lmaXgtYXBpLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSGFsbHVjaUZpeCBBUEkgR2F0ZXdheScsXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxuICAgICAgICAgID8gWydodHRwczovL2FwcC5oYWxsdWNpZml4LmNvbSddXG4gICAgICAgICAgOiBwcm9wcy5kaXN0cmlidXRpb25cbiAgICAgICAgICAgID8gWydodHRwOi8vbG9jYWxob3N0OjMwMDAnLCBgaHR0cHM6Ly8ke3Byb3BzLmRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWBdXG4gICAgICAgICAgICA6IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwJ10sXG4gICAgICAgIGFsbG93TWV0aG9kczogWydHRVQnLCAnUE9TVCcsICdQVVQnLCAnREVMRVRFJywgJ09QVElPTlMnXSxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdBdXRob3JpemF0aW9uJ10sXG4gICAgICB9LFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gQXV0aG9yaXplclxuICAgIGNvbnN0IGNvZ25pdG9BdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ0NvZ25pdG9BdXRob3JpemVyJywge1xuICAgICAgY29nbml0b1VzZXJQb29sczogW3RoaXMudXNlclBvb2xdLFxuICAgICAgYXV0aG9yaXplck5hbWU6ICdIYWxsdWNpZml4QXV0aG9yaXplcicsXG4gICAgfSk7XG5cbiAgICAvLyBTY2FuIEV4ZWN1dG9yIExhbWJkYSBGdW5jdGlvbiAobWlncmF0ZWQgZnJvbSBTdXBhYmFzZSBFZGdlIEZ1bmN0aW9uKVxuICAgIGNvbnN0IHNjYW5FeGVjdXRvckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU2NhbkV4ZWN1dG9yRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBoYWxsdWNpZml4LXNjYW4tZXhlY3V0b3ItJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS1mdW5jdGlvbnMvc2Nhbi1leGVjdXRvcicpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDEwMjQgOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOT0RFX0VOVjogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgIEFXU19SRUdJT046IHRoaXMucmVnaW9uLFxuICAgICAgICBEQl9DTFVTVEVSX0FSTjogcHJvcHMuZGF0YWJhc2UuaW5zdGFuY2VBcm4sXG4gICAgICAgIERCX1NFQ1JFVF9BUk46IHByb3BzLmRhdGFiYXNlLnNlY3JldD8uc2VjcmV0QXJuIHx8ICcnLFxuICAgICAgICBIQUxMVUNJRklYX0FQSV9LRVlfU0VDUkVUOiBgaGFsbHVjaWZpeC1hcGkta2V5LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIH0sXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5sYW1iZGFTZWN1cml0eUdyb3VwXSxcbiAgICAgIGxheWVyczogW2NvbW1vbkxheWVyXSxcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSwgLy8gRW5hYmxlIFgtUmF5IHRyYWNpbmdcbiAgICB9KTtcblxuICAgIHRoaXMubGFtYmRhRnVuY3Rpb25zLnB1c2goc2NhbkV4ZWN1dG9yRnVuY3Rpb24pO1xuXG4gICAgLy8gQmlsbGluZyBBUEkgTGFtYmRhIEZ1bmN0aW9uIChtaWdyYXRlZCBmcm9tIFN1cGFiYXNlIEVkZ2UgRnVuY3Rpb24pXG4gICAgY29uc3QgYmlsbGluZ0FwaUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQmlsbGluZ0FwaUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgaGFsbHVjaWZpeC1iaWxsaW5nLWFwaS0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhLWZ1bmN0aW9ucy9iaWxsaW5nLWFwaScpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9ERV9FTlY6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICBBV1NfUkVHSU9OOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgREJfQ0xVU1RFUl9BUk46IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlQXJuLFxuICAgICAgICBEQl9TRUNSRVRfQVJOOiBwcm9wcy5kYXRhYmFzZS5zZWNyZXQ/LnNlY3JldEFybiB8fCAnJyxcbiAgICAgICAgU1RSSVBFX1NFQ1JFVF9LRVlfQVJOOiBgc3RyaXBlLXNlY3JldC1rZXktJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgfSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmxhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgbGF5ZXJzOiBbY29tbW9uTGF5ZXJdLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgIH0pO1xuXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbnMucHVzaChiaWxsaW5nQXBpRnVuY3Rpb24pO1xuXG4gICAgLy8gUGF5bWVudCBNZXRob2RzIEFQSSBMYW1iZGEgRnVuY3Rpb24gKG1pZ3JhdGVkIGZyb20gU3VwYWJhc2UgRWRnZSBGdW5jdGlvbilcbiAgICBjb25zdCBwYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGhhbGx1Y2lmaXgtcGF5bWVudC1tZXRob2RzLWFwaS0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhLWZ1bmN0aW9ucy9wYXltZW50LW1ldGhvZHMtYXBpJyksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOT0RFX0VOVjogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgIEFXU19SRUdJT046IHRoaXMucmVnaW9uLFxuICAgICAgICBEQl9DTFVTVEVSX0FSTjogcHJvcHMuZGF0YWJhc2UuaW5zdGFuY2VBcm4sXG4gICAgICAgIERCX1NFQ1JFVF9BUk46IHByb3BzLmRhdGFiYXNlLnNlY3JldD8uc2VjcmV0QXJuIHx8ICcnLFxuICAgICAgICBTVFJJUEVfU0VDUkVUX0tFWV9BUk46IGBzdHJpcGUtc2VjcmV0LWtleS0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICAgIENPR05JVE9fVVNFUl9QT09MX0lEOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICB9LFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMubGFtYmRhU2VjdXJpdHlHcm91cF0sXG4gICAgICBsYXllcnM6IFtjb21tb25MYXllcl0sXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgfSk7XG5cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9ucy5wdXNoKHBheW1lbnRNZXRob2RzQXBpRnVuY3Rpb24pO1xuXG4gICAgLy8gU3RyaXBlIFdlYmhvb2sgTGFtYmRhIEZ1bmN0aW9uIChtaWdyYXRlZCBmcm9tIFN1cGFiYXNlIEVkZ2UgRnVuY3Rpb24pXG4gICAgY29uc3Qgc3RyaXBlV2ViaG9va0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU3RyaXBlV2ViaG9va0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgaGFsbHVjaWZpeC1zdHJpcGUtd2ViaG9vay0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhLWZ1bmN0aW9ucy9zdHJpcGUtd2ViaG9vaycpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOT0RFX0VOVjogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgIEFXU19SRUdJT046IHRoaXMucmVnaW9uLFxuICAgICAgICBEQl9DTFVTVEVSX0FSTjogcHJvcHMuZGF0YWJhc2UuaW5zdGFuY2VBcm4sXG4gICAgICAgIERCX1NFQ1JFVF9BUk46IHByb3BzLmRhdGFiYXNlLnNlY3JldD8uc2VjcmV0QXJuIHx8ICcnLFxuICAgICAgICBTVFJJUEVfU0VDUkVUX0tFWV9BUk46IGBzdHJpcGUtc2VjcmV0LWtleS0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICAgIFNUUklQRV9XRUJIT09LX1NFQ1JFVF9BUk46IGBzdHJpcGUtd2ViaG9vay1zZWNyZXQtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICBGUk9NX0VNQUlMOiBgbm9yZXBseUBoYWxsdWNpZml4LmNvbWAsXG4gICAgICB9LFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMubGFtYmRhU2VjdXJpdHlHcm91cF0sXG4gICAgICBsYXllcnM6IFtjb21tb25MYXllcl0sXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgfSk7XG5cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9ucy5wdXNoKHN0cmlwZVdlYmhvb2tGdW5jdGlvbik7XG5cbiAgICAvLyBGaWxlIFByb2Nlc3NvciBMYW1iZGEgRnVuY3Rpb24gKGZvciBTMyBmaWxlIHByb2Nlc3NpbmcpXG4gICAgY29uc3QgZmlsZVByb2Nlc3NvckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRmlsZVByb2Nlc3NvckZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgaGFsbHVjaWZpeC1maWxlLXByb2Nlc3Nvci0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhLWZ1bmN0aW9ucy9maWxlLXByb2Nlc3NvcicpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LCAvLyBIaWdoZXIgbWVtb3J5IGZvciBmaWxlIHByb2Nlc3NpbmdcbiAgICAgIGxheWVyczogW2NvbW1vbkxheWVyXSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVOVklST05NRU5UOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgREFUQUJBU0VfSE9TVDogcHJvcHMuZGF0YWJhc2UuaW5zdGFuY2VFbmRwb2ludC5ob3N0bmFtZSxcbiAgICAgICAgREFUQUJBU0VfUE9SVDogcHJvcHMuZGF0YWJhc2UuaW5zdGFuY2VFbmRwb2ludC5wb3J0LnRvU3RyaW5nKCksXG4gICAgICAgIENBQ0hFX0hPU1Q6IHByb3BzLmNhY2hlLmF0dHJSZWRpc0VuZHBvaW50QWRkcmVzcyxcbiAgICAgICAgQ0FDSEVfUE9SVDogJzYzNzknLFxuICAgICAgICBTM19CVUNLRVRfTkFNRTogcHJvcHMuYnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFBST0NFU1NJTkdfUkVTVUxUU19UQUJMRTogYGhhbGx1Y2lmaXgtcHJvY2Vzc2luZy1yZXN1bHRzLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIH0sXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmxhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgUzMgcGVybWlzc2lvbnMgdG8gZmlsZSBwcm9jZXNzb3JcbiAgICBwcm9wcy5idWNrZXQuZ3JhbnRSZWFkV3JpdGUoZmlsZVByb2Nlc3NvckZ1bmN0aW9uKTtcblxuICAgIHRoaXMubGFtYmRhRnVuY3Rpb25zLnB1c2goZmlsZVByb2Nlc3NvckZ1bmN0aW9uKTtcblxuICAgIC8vIEFQSSBHYXRld2F5IHJvdXRlcyBmb3IgbWlncmF0ZWQgZnVuY3Rpb25zXG4gICAgXG4gICAgLy8gQmlsbGluZyBBUEkgcm91dGVzXG4gICAgY29uc3QgYmlsbGluZ1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYmlsbGluZycpO1xuICAgIGJpbGxpbmdSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGJpbGxpbmdBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcbiAgICBiaWxsaW5nUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYmlsbGluZ0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmlsbGluZ0luZm9SZXNvdXJjZSA9IGJpbGxpbmdSZXNvdXJjZS5hZGRSZXNvdXJjZSgnaW5mbycpO1xuICAgIGJpbGxpbmdJbmZvUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihiaWxsaW5nQXBpRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBiaWxsaW5nVXNhZ2VSZXNvdXJjZSA9IGJpbGxpbmdSZXNvdXJjZS5hZGRSZXNvdXJjZSgndXNhZ2UnKTtcbiAgICBjb25zdCBiaWxsaW5nQW5hbHl0aWNzUmVzb3VyY2UgPSBiaWxsaW5nVXNhZ2VSZXNvdXJjZS5hZGRSZXNvdXJjZSgnYW5hbHl0aWNzJyk7XG4gICAgYmlsbGluZ0FuYWx5dGljc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYmlsbGluZ0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmlsbGluZ0ludm9pY2VzUmVzb3VyY2UgPSBiaWxsaW5nUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2ludm9pY2VzJyk7XG4gICAgYmlsbGluZ0ludm9pY2VzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihiaWxsaW5nQXBpRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBiaWxsaW5nUG9ydGFsUmVzb3VyY2UgPSBiaWxsaW5nUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3BvcnRhbCcpO1xuICAgIGJpbGxpbmdQb3J0YWxSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihiaWxsaW5nQXBpRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBiaWxsaW5nQ2FuY2VsUmVzb3VyY2UgPSBiaWxsaW5nUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2NhbmNlbCcpO1xuICAgIGJpbGxpbmdDYW5jZWxSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihiaWxsaW5nQXBpRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBQYXltZW50IE1ldGhvZHMgQVBJIHJvdXRlc1xuICAgIGNvbnN0IHBheW1lbnRNZXRob2RzUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdwYXltZW50LW1ldGhvZHMnKTtcbiAgICBwYXltZW50TWV0aG9kc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcbiAgICBwYXltZW50TWV0aG9kc1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBheW1lbnRNZXRob2RzQXBpRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzZXR1cEludGVudFJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnc2V0dXAtaW50ZW50Jyk7XG4gICAgc2V0dXBJbnRlbnRSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGF5bWVudE1ldGhvZFJlc291cmNlID0gcGF5bWVudE1ldGhvZHNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3BheW1lbnRNZXRob2RJZH0nKTtcbiAgICBwYXltZW50TWV0aG9kUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGF5bWVudE1ldGhvZERlZmF1bHRSZXNvdXJjZSA9IHBheW1lbnRNZXRob2RSZXNvdXJjZS5hZGRSZXNvdXJjZSgnZGVmYXVsdCcpO1xuICAgIHBheW1lbnRNZXRob2REZWZhdWx0UmVzb3VyY2UuYWRkTWV0aG9kKCdQVVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGF5bWVudE1ldGhvZFZhbGlkYXRlUmVzb3VyY2UgPSBwYXltZW50TWV0aG9kUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3ZhbGlkYXRlJyk7XG4gICAgcGF5bWVudE1ldGhvZFZhbGlkYXRlUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gRmlsZSBwcm9jZXNzaW5nIEFQSSByb3V0ZXNcbiAgICBjb25zdCBmaWxlc1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnZmlsZXMnKTtcbiAgICBjb25zdCBwcm9jZXNzRmlsZVJlc291cmNlID0gZmlsZXNSZXNvdXJjZS5hZGRSZXNvdXJjZSgncHJvY2VzcycpO1xuICAgIHByb2Nlc3NGaWxlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZmlsZVByb2Nlc3NvckZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcHJvY2Vzc2luZ1N0YXR1c1Jlc291cmNlID0gZmlsZXNSZXNvdXJjZS5hZGRSZXNvdXJjZSgncHJvY2Vzc2luZy1zdGF0dXMnKTtcbiAgICBwcm9jZXNzaW5nU3RhdHVzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihmaWxlUHJvY2Vzc29yRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBTdHJpcGUgV2ViaG9vayByb3V0ZSAobm8gYXV0aG9yaXphdGlvbiByZXF1aXJlZCBmb3Igd2ViaG9va3MpXG4gICAgY29uc3Qgd2ViaG9va1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnd2ViaG9vaycpO1xuICAgIGNvbnN0IHN0cmlwZVdlYmhvb2tSZXNvdXJjZSA9IHdlYmhvb2tSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc3RyaXBlJyk7XG4gICAgc3RyaXBlV2ViaG9va1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHN0cmlwZVdlYmhvb2tGdW5jdGlvbikpO1xuXG4gICAgLy8gRXZlbnRCcmlkZ2UgcnVsZSB0byB0cmlnZ2VyIHNjYW4gZXhlY3V0b3IgZnVuY3Rpb24gZXZlcnkgNSBtaW51dGVzXG4gICAgY29uc3Qgc2NhbkV4ZWN1dG9yUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnU2NhbkV4ZWN1dG9yUnVsZScsIHtcbiAgICAgIHJ1bGVOYW1lOiBgaGFsbHVjaWZpeC1zY2FuLWV4ZWN1dG9yLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHJpZ2dlciBzY2FuIGV4ZWN1dG9yIGZ1bmN0aW9uIGV2ZXJ5IDUgbWludXRlcycsXG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSkpLFxuICAgIH0pO1xuXG4gICAgc2NhbkV4ZWN1dG9yUnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24oc2NhbkV4ZWN1dG9yRnVuY3Rpb24pKTtcblxuICAgIC8vIFNjYW4gRXhlY3V0b3IgZnVuY3Rpb24gbWFudWFsIHRyaWdnZXIgZW5kcG9pbnQgZm9yIHRlc3RpbmdcbiAgICBjb25zdCBzY2FuUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdzY2FuJyk7XG4gICAgY29uc3QgZXhlY3V0ZVNjYW5SZXNvdXJjZSA9IHNjYW5SZXNvdXJjZS5hZGRSZXNvdXJjZSgnZXhlY3V0ZScpO1xuICAgIGV4ZWN1dGVTY2FuUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oc2NhbkV4ZWN1dG9yRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBTdGVwIEZ1bmN0aW9ucyBpbnRlZ3JhdGlvbiBmb3IgYmF0Y2ggYW5hbHlzaXNcbiAgICBpZiAocHJvcHMuYmF0Y2hBbmFseXNpc1N0YXRlTWFjaGluZSkge1xuICAgICAgY29uc3Qgc3RlcEZ1bmN0aW9uRXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnU3RlcEZ1bmN0aW9uRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2FwaWdhdGV3YXkuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICAgIFN0ZXBGdW5jdGlvbkV4ZWN1dGlvblBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgJ3N0YXRlczpTdGFydEV4ZWN1dGlvbicsXG4gICAgICAgICAgICAgICAgICAnc3RhdGVzOkRlc2NyaWJlRXhlY3V0aW9uJyxcbiAgICAgICAgICAgICAgICAgICdzdGF0ZXM6U3RvcEV4ZWN1dGlvbicsXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5iYXRjaEFuYWx5c2lzU3RhdGVNYWNoaW5lLnN0YXRlTWFjaGluZUFybl0sXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBCYXRjaCBhbmFseXNpcyBlbmRwb2ludHNcbiAgICAgIGNvbnN0IGJhdGNoUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdiYXRjaCcpO1xuICAgICAgXG4gICAgICAvLyBTdGFydCBiYXRjaCBhbmFseXNpc1xuICAgICAgY29uc3Qgc3RhcnRCYXRjaFJlc291cmNlID0gYmF0Y2hSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc3RhcnQnKTtcbiAgICAgIHN0YXJ0QmF0Y2hSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5Bd3NJbnRlZ3JhdGlvbih7XG4gICAgICAgIHNlcnZpY2U6ICdzdGF0ZXMnLFxuICAgICAgICBhY3Rpb246ICdTdGFydEV4ZWN1dGlvbicsXG4gICAgICAgIGludGVncmF0aW9uSHR0cE1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgY3JlZGVudGlhbHNSb2xlOiBzdGVwRnVuY3Rpb25FeGVjdXRpb25Sb2xlLFxuICAgICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICBzdGF0ZU1hY2hpbmVBcm46IHByb3BzLmJhdGNoQW5hbHlzaXNTdGF0ZU1hY2hpbmUuc3RhdGVNYWNoaW5lQXJuLFxuICAgICAgICAgICAgICBpbnB1dDogJyR1dGlsLmVzY2FwZUphdmFTY3JpcHQoJGlucHV0LmJvZHkpJyxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgaW50ZWdyYXRpb25SZXNwb25zZXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgICAgIHJlc3BvbnNlVGVtcGxhdGVzOiB7XG4gICAgICAgICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICBleGVjdXRpb25Bcm46ICckaW5wdXQucGF0aChcXCckLmV4ZWN1dGlvbkFyblxcJyknLFxuICAgICAgICAgICAgICAgICAgc3RhcnREYXRlOiAnJGlucHV0LnBhdGgoXFwnJC5zdGFydERhdGVcXCcpJyxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0YXR1c0NvZGU6ICc0MDAnLFxuICAgICAgICAgICAgICBzZWxlY3Rpb25QYXR0ZXJuOiAnNFxcXFxkezJ9JyxcbiAgICAgICAgICAgICAgcmVzcG9uc2VUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICAgIGVycm9yOiAnQmFkIFJlcXVlc3QnLFxuICAgICAgICAgICAgICAgICAgbWVzc2FnZTogJyRpbnB1dC5wYXRoKFxcJyQuZXJyb3JNZXNzYWdlXFwnKScsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9KSwge1xuICAgICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxuICAgICAgICAgIHsgc3RhdHVzQ29kZTogJzQwMCcgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBHZXQgYmF0Y2ggZXhlY3V0aW9uIHN0YXR1c1xuICAgICAgY29uc3Qgc3RhdHVzQmF0Y2hSZXNvdXJjZSA9IGJhdGNoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0YXR1cycpLmFkZFJlc291cmNlKCd7ZXhlY3V0aW9uQXJuK30nKTtcbiAgICAgIHN0YXR1c0JhdGNoUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5Bd3NJbnRlZ3JhdGlvbih7XG4gICAgICAgIHNlcnZpY2U6ICdzdGF0ZXMnLFxuICAgICAgICBhY3Rpb246ICdEZXNjcmliZUV4ZWN1dGlvbicsXG4gICAgICAgIGludGVncmF0aW9uSHR0cE1ldGhvZDogJ1BPU1QnLFxuICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgY3JlZGVudGlhbHNSb2xlOiBzdGVwRnVuY3Rpb25FeGVjdXRpb25Sb2xlLFxuICAgICAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICBleGVjdXRpb25Bcm46ICckbWV0aG9kLnJlcXVlc3QucGF0aC5leGVjdXRpb25Bcm4nLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgfSxcbiAgICAgICAgICBpbnRlZ3JhdGlvblJlc3BvbnNlczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdGF0dXNDb2RlOiAnMjAwJyxcbiAgICAgICAgICAgICAgcmVzcG9uc2VUZW1wbGF0ZXM6IHtcbiAgICAgICAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICAgIGV4ZWN1dGlvbkFybjogJyRpbnB1dC5wYXRoKFxcJyQuZXhlY3V0aW9uQXJuXFwnKScsXG4gICAgICAgICAgICAgICAgICBzdGF0dXM6ICckaW5wdXQucGF0aChcXCckLnN0YXR1c1xcJyknLFxuICAgICAgICAgICAgICAgICAgc3RhcnREYXRlOiAnJGlucHV0LnBhdGgoXFwnJC5zdGFydERhdGVcXCcpJyxcbiAgICAgICAgICAgICAgICAgIHN0b3BEYXRlOiAnJGlucHV0LnBhdGgoXFwnJC5zdG9wRGF0ZVxcJyknLFxuICAgICAgICAgICAgICAgICAgb3V0cHV0OiAnJGlucHV0LnBhdGgoXFwnJC5vdXRwdXRcXCcpJyxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pLCB7XG4gICAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgICBtZXRob2RSZXNwb25zZXM6IFtcbiAgICAgICAgICB7IHN0YXR1c0NvZGU6ICcyMDAnIH0sXG4gICAgICAgIF0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBNb25pdG9yaW5nIEFnZW50IExhbWJkYSBGdW5jdGlvblxuICAgIGNvbnN0IG1vbml0b3JpbmdBZ2VudEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnTW9uaXRvcmluZ0FnZW50RnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBoYWxsdWNpZml4LW1vbml0b3JpbmctYWdlbnQtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS1mdW5jdGlvbnMvbW9uaXRvcmluZy1hZ2VudCcpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9ERV9FTlY6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICBBV1NfUkVHSU9OOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgQUxFUlRfVE9QSUNfQVJOOiB0aGlzLmFsZXJ0VG9waWMudG9waWNBcm4sXG4gICAgICAgIEZVTkNUSU9OX1BSRUZJWDogJ2hhbGx1Y2lmaXgnLFxuICAgICAgfSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgfSk7XG5cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9ucy5wdXNoKG1vbml0b3JpbmdBZ2VudEZ1bmN0aW9uKTtcblxuICAgIC8vIFNldCB1cCBtb25pdG9yaW5nIGluZnJhc3RydWN0dXJlXG4gICAgdGhpcy5zZXR1cExhbWJkYU1vbml0b3JpbmcoKTtcblxuICAgIC8vIFNjaGVkdWxlIG1vbml0b3JpbmcgYWdlbnQgdG8gcnVuIGV2ZXJ5IDUgbWludXRlc1xuICAgIGNvbnN0IG1vbml0b3JpbmdSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdNb25pdG9yaW5nQWdlbnRSdWxlJywge1xuICAgICAgcnVsZU5hbWU6IGBoYWxsdWNpZml4LW1vbml0b3JpbmctYWdlbnQtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246ICdUcmlnZ2VyIG1vbml0b3JpbmcgYWdlbnQgZXZlcnkgNSBtaW51dGVzJyxcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUucmF0ZShjZGsuRHVyYXRpb24ubWludXRlcyg1KSksXG4gICAgfSk7XG5cbiAgICBtb25pdG9yaW5nUnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24obW9uaXRvcmluZ0FnZW50RnVuY3Rpb24pKTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1Vc2VyUG9vbElkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbENsaWVudElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1Vc2VyUG9vbENsaWVudElkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdJZGVudGl0eVBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmlkZW50aXR5UG9vbC5yZWYsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gSWRlbnRpdHkgUG9vbCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tSWRlbnRpdHlQb29sSWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sRG9tYWluJywge1xuICAgICAgdmFsdWU6IHVzZXJQb29sRG9tYWluLmRvbWFpbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIERvbWFpbicsXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tVXNlclBvb2xEb21haW5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUdhdGV3YXlVcmwnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LUFwaUdhdGV3YXlVcmxgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1NjYW5FeGVjdXRvckZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHNjYW5FeGVjdXRvckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTY2FuIEV4ZWN1dG9yIExhbWJkYSBGdW5jdGlvbiBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LVNjYW5FeGVjdXRvckZ1bmN0aW9uQXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCaWxsaW5nQXBpRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogYmlsbGluZ0FwaUZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdCaWxsaW5nIEFQSSBMYW1iZGEgRnVuY3Rpb24gQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1CaWxsaW5nQXBpRnVuY3Rpb25Bcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BheW1lbnRNZXRob2RzQXBpRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogcGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnUGF5bWVudCBNZXRob2RzIEFQSSBMYW1iZGEgRnVuY3Rpb24gQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1QYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uQXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdHJpcGVXZWJob29rRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogc3RyaXBlV2ViaG9va0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTdHJpcGUgV2ViaG9vayBMYW1iZGEgRnVuY3Rpb24gQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1TdHJpcGVXZWJob29rRnVuY3Rpb25Bcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0ZpbGVQcm9jZXNzb3JGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBmaWxlUHJvY2Vzc29yRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZpbGUgUHJvY2Vzc29yIExhbWJkYSBGdW5jdGlvbiBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LUZpbGVQcm9jZXNzb3JGdW5jdGlvbkFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWxlcnRUb3BpY0FybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFsZXJ0VG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyBUb3BpYyBBUk4gZm9yIExhbWJkYSBhbGVydHMnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LUFsZXJ0VG9waWNBcm5gLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cExhbWJkYU1vbml0b3JpbmcoKSB7XG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggZGFzaGJvYXJkXG4gICAgY29uc3QgZGFzaGJvYXJkID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdMYW1iZGFEYXNoYm9hcmQnLCB7XG4gICAgICBkYXNoYm9hcmROYW1lOiBgaGFsbHVjaWZpeC1sYW1iZGEtbW9uaXRvcmluZy0ke3RoaXMuc3RhY2tOYW1lfWAsXG4gICAgfSk7XG5cbiAgICAvLyBTZXQgdXAgbW9uaXRvcmluZyBmb3IgZWFjaCBMYW1iZGEgZnVuY3Rpb25cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9ucy5mb3JFYWNoKChsYW1iZGFGdW5jdGlvbiwgaW5kZXgpID0+IHtcbiAgICAgIHRoaXMuc2V0dXBGdW5jdGlvbk1vbml0b3JpbmcobGFtYmRhRnVuY3Rpb24sIGRhc2hib2FyZCwgaW5kZXgpO1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHN5c3RlbS13aWRlIGFsYXJtc1xuICAgIHRoaXMuY3JlYXRlU3lzdGVtQWxhcm1zKCk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwRnVuY3Rpb25Nb25pdG9yaW5nKGxhbWJkYUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb24sIGRhc2hib2FyZDogY2xvdWR3YXRjaC5EYXNoYm9hcmQsIGluZGV4OiBudW1iZXIpIHtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSBsYW1iZGFGdW5jdGlvbi5mdW5jdGlvbk5hbWU7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBhbGFybXNcbiAgICBjb25zdCBlcnJvckFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgYCR7ZnVuY3Rpb25OYW1lfUVycm9yQWxhcm1gLCB7XG4gICAgICBhbGFybU5hbWU6IGAke2Z1bmN0aW9uTmFtZX0tZXJyb3JzYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBFcnJvciByYXRlIGFsYXJtIGZvciAke2Z1bmN0aW9uTmFtZX1gLFxuICAgICAgbWV0cmljOiBsYW1iZGFGdW5jdGlvbi5tZXRyaWNFcnJvcnMoe1xuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZHVyYXRpb25BbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIGAke2Z1bmN0aW9uTmFtZX1EdXJhdGlvbkFsYXJtYCwge1xuICAgICAgYWxhcm1OYW1lOiBgJHtmdW5jdGlvbk5hbWV9LWR1cmF0aW9uYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBEdXJhdGlvbiBhbGFybSBmb3IgJHtmdW5jdGlvbk5hbWV9YCxcbiAgICAgIG1ldHJpYzogbGFtYmRhRnVuY3Rpb24ubWV0cmljRHVyYXRpb24oe1xuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiBsYW1iZGFGdW5jdGlvbi50aW1lb3V0ID8gbGFtYmRhRnVuY3Rpb24udGltZW91dC50b01pbGxpc2Vjb25kcygpICogMC44IDogMzAwMDAsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdGhyb3R0bGVBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIGAke2Z1bmN0aW9uTmFtZX1UaHJvdHRsZUFsYXJtYCwge1xuICAgICAgYWxhcm1OYW1lOiBgJHtmdW5jdGlvbk5hbWV9LXRocm90dGxlc2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgVGhyb3R0bGUgYWxhcm0gZm9yICR7ZnVuY3Rpb25OYW1lfWAsXG4gICAgICBtZXRyaWM6IGxhbWJkYUZ1bmN0aW9uLm1ldHJpY1Rocm90dGxlcyh7XG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgYWxhcm1zIHRvIFNOUyB0b3BpY1xuICAgIGVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpKTtcbiAgICBkdXJhdGlvbkFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKSk7XG4gICAgdGhyb3R0bGVBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYykpO1xuXG4gICAgLy8gQWRkIHdpZGdldHMgdG8gZGFzaGJvYXJkXG4gICAgZGFzaGJvYXJkLmFkZFdpZGdldHMoXG4gICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgIHRpdGxlOiBgJHtmdW5jdGlvbk5hbWV9IC0gSW52b2NhdGlvbnMgJiBFcnJvcnNgLFxuICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgbGFtYmRhRnVuY3Rpb24ubWV0cmljSW52b2NhdGlvbnMoe1xuICAgICAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICAgIHJpZ2h0OiBbXG4gICAgICAgICAgbGFtYmRhRnVuY3Rpb24ubWV0cmljRXJyb3JzKHtcbiAgICAgICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgICB3aWR0aDogMTIsXG4gICAgICAgIGhlaWdodDogNixcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgbG9nIGdyb3VwIHdpdGggcmV0ZW50aW9uXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgYCR7ZnVuY3Rpb25OYW1lfUxvZ0dyb3VwYCwge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9sYW1iZGEvJHtmdW5jdGlvbk5hbWV9YCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVN5c3RlbUFsYXJtcygpIHtcbiAgICAvLyBDcmVhdGUgY29tcG9zaXRlIGFsYXJtIGZvciBvdmVyYWxsIHN5c3RlbSBoZWFsdGhcbiAgICBjb25zdCBzeXN0ZW1IZWFsdGhBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdTeXN0ZW1IZWFsdGhBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogJ2hhbGx1Y2lmaXgtc3lzdGVtLWhlYWx0aCcsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnT3ZlcmFsbCBzeXN0ZW0gaGVhbHRoIGJhc2VkIG9uIExhbWJkYSBmdW5jdGlvbiBlcnJvcnMnLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NYXRoRXhwcmVzc2lvbih7XG4gICAgICAgIGV4cHJlc3Npb246ICdTVU0oTUVUUklDUygpKScsXG4gICAgICAgIHVzaW5nTWV0cmljczogdGhpcy5sYW1iZGFGdW5jdGlvbnMucmVkdWNlKChhY2MsIGZ1bmMsIGluZGV4KSA9PiB7XG4gICAgICAgICAgYWNjW2BlJHtpbmRleH1gXSA9IGZ1bmMubWV0cmljRXJyb3JzKHtcbiAgICAgICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgIH0sIHt9IGFzIFJlY29yZDxzdHJpbmcsIGNsb3Vkd2F0Y2guSU1ldHJpYz4pLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEwLCAvLyBBbGVydCBpZiB0b3RhbCBlcnJvcnMgYWNyb3NzIGFsbCBmdW5jdGlvbnMgPiAxMFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIHN5c3RlbUhlYWx0aEFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKSk7XG4gIH1cbn0iXX0=