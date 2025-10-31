# Secrets Management System

This directory contains the comprehensive secrets management system for the HalluciFix GitHub repository, implementing secure storage, rotation, and validation of all sensitive credentials.

## 📁 Files Overview

### Configuration Files

- **`repository-secrets.yml`** - Complete inventory and configuration of all repository secrets
- **`secret-naming-conventions.md`** - Naming standards and validation patterns
- **`secret-rotation-procedures.md`** - Detailed rotation procedures and schedules

### Tools and Scripts

- **`secret-validation.js`** - Automated validation and compliance checking tool
- **`README.md`** - This file, providing overview and usage instructions

## 🔐 Secret Categories

### Core Application Secrets
- **Supabase**: Database and authentication services
- **AI Services**: OpenAI and Anthropic API keys
- **Google Services**: OAuth and Drive integration
- **Payment Processing**: Stripe payment and webhook secrets

### Infrastructure Secrets
- **Monitoring**: Sentry, Codecov, and analytics services
- **Notifications**: Slack webhooks and bot tokens
- **CI/CD**: GitHub tokens, Docker credentials, NPM tokens
- **Security**: Scanning tools and audit endpoints

## 🛡️ Security Classifications

| Level | Rotation Frequency | Examples | Requirements |
|-------|-------------------|----------|--------------|
| **Critical** | Monthly | Database admin keys, Service role keys | Multi-person approval, Audit logging |
| **High** | Quarterly | API keys, OAuth secrets | Single approval, Access logging |
| **Medium** | Semi-annually | Bot tokens, Monitoring keys | Self-service, Usage logging |
| **Low** | Annually | Public client IDs, Read-only tokens | Basic logging |

## 🚀 Quick Start

### For Developers

1. **Check secret requirements** for your workflow:
   ```bash
   # View all configured secrets
   cat .github/secrets/repository-secrets.yml
   
   # Validate current setup
   npm run secrets:validate
   ```

2. **Follow naming conventions** when requesting new secrets:
   ```bash
   # Good examples
   OPENAI_API_KEY
   STRIPE_PROD_SECRET_KEY
   GOOGLE_CLIENT_SECRET
   
   # Bad examples
   openai_key
   stripe_sk
   GoogleSecret
   ```

3. **Test secret formats** before requesting:
   ```bash
   npm run secrets:format-check SECRET_NAME "secret_value"
   ```

### For DevOps Engineers

1. **Validate secret configuration**:
   ```bash
   # Run comprehensive validation
   npm run secrets:validate
   
   # Generate rotation compliance report
   npm run secrets:rotation-report
   ```

2. **Monitor rotation compliance**:
   ```bash
   # Check which secrets need rotation
   npm run secrets:rotation-report
   
   # View rotation procedures
   cat .github/secrets/secret-rotation-procedures.md
   ```

3. **Add new secrets**:
   - Update `repository-secrets.yml` with configuration
   - Follow naming conventions and security classifications
   - Set appropriate rotation schedules
   - Run validation to ensure compliance

## 📋 Secret Configuration Format

Each secret in `repository-secrets.yml` includes:

```yaml
SECRET_NAME:
  description: "Human-readable description of the secret's purpose"
  scope: "repository|environment|organization"
  required: true|false
  environment_visibility: "all|backend_only|ci_only"
  format: "Expected format description"
  example: "Example value (sanitized)"
  rotation_schedule: "monthly|quarterly|semi-annually|yearly"
  validation_pattern: "^regex_pattern$"
  usage: ["service1", "service2"]
  security_level: "critical|high|medium|low"
```

### Example Configuration

```yaml
OPENAI_API_KEY:
  description: "OpenAI API key for GPT model access and content analysis"
  scope: "repository"
  required: true
  environment_visibility: "backend_only"
  format: "sk-proj-... or sk-..."
  example: "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890"
  rotation_schedule: "monthly"
  validation_pattern: "^sk-(proj-)?[A-Za-z0-9]{48,}$"
  usage: ["content_analysis", "hallucination_detection"]
  security_level: "high"
```

## 🔄 Rotation Management

### Automated Rotation Schedules

| Schedule | Frequency | Lead Time | Grace Period |
|----------|-----------|-----------|--------------|
| Monthly | 30 days | 14 days | 7 days |
| Quarterly | 90 days | 21 days | 14 days |
| Semi-annually | 180 days | 30 days | 30 days |
| Yearly | 365 days | 45 days | 60 days |

### Rotation Process

1. **Pre-rotation validation**
2. **Generate new secret at service provider**
3. **Test new secret in staging environment**
4. **Update GitHub repository secrets**
5. **Validate service connectivity**
6. **Revoke old secret after grace period**
7. **Update documentation and logs**

### Emergency Rotation

For suspected compromises:

```bash
# Emergency rotation procedure
.github/secrets/emergency-rotation.sh SECRET_NAME "compromise_reason"

# This will:
# 1. Immediately revoke the compromised secret
# 2. Generate and deploy temporary secret
# 3. Alert security team
# 4. Create incident ticket
# 5. Schedule proper rotation
```

## 🔍 Validation and Monitoring

### Automated Validation

Run comprehensive validation checks:

```bash
# Validate all aspects
npm run secrets:validate

# Focus on specific areas
npm run secrets:validate-naming
npm run secrets:validate-format

# Generate compliance report
npm run secrets:rotation-report
```

### Validation Checks

- **Naming Conventions**: SCREAMING_SNAKE_CASE, proper prefixes/suffixes
- **Format Validation**: Regex patterns for each secret type
- **Rotation Compliance**: Age vs. required rotation schedule
- **Security Classification**: Appropriate security levels
- **Inventory Management**: Required secrets present, undocumented secrets flagged

### Monitoring Integration

- **Slack Notifications**: Rotation reminders and compliance alerts
- **GitHub Issues**: Automated creation for overdue rotations
- **Audit Logging**: All secret operations logged for compliance
- **Dashboard Metrics**: Real-time compliance and security status

## 📊 Compliance and Reporting

### Audit Requirements

All secret operations maintain:
- **Who**: User or system performing the operation
- **What**: Type of operation (create, read, update, delete)
- **When**: Timestamp with timezone
- **Where**: Source IP and system identifier
- **Why**: Business justification or trigger

### Retention Policies

| Data Type | Retention | Storage | Access |
|-----------|-----------|---------|--------|
| Access Logs | 90 days | Secure log storage | Security team |
| Audit Trails | 2 years | Compliance archive | Audit team |
| Rotation History | 1 year | Secret management system | Admin |
| Incident Records | 5 years | Security incident system | Security leadership |

### Compliance Reports

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

## 🛠️ Tools and Automation

### Command Line Tools

```bash
# Secret validation and management
npm run secrets:validate              # Full validation
npm run secrets:rotation-report       # Compliance report
npm run secrets:format-check         # Test secret format
npm run secrets:help                 # Show help

# GitHub repository protection
npm run github:validate-protection   # Validate branch protection
npm run github:setup-guide          # Setup instructions
```

### GitHub CLI Integration

```bash
# List all repository secrets
gh secret list

# Set a new secret
gh secret set SECRET_NAME --body "secret_value"

# Delete a secret
gh secret delete SECRET_NAME

# Set environment-specific secret
gh secret set SECRET_NAME --env production --body "secret_value"
```

### Automation Scripts

Located in `.github/secrets/`:
- **Rotation schedulers**: Automated rotation based on schedules
- **Validation hooks**: Pre-commit and CI validation
- **Monitoring alerts**: Compliance and security notifications
- **Emergency procedures**: Rapid response for compromises

## 🚨 Emergency Procedures

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

1. **Identify Impact**: Determine affected secrets and dependencies
2. **Implement Workarounds**: Use backup secrets or manual processes
3. **Restore Service**: Update secrets as service recovers

## 📚 Best Practices

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

## 📞 Support and Contacts

### Team Contacts
- **Security Team**: security@hallucifix.com
- **DevOps Team**: devops@hallucifix.com
- **Compliance Team**: compliance@hallucifix.com

### Emergency Contacts
- **Security Emergency**: security-emergency@hallucifix.com
- **On-call DevOps**: +1-555-DEVOPS (24/7)
- **Incident Commander**: incident-commander@hallucifix.com

### Resources
- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Secret Management Best Practices](https://owasp.org/www-project-secrets-management-cheat-sheet/)
- [Compliance Requirements](https://hallucifix.com/security/compliance)

## 📝 Maintenance

### Regular Tasks
- **Daily**: Monitor rotation compliance alerts
- **Weekly**: Review access logs for anomalies
- **Monthly**: Generate and review compliance reports
- **Quarterly**: Update security classifications and procedures

### Updates and Changes
- All changes to secret configurations require security team review
- Rotation procedures updated based on incident learnings
- Validation patterns updated as services evolve
- Documentation maintained with current practices

---

**Document Version**: 1.0  
**Last Updated**: $(date)  
**Next Review**: Monthly  
**Owner**: DevOps Team  
**Approvers**: Security Team, Compliance Team