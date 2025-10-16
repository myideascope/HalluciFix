/**
 * Network Recovery Hook
 * Provides React integration for network connectivity monitoring and recovery
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  networkMonitor, 
  networkRecoveryManager, 
  NetworkEventType,
  type NetworkStatus,
  type SyncOperation,
  type SyncResult
} from '../lib/errors';

export interface NetworkState {
  isOnline: boolean;
  isConnecting: boolean;
  lastOnlineTime?: string;
  lastOfflineTime?: string;
  connectionType?: string;
  effectiveType?: string;
  pendingSyncOperations: number;
  syncInProgress: boolean;
}

export interface NetworkRecoveryActions {
  retry: () => Promise<void>;
  queueOperation: (operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>) => string;
  clearQueue: () => void;
  forceSync: () => Promise<SyncResult[]>;
  executeWhenOnline: <T>(operation: () => Promise<T>) => Promise<T>;
}

/**
 * Hook for network connectivity monitoring and recovery
 */
export const useNetworkRecovery = (): [NetworkState, NetworkRecoveryActions] => {
  const [networkState, setNetworkState] = useState<NetworkState>(() => {
    const status = networkMonitor.getNetworkStatus();
    const syncStats = networkRecoveryManager.getSyncStats();
    
    return {
      isOnline: status.isOnline,
      isConnecting: false,
      lastOnlineTime: status.lastOnlineTime,
      lastOfflineTime: status.lastOfflineTime,
      connectionType: status.connectionType,
      effectiveType: status.effectiveType,
      pendingSyncOperations: syncStats.pendingOperations,
      syncInProgress: syncStats.syncInProgress
    };
  });

  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const syncListenerRef = useRef<(result: SyncResult) => void>();

  // Update network state when network events occur
  useEffect(() => {
    const handleNetworkEvent = (event: any) => {
      const status = networkMonitor.getNetworkStatus();
      const syncStats = networkRecoveryManager.getSyncStats();
      
      setNetworkState(prev => ({
        ...prev,
        isOnline: status.isOnline,
        lastOnlineTime: status.lastOnlineTime,
        lastOfflineTime: status.lastOfflineTime,
        connectionType: status.connectionType,
        effectiveType: status.effectiveType,
        pendingSyncOperations: syncStats.pendingOperations,
        syncInProgress: syncStats.syncInProgress,
        isConnecting: event.type === NetworkEventType.ONLINE && prev.isConnecting
      }));
    };

    networkMonitor.addEventListener(handleNetworkEvent);

    return () => {
      networkMonitor.removeEventListener(handleNetworkEvent);
    };
  }, []);

  // Listen for sync results to update pending operations count
  useEffect(() => {
    const handleSyncResult = (result: SyncResult) => {
      const syncStats = networkRecoveryManager.getSyncStats();
      
      setNetworkState(prev => ({
        ...prev,
        pendingSyncOperations: syncStats.pendingOperations,
        syncInProgress: syncStats.syncInProgress
      }));
    };

    syncListenerRef.current = handleSyncResult;
    networkRecoveryManager.addSyncListener(handleSyncResult);

    return () => {
      if (syncListenerRef.current) {
        networkRecoveryManager.removeSyncListener(syncListenerRef.current);
      }
    };
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Retry network connection
  const retry = useCallback(async (): Promise<void> => {
    if (networkState.isOnline || networkState.isConnecting) {
      return;
    }

    setNetworkState(prev => ({ ...prev, isConnecting: true }));

    try {
      // Wait for connection with timeout
      await networkMonitor.waitForConnection(10000);
      
      setNetworkState(prev => ({ 
        ...prev, 
        isConnecting: false,
        isOnline: true 
      }));
    } catch (error) {
      setNetworkState(prev => ({ ...prev, isConnecting: false }));
      throw error;
    }
  }, [networkState.isOnline, networkState.isConnecting]);

  // Queue operation for background sync
  const queueOperation = useCallback((
    operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>
  ): string => {
    const operationId = networkRecoveryManager.queueSyncOperation(operation);
    
    // Update pending operations count
    const syncStats = networkRecoveryManager.getSyncStats();
    setNetworkState(prev => ({
      ...prev,
      pendingSyncOperations: syncStats.pendingOperations
    }));
    
    return operationId;
  }, []);

  // Clear sync queue
  const clearQueue = useCallback((): void => {
    networkRecoveryManager.clearSyncQueue();
    
    setNetworkState(prev => ({
      ...prev,
      pendingSyncOperations: 0
    }));
  }, []);

  // Force immediate sync
  const forceSync = useCallback(async (): Promise<SyncResult[]> => {
    if (!networkState.isOnline) {
      throw new Error('Cannot sync while offline');
    }

    setNetworkState(prev => ({ ...prev, syncInProgress: true }));
    
    try {
      const results = await networkRecoveryManager.forceSync();
      
      const syncStats = networkRecoveryManager.getSyncStats();
      setNetworkState(prev => ({
        ...prev,
        pendingSyncOperations: syncStats.pendingOperations,
        syncInProgress: false
      }));
      
      return results;
    } catch (error) {
      setNetworkState(prev => ({ ...prev, syncInProgress: false }));
      throw error;
    }
  }, [networkState.isOnline]);

  // Execute operation when online
  const executeWhenOnline = useCallback(async <T>(
    operation: () => Promise<T>
  ): Promise<T> => {
    if (networkState.isOnline) {
      return operation();
    }

    // Wait for connection
    await networkMonitor.waitForConnection();
    return operation();
  }, [networkState.isOnline]);

  const actions: NetworkRecoveryActions = {
    retry,
    queueOperation,
    clearQueue,
    forceSync,
    executeWhenOnline
  };

  return [networkState, actions];
};

/**
 * Hook for offline-first operations
 */
export const useOfflineFirst = <T>(
  operation: () => Promise<T>,
  syncConfig: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>
) => {
  const [networkState, networkActions] = useNetworkRecovery();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(async (): Promise<T | null> => {
    setIsLoading(true);
    setError(null);

    try {
      if (networkState.isOnline) {
        // Execute immediately if online
        const result = await operation();
        setData(result);
        return result;
      } else {
        // Queue for background sync if offline
        networkActions.queueOperation(syncConfig);
        throw new Error('Operation queued for background sync');
      }
    } catch (err) {
      const error = err as Error;
      setError(error);
      
      // Queue operation if it's a network error
      if (!networkState.isOnline) {
        networkActions.queueOperation(syncConfig);
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [operation, syncConfig, networkState.isOnline, networkActions]);

  return {
    execute,
    data,
    error,
    isLoading,
    networkState,
    networkActions
  };
};

/**
 * Hook for automatic retry with network recovery
 */
export const useNetworkRetry = <T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    retryOnNetworkError?: boolean;
  } = {}
) => {
  const { maxRetries = 3, retryDelay = 1000, retryOnNetworkError = true } = options;
  const [networkState] = useNetworkRecovery();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const executeWithRetry = useCallback(async (): Promise<T | null> => {
    setIsLoading(true);
    setError(null);
    setRetryCount(0);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Wait for network if offline and retry on network error is enabled
        if (!networkState.isOnline && retryOnNetworkError) {
          await networkMonitor.waitForConnection(30000); // 30 second timeout
        }

        const result = await operation();
        setIsLoading(false);
        return result;
      } catch (err) {
        const error = err as Error;
        setRetryCount(attempt + 1);

        // Don't retry if not a network error and retryOnNetworkError is false
        if (!retryOnNetworkError && !isNetworkError(error)) {
          setError(error);
          setIsLoading(false);
          return null;
        }

        // Don't retry if max attempts reached
        if (attempt === maxRetries) {
          setError(error);
          setIsLoading(false);
          return null;
        }

        // Wait before retry with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    setIsLoading(false);
    return null;
  }, [operation, maxRetries, retryDelay, retryOnNetworkError, networkState.isOnline]);

  return {
    execute: executeWithRetry,
    isLoading,
    error,
    retryCount,
    canRetry: retryCount < maxRetries,
    networkState
  };
};

/**
 * Utility function to check if error is network-related
 */
function isNetworkError(error: Error): boolean {
  return (
    error.name === 'NetworkError' ||
    error.message.includes('network') ||
    error.message.includes('fetch') ||
    error.message.includes('connection') ||
    error.message.includes('offline')
  );
}