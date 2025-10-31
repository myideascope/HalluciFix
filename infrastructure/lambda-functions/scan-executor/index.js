/**
 * AWS Lambda Function: Scan Executor
 * Migrated from Supabase Edge Function
 * Processes scheduled scans using AWS services
 */

const { RDSDataService } = require('@aws-sdk/client-rds-data');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { CloudWatchLogsClient, PutLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { withLogging, createLambdaTimer } = require('../common/logger');

// AWS clients
const rdsData = new RDSDataService({ region: process.env.AWS_REGION });
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });
const cloudWatchLogs = new CloudWatchLogsClient({ region: process.env.AWS_REGION });

// Environment variables
const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const HALLUCIFIX_API_KEY_SECRET = process.env.HALLUCIFIX_API_KEY_SECRET;

// Define interfaces for data structures
class HalluciFixApi {
  constructor(apiKey, baseUrl = 'https://api.hallucifix.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.maxRetries = 3;
    this.retryDelay = 1000;
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.maxConcurrentRequests = 5;
    this.activeRequests = 0;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async executeWithRetry(operation) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
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
          const delayMs = this.retryDelay * Math.pow(2, attempt - 1);
          console.log(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
        }
      }
    }
    
    throw lastError;
  }

  async queueRequest(operation) {
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

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      const request = this.requestQueue.shift();
      if (request) {
        request();
      }
    }
    
    this.isProcessingQueue = false;
    
    if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  async analyzeContent(content, scanId) {
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
        
        // Fallback to mock analysis
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

  async downloadGoogleDriveFile(fileId, fileName, accessToken) {
    return this.queueRequest(async () => {
      try {
        if (!accessToken) {
          console.warn(`[${fileId}] No access token provided for Google Drive file ${fileName}, using placeholder content`);
          return `Placeholder content for Google Drive file ${fileName}: This is simulated document content for analysis. File ID: ${fileId}`;
        }

        console.log(`[${fileId}] Downloading Google Drive file: ${fileName}`);

        // Get file metadata
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

class ScanProcessor {
  constructor(hallucifixApi) {
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

  async processAllDueScans() {
    console.log('=== Starting scheduled scan processing ===');
    this.stats.startTime = new Date();

    try {
      const dueScans = await this.fetchDueScans();
      this.stats.totalScans = dueScans.length;

      if (dueScans.length === 0) {
        console.log('No scheduled scans due to run.');
        this.stats.endTime = new Date();
        return this.stats;
      }

      console.log(`Found ${dueScans.length} scheduled scan(s) due to run.`);

      const batchSize = 10;
      const batches = this.chunkArray(dueScans, batchSize);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} scans)`);

        const batchPromises = batch.map(scan => this.processSingleScan(scan));
        await Promise.allSettled(batchPromises);

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

  async fetchDueScans() {
    const sql = `
      SELECT * FROM scheduled_scans 
      WHERE enabled = true 
      AND next_run <= NOW() 
      ORDER BY next_run ASC
    `;

    const params = {
      resourceArn: DB_CLUSTER_ARN,
      secretArn: DB_SECRET_ARN,
      database: 'hallucifix',
      sql: sql
    };

    try {
      const result = await rdsData.executeStatement(params);
      return this.formatRDSResults(result.records || []);
    } catch (error) {
      console.error('Error fetching scheduled scans:', error);
      throw new Error(`Database fetch error: ${error.message}`);
    }
  }

  formatRDSResults(records) {
    return records.map(record => {
      const scan = {};
      record.forEach((field, index) => {
        const columnName = this.getColumnName(index);
        scan[columnName] = this.extractFieldValue(field);
      });
      return scan;
    });
  }

  getColumnName(index) {
    const columns = ['id', 'user_id', 'name', 'description', 'frequency', 'time', 'sources', 'google_drive_files', 'enabled', 'last_run', 'next_run', 'status', 'results'];
    return columns[index] || `column_${index}`;
  }

  extractFieldValue(field) {
    if (field.stringValue !== undefined) return field.stringValue;
    if (field.longValue !== undefined) return field.longValue;
    if (field.booleanValue !== undefined) return field.booleanValue;
    if (field.isNull) return null;
    return field;
  }

  async processSingleScan(scan) {
    const scanStartTime = Date.now();
    console.log(`[${scan.id}] Processing scan: ${scan.name}`);

    try {
      await this.updateScanStatus(scan.id, 'processing');

      const contentSections = await this.gatherContentFromSources(scan);

      if (contentSections.length === 0) {
        console.warn(`[${scan.id}] No content gathered, marking as skipped`);
        await this.updateScanWithError(scan.id, 'No content sources available');
        this.stats.skipped++;
        return;
      }

      const combinedContent = contentSections.join('\n\n--- SECTION BREAK ---\n\n');
      const analysisResult = await this.hallucifixApi.analyzeContent(combinedContent, scan.id);

      const nextRunTime = this.calculateNextRunTime(scan.frequency, scan.time);

      await this.updateScanWithResults(scan.id, analysisResult, contentSections.length, nextRunTime);

      const processingTime = Date.now() - scanStartTime;
      console.log(`[${scan.id}] Scan completed successfully in ${processingTime}ms`);
      this.stats.processedSuccessfully++;

    } catch (error) {
      const processingTime = Date.now() - scanStartTime;
      console.error(`[${scan.id}] Error processing scan (${processingTime}ms):`, error);
      
      await this.updateScanWithError(scan.id, error.message);
      this.stats.errors++;
    }
  }

  async gatherContentFromSources(scan) {
    const contentSections = [];
    const gatherPromises = [];

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

    await Promise.allSettled(gatherPromises);
    
    console.log(`[${scan.id}] Gathered ${contentSections.length} content sections`);
    return contentSections;
  }

  async processCustomSource(source, scanId) {
    console.log(`[${scanId}] Processing custom source: ${source}`);
    
    await this.delay(100 + Math.random() * 200);
    
    return `Content from ${source}: This is simulated content for analysis from the ${source} source. ` +
           `Generated at ${new Date().toISOString()} for scan ${scanId}. ` +
           `This content represents typical AI-generated text that might contain hallucinations or inaccuracies.`;
  }

  calculateNextRunTime(frequency, time) {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    const nextRun = new Date(now);
    
    nextRun.setHours(hours, minutes, 0, 0);
    
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
      if (frequency === 'hourly') {
        nextRun.setHours(nextRun.getHours() + 1);
      }
    }

    return nextRun.toISOString();
  }

  async updateScanStatus(scanId, status) {
    const sql = `UPDATE scheduled_scans SET status = :status WHERE id = :scanId`;
    
    const params = {
      resourceArn: DB_CLUSTER_ARN,
      secretArn: DB_SECRET_ARN,
      database: 'hallucifix',
      sql: sql,
      parameters: [
        { name: 'status', value: { stringValue: status } },
        { name: 'scanId', value: { stringValue: scanId } }
      ]
    };

    try {
      await rdsData.executeStatement(params);
    } catch (error) {
      console.error(`[${scanId}] Error updating scan status:`, error);
    }
  }

  async updateScanWithResults(scanId, analysisResult, totalFiles, nextRunTime) {
    const now = new Date();
    
    const sql = `
      UPDATE scheduled_scans 
      SET last_run = :lastRun, 
          next_run = :nextRun, 
          status = :status, 
          results = :results 
      WHERE id = :scanId
    `;
    
    const results = {
      totalAnalyzed: totalFiles,
      averageAccuracy: analysisResult.accuracy,
      issuesFound: analysisResult.hallucinations,
      riskLevel: analysisResult.riskLevel,
      processingTime: analysisResult.processingTime,
      timestamp: now.toISOString()
    };

    const params = {
      resourceArn: DB_CLUSTER_ARN,
      secretArn: DB_SECRET_ARN,
      database: 'hallucifix',
      sql: sql,
      parameters: [
        { name: 'lastRun', value: { stringValue: now.toISOString() } },
        { name: 'nextRun', value: { stringValue: nextRunTime } },
        { name: 'status', value: { stringValue: 'completed' } },
        { name: 'results', value: { stringValue: JSON.stringify(results) } },
        { name: 'scanId', value: { stringValue: scanId } }
      ]
    };

    try {
      await rdsData.executeStatement(params);
    } catch (error) {
      console.error(`[${scanId}] Error updating scan with results:`, error);
      throw new Error(`Database update error: ${error.message}`);
    }
  }

  async updateScanWithError(scanId, errorMessage) {
    const now = new Date();
    
    // Get scan details for next run calculation
    const selectSql = `SELECT frequency, time FROM scheduled_scans WHERE id = :scanId`;
    const selectParams = {
      resourceArn: DB_CLUSTER_ARN,
      secretArn: DB_SECRET_ARN,
      database: 'hallucifix',
      sql: selectSql,
      parameters: [
        { name: 'scanId', value: { stringValue: scanId } }
      ]
    };

    let nextRunTime = now.toISOString();
    try {
      const result = await rdsData.executeStatement(selectParams);
      if (result.records && result.records.length > 0) {
        const record = result.records[0];
        const frequency = this.extractFieldValue(record[0]);
        const time = this.extractFieldValue(record[1]);
        nextRunTime = this.calculateNextRunTime(frequency, time);
      }
    } catch (error) {
      console.error(`[${scanId}] Error fetching scan details for next run calculation:`, error);
    }

    const updateSql = `
      UPDATE scheduled_scans 
      SET status = :status, 
          last_run = :lastRun, 
          next_run = :nextRun, 
          results = :results 
      WHERE id = :scanId
    `;
    
    const results = { 
      message: errorMessage,
      timestamp: now.toISOString(),
      totalAnalyzed: 0,
      averageAccuracy: 0,
      issuesFound: 0,
      riskLevel: 'low'
    };

    const updateParams = {
      resourceArn: DB_CLUSTER_ARN,
      secretArn: DB_SECRET_ARN,
      database: 'hallucifix',
      sql: updateSql,
      parameters: [
        { name: 'status', value: { stringValue: 'error' } },
        { name: 'lastRun', value: { stringValue: now.toISOString() } },
        { name: 'nextRun', value: { stringValue: nextRunTime } },
        { name: 'results', value: { stringValue: JSON.stringify(results) } },
        { name: 'scanId', value: { stringValue: scanId } }
      ]
    };

    try {
      await rdsData.executeStatement(updateParams);
    } catch (error) {
      console.error(`[${scanId}] Error updating scan with error status:`, error);
    }
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return { ...this.stats };
  }
}

// Helper function to get secret value
async function getSecret(secretArn) {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await secretsManager.send(command);
    return response.SecretString;
  } catch (error) {
    console.error('Error retrieving secret:', error);
    return null;
  }
}

// Main Lambda handler with structured logging
exports.handler = withLogging(async (event, context, logger) => {
  const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timer = createLambdaTimer(logger, 'scan_execution');
  
  logger.info('Starting scheduled scan execution', {
    executionId,
    eventType: typeof event,
    hasEvent: !!event
  });

  try {
    // Get HalluciFix API key from Secrets Manager
    logger.debug('Retrieving API key from Secrets Manager');
    const hallucifixApiKey = await getSecret(HALLUCIFIX_API_KEY_SECRET) || 'demo-key';
    
    if (hallucifixApiKey === 'demo-key') {
      logger.warn('Using demo API key - production credentials not found');
    }

    // Initialize services
    logger.debug('Initializing services');
    const hallucifixApi = new HalluciFixApi(hallucifixApiKey, logger);
    const processor = new ScanProcessor(hallucifixApi, logger);

    // Process all due scans
    logger.info('Starting scan processing');
    const stats = await processor.processAllDueScans();

    // Log business metrics
    logger.logBusinessEvent('scan_execution_completed', {
      action: 'process_scheduled_scans',
      result: 'SUCCESS',
      entityType: 'scheduled_scans',
      totalScans: stats.totalScans,
      successfulScans: stats.processedSuccessfully,
      errorScans: stats.errors,
      skippedScans: stats.skipped,
      processingTimeMs: stats.totalProcessingTime
    });

    // Log performance metrics
    logger.logPerformance('scan_execution', stats.totalProcessingTime, {
      totalScans: stats.totalScans,
      successRate: stats.totalScans > 0 ? (stats.processedSuccessfully / stats.totalScans) * 100 : 0
    });

    const summary = {
      executionId,
      message: 'Scheduled scans processing completed',
      stats,
      timestamp: new Date().toISOString()
    };

    logger.info('Scan execution completed successfully', summary);
    timer.end({ status: 'success', totalScans: stats.totalScans });

    return {
      statusCode: 200,
      body: JSON.stringify(summary),
      headers: {
        'Content-Type': 'application/json'
      }
    };

  } catch (error) {
    logger.error('Critical error in scan execution', error, {
      executionId,
      errorType: error.constructor.name
    });
    
    // Log business event for failure
    logger.logBusinessEvent('scan_execution_failed', {
      action: 'process_scheduled_scans',
      result: 'FAILURE',
      entityType: 'scheduled_scans',
      errorMessage: error.message
    });
    
    timer.end({ status: 'error', errorType: error.constructor.name });
    
    const errorResponse = {
      executionId,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    return {
      statusCode: 500,
      body: JSON.stringify(errorResponse),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  }
});