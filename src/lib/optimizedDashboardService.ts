import { monitoredSupabase } from './monitoredSupabase';
import { AnalysisResult, DatabaseAnalysisResult, convertDatabaseResult } from '../types/analysis';

import { logger } from './logging';
export interface DashboardData {
  stats: {
    totalAnalyses: number;
    averageAccuracy: number;
    totalHallucinations: number;
    activeUsers: number;
  };
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  recentAnalyses: AnalysisResult[];
  accuracyTrends: Array<{
    date: string;
    accuracy: number;
    count: number;
  }>;
}

export interface AnalyticsData {
  weeklyData: Array<{
    week: string;
    analyses: number;
    accuracy: number;
    hallucinations: number;
  }>;
  departmentStats: Array<{
    department: string;
    analyses: number;
    accuracy: number;
    riskScore: string;
  }>;
  performanceMetrics: {
    totalAnalyses: number;
    averageAccuracy: number;
    totalHallucinations: number;
    improvementTrend: number;
  };
}

/**
 * Cache for storing frequently accessed data
 */
class DataCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  set(key: string, data: any, ttlMs: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }
}

/**
 * Optimized dashboard service with materialized views and caching
 */
class OptimizedDashboardService {
  private cache = new DataCache();
  private readonly CACHE_TTL = {
    DASHBOARD: 2 * 60 * 1000, // 2 minutes
    ANALYTICS: 5 * 60 * 1000, // 5 minutes
    USER_STATS: 10 * 60 * 1000, // 10 minutes
    TRENDS: 15 * 60 * 1000 // 15 minutes
  };

  /**
   * Get optimized dashboard data with caching
   */
  async getDashboardData(userId: string): Promise<DashboardData> {
    const cacheKey = `dashboard:${userId}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Try to use materialized view first
      const data = await this.getDashboardDataFromMaterializedView(userId);
      
      // Cache the result
      this.cache.set(cacheKey, data, this.CACHE_TTL.DASHBOARD);
      
      return data;
    } catch (error) {
      logger.warn("Materialized view not available, falling back to direct queries:", { error });
      
      // Fallback to direct queries
      const data = await this.getDashboardDataDirect(userId);
      
      // Cache with shorter TTL for fallback data
      this.cache.set(cacheKey, data, this.CACHE_TTL.DASHBOARD / 2);
      
      return data;
    }
  }

  /**
   * Get dashboard data from materialized view (optimized)
   */
  private async getDashboardDataFromMaterializedView(userId: string): Promise<DashboardData> {
    // Get user summary from materialized view
    const { data: userSummary, error: summaryError } = await monitoredSupabase
      .from('user_analytics_summary')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (summaryError) {
      throw summaryError;
    }

    // Get recent analyses (not cached in materialized view)
    const { data: recentAnalyses, error: recentError } = await monitoredSupabase
      .from('analysis_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      throw recentError;
    }

    // Get daily trends from materialized view
    const { data: dailyTrends, error: trendsError } = await monitoredSupabase
      .from('daily_analytics')
      .select('*')
      .order('analysis_date', { ascending: false })
      .limit(7);

    if (trendsError) {
      throw trendsError;
    }

    return {
      stats: {
        totalAnalyses: userSummary.total_analyses || 0,
        averageAccuracy: userSummary.avg_accuracy || 0,
        totalHallucinations: userSummary.total_hallucinations || 0,
        activeUsers: 1 // Current user
      },
      riskDistribution: {
        low: Math.round(((userSummary.low_risk_count || 0) / (userSummary.total_analyses || 1)) * 100),
        medium: Math.round(((userSummary.medium_risk_count || 0) / (userSummary.total_analyses || 1)) * 100),
        high: Math.round(((userSummary.high_risk_count || 0) / (userSummary.total_analyses || 1)) * 100),
        critical: Math.round(((userSummary.critical_risk_count || 0) / (userSummary.total_analyses || 1)) * 100)
      },
      recentAnalyses: recentAnalyses.map((item: DatabaseAnalysisResult) => convertDatabaseResult(item)),
      accuracyTrends: dailyTrends.map(trend => ({
        date: trend.analysis_date,
        accuracy: trend.avg_accuracy || 0,
        count: trend.total_analyses || 0
      }))
    };
  }

  /**
   * Fallback: Get dashboard data with direct queries
   */
  private async getDashboardDataDirect(userId: string): Promise<DashboardData> {
    // Get all user analyses for calculations
    const { data: allAnalyses, error: allError } = await monitoredSupabase
      .from('analysis_results')
      .select('accuracy, risk_level, hallucinations, created_at')
      .eq('user_id', userId);

    if (allError) {
      throw allError;
    }

    // Get recent detailed analyses
    const { data: recentAnalyses, error: recentError } = await monitoredSupabase
      .from('analysis_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      throw recentError;
    }

    const totalAnalyses = allAnalyses.length;
    const totalHallucinations = allAnalyses.reduce((sum, item) => sum + (item.hallucinations?.length || 0), 0);
    const averageAccuracy = totalAnalyses > 0 
      ? allAnalyses.reduce((sum, item) => sum + item.accuracy, 0) / totalAnalyses 
      : 0;

    // Calculate risk distribution
    const riskCounts = allAnalyses.reduce((acc, item) => {
      acc[item.risk_level] = (acc[item.risk_level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const riskDistribution = {
      low: Math.round(((riskCounts.low || 0) / Math.max(totalAnalyses, 1)) * 100),
      medium: Math.round(((riskCounts.medium || 0) / Math.max(totalAnalyses, 1)) * 100),
      high: Math.round(((riskCounts.high || 0) / Math.max(totalAnalyses, 1)) * 100),
      critical: Math.round(((riskCounts.critical || 0) / Math.max(totalAnalyses, 1)) * 100)
    };

    // Calculate daily trends
    const dailyData = allAnalyses.reduce((acc, item) => {
      const date = new Date(item.created_at).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { count: 0, totalAccuracy: 0 };
      }
      acc[date].count++;
      acc[date].totalAccuracy += item.accuracy;
      return acc;
    }, {} as Record<string, { count: number; totalAccuracy: number }>);

    const accuracyTrends = Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        accuracy: data.totalAccuracy / data.count,
        count: data.count
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 7);

    return {
      stats: {
        totalAnalyses,
        averageAccuracy,
        totalHallucinations,
        activeUsers: 1
      },
      riskDistribution,
      recentAnalyses: recentAnalyses.map((item: DatabaseAnalysisResult) => convertDatabaseResult(item)),
      accuracyTrends
    };
  }

  /**
   * Get optimized analytics data with caching
   */
  async getAnalyticsData(userId: string, timeRange?: { start: Date; end: Date }): Promise<AnalyticsData> {
    const cacheKey = `analytics:${userId}:${timeRange?.start?.getTime() || 'all'}:${timeRange?.end?.getTime() || 'all'}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Try to use materialized view first
      const data = await this.getAnalyticsDataFromMaterializedView(userId, timeRange);
      
      // Cache the result
      this.cache.set(cacheKey, data, this.CACHE_TTL.ANALYTICS);
      
      return data;
    } catch (error) {
      logger.warn("Materialized view not available for analytics, falling back to direct queries:", { error });
      
      // Fallback to direct queries
      const data = await this.getAnalyticsDataDirect(userId, timeRange);
      
      // Cache with shorter TTL for fallback data
      this.cache.set(cacheKey, data, this.CACHE_TTL.ANALYTICS / 2);
      
      return data;
    }
  }

  /**
   * Get analytics data from materialized view (optimized)
   */
  private async getAnalyticsDataFromMaterializedView(
    userId: string, 
    timeRange?: { start: Date; end: Date }
  ): Promise<AnalyticsData> {
    // Get daily analytics from materialized view
    let dailyQuery = monitoredSupabase
      .from('daily_analytics')
      .select('*')
      .order('analysis_date', { ascending: false });

    if (timeRange) {
      dailyQuery = dailyQuery
        .gte('analysis_date', timeRange.start.toISOString().split('T')[0])
        .lte('analysis_date', timeRange.end.toISOString().split('T')[0]);
    }

    const { data: dailyAnalytics, error: dailyError } = await dailyQuery.limit(30);

    if (dailyError) {
      throw dailyError;
    }

    // Get user summary
    const { data: userSummary, error: summaryError } = await monitoredSupabase
      .from('user_analytics_summary')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (summaryError) {
      throw summaryError;
    }

    // Generate weekly data from daily analytics
    const weeklyData = this.generateWeeklyDataFromDaily(dailyAnalytics);

    return {
      weeklyData,
      departmentStats: [{
        department: 'Your Activity',
        analyses: userSummary.total_analyses || 0,
        accuracy: userSummary.avg_accuracy || 0,
        riskScore: this.calculateRiskScore(userSummary)
      }],
      performanceMetrics: {
        totalAnalyses: userSummary.total_analyses || 0,
        averageAccuracy: userSummary.avg_accuracy || 0,
        totalHallucinations: userSummary.total_hallucinations || 0,
        improvementTrend: this.calculateImprovementTrend(dailyAnalytics)
      }
    };
  }

  /**
   * Fallback: Get analytics data with direct queries
   */
  private async getAnalyticsDataDirect(
    userId: string, 
    timeRange?: { start: Date; end: Date }
  ): Promise<AnalyticsData> {
    let query = monitoredSupabase
      .from('analysis_results')
      .select('accuracy, risk_level, hallucinations, created_at')
      .eq('user_id', userId);

    if (timeRange) {
      query = query
        .gte('created_at', timeRange.start.toISOString())
        .lte('created_at', timeRange.end.toISOString());
    }

    const { data: analyses, error } = await query;

    if (error) {
      throw error;
    }

    const totalAnalyses = analyses.length;
    const totalHallucinations = analyses.reduce((sum, item) => sum + (item.hallucinations?.length || 0), 0);
    const averageAccuracy = totalAnalyses > 0 
      ? analyses.reduce((sum, item) => sum + item.accuracy, 0) / totalAnalyses 
      : 0;

    // Generate weekly data
    const weeklyData = this.generateWeeklyDataFromAnalyses(analyses);

    // Calculate risk score
    const riskScore = averageAccuracy > 90 ? 'low' : averageAccuracy > 75 ? 'medium' : 'high';

    return {
      weeklyData,
      departmentStats: [{
        department: 'Your Activity',
        analyses: totalAnalyses,
        accuracy: averageAccuracy,
        riskScore
      }],
      performanceMetrics: {
        totalAnalyses,
        averageAccuracy,
        totalHallucinations,
        improvementTrend: this.calculateImprovementTrendFromAnalyses(analyses)
      }
    };
  }

  /**
   * Generate weekly data from daily analytics
   */
  private generateWeeklyDataFromDaily(
    dailyAnalytics: any[]
  ): Array<{ week: string; analyses: number; accuracy: number; hallucinations: number }> {
    // Group by weeks
    const weeklyGroups: Record<string, any[]> = {};
    
    dailyAnalytics.forEach(day => {
      const date = new Date(day.analysis_date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeklyGroups[weekKey]) {
        weeklyGroups[weekKey] = [];
      }
      weeklyGroups[weekKey].push(day);
    });

    // Convert to weekly summary
    return Object.entries(weeklyGroups)
      .map(([weekStart, days], index) => {
        const totalAnalyses = days.reduce((sum, day) => sum + (day.total_analyses || 0), 0);
        const avgAccuracy = totalAnalyses > 0
          ? days.reduce((sum, day) => sum + ((day.avg_accuracy || 0) * (day.total_analyses || 0)), 0) / totalAnalyses
          : 0;
        
        return {
          week: `Week ${index + 1}`,
          analyses: totalAnalyses,
          accuracy: avgAccuracy,
          hallucinations: Math.floor(totalAnalyses * 0.1) // Estimated
        };
      })
      .slice(-4); // Last 4 weeks
  }

  /**
   * Generate weekly data from raw analyses
   */
  private generateWeeklyDataFromAnalyses(
    analyses: any[]
  ): Array<{ week: string; analyses: number; accuracy: number; hallucinations: number }> {
    // Group by weeks
    const weeklyGroups: Record<string, any[]> = {};
    
    analyses.forEach(analysis => {
      const date = new Date(analysis.created_at);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeklyGroups[weekKey]) {
        weeklyGroups[weekKey] = [];
      }
      weeklyGroups[weekKey].push(analysis);
    });

    // Convert to weekly summary
    return Object.entries(weeklyGroups)
      .map(([weekStart, weekAnalyses], index) => {
        const totalAnalyses = weekAnalyses.length;
        const avgAccuracy = totalAnalyses > 0
          ? weekAnalyses.reduce((sum, a) => sum + a.accuracy, 0) / totalAnalyses
          : 0;
        const totalHallucinations = weekAnalyses.reduce((sum, a) => sum + (a.hallucinations?.length || 0), 0);
        
        return {
          week: `Week ${index + 1}`,
          analyses: totalAnalyses,
          accuracy: avgAccuracy,
          hallucinations: totalHallucinations
        };
      })
      .slice(-4); // Last 4 weeks
  }

  /**
   * Calculate risk score from user summary
   */
  private calculateRiskScore(userSummary: any): string {
    const avgAccuracy = userSummary.avg_accuracy || 0;
    return avgAccuracy > 90 ? 'low' : avgAccuracy > 75 ? 'medium' : 'high';
  }

  /**
   * Calculate improvement trend from daily analytics
   */
  private calculateImprovementTrend(dailyAnalytics: any[]): number {
    if (dailyAnalytics.length < 2) return 0;
    
    const recent = dailyAnalytics.slice(0, 7); // Last 7 days
    const previous = dailyAnalytics.slice(7, 14); // Previous 7 days
    
    if (recent.length === 0 || previous.length === 0) return 0;
    
    const recentAvg = recent.reduce((sum, day) => sum + (day.avg_accuracy || 0), 0) / recent.length;
    const previousAvg = previous.reduce((sum, day) => sum + (day.avg_accuracy || 0), 0) / previous.length;
    
    return previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0;
  }

  /**
   * Calculate improvement trend from raw analyses
   */
  private calculateImprovementTrendFromAnalyses(analyses: any[]): number {
    if (analyses.length < 10) return 0;
    
    // Sort by date
    const sorted = analyses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    const recent = sorted.slice(0, Math.floor(sorted.length / 2));
    const previous = sorted.slice(Math.floor(sorted.length / 2));
    
    if (recent.length === 0 || previous.length === 0) return 0;
    
    const recentAvg = recent.reduce((sum, a) => sum + a.accuracy, 0) / recent.length;
    const previousAvg = previous.reduce((sum, a) => sum + a.accuracy, 0) / previous.length;
    
    return previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0;
  }

  /**
   * Refresh materialized views
   */
  async refreshMaterializedViews(): Promise<void> {
    try {
      await monitoredSupabase.rpc('refresh_user_analytics');
      await monitoredSupabase.rpc('refresh_daily_analytics');
      
      // Clear cache after refresh
      this.cache.clear();
    } catch (error) {
      logger.error("Failed to refresh materialized views:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache['cache'].size,
      keys: Array.from(this.cache['cache'].keys())
    };
  }

  /**
   * Preload dashboard data for better performance
   */
  async preloadDashboardData(userId: string): Promise<void> {
    try {
      await this.getDashboardData(userId);
    } catch (error) {
      logger.error("Failed to preload dashboard data:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Preload analytics data for better performance
   */
  async preloadAnalyticsData(userId: string): Promise<void> {
    try {
      await this.getAnalyticsData(userId);
    } catch (error) {
      logger.error("Failed to preload analytics data:", error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// Export singleton instance
export const optimizedDashboardService = new OptimizedDashboardService();
export default optimizedDashboardService;