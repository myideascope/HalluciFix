#!/bin/bash

# Deploy Lambda Functions Script
# This script builds and deploys the migrated Lambda functions

set -e

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRASTRUCTURE_DIR="$(dirname "$SCRIPT_DIR")"
LAMBDA_FUNCTIONS_DIR="$INFRASTRUCTURE_DIR/lambda-functions"

echo "🚀 Deploying Lambda functions for environment: $ENVIRONMENT"

# Function to build Lambda function
build_lambda_function() {
    local function_name=$1
    local function_dir="$LAMBDA_FUNCTIONS_DIR/$function_name"
    
    echo "📦 Building $function_name..."
    
    if [ ! -d "$function_dir" ]; then
        echo "❌ Function directory not found: $function_dir"
        exit 1
    fi
    
    cd "$function_dir"
    
    # Install dependencies
    if [ -f "package.json" ]; then
        echo "  Installing dependencies..."
        npm install --production
    fi
    
    echo "  ✅ $function_name built successfully"
}

# Build all Lambda functions
echo "🔨 Building Lambda functions..."

build_lambda_function "scan-executor"
build_lambda_function "billing-api"
build_lambda_function "payment-methods-api"
build_lambda_function "stripe-webhook"

echo "✅ All Lambda functions built successfully"

# Deploy using CDK
echo "🚀 Deploying infrastructure with CDK..."

cd "$INFRASTRUCTURE_DIR"

# Synthesize the CDK app first to check for errors
echo "  Synthesizing CDK app..."
npx cdk synth

# Deploy the compute stack
echo "  Deploying compute stack..."
npx cdk deploy HallucifixComputeStack-$ENVIRONMENT --require-approval never

echo "🎉 Lambda functions deployed successfully!"

# Display useful information
echo ""
echo "📋 Deployment Summary:"
echo "  Environment: $ENVIRONMENT"
echo "  Functions deployed:"
echo "    - hallucifix-scan-executor-$ENVIRONMENT"
echo "    - hallucifix-billing-api-$ENVIRONMENT"
echo "    - hallucifix-payment-methods-api-$ENVIRONMENT"
echo "    - hallucifix-stripe-webhook-$ENVIRONMENT"
echo ""
echo "🔗 Next steps:"
echo "  1. Update environment variables in AWS Secrets Manager"
echo "  2. Configure Stripe webhook endpoints"
echo "  3. Test the API endpoints"
echo "  4. Update frontend to use new API Gateway URLs"