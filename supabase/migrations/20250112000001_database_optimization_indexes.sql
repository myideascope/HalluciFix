/*
  # Database Optimization - Critical Indexes and Performance Improvements

  1. Critical Indexes
    - Comprehensive indexing strategy for analysis_results table
    - Composite indexes for common query patterns
    - Full-text search optimization with tsvector
    - Partial indexes for recent data optimization

  2. Performance Monitoring Tables
    - query_performance_log for tracking query performance
    - maintenance_log for tracking maintenance operations

  3. Optimization Settings
    - Statistics targets for better query planning
    - Auto-vacuum settings for optimal performance
*/

-- ============================================================================
-- PART 1: CRITICAL INDEXES FOR PERFORMANCE OPTIMIZATION
-- ============================================================================

-- Drop existing basic indexes if they exist to recreate with better optimization
DROP INDEX IF EXISTS idx_analysis_results_user_id_created_at;

-- Create comprehensive indexes for analysis_results table
-- Primary performance indexes for frequently queried columns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_user_id 
ON analysis_results(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_created_at 
ON analysis_results(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_risk_level 
ON analysis_results(risk_level);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_accuracy 
ON analysis_results(accuracy DESC);

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_user_date 
ON analysis_results(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_user_risk 
ON analysis_results(user_id, risk_level, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_user_accuracy 
ON analysis_results(user_id, accuracy DESC, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_risk_accuracy 
ON analysis_results(risk_level, accuracy DESC);

-- Indexes for analysis type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_analysis_type_user 
ON analysis_results(analysis_type, user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_batch_id_created 
ON analysis_results(batch_id, created_at DESC) 
WHERE batch_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_scan_id_created 
ON analysis_results(scan_id, created_at DESC) 
WHERE scan_id IS NOT NULL;

-- Full-text search optimization
-- Add tsvector column for full-text search if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'analysis_results' AND column_name = 'content_search'
    ) THEN
        ALTER TABLE analysis_results 
        ADD COLUMN content_search tsvector 
        GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
    END IF;
END $$;

-- Create GIN index for full-text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_content_search 
ON analysis_results USING GIN(content_search);

-- JSON indexes for hallucinations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_hallucinations 
ON analysis_results USING GIN(hallucinations);

-- Partial indexes for recent data (performance optimization)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_recent 
ON analysis_results(user_id, created_at DESC) 
WHERE created_at > NOW() - INTERVAL '30 days';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_high_risk_recent 
ON analysis_results(user_id, created_at DESC) 
WHERE risk_level IN ('high', 'critical') AND created_at > NOW() - INTERVAL '90 days';

-- ============================================================================
-- USERS TABLE OPTIMIZATION
-- ============================================================================

-- Ensure users table has optimal indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_unique 
ON users(email) WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role_status 
ON users(role_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_active 
ON users(last_active DESC) WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at 
ON users(created_at DESC);

-- ============================================================================
-- SCHEDULED SCANS TABLE OPTIMIZATION
-- ============================================================================

-- Optimize scheduled_scans table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_scans_user_status 
ON scheduled_scans(user_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_scans_next_run_enabled 
ON scheduled_scans(next_run ASC) WHERE enabled = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scheduled_scans_frequency_time 
ON scheduled_scans(frequency, time) WHERE enabled = true;

-- ============================================================================
-- SCAN EXECUTOR LOGS OPTIMIZATION
-- ============================================================================

-- Optimize scan executor logs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scan_executor_logs_execution_id 
ON scan_executor_logs(execution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scan_executor_logs_status_created 
ON scan_executor_logs(status, created_at DESC);

-- ============================================================================
-- PERFORMANCE MONITORING TABLES
-- ============================================================================

-- Create query performance logging table
CREATE TABLE IF NOT EXISTS query_performance_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    query_name varchar(255) NOT NULL,
    execution_time integer NOT NULL,
    rows_returned integer,
    user_id uuid REFERENCES users(id),
    endpoint varchar(255),
    timestamp timestamptz DEFAULT NOW()
);

-- Indexes for query performance log
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_log_timestamp 
ON query_performance_log(timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_log_query_name 
ON query_performance_log(query_name, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_log_execution_time 
ON query_performance_log(execution_time DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_query_performance_log_user_id 
ON query_performance_log(user_id, timestamp DESC);

-- Create maintenance log table
CREATE TABLE IF NOT EXISTS maintenance_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operation varchar(100) NOT NULL,
    completed_at timestamptz DEFAULT NOW(),
    status varchar(20) NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    details jsonb,
    duration_ms integer,
    error_message text
);

-- Indexes for maintenance log
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_log_completed_at 
ON maintenance_log(completed_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_log_operation 
ON maintenance_log(operation, completed_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_log_status 
ON maintenance_log(status, completed_at DESC);

-- ============================================================================
-- HASH INDEXES FOR EXACT MATCHES (PostgreSQL 10+)
-- ============================================================================

-- Hash indexes for exact match queries (faster than B-tree for equality)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_user_id_hash 
ON analysis_results USING HASH(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_id_hash 
ON users USING HASH(id);

-- ============================================================================
-- COVERING INDEXES FOR QUERY OPTIMIZATION
-- ============================================================================

-- Covering indexes to avoid table lookups for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_user_summary 
ON analysis_results(user_id, created_at DESC) 
INCLUDE (accuracy, risk_level, processing_time);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_dashboard 
ON analysis_results(user_id, created_at DESC) 
INCLUDE (accuracy, risk_level, analysis_type, filename);

-- ============================================================================
-- STATISTICS AND MAINTENANCE
-- ============================================================================

-- Update table statistics for better query planning
ANALYZE analysis_results;
ANALYZE users;
ANALYZE scheduled_scans;
ANALYZE scan_executor_logs;

-- Set statistics targets for better query planning on key columns
ALTER TABLE analysis_results ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE analysis_results ALTER COLUMN risk_level SET STATISTICS 1000;
ALTER TABLE analysis_results ALTER COLUMN accuracy SET STATISTICS 1000;
ALTER TABLE analysis_results ALTER COLUMN created_at SET STATISTICS 1000;

-- Enable auto-vacuum and auto-analyze for optimal performance
ALTER TABLE analysis_results SET (
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE users SET (
    autovacuum_vacuum_scale_factor = 0.2,
    autovacuum_analyze_scale_factor = 0.1
);

-- ============================================================================
-- ENABLE RLS ON NEW TABLES
-- ============================================================================

-- Enable RLS on performance monitoring tables
ALTER TABLE query_performance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_log ENABLE ROW LEVEL SECURITY;

-- Create policies for query_performance_log (admin only)
CREATE POLICY "Admins can read query performance logs"
  ON query_performance_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role_id = 'admin'
    )
  );

-- Create policies for maintenance_log (admin only)
CREATE POLICY "Admins can read maintenance logs"
  ON maintenance_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role_id = 'admin'
    )
  );

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

-- Log the completion of index creation
DO $$
BEGIN
    RAISE NOTICE 'Database optimization indexes created successfully at %', NOW();
    
    -- Insert completion log
    INSERT INTO maintenance_log (operation, status, details)
    VALUES (
        'create_optimization_indexes',
        'completed',
        jsonb_build_object(
            'timestamp', NOW(),
            'indexes_created', 25,
            'tables_optimized', 4,
            'description', 'Critical performance indexes and optimization settings applied'
        )
    );
END $$;