import { useState, useEffect, useCallback, useRef } from 'react';
import { dataPrefetchingService, PrefetchedData, BatchLoadOptions } from '../lib/dataPrefetchingService';
import { AnalysisResult } from '../types/analysis';
import { User } from '../types/user';

import { logger } from './logging';
export interface UseOptimizedDataOptions extends BatchLoadOptions {
  enabled?: boolean;
  refetchInterval?: number;
  staleTime?: number;
}

export interface UseOptimizedDataResult {
  data: PrefetchedData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  invalidate: () => void;
}

/**
 * Hook for optimized data fetching with automatic N+1 elimination
 */
export function useOptimizedData(
  userId: string | null,
  options: UseOptimizedDataOptions = {}
): UseOptimizedDataResult {
  const [data, setData] = useState<PrefetchedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const optionsRef = useRef(options);
  const lastFetchRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update options ref when options change
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const fetchData = useCallback(async () => {
    if (!userId || optionsRef.current.enabled === false) {
      return;
    }

    // Check if data is still fresh
    const now = Date.now();
    const staleTime = optionsRef.current.staleTime || 5 * 60 * 1000; // 5 minutes default
    
    if (data && (now - lastFetchRef.current) < staleTime) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await dataPrefetchingService.batchLoadUserData(userId, optionsRef.current);
      setData(result);
      lastFetchRef.current = now;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setIsLoading(false);
    }
  }, [userId, data]);

  const refetch = useCallback(async () => {
    lastFetchRef.current = 0; // Force refetch
    await fetchData();
  }, [fetchData]);

  const invalidate = useCallback(() => {
    if (userId) {
      dataPrefetchingService.invalidateUserCache(userId);
      lastFetchRef.current = 0;
    }
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set up refetch interval
  useEffect(() => {
    if (optionsRef.current.refetchInterval && optionsRef.current.refetchInterval > 0) {
      intervalRef.current = setInterval(fetchData, optionsRef.current.refetchInterval);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [fetchData, options.refetchInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    refetch,
    invalidate
  };
}

/**
 * Hook for batch loading analysis results
 */
export function useBatchAnalysisResults(
  analysisIds: string[],
  userId: string | null
): {
  data: Map<string, AnalysisResult>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<Map<string, AnalysisResult>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId || analysisIds.length === 0) {
      setData(new Map());
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await dataPrefetchingService.batchLoadAnalysisResults(analysisIds, userId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch analysis results'));
    } finally {
      setIsLoading(false);
    }
  }, [analysisIds, userId]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch
  };
}

/**
 * Hook for batch loading users
 */
export function useBatchUsers(
  userIds: string[]
): {
  data: Map<string, User>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<Map<string, User>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (userIds.length === 0) {
      setData(new Map());
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await dataPrefetchingService.batchLoadUsers(userIds);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch users'));
    } finally {
      setIsLoading(false);
    }
  }, [userIds]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch
  };
}

/**
 * Hook for batch loading scan results
 */
export function useBatchScanResults(
  scanIds: string[],
  userId: string | null
): {
  data: Map<string, AnalysisResult[]>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<Map<string, AnalysisResult[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId || scanIds.length === 0) {
      setData(new Map());
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await dataPrefetchingService.batchLoadScanResults(scanIds, userId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch scan results'));
    } finally {
      setIsLoading(false);
    }
  }, [scanIds, userId]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch
  };
}

/**
 * Hook for preloading data
 */
export function useDataPreloader(userId: string | null) {
  const preload = useCallback(async () => {
    if (!userId) return;
    
    try {
      await dataPrefetchingService.preloadUserData(userId);
    } catch (error) {
      logger.error("Preload failed:", error instanceof Error ? error : new Error(String(error)));
    }
  }, [userId]);

  useEffect(() => {
    preload();
  }, [preload]);

  return { preload };
}