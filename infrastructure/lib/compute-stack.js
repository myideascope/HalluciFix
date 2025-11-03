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
        const errorAlarm = new cloudwatch.Alarm(this, `Function${index}ErrorAlarm`, {
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
        const durationAlarm = new cloudwatch.Alarm(this, `Function${index}DurationAlarm`, {
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
        const throttleAlarm = new cloudwatch.Alarm(this, `Function${index}ThrottleAlarm`, {
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
        new logs.LogGroup(this, `Function${index}LogGroup`, {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHV0ZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvbXB1dGUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsK0RBQWlEO0FBQ2pELHVFQUF5RDtBQUN6RCxpRUFBbUQ7QUFDbkQseURBQTJDO0FBQzNDLHlEQUEyQztBQUszQywrREFBaUQ7QUFDakQsd0VBQTBEO0FBRTFELHVFQUF5RDtBQUN6RCxzRkFBd0U7QUFDeEUseURBQTJDO0FBQzNDLDJEQUE2QztBQWM3QyxNQUFhLHNCQUF1QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ25DLFFBQVEsQ0FBbUI7SUFDM0IsY0FBYyxDQUF5QjtJQUN2QyxZQUFZLENBQTBCO0lBQ3RDLEdBQUcsQ0FBcUI7SUFDeEIsZUFBZSxHQUFzQixFQUFFLENBQUM7SUFDeEMsVUFBVSxDQUFZO0lBRXRDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBa0M7UUFDMUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsb0JBQW9CO1FBQ3BCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUMvRCxZQUFZLEVBQUUsb0JBQW9CLEtBQUssQ0FBQyxXQUFXLEVBQUU7WUFDckQsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixhQUFhLEVBQUU7Z0JBQ2IsS0FBSyxFQUFFLElBQUk7YUFDWjtZQUNELFVBQVUsRUFBRTtnQkFDVixLQUFLLEVBQUUsSUFBSTthQUNaO1lBQ0QsY0FBYyxFQUFFO2dCQUNkLFNBQVMsRUFBRSxDQUFDO2dCQUNaLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLGdCQUFnQixFQUFFLElBQUk7Z0JBQ3RCLGFBQWEsRUFBRSxJQUFJO2dCQUNuQixjQUFjLEVBQUUsSUFBSTthQUNyQjtZQUNE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QUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUNyRixDQUFDO0NBQ0Y7QUFsM0JELHdEQWszQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIHJkcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtcmRzJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIGVsYXN0aWNhY2hlIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lbGFzdGljYWNoZSc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBzdGVwZnVuY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zdGVwZnVuY3Rpb25zJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaEFjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gtYWN0aW9ucyc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEhhbGx1Y2lmaXhDb21wdXRlU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgdnBjOiBlYzIuVnBjO1xuICBsYW1iZGFTZWN1cml0eUdyb3VwOiBlYzIuU2VjdXJpdHlHcm91cDtcbiAgZGF0YWJhc2U6IHJkcy5EYXRhYmFzZUluc3RhbmNlO1xuICBjYWNoZTogZWxhc3RpY2FjaGUuQ2ZuQ2FjaGVDbHVzdGVyO1xuICBidWNrZXQ6IHMzLkJ1Y2tldDtcbiAgZGlzdHJpYnV0aW9uPzogY2xvdWRmcm9udC5EaXN0cmlidXRpb247XG4gIGJhdGNoQW5hbHlzaXNTdGF0ZU1hY2hpbmU/OiBzdGVwZnVuY3Rpb25zLlN0YXRlTWFjaGluZTtcbn1cblxuZXhwb3J0IGNsYXNzIEhhbGx1Y2lmaXhDb21wdXRlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2w6IGNvZ25pdG8uVXNlclBvb2w7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbENsaWVudDogY29nbml0by5Vc2VyUG9vbENsaWVudDtcbiAgcHVibGljIHJlYWRvbmx5IGlkZW50aXR5UG9vbDogY29nbml0by5DZm5JZGVudGl0eVBvb2w7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgcHVibGljIHJlYWRvbmx5IGxhbWJkYUZ1bmN0aW9uczogbGFtYmRhLkZ1bmN0aW9uW10gPSBbXTtcbiAgcHVibGljIHJlYWRvbmx5IGFsZXJ0VG9waWM6IHNucy5Ub3BpYztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogSGFsbHVjaWZpeENvbXB1dGVTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbFxuICAgIHRoaXMudXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnSGFsbHVjaWZpeFVzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiBgaGFsbHVjaWZpeC11c2Vycy0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICAgIG1mYTogY29nbml0by5NZmEuT1BUSU9OQUwsXG4gICAgICBtZmFTZWNvbmRGYWN0b3I6IHtcbiAgICAgICAgc21zOiB0cnVlLFxuICAgICAgICBvdHA6IHRydWUsXG4gICAgICB9LFxuICAgICAgc3RhbmRhcmRBdHRyaWJ1dGVzOiB7XG4gICAgICAgIGVtYWlsOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZ2l2ZW5OYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZhbWlseU5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB7XG4gICAgICAgIHN1YnNjcmlwdGlvblRpZXI6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXG4gICAgICAgIHVzYWdlUXVvdGE6IG5ldyBjb2duaXRvLk51bWJlckF0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyBcbiAgICAgICAgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gXG4gICAgICAgIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIEdvb2dsZSBPQXV0aCBJZGVudGl0eSBQcm92aWRlciAocGxhY2Vob2xkZXIgLSByZXF1aXJlcyBHb29nbGUgT0F1dGggY3JlZGVudGlhbHMpXG4gICAgY29uc3QgZ29vZ2xlUHJvdmlkZXIgPSBuZXcgY29nbml0by5Vc2VyUG9vbElkZW50aXR5UHJvdmlkZXJHb29nbGUodGhpcywgJ0dvb2dsZVByb3ZpZGVyJywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBjbGllbnRJZDogJ0dPT0dMRV9DTElFTlRfSURfUExBQ0VIT0xERVInLCAvLyBXaWxsIGJlIHJlcGxhY2VkIHdpdGggYWN0dWFsIEdvb2dsZSBPQXV0aCBjbGllbnQgSURcbiAgICAgIGNsaWVudFNlY3JldDogJ0dPT0dMRV9DTElFTlRfU0VDUkVUX1BMQUNFSE9MREVSJywgLy8gV2lsbCBiZSByZXBsYWNlZCB3aXRoIGFjdHVhbCBzZWNyZXRcbiAgICAgIHNjb3BlczogWydlbWFpbCcsICdwcm9maWxlJywgJ29wZW5pZCcsICdodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL2RyaXZlLnJlYWRvbmx5J10sXG4gICAgICBhdHRyaWJ1dGVNYXBwaW5nOiB7XG4gICAgICAgIGVtYWlsOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9FTUFJTCxcbiAgICAgICAgZ2l2ZW5OYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9HSVZFTl9OQU1FLFxuICAgICAgICBmYW1pbHlOYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9GQU1JTFlfTkFNRSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnRcbiAgICB0aGlzLnVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgJ0hhbGx1Y2lmaXhVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiBgaGFsbHVjaWZpeC1jbGllbnQtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLCAvLyBGb3Igd2ViIGFwcGxpY2F0aW9uc1xuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdXBwb3J0ZWRJZGVudGl0eVByb3ZpZGVyczogW1xuICAgICAgICBjb2duaXRvLlVzZXJQb29sQ2xpZW50SWRlbnRpdHlQcm92aWRlci5DT0dOSVRPLFxuICAgICAgICBjb2duaXRvLlVzZXJQb29sQ2xpZW50SWRlbnRpdHlQcm92aWRlci5HT09HTEUsXG4gICAgICBdLFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICAgIGltcGxpY2l0Q29kZUdyYW50OiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuUFJPRklMRSxcbiAgICAgICAgXSxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxuICAgICAgICAgID8gWydodHRwczovL2FwcC5oYWxsdWNpZml4LmNvbS9jYWxsYmFjayddXG4gICAgICAgICAgOiBwcm9wcy5kaXN0cmlidXRpb24gXG4gICAgICAgICAgICA/IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwL2NhbGxiYWNrJywgYGh0dHBzOi8vJHtwcm9wcy5kaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX0vY2FsbGJhY2tgXVxuICAgICAgICAgICAgOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9jYWxsYmFjayddLFxuICAgICAgICBsb2dvdXRVcmxzOiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnXG4gICAgICAgICAgPyBbJ2h0dHBzOi8vYXBwLmhhbGx1Y2lmaXguY29tL2xvZ291dCddXG4gICAgICAgICAgOiBwcm9wcy5kaXN0cmlidXRpb25cbiAgICAgICAgICAgID8gWydodHRwOi8vbG9jYWxob3N0OjMwMDAvbG9nb3V0JywgYGh0dHBzOi8vJHtwcm9wcy5kaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX0vbG9nb3V0YF1cbiAgICAgICAgICAgIDogWydodHRwOi8vbG9jYWxob3N0OjMwMDAvbG9nb3V0J10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRW5zdXJlIHRoZSBjbGllbnQgZGVwZW5kcyBvbiB0aGUgR29vZ2xlIHByb3ZpZGVyXG4gICAgdGhpcy51c2VyUG9vbENsaWVudC5ub2RlLmFkZERlcGVuZGVuY3koZ29vZ2xlUHJvdmlkZXIpO1xuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2wgRG9tYWluIGZvciBPQXV0aFxuICAgIGNvbnN0IHVzZXJQb29sRG9tYWluID0gbmV3IGNvZ25pdG8uVXNlclBvb2xEb21haW4odGhpcywgJ0hhbGx1Y2lmaXhVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXg6IGBoYWxsdWNpZml4LSR7cHJvcHMuZW52aXJvbm1lbnR9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDIsIDgpfWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBJZGVudGl0eSBQb29sXG4gICAgdGhpcy5pZGVudGl0eVBvb2wgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2wodGhpcywgJ0hhbGx1Y2lmaXhJZGVudGl0eVBvb2wnLCB7XG4gICAgICBpZGVudGl0eVBvb2xOYW1lOiBgaGFsbHVjaWZpeF9pZGVudGl0eV9wb29sXyR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGFsbG93VW5hdXRoZW50aWNhdGVkSWRlbnRpdGllczogZmFsc2UsXG4gICAgICBjb2duaXRvSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGNsaWVudElkOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgICAgcHJvdmlkZXJOYW1lOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sUHJvdmlkZXJOYW1lLFxuICAgICAgICAgIHNlcnZlclNpZGVUb2tlbkNoZWNrOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHN1cHBvcnRlZExvZ2luUHJvdmlkZXJzOiB7XG4gICAgICAgICdhY2NvdW50cy5nb29nbGUuY29tJzogJ0dPT0dMRV9DTElFTlRfSURfUExBQ0VIT0xERVInLCAvLyBXaWxsIGJlIHJlcGxhY2VkIHdpdGggYWN0dWFsIEdvb2dsZSBPQXV0aCBjbGllbnQgSURcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBJQU0gcm9sZXMgZm9yIGF1dGhlbnRpY2F0ZWQgYW5kIHVuYXV0aGVudGljYXRlZCB1c2Vyc1xuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDb2duaXRvQXV0aGVudGljYXRlZFJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxuICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tJyxcbiAgICAgICAge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWQnOiB0aGlzLmlkZW50aXR5UG9vbC5yZWYsXG4gICAgICAgICAgfSxcbiAgICAgICAgICAnRm9yQW55VmFsdWU6U3RyaW5nTGlrZSc6IHtcbiAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yJzogJ2F1dGhlbnRpY2F0ZWQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgICdzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eSdcbiAgICAgICksXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBDb2duaXRvQXV0aGVudGljYXRlZFBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnY29nbml0by1zeW5jOionLFxuICAgICAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5OionLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgJHtwcm9wcy5idWNrZXQuYnVja2V0QXJufS91c2VyLXVwbG9hZHMvXFwke2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTpzdWJ9LypgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIElkZW50aXR5IFBvb2wgUm9sZSBBdHRhY2htZW50XG4gICAgbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sUm9sZUF0dGFjaG1lbnQodGhpcywgJ0lkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50Jywge1xuICAgICAgaWRlbnRpdHlQb29sSWQ6IHRoaXMuaWRlbnRpdHlQb29sLnJlZixcbiAgICAgIHJvbGVzOiB7XG4gICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGF1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFNOUyB0b3BpYyBmb3IgYWxlcnRzXG4gICAgdGhpcy5hbGVydFRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnTGFtYmRhQWxlcnRUb3BpYycsIHtcbiAgICAgIHRvcGljTmFtZTogYGhhbGx1Y2lmaXgtbGFtYmRhLWFsZXJ0cy0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBkaXNwbGF5TmFtZTogYEhhbGx1Y2lGaXggTGFtYmRhIEFsZXJ0cyAoJHtwcm9wcy5lbnZpcm9ubWVudH0pYCxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBleGVjdXRpb24gcm9sZVxuICAgIGNvbnN0IGxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0xhbWJkYUV4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFWUENBY2Nlc3NFeGVjdXRpb25Sb2xlJyksXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQVdTWFJheURhZW1vbldyaXRlQWNjZXNzJyksXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgSGFsbHVjaWZpeExhbWJkYVBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAncmRzLWRhdGE6RXhlY3V0ZVN0YXRlbWVudCcsXG4gICAgICAgICAgICAgICAgJ3Jkcy1kYXRhOkJhdGNoRXhlY3V0ZVN0YXRlbWVudCcsXG4gICAgICAgICAgICAgICAgJ3Jkcy1kYXRhOkJlZ2luVHJhbnNhY3Rpb24nLFxuICAgICAgICAgICAgICAgICdyZHMtZGF0YTpDb21taXRUcmFuc2FjdGlvbicsXG4gICAgICAgICAgICAgICAgJ3Jkcy1kYXRhOlJvbGxiYWNrVHJhbnNhY3Rpb24nLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5kYXRhYmFzZS5pbnN0YW5jZUFybl0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Ake3Byb3BzLmJ1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW3Byb3BzLmJ1Y2tldC5idWNrZXRBcm5dLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzZWNyZXRzbWFuYWdlcjpHZXRTZWNyZXRWYWx1ZScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sIC8vIFdpbGwgYmUgcmVzdHJpY3RlZCB0byBzcGVjaWZpYyBzZWNyZXRzXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsV2l0aFJlc3BvbnNlU3RyZWFtJyxcbiAgICAgICAgICAgICAgICAnYmVkcm9jazpMaXN0Rm91bmRhdGlvbk1vZGVscycsXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6R2V0Rm91bmRhdGlvbk1vZGVsJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSwgLy8gQmVkcm9jayBtb2RlbCBBUk5zXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2NvZ25pdG8taWRwOkdldFVzZXInLFxuICAgICAgICAgICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkdldFVzZXInLFxuICAgICAgICAgICAgICAgICdjb2duaXRvLWlkcDpMaXN0VXNlcnMnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLCAvLyBXaWxsIGJlIHJlc3RyaWN0ZWQgdG8gc3BlY2lmaWMgdXNlciBwb29sc1xuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzZXM6U2VuZEVtYWlsJyxcbiAgICAgICAgICAgICAgICAnc2VzOlNlbmRSYXdFbWFpbCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sIC8vIFdpbGwgYmUgcmVzdHJpY3RlZCB0byBzcGVjaWZpYyBlbWFpbCBhZGRyZXNzZXNcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhJyxcbiAgICAgICAgICAgICAgICAnY2xvdWR3YXRjaDpHZXRNZXRyaWNTdGF0aXN0aWNzJyxcbiAgICAgICAgICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnLFxuICAgICAgICAgICAgICAgICdsb2dzOlN0YXJ0UXVlcnknLFxuICAgICAgICAgICAgICAgICdsb2dzOkdldFF1ZXJ5UmVzdWx0cycsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NuczpQdWJsaXNoJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbdGhpcy5hbGVydFRvcGljLnRvcGljQXJuXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBMYXllciBmb3IgY29tbW9uIGRlcGVuZGVuY2llc1xuICAgIGNvbnN0IGNvbW1vbkxheWVyID0gbmV3IGxhbWJkYS5MYXllclZlcnNpb24odGhpcywgJ0NvbW1vbkxheWVyJywge1xuICAgICAgbGF5ZXJWZXJzaW9uTmFtZTogYGhhbGx1Y2lmaXgtY29tbW9uLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhLWxheWVycy9jb21tb24nKSwgLy8gV2lsbCBiZSBjcmVhdGVkIGxhdGVyXG4gICAgICBjb21wYXRpYmxlUnVudGltZXM6IFtsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWF0sXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvbW1vbiBkZXBlbmRlbmNpZXMgZm9yIEhhbGx1Y2lGaXggTGFtYmRhIGZ1bmN0aW9ucycsXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgR2F0ZXdheVxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnSGFsbHVjaWZpeEFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiBgaGFsbHVjaWZpeC1hcGktJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246ICdIYWxsdWNpRml4IEFQSSBHYXRld2F5JyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgXG4gICAgICAgICAgPyBbJ2h0dHBzOi8vYXBwLmhhbGx1Y2lmaXguY29tJ11cbiAgICAgICAgICA6IHByb3BzLmRpc3RyaWJ1dGlvblxuICAgICAgICAgICAgPyBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsIGBodHRwczovLyR7cHJvcHMuZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YF1cbiAgICAgICAgICAgIDogWydodHRwOi8vbG9jYWxob3N0OjMwMDAnXSxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQT1NUJywgJ1BVVCcsICdERUxFVEUnLCAnT1BUSU9OUyddLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXSxcbiAgICAgIH0sXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBBdXRob3JpemVyXG4gICAgY29uc3QgY29nbml0b0F1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnQ29nbml0b0F1dGhvcml6ZXInLCB7XG4gICAgICBjb2duaXRvVXNlclBvb2xzOiBbdGhpcy51c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogJ0hhbGx1Y2lmaXhBdXRob3JpemVyJyxcbiAgICB9KTtcblxuICAgIC8vIFNjYW4gRXhlY3V0b3IgTGFtYmRhIEZ1bmN0aW9uIChtaWdyYXRlZCBmcm9tIFN1cGFiYXNlIEVkZ2UgRnVuY3Rpb24pXG4gICAgY29uc3Qgc2NhbkV4ZWN1dG9yRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTY2FuRXhlY3V0b3JGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGhhbGx1Y2lmaXgtc2Nhbi1leGVjdXRvci0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhLWZ1bmN0aW9ucy9zY2FuLWV4ZWN1dG9yJyksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICBtZW1vcnlTaXplOiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAyNCA6IDUxMixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgREJfQ0xVU1RFUl9BUk46IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlQXJuLFxuICAgICAgICBEQl9TRUNSRVRfQVJOOiBwcm9wcy5kYXRhYmFzZS5zZWNyZXQ/LnNlY3JldEFybiB8fCAnJyxcbiAgICAgICAgSEFMTFVDSUZJWF9BUElfS0VZX1NFQ1JFVDogYGhhbGx1Y2lmaXgtYXBpLWtleS0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMubGFtYmRhU2VjdXJpdHlHcm91cF0sXG4gICAgICBsYXllcnM6IFtjb21tb25MYXllcl0sXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsIC8vIEVuYWJsZSBYLVJheSB0cmFjaW5nXG4gICAgfSk7XG5cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9ucy5wdXNoKHNjYW5FeGVjdXRvckZ1bmN0aW9uKTtcblxuICAgIC8vIEJpbGxpbmcgQVBJIExhbWJkYSBGdW5jdGlvbiAobWlncmF0ZWQgZnJvbSBTdXBhYmFzZSBFZGdlIEZ1bmN0aW9uKVxuICAgIGNvbnN0IGJpbGxpbmdBcGlGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0JpbGxpbmdBcGlGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGhhbGx1Y2lmaXgtYmlsbGluZy1hcGktJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS1mdW5jdGlvbnMvYmlsbGluZy1hcGknKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgREJfQ0xVU1RFUl9BUk46IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlQXJuLFxuICAgICAgICBEQl9TRUNSRVRfQVJOOiBwcm9wcy5kYXRhYmFzZS5zZWNyZXQ/LnNlY3JldEFybiB8fCAnJyxcbiAgICAgICAgU1RSSVBFX1NFQ1JFVF9LRVlfQVJOOiBgc3RyaXBlLXNlY3JldC1rZXktJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgfSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmxhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgbGF5ZXJzOiBbY29tbW9uTGF5ZXJdLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgIH0pO1xuXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbnMucHVzaChiaWxsaW5nQXBpRnVuY3Rpb24pO1xuXG4gICAgLy8gUGF5bWVudCBNZXRob2RzIEFQSSBMYW1iZGEgRnVuY3Rpb24gKG1pZ3JhdGVkIGZyb20gU3VwYWJhc2UgRWRnZSBGdW5jdGlvbilcbiAgICBjb25zdCBwYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGhhbGx1Y2lmaXgtcGF5bWVudC1tZXRob2RzLWFwaS0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhLWZ1bmN0aW9ucy9wYXltZW50LW1ldGhvZHMtYXBpJyksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOT0RFX0VOVjogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgIERCX0NMVVNURVJfQVJOOiBwcm9wcy5kYXRhYmFzZS5pbnN0YW5jZUFybixcbiAgICAgICAgREJfU0VDUkVUX0FSTjogcHJvcHMuZGF0YWJhc2Uuc2VjcmV0Py5zZWNyZXRBcm4gfHwgJycsXG4gICAgICAgIFNUUklQRV9TRUNSRVRfS0VZX0FSTjogYHN0cmlwZS1zZWNyZXQta2V5LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgICAgQ09HTklUT19VU0VSX1BPT0xfSUQ6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIH0sXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5sYW1iZGFTZWN1cml0eUdyb3VwXSxcbiAgICAgIGxheWVyczogW2NvbW1vbkxheWVyXSxcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcbiAgICB9KTtcblxuICAgIHRoaXMubGFtYmRhRnVuY3Rpb25zLnB1c2gocGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbik7XG5cbiAgICAvLyBTdHJpcGUgV2ViaG9vayBMYW1iZGEgRnVuY3Rpb24gKG1pZ3JhdGVkIGZyb20gU3VwYWJhc2UgRWRnZSBGdW5jdGlvbilcbiAgICBjb25zdCBzdHJpcGVXZWJob29rRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTdHJpcGVXZWJob29rRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBoYWxsdWNpZml4LXN0cmlwZS13ZWJob29rLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEtZnVuY3Rpb25zL3N0cmlwZS13ZWJob29rJyksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgREJfQ0xVU1RFUl9BUk46IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlQXJuLFxuICAgICAgICBEQl9TRUNSRVRfQVJOOiBwcm9wcy5kYXRhYmFzZS5zZWNyZXQ/LnNlY3JldEFybiB8fCAnJyxcbiAgICAgICAgU1RSSVBFX1NFQ1JFVF9LRVlfQVJOOiBgc3RyaXBlLXNlY3JldC1rZXktJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICBTVFJJUEVfV0VCSE9PS19TRUNSRVRfQVJOOiBgc3RyaXBlLXdlYmhvb2stc2VjcmV0LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgICAgRlJPTV9FTUFJTDogYG5vcmVwbHlAaGFsbHVjaWZpeC5jb21gLFxuICAgICAgfSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmxhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgbGF5ZXJzOiBbY29tbW9uTGF5ZXJdLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgIH0pO1xuXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbnMucHVzaChzdHJpcGVXZWJob29rRnVuY3Rpb24pO1xuXG4gICAgLy8gRmlsZSBQcm9jZXNzb3IgTGFtYmRhIEZ1bmN0aW9uIChmb3IgUzMgZmlsZSBwcm9jZXNzaW5nKVxuICAgIGNvbnN0IGZpbGVQcm9jZXNzb3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0ZpbGVQcm9jZXNzb3JGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGhhbGx1Y2lmaXgtZmlsZS1wcm9jZXNzb3ItJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS1mdW5jdGlvbnMvZmlsZS1wcm9jZXNzb3InKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWVtb3J5U2l6ZTogMTAyNCwgLy8gSGlnaGVyIG1lbW9yeSBmb3IgZmlsZSBwcm9jZXNzaW5nXG4gICAgICBsYXllcnM6IFtjb21tb25MYXllcl0sXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFTlZJUk9OTUVOVDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgIERBVEFCQVNFX0hPU1Q6IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQuaG9zdG5hbWUsXG4gICAgICAgIERBVEFCQVNFX1BPUlQ6IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQucG9ydC50b1N0cmluZygpLFxuICAgICAgICBDQUNIRV9IT1NUOiBwcm9wcy5jYWNoZS5hdHRyUmVkaXNFbmRwb2ludEFkZHJlc3MsXG4gICAgICAgIENBQ0hFX1BPUlQ6ICc2Mzc5JyxcbiAgICAgICAgUzNfQlVDS0VUX05BTUU6IHByb3BzLmJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBQUk9DRVNTSU5HX1JFU1VMVFNfVEFCTEU6IGBoYWxsdWNpZml4LXByb2Nlc3NpbmctcmVzdWx0cy0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5sYW1iZGFTZWN1cml0eUdyb3VwXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFMzIHBlcm1pc3Npb25zIHRvIGZpbGUgcHJvY2Vzc29yXG4gICAgcHJvcHMuYnVja2V0LmdyYW50UmVhZFdyaXRlKGZpbGVQcm9jZXNzb3JGdW5jdGlvbik7XG5cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9ucy5wdXNoKGZpbGVQcm9jZXNzb3JGdW5jdGlvbik7XG5cbiAgICAvLyBBUEkgR2F0ZXdheSByb3V0ZXMgZm9yIG1pZ3JhdGVkIGZ1bmN0aW9uc1xuICAgIFxuICAgIC8vIEJpbGxpbmcgQVBJIHJvdXRlc1xuICAgIGNvbnN0IGJpbGxpbmdSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2JpbGxpbmcnKTtcbiAgICBiaWxsaW5nUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihiaWxsaW5nQXBpRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgYmlsbGluZ1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGJpbGxpbmdBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGJpbGxpbmdJbmZvUmVzb3VyY2UgPSBiaWxsaW5nUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2luZm8nKTtcbiAgICBiaWxsaW5nSW5mb1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYmlsbGluZ0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmlsbGluZ1VzYWdlUmVzb3VyY2UgPSBiaWxsaW5nUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3VzYWdlJyk7XG4gICAgY29uc3QgYmlsbGluZ0FuYWx5dGljc1Jlc291cmNlID0gYmlsbGluZ1VzYWdlUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2FuYWx5dGljcycpO1xuICAgIGJpbGxpbmdBbmFseXRpY3NSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGJpbGxpbmdBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGJpbGxpbmdJbnZvaWNlc1Jlc291cmNlID0gYmlsbGluZ1Jlc291cmNlLmFkZFJlc291cmNlKCdpbnZvaWNlcycpO1xuICAgIGJpbGxpbmdJbnZvaWNlc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYmlsbGluZ0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmlsbGluZ1BvcnRhbFJlc291cmNlID0gYmlsbGluZ1Jlc291cmNlLmFkZFJlc291cmNlKCdwb3J0YWwnKTtcbiAgICBiaWxsaW5nUG9ydGFsUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYmlsbGluZ0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmlsbGluZ0NhbmNlbFJlc291cmNlID0gYmlsbGluZ1Jlc291cmNlLmFkZFJlc291cmNlKCdjYW5jZWwnKTtcbiAgICBiaWxsaW5nQ2FuY2VsUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYmlsbGluZ0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gUGF5bWVudCBNZXRob2RzIEFQSSByb3V0ZXNcbiAgICBjb25zdCBwYXltZW50TWV0aG9kc1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgncGF5bWVudC1tZXRob2RzJyk7XG4gICAgcGF5bWVudE1ldGhvZHNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBheW1lbnRNZXRob2RzQXBpRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgcGF5bWVudE1ldGhvZHNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2V0dXBJbnRlbnRSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3NldHVwLWludGVudCcpO1xuICAgIHNldHVwSW50ZW50UmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBheW1lbnRNZXRob2RSZXNvdXJjZSA9IHBheW1lbnRNZXRob2RzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3twYXltZW50TWV0aG9kSWR9Jyk7XG4gICAgcGF5bWVudE1ldGhvZFJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBheW1lbnRNZXRob2REZWZhdWx0UmVzb3VyY2UgPSBwYXltZW50TWV0aG9kUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2RlZmF1bHQnKTtcbiAgICBwYXltZW50TWV0aG9kRGVmYXVsdFJlc291cmNlLmFkZE1ldGhvZCgnUFVUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBheW1lbnRNZXRob2RWYWxpZGF0ZVJlc291cmNlID0gcGF5bWVudE1ldGhvZFJlc291cmNlLmFkZFJlc291cmNlKCd2YWxpZGF0ZScpO1xuICAgIHBheW1lbnRNZXRob2RWYWxpZGF0ZVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIC8vIEZpbGUgcHJvY2Vzc2luZyBBUEkgcm91dGVzXG4gICAgY29uc3QgZmlsZXNSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2ZpbGVzJyk7XG4gICAgY29uc3QgcHJvY2Vzc0ZpbGVSZXNvdXJjZSA9IGZpbGVzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3Byb2Nlc3MnKTtcbiAgICBwcm9jZXNzRmlsZVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZpbGVQcm9jZXNzb3JGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHByb2Nlc3NpbmdTdGF0dXNSZXNvdXJjZSA9IGZpbGVzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3Byb2Nlc3Npbmctc3RhdHVzJyk7XG4gICAgcHJvY2Vzc2luZ1N0YXR1c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZmlsZVByb2Nlc3NvckZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gU3RyaXBlIFdlYmhvb2sgcm91dGUgKG5vIGF1dGhvcml6YXRpb24gcmVxdWlyZWQgZm9yIHdlYmhvb2tzKVxuICAgIGNvbnN0IHdlYmhvb2tSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3dlYmhvb2snKTtcbiAgICBjb25zdCBzdHJpcGVXZWJob29rUmVzb3VyY2UgPSB3ZWJob29rUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0cmlwZScpO1xuICAgIHN0cmlwZVdlYmhvb2tSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihzdHJpcGVXZWJob29rRnVuY3Rpb24pKTtcblxuICAgIC8vIEV2ZW50QnJpZGdlIHJ1bGUgdG8gdHJpZ2dlciBzY2FuIGV4ZWN1dG9yIGZ1bmN0aW9uIGV2ZXJ5IDUgbWludXRlc1xuICAgIGNvbnN0IHNjYW5FeGVjdXRvclJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ1NjYW5FeGVjdXRvclJ1bGUnLCB7XG4gICAgICBydWxlTmFtZTogYGhhbGx1Y2lmaXgtc2Nhbi1leGVjdXRvci0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RyaWdnZXIgc2NhbiBleGVjdXRvciBmdW5jdGlvbiBldmVyeSA1IG1pbnV0ZXMnLFxuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKGNkay5EdXJhdGlvbi5taW51dGVzKDUpKSxcbiAgICB9KTtcblxuICAgIHNjYW5FeGVjdXRvclJ1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKHNjYW5FeGVjdXRvckZ1bmN0aW9uKSk7XG5cbiAgICAvLyBTY2FuIEV4ZWN1dG9yIGZ1bmN0aW9uIG1hbnVhbCB0cmlnZ2VyIGVuZHBvaW50IGZvciB0ZXN0aW5nXG4gICAgY29uc3Qgc2NhblJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnc2NhbicpO1xuICAgIGNvbnN0IGV4ZWN1dGVTY2FuUmVzb3VyY2UgPSBzY2FuUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2V4ZWN1dGUnKTtcbiAgICBleGVjdXRlU2NhblJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHNjYW5FeGVjdXRvckZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gU3RlcCBGdW5jdGlvbnMgaW50ZWdyYXRpb24gZm9yIGJhdGNoIGFuYWx5c2lzXG4gICAgaWYgKHByb3BzLmJhdGNoQW5hbHlzaXNTdGF0ZU1hY2hpbmUpIHtcbiAgICAgIGNvbnN0IHN0ZXBGdW5jdGlvbkV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1N0ZXBGdW5jdGlvbkV4ZWN1dGlvblJvbGUnLCB7XG4gICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdhcGlnYXRld2F5LmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgICBTdGVwRnVuY3Rpb25FeGVjdXRpb25Qb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICdzdGF0ZXM6U3RhcnRFeGVjdXRpb24nLFxuICAgICAgICAgICAgICAgICAgJ3N0YXRlczpEZXNjcmliZUV4ZWN1dGlvbicsXG4gICAgICAgICAgICAgICAgICAnc3RhdGVzOlN0b3BFeGVjdXRpb24nLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMuYmF0Y2hBbmFseXNpc1N0YXRlTWFjaGluZS5zdGF0ZU1hY2hpbmVBcm5dLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQmF0Y2ggYW5hbHlzaXMgZW5kcG9pbnRzXG4gICAgICBjb25zdCBiYXRjaFJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYmF0Y2gnKTtcbiAgICAgIFxuICAgICAgLy8gU3RhcnQgYmF0Y2ggYW5hbHlzaXNcbiAgICAgIGNvbnN0IHN0YXJ0QmF0Y2hSZXNvdXJjZSA9IGJhdGNoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0YXJ0Jyk7XG4gICAgICBzdGFydEJhdGNoUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuQXdzSW50ZWdyYXRpb24oe1xuICAgICAgICBzZXJ2aWNlOiAnc3RhdGVzJyxcbiAgICAgICAgYWN0aW9uOiAnU3RhcnRFeGVjdXRpb24nLFxuICAgICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgIGNyZWRlbnRpYWxzUm9sZTogc3RlcEZ1bmN0aW9uRXhlY3V0aW9uUm9sZSxcbiAgICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgc3RhdGVNYWNoaW5lQXJuOiBwcm9wcy5iYXRjaEFuYWx5c2lzU3RhdGVNYWNoaW5lLnN0YXRlTWFjaGluZUFybixcbiAgICAgICAgICAgICAgaW5wdXQ6ICckdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5ib2R5KScsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGludGVncmF0aW9uUmVzcG9uc2VzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0YXR1c0NvZGU6ICcyMDAnLFxuICAgICAgICAgICAgICByZXNwb25zZVRlbXBsYXRlczoge1xuICAgICAgICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgICAgZXhlY3V0aW9uQXJuOiAnJGlucHV0LnBhdGgoXFwnJC5leGVjdXRpb25Bcm5cXCcpJyxcbiAgICAgICAgICAgICAgICAgIHN0YXJ0RGF0ZTogJyRpbnB1dC5wYXRoKFxcJyQuc3RhcnREYXRlXFwnKScsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdGF0dXNDb2RlOiAnNDAwJyxcbiAgICAgICAgICAgICAgc2VsZWN0aW9uUGF0dGVybjogJzRcXFxcZHsyfScsXG4gICAgICAgICAgICAgIHJlc3BvbnNlVGVtcGxhdGVzOiB7XG4gICAgICAgICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICBlcnJvcjogJ0JhZCBSZXF1ZXN0JyxcbiAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICckaW5wdXQucGF0aChcXCckLmVycm9yTWVzc2FnZVxcJyknLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgfSksIHtcbiAgICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xuICAgICAgICAgIHsgc3RhdHVzQ29kZTogJzIwMCcgfSxcbiAgICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDAnIH0sXG4gICAgICAgIF0sXG4gICAgICB9KTtcblxuICAgICAgLy8gR2V0IGJhdGNoIGV4ZWN1dGlvbiBzdGF0dXNcbiAgICAgIGNvbnN0IHN0YXR1c0JhdGNoUmVzb3VyY2UgPSBiYXRjaFJlc291cmNlLmFkZFJlc291cmNlKCdzdGF0dXMnKS5hZGRSZXNvdXJjZSgne2V4ZWN1dGlvbkFybit9Jyk7XG4gICAgICBzdGF0dXNCYXRjaFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuQXdzSW50ZWdyYXRpb24oe1xuICAgICAgICBzZXJ2aWNlOiAnc3RhdGVzJyxcbiAgICAgICAgYWN0aW9uOiAnRGVzY3JpYmVFeGVjdXRpb24nLFxuICAgICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgIGNyZWRlbnRpYWxzUm9sZTogc3RlcEZ1bmN0aW9uRXhlY3V0aW9uUm9sZSxcbiAgICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgZXhlY3V0aW9uQXJuOiAnJG1ldGhvZC5yZXF1ZXN0LnBhdGguZXhlY3V0aW9uQXJuJyxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgaW50ZWdyYXRpb25SZXNwb25zZXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgICAgIHJlc3BvbnNlVGVtcGxhdGVzOiB7XG4gICAgICAgICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICBleGVjdXRpb25Bcm46ICckaW5wdXQucGF0aChcXCckLmV4ZWN1dGlvbkFyblxcJyknLFxuICAgICAgICAgICAgICAgICAgc3RhdHVzOiAnJGlucHV0LnBhdGgoXFwnJC5zdGF0dXNcXCcpJyxcbiAgICAgICAgICAgICAgICAgIHN0YXJ0RGF0ZTogJyRpbnB1dC5wYXRoKFxcJyQuc3RhcnREYXRlXFwnKScsXG4gICAgICAgICAgICAgICAgICBzdG9wRGF0ZTogJyRpbnB1dC5wYXRoKFxcJyQuc3RvcERhdGVcXCcpJyxcbiAgICAgICAgICAgICAgICAgIG91dHB1dDogJyRpbnB1dC5wYXRoKFxcJyQub3V0cHV0XFwnKScsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9KSwge1xuICAgICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxuICAgICAgICBdLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gTW9uaXRvcmluZyBBZ2VudCBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBtb25pdG9yaW5nQWdlbnRGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ01vbml0b3JpbmdBZ2VudEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgaGFsbHVjaWZpeC1tb25pdG9yaW5nLWFnZW50LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEtZnVuY3Rpb25zL21vbml0b3JpbmctYWdlbnQnKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgQUxFUlRfVE9QSUNfQVJOOiB0aGlzLmFsZXJ0VG9waWMudG9waWNBcm4sXG4gICAgICAgIEZVTkNUSU9OX1BSRUZJWDogJ2hhbGx1Y2lmaXgnLFxuICAgICAgfSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgfSk7XG5cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9ucy5wdXNoKG1vbml0b3JpbmdBZ2VudEZ1bmN0aW9uKTtcblxuICAgIC8vIFNldCB1cCBtb25pdG9yaW5nIGluZnJhc3RydWN0dXJlXG4gICAgdGhpcy5zZXR1cExhbWJkYU1vbml0b3JpbmcoKTtcblxuICAgIC8vIFNjaGVkdWxlIG1vbml0b3JpbmcgYWdlbnQgdG8gcnVuIGV2ZXJ5IDUgbWludXRlc1xuICAgIGNvbnN0IG1vbml0b3JpbmdSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdNb25pdG9yaW5nQWdlbnRSdWxlJywge1xuICAgICAgcnVsZU5hbWU6IGBoYWxsdWNpZml4LW1vbml0b3JpbmctYWdlbnQtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246ICdUcmlnZ2VyIG1vbml0b3JpbmcgYWdlbnQgZXZlcnkgNSBtaW51dGVzJyxcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUucmF0ZShjZGsuRHVyYXRpb24ubWludXRlcyg1KSksXG4gICAgfSk7XG5cbiAgICBtb25pdG9yaW5nUnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24obW9uaXRvcmluZ0FnZW50RnVuY3Rpb24pKTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1Vc2VyUG9vbElkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbENsaWVudElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1Vc2VyUG9vbENsaWVudElkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdJZGVudGl0eVBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmlkZW50aXR5UG9vbC5yZWYsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gSWRlbnRpdHkgUG9vbCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tSWRlbnRpdHlQb29sSWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sRG9tYWluJywge1xuICAgICAgdmFsdWU6IHVzZXJQb29sRG9tYWluLmRvbWFpbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIERvbWFpbicsXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tVXNlclBvb2xEb21haW5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUdhdGV3YXlVcmwnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LUFwaUdhdGV3YXlVcmxgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1NjYW5FeGVjdXRvckZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHNjYW5FeGVjdXRvckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTY2FuIEV4ZWN1dG9yIExhbWJkYSBGdW5jdGlvbiBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LVNjYW5FeGVjdXRvckZ1bmN0aW9uQXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCaWxsaW5nQXBpRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogYmlsbGluZ0FwaUZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdCaWxsaW5nIEFQSSBMYW1iZGEgRnVuY3Rpb24gQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1CaWxsaW5nQXBpRnVuY3Rpb25Bcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BheW1lbnRNZXRob2RzQXBpRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogcGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnUGF5bWVudCBNZXRob2RzIEFQSSBMYW1iZGEgRnVuY3Rpb24gQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1QYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uQXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdHJpcGVXZWJob29rRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogc3RyaXBlV2ViaG9va0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTdHJpcGUgV2ViaG9vayBMYW1iZGEgRnVuY3Rpb24gQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1TdHJpcGVXZWJob29rRnVuY3Rpb25Bcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0ZpbGVQcm9jZXNzb3JGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBmaWxlUHJvY2Vzc29yRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZpbGUgUHJvY2Vzc29yIExhbWJkYSBGdW5jdGlvbiBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LUZpbGVQcm9jZXNzb3JGdW5jdGlvbkFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWxlcnRUb3BpY0FybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFsZXJ0VG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyBUb3BpYyBBUk4gZm9yIExhbWJkYSBhbGVydHMnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LUFsZXJ0VG9waWNBcm5gLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cExhbWJkYU1vbml0b3JpbmcoKSB7XG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggZGFzaGJvYXJkXG4gICAgY29uc3QgZGFzaGJvYXJkID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdMYW1iZGFEYXNoYm9hcmQnLCB7XG4gICAgICBkYXNoYm9hcmROYW1lOiBgaGFsbHVjaWZpeC1sYW1iZGEtbW9uaXRvcmluZy0ke3RoaXMuc3RhY2tOYW1lfWAsXG4gICAgfSk7XG5cbiAgICAvLyBTZXQgdXAgbW9uaXRvcmluZyBmb3IgZWFjaCBMYW1iZGEgZnVuY3Rpb25cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9ucy5mb3JFYWNoKChsYW1iZGFGdW5jdGlvbiwgaW5kZXgpID0+IHtcbiAgICAgIHRoaXMuc2V0dXBGdW5jdGlvbk1vbml0b3JpbmcobGFtYmRhRnVuY3Rpb24sIGRhc2hib2FyZCwgaW5kZXgpO1xuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHN5c3RlbS13aWRlIGFsYXJtc1xuICAgIHRoaXMuY3JlYXRlU3lzdGVtQWxhcm1zKCk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwRnVuY3Rpb25Nb25pdG9yaW5nKGxhbWJkYUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb24sIGRhc2hib2FyZDogY2xvdWR3YXRjaC5EYXNoYm9hcmQsIGluZGV4OiBudW1iZXIpIHtcbiAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSBsYW1iZGFGdW5jdGlvbi5mdW5jdGlvbk5hbWU7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBhbGFybXNcbiAgICBjb25zdCBlcnJvckFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgYEZ1bmN0aW9uJHtpbmRleH1FcnJvckFsYXJtYCwge1xuICAgICAgYWxhcm1OYW1lOiBgJHtmdW5jdGlvbk5hbWV9LWVycm9yc2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgRXJyb3IgcmF0ZSBhbGFybSBmb3IgJHtmdW5jdGlvbk5hbWV9YCxcbiAgICAgIG1ldHJpYzogbGFtYmRhRnVuY3Rpb24ubWV0cmljRXJyb3JzKHtcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGR1cmF0aW9uQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgRnVuY3Rpb24ke2luZGV4fUR1cmF0aW9uQWxhcm1gLCB7XG4gICAgICBhbGFybU5hbWU6IGAke2Z1bmN0aW9uTmFtZX0tZHVyYXRpb25gLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYER1cmF0aW9uIGFsYXJtIGZvciAke2Z1bmN0aW9uTmFtZX1gLFxuICAgICAgbWV0cmljOiBsYW1iZGFGdW5jdGlvbi5tZXRyaWNEdXJhdGlvbih7XG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IGxhbWJkYUZ1bmN0aW9uLnRpbWVvdXQgPyBsYW1iZGFGdW5jdGlvbi50aW1lb3V0LnRvTWlsbGlzZWNvbmRzKCkgKiAwLjggOiAzMDAwMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAzLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBjb25zdCB0aHJvdHRsZUFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgYEZ1bmN0aW9uJHtpbmRleH1UaHJvdHRsZUFsYXJtYCwge1xuICAgICAgYWxhcm1OYW1lOiBgJHtmdW5jdGlvbk5hbWV9LXRocm90dGxlc2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgVGhyb3R0bGUgYWxhcm0gZm9yICR7ZnVuY3Rpb25OYW1lfWAsXG4gICAgICBtZXRyaWM6IGxhbWJkYUZ1bmN0aW9uLm1ldHJpY1Rocm90dGxlcyh7XG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgYWxhcm1zIHRvIFNOUyB0b3BpY1xuICAgIGVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpKTtcbiAgICBkdXJhdGlvbkFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKSk7XG4gICAgdGhyb3R0bGVBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYykpO1xuXG4gICAgLy8gQWRkIHdpZGdldHMgdG8gZGFzaGJvYXJkXG4gICAgZGFzaGJvYXJkLmFkZFdpZGdldHMoXG4gICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgIHRpdGxlOiBgJHtmdW5jdGlvbk5hbWV9IC0gSW52b2NhdGlvbnMgJiBFcnJvcnNgLFxuICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgbGFtYmRhRnVuY3Rpb24ubWV0cmljSW52b2NhdGlvbnMoe1xuICAgICAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICAgIHJpZ2h0OiBbXG4gICAgICAgICAgbGFtYmRhRnVuY3Rpb24ubWV0cmljRXJyb3JzKHtcbiAgICAgICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgICB3aWR0aDogMTIsXG4gICAgICAgIGhlaWdodDogNixcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgbG9nIGdyb3VwIHdpdGggcmV0ZW50aW9uXG4gICAgbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgYEZ1bmN0aW9uJHtpbmRleH1Mb2dHcm91cGAsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7ZnVuY3Rpb25OYW1lfWAsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVTeXN0ZW1BbGFybXMoKSB7XG4gICAgLy8gQ3JlYXRlIGNvbXBvc2l0ZSBhbGFybSBmb3Igb3ZlcmFsbCBzeXN0ZW0gaGVhbHRoXG4gICAgY29uc3Qgc3lzdGVtSGVhbHRoQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnU3lzdGVtSGVhbHRoQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICdoYWxsdWNpZml4LXN5c3RlbS1oZWFsdGgnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ092ZXJhbGwgc3lzdGVtIGhlYWx0aCBiYXNlZCBvbiBMYW1iZGEgZnVuY3Rpb24gZXJyb3JzJyxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWF0aEV4cHJlc3Npb24oe1xuICAgICAgICBleHByZXNzaW9uOiAnU1VNKE1FVFJJQ1MoKSknLFxuICAgICAgICB1c2luZ01ldHJpY3M6IHRoaXMubGFtYmRhRnVuY3Rpb25zLnJlZHVjZSgoYWNjLCBmdW5jLCBpbmRleCkgPT4ge1xuICAgICAgICAgIGFjY1tgZSR7aW5kZXh9YF0gPSBmdW5jLm1ldHJpY0Vycm9ycyh7XG4gICAgICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICB9LCB7fSBhcyBSZWNvcmQ8c3RyaW5nLCBjbG91ZHdhdGNoLklNZXRyaWM+KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMCwgLy8gQWxlcnQgaWYgdG90YWwgZXJyb3JzIGFjcm9zcyBhbGwgZnVuY3Rpb25zID4gMTBcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBzeXN0ZW1IZWFsdGhBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYykpO1xuICB9XG59Il19