/**
 * Scheduled Scan Repository
 * 
 * Repository pattern for scheduled_scans table operations.
 * Replaces Supabase table operations with direct PostgreSQL queries.
 */

import { db } from '../postgresService';
import { ScheduledScan, DatabaseScheduledScan, convertDatabaseScheduledScan, convertToDatabase } from '../../../types/scheduledScan';
import { logger } from '../../logging';

export interface ScanFilters {
  userId?: string;
  enabled?: boolean;
  status?: 'active' | 'paused' | 'error' | 'completed';
  frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  nextRunBefore?: Date;
  nextRunAfter?: Date;
}

export interface ScanPaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

class ScheduledScanRepository {
  /**
   * Create a new scheduled scan
   */
  async create(scan: Omit<ScheduledScan, 'id' | 'createdAt'>): Promise<ScheduledScan> {
    try {
      const dbScan = convertToDatabase(scan as ScheduledScan);
      
      const query = `
        INSERT INTO scheduled_scans (
          user_id, name, description, frequency, time, sources,
          google_drive_files, enabled, next_run, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const params = [
        dbScan.user_id,
        dbScan.name,
        dbScan.description || null,
        dbScan.frequency,
        dbScan.time,
        JSON.stringify(dbScan.sources || []),
        JSON.stringify(dbScan.google_drive_files || []),
        dbScan.enabled !== false,
        dbScan.next_run,
        dbScan.status || 'active'
      ];

      const result = await db.queryOne<DatabaseScheduledScan>(query, params);
      
      if (!result) {
        throw new Error('Failed to create scheduled scan');
      }

      logger.info('Scheduled scan created', { 
        id: result.id, 
        userId: result.user_id,
        name: result.name 
      });

      return convertDatabaseScheduledScan(result);

    } catch (error) {
      logger.error('Failed to create scheduled scan', error as Error);
      throw error;
    }
  }

  /**
   * Get scheduled scan by ID
   */
  async findById(id: string, userId?: string): Promise<ScheduledScan | null> {
    try {
      let query = 'SELECT * FROM scheduled_scans WHERE id = $1';
      const params: any[] = [id];

      if (userId) {
        query += ' AND user_id = $2';
        params.push(userId);
      }

      const result = await db.queryOne<DatabaseScheduledScan>(query, params);
      
      return result ? convertDatabaseScheduledScan(result) : null;

    } catch (error) {
      logger.error('Failed to find scheduled scan by ID', error as Error, { id, userId });
      throw error;
    }
  }

  /**
   * Find scheduled scans with filters and pagination
   */
  async findMany(
    filters: ScanFilters = {},
    pagination: ScanPaginationOptions = {}
  ): Promise<{ data: ScheduledScan[]; total: number }> {
    try {
      const { 
        limit = 50, 
        offset = 0, 
        orderBy = 'created_at', 
        orderDirection = 'DESC' 
      } = pagination;

      // Build WHERE clause
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        params.push(filters.userId);
      }

      if (filters.enabled !== undefined) {
        conditions.push(`enabled = $${paramIndex++}`);
        params.push(filters.enabled);
      }

      if (filters.status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(filters.status);
      }

      if (filters.frequency) {
        conditions.push(`frequency = $${paramIndex++}`);
        params.push(filters.frequency);
      }

      if (filters.nextRunBefore) {
        conditions.push(`next_run <= $${paramIndex++}`);
        params.push(filters.nextRunBefore);
      }

      if (filters.nextRunAfter) {
        conditions.push(`next_run >= $${paramIndex++}`);
        params.push(filters.nextRunAfter);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM scheduled_scans ${whereClause}`;
      const countResult = await db.queryOne<{ count: string }>(countQuery, params);
      const total = parseInt(countResult?.count || '0');

      // Get data
      const dataQuery = `
        SELECT * FROM scheduled_scans 
        ${whereClause}
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      params.push(limit, offset);
      const results = await db.queryMany<DatabaseScheduledScan>(dataQuery, params);

      const data = results.map(convertDatabaseScheduledScan);

      return { data, total };

    } catch (error) {
      logger.error('Failed to find scheduled scans', error as Error, { filters, pagination });
      throw error;
    }
  }

  /**
   * Update scheduled scan
   */
  async update(id: string, updates: Partial<ScheduledScan>, userId?: string): Promise<ScheduledScan | null> {
    try {
      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Build SET clause
      if (updates.name) {
        updateFields.push(`name = $${paramIndex++}`);
        params.push(updates.name);
      }

      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        params.push(updates.description);
      }

      if (updates.frequency) {
        updateFields.push(`frequency = $${paramIndex++}`);
        params.push(updates.frequency);
      }

      if (updates.time) {
        updateFields.push(`time = $${paramIndex++}`);
        params.push(updates.time);
      }

      if (updates.sources) {
        updateFields.push(`sources = $${paramIndex++}`);
        params.push(JSON.stringify(updates.sources));
      }

      if (updates.googleDriveFiles) {
        updateFields.push(`google_drive_files = $${paramIndex++}`);
        params.push(JSON.stringify(updates.googleDriveFiles));
      }

      if (updates.enabled !== undefined) {
        updateFields.push(`enabled = $${paramIndex++}`);
        params.push(updates.enabled);
      }

      if (updates.nextRun) {
        updateFields.push(`next_run = $${paramIndex++}`);
        params.push(updates.nextRun);
      }

      if (updates.lastRun) {
        updateFields.push(`last_run = $${paramIndex++}`);
        params.push(updates.lastRun);
      }

      if (updates.status) {
        updateFields.push(`status = $${paramIndex++}`);
        params.push(updates.status);
      }

      if (updates.results) {
        updateFields.push(`results = $${paramIndex++}`);
        params.push(JSON.stringify(updates.results));
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      // Build WHERE clause
      let whereClause = `WHERE id = $${paramIndex++}`;
      params.push(id);

      if (userId) {
        whereClause += ` AND user_id = $${paramIndex++}`;
        params.push(userId);
      }

      const query = `
        UPDATE scheduled_scans 
        SET ${updateFields.join(', ')}
        ${whereClause}
        RETURNING *
      `;

      const result = await db.queryOne<DatabaseScheduledScan>(query, params);
      
      if (!result) {
        return null;
      }

      logger.info('Scheduled scan updated', { id, userId });
      return convertDatabaseScheduledScan(result);

    } catch (error) {
      logger.error('Failed to update scheduled scan', error as Error, { id, userId });
      throw error;
    }
  }

  /**
   * Delete scheduled scan
   */
  async delete(id: string, userId?: string): Promise<boolean> {
    try {
      let query = 'DELETE FROM scheduled_scans WHERE id = $1';
      const params: any[] = [id];

      if (userId) {
        query += ' AND user_id = $2';
        params.push(userId);
      }

      const result = await db.query(query, params);
      
      const deleted = (result.rowCount || 0) > 0;
      
      if (deleted) {
        logger.info('Scheduled scan deleted', { id, userId });
      }

      return deleted;

    } catch (error) {
      logger.error('Failed to delete scheduled scan', error as Error, { id, userId });
      throw error;
    }
  }

  /**
   * Get scans that are due to run
   */
  async findDueScans(limit = 100): Promise<ScheduledScan[]> {
    try {
      const query = `
        SELECT * FROM scheduled_scans 
        WHERE enabled = true 
          AND status = 'active' 
          AND next_run <= NOW()
        ORDER BY next_run ASC
        LIMIT $1
      `;

      const results = await db.queryMany<DatabaseScheduledScan>(query, [limit]);
      
      return results.map(convertDatabaseScheduledScan);

    } catch (error) {
      logger.error('Failed to find due scans', error as Error);
      throw error;
    }
  }

  /**
   * Update scan execution status
   */
  async updateExecution(
    id: string, 
    status: 'active' | 'paused' | 'error' | 'completed',
    lastRun: Date,
    nextRun: Date,
    results?: any
  ): Promise<ScheduledScan | null> {
    try {
      const query = `
        UPDATE scheduled_scans 
        SET status = $1, last_run = $2, next_run = $3, results = $4
        WHERE id = $5
        RETURNING *
      `;

      const params = [
        status,
        lastRun,
        nextRun,
        results ? JSON.stringify(results) : null,
        id
      ];

      const result = await db.queryOne<DatabaseScheduledScan>(query, params);
      
      if (!result) {
        return null;
      }

      logger.info('Scan execution updated', { 
        id, 
        status, 
        lastRun: lastRun.toISOString(),
        nextRun: nextRun.toISOString()
      });

      return convertDatabaseScheduledScan(result);

    } catch (error) {
      logger.error('Failed to update scan execution', error as Error, { id, status });
      throw error;
    }
  }

  /**
   * Get scan statistics for a user
   */
  async getStats(userId: string): Promise<{
    totalScans: number;
    activeScans: number;
    completedScans: number;
    errorScans: number;
    nextScanTime: Date | null;
  }> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_scans,
          COUNT(CASE WHEN status = 'active' AND enabled = true THEN 1 END) as active_scans,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_scans,
          COUNT(CASE WHEN status = 'error' THEN 1 END) as error_scans,
          MIN(CASE WHEN status = 'active' AND enabled = true THEN next_run END) as next_scan_time
        FROM scheduled_scans 
        WHERE user_id = $1
      `;

      const result = await db.queryOne<{
        total_scans: string;
        active_scans: string;
        completed_scans: string;
        error_scans: string;
        next_scan_time: string | null;
      }>(query, [userId]);

      if (!result) {
        throw new Error('Failed to get scan stats');
      }

      return {
        totalScans: parseInt(result.total_scans),
        activeScans: parseInt(result.active_scans),
        completedScans: parseInt(result.completed_scans),
        errorScans: parseInt(result.error_scans),
        nextScanTime: result.next_scan_time ? new Date(result.next_scan_time) : null
      };

    } catch (error) {
      logger.error('Failed to get scan stats', error as Error, { userId });
      throw error;
    }
  }
}

// Export singleton instance
export const scheduledScanRepository = new ScheduledScanRepository();