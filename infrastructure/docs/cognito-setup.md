# AWS Cognito Setup for HalluciFix

This document explains the AWS Cognito configuration for HalluciFix authentication system.

## Architecture Overview

The authentication system consists of:

1. **Cognito User Pool**: Manages user registration, authentication, and user profiles
2. **Cognito Identity Pool**: Provides AWS credentials for authenticated users
3. **Google OAuth Integration**: Allows users to sign in with Google accounts
4. **Multi-Factor Authentication**: Optional MFA with SMS and TOTP support

## Components

### User Pool Configuration

- **Sign-in Methods**: Email address
- **Password Policy**: 8+ characters with uppercase, lowercase, digits, and symbols
- **MFA**: Optional (SMS and TOTP supported)
- **Account Recovery**: Email-based recovery
- **Custom Attributes**: 
  - `subscriptionTier`: User's subscription level
  - `usageQuota`: API usage limits

### Identity Pool Configuration

- **Authentication**: Only authenticated identities allowed
- **Federated Identities**: Google OAuth integration
- **IAM Roles**: Separate roles for authenticated users
- **S3 Access**: User-specific file upload permissions

### OAuth Integration

- **Provider**: Google OAuth 2.0
- **Scopes**: 
  - `email`: Access to user's email
  - `profile`: Access to basic profile info
  - `openid`: OpenID Connect
  - `https://www.googleapis.com/auth/drive.readonly`: Google Drive read access
- **Callback URLs**: Configured for dev and production environments

## Deployment

### Prerequisites

1. AWS CLI configured with `hallucifix` profile
2. CDK installed and bootstrapped
3. Google Cloud Console project with OAuth credentials

### Deploy Infrastructure

```bash
# Deploy to development environment
./infrastructure/scripts/deploy-cognito.sh dev hallucifix

# Deploy to production environment
./infrastructure/scripts/deploy-cognito.sh prod hallucifix
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable APIs:
   - Google+ API
   - Google Drive API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs:
     - Development: `http://localhost:3000/callback`
     - Production: `https://app.hallucifix.com/callback`
     - Cognito: `https://{domain}.auth.{region}.amazoncognito.com/oauth2/idpresponse`
5. Update `infrastructure/config/oauth-config.json` with actual credentials
6. Update CDK stack and redeploy

## Environment Variables

After deployment, update your application with these environment variables:

```bash
# From CDK outputs
VITE_AWS_REGION=us-east-1
VITE_USER_POOL_ID={UserPoolId}
VITE_USER_POOL_CLIENT_ID={UserPoolClientId}
VITE_IDENTITY_POOL_ID={IdentityPoolId}
VITE_USER_POOL_DOMAIN={UserPoolDomain}
```

## Integration with Frontend

### Install Dependencies

```bash
npm install @aws-amplify/auth @aws-amplify/core
```

### Configure Amplify

```typescript
import { Amplify } from '@aws-amplify/core';
import { Auth } from '@aws-amplify/auth';

Amplify.configure({
  Auth: {
    region: process.env.VITE_AWS_REGION,
    userPoolId: process.env.VITE_USER_POOL_ID,
    userPoolWebClientId: process.env.VITE_USER_POOL_CLIENT_ID,
    identityPoolId: process.env.VITE_IDENTITY_POOL_ID,
    oauth: {
      domain: process.env.VITE_USER_POOL_DOMAIN,
      scope: ['email', 'profile', 'openid'],
      redirectSignIn: 'http://localhost:3000/callback',
      redirectSignOut: 'http://localhost:3000/logout',
      responseType: 'code'
    }
  }
});
```

### Authentication Methods

```typescript
// Sign up with email/password
await Auth.signUp({
  username: email,
  password: password,
  attributes: {
    email: email
  }
});

// Sign in with email/password
await Auth.signIn(email, password);

// Sign in with Google
await Auth.federatedSignIn({ provider: 'Google' });

// Sign out
await Auth.signOut();

// Get current user
const user = await Auth.currentAuthenticatedUser();
```

## Security Features

### Password Policy
- Minimum 8 characters
- Must contain uppercase and lowercase letters
- Must contain numbers and symbols

### MFA Support
- SMS-based MFA
- TOTP (Time-based One-Time Password) support
- Optional for all users

### IAM Permissions
- Least privilege access
- User-specific S3 access patterns
- Scoped to necessary AWS services

## Monitoring and Logging

- CloudWatch logs for authentication events
- CloudTrail for API calls
- Custom metrics for user registration and login rates

## Troubleshooting

### Common Issues

1. **Google OAuth not working**: Verify redirect URIs in Google Cloud Console
2. **MFA setup fails**: Check SMS configuration and phone number format
3. **Token refresh issues**: Verify token expiration settings
4. **CORS errors**: Check API Gateway CORS configuration

### Debug Commands

```bash
# Check Cognito User Pool status
aws cognito-idp describe-user-pool --user-pool-id {UserPoolId} --profile hallucifix

# List users in pool
aws cognito-idp list-users --user-pool-id {UserPoolId} --profile hallucifix

# Check Identity Pool configuration
aws cognito-identity describe-identity-pool --identity-pool-id {IdentityPoolId} --profile hallucifix
```

## Next Steps

1. Complete Google OAuth credential setup
2. Test authentication flows in development
3. Implement user migration from Supabase
4. Set up monitoring and alerting
5. Configure production domain and SSL certificates