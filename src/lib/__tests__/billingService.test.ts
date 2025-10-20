/**
 * Tests for BillingService
 * Covers invoice management, payment history, usage tracking, and billing notifications
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BillingService } from '../billingService';
import { supabase } from '../supabase';

// Mock Supabase
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis()
    }))
  }
}));

// Mock Stripe
vi.mock('../stripe', () => ({
  getStripe: vi.fn(() => ({
    invoices: {
      retrieve: vi.fn()
    },
    charges: {
      retrieve: vi.fn()
    },
    subscriptions: {
      retrieve: vi.fn()
    },
    customers: {
      retrieve: vi.fn()
    }
  })),
  withStripeErrorHandling: vi.fn((fn) => fn()),
  formatCurrency: vi.fn((amount) => `$${(amount / 100).toFixed(2)}`)
}));

// Mock type converters
vi.mock('../../types/subscription', () => ({
  convertInvoiceFromDb: vi.fn((row) => ({
    id: row.id,
    stripeInvoiceId: row.stripe_invoice_id,
    userId: row.user_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    createdAt: new Date(row.created_at)
  })),
  convertPaymentHistoryFromDb: vi.fn((row) => ({
    id: row.id,
    stripeChargeId: row.stripe_charge_id,
    userId: row.user_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    createdAt: new Date(row.created_at)
  })),
  convertBillingNotificationFromDb: vi.fn((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    severity: row.severity,
    read: row.read,
    createdAt: new Date(row.created_at)
  }))
}));

describe('BillingService', () => {
  let billingService: BillingService;
  const mockUserId = 'user-123';

  beforeEach(() => {
    billingService = new BillingService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUserInvoices', () => {
    it('should fetch user invoices with default pagination', async () => {
      const mockInvoices = [
        {
          id: 'inv-1',
          stripe_invoice_id: 'in_test123',
          user_id: mockUserId,
          amount: 2900,
          currency: 'usd',
          status: 'paid',
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: mockInvoices,
          error: null,
          count: 1
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const result = await billingService.getUserInvoices(mockUserId);

      expect(supabase.from).toHaveBeenCalledWith('invoices');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(result.invoices).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should apply filters when provided', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          data: [],
          error: null,
          count: 0
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await billingService.getUserInvoices(mockUserId, {
        status: 'paid',
        startDate,
        endDate,
        limit: 5
      });

      expect(mockQuery.eq).toHaveBeenCalledWith('status', 'paid');
      expect(mockQuery.gte).toHaveBeenCalledWith('created_at', startDate.toISOString());
      expect(mockQuery.lte).toHaveBeenCalledWith('created_at', endDate.toISOString());
      expect(mockQuery.range).toHaveBeenCalledWith(0, 4);
    });

    it('should handle database errors', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
          count: null
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      await expect(billingService.getUserInvoices(mockUserId))
        .rejects.toThrow('Failed to fetch invoices: Database error');
    });
  });

  describe('getUserPaymentHistory', () => {
    it('should fetch payment history with pagination', async () => {
      const mockPayments = [
        {
          id: 'pay-1',
          stripe_charge_id: 'ch_test123',
          user_id: mockUserId,
          amount: 2900,
          currency: 'usd',
          status: 'succeeded',
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: mockPayments,
          error: null,
          count: 1
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const result = await billingService.getUserPaymentHistory(mockUserId);

      expect(supabase.from).toHaveBeenCalledWith('payment_history');
      expect(result.payments).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getUserUsageHistory', () => {
    it('should fetch and aggregate usage data', async () => {
      const mockUsageData = [
        {
          timestamp: '2024-01-01T00:00:00Z',
          quantity: 100,
          usage_type: 'api_calls'
        },
        {
          timestamp: '2024-01-01T12:00:00Z',
          quantity: 50,
          usage_type: 'api_calls'
        }
      ];

      const mockSubscription = {
        plan_id: 'pro'
      };

      const usageQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockUsageData,
          error: null
        })
      };

      const subscriptionQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockSubscription,
          error: null
        })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(usageQuery as any)
        .mockReturnValueOnce(subscriptionQuery as any);

      const result = await billingService.getUserUsageHistory(mockUserId, { days: 1 });

      expect(result).toHaveLength(1);
      expect(result[0].usage).toBe(150); // 100 + 50
      expect(result[0].limit).toBe(10000); // Pro plan limit
    });
  });

  describe('getBillingSummary', () => {
    it('should calculate billing summary correctly', async () => {
      const mockPayments = [
        { amount: 2900 },
        { amount: 1500 }
      ];

      const mockMonthlyPayments = [
        { amount: 1500 }
      ];

      const mockSubscription = {
        current_period_end: '2024-02-01T00:00:00Z',
        plan_id: 'pro'
      };

      // Mock multiple queries
      const paymentsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis()
      };

      const subscriptionQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockSubscription,
          error: null
        })
      };

      const countQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis()
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce({ ...paymentsQuery, eq: vi.fn().mockResolvedValue({ data: mockPayments }) } as any)
        .mockReturnValueOnce({ ...paymentsQuery, gte: vi.fn().mockResolvedValue({ data: mockMonthlyPayments }) } as any)
        .mockReturnValueOnce({ ...countQuery, in: vi.fn().mockResolvedValue({ count: 0 }) } as any)
        .mockReturnValueOnce({ ...countQuery, gte: vi.fn().mockResolvedValue({ count: 1 }) } as any)
        .mockReturnValueOnce(subscriptionQuery as any);

      const result = await billingService.getBillingSummary(mockUserId);

      expect(result.totalSpent).toBe(4400); // 2900 + 1500
      expect(result.currentMonthSpent).toBe(1500);
      expect(result.unpaidInvoices).toBe(0);
      expect(result.failedPayments).toBe(1);
      expect(result.nextBillingAmount).toBe(9900); // Pro plan price
    });
  });

  describe('createBillingNotification', () => {
    it('should create a billing notification', async () => {
      const mockNotification = {
        userId: mockUserId,
        type: 'payment_failure' as const,
        title: 'Payment Failed',
        message: 'Your payment could not be processed',
        severity: 'high' as const,
        read: false
      };

      const savedNotification = {
        id: 'notif-1',
        user_id: mockUserId,
        type: 'payment_failure',
        title: 'Payment Failed',
        message: 'Your payment could not be processed',
        severity: 'high',
        read: false,
        created_at: '2024-01-01T00:00:00Z'
      };

      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: savedNotification,
          error: null
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const result = await billingService.createBillingNotification(mockNotification);

      expect(mockQuery.insert).toHaveBeenCalledWith({
        user_id: mockUserId,
        type: 'payment_failure',
        title: 'Payment Failed',
        message: 'Your payment could not be processed',
        severity: 'high',
        read: false,
        action_url: undefined,
        action_text: undefined,
        metadata: undefined
      });

      expect(result.id).toBe('notif-1');
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read', async () => {
      const notificationId = 'notif-1';

      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis()
      };

      // Chain the eq calls
      mockQuery.eq.mockReturnValueOnce(mockQuery).mockResolvedValueOnce({ error: null });

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      await billingService.markNotificationAsRead(mockUserId, notificationId);

      expect(mockQuery.update).toHaveBeenCalledWith({
        read: true,
        read_at: expect.any(String)
      });
      expect(mockQuery.eq).toHaveBeenCalledWith('id', notificationId);
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });
  });

  describe('syncInvoiceFromStripe', () => {
    it('should sync invoice from Stripe', async () => {
      const stripeInvoiceId = 'in_test123';
      const mockStripeInvoice = {
        id: stripeInvoiceId,
        subscription: 'sub_test123',
        customer: 'cus_test123',
        amount_due: 2900,
        currency: 'usd',
        status: 'paid',
        period_start: 1704067200, // 2024-01-01
        period_end: 1706745600,   // 2024-02-01
        subtotal: 2900,
        total: 2900,
        attempt_count: 1
      };

      const mockSubscription = {
        metadata: { userId: mockUserId }
      };

      const savedInvoice = {
        id: 'inv-1',
        stripe_invoice_id: stripeInvoiceId,
        user_id: mockUserId
      };

      // Mock Stripe calls
      const { getStripe } = await import('../stripe');
      const mockStripe = vi.mocked(getStripe)();
      vi.mocked(mockStripe.invoices.retrieve).mockResolvedValue(mockStripeInvoice as any);
      vi.mocked(mockStripe.subscriptions.retrieve).mockResolvedValue(mockSubscription as any);

      // Mock database upsert
      const mockQuery = {
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: savedInvoice,
          error: null
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const result = await billingService.syncInvoiceFromStripe(stripeInvoiceId);

      expect(mockStripe.invoices.retrieve).toHaveBeenCalledWith(stripeInvoiceId);
      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_test123');
      expect(mockQuery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          stripe_invoice_id: stripeInvoiceId,
          user_id: mockUserId,
          amount: 2900,
          currency: 'usd',
          status: 'paid'
        }),
        { onConflict: 'stripe_invoice_id' }
      );
    });

    it('should handle missing user ID', async () => {
      const stripeInvoiceId = 'in_test123';
      const mockStripeInvoice = {
        id: stripeInvoiceId,
        subscription: null,
        customer: null,
        amount_due: 2900,
        currency: 'usd',
        status: 'paid',
        period_start: 1704067200,
        period_end: 1706745600,
        subtotal: 2900,
        total: 2900,
        attempt_count: 1
      };

      const { getStripe } = await import('../stripe');
      const mockStripe = vi.mocked(getStripe)();
      vi.mocked(mockStripe.invoices.retrieve).mockResolvedValue(mockStripeInvoice as any);

      await expect(billingService.syncInvoiceFromStripe(stripeInvoiceId))
        .rejects.toThrow('Could not determine user ID for invoice');
    });
  });
});