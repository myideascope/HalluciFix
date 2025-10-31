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
        errorAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
        durationAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
        throttleAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
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
        systemHealthAlarm.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));
    }
}
exports.HallucifixComputeStack = HallucifixComputeStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHV0ZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvbXB1dGUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsK0RBQWlEO0FBQ2pELHVFQUF5RDtBQUN6RCxpRUFBbUQ7QUFDbkQseURBQTJDO0FBQzNDLHlEQUEyQztBQUszQywrREFBaUQ7QUFDakQsd0VBQTBEO0FBRTFELHVFQUF5RDtBQUN6RCx5REFBMkM7QUFDM0MsMkRBQTZDO0FBYzdDLE1BQWEsc0JBQXVCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDbkMsUUFBUSxDQUFtQjtJQUMzQixjQUFjLENBQXlCO0lBQ3ZDLFlBQVksQ0FBMEI7SUFDdEMsR0FBRyxDQUFxQjtJQUN4QixlQUFlLEdBQXNCLEVBQUUsQ0FBQztJQUN4QyxVQUFVLENBQVk7SUFFdEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQztRQUMxRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQy9ELFlBQVksRUFBRSxvQkFBb0IsS0FBSyxDQUFDLFdBQVcsRUFBRTtZQUNyRCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGFBQWEsRUFBRTtnQkFDYixLQUFLLEVBQUUsSUFBSTthQUNaO1lBQ0QsVUFBVSxFQUFFO2dCQUNWLEtBQUssRUFBRSxJQUFJO2FBQ1o7WUFDRCxjQUFjLEVBQUU7Z0JBQ2QsU0FBUyxFQUFFLENBQUM7Z0JBQ1osZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsYUFBYSxFQUFFLElBQUk7Z0JBQ25CLGNBQWMsRUFBRSxJQUFJO2FBQ3JCO1lBQ0QsZUFBZSxFQUFFLE9B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LEVBQUUsRUFBRSxFQUFFLGtEQUFrRDtZQUNqRSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3BCLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhO1NBQzVELENBQUMsQ0FBQztRQUVILGlCQUFpQixDQUFDLGNBQWMsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDOUUsQ0FBQztDQUNGO0FBdjNCRCx3REF1M0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyByZHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJkcyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBlbGFzdGljYWNoZSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2FjaGUnO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgc3RlcGZ1bmN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3RlcGZ1bmN0aW9ucyc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFsbHVjaWZpeENvbXB1dGVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICB2cGM6IGVjMi5WcGM7XG4gIGxhbWJkYVNlY3VyaXR5R3JvdXA6IGVjMi5TZWN1cml0eUdyb3VwO1xuICBkYXRhYmFzZTogcmRzLkRhdGFiYXNlSW5zdGFuY2U7XG4gIGNhY2hlOiBlbGFzdGljYWNoZS5DZm5DYWNoZUNsdXN0ZXI7XG4gIGJ1Y2tldDogczMuQnVja2V0O1xuICBkaXN0cmlidXRpb24/OiBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbjtcbiAgYmF0Y2hBbmFseXNpc1N0YXRlTWFjaGluZT86IHN0ZXBmdW5jdGlvbnMuU3RhdGVNYWNoaW5lO1xufVxuXG5leHBvcnQgY2xhc3MgSGFsbHVjaWZpeENvbXB1dGVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbDtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sQ2xpZW50OiBjb2duaXRvLlVzZXJQb29sQ2xpZW50O1xuICBwdWJsaWMgcmVhZG9ubHkgaWRlbnRpdHlQb29sOiBjb2duaXRvLkNmbklkZW50aXR5UG9vbDtcbiAgcHVibGljIHJlYWRvbmx5IGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuICBwdWJsaWMgcmVhZG9ubHkgbGFtYmRhRnVuY3Rpb25zOiBsYW1iZGEuRnVuY3Rpb25bXSA9IFtdO1xuICBwdWJsaWMgcmVhZG9ubHkgYWxlcnRUb3BpYzogc25zLlRvcGljO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBIYWxsdWNpZml4Q29tcHV0ZVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdIYWxsdWNpZml4VXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGBoYWxsdWNpZml4LXVzZXJzLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogOCxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IHRydWUsXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgICAgbWZhOiBjb2duaXRvLk1mYS5PUFRJT05BTCxcbiAgICAgIG1mYVNlY29uZEZhY3Rvcjoge1xuICAgICAgICBzbXM6IHRydWUsXG4gICAgICAgIG90cDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBnaXZlbk5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZmFtaWx5TmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgc3Vic2NyaXB0aW9uVGllcjogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgICAgdXNhZ2VRdW90YTogbmV3IGNvZ25pdG8uTnVtYmVyQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxuICAgICAgICA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiBcbiAgICAgICAgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gR29vZ2xlIE9BdXRoIElkZW50aXR5IFByb3ZpZGVyIChwbGFjZWhvbGRlciAtIHJlcXVpcmVzIEdvb2dsZSBPQXV0aCBjcmVkZW50aWFscylcbiAgICBjb25zdCBnb29nbGVQcm92aWRlciA9IG5ldyBjb2duaXRvLlVzZXJQb29sSWRlbnRpdHlQcm92aWRlckdvb2dsZSh0aGlzLCAnR29vZ2xlUHJvdmlkZXInLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIGNsaWVudElkOiAnR09PR0xFX0NMSUVOVF9JRF9QTEFDRUhPTERFUicsIC8vIFdpbGwgYmUgcmVwbGFjZWQgd2l0aCBhY3R1YWwgR29vZ2xlIE9BdXRoIGNsaWVudCBJRFxuICAgICAgY2xpZW50U2VjcmV0OiAnR09PR0xFX0NMSUVOVF9TRUNSRVRfUExBQ0VIT0xERVInLCAvLyBXaWxsIGJlIHJlcGxhY2VkIHdpdGggYWN0dWFsIHNlY3JldFxuICAgICAgc2NvcGVzOiBbJ2VtYWlsJywgJ3Byb2ZpbGUnLCAnb3BlbmlkJywgJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvZHJpdmUucmVhZG9ubHknXSxcbiAgICAgIGF0dHJpYnV0ZU1hcHBpbmc6IHtcbiAgICAgICAgZW1haWw6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0VNQUlMLFxuICAgICAgICBnaXZlbk5hbWU6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0dJVkVOX05BTUUsXG4gICAgICAgIGZhbWlseU5hbWU6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0ZBTUlMWV9OQU1FLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIENsaWVudFxuICAgIHRoaXMudXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnSGFsbHVjaWZpeFVzZXJQb29sQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6IGBoYWxsdWNpZml4LWNsaWVudC0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsIC8vIEZvciB3ZWIgYXBwbGljYXRpb25zXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgICAgdXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkNPR05JVE8sXG4gICAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkdPT0dMRSxcbiAgICAgIF0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgICAgaW1wbGljaXRDb2RlR3JhbnQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW1xuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgXG4gICAgICAgICAgPyBbJ2h0dHBzOi8vYXBwLmhhbGx1Y2lmaXguY29tL2NhbGxiYWNrJ11cbiAgICAgICAgICA6IHByb3BzLmRpc3RyaWJ1dGlvbiBcbiAgICAgICAgICAgID8gWydodHRwOi8vbG9jYWxob3N0OjMwMDAvY2FsbGJhY2snLCBgaHR0cHM6Ly8ke3Byb3BzLmRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfS9jYWxsYmFja2BdXG4gICAgICAgICAgICA6IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwL2NhbGxiYWNrJ10sXG4gICAgICAgIGxvZ291dFVybHM6IHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCdcbiAgICAgICAgICA/IFsnaHR0cHM6Ly9hcHAuaGFsbHVjaWZpeC5jb20vbG9nb3V0J11cbiAgICAgICAgICA6IHByb3BzLmRpc3RyaWJ1dGlvblxuICAgICAgICAgICAgPyBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9sb2dvdXQnLCBgaHR0cHM6Ly8ke3Byb3BzLmRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfS9sb2dvdXRgXVxuICAgICAgICAgICAgOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9sb2dvdXQnXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBFbnN1cmUgdGhlIGNsaWVudCBkZXBlbmRzIG9uIHRoZSBHb29nbGUgcHJvdmlkZXJcbiAgICB0aGlzLnVzZXJQb29sQ2xpZW50Lm5vZGUuYWRkRGVwZW5kZW5jeShnb29nbGVQcm92aWRlcik7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbCBEb21haW4gZm9yIE9BdXRoXG4gICAgY29uc3QgdXNlclBvb2xEb21haW4gPSBuZXcgY29nbml0by5Vc2VyUG9vbERvbWFpbih0aGlzLCAnSGFsbHVjaWZpeFVzZXJQb29sRG9tYWluJywge1xuICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgIGRvbWFpblByZWZpeDogYGhhbGx1Y2lmaXgtJHtwcm9wcy5lbnZpcm9ubWVudH0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHJpbmcoMiwgOCl9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIElkZW50aXR5IFBvb2xcbiAgICB0aGlzLmlkZW50aXR5UG9vbCA9IG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbCh0aGlzLCAnSGFsbHVjaWZpeElkZW50aXR5UG9vbCcsIHtcbiAgICAgIGlkZW50aXR5UG9vbE5hbWU6IGBoYWxsdWNpZml4X2lkZW50aXR5X3Bvb2xfJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSxcbiAgICAgIGNvZ25pdG9JZGVudGl0eVByb3ZpZGVyczogW1xuICAgICAgICB7XG4gICAgICAgICAgY2xpZW50SWQ6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgICBwcm92aWRlck5hbWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xQcm92aWRlck5hbWUsXG4gICAgICAgICAgc2VydmVyU2lkZVRva2VuQ2hlY2s6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgc3VwcG9ydGVkTG9naW5Qcm92aWRlcnM6IHtcbiAgICAgICAgJ2FjY291bnRzLmdvb2dsZS5jb20nOiAnR09PR0xFX0NMSUVOVF9JRF9QTEFDRUhPTERFUicsIC8vIFdpbGwgYmUgcmVwbGFjZWQgd2l0aCBhY3R1YWwgR29vZ2xlIE9BdXRoIGNsaWVudCBJRFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIElBTSByb2xlcyBmb3IgYXV0aGVudGljYXRlZCBhbmQgdW5hdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgY29uc3QgYXV0aGVudGljYXRlZFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0NvZ25pdG9BdXRoZW50aWNhdGVkUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXG4gICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb20nLFxuICAgICAgICB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZCc6IHRoaXMuaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICAgICB9LFxuICAgICAgICAgICdGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlJzoge1xuICAgICAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphbXInOiAnYXV0aGVudGljYXRlZCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgJ3N0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5J1xuICAgICAgKSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIENvZ25pdG9BdXRoZW50aWNhdGVkUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdjb2duaXRvLXN5bmM6KicsXG4gICAgICAgICAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHk6KicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Ake3Byb3BzLmJ1Y2tldC5idWNrZXRBcm59L3VzZXItdXBsb2Fkcy9cXCR7Y29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOnN1Yn0vKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gSWRlbnRpdHkgUG9vbCBSb2xlIEF0dGFjaG1lbnRcbiAgICBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudCh0aGlzLCAnSWRlbnRpdHlQb29sUm9sZUF0dGFjaG1lbnQnLCB7XG4gICAgICBpZGVudGl0eVBvb2xJZDogdGhpcy5pZGVudGl0eVBvb2wucmVmLFxuICAgICAgcm9sZXM6IHtcbiAgICAgICAgYXV0aGVudGljYXRlZDogYXV0aGVudGljYXRlZFJvbGUucm9sZUFybixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgU05TIHRvcGljIGZvciBhbGVydHNcbiAgICB0aGlzLmFsZXJ0VG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdMYW1iZGFBbGVydFRvcGljJywge1xuICAgICAgdG9waWNOYW1lOiBgaGFsbHVjaWZpeC1sYW1iZGEtYWxlcnRzLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGRpc3BsYXlOYW1lOiBgSGFsbHVjaUZpeCBMYW1iZGEgQWxlcnRzICgke3Byb3BzLmVudmlyb25tZW50fSlgLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGV4ZWN1dGlvbiByb2xlXG4gICAgY29uc3QgbGFtYmRhUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnTGFtYmRhRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYVZQQ0FjY2Vzc0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBV1NYUmF5RGFlbW9uV3JpdGVBY2Nlc3MnKSxcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBIYWxsdWNpZml4TGFtYmRhUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdyZHMtZGF0YTpFeGVjdXRlU3RhdGVtZW50JyxcbiAgICAgICAgICAgICAgICAncmRzLWRhdGE6QmF0Y2hFeGVjdXRlU3RhdGVtZW50JyxcbiAgICAgICAgICAgICAgICAncmRzLWRhdGE6QmVnaW5UcmFuc2FjdGlvbicsXG4gICAgICAgICAgICAgICAgJ3Jkcy1kYXRhOkNvbW1pdFRyYW5zYWN0aW9uJyxcbiAgICAgICAgICAgICAgICAncmRzLWRhdGE6Um9sbGJhY2tUcmFuc2FjdGlvbicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW3Byb3BzLmRhdGFiYXNlLmluc3RhbmNlQXJuXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6RGVsZXRlT2JqZWN0JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYCR7cHJvcHMuYnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMuYnVja2V0LmJ1Y2tldEFybl0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSwgLy8gV2lsbCBiZSByZXN0cmljdGVkIHRvIHNwZWNpZmljIHNlY3JldHNcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbCcsXG4gICAgICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW0nLFxuICAgICAgICAgICAgICAgICdiZWRyb2NrOkxpc3RGb3VuZGF0aW9uTW9kZWxzJyxcbiAgICAgICAgICAgICAgICAnYmVkcm9jazpHZXRGb3VuZGF0aW9uTW9kZWwnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLCAvLyBCZWRyb2NrIG1vZGVsIEFSTnNcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnY29nbml0by1pZHA6R2V0VXNlcicsXG4gICAgICAgICAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluR2V0VXNlcicsXG4gICAgICAgICAgICAgICAgJ2NvZ25pdG8taWRwOkxpc3RVc2VycycsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sIC8vIFdpbGwgYmUgcmVzdHJpY3RlZCB0byBzcGVjaWZpYyB1c2VyIHBvb2xzXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NlczpTZW5kRW1haWwnLFxuICAgICAgICAgICAgICAgICdzZXM6U2VuZFJhd0VtYWlsJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSwgLy8gV2lsbCBiZSByZXN0cmljdGVkIHRvIHNwZWNpZmljIGVtYWlsIGFkZHJlc3Nlc1xuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGEnLFxuICAgICAgICAgICAgICAgICdjbG91ZHdhdGNoOkdldE1ldHJpY1N0YXRpc3RpY3MnLFxuICAgICAgICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAgICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cycsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6U3RhcnRRdWVyeScsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6R2V0UXVlcnlSZXN1bHRzJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnc25zOlB1Ymxpc2gnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFt0aGlzLmFsZXJ0VG9waWMudG9waWNBcm5dLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIExheWVyIGZvciBjb21tb24gZGVwZW5kZW5jaWVzXG4gICAgY29uc3QgY29tbW9uTGF5ZXIgPSBuZXcgbGFtYmRhLkxheWVyVmVyc2lvbih0aGlzLCAnQ29tbW9uTGF5ZXInLCB7XG4gICAgICBsYXllclZlcnNpb25OYW1lOiBgaGFsbHVjaWZpeC1jb21tb24tJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEtbGF5ZXJzL2NvbW1vbicpLCAvLyBXaWxsIGJlIGNyZWF0ZWQgbGF0ZXJcbiAgICAgIGNvbXBhdGlibGVSdW50aW1lczogW2xhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29tbW9uIGRlcGVuZGVuY2llcyBmb3IgSGFsbHVjaUZpeCBMYW1iZGEgZnVuY3Rpb25zJyxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdIYWxsdWNpZml4QXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6IGBoYWxsdWNpZml4LWFwaS0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0hhbGx1Y2lGaXggQVBJIEdhdGV3YXknLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyBcbiAgICAgICAgICA/IFsnaHR0cHM6Ly9hcHAuaGFsbHVjaWZpeC5jb20nXVxuICAgICAgICAgIDogcHJvcHMuZGlzdHJpYnV0aW9uXG4gICAgICAgICAgICA/IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwJywgYGh0dHBzOi8vJHtwcm9wcy5kaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gXVxuICAgICAgICAgICAgOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCddLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFsnR0VUJywgJ1BPU1QnLCAnUFVUJywgJ0RFTEVURScsICdPUFRJT05TJ10sXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbiddLFxuICAgICAgfSxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIEF1dGhvcml6ZXJcbiAgICBjb25zdCBjb2duaXRvQXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKHRoaXMsICdDb2duaXRvQXV0aG9yaXplcicsIHtcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFt0aGlzLnVzZXJQb29sXSxcbiAgICAgIGF1dGhvcml6ZXJOYW1lOiAnSGFsbHVjaWZpeEF1dGhvcml6ZXInLFxuICAgIH0pO1xuXG4gICAgLy8gU2NhbiBFeGVjdXRvciBMYW1iZGEgRnVuY3Rpb24gKG1pZ3JhdGVkIGZyb20gU3VwYWJhc2UgRWRnZSBGdW5jdGlvbilcbiAgICBjb25zdCBzY2FuRXhlY3V0b3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1NjYW5FeGVjdXRvckZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgaGFsbHVjaWZpeC1zY2FuLWV4ZWN1dG9yLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEtZnVuY3Rpb25zL3NjYW4tZXhlY3V0b3InKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgPyAxMDI0IDogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9ERV9FTlY6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICBBV1NfUkVHSU9OOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgREJfQ0xVU1RFUl9BUk46IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlQXJuLFxuICAgICAgICBEQl9TRUNSRVRfQVJOOiBwcm9wcy5kYXRhYmFzZS5zZWNyZXQ/LnNlY3JldEFybiB8fCAnJyxcbiAgICAgICAgSEFMTFVDSUZJWF9BUElfS0VZX1NFQ1JFVDogYGhhbGx1Y2lmaXgtYXBpLWtleS0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlY3VyaXR5R3JvdXBzOiBbcHJvcHMubGFtYmRhU2VjdXJpdHlHcm91cF0sXG4gICAgICBsYXllcnM6IFtjb21tb25MYXllcl0sXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsIC8vIEVuYWJsZSBYLVJheSB0cmFjaW5nXG4gICAgfSk7XG5cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9ucy5wdXNoKHNjYW5FeGVjdXRvckZ1bmN0aW9uKTtcblxuICAgIC8vIEJpbGxpbmcgQVBJIExhbWJkYSBGdW5jdGlvbiAobWlncmF0ZWQgZnJvbSBTdXBhYmFzZSBFZGdlIEZ1bmN0aW9uKVxuICAgIGNvbnN0IGJpbGxpbmdBcGlGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0JpbGxpbmdBcGlGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGhhbGx1Y2lmaXgtYmlsbGluZy1hcGktJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS1mdW5jdGlvbnMvYmlsbGluZy1hcGknKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgQVdTX1JFR0lPTjogdGhpcy5yZWdpb24sXG4gICAgICAgIERCX0NMVVNURVJfQVJOOiBwcm9wcy5kYXRhYmFzZS5pbnN0YW5jZUFybixcbiAgICAgICAgREJfU0VDUkVUX0FSTjogcHJvcHMuZGF0YWJhc2Uuc2VjcmV0Py5zZWNyZXRBcm4gfHwgJycsXG4gICAgICAgIFNUUklQRV9TRUNSRVRfS0VZX0FSTjogYHN0cmlwZS1zZWNyZXQta2V5LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgICAgQ09HTklUT19VU0VSX1BPT0xfSUQ6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIH0sXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5sYW1iZGFTZWN1cml0eUdyb3VwXSxcbiAgICAgIGxheWVyczogW2NvbW1vbkxheWVyXSxcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcbiAgICB9KTtcblxuICAgIHRoaXMubGFtYmRhRnVuY3Rpb25zLnB1c2goYmlsbGluZ0FwaUZ1bmN0aW9uKTtcblxuICAgIC8vIFBheW1lbnQgTWV0aG9kcyBBUEkgTGFtYmRhIEZ1bmN0aW9uIChtaWdyYXRlZCBmcm9tIFN1cGFiYXNlIEVkZ2UgRnVuY3Rpb24pXG4gICAgY29uc3QgcGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1BheW1lbnRNZXRob2RzQXBpRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBoYWxsdWNpZml4LXBheW1lbnQtbWV0aG9kcy1hcGktJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS1mdW5jdGlvbnMvcGF5bWVudC1tZXRob2RzLWFwaScpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9ERV9FTlY6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICBBV1NfUkVHSU9OOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgREJfQ0xVU1RFUl9BUk46IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlQXJuLFxuICAgICAgICBEQl9TRUNSRVRfQVJOOiBwcm9wcy5kYXRhYmFzZS5zZWNyZXQ/LnNlY3JldEFybiB8fCAnJyxcbiAgICAgICAgU1RSSVBFX1NFQ1JFVF9LRVlfQVJOOiBgc3RyaXBlLXNlY3JldC1rZXktJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICBDT0dOSVRPX1VTRVJfUE9PTF9JRDogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgfSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmxhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgbGF5ZXJzOiBbY29tbW9uTGF5ZXJdLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgIH0pO1xuXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbnMucHVzaChwYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uKTtcblxuICAgIC8vIFN0cmlwZSBXZWJob29rIExhbWJkYSBGdW5jdGlvbiAobWlncmF0ZWQgZnJvbSBTdXBhYmFzZSBFZGdlIEZ1bmN0aW9uKVxuICAgIGNvbnN0IHN0cmlwZVdlYmhvb2tGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1N0cmlwZVdlYmhvb2tGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGhhbGx1Y2lmaXgtc3RyaXBlLXdlYmhvb2stJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS1mdW5jdGlvbnMvc3RyaXBlLXdlYmhvb2snKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9ERV9FTlY6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICBBV1NfUkVHSU9OOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgREJfQ0xVU1RFUl9BUk46IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlQXJuLFxuICAgICAgICBEQl9TRUNSRVRfQVJOOiBwcm9wcy5kYXRhYmFzZS5zZWNyZXQ/LnNlY3JldEFybiB8fCAnJyxcbiAgICAgICAgU1RSSVBFX1NFQ1JFVF9LRVlfQVJOOiBgc3RyaXBlLXNlY3JldC1rZXktJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICBTVFJJUEVfV0VCSE9PS19TRUNSRVRfQVJOOiBgc3RyaXBlLXdlYmhvb2stc2VjcmV0LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgICAgRlJPTV9FTUFJTDogYG5vcmVwbHlAaGFsbHVjaWZpeC5jb21gLFxuICAgICAgfSxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgIH0sXG4gICAgICBzZWN1cml0eUdyb3VwczogW3Byb3BzLmxhbWJkYVNlY3VyaXR5R3JvdXBdLFxuICAgICAgbGF5ZXJzOiBbY29tbW9uTGF5ZXJdLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgIH0pO1xuXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbnMucHVzaChzdHJpcGVXZWJob29rRnVuY3Rpb24pO1xuXG4gICAgLy8gRmlsZSBQcm9jZXNzb3IgTGFtYmRhIEZ1bmN0aW9uIChmb3IgUzMgZmlsZSBwcm9jZXNzaW5nKVxuICAgIGNvbnN0IGZpbGVQcm9jZXNzb3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0ZpbGVQcm9jZXNzb3JGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGhhbGx1Y2lmaXgtZmlsZS1wcm9jZXNzb3ItJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS1mdW5jdGlvbnMvZmlsZS1wcm9jZXNzb3InKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWVtb3J5U2l6ZTogMTAyNCwgLy8gSGlnaGVyIG1lbW9yeSBmb3IgZmlsZSBwcm9jZXNzaW5nXG4gICAgICBsYXllcnM6IFtjb21tb25MYXllcl0sXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFTlZJUk9OTUVOVDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgIERBVEFCQVNFX0hPU1Q6IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQuaG9zdG5hbWUsXG4gICAgICAgIERBVEFCQVNFX1BPUlQ6IHByb3BzLmRhdGFiYXNlLmluc3RhbmNlRW5kcG9pbnQucG9ydC50b1N0cmluZygpLFxuICAgICAgICBDQUNIRV9IT1NUOiBwcm9wcy5jYWNoZS5hdHRyUmVkaXNFbmRwb2ludEFkZHJlc3MsXG4gICAgICAgIENBQ0hFX1BPUlQ6ICc2Mzc5JyxcbiAgICAgICAgUzNfQlVDS0VUX05BTUU6IHByb3BzLmJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBQUk9DRVNTSU5HX1JFU1VMVFNfVEFCTEU6IGBoYWxsdWNpZml4LXByb2Nlc3NpbmctcmVzdWx0cy0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICB2cGNTdWJuZXRzOiB7XG4gICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXG4gICAgICB9LFxuICAgICAgc2VjdXJpdHlHcm91cHM6IFtwcm9wcy5sYW1iZGFTZWN1cml0eUdyb3VwXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFMzIHBlcm1pc3Npb25zIHRvIGZpbGUgcHJvY2Vzc29yXG4gICAgcHJvcHMuYnVja2V0LmdyYW50UmVhZFdyaXRlKGZpbGVQcm9jZXNzb3JGdW5jdGlvbik7XG5cbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9ucy5wdXNoKGZpbGVQcm9jZXNzb3JGdW5jdGlvbik7XG5cbiAgICAvLyBBUEkgR2F0ZXdheSByb3V0ZXMgZm9yIG1pZ3JhdGVkIGZ1bmN0aW9uc1xuICAgIFxuICAgIC8vIEJpbGxpbmcgQVBJIHJvdXRlc1xuICAgIGNvbnN0IGJpbGxpbmdSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2JpbGxpbmcnKTtcbiAgICBiaWxsaW5nUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihiaWxsaW5nQXBpRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgYmlsbGluZ1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGJpbGxpbmdBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGJpbGxpbmdJbmZvUmVzb3VyY2UgPSBiaWxsaW5nUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2luZm8nKTtcbiAgICBiaWxsaW5nSW5mb1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYmlsbGluZ0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmlsbGluZ1VzYWdlUmVzb3VyY2UgPSBiaWxsaW5nUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3VzYWdlJyk7XG4gICAgY29uc3QgYmlsbGluZ0FuYWx5dGljc1Jlc291cmNlID0gYmlsbGluZ1VzYWdlUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2FuYWx5dGljcycpO1xuICAgIGJpbGxpbmdBbmFseXRpY3NSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGJpbGxpbmdBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGJpbGxpbmdJbnZvaWNlc1Jlc291cmNlID0gYmlsbGluZ1Jlc291cmNlLmFkZFJlc291cmNlKCdpbnZvaWNlcycpO1xuICAgIGJpbGxpbmdJbnZvaWNlc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYmlsbGluZ0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmlsbGluZ1BvcnRhbFJlc291cmNlID0gYmlsbGluZ1Jlc291cmNlLmFkZFJlc291cmNlKCdwb3J0YWwnKTtcbiAgICBiaWxsaW5nUG9ydGFsUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYmlsbGluZ0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYmlsbGluZ0NhbmNlbFJlc291cmNlID0gYmlsbGluZ1Jlc291cmNlLmFkZFJlc291cmNlKCdjYW5jZWwnKTtcbiAgICBiaWxsaW5nQ2FuY2VsUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYmlsbGluZ0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gUGF5bWVudCBNZXRob2RzIEFQSSByb3V0ZXNcbiAgICBjb25zdCBwYXltZW50TWV0aG9kc1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgncGF5bWVudC1tZXRob2RzJyk7XG4gICAgcGF5bWVudE1ldGhvZHNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBheW1lbnRNZXRob2RzQXBpRnVuY3Rpb24pLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgcGF5bWVudE1ldGhvZHNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2V0dXBJbnRlbnRSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3NldHVwLWludGVudCcpO1xuICAgIHNldHVwSW50ZW50UmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBheW1lbnRNZXRob2RSZXNvdXJjZSA9IHBheW1lbnRNZXRob2RzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3twYXltZW50TWV0aG9kSWR9Jyk7XG4gICAgcGF5bWVudE1ldGhvZFJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBheW1lbnRNZXRob2REZWZhdWx0UmVzb3VyY2UgPSBwYXltZW50TWV0aG9kUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2RlZmF1bHQnKTtcbiAgICBwYXltZW50TWV0aG9kRGVmYXVsdFJlc291cmNlLmFkZE1ldGhvZCgnUFVUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHBheW1lbnRNZXRob2RWYWxpZGF0ZVJlc291cmNlID0gcGF5bWVudE1ldGhvZFJlc291cmNlLmFkZFJlc291cmNlKCd2YWxpZGF0ZScpO1xuICAgIHBheW1lbnRNZXRob2RWYWxpZGF0ZVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIC8vIEZpbGUgcHJvY2Vzc2luZyBBUEkgcm91dGVzXG4gICAgY29uc3QgZmlsZXNSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2ZpbGVzJyk7XG4gICAgY29uc3QgcHJvY2Vzc0ZpbGVSZXNvdXJjZSA9IGZpbGVzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3Byb2Nlc3MnKTtcbiAgICBwcm9jZXNzRmlsZVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZpbGVQcm9jZXNzb3JGdW5jdGlvbiksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHByb2Nlc3NpbmdTdGF0dXNSZXNvdXJjZSA9IGZpbGVzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3Byb2Nlc3Npbmctc3RhdHVzJyk7XG4gICAgcHJvY2Vzc2luZ1N0YXR1c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZmlsZVByb2Nlc3NvckZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gU3RyaXBlIFdlYmhvb2sgcm91dGUgKG5vIGF1dGhvcml6YXRpb24gcmVxdWlyZWQgZm9yIHdlYmhvb2tzKVxuICAgIGNvbnN0IHdlYmhvb2tSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3dlYmhvb2snKTtcbiAgICBjb25zdCBzdHJpcGVXZWJob29rUmVzb3VyY2UgPSB3ZWJob29rUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0cmlwZScpO1xuICAgIHN0cmlwZVdlYmhvb2tSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihzdHJpcGVXZWJob29rRnVuY3Rpb24pKTtcblxuICAgIC8vIEV2ZW50QnJpZGdlIHJ1bGUgdG8gdHJpZ2dlciBzY2FuIGV4ZWN1dG9yIGZ1bmN0aW9uIGV2ZXJ5IDUgbWludXRlc1xuICAgIGNvbnN0IHNjYW5FeGVjdXRvclJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ1NjYW5FeGVjdXRvclJ1bGUnLCB7XG4gICAgICBydWxlTmFtZTogYGhhbGx1Y2lmaXgtc2Nhbi1leGVjdXRvci0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RyaWdnZXIgc2NhbiBleGVjdXRvciBmdW5jdGlvbiBldmVyeSA1IG1pbnV0ZXMnLFxuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKGNkay5EdXJhdGlvbi5taW51dGVzKDUpKSxcbiAgICB9KTtcblxuICAgIHNjYW5FeGVjdXRvclJ1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKHNjYW5FeGVjdXRvckZ1bmN0aW9uKSk7XG5cbiAgICAvLyBTY2FuIEV4ZWN1dG9yIGZ1bmN0aW9uIG1hbnVhbCB0cmlnZ2VyIGVuZHBvaW50IGZvciB0ZXN0aW5nXG4gICAgY29uc3Qgc2NhblJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnc2NhbicpO1xuICAgIGNvbnN0IGV4ZWN1dGVTY2FuUmVzb3VyY2UgPSBzY2FuUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2V4ZWN1dGUnKTtcbiAgICBleGVjdXRlU2NhblJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHNjYW5FeGVjdXRvckZ1bmN0aW9uKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gU3RlcCBGdW5jdGlvbnMgaW50ZWdyYXRpb24gZm9yIGJhdGNoIGFuYWx5c2lzXG4gICAgaWYgKHByb3BzLmJhdGNoQW5hbHlzaXNTdGF0ZU1hY2hpbmUpIHtcbiAgICAgIGNvbnN0IHN0ZXBGdW5jdGlvbkV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1N0ZXBGdW5jdGlvbkV4ZWN1dGlvblJvbGUnLCB7XG4gICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdhcGlnYXRld2F5LmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgICBTdGVwRnVuY3Rpb25FeGVjdXRpb25Qb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICdzdGF0ZXM6U3RhcnRFeGVjdXRpb24nLFxuICAgICAgICAgICAgICAgICAgJ3N0YXRlczpEZXNjcmliZUV4ZWN1dGlvbicsXG4gICAgICAgICAgICAgICAgICAnc3RhdGVzOlN0b3BFeGVjdXRpb24nLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMuYmF0Y2hBbmFseXNpc1N0YXRlTWFjaGluZS5zdGF0ZU1hY2hpbmVBcm5dLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQmF0Y2ggYW5hbHlzaXMgZW5kcG9pbnRzXG4gICAgICBjb25zdCBiYXRjaFJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYmF0Y2gnKTtcbiAgICAgIFxuICAgICAgLy8gU3RhcnQgYmF0Y2ggYW5hbHlzaXNcbiAgICAgIGNvbnN0IHN0YXJ0QmF0Y2hSZXNvdXJjZSA9IGJhdGNoUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0YXJ0Jyk7XG4gICAgICBzdGFydEJhdGNoUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuQXdzSW50ZWdyYXRpb24oe1xuICAgICAgICBzZXJ2aWNlOiAnc3RhdGVzJyxcbiAgICAgICAgYWN0aW9uOiAnU3RhcnRFeGVjdXRpb24nLFxuICAgICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgIGNyZWRlbnRpYWxzUm9sZTogc3RlcEZ1bmN0aW9uRXhlY3V0aW9uUm9sZSxcbiAgICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgc3RhdGVNYWNoaW5lQXJuOiBwcm9wcy5iYXRjaEFuYWx5c2lzU3RhdGVNYWNoaW5lLnN0YXRlTWFjaGluZUFybixcbiAgICAgICAgICAgICAgaW5wdXQ6ICckdXRpbC5lc2NhcGVKYXZhU2NyaXB0KCRpbnB1dC5ib2R5KScsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGludGVncmF0aW9uUmVzcG9uc2VzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0YXR1c0NvZGU6ICcyMDAnLFxuICAgICAgICAgICAgICByZXNwb25zZVRlbXBsYXRlczoge1xuICAgICAgICAgICAgICAgICdhcHBsaWNhdGlvbi9qc29uJzogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgICAgZXhlY3V0aW9uQXJuOiAnJGlucHV0LnBhdGgoXFwnJC5leGVjdXRpb25Bcm5cXCcpJyxcbiAgICAgICAgICAgICAgICAgIHN0YXJ0RGF0ZTogJyRpbnB1dC5wYXRoKFxcJyQuc3RhcnREYXRlXFwnKScsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdGF0dXNDb2RlOiAnNDAwJyxcbiAgICAgICAgICAgICAgc2VsZWN0aW9uUGF0dGVybjogJzRcXFxcZHsyfScsXG4gICAgICAgICAgICAgIHJlc3BvbnNlVGVtcGxhdGVzOiB7XG4gICAgICAgICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICBlcnJvcjogJ0JhZCBSZXF1ZXN0JyxcbiAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICckaW5wdXQucGF0aChcXCckLmVycm9yTWVzc2FnZVxcJyknLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgfSksIHtcbiAgICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICAgIG1ldGhvZFJlc3BvbnNlczogW1xuICAgICAgICAgIHsgc3RhdHVzQ29kZTogJzIwMCcgfSxcbiAgICAgICAgICB7IHN0YXR1c0NvZGU6ICc0MDAnIH0sXG4gICAgICAgIF0sXG4gICAgICB9KTtcblxuICAgICAgLy8gR2V0IGJhdGNoIGV4ZWN1dGlvbiBzdGF0dXNcbiAgICAgIGNvbnN0IHN0YXR1c0JhdGNoUmVzb3VyY2UgPSBiYXRjaFJlc291cmNlLmFkZFJlc291cmNlKCdzdGF0dXMnKS5hZGRSZXNvdXJjZSgne2V4ZWN1dGlvbkFybit9Jyk7XG4gICAgICBzdGF0dXNCYXRjaFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuQXdzSW50ZWdyYXRpb24oe1xuICAgICAgICBzZXJ2aWNlOiAnc3RhdGVzJyxcbiAgICAgICAgYWN0aW9uOiAnRGVzY3JpYmVFeGVjdXRpb24nLFxuICAgICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgIGNyZWRlbnRpYWxzUm9sZTogc3RlcEZ1bmN0aW9uRXhlY3V0aW9uUm9sZSxcbiAgICAgICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7XG4gICAgICAgICAgICAnYXBwbGljYXRpb24vanNvbic6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgZXhlY3V0aW9uQXJuOiAnJG1ldGhvZC5yZXF1ZXN0LnBhdGguZXhlY3V0aW9uQXJuJyxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgaW50ZWdyYXRpb25SZXNwb25zZXM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RhdHVzQ29kZTogJzIwMCcsXG4gICAgICAgICAgICAgIHJlc3BvbnNlVGVtcGxhdGVzOiB7XG4gICAgICAgICAgICAgICAgJ2FwcGxpY2F0aW9uL2pzb24nOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgICAgICBleGVjdXRpb25Bcm46ICckaW5wdXQucGF0aChcXCckLmV4ZWN1dGlvbkFyblxcJyknLFxuICAgICAgICAgICAgICAgICAgc3RhdHVzOiAnJGlucHV0LnBhdGgoXFwnJC5zdGF0dXNcXCcpJyxcbiAgICAgICAgICAgICAgICAgIHN0YXJ0RGF0ZTogJyRpbnB1dC5wYXRoKFxcJyQuc3RhcnREYXRlXFwnKScsXG4gICAgICAgICAgICAgICAgICBzdG9wRGF0ZTogJyRpbnB1dC5wYXRoKFxcJyQuc3RvcERhdGVcXCcpJyxcbiAgICAgICAgICAgICAgICAgIG91dHB1dDogJyRpbnB1dC5wYXRoKFxcJyQub3V0cHV0XFwnKScsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9KSwge1xuICAgICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgICAgbWV0aG9kUmVzcG9uc2VzOiBbXG4gICAgICAgICAgeyBzdGF0dXNDb2RlOiAnMjAwJyB9LFxuICAgICAgICBdLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gTW9uaXRvcmluZyBBZ2VudCBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBtb25pdG9yaW5nQWdlbnRGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ01vbml0b3JpbmdBZ2VudEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgaGFsbHVjaWZpeC1tb25pdG9yaW5nLWFnZW50LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEtZnVuY3Rpb25zL21vbml0b3JpbmctYWdlbnQnKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgQVdTX1JFR0lPTjogdGhpcy5yZWdpb24sXG4gICAgICAgIEFMRVJUX1RPUElDX0FSTjogdGhpcy5hbGVydFRvcGljLnRvcGljQXJuLFxuICAgICAgICBGVU5DVElPTl9QUkVGSVg6ICdoYWxsdWNpZml4JyxcbiAgICAgIH0sXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgIH0pO1xuXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbnMucHVzaChtb25pdG9yaW5nQWdlbnRGdW5jdGlvbik7XG5cbiAgICAvLyBTZXQgdXAgbW9uaXRvcmluZyBpbmZyYXN0cnVjdHVyZVxuICAgIHRoaXMuc2V0dXBMYW1iZGFNb25pdG9yaW5nKCk7XG5cbiAgICAvLyBTY2hlZHVsZSBtb25pdG9yaW5nIGFnZW50IHRvIHJ1biBldmVyeSA1IG1pbnV0ZXNcbiAgICBjb25zdCBtb25pdG9yaW5nUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnTW9uaXRvcmluZ0FnZW50UnVsZScsIHtcbiAgICAgIHJ1bGVOYW1lOiBgaGFsbHVjaWZpeC1tb25pdG9yaW5nLWFnZW50LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHJpZ2dlciBtb25pdG9yaW5nIGFnZW50IGV2ZXJ5IDUgbWludXRlcycsXG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSkpLFxuICAgIH0pO1xuXG4gICAgbW9uaXRvcmluZ1J1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKG1vbml0b3JpbmdBZ2VudEZ1bmN0aW9uKSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tVXNlclBvb2xJZGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tVXNlclBvb2xDbGllbnRJZGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSWRlbnRpdHlQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5pZGVudGl0eVBvb2wucmVmLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIElkZW50aXR5IFBvb2wgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LUlkZW50aXR5UG9vbElkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbERvbWFpbi5kb21haW5OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBEb21haW4nLFxuICAgICAgZXhwb3J0TmFtZTogYCR7cHJvcHMuZW52aXJvbm1lbnR9LVVzZXJQb29sRG9tYWluYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5VXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1BcGlHYXRld2F5VXJsYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTY2FuRXhlY3V0b3JGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBzY2FuRXhlY3V0b3JGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2NhbiBFeGVjdXRvciBMYW1iZGEgRnVuY3Rpb24gQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1TY2FuRXhlY3V0b3JGdW5jdGlvbkFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQmlsbGluZ0FwaUZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGJpbGxpbmdBcGlGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQmlsbGluZyBBUEkgTGFtYmRhIEZ1bmN0aW9uIEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tQmlsbGluZ0FwaUZ1bmN0aW9uQXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQYXltZW50TWV0aG9kc0FwaUZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHBheW1lbnRNZXRob2RzQXBpRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1BheW1lbnQgTWV0aG9kcyBBUEkgTGFtYmRhIEZ1bmN0aW9uIEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tUGF5bWVudE1ldGhvZHNBcGlGdW5jdGlvbkFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3RyaXBlV2ViaG9va0Z1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHN0cmlwZVdlYmhvb2tGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RyaXBlIFdlYmhvb2sgTGFtYmRhIEZ1bmN0aW9uIEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5lbnZpcm9ubWVudH0tU3RyaXBlV2ViaG9va0Z1bmN0aW9uQXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGaWxlUHJvY2Vzc29yRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogZmlsZVByb2Nlc3NvckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdGaWxlIFByb2Nlc3NvciBMYW1iZGEgRnVuY3Rpb24gQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1GaWxlUHJvY2Vzc29yRnVuY3Rpb25Bcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FsZXJ0VG9waWNBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hbGVydFRvcGljLnRvcGljQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTTlMgVG9waWMgQVJOIGZvciBMYW1iZGEgYWxlcnRzJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmVudmlyb25tZW50fS1BbGVydFRvcGljQXJuYCxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBMYW1iZGFNb25pdG9yaW5nKCkge1xuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIGRhc2hib2FyZFxuICAgIGNvbnN0IGRhc2hib2FyZCA9IG5ldyBjbG91ZHdhdGNoLkRhc2hib2FyZCh0aGlzLCAnTGFtYmRhRGFzaGJvYXJkJywge1xuICAgICAgZGFzaGJvYXJkTmFtZTogYGhhbGx1Y2lmaXgtbGFtYmRhLW1vbml0b3JpbmctJHt0aGlzLnN0YWNrTmFtZX1gLFxuICAgIH0pO1xuXG4gICAgLy8gU2V0IHVwIG1vbml0b3JpbmcgZm9yIGVhY2ggTGFtYmRhIGZ1bmN0aW9uXG4gICAgdGhpcy5sYW1iZGFGdW5jdGlvbnMuZm9yRWFjaCgobGFtYmRhRnVuY3Rpb24sIGluZGV4KSA9PiB7XG4gICAgICB0aGlzLnNldHVwRnVuY3Rpb25Nb25pdG9yaW5nKGxhbWJkYUZ1bmN0aW9uLCBkYXNoYm9hcmQsIGluZGV4KTtcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBzeXN0ZW0td2lkZSBhbGFybXNcbiAgICB0aGlzLmNyZWF0ZVN5c3RlbUFsYXJtcygpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cEZ1bmN0aW9uTW9uaXRvcmluZyhsYW1iZGFGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uLCBkYXNoYm9hcmQ6IGNsb3Vkd2F0Y2guRGFzaGJvYXJkLCBpbmRleDogbnVtYmVyKSB7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lID0gbGFtYmRhRnVuY3Rpb24uZnVuY3Rpb25OYW1lO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggYWxhcm1zXG4gICAgY29uc3QgZXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIGAke2Z1bmN0aW9uTmFtZX1FcnJvckFsYXJtYCwge1xuICAgICAgYWxhcm1OYW1lOiBgJHtmdW5jdGlvbk5hbWV9LWVycm9yc2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgRXJyb3IgcmF0ZSBhbGFybSBmb3IgJHtmdW5jdGlvbk5hbWV9YCxcbiAgICAgIG1ldHJpYzogbGFtYmRhRnVuY3Rpb24ubWV0cmljRXJyb3JzKHtcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGR1cmF0aW9uQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgJHtmdW5jdGlvbk5hbWV9RHVyYXRpb25BbGFybWAsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7ZnVuY3Rpb25OYW1lfS1kdXJhdGlvbmAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgRHVyYXRpb24gYWxhcm0gZm9yICR7ZnVuY3Rpb25OYW1lfWAsXG4gICAgICBtZXRyaWM6IGxhbWJkYUZ1bmN0aW9uLm1ldHJpY0R1cmF0aW9uKHtcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogbGFtYmRhRnVuY3Rpb24udGltZW91dCA/IGxhbWJkYUZ1bmN0aW9uLnRpbWVvdXQudG9NaWxsaXNlY29uZHMoKSAqIDAuOCA6IDMwMDAwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDMsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHRocm90dGxlQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgJHtmdW5jdGlvbk5hbWV9VGhyb3R0bGVBbGFybWAsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7ZnVuY3Rpb25OYW1lfS10aHJvdHRsZXNgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYFRocm90dGxlIGFsYXJtIGZvciAke2Z1bmN0aW9uTmFtZX1gLFxuICAgICAgbWV0cmljOiBsYW1iZGFGdW5jdGlvbi5tZXRyaWNUaHJvdHRsZXMoe1xuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGFsYXJtcyB0byBTTlMgdG9waWNcbiAgICBlcnJvckFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpKTtcbiAgICBkdXJhdGlvbkFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpKTtcbiAgICB0aHJvdHRsZUFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpKTtcblxuICAgIC8vIEFkZCB3aWRnZXRzIHRvIGRhc2hib2FyZFxuICAgIGRhc2hib2FyZC5hZGRXaWRnZXRzKFxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICB0aXRsZTogYCR7ZnVuY3Rpb25OYW1lfSAtIEludm9jYXRpb25zICYgRXJyb3JzYCxcbiAgICAgICAgbGVmdDogW1xuICAgICAgICAgIGxhbWJkYUZ1bmN0aW9uLm1ldHJpY0ludm9jYXRpb25zKHtcbiAgICAgICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgICByaWdodDogW1xuICAgICAgICAgIGxhbWJkYUZ1bmN0aW9uLm1ldHJpY0Vycm9ycyh7XG4gICAgICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSxcbiAgICAgICAgd2lkdGg6IDEyLFxuICAgICAgICBoZWlnaHQ6IDYsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIGxvZyBncm91cCB3aXRoIHJldGVudGlvblxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsIGAke2Z1bmN0aW9uTmFtZX1Mb2dHcm91cGAsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7ZnVuY3Rpb25OYW1lfWAsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVTeXN0ZW1BbGFybXMoKSB7XG4gICAgLy8gQ3JlYXRlIGNvbXBvc2l0ZSBhbGFybSBmb3Igb3ZlcmFsbCBzeXN0ZW0gaGVhbHRoXG4gICAgY29uc3Qgc3lzdGVtSGVhbHRoQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnU3lzdGVtSGVhbHRoQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICdoYWxsdWNpZml4LXN5c3RlbS1oZWFsdGgnLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ092ZXJhbGwgc3lzdGVtIGhlYWx0aCBiYXNlZCBvbiBMYW1iZGEgZnVuY3Rpb24gZXJyb3JzJyxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWF0aEV4cHJlc3Npb24oe1xuICAgICAgICBleHByZXNzaW9uOiAnU1VNKE1FVFJJQ1MoKSknLFxuICAgICAgICB1c2luZ01ldHJpY3M6IHRoaXMubGFtYmRhRnVuY3Rpb25zLnJlZHVjZSgoYWNjLCBmdW5jLCBpbmRleCkgPT4ge1xuICAgICAgICAgIGFjY1tgZSR7aW5kZXh9YF0gPSBmdW5jLm1ldHJpY0Vycm9ycyh7XG4gICAgICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICB9LCB7fSBhcyBSZWNvcmQ8c3RyaW5nLCBjbG91ZHdhdGNoLklNZXRyaWM+KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMCwgLy8gQWxlcnQgaWYgdG90YWwgZXJyb3JzIGFjcm9zcyBhbGwgZnVuY3Rpb25zID4gMTBcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBzeXN0ZW1IZWFsdGhBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaC5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKSk7XG4gIH1cbn0iXX0=