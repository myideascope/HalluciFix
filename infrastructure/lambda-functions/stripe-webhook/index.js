/**
 * AWS Lambda Function: Stripe Webhook Handler
 * Migrated from Supabase Edge Function
 * Processes Stripe webhook events for subscription and payment management
 */

const { RDSDataService } = require('@aws-sdk/client-rds-data');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const Stripe = require('stripe');

// AWS clients
const rdsData = new RDSDataService({ region: process.env.AWS_REGION });
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });
const sesClient = new SESClient({ region: process.env.AWS_REGION });

// Environment variables
const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const STRIPE_SECRET_KEY_ARN = process.env.STRIPE_SECRET_KEY_ARN;
const STRIPE_WEBHOOK_SECRET_ARN = process.env.STRIPE_WEBHOOK_SECRET_ARN;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@hallucifix.com';

let stripe;
let webhookSecret;

// Idempotency tracking (in-memory for Lambda)
const processedEvents = new Map();

// Helper function to get secret value
async function getSecret(secretArn) {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await secretsManager.send(command);
    return response.SecretString;
  } catch (error) {
    console.error('Error retrieving secret:', error);
    throw new Error('Failed to retrieve secret');
  }
}

// Initialize Stripe client and webhook secret
async function initializeStripe() {
  if (!stripe) {
    const stripeSecretKey = await getSecret(STRIPE_SECRET_KEY_ARN);
    stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });
  }
  
  if (!webhookSecret) {
    webhookSecret = await getSecret(STRIPE_WEBHOOK_SECRET_ARN);
  }
  
  return { stripe, webhookSecret };
}

// Helper function to execute RDS queries
async function executeQuery(sql, parameters = []) {
  const params = {
    resourceArn: DB_CLUSTER_ARN,
    secretArn: DB_SECRET_ARN,
    database: 'hallucifix',
    sql: sql,
    parameters: parameters
  };

  try {
    const result = await rdsData.executeStatement(params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

// Helper function to format RDS results
function formatRDSResults(records, columns) {
  if (!records || records.length === 0) return [];
  
  return records.map(record => {
    const row = {};
    record.forEach((field, index) => {
      const columnName = columns[index];
      row[columnName] = extractFieldValue(field);
    });
    return row;
  });
}

function extractFieldValue(field) {
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.isNull) return null;
  return field;
}

// Process individual webhook events
async function processWebhookEvent(event) {
  const result = {
    success: false,
    message: '',
    eventId: event.id,
    eventType: event.type,
    processedAt: new Date(),
  };

  try {
    switch (event.type) {
      // Checkout session events
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        result.success = true;
        result.message = 'Checkout session completed successfully';
        break;

      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object);
        result.success = true;
        result.message = 'Checkout session expired processed';
        break;

      // Subscription lifecycle events
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        result.success = true;
        result.message = 'Subscription created successfully';
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        result.success = true;
        result.message = 'Subscription updated successfully';
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        result.success = true;
        result.message = 'Subscription deleted successfully';
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object);
        result.success = true;
        result.message = 'Trial ending notification processed';
        break;

      // Payment and invoice events
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        result.success = true;
        result.message = 'Payment succeeded processed';
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        result.success = true;
        result.message = 'Payment failed processed';
        break;

      case 'invoice.created':
        await handleInvoiceCreated(event.data.object);
        result.success = true;
        result.message = 'Invoice created processed';
        break;

      case 'invoice.finalized':
        await handleInvoiceFinalized(event.data.object);
        result.success = true;
        result.message = 'Invoice finalized processed';
        break;

      // Customer events
      case 'customer.created':
        await handleCustomerCreated(event.data.object);
        result.success = true;
        result.message = 'Customer created processed';
        break;

      case 'customer.updated':
        await handleCustomerUpdated(event.data.object);
        result.success = true;
        result.message = 'Customer updated processed';
        break;

      // Payment method events
      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object);
        result.success = true;
        result.message = 'Payment method attached processed';
        break;

      case 'payment_method.detached':
        await handlePaymentMethodDetached(event.data.object);
        result.success = true;
        result.message = 'Payment method detached processed';
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
        result.success = true;
        result.message = `Event type ${event.type} acknowledged but not processed`;
    }

    // Log successful processing
    await logWebhookEvent(event, result);

  } catch (error) {
    console.error(`Error processing ${event.type}:`, error);
    result.success = false;
    result.message = `Failed to process ${event.type}`;
    result.error = error.message;

    // Log failed processing
    await logWebhookEvent(event, result);
  }

  return result;
}

// Handle checkout session completed
async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.userId;
  if (!userId) {
    throw new Error('No userId in session metadata');
  }

  console.log(`Processing checkout completion for user ${userId}`);

  // If this is a subscription checkout, the subscription will be handled by subscription.created event
  if (session.mode === 'subscription') {
    console.log('Subscription checkout - will be handled by subscription.created event');
    return;
  }

  // Handle one-time payments if needed
  if (session.mode === 'payment') {
    await recordOneTimePayment(session);
  }
}

// Handle checkout session expired
async function handleCheckoutExpired(session) {
  console.log(`Checkout session expired: ${session.id}`);
  
  // Log the expired session for analytics
  const sql = `
    INSERT INTO checkout_sessions 
    (stripe_session_id, user_id, status, mode, amount_total, currency, expires_at, updated_at) 
    VALUES (:sessionId, :userId, :status, :mode, :amountTotal, :currency, :expiresAt, :updatedAt)
    ON CONFLICT (stripe_session_id) DO UPDATE SET
    status = :status, updated_at = :updatedAt
  `;
  
  await executeQuery(sql, [
    { name: 'sessionId', value: { stringValue: session.id } },
    { name: 'userId', value: { stringValue: session.metadata?.userId || null } },
    { name: 'status', value: { stringValue: 'expired' } },
    { name: 'mode', value: { stringValue: session.mode } },
    { name: 'amountTotal', value: { longValue: session.amount_total || 0 } },
    { name: 'currency', value: { stringValue: session.currency || 'usd' } },
    { name: 'expiresAt', value: { stringValue: new Date(session.expires_at * 1000).toISOString() } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

// Handle subscription created
async function handleSubscriptionCreated(subscription) {
  const userId = subscription.metadata.userId;
  if (!userId) {
    console.warn('No userId in subscription metadata');
    return;
  }

  console.log(`Creating subscription for user ${userId}`);

  // Save subscription to database
  const sql = `
    INSERT INTO user_subscriptions 
    (user_id, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_start, current_period_end, trial_end, cancel_at_period_end, created_at, updated_at) 
    VALUES (:userId, :customerId, :subscriptionId, :planId, :status, :periodStart, :periodEnd, :trialEnd, :cancelAtPeriodEnd, :createdAt, :updatedAt)
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    status = :status, current_period_start = :periodStart, current_period_end = :periodEnd, 
    trial_end = :trialEnd, cancel_at_period_end = :cancelAtPeriodEnd, updated_at = :updatedAt
  `;
  
  await executeQuery(sql, [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'customerId', value: { stringValue: subscription.customer } },
    { name: 'subscriptionId', value: { stringValue: subscription.id } },
    { name: 'planId', value: { stringValue: subscription.items.data[0].price.id } },
    { name: 'status', value: { stringValue: subscription.status } },
    { name: 'periodStart', value: { stringValue: new Date(subscription.current_period_start * 1000).toISOString() } },
    { name: 'periodEnd', value: { stringValue: new Date(subscription.current_period_end * 1000).toISOString() } },
    { name: 'trialEnd', value: { stringValue: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null } },
    { name: 'cancelAtPeriodEnd', value: { booleanValue: subscription.cancel_at_period_end } },
    { name: 'createdAt', value: { stringValue: new Date().toISOString() } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } }
  ]);

  // Update user access level
  await updateUserAccessLevel(userId, subscription.status);

  // Log audit event
  await logBillingAudit(
    userId,
    'subscription_created',
    'subscription',
    subscription.id,
    null,
    {
      plan_id: subscription.items.data[0].price.id,
      status: subscription.status,
      trial_end: subscription.trial_end,
    }
  );

  // Send welcome email if not in trial
  if (subscription.status === 'active') {
    await sendWelcomeEmail(userId, subscription);
  }
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
  const userId = subscription.metadata.userId;
  if (!userId) {
    console.warn('No userId in subscription metadata');
    return;
  }

  console.log(`Updating subscription for user ${userId}`);

  // Update subscription in database
  const sql = `
    UPDATE user_subscriptions 
    SET plan_id = :planId, status = :status, current_period_start = :periodStart, 
        current_period_end = :periodEnd, trial_end = :trialEnd, cancel_at_period_end = :cancelAtPeriodEnd, 
        canceled_at = :canceledAt, ended_at = :endedAt, updated_at = :updatedAt 
    WHERE stripe_subscription_id = :subscriptionId
  `;
  
  await executeQuery(sql, [
    { name: 'planId', value: { stringValue: subscription.items.data[0].price.id } },
    { name: 'status', value: { stringValue: subscription.status } },
    { name: 'periodStart', value: { stringValue: new Date(subscription.current_period_start * 1000).toISOString() } },
    { name: 'periodEnd', value: { stringValue: new Date(subscription.current_period_end * 1000).toISOString() } },
    { name: 'trialEnd', value: { stringValue: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null } },
    { name: 'cancelAtPeriodEnd', value: { booleanValue: subscription.cancel_at_period_end } },
    { name: 'canceledAt', value: { stringValue: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null } },
    { name: 'endedAt', value: { stringValue: subscription.ended_at ? new Date(subscription.ended_at * 1000).toISOString() : null } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
    { name: 'subscriptionId', value: { stringValue: subscription.id } }
  ]);

  // Update user access level
  await updateUserAccessLevel(userId, subscription.status);

  // Log audit event
  await logBillingAudit(
    userId,
    'subscription_updated',
    'subscription',
    subscription.id,
    null,
    {
      plan_id: subscription.items.data[0].price.id,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
    }
  );

  // Handle specific subscription changes
  if (subscription.cancel_at_period_end) {
    await handleSubscriptionCancellationScheduled(userId, subscription);
  }
}

// Handle subscription deleted
async function handleSubscriptionDeleted(subscription) {
  const userId = subscription.metadata.userId;
  if (!userId) {
    console.warn('No userId in subscription metadata');
    return;
  }

  console.log(`Deleting subscription for user ${userId}`);

  // Update subscription status
  const sql = `
    UPDATE user_subscriptions 
    SET status = :status, canceled_at = :canceledAt, ended_at = :endedAt, updated_at = :updatedAt 
    WHERE stripe_subscription_id = :subscriptionId
  `;
  
  await executeQuery(sql, [
    { name: 'status', value: { stringValue: 'canceled' } },
    { name: 'canceledAt', value: { stringValue: new Date(subscription.canceled_at * 1000).toISOString() } },
    { name: 'endedAt', value: { stringValue: new Date(subscription.ended_at * 1000).toISOString() } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
    { name: 'subscriptionId', value: { stringValue: subscription.id } }
  ]);

  // Downgrade user access
  await updateUserAccessLevel(userId, 'canceled');

  // Log audit event
  await logBillingAudit(
    userId,
    'subscription_canceled',
    'subscription',
    subscription.id,
    null,
    {
      canceled_at: subscription.canceled_at,
      ended_at: subscription.ended_at,
    }
  );

  // Send cancellation email
  await sendCancellationEmail(userId, subscription);
}

// Handle trial will end notification
async function handleTrialWillEnd(subscription) {
  const userId = subscription.metadata.userId;
  if (!userId) {
    console.warn('No userId in subscription metadata');
    return;
  }

  console.log(`Trial ending soon for user ${userId}`);

  // Send trial ending notification
  await sendTrialEndingEmail(userId, subscription);

  // Log trial ending event
  const sql = `
    INSERT INTO subscription_events 
    (user_id, stripe_subscription_id, event_type, event_data, created_at) 
    VALUES (:userId, :subscriptionId, :eventType, :eventData, :createdAt)
  `;
  
  await executeQuery(sql, [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'subscriptionId', value: { stringValue: subscription.id } },
    { name: 'eventType', value: { stringValue: 'trial_will_end' } },
    { name: 'eventData', value: { stringValue: JSON.stringify({
      trial_end: subscription.trial_end,
      days_remaining: Math.ceil((subscription.trial_end * 1000 - Date.now()) / (24 * 60 * 60 * 1000)),
    }) } },
    { name: 'createdAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

// Handle payment succeeded
async function handlePaymentSucceeded(invoice) {
  console.log(`Payment succeeded for invoice ${invoice.id}`);

  // Record successful payment
  const sql = `
    INSERT INTO payment_history 
    (stripe_invoice_id, stripe_customer_id, stripe_subscription_id, amount, currency, status, invoice_url, description, period_start, period_end, created_at) 
    VALUES (:invoiceId, :customerId, :subscriptionId, :amount, :currency, :status, :invoiceUrl, :description, :periodStart, :periodEnd, :createdAt)
    ON CONFLICT (stripe_invoice_id) DO UPDATE SET
    status = :status, amount = :amount, updated_at = :createdAt
  `;
  
  await executeQuery(sql, [
    { name: 'invoiceId', value: { stringValue: invoice.id } },
    { name: 'customerId', value: { stringValue: invoice.customer } },
    { name: 'subscriptionId', value: { stringValue: invoice.subscription || null } },
    { name: 'amount', value: { longValue: invoice.amount_paid } },
    { name: 'currency', value: { stringValue: invoice.currency } },
    { name: 'status', value: { stringValue: 'paid' } },
    { name: 'invoiceUrl', value: { stringValue: invoice.hosted_invoice_url || invoice.invoice_pdf || '' } },
    { name: 'description', value: { stringValue: invoice.description || 'Subscription payment' } },
    { name: 'periodStart', value: { stringValue: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null } },
    { name: 'periodEnd', value: { stringValue: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null } },
    { name: 'createdAt', value: { stringValue: new Date(invoice.created * 1000).toISOString() } }
  ]);

  // Log audit event for payment success
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const userId = subscription.metadata.userId;
    
    if (userId) {
      await logBillingAudit(
        userId,
        'payment_processed',
        'payment',
        invoice.id,
        null,
        {
          amount: invoice.amount_paid,
          currency: invoice.currency,
          status: 'paid',
        }
      );
    }
  }

  // Send payment confirmation email
  if (invoice.customer_email) {
    await sendPaymentConfirmationEmail(invoice);
  }
}

// Handle payment failed
async function handlePaymentFailed(invoice) {
  console.log(`Payment failed for invoice ${invoice.id}`);

  // Record failed payment
  const sql = `
    INSERT INTO payment_history 
    (stripe_invoice_id, stripe_customer_id, stripe_subscription_id, amount, currency, status, invoice_url, description, failure_reason, period_start, period_end, created_at) 
    VALUES (:invoiceId, :customerId, :subscriptionId, :amount, :currency, :status, :invoiceUrl, :description, :failureReason, :periodStart, :periodEnd, :createdAt)
    ON CONFLICT (stripe_invoice_id) DO UPDATE SET
    status = :status, failure_reason = :failureReason, updated_at = :createdAt
  `;
  
  await executeQuery(sql, [
    { name: 'invoiceId', value: { stringValue: invoice.id } },
    { name: 'customerId', value: { stringValue: invoice.customer } },
    { name: 'subscriptionId', value: { stringValue: invoice.subscription || null } },
    { name: 'amount', value: { longValue: invoice.amount_due } },
    { name: 'currency', value: { stringValue: invoice.currency } },
    { name: 'status', value: { stringValue: 'failed' } },
    { name: 'invoiceUrl', value: { stringValue: invoice.hosted_invoice_url || '' } },
    { name: 'description', value: { stringValue: invoice.description || 'Subscription payment' } },
    { name: 'failureReason', value: { stringValue: invoice.last_finalization_error?.message || null } },
    { name: 'periodStart', value: { stringValue: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null } },
    { name: 'periodEnd', value: { stringValue: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null } },
    { name: 'createdAt', value: { stringValue: new Date(invoice.created * 1000).toISOString() } }
  ]);

  // Get user ID from subscription
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const userId = subscription.metadata.userId;
    
    if (userId) {
      // Log audit event for payment failure
      await logBillingAudit(
        userId,
        'payment_failed',
        'payment',
        invoice.id,
        null,
        {
          amount: invoice.amount_due,
          currency: invoice.currency,
          status: 'failed',
          failure_reason: invoice.last_finalization_error?.message,
        }
      );

      // Send payment failure notification
      await sendPaymentFailureEmail(userId, invoice);
      
      // Log payment failure event
      const eventSql = `
        INSERT INTO subscription_events 
        (user_id, stripe_subscription_id, event_type, event_data, created_at) 
        VALUES (:userId, :subscriptionId, :eventType, :eventData, :createdAt)
      `;
      
      await executeQuery(eventSql, [
        { name: 'userId', value: { stringValue: userId } },
        { name: 'subscriptionId', value: { stringValue: subscription.id } },
        { name: 'eventType', value: { stringValue: 'payment_failed' } },
        { name: 'eventData', value: { stringValue: JSON.stringify({
          invoice_id: invoice.id,
          amount: invoice.amount_due,
          attempt_count: invoice.attempt_count,
          next_payment_attempt: invoice.next_payment_attempt,
        }) } },
        { name: 'createdAt', value: { stringValue: new Date().toISOString() } }
      ]);
    }
  }
}

// Handle invoice created
async function handleInvoiceCreated(invoice) {
  console.log(`Invoice created: ${invoice.id}`);
  
  // Log invoice creation for tracking
  const sql = `
    INSERT INTO invoice_events 
    (stripe_invoice_id, stripe_customer_id, stripe_subscription_id, event_type, amount, currency, status, created_at) 
    VALUES (:invoiceId, :customerId, :subscriptionId, :eventType, :amount, :currency, :status, :createdAt)
    ON CONFLICT (stripe_invoice_id, event_type) DO UPDATE SET
    amount = :amount, currency = :currency, status = :status, updated_at = :createdAt
  `;
  
  await executeQuery(sql, [
    { name: 'invoiceId', value: { stringValue: invoice.id } },
    { name: 'customerId', value: { stringValue: invoice.customer } },
    { name: 'subscriptionId', value: { stringValue: invoice.subscription || null } },
    { name: 'eventType', value: { stringValue: 'created' } },
    { name: 'amount', value: { longValue: invoice.amount_due } },
    { name: 'currency', value: { stringValue: invoice.currency } },
    { name: 'status', value: { stringValue: invoice.status } },
    { name: 'createdAt', value: { stringValue: new Date(invoice.created * 1000).toISOString() } }
  ]);
}

// Handle invoice finalized
async function handleInvoiceFinalized(invoice) {
  console.log(`Invoice finalized: ${invoice.id}`);
  
  // Update invoice status
  const sql = `
    INSERT INTO invoice_events 
    (stripe_invoice_id, stripe_customer_id, stripe_subscription_id, event_type, amount, currency, status, invoice_url, updated_at) 
    VALUES (:invoiceId, :customerId, :subscriptionId, :eventType, :amount, :currency, :status, :invoiceUrl, :updatedAt)
    ON CONFLICT (stripe_invoice_id, event_type) DO UPDATE SET
    amount = :amount, currency = :currency, status = :status, invoice_url = :invoiceUrl, updated_at = :updatedAt
  `;
  
  await executeQuery(sql, [
    { name: 'invoiceId', value: { stringValue: invoice.id } },
    { name: 'customerId', value: { stringValue: invoice.customer } },
    { name: 'subscriptionId', value: { stringValue: invoice.subscription || null } },
    { name: 'eventType', value: { stringValue: 'finalized' } },
    { name: 'amount', value: { longValue: invoice.amount_due } },
    { name: 'currency', value: { stringValue: invoice.currency } },
    { name: 'status', value: { stringValue: invoice.status } },
    { name: 'invoiceUrl', value: { stringValue: invoice.hosted_invoice_url || '' } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

// Handle customer created
async function handleCustomerCreated(customer) {
  const userId = customer.metadata.userId;
  if (!userId) {
    console.warn('No userId in customer metadata');
    return;
  }

  console.log(`Customer created for user ${userId}`);

  // Update or create customer record
  const sql = `
    INSERT INTO stripe_customers 
    (user_id, stripe_customer_id, email, name, created_at, updated_at) 
    VALUES (:userId, :customerId, :email, :name, :createdAt, :updatedAt)
    ON CONFLICT (stripe_customer_id) DO UPDATE SET
    email = :email, name = :name, updated_at = :updatedAt
  `;
  
  await executeQuery(sql, [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'customerId', value: { stringValue: customer.id } },
    { name: 'email', value: { stringValue: customer.email || null } },
    { name: 'name', value: { stringValue: customer.name || null } },
    { name: 'createdAt', value: { stringValue: new Date(customer.created * 1000).toISOString() } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

// Handle customer updated
async function handleCustomerUpdated(customer) {
  console.log(`Customer updated: ${customer.id}`);

  // Update customer record
  const sql = `
    UPDATE stripe_customers 
    SET email = :email, name = :name, updated_at = :updatedAt 
    WHERE stripe_customer_id = :customerId
  `;
  
  await executeQuery(sql, [
    { name: 'email', value: { stringValue: customer.email || null } },
    { name: 'name', value: { stringValue: customer.name || null } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
    { name: 'customerId', value: { stringValue: customer.id } }
  ]);
}

// Handle payment method attached
async function handlePaymentMethodAttached(paymentMethod) {
  console.log(`Payment method attached: ${paymentMethod.id}`);
  
  // Log payment method attachment
  const sql = `
    INSERT INTO payment_method_events 
    (stripe_payment_method_id, stripe_customer_id, event_type, payment_method_type, card_brand, card_last4, created_at) 
    VALUES (:paymentMethodId, :customerId, :eventType, :paymentMethodType, :cardBrand, :cardLast4, :createdAt)
  `;
  
  await executeQuery(sql, [
    { name: 'paymentMethodId', value: { stringValue: paymentMethod.id } },
    { name: 'customerId', value: { stringValue: paymentMethod.customer } },
    { name: 'eventType', value: { stringValue: 'attached' } },
    { name: 'paymentMethodType', value: { stringValue: paymentMethod.type } },
    { name: 'cardBrand', value: { stringValue: paymentMethod.card?.brand || null } },
    { name: 'cardLast4', value: { stringValue: paymentMethod.card?.last4 || null } },
    { name: 'createdAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

// Handle payment method detached
async function handlePaymentMethodDetached(paymentMethod) {
  console.log(`Payment method detached: ${paymentMethod.id}`);
  
  // Log payment method detachment
  const sql = `
    INSERT INTO payment_method_events 
    (stripe_payment_method_id, stripe_customer_id, event_type, payment_method_type, card_brand, card_last4, created_at) 
    VALUES (:paymentMethodId, :customerId, :eventType, :paymentMethodType, :cardBrand, :cardLast4, :createdAt)
  `;
  
  await executeQuery(sql, [
    { name: 'paymentMethodId', value: { stringValue: paymentMethod.id } },
    { name: 'customerId', value: { stringValue: paymentMethod.customer } },
    { name: 'eventType', value: { stringValue: 'detached' } },
    { name: 'paymentMethodType', value: { stringValue: paymentMethod.type } },
    { name: 'cardBrand', value: { stringValue: paymentMethod.card?.brand || null } },
    { name: 'cardLast4', value: { stringValue: paymentMethod.card?.last4 || null } },
    { name: 'createdAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

// Helper functions
async function updateUserAccessLevel(userId, subscriptionStatus) {
  let accessLevel = 'free';
  
  switch (subscriptionStatus) {
    case 'active':
    case 'trialing':
      accessLevel = 'premium';
      break;
    case 'past_due':
      accessLevel = 'limited';
      break;
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      accessLevel = 'free';
      break;
  }

  const sql = `
    UPDATE users 
    SET access_level = :accessLevel, updated_at = :updatedAt 
    WHERE id = :userId
  `;
  
  await executeQuery(sql, [
    { name: 'accessLevel', value: { stringValue: accessLevel } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
    { name: 'userId', value: { stringValue: userId } }
  ]);
}

async function recordOneTimePayment(session) {
  const sql = `
    INSERT INTO one_time_payments 
    (stripe_session_id, stripe_customer_id, user_id, amount, currency, status, description, created_at) 
    VALUES (:sessionId, :customerId, :userId, :amount, :currency, :status, :description, :createdAt)
  `;
  
  await executeQuery(sql, [
    { name: 'sessionId', value: { stringValue: session.id } },
    { name: 'customerId', value: { stringValue: session.customer } },
    { name: 'userId', value: { stringValue: session.metadata?.userId || null } },
    { name: 'amount', value: { longValue: session.amount_total } },
    { name: 'currency', value: { stringValue: session.currency } },
    { name: 'status', value: { stringValue: 'completed' } },
    { name: 'description', value: { stringValue: session.metadata?.description || 'One-time payment' } },
    { name: 'createdAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

async function handleSubscriptionCancellationScheduled(userId, subscription) {
  // Send cancellation confirmation email
  await sendCancellationScheduledEmail(userId, subscription);

  // Log cancellation event
  const sql = `
    INSERT INTO subscription_events 
    (user_id, stripe_subscription_id, event_type, event_data, created_at) 
    VALUES (:userId, :subscriptionId, :eventType, :eventData, :createdAt)
  `;
  
  await executeQuery(sql, [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'subscriptionId', value: { stringValue: subscription.id } },
    { name: 'eventType', value: { stringValue: 'cancellation_scheduled' } },
    { name: 'eventData', value: { stringValue: JSON.stringify({
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_end: subscription.current_period_end,
    }) } },
    { name: 'createdAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

async function logWebhookEvent(event, result) {
  const sql = `
    INSERT INTO webhook_events 
    (stripe_event_id, event_type, success, message, error_message, processed_at, event_data, created_at) 
    VALUES (:eventId, :eventType, :success, :message, :errorMessage, :processedAt, :eventData, :createdAt)
  `;
  
  await executeQuery(sql, [
    { name: 'eventId', value: { stringValue: event.id } },
    { name: 'eventType', value: { stringValue: event.type } },
    { name: 'success', value: { booleanValue: result.success } },
    { name: 'message', value: { stringValue: result.message } },
    { name: 'errorMessage', value: { stringValue: result.error || null } },
    { name: 'processedAt', value: { stringValue: result.processedAt.toISOString() } },
    { name: 'eventData', value: { stringValue: JSON.stringify(event.data.object) } },
    { name: 'createdAt', value: { stringValue: new Date(event.created * 1000).toISOString() } }
  ]);
}

// Email notification functions (using SES)
async function sendEmail(to, subject, body) {
  try {
    const command = new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
        },
        Body: {
          Text: {
            Data: body,
          },
        },
      },
    });

    await sesClient.send(command);
    console.log(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

async function sendWelcomeEmail(userId, subscription) {
  console.log(`Sending welcome email to user ${userId}`);
  
  // Get user email from database
  const userSql = `SELECT email FROM users WHERE id = :userId`;
  const userResult = await executeQuery(userSql, [
    { name: 'userId', value: { stringValue: userId } }
  ]);

  if (userResult.records && userResult.records.length > 0) {
    const userColumns = ['email'];
    const users = formatRDSResults(userResult.records, userColumns);
    const user = users[0];

    await sendEmail(
      user.email,
      'Welcome to HalluciFix Premium!',
      'Thank you for subscribing to HalluciFix Premium. You now have access to all premium features.'
    );
  }

  // Log email sent
  const logSql = `
    INSERT INTO email_notifications 
    (user_id, email_type, stripe_subscription_id, sent_at) 
    VALUES (:userId, :emailType, :subscriptionId, :sentAt)
  `;
  
  await executeQuery(logSql, [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'emailType', value: { stringValue: 'welcome' } },
    { name: 'subscriptionId', value: { stringValue: subscription.id } },
    { name: 'sentAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

async function sendCancellationEmail(userId, subscription) {
  console.log(`Sending cancellation email to user ${userId}`);
  
  const logSql = `
    INSERT INTO email_notifications 
    (user_id, email_type, stripe_subscription_id, sent_at) 
    VALUES (:userId, :emailType, :subscriptionId, :sentAt)
  `;
  
  await executeQuery(logSql, [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'emailType', value: { stringValue: 'cancellation' } },
    { name: 'subscriptionId', value: { stringValue: subscription.id } },
    { name: 'sentAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

async function sendCancellationScheduledEmail(userId, subscription) {
  console.log(`Sending cancellation scheduled email to user ${userId}`);
  
  const logSql = `
    INSERT INTO email_notifications 
    (user_id, email_type, stripe_subscription_id, sent_at) 
    VALUES (:userId, :emailType, :subscriptionId, :sentAt)
  `;
  
  await executeQuery(logSql, [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'emailType', value: { stringValue: 'cancellation_scheduled' } },
    { name: 'subscriptionId', value: { stringValue: subscription.id } },
    { name: 'sentAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

async function sendTrialEndingEmail(userId, subscription) {
  console.log(`Sending trial ending email to user ${userId}`);
  
  const logSql = `
    INSERT INTO email_notifications 
    (user_id, email_type, stripe_subscription_id, sent_at) 
    VALUES (:userId, :emailType, :subscriptionId, :sentAt)
  `;
  
  await executeQuery(logSql, [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'emailType', value: { stringValue: 'trial_ending' } },
    { name: 'subscriptionId', value: { stringValue: subscription.id } },
    { name: 'sentAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

async function sendPaymentConfirmationEmail(invoice) {
  console.log(`Sending payment confirmation email for invoice ${invoice.id}`);
  
  // Get user ID from subscription if available
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const userId = subscription.metadata.userId;
    
    if (userId) {
      const logSql = `
        INSERT INTO email_notifications 
        (user_id, email_type, stripe_invoice_id, sent_at) 
        VALUES (:userId, :emailType, :invoiceId, :sentAt)
      `;
      
      await executeQuery(logSql, [
        { name: 'userId', value: { stringValue: userId } },
        { name: 'emailType', value: { stringValue: 'payment_confirmation' } },
        { name: 'invoiceId', value: { stringValue: invoice.id } },
        { name: 'sentAt', value: { stringValue: new Date().toISOString() } }
      ]);
    }
  }
}

async function sendPaymentFailureEmail(userId, invoice) {
  console.log(`Sending payment failure email to user ${userId}`);
  
  const logSql = `
    INSERT INTO email_notifications 
    (user_id, email_type, stripe_invoice_id, sent_at) 
    VALUES (:userId, :emailType, :invoiceId, :sentAt)
  `;
  
  await executeQuery(logSql, [
    { name: 'userId', value: { stringValue: userId } },
    { name: 'emailType', value: { stringValue: 'payment_failed' } },
    { name: 'invoiceId', value: { stringValue: invoice.id } },
    { name: 'sentAt', value: { stringValue: new Date().toISOString() } }
  ]);
}

async function logBillingAudit(userId, actionType, resourceType, resourceId, oldValues, newValues, success = true, errorMessage) {
  try {
    const sql = `
      INSERT INTO billing_audit_log 
      (user_id, action_type, resource_type, resource_id, old_values, new_values, success, error_message, metadata) 
      VALUES (:userId, :actionType, :resourceType, :resourceId, :oldValues, :newValues, :success, :errorMessage, :metadata)
    `;
    
    await executeQuery(sql, [
      { name: 'userId', value: { stringValue: userId } },
      { name: 'actionType', value: { stringValue: actionType } },
      { name: 'resourceType', value: { stringValue: resourceType } },
      { name: 'resourceId', value: { stringValue: resourceId || null } },
      { name: 'oldValues', value: { stringValue: oldValues ? JSON.stringify(oldValues) : null } },
      { name: 'newValues', value: { stringValue: newValues ? JSON.stringify(newValues) : null } },
      { name: 'success', value: { booleanValue: success } },
      { name: 'errorMessage', value: { stringValue: errorMessage || null } },
      { name: 'metadata', value: { stringValue: JSON.stringify({
        webhook_processed: true,
        processed_at: new Date().toISOString(),
      }) } }
    ]);
  } catch (error) {
    console.error('Billing audit logging error:', error);
  }
}

// Main Lambda handler
exports.handler = async (event, context) => {
  console.log('Stripe Webhook Lambda invoked:', JSON.stringify(event, null, 2));

  try {
    // Initialize Stripe
    const { stripe: stripeClient, webhookSecret: secret } = await initializeStripe();
    stripe = stripeClient;
    webhookSecret = secret;

    // Get the raw body and signature
    const body = event.body;
    const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

    if (!signature) {
      console.error('Missing Stripe signature');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing signature' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // Verify webhook signature
    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid signature' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    console.log(`Processing webhook event: ${stripeEvent.type} (${stripeEvent.id})`);

    // Check for idempotency - prevent duplicate processing
    if (processedEvents.has(stripeEvent.id)) {
      const previousResult = processedEvents.get(stripeEvent.id);
      console.log(`Event ${stripeEvent.id} already processed at ${previousResult.processedAt}`);
      return {
        statusCode: previousResult.success ? 200 : 500,
        body: JSON.stringify(previousResult),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // Process the webhook event
    const result = await processWebhookEvent(stripeEvent);
    
    // Store result for idempotency
    processedEvents.set(stripeEvent.id, result);

    // Clean up old processed events (keep last 100 in memory)
    if (processedEvents.size > 100) {
      const oldestKeys = Array.from(processedEvents.keys()).slice(0, 10);
      oldestKeys.forEach(key => processedEvents.delete(key));
    }

    return {
      statusCode: result.success ? 200 : 500,
      body: JSON.stringify(result),
      headers: { 'Content-Type': 'application/json' }
    };

  } catch (error) {
    console.error('Webhook handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: error.message,
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};