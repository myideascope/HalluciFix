#!/bin/bash

# HalluciFix Environment Configuration Script
# Updates .env.staging with actual AWS infrastructure outputs

set -e

ENVIRONMENT=${1:-staging}
PROFILE=${2:-hallucifix}
REGION=${3:-us-east-1}

echo "🔧 Updating environment configuration for $ENVIRONMENT..."

# Set AWS profile
export AWS_PROFILE=$PROFILE
export AWS_DEFAULT_REGION=$REGION

# Function to get stack output
get_output() {
    local stack_name=$1
    local output_key=$2
    aws cloudformation describe-stacks \
        --stack-name $stack_name \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text 2>/dev/null || echo ""
}

# Get outputs from all stacks
echo "📋 Retrieving infrastructure outputs..."

# Cognito outputs
USER_POOL_ID=$(get_output "Hallucifix-Cognito-$ENVIRONMENT" "UserPoolId")
USER_POOL_CLIENT_ID=$(get_output "Hallucifix-Cognito-$ENVIRONMENT" "UserPoolClientId")
IDENTITY_POOL_ID=$(get_output "Hallucifix-Cognito-$ENVIRONMENT" "IdentityPoolId")
USER_POOL_DOMAIN=$(get_output "Hallucifix-Cognito-$ENVIRONMENT" "UserPoolDomain")

# Database outputs
DB_ENDPOINT=$(get_output "Hallucifix-Database-$ENVIRONMENT" "DatabaseEndpoint")
DB_SECRET_ARN=$(get_output "Hallucifix-Database-$ENVIRONMENT" "DatabaseSecretArn")

# Cache outputs
CACHE_ENDPOINT=$(get_output "Hallucifix-Database-$ENVIRONMENT" "CacheEndpoint")

# API Gateway outputs
API_GATEWAY_URL=$(get_output "Hallucifix-Compute-$ENVIRONMENT" "ApiGatewayUrl")

# Storage outputs
STATIC_BUCKET_NAME=$(get_output "Hallucifix-Storage-$ENVIRONMENT" "StaticBucketName")
DOCUMENTS_BUCKET_NAME=$(get_output "Hallucifix-Storage-$ENVIRONMENT" "DocumentsBucketName")
CLOUDFRONT_DOMAIN=$(get_output "Hallucifix-Storage-$ENVIRONMENT" "CloudFrontDomainName")

# Lambda outputs
SCAN_EXECUTOR_ARN=$(get_output "Hallucifix-Compute-$ENVIRONMENT" "ScanExecutorFunctionArn")
BILLING_API_ARN=$(get_output "Hallucifix-Compute-$ENVIRONMENT" "BillingApiFunctionArn")
PAYMENT_METHODS_API_ARN=$(get_output "Hallucifix-Compute-$ENVIRONMENT" "PaymentMethodsApiFunctionArn")
STRIPE_WEBHOOK_ARN=$(get_output "Hallucifix-Compute-$ENVIRONMENT" "StripeWebhookFunctionArn")
FILE_PROCESSOR_ARN=$(get_output "Hallucifix-Compute-$ENVIRONMENT" "FileProcessorFunctionArn")

# Network outputs
VPC_ID=$(get_output "Hallucifix-Network-$ENVIRONMENT" "VpcId")
LAMBDA_SG_ID=$(get_output "Hallucifix-Network-$ENVIRONMENT" "LambdaSecurityGroupId")

# Alert outputs
ALERT_TOPIC_ARN=$(get_output "Hallucifix-Compute-$ENVIRONMENT" "AlertTopicArn")

# Get database credentials from Secrets Manager (if available)
if [ -n "$DB_SECRET_ARN" ]; then
    echo "🔐 Retrieving database credentials from Secrets Manager..."
    SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id $DB_SECRET_ARN --query SecretString --output text 2>/dev/null || echo "")
    if [ -n "$SECRET_JSON" ]; then
        DB_USERNAME=$(echo $SECRET_JSON | jq -r '.username // empty')
        DB_PASSWORD=$(echo $SECRET_JSON | jq -r '.password // empty')
    fi
fi

# Update .env.staging file
echo "📝 Updating .env.staging with infrastructure outputs..."

# Create backup
cp .env.staging .env.staging.backup.$(date +%Y%m%d_%H%M%S)

# Update Cognito values
if [ -n "$USER_POOL_ID" ]; then
    sed -i "s|VITE_COGNITO_USER_POOL_ID=.*|VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID|" .env.staging
fi

if [ -n "$USER_POOL_CLIENT_ID" ]; then
    sed -i "s|VITE_COGNITO_USER_POOL_CLIENT_ID=.*|VITE_COGNITO_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID|" .env.staging
fi

if [ -n "$IDENTITY_POOL_ID" ]; then
    sed -i "s|VITE_COGNITO_IDENTITY_POOL_ID=.*|VITE_COGNITO_IDENTITY_POOL_ID=$IDENTITY_POOL_ID|" .env.staging
fi

if [ -n "$USER_POOL_DOMAIN" ]; then
    sed -i "s|VITE_COGNITO_USER_POOL_DOMAIN=.*|VITE_COGNITO_USER_POOL_DOMAIN=$USER_POOL_DOMAIN|" .env.staging
fi

# Update Database values
if [ -n "$DB_ENDPOINT" ] && [ -n "$DB_USERNAME" ] && [ -n "$DB_PASSWORD" ]; then
    DATABASE_URL="postgresql://$DB_USERNAME:$DB_PASSWORD@$DB_ENDPOINT:5432/hallucifix_$ENVIRONMENT"
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL|" .env.staging
    sed -i "s|DB_HOST=.*|DB_HOST=$DB_ENDPOINT|" .env.staging
    sed -i "s|DB_USERNAME=.*|DB_USERNAME=$DB_USERNAME|" .env.staging
    sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" .env.staging
fi

if [ -n "$DB_SECRET_ARN" ]; then
    sed -i "s|DB_SECRET_ARN=.*|DB_SECRET_ARN=$DB_SECRET_ARN|" .env.staging
fi

# Update Redis values
if [ -n "$CACHE_ENDPOINT" ]; then
    sed -i "s|REDIS_URL=.*|REDIS_URL=redis://$CACHE_ENDPOINT:6379|" .env.staging
fi

# Update API Gateway values
if [ -n "$API_GATEWAY_URL" ]; then
    sed -i "s|VITE_API_GATEWAY_URL=.*|VITE_API_GATEWAY_URL=$API_GATEWAY_URL|" .env.staging
fi

# Update S3 values
if [ -n "$STATIC_BUCKET_NAME" ]; then
    sed -i "s|VITE_S3_BUCKET_NAME=.*|VITE_S3_BUCKET_NAME=$STATIC_BUCKET_NAME|" .env.staging
fi

if [ -n "$DOCUMENTS_BUCKET_NAME" ]; then
    sed -i "s|S3_DOCUMENTS_BUCKET_NAME=.*|S3_DOCUMENTS_BUCKET_NAME=$DOCUMENTS_BUCKET_NAME|" .env.staging
fi

# Update CloudFront values
if [ -n "$CLOUDFRONT_DOMAIN" ]; then
    sed -i "s|VITE_CLOUDFRONT_DOMAIN=.*|VITE_CLOUDFRONT_DOMAIN=https://$CLOUDFRONT_DOMAIN|" .env.staging
fi

# Update Lambda ARNs
if [ -n "$SCAN_EXECUTOR_ARN" ]; then
    sed -i "s|SCAN_EXECUTOR_FUNCTION_ARN=.*|SCAN_EXECUTOR_FUNCTION_ARN=$SCAN_EXECUTOR_ARN|" .env.staging
fi

if [ -n "$BILLING_API_ARN" ]; then
    sed -i "s|BILLING_API_FUNCTION_ARN=.*|BILLING_API_FUNCTION_ARN=$BILLING_API_ARN|" .env.staging
fi

if [ -n "$PAYMENT_METHODS_API_ARN" ]; then
    sed -i "s|PAYMENT_METHODS_API_FUNCTION_ARN=.*|PAYMENT_METHODS_API_FUNCTION_ARN=$PAYMENT_METHODS_API_ARN|" .env.staging
fi

if [ -n "$STRIPE_WEBHOOK_ARN" ]; then
    sed -i "s|STRIPE_WEBHOOK_FUNCTION_ARN=.*|STRIPE_WEBHOOK_FUNCTION_ARN=$STRIPE_WEBHOOK_ARN|" .env.staging
fi

if [ -n "$FILE_PROCESSOR_ARN" ]; then
    sed -i "s|FILE_PROCESSOR_FUNCTION_ARN=.*|FILE_PROCESSOR_FUNCTION_ARN=$FILE_PROCESSOR_ARN|" .env.staging
fi

# Update Network values
if [ -n "$VPC_ID" ]; then
    sed -i "s|VPC_ID=.*|VPC_ID=$VPC_ID|" .env.staging
fi

if [ -n "$LAMBDA_SG_ID" ]; then
    sed -i "s|LAMBDA_SECURITY_GROUP_ID=.*|LAMBDA_SECURITY_GROUP_ID=$LAMBDA_SG_ID|" .env.staging
fi

# Update Alert values
if [ -n "$ALERT_TOPIC_ARN" ]; then
    sed -i "s|ALERT_TOPIC_ARN=.*|ALERT_TOPIC_ARN=$ALERT_TOPIC_ARN|" .env.staging
fi

echo "✅ Environment configuration updated!"
echo ""
echo "📋 Next steps:"
echo "1. Configure external services (Google OAuth, Stripe, Sentry)"
echo "2. Run database migrations"
echo "3. Deploy Lambda functions"
echo "4. Upload static assets"
echo "5. Test the application"
echo ""
echo "🔗 Useful commands:"
echo "  # View current configuration"
echo "  cat .env.staging"
echo ""
echo "  # Deploy Lambda functions"
echo "  cd infrastructure/scripts && ./deploy-lambda-functions.sh $ENVIRONMENT"
echo ""
echo "  # Upload static assets"
echo "  aws s3 sync dist/ s3://$STATIC_BUCKET_NAME --profile $PROFILE"