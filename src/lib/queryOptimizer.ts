import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

import { logger } from './logging';
// Query performance tracking interface
export interface QueryMetrics {
  queryName: string;
  executionTime: number;
  rowsReturned: number;
  timestamp: Date;
  userId?: string;
  endpoint?: string;
  queryHash?: string;
}

// Query options interface for standardized querying
export interface QueryOptions {
  select?: string[];
  where?: Record<string, any>;
  orderBy?: { column: string; direction: 'ASC' | 'DESC' }[];
  limit?: number;
  offset?: number;
  cursor?: string;
  include?: string[];
}

// Pagination result interface
export interface PaginatedResult<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
  totalCount?: number;
}

// Performance monitoring class
class DatabasePerformanceMonitor {
  private metrics: QueryMetrics[] = [];
  private slowQueryThreshold: number = 1000; // 1 second
  private maxMetricsHistory: number = 1000;

  async trackQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>,
    context?: { userId?: string; endpoint?: string }
  ): Promise<T> {
    const startTime = Date.now();
    const queryHash = this.generateQueryHash(queryName, context);
    
    try {
      const result = await queryFn();
      const executionTime = Date.now() - startTime;
      
      // Log slow queries
      if (executionTime > this.slowQueryThreshold) {
        console.warn(`Slow query detected: ${queryName} took ${executionTime}ms`);
        await this.reportSlowQuery({
          queryName,
          executionTime,
          rowsReturned: Array.isArray(result) ? result.length : 1,
          timestamp: new Date(),
          queryHash,
          ...context
        });
      }
      
      // Store metrics for analysis (keep only recent metrics)
      this.addMetric({
        queryName,
        executionTime,
        rowsReturned: Array.isArray(result) ? result.length : 1,
        timestamp: new Date(),
        queryHash,
        ...context
      });
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`Query failed: ${queryName} after ${executionTime}ms`, error);
      throw error;
    }
  }

  private generateQueryHash(queryName: string, context?: any): string {
    const hashInput = JSON.stringify({ queryName, context });
    return btoa(hashInput).substring(0, 16);
  }

  private addMetric(metric: QueryMetrics): void {
    this.metrics.push(metric);
    
    // Keep only recent metrics to prevent memory issues
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  private async reportSlowQuery(metrics: QueryMetrics): Promise<void> {
    try {
      // Store slow query metrics in database for analysis
      await supabase.from('query_performance_log').insert({
        query_name: metrics.queryName,
        execution_time: metrics.executionTime,
        rows_returned: metrics.rowsReturned,
        user_id: metrics.userId,
        endpoint: metrics.endpoint,
        query_hash: metrics.queryHash,
        timestamp: metrics.timestamp.toISOString()
      });
    } catch (error) {
      logger.error("Failed to log slow query metrics:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  getPerformanceReport(): {
    slowQueries: QueryMetrics[];
    averageExecutionTime: number;
    totalQueries: number;
    queryFrequency: Record<string, number>;
  } {
    const slowQueries = this.metrics.filter(m => m.executionTime > this.slowQueryThreshold);
    const averageExecutionTime = this.metrics.length > 0 
      ? this.metrics.reduce((sum, m) => sum + m.executionTime, 0) / this.metrics.length 
      : 0;
    
    const queryFrequency: Record<string, number> = {};
    this.metrics.forEach(m => {
      queryFrequency[m.queryName] = (queryFrequency[m.queryName] || 0) + 1;
    });
    
    return {
      slowQueries,
      averageExecutionTime,
      totalQueries: this.metrics.length,
      queryFrequency
    };
  }

  clearMetrics(): void {
    this.metrics = [];
  }
}

// Optimized query builder class
export class OptimizedQueryBuilder<T = any> {
  private tableName: string;
  private supabaseClient: SupabaseClient;
  private monitor: DatabasePerformanceMonitor;

  constructor(tableName: string, supabaseClient: SupabaseClient = supabase) {
    this.tableName = tableName;
    this.supabaseClient = supabaseClient;
    this.monitor = dbMonitor;
  }

  // Cursor-based pagination for better performance on large datasets
  async findWithCursor(
    options: QueryOptions,
    context?: { userId?: string; endpoint?: string }
  ): Promise<PaginatedResult<T>> {
    const queryName = `${this.tableName}.findWithCursor`;
    
    return this.monitor.trackQuery(queryName, async () => {
      let query = this.supabaseClient.from(this.tableName);

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
          } else if (value !== null && value !== undefined) {
            query = query.eq(key, value);
          }
        });
      }

      // Cursor-based pagination (more efficient than offset)
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

      const hasMore = data.length > limit;
      const results = hasMore ? data.slice(0, limit) : data;
      const nextCursor = hasMore && results.length > 0 
        ? results[results.length - 1].created_at 
        : undefined;

      return {
        data: results,
        nextCursor,
        hasMore
      };
    }, context);
  }

  // Optimized count query with caching consideration
  async count(
    where?: Record<string, any>,
    context?: { userId?: string; endpoint?: string }
  ): Promise<number> {
    const queryName = `${this.tableName}.count`;
    
    return this.monitor.trackQuery(queryName, async () => {
      let query = this.supabaseClient
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (where) {
        Object.entries(where).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else if (typeof value === 'object' && value !== null && 'operator' in value) {
            query = query.filter(key, value.operator, value.value);
          } else if (value !== null && value !== undefined) {
            query = query.eq(key, value);
          }
        });
      }

      const { count, error } = await query;

      if (error) {
        throw error;
      }

      return count || 0;
    }, context);
  }

  // Batch operations for better performance
  async batchInsert(
    records: Partial<T>[],
    batchSize: number = 1000,
    context?: { userId?: string; endpoint?: string }
  ): Promise<void> {
    const queryName = `${this.tableName}.batchInsert`;
    
    return this.monitor.trackQuery(queryName, async () => {
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        
        const { error } = await this.supabaseClient
          .from(this.tableName)
          .insert(batch);

        if (error) {
          throw error;
        }
      }
    }, context);
  }

  // Batch update operations
  async batchUpdate(
    updates: Array<{ id: string; data: Partial<T> }>,
    context?: { userId?: string; endpoint?: string }
  ): Promise<void> {
    const queryName = `${this.tableName}.batchUpdate`;
    
    return this.monitor.trackQuery(queryName, async () => {
      // Use Promise.all for concurrent updates (be careful with rate limits)
      const updatePromises = updates.map(({ id, data }) =>
        this.supabaseClient
          .from(this.tableName)
          .update(data)
          .eq('id', id)
      );

      const results = await Promise.all(updatePromises);
      
      // Check for errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        throw new Error(`Batch update failed: ${errors.map(e => e.error?.message).join(', ')}`);
      }
    }, context);
  }

  // Optimized single record fetch with select optimization
  async findById(
    id: string,
    select?: string[],
    context?: { userId?: string; endpoint?: string }
  ): Promise<T | null> {
    const queryName = `${this.tableName}.findById`;
    
    return this.monitor.trackQuery(queryName, async () => {
      let query = this.supabaseClient.from(this.tableName);

      if (select && select.length > 0) {
        query = query.select(select.join(','));
      } else {
        query = query.select('*');
      }

      const { data, error } = await query.eq('id', id).single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // No rows found
        }
        throw error;
      }

      return data;
    }, context);
  }

  // Aggregation queries with proper indexing hints
  async aggregate(
    aggregations: {
      count?: boolean;
      sum?: string[];
      avg?: string[];
      min?: string[];
      max?: string[];
    },
    where?: Record<string, any>,
    context?: { userId?: string; endpoint?: string }
  ): Promise<Record<string, any>> {
    const queryName = `${this.tableName}.aggregate`;
    
    return this.monitor.trackQuery(queryName, async () => {
      // Use RPC function for complex aggregations to leverage database optimization
      const { data, error } = await this.supabaseClient.rpc('get_aggregated_data', {
        table_name: this.tableName,
        aggregations: JSON.stringify(aggregations),
        where_conditions: JSON.stringify(where || {})
      });

      if (error) {
        throw error;
      }

      return data;
    }, context);
  }
}

// Global performance monitor instance
export const dbMonitor = new DatabasePerformanceMonitor();

// Factory function for creating optimized query builders
export function createQueryBuilder<T = any>(tableName: string): OptimizedQueryBuilder<T> {
  return new OptimizedQueryBuilder<T>(tableName);
}

// Export performance monitoring utilities
export { DatabasePerformanceMonitor };