/**
 * Request Deduplicator
 * Prevents duplicate concurrent requests and manages request queuing
 */

import { logger } from '../logging';

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
  requestCount: number;
  resolvers: Array<{
    resolve: (value: T) => void;
    reject: (error: any) => void;
  }>;
}

export interface DeduplicationOptions {
  ttl?: number; // How long to keep pending requests (ms)
  maxConcurrent?: number; // Max concurrent requests per key
  enableMetrics?: boolean;
}

export interface DeduplicationStats {
  totalRequests: number;
  deduplicatedRequests: number;
  activeRequests: number;
  completedRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  deduplicationRate: number;
}

export class RequestDeduplicator {
  private pendingRequests = new Map<string, PendingRequest<any>>();
  private stats = {
    totalRequests: 0,
    deduplicatedRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    totalResponseTime: 0
  };
  
  private readonly defaultTTL: number;
  private readonly maxConcurrent: number;
  private readonly enableMetrics: boolean;
  private cleanupTimer?: NodeJS.Timeout;
  private logger = logger.child({ component: 'RequestDeduplicator' });

  constructor(options: DeduplicationOptions = {}) {
    this.defaultTTL = options.ttl || 30 * 1000; // 30 seconds default
    this.maxConcurrent = options.maxConcurrent || 10;
    this.enableMetrics = options.enableMetrics !== false;

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.defaultTTL / 2);

    this.logger.info('Request deduplicator initialized', {
      defaultTTL: this.defaultTTL,
      maxConcurrent: this.maxConcurrent,
      enableMetrics: this.enableMetrics
    });
  }

  /**
   * Execute a request with deduplication
   */
  async execute<T>(
    key: string,
    requestFn: () => Promise<T>,
    options: { ttl?: number } = {}
  ): Promise<T> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    // Check if there's already a pending request for this key
    const existing = this.pendingRequests.get(key);
    
    if (existing) {
      // Check if the existing request is still valid
      const age = Date.now() - existing.timestamp;
      if (age < (options.ttl || this.defaultTTL)) {
        // Deduplicate: return the existing promise
        this.stats.deduplicatedRequests++;
        existing.requestCount++;
        
        this.logger.debug('Request deduplicated', { 
          key, 
          age, 
          requestCount: existing.requestCount 
        });

        // Create a new promise that resolves/rejects with the existing one
        return new Promise<T>((resolve, reject) => {
          existing.resolvers.push({ resolve, reject });
        });
      } else {
        // Existing request is too old, remove it
        this.pendingRequests.delete(key);
      }
    }

    // Check concurrent request limit
    if (this.pendingRequests.size >= this.maxConcurrent) {
      const error = new Error(`Too many concurrent requests. Limit: ${this.maxConcurrent}`);
      this.stats.failedRequests++;
      throw error;
    }

    // Create new pending request
    const resolvers: Array<{ resolve: (value: T) => void; reject: (error: any) => void }> = [];
    
    const promise = this.executeRequest(key, requestFn, startTime, resolvers);
    
    const pendingRequest: PendingRequest<T> = {
      promise,
      timestamp: Date.now(),
      requestCount: 1,
      resolvers
    };

    this.pendingRequests.set(key, pendingRequest);

    this.logger.debug('New request started', { 
      key, 
      activeRequests: this.pendingRequests.size 
    });

    return promise;
  }

  /**
   * Cancel a pending request
   */
  cancel(key: string): boolean {
    const pending = this.pendingRequests.get(key);
    if (!pending) return false;

    // Reject all waiting resolvers
    const error = new Error('Request cancelled');
    pending.resolvers.forEach(({ reject }) => reject(error));

    this.pendingRequests.delete(key);
    this.stats.failedRequests++;

    this.logger.debug('Request cancelled', { key });
    return true;
  }

  /**
   * Cancel all pending requests
   */
  cancelAll(): number {
    const count = this.pendingRequests.size;
    const error = new Error('All requests cancelled');

    for (const [key, pending] of this.pendingRequests.entries()) {
      pending.resolvers.forEach(({ reject }) => reject(error));
    }

    this.pendingRequests.clear();
    this.stats.failedRequests += count;

    this.logger.info('All requests cancelled', { count });
    return count;
  }

  /**
   * Get pending request keys
   */
  getPendingKeys(): string[] {
    return Array.from(this.pendingRequests.keys());
  }

  /**
   * Check if a request is pending
   */
  isPending(key: string): boolean {
    return this.pendingRequests.has(key);
  }

  /**
   * Get deduplication statistics
   */
  getStats(): DeduplicationStats {
    const totalRequests = this.stats.totalRequests;
    const deduplicationRate = totalRequests > 0 
      ? (this.stats.deduplicatedRequests / totalRequests) * 100 
      : 0;
    
    const averageResponseTime = this.stats.completedRequests > 0
      ? this.stats.totalResponseTime / this.stats.completedRequests
      : 0;

    return {
      totalRequests,
      deduplicatedRequests: this.stats.deduplicatedRequests,
      activeRequests: this.pendingRequests.size,
      completedRequests: this.stats.completedRequests,
      failedRequests: this.stats.failedRequests,
      averageResponseTime: parseFloat(averageResponseTime.toFixed(2)),
      deduplicationRate: parseFloat(deduplicationRate.toFixed(2))
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      deduplicatedRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0
    };

    this.logger.info('Statistics reset');
  }

  /**
   * Shutdown the deduplicator
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Cancel all pending requests
    this.cancelAll();

    this.logger.info('Request deduplicator shutdown', {
      finalStats: this.getStats()
    });
  }

  private async executeRequest<T>(
    key: string,
    requestFn: () => Promise<T>,
    startTime: number,
    resolvers: Array<{ resolve: (value: T) => void; reject: (error: any) => void }>
  ): Promise<T> {
    try {
      const result = await requestFn();
      const responseTime = Date.now() - startTime;

      // Update statistics
      this.stats.completedRequests++;
      this.stats.totalResponseTime += responseTime;

      // Resolve all waiting promises
      resolvers.forEach(({ resolve }) => resolve(result));

      // Remove from pending requests
      this.pendingRequests.delete(key);

      this.logger.debug('Request completed', { 
        key, 
        responseTime,
        resolverCount: resolvers.length
      });

      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Update statistics
      this.stats.failedRequests++;
      this.stats.totalResponseTime += responseTime;

      // Reject all waiting promises
      resolvers.forEach(({ reject }) => reject(error));

      // Remove from pending requests
      this.pendingRequests.delete(key);

      this.logger.error('Request failed', error as Error, { 
        key, 
        responseTime,
        resolverCount: resolvers.length
      });

      throw error;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, pending] of this.pendingRequests.entries()) {
      const age = now - pending.timestamp;
      if (age > this.defaultTTL) {
        // Timeout the request
        const error = new Error(`Request timeout after ${age}ms`);
        pending.resolvers.forEach(({ reject }) => reject(error));
        
        this.pendingRequests.delete(key);
        this.stats.failedRequests++;
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Cleanup completed', { 
        cleaned, 
        remaining: this.pendingRequests.size 
      });
    }
  }
}

// Export singleton instance
export const requestDeduplicator = new RequestDeduplicator();