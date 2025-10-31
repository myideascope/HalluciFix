import { Amplify } from 'aws-amplify';

// AWS Bedrock configuration
export const bedrockConfig = {
  region: import.meta.env.AWS_REGION || import.meta.env.VITE_AWS_REGION || 'us-east-1',
  enabled: import.meta.env.VITE_BEDROCK_ENABLED === 'true',
  model: import.meta.env.VITE_BEDROCK_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0',
  credentials: {
    accessKeyId: import.meta.env.AWS_ACCESS_KEY_ID || import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.AWS_SECRET_ACCESS_KEY || import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
  },
  // Cost and rate limiting
  enableCostTracking: import.meta.env.VITE_AI_ENABLE_COST_TRACKING === 'true',
  maxRequestsPerMinute: parseInt(import.meta.env.VITE_AI_MAX_REQUESTS_PER_MINUTE || '60'),
  dailyCostLimit: parseFloat(import.meta.env.VITE_AI_DAILY_COST_LIMIT || '10.00'),
  // Analysis settings
  defaultSensitivity: import.meta.env.VITE_AI_DEFAULT_SENSITIVITY || 'medium',
  maxTokens: parseInt(import.meta.env.VITE_AI_MAX_TOKENS || '2000'),
  temperature: parseFloat(import.meta.env.VITE_AI_TEMPERATURE || '0.3'),
  // Caching
  enableCaching: import.meta.env.VITE_AI_ENABLE_CACHING === 'true',
  cacheTimeout: parseInt(import.meta.env.VITE_AI_CACHE_TIMEOUT || '1800000'),
  // Health checks
  enableHealthChecks: import.meta.env.VITE_AI_ENABLE_HEALTH_CHECKS === 'true',
  healthCheckInterval: parseInt(import.meta.env.VITE_AI_HEALTH_CHECK_INTERVAL || '300000'),
};

// AWS Amplify configuration for Cognito
export const awsConfig = {
  Auth: {
    // Cognito User Pool configuration
    region: import.meta.env.AWS_REGION || import.meta.env.VITE_AWS_REGION || 'us-east-1',
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
    userPoolWebClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
    
    // Identity Pool configuration
    identityPoolId: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID,
    
    // OAuth configuration
    oauth: {
      domain: import.meta.env.VITE_COGNITO_DOMAIN,
      scope: ['email', 'profile', 'openid', 'aws.cognito.signin.user.admin'],
      redirectSignIn: import.meta.env.VITE_GOOGLE_REDIRECT_URI || import.meta.env.VITE_OAUTH_REDIRECT_URI || 'http://localhost:5173/auth/callback',
      redirectSignOut: import.meta.env.VITE_OAUTH_LOGOUT_URI || 'http://localhost:5173/logout',
      responseType: 'code',
    },
    
    // Social providers
    socialProviders: ['GOOGLE'],
  },
  
  // API Gateway configuration
  API: {
    endpoints: [
      {
        name: 'hallucifix-api',
        endpoint: import.meta.env.VITE_API_GATEWAY_URL,
        region: import.meta.env.AWS_REGION || import.meta.env.VITE_AWS_REGION || 'us-east-1',
      },
    ],
  },
  
  // S3 Storage configuration
  Storage: {
    AWSS3: {
      bucket: import.meta.env.VITE_S3_BUCKET_NAME,
      region: import.meta.env.VITE_S3_REGION || import.meta.env.AWS_REGION || import.meta.env.VITE_AWS_REGION || 'us-east-1',
    },
  },
};

// Initialize Amplify with configuration
export const initializeAmplify = () => {
  try {
    Amplify.configure(awsConfig);
    console.log('✅ AWS Amplify configured successfully');
  } catch (error) {
    console.error('❌ Failed to configure AWS Amplify:', error);
    throw error;
  }
};

// Validate required environment variables
export const validateAwsConfig = () => {
  const requiredVars = [
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_USER_POOL_CLIENT_ID',
    'VITE_COGNITO_IDENTITY_POOL_ID',
    'VITE_COGNITO_DOMAIN',
    'VITE_API_GATEWAY_URL',
    'VITE_S3_BUCKET_NAME',
  ];
  
  const missing = requiredVars.filter(varName => !import.meta.env[varName]);
  
  if (missing.length > 0) {
    console.warn('⚠️ Missing AWS configuration variables:', missing);
    console.warn('Some AWS features may not work correctly');
    console.warn('Please check your environment configuration and ensure all required AWS variables are set');
    return false;
  }
  
  console.log('✅ AWS configuration validated successfully');
  return true;
};

// Validate Bedrock configuration
export const validateBedrockConfig = () => {
  if (!bedrockConfig.enabled) {
    console.info('ℹ️ AWS Bedrock is disabled');
    return false;
  }

  const region = import.meta.env.AWS_REGION || import.meta.env.VITE_AWS_REGION;
  const model = import.meta.env.VITE_BEDROCK_MODEL;
  
  if (!region) {
    console.warn('⚠️ Missing AWS region configuration (AWS_REGION or VITE_AWS_REGION)');
    return false;
  }

  if (!model) {
    console.warn('⚠️ Missing Bedrock model configuration (VITE_BEDROCK_MODEL)');
    return false;
  }

  // Check if credentials are provided (optional if using IAM roles)
  if (!bedrockConfig.credentials.accessKeyId || !bedrockConfig.credentials.secretAccessKey) {
    console.info('ℹ️ No explicit AWS credentials provided, will use default credential chain (IAM roles, etc.)');
  }
  
  console.log('✅ AWS Bedrock configuration validated successfully');
  return true;
};

// Get AWS credentials configuration for SDK clients
export const getAwsCredentials = () => {
  // If explicit credentials are provided, use them
  if (bedrockConfig.credentials.accessKeyId && bedrockConfig.credentials.secretAccessKey) {
    return {
      accessKeyId: bedrockConfig.credentials.accessKeyId,
      secretAccessKey: bedrockConfig.credentials.secretAccessKey,
    };
  }
  
  // Otherwise, let AWS SDK use default credential chain
  // This includes IAM roles, instance profiles, etc.
  return undefined;
};