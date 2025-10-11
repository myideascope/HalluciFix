#!/bin/bash

# HalluciFix Environment Setup Script
# This script helps set up the development environment

set -e  # Exit on any error

echo "🚀 HalluciFix Environment Setup"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}📋 Creating .env.local from template...${NC}"
    cp .env.example .env.local
    echo -e "${GREEN}✅ Created .env.local${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env.local with your actual configuration values${NC}"
else
    echo -e "${BLUE}📋 .env.local already exists${NC}"
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${BLUE}📦 Dependencies already installed${NC}"
fi

# Validate environment
echo -e "${YELLOW}🔍 Validating environment configuration...${NC}"
if npm run validate-env > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Environment validation passed${NC}"
else
    echo -e "${RED}❌ Environment validation failed${NC}"
    echo -e "${YELLOW}💡 Run 'npm run validate-env' for detailed error information${NC}"
fi

# Check required services
echo ""
echo -e "${BLUE}🔧 Service Configuration Status:${NC}"

# Check Supabase
if grep -q "your_supabase" .env.local; then
    echo -e "${RED}❌ Supabase: Not configured${NC}"
    echo -e "   ${YELLOW}→ Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY${NC}"
else
    echo -e "${GREEN}✅ Supabase: Configured${NC}"
fi

# Check OpenAI
if grep -q "your_openai_api_key" .env.local; then
    echo -e "${YELLOW}⚠️  OpenAI: Not configured (will use mock analysis)${NC}"
    echo -e "   ${YELLOW}→ Set VITE_OPENAI_API_KEY for real AI analysis${NC}"
else
    echo -e "${GREEN}✅ OpenAI: Configured${NC}"
fi

# Check Google OAuth
if grep -q "your_google_client" .env.local; then
    echo -e "${YELLOW}⚠️  Google OAuth: Not configured (will use mock auth)${NC}"
    echo -e "   ${YELLOW}→ Set VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET${NC}"
else
    echo -e "${GREEN}✅ Google OAuth: Configured${NC}"
fi

# Check Stripe
if grep -q "your_publishable_key" .env.local; then
    echo -e "${YELLOW}⚠️  Stripe: Not configured (payments disabled)${NC}"
    echo -e "   ${YELLOW}→ Set Stripe keys to enable payment features${NC}"
else
    echo -e "${GREEN}✅ Stripe: Configured${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "1. ${YELLOW}Edit .env.local${NC} with your actual service credentials"
echo -e "2. ${YELLOW}npm run dev${NC} to start the development server"
echo -e "3. ${YELLOW}npm run validate-env${NC} to check configuration"
echo ""
echo -e "${BLUE}Quick start options:${NC}"
echo -e "• ${GREEN}Minimum setup:${NC} Just configure Supabase for basic functionality"
echo -e "• ${GREEN}Real AI:${NC} Add OpenAI API key and set VITE_ENABLE_MOCK_SERVICES=false"
echo -e "• ${GREEN}Full features:${NC} Configure all services for complete functionality"
echo ""
echo -e "${BLUE}Need help?${NC} Check the setup guide in .env.example"