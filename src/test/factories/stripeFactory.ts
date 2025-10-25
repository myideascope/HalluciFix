export interface TestStripeCustomer {
  id: string;
  email: string;
  name?: string;
  created: number;
  subscriptions: {
    data: TestStripeSubscription[];
  };
  default_source?: string | null;
  sources: {
    data: TestStripePaymentMethod[];
  };
  metadata?: Record<string, string>;
}

export interface TestStripeSubscription {
  id: string;
  customer: string;
  status: 'active' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'trialing' | 'unpaid';
  current_period_start: number;
  current_period_end: number;
  items: {
    data: TestStripeSubscriptionItem[];
  };
  latest_invoice?: string | null;
  trial_end?: number | null;
  cancel_at_period_end: boolean;
  canceled_at?: number | null;
  metadata?: Record<string, string>;
}

export interface TestStripeSubscriptionItem {
  id: string;
  price: TestStripePrice;
  quantity: number;
}

export interface TestStripePrice {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
  };
  product: string;
  metadata?: Record<string, string>;
}

export interface TestStripePaymentMethod {
  id: string;
  type: 'card' | 'bank_account' | 'sepa_debit';
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
}

export interface TestStripeInvoice {
  id: string;
  customer: string;
  subscription?: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amount_paid: number;
  amount_due: number;
  currency: string;
  created: number;
  period_start: number;
  period_end: number;
  lines: {
    data: TestStripeInvoiceLineItem[];
  };
}

export interface TestStripeInvoiceLineItem {
  id: string;
  amount: number;
  currency: string;
  description: string;
  proration: boolean;
  period: {
    start: number;
    end: number;
  };
}

export interface TestStripePaymentIntent {
  id: string;
  client_secret: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  amount: number;
  currency: string;
  payment_method_types: string[];
  customer?: string;
  metadata?: Record<string, string>;
}

export interface TestStripeCheckoutSession {
  id: string;
  url: string;
  mode: 'payment' | 'setup' | 'subscription';
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required';
  status: 'open' | 'complete' | 'expired';
  customer?: string;
  subscription?: string;
  metadata?: Record<string, string>;
}

// Price configurations for different plans
const PLAN_PRICES = {
  free: { amount: 0, interval: 'month' as const },
  pro: { amount: 2000, interval: 'month' as const }, // $20/month
  enterprise: { amount: 5000, interval: 'month' as const } // $50/month
};

const CARD_BRANDS = ['visa', 'mastercard', 'amex', 'discover'];
const CURRENCIES = ['usd', 'eur', 'gbp', 'cad'];

export const createTestStripeCustomer = (overrides: Partial<TestStripeCustomer> = {}): TestStripeCustomer => {
  const baseCustomer: TestStripeCustomer = {
    id: `cus_${Math.random().toString(36).substr(2, 14)}`,
    email: `customer-${Math.random().toString(36).substr(2, 8)}@example.com`,
    name: `Test Customer ${Math.random().toString(36).substr(2, 4)}`,
    created: Math.floor(Date.now() / 1000),
    subscriptions: { data: [] },
    default_source: null,
    sources: { data: [] },
    metadata: {}
  };

  return { ...baseCustomer, ...overrides };
};

export const createTestStripePrice = (
  plan: 'free' | 'pro' | 'enterprise' = 'pro',
  overrides: Partial<TestStripePrice> = {}
): TestStripePrice => {
  const planConfig = PLAN_PRICES[plan];
  
  const basePrice: TestStripePrice = {
    id: `price_${Math.random().toString(36).substr(2, 14)}`,
    unit_amount: planConfig.amount,
    currency: 'usd',
    recurring: {
      interval: planConfig.interval,
      interval_count: 1
    },
    product: `prod_${plan}_${Math.random().toString(36).substr(2, 8)}`,
    metadata: { plan }
  };

  return { ...basePrice, ...overrides };
};

export const createTestStripeSubscription = (
  customerId: string,
  plan: 'free' | 'pro' | 'enterprise' = 'pro',
  overrides: Partial<TestStripeSubscription> = {}
): TestStripeSubscription => {
  const now = Math.floor(Date.now() / 1000);
  const price = createTestStripePrice(plan);
  
  const baseSubscription: TestStripeSubscription = {
    id: `sub_${Math.random().toString(36).substr(2, 14)}`,
    customer: customerId,
    status: 'active',
    current_period_start: now,
    current_period_end: now + (30 * 24 * 60 * 60), // 30 days from now
    items: {
      data: [{
        id: `si_${Math.random().toString(36).substr(2, 14)}`,
        price,
        quantity: 1
      }]
    },
    latest_invoice: null,
    trial_end: null,
    cancel_at_period_end: false,
    metadata: { plan }
  };

  return { ...baseSubscription, ...overrides };
};

export const createTestStripePaymentMethod = (overrides: Partial<TestStripePaymentMethod> = {}): TestStripePaymentMethod => {
  const brand = CARD_BRANDS[Math.floor(Math.random() * CARD_BRANDS.length)];
  const currentYear = new Date().getFullYear();
  
  const basePaymentMethod: TestStripePaymentMethod = {
    id: `pm_${Math.random().toString(36).substr(2, 14)}`,
    type: 'card',
    card: {
      brand,
      last4: Math.floor(Math.random() * 9999).toString().padStart(4, '0'),
      exp_month: Math.floor(Math.random() * 12) + 1,
      exp_year: currentYear + Math.floor(Math.random() * 5) + 1
    }
  };

  return { ...basePaymentMethod, ...overrides };
};

export const createTestStripeInvoice = (
  customerId: string,
  subscriptionId?: string,
  overrides: Partial<TestStripeInvoice> = {}
): TestStripeInvoice => {
  const now = Math.floor(Date.now() / 1000);
  const amount = Math.floor(Math.random() * 5000) + 1000; // $10-$50
  
  const baseInvoice: TestStripeInvoice = {
    id: `in_${Math.random().toString(36).substr(2, 14)}`,
    customer: customerId,
    subscription: subscriptionId,
    status: 'paid',
    amount_paid: amount,
    amount_due: 0,
    currency: 'usd',
    created: now,
    period_start: now - (30 * 24 * 60 * 60), // 30 days ago
    period_end: now,
    lines: {
      data: [{
        id: `il_${Math.random().toString(36).substr(2, 14)}`,
        amount,
        currency: 'usd',
        description: 'Subscription fee',
        proration: false,
        period: {
          start: now - (30 * 24 * 60 * 60),
          end: now
        }
      }]
    }
  };

  return { ...baseInvoice, ...overrides };
};

export const createTestStripePaymentIntent = (overrides: Partial<TestStripePaymentIntent> = {}): TestStripePaymentIntent => {
  const amount = Math.floor(Math.random() * 5000) + 1000; // $10-$50
  const currency = CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)];
  
  const basePaymentIntent: TestStripePaymentIntent = {
    id: `pi_${Math.random().toString(36).substr(2, 14)}`,
    client_secret: `pi_${Math.random().toString(36).substr(2, 14)}_secret_${Math.random().toString(36).substr(2, 10)}`,
    status: 'requires_payment_method',
    amount,
    currency,
    payment_method_types: ['card'],
    metadata: {}
  };

  return { ...basePaymentIntent, ...overrides };
};

export const createTestStripeCheckoutSession = (overrides: Partial<TestStripeCheckoutSession> = {}): TestStripeCheckoutSession => {
  const baseSession: TestStripeCheckoutSession = {
    id: `cs_${Math.random().toString(36).substr(2, 14)}`,
    url: `https://checkout.stripe.com/pay/cs_${Math.random().toString(36).substr(2, 14)}`,
    mode: 'subscription',
    payment_status: 'unpaid',
    status: 'open',
    metadata: {}
  };

  return { ...baseSession, ...overrides };
};

// Specialized factory functions
export const createActiveSubscription = (customerId: string, plan: 'pro' | 'enterprise' = 'pro'): TestStripeSubscription => {
  return createTestStripeSubscription(customerId, plan, {
    status: 'active',
    cancel_at_period_end: false
  });
};

export const createTrialingSubscription = (customerId: string, plan: 'pro' | 'enterprise' = 'pro'): TestStripeSubscription => {
  const trialEnd = Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60); // 14 days from now
  
  return createTestStripeSubscription(customerId, plan, {
    status: 'trialing',
    trial_end: trialEnd
  });
};

export const createCanceledSubscription = (customerId: string, plan: 'pro' | 'enterprise' = 'pro'): TestStripeSubscription => {
  const now = Math.floor(Date.now() / 1000);
  
  return createTestStripeSubscription(customerId, plan, {
    status: 'canceled',
    canceled_at: now - (7 * 24 * 60 * 60), // Canceled 7 days ago
    cancel_at_period_end: false
  });
};

export const createPastDueSubscription = (customerId: string, plan: 'pro' | 'enterprise' = 'pro'): TestStripeSubscription => {
  return createTestStripeSubscription(customerId, plan, {
    status: 'past_due'
  });
};

export const createCustomerWithSubscription = (
  plan: 'free' | 'pro' | 'enterprise' = 'pro',
  subscriptionStatus: TestStripeSubscription['status'] = 'active'
): { customer: TestStripeCustomer; subscription: TestStripeSubscription } => {
  const customer = createTestStripeCustomer();
  const subscription = createTestStripeSubscription(customer.id, plan, { status: subscriptionStatus });
  
  customer.subscriptions.data = [subscription];
  
  return { customer, subscription };
};

export const createCustomerWithPaymentMethods = (paymentMethodCount: number = 2): TestStripeCustomer => {
  const customer = createTestStripeCustomer();
  const paymentMethods = Array.from({ length: paymentMethodCount }, () => createTestStripePaymentMethod());
  
  customer.sources.data = paymentMethods;
  customer.default_source = paymentMethods[0]?.id || null;
  
  return customer;
};

export const createInvoiceHistory = (customerId: string, count: number = 5): TestStripeInvoice[] => {
  const invoices: TestStripeInvoice[] = [];
  const now = Math.floor(Date.now() / 1000);
  
  for (let i = 0; i < count; i++) {
    const monthsAgo = i;
    const invoiceDate = now - (monthsAgo * 30 * 24 * 60 * 60);
    
    const invoice = createTestStripeInvoice(customerId, undefined, {
      created: invoiceDate,
      period_start: invoiceDate - (30 * 24 * 60 * 60),
      period_end: invoiceDate,
      status: Math.random() > 0.1 ? 'paid' : 'open' // 90% paid, 10% open
    });
    
    invoices.push(invoice);
  }
  
  return invoices.sort((a, b) => b.created - a.created); // Most recent first
};

// Utility functions for test scenarios
export const createFailedPaymentScenario = (customerId: string) => {
  const subscription = createTestStripeSubscription(customerId, 'pro', {
    status: 'past_due'
  });
  
  const failedInvoice = createTestStripeInvoice(customerId, subscription.id, {
    status: 'open',
    amount_paid: 0,
    amount_due: 2000
  });
  
  const paymentIntent = createTestStripePaymentIntent({
    status: 'requires_payment_method',
    customer: customerId,
    amount: 2000
  });
  
  return { subscription, invoice: failedInvoice, paymentIntent };
};

export const createUpgradeScenario = (customerId: string) => {
  const currentSubscription = createTestStripeSubscription(customerId, 'pro', {
    status: 'active'
  });
  
  const upgradeSession = createTestStripeCheckoutSession({
    mode: 'subscription',
    customer: customerId,
    status: 'open'
  });
  
  return { currentSubscription, upgradeSession };
};

export const createRefundScenario = (customerId: string) => {
  const paymentIntent = createTestStripePaymentIntent({
    status: 'succeeded',
    customer: customerId,
    amount: 2000
  });
  
  const refund = {
    id: `re_${Math.random().toString(36).substr(2, 14)}`,
    payment_intent: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: 'succeeded',
    reason: 'requested_by_customer',
    created: Math.floor(Date.now() / 1000)
  };
  
  return { paymentIntent, refund };
};