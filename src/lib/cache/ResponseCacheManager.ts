/**
 * Response Cache Manager
 * Implements intelligent caching for frequently accessed data
 */

import { logger } from '../logging';

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  tags: string[];
  size: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  tags?: string[]; // Tags for cache invalidation
  priority?: 'low' | 'medium' | 'high';
  compress?: boolean;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  oldestEntry: number;
  newestEntry: number;
  memoryUsage: {
    used: number;
    limit: number;
    percentage: number;
  };
}

export class ResponseCacheManager {
  private cache = new Map<string, CacheEntry>();
  private accessLog = new Map<string, number[]>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    sets: 0,
    deletes: 0
  };
  
  private readonly maxSize: number;
  private readonly maxEntries: number;
  private readonly defaultTTL: number;
  private readonly cleanupInterval: number;
  private cleanupTimer?: NodeJS.Timeout;
  private logger = logger.child({ component: 'ResponseCacheManager' });

  constructor(options: {
    maxSize?: number; // Max cache size in bytes
    maxEntries?: number; // Max number of entries
    defaultTTL?: number; // Default TTL in milliseconds
    cleanupInterval?: number; // Cleanup interval in milliseconds
  } = {}) {
    this.maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB default
    this.maxEntries = options.maxEntries || 10000;
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 5 minutes default
    this.cleanupInterval = options.cleanupInterval || 60 * 1000; // 1 minute cleanup

    this.startCleanupTimer();
    this.logger.info('Response cache manager initialized', {
      maxSize: this.maxSize,
      maxEntries: this.maxEntries,
      defaultTTL: this.defaultTTL
    });
  }

  /**
   * Get cached data
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.accessLog.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.recordAccess(key);
    this.stats.hits++;

    this.logger.debug('Cache hit', { key, accessCount: entry.accessCount });
    return entry.data;
  }

  /**
   * Set cached data
   */
  set<T>(key: string, data: T, options: CacheOptions = {}): void {
    const now = Date.now();
    const ttl = options.ttl || this.defaultTTL;
    const size = this.calculateSize(data);
    
    // Check if we need to make space
    this.ensureSpace(size);

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl,
      accessCount: 1,
      lastAccessed: now,
      tags: options.tags || [],
      size
    };

    this.cache.set(key, entry);
    this.recordAccess(key);
    this.stats.sets++;

    this.logger.debug('Cache set', { 
      key, 
      size, 
      ttl, 
      tags: options.tags,
      totalEntries: this.cache.size 
    });
  }

  /**
   * Delete cached data
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.accessLog.delete(key);
      this.stats.deletes++;
      this.logger.debug('Cache delete', { key });
    }
    return deleted;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.accessLog.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const entriesCleared = this.cache.size;
    this.cache.clear();
    this.accessLog.clear();
    this.resetStats();
    
    this.logger.info('Cache cleared', { entriesCleared });
  }

  /**
   * Invalidate cache entries by tags
   */
  invalidateByTags(tags: string[]): number {
    let invalidated = 0;
    const tagSet = new Set(tags);
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.some(tag => tagSet.has(tag))) {
        this.cache.delete(key);
        this.accessLog.delete(key);
        invalidated++;
      }
    }
    
    this.logger.info('Cache invalidated by tags', { tags, invalidated });
    return invalidated;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalSize = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0);
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    const missRate = totalRequests > 0 ? (this.stats.misses / totalRequests) * 100 : 0;
    
    const timestamps = Array.from(this.cache.values()).map(entry => entry.timestamp);
    const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : 0;

    return {
      totalEntries: this.cache.size,
      totalSize,
      hitRate: parseFloat(hitRate.toFixed(2)),
      missRate: parseFloat(missRate.toFixed(2)),
      evictionCount: this.stats.evictions,
      oldestEntry,
      newestEntry,
      memoryUsage: {
        used: totalSize,
        limit: this.maxSize,
        percentage: parseFloat(((totalSize / this.maxSize) * 100).toFixed(2))
      }
    };
  }

  /**
   * Get cache keys matching pattern
   */
  getKeys(pattern?: RegExp): string[] {
    const keys = Array.from(this.cache.keys());
    return pattern ? keys.filter(key => pattern.test(key)) : keys;
  }

  /**
   * Warm cache with data
   */
  async warmCache(entries: Array<{ key: string; data: any; options?: CacheOptions }>): Promise<void> {
    this.logger.info('Starting cache warm-up', { entriesCount: entries.length });
    
    for (const entry of entries) {
      this.set(entry.key, entry.data, entry.options);
    }
    
    this.logger.info('Cache warm-up completed', { 
      totalEntries: this.cache.size,
      totalSize: this.getTotalSize()
    });
  }

  /**
   * Export cache data for persistence
   */
  export(): Array<{ key: string; entry: CacheEntry }> {
    return Array.from(this.cache.entries()).map(([key, entry]) => ({ key, entry }));
  }

  /**
   * Import cache data from persistence
   */
  import(data: Array<{ key: string; entry: CacheEntry }>): void {
    this.clear();
    
    for (const { key, entry } of data) {
      // Only import non-expired entries
      if (!this.isExpired(entry)) {
        this.cache.set(key, entry);
      }
    }
    
    this.logger.info('Cache imported', { entriesImported: this.cache.size });
  }

  /**
   * Shutdown cache manager
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.logger.info('Cache manager shutdown', { 
      finalStats: this.getStats() 
    });
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private calculateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // Rough estimate (UTF-16)
    } catch {
      return 1000; // Default size for non-serializable data
    }
  }

  private ensureSpace(requiredSize: number): void {
    const currentSize = this.getTotalSize();
    
    // Check size limit
    if (currentSize + requiredSize > this.maxSize) {
      this.evictBySize(requiredSize);
    }
    
    // Check entry limit
    if (this.cache.size >= this.maxEntries) {
      this.evictByCount(1);
    }
  }

  private getTotalSize(): number {
    return Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0);
  }

  private evictBySize(requiredSize: number): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by LRU (least recently used)
    entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    
    let freedSize = 0;
    let evicted = 0;
    
    for (const [key, entry] of entries) {
      if (freedSize >= requiredSize) break;
      
      this.cache.delete(key);
      this.accessLog.delete(key);
      freedSize += entry.size;
      evicted++;
      this.stats.evictions++;
    }
    
    this.logger.debug('Evicted by size', { evicted, freedSize, requiredSize });
  }

  private evictByCount(count: number): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by LRU (least recently used)
    entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    
    for (let i = 0; i < count && i < entries.length; i++) {
      const [key] = entries[i];
      this.cache.delete(key);
      this.accessLog.delete(key);
      this.stats.evictions++;
    }
    
    this.logger.debug('Evicted by count', { evicted: count });
  }

  private recordAccess(key: string): void {
    const now = Date.now();
    const accesses = this.accessLog.get(key) || [];
    
    // Keep only recent accesses (last hour)
    const recentAccesses = accesses.filter(time => now - time < 60 * 60 * 1000);
    recentAccesses.push(now);
    
    this.accessLog.set(key, recentAccesses);
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  private cleanup(): void {
    const before = this.cache.size;
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.accessLog.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug('Cache cleanup completed', { 
        before, 
        after: this.cache.size, 
        cleaned 
      });
    }
  }

  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      deletes: 0
    };
  }
}

// Export singleton instance
export const responseCacheManager = new ResponseCacheManager();