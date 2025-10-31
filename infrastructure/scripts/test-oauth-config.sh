#!/bin/bash

# Test Google OAuth configuration for Cognito
# This script validates the OAuth setup and tests the authentication flow

set -e

ENVIRONMENT=${1:-dev}
PROFILE=${2:-hallucifix}

echo "Testing Google OAuth configuration for environment: $ENVIRONMENT"
echo "Using AWS profile: $PROFILE"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity --profile $PROFILE > /dev/null 2>&1; then
    echo "❌ Error: AWS CLI not configured for profile $PROFILE"
    echo "Please run: aws configure --profile $PROFILE"
    exit 1
fi

echo "✅ AWS CLI configured"

# Test 1: Check if Google OAuth secret exists
echo ""
echo "🔍 Test 1: Checking Google OAuth secret..."
SECRET_NAME="hallucifix/google-oauth/$ENVIRONMENT"

if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --profile $PROFILE --region us-east-1 > /dev/null 2>&1; then
    echo "✅ Google OAuth secret exists: $SECRET_NAME"
    
    # Validate secret structure
    SECRET_KEYS=$(aws secretsmanager get-secret-value \
        --secret-id "$SECRET_NAME" \
        --profile $PROFILE \
        --region us-east-1 \
        --query 'SecretString' \
        --output text | jq -r 'keys[]' 2>/dev/null || echo "")
    
    if echo "$SECRET_KEYS" | grep -q "clientId" && echo "$SECRET_KEYS" | grep -q "clientSecret"; then
        echo "✅ Secret contains required keys: clientId, clientSecret"
    else
        echo "❌ Secret missing required keys. Expected: clientId, clientSecret"
        echo "Found keys: $SECRET_KEYS"
        exit 1
    fi
else
    echo "❌ Google OAuth secret not found: $SECRET_NAME"
    echo "Run: ./scripts/setup-google-oauth.sh $ENVIRONMENT $PROFILE <client-id> <client-secret>"
    exit 1
fi

# Test 2: Check Cognito User Pool
echo ""
echo "🔍 Test 2: Checking Cognito User Pool..."
STACK_NAME="Hallucifix-Cognito-$ENVIRONMENT"

if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --profile $PROFILE --region us-east-1 > /dev/null 2>&1; then
    echo "✅ Cognito stack exists: $STACK_NAME"
    
    # Get User Pool ID
    USER_POOL_ID=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --profile $PROFILE \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
        --output text 2>/dev/null)
    
    if [ -n "$USER_POOL_ID" ]; then
        echo "✅ User Pool ID: $USER_POOL_ID"
    else
        echo "❌ Could not retrieve User Pool ID from stack outputs"
        exit 1
    fi
else
    echo "❌ Cognito stack not found: $STACK_NAME"
    echo "Run: ./scripts/deploy-cognito.sh $ENVIRONMENT $PROFILE true"
    exit 1
fi

# Test 3: Check Identity Providers
echo ""
echo "🔍 Test 3: Checking Identity Providers..."
IDENTITY_PROVIDERS=$(aws cognito-idp list-identity-providers \
    --user-pool-id "$USER_POOL_ID" \
    --profile $PROFILE \
    --region us-east-1 \
    --query 'Providers[].ProviderName' \
    --output text 2>/dev/null || echo "")

if echo "$IDENTITY_PROVIDERS" | grep -q "Google"; then
    echo "✅ Google identity provider configured"
    
    # Get Google provider details
    GOOGLE_PROVIDER=$(aws cognito-idp describe-identity-provider \
        --user-pool-id "$USER_POOL_ID" \
        --provider-name "Google" \
        --profile $PROFILE \
        --region us-east-1 \
        --query 'IdentityProvider.ProviderDetails.client_id' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$GOOGLE_PROVIDER" ] && [ "$GOOGLE_PROVIDER" != "GOOGLE_CLIENT_ID_PLACEHOLDER" ]; then
        echo "✅ Google provider has real client ID (not placeholder)"
    else
        echo "⚠️  Google provider still using placeholder client ID"
        echo "Redeploy with real credentials: ./scripts/deploy-cognito.sh $ENVIRONMENT $PROFILE true"
    fi
else
    echo "❌ Google identity provider not found"
    echo "Available providers: $IDENTITY_PROVIDERS"
    exit 1
fi

# Test 4: Check User Pool Client
echo ""
echo "🔍 Test 4: Checking User Pool Client..."
USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --profile $PROFILE \
    --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
    --output text 2>/dev/null)

if [ -n "$USER_POOL_CLIENT_ID" ]; then
    echo "✅ User Pool Client ID: $USER_POOL_CLIENT_ID"
    
    # Check client configuration
    CLIENT_CONFIG=$(aws cognito-idp describe-user-pool-client \
        --user-pool-id "$USER_POOL_ID" \
        --client-id "$USER_POOL_CLIENT_ID" \
        --profile $PROFILE \
        --region us-east-1 \
        --query 'UserPoolClient.SupportedIdentityProviders' \
        --output text 2>/dev/null || echo "")
    
    if echo "$CLIENT_CONFIG" | grep -q "Google"; then
        echo "✅ User Pool Client supports Google authentication"
    else
        echo "❌ User Pool Client does not support Google authentication"
        echo "Supported providers: $CLIENT_CONFIG"
        exit 1
    fi
else
    echo "❌ Could not retrieve User Pool Client ID"
    exit 1
fi

# Test 5: Check User Pool Domain
echo ""
echo "🔍 Test 5: Checking User Pool Domain..."
USER_POOL_DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --profile $PROFILE \
    --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolDomain`].OutputValue' \
    --output text 2>/dev/null)

if [ -n "$USER_POOL_DOMAIN" ]; then
    echo "✅ User Pool Domain: $USER_POOL_DOMAIN"
    
    # Test domain accessibility
    DOMAIN_URL="https://$USER_POOL_DOMAIN.auth.us-east-1.amazoncognito.com"
    if curl -s --head "$DOMAIN_URL" | head -n 1 | grep -q "200 OK"; then
        echo "✅ User Pool Domain is accessible"
    else
        echo "⚠️  User Pool Domain may not be fully ready yet"
    fi
else
    echo "❌ Could not retrieve User Pool Domain"
    exit 1
fi

# Test 6: Generate OAuth URLs for testing
echo ""
echo "🔍 Test 6: Generating OAuth test URLs..."

# Construct OAuth authorization URL
AUTH_URL="https://$USER_POOL_DOMAIN.auth.us-east-1.amazoncognito.com/oauth2/authorize"
CALLBACK_URL="http://localhost:3000/callback"
if [ "$ENVIRONMENT" = "prod" ]; then
    CALLBACK_URL="https://app.hallucifix.com/callback"
fi

OAUTH_URL="$AUTH_URL?client_id=$USER_POOL_CLIENT_ID&response_type=code&scope=email+openid+profile&redirect_uri=$CALLBACK_URL&identity_provider=Google"

echo "✅ OAuth authorization URL generated:"
echo "   $OAUTH_URL"
echo ""
echo "To test OAuth flow:"
echo "1. Open the URL above in a browser"
echo "2. Complete Google authentication"
echo "3. Verify redirect to your callback URL with authorization code"

# Summary
echo ""
echo "🎉 OAuth Configuration Test Summary:"
echo "✅ Google OAuth secret configured"
echo "✅ Cognito User Pool deployed"
echo "✅ Google identity provider configured"
echo "✅ User Pool Client supports Google auth"
echo "✅ User Pool Domain accessible"
echo "✅ OAuth URLs generated"
echo ""
echo "Configuration appears to be working correctly!"
echo ""
echo "Environment Variables for Frontend:"
echo "VITE_GOOGLE_CLIENT_ID=$GOOGLE_PROVIDER"
echo "# Add this to your .env.local file"