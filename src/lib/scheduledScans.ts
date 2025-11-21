import { databaseAdapter } from './databaseAdapter';
import { ScheduledScan, DatabaseScheduledScan, convertDatabaseScheduledScan, convertToDatabase } from '../types/scheduledScan';

import { logger } from './logging';
export class ScheduledScansService {
  
  /**
   * Load all scheduled scans for the current user
   */
  static async loadUserScans(userId: string): Promise<ScheduledScan[]> {
    try {
      const result = await databaseAdapter.select<DatabaseScheduledScan>(
        'scheduled_scans',
        '*',
        { user_id: userId },
        { orderBy: 'created_at DESC' }
      );

      if (result.error) {
        logger.error("Error loading scheduled scans:", result.error instanceof Error ? result.error : new Error(String(result.error)));
        throw new Error(`Failed to load scheduled scans: ${result.error.message}`);
      }

      return (result.data || []).map(convertDatabaseScheduledScan);
    } catch (error) {
      logger.error("Error in loadUserScans:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Create a new scheduled scan
   */
  static async createScan(scanData: Omit<ScheduledScan, 'id' | 'created_at'>): Promise<ScheduledScan> {
    try {
      const result = await databaseAdapter.insert<DatabaseScheduledScan>(
        'scheduled_scans',
        convertToDatabase(scanData),
        { returning: '*' }
      );

      if (result.error) {
        logger.error("Error creating scan:", result.error instanceof Error ? result.error : new Error(String(result.error)));
        throw new Error(`Failed to create scan: ${result.error.message}`);
      }

      if (!result.data || result.data.length === 0) {
        throw new Error('No data returned from insert operation');
      }

      return convertDatabaseScheduledScan(result.data[0]);
    } catch (error) {
      logger.error("Error in createScan:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Update an existing scheduled scan
   */
  static async updateScan(scanId: string, updates: Partial<ScheduledScan>): Promise<ScheduledScan> {
    try {
      const result = await databaseAdapter.update<DatabaseScheduledScan>(
        'scheduled_scans',
        updates,
        { id: scanId },
        { returning: '*' }
      );

      if (result.error) {
        logger.error("Error updating scan:", result.error instanceof Error ? result.error : new Error(String(result.error)));
        throw new Error(`Failed to update scan: ${result.error.message}`);
      }

      if (!result.data || result.data.length === 0) {
        throw new Error('No data returned from update operation');
      }

      return convertDatabaseScheduledScan(result.data[0]);
    } catch (error) {
      logger.error("Error in updateScan:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Delete a scheduled scan
   */
  static async deleteScan(scanId: string): Promise<void> {
    try {
      const result = await databaseAdapter.delete(
        'scheduled_scans',
        { id: scanId }
      );

      if (result.error) {
        logger.error("Error deleting scan:", result.error instanceof Error ? result.error : new Error(String(result.error)));
        throw new Error(`Failed to delete scan: ${result.error.message}`);
      }
    } catch (error) {
      logger.error("Error in deleteScan:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Toggle scan enabled status
   */
  static async toggleScan(scanId: string, enabled: boolean): Promise<ScheduledScan> {
    const status = enabled ? 'active' : 'paused';
    return this.updateScan(scanId, { enabled, status });
  }

  /**
   * Calculate next run time based on frequency and time
   */
  static calculateNextRunTime(frequency: string, time: string): string {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    
    if (next <= now) {
      switch (frequency) {
        case 'hourly':
          next.setHours(next.getHours() + 1);
          break;
        case 'daily':
          next.setDate(next.getDate() + 1);
          break;
        case 'weekly':
          next.setDate(next.getDate() + 7);
          break;
        case 'monthly':
          next.setMonth(next.getMonth() + 1);
          break;
      }
    }
    
    return next.toISOString();
  }

  /**
   * Get scan execution logs
   */
  static async getScanExecutorLogs(limit: number = 50): Promise<any[]> {
    try {
      const result = await databaseAdapter.select(
        'scan_executor_logs',
        '*',
        undefined,
        { limit, orderBy: 'created_at DESC' }
      );

      if (result.error) {
        logger.error("Error fetching scan logs:", result.error instanceof Error ? result.error : new Error(String(result.error)));
        throw new Error(`Failed to fetch scan logs: ${result.error.message}`);
      }

      return result.data || [];
    } catch (error) {
      logger.error("Error in getScanExecutorLogs:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}