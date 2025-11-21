/**
 * Billing API Endpoint
 * Provides billing information, invoice history, and usage analytics for frontend integration
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0';

import { logger } from './logging';
// Environment variables
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize Stripe and Supabase clients
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Types
interface BillingInfo {
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: string;
    plan: {
      id: string;
      name: string;
      price: number;
      interval: string;
      currency: string;
      features: string[];
    };
    cancelAtPeriodEnd: boolean;
    trialEnd?: string;
  } | null;
  usage: {
    current: number;
    limit: number;
    percentage: number;
    resetDate: string;
    overage: number;
    overageCost: number;
  };
  paymentMethod: {
    brand: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
  } | null;
  invoices: Array<{
    id: string;
    date: string;
    amount: number;
    status: string;
    downloadUrl: string;
    description: string;
  }>;
}

interface UsageAnalytics {
  totalUsage: number;
  dailyAverage: number;
  peakDay: { date: string; usage: number };
  trend: 'increasing' | 'decreasing' | 'stable';
  dailyBreakdown: Array<{ date: string; usage: number }>;
}

/**
 * Main request handler
 */
serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // Extract user ID from JWT token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const url = new URL(req.url);
    const path = url.pathname;

    // Route requests
    if (req.method === 'GET') {
      if (path.endsWith('/info')) {
        return await handleGetBillingInfo(userId);
      } else if (path.endsWith('/usage/analytics')) {
        const days = parseInt(url.searchParams.get('days') || '30');
        return await handleGetUsageAnalytics(userId, days);
      } else if (path.endsWith('/invoices')) {
        const limit = parseInt(url.searchParams.get('limit') || '10');
        return await handleGetInvoices(userId, limit);
      }
    } else if (req.method === 'POST') {
      if (path.endsWith('/portal')) {
        const body = await req.json();
        return await handleCreatePortalSession(userId, body.returnUrl);
      } else if (path.endsWith('/cancel')) {
        return await handleCancelSubscription(userId);
      }
    }

    return new Response(
      JSON.stringify({ error: 'Endpoint not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error("Billing API error:", error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Get comprehensive billing information
 */
async function handleGetBillingInfo(userId: string): Promise<Response> {
  try {
    // Get user subscription
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subError && subError.code !== 'PGRST116') {
      throw new Error(`Failed to fetch subscription: ${subError.message}`);
    }

    const billingInfo: BillingInfo = {
      subscription: null,
      usage: {
        current: 0,
        limit: 0,
        percentage: 0,
        resetDate: new Date().toISOString(),
        overage: 0,
        overageCost: 0,
      },
      paymentMethod: null,
      invoices: [],
    };

    if (subscription) {
      // Get subscription plan details
      const plan = await getSubscriptionPlan(subscription.plan_id);
      
      billingInfo.subscription = {
        id: subscription.stripe_subscription_id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        plan: plan,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialEnd: subscription.trial_end,
      };

      // Get current usage
      billingInfo.usage = await getCurrentUsage(userId, subscription);

      // Get payment method
      billingInfo.paymentMethod = await getDefaultPaymentMethod(subscription.stripe_customer_id);

      // Get recent invoices
      billingInfo.invoices = await getRecentInvoices(subscription.stripe_customer_id, 5);
    }

    return new Response(JSON.stringify(billingInfo), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error("Error getting billing info:", error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({
        error: 'Failed to get billing information',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get usage analytics
 */
async function handleGetUsageAnalytics(userId: string, days: number): Promise<Response> {
  try {
    const analytics = await getUsageAnalytics(userId, days);

    return new Response(JSON.stringify(analytics), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error("Error getting usage analytics:", error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({
        error: 'Failed to get usage analytics',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Get invoice history
 */
async function handleGetInvoices(userId: string, limit: number): Promise<Response> {
  try {
    // Get user's Stripe customer ID
    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (customerError) {
      throw new Error(`Failed to fetch customer: ${customerError.message}`);
    }

    const invoices = await getRecentInvoices(customer.stripe_customer_id, limit);

    return new Response(JSON.stringify({ invoices }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error("Error getting invoices:", error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({
        error: 'Failed to get invoices',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Create Stripe Customer Portal session
 */
async function handleCreatePortalSession(userId: string, returnUrl: string): Promise<Response> {
  try {
    // Get user's Stripe customer ID
    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (customerError) {
      throw new Error(`No Stripe customer found for user: ${customerError.message}`);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: returnUrl,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error("Error creating portal session:", error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({
        error: 'Failed to create portal session',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Cancel subscription
 */
async function handleCancelSubscription(userId: string): Promise<Response> {
  try {
    // Get user subscription
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subError) {
      throw new Error(`No active subscription found: ${subError.message}`);
    }

    // Cancel at period end
    const canceledSubscription = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        cancel_at_period_end: true,
      }
    );

    // Update database
    await supabase
      .from('user_subscriptions')
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscription.stripe_subscription_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Subscription will be canceled at the end of the current period',
        cancelAt: new Date(canceledSubscription.current_period_end * 1000).toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    logger.error("Error canceling subscription:", error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({
        error: 'Failed to cancel subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get subscription plan details
 */
async function getSubscriptionPlan(planId: string) {
  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      price: 29,
      interval: 'month',
      currency: 'usd',
      features: [
        '1,000 analyses per month',
        'Basic hallucination detection',
        'Email support',
        'Standard accuracy reports',
        'API access',
      ],
      analysisLimit: 1000,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 99,
      interval: 'month',
      currency: 'usd',
      features: [
        '10,000 analyses per month',
        'Advanced seq-logprob analysis',
        'Team collaboration',
        'Priority support',
        'Custom integrations',
        'Advanced analytics',
        'Batch processing',
        'Scheduled monitoring',
      ],
      analysisLimit: 10000,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 0,
      interval: 'month',
      currency: 'usd',
      features: [
        'Unlimited analyses',
        'Custom model training',
        'Dedicated support',
        'SLA guarantees',
        'On-premise deployment',
        'Custom integrations',
        'Advanced security',
        'Custom reporting',
      ],
      analysisLimit: -1,
    },
  ];

  // Try to match by Stripe price ID first, then by plan ID
  return plans.find(plan => plan.id === planId) || plans[0];
}

/**
 * Get current usage for user
 */
async function getCurrentUsage(userId: string, subscription: any) {
  try {
    // Get usage for current billing period
    const { data: usageRecords, error } = await supabase
      .from('usage_records')
      .select('quantity')
      .eq('user_id', userId)
      .eq('usage_type', 'api_calls')
      .gte('timestamp', subscription.current_period_start)
      .lt('timestamp', subscription.current_period_end);

    if (error) {
      logger.error("Failed to fetch usage:", error instanceof Error ? error : new Error(String(error)));
      return {
        current: 0,
        limit: 0,
        percentage: 0,
        resetDate: subscription.current_period_end,
        overage: 0,
        overageCost: 0,
      };
    }

    const currentUsage = usageRecords.reduce((total, record) => total + record.quantity, 0);
    const plan = await getSubscriptionPlan(subscription.plan_id);
    const limit = plan.analysisLimit;
    const percentage = limit > 0 ? Math.min((currentUsage / limit) * 100, 100) : 0;
    const overage = limit > 0 ? Math.max(0, currentUsage - limit) : 0;
    const overageCost = overage * 0.01; // $0.01 per additional call

    return {
      current: currentUsage,
      limit,
      percentage,
      resetDate: subscription.current_period_end,
      overage,
      overageCost,
    };
  } catch (error) {
    logger.error("Error getting current usage:", error instanceof Error ? error : new Error(String(error)));
    return {
      current: 0,
      limit: 0,
      percentage: 0,
      resetDate: subscription.current_period_end,
      overage: 0,
      overageCost: 0,
    };
  }
}

/**
 * Get default payment method for customer
 */
async function getDefaultPaymentMethod(customerId: string) {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.deleted || !customer.invoice_settings?.default_payment_method) {
      return null;
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(
      customer.invoice_settings.default_payment_method as string
    );

    if (paymentMethod.card) {
      return {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expiryMonth: paymentMethod.card.exp_month,
        expiryYear: paymentMethod.card.exp_year,
      };
    }

    return null;
  } catch (error) {
    logger.error("Error getting payment method:", error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

/**
 * Get recent invoices for customer
 */
async function getRecentInvoices(customerId: string, limit: number = 10) {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: limit,
      status: 'paid',
    });

    return invoices.data.map(invoice => ({
      id: invoice.id,
      date: new Date(invoice.created * 1000).toISOString(),
      amount: invoice.amount_paid / 100, // Convert from cents
      status: invoice.status || 'unknown',
      downloadUrl: invoice.invoice_pdf || invoice.hosted_invoice_url || '',
      description: invoice.description || `Invoice for ${new Date(invoice.created * 1000).toLocaleDateString()}`,
    }));
  } catch (error) {
    logger.error("Error getting invoices:", error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

/**
 * Get usage analytics for user
 */
async function getUsageAnalytics(userId: string, days: number): Promise<UsageAnalytics> {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    const { data: records, error } = await supabase
      .from('usage_records')
      .select('quantity, timestamp')
      .eq('user_id', userId)
      .eq('usage_type', 'api_calls')
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString())
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch usage analytics: ${error.message}`);
    }

    // Group by day
    const dailyUsage = new Map<string, number>();
    let totalUsage = 0;

    records.forEach(record => {
      const date = new Date(record.timestamp).toISOString().split('T')[0];
      dailyUsage.set(date, (dailyUsage.get(date) || 0) + record.quantity);
      totalUsage += record.quantity;
    });

    // Convert to array and fill missing days with 0
    const dailyBreakdown: Array<{ date: string; usage: number }> = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      dailyBreakdown.push({
        date,
        usage: dailyUsage.get(date) || 0
      });
    }

    // Find peak day
    const peakDay = dailyBreakdown.reduce((peak, day) => 
      day.usage > peak.usage ? day : peak,
      { date: '', usage: 0 }
    );

    // Calculate trend (simple linear regression)
    const n = dailyBreakdown.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = dailyBreakdown.reduce((sum, day) => sum + day.usage, 0);
    const sumXY = dailyBreakdown.reduce((sum, day, index) => sum + index * day.usage, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const trend = slope > 1 ? 'increasing' : slope < -1 ? 'decreasing' : 'stable';

    return {
      totalUsage,
      dailyAverage: totalUsage / days,
      peakDay,
      trend,
      dailyBreakdown
    };
  } catch (error) {
    logger.error("Error getting usage analytics:", error instanceof Error ? error : new Error(String(error)));
    return {
      totalUsage: 0,
      dailyAverage: 0,
      peakDay: { date: '', usage: 0 },
      trend: 'stable',
      dailyBreakdown: []
    };
  }
}