/*
  # Database Maintenance Functions and Procedures

  1. Performance Monitoring Functions
    - Database health checks and diagnostics
    - Index usage analysis and optimization
    - Query performance monitoring

  2. Automated Maintenance Procedures
    - Index maintenance and optimization
    - Statistics updates and table maintenance
    - Data cleanup and archival procedures

  3. Monitoring and Logging Infrastructure
    - Maintenance operation logging
    - Performance metrics collection
    - Alert and notification systems
*/

-- ============================================================================
-- DATABASE HEALTH CHECK FUNCTIONS
-- ============================================================================

-- Create function to get database connection statistics
CREATE OR REPLACE FUNCTION get_connection_stats()
RETURNS TABLE (
    active_connections integer,
    idle_connections integer,
    total_connections integer,
    max_connections integer,
    connection_usage_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')::integer,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle')::integer,
        (SELECT count(*) FROM pg_stat_activity)::integer,
        (SELECT setting::integer FROM pg_settings WHERE name = 'max_connections'),
        ROUND(
            (SELECT count(*) FROM pg_stat_activity) * 100.0 / 
            (SELECT setting::integer FROM pg_settings WHERE name = 'max_connections'), 2
        );
END;
$;

-- Create function to get index usage statistics
CREATE OR REPLACE FUNCTION get_index_usage_stats()
RETURNS TABLE (
    schemaname text,
    tablename text,
    indexname text,
    idx_scan bigint,
    idx_tup_read bigint,
    idx_tup_fetch bigint,
    index_size text,
    usage_category text,
    index_hit_ratio numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
    RETURN QUERY
    SELECT
        psi.schemaname::text,
        psi.tablename::text,
        psi.indexname::text,
        psi.idx_scan,
        psi.idx_tup_read,
        psi.idx_tup_fetch,
        pg_size_pretty(pg_relation_size(psi.indexrelid))::text,
        CASE 
            WHEN psi.idx_scan = 0 THEN 'Never used'
            WHEN psi.idx_scan < 100 THEN 'Rarely used'
            WHEN psi.idx_scan < 1000 THEN 'Moderately used'
            ELSE 'Frequently used'
        END::text,
        CASE 
            WHEN psi.idx_tup_read + psi.idx_tup_fetch = 0 THEN 0
            ELSE ROUND(psi.idx_tup_fetch * 100.0 / (psi.idx_tup_read + psi.idx_tup_fetch), 2)
        END
    FROM pg_stat_user_indexes psi
    JOIN pg_indexes pi ON psi.schemaname = pi.schemaname 
        AND psi.tablename = pi.tablename 
        AND psi.indexname = pi.indexname
    WHERE psi.schemaname = 'public'
    ORDER BY psi.idx_scan DESC;
END;
$;

-- Create function to get table statistics and bloat information
CREATE OR REPLACE FUNCTION get_table_stats()
RETURNS TABLE (
    schemaname text,
    tablename text,
    n_tup_ins bigint,
    n_tup_upd bigint,
    n_tup_del bigint,
    n_live_tup bigint,
    n_dead_tup bigint,
    table_size text,
    dead_tuple_percent numeric,
    last_vacuum timestamptz,
    last_autovacuum timestamptz,
    last_analyze timestamptz,
    last_autoanalyze timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
    RETURN QUERY
    SELECT
        pst.schemaname::text,
        pst.relname::text,
        pst.n_tup_ins,
        pst.n_tup_upd,
        pst.n_tup_del,
        pst.n_live_tup,
        pst.n_dead_tup,
        pg_size_pretty(pg_total_relation_size(pst.relid))::text,
        CASE 
            WHEN pst.n_live_tup + pst.n_dead_tup = 0 THEN 0
            ELSE ROUND(pst.n_dead_tup * 100.0 / (pst.n_live_tup + pst.n_dead_tup), 2)
        END,
        pst.last_vacuum,
        pst.last_autovacuum,
        pst.last_analyze,
        pst.last_autoanalyze
    FROM pg_stat_user_tables pst
    WHERE pst.schemaname = 'public'
    ORDER BY pg_total_relation_size(pst.relid) DESC;
END;
$;

-- Create function to get slow query information
CREATE OR REPLACE FUNCTION get_slow_queries(
    time_threshold_ms integer DEFAULT 1000,
    limit_count integer DEFAULT 20
)
RETURNS TABLE (
    query_name text,
    avg_execution_time numeric,
    max_execution_time integer,
    min_execution_time integer,
    total_calls bigint,
    last_execution timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
    RETURN QUERY
    SELECT
        qpl.query_name::text,
        ROUND(AVG(qpl.execution_time), 2),
        MAX(qpl.execution_time),
        MIN(qpl.execution_time),
        COUNT(*)::bigint,
        MAX(qpl.timestamp)
    FROM query_performance_log qpl
    WHERE qpl.execution_time >= time_threshold_ms
        AND qpl.timestamp >= NOW() - INTERVAL '7 days'
    GROUP BY qpl.query_name
    ORDER BY AVG(qpl.execution_time) DESC
    LIMIT limit_count;
END;
$;

-- ============================================================================
-- INDEX MAINTENANCE FUNCTIONS
-- ============================================================================

-- Create function to identify unused indexes
CREATE OR REPLACE FUNCTION identify_unused_indexes()
RETURNS TABLE (
    schemaname text,
    tablename text,
    indexname text,
    index_size text,
    recommendation text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $
BEGIN
    RETURN QUERY
    SELECT
        psi.schemaname::text,
        psi.tablename::text,
        psi.indexname::text,
        pg_size_pretty(pg_relation_size(psi.indexrelid))::text,
        CASE 
            WHEN psi.idx_scan = 0 AND pg_relation_size(psi.indexrelid) > 1024*1024 THEN 'Consider dropping - never used and > 1MB'
            WHEN psi.idx_scan < 10 AND pg_relation_size(psi.indexrelid) > 10*1024*1024 THEN 'Review usage - rarely used and > 10MB'
            ELSE 'Monitor usage'
        END::text
    FROM pg_stat_user_indexes psi
    WHERE psi.schemaname = 'public'
        AND psi.idx_scan < 100  -- Low usage threshold
    ORDER BY pg_relation_size(psi.indexrelid) DESC;
END;
$;

-- Create function to reindex tables if needed
CREATE OR REPLACE FUNCTION reindex_if_needed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    table_record RECORD;
    index_record RECORD;
    reindex_count integer := 0;
    start_time timestamptz := NOW();
    duration_ms integer;
    results jsonb := '[]'::jsonb;
BEGIN
    -- Check tables with high dead tuple percentage
    FOR table_record IN
        SELECT schemaname, tablename, dead_tuple_percent
        FROM get_table_stats()
        WHERE dead_tuple_percent > 20  -- 20% dead tuples threshold
    LOOP
        -- Reindex the table
        EXECUTE format('REINDEX TABLE %I.%I', table_record.schemaname, table_record.tablename);
        reindex_count := reindex_count + 1;
        
        -- Add to results
        results := results || jsonb_build_object(
            'table', table_record.tablename,
            'dead_tuple_percent', table_record.dead_tuple_percent,
            'action', 'reindexed'
        );
    END LOOP;
    
    -- Calculate duration
    duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log maintenance operation
    INSERT INTO maintenance_log (operation, status, duration_ms, details)
    VALUES (
        'reindex_if_needed',
        'completed',
        duration_ms,
        jsonb_build_object(
            'tables_reindexed', reindex_count,
            'reindexed_tables', results,
            'threshold_percent', 20
        )
    );
    
    RETURN jsonb_build_object(
        'status', 'completed',
        'tables_reindexed', reindex_count,
        'duration_ms', duration_ms,
        'details', results
    );
END;
$;

-- ============================================================================
-- STATISTICS UPDATE FUNCTIONS
-- ============================================================================

-- Create function to update table statistics
CREATE OR REPLACE FUNCTION update_table_statistics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    table_record RECORD;
    analyze_count integer := 0;
    start_time timestamptz := NOW();
    duration_ms integer;
    results jsonb := '[]'::jsonb;
BEGIN
    -- Analyze tables that haven't been analyzed recently or have significant changes
    FOR table_record IN
        SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del, last_analyze, last_autoanalyze
        FROM get_table_stats()
        WHERE (
            -- No recent analyze
            (last_analyze IS NULL OR last_analyze < NOW() - INTERVAL '1 day')
            AND (last_autoanalyze IS NULL OR last_autoanalyze < NOW() - INTERVAL '1 day')
        ) OR (
            -- Significant changes since last analyze
            n_tup_ins + n_tup_upd + n_tup_del > 1000
        )
    LOOP
        -- Analyze the table
        EXECUTE format('ANALYZE %I.%I', table_record.schemaname, table_record.tablename);
        analyze_count := analyze_count + 1;
        
        -- Add to results
        results := results || jsonb_build_object(
            'table', table_record.tablename,
            'changes', table_record.n_tup_ins + table_record.n_tup_upd + table_record.n_tup_del,
            'action', 'analyzed'
        );
    END LOOP;
    
    -- Calculate duration
    duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log maintenance operation
    INSERT INTO maintenance_log (operation, status, duration_ms, details)
    VALUES (
        'update_table_statistics',
        'completed',
        duration_ms,
        jsonb_build_object(
            'tables_analyzed', analyze_count,
            'analyzed_tables', results
        )
    );
    
    RETURN jsonb_build_object(
        'status', 'completed',
        'tables_analyzed', analyze_count,
        'duration_ms', duration_ms,
        'details', results
    );
END;
$;

-- ============================================================================
-- DATA CLEANUP FUNCTIONS
-- ============================================================================

-- Create function to cleanup old performance logs
CREATE OR REPLACE FUNCTION cleanup_old_performance_logs(
    retention_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    deleted_count integer;
    start_time timestamptz := NOW();
    duration_ms integer;
BEGIN
    -- Delete old query performance logs
    DELETE FROM query_performance_log
    WHERE timestamp < NOW() - (retention_days || ' days')::interval;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Calculate duration
    duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log cleanup operation
    INSERT INTO maintenance_log (operation, status, duration_ms, details)
    VALUES (
        'cleanup_old_performance_logs',
        'completed',
        duration_ms,
        jsonb_build_object(
            'deleted_records', deleted_count,
            'retention_days', retention_days
        )
    );
    
    RETURN jsonb_build_object(
        'status', 'completed',
        'deleted_records', deleted_count,
        'retention_days', retention_days,
        'duration_ms', duration_ms
    );
END;
$;

-- Create function to cleanup old maintenance logs
CREATE OR REPLACE FUNCTION cleanup_old_maintenance_logs(
    retention_days integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    deleted_count integer;
    start_time timestamptz := NOW();
    duration_ms integer;
BEGIN
    -- Delete old maintenance logs (keep recent ones for analysis)
    DELETE FROM maintenance_log
    WHERE completed_at < NOW() - (retention_days || ' days')::interval;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Calculate duration
    duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log cleanup operation (this will be kept as it's recent)
    INSERT INTO maintenance_log (operation, status, duration_ms, details)
    VALUES (
        'cleanup_old_maintenance_logs',
        'completed',
        duration_ms,
        jsonb_build_object(
            'deleted_records', deleted_count,
            'retention_days', retention_days
        )
    );
    
    RETURN jsonb_build_object(
        'status', 'completed',
        'deleted_records', deleted_count,
        'retention_days', retention_days,
        'duration_ms', duration_ms
    );
END;
$;

-- Create function to archive old analysis results
CREATE OR REPLACE FUNCTION archive_old_analysis_results(
    archive_days integer DEFAULT 730  -- 2 years
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    archived_count integer;
    start_time timestamptz := NOW();
    duration_ms integer;
BEGIN
    -- Create archive table if it doesn't exist
    CREATE TABLE IF NOT EXISTS analysis_results_archive (
        LIKE analysis_results INCLUDING ALL
    );
    
    -- Move old records to archive
    WITH archived_data AS (
        DELETE FROM analysis_results
        WHERE created_at < NOW() - (archive_days || ' days')::interval
        RETURNING *
    )
    INSERT INTO analysis_results_archive
    SELECT * FROM archived_data;
    
    GET DIAGNOSTICS archived_count = ROW_COUNT;
    
    -- Calculate duration
    duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log archival operation
    INSERT INTO maintenance_log (operation, status, duration_ms, details)
    VALUES (
        'archive_old_analysis_results',
        'completed',
        duration_ms,
        jsonb_build_object(
            'archived_records', archived_count,
            'archive_days', archive_days
        )
    );
    
    RETURN jsonb_build_object(
        'status', 'completed',
        'archived_records', archived_count,
        'archive_days', archive_days,
        'duration_ms', duration_ms
    );
END;
$;

-- ============================================================================
-- COMPREHENSIVE MAINTENANCE FUNCTION
-- ============================================================================

-- Create main maintenance function that runs all maintenance tasks
CREATE OR REPLACE FUNCTION perform_database_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    start_time timestamptz := NOW();
    total_duration_ms integer;
    maintenance_results jsonb := '{}'::jsonb;
    step_result jsonb;
BEGIN
    -- Log maintenance start
    INSERT INTO maintenance_log (operation, status, details)
    VALUES (
        'perform_database_maintenance',
        'started',
        jsonb_build_object('start_time', start_time)
    );
    
    -- Step 1: Update table statistics
    step_result := update_table_statistics();
    maintenance_results := maintenance_results || jsonb_build_object('statistics_update', step_result);
    
    -- Step 2: Reindex if needed
    step_result := reindex_if_needed();
    maintenance_results := maintenance_results || jsonb_build_object('reindex', step_result);
    
    -- Step 3: Refresh materialized views
    step_result := refresh_all_materialized_views();
    maintenance_results := maintenance_results || jsonb_build_object('materialized_views', step_result);
    
    -- Step 4: Cleanup old performance logs
    step_result := cleanup_old_performance_logs();
    maintenance_results := maintenance_results || jsonb_build_object('performance_logs_cleanup', step_result);
    
    -- Step 5: Cleanup old maintenance logs
    step_result := cleanup_old_maintenance_logs();
    maintenance_results := maintenance_results || jsonb_build_object('maintenance_logs_cleanup', step_result);
    
    -- Calculate total duration
    total_duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log maintenance completion
    UPDATE maintenance_log 
    SET 
        status = 'completed',
        duration_ms = total_duration_ms,
        details = maintenance_results || jsonb_build_object(
            'end_time', NOW(),
            'total_duration_ms', total_duration_ms
        )
    WHERE operation = 'perform_database_maintenance' 
        AND status = 'started' 
        AND completed_at >= start_time;
    
    -- Return comprehensive results
    RETURN jsonb_build_object(
        'status', 'completed',
        'total_duration_ms', total_duration_ms,
        'start_time', start_time,
        'end_time', NOW(),
        'results', maintenance_results
    );
    
EXCEPTION WHEN OTHERS THEN
    -- Log maintenance failure
    UPDATE maintenance_log 
    SET 
        status = 'failed',
        error_message = SQLERRM,
        details = jsonb_build_object(
            'error_time', NOW(),
            'error_message', SQLERRM,
            'partial_results', maintenance_results
        )
    WHERE operation = 'perform_database_maintenance' 
        AND status = 'started' 
        AND completed_at >= start_time;
    
    -- Re-raise the error
    RAISE;
END;
$;

-- ============================================================================
-- MONITORING AND ALERTING FUNCTIONS
-- ============================================================================

-- Create function to check database health and generate alerts
CREATE OR REPLACE FUNCTION check_database_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    health_status text := 'healthy';
    alerts jsonb := '[]'::jsonb;
    metrics jsonb;
    connection_stats RECORD;
    table_stats RECORD;
BEGIN
    -- Get connection statistics
    SELECT * INTO connection_stats FROM get_connection_stats() LIMIT 1;
    
    -- Check connection pool usage
    IF connection_stats.connection_usage_percent > 80 THEN
        health_status := 'warning';
        alerts := alerts || jsonb_build_object(
            'type', 'high_connection_usage',
            'severity', 'warning',
            'message', 'Connection pool usage is above 80%',
            'value', connection_stats.connection_usage_percent
        );
    END IF;
    
    -- Check for tables with high dead tuple percentage
    FOR table_stats IN
        SELECT tablename, dead_tuple_percent
        FROM get_table_stats()
        WHERE dead_tuple_percent > 25
    LOOP
        health_status := 'warning';
        alerts := alerts || jsonb_build_object(
            'type', 'high_dead_tuples',
            'severity', 'warning',
            'message', format('Table %s has %s%% dead tuples', table_stats.tablename, table_stats.dead_tuple_percent),
            'table', table_stats.tablename,
            'value', table_stats.dead_tuple_percent
        );
    END LOOP;
    
    -- Check for slow queries in the last hour
    IF EXISTS (
        SELECT 1 FROM query_performance_log
        WHERE execution_time > 5000  -- 5 seconds
        AND timestamp > NOW() - INTERVAL '1 hour'
    ) THEN
        health_status := 'warning';
        alerts := alerts || jsonb_build_object(
            'type', 'slow_queries_detected',
            'severity', 'warning',
            'message', 'Slow queries detected in the last hour'
        );
    END IF;
    
    -- Compile metrics
    metrics := jsonb_build_object(
        'connection_usage_percent', connection_stats.connection_usage_percent,
        'active_connections', connection_stats.active_connections,
        'total_connections', connection_stats.total_connections,
        'timestamp', NOW()
    );
    
    -- Log health check
    INSERT INTO maintenance_log (operation, status, details)
    VALUES (
        'database_health_check',
        'completed',
        jsonb_build_object(
            'health_status', health_status,
            'alerts_count', jsonb_array_length(alerts),
            'metrics', metrics,
            'alerts', alerts
        )
    );
    
    RETURN jsonb_build_object(
        'status', health_status,
        'alerts', alerts,
        'metrics', metrics,
        'timestamp', NOW()
    );
END;
$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions on all maintenance functions
GRANT EXECUTE ON FUNCTION get_connection_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_index_usage_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_slow_queries(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION identify_unused_indexes() TO authenticated;
GRANT EXECUTE ON FUNCTION reindex_if_needed() TO authenticated;
GRANT EXECUTE ON FUNCTION update_table_statistics() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_performance_logs(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_maintenance_logs(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION archive_old_analysis_results(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION perform_database_maintenance() TO authenticated;
GRANT EXECUTE ON FUNCTION check_database_health() TO authenticated;

-- ============================================================================
-- INITIAL SETUP
-- ============================================================================

-- Perform initial database health check
SELECT check_database_health();

-- Log completion
INSERT INTO maintenance_log (operation, status, details)
VALUES (
    'create_maintenance_functions',
    'completed',
    jsonb_build_object(
        'timestamp', NOW(),
        'functions_created', 12,
        'description', 'Database maintenance functions and procedures created successfully'
    )
);