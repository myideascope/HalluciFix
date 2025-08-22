/*
  # Create scan executor function for scheduled scans

  1. Functions
    - `process_scheduled_scans()` - Main function to process due scans
    - `calculate_next_run_time()` - Helper to calculate next execution time
    - `mock_analyze_content()` - Mock analysis function for demo
  
  2. Security
    - Functions run with SECURITY DEFINER for elevated privileges
    - Proper error handling and logging
*/

-- Create function to calculate next run time
CREATE OR REPLACE FUNCTION calculate_next_run_time(
  frequency text,
  time_str text
)
RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  next_run timestamptz;
  time_parts text[];
  hours int;
  minutes int;
BEGIN
  -- Parse time string (HH:MM format)
  time_parts := string_to_array(time_str, ':');
  hours := time_parts[1]::int;
  minutes := time_parts[2]::int;
  
  -- Start with current time
  next_run := now();
  
  -- Set the time for today
  next_run := date_trunc('day', next_run) + (hours || ' hours')::interval + (minutes || ' minutes')::interval;
  
  -- If the time has already passed today, move to next occurrence
  IF next_run <= now() THEN
    CASE frequency
      WHEN 'hourly' THEN
        next_run := next_run + '1 hour'::interval;
      WHEN 'daily' THEN
        next_run := next_run + '1 day'::interval;
      WHEN 'weekly' THEN
        next_run := next_run + '7 days'::interval;
      WHEN 'monthly' THEN
        next_run := next_run + '1 month'::interval;
      ELSE
        next_run := next_run + '1 day'::interval; -- Default to daily
    END CASE;
  END IF;
  
  RETURN next_run;
END;
$$;

-- Create mock content analysis function
CREATE OR REPLACE FUNCTION mock_analyze_content(
  content_text text,
  scan_name text DEFAULT 'Unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  accuracy numeric;
  risk_level text;
  hallucinations_count int;
  processing_time int;
  result jsonb;
BEGIN
  -- Simulate processing time
  processing_time := 500 + (random() * 2000)::int;
  
  -- Generate mock accuracy (70-95%)
  accuracy := 70 + (random() * 25);
  
  -- Determine risk level based on accuracy
  IF accuracy > 90 THEN
    risk_level := 'low';
    hallucinations_count := 0;
  ELSIF accuracy > 80 THEN
    risk_level := 'medium';
    hallucinations_count := 1;
  ELSIF accuracy > 70 THEN
    risk_level := 'high';
    hallucinations_count := 2;
  ELSE
    risk_level := 'critical';
    hallucinations_count := 3;
  END IF;
  
  -- Build result object
  result := jsonb_build_object(
    'accuracy', accuracy,
    'riskLevel', risk_level,
    'hallucinationsCount', hallucinations_count,
    'processingTime', processing_time,
    'scanName', scan_name,
    'timestamp', now()
  );
  
  RETURN result;
END;
$$;

-- Create main scan processing function
CREATE OR REPLACE FUNCTION process_scheduled_scans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  scan_record record;
  analysis_result jsonb;
  next_run_time timestamptz;
  total_scans int := 0;
  successful_scans int := 0;
  failed_scans int := 0;
  execution_start timestamptz := now();
  execution_id text;
  content_to_analyze text;
  source_item text;
BEGIN
  -- Generate execution ID
  execution_id := 'exec_' || extract(epoch from now())::text || '_' || (random() * 1000)::int;
  
  -- Log execution start
  INSERT INTO scan_executor_logs (execution_id, status, details)
  VALUES (execution_id, 'started', jsonb_build_object('start_time', execution_start));
  
  -- Find all due scans
  FOR scan_record IN 
    SELECT * FROM scheduled_scans 
    WHERE enabled = true 
    AND next_run <= now()
    ORDER BY next_run ASC
  LOOP
    total_scans := total_scans + 1;
    
    BEGIN
      -- Build content from sources
      content_to_analyze := '';
      
      -- Add custom sources
      IF scan_record.sources IS NOT NULL THEN
        FOREACH source_item IN ARRAY scan_record.sources
        LOOP
          IF source_item IS NOT NULL AND trim(source_item) != '' THEN
            content_to_analyze := content_to_analyze || E'\n\n=== Source: ' || source_item || E' ===\n';
            content_to_analyze := content_to_analyze || 'Mock content from ' || source_item || ' generated at ' || now();
          END IF;
        END LOOP;
      END IF;
      
      -- Add Google Drive files (mock content)
      IF scan_record.google_drive_files IS NOT NULL THEN
        content_to_analyze := content_to_analyze || E'\n\n=== Google Drive Files ===\n';
        content_to_analyze := content_to_analyze || 'Mock content from ' || jsonb_array_length(scan_record.google_drive_files) || ' Google Drive files';
      END IF;
      
      -- If no content, use default
      IF trim(content_to_analyze) = '' THEN
        content_to_analyze := 'Default scan content for ' || scan_record.name;
      END IF;
      
      -- Analyze content (mock)
      analysis_result := mock_analyze_content(content_to_analyze, scan_record.name);
      
      -- Calculate next run time
      next_run_time := calculate_next_run_time(scan_record.frequency, scan_record.time);
      
      -- Update scan with results
      UPDATE scheduled_scans SET
        last_run = now(),
        next_run = next_run_time,
        status = 'completed',
        results = jsonb_build_object(
          'totalAnalyzed', 1,
          'averageAccuracy', (analysis_result->>'accuracy')::numeric,
          'issuesFound', (analysis_result->>'hallucinationsCount')::int,
          'riskLevel', analysis_result->>'riskLevel',
          'processingTime', (analysis_result->>'processingTime')::int,
          'timestamp', now()
        )
      WHERE id = scan_record.id;
      
      successful_scans := successful_scans + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Handle scan error
      failed_scans := failed_scans + 1;
      
      -- Calculate next run time even for failed scans
      next_run_time := calculate_next_run_time(scan_record.frequency, scan_record.time);
      
      -- Update scan with error
      UPDATE scheduled_scans SET
        last_run = now(),
        next_run = next_run_time,
        status = 'error',
        results = jsonb_build_object(
          'error', SQLERRM,
          'timestamp', now(),
          'totalAnalyzed', 0,
          'averageAccuracy', 0,
          'issuesFound', 0,
          'riskLevel', 'low'
        )
      WHERE id = scan_record.id;
    END;
  END LOOP;
  
  -- Log execution completion
  UPDATE scan_executor_logs SET
    status = 'completed',
    scans_processed = total_scans,
    scans_successful = successful_scans,
    scans_failed = failed_scans,
    execution_time_ms = extract(epoch from (now() - execution_start)) * 1000,
    details = jsonb_build_object(
      'start_time', execution_start,
      'end_time', now(),
      'summary', jsonb_build_object(
        'total', total_scans,
        'successful', successful_scans,
        'failed', failed_scans
      )
    )
  WHERE execution_id = execution_id AND status = 'started';
  
  -- Return summary
  RETURN jsonb_build_object(
    'executionId', execution_id,
    'totalScans', total_scans,
    'successfulScans', successful_scans,
    'failedScans', failed_scans,
    'executionTime', extract(epoch from (now() - execution_start)) * 1000,
    'timestamp', now()
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Log critical error
  UPDATE scan_executor_logs SET
    status = 'failed',
    error_message = SQLERRM,
    execution_time_ms = extract(epoch from (now() - execution_start)) * 1000
  WHERE execution_id = execution_id;
  
  -- Re-raise the error
  RAISE;
END;
$$;

-- Create a simple trigger function to process scans (alternative to cron)
CREATE OR REPLACE FUNCTION trigger_scan_processing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only process if there are due scans
  IF EXISTS (
    SELECT 1 FROM scheduled_scans 
    WHERE enabled = true AND next_run <= now()
  ) THEN
    PERFORM process_scheduled_scans();
  END IF;
  
  RETURN NULL;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_next_run_time(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION mock_analyze_content(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION process_scheduled_scans() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_scan_processing() TO authenticated;