// Query result caching service with cache invalidation strategies
// Note: This implementation uses browser storage as Redis is not available in the frontend
// In a production environment, this would be implemented on the backend with Redis

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
  tags?: string[];
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  tags?: string[]; // Tags for cache invalidation
  forceRefresh?: boolean; // Skip cache and force refresh
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  totalSize: number;
}

class QueryCacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalEntries: 0,
    totalSize: 0
  };
  
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100; // Maximum number of entries
  private readonly STORAGE_KEY = 'hallucifix_query_cache';

  constructor() {
    this.loadFromStorage();
    this.startCleanupInterval();
  }

  // Get cached data or execute query function
  async get<T>(
    key: string,
    queryFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cacheKey = this.generateCacheKey(key);
    
    // Check if force refresh is requested
    if (options.forceRefresh) {
      const result = await queryFn();
      this.set(cacheKey, result, options);
      return result;
    }

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isValid(cached)) {
      this.stats.hits++;
      this.updateStats();
      return cached.data;
    }

    // Cache miss - execute query
    this.stats.misses++;
    const result = await queryFn();
    this.set(cacheKey, result, options);
    this.updateStats();
    
    return result;
  }

  // Set cache entry
  set<T>(key: string, data: T, options: CacheOptions = {}): void {
    const cacheKey = this.generateCacheKey(key);
    const ttl = options.ttl || this.DEFAULT_TTL;
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      key: cacheKey,
      tags: options.tags || []
    };

    this.cache.set(cacheKey, entry);
    
    // Enforce cache size limit
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }
    
    this.saveToStorage();
    this.updateStats();
  }

  // Check if cache entry is valid
  private isValid(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  // Generate cache key with namespace
  private generateCacheKey(key: string): string {
    return `query:${key}`;
  }

  // Invalidate cache by key
  invalidate(key: string): boolean {
    const cacheKey = this.generateCacheKey(key);
    const deleted = this.cache.delete(cacheKey);
    if (deleted) {
      this.saveToStorage();
      this.updateStats();
    }
    return deleted;
  }

  // Invalidate cache by tags
  invalidateByTags(tags: string[]): number {
    let deletedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags && entry.tags.some(tag => tags.includes(tag))) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      this.saveToStorage();
      this.updateStats();
    }
    
    return deletedCount;
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
    this.saveToStorage();
    this.updateStats();
  }

  // Evict oldest entries when cache is full
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  // Clean up expired entries
  private cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      this.saveToStorage();
      this.updateStats();
    }
  }

  // Start periodic cleanup
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute
  }

  // Update cache statistics
  private updateStats(): void {
    this.stats.totalEntries = this.cache.size;
    this.stats.hitRate = this.stats.hits + this.stats.misses > 0 
      ? this.stats.hits / (this.stats.hits + this.stats.misses) 
      : 0;
    
    // Calculate approximate cache size
    this.stats.totalSize = Array.from(this.cache.values())
      .reduce((size, entry) => size + JSON.stringify(entry.data).length, 0);
  }

  // Get cache statistics
  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Save cache to localStorage for persistence
  private saveToStorage(): void {
    try {
      const cacheData = Array.from(this.cache.entries());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to save cache to storage:', error);
    }
  }

  // Load cache from localStorage
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const cacheData = JSON.parse(stored);
        this.cache = new Map(cacheData);
        
        // Clean up expired entries on load
        this.cleanup();
      }
    } catch (error) {
      console.warn('Failed to load cache from storage:', error);
      this.cache.clear();
    }
  }

  // Warm up cache with critical queries
  async warmUp(queries: Array<{ key: string; queryFn: () => Promise<any>; options?: CacheOptions }>): Promise<void> {
    const warmupPromises = queries.map(({ key, queryFn, options }) =>
      this.get(key, queryFn, { ...options, forceRefresh: true })
        .catch(error => {
          console.warn(`Cache warmup failed for key ${key}:`, error);
        })
    );
    
    await Promise.all(warmupPromises);
  }

  // Create cache key for user-specific data
  createUserCacheKey(userId: string, operation: string, params?: Record<string, any>): string {
    const paramString = params ? JSON.stringify(params) : '';
    return `user:${userId}:${operation}:${btoa(paramString).substring(0, 16)}`;
  }

  // Create cache key for global data
  createGlobalCacheKey(operation: string, params?: Record<string, any>): string {
    const paramString = params ? JSON.stringify(params) : '';
    return `global:${operation}:${btoa(paramString).substring(0, 16)}`;
  }
}

// Cached query service that integrates with the optimization framework
export class CachedQueryService {
  private cacheService = new QueryCacheService();

  // Cache user analytics with automatic invalidation
  async getUserAnalytics(
    userId: string,
    timeRange?: { start: Date; end: Date },
    options: CacheOptions = {}
  ): Promise<any> {
    const cacheKey = this.cacheService.createUserCacheKey(userId, 'analytics', {
      start: timeRange?.start?.toISOString(),
      end: timeRange?.end?.toISOString()
    });

    return this.cacheService.get(
      cacheKey,
      async () => {
        // This would call the actual database query
        const { optimizedAnalysisService } = await import('./optimizedAnalysisService');
        return optimizedAnalysisService.getUserAnalytics(userId, timeRange);
      },
      {
        ttl: 10 * 60 * 1000, // 10 minutes
        tags: [`user:${userId}`, 'analytics'],
        ...options
      }
    );
  }

  // Cache analysis results with pagination
  async getAnalysisResults(
    userId?: string,
    options?: {
      limit?: number;
      cursor?: string;
      riskLevel?: string;
    },
    cacheOptions: CacheOptions = {}
  ): Promise<any> {
    const cacheKey = userId 
      ? this.cacheService.createUserCacheKey(userId, 'analysis_results', options)
      : this.cacheService.createGlobalCacheKey('analysis_results', options);

    return this.cacheService.get(
      cacheKey,
      async () => {
        const { optimizedAnalysisService } = await import('./optimizedAnalysisService');
        return optimizedAnalysisService.getAnalysisResultsWithStats(userId, options);
      },
      {
        ttl: 5 * 60 * 1000, // 5 minutes
        tags: userId ? [`user:${userId}`, 'analysis_results'] : ['analysis_results'],
        ...cacheOptions
      }
    );
  }

  // Cache search results
  async searchAnalysisResults(
    searchQuery: string,
    userId?: string,
    options?: {
      limit?: number;
      cursor?: string;
    },
    cacheOptions: CacheOptions = {}
  ): Promise<any> {
    const cacheKey = this.cacheService.createUserCacheKey(
      userId || 'global',
      'search',
      { query: searchQuery, ...options }
    );

    return this.cacheService.get(
      cacheKey,
      async () => {
        const { optimizedAnalysisService } = await import('./optimizedAnalysisService');
        return optimizedAnalysisService.searchAnalysisResults(searchQuery, userId, options);
      },
      {
        ttl: 15 * 60 * 1000, // 15 minutes (search results can be cached longer)
        tags: userId ? [`user:${userId}`, 'search'] : ['search'],
        ...cacheOptions
      }
    );
  }

  // Invalidate user-specific cache when user data changes
  invalidateUserCache(userId: string): void {
    this.cacheService.invalidateByTags([`user:${userId}`]);
  }

  // Invalidate analysis results cache when new analysis is created
  invalidateAnalysisCache(userId?: string): void {
    const tags = ['analysis_results'];
    if (userId) {
      tags.push(`user:${userId}`);
    }
    this.cacheService.invalidateByTags(tags);
  }

  // Get cache statistics
  getCacheStats(): CacheStats {
    return this.cacheService.getStats();
  }

  // Warm up critical caches
  async warmUpCriticalCaches(userId: string): Promise<void> {
    const queries = [
      {
        key: this.cacheService.createUserCacheKey(userId, 'analytics'),
        queryFn: () => this.getUserAnalytics(userId, undefined, { forceRefresh: true })
      },
      {
        key: this.cacheService.createUserCacheKey(userId, 'recent_results'),
        queryFn: async () => {
          const { optimizedAnalysisService } = await import('./optimizedAnalysisService');
          return optimizedAnalysisService.getRecentAnalysisResults(userId, 10);
        }
      }
    ];

    await this.cacheService.warmUp(queries);
  }

  // Clear all caches
  clearAllCaches(): void {
    this.cacheService.clear();
  }
}

// Export singleton instance
export const cachedQueryService = new CachedQueryService();
export const cacheService = new QueryCacheService();