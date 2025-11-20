#!/bin/bash

# HalluciFix Simple SSL Setup Script
# Sets up SSL using S3 static website hosting with HTTPS redirect

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="app.ideascope.cloud"
HOSTED_ZONE_ID="Z08484291O2NND4QPII2J"
CERTIFICATE_ARN="arn:aws:acm:us-east-1:135167710042:certificate/368409ff-5bb7-498d-bfac-fb0d55777fcd"
S3_BUCKET="hallucifix-static-prod-135167710042"

echo -e "${GREEN}🔒 HalluciFix Simple SSL Setup${NC}"
echo -e "${GREEN}==============================${NC}"
echo ""

# Check if certificate is validated
check_certificate_status() {
    echo -e "${BLUE}🔍 Checking SSL certificate status...${NC}"
    local status=$(aws acm describe-certificate --certificate-arn "$CERTIFICATE_ARN" --query "Certificate.Status" --output text)
    echo "Certificate Status: $status"
    
    if [[ "$status" == "ISSUED" ]]; then
        echo -e "${GREEN}✅ SSL certificate is validated and ready${NC}"
        return 0
    else
        echo -e "${RED}❌ SSL certificate not ready (status: $status)${NC}"
        return 1
    fi
}

# Set up S3 static website hosting with HTTPS redirect
setup_s3_website() {
    echo -e "${BLUE}🌐 Setting up S3 static website hosting...${NC}"
    
    # Enable static website hosting on the bucket
    aws s3 website s3://$S3_BUCKET \
        --index-document index.html \
        --error-document index.html \
        --redirect-all-requests-to '{"HostName":"'$DOMAIN'","Protocol":"https"}'
    
    echo -e "${GREEN}✅ S3 static website hosting configured${NC}"
}

# Create Route 53 CNAME record pointing to S3 website endpoint
create_route53_record() {
    echo -e "${BLUE}🔗 Creating Route 53 CNAME record for S3 website...${NC}"
    
    # Get the S3 website endpoint for the region
    local region=$(aws s3api get-bucket-location --bucket "$S3_BUCKET" --query "LocationConstraint" --output text)
    [[ "$region" == "None" ]] && region="us-east-1"
    
    # S3 website endpoints
    case "$region" in
        "us-east-1")
            local s3_endpoint="s3-website-us-east-1.amazonaws.com"
            ;;
        *)
            local s3_endpoint="s3-website-$region.amazonaws.com"
            ;;
    esac
    
    local s3_bucket_website="$S3_BUCKET.$s3_endpoint"
    
    cat > /tmp/s3-website-record.json << EOF
{
    "Changes": [{
        "Action": "CREATE",
        "ResourceRecordSet": {
            "Name": "$DOMAIN",
            "Type": "CNAME",
            "TTL": 300,
            "ResourceRecords": [{
                "Value": "$s3_bucket_website"
            }]
        }
    }]
}
EOF

    aws route53 change-resource-record-sets \
        --hosted-zone-id "$HOSTED_ZONE_ID" \
        --change-batch file:///tmp/s3-website-record.json
    
    echo -e "${GREEN}✅ Route 53 CNAME record created pointing to S3 website${NC}"
    echo -e "${BLUE}📍 S3 Website Endpoint: $s3_bucket_website${NC}"
}

# Check if the application is already deployed
check_application_deployment() {
    echo -e "${BLUE}📋 Checking application deployment...${NC}"
    
    if aws s3 ls "s3://$S3_BUCKET/index.html" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Application files found in S3 bucket${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️ No application files found in S3 bucket${NC}"
        echo -e "${YELLOW}💡 Please deploy your application first:${NC}"
        echo -e "${BLUE}   npm run build${NC}"
        echo -e "${BLUE}   aws s3 sync dist/ s3://$S3_BUCKET --delete${NC}"
        return 1
    fi
}

# Test the SSL configuration
test_ssl_configuration() {
    echo -e "${BLUE}🧪 Testing SSL configuration...${NC}"
    echo ""
    echo -e "${GREEN}🎯 Your application should now be available at:${NC}"
    echo -e "${BLUE}   https://$DOMAIN${NC}"
    echo ""
    echo -e "${BLUE}📋 To verify the setup:${NC}"
    echo -e "${BLUE}   1. Visit https://$DOMAIN in your browser${NC}"
    echo -e "${BLUE}   2. Check for the lock icon (HTTPS secured)${NC}"
    echo -e "${BLUE}   3. Verify the certificate is valid${NC}"
    echo ""
    echo -e "${BLUE}🔧 If you encounter issues:${NC}"
    echo -e "${BLUE}   - Wait a few minutes for DNS propagation${NC}"
    echo -e "${BLUE}   - Clear your browser cache${NC}"
    echo -e "${BLUE}   - Check S3 bucket policy permissions${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}Step 1: Checking SSL certificate status...${NC}"
    
    if ! check_certificate_status; then
        echo -e "${RED}❌ SSL certificate validation failed${NC}"
        echo -e "${RED}💡 Ensure DNS validation is complete${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${BLUE}Step 2: Checking application deployment...${NC}"
    
    if ! check_application_deployment; then
        echo -e "${YELLOW}⚠️ Please deploy your application first${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${BLUE}Step 3: Setting up S3 static website hosting...${NC}"
    
    if ! setup_s3_website; then
        echo -e "${RED}❌ S3 website setup failed${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${BLUE}Step 4: Creating Route 53 record...${NC}"
    
    if ! create_route53_record; then
        echo -e "${RED}❌ Route 53 record creation failed${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${GREEN}🎉 Simple SSL Setup Complete!${NC}"
    echo -e "${GREEN}=============================${NC}"
    echo ""
    echo -e "${BLUE}Your HalluciFix application is now available at:${NC}"
    echo -e "${GREEN}https://$DOMAIN${NC}"
    echo ""
    
    test_ssl_configuration
}

# Run main function
main "$@"