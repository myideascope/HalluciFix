#!/bin/bash

# HalluciFix Production Deployment Script
# Simplified wrapper for production deployments

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🚀 HalluciFix Production Deployment${NC}"
echo -e "${GREEN}==================================${NC}"

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo -e "${RED}❌ Error: Run this script from the project root directory${NC}"
    exit 1
fi

# Build the application
echo -e "${YELLOW}📦 Building React application...${NC}"
npm run build

# Deploy infrastructure (if needed)
echo -e "${YELLOW}🏗️  Deploying infrastructure...${NC}"
cd infrastructure
./deploy-enhanced.sh --environment prod --skip-existing --continue-on-failure
cd ..

# Deploy frontend to S3
echo -e "${YELLOW}🌐 Deploying frontend to S3...${NC}"
aws s3 sync dist/ s3://hallucifix-static-prod-135167710042 --delete

# Invalidate CloudFront (if needed)
echo -e "${YELLOW}⚡ Invalidating CloudFront cache...${NC}"
# Note: Add CloudFront invalidation if CloudFront is being used

echo -e "${GREEN}✅ Production deployment completed!${NC}"
echo -e "${BLUE}🌐 Application URL: http://hallucifix-static-prod-135167710042.s3-website-us-east-1.amazonaws.com/${NC}"
echo -e "${BLUE}🔌 API URL: https://4e89e4qzze.execute-api.us-east-1.amazonaws.com/prod/${NC}"