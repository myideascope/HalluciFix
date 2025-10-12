import { AnalysisResult } from '../types/analysis';
import { createQueryBuilder, dbMonitor } from './queryOptimizer';
import { supabase } from './supabase';

// Optimized analysis service that eliminates N+1 queries and uses proper batching
export class OptimizedAnalysisService {
  private analysisResultsQuery = createQueryBuilder<AnalysisResult>('analysis_results');
  private usersQuery = createQueryBuilder('users');

  // Get analysis results with proper eager loading to avoid N+1 queries
  async getAnalysisResultsWithUsers(
    userId?: string,
    options?: {
      limit?: number;
      cursor?: string;
      riskLevel?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{
    data: (AnalysisResult & { user?: any })[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const context = { userId, endpoint: 'getAnalysisResultsWithUsers' };
    
    // Build where conditions
    const whereConditions: Record<string, any> = {};
    if (userId) whereConditions.user_id = userId;
    if (options?.riskLevel) whereConditions.risk_level = options.riskLevel;
    if (options?.startDate) {
      whereConditions.created_at = {
        operator: 'gte',
        value: options.startDate
      };
    }

    // Get analysis results with cursor pagination
    const analysisResults = await this.analysisResultsQuery.findWithCursor({
      where: whereConditions,
      orderBy: [{ column: 'created_at', direction: 'DESC' }],
      limit: options?.limit || 20,
      cursor: options?.cursor
    }, context);

    // Extract unique user IDs to avoid N+1 queries
    const userIds = [...new Set(analysisResults.data.map(result => result.user_id))];
    
    // Batch fetch all users in a single query
    const users = userIds.length > 0 
      ? await this.batchGetUsers(userIds, context)
      : [];

    // Create user lookup map for O(1) access
    const userMap = new Map(users.map(user => [user.id, user]));

    // Combine results with user data
    const enrichedData = analysisResults.data.map(result => ({
      ...result,
      user: userMap.get(result.user_id)
    }));

    return {
      data: enrichedData,
      nextCursor: analysisResults.nextCursor,
      hasMore: analysisResults.hasMore
    };
  }

  // Batch get users to eliminate N+1 queries
  private async batchGetUsers(
    userIds: string[],
    context?: { userId?: string; endpoint?: string }
  ): Promise<any[]> {
    return dbMonitor.trackQuery('users.batchGet', async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, role_id, created_at')
        .in('id', userIds);

      if (error) {
        throw error;
      }

      return data || [];
    }, context);
  }

  // Get user analytics with optimized aggregation
  async getUserAnalytics(
    userId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<{
    totalAnalyses: number;
    averageAccuracy: number;
    riskDistribution: Record<string, number>;
    dailyTrends: Array<{ date: string; count: number; avgAccuracy: number }>;
    avgProcessingTime: number;
  }> {
    const context = { userId, endpoint: 'getUserAnalytics' };
    
    return dbMonitor.trackQuery('analysis_results.getUserAnalytics', async () => {
      const startDate = timeRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = timeRange?.end || new Date();

      const { data, error } = await supabase.rpc('get_user_analytics', {
        p_user_id: userId,
        p_start_date: startDate.toISOString(),
        p_end_date: endDate.toISOString()
      });

      if (error) {
        throw error;
      }

      return data || {
        totalAnalyses: 0,
        averageAccuracy: 0,
        riskDistribution: {},
        dailyTrends: [],
        avgProcessingTime: 0
      };
    }, context);
  }

  // Batch create analysis results for better performance
  async batchCreateAnalysisResults(
    results: Omit<AnalysisResult, 'id' | 'created_at'>[],
    context?: { userId?: string; endpoint?: string }
  ): Promise<AnalysisResult[]> {
    // Add timestamps and IDs
    const enrichedResults = results.map(result => ({
      ...result,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    }));

    // Use batch insert for better performance
    await this.analysisResultsQuery.batchInsert(enrichedResults, 1000, context);

    return enrichedResults as AnalysisResult[];
  }

  // Get analysis results with aggregated statistics
  async getAnalysisResultsWithStats(
    userId?: string,
    options?: {
      limit?: number;
      cursor?: string;
      riskLevel?: string;
    }
  ): Promise<{
    data: AnalysisResult[];
    nextCursor?: string;
    hasMore: boolean;
    stats: {
      totalCount: number;
      averageAccuracy: number;
      riskDistribution: Record<string, number>;
    };
  }> {
    const context = { userId, endpoint: 'getAnalysisResultsWithStats' };
    
    // Build where conditions
    const whereConditions: Record<string, any> = {};
    if (userId) whereConditions.user_id = userId;
    if (options?.riskLevel) whereConditions.risk_level = options.riskLevel;

    // Get paginated results and stats in parallel to avoid sequential queries
    const [paginatedResults, stats] = await Promise.all([
      this.analysisResultsQuery.findWithCursor({
        where: whereConditions,
        orderBy: [{ column: 'created_at', direction: 'DESC' }],
        limit: options?.limit || 20,
        cursor: options?.cursor
      }, context),
      this.getAggregatedStats(whereConditions, context)
    ]);

    return {
      data: paginatedResults.data,
      nextCursor: paginatedResults.nextCursor,
      hasMore: paginatedResults.hasMore,
      stats
    };
  }

  // Get aggregated statistics using optimized database function
  private async getAggregatedStats(
    whereConditions: Record<string, any>,
    context?: { userId?: string; endpoint?: string }
  ): Promise<{
    totalCount: number;
    averageAccuracy: number;
    riskDistribution: Record<string, number>;
  }> {
    return dbMonitor.trackQuery('analysis_results.getAggregatedStats', async () => {
      // Use the optimized aggregation function
      const { data, error } = await supabase.rpc('get_aggregated_data', {
        table_name: 'analysis_results',
        aggregations: {
          count: true,
          avg: ['accuracy']
        },
        where_conditions: whereConditions
      });

      if (error) {
        throw error;
      }

      // Get risk distribution separately for better performance
      const { data: riskData, error: riskError } = await supabase
        .from('analysis_results')
        .select('risk_level, count(*)')
        .match(whereConditions)
        .group('risk_level');

      if (riskError) {
        throw riskError;
      }

      const riskDistribution: Record<string, number> = {};
      (riskData || []).forEach((item: any) => {
        riskDistribution[item.risk_level] = item.count;
      });

      return {
        totalCount: data?.count || 0,
        averageAccuracy: data?.avg_accuracy || 0,
        riskDistribution
      };
    }, context);
  }

  // Search analysis results with full-text search optimization
  async searchAnalysisResults(
    searchQuery: string,
    userId?: string,
    options?: {
      limit?: number;
      cursor?: string;
    }
  ): Promise<{
    data: AnalysisResult[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const context = { userId, endpoint: 'searchAnalysisResults' };
    
    return dbMonitor.trackQuery('analysis_results.search', async () => {
      let query = supabase
        .from('analysis_results')
        .select('*')
        .textSearch('content_search', searchQuery);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (options?.cursor) {
        query = query.lt('created_at', options.cursor);
      }

      const limit = options?.limit || 20;
      query = query
        .order('created_at', { ascending: false })
        .limit(limit + 1);

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

  // Batch update analysis results
  async batchUpdateAnalysisResults(
    updates: Array<{ id: string; data: Partial<AnalysisResult> }>,
    context?: { userId?: string; endpoint?: string }
  ): Promise<void> {
    await this.analysisResultsQuery.batchUpdate(updates, context);
  }

  // Get recent analysis results for a user (optimized for dashboard)
  async getRecentAnalysisResults(
    userId: string,
    limit: number = 10
  ): Promise<AnalysisResult[]> {
    const context = { userId, endpoint: 'getRecentAnalysisResults' };
    
    return dbMonitor.trackQuery('analysis_results.getRecent', async () => {
      const { data, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    }, context);
  }

  // Get performance metrics for monitoring
  getPerformanceMetrics() {
    return dbMonitor.getPerformanceReport();
  }

  // Clear performance metrics (useful for testing)
  clearPerformanceMetrics() {
    dbMonitor.clearMetrics();
  }
}

// Export singleton instance
export const optimizedAnalysisService = new OptimizedAnalysisService();