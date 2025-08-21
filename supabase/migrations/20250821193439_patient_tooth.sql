@@ .. @@
 -- Grant execute permission for manual trigger
 GRANT EXECUTE ON FUNCTION public.trigger_scan_executor_now() TO authenticated;
 
--- Optional: Create a more frequent check (every 15 minutes) for critical scans
--- Uncomment the following if you want more frequent execution:
-/*
-SELECT cron.schedule(
-    'frequent-scan-executor',
-    '*/15 * * * *',             -- Every 15 minutes
-    'SELECT public.invoke_scan_executor();'
-);
-*/
+-- Optional: Create a more frequent check (every 15 minutes) for critical scans
+-- Uncomment the following if you want more frequent execution:
+-- SELECT cron.schedule(
+--     'frequent-scan-executor',
+--     '*/15 * * * *',             -- Every 15 minutes
+--     'SELECT public.invoke_scan_executor();'
+-- );
 
 -- Create a view to monitor cron job execution history
 CREATE OR REPLACE VIEW public.scan_executor_logs AS