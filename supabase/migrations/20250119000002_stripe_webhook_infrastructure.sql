-- Stripe Webhook Infrastructure Migration
-- Creates tables for webhook event processing, subscription events, and email notifications

-- =============================================================================
-- WEBHOOK EVENTS TABLE
-- Tracks all webhook events received from Stripe for monitoring and debugging
-- =============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL,
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  event_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Ensure processed_at is after created_at
  CHECK (processed_at >= created_at)
);

-- =============================================================================
-- SUBSCRIPTION EVENTS TABLE
-- Tracks subscription lifecycle events for user notifications and analytics
-- =============================================================================

CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL CHECK (event_type IN (
    'trial_will_end',
    'payment_failed',
    'cancellation_scheduled',
    'subscription_updated',
    'subscription_created',
    'subscription_deleted',
    'plan_changed',
    'trial_extended',
    'trial_converted'
  )),
  event_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- EMAIL NOTIFICATIONS TABLE
-- Tracks email notifications sent to users for billing events
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type VARCHAR(100) NOT NULL CHECK (email_type IN (
    'welcome',
    'cancellation',
    'cancellation_scheduled',
    'trial_ending',
    'payment_confirmation',
    'payment_failed',
    'subscription_updated',
    'plan_changed',
    'trial_extended'
  )),
  stripe_subscription_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  email_address VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  template_name VARCHAR(100),
  template_data JSONB DEFAULT '{}',
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  delivery_status VARCHAR(50) DEFAULT 'sent' CHECK (delivery_status IN (
    'sent',
    'delivered',
    'bounced',
    'failed',
    'complained'
  )),
  delivery_details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INVOICE EVENTS TABLE
-- Tracks invoice lifecycle events for payment processing
-- =============================================================================

CREATE TABLE IF NOT EXISTS invoice_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_invoice_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_subscription_id VARCHAR(255),
  event_type VARCHAR(100) NOT NULL CHECK (event_type IN (
    'created',
    'finalized',
    'payment_succeeded',
    'payment_failed',
    'payment_action_required',
    'voided',
    'marked_uncollectible'
  )),
  amount INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  status VARCHAR(50) NOT NULL,
  invoice_url TEXT,
  payment_intent_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Ensure amount is positive
  CHECK (amount >= 0)
);

-- =============================================================================
-- PAYMENT METHOD EVENTS TABLE
-- Tracks payment method lifecycle events
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_method_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_payment_method_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL CHECK (event_type IN (
    'attached',
    'detached',
    'updated',
    'card_automatically_updated'
  )),
  payment_method_type VARCHAR(50) NOT NULL,
  card_brand VARCHAR(50),
  card_last4 VARCHAR(4),
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- CHECKOUT SESSIONS TABLE
-- Tracks checkout session events for conversion analytics
-- =============================================================================

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id VARCHAR(255) NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_customer_id VARCHAR(255),
  status VARCHAR(50) NOT NULL CHECK (status IN (
    'open',
    'complete',
    'expired'
  )),
  mode VARCHAR(50) NOT NULL CHECK (mode IN (
    'payment',
    'subscription',
    'setup'
  )),
  amount_total INTEGER,
  currency VARCHAR(3),
  success_url TEXT,
  cancel_url TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Ensure completed_at is after created_at
  CHECK (completed_at IS NULL OR completed_at >= created_at),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- =============================================================================
-- ONE TIME PAYMENTS TABLE
-- Tracks one-time payments (non-subscription)
-- =============================================================================

CREATE TABLE IF NOT EXISTS one_time_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  status VARCHAR(50) NOT NULL CHECK (status IN (
    'completed',
    'failed',
    'refunded',
    'partially_refunded'
  )),
  description TEXT,
  receipt_url TEXT,
  refund_amount INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Ensure positive amounts
  CHECK (amount > 0),
  CHECK (refund_amount >= 0),
  CHECK (refund_amount <= amount)
);

-- =============================================================================
-- BILLING ALERTS TABLE
-- Tracks in-app billing notifications and alerts for users
-- =============================================================================

CREATE TABLE IF NOT EXISTS billing_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type VARCHAR(100) NOT NULL CHECK (alert_type IN (
    'payment_failed',
    'trial_ending',
    'subscription_canceled',
    'usage_limit_exceeded',
    'plan_changed',
    'payment_method_updated'
  )),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  action_required BOOLEAN NOT NULL DEFAULT false,
  action_url TEXT,
  action_text VARCHAR(100),
  dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- Ensure dismissed_at is set when dismissed
  CHECK (dismissed = false OR dismissed_at IS NOT NULL)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Webhook events indexes
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_event_id ON webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_success ON webhook_events(success);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at);

-- Subscription events indexes
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_stripe_subscription_id ON subscription_events(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON subscription_events(created_at);

-- Email notifications indexes
CREATE INDEX IF NOT EXISTS idx_email_notifications_user_id ON email_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_email_type ON email_notifications(email_type);
CREATE INDEX IF NOT EXISTS idx_email_notifications_sent_at ON email_notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_notifications_delivery_status ON email_notifications(delivery_status);
CREATE INDEX IF NOT EXISTS idx_email_notifications_stripe_subscription_id ON email_notifications(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Invoice events indexes
CREATE INDEX IF NOT EXISTS idx_invoice_events_stripe_invoice_id ON invoice_events(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_events_stripe_customer_id ON invoice_events(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_events_event_type ON invoice_events(event_type);
CREATE INDEX IF NOT EXISTS idx_invoice_events_status ON invoice_events(status);
CREATE INDEX IF NOT EXISTS idx_invoice_events_created_at ON invoice_events(created_at);

-- Payment method events indexes
CREATE INDEX IF NOT EXISTS idx_payment_method_events_stripe_payment_method_id ON payment_method_events(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_events_stripe_customer_id ON payment_method_events(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_events_event_type ON payment_method_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_method_events_created_at ON payment_method_events(created_at);

-- Checkout sessions indexes
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_stripe_session_id ON checkout_sessions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user_id ON checkout_sessions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON checkout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_mode ON checkout_sessions(mode);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_created_at ON checkout_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_expires_at ON checkout_sessions(expires_at) WHERE expires_at IS NOT NULL;

-- One time payments indexes
CREATE INDEX IF NOT EXISTS idx_one_time_payments_user_id ON one_time_payments(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_one_time_payments_stripe_customer_id ON one_time_payments(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_one_time_payments_status ON one_time_payments(status);
CREATE INDEX IF NOT EXISTS idx_one_time_payments_created_at ON one_time_payments(created_at);

-- Billing alerts indexes
CREATE INDEX IF NOT EXISTS idx_billing_alerts_user_id ON billing_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_alert_type ON billing_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_severity ON billing_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_dismissed ON billing_alerts(dismissed);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_created_at ON billing_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_action_required ON billing_alerts(action_required) WHERE action_required = true;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on webhook tables
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_method_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_time_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_alerts ENABLE ROW LEVEL SECURITY;

-- Webhook events policies (admin only)
CREATE POLICY "Only service role can access webhook events" ON webhook_events
  FOR ALL TO service_role USING (true);

-- Subscription events policies
CREATE POLICY "Users can view their own subscription events" ON subscription_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to subscription events" ON subscription_events
  FOR ALL TO service_role USING (true);

-- Email notifications policies
CREATE POLICY "Users can view their own email notifications" ON email_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to email notifications" ON email_notifications
  FOR ALL TO service_role USING (true);

-- Invoice events policies (admin only for now)
CREATE POLICY "Only service role can access invoice events" ON invoice_events
  FOR ALL TO service_role USING (true);

-- Payment method events policies (admin only for now)
CREATE POLICY "Only service role can access payment method events" ON payment_method_events
  FOR ALL TO service_role USING (true);

-- Checkout sessions policies
CREATE POLICY "Users can view their own checkout sessions" ON checkout_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to checkout sessions" ON checkout_sessions
  FOR ALL TO service_role USING (true);

-- One time payments policies
CREATE POLICY "Users can view their own one time payments" ON one_time_payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to one time payments" ON one_time_payments
  FOR ALL TO service_role USING (true);

-- Billing alerts policies
CREATE POLICY "Users can view their own billing alerts" ON billing_alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own billing alerts" ON billing_alerts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to billing alerts" ON billing_alerts
  FOR ALL TO service_role USING (true);

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Function to get webhook processing statistics
CREATE OR REPLACE FUNCTION get_webhook_stats(
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '24 hours',
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
  total_events BIGINT,
  successful_events BIGINT,
  failed_events BIGINT,
  success_rate NUMERIC,
  event_types JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE success = true) as successful,
      COUNT(*) FILTER (WHERE success = false) as failed,
      jsonb_object_agg(
        event_type, 
        jsonb_build_object(
          'total', COUNT(*),
          'successful', COUNT(*) FILTER (WHERE success = true),
          'failed', COUNT(*) FILTER (WHERE success = false)
        )
      ) as types
    FROM webhook_events
    WHERE created_at BETWEEN p_start_date AND p_end_date
  )
  SELECT 
    s.total,
    s.successful,
    s.failed,
    CASE 
      WHEN s.total > 0 THEN ROUND((s.successful::NUMERIC / s.total::NUMERIC) * 100, 2)
      ELSE 0
    END,
    COALESCE(s.types, '{}'::jsonb)
  FROM stats s;
END;
$;

-- Function to get user subscription timeline
CREATE OR REPLACE FUNCTION get_user_subscription_timeline(p_user_id UUID)
RETURNS TABLE (
  event_date TIMESTAMP WITH TIME ZONE,
  event_type VARCHAR,
  event_description TEXT,
  subscription_id VARCHAR,
  plan_id VARCHAR,
  status VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
  RETURN QUERY
  SELECT 
    se.created_at as event_date,
    se.event_type,
    CASE se.event_type
      WHEN 'subscription_created' THEN 'Subscription started'
      WHEN 'subscription_updated' THEN 'Subscription updated'
      WHEN 'subscription_deleted' THEN 'Subscription canceled'
      WHEN 'trial_will_end' THEN 'Trial ending soon'
      WHEN 'payment_failed' THEN 'Payment failed'
      WHEN 'cancellation_scheduled' THEN 'Cancellation scheduled'
      WHEN 'plan_changed' THEN 'Plan changed'
      WHEN 'trial_extended' THEN 'Trial extended'
      WHEN 'trial_converted' THEN 'Trial converted to paid'
      ELSE se.event_type
    END as event_description,
    se.stripe_subscription_id,
    COALESCE(se.event_data->>'plan_id', '') as plan_id,
    COALESCE(se.event_data->>'status', '') as status
  FROM subscription_events se
  WHERE se.user_id = p_user_id
  ORDER BY se.created_at DESC;
END;
$;

-- Function to get recent failed webhooks for monitoring
CREATE OR REPLACE FUNCTION get_recent_failed_webhooks(
  p_hours INTEGER DEFAULT 24,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  stripe_event_id VARCHAR,
  event_type VARCHAR,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
  RETURN QUERY
  SELECT 
    we.stripe_event_id,
    we.event_type,
    we.error_message,
    we.created_at,
    we.processed_at
  FROM webhook_events we
  WHERE we.success = false
    AND we.created_at > NOW() - (p_hours || ' hours')::INTERVAL
  ORDER BY we.created_at DESC
  LIMIT p_limit;
END;
$;

-- Function to clean up old webhook events
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webhook_events 
  WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$;

-- Function to clean up old subscription events
CREATE OR REPLACE FUNCTION cleanup_old_subscription_events(
  p_retention_days INTEGER DEFAULT 365
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM subscription_events 
  WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$;

-- Function to clean up old email notifications
CREATE OR REPLACE FUNCTION cleanup_old_email_notifications(
  p_retention_days INTEGER DEFAULT 180
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM email_notifications 
  WHERE sent_at < NOW() - (p_retention_days || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp trigger for invoice_events
CREATE TRIGGER update_invoice_events_updated_at
  BEFORE UPDATE ON invoice_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update timestamp trigger for checkout_sessions
CREATE TRIGGER update_checkout_sessions_updated_at
  BEFORE UPDATE ON checkout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT ON webhook_events TO service_role; -- Admin only
GRANT SELECT ON subscription_events TO authenticated;
GRANT SELECT ON email_notifications TO authenticated;
GRANT SELECT ON invoice_events TO service_role; -- Admin only
GRANT SELECT ON payment_method_events TO service_role; -- Admin only
GRANT SELECT ON checkout_sessions TO authenticated;
GRANT SELECT ON one_time_payments TO authenticated;
GRANT SELECT, UPDATE ON billing_alerts TO authenticated;

-- Grant full access to service role
GRANT ALL ON webhook_events TO service_role;
GRANT ALL ON subscription_events TO service_role;
GRANT ALL ON email_notifications TO service_role;
GRANT ALL ON invoice_events TO service_role;
GRANT ALL ON payment_method_events TO service_role;
GRANT ALL ON checkout_sessions TO service_role;
GRANT ALL ON one_time_payments TO service_role;
GRANT ALL ON billing_alerts TO service_role;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_webhook_stats(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO service_role;
GRANT EXECUTE ON FUNCTION get_user_subscription_timeline(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_recent_failed_webhooks(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_webhook_events(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_subscription_events(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_email_notifications(INTEGER) TO service_role;