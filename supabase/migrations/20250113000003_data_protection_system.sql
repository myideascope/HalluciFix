-- Data Protection and Encryption System Migration
-- This migration creates tables and functions for data protection, encryption, and compliance

-- Data masking rules table
CREATE TABLE IF NOT EXISTS data_masking_rules (
    id VARCHAR(100) PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    masking_type VARCHAR(20) NOT NULL CHECK (masking_type IN ('full', 'partial', 'hash', 'tokenize', 'redact')),
    masking_pattern VARCHAR(255),
    environment VARCHAR(20) NOT NULL CHECK (environment IN ('development', 'staging', 'production', 'all')),
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    
    -- Add foreign key constraints
    CONSTRAINT fk_data_masking_rules_created_by 
        FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_data_masking_rules_updated_by 
        FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Unique constraint to prevent duplicate rules
    UNIQUE(table_name, column_name, environment)
);

-- Indexes for data masking rules
CREATE INDEX IF NOT EXISTS idx_data_masking_rules_table_column ON data_masking_rules(table_name, column_name);
CREATE INDEX IF NOT EXISTS idx_data_masking_rules_environment ON data_masking_rules(environment);
CREATE INDEX IF NOT EXISTS idx_data_masking_rules_enabled ON data_masking_rules(enabled);

-- Data classifications table
CREATE TABLE IF NOT EXISTS data_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    data_type VARCHAR(50) NOT NULL,
    classification VARCHAR(20) NOT NULL CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
    contains_pii BOOLEAN DEFAULT FALSE,
    contains_phi BOOLEAN DEFAULT FALSE,
    contains_financial BOOLEAN DEFAULT FALSE,
    retention_period INTEGER, -- Days
    encryption_required BOOLEAN DEFAULT FALSE,
    access_controls JSONB DEFAULT '[]', -- Array of access control rules
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    
    -- Add foreign key constraints
    CONSTRAINT fk_data_classifications_created_by 
        FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_data_classifications_updated_by 
        FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Unique constraint for table/column combination
    UNIQUE(table_name, column_name)
);

-- Indexes for data classifications
CREATE INDEX IF NOT EXISTS idx_data_classifications_table_column ON data_classifications(table_name, column_name);
CREATE INDEX IF NOT EXISTS idx_data_classifications_classification ON data_classifications(classification);
CREATE INDEX IF NOT EXISTS idx_data_classifications_pii ON data_classifications(contains_pii);
CREATE INDEX IF NOT EXISTS idx_data_classifications_phi ON data_classifications(contains_phi);
CREATE INDEX IF NOT EXISTS idx_data_classifications_financial ON data_classifications(contains_financial);
CREATE INDEX IF NOT EXISTS idx_data_classifications_encryption ON data_classifications(encryption_required);

-- Compliance checks table
CREATE TABLE IF NOT EXISTS compliance_checks (
    id VARCHAR(100) PRIMARY KEY,
    check_type VARCHAR(20) NOT NULL CHECK (check_type IN ('gdpr', 'hipaa', 'pci_dss', 'sox', 'iso27001')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('compliant', 'non_compliant', 'partial', 'unknown')),
    last_checked TIMESTAMP WITH TIME ZONE NOT NULL,
    findings JSONB DEFAULT '[]', -- Array of compliance findings
    score INTEGER CHECK (score >= 0 AND score <= 100),
    recommendations JSONB DEFAULT '[]', -- Array of recommendations
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checked_by UUID,
    
    -- Add foreign key constraint
    CONSTRAINT fk_compliance_checks_checked_by 
        FOREIGN KEY (checked_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for compliance checks
CREATE INDEX IF NOT EXISTS idx_compliance_checks_type ON compliance_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_status ON compliance_checks(status);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_last_checked ON compliance_checks(last_checked DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_score ON compliance_checks(score);

-- Encryption configuration table
CREATE TABLE IF NOT EXISTS encryption_configuration (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    at_rest_enabled BOOLEAN DEFAULT TRUE,
    at_rest_algorithm VARCHAR(50) DEFAULT 'AES-256',
    in_transit_enabled BOOLEAN DEFAULT TRUE,
    in_transit_protocol VARCHAR(20) DEFAULT 'TLS 1.3',
    application_encryption_enabled BOOLEAN DEFAULT FALSE,
    application_encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
    key_rotation_enabled BOOLEAN DEFAULT TRUE,
    key_rotation_interval_days INTEGER DEFAULT 90,
    last_key_rotation TIMESTAMP WITH TIME ZONE,
    certificate_expiry TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID,
    
    -- Add foreign key constraint
    CONSTRAINT fk_encryption_configuration_updated_by 
        FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Data access audit table (extends existing audit logging)
CREATE TABLE IF NOT EXISTS data_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    column_name VARCHAR(100),
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
    data_classification VARCHAR(20),
    contains_pii BOOLEAN DEFAULT FALSE,
    contains_phi BOOLEAN DEFAULT FALSE,
    contains_financial BOOLEAN DEFAULT FALSE,
    access_granted BOOLEAN DEFAULT TRUE,
    access_reason TEXT,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_id VARCHAR(100),
    
    -- Add foreign key constraint
    CONSTRAINT fk_data_access_audit_user_id 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes for data access audit
CREATE INDEX IF NOT EXISTS idx_data_access_audit_user_id ON data_access_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_data_access_audit_timestamp ON data_access_audit(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_data_access_audit_table_column ON data_access_audit(table_name, column_name);
CREATE INDEX IF NOT EXISTS idx_data_access_audit_classification ON data_access_audit(data_classification);
CREATE INDEX IF NOT EXISTS idx_data_access_audit_pii ON data_access_audit(contains_pii);
CREATE INDEX IF NOT EXISTS idx_data_access_audit_phi ON data_access_audit(contains_phi);
CREATE INDEX IF NOT EXISTS idx_data_access_audit_financial ON data_access_audit(contains_financial);

-- Privacy metrics view
CREATE OR REPLACE VIEW privacy_metrics_summary AS
SELECT 
    COUNT(*) as total_classifications,
    COUNT(*) FILTER (WHERE contains_pii = true) as pii_classifications,
    COUNT(*) FILTER (WHERE contains_phi = true) as phi_classifications,
    COUNT(*) FILTER (WHERE contains_financial = true) as financial_classifications,
    COUNT(*) FILTER (WHERE encryption_required = true) as encrypted_classifications,
    COUNT(*) FILTER (WHERE retention_period IS NOT NULL) as with_retention_policy,
    ROUND(AVG(CASE WHEN retention_period IS NOT NULL THEN 1 ELSE 0 END) * 100, 2) as retention_compliance_percentage,
    ROUND(AVG(CASE WHEN encryption_required = true THEN 1 ELSE 0 END) * 100, 2) as encryption_compliance_percentage
FROM data_classifications;

-- Insert default encryption configuration
INSERT INTO encryption_configuration (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- Insert default data classifications for common sensitive fields
INSERT INTO data_classifications (table_name, column_name, data_type, classification, contains_pii, encryption_required, access_controls) VALUES
    ('users', 'email', 'varchar', 'confidential', true, true, '["authenticated", "admin"]'),
    ('users', 'name', 'varchar', 'confidential', true, false, '["authenticated", "admin"]'),
    ('users', 'phone', 'varchar', 'confidential', true, true, '["owner", "admin"]'),
    ('analysis_results', 'content', 'text', 'internal', false, false, '["owner", "admin"]'),
    ('payment_methods', 'card_number', 'varchar', 'restricted', true, true, '["owner", "admin"]'),
    ('payment_methods', 'cvv', 'varchar', 'restricted', true, true, '["owner"]'),
    ('subscriptions', 'billing_address', 'jsonb', 'confidential', true, false, '["owner", "admin"]')
ON CONFLICT (table_name, column_name) DO NOTHING;

-- Insert default masking rules for development environment
INSERT INTO data_masking_rules (id, table_name, column_name, masking_type, masking_pattern, environment, enabled) VALUES
    ('mask_users_email_dev', 'users', 'email', 'partial', '***@***.***', 'development', true),
    ('mask_users_phone_dev', 'users', 'phone', 'partial', '***-***-****', 'development', true),
    ('mask_payment_card_all', 'payment_methods', 'card_number', 'partial', '****-****-****-1234', 'all', true),
    ('mask_payment_cvv_all', 'payment_methods', 'cvv', 'full', null, 'all', true),
    ('mask_analysis_content_dev', 'analysis_results', 'content', 'redact', null, 'development', true)
ON CONFLICT (table_name, column_name, environment) DO NOTHING;

-- Function to get encryption status
CREATE OR REPLACE FUNCTION get_encryption_status()
RETURNS JSONB AS $$
DECLARE
    config RECORD;
BEGIN
    SELECT * INTO config FROM encryption_configuration WHERE id = 'default';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', 'Encryption configuration not found'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'at_rest', jsonb_build_object(
            'enabled', config.at_rest_enabled,
            'algorithm', config.at_rest_algorithm,
            'key_rotation_enabled', config.key_rotation_enabled,
            'last_key_rotation', config.last_key_rotation
        ),
        'in_transit', jsonb_build_object(
            'enabled', config.in_transit_enabled,
            'protocol', config.in_transit_protocol,
            'certificate_expiry', config.certificate_expiry
        ),
        'application', jsonb_build_object(
            'enabled', config.application_encryption_enabled,
            'algorithm', config.application_encryption_algorithm
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update encryption configuration
CREATE OR REPLACE FUNCTION update_encryption_config(
    p_config JSONB,
    p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE encryption_configuration 
    SET at_rest_enabled = COALESCE((p_config->>'at_rest_enabled')::BOOLEAN, at_rest_enabled),
        at_rest_algorithm = COALESCE(p_config->>'at_rest_algorithm', at_rest_algorithm),
        in_transit_enabled = COALESCE((p_config->>'in_transit_enabled')::BOOLEAN, in_transit_enabled),
        in_transit_protocol = COALESCE(p_config->>'in_transit_protocol', in_transit_protocol),
        application_encryption_enabled = COALESCE((p_config->>'application_encryption_enabled')::BOOLEAN, application_encryption_enabled),
        application_encryption_algorithm = COALESCE(p_config->>'application_encryption_algorithm', application_encryption_algorithm),
        key_rotation_enabled = COALESCE((p_config->>'key_rotation_enabled')::BOOLEAN, key_rotation_enabled),
        key_rotation_interval_days = COALESCE((p_config->>'key_rotation_interval_days')::INTEGER, key_rotation_interval_days),
        certificate_expiry = COALESCE((p_config->>'certificate_expiry')::TIMESTAMP WITH TIME ZONE, certificate_expiry),
        updated_at = NOW(),
        updated_by = p_user_id
    WHERE id = 'default';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log data access for audit
CREATE OR REPLACE FUNCTION log_data_access(
    p_user_id UUID,
    p_table_name VARCHAR(100),
    p_column_name VARCHAR(100),
    p_operation VARCHAR(20),
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_session_id VARCHAR(100) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    audit_id UUID;
    classification RECORD;
BEGIN
    -- Get data classification for the accessed column
    SELECT * INTO classification
    FROM data_classifications
    WHERE table_name = p_table_name AND column_name = p_column_name;
    
    -- Insert audit record
    INSERT INTO data_access_audit (
        user_id, table_name, column_name, operation,
        data_classification, contains_pii, contains_phi, contains_financial,
        ip_address, user_agent, session_id
    ) VALUES (
        p_user_id, p_table_name, p_column_name, p_operation,
        classification.classification, classification.contains_pii, 
        classification.contains_phi, classification.contains_financial,
        p_ip_address, p_user_agent, p_session_id
    ) RETURNING id INTO audit_id;
    
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get privacy metrics
CREATE OR REPLACE FUNCTION get_privacy_metrics()
RETURNS JSONB AS $$
DECLARE
    metrics RECORD;
    masking_rules_count INTEGER;
    access_audit_count INTEGER;
BEGIN
    -- Get classification metrics
    SELECT * INTO metrics FROM privacy_metrics_summary;
    
    -- Get masking rules count
    SELECT COUNT(*) INTO masking_rules_count
    FROM data_masking_rules WHERE enabled = true;
    
    -- Get recent access audit count (last 30 days)
    SELECT COUNT(*) INTO access_audit_count
    FROM data_access_audit
    WHERE timestamp >= NOW() - INTERVAL '30 days';
    
    RETURN jsonb_build_object(
        'total_classifications', COALESCE(metrics.total_classifications, 0),
        'pii_classifications', COALESCE(metrics.pii_classifications, 0),
        'phi_classifications', COALESCE(metrics.phi_classifications, 0),
        'financial_classifications', COALESCE(metrics.financial_classifications, 0),
        'encrypted_classifications', COALESCE(metrics.encrypted_classifications, 0),
        'active_masking_rules', COALESCE(masking_rules_count, 0),
        'retention_compliance_percentage', COALESCE(metrics.retention_compliance_percentage, 0),
        'encryption_compliance_percentage', COALESCE(metrics.encryption_compliance_percentage, 0),
        'recent_access_events', COALESCE(access_audit_count, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to perform compliance check
CREATE OR REPLACE FUNCTION perform_compliance_check(
    p_check_type VARCHAR(20),
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    findings JSONB := '[]'::JSONB;
    score INTEGER := 100;
    status VARCHAR(20);
    recommendations JSONB := '[]'::JSONB;
    check_id VARCHAR(100);
BEGIN
    check_id := 'check_' || EXTRACT(EPOCH FROM NOW())::BIGINT || '_' || substr(md5(random()::text), 1, 9);
    
    -- Perform different checks based on type
    CASE p_check_type
        WHEN 'gdpr' THEN
            -- Check PII encryption
            IF EXISTS (SELECT 1 FROM data_classifications WHERE contains_pii = true AND encryption_required = false) THEN
                findings := findings || jsonb_build_object(
                    'id', 'gdpr_pii_encryption',
                    'severity', 'high',
                    'category', 'Data Protection',
                    'description', 'PII fields found without encryption requirement',
                    'remediation', 'Enable encryption for all PII fields'
                );
                score := score - 15;
            END IF;
            
            -- Check retention policies
            IF EXISTS (SELECT 1 FROM data_classifications WHERE contains_pii = true AND retention_period IS NULL) THEN
                findings := findings || jsonb_build_object(
                    'id', 'gdpr_retention_policy',
                    'severity', 'medium',
                    'category', 'Data Retention',
                    'description', 'PII fields found without retention policies',
                    'remediation', 'Define retention periods for all PII data'
                );
                score := score - 8;
            END IF;
            
        WHEN 'hipaa' THEN
            -- Check PHI encryption
            IF EXISTS (SELECT 1 FROM data_classifications WHERE contains_phi = true AND encryption_required = false) THEN
                findings := findings || jsonb_build_object(
                    'id', 'hipaa_phi_encryption',
                    'severity', 'critical',
                    'category', 'PHI Protection',
                    'description', 'PHI fields found without encryption requirement',
                    'remediation', 'Enable encryption for all PHI fields'
                );
                score := score - 25;
            END IF;
            
        WHEN 'pci_dss' THEN
            -- Check financial data encryption
            IF EXISTS (SELECT 1 FROM data_classifications WHERE contains_financial = true AND encryption_required = false) THEN
                findings := findings || jsonb_build_object(
                    'id', 'pci_financial_encryption',
                    'severity', 'critical',
                    'category', 'Cardholder Data Protection',
                    'description', 'Financial data fields found without encryption requirement',
                    'remediation', 'Enable encryption for all cardholder data'
                );
                score := score - 25;
            END IF;
    END CASE;
    
    -- Determine status
    status := CASE 
        WHEN score >= 95 THEN 'compliant'
        WHEN score >= 70 THEN 'partial'
        ELSE 'non_compliant'
    END;
    
    -- Generate recommendations based on findings
    IF jsonb_array_length(findings) > 0 THEN
        recommendations := recommendations || '"Implement comprehensive data encryption strategy"';
        recommendations := recommendations || '"Review and update data classification policies"';
        recommendations := recommendations || '"Establish data retention and deletion policies"';
    ELSE
        recommendations := recommendations || '"Maintain current compliance posture"';
        recommendations := recommendations || '"Continue regular compliance monitoring"';
    END IF;
    
    -- Store compliance check result
    INSERT INTO compliance_checks (
        id, check_type, status, last_checked, findings, score, recommendations, checked_by
    ) VALUES (
        check_id, p_check_type, status, NOW(), findings, score, recommendations, p_user_id
    ) ON CONFLICT (check_type) DO UPDATE SET
        status = EXCLUDED.status,
        last_checked = EXCLUDED.last_checked,
        findings = EXCLUDED.findings,
        score = EXCLUDED.score,
        recommendations = EXCLUDED.recommendations,
        updated_at = NOW(),
        checked_by = EXCLUDED.checked_by;
    
    RETURN jsonb_build_object(
        'id', check_id,
        'check_type', p_check_type,
        'status', status,
        'score', score,
        'findings', findings,
        'recommendations', recommendations,
        'last_checked', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old audit data
CREATE OR REPLACE FUNCTION cleanup_data_access_audit(
    p_retention_days INTEGER DEFAULT 365
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
    cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;
    
    -- Delete old data access audit records
    DELETE FROM data_access_audit WHERE timestamp < cutoff_date;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule automatic cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-data-access-audit', '0 4 * * *', 'SELECT cleanup_data_access_audit();');

-- Row Level Security (RLS) policies

-- Enable RLS on data protection tables
ALTER TABLE data_masking_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE encryption_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_audit ENABLE ROW LEVEL SECURITY;

-- Policies for data_masking_rules (admin and service role only)
CREATE POLICY "data_masking_rules_admin_access" ON data_masking_rules
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for data_classifications (admin and service role only)
CREATE POLICY "data_classifications_admin_access" ON data_classifications
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for compliance_checks (admin and service role only)
CREATE POLICY "compliance_checks_admin_access" ON compliance_checks
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for encryption_configuration (admin and service role only)
CREATE POLICY "encryption_configuration_admin_access" ON encryption_configuration
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

-- Policies for data_access_audit (users can see their own, admins see all)
CREATE POLICY "data_access_audit_user_access" ON data_access_audit
    FOR SELECT USING (
        user_id = auth.uid() OR
        auth.jwt() ->> 'role' = 'service_role' OR
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    );

CREATE POLICY "data_access_audit_service_insert" ON data_access_audit
    FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Grant necessary permissions
GRANT SELECT ON data_masking_rules TO authenticated;
GRANT SELECT ON data_classifications TO authenticated;
GRANT SELECT ON compliance_checks TO authenticated;
GRANT SELECT ON data_access_audit TO authenticated;
GRANT SELECT ON privacy_metrics_summary TO authenticated;

-- Grant full access to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Add comments for documentation
COMMENT ON TABLE data_masking_rules IS 'Rules for masking sensitive data in different environments';
COMMENT ON TABLE data_classifications IS 'Classification and metadata for all database columns';
COMMENT ON TABLE compliance_checks IS 'Results of compliance checks (GDPR, HIPAA, PCI DSS, etc.)';
COMMENT ON TABLE encryption_configuration IS 'Encryption settings and status';
COMMENT ON TABLE data_access_audit IS 'Detailed audit log for sensitive data access';

COMMENT ON FUNCTION get_encryption_status() IS 'Get current encryption configuration and status';
COMMENT ON FUNCTION update_encryption_config(JSONB, UUID) IS 'Update encryption configuration settings';
COMMENT ON FUNCTION log_data_access(UUID, VARCHAR, VARCHAR, VARCHAR, INET, TEXT, VARCHAR) IS 'Log data access for audit trail';
COMMENT ON FUNCTION get_privacy_metrics() IS 'Get privacy and data protection metrics';
COMMENT ON FUNCTION perform_compliance_check(VARCHAR, UUID) IS 'Perform compliance check for specified standard';
COMMENT ON FUNCTION cleanup_data_access_audit(INTEGER) IS 'Clean up old data access audit records';