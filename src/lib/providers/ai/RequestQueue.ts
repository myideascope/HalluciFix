/**
 * Request Queue System
 * Handles queuing and processing of API requests when rate limits are exceeded
 */

export interface QueuedRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  priority: number;
  estimatedTokens: number;
  createdAt: number;
  maxWaitTime: number;
}

export interface QueueStatus {
  length: number;
  processing: boolean;
  averageWaitTime: number;
  totalProcessed: number;
  totalFailed: number;
}

export class RequestQueue {
  private queue: QueuedRequest<any>[] = [];
  private processing = false;
  private processedCount = 0;
  private failedCount = 0;
  private totalWaitTime = 0;
  private maxQueueSize: number;
  private defaultMaxWaitTime: number;

  constructor(options: { maxQueueSize?: number; defaultMaxWaitTime?: number } = {}) {
    this.maxQueueSize = options.maxQueueSize || 100;
    this.defaultMaxWaitTime = options.defaultMaxWaitTime || 300000; // 5 minutes
  }

  /**
   * Add a request to the queue
   */
  async enqueue<T>(
    execute: () => Promise<T>,
    options: {
      priority?: number;
      estimatedTokens?: number;
      maxWaitTime?: number;
    } = {}
  ): Promise<T> {
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('Request queue is full');
    }

    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        execute,
        resolve,
        reject,
        priority: options.priority || 0,
        estimatedTokens: options.estimatedTokens || 1000,
        createdAt: Date.now(),
        maxWaitTime: options.maxWaitTime || this.defaultMaxWaitTime
      };

      // Insert request in priority order (higher priority first)
      const insertIndex = this.queue.findIndex(r => r.priority < request.priority);
      if (insertIndex === -1) {
        this.queue.push(request);
      } else {
        this.queue.splice(insertIndex, 0, request);
      }

      // Start processing if not already running
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Get current queue status
   */
  getStatus(): QueueStatus {
    return {
      length: this.queue.length,
      processing: this.processing,
      averageWaitTime: this.processedCount > 0 ? this.totalWaitTime / this.processedCount : 0,
      totalProcessed: this.processedCount,
      totalFailed: this.failedCount
    };
  }

  /**
   * Clear the queue (reject all pending requests)
   */
  clear(): void {
    const error = new Error('Queue cleared');
    this.queue.forEach(request => request.reject(error));
    this.queue = [];
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      
      // Check if request has expired
      const waitTime = Date.now() - request.createdAt;
      if (waitTime > request.maxWaitTime) {
        request.reject(new Error('Request timeout: exceeded maximum wait time'));
        this.failedCount++;
        continue;
      }

      try {
        const startTime = Date.now();
        const result = await request.execute();
        const endTime = Date.now();
        
        this.totalWaitTime += (endTime - request.createdAt);
        this.processedCount++;
        
        request.resolve(result);
      } catch (error) {
        this.failedCount++;
        request.reject(error instanceof Error ? error : new Error('Unknown error'));
      }

      // Small delay between requests to avoid overwhelming the API
      await this.sleep(100);
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}