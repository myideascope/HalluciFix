/**
 * Offline Cache Manager
 * Manages cached responses for offline mode functionality
 */

import { AnalysisResult } from '../types/analysis';
import { GoogleDriveFile } from './googleDrive';
import { RAGEnhancedAnalysis } from './ragService';

export interface CacheEntry<T = any> {
  key: string;
  data: T;
  timestamp: number;
  expiresAt: number;
  metadata?: {
    userId?: string;
    contentHash?: string;
    version?: string;
  };
}

export interface CacheConfig {
  maxEntries: number;
  defaultTTL: number; // Time to live in milliseconds
  enablePersistence: boolean;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface OfflineCacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  oldestEntry: number;
  newestEntry: number;
  byCategory: Record<string, { count: number; size: number }>;
}

/**
 * Manages offline caching with support for different data types
 */
export class OfflineCacheManager {
  private cache = new Map<string, CacheEntry>();
  private accessLog = new Map<string, number[]>(); // Track access times for LRU
  private config: CacheConfig;
  private storageKey = 'hallucifix-offline-cache';
  private statsKey = 'hallucifix-cache-stats';

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxEntries: 1000,
      defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
      enablePersistence: true,
      compressionEnabled: false,
      encryptionEnabled: false,
      ...config
    };

    this.loadFromStorage();
    this.startCleanupInterval();
  }

  /**
   * Store analysis result in cache
   */
  public cacheAnalysisResult(
    content: string, 
    result: AnalysisResult, 
    ragAnalysis?: RAGEnhancedAnalysis,
    userId?: string
  ): void {
    const contentHash = this.generateContentHash(content);
    const key = `analysis:${contentHash}`;
    
    const cacheData = {
      analysis: result,
      ragAnalysis,
      originalContent: content.substring(0, 500) // Store preview for reference
    };

    this.set(key, cacheData, {
      ttl: this.config.defaultTTL,
      metadata: {
        userId,
        contentHash,
        version: '1.0'
      }
    });
  }

  /**
   * Retrieve cached analysis result
   */
  public getCachedAnalysisResult(content: string, userId?: string): {
    analysis: AnalysisResult;
    ragAnalysis?: RAGEnhancedAnalysis;
    fromCache: boolean;
  } | null {
    const contentHash = this.generateContentHash(content);
    const key = `analysis:${contentHash}`;
    
    const cached = this.get(key);
    if (!cached) return null;

    // Check if user matches (if specified)
    if (userId && cached.metadata?.userId !== userId) {
      return null;
    }

    return {
      analysis: cached.data.analysis,
      ragAnalysis: cached.data.ragAnalysis,
      fromCache: true
    };
  }

  /**
   * Cache Google Drive file list
   */
  public cacheDriveFiles(folderId: string, files: GoogleDriveFile[], userId?: string): void {
    const key = `drive:files:${folderId}`;
    
    this.set(key, files, {
      ttl: 30 * 60 * 1000, // 30 minutes for file lists
      metadata: {
        userId,
        version: '1.0'
      }
    });
  }

  /**
   * Get cached Google Drive files
   */
  public getCachedDriveFiles(folderId: string, userId?: string): GoogleDriveFile[] | null {
    const key = `drive:files:${folderId}`;
    const cached = this.get(key);
    
    if (!cached) return null;
    
    // Check user match
    if (userId && cached.metadata?.userId !== userId) {
      return null;
    }
    
    return cached.data;
  }

  /**
   * Cache file content
   */
  public cacheFileContent(fileId: string, content: string, mimeType: string, userId?: string): void {
    const key = `drive:content:${fileId}`;
    
    this.set(key, { content, mimeType }, {
      ttl: 60 * 60 * 1000, // 1 hour for file content
      metadata: {
        userId,
        version: '1.0'
      }
    });
  }

  /**
   * Get cached file content
   */
  public getCachedFileContent(fileId: string, userId?: string): { content: string; mimeType: string } | null {
    const key = `drive:content:${fileId}`;
    const cached = this.get(key);
    
    if (!cached) return null;
    
    // Check user match
    if (userId && cached.metadata?.userId !== userId) {
      return null;
    }
    
    return cached.data;
  }

  /**
   * Cache RAG knowledge base results
   */
  public cacheKnowledgeResults(query: string, results: any[], userId?: string): void {
    const queryHash = this.generateContentHash(query);
    const key = `knowledge:${queryHash}`;
    
    this.set(key, results, {
      ttl: 2 * 60 * 60 * 1000, // 2 hours for knowledge results
      metadata: {
        userId,
        version: '1.0'
      }
    });
  }

  /**
   * Get cached knowledge results
   */
  public getCachedKnowledgeResults(query: string, userId?: string): any[] | null {
    const queryHash = this.generateContentHash(query);
    const key = `knowledge:${queryHash}`;
    const cached = this.get(key);
    
    if (!cached) return null;
    
    // Check user match
    if (userId && cached.metadata?.userId !== userId) {
      return null;
    }
    
    return cached.data;
  }

  /**
   * Generic cache set method
   */
  public set<T>(key: string, data: T, options: {
    ttl?: number;
    metadata?: CacheEntry['metadata'];
  } = {}): void {
    const now = Date.now();
    const ttl = options.ttl || this.config.defaultTTL;
    
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: now,
      expiresAt: now + ttl,
      metadata: options.metadata
    };

    // Check if we need to make room
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.recordAccess(key);
    
    if (this.config.enablePersistence) {
      this.saveToStorage();
    }
  }

  /**
   * Generic cache get method
   */
  public get<T>(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key) as CacheEntry<T>;
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      if (this.config.enablePersistence) {
        this.saveToStorage();
      }
      return null;
    }
    
    this.recordAccess(key);
    return entry;
  }

  /**
   * Check if key exists and is not expired
   */
  public has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete specific cache entry
   */
  public delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.accessLog.delete(key);
    
    if (deleted && this.config.enablePersistence) {
      this.saveToStorage();
    }
    
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  public clear(): void {
    this.cache.clear();
    this.accessLog.clear();
    
    if (this.config.enablePersistence) {
      this.clearStorage();
    }
  }

  /**
   * Clear expired entries
   */
  public clearExpired(): number {
    const now = Date.now();
    let cleared = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.accessLog.delete(key);
        cleared++;
      }
    }
    
    if (cleared > 0 && this.config.enablePersistence) {
      this.saveToStorage();
    }
    
    return cleared;
  }

  /**
   * Get cache statistics
   */
  public getStats(): OfflineCacheStats {
    const entries = Array.from(this.cache.values());
    const now = Date.now();
    
    let totalSize = 0;
    const byCategory: Record<string, { count: number; size: number }> = {};
    
    let oldestEntry = now;
    let newestEntry = 0;
    
    entries.forEach(entry => {
      const size = this.estimateEntrySize(entry);
      totalSize += size;
      
      const category = entry.key.split(':')[0] || 'unknown';
      if (!byCategory[category]) {
        byCategory[category] = { count: 0, size: 0 };
      }
      byCategory[category].count++;
      byCategory[category].size += size;
      
      if (entry.timestamp < oldestEntry) oldestEntry = entry.timestamp;
      if (entry.timestamp > newestEntry) newestEntry = entry.timestamp;
    });
    
    // Calculate hit rate from access log
    const totalAccesses = Array.from(this.accessLog.values())
      .reduce((sum, accesses) => sum + accesses.length, 0);
    const hitRate = totalAccesses > 0 ? (entries.length / totalAccesses) * 100 : 0;
    
    return {
      totalEntries: entries.length,
      totalSize,
      hitRate,
      oldestEntry: oldestEntry === now ? 0 : oldestEntry,
      newestEntry,
      byCategory
    };
  }

  /**
   * Get entries by category
   */
  public getEntriesByCategory(category: string): CacheEntry[] {
    return Array.from(this.cache.values())
      .filter(entry => entry.key.startsWith(`${category}:`));
  }

  /**
   * Prune cache by category
   */
  public pruneCategory(category: string): number {
    let pruned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.key.startsWith(`${category}:`)) {
        this.cache.delete(key);
        this.accessLog.delete(key);
        pruned++;
      }
    }
    
    if (pruned > 0 && this.config.enablePersistence) {
      this.saveToStorage();
    }
    
    return pruned;
  }

  /**
   * Generate content hash for caching
   */
  private generateContentHash(content: string): string {
    // Simple hash function - in production, consider using a proper hash library
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Record access for LRU tracking
   */
  private recordAccess(key: string): void {
    const now = Date.now();
    const accesses = this.accessLog.get(key) || [];
    
    accesses.push(now);
    
    // Keep only recent accesses (last 10)
    if (accesses.length > 10) {
      accesses.splice(0, accesses.length - 10);
    }
    
    this.accessLog.set(key, accesses);
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Date.now();
    
    for (const [key, accesses] of this.accessLog.entries()) {
      const lastAccess = accesses[accesses.length - 1] || 0;
      if (lastAccess < lruTime) {
        lruTime = lastAccess;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessLog.delete(lruKey);
    }
  }

  /**
   * Estimate entry size in bytes
   */
  private estimateEntrySize(entry: CacheEntry): number {
    try {
      return JSON.stringify(entry).length * 2; // Rough estimate (UTF-16)
    } catch {
      return 1000; // Default estimate
    }
  }

  /**
   * Load cache from localStorage
   */
  private loadFromStorage(): void {
    if (!this.config.enablePersistence || typeof window === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        
        // Restore cache entries
        if (data.entries) {
          for (const entry of data.entries) {
            // Only restore non-expired entries
            if (Date.now() <= entry.expiresAt) {
              this.cache.set(entry.key, entry);
            }
          }
        }
        
        // Restore access log
        if (data.accessLog) {
          for (const [key, accesses] of Object.entries(data.accessLog)) {
            this.accessLog.set(key, accesses as number[]);
          }
        }
        
        console.log(`Loaded ${this.cache.size} cache entries from storage`);
      }
    } catch (error) {
      console.error('Failed to load cache from storage:', error);
      this.clearStorage();
    }
  }

  /**
   * Save cache to localStorage
   */
  private saveToStorage(): void {
    if (!this.config.enablePersistence || typeof window === 'undefined') {
      return;
    }

    try {
      const data = {
        entries: Array.from(this.cache.values()),
        accessLog: Object.fromEntries(this.accessLog.entries()),
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save cache to storage:', error);
      
      // If storage is full, try clearing old entries and retry
      if (error.name === 'QuotaExceededError') {
        this.clearExpired();
        try {
          const data = {
            entries: Array.from(this.cache.values()),
            accessLog: Object.fromEntries(this.accessLog.entries()),
            timestamp: Date.now()
          };
          localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (retryError) {
          console.error('Failed to save cache after cleanup:', retryError);
        }
      }
    }
  }

  /**
   * Clear storage
   */
  private clearStorage(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.statsKey);
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    // Clean expired entries every 5 minutes
    setInterval(() => {
      const cleared = this.clearExpired();
      if (cleared > 0) {
        console.log(`Cleared ${cleared} expired cache entries`);
      }
    }, 5 * 60 * 1000);
  }
}

// Singleton instance
export const offlineCacheManager = new OfflineCacheManager();