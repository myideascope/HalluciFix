/**
 * Database Adapter
 * 
 * Provides a unified interface for database operations that can switch
 * between Supabase and AWS RDS based on migration status
 */

import { supabase } from './supabase';
import { databaseService, DatabaseQueryResult } from './database';
import { logger } from './logging';

export interface DatabaseAdapter {
  select<T = any>(
    table: string,
    columns?: string,
    conditions?: Record<string, any>,
    options?: {
      orderBy?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<DatabaseQueryResult<T>>;

  insert<T = any>(
    table: string,
    data: Record<string, any> | Record<string, any>[],
    options?: {
      returning?: string;
      onConflict?: string;
    }
  ): Promise<DatabaseQueryResult<T>>;

  update<T = any>(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>,
    options?: {
      returning?: string;
    }
  ): Promise<DatabaseQueryResult<T>>;

  delete<T = any>(
    table: string,
    conditions: Record<string, any>,
    options?: {
      returning?: string;
    }
  ): Promise<DatabaseQueryResult<T>>;

  query<T = any>(sql: string, values?: any[]): Promise<DatabaseQueryResult<T>>;
}

class SupabaseDatabaseAdapter implements DatabaseAdapter {
  private adapterLogger = logger.child({ component: 'SupabaseDatabaseAdapter' });

  async select<T = any>(
    table: string,
    columns: string = '*',
    conditions?: Record<string, any>,
    options?: {
      orderBy?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<DatabaseQueryResult<T>> {
    try {
      let query = supabase.from(table).select(columns);

      // Add conditions
      if (conditions) {
        Object.entries(conditions).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      // Add ordering
      if (options?.orderBy) {
        const [column, direction] = options.orderBy.split(' ');
        query = query.order(column, { ascending: direction !== 'DESC' });
      }

      // Add pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, (options.offset + (options.limit || 1000)) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        this.adapterLogger.error('Supabase select query failed', error, { table, conditions });
        return { data: null, error };
      }

      return { data, error: null, count: count || data?.length || 0 };

    } catch (error) {
      this.adapterLogger.error('Supabase select operation failed', error as Error, { table });
      return { data: null, error: error as Error };
    }
  }

  async insert<T = any>(
    table: string,
    data: Record<string, any> | Record<string, any>[],
    options?: {
      returning?: string;
      onConflict?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    try {
      let query = supabase.from(table).insert(data);

      if (options?.returning) {
        query = query.select(options.returning);
      }

      // Handle upsert for onConflict
      if (options?.onConflict) {
        query = query.upsert(data);
      }

      const { data: result, error } = await query;

      if (error) {
        this.adapterLogger.error('Supabase insert query failed', error, { table });
        return { data: null, error };
      }

      return { data: result, error: null, count: Array.isArray(result) ? result.length : 1 };

    } catch (error) {
      this.adapterLogger.error('Supabase insert operation failed', error as Error, { table });
      return { data: null, error: error as Error };
    }
  }

  async update<T = any>(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>,
    options?: {
      returning?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    try {
      let query = supabase.from(table).update(data);

      // Add conditions
      Object.entries(conditions).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      if (options?.returning) {
        query = query.select(options.returning);
      }

      const { data: result, error } = await query;

      if (error) {
        this.adapterLogger.error('Supabase update query failed', error, { table, conditions });
        return { data: null, error };
      }

      return { data: result, error: null, count: Array.isArray(result) ? result.length : 1 };

    } catch (error) {
      this.adapterLogger.error('Supabase update operation failed', error as Error, { table });
      return { data: null, error: error as Error };
    }
  }

  async delete<T = any>(
    table: string,
    conditions: Record<string, any>,
    options?: {
      returning?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    try {
      let query = supabase.from(table).delete();

      // Add conditions
      Object.entries(conditions).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      if (options?.returning) {
        query = query.select(options.returning);
      }

      const { data: result, error } = await query;

      if (error) {
        this.adapterLogger.error('Supabase delete query failed', error, { table, conditions });
        return { data: null, error };
      }

      return { data: result, error: null, count: Array.isArray(result) ? result.length : 1 };

    } catch (error) {
      this.adapterLogger.error('Supabase delete operation failed', error as Error, { table });
      return { data: null, error: error as Error };
    }
  }

  async query<T = any>(sql: string, values?: any[]): Promise<DatabaseQueryResult<T>> {
    try {
      // Supabase doesn't support raw SQL queries directly
      // This is a limitation that would need to be handled differently
      throw new Error('Raw SQL queries not supported in Supabase adapter');
    } catch (error) {
      this.adapterLogger.error('Supabase raw query failed', error as Error, { sql });
      return { data: null, error: error as Error };
    }
  }
}

class RDSDatabaseAdapter implements DatabaseAdapter {
  private adapterLogger = logger.child({ component: 'RDSDatabaseAdapter' });

  async select<T = any>(
    table: string,
    columns: string = '*',
    conditions?: Record<string, any>,
    options?: {
      orderBy?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<DatabaseQueryResult<T>> {
    return databaseService.select<T>(table, columns, conditions, options);
  }

  async insert<T = any>(
    table: string,
    data: Record<string, any> | Record<string, any>[],
    options?: {
      returning?: string;
      onConflict?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    return databaseService.insert<T>(table, data, options);
  }

  async update<T = any>(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>,
    options?: {
      returning?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    return databaseService.update<T>(table, data, conditions, options);
  }

  async delete<T = any>(
    table: string,
    conditions: Record<string, any>,
    options?: {
      returning?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    return databaseService.delete<T>(table, conditions, options);
  }

  async query<T = any>(sql: string, values?: any[]): Promise<DatabaseQueryResult<T>> {
    return databaseService.query<T>(sql, values);
  }
}

class DatabaseAdapterService {
  private supabaseAdapter = new SupabaseDatabaseAdapter();
  private rdsAdapter = new RDSDatabaseAdapter();
  private adapterLogger = logger.child({ component: 'DatabaseAdapterService' });

  /**
   * Get the appropriate database adapter based on migration status
   */
  private getAdapter(): DatabaseAdapter {
    // Check if migration to RDS has been completed
    const migrationDbMode = localStorage.getItem('hallucifix_migration_db_mode');
    
    if (migrationDbMode === 'rds') {
      this.adapterLogger.debug('Using RDS database adapter');
      return this.rdsAdapter;
    }

    this.adapterLogger.debug('Using Supabase database adapter');
    return this.supabaseAdapter;
  }

  /**
   * Execute a SELECT query using the appropriate adapter
   */
  async select<T = any>(
    table: string,
    columns?: string,
    conditions?: Record<string, any>,
    options?: {
      orderBy?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<DatabaseQueryResult<T>> {
    const adapter = this.getAdapter();
    return adapter.select<T>(table, columns, conditions, options);
  }

  /**
   * Execute an INSERT query using the appropriate adapter
   */
  async insert<T = any>(
    table: string,
    data: Record<string, any> | Record<string, any>[],
    options?: {
      returning?: string;
      onConflict?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    const adapter = this.getAdapter();
    return adapter.insert<T>(table, data, options);
  }

  /**
   * Execute an UPDATE query using the appropriate adapter
   */
  async update<T = any>(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>,
    options?: {
      returning?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    const adapter = this.getAdapter();
    return adapter.update<T>(table, data, conditions, options);
  }

  /**
   * Execute a DELETE query using the appropriate adapter
   */
  async delete<T = any>(
    table: string,
    conditions: Record<string, any>,
    options?: {
      returning?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    const adapter = this.getAdapter();
    return adapter.delete<T>(table, conditions, options);
  }

  /**
   * Execute a raw SQL query using the appropriate adapter
   */
  async query<T = any>(sql: string, values?: any[]): Promise<DatabaseQueryResult<T>> {
    const adapter = this.getAdapter();
    return adapter.query<T>(sql, values);
  }

  /**
   * Check which database adapter is currently being used
   */
  getCurrentAdapterType(): 'supabase' | 'rds' {
    const migrationDbMode = localStorage.getItem('hallucifix_migration_db_mode');
    return migrationDbMode === 'rds' ? 'rds' : 'supabase';
  }
}

// Export singleton instance
export const dbAdapter = new DatabaseAdapterService();

// Export types
export type { DatabaseAdapter };