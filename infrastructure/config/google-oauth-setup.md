# Google OAuth Setup for AWS Cognito Integration

This document provides step-by-step instructions for setting up Google OAuth credentials for use with AWS Cognito.

## Prerequisites

1. Google Cloud Console access
2. AWS CLI configured with appropriate permissions
3. CDK deployed with placeholder values

## Step 1: Create Google OAuth Credentials

### 1.1 Access Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Enable the following APIs:
   - Google+ API (for user profile access)
   - Google Drive API (for document access)
   - Google OAuth2 API

### 1.2 Create OAuth 2.0 Credentials
1. Navigate to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth 2.0 Client IDs**
3. Select **Web application** as the application type
4. Configure the OAuth client:
   - **Name**: `HalluciFix-${environment}` (e.g., HalluciFix-dev)
   - **Authorized JavaScript origins**:
     - Development: `http://localhost:3000`
     - Production: `https://app.hallucifix.com`
   - **Authorized redirect URIs**:
     - Development: 
       - `http://localhost:3000/callback`
       - `https://hallucifix-dev-[random].auth.us-east-1.amazoncognito.com/oauth2/idpresponse`
     - Production:
       - `https://app.hallucifix.com/callback`
       - `https://hallucifix-prod-[random].auth.us-east-1.amazoncognito.com/oauth2/idpresponse`

### 1.3 Configure OAuth Consent Screen
1. Go to **OAuth consent screen**
2. Configure the consent screen:
   - **Application name**: HalluciFix
   - **User support email**: Your support email
   - **Developer contact information**: Your contact email
   - **Scopes**: Add the following scopes:
     - `openid`
     - `email`
     - `profile`
     - `https://www.googleapis.com/auth/drive.readonly`

## Step 2: Store Credentials in AWS Secrets Manager

### 2.1 Create Secret for Google OAuth
```bash
# Create the secret in AWS Secrets Manager
aws secretsmanager create-secret \
    --name "hallucifix/google-oauth/${ENVIRONMENT}" \
    --description "Google OAuth credentials for HalluciFix ${ENVIRONMENT}" \
    --secret-string '{
        "clientId": "YOUR_GOOGLE_CLIENT_ID",
        "clientSecret": "YOUR_GOOGLE_CLIENT_SECRET"
    }' \
    --region us-east-1
```

### 2.2 Verify Secret Creation
```bash
# Verify the secret was created
aws secretsmanager describe-secret \
    --secret-id "hallucifix/google-oauth/${ENVIRONMENT}" \
    --region us-east-1
```

## Step 3: Update CDK Configuration

### 3.1 Modify Cognito Stack
The CDK stack will be updated to retrieve credentials from Secrets Manager instead of using placeholders.

### 3.2 Deploy Updated Stack
```bash
# Deploy the updated Cognito stack
cd infrastructure
npx cdk deploy Hallucifix-Cognito-${ENVIRONMENT} \
    --context environment=${ENVIRONMENT}
```

## Step 4: Update Application Configuration

### 4.1 Environment Variables
Update your `.env.local` file with the Google Client ID:
```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

Note: The client secret should NOT be included in frontend environment variables for security reasons.

## Step 5: Test OAuth Integration

### 5.1 Test Authentication Flow
1. Start your development server
2. Navigate to the login page
3. Click "Sign in with Google"
4. Verify the OAuth flow completes successfully
5. Check that user profile information is correctly retrieved

### 5.2 Verify Cognito Integration
1. Check AWS Cognito User Pool for new user entries
2. Verify user attributes are correctly mapped
3. Test token refresh functionality

## Troubleshooting

### Common Issues

1. **Invalid redirect URI**
   - Ensure all redirect URIs are properly configured in Google Cloud Console
   - Check that Cognito domain matches the configured redirect URI

2. **Scope permissions**
   - Verify all required scopes are configured in OAuth consent screen
   - Check that Drive API is enabled if document access is needed

3. **Secret access issues**
   - Ensure Lambda execution role has permissions to access Secrets Manager
   - Verify secret name matches exactly in CDK configuration

### Verification Commands

```bash
# Test secret retrieval
aws secretsmanager get-secret-value \
    --secret-id "hallucifix/google-oauth/${ENVIRONMENT}" \
    --region us-east-1

# Check Cognito User Pool configuration
aws cognito-idp describe-user-pool \
    --user-pool-id YOUR_USER_POOL_ID \
    --region us-east-1

# List identity providers
aws cognito-idp list-identity-providers \
    --user-pool-id YOUR_USER_POOL_ID \
    --region us-east-1
```

## Security Considerations

1. **Client Secret Protection**
   - Never expose client secret in frontend code
   - Store client secret only in AWS Secrets Manager
   - Use IAM policies to restrict secret access

2. **Redirect URI Validation**
   - Only configure necessary redirect URIs
   - Use HTTPS in production
   - Validate redirect URIs in application code

3. **Scope Minimization**
   - Only request necessary OAuth scopes
   - Review and audit scope permissions regularly
   - Document why each scope is needed

## Next Steps

After completing this setup:
1. Update frontend authentication code to use Cognito
2. Test user migration from Supabase to Cognito
3. Implement session management with Cognito tokens
4. Set up monitoring for authentication metrics