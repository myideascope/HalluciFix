/**
 * Tests for BillingMonitor
 * Covers billing system health monitoring, alert generation, and metrics collection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { billingMonitor } from '../../lib/billingMonitor';
import { supabase } from '../../lib/supabase';

// Mock dependencies
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis()
    }))
  }
}));

vi.mock('../subscriptionService', () => ({
  subscriptionService: {
    getSubscriptionPlans: vi.fn()
  }
}));

vi.mock('../usageTracker', () => ({
  usageTracker: {
    getCurrentUsage: vi.fn()
  }
}));

vi.mock('../performanceMonitor', () => ({
  performanceMonitor: {
    startOperation: vi.fn(() => 'perf-id-123'),
    endOperation: vi.fn(),
    recordBusinessMetric: vi.fn()
  }
}));

vi.mock('../monitoring', () => ({
  monitoringService: {
    recordAlert: vi.fn()
  }
}));

vi.mock('../notificationService', () => ({
  notificationService: {
    sendAdminNotification: vi.fn(),
    sendUserNotification: vi.fn()
  }
}));

vi.mock('../logging', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

describe('BillingMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset any timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('performHealthCheck', () => {
it('should return healthy status when all systems are working', async () => {
        // Mock successful subscription service call
        const { subscriptionService } = await import('../../lib/subscriptionService');
      vi.mocked(subscriptionService.getSubscriptionPlans).mockResolvedValue([
        { id: 'basic', name: 'Basic Plan' },
        { id: 'pro', name: 'Pro Plan' }
      ]);

      // Mock successful webhook health check
      const mockWebhookQuery = {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'wh-1',
              event_type: 'invoice.payment_succeeded',
              processed_at: new Date().toISOString(),
              created_at: new Date(Date.now() - 60000).toISOString() // 1 minute ago
            }
          ],
          error: null
        })
      };

      // Mock successful payment health check
      const mockPaymentQuery = {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis()
      };

      // Mock successful subscription sync check
      const mockSubscriptionQuery = {
        select: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis()
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockWebhookQuery as any)
        .mockReturnValueOnce({ ...mockPaymentQuery, order: vi.fn().mockResolvedValue({ data: [], error: null }) } as any)
        .mockReturnValueOnce({ ...mockSubscriptionQuery, eq: vi.fn().mockResolvedValue({ data: [], error: null }) } as any);

      const healthStatus = await billingMonitor.performHealthCheck();

      expect(healthStatus.overall).toBe('healthy');
      expect(healthStatus.stripeConnectivity).toBe('connected');
      expect(healthStatus.webhookProcessing).toBe('normal');
      expect(healthStatus.paymentProcessing).toBe('normal');
      expect(healthStatus.subscriptionSync).toBe('synced');
      expect(healthStatus.issues).toHaveLength(0);
    });

    it('should return critical status when Stripe is disconnected', async () => {
      const { subscriptionService } = await import('../subscriptionService');
      vi.mocked(subscriptionService.getSubscriptionPlans).mockRejectedValue(new Error('Stripe API error'));

      const healthStatus = await billingMonitor.performHealthCheck();

      expect(healthStatus.overall).toBe('critical');
      expect(healthStatus.stripeConnectivity).toBe('disconnected');
      expect(healthStatus.issues).toContain('Stripe connectivity failed: Stripe API error');
    });

    it('should detect webhook processing delays', async () => {
      const { subscriptionService } = await import('../subscriptionService');
      vi.mocked(subscriptionService.getSubscriptionPlans).mockResolvedValue([{ id: 'basic' }]);

      // Mock delayed webhook processing
      const mockWebhookQuery = {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'wh-1',
              event_type: 'invoice.payment_succeeded',
              processed_at: new Date().toISOString(),
              created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 minutes ago
            }
          ],
          error: null
        })
      };

      const mockPaymentQuery = {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null })
      };

      const mockSubscriptionQuery = {
        select: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockWebhookQuery as any)
        .mockReturnValueOnce(mockPaymentQuery as any)
        .mockReturnValueOnce(mockSubscriptionQuery as any);

      const healthStatus = await billingMonitor.performHealthCheck();

      expect(healthStatus.overall).toBe('warning');
      expect(healthStatus.webhookProcessing).toBe('delayed');
      expect(healthStatus.issues.some(issue => issue.includes('webhooks processed with delays'))).toBe(true);
    });
  });

  describe('checkPaymentFailures', () => {
    it('should create alerts for recent payment failures', async () => {
      const mockFailedPayments = [
        {
          id: 'pay-1',
          user_subscriptions: { user_id: 'user-123' },
          amount: 2900,
          currency: 'usd',
          failure_message: 'Card declined',
          payment_method: 'card'
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({
          data: mockFailedPayments,
          error: null
        })
      };

      const mockUpdateQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      };

      const mockInsertQuery = {
        insert: vi.fn().mockResolvedValue({ error: null })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(mockQuery as any)
        .mockReturnValueOnce(mockUpdateQuery as any)
        .mockReturnValueOnce(mockInsertQuery as any);

      await billingMonitor.checkPaymentFailures();

      expect(mockQuery.eq).toHaveBeenCalledWith('status', 'failed');
      expect(mockQuery.is).toHaveBeenCalledWith('alert_sent', null);
      expect(mockUpdateQuery.update).toHaveBeenCalledWith({
        alert_sent: expect.any(String)
      });
    });

    it('should handle database errors gracefully', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' }
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      // Should not throw error
      await expect(billingMonitor.checkPaymentFailures()).resolves.toBeUndefined();
    });
  });

  describe('checkUsageOverages', () => {
    it('should create alerts for usage overages', async () => {
      const mockSubscriptions = [
        {
          user_id: 'user-123',
          stripe_subscription_id: 'sub_test123',
          plan_id: 'basic'
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: mockSubscriptions,
          error: null
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      // Mock usage tracker to return overage
      const { usageTracker } = await import('../usageTracker');
      vi.mocked(usageTracker.getCurrentUsage).mockResolvedValue({
        current: 1500,
        limit: 1000,
        overage: 500,
        overageCost: 25.00,
        percentage: 150
      });

      const mockInsertQuery = {
        insert: vi.fn().mockResolvedValue({ error: null })
      };

      vi.mocked(supabase.from).mockReturnValueOnce(mockQuery as any).mockReturnValueOnce(mockInsertQuery as any);

      await billingMonitor.checkUsageOverages();

      expect(usageTracker.getCurrentUsage).toHaveBeenCalledWith('user-123');
      expect(mockInsertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'usage_overage',
          severity: 'high',
          user_id: 'user-123'
        })
      );
    });

    it('should create low-severity alerts when approaching limits', async () => {
      const mockSubscriptions = [
        {
          user_id: 'user-456',
          stripe_subscription_id: 'sub_test456',
          plan_id: 'pro'
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: mockSubscriptions,
          error: null
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const { usageTracker } = await import('../usageTracker');
      vi.mocked(usageTracker.getCurrentUsage).mockResolvedValue({
        current: 9500,
        limit: 10000,
        overage: 0,
        percentage: 95
      });

      const mockInsertQuery = {
        insert: vi.fn().mockResolvedValue({ error: null })
      };

      vi.mocked(supabase.from).mockReturnValueOnce(mockQuery as any).mockReturnValueOnce(mockInsertQuery as any);

      await billingMonitor.checkUsageOverages();

      expect(mockInsertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'usage_overage',
          severity: 'low',
          message: expect.stringContaining('approaching usage limit')
        })
      );
    });
  });

  describe('generateBillingMetrics', () => {
    it('should calculate comprehensive billing metrics', async () => {
      const mockActiveSubscriptions = [
        {
          user_id: 'user-1',
          subscription_plans: { price: 2900 }
        },
        {
          user_id: 'user-2',
          subscription_plans: { price: 9900 }
        }
      ];

      const mockRecentPayments = [
        { amount: 2900 },
        { amount: 9900 }
      ];

      const mockAllPayments = [
        { status: 'succeeded' },
        { status: 'succeeded' },
        { status: 'failed' }
      ];

      const mockCanceledSubs = [
        { id: 'sub-canceled-1' }
      ];

      const mockTrials = [
        { status: 'active' },
        { status: 'canceled' }
      ];

      // Mock multiple database queries
      const subscriptionsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: mockActiveSubscriptions,
          error: null
        })
      };

      const paymentsQuery = {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: mockRecentPayments,
          error: null
        })
      };

      const allPaymentsQuery = {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: mockAllPayments,
          error: null
        })
      };

      const canceledQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({
          data: mockCanceledSubs,
          error: null
        })
      };

      const trialsQuery = {
        select: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({
          data: mockTrials,
          error: null
        })
      };

      vi.mocked(supabase.from)
        .mockReturnValueOnce(subscriptionsQuery as any)
        .mockReturnValueOnce(paymentsQuery as any)
        .mockReturnValueOnce(allPaymentsQuery as any)
        .mockReturnValueOnce(canceledQuery as any)
        .mockReturnValueOnce(trialsQuery as any);

      // Mock usage tracker for overage calculation
      const { usageTracker } = await import('../usageTracker');
      vi.mocked(usageTracker.getCurrentUsage)
        .mockResolvedValueOnce({ overage: 0 })
        .mockResolvedValueOnce({ overage: 100 });

      const metrics = await billingMonitor.generateBillingMetrics();

      expect(metrics.totalRevenue).toBe(128); // (2900 + 9900) / 100
      expect(metrics.monthlyRecurringRevenue).toBe(12800); // 2900 + 9900
      expect(metrics.activeSubscriptions).toBe(2);
      expect(metrics.averageRevenuePerUser).toBe(6400); // 12800 / 2
      expect(metrics.paymentFailureRate).toBeCloseTo(0.333); // 1/3
      expect(metrics.churnRate).toBeCloseTo(0.333); // 1/(2+1)
      expect(metrics.trialConversionRate).toBe(0.5); // 1/2
      expect(metrics.usageOverageRate).toBe(0.5); // 1/2
    });

    it('should handle empty data gracefully', async () => {
      const emptyQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };

      vi.mocked(supabase.from).mockReturnValue(emptyQuery as any);

      const metrics = await billingMonitor.generateBillingMetrics();

      expect(metrics.totalRevenue).toBe(0);
      expect(metrics.monthlyRecurringRevenue).toBe(0);
      expect(metrics.activeSubscriptions).toBe(0);
      expect(metrics.averageRevenuePerUser).toBe(0);
      expect(metrics.paymentFailureRate).toBe(0);
      expect(metrics.churnRate).toBe(0);
      expect(metrics.trialConversionRate).toBe(0);
      expect(metrics.usageOverageRate).toBe(0);
    });
  });

  describe('getBillingAlerts', () => {
    it('should fetch billing alerts with filters', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          type: 'payment_failure',
          severity: 'high',
          user_id: 'user-123',
          subscription_id: 'sub-123',
          message: 'Payment failed',
          details: { amount: 2900 },
          timestamp: '2024-01-01T00:00:00Z',
          resolved: false,
          resolved_at: null,
          resolved_by: null
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis()
      };

      // Chain the eq calls for multiple filters
      mockQuery.eq.mockReturnValue(mockQuery);
      mockQuery.limit.mockResolvedValue({
        data: mockAlerts,
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const alerts = await billingMonitor.getBillingAlerts({
        limit: 10,
        severity: 'high',
        type: 'payment_failure',
        resolved: false,
        userId: 'user-123'
      });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe('alert-1');
      expect(alerts[0].type).toBe('payment_failure');
      expect(alerts[0].severity).toBe('high');
      expect(alerts[0].resolved).toBe(false);
    });
  });

  describe('resolveAlert', () => {
    it('should resolve a billing alert', async () => {
      const alertId = 'alert-123';
      const resolvedBy = 'admin-user';

      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      await billingMonitor.resolveAlert(alertId, resolvedBy);

      expect(mockQuery.update).toHaveBeenCalledWith({
        resolved: true,
        resolved_at: expect.any(String),
        resolved_by: resolvedBy
      });
      expect(mockQuery.eq).toHaveBeenCalledWith('id', alertId);
    });

    it('should handle database errors when resolving alerts', async () => {
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          error: { message: 'Update failed' }
        })
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      await expect(billingMonitor.resolveAlert('alert-123', 'admin'))
        .rejects.toThrow('Failed to resolve alert: Update failed');
    });
  });

  describe('startMonitoring', () => {
    it('should start all monitoring intervals', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      await billingMonitor.startMonitoring();

      // Should set up multiple intervals for different monitoring tasks
      expect(setIntervalSpy).toHaveBeenCalledTimes(5);
      
      // Verify intervals are set with correct timing
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000); // Health check
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 15 * 60 * 1000); // Payment failures
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30 * 60 * 1000); // Usage overages
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000); // Subscription expirations
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 24 * 60 * 60 * 1000); // Metrics generation
    });
  });
});