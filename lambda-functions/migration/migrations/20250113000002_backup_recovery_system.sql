-- Backup and Recovery System Migration
-- This migration creates tables and functions for backup management and disaster recovery

-- Backup configuration table
CREATE TABLE IF NOT EXISTS backup_configuration (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID,
    
    -- Add foreign key constraint
    CONSTRAINT fk_backup_configuration_updated_by 
        FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Backup history table for tracking all backup operations
CREATE TABLE IF NOT EXISTS backup_history (
    id VARCHAR(100) PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('full', 'incremental', 'differential')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'verified')),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    size BIGINT, -- Size in bytes
    location TEXT, -- Storage location (S3 URL, etc.)
    checksum VARCHAR(128), -- SHA-256 checksum for verification
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for backup history performance
CREATE INDEX IF NOT EXISTS idx_backup_history_start_time ON backup_history(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status);
CREATE INDEX IF NOT EXISTS idx_backup_history_type ON backup_history(type);
CREATE INDEX IF NOT EXISTS idx_backup_history_size ON backup_history(size);

-- Backup notifications table
CREATE TABLE IF NOT EXISTS backup_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('success', 'failure', 'warning')),
    message TEXT NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivery_status VARCHAR(20) DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
    
    -- Add foreign key constraint
    CONSTRAINT fk_backup_notifications_backup_id 
        FOREIGN KEY (backup_id) REFERENCES backup_history(id) ON DELETE CASCADE
);

-- Indexes for backup notifications
CREATE INDEX IF NOT EXISTS idx_backup_notifications_backup_id ON backup_notifications(backup_id);
CREATE INDEX IF NOT EXISTS idx_backup_notifications_sent_at ON backup_notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_notifications_delivery_status ON backup_notifications(delivery_status);

-- Recovery plans table
CREATE TABLE IF NOT EXISTS recovery_plans (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]', -- Array of recovery steps
    estimated_duration INTEGER NOT NULL, -- Duration in minutes
    rto INTEGER NOT NULL, -- Recovery Time Objective in minutes
    rpo INTEGER NOT NULL, -- Recovery Point Objective in minutes
    last_tested TIMESTAMP WITH TIME ZONE,
    test_results JSONB DEFAULT '[]', -- Array of test results
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    
    -- Add foreign key constraints
    CONSTRAINT fk_recovery_plans_created_by 
        FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_recovery_plans_updated_by 
        FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for recovery plans
CREATE INDEX IF NOT EXISTS idx_recovery_plans_name ON recovery_plans(name);
CREATE INDEX IF NOT EXISTS idx_recovery_plans_last_tested ON recovery_plans(last_tested);
CREATE INDEX IF NOT EXISTS idx_recovery_plans_rto ON recovery_plans(rto);
CREATE INDEX IF NOT EXISTS idx_recovery_plans_rpo ON recovery_plans(rpo);

-- Recovery test executions table
CREATE TABLE IF NOT EXISTS recovery_test_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id VARCHAR(100) NOT NULL,
    test_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    success BOOLEAN NOT NULL,
    actual_duration INTEGER, -- Actual duration in minutes
    issues JSONB DEFAULT '[]', -- Array of issues encountered
    recommendations JSONB DEFAULT '[]', -- Array of recommendations
    executed_by UUID,
    metadata JSONB DEFAULT '{}',
    
    -- Add foreign key constraints
    CONSTRAINT fk_recovery_test_executions_plan_id 
        FOREIGN KEY (plan_id) REFERENCES recovery_plans(id) ON DELETE CASCADE,
    CONSTRAINT fk_recovery_test_executions_executed_by 
        FOREIGN KEY (executed_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for recovery test executions
CREATE INDEX IF NOT EXISTS idx_recovery_test_executions_plan_id ON recovery_test_executions(plan_id);
CREATE INDEX IF NOT EXISTS idx_recovery_test_executions_test_date ON recovery_test_executions(test_date DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_test_executions_success ON recovery_test_executions(success);

-- Backup verification results table
CREATE TABLE IF NOT EXISTS backup_verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id VARCHAR(100) NOT NULL,
    verification_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checksum_verified BOOLEAN NOT NULL,
    restore_test_passed BOOLEAN,
    data_integrity_verified BOOLEAN,
    verification_duration INTEGER, -- Duration in seconds
    issues JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    
    -- Add foreign key constraint
    CONSTRAINT fk_backup_verification_results_backup_id 
        FOREIGN KEY (backup_id) REFERENCES backup_history(id) ON DELETE CASCADE
);

-- Indexes for backup verification results
CREATE INDEX IF NOT EXISTS idx_backup_verification_results_backup_id ON backup_verification_results(backup_id);
CREATE INDEX IF NOT EXISTS idx_backup_verification_results_verification_date ON backup_verification_results(verification_date DESC);
CREATE INDEX IF NOT EXISTS idx_backup_verification_results_checksum_verified ON backup_verification_results(checksum_verified);

-- Insert default backup configuration
INSERT INTO backup_configuration (id, settings) VALUES (
    'default',
    '{
        "enabled": true,
        "schedule": "daily",
        "retentionDays": 30,
        "compressionEnabled": true,
        "encryptionEnabled": true,
        "verificationEnabled": true,
        "notificationEnabled": true,
        "notificationEmail": "admin@example.com"
    }'
) ON CONFLICT (id) DO NOTHING;

-- Function to get backup configuration
CREATE OR REPLACE FUNCTION get_backup_config()
RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT settings 
        FROM backup_configuration 
        WHERE id = 'default'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update backup configuration
CREATE OR REPLACE FUNCTION update_backup_config(
    new_settings JSONB,
    user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE backup_configuration 
    SET settings = new_settings,
        updated_at = NOW(),
        updated_by = user_id
    WHERE id = 'default';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create backup record
CREATE OR REPLACE FUNCTION create_backup_record(
    p_backup_id VARCHAR(100),
    p_type VARCHAR(20),
    p_metadata JSONB DEFAULT '{}'
)
RETURNS VARCHAR(100) AS $$
BEGIN
    INSERT INTO backup_history (
        id, type, status, start_time, metadata
    ) VALUES (
        p_backup_id, p_type, 'pending', NOW(), p_metadata
    );
    
    RETURN p_backup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update backup status
CREATE OR REPLACE FUNCTION update_backup_status(
    p_backup_id VARCHAR(100),
    p_status VARCHAR(20),
    p_end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_size BIGINT DEFAULT NULL,
    p_location TEXT DEFAULT NULL,
    p_checksum VARCHAR(128) DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE backup_history 
    SET status = p_status,
        end_time = COALESCE(p_end_time, CASE WHEN p_status IN ('completed', 'failed', 'verified') THEN NOW() ELSE end_time END),
        size = COALESCE(p_size, size),
        location = COALESCE(p_location, location),
        checksum = COALESCE(p_checksum, checksum),
        error_message = COALESCE(p_error_message, error_message),
        metadata = COALESCE(p_metadata, metadata)
    WHERE id = p_backup_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get backup metrics
CREATE OR REPLACE FUNCTION get_backup_metrics(
    p_days INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    total_backups INTEGER;
    successful_backups INTEGER;
    failed_backups INTEGER;
    avg_backup_time NUMERIC;
    avg_backup_size NUMERIC;
    last_backup_time TIMESTAMP WITH TIME ZONE;
    storage_used BIGINT;
    cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
    cutoff_date := NOW() - (p_days || ' days')::INTERVAL;
    
    -- Get backup statistics
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('completed', 'verified')),
        COUNT(*) FILTER (WHERE status = 'failed'),
        AVG(EXTRACT(EPOCH FROM (end_time - start_time))/60) FILTER (WHERE status IN ('completed', 'verified') AND end_time IS NOT NULL),
        AVG(size) FILTER (WHERE status IN ('completed', 'verified') AND size IS NOT NULL),
        MAX(start_time),
        SUM(size) FILTER (WHERE status IN ('completed', 'verified') AND size IS NOT NULL)
    INTO total_backups, successful_backups, failed_backups, avg_backup_time, avg_backup_size, last_backup_time, storage_used
    FROM backup_history
    WHERE start_time >= cutoff_date;
    
    RETURN jsonb_build_object(
        'period_days', p_days,
        'total_backups', COALESCE(total_backups, 0),
        'successful_backups', COALESCE(successful_backups, 0),
        'failed_backups', COALESCE(failed_backups, 0),
        'success_rate', CASE WHEN total_backups > 0 THEN ROUND((successful_backups::NUMERIC / total_backups) * 100, 2) ELSE 0 END,
        'average_backup_time_minutes', COALESCE(ROUND(avg_backup_time, 2), 0),
        'average_backup_size_bytes', COALESCE(avg_backup_size, 0),
        'last_backup_time', last_backup_time,
        'storage_used_bytes', COALESCE(storage_used, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recovery plan metrics
CREATE OR REPLACE FUNCTION get_recovery_plan_metrics()
RETURNS JSONB AS $$
DECLARE
    total_plans INTEGER;
    tested_plans INTEGER;
    successful_tests INTEGER;
    avg_test_duration NUMERIC;
    last_test_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get recovery plan statistics
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE last_tested IS NOT NULL),
        COUNT(*) FILTER (WHERE last_tested IS NOT NULL AND 
            (test_results->-1->>'success')::BOOLEAN = true),
        AVG((test_results->-1->>'actualDuration')::INTEGER) FILTER (WHERE 
            test_results IS NOT NULL AND jsonb_array_length(test_results) > 0),
        MAX(last_tested)
    INTO total_plans, tested_plans, successful_tests, avg_test_duration, last_test_date
    FROM recovery_plans;
    
    RETURN jsonb_build_object(
        'total_plans', COALESCE(total_plans, 0),
        'tested_plans', COALESCE(tested_plans, 0),
        'untested_plans', COALESCE(total_plans - tested_plans, 0),
        'successful_tests', COALESCE(successful_tests, 0),
        'test_success_rate', CASE WHEN tested_plans > 0 THEN ROUND((successful_tests::NUMERIC / tested_plans) * 100, 2) ELSE 0 END,
        'average_test_duration_minutes', COALESCE(ROUND(avg_test_duration, 2), 0),
        'last_test_date', last_test_date
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old backup records
CREATE OR REPLACE FUNCTION cleanup_old_backups(
    p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
    cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;
    
    -- Delete old backup history records
    DELETE FROM backup_history WHERE start_time < cutoff_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up orphaned notifications
    DELETE FROM backup_notifications 
    WHERE backup_id NOT IN (SELECT id FROM backup_history);
    
    -- Clean up orphaned verification results
    DELETE FROM backup_verification_results 
    WHERE backup_id NOT IN (SELECT id FROM backup_history);
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate backup integrity
CREATE OR REPLACE FUNCTION validate_backup_integrity(
    p_backup_id VARCHAR(100),
    p_expected_checksum VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    backup_record RECORD;
    is_valid BOOLEAN := FALSE;
    validation_result JSONB;
BEGIN
    -- Get backup record
    SELECT * INTO backup_record
    FROM backup_history
    WHERE id = p_backup_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'Backup record not found'
        );
    END IF;
    
    -- Validate checksum
    is_valid := (backup_record.checksum = p_expected_checksum);
    
    -- Record validation result
    INSERT INTO backup_verification_results (
        backup_id,
        checksum_verified,
        verification_duration,
        metadata
    ) VALUES (
        p_backup_id,
        is_valid,
        1, -- Simulated duration
        jsonb_build_object(
            'expected_checksum', p_expected_checksum,
            'actual_checksum', backup_record.checksum
        )
    );
    
    RETURN jsonb_build_object(
        'valid', is_valid,
        'backup_id', p_backup_id,
        'expected_checksum', p_expected_checksum,
        'actual_checksum', backup_record.checksum,
        'validation_date', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get backup health status
CREATE OR REPLACE FUNCTION get_backup_health_status()
RETURNS JSONB AS $$
DECLARE
    config JSONB;
    last_backup RECORD;
    hours_since_last_backup NUMERIC;
    expected_interval_hours INTEGER;
    recent_failures INTEGER;
    health_status VARCHAR(20) := 'healthy';
    issues JSONB := '[]'::JSONB;
BEGIN
    -- Get backup configuration
    config := get_backup_config();
    
    -- Get last backup
    SELECT * INTO last_backup
    FROM backup_history
    ORDER BY start_time DESC
    LIMIT 1;
    
    -- Calculate hours since last backup
    IF last_backup.start_time IS NOT NULL THEN
        hours_since_last_backup := EXTRACT(EPOCH FROM (NOW() - last_backup.start_time)) / 3600;
    ELSE
        hours_since_last_backup := 999999; -- Very large number if no backups
    END IF;
    
    -- Determine expected interval
    expected_interval_hours := CASE config->>'schedule'
        WHEN 'hourly' THEN 1
        WHEN 'daily' THEN 24
        WHEN 'weekly' THEN 168
        WHEN 'monthly' THEN 720
        ELSE 24
    END;
    
    -- Count recent failures (last 7 days)
    SELECT COUNT(*) INTO recent_failures
    FROM backup_history
    WHERE status = 'failed'
    AND start_time >= NOW() - INTERVAL '7 days';
    
    -- Determine health status and issues
    IF hours_since_last_backup > expected_interval_hours * 2 THEN
        health_status := 'critical';
        issues := issues || jsonb_build_object(
            'type', 'missing_backup',
            'message', format('No backup completed in %s hours (expected every %s hours)', 
                ROUND(hours_since_last_backup, 1), expected_interval_hours)
        );
    END IF;
    
    IF recent_failures > 2 THEN
        health_status := CASE WHEN health_status = 'critical' THEN 'critical' ELSE 'warning' END;
        issues := issues || jsonb_build_object(
            'type', 'backup_failures',
            'message', format('%s backup failures in the last 7 days', recent_failures)
        );
    END IF;
    
    IF last_backup.status = 'failed' THEN
        health_status := CASE WHEN health_status = 'critical' THEN 'critical' ELSE 'warning' END;
        issues := issues || jsonb_build_object(
            'type', 'last_backup_failed',
            'message', 'Most recent backup failed'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'status', health_status,
        'last_backup_time', last_backup.start_time,
        'hours_since_last_backup', ROUND(hours_since_last_backup, 1),
        'expected_interval_hours', expected_interval_hours,
        'recent_failures', recent_failures,
        'issues', issues,
        'check_time', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule automatic backup cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-old-backups', '0 3 * * *', 'SELECT cleanup_old_backups();');

-- Row Level Security (RLS) policies

-- Enable RLS on backup tables
ALTER TABLE backup_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_test_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_verification_results ENABLE ROW LEVEL SECURITY;

-- Policies for backup_configuration (admin and service role only)
CREATE POLICY "backup_configuration_admin_access" ON backup_configuration
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for backup_history (admin and service role only)
CREATE POLICY "backup_history_admin_access" ON backup_history
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for backup_notifications (admin and service role only)
CREATE POLICY "backup_notifications_admin_access" ON backup_notifications
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for recovery_plans (admin and service role only)
CREATE POLICY "recovery_plans_admin_access" ON recovery_plans
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for recovery_test_executions (admin and service role only)
CREATE POLICY "recovery_test_executions_admin_access" ON recovery_test_executions
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for backup_verification_results (admin and service role only)
CREATE POLICY "backup_verification_results_admin_access" ON backup_verification_results
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Grant necessary permissions
GRANT SELECT ON backup_configuration TO authenticated;
GRANT SELECT ON backup_history TO authenticated;
GRANT SELECT ON recovery_plans TO authenticated;

-- Grant full access to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Add comments for documentation
COMMENT ON TABLE backup_configuration IS 'Backup system configuration and settings';
COMMENT ON TABLE backup_history IS 'Complete history of all backup operations';
COMMENT ON TABLE backup_notifications IS 'Backup completion and failure notifications';
COMMENT ON TABLE recovery_plans IS 'Disaster recovery plans and procedures';
COMMENT ON TABLE recovery_test_executions IS 'Recovery plan test execution results';
COMMENT ON TABLE backup_verification_results IS 'Backup integrity verification results';

COMMENT ON FUNCTION get_backup_config() IS 'Retrieve current backup configuration';
COMMENT ON FUNCTION update_backup_config(JSONB, UUID) IS 'Update backup configuration settings';
COMMENT ON FUNCTION create_backup_record(VARCHAR, VARCHAR, JSONB) IS 'Create new backup operation record';
COMMENT ON FUNCTION update_backup_status(VARCHAR, VARCHAR, TIMESTAMP WITH TIME ZONE, BIGINT, TEXT, VARCHAR, TEXT, JSONB) IS 'Update backup operation status and metadata';
COMMENT ON FUNCTION get_backup_metrics(INTEGER) IS 'Generate backup performance metrics and statistics';
COMMENT ON FUNCTION get_recovery_plan_metrics() IS 'Generate recovery plan testing metrics';
COMMENT ON FUNCTION cleanup_old_backups(INTEGER) IS 'Clean up old backup records based on retention policy';
COMMENT ON FUNCTION validate_backup_integrity(VARCHAR, VARCHAR) IS 'Validate backup file integrity using checksums';
COMMENT ON FUNCTION get_backup_health_status() IS 'Get overall backup system health status and issues';