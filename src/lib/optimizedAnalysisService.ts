import { monitoredSupabase } from './monitoredSupabase';
import { OptimizedQueryBuilder, createQueryBuilder, PaginatedResult } from './queryBuilder';
import { AnalysisResult, DatabaseAnalysisResult, convertDatabaseResult, convertToDatabase } from '../types/analysis';
import analysisService from './analysisService';

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
  ): Promise<{
    totalAnalyses: number;
    averageAccuracy: number;
    riskDistribution: Record<string, number>;
    dailyTrends: Array<{ date: string; count: number; avgAccuracy: number }>;
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
    
    const { data, error } = await monitoredSupabase
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
    await this.queryBuilder.batchInsert(dbResults as DatabaseAnalysisResult[]);
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
        hasNextPage: convertedData.length === (options.limit || 20),
        hasPreviousPage: false, // TODO: implement proper pagination logic
        nextCursor: convertedData.length > 0 ? convertedData[convertedData.length - 1].timestamp : undefined,
        previousCursor: undefined
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
    const totalHallucinations = data.reduce((sum: number, item: any) => sum + (item.hallucinations?.length || 0), 0);
    const averageAccuracy = totalAnalyses > 0 
      ? data.reduce((sum: number, item: any) => sum + item.accuracy, 0) / totalAnalyses 
      : 0;

    // Calculate risk distribution
    const riskCounts = data.reduce((acc: Record<string, number>, item: any) => {
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
    const typeCounts = data.reduce((acc: Record<string, number>, item: any) => {
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
    return Object.entries(weeklyGroups).map(([_weekStart, days], index) => {
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
  }

  /**
   * Analyze content - delegates to the original analysis service for compatibility
   */
  async analyzeContent(
    content: string,
    userId: string,
    options?: {
      sensitivity?: 'low' | 'medium' | 'high';
      includeSourceVerification?: boolean;
      maxHallucinations?: number;
      enableRAG?: boolean;
    }
  ) {
    // Delegate to the original analysis service for the actual analysis
    const result = await analysisService.analyzeContent(content, userId, options);
    
    // The original service already saves the result, so we don't need to save it again
    return result;
  }

  /**
   * Analyze batch - delegates to the original analysis service for compatibility
   */
  async analyzeBatch(
    documents: Array<{ id: string; content: string; filename?: string }>,
    userId: string,
    options?: {
      sensitivity?: 'low' | 'medium' | 'high';
      includeSourceVerification?: boolean;
      maxHallucinations?: number;
      enableRAG?: boolean;
    }
  ) {
    return await analysisService.analyzeBatch(documents, userId, options);
  }
}

// Export singleton instance
export const optimizedAnalysisService = new OptimizedAnalysisService();
export default optimizedAnalysisService;