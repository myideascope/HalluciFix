-- Migration: Batch Processing Infrastructure
-- Description: Create tables and functions for Step Functions batch processing workflows

-- Create batch analysis jobs table
CREATE TABLE IF NOT EXISTS batch_analysis_jobs (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    total_documents INTEGER NOT NULL DEFAULT 0,
    processed_documents INTEGER NOT NULL DEFAULT 0,
    failed_documents INTEGER NOT NULL DEFAULT 0,
    options JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    summary JSONB DEFAULT '{}',
    error_message TEXT,
    report_s3_key VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create index on batch analysis jobs
CREATE INDEX IF NOT EXISTS idx_batch_analysis_jobs_user_id ON batch_analysis_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_analysis_jobs_status ON batch_analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_batch_analysis_jobs_created_at ON batch_analysis_jobs(created_at);

-- Create batch processing errors table
CREATE TABLE IF NOT EXISTS batch_processing_errors (
    id VARCHAR(255) PRIMARY KEY,
    batch_id VARCHAR(255),
    user_id VARCHAR(255),
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT
);

-- Create index on batch processing errors
CREATE INDEX IF NOT EXISTS idx_batch_processing_errors_batch_id ON batch_processing_errors(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_processing_errors_user_id ON batch_processing_errors(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_processing_errors_timestamp ON batch_processing_errors(timestamp);
CREATE INDEX IF NOT EXISTS idx_batch_processing_errors_resolved ON batch_processing_errors(resolved);

-- Add batch_id column to analysis_results if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'batch_id') THEN
        ALTER TABLE analysis_results ADD COLUMN batch_id VARCHAR(255);
        CREATE INDEX idx_analysis_results_batch_id ON analysis_results(batch_id);
    END IF;
END $$;

-- Add filename column to analysis_results if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'filename') THEN
        ALTER TABLE analysis_results ADD COLUMN filename VARCHAR(512);
    END IF;
END $$;

-- Add full_content column to analysis_results if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'analysis_results' AND column_name = 'full_content') THEN
        ALTER TABLE analysis_results ADD COLUMN full_content TEXT;
    END IF;
END $$;

-- Create function to get batch job statistics
CREATE OR REPLACE FUNCTION get_batch_job_stats(p_user_id VARCHAR(255), p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    total_batches BIGINT,
    completed_batches BIGINT,
    failed_batches BIGINT,
    pending_batches BIGINT,
    total_documents BIGINT,
    avg_processing_time INTERVAL,
    success_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_batches,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_batches,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_batches,
        COUNT(*) FILTER (WHERE status IN ('pending', 'preparing', 'processing')) as pending_batches,
        COALESCE(SUM(total_documents), 0) as total_documents,
        AVG(completed_at - created_at) FILTER (WHERE completed_at IS NOT NULL) as avg_processing_time,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND((COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*)) * 100, 2)
            ELSE 0 
        END as success_rate
    FROM batch_analysis_jobs
    WHERE user_id = p_user_id
    AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days;
END;
$$ LANGUAGE plpgsql;

-- Create function to get batch processing errors summary
CREATE OR REPLACE FUNCTION get_batch_error_summary(p_user_id VARCHAR(255), p_days INTEGER DEFAULT 7)
RETURNS TABLE (
    error_type VARCHAR(100),
    error_count BIGINT,
    resolved_count BIGINT,
    latest_occurrence TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bpe.error_type,
        COUNT(*) as error_count,
        COUNT(*) FILTER (WHERE resolved = TRUE) as resolved_count,
        MAX(timestamp) as latest_occurrence
    FROM batch_processing_errors bpe
    WHERE bpe.user_id = p_user_id
    AND bpe.timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days
    GROUP BY bpe.error_type
    ORDER BY error_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up old batch jobs and errors
CREATE OR REPLACE FUNCTION cleanup_old_batch_data(p_retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Delete old completed batch jobs
    DELETE FROM batch_analysis_jobs 
    WHERE status = 'completed' 
    AND completed_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * p_retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete old resolved errors
    DELETE FROM batch_processing_errors 
    WHERE resolved = TRUE 
    AND timestamp < CURRENT_TIMESTAMP - INTERVAL '1 day' * p_retention_days;
    
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_batch_job_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for batch_analysis_jobs
DROP TRIGGER IF EXISTS trigger_update_batch_job_timestamp ON batch_analysis_jobs;
CREATE TRIGGER trigger_update_batch_job_timestamp
    BEFORE UPDATE ON batch_analysis_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_job_timestamp();

-- Grant permissions for RDS Data API access
-- Note: These would be handled by IAM in AWS RDS, but included for completeness
COMMENT ON TABLE batch_analysis_jobs IS 'Stores batch analysis job metadata and status';
COMMENT ON TABLE batch_processing_errors IS 'Tracks errors that occur during batch processing workflows';
COMMENT ON FUNCTION get_batch_job_stats IS 'Returns statistics about batch jobs for a user';
COMMENT ON FUNCTION get_batch_error_summary IS 'Returns summary of batch processing errors';
COMMENT ON FUNCTION cleanup_old_batch_data IS 'Cleans up old batch processing data based on retention policy';