#!/bin/bash

# Deploy all AWS infrastructure stacks in the correct order
# This script orchestrates the complete infrastructure deployment

set -e

ENVIRONMENT=${1:-dev}
PROFILE=${2:-hallucifix}
USE_REAL_OAUTH=${3:-false}

echo "🚀 Deploying HalluciFix AWS Infrastructure"
echo "Environment: $ENVIRONMENT"
echo "AWS Profile: $PROFILE"
echo "Use Real OAuth: $USE_REAL_OAUTH"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity --profile $PROFILE > /dev/null 2>&1; then
    echo "❌ Error: AWS CLI not configured for profile $PROFILE"
    echo "Please run: aws configure --profile $PROFILE"
    exit 1
fi

echo "✅ AWS CLI configured"

# Navigate to infrastructure directory
cd "$(dirname "$0")/.."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing CDK dependencies..."
    npm install
fi

# Bootstrap CDK if needed
echo "🔧 Checking CDK bootstrap status..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --profile $PROFILE --region us-east-1 > /dev/null 2>&1; then
    echo "🔧 Bootstrapping CDK..."
    npx cdk bootstrap --profile $PROFILE
fi

echo "✅ CDK ready"

# Deploy stacks in order
echo ""
echo "📋 Deployment Plan:"
echo "1. Network Stack (VPC, Security Groups)"
echo "2. Storage Stack (S3, CloudFront)"
echo "3. Database Stack (RDS, ElastiCache)"
echo "4. Cognito Stack (User Pool, OAuth)"
echo "5. Compute Stack (Lambda, API Gateway)"
echo ""

read -p "Continue with deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Function to deploy stack with error handling
deploy_stack() {
    local stack_name=$1
    local description=$2
    local extra_context=$3
    
    echo ""
    echo "🔄 Deploying $description..."
    
    local deploy_cmd="npx cdk deploy $stack_name --profile $PROFILE --context environment=$ENVIRONMENT --require-approval never"
    
    if [ -n "$extra_context" ]; then
        deploy_cmd="$deploy_cmd $extra_context"
    fi
    
    if eval $deploy_cmd; then
        echo "✅ $description deployed successfully"
    else
        echo "❌ Failed to deploy $description"
        exit 1
    fi
}

# 1. Deploy Network Stack
deploy_stack "Hallucifix-Network-$ENVIRONMENT" "Network Stack"

# 2. Deploy Storage Stack
deploy_stack "Hallucifix-Storage-$ENVIRONMENT" "Storage Stack"

# 3. Deploy Database Stack
deploy_stack "Hallucifix-Database-$ENVIRONMENT" "Database Stack"

# 4. Deploy Cognito Stack
if [ "$USE_REAL_OAUTH" = "true" ]; then
    echo ""
    echo "🔍 Checking Google OAuth secret..."
    SECRET_NAME="hallucifix/google-oauth/$ENVIRONMENT"
    
    if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --profile $PROFILE --region us-east-1 > /dev/null 2>&1; then
        echo "❌ Google OAuth secret not found: $SECRET_NAME"
        echo "Please run: ./scripts/setup-google-oauth.sh $ENVIRONMENT $PROFILE <client-id> <client-secret>"
        exit 1
    fi
    echo "✅ Google OAuth secret found"
    
    deploy_stack "Hallucifix-Cognito-$ENVIRONMENT" "Cognito Stack" "--context useRealGoogleCredentials=true"
else
    deploy_stack "Hallucifix-Cognito-$ENVIRONMENT" "Cognito Stack (with placeholders)"
fi

# 5. Deploy Compute Stack
deploy_stack "Hallucifix-Compute-$ENVIRONMENT" "Compute Stack"

echo ""
echo "🎉 All stacks deployed successfully!"

# Run validation
echo ""
echo "🔍 Running deployment validation..."
./scripts/validate-deployment.sh $ENVIRONMENT $PROFILE

# Show next steps
echo ""
echo "📋 Next Steps:"

if [ "$USE_REAL_OAUTH" = "true" ]; then
    echo "✅ OAuth is configured with real credentials"
    echo "1. Update your .env.local with the Google Client ID"
    echo "2. Test the OAuth flow: ./scripts/test-oauth-config.sh $ENVIRONMENT $PROFILE"
    echo "3. Update frontend to use Cognito authentication"
else
    echo "⚠️  OAuth is using placeholder credentials"
    echo "1. Set up Google OAuth credentials in Google Cloud Console"
    echo "2. Store credentials: ./scripts/setup-google-oauth.sh $ENVIRONMENT $PROFILE <client-id> <client-secret>"
    echo "3. Redeploy Cognito: ./scripts/deploy-cognito.sh $ENVIRONMENT $PROFILE true"
fi

echo "4. Begin frontend migration to use AWS services"
echo "5. Migrate data from Supabase to AWS RDS"
echo ""
echo "🔗 Useful commands:"
echo "  View stack outputs: aws cloudformation describe-stacks --stack-name Hallucifix-Cognito-$ENVIRONMENT --profile $PROFILE --region us-east-1 --query 'Stacks[0].Outputs'"
echo "  Test OAuth config: ./scripts/test-oauth-config.sh $ENVIRONMENT $PROFILE"
echo "  Validate deployment: ./scripts/validate-deployment.sh $ENVIRONMENT $PROFILE"