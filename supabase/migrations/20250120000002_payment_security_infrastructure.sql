-- Payment Security Infrastructure
-- Creates tables and functions for fraud detection, security monitoring, and billing data protection

-- Security events tracking table
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    device_fingerprint TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fraud analysis logs
CREATE TABLE IF NOT EXISTS fraud_analysis_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    payment_intent_id TEXT,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    risk_score INTEGER NOT NULL DEFAULT 0,
    reasons TEXT[] DEFAULT '{}',
    blocked BOOLEAN DEFAULT FALSE,
    requires_review BOOLEAN DEFAULT FALSE,
    radar_rule_matches TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suspicious activity alerts
CREATE TABLE IF NOT EXISTS suspicious_activity_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('velocity_exceeded', 'fraud_detected', 'unusual_pattern', 'high_risk_payment')),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Security notifications log
CREATE TABLE IF NOT EXISTS security_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_method TEXT DEFAULT 'email',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User devices tracking for fingerprinting
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint TEXT NOT NULL,
    device_info JSONB DEFAULT '{}',
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    trusted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, device_fingerprint)
);

-- Trial abuse prevention tracking
CREATE TABLE IF NOT EXISTS trial_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email_hash TEXT NOT NULL,
    ip_address INET,
    device_fingerprint TEXT,
    trial_started_at TIMESTAMPTZ DEFAULT NOW(),
    trial_ended_at TIMESTAMPTZ,
    trial_converted BOOLEAN DEFAULT FALSE,
    abuse_flags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing audit log for all billing operations
CREATE TABLE IF NOT EXISTS billing_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    performed_by UUID REFERENCES users(id),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Encrypted billing data storage
CREATE TABLE IF NOT EXISTS encrypted_billing_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    data_type TEXT NOT NULL,
    encrypted_data JSONB NOT NULL,
    data_hash TEXT NOT NULL,
    encryption_version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- System events for configuration and monitoring
CREATE TABLE IF NOT EXISTS system_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trial eligibility logs for audit purposes
CREATE TABLE IF NOT EXISTS trial_eligibility_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email_hash TEXT NOT NULL,
    eligible BOOLEAN NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    abuse_flags TEXT[] DEFAULT '{}',
    reasons TEXT[] DEFAULT '{}',
    recommended_action TEXT NOT NULL CHECK (recommended_action IN ('allow', 'require_verification', 'deny')),
    cooldown_period INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Abuse reports for manual review
CREATE TABLE IF NOT EXISTS abuse_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    evidence JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'dismissed')),
    resolution TEXT,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address);

CREATE INDEX IF NOT EXISTS idx_fraud_analysis_user_id ON fraud_analysis_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_analysis_risk_level ON fraud_analysis_logs(risk_level);
CREATE INDEX IF NOT EXISTS idx_fraud_analysis_created_at ON fraud_analysis_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_fraud_analysis_blocked ON fraud_analysis_logs(blocked);

CREATE INDEX IF NOT EXISTS idx_suspicious_alerts_user_id ON suspicious_activity_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_alerts_type ON suspicious_activity_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_suspicious_alerts_severity ON suspicious_activity_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_suspicious_alerts_resolved ON suspicious_activity_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_suspicious_alerts_created_at ON suspicious_activity_alerts(created_at);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_fingerprint ON user_devices(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_user_devices_last_seen ON user_devices(last_seen);

CREATE INDEX IF NOT EXISTS idx_trial_tracking_email_hash ON trial_tracking(email_hash);
CREATE INDEX IF NOT EXISTS idx_trial_tracking_ip ON trial_tracking(ip_address);
CREATE INDEX IF NOT EXISTS idx_trial_tracking_fingerprint ON trial_tracking(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_trial_tracking_created_at ON trial_tracking(created_at);

CREATE INDEX IF NOT EXISTS idx_billing_audit_user_id ON billing_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_action_type ON billing_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_billing_audit_created_at ON billing_audit_log(created_at);

CREATE INDEX IF NOT EXISTS idx_encrypted_billing_user_id ON encrypted_billing_data(user_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_billing_type ON encrypted_billing_data(data_type);
CREATE INDEX IF NOT EXISTS idx_encrypted_billing_hash ON encrypted_billing_data(data_hash);

CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at);

CREATE INDEX IF NOT EXISTS idx_trial_eligibility_user_id ON trial_eligibility_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_trial_eligibility_email_hash ON trial_eligibility_logs(email_hash);
CREATE INDEX IF NOT EXISTS idx_trial_eligibility_eligible ON trial_eligibility_logs(eligible);
CREATE INDEX IF NOT EXISTS idx_trial_eligibility_risk_level ON trial_eligibility_logs(risk_level);
CREATE INDEX IF NOT EXISTS idx_trial_eligibility_created_at ON trial_eligibility_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_abuse_reports_user_id ON abuse_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_type ON abuse_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_status ON abuse_reports(status);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_created_at ON abuse_reports(created_at);

-- Create functions for security monitoring

-- Function to check payment velocity
CREATE OR REPLACE FUNCTION check_payment_velocity(
    p_user_id UUID,
    p_event_type TEXT,
    p_time_window INTERVAL,
    p_limit INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    event_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO event_count
    FROM security_events
    WHERE user_id = p_user_id
      AND event_type = p_event_type
      AND created_at > NOW() - p_time_window;
    
    RETURN event_count < p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to log billing audit event
CREATE OR REPLACE FUNCTION log_billing_audit(
    p_user_id UUID,
    p_action_type TEXT,
    p_resource_type TEXT,
    p_resource_id TEXT DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_performed_by UUID DEFAULT NULL,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO billing_audit_log (
        user_id, action_type, resource_type, resource_id,
        old_values, new_values, ip_address, user_agent,
        performed_by, success, error_message, metadata
    ) VALUES (
        p_user_id, p_action_type, p_resource_type, p_resource_id,
        p_old_values, p_new_values, p_ip_address, p_user_agent,
        p_performed_by, p_success, p_error_message, p_metadata
    ) RETURNING id INTO audit_id;
    
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to detect trial abuse patterns
CREATE OR REPLACE FUNCTION detect_trial_abuse(
    p_email_hash TEXT,
    p_ip_address INET DEFAULT NULL,
    p_device_fingerprint TEXT DEFAULT NULL
) RETURNS TEXT[] AS $$
DECLARE
    abuse_flags TEXT[] := '{}';
    email_count INTEGER;
    ip_count INTEGER;
    device_count INTEGER;
BEGIN
    -- Check for multiple trials from same email hash
    SELECT COUNT(*)
    INTO email_count
    FROM trial_tracking
    WHERE email_hash = p_email_hash
      AND created_at > NOW() - INTERVAL '30 days';
    
    IF email_count > 1 THEN
        abuse_flags := array_append(abuse_flags, 'multiple_email_trials');
    END IF;
    
    -- Check for multiple trials from same IP
    IF p_ip_address IS NOT NULL THEN
        SELECT COUNT(DISTINCT user_id)
        INTO ip_count
        FROM trial_tracking
        WHERE ip_address = p_ip_address
          AND created_at > NOW() - INTERVAL '7 days';
        
        IF ip_count > 3 THEN
            abuse_flags := array_append(abuse_flags, 'multiple_ip_trials');
        END IF;
    END IF;
    
    -- Check for multiple trials from same device
    IF p_device_fingerprint IS NOT NULL THEN
        SELECT COUNT(DISTINCT user_id)
        INTO device_count
        FROM trial_tracking
        WHERE device_fingerprint = p_device_fingerprint
          AND created_at > NOW() - INTERVAL '7 days';
        
        IF device_count > 2 THEN
            abuse_flags := array_append(abuse_flags, 'multiple_device_trials');
        END IF;
    END IF;
    
    RETURN abuse_flags;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate risk score based on user behavior
CREATE OR REPLACE FUNCTION calculate_user_risk_score(p_user_id UUID) RETURNS INTEGER AS $$
DECLARE
    risk_score INTEGER := 0;
    account_age_days INTEGER;
    failed_payments INTEGER;
    suspicious_alerts INTEGER;
    device_count INTEGER;
BEGIN
    -- Account age factor
    SELECT EXTRACT(DAY FROM NOW() - created_at)
    INTO account_age_days
    FROM users
    WHERE id = p_user_id;
    
    IF account_age_days < 7 THEN
        risk_score := risk_score + 20;
    ELSIF account_age_days < 30 THEN
        risk_score := risk_score + 10;
    END IF;
    
    -- Failed payments in last 30 days
    SELECT COUNT(*)
    INTO failed_payments
    FROM payment_history
    WHERE user_id = p_user_id
      AND status = 'failed'
      AND created_at > NOW() - INTERVAL '30 days';
    
    risk_score := risk_score + (failed_payments * 5);
    
    -- Suspicious activity alerts
    SELECT COUNT(*)
    INTO suspicious_alerts
    FROM suspicious_activity_alerts
    WHERE user_id = p_user_id
      AND resolved = FALSE
      AND severity IN ('high', 'critical');
    
    risk_score := risk_score + (suspicious_alerts * 25);
    
    -- Multiple devices (potential account sharing)
    SELECT COUNT(DISTINCT device_fingerprint)
    INTO device_count
    FROM user_devices
    WHERE user_id = p_user_id
      AND last_seen > NOW() - INTERVAL '7 days';
    
    IF device_count > 5 THEN
        risk_score := risk_score + 15;
    END IF;
    
    RETURN LEAST(risk_score, 100); -- Cap at 100
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_analysis_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspicious_activity_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_billing_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_eligibility_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE abuse_reports ENABLE ROW LEVEL SECURITY;

-- Create RLS policies

-- Security events - users can only see their own events
CREATE POLICY "Users can view own security events" ON security_events
    FOR SELECT USING (auth.uid() = user_id);

-- Fraud analysis logs - users can only see their own logs
CREATE POLICY "Users can view own fraud analysis" ON fraud_analysis_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Suspicious activity alerts - users can only see their own alerts
CREATE POLICY "Users can view own security alerts" ON suspicious_activity_alerts
    FOR SELECT USING (auth.uid() = user_id);

-- Security notifications - users can only see their own notifications
CREATE POLICY "Users can view own security notifications" ON security_notifications
    FOR SELECT USING (auth.uid() = user_id);

-- User devices - users can only see their own devices
CREATE POLICY "Users can view own devices" ON user_devices
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices" ON user_devices
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices" ON user_devices
    FOR UPDATE USING (auth.uid() = user_id);

-- Trial tracking - users can only see their own trial data
CREATE POLICY "Users can view own trial tracking" ON trial_tracking
    FOR SELECT USING (auth.uid() = user_id);

-- Billing audit log - users can only see their own audit logs
CREATE POLICY "Users can view own billing audit" ON billing_audit_log
    FOR SELECT USING (auth.uid() = user_id);

-- Encrypted billing data - users can only access their own encrypted data
CREATE POLICY "Users can view own encrypted billing data" ON encrypted_billing_data
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own encrypted billing data" ON encrypted_billing_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own encrypted billing data" ON encrypted_billing_data
    FOR UPDATE USING (auth.uid() = user_id);

-- System events - no user access (admin only)
-- No RLS policies for system_events - only accessible via service role

-- Trial eligibility logs - users can only see their own logs
CREATE POLICY "Users can view own trial eligibility logs" ON trial_eligibility_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Abuse reports - users can only see reports about them
CREATE POLICY "Users can view abuse reports about them" ON abuse_reports
    FOR SELECT USING (auth.uid() = user_id);

-- Create triggers for automatic timestamping
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_encrypted_billing_data_updated_at
    BEFORE UPDATE ON encrypted_billing_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to automatically update device last_seen
CREATE OR REPLACE FUNCTION update_device_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_devices
    SET last_seen = NOW()
    WHERE user_id = NEW.user_id
      AND device_fingerprint = NEW.device_fingerprint;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_device_activity
    AFTER INSERT ON security_events
    FOR EACH ROW
    WHEN (NEW.device_fingerprint IS NOT NULL)
    EXECUTE FUNCTION update_device_last_seen();

-- Insert initial system event
INSERT INTO system_events (event_type, description, metadata)
VALUES (
    'security_infrastructure_created',
    'Payment security infrastructure tables and functions created',
    jsonb_build_object(
        'version', '1.0',
        'created_at', NOW(),
        'tables_created', ARRAY[
            'security_events',
            'fraud_analysis_logs',
            'suspicious_activity_alerts',
            'security_notifications',
            'user_devices',
            'trial_tracking',
            'billing_audit_log',
            'encrypted_billing_data',
            'system_events'
        ]
    )
);

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT ON security_events TO authenticated;
GRANT SELECT ON fraud_analysis_logs TO authenticated;
GRANT SELECT ON suspicious_activity_alerts TO authenticated;
GRANT SELECT ON security_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON user_devices TO authenticated;
GRANT SELECT ON trial_tracking TO authenticated;
GRANT SELECT ON billing_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON encrypted_billing_data TO authenticated;
GRANT SELECT ON trial_eligibility_logs TO authenticated;
GRANT SELECT ON abuse_reports TO authenticated;

-- Grant service role full access for webhook processing
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;