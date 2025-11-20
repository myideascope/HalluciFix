import { Amplify } from 'aws-amplify';
import { logger } from './logging';

// AWS Cognito configuration
export const awsConfig = {
  Auth: {
    region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
    userPoolId: import.meta.env.VITE_AWS_USER_POOL_ID,
    userPoolWebClientId: import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID,
    identityPoolId: import.meta.env.VITE_AWS_IDENTITY_POOL_ID,
    oauth: {
      domain: import.meta.env.VITE_AWS_USER_POOL_DOMAIN,
      scope: ['email', 'profile', 'openid'],
      redirectSignIn: import.meta.env.VITE_AWS_OAUTH_REDIRECT_SIGN_IN || 'http://localhost:3000/callback',
      redirectSignOut: import.meta.env.VITE_AWS_OAUTH_REDIRECT_SIGN_OUT || 'http://localhost:3000/logout',
      responseType: 'code' // Use authorization code flow for security
    },
    // Configure social providers
    socialProviders: ['GOOGLE'],
    // MFA configuration
    mfaConfiguration: 'OPTIONAL',
    mfaTypes: ['SMS', 'TOTP'],
    // Password policy (matches Cognito User Pool settings)
    passwordFormat: {
      minLength: 8,
      requireLowercase: true,
      requireUppercase: true,
      requireNumbers: true,
      requireSymbols: true,
    }
  },
  Storage: {
    AWSS3: {
      bucket: import.meta.env.VITE_AWS_S3_BUCKET,
      region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
    }
  },
  API: {
    endpoints: [
      {
        name: 'HallucifixAPI',
        endpoint: import.meta.env.VITE_AWS_API_GATEWAY_URL,
        region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
      }
    ]
  }
};

// Initialize Amplify with configuration
export const initializeAmplify = () => {
  try {
    // Validate required configuration
    const requiredEnvVars = [
      'VITE_AWS_USER_POOL_ID',
      'VITE_AWS_USER_POOL_CLIENT_ID',
      'VITE_AWS_IDENTITY_POOL_ID'
    ];

    const missingVars = requiredEnvVars.filter(varName => !import.meta.env[varName]);
    
    if (missingVars.length > 0) {
      logger.warn('Missing AWS configuration environment variables:', { missingVars });
      logger.warn('AWS Cognito authentication will not be available');
      return false;
    }

    Amplify.configure(awsConfig);
    logger.info('✅ AWS Amplify configured successfully');
    return true;
  } catch (error) {
    logger.error('❌ Failed to configure AWS Amplify', error instanceof Error ? error : new Error(String(error)));
    return false;
  }
};

// Helper to check if AWS configuration is available
export const isAwsConfigured = (): boolean => {
  return !!(
    import.meta.env.VITE_AWS_USER_POOL_ID &&
    import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID &&
    import.meta.env.VITE_AWS_IDENTITY_POOL_ID
  );
};

// Validate AWS configuration
export const validateAwsConfig = (): boolean => {
  const requiredEnvVars = [
    'VITE_AWS_USER_POOL_ID',
    'VITE_AWS_USER_POOL_CLIENT_ID',
    'VITE_AWS_IDENTITY_POOL_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !import.meta.env[varName]);
  
  if (missingVars.length > 0) {
    logger.warn('Missing AWS configuration environment variables:', { missingVars });
    return false;
  }

  return true;
};

// Bedrock configuration
export const bedrockConfig = {
  region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  model: import.meta.env.VITE_AWS_BEDROCK_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0',
  accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
  secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
};

// Get AWS credentials
export const getAwsCredentials = () => {
  return {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
    region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  };
};

// Validate Bedrock configuration
export const validateBedrockConfig = (): boolean => {
  const requiredEnvVars = [
    'VITE_AWS_REGION',
    'VITE_AWS_ACCESS_KEY_ID',
    'VITE_AWS_SECRET_ACCESS_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !import.meta.env[varName]);
  
  if (missingVars.length > 0) {
    logger.warn('Missing Bedrock configuration environment variables:', { missingVars });
    return false;
  }

  return true;
};

// Export configuration for direct access
export default awsConfig;