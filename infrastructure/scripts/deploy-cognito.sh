#!/bin/bash

# Deploy Cognito User Pool and Identity Pool
# This script deploys the Cognito stack with optional real Google OAuth credentials

set -e

ENVIRONMENT=${1:-dev}
PROFILE=${2:-hallucifix}
USE_REAL_CREDENTIALS=${3:-false}

echo "Deploying Cognito infrastructure for environment: $ENVIRONMENT"
echo "Using AWS profile: $PROFILE"
echo "Use real Google credentials: $USE_REAL_CREDENTIALS"

# Check if AWS CLI is configured
if ! aws sts get-caller-identity --profile $PROFILE > /dev/null 2>&1; then
    echo "Error: AWS CLI not configured for profile $PROFILE"
    echo "Please run: aws configure --profile $PROFILE"
    exit 1
fi

# Navigate to infrastructure directory
cd "$(dirname "$0")/.."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing CDK dependencies..."
    npm install
fi

# Bootstrap CDK if needed (only for first time)
echo "Checking CDK bootstrap status..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --profile $PROFILE > /dev/null 2>&1; then
    echo "Bootstrapping CDK..."
    npx cdk bootstrap --profile $PROFILE
fi

# Check if using real credentials and validate secret exists
if [ "$USE_REAL_CREDENTIALS" = "true" ]; then
    echo "Checking for Google OAuth secret..."
    SECRET_NAME="hallucifix/google-oauth/$ENVIRONMENT"
    
    if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --profile $PROFILE --region us-east-1 > /dev/null 2>&1; then
        echo "Error: Google OAuth secret not found: $SECRET_NAME"
        echo "Please run the setup script first:"
        echo "  ./scripts/setup-google-oauth.sh $ENVIRONMENT $PROFILE <client-id> <client-secret>"
        exit 1
    fi
    echo "✅ Google OAuth secret found"
fi

# Deploy the Cognito stack
echo "Deploying Cognito stack..."
npx cdk deploy Hallucifix-Cognito-$ENVIRONMENT \
    --profile $PROFILE \
    --context environment=$ENVIRONMENT \
    --context useRealGoogleCredentials=$USE_REAL_CREDENTIALS \
    --require-approval never

echo "Deployment completed!"
echo ""

if [ "$USE_REAL_CREDENTIALS" = "true" ]; then
    echo "✅ Cognito deployed with real Google OAuth credentials"
    echo ""
    echo "Next steps:"
    echo "1. Update your frontend .env.local with the Google Client ID"
    echo "2. Test the OAuth flow in your application"
    echo "3. Verify user creation in Cognito User Pool"
else
    echo "⚠️  Cognito deployed with placeholder credentials"
    echo ""
    echo "To enable Google OAuth:"
    echo "1. Set up Google OAuth credentials in Google Cloud Console"
    echo "2. Run: ./scripts/setup-google-oauth.sh $ENVIRONMENT $PROFILE <client-id> <client-secret>"
    echo "3. Redeploy with: ./scripts/deploy-cognito.sh $ENVIRONMENT $PROFILE true"
fi

echo ""
echo "Cognito User Pool outputs:"
aws cloudformation describe-stacks \
    --stack-name "Hallucifix-Cognito-$ENVIRONMENT" \
    --profile $PROFILE \
    --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId` || OutputKey==`UserPoolClientId` || OutputKey==`UserPoolDomain`].[OutputKey,OutputValue]' \
    --output table 2>/dev/null || echo "Stack outputs not available yet"