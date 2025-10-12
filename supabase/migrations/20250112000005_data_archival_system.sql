-- Data archival and cleanup system

-- Function to create archive tables with same structure as source
CREATE OR REPLACE FUNCTION create_archive_table(
    source_table TEXT,
    archive_table TEXT,
    enable_compression BOOLEAN DEFAULT true
)
RETURNS void AS $$
DECLARE
    create_sql TEXT;
BEGIN
    -- Create archive table with same structure as source
    create_sql := format('CREATE TABLE IF NOT EXISTS %I (LIKE %I INCLUDING ALL)', 
                        archive_table, source_table);
    EXECUTE create_sql;
    
    -- Add archived_at timestamp
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()', 
                   archive_table);
    
    -- Create index on archived_at
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_archived_at ON %I(archived_at)', 
                   archive_table, archive_table);
    
    -- Enable compression if requested (PostgreSQL 14+)
    IF enable_compression THEN
        BEGIN
            EXECUTE format('ALTER TABLE %I SET (toast_tuple_target = 128)', archive_table);
        EXCEPTION WHEN OTHERS THEN
            -- Ignore compression errors for older PostgreSQL versions
            NULL;
        END;
    END IF;
    
    -- Log table creation
    INSERT INTO maintenance_log (operation, status, details)
    VALUES ('create_archive_table', 'completed', 
            jsonb_build_object('source_table', source_table, 'archive_table', archive_table));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to archive old analysis results
CREATE OR REPLACE FUNCTION archive_analysis_results(
    retention_days INTEGER DEFAULT 730,
    batch_size INTEGER DEFAULT 1000
)
RETURNS TABLE (
    records_archived INTEGER,
    records_deleted INTEGER,
    batches_processed INTEGER
) AS $$
DECLARE
    cutoff_date TIMESTAMP WITH TIME ZONE;
    batch_count INTEGER := 0;
    total_archived INTEGER := 0;
    total_deleted INTEGER := 0;
    batch_records RECORD;
BEGIN
    -- Calculate cutoff date
    cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
    
    -- Create archive table if it doesn't exist
    PERFORM create_archive_table('analysis_results', 'analysis_results_archive', true);
    
    -- Process in batches
    LOOP
        -- Get batch of records to archive
        WITH batch_data AS (
            SELECT *
            FROM analysis_results
            WHERE created_at < cutoff_date
            LIMIT batch_size
        )
        SELECT COUNT(*) as record_count INTO batch_records
        FROM batch_data;
        
        -- Exit if no more records
        EXIT WHEN batch_records.record_count = 0;
        
        -- Insert into archive table
        WITH archived_batch AS (
            INSERT INTO analysis_results_archive
            SELECT *, NOW() as archived_at
            FROM analysis_results
            WHERE created_at < cutoff_date
            AND id IN (
                SELECT id FROM analysis_results
                WHERE created_at < cutoff_date
                LIMIT batch_size
            )
            RETURNING id
        ),
        -- Delete from source table
        deleted_batch AS (
            DELETE FROM analysis_results
            WHERE id IN (SELECT id FROM archived_batch)
            RETURNING id
        )
        SELECT 
            (SELECT COUNT(*) FROM archived_batch) as archived,
            (SELECT COUNT(*) FROM deleted_batch) as deleted
        INTO batch_records;
        
        total_archived := total_archived + batch_records.archived;
        total_deleted := total_deleted + batch_records.deleted;
        batch_count := batch_count + 1;
        
        -- Add small delay between batches
        PERFORM pg_sleep(0.1);
    END LOOP;
    
    -- Return results
    records_archived := total_archived;
    records_deleted := total_deleted;
    batches_processed := batch_count;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old query performance logs
CREATE OR REPLACE FUNCTION cleanup_query_performance_logs(
    retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
    cutoff_date TIMESTAMP WITH TIME ZONE;
    deleted_count INTEGER;
BEGIN
    cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
    
    DELETE FROM query_performance_log
    WHERE timestamp < cutoff_date;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old maintenance logs
CREATE OR REPLACE FUNCTION cleanup_maintenance_logs(
    retention_days INTEGER DEFAULT 365
)
RETURNS INTEGER AS $$
DECLARE
    cutoff_date TIMESTAMP WITH TIME ZONE;
    deleted_count INTEGER;
BEGIN
    cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
    
    DELETE FROM maintenance_log
    WHERE completed_at < cutoff_date;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get archival statistics
CREATE OR REPLACE FUNCTION get_archival_statistics()
RETURNS TABLE (
    table_name TEXT,
    total_records BIGINT,
    old_records BIGINT,
    archive_records BIGINT,
    estimated_size TEXT,
    last_archival TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    WITH table_stats AS (
        SELECT 
            'analysis_results' as tbl_name,
            (SELECT COUNT(*) FROM analysis_results) as total,
            (SELECT COUNT(*) FROM analysis_results WHERE created_at < NOW() - INTERVAL '730 days') as old,
            (SELECT COUNT(*) FROM analysis_results_archive WHERE archived_at IS NOT NULL) as archived,
            pg_size_pretty(pg_total_relation_size('analysis_results')) as size
        UNION ALL
        SELECT 
            'query_performance_log' as tbl_name,
            (SELECT COUNT(*) FROM query_performance_log) as total,
            (SELECT COUNT(*) FROM query_performance_log WHERE timestamp < NOW() - INTERVAL '90 days') as old,
            0 as archived, -- No archive table for this
            pg_size_pretty(pg_total_relation_size('query_performance_log')) as size
        UNION ALL
        SELECT 
            'maintenance_log' as tbl_name,
            (SELECT COUNT(*) FROM maintenance_log) as total,
            (SELECT COUNT(*) FROM maintenance_log WHERE completed_at < NOW() - INTERVAL '365 days') as old,
            0 as archived,
            pg_size_pretty(pg_total_relation_size('maintenance_log')) as size
    ),
    last_archival_dates AS (
        SELECT 
            (details->>'tableName')::TEXT as tbl_name,
            MAX(completed_at) as last_arch
        FROM maintenance_log
        WHERE operation = 'data_archival'
        GROUP BY details->>'tableName'
    )
    SELECT 
        ts.tbl_name,
        ts.total,
        ts.old,
        ts.archived,
        ts.size,
        lad.last_arch
    FROM table_stats ts
    LEFT JOIN last_archival_dates lad ON ts.tbl_name = lad.tbl_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to perform comprehensive data cleanup
CREATE OR REPLACE FUNCTION perform_data_cleanup()
RETURNS TABLE (
    operation TEXT,
    records_processed INTEGER,
    status TEXT,
    duration_ms INTEGER
) AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    archival_result RECORD;
    cleanup_count INTEGER;
BEGIN
    -- Archive analysis results
    start_time := clock_timestamp();
    SELECT * INTO archival_result FROM archive_analysis_results();
    end_time := clock_timestamp();
    
    operation := 'archive_analysis_results';
    records_processed := archival_result.records_archived;
    status := 'completed';
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    RETURN NEXT;
    
    -- Cleanup query performance logs
    start_time := clock_timestamp();
    SELECT cleanup_query_performance_logs() INTO cleanup_count;
    end_time := clock_timestamp();
    
    operation := 'cleanup_query_performance_logs';
    records_processed := cleanup_count;
    status := 'completed';
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    RETURN NEXT;
    
    -- Cleanup maintenance logs
    start_time := clock_timestamp();
    SELECT cleanup_maintenance_logs() INTO cleanup_count;
    end_time := clock_timestamp();
    
    operation := 'cleanup_maintenance_logs';
    records_processed := cleanup_count;
    status := 'completed';
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    RETURN NEXT;
    
    -- Cleanup connection pool stats
    start_time := clock_timestamp();
    SELECT cleanup_connection_pool_stats() INTO cleanup_count;
    end_time := clock_timestamp();
    
    operation := 'cleanup_connection_pool_stats';
    records_processed := cleanup_count;
    status := 'completed';
    duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to estimate storage savings from archival
CREATE OR REPLACE FUNCTION estimate_archival_savings()
RETURNS TABLE (
    table_name TEXT,
    records_to_archive BIGINT,
    current_size TEXT,
    estimated_savings TEXT,
    savings_percent DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH archival_candidates AS (
        SELECT 
            'analysis_results' as tbl_name,
            COUNT(*) as candidates,
            pg_total_relation_size('analysis_results') as current_bytes
        FROM analysis_results
        WHERE created_at < NOW() - INTERVAL '730 days'
        
        UNION ALL
        
        SELECT 
            'query_performance_log' as tbl_name,
            COUNT(*) as candidates,
            pg_total_relation_size('query_performance_log') as current_bytes
        FROM query_performance_log
        WHERE timestamp < NOW() - INTERVAL '90 days'
    ),
    total_counts AS (
        SELECT 
            'analysis_results' as tbl_name,
            COUNT(*) as total_records
        FROM analysis_results
        
        UNION ALL
        
        SELECT 
            'query_performance_log' as tbl_name,
            COUNT(*) as total_records
        FROM query_performance_log
    )
    SELECT 
        ac.tbl_name,
        ac.candidates,
        pg_size_pretty(ac.current_bytes),
        pg_size_pretty(
            CASE 
                WHEN tc.total_records > 0 THEN 
                    (ac.current_bytes * ac.candidates / tc.total_records)::BIGINT
                ELSE 0
            END
        ),
        CASE 
            WHEN tc.total_records > 0 THEN 
                ROUND((ac.candidates::DECIMAL / tc.total_records) * 100, 2)
            ELSE 0
        END
    FROM archival_candidates ac
    JOIN total_counts tc ON ac.tbl_name = tc.tbl_name
    WHERE ac.candidates > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create data retention policy table
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(255) NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL,
    archive_enabled BOOLEAN DEFAULT true,
    compression_enabled BOOLEAN DEFAULT true,
    batch_size INTEGER DEFAULT 1000,
    last_run TIMESTAMP WITH TIME ZONE,
    next_run TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default retention policies
INSERT INTO data_retention_policies (table_name, retention_days, archive_enabled, compression_enabled)
VALUES 
    ('analysis_results', 730, true, true),
    ('query_performance_log', 90, false, false),
    ('maintenance_log', 365, false, false),
    ('connection_pool_stats', 30, false, false)
ON CONFLICT (table_name) DO NOTHING;

-- Create indexes for retention policies
CREATE INDEX IF NOT EXISTS idx_data_retention_policies_table_name 
ON data_retention_policies(table_name);

CREATE INDEX IF NOT EXISTS idx_data_retention_policies_next_run 
ON data_retention_policies(next_run) WHERE is_active = true;

-- Grant permissions
GRANT SELECT ON data_retention_policies TO authenticated;
GRANT EXECUTE ON FUNCTION create_archive_table(TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION archive_analysis_results(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_query_performance_logs(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_maintenance_logs(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_archival_statistics() TO authenticated;
GRANT EXECUTE ON FUNCTION perform_data_cleanup() TO authenticated;
GRANT EXECUTE ON FUNCTION estimate_archival_savings() TO authenticated;

-- Schedule automatic data cleanup (daily at 3 AM)
SELECT cron.schedule(
    'daily-data-cleanup',
    '0 3 * * *',
    'SELECT perform_data_cleanup();'
);

-- Schedule weekly archival statistics update
SELECT cron.schedule(
    'weekly-archival-stats',
    '0 4 * * 0',
    'INSERT INTO maintenance_log (operation, status, details) 
     SELECT ''archival_statistics'', ''completed'', 
            jsonb_build_object(''stats'', array_agg(row_to_json(t)))
     FROM get_archival_statistics() t;'
);