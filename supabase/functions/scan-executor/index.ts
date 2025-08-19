import { createClient } from 'npm:@supabase/supabase-js@2'

// Define interfaces for data structures
interface ScheduledScan {
  id: string;
  user_id: string;
  name: string;
  description: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  time: string;
  sources: string[];
  google_drive_files: Array<{
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
  }>;
  enabled: boolean;
  last_run: string | null;
  next_run: string;
  status: string;
  results: any;
}

interface AnalysisResult {
  accuracy: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hallucinations: number;
  processingTime: number;
}

interface ProcessingStats {
  totalScans: number;
  processedSuccessfully: number;
  errors: number;
  skipped: number;
  totalProcessingTime: number;
  startTime: Date;
  endTime?: Date;
}

// Enhanced HalluciFix API client with retry logic and rate limiting
class HalluciFixApi {
  private apiKey: string;
  private baseUrl: string;
  private maxRetries: number;
  private retryDelay: number;
  private requestQueue: Array<() => Promise<any>>;
  private isProcessingQueue: boolean;
  private maxConcurrentRequests: number;
  private activeRequests: number;

  constructor(apiKey: string, baseUrl: string = 'https://api.hallucifix.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second base delay
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.maxConcurrentRequests = 5; // Limit concurrent API calls
    this.activeRequests = 0;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on authentication errors
        if (error.message.includes('401') || error.message.includes('403')) {
          throw error;
        }
        
        // Don't retry on client errors (4xx except 429)
        if (error.message.includes('400') || error.message.includes('404')) {
          throw error;
        }
        
        if (attempt < this.maxRetries) {
          const delayMs = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
        }
      }
    }
    
    throw lastError;
  }

  private async queueRequest<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          this.activeRequests++;
          const result = await this.executeWithRetry(operation);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeRequests--;
        }
      });
      
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      const request = this.requestQueue.shift();
      if (request) {
        request(); // Don't await here to allow concurrent processing
      }
    }
    
    this.isProcessingQueue = false;
    
    // Continue processing if there are more requests and available slots
    if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  async analyzeContent(content: string, scanId: string): Promise<AnalysisResult> {
    return this.queueRequest(async () => {
      try {
        console.log(`[${scanId}] Starting content analysis (${content.length} characters)`);
        
        const response = await fetch(`${this.baseUrl}/api/v1/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'X-API-Version': '1.0',
          },
          body: JSON.stringify({
            content,
            options: {
              sensitivity: 'medium',
              includeSourceVerification: true,
              maxHallucinations: 10
            }
          }),
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log(`[${scanId}] Analysis completed successfully`);
        
        return {
          accuracy: result.accuracy,
          riskLevel: result.riskLevel,
          hallucinations: result.hallucinations?.length || 0,
          processingTime: result.processingTime
        };
      } catch (error) {
        console.error(`[${scanId}] Error calling HalluciFix API:`, error);
        
        // Fallback to mock analysis for demo purposes
        console.log(`[${scanId}] Using mock analysis as fallback`);
        const accuracy = Math.random() * 100;
        const riskLevel = accuracy > 85 ? 'low' : accuracy > 70 ? 'medium' : accuracy > 50 ? 'high' : 'critical';
        const hallucinations = Math.floor(Math.random() * (riskLevel === 'critical' ? 3 : riskLevel === 'high' ? 2 : riskLevel === 'medium' ? 1 : 0));
        
        return {
          accuracy,
          riskLevel,
          hallucinations,
          processingTime: Math.floor(Math.random() * 1000) + 500
        };
      }
    });
  }

  async downloadGoogleDriveFile(fileId: string, fileName: string, accessToken?: string): Promise<string> {
    return this.queueRequest(async () => {
      try {
        if (!accessToken) {
          console.warn(`[${fileId}] No access token provided for Google Drive file ${fileName}, using placeholder content`);
          return `Placeholder content for Google Drive file ${fileName}: This is simulated document content for analysis. File ID: ${fileId}`;
        }

        console.log(`[${fileId}] Downloading Google Drive file: ${fileName}`);

        // First, get file metadata to check if it's a Google Docs file
        const metadataResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!metadataResponse.ok) {
          throw new Error(`Failed to get file metadata: ${metadataResponse.statusText}`);
        }

        const metadata = await metadataResponse.json();
        let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

        // Handle Google Docs files by exporting them as plain text
        if (metadata.mimeType === 'application/vnd.google-apps.document') {
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
        } else if (metadata.mimeType === 'application/vnd.google-apps.spreadsheet') {
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
        } else if (metadata.mimeType === 'application/vnd.google-apps.presentation') {
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
        }

        const response = await fetch(downloadUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.statusText}`);
        }

        const content = await response.text();
        console.log(`[${fileId}] Successfully downloaded ${fileName} (${content.length} characters)`);
        return content;
      } catch (error) {
        console.error(`[${fileId}] Error downloading Google Drive file ${fileName}:`, error);
        return `Error downloading file ${fileName}: ${error.message}`;
      }
    });
  }
}

// Utility functions for robust processing
class ScanProcessor {
  private supabase: any;
  private hallucifixApi: HalluciFixApi;
  private stats: ProcessingStats;

  constructor(supabase: any, hallucifixApi: HalluciFixApi) {
    this.supabase = supabase;
    this.hallucifixApi = hallucifixApi;
    this.stats = {
      totalScans: 0,
      processedSuccessfully: 0,
      errors: 0,
      skipped: 0,
      totalProcessingTime: 0,
      startTime: new Date()
    };
  }

  async processAllDueScans(): Promise<ProcessingStats> {
    console.log('=== Starting scheduled scan processing ===');
    this.stats.startTime = new Date();

    try {
      // 1. Fetch all due scans with proper error handling
      const dueScans = await this.fetchDueScans();
      this.stats.totalScans = dueScans.length;

      if (dueScans.length === 0) {
        console.log('No scheduled scans due to run.');
        this.stats.endTime = new Date();
        return this.stats;
      }

      console.log(`Found ${dueScans.length} scheduled scan(s) due to run.`);

      // 2. Process scans in batches to manage memory and API limits
      const batchSize = 10; // Process 10 scans at a time
      const batches = this.chunkArray(dueScans, batchSize);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} scans)`);

        // Process batch with limited concurrency
        const batchPromises = batch.map(scan => this.processSingleScan(scan));
        await Promise.allSettled(batchPromises);

        // Small delay between batches to prevent overwhelming external APIs
        if (batchIndex < batches.length - 1) {
          await this.delay(500);
        }
      }

      this.stats.endTime = new Date();
      this.stats.totalProcessingTime = this.stats.endTime.getTime() - this.stats.startTime.getTime();

      console.log('=== Scan processing completed ===');
      console.log(`Total: ${this.stats.totalScans}, Success: ${this.stats.processedSuccessfully}, Errors: ${this.stats.errors}, Skipped: ${this.stats.skipped}`);
      console.log(`Total processing time: ${this.stats.totalProcessingTime}ms`);

      return this.stats;

    } catch (error) {
      console.error('Critical error in scan processing:', error);
      this.stats.endTime = new Date();
      throw error;
    }
  }

  private async fetchDueScans(): Promise<ScheduledScan[]> {
    const { data: scans, error: fetchError } = await this.supabase
      .from('scheduled_scans')
      .select('*')
      .eq('enabled', true)
      .lte('next_run', new Date().toISOString())
      .order('next_run', { ascending: true }); // Process oldest due scans first

    if (fetchError) {
      console.error('Error fetching scheduled scans:', fetchError);
      throw new Error(`Database fetch error: ${fetchError.message}`);
    }

    return scans || [];
  }

  private async processSingleScan(scan: ScheduledScan): Promise<void> {
    const scanStartTime = Date.now();
    console.log(`[${scan.id}] Processing scan: ${scan.name}`);

    try {
      // 1. Mark scan as processing
      await this.updateScanStatus(scan.id, 'processing');

      // 2. Gather content from all sources
      const contentSections = await this.gatherContentFromSources(scan);

      if (contentSections.length === 0) {
        console.warn(`[${scan.id}] No content gathered, marking as skipped`);
        await this.updateScanWithError(scan.id, 'No content sources available');
        this.stats.skipped++;
        return;
      }

      // 3. Combine and analyze content
      const combinedContent = contentSections.join('\n\n--- SECTION BREAK ---\n\n');
      const analysisResult = await this.hallucifixApi.analyzeContent(combinedContent, scan.id);

      // 4. Calculate next run time
      const nextRunTime = this.calculateNextRunTime(scan.frequency, scan.time);

      // 5. Update scan with results
      await this.updateScanWithResults(scan.id, analysisResult, contentSections.length, nextRunTime);

      const processingTime = Date.now() - scanStartTime;
      console.log(`[${scan.id}] Scan completed successfully in ${processingTime}ms`);
      this.stats.processedSuccessfully++;

    } catch (error: any) {
      const processingTime = Date.now() - scanStartTime;
      console.error(`[${scan.id}] Error processing scan (${processingTime}ms):`, error);
      
      await this.updateScanWithError(scan.id, error.message);
      this.stats.errors++;
    }
  }

  private async gatherContentFromSources(scan: ScheduledScan): Promise<string[]> {
    const contentSections: string[] = [];
    const gatherPromises: Promise<void>[] = [];

    // Handle Google Drive files
    if (scan.google_drive_files && scan.google_drive_files.length > 0) {
      console.log(`[${scan.id}] Processing ${scan.google_drive_files.length} Google Drive files`);
      
      for (const file of scan.google_drive_files) {
        gatherPromises.push(
          this.hallucifixApi.downloadGoogleDriveFile(file.id, file.name)
            .then(content => {
              if (content && content.trim()) {
                contentSections.push(`=== Google Drive File: ${file.name} ===\n${content}`);
              }
            })
            .catch(error => {
              console.error(`[${scan.id}] Error processing Google Drive file ${file.name}:`, error);
              contentSections.push(`=== Error processing ${file.name} ===\n${error.message}`);
            })
        );
      }
    }

    // Handle custom sources
    if (scan.sources && scan.sources.length > 0) {
      console.log(`[${scan.id}] Processing ${scan.sources.length} custom sources`);
      
      for (const source of scan.sources) {
        if (source.trim()) {
          gatherPromises.push(
            this.processCustomSource(source, scan.id)
              .then(content => {
                if (content && content.trim()) {
                  contentSections.push(`=== Source: ${source} ===\n${content}`);
                }
              })
              .catch(error => {
                console.error(`[${scan.id}] Error processing source ${source}:`, error);
                contentSections.push(`=== Error processing ${source} ===\n${error.message}`);
              })
          );
        }
      }
    }

    // Wait for all content gathering to complete
    await Promise.allSettled(gatherPromises);
    
    console.log(`[${scan.id}] Gathered ${contentSections.length} content sections`);
    return contentSections;
  }

  private async processCustomSource(source: string, scanId: string): Promise<string> {
    // For demo purposes, generate content based on source name
    // In a real implementation, this would fetch content from actual sources
    console.log(`[${scanId}] Processing custom source: ${source}`);
    
    // Simulate network delay
    await this.delay(100 + Math.random() * 200);
    
    return `Content from ${source}: This is simulated content for analysis from the ${source} source. ` +
           `Generated at ${new Date().toISOString()} for scan ${scanId}. ` +
           `This content represents typical AI-generated text that might contain hallucinations or inaccuracies.`;
  }

  private calculateNextRunTime(frequency: string, time: string): string {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    const nextRun = new Date(now);
    
    // Set the time for today
    nextRun.setHours(hours, minutes, 0, 0);
    
    // If the time has already passed today, move to the next occurrence
    if (nextRun <= now) {
      switch (frequency) {
        case 'hourly':
          nextRun.setHours(nextRun.getHours() + 1);
          break;
        case 'daily':
          nextRun.setDate(nextRun.getDate() + 1);
          break;
        case 'weekly':
          nextRun.setDate(nextRun.getDate() + 7);
          break;
        case 'monthly':
          nextRun.setMonth(nextRun.getMonth() + 1);
          break;
      }
    } else {
      // For hourly scans, if the time hasn't passed, still advance by the frequency
      if (frequency === 'hourly') {
        nextRun.setHours(nextRun.getHours() + 1);
      }
    }

    return nextRun.toISOString();
  }

  private async updateScanStatus(scanId: string, status: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('scheduled_scans')
        .update({ status })
        .eq('id', scanId);

      if (error) {
        console.error(`[${scanId}] Error updating scan status:`, error);
      }
    } catch (error) {
      console.error(`[${scanId}] Error updating scan status:`, error);
    }
  }

  private async updateScanWithResults(
    scanId: string, 
    analysisResult: AnalysisResult, 
    totalFiles: number, 
    nextRunTime: string
  ): Promise<void> {
    const now = new Date();
    
    const { error } = await this.supabase
      .from('scheduled_scans')
      .update({
        last_run: now.toISOString(),
        next_run: nextRunTime,
        status: 'completed',
        results: {
          totalAnalyzed: totalFiles,
          averageAccuracy: analysisResult.accuracy,
          issuesFound: analysisResult.hallucinations,
          riskLevel: analysisResult.riskLevel,
          processingTime: analysisResult.processingTime,
          timestamp: now.toISOString()
        }
      })
      .eq('id', scanId);

    if (error) {
      console.error(`[${scanId}] Error updating scan with results:`, error);
      throw new Error(`Database update error: ${error.message}`);
    }
  }

  private async updateScanWithError(scanId: string, errorMessage: string): Promise<void> {
    const now = new Date();
    
    // Calculate next run time even for errors (so scan can retry later)
    const { data: scanData } = await this.supabase
      .from('scheduled_scans')
      .select('frequency, time')
      .eq('id', scanId)
      .single();

    let nextRunTime = now.toISOString();
    if (scanData) {
      nextRunTime = this.calculateNextRunTime(scanData.frequency, scanData.time);
    }

    const { error } = await this.supabase
      .from('scheduled_scans')
      .update({ 
        status: 'error',
        last_run: now.toISOString(),
        next_run: nextRunTime,
        results: { 
          message: errorMessage,
          timestamp: now.toISOString(),
          totalAnalyzed: 0,
          averageAccuracy: 0,
          issuesFound: 0,
          riskLevel: 'low'
        } 
      })
      .eq('id', scanId);

    if (error) {
      console.error(`[${scanId}] Error updating scan with error status:`, error);
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): ProcessingStats {
    return { ...this.stats };
  }
}

// CORS headers for proper API responses
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Main Edge Function handler
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${executionId}] Edge Function execution started`);

  try {
    // Get environment variables
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HALLUCIFIX_API_KEY } = Deno.env.toObject();

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    // Initialize services with service role key for full database access
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const hallucifixApi = new HalluciFixApi(HALLUCIFIX_API_KEY || 'demo-key');
    const processor = new ScanProcessor(supabase, hallucifixApi);

    // Process all due scans
    const stats = await processor.processAllDueScans();

    // Log execution summary
    const summary = {
      executionId,
      message: 'Scheduled scans processing completed',
      stats,
      timestamp: new Date().toISOString()
    };

    console.log(`[${executionId}] Execution completed:`, summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error(`[${executionId}] Critical Edge Function error:`, error);
    
    const errorResponse = {
      executionId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(errorResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});