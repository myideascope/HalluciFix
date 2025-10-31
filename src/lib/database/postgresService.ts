/**
 * PostgreSQL Database Service
 * 
 * Direct PostgreSQL connection service to replace Supabase client.
 * Provides connection pooling, retry logic, and query optimization.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../logging';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: {
    rejectUnauthorized: boolean;
  };
  // Connection pool settings
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  maxUses?: number;
}

interface QueryOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

interface TransactionCallback<T> {
  (client: PoolClient): Promise<T>;
}

class PostgreSQLService {
  private pool: Pool | null = null;
  private config: DatabaseConfig;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: DatabaseConfig) {
    this.config = {
      max: 20,
      min: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 60000,
      maxUses: 7500,
      ssl: { rejectUnauthorized: false },
      ...config
    };
  }

  /**
   * Initialize database connection pool
   */
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  private async _connect(): Promise<void> {
    try {
      this.pool = new Pool(this.config);

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      this.isConnected = true;
      logger.info('PostgreSQL connection pool initialized', {
        host: this.config.host,
        database: this.config.database,
        maxConnections: this.config.max
      });

      // Set up error handlers
      this.pool.on('error', (err) => {
        logger.error('PostgreSQL pool error', err);
        this.isConnected = false;
      });

      this.pool.on('connect', () => {
        logger.debug('New PostgreSQL client connected');
      });

      this.pool.on('remove', () => {
        logger.debug('PostgreSQL client removed from pool');
      });

    } catch (error) {
      logger.error('Failed to initialize PostgreSQL connection', error as Error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Execute a query with automatic retry logic
   */
  async query<T = any>(
    text: string, 
    params?: any[], 
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    const { timeout = 30000, retries = 3, retryDelay = 1000 } = options;

    if (!this.isConnected || !this.pool) {
      await this.connect();
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();
        
        const result = await Promise.race([
          this.pool!.query<T>(text, params),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Query timeout')), timeout)
          )
        ]);

        const duration = Date.now() - startTime;
        
        logger.debug('PostgreSQL query executed', {
          duration,
          rowCount: result.rowCount,
          attempt
        });

        return result;

      } catch (error) {
        lastError = error as Error;
        
        logger.warn(`PostgreSQL query attempt ${attempt} failed`, {
          error: lastError.message,
          attempt,
          retries
        });

        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    logger.error('PostgreSQL query failed after all retries', lastError!);
    throw lastError;
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    if (!this.isConnected || !this.pool) {
      await this.connect();
    }

    const client = await this.pool!.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a client from the pool for multiple operations
   */
  async getClient(): Promise<PoolClient> {
    if (!this.isConnected || !this.pool) {
      await this.connect();
    }

    return this.pool!.connect();
  }

  /**
   * Execute a query and return the first row
   */
  async queryOne<T = any>(
    text: string, 
    params?: any[], 
    options?: QueryOptions
  ): Promise<T | null> {
    const result = await this.query<T>(text, params, options);
    return result.rows[0] || null;
  }

  /**
   * Execute a query and return all rows
   */
  async queryMany<T = any>(
    text: string, 
    params?: any[], 
    options?: QueryOptions
  ): Promise<T[]> {
    const result = await this.query<T>(text, params, options);
    return result.rows;
  }

  /**
   * Check if the database connection is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1', [], { timeout: 5000, retries: 1 });
      return true;
    } catch (error) {
      logger.error('PostgreSQL health check failed', error as Error);
      return false;
    }
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    if (!this.pool) {
      return null;
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  /**
   * Close all connections and clean up
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      this.connectionPromise = null;
      logger.info('PostgreSQL connection pool closed');
    }
  }
}

// Create database service instance
let dbService: PostgreSQLService | null = null;

/**
 * Get or create the database service instance
 */
export function getDatabaseService(): PostgreSQLService {
  if (!dbService) {
    const config: DatabaseConfig = {
      host: process.env.RDS_HOST || process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.RDS_PORT || process.env.DATABASE_PORT || '5432'),
      database: process.env.RDS_DATABASE || process.env.DATABASE_NAME || 'hallucifix',
      user: process.env.RDS_USERNAME || process.env.DATABASE_USER || 'postgres',
      password: process.env.RDS_PASSWORD || process.env.DATABASE_PASSWORD || '',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    };

    dbService = new PostgreSQLService(config);
  }

  return dbService;
}

/**
 * Initialize database connection
 */
export async function initializeDatabase(): Promise<void> {
  const db = getDatabaseService();
  await db.connect();
}

/**
 * Close database connection
 */
export async function closeDatabaseConnection(): Promise<void> {
  if (dbService) {
    await dbService.close();
    dbService = null;
  }
}

// Export the service class for testing
export { PostgreSQLService };

// Export convenience functions
export const db = {
  query: <T = any>(text: string, params?: any[], options?: QueryOptions) => 
    getDatabaseService().query<T>(text, params, options),
  
  queryOne: <T = any>(text: string, params?: any[], options?: QueryOptions) => 
    getDatabaseService().queryOne<T>(text, params, options),
  
  queryMany: <T = any>(text: string, params?: any[], options?: QueryOptions) => 
    getDatabaseService().queryMany<T>(text, params, options),
  
  transaction: <T>(callback: TransactionCallback<T>) => 
    getDatabaseService().transaction(callback),
  
  healthCheck: () => getDatabaseService().healthCheck(),
  
  getStats: () => getDatabaseService().getPoolStats()
};