/*
  # Set up automated scan scheduler using pg_cron

  1. Extensions
    - Enable pg_cron for scheduled jobs
    - Enable pg_net for HTTP requests

  2. Database Functions
    - Create function to invoke scan-executor Edge Function
    - Add proper error handling and logging

  3. Scheduled Jobs
    - Set up cron job to run every hour
    - Configure proper authentication and monitoring

  Note: You must update the edge_function_url and service_role_key 
  with your actual values after deploying the Edge Function.
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to invoke the scan-executor Edge Function
CREATE OR REPLACE FUNCTION public.invoke_scan_executor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Run with elevated privileges
AS $$
DECLARE
    edge_function_url text := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/scan-executor'; -- Replace with your actual URL
    service_role_key text := 'YOUR_SERVICE_ROLE_KEY'; -- Replace with your actual service role key
    request_body jsonb := jsonb_build_object(
        'timestamp', extract(epoch from now()),
        'trigger', 'pg_cron'
    );
    response_record record;
    response_status_code int;
    response_body text;
    execution_start_time timestamp := now();
    execution_duration interval;
BEGIN
    -- Log the start of execution
    RAISE NOTICE '[CRON] Starting scan executor at %', execution_start_time;

    BEGIN
        -- Make HTTP POST request to Edge Function
        SELECT
            status_code, content
        INTO
            response_status_code, response_body
        FROM
            net.http_post(
                url := edge_function_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || service_role_key,
                    'X-Triggered-By', 'pg_cron'
                ),
                body := request_body,
                timeout_milliseconds := 300000 -- 5 minute timeout
            );

        execution_duration := now() - execution_start_time;

        -- Log successful execution
        RAISE NOTICE '[CRON] Edge Function completed in % - Status: % - Response: %', 
                     execution_duration, response_status_code, left(response_body, 200);

        -- Return success response
        RETURN jsonb_build_object(
            'success', true,
            'status_code', response_status_code,
            'execution_time', extract(epoch from execution_duration),
            'timestamp', execution_start_time,
            'response_preview', left(response_body, 500)
        );

    EXCEPTION WHEN OTHERS THEN
        execution_duration := now() - execution_start_time;
        
        -- Log error details
        RAISE WARNING '[CRON] Edge Function failed after % - Error: % - Detail: %', 
                      execution_duration, SQLERRM, SQLSTATE;

        -- Return error response
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'error_code', SQLSTATE,
            'execution_time', extract(epoch from execution_duration),
            'timestamp', execution_start_time
        );
    END;
END;
$$;

-- Grant execute permission to the postgres role (required for pg_cron)
GRANT EXECUTE ON FUNCTION public.invoke_scan_executor() TO postgres;

-- Schedule the function to run every hour at minute 0
-- This will check for and process any due scheduled scans
SELECT cron.schedule(
    'hourly-scan-executor',     -- Job name
    '0 * * * *',                -- Cron expression: every hour at minute 0
    'SELECT public.invoke_scan_executor();' -- SQL command to execute
);

-- Optional: Create a more frequent check (every 15 minutes) for critical scans
-- Uncomment the following if you want more frequent execution:
/*
SELECT cron.schedule(
    'frequent-scan-executor',
    '*/15 * * * *',             -- Every 15 minutes
    'SELECT public.invoke_scan_executor();'
);
*/

-- Create a function to manually trigger scan execution (useful for testing)
CREATE OR REPLACE FUNCTION public.trigger_scan_executor_now()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RAISE NOTICE '[MANUAL] Manually triggering scan executor';
    RETURN public.invoke_scan_executor();
END;
$$;

-- Grant execute permission for manual trigger
GRANT EXECUTE ON FUNCTION public.trigger_scan_executor_now() TO authenticated;

-- Create a view to monitor cron job execution history
CREATE OR REPLACE VIEW public.scan_executor_logs AS
SELECT 
    jobid,
    jobname,
    start_time,
    end_time,
    status,
    return_message,
    (end_time - start_time) as duration
FROM cron.job_run_details 
WHERE jobname IN ('hourly-scan-executor', 'frequent-scan-executor')
ORDER BY start_time DESC;

-- Grant access to the logs view
GRANT SELECT ON public.scan_executor_logs TO authenticated;