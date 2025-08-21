/*
  # Update analysis_results table schema

  1. Schema Updates
    - Add `analysis_type` column to track single/batch/scheduled analysis
    - Add `batch_id` column for grouping batch analyses
    - Add `scan_id` column for scheduled scan results
    - Add `filename` column for file-based analyses
    - Add `full_content` column to store complete content for detailed view

  2. Data Migration
    - Set default values for existing records
    - Update existing records to have 'single' analysis type

  3. Indexes
    - Add index on analysis_type for filtering
    - Add index on batch_id for batch result queries
    - Add index on scan_id for scheduled scan queries
*/

-- Add new columns to analysis_results table
DO $$
BEGIN
  -- Add analysis_type column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analysis_results' AND column_name = 'analysis_type'
  ) THEN
    ALTER TABLE analysis_results ADD COLUMN analysis_type text DEFAULT 'single';
  END IF;

  -- Add batch_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analysis_results' AND column_name = 'batch_id'
  ) THEN
    ALTER TABLE analysis_results ADD COLUMN batch_id text;
  END IF;

  -- Add scan_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analysis_results' AND column_name = 'scan_id'
  ) THEN
    ALTER TABLE analysis_results ADD COLUMN scan_id text;
  END IF;

  -- Add filename column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analysis_results' AND column_name = 'filename'
  ) THEN
    ALTER TABLE analysis_results ADD COLUMN filename text;
  END IF;

  -- Add full_content column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analysis_results' AND column_name = 'full_content'
  ) THEN
    ALTER TABLE analysis_results ADD COLUMN full_content text;
  END IF;
END $$;

-- Add check constraint for analysis_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'analysis_results' AND constraint_name = 'analysis_results_analysis_type_check'
  ) THEN
    ALTER TABLE analysis_results ADD CONSTRAINT analysis_results_analysis_type_check 
    CHECK (analysis_type IN ('single', 'batch', 'scheduled'));
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_analysis_results_analysis_type 
ON analysis_results(analysis_type);

CREATE INDEX IF NOT EXISTS idx_analysis_results_batch_id 
ON analysis_results(batch_id) WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_results_scan_id 
ON analysis_results(scan_id) WHERE scan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_results_filename 
ON analysis_results(filename) WHERE filename IS NOT NULL;

-- Update existing records to have 'single' analysis type if they don't have one
UPDATE analysis_results 
SET analysis_type = 'single' 
WHERE analysis_type IS NULL;