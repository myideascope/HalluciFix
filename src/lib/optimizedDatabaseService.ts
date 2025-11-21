import { SupabaseClient } from '@supabase/supabase-js';
import { executeReadQuery, executeWriteQuery } from './readReplicaService';
import { supabase } from './supabase';
import { config } from './config';

import { logger } from './logging';
export interface QueryOptions {
  preferredRegion?: string;
  maxRetries?: number;
  fallbackToPrimary?: boolean;
  useCache?: boolean;
  cacheKey?: string;
  cacheTTL?: number;
}

export interface PaginationOptions {
  limit?: number;
  cursor?: string;
  orderBy?: { column: string; ascending: boolean };
}

class OptimizedDatabaseService {
  private queryCache = new Map<string, { data: any; expiry: number }>();
  private defaultCacheTTL = 5 * 60 * 1000; // 5 minutes

  // Analysis Results Operations
  async getAnalysisResults(
    userId: string,
    options: PaginationOptions & QueryOptions = {}
  ): Promise<{
    data: any[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const cacheKey = options.cacheKey || `analysis_results_${userId}_${JSON.stringify(options)}`;
    
    if (options.useCache !== false) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
    }

    const result = await executeReadQuery(
      async (client: SupabaseClient) => {
        let query = client
          .from('analysis_results')
          .select('*')
          .eq('user_id', userId);

        // Apply cursor-based pagination
        if (options.cursor) {
          query = query.lt('created_at', options.cursor);
        }

        // Apply ordering
        const orderBy = options.orderBy || { column: 'created_at', ascending: false };
        query = query.order(orderBy.column, { ascending: orderBy.ascending });

        // Apply limit (fetch one extra to check for more results)
        const limit = options.limit || 20;
        query = query.limit(limit + 1);

        const { data, error } = await query;
        if (error) throw error;

        const hasMore = data.length > limit;
        const results = hasMore ? data.slice(0, limit) : data;
        const nextCursor = hasMore ? results[results.length - 1].created_at : undefined;

        return {
          data: results,
          nextCursor,
          hasMore
        };
      },
      {
        preferredRegion: options.preferredRegion,
        maxRetries: options.maxRetries,
        fallbackToPrimary: options.fallbackToPrimary
      }
    );

    if (options.useCache !== false) {
      this.setCache(cacheKey, result, options.cacheTTL);
    }

    return result;
  }

  async getAnalysisById(id: string, options: QueryOptions = {}): Promise<any> {
    const cacheKey = options.cacheKey || `analysis_${id}`;
    
    if (options.useCache !== false) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
    }

    const result = await executeReadQuery(
      async (client: SupabaseClient) => {
        const { data, error } = await client
          .from('analysis_results')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        return data;
      },
      options
    );

    if (options.useCache !== false) {
      this.setCache(cacheKey, result, options.cacheTTL);
    }

    return result;
  }

  async createAnalysisResult(analysisData: any): Promise<any> {
    return executeWriteQuery(async (client: SupabaseClient) => {
      const { data, error } = await client
        .from('analysis_results')
        .insert(analysisData)
        .select()
        .single();

      if (error) throw error;

      // Invalidate related caches
      this.invalidateCachePattern(`analysis_results_${analysisData.user_id}`);
      
      return data;
    });
  }

  async updateAnalysisResult(id: string, updates: any): Promise<any> {
    return executeWriteQuery(async (client: SupabaseClient) => {
      const { data, error } = await client
        .from('analysis_results')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Invalidate related caches
      this.invalidateCachePattern(`analysis_${id}`);
      this.invalidateCachePattern(`analysis_results_${data.user_id}`);
      
      return data;
    });
  }

  async deleteAnalysisResult(id: string): Promise<void> {
    return executeWriteQuery(async (client: SupabaseClient) => {
      // Get the analysis first to know which caches to invalidate
      const { data: analysis } = await client
        .from('analysis_results')
        .select('user_id')
        .eq('id', id)
        .single();

      const { error } = await client
        .from('analysis_results')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Invalidate related caches
      this.invalidateCachePattern(`analysis_${id}`);
      if (analysis) {
        this.invalidateCachePattern(`analysis_results_${analysis.user_id}`);
      }
    });
  }

  // User Analytics Operations
  async getUserAnalytics(
    userId: string,
    timeRange?: { start: Date; end: Date },
    options: QueryOptions = {}
  ): Promise<{
    totalAnalyses: number;
    averageAccuracy: number;
    riskDistribution: Record<string, number>;
    dailyTrends: Array<{ date: string; count: number; avgAccuracy: number }>;
  }> {
    const cacheKey = options.cacheKey || `user_analytics_${userId}_${timeRange?.start}_${timeRange?.end}`;
    
    if (options.useCache !== false) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
    }

    const result = await executeReadQuery(
      async (client: SupabaseClient) => {
        // Use materialized view for better performance
        const { data, error } = await client.rpc('get_user_analytics', {
          p_user_id: userId,
          p_start_date: timeRange?.start?.toISOString(),
          p_end_date: timeRange?.end?.toISOString()
        });

        if (error) throw error;
        return data;
      },
      options
    );

    if (options.useCache !== false) {
      this.setCache(cacheKey, result, options.cacheTTL || 10 * 60 * 1000); // 10 minutes for analytics
    }

    return result;
  }

  // Search Operations
  async searchAnalysisResults(
    query: string,
    userId?: string,
    options: PaginationOptions & QueryOptions = {}
  ): Promise<{
    data: any[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    return executeReadQuery(
      async (client: SupabaseClient) => {
        let dbQuery = client
          .from('analysis_results')
          .select('*')
          .textSearch('content_search', query);

        if (userId) {
          dbQuery = dbQuery.eq('user_id', userId);
        }

        // Apply cursor-based pagination
        if (options.cursor) {
          dbQuery = dbQuery.lt('created_at', options.cursor);
        }

        // Apply ordering
        const orderBy = options.orderBy || { column: 'created_at', ascending: false };
        dbQuery = dbQuery.order(orderBy.column, { ascending: orderBy.ascending });

        // Apply limit
        const limit = options.limit || 20;
        dbQuery = dbQuery.limit(limit + 1);

        const { data, error } = await dbQuery;
        if (error) throw error;

        const hasMore = data.length > limit;
        const results = hasMore ? data.slice(0, limit) : data;
        const nextCursor = hasMore ? results[results.length - 1].created_at : undefined;

        return {
          data: results,
          nextCursor,
          hasMore
        };
      },
      options
    );
  }

  // Batch Operations
  async batchCreateAnalysisResults(
    analysisResults: any[],
    batchSize: number = 1000
  ): Promise<any[]> {
    const results: any[] = [];

    for (let i = 0; i < analysisResults.length; i += batchSize) {
      const batch = analysisResults.slice(i, i + batchSize);
      
      const batchResult = await executeWriteQuery(async (client: SupabaseClient) => {
        const { data, error } = await client
          .from('analysis_results')
          .insert(batch)
          .select();

        if (error) throw error;
        return data;
      });

      results.push(...batchResult);

      // Invalidate caches for affected users
      const userIds = new Set(batch.map(item => item.user_id));
      userIds.forEach(userId => {
        this.invalidateCachePattern(`analysis_results_${userId}`);
        this.invalidateCachePattern(`user_analytics_${userId}`);
      });
    }

    return results;
  }

  // Dashboard Data
  async getDashboardData(
    userId: string,
    options: QueryOptions = {}
  ): Promise<{
    recentAnalyses: any[];
    analytics: any;
    riskSummary: any;
  }> {
    const cacheKey = options.cacheKey || `dashboard_${userId}`;
    
    if (options.useCache !== false) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
    }

    const result = await executeReadQuery(
      async (client: SupabaseClient) => {
        // Get recent analyses
        const { data: recentAnalyses, error: recentError } = await client
          .from('analysis_results')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (recentError) throw recentError;

        // Get analytics from materialized view
        const { data: analytics, error: analyticsError } = await client
          .from('user_analytics_summary')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (analyticsError && analyticsError.code !== 'PGRST116') {
          throw analyticsError;
        }

        // Get risk summary
        const { data: riskSummary, error: riskError } = await client
          .from('analysis_results')
          .select('risk_level')
          .eq('user_id', userId);

        if (riskError) throw riskError;

        const riskCounts = riskSummary.reduce((acc: any, item: any) => {
          acc[item.risk_level] = (acc[item.risk_level] || 0) + 1;
          return acc;
        }, {});

        return {
          recentAnalyses,
          analytics: analytics || {
            total_analyses: 0,
            avg_accuracy: 0,
            low_risk_count: 0,
            medium_risk_count: 0,
            high_risk_count: 0,
            critical_risk_count: 0
          },
          riskSummary: riskCounts
        };
      },
      options
    );

    if (options.useCache !== false) {
      this.setCache(cacheKey, result, options.cacheTTL || 2 * 60 * 1000); // 2 minutes for dashboard
    }

    return result;
  }

  // Cache Management
  private getFromCache(key: string): any | null {
    const cached = this.queryCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    if (cached) {
      this.queryCache.delete(key);
    }
    return null;
  }

  private setCache(key: string, data: any, ttl?: number): void {
    const expiry = Date.now() + (ttl || this.defaultCacheTTL);
    this.queryCache.set(key, { data, expiry });
  }

  private invalidateCachePattern(pattern: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.queryCache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.queryCache.delete(key));
  }

  clearCache(): void {
    this.queryCache.clear();
  }

  getCacheStats(): {
    size: number;
    keys: string[];
    hitRate?: number;
  } {
    return {
      size: this.queryCache.size,
      keys: Array.from(this.queryCache.keys())
    };
  }

  // Health Check
  async healthCheck(): Promise<{
    primary: boolean;
    replicas: Record<string, boolean>;
    latency: Record<string, number>;
  }> {
    const results = {
      primary: false,
      replicas: {} as Record<string, boolean>,
      latency: {} as Record<string, number>
    };

    // Test primary database
    try {
      const start = Date.now();
      await supabase.from('users').select('count').limit(1);
      results.primary = true;
      results.latency.primary = Date.now() - start;
    } catch (error) {
      logger.error("Primary database health check failed:", error instanceof Error ? error : new Error(String(error)));
    }

    // Test read replicas if enabled
    if (config.database.enableReadReplicas) {
      try {
        const { readReplicaService } = await import('./readReplicaService');
        const connectivity = await readReplicaService.testReplicaConnectivity();
        
        Object.entries(connectivity).forEach(([replicaId, result]) => {
          if (replicaId !== 'primary') {
            results.replicas[replicaId] = result.connected;
            results.latency[replicaId] = result.latency;
          }
        });
      } catch (error) {
        logger.error("Replica health check failed:", error instanceof Error ? error : new Error(String(error)));
      }
    }

    return results;
  }
}

export const optimizedDatabaseService = new OptimizedDatabaseService();