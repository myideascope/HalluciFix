#!/bin/bash

# Validate AWS infrastructure deployment
# This script checks that all components are properly deployed and configured

set -e

ENVIRONMENT=${1:-dev}
PROFILE=${2:-hallucifix}

echo "Validating AWS infrastructure deployment for environment: $ENVIRONMENT"
echo "Using AWS profile: $PROFILE"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity --profile $PROFILE > /dev/null 2>&1; then
    echo "❌ Error: AWS CLI not configured for profile $PROFILE"
    exit 1
fi

echo "✅ AWS CLI configured"

# Function to check stack status
check_stack() {
    local stack_name=$1
    local description=$2
    
    echo "🔍 Checking $description..."
    
    if aws cloudformation describe-stacks --stack-name "$stack_name" --profile $PROFILE --region us-east-1 > /dev/null 2>&1; then
        local status=$(aws cloudformation describe-stacks \
            --stack-name "$stack_name" \
            --profile $PROFILE \
            --region us-east-1 \
            --query 'Stacks[0].StackStatus' \
            --output text)
        
        if [ "$status" = "CREATE_COMPLETE" ] || [ "$status" = "UPDATE_COMPLETE" ]; then
            echo "✅ $description: $status"
            return 0
        else
            echo "⚠️  $description: $status"
            return 1
        fi
    else
        echo "❌ $description: Stack not found"
        return 1
    fi
}

# Check all stacks
VALIDATION_PASSED=true

check_stack "Hallucifix-Network-$ENVIRONMENT" "Network Stack" || VALIDATION_PASSED=false
check_stack "Hallucifix-Storage-$ENVIRONMENT" "Storage Stack" || VALIDATION_PASSED=false
check_stack "Hallucifix-Database-$ENVIRONMENT" "Database Stack" || VALIDATION_PASSED=false
check_stack "Hallucifix-Cognito-$ENVIRONMENT" "Cognito Stack" || VALIDATION_PASSED=false
check_stack "Hallucifix-Compute-$ENVIRONMENT" "Compute Stack" || VALIDATION_PASSED=false

echo ""

if [ "$VALIDATION_PASSED" = true ]; then
    echo "🎉 All infrastructure stacks are deployed successfully!"
    
    # Display key outputs
    echo ""
    echo "📋 Key Infrastructure Outputs:"
    echo ""
    
    # Cognito outputs
    echo "🔐 Authentication (Cognito):"
    aws cloudformation describe-stacks \
        --stack-name "Hallucifix-Cognito-$ENVIRONMENT" \
        --profile $PROFILE \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId` || OutputKey==`UserPoolClientId` || OutputKey==`UserPoolDomain`].[OutputKey,OutputValue]' \
        --output table 2>/dev/null || echo "  Cognito outputs not available"
    
    echo ""
    
    # Database outputs
    echo "🗄️  Database (RDS):"
    aws cloudformation describe-stacks \
        --stack-name "Hallucifix-Database-$ENVIRONMENT" \
        --profile $PROFILE \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint` || OutputKey==`CacheEndpoint`].[OutputKey,OutputValue]' \
        --output table 2>/dev/null || echo "  Database outputs not available"
    
    echo ""
    
    # Storage outputs
    echo "📦 Storage (S3/CloudFront):"
    aws cloudformation describe-stacks \
        --stack-name "Hallucifix-Storage-$ENVIRONMENT" \
        --profile $PROFILE \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`DocumentsBucketName` || OutputKey==`StaticBucketName` || OutputKey==`CloudFrontDomainName`].[OutputKey,OutputValue]' \
        --output table 2>/dev/null || echo "  Storage outputs not available"
    
    echo ""
    
    # Compute outputs
    echo "⚡ Compute (API Gateway):"
    aws cloudformation describe-stacks \
        --stack-name "Hallucifix-Compute-$ENVIRONMENT" \
        --profile $PROFILE \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].[OutputKey,OutputValue]' \
        --output table 2>/dev/null || echo "  Compute outputs not available"
    
else
    echo "❌ Some infrastructure stacks are not properly deployed"
    echo "Please check the stack status and redeploy as needed"
    exit 1
fi