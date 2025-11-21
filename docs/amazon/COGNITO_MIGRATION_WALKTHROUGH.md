# AWS Cognito Migration Walkthrough

This walkthrough provides step-by-step instructions to complete the AWS Cognito migration for HalluciFix. Follow these steps in order to ensure a smooth transition from Supabase to AWS Cognito.

## Prerequisites

- AWS CLI installed and configured
- Node.js and npm installed
- Access to Google Cloud Console
- Access to existing Supabase project
- Domain name for production (optional)

## Step 1: Deploy AWS Infrastructure

### 1.1 Prepare AWS Environment

```bash
# Ensure AWS CLI is configured
aws configure list

# Set your AWS region (if not already set)
export AWS_DEFAULT_REGION=us-east-1

# Verify AWS credentials
aws sts get-caller-identity
```

### 1.2 Deploy CDK Infrastructure

```bash
# Navigate to infrastructure directory
cd infrastructure

# Install dependencies
npm install

# Bootstrap CDK (first time only)
npx cdk bootstrap

# Review what will be deployed
npx cdk diff --all

# Deploy all stacks
npx cdk deploy --all --require-approval never

# Note: This will take 10-15 minutes
```

### 1.3 Capture Infrastructure Outputs

After deployment, capture the important outputs:

```bash
# Get Cognito User Pool details
aws cognito-idp list-user-pools --max-items 10

# Get the specific outputs you need
npx cdk output --all > infrastructure-outputs.json
```

**Expected Outputs:**
- User Pool ID: `us-east-1_XXXXXXXXX`
- User Pool Client ID: `your_cognito_client_id`
- Identity Pool ID: `us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- User Pool Domain: `your-cognito-domain.auth.us-east-1.amazoncognito.com`
- API Gateway URL: `https://your-api-id.execute-api.us-east-1.amazonaws.com/prod`
- S3 Bucket Name: `hallucifix-documents-prod-123456789`

## Step 2: Configure Google OAuth

### 2.1 Set Up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one:
   ```
   Project Name: HalluciFix-Production
   Project ID: hallucifix-prod-[random]
   ```

3. Enable required APIs:
   ```bash
   # Enable Google+ API
   gcloud services enable plus.googleapis.com
   
   # Enable People API (for profile access)
   gcloud services enable people.googleapis.com
   ```

### 2.2 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type
3. Fill in application information:
   ```
   App name: HalluciFix
   User support email: support@hallucifix.com
   Developer contact: dev@hallucifix.com
   ```
4. Add scopes:
   - `email`
   - `profile`
   - `openid`
   - `https://www.googleapis.com/auth/drive.readonly`

5. Add test users (for development):
   - Add your email addresses

### 2.3 Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client IDs**
3. Choose **Web application**
4. Configure:
   ```
   Name: HalluciFix Web Client
   
   Authorized JavaScript origins:
   - http://localhost:3000 (development)
   - https://app.hallucifix.com (production)
   
   Authorized redirect URIs:
   - http://localhost:3000/callback
   - https://your-cognito-domain.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
   - https://app.hallucifix.com/callback
   ```

5. **Save the Client ID and Client Secret** - you'll need these next

### 2.4 Update AWS Cognito with Google Credentials

```bash
# Update the Google identity provider in Cognito
aws cognito-idp update-identity-provider \
  --user-pool-id us-east-1_XXXXXXXXX \
  --provider-name Google \
  --provider-details '{
    "client_id": "YOUR_GOOGLE_CLIENT_ID",
    "client_secret": "YOUR_GOOGLE_CLIENT_SECRET",
    "authorize_scopes": "email profile openid https://www.googleapis.com/auth/drive.readonly"
  }'
```

Or update via AWS Console:
1. Go to **Amazon Cognito** → **User pools** → Your pool
2. **Sign-in experience** → **Federated identity provider sign-in**
3. Edit **Google** provider
4. Update Client ID and Client Secret
5. Save changes

## Step 3: Update Environment Variables

### 3.1 Create Environment Files

Create `.env.local` for development:

```bash
# Copy the example file
cp .env.example .env.local

# Edit with your actual values
nano .env.local
```

### 3.2 Configure Development Environment

Update `.env.local` with your AWS infrastructure outputs:

```bash
# AWS Configuration
VITE_AWS_REGION=us-east-1
VITE_AWS_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_AWS_USER_POOL_CLIENT_ID=your_cognito_client_id
VITE_AWS_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_AWS_USER_POOL_DOMAIN=your-cognito-domain.auth.us-east-1.amazoncognito.com
VITE_AWS_OAUTH_REDIRECT_SIGN_IN=http://localhost:3000/callback
VITE_AWS_OAUTH_REDIRECT_SIGN_OUT=http://localhost:3000/logout
VITE_AWS_S3_BUCKET=hallucifix-documents-dev-123456789
VITE_AWS_API_GATEWAY_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev

# Google OAuth
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_google_client_secret

# Database (RDS)
DATABASE_URL=postgresql://username:password@your-rds-endpoint:5432/hallucifix

# Keep Supabase for migration period
VITE_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

### 3.3 Validate Configuration

```bash
# Test AWS configuration
npm run validate-aws

# Test OAuth configuration  
npm run validate-oauth

# Start the application to test
npm run dev
```

## Step 4: Test Authentication Flow

### 4.1 Test Basic Authentication

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Test email/password registration:**
   - Go to `http://localhost:3000`
   - Click "Sign Up"
   - Enter email and password
   - Check email for verification code
   - Verify email and sign in

3. **Test Google OAuth:**
   - Click "Continue with Google"
   - Complete OAuth flow
   - Verify user is signed in

### 4.2 Test Authentication Features

Test these scenarios:
- [ ] New user registration with email verification
- [ ] Existing user sign in
- [ ] Google OAuth sign in
- [ ] Password reset flow
- [ ] Sign out functionality
- [ ] Session persistence (refresh page)
- [ ] Invalid credentials handling

### 4.3 Debug Common Issues

**Issue: OAuth redirect mismatch**
```bash
# Check redirect URIs in Google Console match exactly
# Verify Cognito domain is correct
# Check for typos in URLs
```

**Issue: Email verification not working**
```bash
# Check Cognito email configuration
aws cognito-idp describe-user-pool --user-pool-id us-east-1_XXXXXXXXX
```

**Issue: User not found errors**
```bash
# Check if users exist in Cognito
aws cognito-idp list-users --user-pool-id us-east-1_XXXXXXXXX
```

## Step 5: Run User Migration

### 5.1 Prepare Migration Environment

```bash
# Ensure you have both Supabase and AWS credentials
export VITE_SUPABASE_URL=your_supabase_project_url
export SUPABASE_SERVICE_KEY=your_supabase_service_key
export VITE_AWS_USER_POOL_ID=us-east-1_XXXXXXXXX
export VITE_AWS_REGION=us-east-1
```

### 5.2 Run Dry Run Migration

```bash
# See what users would be migrated
npm run migrate:users:to-cognito:dry-run
```

**Review the output:**
- Number of users to migrate
- Any potential issues
- Users that might fail migration

### 5.3 Execute Migration

```bash
# Migrate users in small batches
npm run migrate:users:to-cognito:batch

# Or migrate all at once (for smaller user bases)
npm run migrate:users:to-cognito
```

**Monitor the migration:**
- Watch for errors in the console
- Check the generated migration report
- Verify users appear in Cognito console

### 5.4 Validate Migration

```bash
# Run validation to ensure migration was successful
npm run validate:user-migration:detailed
```

**Check the validation report:**
- All users migrated successfully
- User attributes match
- No missing users

### 5.5 Handle Migration Issues

**Common migration issues:**

1. **Users with invalid email formats:**
   ```bash
   # Check Supabase for users with invalid emails
   # Clean up data before migration
   ```

2. **Duplicate users:**
   ```bash
   # Use skip-existing flag
   npm run migrate:users:to-cognito:skip-existing
   ```

3. **Rate limiting:**
   ```bash
   # Use smaller batch sizes
   npm run migrate:users:to-cognito -- --batch-size=5
   ```

## Step 6: Production Deployment

### 6.1 Set Up Production Environment

```bash
# Deploy production infrastructure
cd infrastructure
npx cdk deploy --all --context environment=prod

# Update production environment variables
# (Use your CI/CD system or AWS Systems Manager Parameter Store)
```

### 6.2 Configure Production OAuth

1. **Update Google OAuth settings:**
   - Add production domain to authorized origins
   - Add production callback URLs
   - Remove development URLs (optional)

2. **Update Cognito settings:**
   - Update callback URLs for production
   - Configure custom domain (optional)
   - Set up SES for email sending

### 6.3 Deploy Application

```bash
# Build for production
npm run build

# Deploy to S3/CloudFront
aws s3 sync dist/ s3://your-production-bucket --delete
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

## Step 7: Post-Migration Tasks

### 7.1 Monitor Authentication

Set up monitoring for:
- Authentication success/failure rates
- OAuth provider errors
- User registration rates
- Session duration

```bash
# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Cognito \
  --metric-name SignInSuccesses \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

### 7.2 User Communication

1. **Send migration notification:**
   ```
   Subject: Important: Authentication System Update
   
   We've upgraded our authentication system for better security and performance.
   
   What you need to know:
   - Your account is safe and secure
   - You may need to reset your password on first login
   - Google sign-in continues to work as before
   - Contact support if you have any issues
   ```

2. **Update documentation:**
   - User guides
   - API documentation
   - Support articles

### 7.3 Cleanup

After successful migration and validation:

```bash
# Remove Supabase environment variables
# Update .env.example to remove Supabase references
# Archive migration scripts
# Update documentation
```

## Troubleshooting Guide

### Authentication Issues

**Problem: Users can't sign in**
```bash
# Check Cognito user status
aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username user@example.com

# Check if user needs password reset
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username user@example.com \
  --password TempPassword123! \
  --temporary
```

**Problem: OAuth not working**
```bash
# Verify OAuth configuration
aws cognito-idp describe-identity-provider \
  --user-pool-id us-east-1_XXXXXXXXX \
  --provider-name Google
```

**Problem: Email verification failing**
```bash
# Check SES configuration
aws ses get-send-quota
aws ses get-send-statistics
```

### Migration Issues

**Problem: Migration script fails**
```bash
# Check AWS permissions
aws iam get-user
aws cognito-idp list-user-pools --max-items 1

# Check Supabase connection
curl -H "apikey: $SUPABASE_SERVICE_KEY" "$VITE_SUPABASE_URL/rest/v1/users"
```

**Problem: Users missing after migration**
```bash
# Re-run validation
npm run validate:user-migration

# Check migration logs
ls -la migration-reports/
cat migration-reports/user-migration-*.json
```

## Success Checklist

- [ ] AWS infrastructure deployed successfully
- [ ] Google OAuth configured and working
- [ ] Environment variables updated
- [ ] Authentication flow tested (email/password and OAuth)
- [ ] User migration completed and validated
- [ ] Production environment configured
- [ ] Monitoring set up
- [ ] Users notified of changes
- [ ] Documentation updated
- [ ] Supabase resources cleaned up (after validation period)

## Support and Resources

- **AWS Cognito Documentation:** https://docs.aws.amazon.com/cognito/
- **Google OAuth Documentation:** https://developers.google.com/identity/protocols/oauth2
- **Migration Scripts:** `scripts/migrate-users-to-cognito.js`
- **Validation Scripts:** `scripts/validate-user-migration.js`
- **Troubleshooting:** `docs/COGNITO_MIGRATION.md`

## Emergency Rollback

If critical issues occur:

1. **Immediate rollback:**
   ```bash
   # Revert environment variables to use Supabase
   export VITE_SUPABASE_URL=your_supabase_url
   export VITE_SUPABASE_ANON_KEY=your_supabase_key
   # Remove AWS Cognito variables
   
   # Redeploy application
   npm run build && npm run deploy
   ```

2. **Communicate with users:**
   - Send status update
   - Provide alternative access methods
   - Schedule maintenance window for retry

3. **Investigate and fix:**
   - Review logs and error reports
   - Fix identified issues
   - Plan retry migration

Remember: User data remains in both systems during migration, so no data loss should occur during rollback.