/**
 * Stripe Webhook Handler
 * Processes Stripe webhook events for subscription and payment management
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0';

import { logger } from './logging';
// Environment variables
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize Stripe and Supabase clients
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Webhook event processing status
interface WebhookProcessingResult {
  success: boolean;
  message: string;
  eventId: string;
  eventType: string;
  processedAt: Date;
  error?: string;
}

// Idempotency tracking
const processedEvents = new Map<string, WebhookProcessingResult>();

/**
 * Main webhook handler
 */
serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Get the raw body and signature
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      logger.error("Missing Stripe signature");
      return new Response('Missing signature', { status: 400 });
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      logger.error("Webhook signature verification failed:", error instanceof Error ? error : new Error(String(error)));
      return new Response('Invalid signature', { status: 400 });
    }

    console.log(`Processing webhook event: ${event.type} (${event.id})`);

    // Check for idempotency - prevent duplicate processing
    if (processedEvents.has(event.id)) {
      const previousResult = processedEvents.get(event.id)!;
      console.log(`Event ${event.id} already processed at ${previousResult.processedAt}`);
      return new Response(JSON.stringify(previousResult), {
        status: previousResult.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Process the webhook event
    const result = await processWebhookEvent(event);
    
    // Store result for idempotency
    processedEvents.set(event.id, result);

    // Clean up old processed events (keep last 1000)
    if (processedEvents.size > 1000) {
      const oldestKeys = Array.from(processedEvents.keys()).slice(0, 100);
      oldestKeys.forEach(key => processedEvents.delete(key));
    }

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error("Webhook handler error:", error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Process individual webhook events
 */
async function processWebhookEvent(event: Stripe.Event): Promise<WebhookProcessingResult> {
  const result: WebhookProcessingResult = {
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
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        result.success = true;
        result.message = 'Checkout session completed successfully';
        break;

      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
        result.success = true;
        result.message = 'Checkout session expired processed';
        break;

      // Subscription lifecycle events
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        result.success = true;
        result.message = 'Subscription created successfully';
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        result.success = true;
        result.message = 'Subscription updated successfully';
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        result.success = true;
        result.message = 'Subscription deleted successfully';
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        result.success = true;
        result.message = 'Trial ending notification processed';
        break;

      // Payment and invoice events
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        result.success = true;
        result.message = 'Payment succeeded processed';
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        result.success = true;
        result.message = 'Payment failed processed';
        break;

      case 'invoice.created':
        await handleInvoiceCreated(event.data.object as Stripe.Invoice);
        result.success = true;
        result.message = 'Invoice created processed';
        break;

      case 'invoice.finalized':
        await handleInvoiceFinalized(event.data.object as Stripe.Invoice);
        result.success = true;
        result.message = 'Invoice finalized processed';
        break;

      // Customer events
      case 'customer.created':
        await handleCustomerCreated(event.data.object as Stripe.Customer);
        result.success = true;
        result.message = 'Customer created processed';
        break;

      case 'customer.updated':
        await handleCustomerUpdated(event.data.object as Stripe.Customer);
        result.success = true;
        result.message = 'Customer updated processed';
        break;

      // Payment method events
      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
        result.success = true;
        result.message = 'Payment method attached processed';
        break;

      case 'payment_method.detached':
        await handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod);
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
    result.error = error instanceof Error ? error.message : 'Unknown error';

    // Log failed processing
    await logWebhookEvent(event, result);
  }

  return result;
}

/**
 * Handle checkout session completed
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  if (!userId) {
    throw new Error('No userId in session metadata');
  }

  console.log(`Processing checkout completion for user ${userId}`);

  // If this is a subscription checkout, the subscription will be handled by subscription.created event
  if (session.mode === 'subscription') {
    logger.debug("Subscription checkout - will be handled by subscription.created event");
    return;
  }

  // Handle one-time payments if needed
  if (session.mode === 'payment') {
    await recordOneTimePayment(session);
  }
}

/**
 * Handle checkout session expired
 */
async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  console.log(`Checkout session expired: ${session.id}`);
  
  // Log the expired session for analytics
  const { error } = await supabase
    .from('checkout_sessions')
    .upsert({
      stripe_session_id: session.id,
      user_id: session.metadata?.userId,
      status: 'expired',
      mode: session.mode,
      amount_total: session.amount_total,
      currency: session.currency,
      expires_at: new Date(session.expires_at * 1000),
      updated_at: new Date(),
    });

  if (error) {
    logger.error("Failed to record expired checkout session:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata.userId;
  if (!userId) {
    logger.warn("No userId in subscription metadata");
    return;
  }

  console.log(`Creating subscription for user ${userId}`);

  // Save subscription to database
  const { error } = await supabase
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      plan_id: subscription.items.data[0].price.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      created_at: new Date(),
      updated_at: new Date(),
    });

  if (error) {
    throw new Error(`Failed to save subscription: ${error.message}`);
  }

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

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata.userId;
  if (!userId) {
    logger.warn("No userId in subscription metadata");
    return;
  }

  console.log(`Updating subscription for user ${userId}`);

  // Update subscription in database
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      plan_id: subscription.items.data[0].price.id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      ended_at: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
      updated_at: new Date(),
    })
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    throw new Error(`Failed to update subscription: ${error.message}`);
  }

  // Update user access level
  await updateUserAccessLevel(userId, subscription.status);

  // Log audit event
  await logBillingAudit(
    userId,
    'subscription_updated',
    'subscription',
    subscription.id,
    null, // Would need to fetch old values in real implementation
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

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata.userId;
  if (!userId) {
    logger.warn("No userId in subscription metadata");
    return;
  }

  console.log(`Deleting subscription for user ${userId}`);

  // Update subscription status
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date(subscription.canceled_at! * 1000),
      ended_at: new Date(subscription.ended_at! * 1000),
      updated_at: new Date(),
    })
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    throw new Error(`Failed to delete subscription: ${error.message}`);
  }

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

/**
 * Handle trial will end notification
 */
async function handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata.userId;
  if (!userId) {
    logger.warn("No userId in subscription metadata");
    return;
  }

  console.log(`Trial ending soon for user ${userId}`);

  // Send trial ending notification
  await sendTrialEndingEmail(userId, subscription);

  // Log trial ending event
  const { error } = await supabase
    .from('subscription_events')
    .insert({
      user_id: userId,
      stripe_subscription_id: subscription.id,
      event_type: 'trial_will_end',
      event_data: {
        trial_end: subscription.trial_end,
        days_remaining: Math.ceil((subscription.trial_end! * 1000 - Date.now()) / (24 * 60 * 60 * 1000)),
      },
      created_at: new Date(),
    });

  if (error) {
    logger.error("Failed to log trial ending event:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle payment succeeded
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  console.log(`Payment succeeded for invoice ${invoice.id}`);

  // Record successful payment
  const { error } = await supabase
    .from('payment_history')
    .insert({
      stripe_invoice_id: invoice.id,
      stripe_customer_id: invoice.customer as string,
      stripe_subscription_id: invoice.subscription as string,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'paid',
      invoice_url: invoice.hosted_invoice_url,
      description: invoice.description || 'Subscription payment',
      period_start: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      period_end: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      created_at: new Date(invoice.created * 1000),
    });

  if (error) {
    throw new Error(`Failed to record payment: ${error.message}`);
  }

  // Log audit event for payment success
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
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

/**
 * Handle payment failed
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  console.log(`Payment failed for invoice ${invoice.id}`);

  // Record failed payment
  const { error } = await supabase
    .from('payment_history')
    .insert({
      stripe_invoice_id: invoice.id,
      stripe_customer_id: invoice.customer as string,
      stripe_subscription_id: invoice.subscription as string,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
      invoice_url: invoice.hosted_invoice_url,
      description: invoice.description || 'Subscription payment',
      failure_reason: invoice.last_finalization_error?.message,
      period_start: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      period_end: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      created_at: new Date(invoice.created * 1000),
    });

  if (error) {
    throw new Error(`Failed to record failed payment: ${error.message}`);
  }

  // Get user ID from subscription
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
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
      await supabase
        .from('subscription_events')
        .insert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          event_type: 'payment_failed',
          event_data: {
            invoice_id: invoice.id,
            amount: invoice.amount_due,
            attempt_count: invoice.attempt_count,
            next_payment_attempt: invoice.next_payment_attempt,
          },
          created_at: new Date(),
        });
    }
  }
}

/**
 * Handle invoice created
 */
async function handleInvoiceCreated(invoice: Stripe.Invoice): Promise<void> {
  console.log(`Invoice created: ${invoice.id}`);
  
  // Log invoice creation for tracking
  const { error } = await supabase
    .from('invoice_events')
    .insert({
      stripe_invoice_id: invoice.id,
      stripe_customer_id: invoice.customer as string,
      stripe_subscription_id: invoice.subscription as string,
      event_type: 'created',
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: invoice.status,
      created_at: new Date(invoice.created * 1000),
    });

  if (error) {
    logger.error("Failed to log invoice creation:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle invoice finalized
 */
async function handleInvoiceFinalized(invoice: Stripe.Invoice): Promise<void> {
  console.log(`Invoice finalized: ${invoice.id}`);
  
  // Update invoice status
  const { error } = await supabase
    .from('invoice_events')
    .upsert({
      stripe_invoice_id: invoice.id,
      stripe_customer_id: invoice.customer as string,
      stripe_subscription_id: invoice.subscription as string,
      event_type: 'finalized',
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: invoice.status,
      invoice_url: invoice.hosted_invoice_url,
      updated_at: new Date(),
    });

  if (error) {
    logger.error("Failed to update invoice status:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle customer created
 */
async function handleCustomerCreated(customer: Stripe.Customer): Promise<void> {
  const userId = customer.metadata.userId;
  if (!userId) {
    logger.warn("No userId in customer metadata");
    return;
  }

  console.log(`Customer created for user ${userId}`);

  // Update or create customer record
  const { error } = await supabase
    .from('stripe_customers')
    .upsert({
      user_id: userId,
      stripe_customer_id: customer.id,
      email: customer.email,
      name: customer.name,
      created_at: new Date(customer.created * 1000),
      updated_at: new Date(),
    });

  if (error) {
    logger.error("Failed to save customer:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle customer updated
 */
async function handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
  console.log(`Customer updated: ${customer.id}`);

  // Update customer record
  const { error } = await supabase
    .from('stripe_customers')
    .update({
      email: customer.email,
      name: customer.name,
      updated_at: new Date(),
    })
    .eq('stripe_customer_id', customer.id);

  if (error) {
    logger.error("Failed to update customer:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle payment method attached
 */
async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod): Promise<void> {
  console.log(`Payment method attached: ${paymentMethod.id}`);
  
  // Log payment method attachment
  const { error } = await supabase
    .from('payment_method_events')
    .insert({
      stripe_payment_method_id: paymentMethod.id,
      stripe_customer_id: paymentMethod.customer as string,
      event_type: 'attached',
      payment_method_type: paymentMethod.type,
      card_brand: paymentMethod.card?.brand,
      card_last4: paymentMethod.card?.last4,
      created_at: new Date(),
    });

  if (error) {
    logger.error("Failed to log payment method attachment:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle payment method detached
 */
async function handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod): Promise<void> {
  console.log(`Payment method detached: ${paymentMethod.id}`);
  
  // Log payment method detachment
  const { error } = await supabase
    .from('payment_method_events')
    .insert({
      stripe_payment_method_id: paymentMethod.id,
      stripe_customer_id: paymentMethod.customer as string,
      event_type: 'detached',
      payment_method_type: paymentMethod.type,
      card_brand: paymentMethod.card?.brand,
      card_last4: paymentMethod.card?.last4,
      created_at: new Date(),
    });

  if (error) {
    logger.error("Failed to log payment method detachment:", error instanceof Error ? error : new Error(String(error)));
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Update user access level based on subscription status
 */
async function updateUserAccessLevel(userId: string, subscriptionStatus: string): Promise<void> {
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

  const { error } = await supabase
    .from('users')
    .update({
      access_level: accessLevel,
      updated_at: new Date(),
    })
    .eq('id', userId);

  if (error) {
    logger.error("Failed to update user access level:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Record one-time payment
 */
async function recordOneTimePayment(session: Stripe.Checkout.Session): Promise<void> {
  const { error } = await supabase
    .from('one_time_payments')
    .insert({
      stripe_session_id: session.id,
      stripe_customer_id: session.customer as string,
      user_id: session.metadata?.userId,
      amount: session.amount_total!,
      currency: session.currency!,
      status: 'completed',
      description: session.metadata?.description || 'One-time payment',
      created_at: new Date(),
    });

  if (error) {
    logger.error("Failed to record one-time payment:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Handle subscription cancellation scheduled
 */
async function handleSubscriptionCancellationScheduled(userId: string, subscription: Stripe.Subscription): Promise<void> {
  // Send cancellation confirmation email
  await sendCancellationScheduledEmail(userId, subscription);

  // Log cancellation event
  const { error } = await supabase
    .from('subscription_events')
    .insert({
      user_id: userId,
      stripe_subscription_id: subscription.id,
      event_type: 'cancellation_scheduled',
      event_data: {
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: subscription.current_period_end,
      },
      created_at: new Date(),
    });

  if (error) {
    logger.error("Failed to log cancellation event:", error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Log webhook event for monitoring and debugging
 */
async function logWebhookEvent(event: Stripe.Event, result: WebhookProcessingResult): Promise<void> {
  const { error } = await supabase
    .from('webhook_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      success: result.success,
      message: result.message,
      error_message: result.error,
      processed_at: result.processedAt,
      event_data: event.data.object,
      created_at: new Date(event.created * 1000),
    });

  if (error) {
    logger.error("Failed to log webhook event:", error instanceof Error ? error : new Error(String(error)));
  }
}

// =============================================================================
// EMAIL NOTIFICATION FUNCTIONS
// =============================================================================

/**
 * Send welcome email to new subscriber
 */
async function sendWelcomeEmail(userId: string, subscription: Stripe.Subscription): Promise<void> {
  // Implementation would depend on your email service
  console.log(`Sending welcome email to user ${userId}`);
  
  // Log email sent
  await supabase
    .from('email_notifications')
    .insert({
      user_id: userId,
      email_type: 'welcome',
      stripe_subscription_id: subscription.id,
      sent_at: new Date(),
    });
}

/**
 * Send cancellation email
 */
async function sendCancellationEmail(userId: string, subscription: Stripe.Subscription): Promise<void> {
  console.log(`Sending cancellation email to user ${userId}`);
  
  await supabase
    .from('email_notifications')
    .insert({
      user_id: userId,
      email_type: 'cancellation',
      stripe_subscription_id: subscription.id,
      sent_at: new Date(),
    });
}

/**
 * Send cancellation scheduled email
 */
async function sendCancellationScheduledEmail(userId: string, subscription: Stripe.Subscription): Promise<void> {
  console.log(`Sending cancellation scheduled email to user ${userId}`);
  
  await supabase
    .from('email_notifications')
    .insert({
      user_id: userId,
      email_type: 'cancellation_scheduled',
      stripe_subscription_id: subscription.id,
      sent_at: new Date(),
    });
}

/**
 * Send trial ending email
 */
async function sendTrialEndingEmail(userId: string, subscription: Stripe.Subscription): Promise<void> {
  console.log(`Sending trial ending email to user ${userId}`);
  
  await supabase
    .from('email_notifications')
    .insert({
      user_id: userId,
      email_type: 'trial_ending',
      stripe_subscription_id: subscription.id,
      sent_at: new Date(),
    });
}

/**
 * Send payment confirmation email
 */
async function sendPaymentConfirmationEmail(invoice: Stripe.Invoice): Promise<void> {
  console.log(`Sending payment confirmation email for invoice ${invoice.id}`);
  
  // Get user ID from subscription if available
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
    const userId = subscription.metadata.userId;
    
    if (userId) {
      await supabase
        .from('email_notifications')
        .insert({
          user_id: userId,
          email_type: 'payment_confirmation',
          stripe_invoice_id: invoice.id,
          sent_at: new Date(),
        });
    }
  }
}

/**
 * Send payment failure email
 */
async function sendPaymentFailureEmail(userId: string, invoice: Stripe.Invoice): Promise<void> {
  console.log(`Sending payment failure email to user ${userId}`);
  
  await supabase
    .from('email_notifications')
    .insert({
      user_id: userId,
      email_type: 'payment_failed',
      stripe_invoice_id: invoice.id,
      sent_at: new Date(),
    });
}

/**
 * Log billing audit event
 */
async function logBillingAudit(
  userId: string,
  actionType: string,
  resourceType: string,
  resourceId?: string,
  oldValues?: any,
  newValues?: any,
  success: boolean = true,
  errorMessage?: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('billing_audit_log')
      .insert({
        user_id: userId,
        action_type: actionType,
        resource_type: resourceType,
        resource_id: resourceId,
        old_values: oldValues,
        new_values: newValues,
        success,
        error_message: errorMessage,
        metadata: {
          webhook_processed: true,
          processed_at: new Date().toISOString(),
        },
      });

    if (error) {
      logger.error("Failed to log billing audit:", error instanceof Error ? error : new Error(String(error)));
    }
  } catch (error) {
    logger.error("Billing audit logging error:", error instanceof Error ? error : new Error(String(error)));
  }
}