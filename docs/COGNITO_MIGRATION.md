# AWS Cognito Migration Guide

This guide covers the migration from Supabase Auth to AWS Cognito for HalluciFix authentication.

## Overview

The migration involves:
1. Setting up AWS Cognito User Pool and Identity Pool
2. Configuring Google OAuth integration
3. Migrating existing users from Supabase to Cognito
4. Updating the frontend to use Cognito authentication
5. Testing and validation

## Prerequisites

- AWS account with appropriate permissions
- AWS CLI configured
- Node.js and npm installed
- Access to existing Supabase project

## Step 1: AWS Infrastructure Setup

The AWS infrastructure is already defined in the CDK stacks. Deploy the infrastructure:

```bash
# Deploy the infrastructure
cd infrastructure
npm install
npm run build
cdk deploy --all
```

This will create:
- Cognito User Pool with email/password authentication
- Cognito Identity Pool for federated identities
- Google OAuth identity provider (with placeholder credentials)
- IAM roles for authenticated users

## Step 2: Configure Google OAuth

### 2.1 Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Configure OAuth consent screen
6. Create OAuth 2.0 client ID for web application
7. Add authorized redirect URIs:
   - `https://your-cognito-domain.auth.region.amazoncognito.com/oauth2/idpresponse`
   - `http://localhost:3000/callback` (for development)

### 2.2 Update AWS Cognito Configuration

1. Go to AWS Cognito console
2. Select your User Pool
3. Go to "Sign-in experience" → "Federated identity provider sign-in"
4. Edit the Google identity provider
5. Replace placeholder credentials with actual Google OAuth credentials:
   - Client ID: From Google Cloud Console
   - Client secret: From Google Cloud Console

### 2.3 Update Environment Variables

Update your `.env.local` file:

```bash
# AWS Cognito Configuration
VITE_AWS_REGION=us-east-1
VITE_AWS_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_AWS_USER_POOL_CLIENT_ID=your_cognito_client_id
VITE_AWS_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_AWS_USER_POOL_DOMAIN=your-cognito-domain.auth.us-east-1.amazoncognito.com
VITE_AWS_OAUTH_REDIRECT_SIGN_IN=http://localhost:3000/callback
VITE_AWS_OAUTH_REDIRECT_SIGN_OUT=http://localhost:3000/logout

# Google OAuth (for migration scripts)
VITE_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Supabase (for migration only)
VITE_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

## Step 3: User Migration

### 3.1 Dry Run Migration

First, run a dry run to see what users would be migrated:

```bash
npm run migrate:users:to-cognito:dry-run
```

### 3.2 Actual Migration

Migrate users from Supabase to Cognito:

```bash
# Migrate all users
npm run migrate:users:to-cognito

# Or migrate in smaller batches
npm run migrate:users:to-cognito:batch

# Or skip users that already exist in Cognito
npm run migrate:users:to-cognito:skip-existing
```

### 3.3 Validate Migration

Validate that the migration was successful:

```bash
# Basic validation
npm run validate:user-migration

# Detailed validation with report
npm run validate:user-migration:detailed
```

## Step 4: Frontend Integration

The frontend has been updated to support both Supabase and Cognito authentication:

### 4.1 Authentication Flow

The `useAuth` hook automatically detects which authentication system to use:
- If AWS Cognito environment variables are configured, it uses Cognito
- Otherwise, it falls back to Supabase authentication

### 4.2 New Components

- `CognitoAuthForm`: Authentication form component for Cognito
- `AuthCallback`: Handles OAuth callback redirects
- `cognitoAuth`: Service for Cognito authentication operations

### 4.3 Testing Authentication

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Test authentication flows:
   - Email/password sign up and sign in
   - Google OAuth sign in
   - Password reset
   - Email verification

## Step 5: Testing

### 5.1 Unit Tests

Run Cognito-specific tests:

```bash
npm run test:cognito-auth
npm run test:cognito-auth:coverage
```

### 5.2 Integration Tests

Run end-to-end authentication tests:

```bash
npm run test:e2e:cognito-auth
```

### 5.3 Manual Testing

Test the following scenarios:
1. New user registration with email verification
2. Existing user sign in
3. Google OAuth sign in
4. Password reset flow
5. MFA setup (if enabled)
6. Session management and token refresh

## Step 6: Production Deployment

### 6.1 Environment Configuration

Update production environment variables:

```bash
# Production AWS Cognito Configuration
VITE_AWS_REGION=us-east-1
VITE_AWS_USER_POOL_ID=us-east-1_PROD123
VITE_AWS_USER_POOL_CLIENT_ID=prod_cognito_client_id
VITE_AWS_IDENTITY_POOL_ID=us-east-1:prod-identity-pool-id
VITE_AWS_USER_POOL_DOMAIN=hallucifix-prod.auth.us-east-1.amazoncognito.com
VITE_AWS_OAUTH_REDIRECT_SIGN_IN=https://app.hallucifix.com/callback
VITE_AWS_OAUTH_REDIRECT_SIGN_OUT=https://app.hallucifix.com/logout
```

### 6.2 Google OAuth Production Setup

1. Update Google OAuth redirect URIs for production domain
2. Update Cognito identity provider with production Google credentials
3. Test OAuth flow in production environment

### 6.3 DNS and SSL

1. Configure custom domain for Cognito (optional)
2. Set up SSL certificates
3. Update DNS records

## Step 7: Monitoring and Maintenance

### 7.1 CloudWatch Monitoring

Monitor authentication metrics:
- Sign-in success/failure rates
- User registration rates
- OAuth provider usage
- Token refresh rates

### 7.2 Alerts

Set up alerts for:
- High authentication failure rates
- Unusual sign-in patterns
- OAuth provider errors
- Token refresh failures

### 7.3 User Communication

1. Notify users about the authentication system change
2. Provide instructions for password reset if needed
3. Set up support channels for authentication issues

## Troubleshooting

### Common Issues

1. **OAuth Redirect Mismatch**
   - Verify redirect URIs in Google Cloud Console
   - Check Cognito User Pool OAuth settings
   - Ensure environment variables are correct

2. **User Migration Failures**
   - Check AWS permissions for Cognito operations
   - Verify Supabase service key permissions
   - Review migration logs for specific errors

3. **Token Refresh Issues**
   - Check Cognito User Pool token expiration settings
   - Verify refresh token configuration
   - Monitor CloudWatch logs for token errors

4. **MFA Problems**
   - Verify MFA configuration in User Pool
   - Check SMS/TOTP settings
   - Test MFA flow in development

### Debug Mode

Enable debug logging:

```bash
# Add to .env.local
LOG_LEVEL=debug
VITE_DEBUG_AUTH=true
```

### Support Resources

- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [AWS Amplify Auth Documentation](https://docs.amplify.aws/lib/auth/getting-started/)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)

## Migration Checklist

- [ ] AWS infrastructure deployed
- [ ] Google OAuth configured
- [ ] Environment variables updated
- [ ] User migration completed and validated
- [ ] Frontend authentication tested
- [ ] Unit and integration tests passing
- [ ] Production environment configured
- [ ] Monitoring and alerts set up
- [ ] User communication sent
- [ ] Supabase resources cleaned up (after successful migration)

## Rollback Plan

If issues occur during migration:

1. **Immediate Rollback**
   - Revert environment variables to use Supabase
   - Deploy previous version of application
   - Restore Supabase authentication

2. **Data Recovery**
   - User data remains in both systems during migration
   - No data loss should occur
   - Users can continue using existing accounts

3. **Communication**
   - Notify users of temporary issues
   - Provide alternative access methods
   - Schedule maintenance window for retry

## Post-Migration Cleanup

After successful migration and validation:

1. Remove Supabase authentication dependencies
2. Clean up unused environment variables
3. Archive migration scripts and reports
4. Update documentation
5. Decommission Supabase resources (if no longer needed)

## Security Considerations

1. **Token Security**
   - Use secure token storage
   - Implement proper token refresh logic
   - Monitor for token abuse

2. **OAuth Security**
   - Validate OAuth state parameters
   - Use PKCE for additional security
   - Monitor OAuth provider logs

3. **User Data Protection**
   - Encrypt sensitive user data
   - Implement proper access controls
   - Regular security audits

4. **Compliance**
   - Ensure GDPR compliance for EU users
   - Implement data retention policies
   - Provide user data export/deletion capabilities