/**
 * PostgreSQL Database Service
 * Direct connection to AWS RDS PostgreSQL database
 * Replaces Supabase client for database operations
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from './logging';

const dbLogger = logger.child({ component: 'DatabaseService' });

// Database configuration interface
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

// Query result interface for type safety
export interface DatabaseQueryResult<T = any> {
  data: T[] | null;
  error: Error | null;
  count?: number;
}

class DatabaseService {
  private pool: Pool | null = null;
  private config: DatabaseConfig | null = null;

  /**
   * Initialize database connection pool
   */
  async initialize(config: DatabaseConfig): Promise<void> {
    try {
      this.config = config;
      
      this.pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : false,
        max: config.maxConnections || 20,
        idleTimeoutMillis: config.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.connectionTimeoutMillis || 10000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      dbLogger.info('Database connection pool initialized successfully', {
        host: config.host,
        database: config.database,
        maxConnections: config.maxConnections || 20,
      });

    } catch (error) {
      dbLogger.error('Failed to initialize database connection pool', error as Error);
      throw error;
    }
  }

  /**
   * Execute a SELECT query
   */
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
    const startTime = Date.now();
    
    try {
      if (!this.pool) {
        throw new Error('Database not initialized');
      }

      let query = `SELECT ${columns} FROM ${table}`;
      const values: any[] = [];
      let paramIndex = 1;

      // Add WHERE conditions
      if (conditions && Object.keys(conditions).length > 0) {
        const whereClause = Object.keys(conditions)
          .map(key => `${key} = $${paramIndex++}`)
          .join(' AND ');
        query += ` WHERE ${whereClause}`;
        values.push(...Object.values(conditions));
      }

      // Add ORDER BY
      if (options?.orderBy) {
        query += ` ORDER BY ${options.orderBy}`;
      }

      // Add LIMIT
      if (options?.limit) {
        query += ` LIMIT $${paramIndex++}`;
        values.push(options.limit);
      }

      // Add OFFSET
      if (options?.offset) {
        query += ` OFFSET $${paramIndex++}`;
        values.push(options.offset);
      }

      const result = await this.pool.query(query, values);
      const duration = Date.now() - startTime;

      dbLogger.debug('SELECT query executed successfully', {
        table,
        duration,
        rowCount: result.rowCount,
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      });

      return {
        data: result.rows,
        error: null,
        count: result.rowCount || 0,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.error('SELECT query failed', error as Error, {
        table,
        duration,
        conditions,
      });

      return {
        data: null,
        error: error as Error,
      };
    }
  }

  /**
   * Execute an INSERT query
   */
  async insert<T = any>(
    table: string,
    data: Record<string, any> | Record<string, any>[],
    options?: {
      returning?: string;
      onConflict?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    const startTime = Date.now();
    
    try {
      if (!this.pool) {
        throw new Error('Database not initialized');
      }

      const records = Array.isArray(data) ? data : [data];
      if (records.length === 0) {
        throw new Error('No data provided for insert');
      }

      const columns = Object.keys(records[0]);
      const placeholders = records.map((_, recordIndex) => 
        `(${columns.map((_, colIndex) => `$${recordIndex * columns.length + colIndex + 1}`).join(', ')})`
      ).join(', ');

      let query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
      
      // Add ON CONFLICT clause
      if (options?.onConflict) {
        query += ` ${options.onConflict}`;
      }

      // Add RETURNING clause
      if (options?.returning) {
        query += ` RETURNING ${options.returning}`;
      }

      const values = records.flatMap(record => columns.map(col => record[col]));
      const result = await this.pool.query(query, values);
      const duration = Date.now() - startTime;

      dbLogger.info('INSERT query executed successfully', {
        table,
        duration,
        recordCount: records.length,
        insertedCount: result.rowCount,
      });

      return {
        data: result.rows,
        error: null,
        count: result.rowCount || 0,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.error('INSERT query failed', error as Error, {
        table,
        duration,
        recordCount: Array.isArray(data) ? data.length : 1,
      });

      return {
        data: null,
        error: error as Error,
      };
    }
  }

  /**
   * Execute an UPDATE query
   */
  async update<T = any>(
    table: string,
    data: Record<string, any>,
    conditions: Record<string, any>,
    options?: {
      returning?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    const startTime = Date.now();
    
    try {
      if (!this.pool) {
        throw new Error('Database not initialized');
      }

      if (Object.keys(conditions).length === 0) {
        throw new Error('UPDATE requires WHERE conditions for safety');
      }

      const setClause = Object.keys(data)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');

      const whereClause = Object.keys(conditions)
        .map((key, index) => `${key} = $${Object.keys(data).length + index + 1}`)
        .join(' AND ');

      let query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
      
      // Add RETURNING clause
      if (options?.returning) {
        query += ` RETURNING ${options.returning}`;
      }

      const values = [...Object.values(data), ...Object.values(conditions)];
      const result = await this.pool.query(query, values);
      const duration = Date.now() - startTime;

      dbLogger.info('UPDATE query executed successfully', {
        table,
        duration,
        updatedCount: result.rowCount,
      });

      return {
        data: result.rows,
        error: null,
        count: result.rowCount || 0,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.error('UPDATE query failed', error as Error, {
        table,
        duration,
        conditions,
      });

      return {
        data: null,
        error: error as Error,
      };
    }
  }

  /**
   * Execute a DELETE query
   */
  async delete<T = any>(
    table: string,
    conditions: Record<string, any>,
    options?: {
      returning?: string;
    }
  ): Promise<DatabaseQueryResult<T>> {
    const startTime = Date.now();
    
    try {
      if (!this.pool) {
        throw new Error('Database not initialized');
      }

      if (Object.keys(conditions).length === 0) {
        throw new Error('DELETE requires WHERE conditions for safety');
      }

      const whereClause = Object.keys(conditions)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(' AND ');

      let query = `DELETE FROM ${table} WHERE ${whereClause}`;
      
      // Add RETURNING clause
      if (options?.returning) {
        query += ` RETURNING ${options.returning}`;
      }

      const values = Object.values(conditions);
      const result = await this.pool.query(query, values);
      const duration = Date.now() - startTime;

      dbLogger.info('DELETE query executed successfully', {
        table,
        duration,
        deletedCount: result.rowCount,
      });

      return {
        data: result.rows,
        error: null,
        count: result.rowCount || 0,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.error('DELETE query failed', error as Error, {
        table,
        duration,
        conditions,
      });

      return {
        data: null,
        error: error as Error,
      };
    }
  }

  /**
   * Execute a raw SQL query
   */
  async query<T = any>(
    sql: string,
    values?: any[]
  ): Promise<DatabaseQueryResult<T>> {
    const startTime = Date.now();
    
    try {
      if (!this.pool) {
        throw new Error('Database not initialized');
      }

      const result = await this.pool.query(sql, values);
      const duration = Date.now() - startTime;

      dbLogger.debug('Raw query executed successfully', {
        duration,
        rowCount: result.rowCount,
        query: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
      });

      return {
        data: result.rows,
        error: null,
        count: result.rowCount || 0,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.error('Raw query failed', error as Error, {
        duration,
        query: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
      });

      return {
        data: null,
        error: error as Error,
      };
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<{ data: T | null; error: Error | null }> {
    const startTime = Date.now();
    
    if (!this.pool) {
      return {
        data: null,
        error: new Error('Database not initialized'),
      };
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      
      const duration = Date.now() - startTime;
      dbLogger.debug('Transaction completed successfully', { duration });
      
      return {
        data: result,
        error: null,
      };

    } catch (error) {
      await client.query('ROLLBACK');
      const duration = Date.now() - startTime;
      dbLogger.error('Transaction failed and rolled back', error as Error, { duration });
      
      return {
        data: null,
        error: error as Error,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get connection pool status
   */
  getPoolStatus() {
    if (!this.pool) {
      return null;
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Close database connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      dbLogger.info('Database connection pool closed');
    }
  }
}

// Create singleton instance
export const databaseService = new DatabaseService();

// Helper function to get database configuration from environment
export function getDatabaseConfig(): DatabaseConfig {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (databaseUrl) {
    // Parse DATABASE_URL format: postgresql://username:password@host:port/database
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1), // Remove leading slash
      username: url.username,
      password: url.password,
      ssl: url.searchParams.get('sslmode') !== 'disable',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
    };
  }

  // Fallback to individual environment variables
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'hallucifix',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
  };
}

// Initialize database service
export async function initializeDatabase(): Promise<void> {
  const config = getDatabaseConfig();
  await databaseService.initialize(config);
}