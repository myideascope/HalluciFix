-- Migration: Billing API Support Tables
-- Description: Create tables to support billing API endpoints and payment method management

-- Payment method events table for logging payment method operations
CREATE TABLE IF NOT EXISTS payment_method_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_method_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- 'attached', 'detached', 'set_default'
  payment_method_type VARCHAR(50) NOT NULL,
  card_brand VARCHAR(50),
  card_last4 VARCHAR(4),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment method validations table for security tracking
CREATE TABLE IF NOT EXISTS payment_method_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_method_id VARCHAR(255) NOT NULL,
  is_valid BOOLEAN NOT NULL,
  risk_level VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high'
  errors TEXT[], -- Array of error messages
  warnings TEXT[], -- Array of warning messages
  validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscription events table for tracking subscription lifecycle
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- 'trial_will_end', 'payment_failed', 'cancellation_scheduled', etc.
  event_data JSONB, -- Flexible data storage for event-specific information
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invoice events table for tracking invoice lifecycle
CREATE TABLE IF NOT EXISTS invoice_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_invoice_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_subscription_id VARCHAR(255),
  event_type VARCHAR(50) NOT NULL, -- 'created', 'finalized', 'paid', 'failed'
  amount INTEGER, -- Amount in cents
  currency VARCHAR(3),
  status VARCHAR(50),
  invoice_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Checkout sessions table for tracking checkout attempts
CREATE TABLE IF NOT EXISTS checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id VARCHAR(255) NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL, -- 'open', 'complete', 'expired'
  mode VARCHAR(20) NOT NULL, -- 'payment', 'subscription', 'setup'
  amount_total INTEGER,
  currency VARCHAR(3),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- One-time payments table for non-subscription payments
CREATE TABLE IF NOT EXISTS one_time_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- Amount in cents
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(50) NOT NULL, -- 'completed', 'failed', 'refunded'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email notifications table for tracking sent emails
CREATE TABLE IF NOT EXISTS email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type VARCHAR(50) NOT NULL, -- 'welcome', 'cancellation', 'trial_ending', 'payment_failed', etc.
  stripe_subscription_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  email_data JSONB -- Store email-specific data
);

-- Webhook events table for monitoring webhook processing
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  success BOOLEAN NOT NULL,
  message TEXT,
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  event_data JSONB, -- Store the full event data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_method_events_user_id ON payment_method_events(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_events_stripe_pm_id ON payment_method_events(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_events_created_at ON payment_method_events(created_at);

CREATE INDEX IF NOT EXISTS idx_payment_method_validations_user_id ON payment_method_validations(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_validations_stripe_pm_id ON payment_method_validations(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_validations_validated_at ON payment_method_validations(validated_at);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_stripe_sub_id ON subscription_events(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON subscription_events(created_at);

CREATE INDEX IF NOT EXISTS idx_invoice_events_stripe_invoice_id ON invoice_events(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_events_stripe_customer_id ON invoice_events(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_events_stripe_subscription_id ON invoice_events(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoice_events_event_type ON invoice_events(event_type);
CREATE INDEX IF NOT EXISTS idx_invoice_events_created_at ON invoice_events(created_at);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_stripe_session_id ON checkout_sessions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user_id ON checkout_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON checkout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_created_at ON checkout_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_one_time_payments_stripe_customer_id ON one_time_payments(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_one_time_payments_user_id ON one_time_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_one_time_payments_status ON one_time_payments(status);
CREATE INDEX IF NOT EXISTS idx_one_time_payments_created_at ON one_time_payments(created_at);

CREATE INDEX IF NOT EXISTS idx_email_notifications_user_id ON email_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_email_type ON email_notifications(email_type);
CREATE INDEX IF NOT EXISTS idx_email_notifications_stripe_subscription_id ON email_notifications(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_sent_at ON email_notifications(sent_at);

CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_event_id ON webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_success ON webhook_events(success);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at);

-- Row Level Security (RLS) policies
ALTER TABLE payment_method_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_method_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_time_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies for user data access
CREATE POLICY "Users can view their own payment method events" ON payment_method_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own payment method validations" ON payment_method_validations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own subscription events" ON subscription_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own email notifications" ON email_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own checkout sessions" ON checkout_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own one-time payments" ON one_time_payments
  FOR SELECT USING (auth.uid() = user_id);

-- Service role policies for webhook and system operations
CREATE POLICY "Service role can manage payment method events" ON payment_method_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage payment method validations" ON payment_method_validations
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage subscription events" ON subscription_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage invoice events" ON invoice_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage email notifications" ON email_notifications
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage checkout sessions" ON checkout_sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage one-time payments" ON one_time_payments
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage webhook events" ON webhook_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Comments for documentation
COMMENT ON TABLE payment_method_events IS 'Logs all payment method operations for audit and analytics';
COMMENT ON TABLE payment_method_validations IS 'Tracks payment method security validations and risk assessments';
COMMENT ON TABLE subscription_events IS 'Records subscription lifecycle events for monitoring and notifications';
COMMENT ON TABLE invoice_events IS 'Tracks invoice processing and status changes';
COMMENT ON TABLE checkout_sessions IS 'Records checkout session attempts and outcomes';
COMMENT ON TABLE one_time_payments IS 'Stores one-time payment transactions outside of subscriptions';
COMMENT ON TABLE email_notifications IS 'Tracks all billing-related email notifications sent to users';
COMMENT ON TABLE webhook_events IS 'Logs webhook event processing for monitoring and debugging';