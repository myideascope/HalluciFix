-- Database Optimization Scripts for HalluciFix
-- Phase 1: Immediate Optimizations (High Impact, Low Risk)

-- =============================================================================
-- MISSING INDEXES - Critical Performance Improvements
-- =============================================================================

-- 1. Risk level filtering (used in dashboard and analytics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_risk_level 
ON analysis_results(risk_level);

-- 2. Accuracy sorting and filtering (analytics queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_accuracy 
ON analysis_results(accuracy DESC);

-- 3. Composite index for user analytics with risk filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_user_risk_date 
ON analysis_results(user_id, risk_level, created_at DESC);

-- 4. User accuracy analytics (user + accuracy + date)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_user_accuracy_date 
ON analysis_results(user_id, accuracy DESC, created_at DESC);

-- 5. User status filtering (user management)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_status 
ON users(status);

-- 6. User activity tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_active 
ON users(last_active DESC);

-- 7. Scheduled scan status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_scans_status 
ON scheduled_scans(status);

-- 8. Analysis results content hash for deduplication
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_content_hash 
ON analysis_results(content_hash) WHERE content_hash IS NOT NULL;

-- =============================================================================
-- FULL-TEXT SEARCH OPTIMIZATION
-- =============================================================================

-- 9. Add full-text search capability for content analysis
DO $
BEGIN
  -- Add tsvector column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analysis_results' AND column_name = 'content_search'
  ) THEN
    ALTER TABLE analysis_results 
    ADD COLUMN content_search tsvector 
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
  END IF;
END $;

-- Create GIN index for full-text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_content_search 
ON analysis_results USING GIN(content_search);

-- =============================================================================
-- JSONB OPTIMIZATION
-- =============================================================================

-- 10. JSONB index for hallucinations data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_hallucinations 
ON analysis_results USING GIN(hallucinations);

-- 11. JSONB index for scheduled scan sources
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_scans_sources 
ON scheduled_scans USING GIN(sources);

-- 12. JSONB index for Google Drive files
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_scans_google_drive_files 
ON scheduled_scans USING GIN(google_drive_files);

-- =============================================================================
-- PARTIAL INDEXES FOR ACTIVE DATA
-- =============================================================================

-- 13. Partial index for recent analysis results (last 30 days)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_recent 
ON analysis_results(user_id, created_at DESC) 
WHERE created_at > NOW() - INTERVAL '30 days';

-- 14. Partial index for enabled scheduled scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_scans_enabled_active 
ON scheduled_scans(user_id, next_run) 
WHERE enabled = true AND status = 'active';

-- 15. Partial index for high-risk analysis results
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_high_risk 
ON analysis_results(user_id, created_at DESC) 
WHERE risk_level IN ('high', 'critical');

-- =============================================================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- =============================================================================

-- 16. User analytics summary materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS user_analytics_summary AS
SELECT 
    user_id,
    COUNT(*) as total_analyses,
    AVG(accuracy) as avg_accuracy,
    STDDEV(accuracy) as accuracy_stddev,
    MIN(accuracy) as min_accuracy,
    MAX(accuracy) as max_accuracy,
    COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk_count,
    COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk_count,
    COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_count,
    COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk_count,
    COUNT(CASE WHEN analysis_type = 'single' THEN 1 END) as single_analyses,
    COUNT(CASE WHEN analysis_type = 'batch' THEN 1 END) as batch_analyses,
    COUNT(CASE WHEN analysis_type = 'scheduled' THEN 1 END) as scheduled_analyses,
    AVG(processing_time) as avg_processing_time,
    SUM(verification_sources) as total_verification_sources,
    MAX(created_at) as last_analysis_date,
    MIN(created_at) as first_analysis_date,
    COUNT(DISTINCT DATE(created_at)) as active_days
FROM analysis_results
GROUP BY user_id;

-- Create unique index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_analytics_summary_user_id 
ON user_analytics_summary(user_id);

-- 17. Daily analytics materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_analytics AS
SELECT 
    DATE(created_at) as analysis_date,
    COUNT(*) as total_analyses,
    COUNT(DISTINCT user_id) as active_users,
    AVG(accuracy) as avg_accuracy,
    COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk_count,
    COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk_count,
    COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_count,
    COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk_count,
    AVG(processing_time) as avg_processing_time,
    COUNT(CASE WHEN analysis_type = 'single' THEN 1 END) as single_analyses,
    COUNT(CASE WHEN analysis_type = 'batch' THEN 1 END) as batch_analyses,
    COUNT(CASE WHEN analysis_type = 'scheduled' THEN 1 END) as scheduled_analyses
FROM analysis_results
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY analysis_date DESC;

-- Create unique index on daily analytics
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_analytics_date 
ON daily_analytics(analysis_date);

-- =============================================================================
-- PERFORMANCE MONITORING TABLES
-- =============================================================================

-- 18. Query performance log table
CREATE TABLE IF NOT EXISTS query_performance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_name VARCHAR(255) NOT NULL,
    execution_time INTEGER NOT NULL,
    rows_returned INTEGER,
    user_id UUID REFERENCES users(id),
    endpoint VARCHAR(255),
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for query performance log
CREATE INDEX IF NOT EXISTS idx_query_performance_log_timestamp 
ON query_performance_log(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_query_performance_log_query_name 
ON query_performance_log(query_name);

CREATE INDEX IF NOT EXISTS idx_query_performance_log_execution_time 
ON query_performance_log(execution_time DESC);

CREATE INDEX IF NOT EXISTS idx_query_performance_log_user_id 
ON query_performance_log(user_id) WHERE user_id IS NOT NULL;

-- 19. Database maintenance log table
CREATE TABLE IF NOT EXISTS maintenance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    details JSONB DEFAULT '{}',
    error_message TEXT
);

-- Indexes for maintenance log
CREATE INDEX IF NOT EXISTS idx_maintenance_log_completed_at 
ON maintenance_log(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_log_operation 
ON maintenance_log(operation);

CREATE INDEX IF NOT EXISTS idx_maintenance_log_status 
ON maintenance_log(status);

-- =============================================================================
-- UTILITY FUNCTIONS FOR PERFORMANCE MONITORING
-- =============================================================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $
BEGIN
    -- Refresh user analytics summary
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_analytics_summary;
    
    -- Refresh daily analytics
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_analytics;
    
    -- Log refresh completion
    INSERT INTO maintenance_log (operation, status, completed_at, duration_ms)
    VALUES ('refresh_materialized_views', 'completed', NOW(), 
            extract(epoch from (NOW() - (SELECT started_at FROM maintenance_log 
                                       WHERE operation = 'refresh_materialized_views' 
                                       AND status = 'started' 
                                       ORDER BY started_at DESC LIMIT 1))) * 1000);
END;
$ LANGUAGE plpgsql;

-- Function to get table statistics
CREATE OR REPLACE FUNCTION get_table_stats()
RETURNS TABLE (
    table_name text,
    row_count bigint,
    size_bytes bigint,
    size_formatted text
) AS $
BEGIN
    RETURN QUERY
    SELECT 
        t.schemaname||'.'||t.tablename as table_name,
        t.n_tup_ins - t.n_tup_del as row_count,
        pg_total_relation_size(t.schemaname||'.'||t.tablename) as size_bytes,
        pg_size_pretty(pg_total_relation_size(t.schemaname||'.'||t.tablename)) as size_formatted
    FROM pg_stat_user_tables t
    WHERE t.schemaname = 'public'
    ORDER BY pg_total_relation_size(t.schemaname||'.'||t.tablename) DESC;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get index usage statistics
CREATE OR REPLACE FUNCTION get_index_usage_stats()
RETURNS TABLE (
    schemaname text,
    tablename text,
    indexname text,
    idx_scan bigint,
    idx_tup_read bigint,
    idx_tup_fetch bigint,
    index_size text,
    usage_category text
) AS $
BEGIN
    RETURN QUERY
    SELECT
        s.schemaname::text,
        s.tablename::text,
        s.indexrelname::text as indexname,
        s.idx_scan,
        s.idx_tup_read,
        s.idx_tup_fetch,
        pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
        CASE 
            WHEN s.idx_scan = 0 THEN 'Never used'
            WHEN s.idx_scan < 100 THEN 'Rarely used'
            WHEN s.idx_scan < 1000 THEN 'Moderately used'
            ELSE 'Frequently used'
        END as usage_category
    FROM pg_stat_user_indexes s
    ORDER BY s.idx_scan DESC;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to analyze query performance
CREATE OR REPLACE FUNCTION analyze_query_performance(
    hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
    query_name text,
    total_calls bigint,
    avg_execution_time numeric,
    max_execution_time integer,
    min_execution_time integer,
    success_rate numeric,
    total_rows_returned bigint
) AS $
BEGIN
    RETURN QUERY
    SELECT
        qpl.query_name::text,
        COUNT(*)::bigint as total_calls,
        ROUND(AVG(qpl.execution_time), 2) as avg_execution_time,
        MAX(qpl.execution_time) as max_execution_time,
        MIN(qpl.execution_time) as min_execution_time,
        ROUND((COUNT(CASE WHEN qpl.success THEN 1 END)::numeric / COUNT(*)) * 100, 2) as success_rate,
        COALESCE(SUM(qpl.rows_returned), 0)::bigint as total_rows_returned
    FROM query_performance_log qpl
    WHERE qpl.timestamp >= NOW() - (hours_back || ' hours')::interval
    GROUP BY qpl.query_name
    ORDER BY avg_execution_time DESC;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- AUTOMATED MAINTENANCE PROCEDURES
-- =============================================================================

-- Function to perform routine database maintenance
CREATE OR REPLACE FUNCTION perform_database_maintenance()
RETURNS jsonb AS $
DECLARE
    start_time timestamp := NOW();
    maintenance_id uuid := gen_random_uuid();
    result jsonb;
BEGIN
    -- Log maintenance start
    INSERT INTO maintenance_log (id, operation, status, started_at)
    VALUES (maintenance_id, 'routine_maintenance', 'started', start_time);
    
    -- Update table statistics
    ANALYZE;
    
    -- Refresh materialized views
    PERFORM refresh_materialized_views();
    
    -- Clean up old query performance logs (keep last 30 days)
    DELETE FROM query_performance_log 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    -- Clean up old maintenance logs (keep last 90 days)
    DELETE FROM maintenance_log 
    WHERE completed_at < NOW() - INTERVAL '90 days';
    
    -- Update maintenance log with completion
    UPDATE maintenance_log SET
        status = 'completed',
        completed_at = NOW(),
        duration_ms = extract(epoch from (NOW() - start_time)) * 1000,
        details = jsonb_build_object(
            'operations_completed', ARRAY[
                'analyze_tables',
                'refresh_materialized_views',
                'cleanup_old_logs'
            ]
        )
    WHERE id = maintenance_id;
    
    -- Return summary
    result := jsonb_build_object(
        'maintenance_id', maintenance_id,
        'duration_ms', extract(epoch from (NOW() - start_time)) * 1000,
        'operations_completed', 3,
        'status', 'completed',
        'timestamp', NOW()
    );
    
    RETURN result;
    
EXCEPTION WHEN OTHERS THEN
    -- Log error
    UPDATE maintenance_log SET
        status = 'failed',
        completed_at = NOW(),
        duration_ms = extract(epoch from (NOW() - start_time)) * 1000,
        error_message = SQLERRM
    WHERE id = maintenance_id;
    
    -- Re-raise error
    RAISE;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant execute permissions on utility functions
GRANT EXECUTE ON FUNCTION refresh_materialized_views() TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_index_usage_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION analyze_query_performance(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION perform_database_maintenance() TO authenticated;

-- Grant access to performance monitoring tables
GRANT SELECT ON query_performance_log TO authenticated;
GRANT INSERT ON query_performance_log TO authenticated;
GRANT SELECT ON maintenance_log TO authenticated;

-- Grant access to materialized views
GRANT SELECT ON user_analytics_summary TO authenticated;
GRANT SELECT ON daily_analytics TO authenticated;

-- =============================================================================
-- INITIAL DATA POPULATION
-- =============================================================================

-- Refresh materialized views with current data
SELECT refresh_materialized_views();

-- Perform initial maintenance
SELECT perform_database_maintenance();

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check index creation status
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check materialized view status
SELECT 
    schemaname,
    matviewname,
    ispopulated,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as size
FROM pg_matviews 
WHERE schemaname = 'public';

-- Check table sizes after optimization
SELECT * FROM get_table_stats();

-- Check index usage
SELECT * FROM get_index_usage_stats() 
WHERE usage_category != 'Never used'
ORDER BY idx_scan DESC;

COMMIT;