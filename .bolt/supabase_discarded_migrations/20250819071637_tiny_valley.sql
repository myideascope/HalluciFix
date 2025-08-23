/*
  # Set up automated scan scheduling

  1. Database Functions
    - Create function to invoke the scan-executor Edge Function
    - Set up pg_cron job to run the function periodically

  2. Security
    - Function uses service role key for Edge Function authentication
    - Proper error handling and logging

  3. Scheduling
    - Runs every hour to check for due scans
    - Can be adjusted based on requirements
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- Create function to invoke the scan-executor Edge Function
CREATE OR REPLACE FUNCTION public.invoke_scan_executor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    edge_function_url text;
    service_role_key text;
    request_body jsonb := '{}';
    response_status_code int;
    response_body text;
    response_headers jsonb;
BEGIN
    -- Get the Edge Function URL from your Supabase project
    -- Replace with your actual Edge Function URL
    edge_function_url := 'https://your-project-ref.supabase.co/functions/v1/scan-executor';
    
    -- Get service role key from vault (recommended) or set directly
    -- Replace with your actual service role key
    service_role_key := 'your-service-role-key';
    
    -- Log the attempt
    RAISE NOTICE 'Invoking scan executor at %', now();
    
    -- Make HTTP POST request to Edge Function
    SELECT
        status_code, content, headers
    INTO
        response_status_code, response_body, response_headers
    FROM
        http((
            'POST',
            edge_function_url,
            ARRAY[
                http_header('Content-Type', 'application/json'),
                http_header('Authorization', 'Bearer ' || service_role_key)
            ],
            'application/json',
            request_body::text
        ));

    -- Log the response
    RAISE NOTICE 'Edge Function Response Status: %', response_status_code;
    RAISE NOTICE 'Edge Function Response Body: %', response_body;

    -- Check if request was successful
    IF response_status_code != 200 THEN
        RAISE WARNING 'Edge Function returned non-200 status: % - %', response_status_code, response_body;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error invoking scan executor: %', SQLERRM;
END;
$$;

-- Grant execute permission to the postgres role
GRANT EXECUTE ON FUNCTION public.invoke_scan_executor() TO postgres;

-- Schedule the function to run every hour
-- This will check for and execute any due scheduled scans
SELECT cron.schedule(
    'hourly-scan-executor',     -- Job name
    '0 * * * *',                -- Cron expression: every hour at minute 0
    'SELECT public.invoke_scan_executor();'  -- Function to call
);

-- Optional: Create a more frequent check (every 15 minutes)
-- Uncomment the following if you want more frequent checks:
/*
SELECT cron.schedule(
    'frequent-scan-executor',
    '*/15 * * * *',             -- Every 15 minutes
    'SELECT public.invoke_scan_executor();'
);
*/

-- View scheduled jobs
-- SELECT * FROM cron.job;

-- View job execution history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;