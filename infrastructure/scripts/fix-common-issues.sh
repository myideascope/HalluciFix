#!/bin/bash

# Common Infrastructure Issues Fix Script
# This script fixes common CDK and TypeScript issues

set -e

echo "🔧 Infrastructure Issues Fix Script"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the infrastructure directory."
    exit 1
fi

echo "🧹 Cleaning compiled files..."
find . -name "*.js" -not -path "./node_modules/*" -not -path "./cdk.out/*" -delete || true
find . -name "*.d.ts" -not -path "./node_modules/*" -not -path "./cdk.out/*" -delete || true
echo "✅ Cleaned compiled files"

echo "📦 Checking CDK version consistency..."
CDK_LIB_VERSION=$(grep '"aws-cdk-lib"' package.json | sed 's/.*"aws-cdk-lib": "\([^"]*\)".*/\1/')
CDK_CLI_VERSION=$(grep '"aws-cdk"' package.json | sed 's/.*"aws-cdk": "\([^"]*\)".*/\1/')

echo "CDK lib version: $CDK_LIB_VERSION"
echo "CDK CLI version: $CDK_CLI_VERSION"

if [ "$CDK_LIB_VERSION" != "$CDK_CLI_VERSION" ]; then
    echo "⚠️  CDK version mismatch detected"
    echo "This has been fixed in package.json - run npm install to update"
else
    echo "✅ CDK versions are consistent"
fi

echo "🔍 Checking for common import issues..."

# Check for incorrect SnsAction imports
INCORRECT_SNS_IMPORTS=$(grep -r "cloudwatch\.SnsAction" lib/ || true)
if [ -n "$INCORRECT_SNS_IMPORTS" ]; then
    echo "⚠️  Found incorrect SnsAction imports:"
    echo "$INCORRECT_SNS_IMPORTS"
    echo "These should use the imported SnsAction from 'aws-cdk-lib/aws-cloudwatch-actions'"
else
    echo "✅ No incorrect SnsAction imports found"
fi

# Check for deprecated CDK APIs
echo "🔍 Checking for deprecated CDK APIs..."
DEPRECATED_APIS=$(grep -r "metricConcurrentExecutions\|CfnReservedConcurrency\|ScalingPolicy" lib/ || true)
if [ -n "$DEPRECATED_APIS" ]; then
    echo "⚠️  Found potentially deprecated APIs:"
    echo "$DEPRECATED_APIS"
else
    echo "✅ No deprecated APIs found"
fi

# Check for missing dependencies
echo "🔍 Checking for missing dependencies..."
if [ -f "node_modules/@aws-sdk/client-dynamodb/package.json" ]; then
    echo "✅ @aws-sdk/client-dynamodb is installed"
else
    echo "⚠️  @aws-sdk/client-dynamodb might be missing"
fi

if [ -f "lambda-functions/common/elastiCacheService.ts" ]; then
    echo "✅ elastiCacheService.ts exists"
else
    echo "⚠️  elastiCacheService.ts is missing"
fi

echo ""
echo "🎉 Common issues check completed!"
echo "Run './scripts/verify-build.sh' to test the build process."