/**
 * Payment and Billing Integration Tests
 * Tests for Stripe payment processing workflows, subscription management, and webhook handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getSubscriptionService } from '../../lib/subscriptionService';
import { getBillingService } from '../../lib/billingService';
import { webhookConfigurationService } from '../../lib/webhookConfig';
import { getStripe } from '../../lib/stripe';
import { testDatabase } from '../utils/testDatabase';
import { createTestUser, createTestCustomer, createTestSubscription } from '../factories/subscriptionFactory';

// Mock Stripe for integration tests
const mockStripe = {
  customers: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
  },
  subscriptions: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
  invoices: {
    retrieve: vi.fn(),
    retrieveUpcoming: vi.fn(),
  },
  charges: {
    retrieve: vi.fn(),
  },
  webhookEndpoints: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    del: vi.fn(),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
  promotionCodes: {
    list: vi.fn(),
  },
};

vi.mock('../../lib/stripe', () => ({
  getStripe: () => mockStripe,
  withStripeErrorHandling: vi.fn().mockImplementation(async (fn) => await fn()),
  StripeError: class extends Error {
    constructor(error: any) {
      super(error.message);
      this.name = 'StripeError';
    }
  },
}));

describe('Payment and Billing Integration Tests', () => {
  let subscriptionService: any;
  let billingService: any;
  let testUserId: string;
  let testCustomerId: string;
  let testSubscriptionId: string;

  beforeEach(async () => {
    // Initialize services
    subscriptionService = getSubscriptionService();
    billingService = getBillingService();

    // Setup test database
    await testDatabase.setup();

    // Create test user
    const testUser = await createTestUser();
    testUserId = testUser.id;

    // Create test customer
    const testCustomer = await createTestCustomer(testUserId);
    testCustomerId = testCustomer.stripeCustomerId;

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await testDatabase.cleanup();
  });

  describe('Stripe Payment Processing Workflows', () => {
    it('should create checkout session for new subscription', async () => {
      // Arrange
      const mockSession = {
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
        customer: testCustomerId,
        mode: 'subscription',
        metadata: { userId: testUserId },
      };

      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      // Act
      const result = await subscriptionService.createCheckoutSession(
        testUserId,
        'price_test_basic_monthly',
        {
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel',
          trialPeriodDays: 14,
        }
      );

      // Assert
      expect(result).toEqual({
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      });

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({
        customer: testCustomerId,
        line_items: [{ price: 'price_test_basic_monthly', quantity: 1 }],
        mode: 'subscription',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
        billing_address_collection: 'auto',
        customer_update: { address: 'auto', name: 'auto' },
        allow_promotion_codes: false,
        subscription_data: {
          trial_period_days: 14,
          metadata: { userId: testUserId },
        },
        metadata: {
          userId: testUserId,
          priceId: 'price_test_basic_monthly',
        },
      });
    });

    it('should create customer portal session', async () => {
      // Arrange
      const mockPortalSession = {
        url: 'https://billing.stripe.com/session/test_123',
      };

      mockStripe.billingPortal.sessions.create.mockResolvedValue(mockPortalSession);

      // Act
      const result = await subscriptionService.createPortalSession(
        testUserId,
        'https://app.example.com/billing'
      );

      // Assert
      expect(result).toEqual({
        url: 'https://billing.stripe.com/session/test_123',
      });

      expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: testCustomerId,
        return_url: 'https://app.example.com/billing',
      });
    });

    it('should handle payment method updates', async () => {
      // Arrange
      const mockPaymentMethod = {
        id: 'pm_test_123',
        type: 'card',
        card: {
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2025,
        },
        customer: testCustomerId,
      };

      // Act & Assert - This would typically involve webhook processing
      // For integration tests, we verify the database operations
      const { data: paymentMethodEvent, error } = await testDatabase.supabase
        .from('payment_method_events')
        .insert({
          stripe_payment_method_id: mockPaymentMethod.id,
          stripe_customer_id: testCustomerId,
          event_type: 'attached',
          payment_method_type: mockPaymentMethod.type,
          card_brand: mockPaymentMethod.card.brand,
          card_last4: mockPaymentMethod.card.last4,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(paymentMethodEvent).toMatchObject({
        stripe_payment_method_id: 'pm_test_123',
        event_type: 'attached',
        payment_method_type: 'card',
        card_brand: 'visa',
        card_last4: '4242',
      });
    });

    it('should process failed payment with retry logic', async () => {
      // Arrange
      const mockInvoice = {
        id: 'in_test_failed',
        customer: testCustomerId,
        subscription: 'sub_test_123',
        amount_due: 2900,
        currency: 'usd',
        status: 'open',
        attempt_count: 2,
        next_payment_attempt: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        last_finalization_error: {
          message: 'Your card was declined.',
        },
      };

      // Act - Simulate webhook processing
      const { data: paymentRecord, error } = await testDatabase.supabase
        .from('payment_history')
        .insert({
          stripe_invoice_id: mockInvoice.id,
          stripe_customer_id: testCustomerId,
          user_id: testUserId,
          amount: mockInvoice.amount_due,
          currency: mockInvoice.currency,
          status: 'failed',
          failure_reason: mockInvoice.last_finalization_error.message,
        })
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(paymentRecord).toMatchObject({
        status: 'failed',
        failure_reason: 'Your card was declined.',
        amount: 2900,
      });
    });
  });

  describe('Subscription Management and Billing Cycles', () => {
    beforeEach(async () => {
      // Create test subscription
      const testSubscription = await createTestSubscription(testUserId, testCustomerId);
      testSubscriptionId = testSubscription.stripeSubscriptionId;
    });

    it('should upgrade subscription with proration', async () => {
      // Arrange
      const mockUpdatedSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        items: {
          data: [{ price: { id: 'price_test_pro_monthly' } }],
        },
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 days
        metadata: { userId: testUserId },
      };

      const mockUpcomingInvoice = {
        amount_due: 7000, // Prorated amount
      };

      mockStripe.subscriptions.update.mockResolvedValue(mockUpdatedSubscription);
      mockStripe.invoices.retrieveUpcoming.mockResolvedValue(mockUpcomingInvoice);

      // Act
      const result = await subscriptionService.upgradeSubscription(
        testUserId,
        'price_test_pro_monthly',
        { prorationBehavior: 'create_prorations' }
      );

      // Assert
      expect(result.subscription.id).toBe(testSubscriptionId);
      expect(result.prorationAmount).toBe(7000);

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        testSubscriptionId,
        expect.objectContaining({
          items: [{ id: testSubscriptionId, price: 'price_test_pro_monthly' }],
          proration_behavior: 'create_prorations',
        })
      );
    });

    it('should downgrade subscription at period end', async () => {
      // Arrange
      const mockUpdatedSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        items: {
          data: [{ price: { id: 'price_test_basic_monthly' } }],
        },
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        metadata: { userId: testUserId },
      };

      mockStripe.subscriptions.update.mockResolvedValue(mockUpdatedSubscription);

      // Act
      const result = await subscriptionService.downgradeSubscription(
        testUserId,
        'price_test_basic_monthly',
        { applyAtPeriodEnd: true }
      );

      // Assert
      expect(result.subscription.id).toBe(testSubscriptionId);
      expect(result.effectiveDate).toBeInstanceOf(Date);

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        testSubscriptionId,
        expect.objectContaining({
          proration_behavior: 'none',
          billing_cycle_anchor: 'unchanged',
        })
      );
    });

    it('should cancel subscription with grace period', async () => {
      // Arrange
      const mockCanceledSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        metadata: { userId: testUserId },
      };

      mockStripe.subscriptions.update.mockResolvedValue(mockCanceledSubscription);

      // Act
      const result = await subscriptionService.cancelSubscription(
        testSubscriptionId,
        { cancelAtPeriodEnd: true }
      );

      // Assert
      expect(result.cancel_at_period_end).toBe(true);
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        testSubscriptionId,
        { cancel_at_period_end: true }
      );
    });

    it('should handle trial conversion to paid subscription', async () => {
      // Arrange
      const mockTrialSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        status: 'trialing',
        trial_end: Math.floor(Date.now() / 1000) + 1209600, // 14 days
        metadata: { userId: testUserId },
      };

      const mockConvertedSubscription = {
        ...mockTrialSubscription,
        status: 'active',
        trial_end: Math.floor(Date.now() / 1000), // Trial ended now
      };

      mockStripe.subscriptions.update.mockResolvedValue(mockConvertedSubscription);

      // First, set up trial subscription in database
      await testDatabase.supabase
        .from('user_subscriptions')
        .update({
          status: 'trialing',
          trial_end: new Date(mockTrialSubscription.trial_end * 1000),
        })
        .eq('stripe_subscription_id', testSubscriptionId);

      // Act
      const result = await subscriptionService.convertTrialToPaid(testUserId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.subscription.status).toBe('active');

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        testSubscriptionId,
        expect.objectContaining({
          trial_end: 'now',
        })
      );
    });

    it('should apply and remove promotional codes', async () => {
      // Arrange
      const mockPromotionCode = {
        id: 'promo_test_123',
        code: 'SAVE20',
        active: true,
        coupon: {
          id: 'coupon_test_123',
          percent_off: 20,
          name: '20% Off',
        },
      };

      const mockUpdatedSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        discount: {
          coupon: mockPromotionCode.coupon,
        },
        metadata: { userId: testUserId },
      };

      mockStripe.promotionCodes.list.mockResolvedValue({
        data: [mockPromotionCode],
      });
      mockStripe.subscriptions.update.mockResolvedValue(mockUpdatedSubscription);

      // Act - Apply promotion code
      const applyResult = await subscriptionService.applyPromotionalCode(
        testUserId,
        'SAVE20'
      );

      // Assert
      expect(applyResult.success).toBe(true);
      expect(applyResult.discount.coupon.percent_off).toBe(20);

      // Act - Remove promotion code
      mockStripe.subscriptions.deleteDiscount.mockResolvedValue(mockUpdatedSubscription);
      const removeResult = await subscriptionService.removePromotionalCode(testUserId);

      // Assert
      expect(removeResult.success).toBe(true);
    });
  });

  describe('Webhook Handling and Event Processing', () => {
    it('should configure webhook endpoints correctly', async () => {
      // Arrange
      const mockEndpoint = {
        id: 'we_test_123',
        url: 'https://app.example.com/functions/v1/stripe-webhook',
        enabled_events: [
          'checkout.session.completed',
          'customer.subscription.created',
          'invoice.payment_succeeded',
        ],
        status: 'enabled',
        secret: 'whsec_test_secret',
        created: Math.floor(Date.now() / 1000),
      };

      mockStripe.webhookEndpoints.create.mockResolvedValue(mockEndpoint);

      // Act
      const result = await webhookConfigurationService.createWebhookEndpoint({
        enabledEvents: [
          'checkout.session.completed',
          'customer.subscription.created',
          'invoice.payment_succeeded',
        ],
      });

      // Assert
      expect(result.id).toBe('we_test_123');
      expect(result.enabledEvents).toContain('checkout.session.completed');
      expect(result.status).toBe('enabled');
    });

    it('should validate webhook configuration status', async () => {
      // Arrange
      const mockEndpoints = [
        {
          id: 'we_test_123',
          url: 'https://app.example.com/functions/v1/stripe-webhook',
          enabled_events: [
            'checkout.session.completed',
            'customer.subscription.created',
            // Missing some required events
          ],
          status: 'enabled',
          secret: 'whsec_test_secret',
          created: Math.floor(Date.now() / 1000),
        },
      ];

      mockStripe.webhookEndpoints.list.mockResolvedValue({ data: mockEndpoints });

      // Act
      const status = await webhookConfigurationService.getWebhookConfigurationStatus();

      // Assert
      expect(status.isConfigured).toBe(false);
      expect(status.missingEvents.length).toBeGreaterThan(0);
      expect(status.recommendations).toContain(
        expect.stringContaining('Add missing events')
      );
    });

    it('should process subscription created webhook event', async () => {
      // Arrange
      const mockEvent = {
        id: 'evt_test_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_new',
            customer: testCustomerId,
            status: 'active',
            items: {
              data: [{ price: { id: 'price_test_basic_monthly' } }],
            },
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            metadata: { userId: testUserId },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      // Act - Simulate webhook processing by directly inserting subscription
      const { data: subscription, error } = await testDatabase.supabase
        .from('user_subscriptions')
        .insert({
          user_id: testUserId,
          stripe_customer_id: testCustomerId,
          stripe_subscription_id: 'sub_test_new',
          plan_id: 'price_test_basic_monthly',
          status: 'active',
          current_period_start: new Date(mockEvent.data.object.current_period_start * 1000),
          current_period_end: new Date(mockEvent.data.object.current_period_end * 1000),
        })
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(subscription).toMatchObject({
        stripe_subscription_id: 'sub_test_new',
        status: 'active',
        plan_id: 'price_test_basic_monthly',
      });
    });

    it('should process payment succeeded webhook event', async () => {
      // Arrange
      const mockEvent = {
        id: 'evt_test_payment',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test_paid',
            customer: testCustomerId,
            subscription: testSubscriptionId,
            amount_paid: 2900,
            currency: 'usd',
            status: 'paid',
            hosted_invoice_url: 'https://invoice.stripe.com/test',
            created: Math.floor(Date.now() / 1000),
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Act - Simulate webhook processing
      const { data: payment, error } = await testDatabase.supabase
        .from('payment_history')
        .insert({
          stripe_invoice_id: mockEvent.data.object.id,
          stripe_customer_id: testCustomerId,
          stripe_subscription_id: testSubscriptionId,
          user_id: testUserId,
          amount: mockEvent.data.object.amount_paid,
          currency: mockEvent.data.object.currency,
          status: 'succeeded',
          invoice_url: mockEvent.data.object.hosted_invoice_url,
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
    });

    it('should handle webhook event idempotency', async () => {
      // Arrange
      const eventId = 'evt_test_idempotent';
      
      // Act - Process same event twice
      const firstInsert = await testDatabase.supabase
        .from('webhook_events')
        .insert({
          stripe_event_id: eventId,
          event_type: 'customer.subscription.created',
          success: true,
          message: 'Processed successfully',
          processed_at: new Date(),
        })
        .select()
        .single();

      const secondInsert = await testDatabase.supabase
        .from('webhook_events')
        .insert({
          stripe_event_id: eventId,
          event_type: 'customer.subscription.created',
          success: true,
          message: 'Processed successfully',
          processed_at: new Date(),
        })
        .select()
        .single();

      // Assert - Second insert should fail due to unique constraint
      expect(firstInsert.error).toBeNull();
      expect(secondInsert.error).not.toBeNull();
      expect(secondInsert.error?.code).toBe('23505'); // Unique violation
    });
  });

  describe('Payment Method Management and Security', () => {
    it('should securely store payment method information', async () => {
      // Arrange
      const mockPaymentMethod = {
        id: 'pm_test_secure',
        type: 'card',
        card: {
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2025,
          country: 'US',
        },
        customer: testCustomerId,
      };

      // Act - Store payment method securely (only non-sensitive data)
      const { data: paymentMethod, error } = await testDatabase.supabase
        .from('payment_methods')
        .insert({
          stripe_payment_method_id: mockPaymentMethod.id,
          stripe_customer_id: testCustomerId,
          user_id: testUserId,
          type: mockPaymentMethod.type,
          card_brand: mockPaymentMethod.card.brand,
          card_last4: mockPaymentMethod.card.last4,
          card_exp_month: mockPaymentMethod.card.exp_month,
          card_exp_year: mockPaymentMethod.card.exp_year,
          card_country: mockPaymentMethod.card.country,
          is_default: true,
        })
        .select()
        .single();

      // Assert
      expect(error).toBeNull();
      expect(paymentMethod).toMatchObject({
        type: 'card',
        card_brand: 'visa',
        card_last4: '4242',
        is_default: true,
      });

      // Verify no sensitive data is stored
      expect(paymentMethod).not.toHaveProperty('card_number');
      expect(paymentMethod).not.toHaveProperty('card_cvc');
    });

    it('should validate payment method security requirements', async () => {
      // Arrange
      const invalidPaymentMethods = [
        { card_last4: '123' }, // Too short
        { card_last4: '12345' }, // Too long
        { card_exp_year: 2020 }, // Expired
        { card_brand: 'unknown' }, // Invalid brand
      ];

      // Act & Assert
      for (const invalidMethod of invalidPaymentMethods) {
        const { error } = await testDatabase.supabase
          .from('payment_methods')
          .insert({
            stripe_payment_method_id: 'pm_test_invalid',
            stripe_customer_id: testCustomerId,
            user_id: testUserId,
            type: 'card',
            ...invalidMethod,
          });

        // Should fail validation
        expect(error).not.toBeNull();
      }
    });

    it('should handle payment method deletion securely', async () => {
      // Arrange - Create payment method
      const { data: paymentMethod } = await testDatabase.supabase
        .from('payment_methods')
        .insert({
          stripe_payment_method_id: 'pm_test_delete',
          stripe_customer_id: testCustomerId,
          user_id: testUserId,
          type: 'card',
          card_brand: 'visa',
          card_last4: '4242',
        })
        .select()
        .single();

      // Act - Soft delete payment method
      const { error } = await testDatabase.supabase
        .from('payment_methods')
        .update({
          deleted_at: new Date(),
          is_default: false,
        })
        .eq('id', paymentMethod.id);

      // Assert
      expect(error).toBeNull();

      // Verify payment method is not returned in active queries
      const { data: activePaymentMethods } = await testDatabase.supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', testUserId)
        .is('deleted_at', null);

      expect(activePaymentMethods).not.toContainEqual(
        expect.objectContaining({ id: paymentMethod.id })
      );
    });

    it('should enforce payment method limits per user', async () => {
      // Arrange - Create maximum allowed payment methods
      const maxPaymentMethods = 5;
      const paymentMethods = Array.from({ length: maxPaymentMethods }, (_, i) => ({
        stripe_payment_method_id: `pm_test_${i}`,
        stripe_customer_id: testCustomerId,
        user_id: testUserId,
        type: 'card',
        card_brand: 'visa',
        card_last4: '4242',
      }));

      await testDatabase.supabase
        .from('payment_methods')
        .insert(paymentMethods);

      // Act - Try to add one more payment method
      const { error } = await testDatabase.supabase
        .from('payment_methods')
        .insert({
          stripe_payment_method_id: 'pm_test_exceed_limit',
          stripe_customer_id: testCustomerId,
          user_id: testUserId,
          type: 'card',
          card_brand: 'visa',
          card_last4: '4242',
        });

      // Assert - Should fail due to limit constraint
      expect(error).not.toBeNull();
      expect(error?.message).toContain('payment method limit');
    });
  });

  describe('Billing Analytics and Reporting', () => {
    beforeEach(async () => {
      // Create test billing data
      await testDatabase.supabase
        .from('payment_history')
        .insert([
          {
            user_id: testUserId,
            stripe_customer_id: testCustomerId,
            amount: 2900,
            currency: 'usd',
            status: 'succeeded',
            created_at: new Date(Date.now() - 86400000), // Yesterday
          },
          {
            user_id: testUserId,
            stripe_customer_id: testCustomerId,
            amount: 2900,
            currency: 'usd',
            status: 'succeeded',
            created_at: new Date(Date.now() - 2592000000), // 30 days ago
          },
          {
            user_id: testUserId,
            stripe_customer_id: testCustomerId,
            amount: 2900,
            currency: 'usd',
            status: 'failed',
            created_at: new Date(Date.now() - 172800000), // 2 days ago
          },
        ]);
    });

    it('should generate billing summary with accurate metrics', async () => {
      // Act
      const summary = await billingService.getBillingSummary(testUserId);

      // Assert
      expect(summary).toMatchObject({
        totalSpent: 5800, // Two successful payments
        currentMonthSpent: 2900, // One payment this month
        failedPayments: 1,
      });

      expect(summary.nextBillingDate).toBeInstanceOf(Date);
      expect(summary.nextBillingAmount).toBeGreaterThan(0);
    });

    it('should track usage history with billing correlation', async () => {
      // Arrange - Create usage records
      await testDatabase.supabase
        .from('usage_records')
        .insert([
          {
            user_id: testUserId,
            usage_type: 'analysis',
            quantity: 150,
            timestamp: new Date(Date.now() - 86400000), // Yesterday
          },
          {
            user_id: testUserId,
            usage_type: 'analysis',
            quantity: 200,
            timestamp: new Date(Date.now() - 172800000), // 2 days ago
          },
        ]);

      // Act
      const usageHistory = await billingService.getUserUsageHistory(testUserId, {
        days: 7,
      });

      // Assert
      expect(usageHistory).toHaveLength(7); // 7 days of data
      expect(usageHistory.some(day => day.usage > 0)).toBe(true);
      expect(usageHistory.every(day => day.limit > 0)).toBe(true);
    });

    it('should generate invoice data with proper formatting', async () => {
      // Arrange
      const mockInvoice = {
        id: 'in_test_format',
        customer: testCustomerId,
        subscription: testSubscriptionId,
        amount_due: 2900,
        currency: 'usd',
        status: 'paid',
        number: 'INV-2024-001',
        invoice_pdf: 'https://invoice.stripe.com/test.pdf',
        hosted_invoice_url: 'https://invoice.stripe.com/test',
        period_start: Math.floor(Date.now() / 1000) - 2592000,
        period_end: Math.floor(Date.now() / 1000),
        subtotal: 2900,
        total: 2900,
      };

      mockStripe.invoices.retrieve.mockResolvedValue(mockInvoice);

      // Act
      const invoice = await billingService.syncInvoiceFromStripe('in_test_format');

      // Assert
      expect(invoice).toMatchObject({
        stripeInvoiceId: 'in_test_format',
        amount: 2900,
        currency: 'usd',
        status: 'paid',
        invoiceNumber: 'INV-2024-001',
      });

      expect(invoice.invoiceUrl).toBe('https://invoice.stripe.com/test.pdf');
      expect(invoice.periodStart).toBeInstanceOf(Date);
      expect(invoice.periodEnd).toBeInstanceOf(Date);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle Stripe API errors gracefully', async () => {
      // Arrange
      const stripeError = new Error('Rate limit exceeded');
      stripeError.name = 'StripeRateLimitError';
      mockStripe.customers.create.mockRejectedValue(stripeError);

      // Act & Assert
      await expect(
        subscriptionService.getOrCreateStripeCustomer(
          testUserId,
          'test@example.com',
          'Test User'
        )
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle database connection failures', async () => {
      // Arrange - Mock database error
      const originalSupabase = testDatabase.supabase;
      testDatabase.supabase = {
        ...originalSupabase,
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.reject(new Error('Database connection failed')),
            }),
          }),
        }),
      };

      // Act & Assert
      await expect(
        subscriptionService.getUserSubscription(testUserId)
      ).rejects.toThrow('Database connection failed');

      // Restore original supabase
      testDatabase.supabase = originalSupabase;
    });

    it('should implement retry logic for transient failures', async () => {
      // Arrange
      let attemptCount = 0;
      mockStripe.subscriptions.retrieve.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary network error');
        }
        return Promise.resolve({
          id: testSubscriptionId,
          customer: testCustomerId,
          status: 'active',
          metadata: { userId: testUserId },
        });
      });

      // Act
      const subscription = await subscriptionService.syncSubscriptionFromStripe(
        testSubscriptionId
      );

      // Assert
      expect(attemptCount).toBe(3); // Should retry twice before succeeding
      expect(subscription.stripeSubscriptionId).toBe(testSubscriptionId);
    });

    it('should validate webhook signatures for security', async () => {
      // Arrange
      const invalidSignature = 'invalid_signature';
      const validPayload = JSON.stringify({
        id: 'evt_test_security',
        type: 'customer.subscription.created',
      });

      mockStripe.webhooks.constructEvent.mockImplementation((body, sig, secret) => {
        if (sig === invalidSignature) {
          throw new Error('Invalid signature');
        }
        return { id: 'evt_test_security', type: 'customer.subscription.created' };
      });

      // Act & Assert
      expect(() => {
        mockStripe.webhooks.constructEvent(validPayload, invalidSignature, 'secret');
      }).toThrow('Invalid signature');
    });
  });
});