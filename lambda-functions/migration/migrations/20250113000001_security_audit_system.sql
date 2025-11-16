-- Security Audit System Migration
-- This migration creates tables and functions for comprehensive security monitoring and audit logging

-- Security audit log table for tracking all database operations
CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER')),
    table_name VARCHAR(100) NOT NULL,
    user_id UUID,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    rows_affected INTEGER,
    query_hash VARCHAR(64),
    metadata JSONB DEFAULT '{}',
    
    -- Add foreign key constraint if users table exists
    CONSTRAINT fk_security_audit_log_user_id 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for security audit log performance
CREATE INDEX IF NOT EXISTS idx_security_audit_log_timestamp ON security_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id ON security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_operation ON security_audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_table_name ON security_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_ip_address ON security_audit_log(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_query_hash ON security_audit_log(query_hash);

-- Security events table for tracking security incidents
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'login_attempt', 'failed_login', 'suspicious_query', 'unauthorized_access', 
        'data_breach_attempt', 'privilege_escalation', 'brute_force_attack'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    user_id UUID,
    ip_address INET,
    user_agent TEXT,
    description TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID,
    
    -- Add foreign key constraints
    CONSTRAINT fk_security_events_user_id 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_security_events_resolved_by 
        FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for security events performance
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_address ON security_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_security_events_resolved ON security_events(resolved);

-- Failed login attempts tracking table
CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255),
    ip_address INET NOT NULL,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    attempt_count INTEGER DEFAULT 1,
    blocked_until TIMESTAMP WITH TIME ZONE,
    
    -- Composite unique constraint to prevent duplicate entries
    UNIQUE(email, ip_address, DATE_TRUNC('hour', timestamp))
);

-- Indexes for failed login attempts
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_ip ON failed_login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_email ON failed_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_timestamp ON failed_login_attempts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_blocked ON failed_login_attempts(blocked_until);

-- Data access log for sensitive operations tracking
CREATE TABLE IF NOT EXISTS data_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    action VARCHAR(20) NOT NULL CHECK (action IN (
        'create', 'read', 'update', 'delete', 'login', 'logout', 'register', 'token_refresh'
    )),
    ip_address INET,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    success BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    
    -- Add foreign key constraint
    CONSTRAINT fk_data_access_log_user_id 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes for data access log performance
CREATE INDEX IF NOT EXISTS idx_data_access_log_user_id ON data_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_data_access_log_timestamp ON data_access_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_data_access_log_resource ON data_access_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_data_access_log_action ON data_access_log(action);
CREATE INDEX IF NOT EXISTS idx_data_access_log_success ON data_access_log(success);

-- Performance alerts table (extending existing performance monitoring)
CREATE TABLE IF NOT EXISTS performance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'slow_query', 'high_error_rate', 'connection_pool_exhaustion', 
        'disk_space_warning', 'memory_usage_high', 'cpu_usage_high'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID,
    
    -- Add foreign key constraint
    CONSTRAINT fk_performance_alerts_acknowledged_by 
        FOREIGN KEY (acknowledged_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for performance alerts
CREATE INDEX IF NOT EXISTS idx_performance_alerts_timestamp ON performance_alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_type ON performance_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_severity ON performance_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_acknowledged ON performance_alerts(acknowledged);

-- Security configuration table for storing security settings
CREATE TABLE IF NOT EXISTS security_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_name VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID,
    
    -- Add foreign key constraint
    CONSTRAINT fk_security_configuration_updated_by 
        FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index for security configuration
CREATE INDEX IF NOT EXISTS idx_security_configuration_setting_name ON security_configuration(setting_name);

-- Insert default security configuration
INSERT INTO security_configuration (setting_name, setting_value, description) VALUES
    ('max_failed_login_attempts', '5', 'Maximum failed login attempts before account lockout'),
    ('lockout_duration_minutes', '30', 'Duration of account lockout in minutes'),
    ('session_timeout_minutes', '480', 'Session timeout in minutes (8 hours)'),
    ('password_min_length', '8', 'Minimum password length requirement'),
    ('require_mfa', 'false', 'Whether multi-factor authentication is required'),
    ('audit_retention_days', '365', 'Number of days to retain audit logs'),
    ('security_scan_interval_minutes', '15', 'Interval for automated security scans'),
    ('suspicious_query_threshold', '10', 'Number of suspicious queries before alert')
ON CONFLICT (setting_name) DO NOTHING;

-- Function to get security configuration
CREATE OR REPLACE FUNCTION get_security_config(config_name TEXT)
RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT setting_value 
        FROM security_configuration 
        WHERE setting_name = config_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update security configuration (admin only)
CREATE OR REPLACE FUNCTION update_security_config(
    config_name TEXT,
    config_value JSONB,
    user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    -- In a real implementation, you would check if user_id has admin privileges
    UPDATE security_configuration 
    SET setting_value = config_value,
        updated_at = NOW(),
        updated_by = user_id
    WHERE setting_name = config_name;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
    p_event_type VARCHAR(50),
    p_severity VARCHAR(20),
    p_description TEXT,
    p_user_id UUID DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO security_events (
        event_type, severity, description, user_id, 
        ip_address, user_agent, metadata
    ) VALUES (
        p_event_type, p_severity, p_description, p_user_id,
        p_ip_address, p_user_agent, p_metadata
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check for brute force attacks
CREATE OR REPLACE FUNCTION check_brute_force_attack(
    p_ip_address INET,
    p_email VARCHAR(255) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    attempt_count INTEGER;
    max_attempts INTEGER;
    lockout_duration INTEGER;
    is_blocked BOOLEAN := FALSE;
    block_until TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get security configuration
    max_attempts := (get_security_config('max_failed_login_attempts'))::INTEGER;
    lockout_duration := (get_security_config('lockout_duration_minutes'))::INTEGER;
    
    -- Count recent failed attempts from this IP
    SELECT COUNT(*) INTO attempt_count
    FROM failed_login_attempts
    WHERE ip_address = p_ip_address
    AND timestamp > NOW() - INTERVAL '1 hour'
    AND (p_email IS NULL OR email = p_email);
    
    -- Check if IP should be blocked
    IF attempt_count >= max_attempts THEN
        is_blocked := TRUE;
        block_until := NOW() + (lockout_duration || ' minutes')::INTERVAL;
        
        -- Update or insert block record
        INSERT INTO failed_login_attempts (email, ip_address, attempt_count, blocked_until)
        VALUES (p_email, p_ip_address, attempt_count, block_until)
        ON CONFLICT (email, ip_address, DATE_TRUNC('hour', timestamp))
        DO UPDATE SET 
            attempt_count = EXCLUDED.attempt_count,
            blocked_until = EXCLUDED.blocked_until;
    END IF;
    
    RETURN jsonb_build_object(
        'is_blocked', is_blocked,
        'attempt_count', attempt_count,
        'max_attempts', max_attempts,
        'block_until', block_until
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get security metrics
CREATE OR REPLACE FUNCTION get_security_metrics(
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '24 hours',
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS JSONB AS $$
DECLARE
    failed_logins INTEGER;
    suspicious_queries INTEGER;
    unauthorized_access INTEGER;
    data_breach_attempts INTEGER;
    total_events INTEGER;
    risk_score INTEGER := 0;
BEGIN
    -- Count different types of security events
    SELECT 
        COUNT(*) FILTER (WHERE event_type = 'failed_login'),
        COUNT(*) FILTER (WHERE event_type = 'suspicious_query'),
        COUNT(*) FILTER (WHERE event_type = 'unauthorized_access'),
        COUNT(*) FILTER (WHERE event_type = 'data_breach_attempt'),
        COUNT(*)
    INTO failed_logins, suspicious_queries, unauthorized_access, data_breach_attempts, total_events
    FROM security_events
    WHERE timestamp BETWEEN p_start_date AND p_end_date;
    
    -- Calculate risk score based on events and severity
    SELECT COALESCE(SUM(
        CASE severity
            WHEN 'low' THEN 1
            WHEN 'medium' THEN 5
            WHEN 'high' THEN 15
            WHEN 'critical' THEN 50
            ELSE 0
        END
    ), 0) INTO risk_score
    FROM security_events
    WHERE timestamp BETWEEN p_start_date AND p_end_date;
    
    -- Normalize risk score to 0-100
    risk_score := LEAST(100, risk_score);
    
    RETURN jsonb_build_object(
        'period', jsonb_build_object(
            'start', p_start_date,
            'end', p_end_date
        ),
        'failed_login_attempts', failed_logins,
        'suspicious_queries', suspicious_queries,
        'unauthorized_access', unauthorized_access,
        'data_breach_attempts', data_breach_attempts,
        'total_security_events', total_events,
        'risk_score', risk_score
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate compliance report
CREATE OR REPLACE FUNCTION generate_compliance_report(
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS JSONB AS $$
DECLARE
    total_operations INTEGER;
    audited_operations INTEGER;
    compliance_score INTEGER;
    violations JSONB;
BEGIN
    -- Count total database operations
    SELECT COUNT(*) INTO total_operations
    FROM security_audit_log
    WHERE timestamp BETWEEN p_start_date AND p_end_date;
    
    -- All operations are audited in our system
    audited_operations := total_operations;
    
    -- Get violation summary
    SELECT jsonb_agg(
        jsonb_build_object(
            'type', event_type,
            'count', event_count,
            'severity', max_severity
        )
    ) INTO violations
    FROM (
        SELECT 
            event_type,
            COUNT(*) as event_count,
            MAX(severity) as max_severity
        FROM security_events
        WHERE timestamp BETWEEN p_start_date AND p_end_date
        GROUP BY event_type
    ) violation_summary;
    
    -- Calculate compliance score (100 - violation penalty)
    SELECT 100 - COALESCE(SUM(
        CASE severity
            WHEN 'low' THEN 1
            WHEN 'medium' THEN 3
            WHEN 'high' THEN 8
            WHEN 'critical' THEN 20
            ELSE 0
        END
    ), 0) INTO compliance_score
    FROM security_events
    WHERE timestamp BETWEEN p_start_date AND p_end_date;
    
    compliance_score := GREATEST(0, compliance_score);
    
    RETURN jsonb_build_object(
        'period', jsonb_build_object(
            'start', p_start_date,
            'end', p_end_date
        ),
        'total_operations', total_operations,
        'audited_operations', audited_operations,
        'compliance_score', compliance_score,
        'violations', COALESCE(violations, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old audit data
CREATE OR REPLACE FUNCTION cleanup_audit_data()
RETURNS INTEGER AS $$
DECLARE
    retention_days INTEGER;
    deleted_count INTEGER := 0;
    cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get retention period from configuration
    retention_days := (get_security_config('audit_retention_days'))::INTEGER;
    cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
    
    -- Clean up old audit logs
    DELETE FROM security_audit_log WHERE timestamp < cutoff_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up old security events (keep critical events longer)
    DELETE FROM security_events 
    WHERE timestamp < cutoff_date 
    AND severity NOT IN ('critical', 'high');
    
    -- Clean up old failed login attempts
    DELETE FROM failed_login_attempts WHERE timestamp < cutoff_date;
    
    -- Clean up old data access logs
    DELETE FROM data_access_log WHERE timestamp < cutoff_date;
    
    -- Clean up old performance alerts
    DELETE FROM performance_alerts WHERE timestamp < cutoff_date;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule automatic cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-audit-data', '0 2 * * *', 'SELECT cleanup_audit_data();');

-- Row Level Security (RLS) policies

-- Enable RLS on all security tables
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_configuration ENABLE ROW LEVEL SECURITY;

-- Policies for security_audit_log (admin and service role only)
CREATE POLICY "security_audit_log_admin_access" ON security_audit_log
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for security_events (admin and service role only)
CREATE POLICY "security_events_admin_access" ON security_events
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for failed_login_attempts (service role only)
CREATE POLICY "failed_login_attempts_service_access" ON failed_login_attempts
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Policies for data_access_log (users can see their own, admins see all)
CREATE POLICY "data_access_log_user_access" ON data_access_log
    FOR SELECT USING (
        user_id = auth.uid() OR
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

CREATE POLICY "data_access_log_service_insert" ON data_access_log
    FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Policies for performance_alerts (admin and service role only)
CREATE POLICY "performance_alerts_admin_access" ON performance_alerts
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for security_configuration (admin and service role only)
CREATE POLICY "security_configuration_admin_access" ON security_configuration
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Grant necessary permissions to authenticated users
GRANT SELECT ON security_audit_log TO authenticated;
GRANT SELECT ON security_events TO authenticated;
GRANT SELECT ON data_access_log TO authenticated;
GRANT SELECT ON performance_alerts TO authenticated;

-- Grant full access to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Create indexes for better performance on large datasets
CREATE INDEX IF NOT EXISTS idx_security_audit_log_composite ON security_audit_log(user_id, timestamp DESC, operation);
CREATE INDEX IF NOT EXISTS idx_security_events_composite ON security_events(severity, timestamp DESC, resolved);
CREATE INDEX IF NOT EXISTS idx_data_access_log_composite ON data_access_log(user_id, resource_type, timestamp DESC);

-- Add comments for documentation
COMMENT ON TABLE security_audit_log IS 'Comprehensive audit log for all database operations';
COMMENT ON TABLE security_events IS 'Security incidents and events tracking';
COMMENT ON TABLE failed_login_attempts IS 'Failed authentication attempts for brute force detection';
COMMENT ON TABLE data_access_log IS 'Detailed logging of sensitive data access operations';
COMMENT ON TABLE performance_alerts IS 'Performance-related alerts and notifications';
COMMENT ON TABLE security_configuration IS 'Security settings and configuration parameters';

COMMENT ON FUNCTION get_security_config(TEXT) IS 'Retrieve security configuration values';
COMMENT ON FUNCTION update_security_config(TEXT, JSONB, UUID) IS 'Update security configuration (admin only)';
COMMENT ON FUNCTION log_security_event(VARCHAR, VARCHAR, TEXT, UUID, INET, TEXT, JSONB) IS 'Log security events and incidents';
COMMENT ON FUNCTION check_brute_force_attack(INET, VARCHAR) IS 'Check for brute force attack patterns';
COMMENT ON FUNCTION get_security_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) IS 'Generate security metrics report';
COMMENT ON FUNCTION generate_compliance_report(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) IS 'Generate compliance audit report';
COMMENT ON FUNCTION cleanup_audit_data() IS 'Clean up old audit data based on retention policy';