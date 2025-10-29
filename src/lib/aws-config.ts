import { Amplify } from 'aws-amplify';

// AWS Amplify configuration for Cognito
export const awsConfig = {
  Auth: {
    // Cognito User Pool configuration
    region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
    userPoolWebClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
    
    // Identity Pool configuration
    identityPoolId: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID,
    
    // OAuth configuration
    oauth: {
      domain: import.meta.env.VITE_COGNITO_DOMAIN,
      scope: ['email', 'profile', 'openid', 'aws.cognito.signin.user.admin'],
      redirectSignIn: import.meta.env.VITE_OAUTH_REDIRECT_URI || 'http://localhost:5173/auth/callback',
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
        region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
      },
    ],
  },
  
  // S3 Storage configuration
  Storage: {
    AWSS3: {
      bucket: import.meta.env.VITE_S3_BUCKET_NAME,
      region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
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
    return false;
  }
  
  return true;
};