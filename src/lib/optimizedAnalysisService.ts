<<<<<<< HEAD
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
=======
import { monitoredSupabase } from './monitoredSupabase';
import { OptimizedQueryBuilder, createQueryBuilder, PaginatedResult } from './queryBuilder';
import { AnalysisResult, DatabaseAnalysisResult, convertDatabaseResult, convertToDatabase } from '../types/analysis';

/**
 * Optimized service for analysis results with cursor-based pagination and batch operations
 */
class OptimizedAnalysisService {
  private queryBuilder: OptimizedQueryBuilder;

  constructor() {
    this.queryBuilder = createQueryBuilder('analysis_results', monitoredSupabase.getOriginalClient());
  }

  /**
   * Get paginated analysis results with cursor-based pagination
   */
  async getAnalysisResults(
    userId: string,
    options: {
      limit?: number;
      cursor?: string;
      riskLevel?: string;
      analysisType?: string;
      dateRange?: { start: Date; end: Date };
    } = {}
  ): Promise<PaginatedResult<AnalysisResult>> {
    return await this.queryBuilder.getAnalysisResults(userId, options);
  }

  /**
   * Get analysis results for dashboard with optimized queries
   */
  async getDashboardData(userId: string): Promise<{
    recentAnalyses: AnalysisResult[];
    totalCount: number;
    riskDistribution: Record<string, number>;
    averageAccuracy: number;
  }> {
    // Get recent analyses (last 10)
    const recentResult = await this.getAnalysisResults(userId, { limit: 10 });
    
    // Get aggregated data for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const aggregatedData = await this.queryBuilder.getAggregatedData(userId, {
      start: thirtyDaysAgo,
      end: new Date()
    });

    return {
      recentAnalyses: recentResult.data,
      totalCount: aggregatedData.totalAnalyses,
      riskDistribution: aggregatedData.riskDistribution,
      averageAccuracy: aggregatedData.averageAccuracy
    };
  }

  /**
   * Get analytics data with optimized aggregation
   */
  async getAnalyticsData(
    userId: string,
    timeRange: { start: Date; end: Date }
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  ): Promise<{
    totalAnalyses: number;
    averageAccuracy: number;
    riskDistribution: Record<string, number>;
    dailyTrends: Array<{ date: string; count: number; avgAccuracy: number }>;
<<<<<<< HEAD
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
=======
    weeklyData: Array<{ week: string; analyses: number; accuracy: number; hallucinations: number }>;
  }> {
    const aggregatedData = await this.queryBuilder.getAggregatedData(userId, timeRange);
    
    // Generate weekly data from daily trends
    const weeklyData = this.generateWeeklyData(aggregatedData.dailyTrends);

    return {
      ...aggregatedData,
      weeklyData
    };
  }

  /**
   * Save analysis result with optimized insert
   */
  async saveAnalysisResult(result: AnalysisResult): Promise<void> {
    const dbResult = convertToDatabase(result);
    
    const { error } = await monitoredSupabase
      .from('analysis_results')
      .insert(dbResult);

    if (error) {
      throw error;
    }
  }

  /**
   * Batch save analysis results
   */
  async batchSaveAnalysisResults(results: AnalysisResult[]): Promise<void> {
    const dbResults = results.map(result => convertToDatabase(result));
    await this.queryBuilder.batchInsert(dbResults);
  }

  /**
   * Get analysis result by ID with related data
   */
  async getAnalysisById(id: string, userId: string): Promise<AnalysisResult | null> {
    const { data, error } = await monitoredSupabase
      .from('analysis_results')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return convertDatabaseResult(data as DatabaseAnalysisResult);
  }

  /**
   * Search analysis results with full-text search
   */
  async searchAnalysisResults(
    userId: string,
    searchQuery: string,
    options: {
      limit?: number;
      cursor?: string;
      riskLevel?: string;
    } = {}
  ): Promise<PaginatedResult<AnalysisResult>> {
    const { data, error } = await monitoredSupabase
      .from('analysis_results')
      .select('*')
      .eq('user_id', userId)
      .textSearch('content_search', searchQuery)
      .order('created_at', { ascending: false })
      .limit(options.limit || 20);

    if (error) {
      throw error;
    }

    const convertedData = data.map((dbResult: DatabaseAnalysisResult) => 
      convertDatabaseResult(dbResult)
    );

    return {
      data: convertedData,
      hasMore: convertedData.length === (options.limit || 20),
      nextCursor: convertedData.length > 0 ? convertedData[convertedData.length - 1].timestamp : undefined
    };
  }

  /**
   * Get analysis results by batch ID
   */
  async getAnalysisResultsByBatchId(
    batchId: string,
    userId: string
  ): Promise<AnalysisResult[]> {
    const { data, error } = await monitoredSupabase
      .from('analysis_results')
      .select('*')
      .eq('user_id', userId)
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data.map((dbResult: DatabaseAnalysisResult) => convertDatabaseResult(dbResult));
  }

  /**
   * Get analysis results by scan ID for scheduled scans
   */
  async getAnalysisResultsByScanId(
    scanId: string,
    userId: string
  ): Promise<AnalysisResult[]> {
    const { data, error } = await monitoredSupabase
      .from('analysis_results')
      .select('*')
      .eq('user_id', userId)
      .eq('scan_id', scanId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data.map((dbResult: DatabaseAnalysisResult) => convertDatabaseResult(dbResult));
  }

  /**
   * Delete analysis results (with batch support)
   */
  async deleteAnalysisResults(ids: string[], userId: string): Promise<void> {
    const { error } = await monitoredSupabase
      .from('analysis_results')
      .delete()
      .eq('user_id', userId)
      .in('id', ids);

    if (error) {
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(userId: string): Promise<{
    totalAnalyses: number;
    totalHallucinations: number;
    averageAccuracy: number;
    riskDistribution: Record<string, number>;
    analysisTypeDistribution: Record<string, number>;
  }> {
    const { data, error } = await monitoredSupabase
      .from('analysis_results')
      .select('accuracy, risk_level, analysis_type, hallucinations')
      .eq('user_id', userId);

    if (error || !data) {
      return {
        totalAnalyses: 0,
        totalHallucinations: 0,
        averageAccuracy: 0,
        riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
        analysisTypeDistribution: { single: 0, batch: 0, scheduled: 0 }
      };
    }

    const totalAnalyses = data.length;
    const totalHallucinations = data.reduce((sum, item) => sum + (item.hallucinations?.length || 0), 0);
    const averageAccuracy = totalAnalyses > 0 
      ? data.reduce((sum, item) => sum + item.accuracy, 0) / totalAnalyses 
      : 0;

    // Calculate risk distribution
    const riskCounts = data.reduce((acc, item) => {
      acc[item.risk_level] = (acc[item.risk_level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const riskDistribution = {
      low: Math.round(((riskCounts.low || 0) / totalAnalyses) * 100),
      medium: Math.round(((riskCounts.medium || 0) / totalAnalyses) * 100),
      high: Math.round(((riskCounts.high || 0) / totalAnalyses) * 100),
      critical: Math.round(((riskCounts.critical || 0) / totalAnalyses) * 100)
    };

    // Calculate analysis type distribution
    const typeCounts = data.reduce((acc, item) => {
      acc[item.analysis_type] = (acc[item.analysis_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const analysisTypeDistribution = {
      single: Math.round(((typeCounts.single || 0) / totalAnalyses) * 100),
      batch: Math.round(((typeCounts.batch || 0) / totalAnalyses) * 100),
      scheduled: Math.round(((typeCounts.scheduled || 0) / totalAnalyses) * 100)
    };

    return {
      totalAnalyses,
      totalHallucinations,
      averageAccuracy,
      riskDistribution,
      analysisTypeDistribution
    };
  }

  /**
   * Generate weekly data from daily trends
   */
  private generateWeeklyData(
    dailyTrends: Array<{ date: string; count: number; avgAccuracy: number }>
  ): Array<{ week: string; analyses: number; accuracy: number; hallucinations: number }> {
    // Group daily data into weeks
    const weeklyGroups: Record<string, Array<{ count: number; avgAccuracy: number }>> = {};
    
    dailyTrends.forEach(day => {
      const date = new Date(day.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeklyGroups[weekKey]) {
        weeklyGroups[weekKey] = [];
      }
      weeklyGroups[weekKey].push({ count: day.count, avgAccuracy: day.avgAccuracy });
    });

    // Convert to weekly summary
    return Object.entries(weeklyGroups).map(([weekStart, days], index) => {
      const totalAnalyses = days.reduce((sum, day) => sum + day.count, 0);
      const avgAccuracy = totalAnalyses > 0
        ? days.reduce((sum, day) => sum + (day.avgAccuracy * day.count), 0) / totalAnalyses
        : 0;
      
      return {
        week: `Week ${index + 1}`,
        analyses: totalAnalyses,
        accuracy: avgAccuracy,
        hallucinations: Math.floor(totalAnalyses * 0.1) // Estimated based on analysis count
      };
    }).slice(-4); // Last 4 weeks
  }

  /**
   * Get performance metrics from query builder
   */
  getPerformanceMetrics() {
    return this.queryBuilder.getPerformanceReport();
  }

  /**
   * Clear performance metrics
   */
  clearPerformanceMetrics(): void {
    this.queryBuilder.clearMetrics();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  }
}

// Export singleton instance
<<<<<<< HEAD
export const optimizedAnalysisService = new OptimizedAnalysisService();
=======
export const optimizedAnalysisService = new OptimizedAnalysisService();
export default optimizedAnalysisService;
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
