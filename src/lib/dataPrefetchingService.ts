import { monitoredSupabase } from './monitoredSupabase';
import { optimizedAnalysisService } from './optimizedAnalysisService';
import { optimizedDashboardService } from './optimizedDashboardService';
import { AnalysisResult } from '../types/analysis';
import { User } from '../types/user';

import { logger } from './logging';
export interface PrefetchedData {
  user: User | null;
  analysisResults: AnalysisResult[];
  dashboardData: any;
  analyticsData: any;
  userStats: any;
}

export interface BatchLoadOptions {
  includeAnalyses?: boolean;
  includeDashboard?: boolean;
  includeAnalytics?: boolean;
  includeUserStats?: boolean;
  analysisLimit?: number;
  timeRange?: { start: Date; end: Date };
}

/**
 * Data prefetching service to eliminate N+1 query patterns
 */
class DataPrefetchingService {
  private prefetchCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Batch load all user-related data in a single operation
   */
  async batchLoadUserData(userId: string, options: BatchLoadOptions = {}): Promise<PrefetchedData> {
    const cacheKey = `batch_user_data:${userId}:${JSON.stringify(options)}`;
    
    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    // Prepare all queries to run in parallel
    const queries: Promise<any>[] = [];
    const queryMap: Record<string, number> = {};
    let queryIndex = 0;

    // Always fetch user data
    queries.push(this.getUserData(userId));
    queryMap.user = queryIndex++;

    // Conditionally add other queries based on options
    if (options.includeAnalyses !== false) {
      queries.push(
        optimizedAnalysisService.getAnalysisResults(userId, {
          limit: options.analysisLimit || 20
        })
      );
      queryMap.analyses = queryIndex++;
    }

    if (options.includeDashboard !== false) {
      queries.push(optimizedDashboardService.getDashboardData(userId));
      queryMap.dashboard = queryIndex++;
    }

    if (options.includeAnalytics !== false) {
      queries.push(optimizedDashboardService.getAnalyticsData(userId, options.timeRange));
      queryMap.analytics = queryIndex++;
    }

    if (options.includeUserStats !== false) {
      queries.push(optimizedAnalysisService.getUserStatistics(userId));
      queryMap.userStats = queryIndex++;
    }

    try {
      // Execute all queries in parallel
      const results = await Promise.all(queries);

      // Construct the result object
      const prefetchedData: PrefetchedData = {
        user: results[queryMap.user] || null,
        analysisResults: queryMap.analyses !== undefined ? results[queryMap.analyses]?.data || [] : [],
        dashboardData: queryMap.dashboard !== undefined ? results[queryMap.dashboard] || null : null,
        analyticsData: queryMap.analytics !== undefined ? results[queryMap.analytics] || null : null,
        userStats: queryMap.userStats !== undefined ? results[queryMap.userStats] || null : null
      };

      // Cache the result
      this.setCachedData(cacheKey, prefetchedData);

      return prefetchedData;
    } catch (error) {
      logger.error("Batch load failed:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Batch load analysis results with related data
   */
  async batchLoadAnalysisResults(
    analysisIds: string[],
    userId: string
  ): Promise<Map<string, AnalysisResult>> {
    if (analysisIds.length === 0) {
      return new Map();
    }

    const cacheKey = `batch_analyses:${userId}:${analysisIds.sort().join(',')}`;
    
    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Single query to fetch all analysis results
      const { data, error } = await monitoredSupabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', userId)
        .in('id', analysisIds);

      if (error) {
        throw error;
      }

      // Convert to map for easy lookup
      const resultMap = new Map<string, AnalysisResult>();
      data.forEach(item => {
        const converted = optimizedAnalysisService['convertDatabaseResult'](item);
        resultMap.set(item.id, converted);
      });

      // Cache the result
      this.setCachedData(cacheKey, resultMap);

      return resultMap;
    } catch (error) {
      logger.error("Batch load analysis results failed:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Batch load users to avoid N+1 when displaying user names
   */
  async batchLoadUsers(userIds: string[]): Promise<Map<string, User>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const uniqueIds = [...new Set(userIds)];
    const cacheKey = `batch_users:${uniqueIds.sort().join(',')}`;
    
    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Single query to fetch all users
      const { data, error } = await monitoredSupabase
        .from('users')
        .select('id, name, email, role, created_at')
        .in('id', uniqueIds);

      if (error) {
        throw error;
      }

      // Convert to map for easy lookup
      const userMap = new Map<string, User>();
      data.forEach(user => {
        userMap.set(user.id, {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.created_at
        });
      });

      // Cache the result
      this.setCachedData(cacheKey, userMap);

      return userMap;
    } catch (error) {
      logger.error("Batch load users failed:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Batch load scan results for scheduled scans
   */
  async batchLoadScanResults(
    scanIds: string[],
    userId: string
  ): Promise<Map<string, AnalysisResult[]>> {
    if (scanIds.length === 0) {
      return new Map();
    }

    const cacheKey = `batch_scan_results:${userId}:${scanIds.sort().join(',')}`;
    
    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Single query to fetch all scan results
      const { data, error } = await monitoredSupabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', userId)
        .in('scan_id', scanIds)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Group by scan_id
      const scanResultsMap = new Map<string, AnalysisResult[]>();
      
      data.forEach(item => {
        const scanId = item.scan_id;
        if (!scanId) return;
        
        if (!scanResultsMap.has(scanId)) {
          scanResultsMap.set(scanId, []);
        }
        
        const converted = optimizedAnalysisService['convertDatabaseResult'](item);
        scanResultsMap.get(scanId)!.push(converted);
      });

      // Cache the result
      this.setCachedData(cacheKey, scanResultsMap);

      return scanResultsMap;
    } catch (error) {
      logger.error("Batch load scan results failed:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Batch load batch analysis results
   */
  async batchLoadBatchResults(
    batchIds: string[],
    userId: string
  ): Promise<Map<string, AnalysisResult[]>> {
    if (batchIds.length === 0) {
      return new Map();
    }

    const cacheKey = `batch_batch_results:${userId}:${batchIds.sort().join(',')}`;
    
    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Single query to fetch all batch results
      const { data, error } = await monitoredSupabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', userId)
        .in('batch_id', batchIds)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Group by batch_id
      const batchResultsMap = new Map<string, AnalysisResult[]>();
      
      data.forEach(item => {
        const batchId = item.batch_id;
        if (!batchId) return;
        
        if (!batchResultsMap.has(batchId)) {
          batchResultsMap.set(batchId, []);
        }
        
        const converted = optimizedAnalysisService['convertDatabaseResult'](item);
        batchResultsMap.get(batchId)!.push(converted);
      });

      // Cache the result
      this.setCachedData(cacheKey, batchResultsMap);

      return batchResultsMap;
    } catch (error) {
      logger.error("Batch load batch results failed:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Preload data for better performance
   */
  async preloadUserData(userId: string): Promise<void> {
    try {
      // Preload common data combinations
      await Promise.all([
        this.batchLoadUserData(userId, { includeAnalyses: true, analysisLimit: 10 }),
        this.batchLoadUserData(userId, { includeDashboard: true }),
        this.batchLoadUserData(userId, { includeAnalytics: true })
      ]);
    } catch (error) {
      logger.error("Preload failed:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get user data with caching
   */
  private async getUserData(userId: string): Promise<User | null> {
    const cacheKey = `user:${userId}`;
    
    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const { data, error } = await monitoredSupabase
        .from('users')
        .select('id, name, email, role, created_at')
        .eq('id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      const user: User = {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        createdAt: data.created_at
      };

      // Cache the result
      this.setCachedData(cacheKey, user);

      return user;
    } catch (error) {
      logger.error("Get user data failed:", error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Cache management
   */
  private getCachedData(key: string): any | null {
    const entry = this.prefetchCache.get(key);
    
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.prefetchCache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCachedData(key: string, data: any, ttl: number = this.CACHE_TTL): void {
    this.prefetchCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });

    // Clean up old entries periodically
    if (this.prefetchCache.size > 1000) {
      this.cleanupCache();
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.prefetchCache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.prefetchCache.delete(key);
    });
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.prefetchCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.prefetchCache.size,
      keys: Array.from(this.prefetchCache.keys())
    };
  }

  /**
   * Invalidate cache for specific user
   */
  invalidateUserCache(userId: string): void {
    const keysToDelete: string[] = [];
    
    this.prefetchCache.forEach((_, key) => {
      if (key.includes(userId)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.prefetchCache.delete(key);
    });
  }
}

// Export singleton instance
export const dataPrefetchingService = new DataPrefetchingService();
export default dataPrefetchingService;