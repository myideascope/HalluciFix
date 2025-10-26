# Secret Naming Conventions and Standards

## Overview

This document defines the naming conventions, validation patterns, and management standards for all secrets used in the HalluciFix GitHub repository and workflows.

## Naming Conventions

### General Rules

1. **Use SCREAMING_SNAKE_CASE** for all secret names
2. **Use descriptive prefixes** to categorize secrets by service or purpose
3. **Include environment indicators** when secrets are environment-specific
4. **Avoid abbreviations** unless they are widely understood (API, URL, etc.)
5. **Maximum length**: 100 characters
6. **Minimum length**: 5 characters

### Prefix Categories

#### Service Prefixes
- `SUPABASE_` - Supabase database and authentication services
- `OPENAI_` - OpenAI API and GPT services
- `ANTHROPIC_` - Anthropic Claude API services
- `GOOGLE_` - Google services (OAuth, Drive, etc.)
- `STRIPE_` - Stripe payment processing
- `SLACK_` - Slack integration and notifications
- `SENTRY_` - Sentry error tracking and monitoring
- `GITHUB_` - GitHub API and repository operations
- `DOCKER_` - Docker registry and container operations
- `NPM_` - NPM package registry operations

#### Type Suffixes
- `_API_KEY` - API authentication keys
- `_SECRET_KEY` - Secret keys for encryption/signing
- `_CLIENT_ID` - OAuth client identifiers
- `_CLIENT_SECRET` - OAuth client secrets
- `_WEBHOOK_URL` - Webhook endpoint URLs
- `_WEBHOOK_SECRET` - Webhook verification secrets
- `_TOKEN` - Authentication tokens
- `_URL` - Service endpoint URLs
- `_DSN` - Data Source Names

#### Environment Indicators
- `_DEV_` - Development environment specific
- `_STAGING_` - Staging environment specific
- `_PROD_` - Production environment specific
- No indicator = shared across environments

### Examples

#### ✅ Good Examples
```
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
STRIPE_PROD_SECRET_KEY
GOOGLE_CLIENT_SECRET
SLACK_WEBHOOK_URL
SENTRY_DSN
GITHUB_TOKEN
```

#### ❌ Bad Examples
```
supabase_key          # Wrong case
OPENAI_KEY           # Missing type suffix
STRIPE_SK            # Unclear abbreviation
GoogleClientSecret   # Wrong case, no underscores
slack-webhook        # Wrong case, uses hyphens
API_KEY              # Too generic, no service prefix
```

## Validation Patterns

### Format Validation Rules

Each secret type must conform to specific format validation patterns:

#### API Keys
```regex
# OpenAI API Keys
^sk-(proj-)?[A-Za-z0-9]{48,}$

# Anthropic API Keys
^sk-ant-[A-Za-z0-9-]{40,}$

# Generic API Keys (fallback)
^[A-Za-z0-9_-]{20,}$
```

#### OAuth Credentials
```regex
# Google Client ID
^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$

# Google Client Secret
^GOCSPX-[A-Za-z0-9_-]{28}$
```

#### Stripe Keys
```regex
# Stripe Secret Keys
^sk_(test|live)_[A-Za-z0-9]{99}$

# Stripe Publishable Keys
^pk_(test|live)_[A-Za-z0-9]{99}$

# Stripe Webhook Secrets
^whsec_[A-Za-z0-9]{32,}$
```

#### URLs and Endpoints
```regex
# HTTPS URLs
^https://[^/]+(/.*)?$

# Supabase URLs
^https://[a-z0-9]{20}\.supabase\.co$

# Slack Webhook URLs
^https://hooks\.slack\.com/services/[A-Z0-9]{9}/[A-Z0-9]{9}/[A-Za-z0-9]{24}$
```

#### Tokens
```regex
# GitHub Tokens
^(ghp_|github_pat_)[A-Za-z0-9]{36,}$

# JWT Tokens
^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$

# Slack Bot Tokens
^xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]{24}$
```

## Security Classifications

### Security Levels

#### Critical (Level 4)
- Database connection strings with admin access
- Service role keys with full permissions
- Payment processing secrets
- Production environment secrets

**Requirements:**
- Monthly rotation mandatory
- Multi-person approval for changes
- Audit logging required
- Encrypted storage with additional layer

#### High (Level 3)
- API keys for external services
- OAuth client secrets
- Webhook secrets
- GitHub tokens with write access

**Requirements:**
- Quarterly rotation recommended
- Single approval for changes
- Access logging required
- Standard encrypted storage

#### Medium (Level 2)
- Bot tokens with limited scope
- Monitoring service tokens
- CI/CD specific tokens

**Requirements:**
- Semi-annual rotation recommended
- Self-service changes allowed
- Usage logging recommended

#### Low (Level 1)
- Public client IDs
- Non-sensitive configuration URLs
- Read-only tokens

**Requirements:**
- Annual rotation sufficient
- No special approval required
- Basic logging sufficient

## Rotation Schedules

### Mandatory Rotation Frequencies

| Security Level | Rotation Frequency | Grace Period | Notification Lead Time |
|---------------|-------------------|--------------|----------------------|
| Critical      | Monthly           | 7 days       | 14 days              |
| High          | Quarterly         | 14 days      | 21 days              |
| Medium        | Semi-annually     | 30 days      | 30 days              |
| Low           | Annually          | 60 days      | 45 days              |

### Rotation Triggers

#### Automatic Triggers
- Scheduled rotation based on security level
- Security incident involving the secret
- Employee departure with secret access
- Service provider security advisory

#### Manual Triggers
- Suspected compromise
- Compliance audit requirement
- Service migration or upgrade
- Security policy update

## Secret Lifecycle Management

### Creation Process

1. **Request Approval**
   - Submit secret request with justification
   - Security team review for critical/high secrets
   - Approval from service owner

2. **Generate Secret**
   - Use service provider's secure generation
   - Follow format validation requirements
   - Document purpose and usage

3. **Store Securely**
   - Add to GitHub repository secrets
   - Configure appropriate environment scope
   - Set rotation schedule and notifications

4. **Document Usage**
   - Update secret inventory
   - Add to workflow documentation
   - Configure monitoring and alerts

### Update Process

1. **Pre-Update Validation**
   - Verify new secret format
   - Test in non-production environment
   - Prepare rollback plan

2. **Update Execution**
   - Update GitHub secret value
   - Trigger dependent workflow updates
   - Verify service connectivity

3. **Post-Update Verification**
   - Test all dependent services
   - Monitor for errors or failures
   - Update documentation

### Retirement Process

1. **Usage Analysis**
   - Identify all workflows using the secret
   - Plan migration or removal strategy
   - Coordinate with dependent teams

2. **Gradual Removal**
   - Remove from non-critical workflows first
   - Update documentation
   - Monitor for unexpected usage

3. **Final Cleanup**
   - Remove from GitHub secrets
   - Revoke at service provider
   - Update inventory and documentation

## Validation and Monitoring

### Automated Validation

#### Format Validation
```yaml
secret_validation:
  format_check:
    enabled: true
    patterns: "defined_in_repository_secrets.yml"
    fail_on_invalid: true
  
  naming_convention:
    enabled: true
    case_check: "SCREAMING_SNAKE_CASE"
    prefix_validation: true
    length_limits: [5, 100]
```

#### Usage Monitoring
```yaml
usage_monitoring:
  access_logging:
    enabled: true
    log_level: "INFO"
    retention_days: 90
  
  anomaly_detection:
    enabled: true
    unusual_access_patterns: true
    geographic_anomalies: true
    time_based_anomalies: true
```

### Manual Auditing

#### Monthly Reviews
- Secret usage patterns analysis
- Access log review for anomalies
- Rotation compliance verification
- Security incident correlation

#### Quarterly Assessments
- Complete secret inventory audit
- Security classification review
- Rotation schedule optimization
- Compliance gap analysis

## Compliance Requirements

### Audit Trail

All secret operations must maintain:
- **Who**: User or system performing the operation
- **What**: Type of operation (create, read, update, delete)
- **When**: Timestamp with timezone
- **Where**: Source IP and system identifier
- **Why**: Business justification or trigger

### Retention Policies

| Data Type | Retention Period | Storage Location | Access Controls |
|-----------|-----------------|------------------|-----------------|
| Access Logs | 90 days | Secure log storage | Security team only |
| Audit Trails | 2 years | Compliance archive | Audit team access |
| Rotation History | 1 year | Secret management system | Admin access |
| Incident Records | 5 years | Security incident system | Security leadership |

### Compliance Reporting

#### Monthly Reports
- Secret rotation compliance status
- Security incidents involving secrets
- Access anomalies and investigations
- New secrets added or removed

#### Quarterly Reports
- Complete secret inventory
- Security classification changes
- Compliance gap analysis
- Risk assessment updates

## Emergency Procedures

### Suspected Compromise

1. **Immediate Actions** (0-15 minutes)
   - Disable the compromised secret
   - Alert security team
   - Document incident details

2. **Assessment** (15-60 minutes)
   - Determine scope of compromise
   - Identify affected systems
   - Assess potential impact

3. **Containment** (1-4 hours)
   - Rotate all potentially affected secrets
   - Update dependent systems
   - Monitor for unauthorized access

4. **Recovery** (4-24 hours)
   - Verify system integrity
   - Restore normal operations
   - Conduct post-incident review

### Service Outage

1. **Identify Impact**
   - Determine which secrets are affected
   - Assess service dependencies
   - Prioritize critical systems

2. **Implement Workarounds**
   - Use backup secrets if available
   - Implement manual processes
   - Communicate status to stakeholders

3. **Restore Service**
   - Update secrets as service recovers
   - Verify connectivity and functionality
   - Resume automated processes

## Tools and Automation

### Secret Management Tools

#### GitHub Secrets CLI
```bash
# List all repository secrets
gh secret list

# Set a new secret
gh secret set SECRET_NAME --body "secret_value"

# Delete a secret
gh secret delete SECRET_NAME
```

#### Validation Scripts
```bash
# Validate secret naming conventions
npm run secrets:validate-naming

# Check secret format compliance
npm run secrets:validate-format

# Generate secret rotation report
npm run secrets:rotation-report
```

### Monitoring Integration

#### Slack Notifications
- Secret rotation reminders
- Validation failures
- Security incidents
- Compliance reports

#### Dashboard Metrics
- Secret inventory status
- Rotation compliance rates
- Security incident trends
- Access pattern analysis

## Best Practices Summary

### Do's ✅
- Use descriptive, standardized naming conventions
- Implement regular rotation schedules
- Monitor secret usage patterns
- Maintain comprehensive audit trails
- Use appropriate security classifications
- Validate secret formats automatically
- Document all secret purposes and dependencies

### Don'ts ❌
- Store secrets in code or configuration files
- Use generic or ambiguous secret names
- Share secrets across multiple services unnecessarily
- Ignore rotation schedules or compliance requirements
- Grant excessive permissions to secret access
- Skip validation or monitoring procedures
- Leave unused secrets in the system

### Security Reminders
- Secrets are only as secure as their weakest access point
- Regular rotation reduces the impact of potential compromises
- Monitoring and alerting enable rapid incident response
- Documentation and standards ensure consistent security practices
- Automation reduces human error and improves compliance

---

**Document Version**: 1.0  
**Last Updated**: $(date)  
**Next Review**: Quarterly  
**Owner**: Security Team  
**Approvers**: DevOps Team, Compliance Team