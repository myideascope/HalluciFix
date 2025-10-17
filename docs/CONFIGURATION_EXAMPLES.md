# Configuration Examples

This document provides practical configuration examples for different deployment scenarios and use cases.

## Table of Contents

- [Basic Setups](#basic-setups)
- [Development Configurations](#development-configurations)
- [Production Configurations](#production-configurations)
- [Service-Specific Examples](#service-specific-examples)
- [Security Configurations](#security-configurations)
- [Monitoring Setups](#monitoring-setups)

## Basic Setups

### Minimal Local Development

**File**: `.env.local`

```bash
# Minimum configuration for local development
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Keep mock services enabled for quick setup
VITE_ENABLE_MOCK_SERVICES=true

# Optional: Add real AI for testing
# VITE_OPENAI_API_KEY=sk-your_openai_api_key_here
```

### Quick Real AI Setup

**File**: `.env.local`

```bash
# Database (Required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Enable real AI analysis
VITE_ENABLE_MOCK_SERVICES=false
VITE_OPENAI_API_KEY=sk-your_openai_api_key_here
VITE_OPENAI_MODEL=gpt-4
```

### Full Local Development

**File**: `.env.local`

```bash
# Database
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Disable mock services
VITE_ENABLE_MOCK_SERVICES=false

# AI Services
VITE_OPENAI_API_KEY=sk-your_openai_api_key_here
VITE_ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
VITE_PRIMARY_AI_PROVIDER=openai
VITE_AI_FALLBACK_CHAIN=anthropic

# Google OAuth
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_client_secret_here
OAUTH_TOKEN_ENCRYPTION_KEY=dev_32_character_encryption_key_123
OAUTH_STATE_SECRET=dev_oauth_state_secret_key_123456
OAUTH_SESSION_SECRET=dev_session_secret_key_123456789

# JWT
JWT_SECRET=dev_jwt_secret_key_for_development_only

# Development features
VITE_ENABLE_BETA_FEATURES=true
LOG_LEVEL=debug
```

## Development Configurations

### Team Development Environment

**File**: `.env.development`

```bash
# Shared development settings
VITE_APP_NAME=HalluciFix (Dev)
VITE_APP_URL=http://localhost:5173

# Feature flags for development
VITE_ENABLE_MOCK_SERVICES=false
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_PAYMENTS=false
VITE_ENABLE_BETA_FEATURES=true

# Logging
LOG_LEVEL=debug
LOG_FORMAT=pretty

# AI Configuration
VITE_OPENAI_MODEL=gpt-3.5-turbo  # Cheaper for development
VITE_OPENAI_MAX_TOKENS=2000
VITE_OPENAI_TEMPERATURE=0.1

# OAuth Development Settings
OAUTH_REFRESH_CHECK_INTERVAL_MS=300000
OAUTH_REFRESH_BUFFER_MS=300000
OAUTH_CLEANUP_INTERVAL_MS=3600000
OAUTH_TOKEN_GRACE_PERIOD_MS=86400000

# Database settings optimized for development
DB_CONNECTION_POOL_SIZE=5
DB_QUERY_TIMEOUT=10000
```

### Testing Environment

**File**: `.env.test`

```bash
# Test-specific configuration
NODE_ENV=test
VITE_APP_NAME=HalluciFix (Test)

# Use test database
VITE_SUPABASE_URL=https://test-project.supabase.co
VITE_SUPABASE_ANON_KEY=test_anon_key
SUPABASE_SERVICE_KEY=test_service_key

# Mock services for consistent testing
VITE_ENABLE_MOCK_SERVICES=true

# Disable external services
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_PAYMENTS=false

# Test-specific logging
LOG_LEVEL=warn
LOG_FORMAT=json

# Fast timeouts for tests
DB_QUERY_TIMEOUT=5000
OAUTH_REFRESH_CHECK_INTERVAL_MS=10000
```

## Production Configurations

### Small Production Deployment

**File**: `.env.production`

```bash
# Production app settings
VITE_APP_NAME=HalluciFix
VITE_APP_URL=https://your-domain.com

# Production feature flags
VITE_ENABLE_MOCK_SERVICES=false
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_PAYMENTS=true
VITE_ENABLE_BETA_FEATURES=false

# Production logging
LOG_LEVEL=warn
LOG_FORMAT=json
LOG_DESTINATION=external

# AI Services (set via environment variables)
VITE_OPENAI_MODEL=gpt-4
VITE_OPENAI_MAX_TOKENS=4000
VITE_OPENAI_TEMPERATURE=0.1
VITE_PRIMARY_AI_PROVIDER=openai
VITE_AI_FALLBACK_CHAIN=anthropic

# Database optimization
DB_CONNECTION_POOL_SIZE=20
DB_QUERY_TIMEOUT=30000
VITE_ENABLE_READ_REPLICAS=false  # Start without replicas

# Security settings
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Monitoring
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.01

# Rate limiting
RATE_LIMIT_WINDOW=900000  # 15 minutes
RATE_LIMIT_MAX=100
```

### Enterprise Production Deployment

**File**: `.env.production`

```bash
# Enterprise app settings
VITE_APP_NAME=HalluciFix Enterprise
VITE_APP_URL=https://hallucifix.enterprise.com

# All production features enabled
VITE_ENABLE_MOCK_SERVICES=false
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_PAYMENTS=true
VITE_ENABLE_BETA_FEATURES=false

# Enterprise logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_DESTINATION=external
LOG_RETENTION_DAYS=90
LOG_MAX_SIZE_MB=500
ENABLE_LOG_AGGREGATION=true

# Multi-provider AI setup
VITE_PRIMARY_AI_PROVIDER=openai
VITE_AI_FALLBACK_CHAIN=anthropic,hallucifix

# High-performance database
DB_CONNECTION_POOL_SIZE=50
DB_QUERY_TIMEOUT=30000
VITE_ENABLE_READ_REPLICAS=true

# Enhanced security
JWT_EXPIRES_IN=12h
JWT_REFRESH_EXPIRES_IN=3d

# Comprehensive monitoring
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Strict rate limiting
RATE_LIMIT_WINDOW=300000  # 5 minutes
RATE_LIMIT_MAX=50
```

## Service-Specific Examples

### OpenAI-Only Configuration

```bash
# Database
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# OpenAI only
VITE_ENABLE_MOCK_SERVICES=false
VITE_OPENAI_API_KEY=sk-your_openai_api_key
VITE_OPENAI_MODEL=gpt-4
VITE_OPENAI_MAX_TOKENS=4000
VITE_OPENAI_TEMPERATURE=0.1
VITE_PRIMARY_AI_PROVIDER=openai
# No fallback chain - OpenAI only
```

### Multi-Provider AI Configuration

```bash
# Database
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Multiple AI providers
VITE_ENABLE_MOCK_SERVICES=false

# OpenAI (Primary)
VITE_OPENAI_API_KEY=sk-your_openai_api_key
VITE_OPENAI_MODEL=gpt-4
VITE_OPENAI_MAX_TOKENS=4000
VITE_OPENAI_TEMPERATURE=0.1

# Anthropic (Fallback)
VITE_ANTHROPIC_API_KEY=sk-ant-your_anthropic_key
VITE_ANTHROPIC_MODEL=claude-3-sonnet-20240229
VITE_ANTHROPIC_MAX_TOKENS=4000

# HalluciFix API (Secondary Fallback)
VITE_HALLUCIFIX_API_KEY=hf_your_api_key
VITE_HALLUCIFIX_API_URL=https://api.hallucifix.com

# Provider configuration
VITE_PRIMARY_AI_PROVIDER=openai
VITE_AI_FALLBACK_CHAIN=anthropic,hallucifix
```

### Google Services Configuration

```bash
# Database
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Google OAuth & Drive
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_client_secret
VITE_GOOGLE_REDIRECT_URI=https://your-domain.com/auth/callback
GOOGLE_OAUTH_SCOPES=openid email profile https://www.googleapis.com/auth/drive.readonly

# OAuth Security
OAUTH_TOKEN_ENCRYPTION_KEY=your_32_character_encryption_key_here
OAUTH_STATE_SECRET=your_oauth_state_secret_key_here
OAUTH_SESSION_SECRET=your_session_secret_key_here

# OAuth Service Configuration
OAUTH_REFRESH_CHECK_INTERVAL_MS=300000
OAUTH_REFRESH_BUFFER_MS=300000
OAUTH_CLEANUP_INTERVAL_MS=3600000
OAUTH_TOKEN_GRACE_PERIOD_MS=86400000
```

### Stripe Payment Configuration

```bash
# Database
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Enable payments
VITE_ENABLE_PAYMENTS=true

# Stripe Configuration
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key
STRIPE_SECRET_KEY=sk_live_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Stripe Price IDs
STRIPE_PRICE_ID_BASIC_MONTHLY=price_1234567890abcdef
STRIPE_PRICE_ID_BASIC_YEARLY=price_abcdef1234567890
STRIPE_PRICE_ID_PRO_MONTHLY=price_fedcba0987654321
STRIPE_PRICE_ID_PRO_YEARLY=price_1357924680abcdef
STRIPE_PRICE_ID_API_CALLS=price_api_calls_per_1000

# Webhook URL
WEBHOOK_URL=https://your-domain.com/api/webhooks/stripe
```

## Security Configurations

### High-Security Production

```bash
# Strong encryption keys (32+ characters)
OAUTH_TOKEN_ENCRYPTION_KEY=prod_super_secure_32_char_key_12345
OAUTH_STATE_SECRET=prod_oauth_state_secret_key_67890abcdef
OAUTH_SESSION_SECRET=prod_session_secret_key_fedcba0987654321

# Strong JWT secret
JWT_SECRET=prod_jwt_secret_key_with_high_entropy_12345678901234567890

# Short token lifetimes
JWT_EXPIRES_IN=6h
JWT_REFRESH_EXPIRES_IN=24h

# Aggressive OAuth token management
OAUTH_REFRESH_CHECK_INTERVAL_MS=60000   # 1 minute
OAUTH_REFRESH_BUFFER_MS=300000          # 5 minutes
OAUTH_CLEANUP_INTERVAL_MS=1800000       # 30 minutes
OAUTH_TOKEN_GRACE_PERIOD_MS=3600000     # 1 hour

# Strict rate limiting
RATE_LIMIT_WINDOW=300000  # 5 minutes
RATE_LIMIT_MAX=20         # Very restrictive
```

### Development Security (Relaxed)

```bash
# Development-friendly keys (still secure but easier to manage)
OAUTH_TOKEN_ENCRYPTION_KEY=dev_32_character_encryption_key_123
OAUTH_STATE_SECRET=dev_oauth_state_secret_key_123456
OAUTH_SESSION_SECRET=dev_session_secret_key_123456789

# Development JWT secret
JWT_SECRET=dev_jwt_secret_key_for_development_only

# Longer token lifetimes for development
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Relaxed OAuth token management
OAUTH_REFRESH_CHECK_INTERVAL_MS=300000   # 5 minutes
OAUTH_REFRESH_BUFFER_MS=300000           # 5 minutes
OAUTH_CLEANUP_INTERVAL_MS=3600000        # 1 hour
OAUTH_TOKEN_GRACE_PERIOD_MS=86400000     # 24 hours

# Lenient rate limiting
RATE_LIMIT_WINDOW=900000  # 15 minutes
RATE_LIMIT_MAX=1000       # Very permissive
```

## Monitoring Setups

### Basic Monitoring

```bash
# Sentry for error tracking
VITE_SENTRY_DSN=https://your_dsn@sentry.io/project_id
SENTRY_AUTH_TOKEN=your_sentry_auth_token
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Basic analytics
VITE_ENABLE_ANALYTICS=true
VITE_GOOGLE_ANALYTICS_ID=GA_MEASUREMENT_ID

# Basic logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_RETENTION_DAYS=30
```

### Comprehensive Monitoring

```bash
# Sentry (Error Tracking)
VITE_SENTRY_DSN=https://your_dsn@sentry.io/project_id
SENTRY_AUTH_TOKEN=your_sentry_auth_token
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Datadog (Infrastructure Monitoring)
DATADOG_API_KEY=your_datadog_api_key
DATADOG_SITE=datadoghq.com

# Analytics
VITE_ENABLE_ANALYTICS=true
VITE_GOOGLE_ANALYTICS_ID=GA_MEASUREMENT_ID
VITE_MIXPANEL_TOKEN=your_mixpanel_token

# Advanced Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_DESTINATION=external
LOG_RETENTION_DAYS=90
LOG_MAX_SIZE_MB=500
ENABLE_LOG_AGGREGATION=true
```

### Development Monitoring

```bash
# Minimal monitoring for development
VITE_ENABLE_ANALYTICS=false

# Development-friendly logging
LOG_LEVEL=debug
LOG_FORMAT=pretty
LOG_DESTINATION=console

# Optional: Sentry for development error tracking
# VITE_SENTRY_DSN=https://dev_dsn@sentry.io/dev_project_id
# SENTRY_ENVIRONMENT=development
```

## Docker Configurations

### Docker Compose Environment

**File**: `docker-compose.yml`

```yaml
version: '3.8'
services:
  hallucifix:
    build: .
    ports:
      - "3000:3000"
    environment:
      # Database
      - VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
      - VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      
      # AI Services
      - VITE_OPENAI_API_KEY=${VITE_OPENAI_API_KEY}
      - VITE_ENABLE_MOCK_SERVICES=false
      
      # Security
      - JWT_SECRET=${JWT_SECRET}
      - OAUTH_TOKEN_ENCRYPTION_KEY=${OAUTH_TOKEN_ENCRYPTION_KEY}
      
      # Features
      - VITE_ENABLE_ANALYTICS=true
      - VITE_ENABLE_PAYMENTS=false
    env_file:
      - .env.docker
```

**File**: `.env.docker`

```bash
# Docker-specific configuration
VITE_APP_URL=http://localhost:3000

# Use environment-specific values
VITE_SUPABASE_URL=https://docker-project.supabase.co
VITE_SUPABASE_ANON_KEY=docker_anon_key
SUPABASE_SERVICE_KEY=docker_service_key

# Container-optimized settings
DB_CONNECTION_POOL_SIZE=10
DB_QUERY_TIMEOUT=30000
LOG_FORMAT=json
LOG_LEVEL=info
```

## Kubernetes Configurations

### Kubernetes ConfigMap

**File**: `k8s-configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: hallucifix-config
data:
  VITE_APP_NAME: "HalluciFix"
  VITE_APP_URL: "https://hallucifix.k8s.local"
  VITE_ENABLE_MOCK_SERVICES: "false"
  VITE_ENABLE_ANALYTICS: "true"
  VITE_ENABLE_PAYMENTS: "true"
  LOG_LEVEL: "info"
  LOG_FORMAT: "json"
  DB_CONNECTION_POOL_SIZE: "20"
  DB_QUERY_TIMEOUT: "30000"
```

### Kubernetes Secrets

**File**: `k8s-secrets.yaml`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: hallucifix-secrets
type: Opaque
stringData:
  VITE_SUPABASE_URL: "https://k8s-project.supabase.co"
  VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  SUPABASE_SERVICE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  VITE_OPENAI_API_KEY: "sk-your_openai_api_key"
  JWT_SECRET: "k8s_jwt_secret_key_with_high_entropy"
  OAUTH_TOKEN_ENCRYPTION_KEY: "k8s_32_character_encryption_key_123"
```

These examples provide a comprehensive starting point for different deployment scenarios. Choose the configuration that best matches your use case and customize as needed.