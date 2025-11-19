import { SupabaseClient } from '@supabase/supabase-js';
import { AnalysisResult, DatabaseAnalysisResult, convertDatabaseResult } from '../types/analysis';

export interface PaginatedResult<T> {
  data: T[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor?: string;
  previousCursor?: string;
  totalCount?: number;
}

export interface AggregatedData {
  totalCount: number;
  riskDistribution: Record<string, number>;
  averageAccuracy: number;
  timeRange: { start: Date; end: Date };
  totalAnalyses: number;
  dailyTrends: Array<{ date: string; count: number; avgAccuracy: number }>;
}

export interface PerformanceMetrics {
  queryCount: number;
  averageQueryTime: number;
  cacheHitRate: number;
  errorRate: number;
}

/**
 * Optimized query builder for analysis results with performance monitoring
 */
export class OptimizedQueryBuilder {
  private tableName: string;
  private client: SupabaseClient;
  private metrics: {
    queryCount: number;
    totalQueryTime: number;
    cacheHits: number;
    errors: number;
  };

  constructor(tableName: string, client: SupabaseClient) {
    this.tableName = tableName;
    this.client = client;
    this.metrics = {
      queryCount: 0,
      totalQueryTime: 0,
      cacheHits: 0,
      errors: 0
    };
  }

  /**
   * Get paginated analysis results with cursor-based pagination
   */
  async getAnalysisResults(
    userId: string,
    options: {
      limit?: number;
      cursor?: string;
      riskLevel?: string;
      analysisType?: string;
      dateRange?: { start: Date; end: Date };
    } = {}
  ): Promise<PaginatedResult<AnalysisResult>> {
    const startTime = Date.now();

    try {
      const limit = options.limit || 20;
      let query = this.client
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      if (options.riskLevel) {
        query = query.eq('risk_level', options.riskLevel);
      }

      if (options.analysisType) {
        query = query.eq('analysis_type', options.analysisType);
      }

      if (options.dateRange) {
        query = query
          .gte('created_at', options.dateRange.start.toISOString())
          .lte('created_at', options.dateRange.end.toISOString());
      }

      // Apply cursor-based pagination
      if (options.cursor) {
        const cursorDate = new Date(options.cursor);
        query = query.lt('created_at', cursorDate.toISOString());
      }

      // Order by created_at desc and limit
      query = query.order('created_at', { ascending: false }).limit(limit + 1);

      const { data, error } = await query;

      if (error) {
        this.metrics.errors++;
        throw error;
      }

      this.metrics.queryCount++;
      this.metrics.totalQueryTime += Date.now() - startTime;

      const hasNextPage = data && data.length > limit;
      const results = hasNextPage ? data.slice(0, limit) : (data || []);

      const convertedResults = results.map(convertDatabaseResult);

      return {
        data: convertedResults,
        hasNextPage,
        hasPreviousPage: !!options.cursor,
        nextCursor: hasNextPage ? results[results.length - 1]?.created_at : undefined,
        previousCursor: options.cursor
      };
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Get aggregated data for dashboard
   */
  async getAggregatedData(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<AggregatedData> {
    const startTime = Date.now();

    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('risk_level, accuracy')
        .eq('user_id', userId)
        .gte('created_at', timeRange.start.toISOString())
        .lte('created_at', timeRange.end.toISOString());

      if (error) {
        this.metrics.errors++;
        throw error;
      }

      this.metrics.queryCount++;
      this.metrics.totalQueryTime += Date.now() - startTime;

      const totalCount = data?.length || 0;
      const riskDistribution: Record<string, number> = {};
      let totalAccuracy = 0;

      data?.forEach((item: any) => {
        // Count risk levels
        const riskLevel = item.risk_level || 'unknown';
        riskDistribution[riskLevel] = (riskDistribution[riskLevel] || 0) + 1;

        // Sum accuracy for average
        totalAccuracy += item.accuracy || 0;
      });

      return {
        totalCount,
        riskDistribution,
        averageAccuracy: totalCount > 0 ? totalAccuracy / totalCount : 0,
        timeRange,
        totalAnalyses: totalCount,
        dailyTrends: [] // TODO: Implement daily trends calculation
      };
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Batch insert analysis results
   */
  async batchInsert(results: DatabaseAnalysisResult[]): Promise<void> {
    const startTime = Date.now();

    try {
      const { error } = await this.client
        .from(this.tableName)
        .insert(results);

      if (error) {
        this.metrics.errors++;
        throw error;
      }

      this.metrics.queryCount++;
      this.metrics.totalQueryTime += Date.now() - startTime;
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceReport(): PerformanceMetrics {
    const totalQueries = this.metrics.queryCount;
    return {
      queryCount: totalQueries,
      averageQueryTime: totalQueries > 0 ? this.metrics.totalQueryTime / totalQueries : 0,
      cacheHitRate: totalQueries > 0 ? this.metrics.cacheHits / totalQueries : 0,
      errorRate: totalQueries > 0 ? this.metrics.errors / totalQueries : 0
    };
  }

  /**
   * Clear performance metrics
   */
  clearMetrics(): void {
    this.metrics = {
      queryCount: 0,
      totalQueryTime: 0,
      cacheHits: 0,
      errors: 0
    };
  }
}

/**
 * Create a new query builder instance
 */
export function createQueryBuilder(tableName: string, client: SupabaseClient): OptimizedQueryBuilder {
  return new OptimizedQueryBuilder(tableName, client);
}