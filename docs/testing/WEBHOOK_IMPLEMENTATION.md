# Stripe Webhook Implementation

This document describes the Stripe webhook implementation for HalluciFix, including setup, configuration, and testing.

## Overview

The webhook system processes Stripe events to keep the application synchronized with subscription and payment changes. It handles:

- Subscription lifecycle events (created, updated, canceled)
- Payment processing (succeeded, failed)
- Customer management
- Trial period management
- Email notifications and alerts

## Architecture

### Components

1. **Webhook Handler** (`supabase/functions/stripe-webhook/index.ts`)
   - Supabase Edge Function that receives and processes webhook events
   - Validates webhook signatures for security
   - Routes events to appropriate handlers
   - Implements idempotency to prevent duplicate processing

2. **Webhook Service** (`src/lib/webhookService.ts`)
   - Frontend service for monitoring webhook events
   - Provides statistics and debugging information
   - Manages webhook-related database queries

3. **Billing Notification Service** (`src/lib/billingNotificationService.ts`)
   - Handles email notifications for billing events
   - Manages in-app billing alerts
   - Provides notification templates

4. **Webhook Configuration Service** (`src/lib/webhookConfig.ts`)
   - Utilities for configuring webhook endpoints in Stripe
   - Validation and testing tools
   - Setup instructions and recommendations

## Database Schema

The webhook system uses several database tables:

### Core Tables

- `webhook_events` - Tracks all webhook events for monitoring
- `subscription_events` - User-specific subscription events
- `email_notifications` - Email notification history
- `billing_alerts` - In-app billing notifications
- `payment_history` - Payment transaction records
- `invoice_events` - Invoice lifecycle events

### Supporting Tables

- `checkout_sessions` - Checkout session tracking
- `payment_method_events` - Payment method changes
- `one_time_payments` - Non-subscription payments

## Setup Instructions

### 1. Environment Variables

Set the following environment variables:

```bash
# Required for webhook processing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Optional for development
WEBHOOK_URL=http://localhost:54321/functions/v1/stripe-webhook
```

### 2. Database Migration

Run the webhook infrastructure migration:

```sql
-- This creates all necessary tables and functions
-- File: supabase/migrations/20250119000002_stripe_webhook_infrastructure.sql
```

### 3. Deploy Webhook Function

Deploy the Supabase Edge Function:

```bash
supabase functions deploy stripe-webhook
```

### 4. Configure Stripe Webhook Endpoint

#### Option A: Manual Configuration

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Set endpoint URL: `https://your-project.supabase.co/functions/v1/stripe-webhook`
4. Select the following events:

```
checkout.session.completed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.trial_will_end
invoice.payment_succeeded
invoice.payment_failed
invoice.created
invoice.finalized
customer.created
customer.updated
payment_method.attached
payment_method.detached
```

5. Copy the webhook signing secret and set it as `STRIPE_WEBHOOK_SECRET`

#### Option B: Programmatic Configuration

Use the webhook configuration service:

```typescript
import { webhookConfigurationService } from './src/lib/webhookConfig';

// Auto-configure webhook endpoint
const result = await webhookConfigurationService.autoConfigureWebhook();
console.log(result.message);

// Check configuration status
const status = await webhookConfigurationService.getWebhookConfigurationStatus();
console.log(status);
```

## Event Processing

### Supported Events

| Event Type | Description | Handler |
|------------|-------------|---------|
| `checkout.session.completed` | Checkout completed | Records session, triggers subscription creation |
| `customer.subscription.created` | New subscription | Creates user subscription record, sends welcome email |
| `customer.subscription.updated` | Subscription changed | Updates subscription status, handles plan changes |
| `customer.subscription.deleted` | Subscription canceled | Updates status, sends cancellation email |
| `customer.subscription.trial_will_end` | Trial ending soon | Sends trial ending notification |
| `invoice.payment_succeeded` | Payment successful | Records payment, sends confirmation |
| `invoice.payment_failed` | Payment failed | Records failure, sends failure notification |
| `customer.created` | New customer | Updates customer record |
| `payment_method.attached` | Payment method added | Logs payment method change |

### Event Processing Flow

1. **Receive Event**: Webhook endpoint receives POST request from Stripe
2. **Validate Signature**: Verify webhook signature using signing secret
3. **Check Idempotency**: Prevent duplicate processing of same event
4. **Route Event**: Send event to appropriate handler based on type
5. **Process Event**: Update database, send notifications, etc.
6. **Log Result**: Record processing result for monitoring
7. **Return Response**: Send success/failure response to Stripe

### Error Handling

- **Signature Validation**: Invalid signatures return 400 status
- **Processing Errors**: Errors are logged and return 500 status
- **Retry Logic**: Stripe automatically retries failed webhooks
- **Idempotency**: Duplicate events are safely ignored

## Testing

### Local Testing

1. **Start Local Development**:
   ```bash
   supabase start
   supabase functions serve
   ```

2. **Use Stripe CLI** (recommended):
   ```bash
   stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
   ```

3. **Trigger Test Events**:
   ```bash
   stripe trigger customer.subscription.created
   stripe trigger invoice.payment_succeeded
   ```

### Automated Testing

Use the provided test script:

```bash
# Test all webhook events
node scripts/test-webhook.js

# Test specific event
node scripts/test-webhook.js customer.subscription.created

# Test signature validation
node scripts/test-webhook.js signature
```

### Manual Testing

Send test webhooks using curl:

```bash
curl -X POST http://localhost:54321/functions/v1/stripe-webhook \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=signature" \
  -d '{"id":"evt_test","type":"customer.created","data":{"object":{"id":"cus_test"}}}'
```

## Monitoring

### Webhook Statistics

Get webhook processing statistics:

```typescript
import { webhookService } from './src/lib/webhookService';

// Get recent webhook stats
const stats = await webhookService.getWebhookStats({
  startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
});

console.log(`Success rate: ${stats.successRate}%`);
console.log(`Total events: ${stats.totalEvents}`);
```

### Failed Webhooks

Monitor failed webhook processing:

```typescript
// Get recent failed webhooks
const failedWebhooks = await webhookService.getWebhookEvents({
  success: false,
  limit: 50,
});

failedWebhooks.events.forEach(event => {
  console.log(`Failed: ${event.eventType} - ${event.errorMessage}`);
});
```

### User Notifications

Check user billing alerts:

```typescript
import { billingNotificationService } from './src/lib/billingNotificationService';

// Get user's billing alerts
const alerts = await billingNotificationService.getBillingAlerts(userId, {
  includeRead: false, // Only unread alerts
});

alerts.alerts.forEach(alert => {
  console.log(`${alert.severity}: ${alert.title} - ${alert.message}`);
});
```

## Security

### Webhook Signature Verification

All webhook requests are verified using Stripe's signature verification:

```typescript
// Automatic signature verification in webhook handler
const event = stripe.webhooks.constructEvent(
  body,
  signature,
  STRIPE_WEBHOOK_SECRET
);
```

### Environment Security

- Store webhook secrets securely in environment variables
- Use Supabase service role key for database operations
- Enable Row Level Security (RLS) on all tables
- Validate all input data before processing

## Troubleshooting

### Common Issues

1. **Invalid Signature Errors**
   - Check `STRIPE_WEBHOOK_SECRET` is correct
   - Ensure webhook endpoint URL matches Stripe configuration
   - Verify request is coming from Stripe

2. **Database Connection Errors**
   - Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - Verify database migrations have been applied
   - Check RLS policies allow service role access

3. **Event Processing Failures**
   - Check webhook event logs in database
   - Verify required fields are present in event data
   - Check for missing user or subscription records

### Debug Mode

Enable debug logging by setting:

```bash
LOG_LEVEL=debug
```

### Webhook Logs

View webhook processing logs:

```sql
-- Recent webhook events
SELECT * FROM webhook_events 
ORDER BY created_at DESC 
LIMIT 50;

-- Failed events only
SELECT * FROM webhook_events 
WHERE success = false 
ORDER BY created_at DESC;

-- Events by type
SELECT event_type, COUNT(*), 
       COUNT(*) FILTER (WHERE success = true) as successful
FROM webhook_events 
GROUP BY event_type;
```

## Best Practices

1. **Idempotency**: Always check for duplicate events
2. **Error Handling**: Log all errors with sufficient detail
3. **Monitoring**: Set up alerts for high failure rates
4. **Testing**: Test webhook handlers thoroughly
5. **Security**: Always validate webhook signatures
6. **Performance**: Keep webhook handlers fast and efficient
7. **Reliability**: Use database transactions for consistency

## API Reference

### Webhook Service Methods

```typescript
// Get webhook events
await webhookService.getWebhookEvents(options);

// Get subscription events for user
await webhookService.getSubscriptionEvents(userId, options);

// Get payment history
await webhookService.getPaymentHistory(userId, options);

// Get webhook statistics
await webhookService.getWebhookStats(options);
```

### Notification Service Methods

```typescript
// Send welcome email
await billingNotificationService.sendWelcomeEmail(userId, data);

// Send payment failure notification
await billingNotificationService.sendPaymentFailureEmail(userId, data);

// Get billing alerts
await billingNotificationService.getBillingAlerts(userId, options);

// Dismiss alert
await billingNotificationService.dismissBillingAlert(userId, alertId);
```

### Configuration Service Methods

```typescript
// Get webhook configuration status
await webhookConfigurationService.getWebhookConfigurationStatus();

// Auto-configure webhook
await webhookConfigurationService.autoConfigureWebhook();

// Test webhook endpoint
await webhookConfigurationService.testWebhookEndpoint(endpointId);
```

## Support

For webhook-related issues:

1. Check the troubleshooting section above
2. Review webhook event logs in the database
3. Test with Stripe CLI for local development
4. Contact support with specific error messages and event IDs