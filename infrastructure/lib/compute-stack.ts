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
import { Construct } from 'constructs';

export interface HallucifixComputeStackProps extends cdk.StackProps {
  environment: string;
  vpc: ec2.Vpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  database: rds.DatabaseInstance;
  cache: elasticache.CfnCacheCluster;
  bucket: s3.Bucket;
  distribution?: cloudfront.Distribution;
}

export class HallucifixComputeStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly api: apigateway.RestApi;

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

    // Lambda execution role
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
      inlinePolicies: {
        HallucifixLambdaPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'rds:DescribeDBInstances',
                'rds:DescribeDBClusters',
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

    // Lambda function for content analysis
    const analysisFunction = new lambda.Function(this, 'AnalysisFunction', {
      functionName: `hallucifix-analysis-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Analysis function placeholder' })
          };
        };
      `), // Placeholder - will be replaced with actual code
      timeout: cdk.Duration.minutes(5),
      memorySize: props.environment === 'prod' ? 1024 : 512,
      environment: {
        NODE_ENV: props.environment,
        DATABASE_SECRET_ARN: props.database.secret?.secretArn || '',
        CACHE_ENDPOINT: props.cache.attrRedisEndpointAddress,
        S3_BUCKET: props.bucket.bucketName,
      },
      role: lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [commonLayer],
    });

    // Lambda function for user management
    const userFunction = new lambda.Function(this, 'UserFunction', {
      functionName: `hallucifix-user-${props.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'User function placeholder' })
          };
        };
      `), // Placeholder
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        NODE_ENV: props.environment,
        USER_POOL_ID: this.userPool.userPoolId,
        DATABASE_SECRET_ARN: props.database.secret?.secretArn || '',
      },
      role: lambdaRole,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      layers: [commonLayer],
    });

    // API Gateway routes
    const analysisResource = this.api.root.addResource('analysis');
    analysisResource.addMethod('POST', new apigateway.LambdaIntegration(analysisFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const userResource = this.api.root.addResource('user');
    userResource.addMethod('GET', new apigateway.LambdaIntegration(userFunction), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

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
  }
}