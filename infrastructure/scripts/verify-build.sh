#!/bin/bash

# Infrastructure Build Verification Script
# This script verifies that the infrastructure can be built successfully

set -e

echo "🔧 Infrastructure Build Verification"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the infrastructure directory."
    exit 1
fi

# Check Node.js version
echo "📋 Checking Node.js version..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js version: $NODE_VERSION"
else
    echo "❌ Node.js not found. Please install Node.js to run this verification."
    exit 1
fi

# Check npm version
echo "📋 Checking npm version..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "✅ npm version: $NPM_VERSION"
else
    echo "❌ npm not found. Please install npm to run this verification."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Clean any existing compiled files
echo "🧹 Cleaning compiled files..."
find . -name "*.js" -not -path "./node_modules/*" -not -path "./cdk.out/*" -delete || true
find . -name "*.d.ts" -not -path "./node_modules/*" -not -path "./cdk.out/*" -delete || true

# Run TypeScript compilation
echo "🔨 Running TypeScript compilation..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ TypeScript compilation successful!"
else
    echo "❌ TypeScript compilation failed!"
    exit 1
fi

# Run CDK synth to verify stack definitions
echo "🏗️  Running CDK synth..."
npm run cdk synth

if [ $? -eq 0 ]; then
    echo "✅ CDK synth successful!"
else
    echo "❌ CDK synth failed!"
    exit 1
fi

# Run tests if they exist
if [ -f "jest.config.js" ] || grep -q "jest" package.json; then
    echo "🧪 Running tests..."
    npm test
    
    if [ $? -eq 0 ]; then
        echo "✅ Tests passed!"
    else
        echo "❌ Tests failed!"
        exit 1
    fi
else
    echo "ℹ️  No tests configured, skipping test execution."
fi

echo ""
echo "🎉 All verification steps completed successfully!"
echo "✅ Infrastructure build process is working correctly."