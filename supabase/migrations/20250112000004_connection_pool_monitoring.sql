-- Connection pool monitoring functions and tables

-- Create table to store connection pool statistics
CREATE TABLE IF NOT EXISTS connection_pool_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_connections INTEGER NOT NULL,
    active_connections INTEGER NOT NULL,
    idle_connections INTEGER NOT NULL,
    waiting_clients INTEGER DEFAULT 0,
    pool_size INTEGER NOT NULL,
    max_pool_size INTEGER NOT NULL,
    min_pool_size INTEGER NOT NULL,
    utilization_percent DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE 
            WHEN max_pool_size > 0 THEN (active_connections::DECIMAL / max_pool_size) * 100
            ELSE 0
        END
    ) STORED
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_connection_pool_stats_timestamp 
ON connection_pool_stats(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_connection_pool_stats_utilization 
ON connection_pool_stats(utilization_percent DESC);

-- Function to get current connection pool statistics
CREATE OR REPLACE FUNCTION get_connection_pool_stats()
RETURNS TABLE (
    total_connections INTEGER,
    active_connections INTEGER,
    idle_connections INTEGER,
    waiting_clients INTEGER,
    pool_size INTEGER,
    max_pool_size INTEGER,
    min_pool_size INTEGER,
    utilization_percent DECIMAL
) AS $$
BEGIN
    -- Get current connection statistics from pg_stat_activity
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_connections,
        COUNT(CASE WHEN state = 'active' THEN 1 END)::INTEGER as active_connections,
        COUNT(CASE WHEN state = 'idle' THEN 1 END)::INTEGER as idle_connections,
        0::INTEGER as waiting_clients, -- This would need to be tracked at application level
        COUNT(*)::INTEGER as pool_size,
        100::INTEGER as max_pool_size, -- Default max, should be configurable
        2::INTEGER as min_pool_size,   -- Default min, should be configurable
        CASE 
            WHEN COUNT(*) > 0 THEN 
                (COUNT(CASE WHEN state = 'active' THEN 1 END)::DECIMAL / COUNT(*)) * 100
            ELSE 0::DECIMAL
        END as utilization_percent
    FROM pg_stat_activity 
    WHERE datname = current_database()
    AND pid != pg_backend_pid(); -- Exclude current connection
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log connection pool statistics
CREATE OR REPLACE FUNCTION log_connection_pool_stats()
RETURNS void AS $$
DECLARE
    stats_record RECORD;
BEGIN
    -- Get current stats
    SELECT * INTO stats_record FROM get_connection_pool_stats() LIMIT 1;
    
    -- Insert into log table
    INSERT INTO connection_pool_stats (
        total_connections,
        active_connections,
        idle_connections,
        waiting_clients,
        pool_size,
        max_pool_size,
        min_pool_size
    ) VALUES (
        stats_record.total_connections,
        stats_record.active_connections,
        stats_record.idle_connections,
        stats_record.waiting_clients,
        stats_record.pool_size,
        stats_record.max_pool_size,
        stats_record.min_pool_size
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get connection pool health status
CREATE OR REPLACE FUNCTION get_connection_pool_health()
RETURNS TABLE (
    status TEXT,
    utilization_percent DECIMAL,
    active_connections INTEGER,
    total_connections INTEGER,
    recommendations TEXT[]
) AS $$
DECLARE
    current_stats RECORD;
    health_status TEXT;
    recommendations TEXT[] := '{}';
BEGIN
    -- Get current statistics
    SELECT * INTO current_stats FROM get_connection_pool_stats() LIMIT 1;
    
    -- Determine health status
    IF current_stats.utilization_percent > 90 THEN
        health_status := 'critical';
        recommendations := array_append(recommendations, 'Connection pool utilization is critical (>90%)');
        recommendations := array_append(recommendations, 'Consider increasing max pool size');
    ELSIF current_stats.utilization_percent > 75 THEN
        health_status := 'warning';
        recommendations := array_append(recommendations, 'Connection pool utilization is high (>75%)');
        recommendations := array_append(recommendations, 'Monitor for potential bottlenecks');
    ELSE
        health_status := 'healthy';
        recommendations := array_append(recommendations, 'Connection pool is operating normally');
    END IF;
    
    -- Check for idle connections
    IF current_stats.idle_connections > (current_stats.total_connections * 0.5) THEN
        recommendations := array_append(recommendations, 'High number of idle connections detected');
        recommendations := array_append(recommendations, 'Consider reducing max pool size');
    END IF;
    
    RETURN QUERY
    SELECT 
        health_status,
        current_stats.utilization_percent,
        current_stats.active_connections,
        current_stats.total_connections,
        recommendations;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get connection pool trends
CREATE OR REPLACE FUNCTION get_connection_pool_trends(
    hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
    hour_bucket TIMESTAMP WITH TIME ZONE,
    avg_utilization DECIMAL,
    max_utilization DECIMAL,
    avg_active_connections DECIMAL,
    max_active_connections INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        date_trunc('hour', timestamp) as hour_bucket,
        AVG(utilization_percent) as avg_utilization,
        MAX(utilization_percent) as max_utilization,
        AVG(active_connections) as avg_active_connections,
        MAX(active_connections) as max_active_connections
    FROM connection_pool_stats
    WHERE timestamp >= NOW() - (hours_back || ' hours')::INTERVAL
    GROUP BY date_trunc('hour', timestamp)
    ORDER BY hour_bucket DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old connection pool statistics
CREATE OR REPLACE FUNCTION cleanup_connection_pool_stats()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete statistics older than 30 days
    DELETE FROM connection_pool_stats
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for easy access to recent connection pool metrics
CREATE OR REPLACE VIEW recent_connection_pool_metrics AS
SELECT 
    timestamp,
    total_connections,
    active_connections,
    idle_connections,
    utilization_percent,
    CASE 
        WHEN utilization_percent > 90 THEN 'critical'
        WHEN utilization_percent > 75 THEN 'warning'
        ELSE 'healthy'
    END as health_status
FROM connection_pool_stats
WHERE timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- Grant necessary permissions
GRANT SELECT ON connection_pool_stats TO authenticated;
GRANT SELECT ON recent_connection_pool_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION get_connection_pool_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_connection_pool_health() TO authenticated;
GRANT EXECUTE ON FUNCTION get_connection_pool_trends(INTEGER) TO authenticated;

-- Schedule automatic logging of connection pool stats (every 5 minutes)
-- Note: This requires pg_cron extension to be enabled
SELECT cron.schedule(
    'log-connection-pool-stats',
    '*/5 * * * *',
    'SELECT log_connection_pool_stats();'
);

-- Schedule cleanup of old statistics (daily at 2 AM)
SELECT cron.schedule(
    'cleanup-connection-pool-stats',
    '0 2 * * *',
    'SELECT cleanup_connection_pool_stats();'
);