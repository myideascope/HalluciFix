#!/bin/bash

# Setup Google OAuth credentials in AWS Secrets Manager
# This script creates the secret with Google OAuth credentials for Cognito integration

set -e

ENVIRONMENT=${1:-dev}
PROFILE=${2:-hallucifix}
GOOGLE_CLIENT_ID=${3}
GOOGLE_CLIENT_SECRET=${4}

echo "Setting up Google OAuth credentials for environment: $ENVIRONMENT"
echo "Using AWS profile: $PROFILE"

# Validate inputs
if [ -z "$GOOGLE_CLIENT_ID" ]; then
    echo "Error: Google Client ID is required"
    echo "Usage: $0 <environment> <aws-profile> <google-client-id> <google-client-secret>"
    echo "Example: $0 dev hallucifix 123456789-abc.apps.googleusercontent.com your-client-secret"
    exit 1
fi

if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    echo "Error: Google Client Secret is required"
    echo "Usage: $0 <environment> <aws-profile> <google-client-id> <google-client-secret>"
    exit 1
fi

# Validate Google Client ID format
if [[ ! "$GOOGLE_CLIENT_ID" =~ ^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$ ]]; then
    echo "Warning: Google Client ID format doesn't match expected pattern"
    echo "Expected format: [numbers]-[string].apps.googleusercontent.com"
    echo "Provided: $GOOGLE_CLIENT_ID"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if AWS CLI is configured
if ! aws sts get-caller-identity --profile $PROFILE > /dev/null 2>&1; then
    echo "Error: AWS CLI not configured for profile $PROFILE"
    echo "Please run: aws configure --profile $PROFILE"
    exit 1
fi

SECRET_NAME="hallucifix/google-oauth/$ENVIRONMENT"
SECRET_VALUE=$(cat <<EOF
{
    "clientId": "$GOOGLE_CLIENT_ID",
    "clientSecret": "$GOOGLE_CLIENT_SECRET"
}
EOF
)

echo "Creating/updating secret: $SECRET_NAME"

# Check if secret already exists
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --profile $PROFILE --region us-east-1 > /dev/null 2>&1; then
    echo "Secret already exists. Updating..."
    aws secretsmanager update-secret \
        --secret-id "$SECRET_NAME" \
        --secret-string "$SECRET_VALUE" \
        --profile $PROFILE \
        --region us-east-1
    echo "✅ Secret updated successfully"
else
    echo "Creating new secret..."
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "Google OAuth credentials for HalluciFix $ENVIRONMENT" \
        --secret-string "$SECRET_VALUE" \
        --profile $PROFILE \
        --region us-east-1
    echo "✅ Secret created successfully"
fi

# Verify the secret
echo "Verifying secret creation..."
SECRET_ARN=$(aws secretsmanager describe-secret \
    --secret-id "$SECRET_NAME" \
    --profile $PROFILE \
    --region us-east-1 \
    --query 'ARN' \
    --output text)

echo "✅ Secret verified: $SECRET_ARN"

# Test secret retrieval (without showing values)
echo "Testing secret retrieval..."
aws secretsmanager get-secret-value \
    --secret-id "$SECRET_NAME" \
    --profile $PROFILE \
    --region us-east-1 \
    --query 'SecretString' \
    --output text | jq -r 'keys[]' | while read key; do
    echo "  ✅ Key '$key' found in secret"
done

echo ""
echo "🎉 Google OAuth credentials setup completed!"
echo ""
echo "Next steps:"
echo "1. Update your .env.local file with:"
echo "   VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
echo ""
echo "2. Deploy the Cognito stack with real credentials:"
echo "   cd infrastructure"
echo "   npx cdk deploy Hallucifix-Cognito-$ENVIRONMENT \\"
echo "     --context environment=$ENVIRONMENT \\"
echo "     --context useRealGoogleCredentials=true \\"
echo "     --profile $PROFILE"
echo ""
echo "3. Test the OAuth flow in your application"
echo ""
echo "⚠️  Security Note:"
echo "   - Client secret is stored securely in AWS Secrets Manager"
echo "   - Only include client ID in frontend environment variables"
echo "   - Never commit client secret to version control"