/**
 * SQS Batch Processing Service
 * Manages batch analysis using AWS SQS for scalable processing
 */

import { SQSClient, SendMessageCommand, SendMessageBatchCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { logger } from './logging';
import { performanceMonitor } from './performanceMonitor';
import { errorManager } from './errors';
import { aiService } from './providers/ai/AIService';
import { AIAnalysisOptions } from './providers/interfaces/AIProvider';

interface BatchJob {
  batchId: string;
  userId: string;
  documents: BatchDocument[];
  options: AIAnalysisOptions;
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
  estimatedCost: number;
}

interface BatchDocument {
  id: string;
  filename?: string;
  content?: string;
  s3Key?: string;
  size?: number;
  contentType?: string;
}

interface BatchResult {
  batchId: string;
  documentId: string;
  success: boolean;
  analysisResult?: any;
  error?: string;
  processingTime: number;
  cost: number;
  timestamp: string;
}

interface QueueConfig {
  queueUrl: string;
  maxMessages: number;
  visibilityTimeout: number;
  messageRetentionPeriod: number;
  deadLetterQueueUrl?: string;
}

interface BatchProgress {
  batchId: string;
  totalDocuments: number;
  processedDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  estimatedTimeRemaining: number;
  currentStatus: 'queued' | 'processing' | 'completed' | 'failed';
  startTime: number;
  lastUpdate: number;
}

export class SQSBatchProcessingService {
  private sqsClient: SQSClient;
  private logger = logger.child({ component: 'SQSBatchProcessingService' });
  private isInitialized = false;
  private processingQueues: Map<string, QueueConfig> = new Map();
  private batchProgress: Map<string, BatchProgress> = new Map();
  private isProcessing = false;

  constructor() {
    this.sqsClient = new SQSClient({
      region: process.env.VITE_AWS_REGION || 'us-east-1',
      credentials: process.env.VITE_AWS_ACCESS_KEY_ID && process.env.VITE_AWS_SECRET_ACCESS_KEY ? {
        accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY,
      } : undefined,
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.logger.info('Initializing SQS Batch Processing Service');

      // Configure processing queues
      this.setupQueues();

      // Initialize AI service
      await aiService.initialize();

      this.isInitialized = true;
      this.logger.info('SQS Batch Processing Service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize SQS Batch Processing Service', error as Error);
      throw error;
    }
  }

  /**
   * Submit a batch job for processing
   */
  async submitBatchJob(job: BatchJob): Promise<{ batchId: string; queuedDocuments: number }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const performanceId = performanceMonitor.startOperation('sqs_submit_batch_job', {
      batchId: job.batchId,
      userId: job.userId,
      documentCount: job.documents.length.toString(),
    });

    try {
      this.logger.info('Submitting batch job to SQS', {
        batchId: job.batchId,
        userId: job.userId,
        documentCount: job.documents.length,
        priority: job.priority,
      });

      // Initialize batch progress tracking
      this.batchProgress.set(job.batchId, {
        batchId: job.batchId,
        totalDocuments: job.documents.length,
        processedDocuments: 0,
        successfulDocuments: 0,
        failedDocuments: 0,
        estimatedTimeRemaining: 0,
        currentStatus: 'queued',
        startTime: Date.now(),
        lastUpdate: Date.now(),
      });

      // Select appropriate queue based on priority
      const queueConfig = this.selectQueue(job.priority);
      
      // Split documents into batches for SQS (max 10 messages per batch)
      const messageBatches = this.createMessageBatches(job);
      let queuedDocuments = 0;

      for (const batch of messageBatches) {
        try {
          if (batch.length === 1) {
            // Single message
            await this.sendSingleMessage(queueConfig.queueUrl, batch[0]);
            queuedDocuments += 1;
          } else {
            // Batch message
            const result = await this.sendMessageBatch(queueConfig.queueUrl, batch);
            queuedDocuments += result.successful;
            
            if (result.failed > 0) {
              this.logger.warn(`Failed to queue ${result.failed} documents in batch`, {
                batchId: job.batchId,
                failed: result.failed,
              });
            }
          }
        } catch (error) {
          this.logger.error('Error sending message batch', error as Error, {
            batchId: job.batchId,
            batchSize: batch.length,
          });
        }
      }

      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        queuedDocuments: queuedDocuments.toString(),
      });

      this.logger.info('Batch job submitted successfully', {
        batchId: job.batchId,
        queuedDocuments,
        totalDocuments: job.documents.length,
      });

      // Record business metrics
      performanceMonitor.recordBusinessMetric('sqs_batch_job_submitted', 1, 'count', {
        userId: job.userId,
        priority: job.priority,
        documentCount: job.documents.length.toString(),
      });

      performanceMonitor.recordBusinessMetric('sqs_documents_queued', queuedDocuments, 'count', {
        userId: job.userId,
        priority: job.priority,
      });

      return {
        batchId: job.batchId,
        queuedDocuments,
      };

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      const handledError = errorManager.handleError(error, {
        component: 'SQSBatchProcessingService',
        feature: 'batch-submission',
        operation: 'submitBatchJob',
        batchId: job.batchId,
        userId: job.userId,
      });

      this.logger.error('Failed to submit batch job', handledError);
      throw handledError;
    }
  }

  /**
   * Get batch processing progress
   */
  getBatchProgress(batchId: string): BatchProgress | null {
    return this.batchProgress.get(batchId) || null;
  }

  /**
   * Start processing messages from queues
   */
  async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('Processing already started');
      return;
    }

    this.isProcessing = true;
    this.logger.info('Starting SQS message processing');

    // Start processing each queue
    for (const [queueName, config] of this.processingQueues.entries()) {
      this.processQueue(queueName, config);
    }
  }

  /**
   * Stop processing messages
   */
  async stopProcessing(): Promise<void> {
    this.isProcessing = false;
    this.logger.info('Stopping SQS message processing');
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(): {
    isProcessing: boolean;
    activeBatches: number;
    totalBatches: number;
    queues: Array<{ name: string; config: QueueConfig }>;
  } {
    return {
      isProcessing: this.isProcessing,
      activeBatches: Array.from(this.batchProgress.values()).filter(p => p.currentStatus === 'processing').length,
      totalBatches: this.batchProgress.size,
      queues: Array.from(this.processingQueues.entries()).map(([name, config]) => ({ name, config })),
    };
  }

  private setupQueues(): void {
    // High priority queue
    this.processingQueues.set('high-priority', {
      queueUrl: process.env.VITE_SQS_HIGH_PRIORITY_QUEUE_URL || '',
      maxMessages: 10,
      visibilityTimeout: 900, // 15 minutes
      messageRetentionPeriod: 1209600, // 14 days
      deadLetterQueueUrl: process.env.VITE_SQS_HIGH_PRIORITY_DLQ_URL,
    });

    // Normal priority queue
    this.processingQueues.set('normal-priority', {
      queueUrl: process.env.VITE_SQS_NORMAL_PRIORITY_QUEUE_URL || '',
      maxMessages: 10,
      visibilityTimeout: 900,
      messageRetentionPeriod: 1209600,
      deadLetterQueueUrl: process.env.VITE_SQS_NORMAL_PRIORITY_DLQ_URL,
    });

    // Low priority queue
    this.processingQueues.set('low-priority', {
      queueUrl: process.env.VITE_SQS_LOW_PRIORITY_QUEUE_URL || '',
      maxMessages: 10,
      visibilityTimeout: 900,
      messageRetentionPeriod: 1209600,
      deadLetterQueueUrl: process.env.VITE_SQS_LOW_PRIORITY_DLQ_URL,
    });
  }

  private selectQueue(priority: 'low' | 'normal' | 'high'): QueueConfig {
    const queueName = `${priority}-priority`;
    const config = this.processingQueues.get(queueName);
    
    if (!config || !config.queueUrl) {
      // Fallback to normal priority if specific queue not configured
      return this.processingQueues.get('normal-priority') || this.processingQueues.values().next().value;
    }
    
    return config;
  }

  private createMessageBatches(job: BatchJob): Array<Array<any>> {
    const batches: Array<Array<any>> = [];
    const batchSize = 10; // SQS batch limit

    for (let i = 0; i < job.documents.length; i += batchSize) {
      const documentBatch = job.documents.slice(i, i + batchSize);
      
      const messages = documentBatch.map((doc, index) => ({
        Id: `${job.batchId}-${i + index}`,
        MessageBody: JSON.stringify({
          batchId: job.batchId,
          userId: job.userId,
          document: doc,
          options: job.options,
          priority: job.priority,
          timestamp: new Date().toISOString(),
        }),
        MessageAttributes: {
          batchId: {
            DataType: 'String',
            StringValue: job.batchId,
          },
          userId: {
            DataType: 'String',
            StringValue: job.userId,
          },
          priority: {
            DataType: 'String',
            StringValue: job.priority,
          },
          documentId: {
            DataType: 'String',
            StringValue: doc.id,
          },
        },
      }));

      batches.push(messages);
    }

    return batches;
  }

  private async sendSingleMessage(queueUrl: string, message: any): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: message.MessageBody,
      MessageAttributes: message.MessageAttributes,
    });

    await this.sqsClient.send(command);
  }

  private async sendMessageBatch(queueUrl: string, messages: any[]): Promise<{ successful: number; failed: number }> {
    const command = new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: messages,
    });

    const result = await this.sqsClient.send(command);
    
    return {
      successful: result.Successful?.length || 0,
      failed: result.Failed?.length || 0,
    };
  }

  private async processQueue(queueName: string, config: QueueConfig): Promise<void> {
    this.logger.debug(`Starting to process queue: ${queueName}`);

    while (this.isProcessing) {
      try {
        // Receive messages from queue
        const command = new ReceiveMessageCommand({
          QueueUrl: config.queueUrl,
          MaxNumberOfMessages: config.maxMessages,
          VisibilityTimeoutSeconds: config.visibilityTimeout,
          WaitTimeSeconds: 20, // Long polling
          MessageAttributeNames: ['All'],
        });

        const result = await this.sqsClient.send(command);
        
        if (!result.Messages || result.Messages.length === 0) {
          // No messages, wait a bit before polling again
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        this.logger.debug(`Received ${result.Messages.length} messages from ${queueName}`);

        // Process messages concurrently
        const processingPromises = result.Messages.map(message => 
          this.processMessage(message, config.queueUrl)
        );

        await Promise.allSettled(processingPromises);

      } catch (error) {
        this.logger.error(`Error processing queue ${queueName}`, error as Error);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    this.logger.debug(`Stopped processing queue: ${queueName}`);
  }

  private async processMessage(message: any, queueUrl: string): Promise<void> {
    let messageBody: any;
    
    try {
      messageBody = JSON.parse(message.Body);
    } catch (error) {
      this.logger.error('Failed to parse message body', error as Error);
      await this.deleteMessage(queueUrl, message.ReceiptHandle);
      return;
    }

    const { batchId, userId, document, options } = messageBody;
    
    const performanceId = performanceMonitor.startOperation('sqs_process_message', {
      batchId,
      userId,
      documentId: document.id,
    });

    try {
      this.logger.debug('Processing document from SQS', {
        batchId,
        documentId: document.id,
        userId,
      });

      // Update batch progress
      this.updateBatchProgress(batchId, 'processing');

      // Get document content
      const content = await this.getDocumentContent(document);
      
      // Perform AI analysis
      const analysisResult = await aiService.analyzeContent(content, options);

      // Create batch result
      const batchResult: BatchResult = {
        batchId,
        documentId: document.id,
        success: true,
        analysisResult,
        processingTime: analysisResult.processingTime,
        cost: await this.calculateProcessingCost(analysisResult),
        timestamp: new Date().toISOString(),
      };

      // Store result (in a real implementation, this would go to a database)
      await this.storeBatchResult(batchResult);

      // Update progress
      this.updateBatchProgress(batchId, 'processing', true);

      // Delete message from queue
      await this.deleteMessage(queueUrl, message.ReceiptHandle);

      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        accuracy: analysisResult.accuracy.toString(),
      });

      this.logger.info('Document processed successfully', {
        batchId,
        documentId: document.id,
        accuracy: analysisResult.accuracy,
      });

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      this.logger.error('Failed to process document', error as Error, {
        batchId,
        documentId: document.id,
      });

      // Create error result
      const errorResult: BatchResult = {
        batchId,
        documentId: document.id,
        success: false,
        error: (error as Error).message,
        processingTime: 0,
        cost: 0,
        timestamp: new Date().toISOString(),
      };

      await this.storeBatchResult(errorResult);
      this.updateBatchProgress(batchId, 'processing', false);

      // Delete message to prevent reprocessing
      await this.deleteMessage(queueUrl, message.ReceiptHandle);
    }
  }

  private async getDocumentContent(document: BatchDocument): Promise<string> {
    if (document.content) {
      return document.content;
    }

    if (document.s3Key) {
      // In a real implementation, this would fetch from S3
      throw new Error('S3 content fetching not implemented in this example');
    }

    throw new Error('No content available for document');
  }

  private async calculateProcessingCost(analysisResult: any): Promise<number> {
    // Calculate cost based on token usage and model
    if (analysisResult.metadata?.tokenUsage && analysisResult.metadata?.provider === 'bedrock') {
      const tokenUsage = analysisResult.metadata.tokenUsage;
      const model = analysisResult.metadata.modelVersion;
      
      // Use the same cost calculation as in the analysis service
      const modelPricing: Record<string, { inputCostPer1K: number; outputCostPer1K: number }> = {
        'anthropic.claude-3-sonnet-20240229-v1:0': { inputCostPer1K: 0.003, outputCostPer1K: 0.015 },
        'anthropic.claude-3-haiku-20240307-v1:0': { inputCostPer1K: 0.00025, outputCostPer1K: 0.00125 },
      };

      const pricing = modelPricing[model];
      if (pricing) {
        const inputCost = (tokenUsage.input / 1000) * pricing.inputCostPer1K;
        const outputCost = (tokenUsage.output / 1000) * pricing.outputCostPer1K;
        return inputCost + outputCost;
      }
    }

    return 0;
  }

  private async storeBatchResult(result: BatchResult): Promise<void> {
    // In a real implementation, this would store to a database
    this.logger.debug('Storing batch result', {
      batchId: result.batchId,
      documentId: result.documentId,
      success: result.success,
    });
  }

  private updateBatchProgress(batchId: string, status: string, success?: boolean): void {
    const progress = this.batchProgress.get(batchId);
    if (!progress) return;

    if (success !== undefined) {
      progress.processedDocuments++;
      if (success) {
        progress.successfulDocuments++;
      } else {
        progress.failedDocuments++;
      }
    }

    progress.currentStatus = status as any;
    progress.lastUpdate = Date.now();

    // Calculate estimated time remaining
    if (progress.processedDocuments > 0) {
      const elapsedTime = Date.now() - progress.startTime;
      const avgTimePerDocument = elapsedTime / progress.processedDocuments;
      const remainingDocuments = progress.totalDocuments - progress.processedDocuments;
      progress.estimatedTimeRemaining = Math.round(avgTimePerDocument * remainingDocuments);
    }

    // Check if batch is complete
    if (progress.processedDocuments >= progress.totalDocuments) {
      progress.currentStatus = 'completed';
      progress.estimatedTimeRemaining = 0;
    }

    this.batchProgress.set(batchId, progress);
  }

  private async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.sqsClient.send(command);
    } catch (error) {
      this.logger.error('Failed to delete message from queue', error as Error);
    }
  }
}

// Export singleton instance
export const sqsBatchProcessingService = new SQSBatchProcessingService();
export default sqsBatchProcessingService;