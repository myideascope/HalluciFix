/**
 * Optimized Analysis Service (PostgreSQL)
 * 
 * Replaces the Supabase-based analysis service with direct PostgreSQL operations.
 * Provides optimized queries, caching, and batch operations.
 */

import { analysisRepository, AnalysisFilters, PaginationOptions, AnalysisStats } from './repositories/analysisRepository';
import { AnalysisResult } from '../../types/analysis';
import { logger } from '../logging';
import { cacheService } from '../cacheService';

export interface DashboardData {
  recentAnalyses: AnalysisResult[];
  totalCount: number;
  riskDistribution: Record<string, number>;
  averageAccuracy: number;
  weeklyTrend: Array<{ date: string; count: number; averageAccuracy: number }>;
}

export interface AnalysisSearchOptions {
  query?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  analysisType?: 'single' | 'batch' | 'scheduled';
  dateFrom?: Date;
  dateTo?: Date;
  minAccuracy?: number;
  maxAccuracy?: number;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'accuracy' | 'risk_level';
  orderDirection?: 'ASC' | 'DESC';
}

class OptimizedAnalysisService {
  private cachePrefix = 'analysis:';
  private cacheTTL = 300; // 5 minutes

  /**
   * Get paginated analysis results with advanced filtering
   */
  async getAnalysisResults(
    userId: string,
    options?: AnalysisSearchOptions
  ): Promise<{ data: AnalysisResult[]; total: number; hasMore: boolean }> {
    try {
      const cacheKey = `${this.cachePrefix}results:${userId}:${JSON.stringify(options || {})}`;
      
      // Try to get from cache first
      const cached = await cacheService.get(cacheKey, async () => {
        // Build filters
        const filters: AnalysisFilters = {
          userId,
          riskLevel: options?.riskLevel,
          analysisType: options?.analysisType,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
          minAccuracy: options?.minAccuracy,
          maxAccuracy: options?.maxAccuracy
        };

      // Build pagination
      const pagination: PaginationOptions = {
        limit: options.limit || 50,
        offset: options.offset || 0,
        orderBy: options.orderBy || 'created_at',
        orderDirection: options.orderDirection || 'DESC'
      };

      const result = await analysisRepository.findMany(filters, pagination);
      
      const response = {
        data: result.data,
        total: result.total,
        hasMore: (pagination.offset || 0) + result.data.length < result.total
      };

      // Cache the result
      await cacheService.set(cacheKey, response, this.cacheTTL);

      logger.info('Analysis results retrieved', {
        userId,
        count: result.data.length,
        total: result.total,
        filters
      });

      return response;

    } catch (error) {
      logger.error('Failed to get analysis results', error as Error, { userId, options });
      throw error;
    }
  }

  /**
   * Get dashboard data with optimized queries and caching
   */
  async getDashboardData(userId: string): Promise<DashboardData> {
    try {
      const cacheKey = `${this.cachePrefix}dashboard:${userId}`;
      
      // Try to get from cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug('Dashboard data served from cache', { userId });
        return cached;
      }

      // Get recent analyses (last 10)
      const recentResult = await this.getAnalysisResults(userId, { 
        limit: 10,
        orderBy: 'created_at',
        orderDirection: 'DESC'
      });

      // Get statistics for the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const stats = await analysisRepository.getStats(userId, thirtyDaysAgo);

      // Get weekly trend data
      const weeklyTrend = await this.getWeeklyTrend(userId);

      const dashboardData: DashboardData = {
        recentAnalyses: recentResult.data,
        totalCount: stats.totalCount,
        riskDistribution: stats.riskDistribution,
        averageAccuracy: stats.averageAccuracy,
        weeklyTrend
      };

      // Cache for 5 minutes
      await cacheService.set(cacheKey, dashboardData, this.cacheTTL);

      logger.info('Dashboard data retrieved', { userId, totalCount: stats.totalCount });

      return dashboardData;

    } catch (error) {
      logger.error('Failed to get dashboard data', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Create a new analysis result
   */
  async createAnalysisResult(analysis: Omit<AnalysisResult, 'id' | 'createdAt'>): Promise<AnalysisResult> {
    try {
      const result = await analysisRepository.create(analysis);

      // Invalidate related caches
      await this.invalidateUserCaches(analysis.userId);

      logger.info('Analysis result created', { 
        id: result.id, 
        userId: analysis.userId,
        analysisType: analysis.analysisType 
      });

      return result;

    } catch (error) {
      logger.error('Failed to create analysis result', error as Error);
      throw error;
    }
  }

  /**
   * Bulk create analysis results (for batch operations)
   */
  async bulkCreateAnalysisResults(
    analyses: Omit<AnalysisResult, 'id' | 'createdAt'>[]
  ): Promise<AnalysisResult[]> {
    try {
      if (analyses.length === 0) {
        return [];
      }

      const results = await analysisRepository.bulkCreate(analyses);

      // Invalidate caches for all affected users
      const userIds = [...new Set(analyses.map(a => a.userId))];
      await Promise.all(userIds.map(userId => this.invalidateUserCaches(userId)));

      logger.info('Bulk analysis results created', { 
        count: results.length,
        userIds: userIds.length
      });

      return results;

    } catch (error) {
      logger.error('Failed to bulk create analysis results', error as Error);
      throw error;
    }
  }

  /**
   * Update an analysis result
   */
  async updateAnalysisResult(
    id: string, 
    updates: Partial<AnalysisResult>, 
    userId?: string
  ): Promise<AnalysisResult | null> {
    try {
      const result = await analysisRepository.update(id, updates, userId);

      if (result) {
        // Invalidate related caches
        await this.invalidateUserCaches(result.userId);

        logger.info('Analysis result updated', { id, userId });
      }

      return result;

    } catch (error) {
      logger.error('Failed to update analysis result', error as Error, { id, userId });
      throw error;
    }
  }

  /**
   * Delete an analysis result
   */
  async deleteAnalysisResult(id: string, userId?: string): Promise<boolean> {
    try {
      const deleted = await analysisRepository.delete(id, userId);

      if (deleted && userId) {
        // Invalidate related caches
        await this.invalidateUserCaches(userId);

        logger.info('Analysis result deleted', { id, userId });
      }

      return deleted;

    } catch (error) {
      logger.error('Failed to delete analysis result', error as Error, { id, userId });
      throw error;
    }
  }

  /**
   * Get analysis statistics for a user
   */
  async getAnalysisStats(
    userId: string, 
    dateFrom?: Date, 
    dateTo?: Date
  ): Promise<AnalysisStats> {
    try {
      const cacheKey = `${this.cachePrefix}stats:${userId}:${dateFrom?.toISOString()}:${dateTo?.toISOString()}`;
      
      // Try to get from cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return cached;
      }

      const stats = await analysisRepository.getStats(userId, dateFrom, dateTo);

      // Cache for 10 minutes
      await cacheService.set(cacheKey, stats, 600);

      return stats;

    } catch (error) {
      logger.error('Failed to get analysis stats', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Search analysis results by content
   */
  async searchAnalysisResults(
    userId: string,
    searchQuery: string,
    options?: AnalysisSearchOptions
  ): Promise<{ data: AnalysisResult[]; total: number }> {
    try {
      // For now, we'll do a simple text search on content
      // In the future, this could be enhanced with full-text search
      const filters: AnalysisFilters = {
        userId,
        riskLevel: options.riskLevel,
        analysisType: options.analysisType,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        minAccuracy: options.minAccuracy,
        maxAccuracy: options.maxAccuracy
      };

      const pagination: PaginationOptions = {
        limit: options.limit || 50,
        offset: options.offset || 0,
        orderBy: options.orderBy || 'created_at',
        orderDirection: options.orderDirection || 'DESC'
      };

      // Get all results first, then filter by search query
      // TODO: Implement proper full-text search in PostgreSQL
      const result = await analysisRepository.findMany(filters, pagination);
      
      const filteredData = result.data.filter(analysis => 
        analysis.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (analysis.filename && analysis.filename.toLowerCase().includes(searchQuery.toLowerCase()))
      );

      return {
        data: filteredData,
        total: filteredData.length
      };

    } catch (error) {
      logger.error('Failed to search analysis results', error as Error, { userId, searchQuery });
      throw error;
    }
  }

  /**
   * Get weekly trend data for dashboard
   */
  private async getWeeklyTrend(userId: string): Promise<Array<{ date: string; count: number; averageAccuracy: number }>> {
    try {
      // Get data for the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const trend: Array<{ date: string; count: number; averageAccuracy: number }> = [];

      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const dayStats = await analysisRepository.getStats(userId, dayStart, dayEnd);

        trend.push({
          date: dateStr,
          count: dayStats.totalCount,
          averageAccuracy: dayStats.averageAccuracy
        });
      }

      return trend;

    } catch (error) {
      logger.error('Failed to get weekly trend', error as Error, { userId });
      return [];
    }
  }

  /**
   * Invalidate all caches for a user
   */
  private async invalidateUserCaches(userId: string): Promise<void> {
    try {
      const patterns = [
        `${this.cachePrefix}results:${userId}:*`,
        `${this.cachePrefix}dashboard:${userId}`,
        `${this.cachePrefix}stats:${userId}:*`
      ];

      await Promise.all(patterns.map(pattern => cacheService.deletePattern(pattern)));

    } catch (error) {
      logger.warn('Failed to invalidate user caches', error as Error, { userId });
      // Don't throw error for cache invalidation failures
    }
  }
}

// Export singleton instance
export const optimizedAnalysisService = new OptimizedAnalysisService();