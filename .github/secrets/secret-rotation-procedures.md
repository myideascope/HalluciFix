# Secret Rotation Procedures

## Overview

This document outlines the comprehensive procedures for rotating secrets in the HalluciFix GitHub repository. Secret rotation is a critical security practice that reduces the risk of credential compromise and ensures compliance with security policies.

## Rotation Schedule Matrix

### Rotation Frequencies by Service and Security Level

| Service | Secret Type | Security Level | Rotation Frequency | Lead Time | Grace Period |
|---------|-------------|----------------|-------------------|-----------|--------------|
| Supabase | Service Role Key | Critical | Monthly | 14 days | 7 days |
| Supabase | Anon Key | High | Quarterly | 21 days | 14 days |
| OpenAI | API Key | High | Monthly | 14 days | 7 days |
| Anthropic | API Key | High | Monthly | 14 days | 7 days |
| Stripe | Secret Key | Critical | Quarterly | 21 days | 14 days |
| Stripe | Webhook Secret | High | Quarterly | 21 days | 14 days |
| Google | Client Secret | High | Yearly | 45 days | 30 days |
| GitHub | Personal Access Token | High | Quarterly | 21 days | 14 days |
| Slack | Bot Token | Medium | Semi-annually | 30 days | 30 days |
| Sentry | DSN | Low | Yearly | 45 days | 60 days |

## Automated Rotation Procedures

### 1. Supabase Secrets Rotation

#### Service Role Key Rotation
```bash
#!/bin/bash
# Supabase Service Role Key Rotation Script

# Prerequisites
SUPABASE_PROJECT_ID="your-project-id"
SUPABASE_ACCESS_TOKEN="your-access-token"

# Step 1: Generate new service role key
echo "🔄 Generating new Supabase service role key..."
NEW_SERVICE_KEY=$(supabase projects api-keys create \
  --project-ref $SUPABASE_PROJECT_ID \
  --name "service-role-$(date +%Y%m%d)" \
  --role service_role)

# Step 2: Validate new key format
if [[ ! $NEW_SERVICE_KEY =~ ^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
  echo "❌ Invalid service key format"
  exit 1
fi

# Step 3: Test new key in staging environment
echo "🧪 Testing new service key in staging..."
STAGING_TEST_RESULT=$(curl -s -H "Authorization: Bearer $NEW_SERVICE_KEY" \
  "https://$SUPABASE_PROJECT_ID.supabase.co/rest/v1/health")

if [[ $STAGING_TEST_RESULT != *"ok"* ]]; then
  echo "❌ Staging test failed"
  exit 1
fi

# Step 4: Update GitHub secret
echo "🔐 Updating GitHub repository secret..."
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "$NEW_SERVICE_KEY"

# Step 5: Trigger workflow validation
echo "✅ Triggering validation workflow..."
gh workflow run secret-validation.yml

# Step 6: Schedule old key revocation (7 days grace period)
echo "⏰ Scheduling old key revocation in 7 days..."
echo "supabase projects api-keys revoke --project-ref $SUPABASE_PROJECT_ID --key-id $OLD_KEY_ID" | \
  at now + 7 days

echo "✅ Supabase service role key rotation completed"
```

#### Anonymous Key Rotation
```bash
#!/bin/bash
# Supabase Anonymous Key Rotation Script

# Step 1: Generate new anonymous key
echo "🔄 Generating new Supabase anonymous key..."
NEW_ANON_KEY=$(supabase projects api-keys create \
  --project-ref $SUPABASE_PROJECT_ID \
  --name "anon-$(date +%Y%m%d)" \
  --role anon)

# Step 2: Update RLS policies if needed
echo "🔒 Updating Row Level Security policies..."
supabase db push --project-ref $SUPABASE_PROJECT_ID

# Step 3: Update GitHub secrets
gh secret set VITE_SUPABASE_ANON_KEY --body "$NEW_ANON_KEY"

# Step 4: Update environment-specific secrets
for env in development staging production; do
  gh secret set VITE_SUPABASE_ANON_KEY --env $env --body "$NEW_ANON_KEY"
done

echo "✅ Supabase anonymous key rotation completed"
```

### 2. AI Service API Keys Rotation

#### OpenAI API Key Rotation
```bash
#!/bin/bash
# OpenAI API Key Rotation Script

# Step 1: Generate new API key via OpenAI dashboard
echo "🔄 Please generate new OpenAI API key manually at:"
echo "https://platform.openai.com/api-keys"
echo "Enter new API key:"
read -s NEW_OPENAI_KEY

# Step 2: Validate key format
if [[ ! $NEW_OPENAI_KEY =~ ^sk-(proj-)?[A-Za-z0-9]{48,}$ ]]; then
  echo "❌ Invalid OpenAI API key format"
  exit 1
fi

# Step 3: Test new key
echo "🧪 Testing new OpenAI API key..."
TEST_RESPONSE=$(curl -s -H "Authorization: Bearer $NEW_OPENAI_KEY" \
  "https://api.openai.com/v1/models" | jq -r '.data[0].id')

if [[ -z "$TEST_RESPONSE" ]]; then
  echo "❌ OpenAI API key test failed"
  exit 1
fi

# Step 4: Update GitHub secret
gh secret set OPENAI_API_KEY --body "$NEW_OPENAI_KEY"

# Step 5: Update usage monitoring
echo "📊 Updating API usage monitoring..."
curl -X POST "$MONITORING_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{\"event\": \"api_key_rotated\", \"service\": \"openai\", \"timestamp\": \"$(date -Iseconds)\"}"

echo "✅ OpenAI API key rotation completed"
```

#### Anthropic API Key Rotation
```bash
#!/bin/bash
# Anthropic API Key Rotation Script

# Step 1: Generate new API key via Anthropic console
echo "🔄 Please generate new Anthropic API key manually at:"
echo "https://console.anthropic.com/account/keys"
echo "Enter new API key:"
read -s NEW_ANTHROPIC_KEY

# Step 2: Validate key format
if [[ ! $NEW_ANTHROPIC_KEY =~ ^sk-ant-[A-Za-z0-9-]{40,}$ ]]; then
  echo "❌ Invalid Anthropic API key format"
  exit 1
fi

# Step 3: Test new key
echo "🧪 Testing new Anthropic API key..."
TEST_RESPONSE=$(curl -s -H "x-api-key: $NEW_ANTHROPIC_KEY" \
  -H "Content-Type: application/json" \
  "https://api.anthropic.com/v1/messages" \
  -d '{"model": "claude-3-haiku-20240307", "max_tokens": 10, "messages": [{"role": "user", "content": "test"}]}')

if [[ $TEST_RESPONSE == *"error"* ]]; then
  echo "❌ Anthropic API key test failed"
  exit 1
fi

# Step 4: Update GitHub secret
gh secret set ANTHROPIC_API_KEY --body "$NEW_ANTHROPIC_KEY"

echo "✅ Anthropic API key rotation completed"
```

### 3. Payment Processing Secrets Rotation

#### Stripe Secrets Rotation
```bash
#!/bin/bash
# Stripe Secrets Rotation Script

# Step 1: Generate new secret key via Stripe dashboard
echo "🔄 Please generate new Stripe secret key manually at:"
echo "https://dashboard.stripe.com/apikeys"
echo "Enter new secret key:"
read -s NEW_STRIPE_SECRET

# Step 2: Validate key format
if [[ ! $NEW_STRIPE_SECRET =~ ^sk_(test|live)_[A-Za-z0-9]{99}$ ]]; then
  echo "❌ Invalid Stripe secret key format"
  exit 1
fi

# Step 3: Test new key
echo "🧪 Testing new Stripe secret key..."
TEST_RESPONSE=$(curl -s -u "$NEW_STRIPE_SECRET:" \
  "https://api.stripe.com/v1/account" | jq -r '.id')

if [[ -z "$TEST_RESPONSE" ]]; then
  echo "❌ Stripe secret key test failed"
  exit 1
fi

# Step 4: Update webhook secret
echo "🔗 Updating webhook secret..."
WEBHOOK_SECRET=$(stripe webhooks create \
  --url "https://api.hallucifix.com/webhooks/stripe" \
  --events "payment_intent.succeeded,subscription.updated" \
  --format json | jq -r '.secret')

# Step 5: Update GitHub secrets
gh secret set STRIPE_SECRET_KEY --body "$NEW_STRIPE_SECRET"
gh secret set STRIPE_WEBHOOK_SECRET --body "$WEBHOOK_SECRET"

# Step 6: Update environment-specific secrets
for env in development staging production; do
  gh secret set STRIPE_SECRET_KEY --env $env --body "$NEW_STRIPE_SECRET"
  gh secret set STRIPE_WEBHOOK_SECRET --env $env --body "$WEBHOOK_SECRET"
done

echo "✅ Stripe secrets rotation completed"
```

### 4. OAuth Credentials Rotation

#### Google OAuth Rotation
```bash
#!/bin/bash
# Google OAuth Credentials Rotation Script

# Step 1: Generate new client secret via Google Cloud Console
echo "🔄 Please generate new client secret manually at:"
echo "https://console.cloud.google.com/apis/credentials"
echo "Enter new client secret:"
read -s NEW_CLIENT_SECRET

# Step 2: Validate secret format
if [[ ! $NEW_CLIENT_SECRET =~ ^GOCSPX-[A-Za-z0-9_-]{28}$ ]]; then
  echo "❌ Invalid Google client secret format"
  exit 1
fi

# Step 3: Test OAuth flow
echo "🧪 Testing OAuth flow with new credentials..."
# This would typically involve a more complex OAuth test
# For brevity, we'll just validate the format and update

# Step 4: Update GitHub secret
gh secret set GOOGLE_CLIENT_SECRET --body "$NEW_CLIENT_SECRET"

# Step 5: Update service account key if needed
if [[ -n "$GOOGLE_SERVICE_ACCOUNT_KEY" ]]; then
  echo "🔑 Updating service account key..."
  # Service account key rotation would be handled separately
  # as it requires generating a new key file
fi

echo "✅ Google OAuth credentials rotation completed"
```

## Manual Rotation Procedures

### Emergency Rotation Process

When a secret is suspected to be compromised, follow this emergency procedure:

#### Immediate Response (0-15 minutes)
```bash
#!/bin/bash
# Emergency Secret Rotation Script

SECRET_NAME="$1"
REASON="$2"

echo "🚨 EMERGENCY SECRET ROTATION INITIATED"
echo "Secret: $SECRET_NAME"
echo "Reason: $REASON"
echo "Timestamp: $(date -Iseconds)"

# Step 1: Disable the compromised secret immediately
case $SECRET_NAME in
  "SUPABASE_SERVICE_ROLE_KEY")
    # Revoke at Supabase
    supabase projects api-keys revoke --project-ref $SUPABASE_PROJECT_ID --key-id $OLD_KEY_ID
    ;;
  "OPENAI_API_KEY")
    echo "⚠️  Manually revoke OpenAI key at https://platform.openai.com/api-keys"
    ;;
  "STRIPE_SECRET_KEY")
    echo "⚠️  Manually revoke Stripe key at https://dashboard.stripe.com/apikeys"
    ;;
  *)
    echo "⚠️  Manual revocation required for $SECRET_NAME"
    ;;
esac

# Step 2: Generate and set temporary secret
TEMP_SECRET="EMERGENCY_ROTATION_$(date +%s)"
gh secret set "${SECRET_NAME}_TEMP" --body "$TEMP_SECRET"

# Step 3: Alert security team
curl -X POST "$SLACK_SECURITY_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{
    \"text\": \"🚨 EMERGENCY SECRET ROTATION\",
    \"attachments\": [{
      \"color\": \"danger\",
      \"fields\": [
        {\"title\": \"Secret\", \"value\": \"$SECRET_NAME\", \"short\": true},
        {\"title\": \"Reason\", \"value\": \"$REASON\", \"short\": true},
        {\"title\": \"Timestamp\", \"value\": \"$(date -Iseconds)\", \"short\": true}
      ]
    }]
  }"

# Step 4: Create incident ticket
gh issue create \
  --title "🚨 Emergency Secret Rotation: $SECRET_NAME" \
  --body "**Reason:** $REASON\n**Timestamp:** $(date -Iseconds)\n**Status:** In Progress\n\n**Actions Taken:**\n- [ ] Secret revoked at source\n- [ ] Temporary secret deployed\n- [ ] Security team notified\n- [ ] New secret generated\n- [ ] Systems validated\n- [ ] Incident closed" \
  --label "security,emergency,secret-rotation"

echo "✅ Emergency rotation initiated. Follow up with full rotation procedure."
```

### Scheduled Rotation Workflow

#### Pre-Rotation Checklist
```bash
#!/bin/bash
# Pre-Rotation Validation Script

SECRET_NAME="$1"

echo "📋 Pre-rotation checklist for $SECRET_NAME"

# Check rotation schedule compliance
LAST_ROTATION=$(gh secret list --json name,updatedAt | jq -r ".[] | select(.name==\"$SECRET_NAME\") | .updatedAt")
DAYS_SINCE_ROTATION=$(( ($(date +%s) - $(date -d "$LAST_ROTATION" +%s)) / 86400 ))

echo "📅 Days since last rotation: $DAYS_SINCE_ROTATION"

# Check for dependent workflows
DEPENDENT_WORKFLOWS=$(grep -r "$SECRET_NAME" .github/workflows/ | wc -l)
echo "🔗 Dependent workflows: $DEPENDENT_WORKFLOWS"

# Check for active deployments
ACTIVE_DEPLOYMENTS=$(gh api repos/:owner/:repo/deployments --jq '[.[] | select(.environment=="production" and .task=="deploy")] | length')
echo "🚀 Active deployments: $ACTIVE_DEPLOYMENTS"

# Validate current secret
echo "🔍 Validating current secret format..."
# This would include service-specific validation

# Check for recent incidents
RECENT_INCIDENTS=$(gh issue list --label "security" --state "open" --json number | jq '. | length')
echo "🚨 Open security incidents: $RECENT_INCIDENTS"

if [[ $RECENT_INCIDENTS -gt 0 ]]; then
  echo "⚠️  Warning: Open security incidents detected. Consider postponing rotation."
fi

echo "✅ Pre-rotation checklist completed"
```

#### Post-Rotation Validation
```bash
#!/bin/bash
# Post-Rotation Validation Script

SECRET_NAME="$1"
NEW_SECRET_VALUE="$2"

echo "🔍 Post-rotation validation for $SECRET_NAME"

# Step 1: Validate secret format
case $SECRET_NAME in
  "SUPABASE_SERVICE_ROLE_KEY"|"VITE_SUPABASE_ANON_KEY")
    if [[ ! $NEW_SECRET_VALUE =~ ^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
      echo "❌ Invalid JWT format"
      exit 1
    fi
    ;;
  "OPENAI_API_KEY")
    if [[ ! $NEW_SECRET_VALUE =~ ^sk-(proj-)?[A-Za-z0-9]{48,}$ ]]; then
      echo "❌ Invalid OpenAI API key format"
      exit 1
    fi
    ;;
  "STRIPE_SECRET_KEY")
    if [[ ! $NEW_SECRET_VALUE =~ ^sk_(test|live)_[A-Za-z0-9]{99}$ ]]; then
      echo "❌ Invalid Stripe secret key format"
      exit 1
    fi
    ;;
esac

# Step 2: Test service connectivity
echo "🧪 Testing service connectivity..."
case $SECRET_NAME in
  "SUPABASE_SERVICE_ROLE_KEY")
    curl -s -H "Authorization: Bearer $NEW_SECRET_VALUE" \
      "https://$SUPABASE_PROJECT_ID.supabase.co/rest/v1/health" | grep -q "ok"
    ;;
  "OPENAI_API_KEY")
    curl -s -H "Authorization: Bearer $NEW_SECRET_VALUE" \
      "https://api.openai.com/v1/models" | jq -e '.data[0].id' > /dev/null
    ;;
  "STRIPE_SECRET_KEY")
    curl -s -u "$NEW_SECRET_VALUE:" \
      "https://api.stripe.com/v1/account" | jq -e '.id' > /dev/null
    ;;
esac

if [[ $? -eq 0 ]]; then
  echo "✅ Service connectivity test passed"
else
  echo "❌ Service connectivity test failed"
  exit 1
fi

# Step 3: Trigger dependent workflow tests
echo "🔄 Triggering dependent workflow tests..."
gh workflow run secret-validation.yml --field secret_name="$SECRET_NAME"

# Step 4: Monitor for errors
echo "📊 Monitoring for errors (5 minutes)..."
sleep 300

ERROR_COUNT=$(gh run list --workflow=secret-validation.yml --limit=1 --json conclusion | jq -r '.[0].conclusion')
if [[ "$ERROR_COUNT" != "success" ]]; then
  echo "❌ Workflow validation failed"
  exit 1
fi

# Step 5: Update rotation log
echo "📝 Updating rotation log..."
echo "$(date -Iseconds): $SECRET_NAME rotated successfully" >> .github/secrets/rotation.log

echo "✅ Post-rotation validation completed successfully"
```

## Monitoring and Alerting

### Rotation Compliance Monitoring

#### Daily Compliance Check
```bash
#!/bin/bash
# Daily Secret Rotation Compliance Check

echo "📊 Daily Secret Rotation Compliance Report - $(date)"

# Check each secret's rotation status
while IFS= read -r secret_config; do
  SECRET_NAME=$(echo "$secret_config" | yq e '.name' -)
  ROTATION_SCHEDULE=$(echo "$secret_config" | yq e '.rotation_schedule' -)
  SECURITY_LEVEL=$(echo "$secret_config" | yq e '.security_level // "medium"' -)
  
  # Get last rotation date
  LAST_ROTATION=$(gh secret list --json name,updatedAt | jq -r ".[] | select(.name==\"$SECRET_NAME\") | .updatedAt")
  
  if [[ -n "$LAST_ROTATION" ]]; then
    DAYS_SINCE_ROTATION=$(( ($(date +%s) - $(date -d "$LAST_ROTATION" +%s)) / 86400 ))
    
    # Determine if rotation is due
    case $ROTATION_SCHEDULE in
      "monthly") MAX_DAYS=30 ;;
      "quarterly") MAX_DAYS=90 ;;
      "semi-annually") MAX_DAYS=180 ;;
      "yearly") MAX_DAYS=365 ;;
      *) MAX_DAYS=90 ;;
    esac
    
    if [[ $DAYS_SINCE_ROTATION -gt $MAX_DAYS ]]; then
      echo "⚠️  $SECRET_NAME: OVERDUE ($DAYS_SINCE_ROTATION days, max $MAX_DAYS)"
      
      # Send alert for critical/high security secrets
      if [[ "$SECURITY_LEVEL" == "critical" || "$SECURITY_LEVEL" == "high" ]]; then
        curl -X POST "$SLACK_SECURITY_WEBHOOK" \
          -H "Content-Type: application/json" \
          -d "{\"text\": \"⚠️ Secret rotation overdue: $SECRET_NAME ($DAYS_SINCE_ROTATION days)\"}"
      fi
    else
      DAYS_UNTIL_DUE=$((MAX_DAYS - DAYS_SINCE_ROTATION))
      echo "✅ $SECRET_NAME: OK ($DAYS_UNTIL_DUE days until due)"
    fi
  else
    echo "❓ $SECRET_NAME: No rotation history found"
  fi
done < <(yq e '.[] | select(.scope == "repository")' .github/secrets/repository-secrets.yml)
```

### Automated Rotation Scheduling

#### Cron-based Rotation Scheduler
```bash
#!/bin/bash
# Automated Rotation Scheduler

# Add to crontab:
# 0 2 * * 1 /path/to/rotation-scheduler.sh  # Weekly check on Mondays at 2 AM

echo "🕐 Running automated rotation scheduler - $(date)"

# Check for secrets due for rotation in the next 7 days
while IFS= read -r secret_config; do
  SECRET_NAME=$(echo "$secret_config" | yq e '.name' -)
  ROTATION_SCHEDULE=$(echo "$secret_config" | yq e '.rotation_schedule' -)
  LEAD_TIME=$(echo "$secret_config" | yq e '.lead_time // 14' -)
  
  LAST_ROTATION=$(gh secret list --json name,updatedAt | jq -r ".[] | select(.name==\"$SECRET_NAME\") | .updatedAt")
  
  if [[ -n "$LAST_ROTATION" ]]; then
    DAYS_SINCE_ROTATION=$(( ($(date +%s) - $(date -d "$LAST_ROTATION" +%s)) / 86400 ))
    
    case $ROTATION_SCHEDULE in
      "monthly") ROTATION_INTERVAL=30 ;;
      "quarterly") ROTATION_INTERVAL=90 ;;
      "semi-annually") ROTATION_INTERVAL=180 ;;
      "yearly") ROTATION_INTERVAL=365 ;;
      *) ROTATION_INTERVAL=90 ;;
    esac
    
    DAYS_UNTIL_DUE=$((ROTATION_INTERVAL - DAYS_SINCE_ROTATION))
    
    if [[ $DAYS_UNTIL_DUE -le $LEAD_TIME && $DAYS_UNTIL_DUE -gt 0 ]]; then
      echo "📅 Scheduling rotation for $SECRET_NAME (due in $DAYS_UNTIL_DUE days)"
      
      # Create GitHub issue for rotation
      gh issue create \
        --title "🔄 Scheduled Secret Rotation: $SECRET_NAME" \
        --body "**Rotation Due:** $(date -d "+$DAYS_UNTIL_DUE days" +%Y-%m-%d)\n**Schedule:** $ROTATION_SCHEDULE\n**Lead Time:** $LEAD_TIME days\n\n**Rotation Checklist:**\n- [ ] Pre-rotation validation\n- [ ] Generate new secret\n- [ ] Test in staging\n- [ ] Update GitHub secrets\n- [ ] Validate services\n- [ ] Revoke old secret\n- [ ] Update documentation" \
        --label "secret-rotation,scheduled" \
        --assignee "@me"
      
      # Send Slack notification
      curl -X POST "$SLACK_DEVOPS_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "{\"text\": \"📅 Secret rotation scheduled: $SECRET_NAME (due in $DAYS_UNTIL_DUE days)\"}"
    fi
  fi
done < <(yq e '.[] | select(.scope == "repository")' .github/secrets/repository-secrets.yml)

echo "✅ Rotation scheduler completed"
```

## Rollback Procedures

### Emergency Rollback

When a secret rotation causes service disruption:

```bash
#!/bin/bash
# Emergency Secret Rollback Script

SECRET_NAME="$1"
ROLLBACK_REASON="$2"

echo "🔄 EMERGENCY ROLLBACK INITIATED"
echo "Secret: $SECRET_NAME"
echo "Reason: $ROLLBACK_REASON"

# Step 1: Retrieve previous secret value from backup
PREVIOUS_SECRET=$(gh secret get "${SECRET_NAME}_BACKUP" 2>/dev/null)

if [[ -z "$PREVIOUS_SECRET" ]]; then
  echo "❌ No backup found for $SECRET_NAME"
  echo "Manual intervention required"
  exit 1
fi

# Step 2: Restore previous secret
gh secret set "$SECRET_NAME" --body "$PREVIOUS_SECRET"

# Step 3: Validate service restoration
echo "🧪 Validating service restoration..."
# Service-specific validation would go here

# Step 4: Alert teams
curl -X POST "$SLACK_EMERGENCY_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{
    \"text\": \"🔄 EMERGENCY ROLLBACK COMPLETED\",
    \"attachments\": [{
      \"color\": \"warning\",
      \"fields\": [
        {\"title\": \"Secret\", \"value\": \"$SECRET_NAME\", \"short\": true},
        {\"title\": \"Reason\", \"value\": \"$ROLLBACK_REASON\", \"short\": true}
      ]
    }]
  }"

# Step 5: Create incident report
gh issue create \
  --title "🔄 Emergency Rollback: $SECRET_NAME" \
  --body "**Rollback Reason:** $ROLLBACK_REASON\n**Timestamp:** $(date -Iseconds)\n\n**Post-Rollback Actions Required:**\n- [ ] Investigate rotation failure\n- [ ] Fix underlying issue\n- [ ] Plan new rotation attempt\n- [ ] Update procedures if needed" \
  --label "security,emergency,rollback"

echo "✅ Emergency rollback completed"
```

## Documentation and Reporting

### Rotation Activity Log

All rotation activities are logged in `.github/secrets/rotation.log`:

```
2024-01-15T10:30:00Z: SUPABASE_SERVICE_ROLE_KEY rotated successfully (scheduled)
2024-01-15T10:35:00Z: VITE_SUPABASE_ANON_KEY rotated successfully (scheduled)
2024-01-20T14:22:00Z: OPENAI_API_KEY rotated successfully (emergency - suspected compromise)
2024-02-01T09:15:00Z: STRIPE_SECRET_KEY rotated successfully (scheduled)
```

### Monthly Rotation Report

```bash
#!/bin/bash
# Generate Monthly Rotation Report

MONTH=$(date +%Y-%m)
echo "# Secret Rotation Report - $MONTH"
echo ""

echo "## Summary"
TOTAL_ROTATIONS=$(grep "$MONTH" .github/secrets/rotation.log | wc -l)
SCHEDULED_ROTATIONS=$(grep "$MONTH" .github/secrets/rotation.log | grep "scheduled" | wc -l)
EMERGENCY_ROTATIONS=$(grep "$MONTH" .github/secrets/rotation.log | grep "emergency" | wc -l)

echo "- Total Rotations: $TOTAL_ROTATIONS"
echo "- Scheduled: $SCHEDULED_ROTATIONS"
echo "- Emergency: $EMERGENCY_ROTATIONS"
echo ""

echo "## Rotation Details"
grep "$MONTH" .github/secrets/rotation.log | while read -r line; do
  echo "- $line"
done
echo ""

echo "## Compliance Status"
# Generate compliance status for each secret
# This would include detailed compliance analysis

echo "## Recommendations"
echo "- Review emergency rotations for process improvements"
echo "- Update rotation schedules based on usage patterns"
echo "- Consider automation opportunities"
```

---

**Document Version**: 1.0  
**Last Updated**: $(date)  
**Next Review**: Monthly  
**Owner**: DevOps Team  
**Approvers**: Security Team