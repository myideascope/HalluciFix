/**
 * Database Adapter
 * Provides a unified interface for database operations
 * Supports both Supabase (legacy) and direct PostgreSQL (RDS)
 * Enables gradual migration from Supabase to RDS
 */

import { databaseService, DatabaseQueryResult } from './database';
import { getSupabase } from './supabase';
import { config } from './config';
import { logger } from './logging';

const adapterLogger = logger.child({ component: 'DatabaseAdapter' });

export interface AdapterQueryResult<T = any> {
  data: T[] | null;
  error: Error | null;
  count?: number;
}

export interface SelectOptions {
  orderBy?: string;
  limit?: number;
  offset?: number;
}

export interface InsertOptions {
  returning?: string;
  onConflict?: string;
}

export interface UpdateOptions {
  returning?: string;
}

export interface DeleteOptions {
  returning?: string;
}

class DatabaseAdapter {
  private useRDS: boolean | null = null;

  /**
   * Initialize the adapter and determine which database to use
   */
  private async initialize(): Promise<void> {
    if (this.useRDS !== null) {
      return;
    }

    try {
      this.useRDS = await config.shouldUseRDS();
      
      adapterLogger.info('Database adapter initialized', {
        useRDS: this.useRDS,
        migrationMode: await config.isMigrationMode(),
      });

    } catch (error) {
      adapterLogger.error('Failed to initialize database adapter', error as Error);
      // Default to Supabase if configuration fails
      this.useRDS = false;
    }
  }

  /**
   * Execute a SELECT query
   */
  async select<T = any>(
    table: string,
    columns: string = '*',
    conditions?: Record<string, any>,
    options?: SelectOptions
  ): Promise<AdapterQueryResult<T>> {
    await this.initialize();

    if (this.useRDS) {
      return this.selectRDS<T>(table, columns, conditions, options);
    } else {
      return this.selectSupabase<T>(table, columns, conditions, options);
    }
  }

  /**
   * Execute an INSERT query
   */
  async insert<T = any>(
    table: string,
    data: Record<string, any> | Record<string, any>[],
    options?: InsertOptions
  ): Promise<AdapterQueryResult<T>> {
    await this.initialize();

    if (this.useRDS) {
      return this.insertRDS<T>(table, data, options);
    } else {
      return this.insertSupabase<T>(table, data, options);
    }
  }

  /**
   * Execute an UPDATE query
   */
  async update<T = any>(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>,
    options?: UpdateOptions
  ): Promise<AdapterQueryResult<T>> {
    await this.initialize();

    if (this.useRDS) {
      return this.updateRDS<T>(table, data, conditions, options);
    } else {
      return this.updateSupabase<T>(table, data, conditions, options);
    }
  }

  /**
   * Execute a DELETE query
   */
  async delete<T = any>(
    table: string,
    conditions: Record<string, any>,
    options?: DeleteOptions
  ): Promise<AdapterQueryResult<T>> {
    await this.initialize();

    if (this.useRDS) {
      return this.deleteRDS<T>(table, conditions, options);
    } else {
      return this.deleteSupabase<T>(table, conditions, options);
    }
  }

  /**
   * Execute a raw SQL query (RDS only)
   */
  async query<T = any>(
    sql: string,
    values?: any[]
  ): Promise<AdapterQueryResult<T>> {
    await this.initialize();

    if (!this.useRDS) {
      return {
        data: null,
        error: new Error('Raw SQL queries are only supported with RDS'),
      };
    }

    return databaseService.query<T>(sql, values);
  }

  /**
   * Execute a transaction (RDS only)
   */
  async transaction<T>(
    callback: (client: any) => Promise<T>
  ): Promise<{ data: T | null; error: Error | null }> {
    await this.initialize();

    if (!this.useRDS) {
      return {
        data: null,
        error: new Error('Transactions are only supported with RDS'),
      };
    }

    return databaseService.transaction(callback);
  }

  // RDS implementation methods

  private async selectRDS<T>(
    table: string,
    columns: string,
    conditions?: Record<string, any>,
    options?: SelectOptions
  ): Promise<AdapterQueryResult<T>> {
    return databaseService.select<T>(table, columns, conditions, options);
  }

  private async insertRDS<T>(
    table: string,
    data: Record<string, any> | Record<string, any>[],
    options?: InsertOptions
  ): Promise<AdapterQueryResult<T>> {
    return databaseService.insert<T>(table, data, options);
  }

  private async updateRDS<T>(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>,
    options?: UpdateOptions
  ): Promise<AdapterQueryResult<T>> {
    return databaseService.update<T>(table, data, conditions, options);
  }

  private async deleteRDS<T>(
    table: string,
    conditions: Record<string, any>,
    options?: DeleteOptions
  ): Promise<AdapterQueryResult<T>> {
    return databaseService.delete<T>(table, conditions, options);
  }

  // Supabase implementation methods

  private async selectSupabase<T>(
    table: string,
    columns: string,
    conditions?: Record<string, any>,
    options?: SelectOptions
  ): Promise<AdapterQueryResult<T>> {
    try {
      const supabase = await getSupabase();
      let query = supabase.from(table).select(columns);

      // Apply conditions
      if (conditions) {
        Object.entries(conditions).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      // Apply options
      if (options?.orderBy) {
        const [column, direction] = options.orderBy.split(' ');
        query = query.order(column, { ascending: direction !== 'DESC' });
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 1000) - 1);
      }

      const { data, error, count } = await query;

      return {
        data: data as T[],
        error: error ? new Error(error.message) : null,
        count,
      };

    } catch (error) {
      return {
        data: null,
        error: error as Error,
      };
    }
  }

  private async insertSupabase<T>(
    table: string,
    data: Record<string, any> | Record<string, any>[],
    options?: InsertOptions
  ): Promise<AdapterQueryResult<T>> {
    try {
      const supabase = await getSupabase();
      let query = supabase.from(table).insert(data);

      if (options?.returning) {
        query = query.select(options.returning);
      }

      const { data: result, error, count } = await query;

      return {
        data: result as T[],
        error: error ? new Error(error.message) : null,
        count,
      };

    } catch (error) {
      return {
        data: null,
        error: error as Error,
      };
    }
  }

  private async updateSupabase<T>(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>,
    options?: UpdateOptions
  ): Promise<AdapterQueryResult<T>> {
    try {
      const supabase = await getSupabase();
      let query = supabase.from(table).update(data);

      // Apply conditions
      Object.entries(conditions).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      if (options?.returning) {
        query = query.select(options.returning);
      }

      const { data: result, error, count } = await query;

      return {
        data: result as T[],
        error: error ? new Error(error.message) : null,
        count,
      };

    } catch (error) {
      return {
        data: null,
        error: error as Error,
      };
    }
  }

  private async deleteSupabase<T>(
    table: string,
    conditions: Record<string, any>,
    options?: DeleteOptions
  ): Promise<AdapterQueryResult<T>> {
    try {
      const supabase = await getSupabase();
      let query = supabase.from(table).delete();

      // Apply conditions
      Object.entries(conditions).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      if (options?.returning) {
        query = query.select(options.returning);
      }

      const { data: result, error, count } = await query;

      return {
        data: result as T[],
        error: error ? new Error(error.message) : null,
        count,
      };

    } catch (error) {
      return {
        data: null,
        error: error as Error,
      };
    }
  }

  /**
   * Get adapter status
   */
  async getStatus() {
    await this.initialize();
    
    return {
      useRDS: this.useRDS,
      migrationMode: await config.isMigrationMode(),
      rdsStatus: this.useRDS ? databaseService.getPoolStatus() : null,
    };
  }

  /**
   * Force refresh of database selection
   */
  async refresh(): Promise<void> {
    this.useRDS = null;
    await this.initialize();
  }
}

// Create singleton instance
export const databaseAdapter = new DatabaseAdapter();