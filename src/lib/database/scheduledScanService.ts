/**
 * Scheduled Scan Service (PostgreSQL)
 * 
 * Service for managing scheduled scans using PostgreSQL database.
 */

import { scheduledScanRepository, ScanFilters } from './repositories/scheduledScanRepository';
import { ScheduledScan } from '../../types/scheduledScan';
import { logger } from '../logging';
import { cacheService } from '../cacheService';

class ScheduledScanService {
  private cachePrefix = 'scans:';
  private cacheTTL = 300; // 5 minutes

  /**
   * Create a new scheduled scan
   */
  async createScan(scan: Omit<ScheduledScan, 'id' | 'createdAt'>): Promise<ScheduledScan> {
    try {
      const result = await scheduledScanRepository.create(scan);
      await this.invalidateUserCaches(scan.userId);
      return result;
    } catch (error) {
      logger.error('Failed to create scheduled scan', error as Error);
      throw error;
    }
  }

  /**
   * Get user's scheduled scans
   */
  async getUserScans(userId: string): Promise<ScheduledScan[]> {
    try {
      const cacheKey = `${this.cachePrefix}user:${userId}`;
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      const result = await scheduledScanRepository.findMany({ userId });
      await cacheService.set(cacheKey, result.data, this.cacheTTL);
      return result.data;
    } catch (error) {
      logger.error('Failed to get user scans', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Update scheduled scan
   */
  async updateScan(id: string, updates: Partial<ScheduledScan>, userId?: string): Promise<ScheduledScan | null> {
    try {
      const result = await scheduledScanRepository.update(id, updates, userId);
      if (result && userId) {
        await this.invalidateUserCaches(userId);
      }
      return result;
    } catch (error) {
      logger.error('Failed to update scan', error as Error, { id, userId });
      throw error;
    }
  }

  private async invalidateUserCaches(userId: string): Promise<void> {
    await cacheService.deletePattern(`${this.cachePrefix}user:${userId}*`);
  }
}

export const scheduledScanService = new ScheduledScanService();