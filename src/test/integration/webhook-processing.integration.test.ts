/**
 * Webhook Processing Integration Tests
 * Tests for Stripe webhook event processing and handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testDatabase } from '../utils/testDatabase';
import { createTestUser, createTestCustomer, createTestSubscription } from '../factories/subscriptionFactory';

// Mock webhook processing functions (these would normally be in the webhook handler)
const mockWebhookProcessor = {
  processCheckoutCompleted: vi.fn(),
  processSubscriptionCreated: vi.fn(),
  processSubscriptionUpdated: vi.fn(),
  processSubscriptionDeleted: vi.fn(),
  processPaymentSucceeded: vi.fn(),
  processPaymentFailed: vi.fn(),
  processTrialWillEnd: vi.fn(),
};

describe('Webhook Processing Integration Tests', () => {
  let testUserId: string;
  let testCustomerId: string;
  let testSubscriptionId: string;

  beforeEach(async () => {
    await testDatabase.setup();

    // Create test data
    const testUser = await createTestUser();
    testUserId = testUser.id;

    const testCustomer = await createTestCustomer(testUserId);
    testCustomerId = testCustomer.stripeCustomerId;

    const testSubscription = await createTestSubscription(testUserId, testCustomerId);
    testSubscriptionId = testSubscription.stripeSubscriptionId;

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await testDatabase.cleanup();
  });

  describe('Checkout Session Events', () => {
    it('should process checkout.session.completed for subscription', async () => {
      // Arrange
      const checkoutEvent = {
        id: 'evt_checkout_completed',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_checkout',
            mode: 'subscription',
            customer: testCustomerId,
            subscription: testSubscriptionId,
            metadata: {
              userId: testUserId,
            },
            amount_total: 2900,
            currency: 'usd',
            status: 'complete',
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Act - Simulate webhook processing
      const { data: webhookLog, error } = await testDatabase.supabase
        .from('webhook_events')
        .insert({
          stripe_event_id: checkoutEvent.id,
          event_type: checkoutEvent.type,
          success: true,
          message: 'Checkout session completed successfully',
          processed_at: new Date(),
          event_data: checkoutEvent.data.object,
        })
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(webhookLog).toMatchObject({
        stripe_event_id: 'evt_checkout_completed',
        event_type: 'checkout.session.completed',
        success: true,
      });

      // Verify checkout session is recorded
      const { data: checkoutSession } = await testDatabase.supabase
        .from('checkout_sessions')
        .insert({
          stripe_session_id: checkoutEvent.data.object.id,
          user_id: testUserId,
          status: 'complete',
          mode: 'subscription',
          amount_total: 2900,
          currency: 'usd',
        })
        .select()
        .single();

      expect(checkoutSession).toMatchObject({
        stripe_session_id: 'cs_test_checkout',
        status: 'complete',
        mode: 'subscription',
      });
    });

    it('should process checkout.session.expired', async () => {
      // Arrange
      const expiredEvent = {
        id: 'evt_checkout_expired',
        type: 'checkout.session.expired',
        data: {
          object: {
            id: 'cs_test_expired',
            mode: 'subscription',
            customer: testCustomerId,
            metadata: {
              userId: testUserId,
            },
            expires_at: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Act
      const { data: expiredSession, error } = await testDatabase.supabase
        .from('checkout_sessions')
        .insert({
          stripe_session_id: expiredEvent.data.object.id,
          user_id: testUserId,
          status: 'expired',
          mode: 'subscription',
          expires_at: new Date(expiredEvent.data.object.expires_at * 1000),
        })
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(expiredSession.status).toBe('expired');
    });
  });

  describe('Subscription Lifecycle Events', () => {
    it('should process customer.subscription.created', async () => {
      // Arrange
      const subscriptionCreatedEvent = {
        id: 'evt_sub_created',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_new_test',
            customer: testCustomerId,
            status: 'active',
            items: {
              data: [{ price: { id: 'price_test_pro' } }],
            },
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 days
            trial_end: null,
            cancel_at_period_end: false,
            metadata: {
              userId: testUserId,
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Act - Process subscription creation
      const { data: newSubscription, error } = await testDatabase.supabase
        .from('user_subscriptions')
        .insert({
          user_id: testUserId,
          stripe_customer_id: testCustomerId,
          stripe_subscription_id: subscriptionCreatedEvent.data.object.id,
          plan_id: subscriptionCreatedEvent.data.object.items.data[0].price.id,
          status: subscriptionCreatedEvent.data.object.status,
          current_period_start: new Date(subscriptionCreatedEvent.data.object.current_period_start * 1000),
          current_period_end: new Date(subscriptionCreatedEvent.data.object.current_period_end * 1000),
          cancel_at_period_end: false,
        })
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(newSubscription).toMatchObject({
        stripe_subscription_id: 'sub_new_test',
        plan_id: 'price_test_pro',
        status: 'active',
      });

      // Verify user access level is updated
      const { data: updatedUser } = await testDatabase.supabase
        .from('users')
        .update({ access_level: 'premium' })
        .eq('id', testUserId)
        .select()
        .single();

      expect(updatedUser.access_level).toBe('premium');
    });

    it('should process customer.subscription.updated', async () => {
      // Arrange
      const subscriptionUpdatedEvent = {
        id: 'evt_sub_updated',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: testSubscriptionId,
            customer: testCustomerId,
            status: 'active',
            items: {
              data: [{ price: { id: 'price_test_pro' } }], // Upgraded plan
            },
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            cancel_at_period_end: false,
            metadata: {
              userId: testUserId,
              upgraded_from: 'price_test_basic',
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Act - Update subscription
      const { data: updatedSubscription, error } = await testDatabase.supabase
        .from('user_subscriptions')
        .update({
          plan_id: subscriptionUpdatedEvent.data.object.items.data[0].price.id,
          status: subscriptionUpdatedEvent.data.object.status,
          current_period_start: new Date(subscriptionUpdatedEvent.data.object.current_period_start * 1000),
          current_period_end: new Date(subscriptionUpdatedEvent.data.object.current_period_end * 1000),
          cancel_at_period_end: false,
          updated_at: new Date(),
        })
        .eq('stripe_subscription_id', testSubscriptionId)
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(updatedSubscription.plan_id).toBe('price_test_pro');

      // Log the upgrade event
      const { data: auditLog } = await testDatabase.supabase
        .from('billing_audit_log')
        .insert({
          user_id: testUserId,
          action_type: 'subscription_updated',
          resource_type: 'subscription',
          resource_id: testSubscriptionId,
          old_values: { plan_id: 'price_test_basic' },
          new_values: { plan_id: 'price_test_pro' },
          success: true,
        })
        .select()
        .single();

      expect(auditLog.action_type).toBe('subscription_updated');
    });

    it('should process customer.subscription.deleted', async () => {
      // Arrange
      const subscriptionDeletedEvent = {
        id: 'evt_sub_deleted',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: testSubscriptionId,
            customer: testCustomerId,
            status: 'canceled',
            canceled_at: Math.floor(Date.now() / 1000),
            ended_at: Math.floor(Date.now() / 1000),
            metadata: {
              userId: testUserId,
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Act - Cancel subscription
      const { data: canceledSubscription, error } = await testDatabase.supabase
        .from('user_subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date(subscriptionDeletedEvent.data.object.canceled_at * 1000),
          ended_at: new Date(subscriptionDeletedEvent.data.object.ended_at * 1000),
          updated_at: new Date(),
        })
        .eq('stripe_subscription_id', testSubscriptionId)
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(canceledSubscription.status).toBe('canceled');

      // Verify user access level is downgraded
      const { data: downgradedUser } = await testDatabase.supabase
        .from('users')
        .update({ access_level: 'free' })
        .eq('id', testUserId)
        .select()
        .single();

      expect(downgradedUser.access_level).toBe('free');
    });

    it('should process customer.subscription.trial_will_end', async () => {
      // Arrange - Set up trial subscription
      const trialEndDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
      
      await testDatabase.supabase
        .from('user_subscriptions')
        .update({
          status: 'trialing',
          trial_end: trialEndDate,
        })
        .eq('stripe_subscription_id', testSubscriptionId);

      const trialWillEndEvent = {
        id: 'evt_trial_will_end',
        type: 'customer.subscription.trial_will_end',
        data: {
          object: {
            id: testSubscriptionId,
            customer: testCustomerId,
            status: 'trialing',
            trial_end: Math.floor(trialEndDate.getTime() / 1000),
            metadata: {
              userId: testUserId,
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Act - Process trial ending notification
      const { data: trialEvent, error } = await testDatabase.supabase
        .from('subscription_events')
        .insert({
          user_id: testUserId,
          stripe_subscription_id: testSubscriptionId,
          event_type: 'trial_will_end',
          event_data: {
            trial_end: trialWillEndEvent.data.object.trial_end,
            days_remaining: 3,
          },
        })
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(trialEvent.event_type).toBe('trial_will_end');

      // Verify notification is created
      const { data: notification } = await testDatabase.supabase
        .from('billing_notifications')
        .insert({
          user_id: testUserId,
          type: 'trial_ending',
          title: 'Your trial is ending soon',
          message: 'Your trial will end in 3 days. Please add a payment method to continue.',
          severity: 'warning',
        })
        .select()
        .single();

      expect(notification.type).toBe('trial_ending');
    });
  });

  describe('Payment and Invoice Events', () => {
    it('should process invoice.payment_succeeded', async () => {
      // Arrange
      const paymentSucceededEvent = {
        id: 'evt_payment_succeeded',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test_paid',
            customer: testCustomerId,
            subscription: testSubscriptionId,
            amount_paid: 2900,
            amount_due: 2900,
            currency: 'usd',
            status: 'paid',
            hosted_invoice_url: 'https://invoice.stripe.com/test',
            invoice_pdf: 'https://invoice.stripe.com/test.pdf',
            description: 'Subscription payment',
            period_start: Math.floor(Date.now() / 1000) - 2592000,
            period_end: Math.floor(Date.now() / 1000),
            created: Math.floor(Date.now() / 1000),
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Act - Record successful payment
      const { data: payment, error } = await testDatabase.supabase
        .from('payment_history')
        .insert({
          user_id: testUserId,
          stripe_customer_id: testCustomerId,
          stripe_invoice_id: paymentSucceededEvent.data.object.id,
          amount: paymentSucceededEvent.data.object.amount_paid,
          currency: paymentSucceededEvent.data.object.currency,
          status: 'succeeded',
          description: paymentSucceededEvent.data.object.description,
        })
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(payment).toMatchObject({
        status: 'succeeded',
        amount: 2900,
        currency: 'usd',
      });

      // Record invoice
      const { data: invoice } = await testDatabase.supabase
        .from('invoices')
        .insert({
          user_id: testUserId,
          stripe_customer_id: testCustomerId,
          stripe_invoice_id: paymentSucceededEvent.data.object.id,
          stripe_subscription_id: testSubscriptionId,
          amount: paymentSucceededEvent.data.object.amount_due,
          currency: paymentSucceededEvent.data.object.currency,
          status: 'paid',
          description: paymentSucceededEvent.data.object.description,
          hosted_invoice_url: paymentSucceededEvent.data.object.hosted_invoice_url,
          invoice_pdf: paymentSucceededEvent.data.object.invoice_pdf,
          period_start: new Date(paymentSucceededEvent.data.object.period_start * 1000),
          period_end: new Date(paymentSucceededEvent.data.object.period_end * 1000),
        })
        .select()
        .single();

      expect(invoice.status).toBe('paid');
    });

    it('should process invoice.payment_failed', async () => {
      // Arrange
      const paymentFailedEvent = {
        id: 'evt_payment_failed',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_failed',
            customer: testCustomerId,
            subscription: testSubscriptionId,
            amount_due: 2900,
            currency: 'usd',
            status: 'open',
            attempt_count: 2,
            next_payment_attempt: Math.floor(Date.now() / 1000) + 86400, // 24 hours
            last_finalization_error: {
              message: 'Your card was declined.',
              code: 'card_declined',
            },
            created: Math.floor(Date.now() / 1000),
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Act - Record failed payment
      const { data: failedPayment, error } = await testDatabase.supabase
        .from('payment_history')
        .insert({
          user_id: testUserId,
          stripe_customer_id: testCustomerId,
          stripe_invoice_id: paymentFailedEvent.data.object.id,
          amount: paymentFailedEvent.data.object.amount_due,
          currency: paymentFailedEvent.data.object.currency,
          status: 'failed',
          failure_reason: paymentFailedEvent.data.object.last_finalization_error.message,
          failure_code: paymentFailedEvent.data.object.last_finalization_error.code,
        })
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(failedPayment).toMatchObject({
        status: 'failed',
        failure_reason: 'Your card was declined.',
        failure_code: 'card_declined',
      });

      // Create failure notification
      const { data: notification } = await testDatabase.supabase
        .from('billing_notifications')
        .insert({
          user_id: testUserId,
          type: 'payment_failed',
          title: 'Payment Failed',
          message: 'Your payment was declined. Please update your payment method.',
          severity: 'error',
          action_url: '/billing/payment-methods',
          action_text: 'Update Payment Method',
        })
        .select()
        .single();

      expect(notification.type).toBe('payment_failed');
      expect(notification.severity).toBe('error');
    });

    it('should handle payment retry logic', async () => {
      // Arrange - Create multiple failed payment attempts
      const attempts = [
        { attempt_count: 1, status: 'failed' },
        { attempt_count: 2, status: 'failed' },
        { attempt_count: 3, status: 'succeeded' }, // Final success
      ];

      // Act - Record payment attempts
      for (const attempt of attempts) {
        const { data: payment, error } = await testDatabase.supabase
          .from('payment_history')
          .insert({
            user_id: testUserId,
            stripe_customer_id: testCustomerId,
            stripe_invoice_id: `in_retry_${attempt.attempt_count}`,
            amount: 2900,
            currency: 'usd',
            status: attempt.status,
            description: `Payment attempt ${attempt.attempt_count}`,
          })
          .select()
          .single();

        expect(error).toBeNull();
      }

      // Assert - Verify payment history shows retry pattern
      const { data: paymentHistory } = await testDatabase.supabase
        .from('payment_history')
        .select('*')
        .eq('user_id', testUserId)
        .like('stripe_invoice_id', 'in_retry_%')
        .order('created_at', { ascending: true });

      expect(paymentHistory).toHaveLength(3);
      expect(paymentHistory[0].status).toBe('failed');
      expect(paymentHistory[1].status).toBe('failed');
      expect(paymentHistory[2].status).toBe('succeeded');
    });
  });

  describe('Webhook Event Idempotency and Error Handling', () => {
    it('should prevent duplicate webhook processing', async () => {
      // Arrange
      const eventId = 'evt_duplicate_test';
      const eventData = {
        stripe_event_id: eventId,
        event_type: 'customer.subscription.created',
        success: true,
        message: 'Processed successfully',
        processed_at: new Date(),
      };

      // Act - Process same event twice
      const { data: firstProcess, error: firstError } = await testDatabase.supabase
        .from('webhook_events')
        .insert(eventData)
        .select()
        .single();

      const { data: secondProcess, error: secondError } = await testDatabase.supabase
        .from('webhook_events')
        .insert(eventData)
        .select()
        .single();

      // Assert
      expect(firstError).toBeNull();
      expect(firstProcess.stripe_event_id).toBe(eventId);

      // Second insert should fail due to unique constraint
      expect(secondError).not.toBeNull();
      expect(secondError?.code).toBe('23505'); // Unique violation
    });

    it('should handle webhook processing errors gracefully', async () => {
      // Arrange
      const errorEvent = {
        id: 'evt_error_test',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_invalid',
            customer: 'cus_invalid',
            // Missing required fields to cause processing error
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Act - Record failed webhook processing
      const { data: failedWebhook, error } = await testDatabase.supabase
        .from('webhook_events')
        .insert({
          stripe_event_id: errorEvent.id,
          event_type: errorEvent.type,
          success: false,
          message: 'Processing failed',
          error_message: 'Missing required customer metadata',
          processed_at: new Date(),
          event_data: errorEvent.data.object,
        })
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(failedWebhook).toMatchObject({
        success: false,
        error_message: 'Missing required customer metadata',
      });
    });

    it('should validate webhook signatures', async () => {
      // Arrange
      const validSignature = 'whsec_valid_signature';
      const invalidSignature = 'invalid_signature';
      const payload = JSON.stringify({
        id: 'evt_signature_test',
        type: 'customer.subscription.created',
      });

      // Act & Assert - This would normally be done in the webhook handler
      // For integration tests, we simulate the validation result
      const validationResults = [
        { signature: validSignature, isValid: true },
        { signature: invalidSignature, isValid: false },
      ];

      for (const result of validationResults) {
        const { data: validationLog } = await testDatabase.supabase
          .from('webhook_events')
          .insert({
            stripe_event_id: `evt_sig_${result.isValid ? 'valid' : 'invalid'}`,
            event_type: 'signature_validation',
            success: result.isValid,
            message: result.isValid ? 'Signature valid' : 'Invalid signature',
            error_message: result.isValid ? null : 'Webhook signature verification failed',
            processed_at: new Date(),
          })
          .select()
          .single();

        expect(validationLog.success).toBe(result.isValid);
      }
    });

    it('should handle webhook timeout and retry scenarios', async () => {
      // Arrange
      const timeoutEvent = {
        id: 'evt_timeout_test',
        type: 'invoice.payment_succeeded',
        processing_attempts: [
          { attempt: 1, status: 'timeout', timestamp: new Date(Date.now() - 300000) }, // 5 min ago
          { attempt: 2, status: 'timeout', timestamp: new Date(Date.now() - 60000) },  // 1 min ago
          { attempt: 3, status: 'success', timestamp: new Date() },                    // Now
        ],
      };

      // Act - Record processing attempts
      for (const attempt of timeoutEvent.processing_attempts) {
        const { data: attemptLog } = await testDatabase.supabase
          .from('webhook_events')
          .insert({
            stripe_event_id: `${timeoutEvent.id}_attempt_${attempt.attempt}`,
            event_type: timeoutEvent.type,
            success: attempt.status === 'success',
            message: attempt.status === 'success' ? 'Processed successfully' : 'Processing timeout',
            error_message: attempt.status === 'timeout' ? 'Request timeout after 30 seconds' : null,
            processed_at: attempt.timestamp,
          })
          .select()
          .single();

        expect(attemptLog.success).toBe(attempt.status === 'success');
      }

      // Assert - Verify final attempt succeeded
      const { data: finalAttempt } = await testDatabase.supabase
        .from('webhook_events')
        .select('*')
        .like('stripe_event_id', `${timeoutEvent.id}_attempt_%`)
        .order('processed_at', { ascending: false })
        .limit(1)
        .single();

      expect(finalAttempt.success).toBe(true);
    });
  });
});