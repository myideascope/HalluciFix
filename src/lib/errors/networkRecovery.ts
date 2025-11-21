/**
 * Network Connectivity Recovery System
 * Provides advanced network recovery with background sync and operation replay
 */

import { networkMonitor, NetworkEventType, QueuedOperation } from './networkMonitor';
import { errorRecoveryManager } from './recoveryStrategy';
import { recoveryTracker } from './recoveryTracker';
import { ApiError, ErrorType, ErrorSeverity, ErrorContext } from './types';

import { logger } from './logging';
export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete' | 'custom';
  resource: string;
  data: any;
  timestamp: string;
  retryCount: number;
  maxRetries: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  dependencies?: string[]; // IDs of operations this depends on
  metadata?: {
    userId?: string;
    sessionId?: string;
    component?: string;
    originalUrl?: string;
    [key: string]: any;
  };
}

export interface SyncResult {
  operationId: string;
  success: boolean;
  error?: Error;
  data?: any;
  timestamp: string;
  duration: number;
}

export interface NetworkRecoveryConfig {
  enableBackgroundSync: boolean;
  syncInterval: number;
  maxSyncOperations: number;
  persistOperations: boolean;
  storageKey: string;
  enableConflictResolution: boolean;
  batchSize: number;
  retryDelay: number;
  maxRetryDelay: number;
}

export interface ConflictResolution {
  strategy: 'client-wins' | 'server-wins' | 'merge' | 'manual';
  resolver?: (clientData: any, serverData: any) => any;
}

/**
 * Network Recovery Manager
 * Handles offline operations, background sync, and conflict resolution
 */
export class NetworkRecoveryManager {
  private config: NetworkRecoveryConfig;
  private syncQueue: SyncOperation[] = [];
  private syncInProgress = false;
  private syncInterval?: NodeJS.Timeout;
  private listeners: Set<(result: SyncResult) => void> = new Set();
  private conflictResolvers: Map<string, ConflictResolution> = new Map();

  constructor(config: Partial<NetworkRecoveryConfig> = {}) {
    this.config = {
      enableBackgroundSync: true,
      syncInterval: 30000, // 30 seconds
      maxSyncOperations: 1000,
      persistOperations: true,
      storageKey: 'hallucifix_sync_operations',
      enableConflictResolution: true,
      batchSize: 10,
      retryDelay: 5000,
      maxRetryDelay: 300000, // 5 minutes
      ...config
    };

    this.initialize();
  }

  /**
   * Initialize the network recovery manager
   */
  private initialize(): void {
    // Load persisted operations
    if (this.config.persistOperations) {
      this.loadPersistedOperations();
    }

    // Listen for network events
    networkMonitor.addEventListener(this.handleNetworkEvent);

    // Start background sync if enabled and online
    if (this.config.enableBackgroundSync && networkMonitor.isOnline()) {
      this.startBackgroundSync();
    }

    // Handle page visibility changes
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    // Handle page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  /**
   * Queue operation for background sync
   */
  queueSyncOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>): string {
    const syncOperation: SyncOperation = {
      id: this.generateOperationId(),
      timestamp: new Date().toISOString(),
      retryCount: 0,
      ...operation
    };

    // Check queue size limit
    if (this.syncQueue.length >= this.config.maxSyncOperations) {
      // Remove oldest low-priority operations
      this.syncQueue = this.syncQueue.filter(op => op.priority !== 'low').slice(-this.config.maxSyncOperations + 1);
    }

    // Insert operation based on priority
    const insertIndex = this.findInsertIndex(syncOperation.priority);
    this.syncQueue.splice(insertIndex, 0, syncOperation);

    // Persist operations
    if (this.config.persistOperations) {
      this.persistOperations();
    }

    // Trigger immediate sync if online and not already syncing
    if (networkMonitor.isOnline() && !this.syncInProgress) {
      this.performSync();
    }

    return syncOperation.id;
  }

  /**
   * Remove operation from sync queue
   */
  removeSyncOperation(operationId: string): boolean {
    const index = this.syncQueue.findIndex(op => op.id === operationId);
    if (index !== -1) {
      this.syncQueue.splice(index, 1);
      
      if (this.config.persistOperations) {
        this.persistOperations();
      }
      
      return true;
    }
    return false;
  }

  /**
   * Get pending sync operations
   */
  getPendingSyncOperations(): SyncOperation[] {
    return [...this.syncQueue];
  }

  /**
   * Clear all sync operations
   */
  clearSyncQueue(): void {
    this.syncQueue = [];
    
    if (this.config.persistOperations) {
      this.persistOperations();
    }
  }

  /**
   * Register conflict resolver for a resource type
   */
  registerConflictResolver(resourceType: string, resolution: ConflictResolution): void {
    this.conflictResolvers.set(resourceType, resolution);
  }

  /**
   * Add sync result listener
   */
  addSyncListener(listener: (result: SyncResult) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove sync result listener
   */
  removeSyncListener(listener: (result: SyncResult) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Force immediate sync
   */
  async forcSync(): Promise<SyncResult[]> {
    if (!networkMonitor.isOnline()) {
      throw new Error('Cannot sync while offline');
    }

    return this.performSync();
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): {
    pendingOperations: number;
    totalOperations: number;
    lastSyncTime?: string;
    syncInProgress: boolean;
    operationsByType: Record<string, number>;
    operationsByPriority: Record<string, number>;
  } {
    const operationsByType: Record<string, number> = {};
    const operationsByPriority: Record<string, number> = {};

    this.syncQueue.forEach(op => {
      operationsByType[op.type] = (operationsByType[op.type] || 0) + 1;
      operationsByPriority[op.priority] = (operationsByPriority[op.priority] || 0) + 1;
    });

    return {
      pendingOperations: this.syncQueue.length,
      totalOperations: this.syncQueue.length,
      syncInProgress: this.syncInProgress,
      operationsByType,
      operationsByPriority
    };
  }

  /**
   * Destroy the network recovery manager
   */
  destroy(): void {
    // Stop background sync
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Remove event listeners
    networkMonitor.removeEventListener(this.handleNetworkEvent);
    
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
    }

    // Clear listeners
    this.listeners.clear();
    this.conflictResolvers.clear();

    // Persist final state
    if (this.config.persistOperations) {
      this.persistOperations();
    }
  }

  /**
   * Handle network events
   */
  private handleNetworkEvent = (event: any) => {
    if (event.type === NetworkEventType.ONLINE) {
      // Network restored, start syncing
      if (this.config.enableBackgroundSync) {
        this.startBackgroundSync();
      }
      
      // Perform immediate sync
      this.performSync();
    } else if (event.type === NetworkEventType.OFFLINE) {
      // Network lost, stop background sync
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = undefined;
      }
    }
  };

  /**
   * Handle page visibility changes
   */
  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && networkMonitor.isOnline()) {
      // Page became visible, perform sync
      this.performSync();
    }
  };

  /**
   * Handle page unload
   */
  private handleBeforeUnload = () => {
    // Persist operations before page unload
    if (this.config.persistOperations) {
      this.persistOperations();
    }
  };

  /**
   * Start background sync
   */
  private startBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      if (networkMonitor.isOnline() && this.syncQueue.length > 0) {
        this.performSync();
      }
    }, this.config.syncInterval);
  }

  /**
   * Perform sync operation
   */
  private async performSync(): Promise<SyncResult[]> {
    if (this.syncInProgress || !networkMonitor.isOnline() || this.syncQueue.length === 0) {
      return [];
    }

    this.syncInProgress = true;
    const results: SyncResult[] = [];

    try {
      // Process operations in batches
      const batch = this.syncQueue.splice(0, this.config.batchSize);
      
      for (const operation of batch) {
        const startTime = Date.now();
        
        try {
          // Check dependencies
          if (operation.dependencies && operation.dependencies.length > 0) {
            const dependenciesMet = this.checkDependencies(operation.dependencies);
            if (!dependenciesMet) {
              // Re-queue operation for later
              this.syncQueue.unshift(operation);
              continue;
            }
          }

          // Execute sync operation
          const result = await this.executeSyncOperation(operation);
          const duration = Date.now() - startTime;

          const syncResult: SyncResult = {
            operationId: operation.id,
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
            duration
          };

          results.push(syncResult);
          this.notifyListeners(syncResult);

          // Track successful sync
          this.trackSyncAttempt(operation, true);

        } catch (error) {
          const duration = Date.now() - startTime;
          operation.retryCount++;

          const syncResult: SyncResult = {
            operationId: operation.id,
            success: false,
            error: error as Error,
            timestamp: new Date().toISOString(),
            duration
          };

          results.push(syncResult);
          this.notifyListeners(syncResult);

          // Track failed sync
          this.trackSyncAttempt(operation, false);

          // Handle retry logic
          if (operation.retryCount < operation.maxRetries) {
            // Calculate retry delay with exponential backoff
            const delay = Math.min(
              this.config.retryDelay * Math.pow(2, operation.retryCount - 1),
              this.config.maxRetryDelay
            );

            // Re-queue operation with delay
            setTimeout(() => {
              if (networkMonitor.isOnline()) {
                this.syncQueue.unshift(operation);
                this.performSync();
              }
            }, delay);
          } else {
            // Max retries reached, handle failure
            console.error(`Sync operation ${operation.id} failed after ${operation.maxRetries} retries:`, error);
            
            // Could implement dead letter queue or user notification here
          }
        }
      }

      // Persist updated queue
      if (this.config.persistOperations) {
        this.persistOperations();
      }

    } finally {
      this.syncInProgress = false;
    }

    return results;
  }

  /**
   * Execute a sync operation
   */
  private async executeSyncOperation(operation: SyncOperation): Promise<any> {
    // This would integrate with your actual API
    // For now, we'll simulate the operation
    
    const endpoint = this.getEndpointForOperation(operation);
    const method = this.getMethodForOperation(operation);
    
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // Add authentication headers as needed
      },
      body: operation.data ? JSON.stringify(operation.data) : undefined
    });

    if (!response.ok) {
      // Handle conflict resolution
      if (response.status === 409 && this.config.enableConflictResolution) {
        return this.handleConflict(operation, response);
      }
      
      throw new Error(`Sync operation failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Handle conflict resolution
   */
  private async handleConflict(operation: SyncOperation, response: Response): Promise<any> {
    const resolver = this.conflictResolvers.get(operation.resource);
    
    if (!resolver) {
      throw new Error(`No conflict resolver registered for resource: ${operation.resource}`);
    }

    const serverData = await response.json();
    
    switch (resolver.strategy) {
      case 'client-wins':
        // Force update with client data
        return this.forceUpdate(operation);
        
      case 'server-wins':
        // Accept server data
        return serverData;
        
      case 'merge':
        if (resolver.resolver) {
          const mergedData = resolver.resolver(operation.data, serverData);
          return this.updateWithMergedData(operation, mergedData);
        }
        throw new Error('Merge strategy requires a resolver function');
        
      case 'manual':
        // Queue for manual resolution
        this.queueForManualResolution(operation, serverData);
        throw new Error('Manual conflict resolution required');
        
      default:
        throw new Error(`Unknown conflict resolution strategy: ${resolver.strategy}`);
    }
  }

  /**
   * Track sync attempt
   */
  private trackSyncAttempt(operation: SyncOperation, success: boolean): void {
    const apiError: ApiError = {
      type: ErrorType.NETWORK,
      severity: success ? ErrorSeverity.LOW : ErrorSeverity.MEDIUM,
      errorId: `sync_${operation.id}`,
      timestamp: new Date().toISOString(),
      message: success ? 'Sync operation successful' : 'Sync operation failed',
      userMessage: success ? 'Data synchronized successfully' : 'Failed to synchronize data',
      retryable: !success,
      context: {
        operationType: operation.type,
        resource: operation.resource,
        retryCount: operation.retryCount,
        priority: operation.priority
      }
    };

    recoveryTracker.recordAttempt(
      apiError,
      'background_sync',
      success,
      false // Not user initiated
    );
  }

  /**
   * Utility methods
   */

  private generateOperationId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private findInsertIndex(priority: string): number {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const targetPriority = (priorityOrder as any)[priority] || 2;

    for (let i = 0; i < this.syncQueue.length; i++) {
      const currentPriority = (priorityOrder as any)[this.syncQueue[i].priority] || 2;
      if (currentPriority > targetPriority) {
        return i;
      }
    }

    return this.syncQueue.length;
  }

  private checkDependencies(dependencies: string[]): boolean {
    // Check if all dependencies have been processed
    return dependencies.every(depId => 
      !this.syncQueue.some(op => op.id === depId)
    );
  }

  private getEndpointForOperation(operation: SyncOperation): string {
    // This would map to your actual API endpoints
    const baseUrl = '/api';
    
    switch (operation.type) {
      case 'create':
        return `${baseUrl}/${operation.resource}`;
      case 'update':
        return `${baseUrl}/${operation.resource}/${operation.data.id}`;
      case 'delete':
        return `${baseUrl}/${operation.resource}/${operation.data.id}`;
      default:
        return `${baseUrl}/${operation.resource}`;
    }
  }

  private getMethodForOperation(operation: SyncOperation): string {
    switch (operation.type) {
      case 'create':
        return 'POST';
      case 'update':
        return 'PUT';
      case 'delete':
        return 'DELETE';
      default:
        return 'POST';
    }
  }

  private async forceUpdate(operation: SyncOperation): Promise<any> {
    // Implementation for force update
    throw new Error('Force update not implemented');
  }

  private async updateWithMergedData(operation: SyncOperation, mergedData: any): Promise<any> {
    // Implementation for merged data update
    throw new Error('Merged data update not implemented');
  }

  private queueForManualResolution(operation: SyncOperation, serverData: any): void {
    // Implementation for manual resolution queue
    logger.warn("Manual conflict resolution required for operation:", { operation.id });
  }

  private notifyListeners(result: SyncResult): void {
    this.listeners.forEach(listener => {
      try {
        listener(result);
      } catch (error) {
        logger.error("Error in sync result listener:", error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private persistOperations(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const dataToSave = {
        operations: this.syncQueue,
        timestamp: new Date().toISOString()
      };
      
      localStorage.setItem(this.config.storageKey, JSON.stringify(dataToSave));
    } catch (error) {
      logger.error("Failed to persist sync operations:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  private loadPersistedOperations(): void {
    if (typeof localStorage === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.operations && Array.isArray(data.operations)) {
          this.syncQueue = data.operations;
        }
      }
    } catch (error) {
      logger.error("Failed to load persisted sync operations:", error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// Singleton instance
export const networkRecoveryManager = new NetworkRecoveryManager();

// React hook for network recovery
export const useNetworkRecovery = () => {
  return {
    queueSyncOperation: networkRecoveryManager.queueSyncOperation.bind(networkRecoveryManager),
    removeSyncOperation: networkRecoveryManager.removeSyncOperation.bind(networkRecoveryManager),
    getPendingSyncOperations: networkRecoveryManager.getPendingSyncOperations.bind(networkRecoveryManager),
    clearSyncQueue: networkRecoveryManager.clearSyncQueue.bind(networkRecoveryManager),
    registerConflictResolver: networkRecoveryManager.registerConflictResolver.bind(networkRecoveryManager),
    addSyncListener: networkRecoveryManager.addSyncListener.bind(networkRecoveryManager),
    removeSyncListener: networkRecoveryManager.removeSyncListener.bind(networkRecoveryManager),
    forceSync: networkRecoveryManager.forcSync.bind(networkRecoveryManager),
    getSyncStats: networkRecoveryManager.getSyncStats.bind(networkRecoveryManager)
  };
};

// Utility function to queue operations when offline
export function queueWhenOffline<T>(
  operation: () => Promise<T>,
  syncOperation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>
): Promise<T> {
  if (networkMonitor.isOnline()) {
    return operation();
  } else {
    networkRecoveryManager.queueSyncOperation(syncOperation);
    throw new Error('Operation queued for background sync');
  }
}