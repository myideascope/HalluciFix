/**
 * Database Service
 * 
 * Main database service that replaces Supabase operations.
 * Provides a unified interface for all database operations.
 */

import { initializeDatabase, closeDatabaseConnection, db } from './postgresService';
import { analysisRepository } from './repositories/analysisRepository';
import { scheduledScanRepository } from './repositories/scheduledScanRepository';
import { logger } from '../logging';

export class DatabaseService {
  private initialized = false;

  /**
   * Initialize the database service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await initializeDatabase();
      this.initialized = true;
      logger.info('Database service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database service', error as Error);
      throw error;
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    try {
      await closeDatabaseConnection();
      this.initialized = false;
      logger.info('Database service closed');
    } catch (error) {
      logger.error('Failed to close database service', error as Error);
      throw error;
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    latency: number;
    poolStats: any;
  }> {
    const startTime = Date.now();
    
    try {
      const healthy = await db.healthCheck();
      const latency = Date.now() - startTime;
      const poolStats = db.getStats();

      return {
        healthy,
        latency,
        poolStats
      };
    } catch (error) {
      logger.error('Database health check failed', error as Error);
      return {
        healthy: false,
        latency: Date.now() - startTime,
        poolStats: null
      };
    }
  }

  /**
   * Execute raw SQL query (for migrations, admin operations, etc.)
   */
  async executeRawQuery<T = any>(
    query: string, 
    params?: any[]
  ): Promise<T[]> {
    try {
      const result = await db.queryMany<T>(query, params);
      return result;
    } catch (error) {
      logger.error('Raw query execution failed', error as Error, { query });
      throw error;
    }
  }

  /**
   * Execute query in transaction
   */
  async executeInTransaction<T>(
    callback: (client: any) => Promise<T>
  ): Promise<T> {
    try {
      return await db.transaction(callback);
    } catch (error) {
      logger.error('Transaction execution failed', error as Error);
      throw error;
    }
  }

  // Repository access
  get analysis() {
    return analysisRepository;
  }

  get scheduledScans() {
    return scheduledScanRepository;
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

// Auto-initialize in non-test environments
if (process.env.NODE_ENV !== 'test') {
  databaseService.initialize().catch((error) => {
    logger.error('Failed to auto-initialize database service', error);
  });
}

export { databaseService };

// Export repositories for direct access
export { analysisRepository, scheduledScanRepository };

// Export types
export type { AnalysisFilters, PaginationOptions, AnalysisStats } from './repositories/analysisRepository';
export type { ScanFilters, ScanPaginationOptions } from './repositories/scheduledScanRepository';