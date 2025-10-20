-- Billing Monitoring Infrastructure
-- Tables for billing alerts, monitoring, and analytics

-- Billing alerts table
CREATE TABLE IF NOT EXISTS billing_alerts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('payment_failure', 'subscription_expiry', 'usage_overage', 'billing_error', 'fraud_detection')),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id TEXT,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook events table for monitoring webhook processing
CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    stripe_event_id TEXT UNIQUE,
    data JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing metrics snapshots table
CREATE TABLE IF NOT EXISTS billing_metrics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    monthly_recurring_revenue DECIMAL(10,2) DEFAULT 0,
    active_subscriptions INTEGER DEFAULT 0,
    churn_rate DECIMAL(5,4) DEFAULT 0,
    average_revenue_per_user DECIMAL(10,2) DEFAULT 0,
    payment_failure_rate DECIMAL(5,4) DEFAULT 0,
    usage_overage_rate DECIMAL(5,4) DEFAULT 0,
    trial_conversion_rate DECIMAL(5,4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System health status table
CREATE TABLE IF NOT EXISTS billing_health_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    overall_status TEXT NOT NULL CHECK (overall_status IN ('healthy', 'warning', 'critical')),
    stripe_connectivity TEXT NOT NULL CHECK (stripe_connectivity IN ('connected', 'degraded', 'disconnected')),
    webhook_processing TEXT NOT NULL CHECK (webhook_processing IN ('normal', 'delayed', 'failing')),
    payment_processing TEXT NOT NULL CHECK (payment_processing IN ('normal', 'degraded', 'failing')),
    subscription_sync TEXT NOT NULL CHECK (subscription_sync IN ('synced', 'delayed', 'out_of_sync')),
    issues JSONB DEFAULT '[]',
    check_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add alert_sent column to payment_history for tracking notifications
ALTER TABLE payment_history 
ADD COLUMN IF NOT EXISTS alert_sent TIMESTAMPTZ;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_billing_alerts_type_severity ON billing_alerts(type, severity);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_user_id ON billing_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_timestamp ON billing_alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_resolved ON billing_alerts(resolved, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);

CREATE INDEX IF NOT EXISTS idx_billing_metrics_date ON billing_metrics_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_health_timestamp ON billing_health_status(check_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_payment_history_alert_sent ON payment_history(alert_sent) WHERE alert_sent IS NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_billing_alerts_updated_at 
    BEFORE UPDATE ON billing_alerts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_events_updated_at 
    BEFORE UPDATE ON webhook_events 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean up old billing data
CREATE OR REPLACE FUNCTION cleanup_old_billing_data()
RETURNS void AS $$
BEGIN
    -- Clean up resolved alerts older than 30 days
    DELETE FROM billing_alerts 
    WHERE resolved = true 
    AND resolved_at < NOW() - INTERVAL '30 days';
    
    -- Clean up processed webhook events older than 7 days
    DELETE FROM webhook_events 
    WHERE processed = true 
    AND processed_at < NOW() - INTERVAL '7 days';
    
    -- Clean up old health status records (keep last 30 days)
    DELETE FROM billing_health_status 
    WHERE check_timestamp < NOW() - INTERVAL '30 days';
    
    -- Clean up old metrics snapshots (keep last 365 days)
    DELETE FROM billing_metrics_snapshots 
    WHERE snapshot_date < CURRENT_DATE - INTERVAL '365 days';
END;
$$ LANGUAGE plpgsql;

-- Create function to generate daily billing metrics snapshot
CREATE OR REPLACE FUNCTION generate_billing_metrics_snapshot()
RETURNS void AS $$
DECLARE
    snapshot_date DATE := CURRENT_DATE;
    total_rev DECIMAL(10,2);
    mrr DECIMAL(10,2);
    active_subs INTEGER;
    churn DECIMAL(5,4);
    arpu DECIMAL(10,2);
    failure_rate DECIMAL(5,4);
    overage_rate DECIMAL(5,4);
    conversion_rate DECIMAL(5,4);
BEGIN
    -- Check if snapshot already exists for today
    IF EXISTS (SELECT 1 FROM billing_metrics_snapshots WHERE snapshot_date = CURRENT_DATE) THEN
        RETURN;
    END IF;
    
    -- Calculate total revenue (last 30 days)
    SELECT COALESCE(SUM(amount), 0) / 100.0 INTO total_rev
    FROM payment_history 
    WHERE status = 'succeeded' 
    AND created_at >= CURRENT_DATE - INTERVAL '30 days';
    
    -- Calculate MRR (active subscriptions)
    SELECT COALESCE(SUM(sp.price), 0) INTO mrr
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.status = 'active';
    
    -- Count active subscriptions
    SELECT COUNT(*) INTO active_subs
    FROM user_subscriptions 
    WHERE status = 'active';
    
    -- Calculate ARPU
    IF active_subs > 0 THEN
        arpu := mrr / active_subs;
    ELSE
        arpu := 0;
    END IF;
    
    -- Calculate churn rate (simplified)
    WITH canceled_subs AS (
        SELECT COUNT(*) as canceled_count
        FROM user_subscriptions 
        WHERE status = 'canceled' 
        AND canceled_at >= CURRENT_DATE - INTERVAL '30 days'
    )
    SELECT CASE 
        WHEN (active_subs + canceled_count) > 0 
        THEN canceled_count::DECIMAL / (active_subs + canceled_count)
        ELSE 0 
    END INTO churn
    FROM canceled_subs;
    
    -- Calculate payment failure rate (last 30 days)
    WITH payment_stats AS (
        SELECT 
            COUNT(*) as total_payments,
            COUNT(*) FILTER (WHERE status = 'failed') as failed_payments
        FROM payment_history 
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    )
    SELECT CASE 
        WHEN total_payments > 0 
        THEN failed_payments::DECIMAL / total_payments 
        ELSE 0 
    END INTO failure_rate
    FROM payment_stats;
    
    -- Set default values for metrics we can't easily calculate
    overage_rate := 0.0;
    conversion_rate := 0.0;
    
    -- Insert snapshot
    INSERT INTO billing_metrics_snapshots (
        snapshot_date,
        total_revenue,
        monthly_recurring_revenue,
        active_subscriptions,
        churn_rate,
        average_revenue_per_user,
        payment_failure_rate,
        usage_overage_rate,
        trial_conversion_rate
    ) VALUES (
        snapshot_date,
        total_rev,
        mrr,
        active_subs,
        churn,
        arpu,
        failure_rate,
        overage_rate,
        conversion_rate
    );
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE billing_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_health_status ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for billing_alerts
CREATE POLICY "Users can view their own billing alerts" ON billing_alerts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all billing alerts" ON billing_alerts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role_id = 'admin'
        )
    );

CREATE POLICY "Admins can manage billing alerts" ON billing_alerts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role_id = 'admin'
        )
    );

-- Create RLS policies for webhook_events (admin only)
CREATE POLICY "Admins can manage webhook events" ON webhook_events
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role_id = 'admin'
        )
    );

-- Create RLS policies for billing metrics (admin only)
CREATE POLICY "Admins can view billing metrics" ON billing_metrics_snapshots
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role_id = 'admin'
        )
    );

-- Create RLS policies for health status (admin only)
CREATE POLICY "Admins can view health status" ON billing_health_status
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role_id = 'admin'
        )
    );

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON billing_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_events TO authenticated;
GRANT SELECT ON billing_metrics_snapshots TO authenticated;
GRANT SELECT ON billing_health_status TO authenticated;

-- Create a scheduled job to run cleanup and metrics generation (if pg_cron is available)
-- This would typically be set up separately in production
-- SELECT cron.schedule('billing-cleanup', '0 2 * * *', 'SELECT cleanup_old_billing_data();');
-- SELECT cron.schedule('billing-metrics', '0 1 * * *', 'SELECT generate_billing_metrics_snapshot();');

COMMENT ON TABLE billing_alerts IS 'Stores billing system alerts and notifications';
COMMENT ON TABLE webhook_events IS 'Tracks Stripe webhook events for monitoring';
COMMENT ON TABLE billing_metrics_snapshots IS 'Daily snapshots of billing metrics for analytics';
COMMENT ON TABLE billing_health_status IS 'System health status checks for billing infrastructure';