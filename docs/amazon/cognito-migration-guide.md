# Cognito Migration Guide

This guide explains how to migrate from Supabase authentication to AWS Cognito authentication in the HalluciFix application.

## Overview

The application now supports both Supabase and AWS Cognito authentication systems. This allows for a gradual migration approach where you can:

1. Deploy the infrastructure with Cognito
2. Test Cognito authentication alongside Supabase
3. Migrate users from Supabase to Cognito
4. Switch to Cognito exclusively
5. Remove Supabase dependencies

## Prerequisites

1. **AWS Infrastructure Deployed**: Complete tasks 3.1 and 3.2 (Cognito setup with Google OAuth)
2. **Environment Variables**: Configure Cognito environment variables
3. **Dependencies**: Install AWS Amplify packages (already added to package.json)

## Step-by-Step Migration

### Step 1: Configure Environment Variables

Create or update your `.env.local` file with Cognito configuration:

```env
# AWS Cognito Configuration
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_USER_POOL_CLIENT_ID=your-cognito-client-id
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_COGNITO_DOMAIN=hallucifix-dev-random

# Google OAuth
VITE_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com

# Optional: Keep Supabase for backward compatibility during migration
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Step 2: Get Cognito Configuration Values

Retrieve the configuration values from your AWS deployment:

```bash
# Get Cognito stack outputs
aws cloudformation describe-stacks \
  --stack-name "Hallucifix-Cognito-dev" \
  --region us-east-1 \
  --query 'Stacks[0].Outputs'
```

The outputs will include:
- `UserPoolId` → `VITE_COGNITO_USER_POOL_ID`
- `UserPoolClientId` → `VITE_COGNITO_USER_POOL_CLIENT_ID`
- `IdentityPoolId` → `VITE_COGNITO_IDENTITY_POOL_ID`
- `UserPoolDomain` → `VITE_COGNITO_DOMAIN`

### Step 3: Update Application Entry Point

Choose one of the following approaches:

#### Option A: Gradual Migration (Recommended)

Keep the existing `App.tsx` and use the hybrid authentication system:

```typescript
// In your main.tsx or index.tsx
import { HybridAuthProvider } from './components/HybridAuthProvider';
import App from './App';

// Wrap your app with the hybrid provider
<HybridAuthProvider>
  <App />
</HybridAuthProvider>
```

#### Option B: Direct Migration

Replace the main App component with the Cognito-enabled version:

```typescript
// In your main.tsx or index.tsx
import AppWithCognito from './components/AppWithCognito';

// Use the Cognito-enabled app directly
<AppWithCognito />
```

### Step 4: Test Authentication

1. **Start the application**:
   ```bash
   npm run dev
   ```

2. **Test Cognito authentication**:
   - Try email/password signup
   - Test email confirmation flow
   - Test Google OAuth sign-in
   - Verify user profile data

3. **Verify functionality**:
   - Check that all features work with Cognito authentication
   - Test session persistence
   - Verify logout functionality

### Step 5: User Data Migration (Task 3.4)

Once Cognito authentication is working, migrate existing users:

1. **Export users from Supabase**
2. **Import users to Cognito** (covered in task 3.4)
3. **Sync user profiles** between systems during transition

### Step 6: Switch to Cognito Exclusively

When ready to use Cognito exclusively:

1. **Update environment variables**:
   ```env
   # Remove or comment out Supabase variables
   # VITE_SUPABASE_URL=
   # VITE_SUPABASE_ANON_KEY=
   
   # Keep Cognito variables
   VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
   VITE_COGNITO_USER_POOL_CLIENT_ID=your-cognito-client-id
   # ... other Cognito variables
   ```

2. **Update application code** to remove Supabase dependencies (if desired)

## Authentication Flow Comparison

### Supabase Flow (Legacy)
```
User → LandingPage → Supabase Auth → Dashboard
```

### Cognito Flow (New)
```
User → CognitoAuthForm → AWS Cognito → Dashboard
```

### OAuth Flow Comparison

#### Supabase OAuth
```
User → Click Google → Supabase → Google → Supabase → OAuthCallback → Dashboard
```

#### Cognito OAuth
```
User → Click Google → Cognito → Google → Cognito → AuthCallback → Dashboard
```

## Key Differences

### Authentication Methods

| Feature | Supabase | Cognito |
|---------|----------|---------|
| Email/Password | ✅ | ✅ |
| Google OAuth | ✅ | ✅ |
| MFA | ✅ | ✅ |
| Password Reset | ✅ | ✅ |
| Email Verification | ✅ | ✅ |
| Session Management | ✅ | ✅ |

### User Data Structure

#### Supabase User
```typescript
{
  id: string;
  email: string;
  user_metadata: {
    full_name?: string;
    avatar_url?: string;
  };
  created_at: string;
}
```

#### Cognito User
```typescript
{
  userId: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  givenName?: string;
  familyName?: string;
  name?: string;
  picture?: string;
  attributes?: Record<string, string>;
}
```

## Troubleshooting

### Common Issues

1. **"Cognito configuration not available"**
   - Check that all required environment variables are set
   - Verify the Cognito stack is deployed successfully

2. **"Invalid redirect URI"**
   - Ensure Google OAuth redirect URIs include the Cognito domain
   - Check that callback URLs match exactly

3. **"User not found after OAuth"**
   - Verify the Google OAuth provider is configured in Cognito
   - Check that the user pool client supports Google authentication

4. **Session not persisting**
   - Check that the Cognito domain is accessible
   - Verify that cookies are not being blocked

### Debug Commands

```bash
# Test Cognito configuration
npm run validate-oauth

# Check environment variables
npm run validate-env

# Test OAuth flow
npm run test-oauth-flow
```

## Rollback Plan

If you need to rollback to Supabase:

1. **Update environment variables**:
   ```env
   # Re-enable Supabase
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   
   # Disable Cognito
   # VITE_COGNITO_USER_POOL_ID=
   # VITE_COGNITO_USER_POOL_CLIENT_ID=
   ```

2. **Restart the application** - it will automatically fall back to Supabase

3. **No code changes required** if using the hybrid approach

## Performance Considerations

### Cognito Benefits
- **Scalability**: Handles millions of users
- **Security**: AWS-managed security updates
- **Integration**: Native AWS service integration
- **Compliance**: SOC, PCI DSS, HIPAA compliant

### Migration Impact
- **Bundle Size**: +~200KB for AWS Amplify
- **Cold Start**: Slightly slower initial load
- **Network**: Additional AWS API calls

## Security Improvements

### Enhanced Security with Cognito
- **MFA Support**: Built-in multi-factor authentication
- **Advanced Security**: Adaptive authentication
- **Compliance**: Enterprise-grade compliance
- **Audit Logging**: Comprehensive audit trails

### OAuth Security
- **PKCE**: Proof Key for Code Exchange
- **State Validation**: CSRF protection
- **Token Management**: Secure token handling
- **Refresh Tokens**: Automatic token refresh

## Next Steps

After completing the Cognito migration:

1. **Database Migration** (Task 4.3): Update database connections
2. **User Migration** (Task 3.4): Migrate existing users
3. **Testing** (Task 3.5): Comprehensive authentication testing
4. **Monitoring**: Set up Cognito-specific monitoring
5. **Documentation**: Update user-facing documentation

## Support

For issues during migration:
- Check the troubleshooting section above
- Review AWS Cognito documentation
- Use the validation scripts provided
- Check CloudWatch logs for Cognito errors