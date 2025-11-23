# Stripe Webhook Deployment Checklist

This checklist ensures proper deployment and configuration of the Stripe webhook infrastructure.

## Pre-Deployment Checklist

### ✅ Environment Variables
Ensure the following environment variables are set:

**Required for Production:**
- [ ] `STRIPE_SECRET_KEY` - Your Stripe secret key (starts with `sk_`)
- [ ] `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (starts with `whsec_`)
- [ ] `SUPABASE_URL` - Your Supabase project URL
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Service role key for webhook processing

**Optional for Development:**
- [ ] `WEBHOOK_URL` - Override webhook endpoint URL for testing
- [ ] `LOG_LEVEL` - Set to `debug` for detailed logging

### ✅ Database Setup
- [ ] Run payment infrastructure migration: `20250119000001_stripe_payment_infrastructure.sql`
- [ ] Run webhook infrastructure migration: `20250119000002_stripe_webhook_infrastructure.sql`
- [ ] Verify all tables are created with proper indexes and RLS policies
- [ ] Test database connectivity with service role key

### ✅ Supabase Edge Function
- [ ] Deploy webhook function: `supabase functions deploy stripe-webhook`
- [ ] Verify function is accessible at: `https://your-project.supabase.co/functions/v1/stripe-webhook`
- [ ] Test function responds to POST requests
- [ ] Check function logs for any deployment issues

## Stripe Configuration

### ✅ Webhook Endpoint Setup
1. **Create Webhook Endpoint:**
   - [ ] Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
   - [ ] Click "Add endpoint"
   - [ ] Set URL: `https://your-project.supabase.co/functions/v1/stripe-webhook`
   - [ ] Set description: "HalluciFix Webhook Endpoint"

2. **Configure Events:**
   Select the following events:
   - [ ] `checkout.session.completed`
   - [ ] `checkout.session.expired`
   - [ ] `customer.subscription.created`
   - [ ] `customer.subscription.updated`
   - [ ] `customer.subscription.deleted`
   - [ ] `customer.subscription.trial_will_end`
   - [ ] `invoice.payment_succeeded`
   - [ ] `invoice.payment_failed`
   - [ ] `invoice.created`
   - [ ] `invoice.finalized`
   - [ ] `customer.created`
   - [ ] `customer.updated`
   - [ ] `payment_method.attached`
   - [ ] `payment_method.detached`

3. **Security:**
   - [ ] Copy webhook signing secret
   - [ ] Set `STRIPE_WEBHOOK_SECRET` environment variable
   - [ ] Redeploy function with new environment variable

### ✅ Alternative: Programmatic Setup
Use the webhook configuration service:

```typescript
import { webhookConfigurationService } from './src/lib/webhookConfig';

// Auto-configure webhook
const result = await webhookConfigurationService.autoConfigureWebhook();
console.log(result.message);
```

## Testing

### ✅ Local Testing
1. **Start Local Environment:**
   ```bash
   supabase start
   supabase functions serve
   ```

2. **Test with Stripe CLI:**
   ```bash
   stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
   stripe trigger customer.subscription.created
   ```

3. **Run Test Suite:**
   ```bash
   node scripts/test-webhook.js
   ```

### ✅ Production Testing
1. **Test Webhook Endpoint:**
   ```bash
   # Set production webhook URL
   export WEBHOOK_URL=https://your-project.supabase.co/functions/v1/stripe-webhook
   export STRIPE_WEBHOOK_SECRET=whsec_your_production_secret
   
   # Run tests
   node scripts/test-webhook.js
   ```

2. **Create Test Subscription:**
   - [ ] Create a test customer in Stripe
   - [ ] Create a test subscription
   - [ ] Verify webhook events are processed
   - [ ] Check database for subscription records

3. **Test Payment Flow:**
   - [ ] Process a test payment
   - [ ] Verify payment success webhook
   - [ ] Check payment history in database
   - [ ] Verify email notifications are sent

## Monitoring Setup

### ✅ Webhook Monitoring
1. **Database Monitoring:**
   ```sql
   -- Check recent webhook events
   SELECT * FROM webhook_events 
   ORDER BY created_at DESC 
   LIMIT 10;
   
   -- Check success rate
   SELECT 
     COUNT(*) as total,
     COUNT(*) FILTER (WHERE success = true) as successful,
     ROUND(COUNT(*) FILTER (WHERE success = true) * 100.0 / COUNT(*), 2) as success_rate
   FROM webhook_events 
   WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

2. **Failed Webhook Alerts:**
   - [ ] Set up monitoring for failed webhooks
   - [ ] Configure alerts for success rate below 95%
   - [ ] Monitor webhook processing latency

### ✅ Application Monitoring
1. **Subscription Sync:**
   - [ ] Monitor subscription status synchronization
   - [ ] Check for orphaned subscription records
   - [ ] Verify user access level updates

2. **Payment Processing:**
   - [ ] Monitor payment success/failure rates
   - [ ] Check payment history completeness
   - [ ] Verify invoice processing

3. **Email Notifications:**
   - [ ] Monitor email delivery rates
   - [ ] Check notification template rendering
   - [ ] Verify user alert creation

## Security Verification

### ✅ Webhook Security
- [ ] Verify webhook signature validation is working
- [ ] Test with invalid signatures (should return 400)
- [ ] Ensure webhook secret is not exposed in logs
- [ ] Verify HTTPS is used for webhook endpoint

### ✅ Database Security
- [ ] Verify RLS policies are enabled on all tables
- [ ] Test user access restrictions
- [ ] Ensure service role has necessary permissions
- [ ] Check for SQL injection vulnerabilities

### ✅ Environment Security
- [ ] Verify environment variables are secure
- [ ] Check for secrets in version control
- [ ] Ensure production keys are not used in development
- [ ] Verify access logs and audit trails

## Performance Optimization

### ✅ Database Performance
- [ ] Verify all indexes are created
- [ ] Check query performance for webhook processing
- [ ] Monitor database connection usage
- [ ] Set up connection pooling if needed

### ✅ Function Performance
- [ ] Monitor webhook processing latency
- [ ] Check function memory usage
- [ ] Verify function timeout settings
- [ ] Optimize for cold start performance

### ✅ Cleanup Jobs
Set up automated cleanup:
- [ ] Old webhook events (90 days retention)
- [ ] Old subscription events (365 days retention)
- [ ] Old email notifications (180 days retention)

```sql
-- Schedule cleanup jobs
SELECT cron.schedule('cleanup-webhook-events', '0 2 * * *', 'SELECT cleanup_old_webhook_events(90);');
SELECT cron.schedule('cleanup-subscription-events', '0 3 * * *', 'SELECT cleanup_old_subscription_events(365);');
SELECT cron.schedule('cleanup-email-notifications', '0 4 * * *', 'SELECT cleanup_old_email_notifications(180);');
```

## Post-Deployment Verification

### ✅ End-to-End Testing
1. **Complete Subscription Flow:**
   - [ ] User creates account
   - [ ] User starts subscription checkout
   - [ ] Payment is processed
   - [ ] Subscription is created via webhook
   - [ ] User receives welcome email
   - [ ] User access is updated

2. **Payment Failure Flow:**
   - [ ] Simulate payment failure
   - [ ] Verify failure webhook processing
   - [ ] Check failure notification sent
   - [ ] Verify user alert created

3. **Subscription Changes:**
   - [ ] Test subscription upgrade
   - [ ] Test subscription downgrade
   - [ ] Test subscription cancellation
   - [ ] Verify all changes are processed

### ✅ Monitoring Dashboard
- [ ] Set up webhook statistics dashboard
- [ ] Monitor key metrics:
  - Webhook success rate
  - Processing latency
  - Event volume
  - Error rates
- [ ] Configure alerting for anomalies

## Rollback Plan

### ✅ Rollback Preparation
- [ ] Document current webhook configuration
- [ ] Backup database before deployment
- [ ] Prepare rollback scripts
- [ ] Test rollback procedure in staging

### ✅ Emergency Procedures
If webhooks fail:
1. **Immediate Actions:**
   - [ ] Disable webhook endpoint in Stripe
   - [ ] Check function logs for errors
   - [ ] Verify environment variables
   - [ ] Check database connectivity

2. **Recovery Actions:**
   - [ ] Fix identified issues
   - [ ] Redeploy function if needed
   - [ ] Re-enable webhook endpoint
   - [ ] Process missed events manually if necessary

## Documentation

### ✅ Team Documentation
- [ ] Update deployment documentation
- [ ] Document webhook configuration
- [ ] Create troubleshooting guide
- [ ] Update monitoring runbooks

### ✅ User Documentation
- [ ] Update billing documentation
- [ ] Document notification preferences
- [ ] Create billing FAQ
- [ ] Update support procedures

## Sign-off

### ✅ Final Verification
- [ ] All checklist items completed
- [ ] End-to-end testing passed
- [ ] Monitoring configured
- [ ] Team trained on new system
- [ ] Documentation updated

**Deployment Approved By:**
- [ ] Technical Lead: _________________ Date: _________
- [ ] Product Owner: _________________ Date: _________
- [ ] DevOps Engineer: _______________ Date: _________

**Production Deployment:**
- [ ] Deployed to production: Date: _________ Time: _________
- [ ] Post-deployment verification completed: Date: _________
- [ ] Monitoring confirmed operational: Date: _________

---

## Quick Reference

### Useful Commands
```bash
# Deploy webhook function
supabase functions deploy stripe-webhook

# Test webhook locally
node scripts/test-webhook.js

# Check webhook stats
psql -c "SELECT * FROM get_webhook_stats();"

# View recent failed webhooks
psql -c "SELECT * FROM get_recent_failed_webhooks(24, 10);"
```

### Important URLs
- Stripe Dashboard: https://dashboard.stripe.com/webhooks
- Webhook Endpoint: https://your-project.supabase.co/functions/v1/stripe-webhook
- Supabase Dashboard: https://app.supabase.com/project/your-project

### Support Contacts
- Technical Issues: [Your team contact]
- Stripe Support: https://support.stripe.com/
- Supabase Support: https://supabase.com/support