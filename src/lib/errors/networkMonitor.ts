/**
 * Network connectivity monitoring and error handling
 * Provides offline state management and automatic retry when connectivity is restored
 */

import { ErrorType, ApiError } from './types';
import { RetryManager } from './retryManager';

import { logger } from './logging';
/**
 * Network status information
 */
export interface NetworkStatus {
  isOnline: boolean;
  connectionType?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  lastOnlineTime?: string;
  lastOfflineTime?: string;
}

/**
 * Network event types
 */
export enum NetworkEventType {
  ONLINE = 'online',
  OFFLINE = 'offline',
  CONNECTION_CHANGE = 'connection_change'
}

/**
 * Network event data
 */
export interface NetworkEvent {
  type: NetworkEventType;
  status: NetworkStatus;
  timestamp: string;
}

/**
 * Network event listener
 */
export type NetworkEventListener = (event: NetworkEvent) => void;

/**
 * Queued operation for offline execution
 */
export interface QueuedOperation {
  id: string;
  operation: () => Promise<any>;
  timestamp: string;
  retryCount: number;
  maxRetries: number;
  priority: 'low' | 'medium' | 'high';
  metadata?: any;
}

/**
 * Network monitor configuration
 */
export interface NetworkMonitorConfig {
  enableOfflineQueue: boolean;
  maxQueueSize: number;
  queueRetryDelay: number;
  connectionCheckInterval: number;
  connectionCheckUrl?: string;
  enableConnectionQualityMonitoring: boolean;
}

/**
 * Default network monitor configuration
 */
export const DEFAULT_NETWORK_CONFIG: NetworkMonitorConfig = {
  enableOfflineQueue: true,
  maxQueueSize: 100,
  queueRetryDelay: 5000,
  connectionCheckInterval: 30000,
  connectionCheckUrl: '/api/health',
  enableConnectionQualityMonitoring: true
};

/**
 * Network connectivity monitor and error handler
 */
export class NetworkMonitor {
  private config: NetworkMonitorConfig;
  private status: NetworkStatus;
  private listeners: Set<NetworkEventListener> = new Set();
  private operationQueue: QueuedOperation[] = [];
  private retryManager: RetryManager;
  private connectionCheckInterval?: NodeJS.Timeout;
  private isProcessingQueue = false;

  constructor(config: Partial<NetworkMonitorConfig> = {}) {
    this.config = { ...DEFAULT_NETWORK_CONFIG, ...config };
    this.retryManager = new RetryManager();
    
    // Initialize network status
    this.status = this.getCurrentNetworkStatus();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Start connection monitoring
    if (this.config.connectionCheckInterval > 0) {
      this.startConnectionMonitoring();
    }
  }

  /**
   * Get current network status
   */
  getNetworkStatus(): NetworkStatus {
    return { ...this.status };
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.status.isOnline;
  }

  /**
   * Add network event listener
   */
  addEventListener(listener: NetworkEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * Remove network event listener
   */
  removeEventListener(listener: NetworkEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Queue operation for execution when online
   */
  queueOperation(
    operation: () => Promise<any>,
    options: {
      priority?: 'low' | 'medium' | 'high';
      maxRetries?: number;
      metadata?: any;
    } = {}
  ): string {
    if (!this.config.enableOfflineQueue) {
      throw new Error('Offline queue is disabled');
    }

    // Remove oldest operations if queue is full
    while (this.operationQueue.length >= this.config.maxQueueSize) {
      this.operationQueue.shift();
    }

    const queuedOperation: QueuedOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      operation,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      priority: options.priority || 'medium',
      metadata: options.metadata
    };

    // Insert based on priority
    const insertIndex = this.findInsertIndex(queuedOperation.priority);
    this.operationQueue.splice(insertIndex, 0, queuedOperation);

    return queuedOperation.id;
  }

  /**
   * Remove operation from queue
   */
  removeQueuedOperation(operationId: string): boolean {
    const index = this.operationQueue.findIndex(op => op.id === operationId);
    if (index !== -1) {
      this.operationQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get queued operations
   */
  getQueuedOperations(): QueuedOperation[] {
    return [...this.operationQueue];
  }

  /**
   * Clear operation queue
   */
  clearQueue(): void {
    this.operationQueue = [];
  }

  /**
   * Execute operation with network error handling
   */
  async executeWithNetworkHandling<T>(
    operation: () => Promise<T>,
    options: {
      queueOnOffline?: boolean;
      priority?: 'low' | 'medium' | 'high';
      timeout?: number;
    } = {}
  ): Promise<T> {
    // Update status to current navigator state
    this.status = this.getCurrentNetworkStatus();
    
    // Check if online
    if (!this.isOnline()) {
      if (options.queueOnOffline && this.config.enableOfflineQueue) {
        this.queueOperation(operation, {
          priority: options.priority,
          metadata: { originalCall: true }
        });
        
        throw this.createOfflineError();
      } else {
        throw this.createOfflineError();
      }
    }

    try {
      // Add timeout if specified
      if (options.timeout) {
        return await this.withTimeout(operation(), options.timeout);
      }
      
      return await operation();
    } catch (error) {
      // Handle network-related errors
      if (this.isNetworkError(error)) {
        // Update status if we detect we're offline
        if (!navigator.onLine) {
          this.updateNetworkStatus(false);
        }
        
        // Queue operation if offline and queuing is enabled
        if (!this.isOnline() && options.queueOnOffline && this.config.enableOfflineQueue) {
          this.queueOperation(operation, {
            priority: options.priority,
            metadata: { networkError: true }
          });
        }
      }
      
      throw error;
    }
  }

  /**
   * Wait for network connectivity to be restored
   */
  async waitForConnection(timeout?: number): Promise<void> {
    // Update status to current navigator state
    this.status = this.getCurrentNetworkStatus();
    
    if (this.isOnline()) {
      return;
    }

    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;
      
      const onOnline = () => {
        this.removeEventListener(onOnline);
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
      };

      this.addEventListener(onOnline);

      if (timeout) {
        timeoutId = setTimeout(() => {
          this.removeEventListener(onOnline);
          reject(new Error('Timeout waiting for network connection'));
        }, timeout);
      }
    });
  }

  /**
   * Destroy the network monitor
   */
  destroy(): void {
    // Remove event listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }

    // Clear intervals
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    // Clear listeners
    this.listeners.clear();
    
    // Clear queue
    this.clearQueue();
  }

  /**
   * Private methods
   */

  private getCurrentNetworkStatus(): NetworkStatus {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    
    const status: NetworkStatus = {
      isOnline,
      lastOnlineTime: isOnline ? new Date().toISOString() : undefined,
      lastOfflineTime: !isOnline ? new Date().toISOString() : undefined
    };

    // Add connection quality information if available
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection) {
        status.connectionType = connection.type;
        status.effectiveType = connection.effectiveType;
        status.downlink = connection.downlink;
        status.rtt = connection.rtt;
      }
    }

    return status;
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Listen for connection changes if supported
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection && 'addEventListener' in connection) {
        connection.addEventListener('change', this.handleConnectionChange);
      }
    }
  }

  private handleOnline = () => {
    this.updateNetworkStatus(true);
  };

  private handleOffline = () => {
    this.updateNetworkStatus(false);
  };

  private handleConnectionChange = () => {
    const newStatus = this.getCurrentNetworkStatus();
    this.emitEvent({
      type: NetworkEventType.CONNECTION_CHANGE,
      status: newStatus,
      timestamp: new Date().toISOString()
    });
  };

  private updateNetworkStatus(isOnline: boolean): void {
    const wasOnline = this.status.isOnline;
    
    this.status = {
      ...this.getCurrentNetworkStatus(),
      isOnline,
      lastOnlineTime: isOnline ? new Date().toISOString() : this.status.lastOnlineTime,
      lastOfflineTime: !isOnline ? new Date().toISOString() : this.status.lastOfflineTime
    };

    // Emit appropriate event
    const eventType = isOnline ? NetworkEventType.ONLINE : NetworkEventType.OFFLINE;
    this.emitEvent({
      type: eventType,
      status: this.status,
      timestamp: new Date().toISOString()
    });

    // Process queue if we came back online
    if (!wasOnline && isOnline && this.config.enableOfflineQueue) {
      this.processQueue();
    }
  }

  private emitEvent(event: NetworkEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        logger.error("Error in network event listener:", error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.operationQueue.length === 0 || !this.isOnline()) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Process operations in priority order
      while (this.operationQueue.length > 0 && this.isOnline()) {
        const operation = this.operationQueue.shift()!;
        
        try {
          await operation.operation();
          // Operation succeeded, continue to next
        } catch (error) {
          operation.retryCount++;
          
          if (operation.retryCount < operation.maxRetries) {
            // Re-queue for retry
            const insertIndex = this.findInsertIndex(operation.priority);
            this.operationQueue.splice(insertIndex, 0, operation);
          } else {
            // Max retries reached, log error
            console.error(`Queued operation ${operation.id} failed after ${operation.maxRetries} retries:`, error);
          }
        }

        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private findInsertIndex(priority: 'low' | 'medium' | 'high'): number {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const targetPriority = priorityOrder[priority];

    for (let i = 0; i < this.operationQueue.length; i++) {
      const currentPriority = priorityOrder[this.operationQueue[i].priority];
      if (currentPriority > targetPriority) {
        return i;
      }
    }

    return this.operationQueue.length;
  }

  private startConnectionMonitoring(): void {
    this.connectionCheckInterval = setInterval(async () => {
      try {
        await this.checkConnection();
      } catch (error) {
        // Connection check failed, might be offline
        if (this.isOnline()) {
          this.updateNetworkStatus(false);
        }
      }
    }, this.config.connectionCheckInterval);
  }

  private async checkConnection(): Promise<void> {
    if (!this.config.connectionCheckUrl) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(this.config.connectionCheckUrl, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache'
      });

      clearTimeout(timeoutId);

      if (response.ok && !this.isOnline()) {
        this.updateNetworkStatus(true);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private isNetworkError(error: any): boolean {
    if (!error) return false;

    // Check for common network error indicators
    return (
      error.name === 'NetworkError' ||
      error.code === 'NETWORK_ERROR' ||
      error.message?.includes('network') ||
      error.message?.includes('fetch') ||
      error.message?.includes('connection') ||
      (error.response && error.response.status === 0)
    );
  }

  private createOfflineError(): ApiError {
    return {
      type: ErrorType.CONNECTIVITY,
      severity: 'medium' as const,
      errorId: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      message: 'No internet connection available',
      userMessage: 'You appear to be offline. Please check your internet connection and try again.',
      retryable: true,
      context: {
        networkStatus: this.status,
        queueSize: this.operationQueue.length
      }
    };
  }

  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), timeout);
    });

    return Promise.race([promise, timeoutPromise]);
  }
}

/**
 * Global network monitor instance
 */
export const networkMonitor = new NetworkMonitor();

/**
 * Convenience function to execute operations with network handling
 */
export async function executeWithNetworkHandling<T>(
  operation: () => Promise<T>,
  options?: {
    queueOnOffline?: boolean;
    priority?: 'low' | 'medium' | 'high';
    timeout?: number;
  }
): Promise<T> {
  return networkMonitor.executeWithNetworkHandling(operation, options);
}

/**
 * Convenience function to wait for network connection
 */
export async function waitForConnection(timeout?: number): Promise<void> {
  return networkMonitor.waitForConnection(timeout);
}