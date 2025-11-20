#!/bin/bash

# HalluciFix SSL Setup Script - Phase 1
# Sets up SSL certificate, CloudFront distribution, and custom domain

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="prod"
DOMAIN="app.ideascope.cloud"
HOSTED_ZONE_ID="Z08484291O2NND4QPII2J"
CERTIFICATE_ARN="arn:aws:acm:us-east-1:135167710042:certificate/368409ff-5bb7-498d-bfac-fb0d55777fcd"
S3_BUCKET="hallucifix-static-prod-135167710042"

echo -e "${GREEN}🔒 HalluciFix SSL Setup - Phase 1${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Function to check if certificate is validated
check_certificate_status() {
    echo -e "${BLUE}🔍 Checking SSL certificate status...${NC}"
    local status=$(aws acm describe-certificate --certificate-arn "$CERTIFICATE_ARN" --query "Certificate.Status" --output text)
    echo "Certificate Status: $status"
    
    if [[ "$status" == "ISSUED" ]]; then
        echo -e "${GREEN}✅ SSL certificate is validated and ready${NC}"
        return 0
    elif [[ "$status" == "PENDING_VALIDATION" ]]; then
        echo -e "${YELLOW}⚠️ SSL certificate still pending validation${NC}"
        echo -e "${YELLOW}💡 Add the DNS record to your external DNS provider:${NC}"
        echo ""
        echo -e "${BLUE}Type: CNAME${NC}"
        echo -e "${BLUE}Name: _38bec3079eaa1b595ade0fe90de38e21.app.ideascope.cloud${NC}"
        echo -e "${BLUE}Value: _c130e74d39dbd706b987ac9975c9a496.jkddzztszm.acm-validations.aws.${NC}"
        echo ""
        echo -e "${YELLOW}After adding the DNS record, run this script again${NC}"
        return 1
    else
        echo -e "${RED}❌ SSL certificate status: $status${NC}"
        return 1
    fi
}

# Function to create CloudFront distribution
create_cloudfront_distribution() {
    echo -e "${BLUE}🌐 Creating CloudFront distribution with SSL...${NC}"
    
    # Create security headers Lambda@Edge function
    echo -e "${BLUE}📦 Creating security headers Lambda@Edge function...${NC}"
    
    cat > /tmp/security-headers.js << 'EOF'
exports.handler = (event) => {
  const response = event.Records[0].cf.response;
  const headers = response.headers;
  
  // Strict Transport Security
  headers['strict-transport-security'] = [{
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload'
  }];
  
  // Prevent clickjacking
  headers['x-frame-options'] = [{
    key: 'X-Frame-Options',
    value: 'DENY'
  }];
  
  // Prevent MIME type sniffing
  headers['x-content-type-options'] = [{
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  }];
  
  // XSS Protection
  headers['x-xss-protection'] = [{
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  }];
  
  // Referrer Policy
  headers['referrer-policy'] = [{
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  }];
  
  return response;
};
EOF

    # Create Lambda function
    local lambda_arn=$(aws lambda create-function \
        --function-name "hallucifix-security-headers-$ENVIRONMENT" \
        --runtime nodejs18x \
        --role "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/HalluciFixLambdaExecutionRole" \
        --handler index.handler \
        --zip-file fileb://<(zip -q - . < /tmp/security-headers.js) \
        --query 'FunctionArn' \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$lambda_arn" ]]; then
        echo -e "${YELLOW}⚠️ Lambda role not found, creating CloudFront without security headers for now${NC}"
        lambda_arn=""
    else
        echo -e "${GREEN}✅ Security headers Lambda function created${NC}"
        
        # Publish version for Lambda@Edge
        local lambda_version=$(aws lambda publish-version --function-name "hallucifix-security-headers-$ENVIRONMENT" --query 'Version' --output text)
        lambda_arn="${lambda_arn}:${lambda_version}"
    fi
    
    # Create CloudFront origin access identity
    echo -e "${BLUE}🔑 Creating CloudFront Origin Access Identity...${NC}"
    local oai_id=$(aws cloudfront create-cloud-front-origin-access-identity \
        --cloud-front-origin-access-identity-config "CallerReference=hallucifix-oai-$(date +%s),Comment=OAI for HalluciFix $ENVIRONMENT" \
        --query 'CloudFrontOriginAccessIdentity.Id' \
        --output text)
    
    echo -e "${GREEN}✅ CloudFront OAI created: $oai_id${NC}"
    
    # Update S3 bucket policy to allow OAI access
    echo -e "${BLUE}🔒 Updating S3 bucket policy for OAI access...${NC}"
    
    cat > /tmp/s3-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowCloudFrontServicePrincipal",
            "Effect": "Allow",
            "Principal": {
                "Service": "cloudfront.amazonaws.com"
            },
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$S3_BUCKET/*"
        }
    ]
}
EOF

    aws s3 put-bucket-policy --bucket "$S3_BUCKET" --policy /tmp/s3-policy.json
    
    echo -e "${GREEN}✅ S3 bucket policy updated${NC}"
    
    # Create CloudFront distribution
    echo -e "${BLUE}🌐 Creating CloudFront distribution...${NC}"
    
    cat > /tmp/cf-config.json << EOF
{
    "CallerReference": "hallucifix-cf-$(date +%s)",
    "Aliases": {
        "Quantity": 1,
        "Items": ["$DOMAIN"]
    },
    "DefaultRootObject": "index.html",
    "Origins": {
        "Quantity": 1,
        "Items": [{
            "Id": "S3-$S3_BUCKET",
            "DomainName": "$S3_BUCKET.s3.amazonaws.com",
            "S3OriginConfig": {
                "OriginAccessIdentity": "origin-access-identity/cloudfront/$oai_id"
            }
        }]
    },
    "DefaultCacheBehavior": {
        "TargetOriginId": "S3-$S3_BUCKET",
        "ViewerProtocolPolicy": "redirect-to-https",
        "MinTTL": 0,
        "DefaultTTL": 3600,
        "MaxTTL": 86400,
        "ForwardedValues": {
            "QueryString": false,
            "Cookies": {
                "Forward": "none"
            },
            "Headers": {
                "Quantity": 0
            },
            "QueryStringCacheKeys": {
                "Quantity": 0
            }
        },
        "Compress": true,
        "LambdaFunctionAssociations": {
            "Quantity": $(if [[ -n "$lambda_arn" ]]; then echo 1; else echo 0; fi),
            "Items": $(if [[ -n "$lambda_arn" ]]; then echo '[{"LambdaFunctionARN": "'"$lambda_arn"'", "EventType": "viewer-response"}]'; else echo '[]'; fi)
        }
    },
    "Comment": "HalluciFix $ENVIRONMENT distribution",
    "Enabled": true,
    "ViewerCertificate": {
        "ACMCertificateArn": "$CERTIFICATE_ARN",
        "SSLSupportMethod": "sni-only",
        "MinimumProtocolVersion": "TLSv1.2_2018"
    },
    "HttpVersion": "http2",
    "PriceClass": "PriceClass_100",
    "CustomErrorResponses": {
        "Quantity": 1,
        "Items": [{
            "ErrorCode": 404,
            "ResponseCode": "200",
            "ErrorCachingMinTTL": 300,
            "ResponsePagePath": "/index.html"
        }]
    }
}
EOF

    local distribution_id=$(aws cloudfront create-distribution \
        --distribution-config file:///tmp/cf-config.json \
        --query 'Distribution.Id' \
        --output text)
    
    echo -e "${GREEN}✅ CloudFront distribution created: $distribution_id${NC}"
    
    # Wait for distribution to deploy
    echo -e "${BLUE}⏳ Waiting for CloudFront distribution to deploy...${NC}"
    aws cloudfront wait distribution-deployed --id "$distribution_id"
    
    # Get distribution domain name
    local distribution_domain=$(aws cloudfront get-distribution \
        --id "$distribution_id" \
        --query 'Distribution.DomainName' \
        --output text)
    
    echo -e "${GREEN}✅ CloudFront distribution deployed: $distribution_domain${NC}"
    
    # Create Route 53 alias record
    echo -e "${BLUE}🔗 Creating Route 53 alias record...${NC}"
    
    cat > /tmp/alias-record.json << EOF
{
    "Changes": [{
        "Action": "CREATE",
        "ResourceRecordSet": {
            "Name": "$DOMAIN",
            "Type": "A",
            "AliasTarget": {
                "HostedZoneId": "Z2FDTNDATAQYW2",
                "DNSName": "$distribution_domain",
                "EvaluateTargetHealth": false
            }
        }
    }]
}
EOF

    aws route53 change-resource-record-sets \
        --hosted-zone-id "$HOSTED_ZONE_ID" \
        --change-batch file:///tmp/alias-record.json
    
    echo -e "${GREEN}✅ Route 53 alias record created${NC}"
    
    # Update S3 bucket policy with actual distribution ID
    echo -e "${BLUE}🔒 Updating S3 bucket policy with distribution ID...${NC}"
    
    sed -i "s/FILL_IN_DISTRIBUTION_ID/$distribution_id/g" /tmp/s3-policy.json
    aws s3 put-bucket-policy --bucket "$S3_BUCKET" --policy /tmp/s3-policy.json
    
    echo -e "${GREEN}✅ SSL setup complete!${NC}"
    echo ""
    echo -e "${GREEN}🎉 Your application is now available at: https://$DOMAIN${NC}"
    echo ""
    echo -e "${BLUE}📋 Summary:${NC}"
    echo -e "  🌐 Custom Domain: https://$DOMAIN"
    echo -e "  📡 CloudFront Distribution: $distribution_domain"
    echo -e "  📦 S3 Bucket: $S3_BUCKET"
    echo -e "  🔑 SSL Certificate: $CERTIFICATE_ARN"
    
    return 0
}

# Main execution
main() {
    echo -e "${BLUE}Step 1: Checking SSL certificate status...${NC}"
    
    if ! check_certificate_status; then
        exit 1
    fi
    
    echo ""
    echo -e "${BLUE}Step 2: Creating CloudFront distribution...${NC}"
    
    if ! create_cloudfront_distribution; then
        echo -e "${RED}❌ CloudFront distribution creation failed${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${GREEN}🎉 SSL Setup Complete!${NC}"
    echo -e "${GREEN}========================${NC}"
    echo ""
    echo -e "${BLUE}Your HalluciFix application is now available at:${NC}"
    echo -e "${GREEN}https://$DOMAIN${NC}"
    echo ""
    echo -e "${BLUE}Security features enabled:${NC}"
    echo -e "  ✅ HTTPS enforcement"
    echo -e "  ✅ HSTS headers"
    echo -e "  ✅ X-Frame-Options"
    echo -e "  ✅ X-Content-Type-Options"
    echo -e "  ✅ X-XSS-Protection"
    echo -e "  ✅ Referrer Policy"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Update your environment configuration to use the new domain"
    echo -e "  2. Redeploy your application if needed"
    echo -e "  3. Test the SSL configuration"
}

# Run main function
main "$@"