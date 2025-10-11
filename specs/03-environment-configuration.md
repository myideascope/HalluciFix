# Spec: Set Up Proper Environment Variables Configuration

**Priority:** Critical (P1)  
**Estimated Effort:** 3-5 days  
**Dependencies:** Service provider accounts, security review

## Overview

Establish a comprehensive environment variable configuration system to support development, staging, and production environments with proper security, validation, and management.

## Current State

- Basic `.env.local` with some Supabase configuration
- Missing critical API keys (OpenAI, Google OAuth)
- No environment-specific configurations
- Placeholder values for Stripe and other services
- No validation or type safety for environment variables

## Requirements

### 1. Environment Variable Structure

**Acceptance Criteria:**
- [ ] Separate configurations for dev/staging/production
- [ ] Type-safe environment variable access
- [ ] Runtime validation of required variables
- [ ] Secure handling of sensitive credentials
- [ ] Clear documentation for all variables

**Technical Details:**
- Create environment-specific `.env` files
- Implement TypeScript interfaces for env vars
- Add runtime validation using Zod or similar
- Document all variables with examples

### 2. Service Configuration

**Acceptance Criteria:**
- [ ] Complete Supabase configuration
- [ ] OpenAI API integration setup
- [ ] Google OAuth credentials
- [ ] Stripe payment configuration
- [ ] Monitoring and logging service keys

**Technical Details:**
- Set up all required service accounts
- Generate and configure API keys
- Implement proper key rotation strategy
- Add service health check endpoints

### 3. Security Implementation

**Acceptance Criteria:**
- [ ] Secure storage of production secrets
- [ ] Environment variable encryption
- [ ] Access control for sensitive variables
- [ ] Audit logging for configuration changes
- [ ] Secrets rotation procedures

**Technical Details:**
- Use secure secret management (AWS Secrets Manager, etc.)
- Implement environment variable validation
- Add encryption for sensitive local storage
- Set up proper CI/CD secret handling

### 4. Development Experience

**Acceptance Criteria:**
- [ ] Easy local development setup
- [ ] Clear error messages for missing variables
- [ ] Hot reload support for configuration changes
- [ ] Development vs production feature flags
- [ ] Comprehensive setup documentation

**Technical Details:**
- Create setup scripts for new developers
- Implement helpful error messages
- Add configuration validation on startup
- Support for feature flags and toggles

## Implementation Plan

### Phase 1: Environment Structure (Day 1)
1. Create environment-specific configuration files
2. Set up TypeScript interfaces for type safety
3. Implement runtime validation
4. Create configuration loading utilities

### Phase 2: Service Integration (Days 2-3)
1. Set up all required service accounts
2. Generate and configure API keys
3. Test service connections
4. Implement health checks

### Phase 3: Security Implementation (Day 4)
1. Implement secure secret storage
2. Add environment variable encryption
3. Set up access controls
4. Implement audit logging

### Phase 4: Documentation & Testing (Day 5)
1. Create comprehensive setup documentation
2. Write configuration tests
3. Test deployment scenarios
4. Create troubleshooting guides

## Environment Variable Schema

### Core Application
```env
# Application Configuration
NODE_ENV=development|staging|production
VITE_APP_NAME=HalluciFix
VITE_APP_VERSION=1.0.0
VITE_APP_URL=http://localhost:5173
VITE_API_BASE_URL=http://localhost:3000/api

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_PAYMENTS=false
VITE_ENABLE_BETA_FEATURES=false
```

### Database & Backend
```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_PROJECT_ID=your-project-id

# Database Configuration
DATABASE_URL=postgresql://...
DATABASE_POOL_SIZE=10
DATABASE_TIMEOUT=30000
```

### AI & Analysis Services
```env
# OpenAI Configuration
VITE_OPENAI_API_KEY=sk-...
VITE_OPENAI_MODEL=gpt-4
VITE_OPENAI_MAX_TOKENS=4000
VITE_OPENAI_TEMPERATURE=0.1

# HalluciFix API
VITE_HALLUCIFIX_API_KEY=hf_...
VITE_HALLUCIFIX_API_URL=https://api.hallucifix.com
```

### Authentication & OAuth
```env
# Google OAuth
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback

# JWT Configuration
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

### Payment Processing
```env
# Stripe Configuration
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_BASIC=price_...
STRIPE_PRICE_ID_PRO=price_...
```

### Monitoring & Logging
```env
# Sentry Error Tracking
VITE_SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...

# Analytics
VITE_GOOGLE_ANALYTICS_ID=GA_MEASUREMENT_ID
VITE_MIXPANEL_TOKEN=...

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

## TypeScript Configuration

### Environment Types
```typescript
// src/types/env.ts
interface EnvironmentVariables {
  // Application
  NODE_ENV: 'development' | 'staging' | 'production';
  VITE_APP_NAME: string;
  VITE_APP_VERSION: string;
  VITE_APP_URL: string;
  
  // Supabase
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  
  // OpenAI
  VITE_OPENAI_API_KEY?: string;
  VITE_OPENAI_MODEL: string;
  
  // Google OAuth
  VITE_GOOGLE_CLIENT_ID: string;
  
  // Feature Flags
  VITE_ENABLE_ANALYTICS: boolean;
  VITE_ENABLE_PAYMENTS: boolean;
}
```

### Validation Schema
```typescript
// src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_OPENAI_API_KEY: z.string().optional(),
  VITE_GOOGLE_CLIENT_ID: z.string().min(1),
  // ... other validations
});

export const env = envSchema.parse(import.meta.env);
```

## Security Best Practices

### Local Development
- Use `.env.local` for local overrides
- Never commit sensitive keys to version control
- Use placeholder values in `.env.example`
- Implement key validation on startup

### Production Deployment
- Use secure secret management services
- Implement key rotation procedures
- Add environment variable encryption
- Monitor for exposed credentials

### Access Control
```typescript
// Different access levels for different environments
const getEnvironmentConfig = () => {
  switch (process.env.NODE_ENV) {
    case 'development':
      return developmentConfig;
    case 'staging':
      return stagingConfig;
    case 'production':
      return productionConfig;
    default:
      throw new Error('Invalid NODE_ENV');
  }
};
```

## File Structure

```
├── .env.example                 # Template with all variables
├── .env.local                   # Local development overrides
├── .env.development            # Development defaults
├── .env.staging                # Staging configuration
├── .env.production             # Production configuration
├── src/
│   ├── lib/
│   │   ├── env.ts              # Environment validation
│   │   └── config.ts           # Configuration utilities
│   └── types/
│       └── env.ts              # Environment types
└── scripts/
    ├── setup-env.sh            # Environment setup script
    └── validate-env.js         # Validation script
```

## Validation & Error Handling

### Startup Validation
```typescript
// src/lib/env.ts
export function validateEnvironment(): void {
  const requiredVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_GOOGLE_CLIENT_ID'
  ];
  
  const missing = requiredVars.filter(
    varName => !import.meta.env[varName]
  );
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}
```

### Runtime Checks
```typescript
// src/lib/config.ts
export const config = {
  get openaiApiKey() {
    const key = import.meta.env.VITE_OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API key not configured');
    }
    return key;
  },
  
  get isProduction() {
    return import.meta.env.NODE_ENV === 'production';
  }
};
```

## Testing Strategy

### Configuration Tests
- [ ] Test environment variable validation
- [ ] Test configuration loading in different environments
- [ ] Test error handling for missing variables
- [ ] Test type safety and runtime validation

### Integration Tests
- [ ] Test service connections with real credentials
- [ ] Test feature flag functionality
- [ ] Test environment-specific behavior
- [ ] Test secret rotation procedures

## Documentation Requirements

### Setup Guide
```markdown
# Environment Setup Guide

## Quick Start
1. Copy `.env.example` to `.env.local`
2. Fill in required values
3. Run `npm run setup-env` to validate
4. Start development server

## Required Services
- Supabase account and project
- OpenAI API key (optional for development)
- Google Cloud Console OAuth setup
- Stripe account (for payment features)
```

### Troubleshooting
- Common configuration errors
- Service connection issues
- Environment variable precedence
- Debugging configuration problems

## Success Metrics

- [ ] 100% of required variables documented
- [ ] Zero configuration-related deployment failures
- [ ] Setup time for new developers < 15 minutes
- [ ] All services properly configured and tested
- [ ] Security audit passes for credential handling

## Rollback Plan

- Maintain current `.env.local` as backup
- Version control for configuration changes
- Rollback scripts for service configurations
- Emergency access procedures for locked accounts