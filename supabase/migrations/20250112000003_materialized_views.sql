-- Migration: Materialized Views for Complex Analytics
-- Created: 2025-01-12
-- Description: Create materialized views for optimized analytics and reporting

-- Create materialized view for user analytics summary
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
    AVG(processing_time) as avg_processing_time,
    SUM(processing_time) as total_processing_time,
    AVG(verification_sources) as avg_verification_sources,
    COUNT(CASE WHEN analysis_type = 'single' THEN 1 END) as single_analyses,
    COUNT(CASE WHEN analysis_type = 'batch' THEN 1 END) as batch_analyses,
    MAX(created_at) as last_analysis_date,
    MIN(created_at) as first_analysis_date,
    DATE_TRUNC('day', MAX(created_at)) as last_analysis_day,
    COUNT(DISTINCT DATE_TRUNC('day', created_at)) as active_days,
    -- Calculate trend indicators
    CASE 
        WHEN COUNT(*) >= 10 THEN
            (COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END)::FLOAT / 
             GREATEST(COUNT(CASE WHEN created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' THEN 1 END), 1)) - 1
        ELSE 0
    END as weekly_growth_rate,
    -- Quality metrics
    COUNT(CASE WHEN accuracy >= 90 THEN 1 END)::FLOAT / COUNT(*) as high_quality_ratio,
    COUNT(CASE WHEN risk_level IN ('high', 'critical') THEN 1 END)::FLOAT / COUNT(*) as high_risk_ratio
FROM analysis_results
GROUP BY user_id;

-- Create unique index on materialized view for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_analytics_summary_user_id 
ON user_analytics_summary(user_id);

-- Create additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_analytics_summary_total_analyses 
ON user_analytics_summary(total_analyses DESC);

CREATE INDEX IF NOT EXISTS idx_user_analytics_summary_avg_accuracy 
ON user_analytics_summary(avg_accuracy DESC);

CREATE INDEX IF NOT EXISTS idx_user_analytics_summary_last_analysis 
ON user_analytics_summary(last_analysis_date DESC);

-- Create materialized view for daily analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_analytics AS
SELECT 
    DATE(created_at) as analysis_date,
    COUNT(*) as total_analyses,
    COUNT(DISTINCT user_id) as active_users,
    AVG(accuracy) as avg_accuracy,
    STDDEV(accuracy) as accuracy_stddev,
    COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk_count,
    COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk_count,
    COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_count,
    COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk_count,
    AVG(processing_time) as avg_processing_time,
    MIN(processing_time) as min_processing_time,
    MAX(processing_time) as max_processing_time,
    AVG(verification_sources) as avg_verification_sources,
    COUNT(CASE WHEN analysis_type = 'single' THEN 1 END) as single_analyses,
    COUNT(CASE WHEN analysis_type = 'batch' THEN 1 END) as batch_analyses,
    -- Performance metrics
    COUNT(CASE WHEN processing_time > 5000 THEN 1 END) as slow_analyses,
    COUNT(CASE WHEN accuracy < 70 THEN 1 END) as low_accuracy_analyses,
    -- Calculate percentiles for processing time
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY processing_time) as median_processing_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time) as p95_processing_time,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY processing_time) as p99_processing_time
FROM analysis_results
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY analysis_date DESC;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_analytics_date 
ON daily_analytics(analysis_date);

-- Create materialized view for hourly performance metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_performance_metrics AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour_bucket,
    COUNT(*) as total_analyses,
    COUNT(DISTINCT user_id) as active_users,
    AVG(accuracy) as avg_accuracy,
    AVG(processing_time) as avg_processing_time,
    COUNT(CASE WHEN processing_time > 5000 THEN 1 END) as slow_analyses,
    COUNT(CASE WHEN risk_level IN ('high', 'critical') THEN 1 END) as high_risk_analyses,
    -- System load indicators
    MAX(processing_time) as max_processing_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time) as p95_processing_time,
    -- Quality metrics
    COUNT(CASE WHEN accuracy >= 90 THEN 1 END)::FLOAT / COUNT(*) as high_quality_ratio
FROM analysis_results
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour_bucket DESC;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_hourly_performance_metrics_hour 
ON hourly_performance_metrics(hour_bucket);

-- Create materialized view for risk analysis trends
CREATE MATERIALIZED VIEW IF NOT EXISTS risk_analysis_trends AS
SELECT 
    DATE_TRUNC('week', created_at) as week_bucket,
    risk_level,
    COUNT(*) as analysis_count,
    AVG(accuracy) as avg_accuracy,
    AVG(processing_time) as avg_processing_time,
    COUNT(DISTINCT user_id) as affected_users,
    -- Trend calculations
    LAG(COUNT(*)) OVER (PARTITION BY risk_level ORDER BY DATE_TRUNC('week', created_at)) as prev_week_count,
    COUNT(*)::FLOAT / LAG(COUNT(*)) OVER (PARTITION BY risk_level ORDER BY DATE_TRUNC('week', created_at)) - 1 as week_over_week_change
FROM analysis_results
WHERE created_at >= NOW() - INTERVAL '12 weeks'
GROUP BY DATE_TRUNC('week', created_at), risk_level
ORDER BY week_bucket DESC, risk_level;

-- Create indexes for risk analysis trends
CREATE INDEX IF NOT EXISTS idx_risk_analysis_trends_week_risk 
ON risk_analysis_trends(week_bucket, risk_level);

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS void AS $$
BEGIN
    -- Refresh user analytics summary
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_analytics_summary;
    
    -- Refresh daily analytics
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_analytics;
    
    -- Refresh hourly performance metrics
    REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_performance_metrics;
    
    -- Refresh risk analysis trends
    REFRESH MATERIALIZED VIEW CONCURRENTLY risk_analysis_trends;
    
    -- Log refresh completion
    INSERT INTO maintenance_log (operation, completed_at, status, details)
    VALUES ('refresh_materialized_views', NOW(), 'completed', 
            jsonb_build_object('views_refreshed', 4));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to refresh specific materialized view
CREATE OR REPLACE FUNCTION refresh_materialized_view(view_name TEXT)
RETURNS void AS $$
BEGIN
    -- Validate view name to prevent SQL injection
    IF view_name NOT IN ('user_analytics_summary', 'daily_analytics', 'hourly_performance_metrics', 'risk_analysis_trends') THEN
        RAISE EXCEPTION 'Invalid materialized view name: %', view_name;
    END IF;
    
    -- Refresh the specified view
    EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', view_name);
    
    -- Log refresh completion
    INSERT INTO maintenance_log (operation, completed_at, status, details)
    VALUES ('refresh_materialized_view', NOW(), 'completed', 
            jsonb_build_object('view_name', view_name));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get materialized view statistics
CREATE OR REPLACE FUNCTION get_materialized_view_stats()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    WITH view_stats AS (
        SELECT 
            schemaname,
            matviewname as viewname,
            hasindexes,
            ispopulated,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as size
        FROM pg_matviews 
        WHERE schemaname = 'public'
        AND matviewname IN ('user_analytics_summary', 'daily_analytics', 'hourly_performance_metrics', 'risk_analysis_trends')
    ),
    refresh_history AS (
        SELECT 
            COUNT(*) as total_refreshes,
            MAX(completed_at) as last_refresh,
            AVG(duration_ms) as avg_refresh_time
        FROM maintenance_log 
        WHERE operation IN ('refresh_materialized_views', 'refresh_materialized_view')
        AND completed_at > NOW() - INTERVAL '30 days'
    )
    SELECT jsonb_build_object(
        'views', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'name', viewname,
                    'hasIndexes', hasindexes,
                    'isPopulated', ispopulated,
                    'size', size
                )
            ) FROM view_stats
        ),
        'refreshHistory', (
            SELECT jsonb_build_object(
                'totalRefreshes', total_refreshes,
                'lastRefresh', last_refresh,
                'avgRefreshTime', avg_refresh_time
            ) FROM refresh_history
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create maintenance log table if it doesn't exist
CREATE TABLE IF NOT EXISTS maintenance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(100) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    details JSONB,
    duration_ms INTEGER
);

-- Create index for maintenance log
CREATE INDEX IF NOT EXISTS idx_maintenance_log_completed_at 
ON maintenance_log(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_log_operation 
ON maintenance_log(operation);

-- Schedule automatic refresh of materialized views (requires pg_cron extension)
-- Refresh user analytics every 6 hours
-- SELECT cron.schedule('refresh-user-analytics', '0 */6 * * *', 'SELECT refresh_materialized_view(''user_analytics_summary'');');

-- Refresh daily analytics every day at 1 AM
-- SELECT cron.schedule('refresh-daily-analytics', '0 1 * * *', 'SELECT refresh_materialized_view(''daily_analytics'');');

-- Refresh hourly metrics every hour
-- SELECT cron.schedule('refresh-hourly-metrics', '0 * * * *', 'SELECT refresh_materialized_view(''hourly_performance_metrics'');');

-- Refresh risk trends weekly on Sunday at 2 AM
-- SELECT cron.schedule('refresh-risk-trends', '0 2 * * 0', 'SELECT refresh_materialized_view(''risk_analysis_trends'');');

-- Grant necessary permissions
GRANT SELECT ON user_analytics_summary TO authenticated;
GRANT SELECT ON daily_analytics TO authenticated;
GRANT SELECT ON hourly_performance_metrics TO authenticated;
GRANT SELECT ON risk_analysis_trends TO authenticated;
GRANT SELECT ON maintenance_log TO authenticated;

GRANT EXECUTE ON FUNCTION refresh_all_materialized_views() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_materialized_view(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_materialized_view_stats() TO authenticated;

-- Add RLS policies for materialized views (they inherit from base tables)
-- Note: Materialized views don't support RLS directly, so we'll create views with RLS

-- Create secure view for user analytics summary
CREATE OR REPLACE VIEW secure_user_analytics_summary AS
SELECT * FROM user_analytics_summary
WHERE user_id = auth.uid() OR auth.jwt() ->> 'role' = 'admin';

-- Create secure view for daily analytics (admin only)
CREATE OR REPLACE VIEW secure_daily_analytics AS
SELECT * FROM daily_analytics
WHERE auth.jwt() ->> 'role' = 'admin';

-- Grant permissions on secure views
GRANT SELECT ON secure_user_analytics_summary TO authenticated;
GRANT SELECT ON secure_daily_analytics TO authenticated;

-- Add comments for documentation
COMMENT ON MATERIALIZED VIEW user_analytics_summary IS 'Aggregated analytics data per user for dashboard display';
COMMENT ON MATERIALIZED VIEW daily_analytics IS 'Daily aggregated analytics for system monitoring and reporting';
COMMENT ON MATERIALIZED VIEW hourly_performance_metrics IS 'Hourly performance metrics for real-time monitoring';
COMMENT ON MATERIALIZED VIEW risk_analysis_trends IS 'Weekly risk analysis trends for trend analysis';
COMMENT ON FUNCTION refresh_all_materialized_views IS 'Refreshes all materialized views used for analytics';
COMMENT ON FUNCTION refresh_materialized_view IS 'Refreshes a specific materialized view by name';
COMMENT ON FUNCTION get_materialized_view_stats IS 'Returns statistics about materialized views and their refresh history';