#!/bin/bash

# Deploy Cognito User Pool and Identity Pool
# This script deploys the compute stack with Cognito configuration

set -e

ENVIRONMENT=${1:-dev}
PROFILE=${2:-hallucifix}

echo "Deploying Cognito infrastructure for environment: $ENVIRONMENT"
echo "Using AWS profile: $PROFILE"

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

# Deploy the compute stack (which includes Cognito)
echo "Deploying Compute stack with Cognito..."
npx cdk deploy Hallucifix-Compute-$ENVIRONMENT \
    --profile $PROFILE \
    --context environment=$ENVIRONMENT \
    --require-approval never

echo "Deployment completed!"
echo ""
echo "Next steps:"
echo "1. Set up Google OAuth credentials in Google Cloud Console"
echo "2. Update infrastructure/config/oauth-config.json with actual values"
echo "3. Update the CDK stack with real Google OAuth credentials"
echo "4. Redeploy to activate Google OAuth integration"