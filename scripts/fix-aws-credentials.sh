#!/bin/bash

# AWS Credentials Fix Script
# This script fixes the AWS credentials issue by setting up the correct profile

echo "🔧 Fixing AWS Credentials Configuration..."

# Set the AWS profile to use the working 'hallucifix' profile
export AWS_PROFILE=hallucifix

# Add to bash profile for persistence
if ! grep -q "export AWS_PROFILE=hallucifix" ~/.bashrc; then
    echo "export AWS_PROFILE=hallucifix" >> ~/.bashrc
    echo "✅ Added AWS_PROFILE to ~/.bashrc"
fi

# Verify the credentials work
echo "🔍 Verifying AWS credentials..."
if aws sts get-caller-identity > /dev/null 2>&1; then
    echo "✅ AWS credentials are working!"
    echo "📋 Your AWS Account Details:"
    aws sts get-caller-identity
else
    echo "❌ AWS credentials are still not working"
    exit 1
fi

echo ""
echo "🎉 AWS credentials fixed successfully!"
echo "💡 You can now proceed with the AWS infrastructure deployment."
echo ""
echo "Next steps:"
echo "1. Navigate to the infrastructure directory: cd infrastructure"
echo "2. Install dependencies: npm install"
echo "3. Deploy infrastructure: npx cdk deploy --all"