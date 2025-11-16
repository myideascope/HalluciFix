/*
  # Materialized Views for Analytics Performance

  1. User Analytics Summary
    - Aggregated user statistics for dashboard performance
    - Includes total analyses, accuracy averages, risk distribution

  2. Daily Analytics
    - Daily aggregated metrics for trend analysis
    - Optimized for reporting and dashboard queries

  3. Automated Refresh Procedures
    - Functions to refresh materialized views
    - Scheduled refresh procedures for data freshness
*/

-- ============================================================================
-- USER ANALYTICS SUMMARY MATERIALIZED VIEW
-- ============================================================================

-- Create materialized view for user analytics summary
CREATE MATERIALIZED VIEW IF NOT EXISTS user_analytics_summary AS
SELECT 
    user_id,
    COUNT(*) as total_analyses,
    ROUND(AVG(accuracy), 2) as avg_accuracy,
    COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk_count,
    COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk_count,
    COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_count,
    COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk_count,
    COUNT(CASE WHEN analysis_type = 'single' THEN 1 END) as single_analyses,
    COUNT(CASE WHEN analysis_type = 'batch' THEN 1 END) as batch_analyses,
    COUNT(CASE WHEN analysis_type = 'scheduled' THEN 1 END) as scheduled_analyses,
    ROUND(AVG(processing_time), 0) as avg_processing_time,
    MAX(created_at) as last_analysis_date,
    MIN(created_at) as first_analysis_date,
    COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as analyses_last_7_days,
    COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as analyses_last_30_days,
    -- Risk trend calculation (last 30 days vs previous 30 days)
    CASE 
        WHEN COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' AND risk_level IN ('high', 'critical') THEN 1 END) >
             COUNT(CASE WHEN created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days' AND risk_level IN ('high', 'critical') THEN 1 END)
        THEN 'increasing'
        WHEN COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' AND risk_level IN ('high', 'critical') THEN 1 END) <
             COUNT(CASE WHEN created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days' AND risk_level IN ('high', 'critical') THEN 1 END)
        THEN 'decreasing'
        ELSE 'stable'
    END as risk_trend,
    NOW() as last_updated
FROM analysis_results
GROUP BY user_id;

-- Create unique index on materialized view for efficient refreshes
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_analytics_summary_user_id 
ON user_analytics_summary(user_id);

-- Create additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_analytics_summary_total_analyses 
ON user_analytics_summary(total_analyses DESC);

CREATE INDEX IF NOT EXISTS idx_user_analytics_summary_avg_accuracy 
ON user_analytics_summary(avg_accuracy DESC);

CREATE INDEX IF NOT EXISTS idx_user_analytics_summary_last_analysis 
ON user_analytics_summary(last_analysis_date DESC);

-- ============================================================================
-- DAILY ANALYTICS MATERIALIZED VIEW
-- ============================================================================

-- Create materialized view for daily analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_analytics AS
SELECT 
    DATE(created_at) as analysis_date,
    COUNT(*) as total_analyses,
    ROUND(AVG(accuracy), 2) as avg_accuracy,
    COUNT(DISTINCT user_id) as active_users,
    ROUND(AVG(processing_time), 0) as avg_processing_time,
    COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk_count,
    COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk_count,
    COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_count,
    COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk_count,
    COUNT(CASE WHEN analysis_type = 'single' THEN 1 END) as single_analyses,
    COUNT(CASE WHEN analysis_type = 'batch' THEN 1 END) as batch_analyses,
    COUNT(CASE WHEN analysis_type = 'scheduled' THEN 1 END) as scheduled_analyses,
    -- Performance metrics
    MIN(processing_time) as min_processing_time,
    MAX(processing_time) as max_processing_time,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY processing_time) as median_processing_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time) as p95_processing_time,
    -- Quality metrics
    MIN(accuracy) as min_accuracy,
    MAX(accuracy) as max_accuracy,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY accuracy) as median_accuracy,
    -- Risk percentage
    ROUND(
        (COUNT(CASE WHEN risk_level IN ('high', 'critical') THEN 1 END) * 100.0 / COUNT(*)), 2
    ) as high_risk_percentage,
    NOW() as last_updated
FROM analysis_results
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY analysis_date DESC;

-- Create unique index on daily analytics
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_analytics_date 
ON daily_analytics(analysis_date DESC);

-- Create additional indexes for trend analysis
CREATE INDEX IF NOT EXISTS idx_daily_analytics_total_analyses 
ON daily_analytics(total_analyses DESC);

CREATE INDEX IF NOT EXISTS idx_daily_analytics_active_users 
ON daily_analytics(active_users DESC);

-- ============================================================================
-- WEEKLY ANALYTICS MATERIALIZED VIEW
-- ============================================================================

-- Create materialized view for weekly analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_analytics AS
SELECT 
    DATE_TRUNC('week', created_at) as week_start,
    COUNT(*) as total_analyses,
    ROUND(AVG(accuracy), 2) as avg_accuracy,
    COUNT(DISTINCT user_id) as active_users,
    ROUND(AVG(processing_time), 0) as avg_processing_time,
    COUNT(CASE WHEN risk_level = 'low' THEN 1 END) as low_risk_count,
    COUNT(CASE WHEN risk_level = 'medium' THEN 1 END) as medium_risk_count,
    COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_count,
    COUNT(CASE WHEN risk_level = 'critical' THEN 1 END) as critical_risk_count,
    -- Growth metrics (compared to previous week)
    LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('week', created_at)) as prev_week_analyses,
    ROUND(
        (COUNT(*) - LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('week', created_at))) * 100.0 / 
        NULLIF(LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('week', created_at)), 0), 2
    ) as growth_percentage,
    NOW() as last_updated
FROM analysis_results
WHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'
GROUP BY DATE_TRUNC('week', created_at)
ORDER BY week_start DESC;

-- Create unique index on weekly analytics
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_analytics_week 
ON weekly_analytics(week_start DESC);

-- ============================================================================
-- USER ACTIVITY SUMMARY MATERIALIZED VIEW
-- ============================================================================

-- Create materialized view for user activity patterns
CREATE MATERIALIZED VIEW IF NOT EXISTS user_activity_summary AS
SELECT 
    u.id as user_id,
    u.email,
    u.name,
    u.role_id,
    u.department,
    u.status,
    u.created_at as user_created_at,
    u.last_active,
    COALESCE(uas.total_analyses, 0) as total_analyses,
    COALESCE(uas.avg_accuracy, 0) as avg_accuracy,
    COALESCE(uas.analyses_last_7_days, 0) as analyses_last_7_days,
    COALESCE(uas.analyses_last_30_days, 0) as analyses_last_30_days,
    COALESCE(uas.risk_trend, 'stable') as risk_trend,
    -- Activity classification
    CASE 
        WHEN uas.analyses_last_7_days >= 10 THEN 'very_active'
        WHEN uas.analyses_last_7_days >= 3 THEN 'active'
        WHEN uas.analyses_last_30_days >= 1 THEN 'occasional'
        ELSE 'inactive'
    END as activity_level,
    -- Scheduled scans count
    COALESCE(ss.active_scans, 0) as active_scheduled_scans,
    NOW() as last_updated
FROM users u
LEFT JOIN user_analytics_summary uas ON u.id = uas.user_id
LEFT JOIN (
    SELECT user_id, COUNT(*) as active_scans
    FROM scheduled_scans 
    WHERE enabled = true AND status = 'active'
    GROUP BY user_id
) ss ON u.id = ss.user_id
WHERE u.status = 'active';

-- Create unique index on user activity summary
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_activity_summary_user_id 
ON user_activity_summary(user_id);

-- Create indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_user_activity_summary_activity_level 
ON user_activity_summary(activity_level, total_analyses DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_summary_department 
ON user_activity_summary(department, activity_level);

-- ============================================================================
-- REFRESH FUNCTIONS
-- ============================================================================

-- Create function to refresh user analytics summary
CREATE OR REPLACE FUNCTION refresh_user_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    start_time timestamptz := NOW();
    duration_ms integer;
BEGIN
    -- Refresh user analytics summary
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_analytics_summary;
    
    -- Calculate duration
    duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log refresh completion
    INSERT INTO maintenance_log (operation, status, duration_ms, details)
    VALUES (
        'refresh_user_analytics',
        'completed',
        duration_ms,
        jsonb_build_object(
            'materialized_view', 'user_analytics_summary',
            'refresh_time', NOW(),
            'duration_ms', duration_ms
        )
    );
END;
$;

-- Create function to refresh daily analytics
CREATE OR REPLACE FUNCTION refresh_daily_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    start_time timestamptz := NOW();
    duration_ms integer;
BEGIN
    -- Refresh daily analytics
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_analytics;
    
    -- Calculate duration
    duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log refresh completion
    INSERT INTO maintenance_log (operation, status, duration_ms, details)
    VALUES (
        'refresh_daily_analytics',
        'completed',
        duration_ms,
        jsonb_build_object(
            'materialized_view', 'daily_analytics',
            'refresh_time', NOW(),
            'duration_ms', duration_ms
        )
    );
END;
$;

-- Create function to refresh weekly analytics
CREATE OR REPLACE FUNCTION refresh_weekly_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    start_time timestamptz := NOW();
    duration_ms integer;
BEGIN
    -- Refresh weekly analytics
    REFRESH MATERIALIZED VIEW CONCURRENTLY weekly_analytics;
    
    -- Calculate duration
    duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log refresh completion
    INSERT INTO maintenance_log (operation, status, duration_ms, details)
    VALUES (
        'refresh_weekly_analytics',
        'completed',
        duration_ms,
        jsonb_build_object(
            'materialized_view', 'weekly_analytics',
            'refresh_time', NOW(),
            'duration_ms', duration_ms
        )
    );
END;
$;

-- Create function to refresh user activity summary
CREATE OR REPLACE FUNCTION refresh_user_activity_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    start_time timestamptz := NOW();
    duration_ms integer;
BEGIN
    -- Refresh user activity summary (depends on user_analytics_summary)
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_activity_summary;
    
    -- Calculate duration
    duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log refresh completion
    INSERT INTO maintenance_log (operation, status, duration_ms, details)
    VALUES (
        'refresh_user_activity_summary',
        'completed',
        duration_ms,
        jsonb_build_object(
            'materialized_view', 'user_activity_summary',
            'refresh_time', NOW(),
            'duration_ms', duration_ms
        )
    );
END;
$;

-- Create comprehensive refresh function for all materialized views
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    start_time timestamptz := NOW();
    total_duration_ms integer;
    refresh_results jsonb := '[]'::jsonb;
    view_result jsonb;
BEGIN
    -- Refresh user analytics summary first (other views depend on it)
    PERFORM refresh_user_analytics();
    
    -- Refresh daily analytics
    PERFORM refresh_daily_analytics();
    
    -- Refresh weekly analytics
    PERFORM refresh_weekly_analytics();
    
    -- Refresh user activity summary (depends on user_analytics_summary)
    PERFORM refresh_user_activity_summary();
    
    -- Calculate total duration
    total_duration_ms := EXTRACT(epoch FROM (NOW() - start_time)) * 1000;
    
    -- Log overall completion
    INSERT INTO maintenance_log (operation, status, duration_ms, details)
    VALUES (
        'refresh_all_materialized_views',
        'completed',
        total_duration_ms,
        jsonb_build_object(
            'views_refreshed', 4,
            'refresh_time', NOW(),
            'total_duration_ms', total_duration_ms,
            'views', jsonb_build_array(
                'user_analytics_summary',
                'daily_analytics', 
                'weekly_analytics',
                'user_activity_summary'
            )
        )
    );
    
    -- Return summary
    RETURN jsonb_build_object(
        'status', 'completed',
        'views_refreshed', 4,
        'total_duration_ms', total_duration_ms,
        'timestamp', NOW()
    );
    
EXCEPTION WHEN OTHERS THEN
    -- Log error
    INSERT INTO maintenance_log (operation, status, error_message, details)
    VALUES (
        'refresh_all_materialized_views',
        'failed',
        SQLERRM,
        jsonb_build_object(
            'error_time', NOW(),
            'error_detail', SQLERRM
        )
    );
    
    -- Re-raise the error
    RAISE;
END;
$;

-- ============================================================================
-- AUTOMATED REFRESH SCHEDULING
-- ============================================================================

-- Create function to schedule materialized view refreshes
-- This would typically be called by a cron job or scheduled task
CREATE OR REPLACE FUNCTION schedule_materialized_view_refresh()
RETURNS void
LANGUAGE plpgsql
AS $
BEGIN
    -- Check if refresh is needed (every 6 hours for user analytics)
    IF NOT EXISTS (
        SELECT 1 FROM maintenance_log 
        WHERE operation = 'refresh_user_analytics' 
        AND status = 'completed'
        AND completed_at > NOW() - INTERVAL '6 hours'
    ) THEN
        PERFORM refresh_user_analytics();
    END IF;
    
    -- Check if daily analytics refresh is needed (every 2 hours)
    IF NOT EXISTS (
        SELECT 1 FROM maintenance_log 
        WHERE operation = 'refresh_daily_analytics' 
        AND status = 'completed'
        AND completed_at > NOW() - INTERVAL '2 hours'
    ) THEN
        PERFORM refresh_daily_analytics();
    END IF;
    
    -- Check if weekly analytics refresh is needed (every 12 hours)
    IF NOT EXISTS (
        SELECT 1 FROM maintenance_log 
        WHERE operation = 'refresh_weekly_analytics' 
        AND status = 'completed'
        AND completed_at > NOW() - INTERVAL '12 hours'
    ) THEN
        PERFORM refresh_weekly_analytics();
    END IF;
    
    -- Check if user activity summary refresh is needed (every 4 hours)
    IF NOT EXISTS (
        SELECT 1 FROM maintenance_log 
        WHERE operation = 'refresh_user_activity_summary' 
        AND status = 'completed'
        AND completed_at > NOW() - INTERVAL '4 hours'
    ) THEN
        PERFORM refresh_user_activity_summary();
    END IF;
END;
$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions on refresh functions
GRANT EXECUTE ON FUNCTION refresh_user_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_daily_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_weekly_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_user_activity_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_all_materialized_views() TO authenticated;
GRANT EXECUTE ON FUNCTION schedule_materialized_view_refresh() TO authenticated;

-- ============================================================================
-- INITIAL REFRESH
-- ============================================================================

-- Perform initial refresh of all materialized views
SELECT refresh_all_materialized_views();

-- Log completion
INSERT INTO maintenance_log (operation, status, details)
VALUES (
    'create_materialized_views',
    'completed',
    jsonb_build_object(
        'timestamp', NOW(),
        'views_created', 4,
        'description', 'Materialized views for analytics performance created and initially refreshed'
    )
);