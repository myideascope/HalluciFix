/**
 * React hook for managing service degradation state
 */

import { useState, useEffect, useCallback } from 'react';
import { serviceDegradationManager, ServiceStatus, ServiceHealth } from '../lib/serviceDegradationManager';
import { offlineCacheManager } from '../lib/offlineCacheManager';

export interface ServiceDegradationState {
  isOnline: boolean;
  isOfflineMode: boolean;
  serviceStatuses: Record<string, ServiceStatus>;
  degradedServices: string[];
  unavailableServices: string[];
  fallbackServices: string[];
  cacheStats: {
    totalEntries: number;
    totalSize: number;
    hitRate: number;
  };
}

export interface ServiceDegradationActions {
  retryService: (serviceId: string) => Promise<void>;
  forceFallback: (serviceId: string, reason?: string) => void;
  clearCache: () => void;
  clearServiceCache: (category: string) => void;
  refreshServiceStatus: () => void;
}

/**
 * Hook for managing service degradation and offline functionality
 */
export const useServiceDegradation = (): ServiceDegradationState & ServiceDegradationActions => {
  const [state, setState] = useState<ServiceDegradationState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isOfflineMode: serviceDegradationManager.isOfflineMode(),
    serviceStatuses: serviceDegradationManager.getAllServiceStatuses(),
    degradedServices: [],
    unavailableServices: [],
    fallbackServices: [],
    cacheStats: {
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0
    }
  });

  /**
   * Update state from service health data
   */
  const updateStateFromHealth = useCallback((healthMap: Map<string, ServiceHealth>) => {
    const serviceStatuses: Record<string, ServiceStatus> = {};
    const degradedServices: string[] = [];
    const unavailableServices: string[] = [];
    const fallbackServices: string[] = [];

    healthMap.forEach((health, serviceId) => {
      serviceStatuses[serviceId] = health.status;
      
      switch (health.status) {
        case ServiceStatus.DEGRADED:
          degradedServices.push(serviceId);
          break;
        case ServiceStatus.UNAVAILABLE:
          unavailableServices.push(serviceId);
          break;
        case ServiceStatus.FALLBACK:
          fallbackServices.push(serviceId);
          break;
      }
      
      if (health.fallbackActive) {
        fallbackServices.push(serviceId);
      }
    });

    // Get cache stats
    const cacheStats = offlineCacheManager.getStats();

    setState(prevState => ({
      ...prevState,
      serviceStatuses,
      degradedServices,
      unavailableServices,
      fallbackServices,
      isOfflineMode: serviceDegradationManager.isOfflineMode(),
      cacheStats: {
        totalEntries: cacheStats.totalEntries,
        totalSize: cacheStats.totalSize,
        hitRate: cacheStats.hitRate
      }
    }));
  }, []);

  /**
   * Handle network status changes
   */
  const handleNetworkChange = useCallback(() => {
    setState(prevState => ({
      ...prevState,
      isOnline: navigator.onLine,
      isOfflineMode: serviceDegradationManager.isOfflineMode()
    }));
  }, []);

  /**
   * Retry a specific service
   */
  const retryService = useCallback(async (serviceId: string) => {
    // The service degradation manager handles the retry logic
    // This will trigger health checks and update the state
    await serviceDegradationManager.retryService?.(serviceId);
  }, []);

  /**
   * Force fallback for a service
   */
  const forceFallback = useCallback((serviceId: string, reason?: string) => {
    serviceDegradationManager.forceFallback(serviceId, reason);
  }, []);

  /**
   * Clear all cache
   */
  const clearCache = useCallback(() => {
    offlineCacheManager.clear();
    
    // Update cache stats
    const cacheStats = offlineCacheManager.getStats();
    setState(prevState => ({
      ...prevState,
      cacheStats: {
        totalEntries: cacheStats.totalEntries,
        totalSize: cacheStats.totalSize,
        hitRate: cacheStats.hitRate
      }
    }));
  }, []);

  /**
   * Clear cache for specific service category
   */
  const clearServiceCache = useCallback((category: string) => {
    offlineCacheManager.pruneCategory(category);
    
    // Update cache stats
    const cacheStats = offlineCacheManager.getStats();
    setState(prevState => ({
      ...prevState,
      cacheStats: {
        totalEntries: cacheStats.totalEntries,
        totalSize: cacheStats.totalSize,
        hitRate: cacheStats.hitRate
      }
    }));
  }, []);

  /**
   * Refresh service status
   */
  const refreshServiceStatus = useCallback(() => {
    const currentStatuses = serviceDegradationManager.getAllServiceStatuses();
    setState(prevState => ({
      ...prevState,
      serviceStatuses: currentStatuses,
      isOfflineMode: serviceDegradationManager.isOfflineMode()
    }));
  }, []);

  /**
   * Setup effect for service health monitoring
   */
  useEffect(() => {
    // Subscribe to service health changes
    const unsubscribe = serviceDegradationManager.subscribe(updateStateFromHealth);

    // Setup network event listeners
    const handleOnline = () => handleNetworkChange();
    const handleOffline = () => handleNetworkChange();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    // Initial state update
    refreshServiceStatus();

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, [updateStateFromHealth, handleNetworkChange, refreshServiceStatus]);

  return {
    ...state,
    retryService,
    forceFallback,
    clearCache,
    clearServiceCache,
    refreshServiceStatus
  };
};

/**
 * Hook for checking if a specific service should use fallback
 */
export const useServiceFallback = (serviceId: string): {
  shouldUseFallback: boolean;
  serviceStatus: ServiceStatus;
  isAvailable: boolean;
} => {
  const { serviceStatuses } = useServiceDegradation();
  
  const serviceStatus = serviceStatuses[serviceId] || ServiceStatus.UNAVAILABLE;
  const shouldUseFallback = serviceDegradationManager.shouldUseFallback(serviceId);
  const isAvailable = serviceStatus === ServiceStatus.AVAILABLE;

  return {
    shouldUseFallback,
    serviceStatus,
    isAvailable
  };
};

/**
 * Hook for offline cache operations
 */
export const useOfflineCache = () => {
  const [cacheStats, setCacheStats] = useState(offlineCacheManager.getStats());

  const refreshStats = useCallback(() => {
    setCacheStats(offlineCacheManager.getStats());
  }, []);

  useEffect(() => {
    // Refresh stats periodically
    const interval = setInterval(refreshStats, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [refreshStats]);

  return {
    cacheStats,
    refreshStats,
    cacheAnalysisResult: offlineCacheManager.cacheAnalysisResult.bind(offlineCacheManager),
    getCachedAnalysisResult: offlineCacheManager.getCachedAnalysisResult.bind(offlineCacheManager),
    cacheDriveFiles: offlineCacheManager.cacheDriveFiles.bind(offlineCacheManager),
    getCachedDriveFiles: offlineCacheManager.getCachedDriveFiles.bind(offlineCacheManager),
    cacheFileContent: offlineCacheManager.cacheFileContent.bind(offlineCacheManager),
    getCachedFileContent: offlineCacheManager.getCachedFileContent.bind(offlineCacheManager),
    cacheKnowledgeResults: offlineCacheManager.cacheKnowledgeResults.bind(offlineCacheManager),
    getCachedKnowledgeResults: offlineCacheManager.getCachedKnowledgeResults.bind(offlineCacheManager),
    clearCache: offlineCacheManager.clear.bind(offlineCacheManager),
    clearExpired: offlineCacheManager.clearExpired.bind(offlineCacheManager),
    pruneCategory: offlineCacheManager.pruneCategory.bind(offlineCacheManager)
  };
};