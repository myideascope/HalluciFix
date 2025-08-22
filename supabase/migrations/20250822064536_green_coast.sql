@@ .. @@
 */

-- Create enhanced scan executor function with robustness
CREATE OR REPLACE FUNCTION public.process_scheduled_scans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
-    scan_record RECORD;
-    content_sections TEXT[];
-    combined_content TEXT;
-    analysis_result RECORD;
-    next_run_time TIMESTAMP WITH TIME ZONE;
-    processed_count INTEGER := 0;
-    error_count INTEGER := 0;
-    start_time TIMESTAMP WITH TIME ZONE := NOW();
+    scan_record RECORD;
+    content_sections TEXT[];
+    combined_content TEXT;
+    analysis_result RECORD;
+    next_run_time TIMESTAMP WITH TIME ZONE;
+    processed_count INTEGER := 0;
+    error_count INTEGER := 0;
+    skipped_count INTEGER := 0;
+    start_time TIMESTAMP WITH TIME ZONE := NOW();
+    execution_id TEXT;
+    batch_size INTEGER := 10;
+    current_batch INTEGER := 0;
+    total_scans INTEGER := 0;
+    scan_start_time TIMESTAMP WITH TIME ZONE;
+    scan_processing_time INTERVAL;
+    max_content_length INTEGER := 50000;
+    min_content_length INTEGER := 10;
BEGIN
+    -- Generate unique execution ID for tracking
+    execution_id := 'exec_' || extract(epoch from start_time)::text || '_' || 
+                   substr(md5(random()::text), 1, 8);
+    
+    RAISE NOTICE '[%] === Starting scheduled scan processing ===', execution_id;
+    
+    -- Get total count of due scans for progress tracking
+    SELECT COUNT(*) INTO total_scans
+    FROM scheduled_scans 
+    WHERE enabled = true 
+      AND next_run <= NOW()
+      AND status != 'processing'; -- Avoid processing scans already being processed
+    
+    RAISE NOTICE '[%] Found % scheduled scan(s) due to run', execution_id, total_scans;
+    
+    -- Log execution start
+    INSERT INTO scan_executor_logs (execution_id, status, scans_processed, scans_successful, scans_failed, details)
+    VALUES (execution_id, 'started', 0, 0, 0, jsonb_build_object(
+        'total_scans_found', total_scans,
+        'batch_size', batch_size,
+        'start_time', start_time
+    ));
+    
+    -- Early exit if no scans to process
+    IF total_scans = 0 THEN
+        UPDATE scan_executor_logs 
+        SET status = 'completed',
+            execution_time_ms = extract(epoch from (NOW() - start_time)) * 1000,
+            details = details || jsonb_build_object('message', 'No scans due to run')
+        WHERE execution_id = execution_id;
+        
+        RETURN jsonb_build_object(
+            'success', true,
+            'execution_id', execution_id,
+            'message', 'No scheduled scans due to run',
+            'processed', 0,
+            'errors', 0,
+            'skipped', 0,
+            'execution_time_ms', extract(epoch from (NOW() - start_time)) * 1000
+        );
+    END IF;

-    RAISE NOTICE 'Starting scheduled scan processing at %', start_time;
+    -- Process scans in batches to manage memory and prevent timeouts
+    FOR scan_record IN 
+        SELECT * FROM scheduled_scans 
+        WHERE enabled = true 
+          AND next_run <= NOW()
+          AND status != 'processing'
+        ORDER BY next_run ASC, created_at ASC -- Process oldest due scans first
+    LOOP
+        current_batch := current_batch + 1;
+        scan_start_time := NOW();
+        
+        BEGIN
+            RAISE NOTICE '[%] [%/%] Processing scan: % (ID: %)', 
+                        execution_id, current_batch, total_scans, scan_record.name, scan_record.id;
+            
+            -- Mark scan as processing to prevent concurrent execution
+            UPDATE scheduled_scans 
+            SET status = 'processing', 
+                last_run = NOW()
+            WHERE id = scan_record.id;
+            
+            -- Initialize content sections array
+            content_sections := ARRAY[]::TEXT[];
+            
+            -- Process Google Drive files with enhanced error handling
+            IF scan_record.google_drive_files IS NOT NULL AND 
+               jsonb_array_length(scan_record.google_drive_files) > 0 THEN
+                
+                RAISE NOTICE '[%] Processing % Google Drive files for scan %', 
+                            execution_id, jsonb_array_length(scan_record.google_drive_files), scan_record.id;
+                
+                -- Simulate Google Drive file processing with realistic content
+                FOR i IN 0..jsonb_array_length(scan_record.google_drive_files)-1 LOOP
+                    DECLARE
+                        file_info JSONB := scan_record.google_drive_files->i;
+                        file_name TEXT := file_info->>'name';
+                        file_content TEXT;
+                    BEGIN
+                        -- Generate realistic file content based on file name and type
+                        file_content := 'Content from Google Drive file: ' || file_name || E'\n\n' ||
+                                      'This document contains important business information that needs to be verified for accuracy. ' ||
+                                      'Generated at ' || NOW()::text || ' for analysis purposes. ' ||
+                                      'The content includes various claims and statements that may require fact-checking. ' ||
+                                      'Document ID: ' || (file_info->>'id') || E'\n' ||
+                                      'File type: ' || (file_info->>'mimeType') || E'\n\n' ||
+                                      'Sample content with potential hallucinations: ' ||
+                                      'According to recent studies, exactly 73.2% of users prefer this approach. ' ||
+                                      'The research was conducted by leading experts in the field. ' ||
+                                      'Results show unprecedented accuracy rates of 99.9% in all test cases.';
+                        
+                        -- Validate content length
+                        IF length(file_content) >= min_content_length THEN
+                            content_sections := content_sections || ('=== Google Drive File: ' || file_name || ' ===' || E'\n' || file_content);
+                            RAISE NOTICE '[%] Successfully processed Google Drive file: % (% chars)', 
+                                        execution_id, file_name, length(file_content);
+                        ELSE
+                            RAISE WARNING '[%] Skipping Google Drive file % - content too short (% chars)', 
+                                         execution_id, file_name, length(file_content);
+                        END IF;
+                        
+                    EXCEPTION WHEN OTHERS THEN
+                        RAISE WARNING '[%] Error processing Google Drive file %: %', 
+                                     execution_id, file_name, SQLERRM;
+                        -- Continue processing other files
+                    END;
+                END LOOP;
+            END IF;
+            
+            -- Process custom sources with enhanced validation
+            IF scan_record.sources IS NOT NULL AND array_length(scan_record.sources, 1) > 0 THEN
+                RAISE NOTICE '[%] Processing % custom sources for scan %', 
+                            execution_id, array_length(scan_record.sources, 1), scan_record.id;
+                
+                FOR i IN 1..array_length(scan_record.sources, 1) LOOP
+                    DECLARE
+                        source_name TEXT := scan_record.sources[i];
+                        source_content TEXT;
+                    BEGIN
+                        -- Skip empty or null sources
+                        IF source_name IS NULL OR trim(source_name) = '' THEN
+                            CONTINUE;
+                        END IF;
+                        
+                        -- Generate realistic content based on source name
+                        source_content := 'Content from source: ' || source_name || E'\n\n' ||
+                                        'This content represents data collected from ' || source_name || ' at ' || NOW()::text || '. ' ||
+                                        'The information includes various metrics and insights that require accuracy verification. ' ||
+                                        E'\n\nKey findings:\n' ||
+                                        '• Customer satisfaction increased by exactly 47.3% this quarter\n' ||
+                                        '• All survey respondents unanimously agreed with our approach\n' ||
+                                        '• Market research shows 100% adoption rate in target demographics\n' ||
+                                        '• Performance metrics indicate zero errors in the past 90 days\n\n' ||
+                                        'These statistics require verification against actual data sources to ensure accuracy.';
+                        
+                        -- Validate and add content
+                        IF length(source_content) >= min_content_length THEN
+                            content_sections := content_sections || ('=== Source: ' || source_name || ' ===' || E'\n' || source_content);
+                            RAISE NOTICE '[%] Successfully processed source: % (% chars)', 
+                                        execution_id, source_name, length(source_content);
+                        ELSE
+                            RAISE WARNING '[%] Skipping source % - content too short (% chars)', 
+                                         execution_id, source_name, length(source_content);
+                        END IF;
+                        
+                    EXCEPTION WHEN OTHERS THEN
+                        RAISE WARNING '[%] Error processing source %: %', 
+                                     execution_id, source_name, SQLERRM;
+                        -- Continue processing other sources
+                    END;
+                END LOOP;
+            END IF;
+            
+            -- Check if we have any content to analyze
+            IF array_length(content_sections, 1) IS NULL OR array_length(content_sections, 1) = 0 THEN
+                RAISE WARNING '[%] No valid content found for scan %, marking as skipped', 
+                             execution_id, scan_record.id;
+                
+                -- Calculate next run time even for skipped scans
+                next_run_time := calculate_next_run_time(scan_record.frequency, scan_record.time);
+                
+                UPDATE scheduled_scans 
+                SET status = 'error',
+                    next_run = next_run_time,
+                    results = jsonb_build_object(
+                        'error', 'No valid content sources found',
+                        'totalAnalyzed', 0,
+                        'averageAccuracy', 0,
+                        'issuesFound', 0,
+                        'riskLevel', 'low',
+                        'timestamp', NOW(),
+                        'execution_id', execution_id
+                    )
+                WHERE id = scan_record.id;
+                
+                skipped_count := skipped_count + 1;
+                CONTINUE;
+            END IF;
+            
+            -- Combine all content sections
+            combined_content := array_to_string(content_sections, E'\n\n--- SECTION BREAK ---\n\n');
+            
+            -- Truncate content if too long to prevent processing issues
+            IF length(combined_content) > max_content_length THEN
+                combined_content := left(combined_content, max_content_length) || E'\n\n[Content truncated for processing]';
+                RAISE NOTICE '[%] Content truncated from % to % characters for scan %', 
+                            execution_id, length(array_to_string(content_sections, E'\n\n--- SECTION BREAK ---\n\n')), 
+                            length(combined_content), scan_record.id;
+            END IF;
+            
+            RAISE NOTICE '[%] Analyzing combined content (% chars, % sections) for scan %', 
+                        execution_id, length(combined_content), array_length(content_sections, 1), scan_record.id;
+            
+            -- Perform enhanced mock analysis
+            SELECT * INTO analysis_result 
+            FROM mock_analyze_content(combined_content, array_length(content_sections, 1));
+            
+            -- Calculate next run time
+            next_run_time := calculate_next_run_time(scan_record.frequency, scan_record.time);
+            scan_processing_time := NOW() - scan_start_time;
+            
+            -- Update scan with comprehensive results
+            UPDATE scheduled_scans 
+            SET last_run = scan_start_time,
+                next_run = next_run_time,
+                status = 'completed',
+                results = jsonb_build_object(
+                    'totalAnalyzed', array_length(content_sections, 1),
+                    'averageAccuracy', analysis_result.accuracy,
+                    'issuesFound', analysis_result.hallucinations_count,
+                    'riskLevel', analysis_result.risk_level,
+                    'processingTime', analysis_result.processing_time,
+                    'contentLength', length(combined_content),
+                    'timestamp', NOW(),
+                    'execution_id', execution_id,
+                    'scan_duration_ms', extract(epoch from scan_processing_time) * 1000,
+                    'next_scheduled', next_run_time
+                )
+            WHERE id = scan_record.id;
+            
+            processed_count := processed_count + 1;
+            
+            RAISE NOTICE '[%] Successfully completed scan % in % - Next run: %', 
+                        execution_id, scan_record.id, scan_processing_time, next_run_time;
+            
+        EXCEPTION WHEN OTHERS THEN
+            scan_processing_time := NOW() - scan_start_time;
+            error_count := error_count + 1;
+            
+            RAISE WARNING '[%] Error processing scan % after %: % (SQLSTATE: %)', 
+                         execution_id, scan_record.id, scan_processing_time, SQLERRM, SQLSTATE;
+            
+            -- Calculate next run time even for failed scans
+            next_run_time := calculate_next_run_time(scan_record.frequency, scan_record.time);
+            
+            -- Update scan with error information
+            UPDATE scheduled_scans 
+            SET status = 'error',
+                next_run = next_run_time,
+                results = jsonb_build_object(
+                    'error', SQLERRM,
+                    'error_code', SQLSTATE,
+                    'totalAnalyzed', 0,
+                    'averageAccuracy', 0,
+                    'issuesFound', 0,
+                    'riskLevel', 'low',
+                    'timestamp', NOW(),
+                    'execution_id', execution_id,
+                    'scan_duration_ms', extract(epoch from scan_processing_time) * 1000,
+                    'next_scheduled', next_run_time
+                )
+            WHERE id = scan_record.id;
+        END;
+        
+        -- Add small delay between scans to prevent overwhelming the system
+        IF current_batch % batch_size = 0 THEN
+            RAISE NOTICE '[%] Completed batch of % scans, brief pause before continuing', 
+                        execution_id, batch_size;
+            -- In a real implementation, you might add a small delay here
+        END IF;
+    END LOOP;

-    -- Process each due scan
-    FOR scan_record IN 
-        SELECT * FROM scheduled_scans 
-        WHERE enabled = true AND next_run <= NOW()
-        ORDER BY next_run ASC
-    LOOP
-        BEGIN
-            RAISE NOTICE 'Processing scan: % (ID: %)', scan_record.name, scan_record.id;
-            
-            -- Initialize content sections
-            content_sections := ARRAY[]::TEXT[];
-            
-            -- Process Google Drive files (mock implementation)
-            IF scan_record.google_drive_files IS NOT NULL THEN
-                FOR i IN 0..jsonb_array_length(scan_record.google_drive_files)-1 LOOP
-                    content_sections := content_sections || ('Google Drive file content: ' || (scan_record.google_drive_files->i->>'name'));
-                END LOOP;
-            END IF;
-            
-            -- Process custom sources
-            IF scan_record.sources IS NOT NULL THEN
-                FOR i IN 1..array_length(scan_record.sources, 1) LOOP
-                    content_sections := content_sections || ('Source content: ' || scan_record.sources[i]);
-                END LOOP;
-            END IF;
-            
-            -- Combine content
-            combined_content := array_to_string(content_sections, E'\n\n');
-            
-            -- Perform analysis
-            SELECT * INTO analysis_result FROM mock_analyze_content(combined_content, array_length(content_sections, 1));
-            
-            -- Calculate next run time
-            next_run_time := calculate_next_run_time(scan_record.frequency, scan_record.time);
-            
-            -- Update scan with results
-            UPDATE scheduled_scans 
-            SET last_run = NOW(),
-                next_run = next_run_time,
-                status = 'completed',
-                results = jsonb_build_object(
-                    'totalAnalyzed', array_length(content_sections, 1),
-                    'averageAccuracy', analysis_result.accuracy,
-                    'issuesFound', analysis_result.hallucinations_count,
-                    'riskLevel', analysis_result.risk_level,
-                    'timestamp', NOW()
-                )
-            WHERE id = scan_record.id;
-            
-            processed_count := processed_count + 1;
-            
-        EXCEPTION WHEN OTHERS THEN
-            error_count := error_count + 1;
-            RAISE WARNING 'Error processing scan %: %', scan_record.id, SQLERRM;
-            
-            -- Update scan with error
-            UPDATE scheduled_scans 
-            SET status = 'error',
-                results = jsonb_build_object('error', SQLERRM, 'timestamp', NOW())
-            WHERE id = scan_record.id;
-        END;
-    END LOOP;
+    -- Log final execution results
+    UPDATE scan_executor_logs 
+    SET status = CASE 
+                    WHEN error_count = 0 THEN 'completed'
+                    WHEN processed_count > 0 THEN 'completed_with_errors'
+                    ELSE 'failed'
+                 END,
+        scans_processed = processed_count + error_count + skipped_count,
+        scans_successful = processed_count,
+        scans_failed = error_count,
+        execution_time_ms = extract(epoch from (NOW() - start_time)) * 1000,
+        details = details || jsonb_build_object(
+            'scans_skipped', skipped_count,
+            'total_batches', current_batch,
+            'end_time', NOW(),
+            'average_scan_time_ms', CASE 
+                                      WHEN (processed_count + error_count) > 0 
+                                      THEN (extract(epoch from (NOW() - start_time)) * 1000) / (processed_count + error_count)
+                                      ELSE 0 
+                                   END
+        )
+    WHERE execution_id = execution_id;

-    RAISE NOTICE 'Scan processing completed. Processed: %, Errors: %', processed_count, error_count;
+    RAISE NOTICE '[%] === Scan processing completed ===', execution_id;
+    RAISE NOTICE '[%] Total: %, Successful: %, Errors: %, Skipped: %, Duration: %', 
+                execution_id, (processed_count + error_count + skipped_count), 
+                processed_count, error_count, skipped_count, (NOW() - start_time);

     RETURN jsonb_build_object(
         'success', true,
+        'execution_id', execution_id,
         'processed', processed_count,
         'errors', error_count,
-        'execution_time_ms', extract(epoch from (NOW() - start_time)) * 1000
+        'skipped', skipped_count,
+        'total_scans', total_scans,
+        'execution_time_ms', extract(epoch from (NOW() - start_time)) * 1000,
+        'average_scan_time_ms', CASE 
+                                  WHEN (processed_count + error_count) > 0 
+                                  THEN (extract(epoch from (NOW() - start_time)) * 1000) / (processed_count + error_count)
+                                  ELSE 0 
+                               END
     );
+    
+EXCEPTION WHEN OTHERS THEN
+    -- Handle any unexpected errors at the top level
+    RAISE ERROR '[%] Critical error in scan processing: % (SQLSTATE: %)', 
+               execution_id, SQLERRM, SQLSTATE;
+    
+    -- Log the critical error
+    UPDATE scan_executor_logs 
+    SET status = 'failed',
+        error_message = SQLERRM,
+        execution_time_ms = extract(epoch from (NOW() - start_time)) * 1000,
+        details = details || jsonb_build_object(
+            'critical_error', SQLERRM,
+            'error_code', SQLSTATE,
+            'failed_at', NOW()
+        )
+    WHERE execution_id = execution_id;
+    
+    RETURN jsonb_build_object(
+        'success', false,
+        'execution_id', execution_id,
+        'error', SQLERRM,
+        'error_code', SQLSTATE,
+        'processed', processed_count,
+        'errors', error_count + 1,
+        'skipped', skipped_count,
+        'execution_time_ms', extract(epoch from (NOW() - start_time)) * 1000
+    );
 END;
 $$;

@@ .. @@
 -- Enhanced mock analysis function with more realistic behavior
 CREATE OR REPLACE FUNCTION public.mock_analyze_content(content TEXT, source_count INTEGER DEFAULT 1)
 RETURNS TABLE(
     accuracy NUMERIC,
     risk_level TEXT,
     hallucinations_count INTEGER,
     processing_time INTEGER
 )
 LANGUAGE plpgsql
 AS $$
 DECLARE
+    content_length INTEGER;
+    complexity_factor NUMERIC;
+    base_accuracy NUMERIC;
+    accuracy_variance NUMERIC;
+    final_accuracy NUMERIC;
+    risk_threshold_high NUMERIC := 50;
+    risk_threshold_medium NUMERIC := 70;
+    risk_threshold_low NUMERIC := 85;
+    hallucination_indicators TEXT[] := ARRAY[
+        'exactly', 'precisely', '100%', 'all experts agree', 'unanimously', 
+        'zero errors', 'perfect', 'unprecedented', 'revolutionary breakthrough',
+        'studies show', 'research proves', 'scientists confirm'
+    ];
+    indicator TEXT;
+    hallucination_score INTEGER := 0;
+    processing_delay INTEGER;
 BEGIN
+    -- Calculate content metrics
+    content_length := length(content);
+    complexity_factor := LEAST(content_length / 1000.0, 5.0); -- Cap at 5x multiplier
+    
+    -- Base accuracy starts high and decreases with complexity and suspicious patterns
+    base_accuracy := 95.0 - (complexity_factor * 2);
+    
+    -- Check for hallucination indicators
+    FOREACH indicator IN ARRAY hallucination_indicators LOOP
+        IF position(lower(indicator) in lower(content)) > 0 THEN
+            hallucination_score := hallucination_score + 1;
+            base_accuracy := base_accuracy - (random() * 15 + 5); -- Reduce accuracy by 5-20 points
+        END IF;
+    END LOOP;
+    
+    -- Add some randomness but keep it realistic
+    accuracy_variance := (random() - 0.5) * 20; -- ±10 points variance
+    final_accuracy := GREATEST(0, LEAST(100, base_accuracy + accuracy_variance));
+    
+    -- Determine risk level based on accuracy
+    IF final_accuracy >= risk_threshold_low THEN
+        risk_level := 'low';
+    ELSIF final_accuracy >= risk_threshold_medium THEN
+        risk_level := 'medium';
+    ELSIF final_accuracy >= risk_threshold_high THEN
+        risk_level := 'high';
+    ELSE
+        risk_level := 'critical';
+    END IF;
+    
+    -- Calculate hallucinations based on risk level and indicators found
+    hallucinations_count := CASE risk_level
+        WHEN 'low' THEN LEAST(hallucination_score, 1)
+        WHEN 'medium' THEN LEAST(hallucination_score + floor(random() * 2), 3)
+        WHEN 'high' THEN LEAST(hallucination_score + floor(random() * 3), 5)
+        WHEN 'critical' THEN LEAST(hallucination_score + floor(random() * 4) + 1, 8)
+        ELSE 0
+    END;
+    
+    -- Simulate realistic processing time based on content length and complexity
+    processing_delay := 500 + floor(content_length / 10) + floor(random() * 2000);
+    processing_time := GREATEST(100, LEAST(10000, processing_delay)); -- Between 100ms and 10s
+    
+    -- Return results
     accuracy := 75 + (random() * 20); -- 75-95% accuracy
-    risk_level := CASE 
-        WHEN accuracy > 90 THEN 'low'
-        WHEN accuracy > 75 THEN 'medium'
-        WHEN accuracy > 60 THEN 'high'
-        ELSE 'critical'
-    END;
-    hallucinations_count := floor(random() * 3);
-    processing_time := 1000 + floor(random() * 2000); -- 1-3 seconds
+    accuracy := final_accuracy;
     
     RETURN NEXT;
 END;
 $$;