-- Capacity planning and scaling analysis system

-- Create table to store capacity metrics history
CREATE TABLE IF NOT EXISTS capacity_metrics_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_users INTEGER NOT NULL,
    active_users INTEGER NOT NULL,
    total_analyses BIGINT NOT NULL,
    daily_analyses INTEGER NOT NULL,
    storage_used BIGINT NOT NULL,
    avg_query_time DECIMAL(10,2) NOT NULL,
    peak_concurrent_users INTEGER NOT NULL,
    connection_pool_utilization DECIMAL(5,2) NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_log_timestamp 
ON capacity_metrics_log(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_capacity_metrics_log_date 
ON capacity_metrics_log(DATE(timestamp));

-- Function to get current user statistics
CREATE OR REPLACE FUNCTION get_user_statistics()
RETURNS TABLE (
    total_users INTEGER,
    active_users INTEGER,
    peak_concurrent_users INTEGER,
    new_users_today INTEGER,
    user_growth_rate DECIMAL
) AS $$
DECLARE
    users_last_month INTEGER;
    users_this_month INTEGER;
BEGIN
    -- Get total and active users
    SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN last_active >= NOW() - INTERVAL '30 days' THEN 1 END) as active,
        COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as new_today
    INTO total_users, active_users, new_users_today
    FROM users;
    
    -- Calculate peak concurrent users (approximation based on recent activity)
    SELECT COUNT(DISTINCT user_id) INTO peak_concurrent_users
    FROM analysis_results
    WHERE created_at >= NOW() - INTERVAL '1 hour';
    
    -- Calculate user growth rate
    SELECT COUNT(*) INTO users_last_month
    FROM users
    WHERE created_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
    AND created_at < DATE_TRUNC('month', NOW());
    
    SELECT COUNT(*) INTO users_this_month
    FROM users
    WHERE created_at >= DATE_TRUNC('month', NOW());
    
    IF users_last_month > 0 THEN
        user_growth_rate := (users_this_month::DECIMAL / users_last_month - 1) * 100;
    ELSE
        user_growth_rate := 0;
    END IF;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get analysis statistics
CREATE OR REPLACE FUNCTION get_analysis_statistics()
RETURNS TABLE (
    total_analyses BIGINT,
    daily_analyses INTEGER,
    avg_analyses_per_user DECIMAL,
    analysis_growth_rate DECIMAL
) AS $$
DECLARE
    analyses_last_month BIGINT;
    analyses_this_month BIGINT;
BEGIN
    -- Get total analyses
    SELECT COUNT(*) INTO total_analyses FROM analysis_results;
    
    -- Get daily analyses (today)
    SELECT COUNT(*) INTO daily_analyses
    FROM analysis_results
    WHERE created_at >= CURRENT_DATE;
    
    -- Calculate average analyses per user
    SELECT 
        CASE 
            WHEN COUNT(DISTINCT user_id) > 0 THEN 
                COUNT(*)::DECIMAL / COUNT(DISTINCT user_id)
            ELSE 0
        END
    INTO avg_analyses_per_user
    FROM analysis_results;
    
    -- Calculate analysis growth rate
    SELECT COUNT(*) INTO analyses_last_month
    FROM analysis_results
    WHERE created_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
    AND created_at < DATE_TRUNC('month', NOW());
    
    SELECT COUNT(*) INTO analyses_this_month
    FROM analysis_results
    WHERE created_at >= DATE_TRUNC('month', NOW());
    
    IF analyses_last_month > 0 THEN
        analysis_growth_rate := (analyses_this_month::DECIMAL / analyses_last_month - 1) * 100;
    ELSE
        analysis_growth_rate := 0;
    END IF;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get storage statistics
CREATE OR REPLACE FUNCTION get_storage_statistics()
RETURNS TABLE (
    storage_used BIGINT,
    storage_growth_rate DECIMAL,
    largest_tables TEXT[],
    storage_by_table JSONB
) AS $$
DECLARE
    table_sizes JSONB := '{}';
    table_record RECORD;
    storage_last_week BIGINT;
    storage_this_week BIGINT;
BEGIN
    -- Calculate total storage used
    SELECT 
        SUM(pg_total_relation_size(schemaname||'.'||tablename))
    INTO storage_used
    FROM pg_tables 
    WHERE schemaname = 'public';
    
    -- Get storage by table
    FOR table_record IN
        SELECT 
            tablename,
            pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size_pretty,
            pg_total_relation_size('public.'||tablename) as size_bytes
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size('public.'||tablename) DESC
        LIMIT 10
    LOOP
        table_sizes := table_sizes || jsonb_build_object(
            table_record.tablename, 
            jsonb_build_object(
                'size_pretty', table_record.size_pretty,
                'size_bytes', table_record.size_bytes
            )
        );
    END LOOP;
    
    storage_by_table := table_sizes;
    
    -- Get largest tables array
    SELECT ARRAY(
        SELECT tablename
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size('public.'||tablename) DESC
        LIMIT 5
    ) INTO largest_tables;
    
    -- Calculate storage growth rate (approximate based on analysis results)
    SELECT COUNT(*) INTO storage_last_week
    FROM analysis_results
    WHERE created_at >= NOW() - INTERVAL '2 weeks'
    AND created_at < NOW() - INTERVAL '1 week';
    
    SELECT COUNT(*) INTO storage_this_week
    FROM analysis_results
    WHERE created_at >= NOW() - INTERVAL '1 week';
    
    IF storage_last_week > 0 THEN
        storage_growth_rate := (storage_this_week::DECIMAL / storage_last_week - 1) * 100;
    ELSE
        storage_growth_rate := 0;
    END IF;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get performance statistics
CREATE OR REPLACE FUNCTION get_performance_statistics()
RETURNS TABLE (
    avg_query_time DECIMAL,
    slow_query_count INTEGER,
    query_performance_trend DECIMAL,
    top_slow_queries JSONB
) AS $$
DECLARE
    performance_last_day DECIMAL;
    performance_this_day DECIMAL;
BEGIN
    -- Get average query time from performance log
    SELECT AVG(execution_time) INTO avg_query_time
    FROM query_performance_log
    WHERE timestamp >= NOW() - INTERVAL '24 hours';
    
    -- Count slow queries (>1000ms)
    SELECT COUNT(*) INTO slow_query_count
    FROM query_performance_log
    WHERE timestamp >= NOW() - INTERVAL '24 hours'
    AND execution_time > 1000;
    
    -- Calculate performance trend
    SELECT AVG(execution_time) INTO performance_last_day
    FROM query_performance_log
    WHERE timestamp >= NOW() - INTERVAL '2 days'
    AND timestamp < NOW() - INTERVAL '1 day';
    
    SELECT AVG(execution_time) INTO performance_this_day
    FROM query_performance_log
    WHERE timestamp >= NOW() - INTERVAL '1 day';
    
    IF performance_last_day > 0 AND performance_this_day > 0 THEN
        query_performance_trend := (performance_this_day / performance_last_day - 1) * 100;
    ELSE
        query_performance_trend := 0;
    END IF;
    
    -- Get top slow queries
    SELECT jsonb_agg(
        jsonb_build_object(
            'query_name', query_name,
            'avg_execution_time', avg_execution_time,
            'execution_count', execution_count
        )
    ) INTO top_slow_queries
    FROM (
        SELECT 
            query_name,
            AVG(execution_time) as avg_execution_time,
            COUNT(*) as execution_count
        FROM query_performance_log
        WHERE timestamp >= NOW() - INTERVAL '24 hours'
        GROUP BY query_name
        ORDER BY AVG(execution_time) DESC
        LIMIT 5
    ) slow_queries;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get capacity planning recommendations
CREATE OR REPLACE FUNCTION get_capacity_recommendations()
RETURNS TABLE (
    category TEXT,
    priority TEXT,
    title TEXT,
    description TEXT,
    metrics JSONB
) AS $$
DECLARE
    current_storage BIGINT;
    current_users INTEGER;
    avg_query_time DECIMAL;
    pool_utilization DECIMAL;
BEGIN
    -- Get current metrics
    SELECT storage_used INTO current_storage FROM get_storage_statistics() LIMIT 1;
    SELECT total_users INTO current_users FROM get_user_statistics() LIMIT 1;
    SELECT avg_query_time FROM get_performance_statistics() INTO avg_query_time LIMIT 1;
    SELECT utilization_percent INTO pool_utilization FROM get_connection_pool_stats() LIMIT 1;
    
    -- Storage recommendations
    IF current_storage > 50 * 1024 * 1024 * 1024 THEN -- 50GB
        category := 'storage';
        priority := 'high';
        title := 'Implement Data Archiving';
        description := 'Database size is large. Consider implementing data archiving strategy.';
        metrics := jsonb_build_object('current_storage', current_storage, 'threshold', 50 * 1024 * 1024 * 1024);
        RETURN NEXT;
    END IF;
    
    -- Performance recommendations
    IF avg_query_time > 1000 THEN
        category := 'performance';
        priority := 'critical';
        title := 'Optimize Database Performance';
        description := 'Average query time is too high. Immediate optimization needed.';
        metrics := jsonb_build_object('avg_query_time', avg_query_time, 'threshold', 1000);
        RETURN NEXT;
    ELSIF avg_query_time > 500 THEN
        category := 'performance';
        priority := 'medium';
        title := 'Monitor Query Performance';
        description := 'Query performance is degrading. Consider optimization.';
        metrics := jsonb_build_object('avg_query_time', avg_query_time, 'threshold', 500);
        RETURN NEXT;
    END IF;
    
    -- Connection pool recommendations
    IF pool_utilization > 85 THEN
        category := 'connections';
        priority := 'critical';
        title := 'Increase Connection Pool Size';
        description := 'Connection pool utilization is critically high.';
        metrics := jsonb_build_object('utilization', pool_utilization, 'threshold', 85);
        RETURN NEXT;
    ELSIF pool_utilization > 70 THEN
        category := 'connections';
        priority := 'medium';
        title := 'Monitor Connection Pool';
        description := 'Connection pool utilization is getting high.';
        metrics := jsonb_build_object('utilization', pool_utilization, 'threshold', 70);
        RETURN NEXT;
    END IF;
    
    -- Scaling recommendations based on user count
    IF current_users > 1000 THEN
        category := 'scaling';
        priority := 'medium';
        title := 'Consider Read Replicas';
        description := 'User count is high. Consider implementing read replicas for better performance.';
        metrics := jsonb_build_object('current_users', current_users, 'threshold', 1000);
        RETURN NEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate growth projections
CREATE OR REPLACE FUNCTION calculate_growth_projections(
    months_ahead INTEGER DEFAULT 6
)
RETURNS TABLE (
    timeframe TEXT,
    projected_users INTEGER,
    projected_analyses BIGINT,
    projected_storage BIGINT,
    confidence_level INTEGER
) AS $$
DECLARE
    current_users INTEGER;
    current_analyses BIGINT;
    current_storage BIGINT;
    user_growth_rate DECIMAL;
    analysis_growth_rate DECIMAL;
    storage_growth_rate DECIMAL;
    month_multiplier DECIMAL;
BEGIN
    -- Get current metrics
    SELECT total_users, user_growth_rate INTO current_users, user_growth_rate 
    FROM get_user_statistics() LIMIT 1;
    
    SELECT total_analyses, analysis_growth_rate INTO current_analyses, analysis_growth_rate 
    FROM get_analysis_statistics() LIMIT 1;
    
    SELECT storage_used, storage_growth_rate INTO current_storage, storage_growth_rate 
    FROM get_storage_statistics() LIMIT 1;
    
    -- Convert percentage growth rates to multipliers
    user_growth_rate := COALESCE(user_growth_rate / 100, 0.05); -- Default 5% if null
    analysis_growth_rate := COALESCE(analysis_growth_rate / 100, 0.1); -- Default 10% if null
    storage_growth_rate := COALESCE(storage_growth_rate / 100, 0.1); -- Default 10% if null
    
    -- Generate projections for different timeframes
    FOR i IN 1..months_ahead LOOP
        month_multiplier := POWER(1 + user_growth_rate, i);
        
        CASE i
            WHEN 1 THEN timeframe := '1month';
            WHEN 3 THEN timeframe := '3months';
            WHEN 6 THEN timeframe := '6months';
            WHEN 12 THEN timeframe := '1year';
            ELSE timeframe := i || 'months';
        END CASE;
        
        projected_users := ROUND(current_users * month_multiplier);
        projected_analyses := ROUND(current_analyses * POWER(1 + analysis_growth_rate, i));
        projected_storage := ROUND(current_storage * POWER(1 + storage_growth_rate, i));
        
        -- Calculate confidence level (decreases with time)
        confidence_level := GREATEST(90 - (i * 10), 20);
        
        -- Only return specific timeframes
        IF i IN (1, 3, 6, 12) THEN
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log capacity metrics automatically
CREATE OR REPLACE FUNCTION log_capacity_metrics()
RETURNS void AS $$
DECLARE
    user_stats RECORD;
    analysis_stats RECORD;
    storage_stats RECORD;
    performance_stats RECORD;
    connection_stats RECORD;
BEGIN
    -- Get all current statistics
    SELECT * INTO user_stats FROM get_user_statistics() LIMIT 1;
    SELECT * INTO analysis_stats FROM get_analysis_statistics() LIMIT 1;
    SELECT * INTO storage_stats FROM get_storage_statistics() LIMIT 1;
    SELECT * INTO performance_stats FROM get_performance_statistics() LIMIT 1;
    SELECT * INTO connection_stats FROM get_connection_pool_stats() LIMIT 1;
    
    -- Insert into capacity metrics log
    INSERT INTO capacity_metrics_log (
        total_users,
        active_users,
        total_analyses,
        daily_analyses,
        storage_used,
        avg_query_time,
        peak_concurrent_users,
        connection_pool_utilization
    ) VALUES (
        COALESCE(user_stats.total_users, 0),
        COALESCE(user_stats.active_users, 0),
        COALESCE(analysis_stats.total_analyses, 0),
        COALESCE(analysis_stats.daily_analyses, 0),
        COALESCE(storage_stats.storage_used, 0),
        COALESCE(performance_stats.avg_query_time, 0),
        COALESCE(user_stats.peak_concurrent_users, 0),
        COALESCE(connection_stats.utilization_percent, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old capacity metrics
CREATE OR REPLACE FUNCTION cleanup_capacity_metrics()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Keep only last 90 days of capacity metrics
    DELETE FROM capacity_metrics_log
    WHERE timestamp < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create view for capacity trends
CREATE OR REPLACE VIEW capacity_trends AS
SELECT 
    DATE(timestamp) as date,
    AVG(total_users) as avg_users,
    AVG(total_analyses) as avg_analyses,
    AVG(storage_used) as avg_storage,
    AVG(avg_query_time) as avg_query_time,
    AVG(connection_pool_utilization) as avg_pool_utilization
FROM capacity_metrics_log
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp)
ORDER BY date DESC;

-- Grant permissions
GRANT SELECT ON capacity_metrics_log TO authenticated;
GRANT SELECT ON capacity_trends TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_statistics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_analysis_statistics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_storage_statistics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_performance_statistics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_capacity_recommendations() TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_growth_projections(INTEGER) TO authenticated;

-- Schedule automatic capacity metrics logging (every hour)
SELECT cron.schedule(
    'log-capacity-metrics',
    '0 * * * *',
    'SELECT log_capacity_metrics();'
);

-- Schedule cleanup of old capacity metrics (daily at 4 AM)
SELECT cron.schedule(
    'cleanup-capacity-metrics',
    '0 4 * * *',
    'SELECT cleanup_capacity_metrics();'
);