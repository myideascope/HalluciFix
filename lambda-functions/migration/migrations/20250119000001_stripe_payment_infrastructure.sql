-- Stripe Payment Infrastructure Migration
-- Creates tables for subscription management, payment history, and usage tracking

-- =============================================================================
-- STRIPE CUSTOMERS TABLE
-- Maps users to their Stripe customer records
-- =============================================================================

CREATE TABLE IF NOT EXISTS stripe_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- USER SUBSCRIPTIONS TABLE
-- Stores user subscription information with Stripe integration
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_subscription_id VARCHAR(255) NOT NULL UNIQUE,
  plan_id VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN (
    'active',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'past_due',
    'trialing',
    'unpaid'
  )),
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  trial_start TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one active subscription per user
  UNIQUE(user_id, stripe_subscription_id),
  
  -- Validate date constraints
  CHECK (current_period_end > current_period_start),
  CHECK (trial_end IS NULL OR trial_end > trial_start),
  CHECK (canceled_at IS NULL OR canceled_at >= created_at),
  CHECK (ended_at IS NULL OR ended_at >= created_at)
);

-- =============================================================================
-- PAYMENT HISTORY TABLE
-- Records all payment transactions and invoices
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  amount INTEGER NOT NULL, -- Amount in cents
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  status VARCHAR(50) NOT NULL CHECK (status IN (
    'succeeded',
    'pending',
    'failed',
    'canceled',
    'refunded',
    'partially_refunded'
  )),
  payment_method_type VARCHAR(50),
  payment_method_last4 VARCHAR(4),
  payment_method_brand VARCHAR(50),
  failure_code VARCHAR(100),
  failure_message TEXT,
  invoice_url TEXT,
  receipt_url TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure amount is positive
  CHECK (amount > 0),
  CHECK (processed_at IS NULL OR processed_at >= created_at)
);

-- =============================================================================
-- USAGE RECORDS TABLE
-- Tracks API usage for metered billing
-- =============================================================================

CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255),
  usage_type VARCHAR(100) NOT NULL CHECK (usage_type IN (
    'api_calls',
    'analysis_requests',
    'document_processing',
    'batch_analysis',
    'scheduled_scans'
  )),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER, -- Price per unit in cents
  total_amount INTEGER, -- Total cost in cents
  billing_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  billing_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  reported_to_stripe BOOLEAN NOT NULL DEFAULT false,
  stripe_usage_record_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure positive quantities and amounts
  CHECK (quantity > 0),
  CHECK (unit_price IS NULL OR unit_price >= 0),
  CHECK (total_amount IS NULL OR total_amount >= 0),
  CHECK (billing_period_end > billing_period_start)
);

-- =============================================================================
-- SUBSCRIPTION PLANS TABLE
-- Defines available subscription plans and their features
-- =============================================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  stripe_price_id VARCHAR(255) NOT NULL UNIQUE,
  price INTEGER NOT NULL, -- Price in cents
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  interval VARCHAR(20) NOT NULL CHECK (interval IN ('month', 'year')),
  interval_count INTEGER NOT NULL DEFAULT 1,
  trial_period_days INTEGER DEFAULT 0,
  analysis_limit INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
  features JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure positive values
  CHECK (price >= 0),
  CHECK (interval_count > 0),
  CHECK (trial_period_days >= 0),
  CHECK (analysis_limit >= 0)
);

-- =============================================================================
-- CUSTOMER PORTAL SESSIONS TABLE
-- Tracks Stripe Customer Portal sessions for security
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL,
  stripe_session_id VARCHAR(255) NOT NULL UNIQUE,
  session_url TEXT NOT NULL,
  return_url TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CHECK (expires_at > created_at),
  CHECK (used_at IS NULL OR used_at >= created_at)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Stripe customers indexes
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_customer_id ON stripe_customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_email ON stripe_customers(email);

-- User subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer_id ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_current_period_end ON user_subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_trial_end ON user_subscriptions(trial_end) WHERE trial_end IS NOT NULL;

-- Payment history indexes
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_stripe_customer_id ON payment_history(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_status ON payment_history(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_created_at ON payment_history(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_history_stripe_invoice_id ON payment_history(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

-- Usage records indexes
CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_subscription_id ON usage_records(subscription_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_usage_type ON usage_records(usage_type);
CREATE INDEX IF NOT EXISTS idx_usage_records_billing_period ON usage_records(billing_period_start, billing_period_end);
CREATE INDEX IF NOT EXISTS idx_usage_records_reported_to_stripe ON usage_records(reported_to_stripe) WHERE reported_to_stripe = false;
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at);

-- Subscription plans indexes
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_price_id ON subscription_plans(stripe_price_id);

-- Customer portal sessions indexes
CREATE INDEX IF NOT EXISTS idx_customer_portal_sessions_user_id ON customer_portal_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_portal_sessions_expires_at ON customer_portal_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_customer_portal_sessions_used_at ON customer_portal_sessions(used_at) WHERE used_at IS NOT NULL;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all payment tables
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_portal_sessions ENABLE ROW LEVEL SECURITY;

-- Stripe customers policies
CREATE POLICY "Users can view their own Stripe customer record" ON stripe_customers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own Stripe customer record" ON stripe_customers
  FOR UPDATE USING (auth.uid() = user_id);

-- User subscriptions policies
CREATE POLICY "Users can view their own subscriptions" ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" ON user_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- Payment history policies
CREATE POLICY "Users can view their own payment history" ON payment_history
  FOR SELECT USING (auth.uid() = user_id);

-- Usage records policies
CREATE POLICY "Users can view their own usage records" ON usage_records
  FOR SELECT USING (auth.uid() = user_id);

-- Subscription plans policies (public read access)
CREATE POLICY "Anyone can view active subscription plans" ON subscription_plans
  FOR SELECT USING (active = true);

-- Customer portal sessions policies
CREATE POLICY "Users can view their own portal sessions" ON customer_portal_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role policies (bypass RLS for backend operations)
CREATE POLICY "Service role full access to stripe_customers" ON stripe_customers
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access to user_subscriptions" ON user_subscriptions
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access to payment_history" ON payment_history
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access to usage_records" ON usage_records
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access to subscription_plans" ON subscription_plans
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access to customer_portal_sessions" ON customer_portal_sessions
  FOR ALL TO service_role USING (true);

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Function to get user's current active subscription
CREATE OR REPLACE FUNCTION get_user_active_subscription(p_user_id UUID)
RETURNS user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  subscription user_subscriptions;
BEGIN
  SELECT * INTO subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing')
    AND current_period_end > NOW()
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN subscription;
END;
$$;

-- Function to calculate usage for current billing period
CREATE OR REPLACE FUNCTION get_current_usage(p_user_id UUID, p_usage_type VARCHAR)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  subscription user_subscriptions;
  usage_count INTEGER;
BEGIN
  -- Get current active subscription
  subscription := get_user_active_subscription(p_user_id);
  
  IF subscription IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Calculate usage for current billing period
  SELECT COALESCE(SUM(quantity), 0) INTO usage_count
  FROM usage_records
  WHERE user_id = p_user_id
    AND usage_type = p_usage_type
    AND billing_period_start >= subscription.current_period_start
    AND billing_period_end <= subscription.current_period_end;
  
  RETURN usage_count;
END;
$$;

-- Function to check if user has exceeded usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(p_user_id UUID, p_usage_type VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  subscription user_subscriptions;
  plan subscription_plans;
  current_usage INTEGER;
BEGIN
  -- Get current active subscription
  subscription := get_user_active_subscription(p_user_id);
  
  IF subscription IS NULL THEN
    RETURN true; -- No subscription = exceeded
  END IF;
  
  -- Get plan details
  SELECT * INTO plan
  FROM subscription_plans
  WHERE id = subscription.plan_id;
  
  IF plan IS NULL OR plan.analysis_limit = 0 THEN
    RETURN false; -- Unlimited or plan not found
  END IF;
  
  -- Get current usage
  current_usage := get_current_usage(p_user_id, p_usage_type);
  
  RETURN current_usage >= plan.analysis_limit;
END;
$$;

-- Function to record usage
CREATE OR REPLACE FUNCTION record_usage(
  p_user_id UUID,
  p_usage_type VARCHAR,
  p_quantity INTEGER DEFAULT 1,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  subscription user_subscriptions;
  usage_id UUID;
BEGIN
  -- Get current active subscription
  subscription := get_user_active_subscription(p_user_id);
  
  -- Record usage even if no subscription (for tracking purposes)
  INSERT INTO usage_records (
    user_id,
    subscription_id,
    stripe_subscription_id,
    usage_type,
    quantity,
    billing_period_start,
    billing_period_end,
    metadata
  ) VALUES (
    p_user_id,
    subscription.id,
    subscription.stripe_subscription_id,
    p_usage_type,
    p_quantity,
    COALESCE(subscription.current_period_start, DATE_TRUNC('month', NOW())),
    COALESCE(subscription.current_period_end, DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
    p_metadata
  ) RETURNING id INTO usage_id;
  
  RETURN usage_id;
END;
$$;

-- =============================================================================
-- CLEANUP FUNCTIONS
-- =============================================================================

-- Function to clean up expired portal sessions
CREATE OR REPLACE FUNCTION cleanup_expired_portal_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM customer_portal_sessions 
  WHERE expires_at < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Function to archive old usage records
CREATE OR REPLACE FUNCTION archive_old_usage_records()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  -- Archive usage records older than 2 years
  DELETE FROM usage_records 
  WHERE created_at < NOW() - INTERVAL '2 years'
    AND reported_to_stripe = true;
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  
  RETURN archived_count;
END;
$$;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Update timestamp trigger for user_subscriptions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stripe_customers_updated_at
  BEFORE UPDATE ON stripe_customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

-- Insert default subscription plans
INSERT INTO subscription_plans (
  id,
  name,
  description,
  stripe_price_id,
  price,
  currency,
  interval,
  trial_period_days,
  analysis_limit,
  features
) VALUES 
(
  'basic_monthly',
  'Basic',
  'Essential AI accuracy verification',
  'price_basic_monthly_placeholder',
  2900, -- $29.00
  'usd',
  'month',
  14,
  1000,
  '["1,000 analyses per month", "Basic hallucination detection", "Email support", "Standard accuracy reports"]'::jsonb
),
(
  'pro_monthly',
  'Pro',
  'Advanced verification with team features',
  'price_pro_monthly_placeholder',
  9900, -- $99.00
  'usd',
  'month',
  14,
  10000,
  '["10,000 analyses per month", "Advanced seq-logprob analysis", "Team collaboration", "Priority support", "Custom integrations", "Advanced analytics"]'::jsonb
),
(
  'enterprise_monthly',
  'Enterprise',
  'Custom solutions for large organizations',
  'price_enterprise_monthly_placeholder',
  0, -- Custom pricing
  'usd',
  'month',
  0,
  0, -- Unlimited
  '["Unlimited analyses", "Custom model training", "Dedicated support", "SLA guarantees", "On-premise deployment", "Custom integrations"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT ON stripe_customers TO authenticated;
GRANT SELECT ON user_subscriptions TO authenticated;
GRANT SELECT ON payment_history TO authenticated;
GRANT SELECT ON usage_records TO authenticated;
GRANT SELECT ON subscription_plans TO authenticated;
GRANT SELECT ON customer_portal_sessions TO authenticated;

-- Grant full access to service role
GRANT ALL ON stripe_customers TO service_role;
GRANT ALL ON user_subscriptions TO service_role;
GRANT ALL ON payment_history TO service_role;
GRANT ALL ON usage_records TO service_role;
GRANT ALL ON subscription_plans TO service_role;
GRANT ALL ON customer_portal_sessions TO service_role;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_user_active_subscription(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_current_usage(UUID, VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION check_usage_limit(UUID, VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION record_usage(UUID, VARCHAR, INTEGER, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_portal_sessions() TO service_role;
GRANT EXECUTE ON FUNCTION archive_old_usage_records() TO service_role;