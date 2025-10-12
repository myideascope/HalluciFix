-- Migration: Query Optimization Functions and Performance Monitoring
-- Created: 2025-01-12
-- Description: Add database functions and tables for query optimization and performance monitoring

-- Create query performance logging table
CREATE TABLE IF NOT EXISTS query_performance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_name VARCHAR(255) NOT NULL,
    execution_time INTEGER NOT NULL,
    rows_returned INTEGER,
    user_id UUID,
    endpoint VARCHAR(255),
    query_hash VARCHAR(32),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Add constraints
    CONSTRAINT chk_execution_time CHECK (execution_time >= 0),
    CONSTRAINT chk_rows_returned CHECK (rows_returned >= 0)
);

-- Create indexes for query performance log
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_log_timestamp 
ON query_performance_log(timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_log_query_name 
ON query_performance_log(query_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_log_execution_time 
ON query_performance_log(execution_time DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_log_user_id 
ON query_performance_log(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_log_query_hash 
ON query_performance_log(query_hash) WHERE query_hash IS NOT NULL;

-- Create composite index for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_log_name_time 
ON query_performance_log(query_name, timestamp DESC);

-- Function to get aggregated data for any table
CREATE OR REPLACE FUNCTION get_aggregated_data(
    table_name TEXT,
    aggregations JSONB,
    where_conditions JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB := '{}'::JSONB;
    where_clause TEXT := '';
    query_text TEXT;
    rec RECORD;
BEGIN
    -- Validate table name to prevent SQL injection
    IF table_name NOT IN ('analysis_results', 'users', 'scheduled_scans', 'reviews') THEN
        RAISE EXCEPTION 'Invalid table name: %', table_name;
    END IF;
    
    -- Build WHERE clause from conditions
    IF jsonb_typeof(where_conditions) = 'object' AND where_conditions != '{}'::JSONB THEN
        where_clause := ' WHERE ';
        -- This is a simplified version - in production, you'd want more robust condition building
        FOR rec IN SELECT key, value FROM jsonb_each_text(where_conditions) LOOP
            IF where_clause != ' WHERE ' THEN
                where_clause := where_clause || ' AND ';
            END IF;
            where_clause := where_clause || format('%I = %L', rec.key, rec.value);
        END LOOP;
    END IF;
    
    -- Build and execute aggregation query
    query_text := format('SELECT ');
    
    -- Add COUNT if requested
    IF (aggregations->>'count')::BOOLEAN IS TRUE THEN
        query_text := query_text || 'COUNT(*) as count, ';
    END IF;
    
    -- Add SUM aggregations
    IF aggregations ? 'sum' THEN
        FOR rec IN SELECT jsonb_array_elements_text(aggregations->'sum') as col LOOP
            query_text := query_text || format('SUM(%I) as sum_%s, ', rec.col, rec.col);
        END LOOP;
    END IF;
    
    -- Add AVG aggregations
    IF aggregations ? 'avg' THEN
        FOR rec IN SELECT jsonb_array_elements_text(aggregations->'avg') as col LOOP
            query_text := query_text || format('AVG(%I) as avg_%s, ', rec.col, rec.col);
        END LOOP;
    END IF;
    
    -- Add MIN aggregations
    IF aggregations ? 'min' THEN
        FOR rec IN SELECT jsonb_array_elements_text(aggregations->'min') as col LOOP
            query_text := query_text || format('MIN(%I) as min_%s, ', rec.col, rec.col);
        END LOOP;
    END IF;
    
    -- Add MAX aggregations
    IF aggregations ? 'max' THEN
        FOR rec IN SELECT jsonb_array_elements_text(aggregations->'max') as col LOOP
            query_text := query_text || format('MAX(%I) as max_%s, ', rec.col, rec.col);
        END LOOP;
    END IF;
    
    -- Remove trailing comma and space
    query_text := rtrim(query_text, ', ');
    
    -- Add FROM clause and WHERE clause
    query_text := query_text || format(' FROM %I', table_name) || where_clause;
    
    -- Execute the query and return result as JSONB
    EXECUTE query_text INTO rec;
    
    -- Convert record to JSONB
    SELECT to_jsonb(rec) INTO result;
    
    RETURN result;
END;
$$;

-- Function to get user analytics summary (optimized for dashboard)
CREATE OR REPLACE FUNCTION get_user_analytics(
    p_user_id UUID,
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    WITH analytics_data AS (
        SELECT 
            COUNT(*) as total_analyses,
            AVG(accuracy) as average_accuracy,
            COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk_count,
            COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk_count,
            COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_count,
            COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk_count,
            AVG(processing_time) as avg_processing_time,
            MAX(created_at) as last_analysis_date,
            MIN(created_at) as first_analysis_date
        FROM analysis_results
        WHERE user_id = p_user_id
        AND created_at BETWEEN p_start_date AND p_end_date
    ),
    daily_trends AS (
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as count,
            AVG(accuracy) as avg_accuracy
        FROM analysis_results
        WHERE user_id = p_user_id
        AND created_at BETWEEN p_start_date AND p_end_date
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
    ),
    risk_distribution AS (
        SELECT 
            jsonb_object_agg(
                risk_level, 
                count
            ) as distribution
        FROM (
            SELECT 
                risk_level,
                COUNT(*) as count
            FROM analysis_results
            WHERE user_id = p_user_id
            AND created_at BETWEEN p_start_date AND p_end_date
            GROUP BY risk_level
        ) risk_counts
    )
    SELECT jsonb_build_object(
        'totalAnalyses', COALESCE(ad.total_analyses, 0),
        'averageAccuracy', COALESCE(ROUND(ad.average_accuracy::numeric, 2), 0),
        'riskDistribution', COALESCE(rd.distribution, '{}'::jsonb),
        'dailyTrends', COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'date', dt.date,
                    'count', dt.count,
                    'avgAccuracy', ROUND(dt.avg_accuracy::numeric, 2)
                )
            ) FROM daily_trends dt), 
            '[]'::jsonb
        ),
        'avgProcessingTime', COALESCE(ROUND(ad.avg_processing_time::numeric, 0), 0),
        'lastAnalysisDate', ad.last_analysis_date,
        'firstAnalysisDate', ad.first_analysis_date
    ) INTO result
    FROM analytics_data ad
    CROSS JOIN risk_distribution rd;
    
    RETURN result;
END;
$$;

-- Function to get database performance statistics
CREATE OR REPLACE FUNCTION get_database_performance_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    WITH performance_stats AS (
        SELECT 
            COUNT(*) as total_queries,
            AVG(execution_time) as avg_execution_time,
            MAX(execution_time) as max_execution_time,
            MIN(execution_time) as min_execution_time,
            COUNT(CASE WHEN execution_time > 1000 THEN 1 END) as slow_queries,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time) as p95_execution_time,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time) as p99_execution_time
        FROM query_performance_log
        WHERE timestamp > NOW() - INTERVAL '24 hours'
    ),
    query_frequency AS (
        SELECT 
            jsonb_object_agg(
                query_name,
                count
            ) as frequency
        FROM (
            SELECT 
                query_name,
                COUNT(*) as count
            FROM query_performance_log
            WHERE timestamp > NOW() - INTERVAL '24 hours'
            GROUP BY query_name
            ORDER BY count DESC
            LIMIT 10
        ) top_queries
    ),
    slowest_queries AS (
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'queryName', query_name,
                    'executionTime', execution_time,
                    'timestamp', timestamp
                )
            ) as queries
        FROM (
            SELECT query_name, execution_time, timestamp
            FROM query_performance_log
            WHERE timestamp > NOW() - INTERVAL '24 hours'
            ORDER BY execution_time DESC
            LIMIT 5
        ) slow_queries
    )
    SELECT jsonb_build_object(
        'totalQueries', COALESCE(ps.total_queries, 0),
        'avgExecutionTime', COALESCE(ROUND(ps.avg_execution_time::numeric, 2), 0),
        'maxExecutionTime', COALESCE(ps.max_execution_time, 0),
        'minExecutionTime', COALESCE(ps.min_execution_time, 0),
        'slowQueries', COALESCE(ps.slow_queries, 0),
        'p95ExecutionTime', COALESCE(ROUND(ps.p95_execution_time::numeric, 2), 0),
        'p99ExecutionTime', COALESCE(ROUND(ps.p99_execution_time::numeric, 2), 0),
        'queryFrequency', COALESCE(qf.frequency, '{}'::jsonb),
        'slowestQueries', COALESCE(sq.queries, '[]'::jsonb)
    ) INTO result
    FROM performance_stats ps
    CROSS JOIN query_frequency qf
    CROSS JOIN slowest_queries sq;
    
    RETURN result;
END;
$$;

-- Function to clean up old performance logs
CREATE OR REPLACE FUNCTION cleanup_performance_logs(
    retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM query_performance_log
    WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- Create a scheduled job to clean up old performance logs (requires pg_cron extension)
-- This will run daily at 2 AM to clean up logs older than 30 days
-- SELECT cron.schedule('cleanup-performance-logs', '0 2 * * *', 'SELECT cleanup_performance_logs(30);');

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_aggregated_data(TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_analytics(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_database_performance_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_performance_logs(INTEGER) TO authenticated;

-- Grant table permissions
GRANT SELECT, INSERT ON query_performance_log TO authenticated;

-- Add RLS policies for query_performance_log
ALTER TABLE query_performance_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own query logs
CREATE POLICY "Users can view own query logs" ON query_performance_log
    FOR SELECT USING (
        user_id = auth.uid() OR 
        auth.jwt() ->> 'role' = 'admin'
    );

-- Policy: Authenticated users can insert query logs
CREATE POLICY "Authenticated users can insert query logs" ON query_performance_log
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Add comment for documentation
COMMENT ON TABLE query_performance_log IS 'Stores query performance metrics for monitoring and optimization';
COMMENT ON FUNCTION get_aggregated_data IS 'Generic function to get aggregated data from specified tables with security checks';
COMMENT ON FUNCTION get_user_analytics IS 'Optimized function to get user analytics data for dashboard display';
COMMENT ON FUNCTION get_database_performance_stats IS 'Function to get database performance statistics for monitoring';
COMMENT ON FUNCTION cleanup_performance_logs IS 'Function to clean up old performance logs based on retention policy';