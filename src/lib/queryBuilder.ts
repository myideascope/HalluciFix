import { SupabaseClient } from '@supabase/supabase-js';
import { AnalysisResult, DatabaseAnalysisResult, convertDatabaseResult } from '../types/analysis';

export interface QueryOptions {
  select?: string[];
  where?: Record<string, any>;
  orderBy?: { column: string; direction: 'ASC' | 'DESC' }[];
  limit?: number;
  offset?: number;
  cursor?: string;
  include?: string[];
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
  totalCount?: number;
}

export interface QueryMetrics {
  query: string;
  executionTime: number;
  rowsReturned: number;
  timestamp: Date;
  userId?: string;
  endpoint?: string;
}

/**
 * Optimized query builder with cursor-based pagination and performance monitoring
 */
export class OptimizedQueryBuilder {
  private tableName: string;
  private supabase: SupabaseClient;
  private metrics: QueryMetrics[] = [];
  private slowQueryThreshold: number = 1000; // 1 second

  constructor(tableName: string, supabase: SupabaseClient) {
    this.tableName = tableName;
    this.supabase = supabase;
  }

  /**
   * Cursor-based pagination for better performance with large datasets
   */
  async findWithCursor(options: QueryOptions): Promise<PaginatedResult<any>> {
    const startTime = Date.now();
    const queryName = `${this.tableName}.findWithCursor`;

    try {
      let query = this.supabase.from(this.tableName);

      // Select specific columns to reduce data transfer
      if (options.select && options.select.length > 0) {
        query = query.select(options.select.join(','));
      } else {
        query = query.select('*');
      }

      // Apply where conditions with optimized operators
      if (options.where) {
        Object.entries(options.where).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else if (typeof value === 'object' && value !== null && 'operator' in value) {
            query = query.filter(key, value.operator, value.value);
          } else if (value !== undefined && value !== null) {
            query = query.eq(key, value);
          }
        });
      }

      // Cursor-based pagination using created_at for consistent ordering
      if (options.cursor) {
        query = query.lt('created_at', options.cursor);
      }

      // Order by (always include created_at for cursor pagination)
      if (options.orderBy && options.orderBy.length > 0) {
        options.orderBy.forEach(({ column, direction }) => {
          query = query.order(column, { ascending: direction === 'ASC' });
        });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Limit (fetch one extra to determine if there are more results)
      const limit = Math.min(options.limit || 20, 100); // Cap at 100 for performance
      query = query.limit(limit + 1);

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const executionTime = Date.now() - startTime;
      const hasMore = data.length > limit;
      const results = hasMore ? data.slice(0, limit) : data;
      const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].created_at : undefined;

      // Track query performance
      await this.trackQuery(queryName, executionTime, results.length);

      return {
        data: results,
        nextCursor,
        hasMore
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.trackQuery(queryName, executionTime, 0, error as Error);
      throw error;
    }
  }

  /**
   * Optimized analysis results query with cursor pagination
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
    const queryOptions: QueryOptions = {
      where: { user_id: userId },
      limit: options.limit || 20,
      cursor: options.cursor,
      orderBy: [{ column: 'created_at', direction: 'DESC' }]
    };

    // Add additional filters
    if (options.riskLevel) {
      queryOptions.where!.risk_level = options.riskLevel;
    }

    if (options.analysisType) {
      queryOptions.where!.analysis_type = options.analysisType;
    }

    if (options.dateRange) {
      queryOptions.where!.created_at = {
        operator: 'gte',
        value: options.dateRange.start.toISOString()
      };
      // Note: Supabase doesn't support multiple conditions on same column in this format
      // We'll handle end date separately
    }

    const result = await this.findWithCursor(queryOptions);

    // Convert database results to application format
    const convertedData = result.data.map((dbResult: DatabaseAnalysisResult) => 
      convertDatabaseResult(dbResult)
    );

    return {
      ...result,
      data: convertedData
    };
  }

  /**
   * Batch operations for better performance
   */
  async batchInsert(records: any[], batchSize: number = 1000): Promise<void> {
    const startTime = Date.now();
    const queryName = `${this.tableName}.batchInsert`;

    try {
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        
        const { error } = await this.supabase
          .from(this.tableName)
          .insert(batch);

        if (error) {
          throw error;
        }
      }

      const executionTime = Date.now() - startTime;
      await this.trackQuery(queryName, executionTime, records.length);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.trackQuery(queryName, executionTime, 0, error as Error);
      throw error;
    }
  }

  /**
   * Batch update operations
   */
  async batchUpdate(
    updates: Array<{ id: string; data: Partial<any> }>,
    batchSize: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    const queryName = `${this.tableName}.batchUpdate`;

    try {
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        
        // Use upsert for batch updates
        const records = batch.map(update => ({ id: update.id, ...update.data }));
        
        const { error } = await this.supabase
          .from(this.tableName)
          .upsert(records);

        if (error) {
          throw error;
        }
      }

      const executionTime = Date.now() - startTime;
      await this.trackQuery(queryName, executionTime, updates.length);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.trackQuery(queryName, executionTime, 0, error as Error);
      throw error;
    }
  }

  /**
   * Optimized count query with caching
   */
  async getCount(where?: Record<string, any>): Promise<number> {
    const startTime = Date.now();
    const queryName = `${this.tableName}.getCount`;

    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (where) {
        Object.entries(where).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else if (typeof value === 'object' && value !== null && 'operator' in value) {
            query = query.filter(key, value.operator, value.value);
          } else if (value !== undefined && value !== null) {
            query = query.eq(key, value);
          }
        });
      }

      const { count, error } = await query;

      if (error) {
        throw error;
      }

      const executionTime = Date.now() - startTime;
      await this.trackQuery(queryName, executionTime, 1);

      return count || 0;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.trackQuery(queryName, executionTime, 0, error as Error);
      throw error;
    }
  }

  /**
   * Optimized aggregation queries using database functions
   */
  async getAggregatedData(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    totalAnalyses: number;
    averageAccuracy: number;
    riskDistribution: Record<string, number>;
    dailyTrends: Array<{ date: string; count: number; avgAccuracy: number }>;
  }> {
    const startTime = Date.now();
    const queryName = `${this.tableName}.getAggregatedData`;

    try {
      // Use a single RPC call for better performance
      const { data, error } = await this.supabase.rpc('get_user_analytics', {
        p_user_id: userId,
        p_start_date: timeRange.start.toISOString(),
        p_end_date: timeRange.end.toISOString()
      });

      if (error) {
        // Fallback to multiple queries if RPC doesn't exist
        return await this.getAggregatedDataFallback(userId, timeRange);
      }

      const executionTime = Date.now() - startTime;
      await this.trackQuery(queryName, executionTime, 1);

      return data;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.trackQuery(queryName, executionTime, 0, error as Error);
      
      // Fallback to individual queries
      return await this.getAggregatedDataFallback(userId, timeRange);
    }
  }

  /**
   * Fallback aggregation method using individual queries
   */
  private async getAggregatedDataFallback(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    totalAnalyses: number;
    averageAccuracy: number;
    riskDistribution: Record<string, number>;
    dailyTrends: Array<{ date: string; count: number; avgAccuracy: number }>;
  }> {
    // Get all analyses in the time range
    const { data: analyses } = await this.supabase
      .from(this.tableName)
      .select('accuracy, risk_level, created_at')
      .eq('user_id', userId)
      .gte('created_at', timeRange.start.toISOString())
      .lte('created_at', timeRange.end.toISOString());

    if (!analyses || analyses.length === 0) {
      return {
        totalAnalyses: 0,
        averageAccuracy: 0,
        riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
        dailyTrends: []
      };
    }

    const totalAnalyses = analyses.length;
    const averageAccuracy = analyses.reduce((sum, a) => sum + a.accuracy, 0) / totalAnalyses;

    // Calculate risk distribution
    const riskCounts = analyses.reduce((acc, a) => {
      acc[a.risk_level] = (acc[a.risk_level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const riskDistribution = {
      low: Math.round(((riskCounts.low || 0) / totalAnalyses) * 100),
      medium: Math.round(((riskCounts.medium || 0) / totalAnalyses) * 100),
      high: Math.round(((riskCounts.high || 0) / totalAnalyses) * 100),
      critical: Math.round(((riskCounts.critical || 0) / totalAnalyses) * 100)
    };

    // Calculate daily trends
    const dailyData = analyses.reduce((acc, a) => {
      const date = new Date(a.created_at).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { count: 0, totalAccuracy: 0 };
      }
      acc[date].count++;
      acc[date].totalAccuracy += a.accuracy;
      return acc;
    }, {} as Record<string, { count: number; totalAccuracy: number }>);

    const dailyTrends = Object.entries(dailyData).map(([date, data]) => ({
      date,
      count: data.count,
      avgAccuracy: data.totalAccuracy / data.count
    }));

    return {
      totalAnalyses,
      averageAccuracy,
      riskDistribution,
      dailyTrends
    };
  }

  /**
   * Track query performance metrics
   */
  private async trackQuery(
    queryName: string,
    executionTime: number,
    rowsReturned: number,
    error?: Error
  ): Promise<void> {
    const metrics: QueryMetrics = {
      query: queryName,
      executionTime,
      rowsReturned,
      timestamp: new Date()
    };

    // Log slow queries
    if (executionTime > this.slowQueryThreshold) {
      console.warn(`Slow query detected: ${queryName} took ${executionTime}ms`);
    }

    // Log errors
    if (error) {
      console.error(`Query failed: ${queryName} after ${executionTime}ms`, error);
    }

    // Store metrics for analysis
    this.metrics.push(metrics);

    // Keep only last 1000 metrics to prevent memory leaks
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    // In production, you would send these metrics to a monitoring service
    // await this.sendToMonitoringService(metrics);
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): {
    slowQueries: QueryMetrics[];
    averageExecutionTime: number;
    totalQueries: number;
  } {
    const slowQueries = this.metrics.filter(m => m.executionTime > this.slowQueryThreshold);
    const averageExecutionTime = this.metrics.length > 0
      ? this.metrics.reduce((sum, m) => sum + m.executionTime, 0) / this.metrics.length
      : 0;

    return {
      slowQueries,
      averageExecutionTime,
      totalQueries: this.metrics.length
    };
  }

  /**
   * Clear performance metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }
}

/**
 * Factory function to create optimized query builders
 */
export const createQueryBuilder = (tableName: string, supabase: SupabaseClient): OptimizedQueryBuilder => {
  return new OptimizedQueryBuilder(tableName, supabase);
};