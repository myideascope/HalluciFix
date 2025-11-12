/**
 * Test Database Utility
 * Provides database setup, cleanup, and utilities for integration tests
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../lib/config';

export class TestDatabase {
  public supabase: SupabaseClient;
  private isSetup = false;

  constructor() {
    // Initialize with default values - will be updated in initialize()
    this.supabase = createClient('http://localhost:8000', 'dummy-key');
  }

  /**
   * Initialize the database connection
   */
  async initialize(): Promise<void> {
    const dbConfig = await config.getDatabase();

    const supabaseUrl = process.env.VITE_SUPABASE_TEST_URL || dbConfig.supabaseUrl || 'http://localhost:8000';
    const supabaseKey = process.env.VITE_SUPABASE_TEST_ANON_KEY || dbConfig.supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Setup test database with required tables and constraints
   */
  async setup(): Promise<void> {
    if (this.isSetup) return;

    try {
      // Create test-specific tables if they don't exist
      await this.createTestTables();
      
      // Setup test constraints and indexes
      await this.setupConstraints();
      
      this.isSetup = true;
    } catch (error) {
      console.error('Failed to setup test database:', error);
      throw error;
    }
  }

  /**
   * Clean up test data
   */
  async cleanup(): Promise<void> {
    try {
      // Clean up in reverse dependency order
      const tables = [
        'webhook_events',
        'billing_notifications',
        'usage_records',
        'payment_method_events',
        'payment_methods',
        'invoice_events',
        'invoices',
        'payment_history',
        'subscription_events',
        'user_subscriptions',
        'stripe_customers',
        'users',
      ];

      for (const table of tables) {
        await this.supabase
          .from(table)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all test data
      }
    } catch (error) {
      console.error('Failed to cleanup test database:', error);
      throw error;
    }
  }

  /**
   * Create test tables
   */
  private async createTestTables(): Promise<void> {
    const tables = [
      // Users table
      `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          access_level TEXT DEFAULT 'free',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Stripe customers table
      `
        CREATE TABLE IF NOT EXISTS stripe_customers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          stripe_customer_id TEXT UNIQUE NOT NULL,
          email TEXT NOT NULL,
          name TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // User subscriptions table
      `
        CREATE TABLE IF NOT EXISTS user_subscriptions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          stripe_customer_id TEXT NOT NULL,
          stripe_subscription_id TEXT UNIQUE NOT NULL,
          plan_id TEXT NOT NULL,
          status TEXT NOT NULL,
          current_period_start TIMESTAMPTZ NOT NULL,
          current_period_end TIMESTAMPTZ NOT NULL,
          trial_end TIMESTAMPTZ,
          cancel_at_period_end BOOLEAN DEFAULT FALSE,
          canceled_at TIMESTAMPTZ,
          ended_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Payment history table
      `
        CREATE TABLE IF NOT EXISTS payment_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          stripe_customer_id TEXT NOT NULL,
          stripe_charge_id TEXT UNIQUE,
          stripe_payment_intent_id TEXT,
          stripe_invoice_id TEXT,
          invoice_id UUID,
          amount INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'usd',
          status TEXT NOT NULL,
          payment_method_type TEXT,
          payment_method_brand TEXT,
          payment_method_last4 TEXT,
          payment_method_expiry_month INTEGER,
          payment_method_expiry_year INTEGER,
          payment_method_country TEXT,
          description TEXT,
          receipt_url TEXT,
          failure_code TEXT,
          failure_message TEXT,
          failure_reason TEXT,
          refunded BOOLEAN DEFAULT FALSE,
          refunded_amount INTEGER,
          dispute_status TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Invoices table
      `
        CREATE TABLE IF NOT EXISTS invoices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          stripe_customer_id TEXT NOT NULL,
          stripe_invoice_id TEXT UNIQUE NOT NULL,
          subscription_id UUID,
          stripe_subscription_id TEXT,
          amount INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'usd',
          status TEXT NOT NULL,
          description TEXT,
          invoice_number TEXT,
          invoice_url TEXT,
          hosted_invoice_url TEXT,
          invoice_pdf TEXT,
          due_date TIMESTAMPTZ,
          paid_at TIMESTAMPTZ,
          period_start TIMESTAMPTZ,
          period_end TIMESTAMPTZ,
          subtotal INTEGER,
          tax INTEGER,
          total INTEGER,
          attempt_count INTEGER DEFAULT 0,
          next_payment_attempt TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Payment methods table
      `
        CREATE TABLE IF NOT EXISTS payment_methods (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          stripe_customer_id TEXT NOT NULL,
          stripe_payment_method_id TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL,
          card_brand TEXT,
          card_last4 TEXT CHECK (LENGTH(card_last4) = 4),
          card_exp_month INTEGER CHECK (card_exp_month >= 1 AND card_exp_month <= 12),
          card_exp_year INTEGER CHECK (card_exp_year >= EXTRACT(YEAR FROM NOW())),
          card_country TEXT,
          is_default BOOLEAN DEFAULT FALSE,
          deleted_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Usage records table
      `
        CREATE TABLE IF NOT EXISTS usage_records (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          usage_type TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          timestamp TIMESTAMPTZ NOT NULL,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Billing notifications table
      `
        CREATE TABLE IF NOT EXISTS billing_notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          severity TEXT DEFAULT 'info',
          read BOOLEAN DEFAULT FALSE,
          read_at TIMESTAMPTZ,
          action_url TEXT,
          action_text TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Webhook events table
      `
        CREATE TABLE IF NOT EXISTS webhook_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stripe_event_id TEXT UNIQUE NOT NULL,
          event_type TEXT NOT NULL,
          success BOOLEAN NOT NULL,
          message TEXT,
          error_message TEXT,
          processed_at TIMESTAMPTZ NOT NULL,
          event_data JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Payment method events table
      `
        CREATE TABLE IF NOT EXISTS payment_method_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stripe_payment_method_id TEXT NOT NULL,
          stripe_customer_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payment_method_type TEXT,
          card_brand TEXT,
          card_last4 TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Invoice events table
      `
        CREATE TABLE IF NOT EXISTS invoice_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stripe_invoice_id TEXT NOT NULL,
          stripe_customer_id TEXT NOT NULL,
          stripe_subscription_id TEXT,
          event_type TEXT NOT NULL,
          amount INTEGER,
          currency TEXT,
          status TEXT,
          invoice_url TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Subscription events table
      `
        CREATE TABLE IF NOT EXISTS subscription_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          stripe_subscription_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_data JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Checkout sessions table
      `
        CREATE TABLE IF NOT EXISTS checkout_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stripe_session_id TEXT UNIQUE NOT NULL,
          user_id UUID,
          status TEXT NOT NULL,
          mode TEXT NOT NULL,
          amount_total INTEGER,
          currency TEXT,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // One-time payments table
      `
        CREATE TABLE IF NOT EXISTS one_time_payments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stripe_session_id TEXT NOT NULL,
          stripe_customer_id TEXT NOT NULL,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          amount INTEGER NOT NULL,
          currency TEXT NOT NULL,
          status TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Email notifications table
      `
        CREATE TABLE IF NOT EXISTS email_notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          email_type TEXT NOT NULL,
          stripe_subscription_id TEXT,
          stripe_invoice_id TEXT,
          sent_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
      
      // Billing audit log table
      `
        CREATE TABLE IF NOT EXISTS billing_audit_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          action_type TEXT NOT NULL,
          resource_type TEXT NOT NULL,
          resource_id TEXT,
          old_values JSONB,
          new_values JSONB,
          success BOOLEAN DEFAULT TRUE,
          error_message TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
    ];

    for (const tableSQL of tables) {
      const { error } = await this.supabase.rpc('exec_sql', { sql: tableSQL });
      if (error) {
        console.error(`Failed to create table: ${error.message}`);
        // Continue with other tables
      }
    }
  }

  /**
   * Setup constraints and indexes
   */
  private async setupConstraints(): Promise<void> {
    const constraints = [
      // Unique constraints
      'ALTER TABLE payment_methods ADD CONSTRAINT unique_default_per_user EXCLUDE (user_id WITH =) WHERE (is_default = true AND deleted_at IS NULL);',
      
      // Check constraints
      'ALTER TABLE payment_methods ADD CONSTRAINT check_card_brand CHECK (card_brand IN (\'visa\', \'mastercard\', \'amex\', \'discover\', \'diners\', \'jcb\', \'unionpay\'));',
      'ALTER TABLE user_subscriptions ADD CONSTRAINT check_subscription_status CHECK (status IN (\'active\', \'canceled\', \'incomplete\', \'incomplete_expired\', \'past_due\', \'trialing\', \'unpaid\'));',
      'ALTER TABLE payment_history ADD CONSTRAINT check_payment_status CHECK (status IN (\'succeeded\', \'failed\', \'pending\', \'canceled\', \'requires_action\'));',
      
      // Payment method limit constraint (max 5 per user)
      `
        CREATE OR REPLACE FUNCTION check_payment_method_limit()
        RETURNS TRIGGER AS $$
        BEGIN
          IF (SELECT COUNT(*) FROM payment_methods WHERE user_id = NEW.user_id AND deleted_at IS NULL) >= 5 THEN
            RAISE EXCEPTION 'User has reached the maximum payment method limit of 5';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `,
      'DROP TRIGGER IF EXISTS payment_method_limit_trigger ON payment_methods;',
      'CREATE TRIGGER payment_method_limit_trigger BEFORE INSERT ON payment_methods FOR EACH ROW EXECUTE FUNCTION check_payment_method_limit();',
      
      // Indexes for performance
      'CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_id ON user_subscriptions(stripe_subscription_id);',
      'CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_payment_history_status ON payment_history(status);',
      'CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_usage_records_user_id_timestamp ON usage_records(user_id, timestamp);',
      'CREATE INDEX IF NOT EXISTS idx_billing_notifications_user_id ON billing_notifications(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_event_id ON webhook_events(stripe_event_id);',
    ];

    for (const constraintSQL of constraints) {
      const { error } = await this.supabase.rpc('exec_sql', { sql: constraintSQL });
      if (error) {
        console.error(`Failed to create constraint: ${error.message}`);
        // Continue with other constraints
      }
    }
  }

  /**
   * Execute raw SQL for testing
   */
  async executeSql(sql: string): Promise<any> {
    const { data, error } = await this.supabase.rpc('exec_sql', { sql });
    if (error) {
      throw new Error(`SQL execution failed: ${error.message}`);
    }
    return data;
  }

  /**
   * Get table row count
   */
  async getRowCount(tableName: string): Promise<number> {
    const { count, error } = await this.supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw new Error(`Failed to get row count: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Truncate all test tables
   */
  async truncateAllTables(): Promise<void> {
    const tables = [
      'billing_audit_log',
      'email_notifications',
      'one_time_payments',
      'checkout_sessions',
      'subscription_events',
      'invoice_events',
      'payment_method_events',
      'webhook_events',
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
      await this.supabase.rpc('exec_sql', { 
        sql: `TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;` 
      });
    }
  }

  /**
   * Create test user with subscription
   */
  async createTestUserWithSubscription(): Promise<{
    user: any;
    customer: any;
    subscription: any;
  }> {
    // Create user
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .insert({
        email: 'test@example.com',
        name: 'Test User',
      })
      .select()
      .single();

    if (userError) throw userError;

    // Create customer
    const { data: customer, error: customerError } = await this.supabase
      .from('stripe_customers')
      .insert({
        user_id: user.id,
        stripe_customer_id: 'cus_test_123',
        email: user.email,
        name: user.name,
      })
      .select()
      .single();

    if (customerError) throw customerError;

    // Create subscription
    const { data: subscription, error: subscriptionError } = await this.supabase
      .from('user_subscriptions')
      .insert({
        user_id: user.id,
        stripe_customer_id: customer.stripe_customer_id,
        stripe_subscription_id: 'sub_test_123',
        plan_id: 'price_test_basic',
        status: 'active',
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .select()
      .single();

    if (subscriptionError) throw subscriptionError;

    return { user, customer, subscription };
  }
}

// Export singleton instance
export const testDatabase = new TestDatabase();