#!/bin/bash

# HalluciFix AWS Deployment Script
# Deploys the React application to AWS infrastructure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
PROFILE="hallucifix"
REGION="us-east-1"
SKIP_BUILD=false
SKIP_INFRASTRUCTURE=false
DEPLOY_FRONTEND_ONLY=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -e|--environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    -p|--profile)
      PROFILE="$2"
      shift 2
      ;;
    -r|--region)
      REGION="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --skip-infrastructure)
      SKIP_INFRASTRUCTURE=true
      shift
      ;;
    --frontend-only)
      DEPLOY_FRONTEND_ONLY=true
      SKIP_INFRASTRUCTURE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  -e, --environment      Environment to deploy (dev, staging, prod) [default: dev]"
      echo "  -p, --profile          AWS profile to use [default: hallucifix]"
      echo "  -r, --region           AWS region [default: us-east-1]"
      echo "  --skip-build           Skip building the React application"
      echo "  --skip-infrastructure  Skip infrastructure deployment"
      echo "  --frontend-only        Deploy only frontend (implies --skip-infrastructure)"
      echo "  -h, --help             Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}🚀 Deploying HalluciFix to AWS${NC}"
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "Profile: ${YELLOW}$PROFILE${NC}"
echo -e "Region: ${YELLOW}$REGION${NC}"
echo ""

# Set AWS profile and region
export AWS_PROFILE=$PROFILE
export AWS_DEFAULT_REGION=$REGION

# Validate AWS credentials
echo -e "${BLUE}🔐 Validating AWS credentials...${NC}"
if ! aws sts get-caller-identity > /dev/null 2>&1; then
  echo -e "${RED}❌ AWS credentials not configured or invalid${NC}"
  echo "Please configure AWS credentials using 'aws configure --profile $PROFILE'"
  exit 1
fi

# Validate environment configuration
echo -e "${BLUE}⚙️  Validating environment configuration...${NC}"
if [[ ! -f ".env.$ENVIRONMENT" ]]; then
  echo -e "${YELLOW}⚠️  Environment file .env.$ENVIRONMENT not found${NC}"
  echo "Using default configuration"
fi

# Deploy infrastructure if not skipped
if [[ "$SKIP_INFRASTRUCTURE" != true ]]; then
  echo -e "${BLUE}🏗️  Deploying AWS infrastructure...${NC}"
  
  if [[ ! -d "infrastructure" ]]; then
    echo -e "${RED}❌ Infrastructure directory not found${NC}"
    exit 1
  fi
  
  cd infrastructure
  
  # Install dependencies if needed
  if [[ ! -d "node_modules" ]]; then
    echo -e "${YELLOW}📦 Installing infrastructure dependencies...${NC}"
    npm install
  fi
  
  # Build infrastructure
  echo -e "${YELLOW}🔨 Building infrastructure...${NC}"
  npm run build
  
  # Deploy infrastructure
  echo -e "${YELLOW}🚀 Deploying infrastructure stacks...${NC}"
  ./deploy.sh --environment "$ENVIRONMENT" --profile "$PROFILE" --region "$REGION"
  
  cd ..
  
  echo -e "${GREEN}✅ Infrastructure deployment completed${NC}"
fi

# Build React application if not skipped
if [[ "$SKIP_BUILD" != true ]]; then
  echo -e "${BLUE}📦 Building React application...${NC}"
  
  # Set environment for build
  export NODE_ENV=$ENVIRONMENT
  
  # Install dependencies if needed
  if [[ ! -d "node_modules" ]]; then
    echo -e "${YELLOW}📦 Installing application dependencies...${NC}"
    npm install
  fi
  
  # Build application
  npm run build
  
  if [[ ! -d "dist" ]]; then
    echo -e "${RED}❌ Build failed - dist directory not found${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✅ React application built successfully${NC}"
fi

# Deploy to S3 and invalidate CloudFront
echo -e "${BLUE}☁️  Deploying to S3 and CloudFront...${NC}"

# Get S3 bucket name from environment or CDK outputs
S3_BUCKET=""
CLOUDFRONT_DISTRIBUTION=""

# Try to get from environment variables first
if [[ -f ".env.$ENVIRONMENT" ]]; then
  source ".env.$ENVIRONMENT"
  S3_BUCKET=$VITE_S3_BUCKET_NAME
fi

# If not found, try to get from CDK outputs
if [[ -z "$S3_BUCKET" ]]; then
  echo -e "${YELLOW}🔍 Getting S3 bucket from CDK outputs...${NC}"
  
  # Get stack outputs
  STACK_NAME="Hallucifix-Storage-$ENVIRONMENT"
  S3_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='StaticWebsiteBucket'].OutputValue" \
    --output text 2>/dev/null || echo "")
  
  CLOUDFRONT_DISTRIBUTION=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
    --output text 2>/dev/null || echo "")
fi

if [[ -z "$S3_BUCKET" ]]; then
  echo -e "${RED}❌ Could not determine S3 bucket name${NC}"
  echo "Please set VITE_S3_BUCKET_NAME in .env.$ENVIRONMENT or deploy infrastructure first"
  exit 1
fi

echo -e "S3 Bucket: ${YELLOW}$S3_BUCKET${NC}"
if [[ -n "$CLOUDFRONT_DISTRIBUTION" ]]; then
  echo -e "CloudFront Distribution: ${YELLOW}$CLOUDFRONT_DISTRIBUTION${NC}"
fi

# Sync files to S3
echo -e "${YELLOW}📤 Uploading files to S3...${NC}"
aws s3 sync dist/ "s3://$S3_BUCKET" \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "*.html" \
  --exclude "*.json"

# Upload HTML files with shorter cache
aws s3 sync dist/ "s3://$S3_BUCKET" \
  --cache-control "public, max-age=0, must-revalidate" \
  --include "*.html" \
  --include "*.json"

echo -e "${GREEN}✅ Files uploaded to S3${NC}"

# Invalidate CloudFront cache
if [[ -n "$CLOUDFRONT_DISTRIBUTION" ]]; then
  echo -e "${YELLOW}🔄 Invalidating CloudFront cache...${NC}"
  
  INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION" \
    --paths "/*" \
    --query "Invalidation.Id" \
    --output text)
  
  echo -e "Invalidation ID: ${YELLOW}$INVALIDATION_ID${NC}"
  echo -e "${GREEN}✅ CloudFront invalidation started${NC}"
else
  echo -e "${YELLOW}⚠️  CloudFront distribution not found - skipping cache invalidation${NC}"
fi

# Deploy Lambda functions if infrastructure was deployed
if [[ "$SKIP_INFRASTRUCTURE" != true && "$DEPLOY_FRONTEND_ONLY" != true ]]; then
  echo -e "${BLUE}⚡ Deploying Lambda functions...${NC}"
  
  if [[ -d "infrastructure/lambda-functions" ]]; then
    cd infrastructure
    
    # Deploy Lambda functions
    if [[ -f "scripts/deploy-lambda-functions.sh" ]]; then
      ./scripts/deploy-lambda-functions.sh --environment "$ENVIRONMENT" --profile "$PROFILE"
    else
      echo -e "${YELLOW}⚠️  Lambda deployment script not found - skipping${NC}"
    fi
    
    cd ..
    echo -e "${GREEN}✅ Lambda functions deployed${NC}"
  else
    echo -e "${YELLOW}⚠️  Lambda functions directory not found - skipping${NC}"
  fi
fi

# Get deployment URLs
echo -e "${BLUE}🌐 Getting deployment URLs...${NC}"

# Get CloudFront URL
if [[ -n "$CLOUDFRONT_DISTRIBUTION" ]]; then
  CLOUDFRONT_URL=$(aws cloudfront get-distribution \
    --id "$CLOUDFRONT_DISTRIBUTION" \
    --query "Distribution.DomainName" \
    --output text 2>/dev/null || echo "")
  
  if [[ -n "$CLOUDFRONT_URL" ]]; then
    echo -e "Frontend URL: ${GREEN}https://$CLOUDFRONT_URL${NC}"
  fi
fi

# Get API Gateway URL
API_GATEWAY_URL=$(aws cloudformation describe-stacks \
  --stack-name "Hallucifix-Compute-$ENVIRONMENT" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayUrl'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [[ -n "$API_GATEWAY_URL" ]]; then
  echo -e "API URL: ${GREEN}$API_GATEWAY_URL${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "1. Test the application at the frontend URL"
echo "2. Verify API endpoints are working"
echo "3. Check CloudWatch logs for any issues"
echo "4. Update DNS records if using a custom domain"

# Run post-deployment validation
echo -e "${BLUE}🔍 Running post-deployment validation...${NC}"
if [[ -f "scripts/validate-deployment.sh" ]]; then
  ./scripts/validate-deployment.sh --environment "$ENVIRONMENT" --profile "$PROFILE"
else
  echo -e "${YELLOW}⚠️  Deployment validation script not found - skipping${NC}"
fi

echo -e "${GREEN}✅ Deployment process completed${NC}"