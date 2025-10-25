/**
 * Subscription Test Factories
 * Factory functions for creating test data for subscription and billing tests
 */

import { faker } from '@faker-js/faker';
import { testDatabase } from '../utils/testDatabase';
import type { UserSubscription, StripeCustomer } from '../../types/subscription';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  created_at: Date;
}

export interface TestCustomer {
  id: string;
  userId: string;
  stripeCustomerId: string;
  email: string;
  name: string;
}

export interface TestSubscription {
  id: string;
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

/**
 * Create a test user
 */
export async function createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  const userData = {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    created_at: new Date(),
    ...overrides,
  };

  const { data: user, error } = await testDatabase.supabase
    .from('users')
    .insert(userData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  return user;
}

/**
 * Create a test Stripe customer
 */
export async function createTestCustomer(
  userId: string,
  overrides: Partial<TestCustomer> = {}
): Promise<TestCustomer> {
  const customerData = {
    user_id: userId,
    stripe_customer_id: `cus_test_${faker.string.alphanumeric(14)}`,
    email: faker.internet.email(),
    name: faker.person.fullName(),
    created_at: new Date(),
    ...overrides,
  };

  const { data: customer, error } = await testDatabase.supabase
    .from('stripe_customers')
    .insert(customerData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test customer: ${error.message}`);
  }

  return {
    id: customer.id,
    userId: customer.user_id,
    stripeCustomerId: customer.stripe_customer_id,
    email: customer.email,
    name: customer.name,
  };
}

/**
 * Create a test subscription
 */
export async function createTestSubscription(
  userId: string,
  stripeCustomerId: string,
  overrides: Partial<TestSubscription> = {}
): Promise<TestSubscription> {
  const now = new Date();
  const subscriptionData = {
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: `sub_test_${faker.string.alphanumeric(14)}`,
    plan_id: 'price_test_basic_monthly',
    status: 'active',
    current_period_start: now,
    current_period_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
    created_at: now,
    ...overrides,
  };

  const { data: subscription, error } = await testDatabase.supabase
    .from('user_subscriptions')
    .insert(subscriptionData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test subscription: ${error.message}`);
  }

  return {
    id: subscription.id,
    userId: subscription.user_id,
    stripeCustomerId: subscription.stripe_customer_id,
    stripeSubscriptionId: subscription.stripe_subscription_id,
    planId: subscription.plan_id,
    status: subscription.status,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
  };
}

/**
 * Create a test trial subscription
 */
export async function createTestTrialSubscription(
  userId: string,
  stripeCustomerId: string,
  trialDays: number = 14
): Promise<TestSubscription> {
  const now = new Date();
  const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  return createTestSubscription(userId, stripeCustomerId, {
    status: 'trialing',
    trial_end: trialEnd,
  });
}

/**
 * Create test payment history
 */
export async function createTestPaymentHistory(
  userId: string,
  stripeCustomerId: string,
  count: number = 1,
  overrides: any = {}
) {
  const payments = Array.from({ length: count }, (_, index) => ({
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
    stripe_charge_id: `ch_test_${faker.string.alphanumeric(14)}`,
    amount: faker.number.int({ min: 1000, max: 10000 }), // $10-$100
    currency: 'usd',
    status: faker.helpers.arrayElement(['succeeded', 'failed', 'pending']),
    payment_method_type: 'card',
    payment_method_brand: faker.helpers.arrayElement(['visa', 'mastercard', 'amex']),
    payment_method_last4: faker.string.numeric(4),
    description: `Test payment ${index + 1}`,
    created_at: faker.date.recent({ days: 30 }),
    ...overrides,
  }));

  const { data: paymentHistory, error } = await testDatabase.supabase
    .from('payment_history')
    .insert(payments)
    .select();

  if (error) {
    throw new Error(`Failed to create test payment history: ${error.message}`);
  }

  return paymentHistory;
}

/**
 * Create test invoices
 */
export async function createTestInvoices(
  userId: string,
  stripeCustomerId: string,
  count: number = 1,
  overrides: any = {}
) {
  const invoices = Array.from({ length: count }, (_, index) => ({
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
    stripe_invoice_id: `in_test_${faker.string.alphanumeric(14)}`,
    amount: faker.number.int({ min: 1000, max: 10000 }),
    currency: 'usd',
    status: faker.helpers.arrayElement(['paid', 'open', 'draft', 'void']),
    description: `Test invoice ${index + 1}`,
    invoice_number: `INV-${faker.date.recent().getFullYear()}-${faker.string.numeric(3)}`,
    invoice_url: faker.internet.url(),
    hosted_invoice_url: faker.internet.url(),
    period_start: faker.date.recent({ days: 60 }),
    period_end: faker.date.recent({ days: 30 }),
    created_at: faker.date.recent({ days: 30 }),
    ...overrides,
  }));

  const { data: invoiceData, error } = await testDatabase.supabase
    .from('invoices')
    .insert(invoices)
    .select();

  if (error) {
    throw new Error(`Failed to create test invoices: ${error.message}`);
  }

  return invoiceData;
}

/**
 * Create test payment methods
 */
export async function createTestPaymentMethods(
  userId: string,
  stripeCustomerId: string,
  count: number = 1,
  overrides: any = {}
) {
  const paymentMethods = Array.from({ length: count }, (_, index) => ({
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
    stripe_payment_method_id: `pm_test_${faker.string.alphanumeric(14)}`,
    type: 'card',
    card_brand: faker.helpers.arrayElement(['visa', 'mastercard', 'amex', 'discover']),
    card_last4: faker.string.numeric(4),
    card_exp_month: faker.number.int({ min: 1, max: 12 }),
    card_exp_year: faker.number.int({ min: 2024, max: 2030 }),
    card_country: faker.location.countryCode(),
    is_default: index === 0, // First payment method is default
    created_at: faker.date.recent({ days: 30 }),
    ...overrides,
  }));

  const { data: paymentMethodData, error } = await testDatabase.supabase
    .from('payment_methods')
    .insert(paymentMethods)
    .select();

  if (error) {
    throw new Error(`Failed to create test payment methods: ${error.message}`);
  }

  return paymentMethodData;
}

/**
 * Create test usage records
 */
export async function createTestUsageRecords(
  userId: string,
  days: number = 30,
  overrides: any = {}
) {
  const usageRecords = Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);

    return {
      user_id: userId,
      usage_type: 'analysis',
      quantity: faker.number.int({ min: 0, max: 500 }),
      timestamp: date,
      metadata: {
        source: 'test',
        batch_id: faker.string.uuid(),
      },
      ...overrides,
    };
  });

  const { data: usageData, error } = await testDatabase.supabase
    .from('usage_records')
    .insert(usageRecords)
    .select();

  if (error) {
    throw new Error(`Failed to create test usage records: ${error.message}`);
  }

  return usageData;
}

/**
 * Create test billing notifications
 */
export async function createTestBillingNotifications(
  userId: string,
  count: number = 1,
  overrides: any = {}
) {
  const notifications = Array.from({ length: count }, (_, index) => ({
    user_id: userId,
    type: faker.helpers.arrayElement([
      'payment_succeeded',
      'payment_failed',
      'subscription_created',
      'subscription_canceled',
      'trial_ending',
    ]),
    title: faker.lorem.sentence(),
    message: faker.lorem.paragraph(),
    severity: faker.helpers.arrayElement(['info', 'warning', 'error']),
    read: faker.datatype.boolean(),
    action_url: faker.internet.url(),
    action_text: 'View Details',
    created_at: faker.date.recent({ days: 7 }),
    ...overrides,
  }));

  const { data: notificationData, error } = await testDatabase.supabase
    .from('billing_notifications')
    .insert(notifications)
    .select();

  if (error) {
    throw new Error(`Failed to create test billing notifications: ${error.message}`);
  }

  return notificationData;
}

/**
 * Create test webhook events
 */
export async function createTestWebhookEvents(
  count: number = 1,
  overrides: any = {}
) {
  const webhookEvents = Array.from({ length: count }, (_, index) => ({
    stripe_event_id: `evt_test_${faker.string.alphanumeric(14)}`,
    event_type: faker.helpers.arrayElement([
      'customer.subscription.created',
      'customer.subscription.updated',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'checkout.session.completed',
    ]),
    success: faker.datatype.boolean({ probability: 0.9 }), // 90% success rate
    message: faker.lorem.sentence(),
    error_message: faker.datatype.boolean({ probability: 0.1 }) ? faker.lorem.sentence() : null,
    processed_at: faker.date.recent({ days: 1 }),
    event_data: {
      id: faker.string.alphanumeric(14),
      object: 'subscription',
      status: 'active',
    },
    created_at: faker.date.recent({ days: 1 }),
    ...overrides,
  }));

  const { data: webhookData, error } = await testDatabase.supabase
    .from('webhook_events')
    .insert(webhookEvents)
    .select();

  if (error) {
    throw new Error(`Failed to create test webhook events: ${error.message}`);
  }

  return webhookData;
}

/**
 * Create a complete test billing scenario
 */
export async function createTestBillingScenario(overrides: any = {}) {
  // Create user
  const user = await createTestUser();
  
  // Create customer
  const customer = await createTestCustomer(user.id);
  
  // Create subscription
  const subscription = await createTestSubscription(user.id, customer.stripeCustomerId);
  
  // Create payment history
  const paymentHistory = await createTestPaymentHistory(user.id, customer.stripeCustomerId, 3);
  
  // Create invoices
  const invoices = await createTestInvoices(user.id, customer.stripeCustomerId, 2);
  
  // Create payment methods
  const paymentMethods = await createTestPaymentMethods(user.id, customer.stripeCustomerId, 2);
  
  // Create usage records
  const usageRecords = await createTestUsageRecords(user.id, 30);
  
  // Create notifications
  const notifications = await createTestBillingNotifications(user.id, 3);

  return {
    user,
    customer,
    subscription,
    paymentHistory,
    invoices,
    paymentMethods,
    usageRecords,
    notifications,
  };
}

/**
 * Clean up test data
 */
export async function cleanupTestData(userId: string) {
  const tables = [
    'billing_notifications',
    'usage_records',
    'payment_methods',
    'invoices',
    'payment_history',
    'user_subscriptions',
    'stripe_customers',
    'users',
  ];

  for (const table of tables) {
    await testDatabase.supabase
      .from(table)
      .delete()
      .eq('user_id', userId);
  }
}