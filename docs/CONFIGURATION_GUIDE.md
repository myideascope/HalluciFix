# Configuration Guide

This guide provides comprehensive documentation for configuring HalluciFix across different environments.

## Table of Contents

- [Overview](#overview)
- [Environment Files](#environment-files)
- [Configuration Categories](#configuration-categories)
- [Environment-Specific Setup](#environment-specific-setup)
- [Security Best Practices](#security-best-practices)
- [API Key Management](#api-key-management)
- [Validation and Health Checks](#validation-and-health-checks)
- [Troubleshooting](#troubleshooting)

## Overview

HalluciFix uses a layered configuration system that supports:

- **Environment-specific configuration** (development, staging, production)
- **Secure API key management** with encryption and rotation
- **Runtime validation** of all configuration values
- **Health checks** for all external services
- **Hot-reload** support for development

## Environment Files

### File Hierarchy

Configuration is loaded in the following order (later files override earlier ones):

1. `.env.example` - Template with all available options
2. `.env.development` - Development defaults
3. `.env.staging` - Staging defaults  
4. `.env.production` - Production defaults
5. `.env.local` - Local overrides (gitignored)

### Quick Setup

1. **Minimum Setup** (for basic functionality):
   ```bash
   cp .env.example .env.local
   # Edit .env.local and set:
   # - VITE_SUPABASE_URL
   # - VITE_SUPABASE_ANON_KEY
   ```

2. **Real AI Analysis**:
   ```bash
   # Add to .env.local:
   VITE_OPENAI_API_KEY=sk-your_openai_api_key_here
   VITE_ENABLE_MOCK_SERVICES=false
   ```

3. **Real Authentication**:
   ```bash
   # Add to .env.local:
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

## Configuration Categories

### Application Configuration

```bash
# Basic app settings
VITE_APP_NAME=HalluciFix
VITE_APP_VERSION=1.0.0
VITE_APP_URL=http://localhost:5173
```

### Database Configuration

```bash
# Supabase (Required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Read Replicas (Optional)
VITE_ENABLE_READ_REPLICAS=true
VITE_SUPABASE_READ_REPLICA_1_URL=https://replica1.supabase.co
VITE_SUPABASE_READ_REPLICA_1_KEY=replica1_key
```

### AI Services Configuration

```bash
# OpenAI
VITE_OPENAI_API_KEY=sk-your_openai_api_key
VITE_OPENAI_MODEL=gpt-4
VITE_OPENAI_MAX_TOKENS=4000
VITE_OPENAI_TEMPERATURE=0.1

# Anthropic
VITE_ANTHROPIC_API_KEY=sk-ant-your_anthropic_key
VITE_ANTHROPIC_MODEL=claude-3-sonnet-20240229
VITE_ANTHROPIC_MAX_TOKENS=4000

# HalluciFix API
VITE_HALLUCIFIX_API_KEY=hf_your_api_key
VITE_HALLUCIFIX_API_URL=https://api.hallucifix.com

# Provider Configuration
VITE_PRIMARY_AI_PROVIDER=openai
VITE_AI_FALLBACK_CHAIN=anthropic,hallucifix
```

### Authentication Configuration

```bash
# Google OAuth
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_client_secret
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
GOOGLE_OAUTH_SCOPES=openid email profile https://www.googleapis.com/auth/drive.readonly

# OAuth Security
OAUTH_TOKEN_ENCRYPTION_KEY=your_32_character_encryption_key
OAUTH_STATE_SECRET=your_oauth_state_secret
OAUTH_SESSION_SECRET=your_session_secret

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

### Payment Configuration

```bash
# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Price IDs
STRIPE_PRICE_ID_BASIC_MONTHLY=price_basic_monthly
STRIPE_PRICE_ID_PRO_MONTHLY=price_pro_monthly
```

### Monitoring Configuration

```bash
# Sentry
VITE_SENTRY_DSN=https://your_dsn@sentry.io/project_id
SENTRY_AUTH_TOKEN=your_sentry_auth_token
SENTRY_ENVIRONMENT=production

# Datadog
DATADOG_API_KEY=your_datadog_api_key
DATADOG_SITE=datadoghq.com

# Analytics
VITE_GOOGLE_ANALYTICS_ID=GA_MEASUREMENT_ID
VITE_MIXPANEL_TOKEN=your_mixpanel_token
```

### Feature Flags

```bash
# Core Features
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_PAYMENTS=true
VITE_ENABLE_BETA_FEATURES=false
VITE_ENABLE_MOCK_SERVICES=false

# Infrastructure Features
VITE_ENABLE_READ_REPLICAS=true
ENABLE_LOG_AGGREGATION=true
```

### Logging Configuration

```bash
# Logging Settings
LOG_LEVEL=info
LOG_FORMAT=json
LOG_DESTINATION=external
LOG_RETENTION_DAYS=30
LOG_MAX_SIZE_MB=100
```

## Environment-Specific Setup

### Development Environment

**File**: `.env.development`

**Characteristics**:
- Mock services enabled by default
- Debug logging enabled
- Beta features enabled
- Relaxed security settings

**Required Variables**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Recommended Variables**:
- `VITE_OPENAI_API_KEY` (for real AI testing)
- `VITE_GOOGLE_CLIENT_ID` (for OAuth testing)

### Staging Environment

**File**: `.env.staging`

**Characteristics**:
- Real services enabled
- Production-like configuration
- Enhanced monitoring
- Beta features enabled for testing

**Required Variables**:
- All database credentials
- Service keys for enabled features
- Monitoring configuration

**Security Requirements**:
- JWT secrets
- OAuth encryption keys
- API key validation

### Production Environment

**File**: `.env.production`

**Characteristics**:
- All real services
- Maximum security
- Comprehensive monitoring
- No mock services or beta features

**Required Variables**:
- All service credentials
- Security keys and secrets
- Monitoring and alerting
- Backup and recovery configuration

**Critical Security Requirements**:
- Strong encryption keys (32+ characters)
- Secure JWT secrets
- API key rotation enabled
- Comprehensive audit logging

## Security Best Practices

### API Key Security

1. **Never commit API keys to version control**
2. **Use environment variables or secret management**
3. **Rotate keys regularly**
4. **Use different keys for different environments**
5. **Monitor key usage and set up alerts**

### Encryption

1. **Use strong encryption keys (32+ characters)**
2. **Different keys for different environments**
3. **Regular key rotation**
4. **Secure key storage**

### OAuth Security

1. **Use PKCE for OAuth flows**
2. **Validate state parameters**
3. **Secure token storage**
4. **Automatic token refresh**
5. **Proper session management**

### Database Security

1. **Use service keys only server-side**
2. **Enable Row Level Security (RLS)**
3. **Regular security audits**
4. **Connection encryption**
5. **Access logging**

## API Key Management

### Storing API Keys

```typescript
import { ApiKeyManager } from '../lib/config/keyManagement';

const keyManager = new ApiKeyManager(config);

// Store a new API key
const keyId = await keyManager.storeApiKey(
  'openai',
  'sk-your-api-key',
  'primary',
  {
    rotationSchedule: 'monthly',
    permissions: ['analysis', 'batch-processing']
  }
);
```

### Key Rotation

```typescript
// Rotate an API key
const result = await keyManager.rotateApiKey(
  'openai',
  'sk-new-api-key',
  'primary'
);

if (!result.success) {
  console.error('Key rotation failed:', result.error);
  
  // Rollback if needed
  if (result.rollbackAvailable) {
    await keyManager.rollbackKeyRotation(result.oldKeyId, result.newKeyId);
  }
}
```

### Automated Rotation

```typescript
// Check for keys that need rotation
const keysNeedingRotation = await keyManager.getKeysNeedingRotation();

for (const key of keysNeedingRotation) {
  console.log(`Key ${key.id} needs rotation`);
  // Implement rotation logic
}
```

## Validation and Health Checks

### Configuration Validation

```typescript
import { validateConfiguration } from '../lib/config/validation';

const result = validateConfiguration(config);

if (!result.isValid) {
  console.error('Configuration errors:', result.errors);
  console.warn('Configuration warnings:', result.warnings);
}
```

### Health Checks

```typescript
import { performStartupHealthCheck } from '../lib/config/connectivity';

const healthCheck = await performStartupHealthCheck(config);

console.log('Overall health:', healthCheck.overall);
console.log('Service status:', healthCheck.results);
```

### Startup Validation

```typescript
import { validateConfigurationBeforeInit } from '../lib/config/connectivity';

const validation = await validateConfigurationBeforeInit(config);

if (!validation.canInitialize) {
  console.error('Cannot initialize:', validation.criticalIssues);
  process.exit(1);
}

if (validation.warnings.length > 0) {
  console.warn('Warnings:', validation.warnings);
}
```

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

**Symptoms**: Application fails to start, database errors

**Solutions**:
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Check network connectivity
- Verify Supabase project is active
- Check for IP restrictions

#### 2. API Key Invalid

**Symptoms**: AI analysis fails, authentication errors

**Solutions**:
- Verify API key format
- Check key permissions and quotas
- Ensure key is for correct environment
- Check for key expiration

#### 3. OAuth Configuration Issues

**Symptoms**: Login fails, redirect errors

**Solutions**:
- Verify Google OAuth configuration
- Check redirect URI matches exactly
- Ensure client ID and secret are correct
- Verify OAuth scopes

#### 4. Environment Variable Not Loading

**Symptoms**: Configuration values are undefined

**Solutions**:
- Check file naming (`.env.local` not `.env.local.txt`)
- Verify variable names (case-sensitive)
- Restart development server
- Check for syntax errors in env files

### Debugging Tools

#### Configuration Status

```typescript
import { logConfigurationStatus } from '../lib/config';

// Log current configuration status
logConfigurationStatus();
```

#### Health Check Dashboard

```typescript
import { getConfigurationStatus } from '../lib/config';

const status = getConfigurationStatus();
console.log('Configuration completeness:', status);
```

#### Connectivity Testing

```typescript
import { testProviderAvailability } from '../lib/config/connectivity';

const results = await testProviderAvailability(config, [
  'openai',
  'supabase',
  'google-auth'
]);

results.forEach(result => {
  console.log(`${result.provider}: ${result.status}`);
});
```

### Getting Help

1. **Check the logs** for detailed error messages
2. **Run health checks** to identify specific issues
3. **Validate configuration** to catch common mistakes
4. **Check service status** pages for external providers
5. **Review environment-specific requirements**

## Migration Guide

### From Mock to Real Services

1. **Update feature flags**:
   ```bash
   VITE_ENABLE_MOCK_SERVICES=false
   ```

2. **Add API keys**:
   ```bash
   VITE_OPENAI_API_KEY=your_key
   VITE_GOOGLE_CLIENT_ID=your_client_id
   ```

3. **Run validation**:
   ```bash
   npm run config:validate
   ```

4. **Test connectivity**:
   ```bash
   npm run config:health-check
   ```

### Environment Promotion

1. **Copy configuration template**
2. **Update environment-specific values**
3. **Add production secrets**
4. **Run full validation**
5. **Perform health checks**
6. **Monitor after deployment**

This guide covers the essential aspects of configuring HalluciFix. For specific implementation details, refer to the source code in `src/lib/config/`.