import { useCallback, useRef, useEffect } from 'react';

// Request deduplication and caching
class RequestManager {
  private static instance: RequestManager;
  private pendingRequests = new Map<string, Promise<any>>();
  private requestCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private prefetchQueue = new Set<string>();

  static getInstance(): RequestManager {
    if (!RequestManager.instance) {
      RequestManager.instance = new RequestManager();
    }
    return RequestManager.instance;
  }

  // Deduplicate requests - if same request is in flight, return existing promise
  async deduplicateRequest<T>(
    key: string,
    requestFn: () => Promise<T>,
    ttl: number = 30000 // 30 seconds default TTL
  ): Promise<T> {
    // Check cache first
    const cached = this.requestCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    // Check if request is already pending
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    // Create new request
    const requestPromise = requestFn()
      .then(result => {
        // Cache the result
        this.requestCache.set(key, {
          data: result,
          timestamp: Date.now(),
          ttl
        });
        return result;
      })
      .finally(() => {
        // Remove from pending requests
        this.pendingRequests.delete(key);
      });

    this.pendingRequests.set(key, requestPromise);
    return requestPromise;
  }

  // Prefetch a resource
  prefetch(key: string, requestFn: () => Promise<any>, priority: 'low' | 'medium' | 'high' = 'low') {
    if (this.prefetchQueue.has(key)) return;

    this.prefetchQueue.add(key);

    // Use requestIdleCallback for low priority, setTimeout for others
    const scheduleFn = priority === 'low' && 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback
      : (cb: () => void) => setTimeout(cb, priority === 'high' ? 0 : 100);

    scheduleFn(() => {
      this.deduplicateRequest(key, requestFn).finally(() => {
        this.prefetchQueue.delete(key);
      });
    });
  }

  // Clear cache for specific key or all
  clearCache(key?: string) {
    if (key) {
      this.requestCache.delete(key);
    } else {
      this.requestCache.clear();
    }
  }

  // Get cache stats
  getCacheStats() {
    return {
      cachedRequests: this.requestCache.size,
      pendingRequests: this.pendingRequests.size,
      prefetchQueue: this.prefetchQueue.size,
    };
  }
}

// React hook for network optimization
export function useNetworkOptimization() {
  const managerRef = useRef(RequestManager.getInstance());

  const deduplicateRequest = useCallback(<T>(
    key: string,
    requestFn: () => Promise<T>,
    ttl?: number
  ) => {
    return managerRef.current.deduplicateRequest(key, requestFn, ttl);
  }, []);

  const prefetch = useCallback((
    key: string,
    requestFn: () => Promise<any>,
    priority?: 'low' | 'medium' | 'high'
  ) => {
    managerRef.current.prefetch(key, requestFn, priority);
  }, []);

  const clearCache = useCallback((key?: string) => {
    managerRef.current.clearCache(key);
  }, []);

  const getCacheStats = useCallback(() => {
    return managerRef.current.getCacheStats();
  }, []);

  return {
    deduplicateRequest,
    prefetch,
    clearCache,
    getCacheStats,
  };
}

// Intelligent prefetching hook
export function useIntelligentPrefetch() {
  const { prefetch } = useNetworkOptimization();
  const prefetchedRef = useRef(new Set<string>());

  const prefetchRelated = useCallback((
    currentResource: string,
    relatedResources: Array<{
      key: string;
      requestFn: () => Promise<any>;
      condition?: () => boolean;
    }>
  ) => {
    relatedResources.forEach(({ key, requestFn, condition }) => {
      if (prefetchedRef.current.has(key)) return;
      if (condition && !condition()) return;

      prefetchedRef.current.add(key);
      prefetch(key, requestFn, 'medium');
    });
  }, [prefetch]);

  const prefetchOnHover = useCallback((
    element: HTMLElement | null,
    resourceKey: string,
    requestFn: () => Promise<any>
  ) => {
    if (!element) return;

    const handleMouseEnter = () => {
      prefetch(resourceKey, requestFn, 'high');
    };

    element.addEventListener('mouseenter', handleMouseEnter, { once: true });
    return () => element.removeEventListener('mouseenter', handleMouseEnter);
  }, [prefetch]);

  const prefetchOnVisible = useCallback((
    element: HTMLElement | null,
    resourceKey: string,
    requestFn: () => Promise<any>
  ) => {
    if (!element || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            prefetch(resourceKey, requestFn, 'medium');
            observer.disconnect();
          }
        });
      },
      { rootMargin: '50px' }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [prefetch]);

  return {
    prefetchRelated,
    prefetchOnHover,
    prefetchOnVisible,
  };
}

// Request batching utility
export class RequestBatcher {
  private static instance: RequestBatcher;
  private batchQueue: Array<{
    key: string;
    requestFn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly batchDelay = 50; // ms

  static getInstance(): RequestBatcher {
    if (!RequestBatcher.instance) {
      RequestBatcher.instance = new RequestBatcher();
    }
    return RequestBatcher.instance;
  }

  // Add request to batch queue
  batchRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({ key, requestFn, resolve, reject });

      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }

      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, this.batchDelay);
    });
  }

  private async processBatch() {
    const batch = [...this.batchQueue];
    this.batchQueue = [];
    this.batchTimeout = null;

    // Group by key to avoid duplicates
    const grouped = new Map<string, typeof batch[0]>();

    batch.forEach(item => {
      if (!grouped.has(item.key)) {
        grouped.set(item.key, item);
      }
    });

    // Process all requests in parallel
    const promises = Array.from(grouped.values()).map(async ({ key, requestFn, resolve, reject }) => {
      try {
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    await Promise.allSettled(promises);
  }
}

// Hook for request batching
export function useRequestBatching() {
  const batcherRef = useRef(RequestBatcher.getInstance());

  const batchRequest = useCallback(<T>(
    key: string,
    requestFn: () => Promise<T>
  ) => {
    return batcherRef.current.batchRequest(key, requestFn);
  }, []);

  return { batchRequest };
}

// Network status aware hook
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connection, setConnection] = useState<any>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Get connection info if available
    if ('connection' in navigator) {
      setConnection((navigator as any).connection);
      const conn = (navigator as any).connection;
      conn.addEventListener('change', () => setConnection({ ...conn }));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOnline,
    connection,
    isSlowConnection: connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g',
    isFastConnection: connection?.effectiveType === '4g',
  };
}

// Adaptive loading hook based on network conditions
export function useAdaptiveLoading() {
  const { isOnline, isSlowConnection } = useNetworkStatus();

  const getLoadingStrategy = useCallback((resourceType: 'image' | 'data' | 'component') => {
    if (!isOnline) {
      return 'cache-only';
    }

    if (isSlowConnection) {
      switch (resourceType) {
        case 'image':
          return 'low-quality';
        case 'data':
          return 'minimal';
        case 'component':
          return 'lazy';
        default:
          return 'standard';
      }
    }

    return 'standard';
  }, [isOnline, isSlowConnection]);

  return { getLoadingStrategy };
}