#!/bin/bash

# HalluciFix Infrastructure Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
PROFILE="hallucifix"
REGION="us-east-1"

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
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  -e, --environment  Environment to deploy (dev, staging, prod) [default: dev]"
      echo "  -p, --profile      AWS profile to use [default: hallucifix]"
      echo "  -r, --region       AWS region [default: us-east-1]"
      echo "  -h, --help         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}🚀 Deploying HalluciFix Infrastructure${NC}"
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "Profile: ${YELLOW}$PROFILE${NC}"
echo -e "Region: ${YELLOW}$REGION${NC}"
echo ""

# Set AWS profile
export AWS_PROFILE=$PROFILE
export AWS_DEFAULT_REGION=$REGION

# Build the project
echo -e "${YELLOW}📦 Building CDK project...${NC}"
npm run build

# Bootstrap CDK (only needed once per account/region)
echo -e "${YELLOW}🔧 Bootstrapping CDK...${NC}"
npx cdk bootstrap --context environment=$ENVIRONMENT

# Deploy stacks in order
echo -e "${YELLOW}🏗️  Deploying Network Stack...${NC}"
npx cdk deploy Hallucifix-Network-$ENVIRONMENT --context environment=$ENVIRONMENT --require-approval never

echo -e "${YELLOW}🏗️  Deploying Storage Stack...${NC}"
npx cdk deploy Hallucifix-Storage-$ENVIRONMENT --context environment=$ENVIRONMENT --require-approval never

echo -e "${YELLOW}🏗️  Deploying Database Stack...${NC}"
npx cdk deploy Hallucifix-Database-$ENVIRONMENT --context environment=$ENVIRONMENT --require-approval never

echo -e "${YELLOW}🏗️  Deploying Cognito Stack...${NC}"
npx cdk deploy Hallucifix-Cognito-$ENVIRONMENT --context environment=$ENVIRONMENT --require-approval never

echo -e "${YELLOW}🏗️  Deploying Compute Stack...${NC}"
npx cdk deploy Hallucifix-Compute-$ENVIRONMENT --context environment=$ENVIRONMENT --require-approval never

echo -e "${YELLOW}🏗️  Deploying CacheMonitoring Stack...${NC}"
npx cdk deploy Hallucifix-CacheMonitoring-$ENVIRONMENT --context environment=$ENVIRONMENT --require-approval never

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "1. Update your React app environment variables with the outputs"
echo "2. Deploy your Lambda function code"
echo "3. Upload your React build to the S3 static bucket"
echo "4. Configure your domain name with CloudFront"