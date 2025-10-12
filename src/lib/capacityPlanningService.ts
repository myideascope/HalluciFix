import { supabase } from './supabase';

export interface CapacityMetrics {
  timestamp: Date;
  totalUsers: number;
  activeUsers: number;
  totalAnalyses: number;
  dailyAnalyses: number;
  storageUsed: number; // in bytes
  avgQueryTime: number;
  peakConcurrentUsers: number;
  connectionPoolUtilization: number;
}

export interface GrowthProjection {
  timeframe: '1month' | '3months' | '6months' | '1year';
  projectedUsers: number;
  projectedAnalyses: number;
  projectedStorage: number;
  confidenceLevel: number; // 0-100
}

export interface ScalingRecommendation {
  category: 'storage' | 'compute' | 'connections' | 'replicas' | 'indexing';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  estimatedCost?: string;
  timeToImplement: string;
  metrics: Record<string, number>;
  actions: string[];
}

export interface CapacityReport {
  currentMetrics: CapacityMetrics;
  growthProjections: GrowthProjection[];
  recommendations: ScalingRecommendation[];
  alerts: Array<{
    type: 'warning' | 'critical';
    message: string;
    threshold: number;
    currentValue: number;
  }>;
  summary: {
    overallHealth: 'good' | 'warning' | 'critical';
    timeToCapacity: string;
    recommendedActions: number;
    estimatedMonthlyCost: number;
  };
}

class CapacityPlanningService {
  private readonly thresholds = {
    storage: {
      warning: 0.75, // 75% of capacity
      critical: 0.9  // 90% of capacity
    },
    connections: {
      warning: 0.7,  // 70% of max connections
      critical: 0.85 // 85% of max connections
    },
    queryTime: {
      warning: 500,   // 500ms average
      critical: 1000  // 1000ms average
    },
    userGrowth: {
      high: 0.2,      // 20% monthly growth
      moderate: 0.1   // 10% monthly growth
    }
  };

  async collectCurrentMetrics(): Promise<CapacityMetrics> {
    try {
      // Get user metrics
      const { data: userStats } = await supabase.rpc('get_user_statistics');
      
      // Get analysis metrics
      const { data: analysisStats } = await supabase.rpc('get_analysis_statistics');
      
      // Get storage metrics
      const { data: storageStats } = await supabase.rpc('get_storage_statistics');
      
      // Get performance metrics
      const { data: performanceStats } = await supabase.rpc('get_performance_statistics');
      
      // Get connection pool metrics
      const { data: connectionStats } = await supabase.rpc('get_connection_pool_stats');

      return {
        timestamp: new Date(),
        totalUsers: userStats?.[0]?.total_users || 0,
        activeUsers: userStats?.[0]?.active_users || 0,
        totalAnalyses: analysisStats?.[0]?.total_analyses || 0,
        dailyAnalyses: analysisStats?.[0]?.daily_analyses || 0,
        storageUsed: storageStats?.[0]?.storage_used || 0,
        avgQueryTime: performanceStats?.[0]?.avg_query_time || 0,
        peakConcurrentUsers: userStats?.[0]?.peak_concurrent_users || 0,
        connectionPoolUtilization: connectionStats?.[0]?.utilization_percent || 0
      };
    } catch (error) {
      console.error('Error collecting capacity metrics:', error);
      
      // Return default metrics if collection fails
      return {
        timestamp: new Date(),
        totalUsers: 0,
        activeUsers: 0,
        totalAnalyses: 0,
        dailyAnalyses: 0,
        storageUsed: 0,
        avgQueryTime: 0,
        peakConcurrentUsers: 0,
        connectionPoolUtilization: 0
      };
    }
  }

  async calculateGrowthProjections(currentMetrics: CapacityMetrics): Promise<GrowthProjection[]> {
    try {
      // Get historical data for trend analysis
      const { data: historicalData } = await supabase
        .from('capacity_metrics_log')
        .select('*')
        .gte('timestamp', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) // Last 90 days
        .order('timestamp', { ascending: true });

      if (!historicalData || historicalData.length < 7) {
        // Not enough data for projections, use conservative estimates
        return this.getDefaultProjections(currentMetrics);
      }

      // Calculate growth rates
      const userGrowthRate = this.calculateGrowthRate(
        historicalData.map(d => d.total_users)
      );
      
      const analysisGrowthRate = this.calculateGrowthRate(
        historicalData.map(d => d.total_analyses)
      );
      
      const storageGrowthRate = this.calculateGrowthRate(
        historicalData.map(d => d.storage_used)
      );

      // Generate projections
      const projections: GrowthProjection[] = [
        {
          timeframe: '1month',
          projectedUsers: Math.round(currentMetrics.totalUsers * (1 + userGrowthRate)),
          projectedAnalyses: Math.round(currentMetrics.totalAnalyses * (1 + analysisGrowthRate)),
          projectedStorage: Math.round(currentMetrics.storageUsed * (1 + storageGrowthRate)),
          confidenceLevel: this.calculateConfidenceLevel(historicalData.length, 30)
        },
        {
          timeframe: '3months',
          projectedUsers: Math.round(currentMetrics.totalUsers * Math.pow(1 + userGrowthRate, 3)),
          projectedAnalyses: Math.round(currentMetrics.totalAnalyses * Math.pow(1 + analysisGrowthRate, 3)),
          projectedStorage: Math.round(currentMetrics.storageUsed * Math.pow(1 + storageGrowthRate, 3)),
          confidenceLevel: this.calculateConfidenceLevel(historicalData.length, 90)
        },
        {
          timeframe: '6months',
          projectedUsers: Math.round(currentMetrics.totalUsers * Math.pow(1 + userGrowthRate, 6)),
          projectedAnalyses: Math.round(currentMetrics.totalAnalyses * Math.pow(1 + analysisGrowthRate, 6)),
          projectedStorage: Math.round(currentMetrics.storageUsed * Math.pow(1 + storageGrowthRate, 6)),
          confidenceLevel: this.calculateConfidenceLevel(historicalData.length, 180)
        },
        {
          timeframe: '1year',
          projectedUsers: Math.round(currentMetrics.totalUsers * Math.pow(1 + userGrowthRate, 12)),
          projectedAnalyses: Math.round(currentMetrics.totalAnalyses * Math.pow(1 + analysisGrowthRate, 12)),
          projectedStorage: Math.round(currentMetrics.storageUsed * Math.pow(1 + storageGrowthRate, 12)),
          confidenceLevel: this.calculateConfidenceLevel(historicalData.length, 365)
        }
      ];

      return projections;
    } catch (error) {
      console.error('Error calculating growth projections:', error);
      return this.getDefaultProjections(currentMetrics);
    }
  }

  private calculateGrowthRate(values: number[]): number {
    if (values.length < 2) return 0;
    
    const firstValue = values[0] || 1;
    const lastValue = values[values.length - 1] || 1;
    const periods = values.length - 1;
    
    // Calculate compound monthly growth rate
    const growthRate = Math.pow(lastValue / firstValue, 1 / periods) - 1;
    
    // Cap growth rate at reasonable limits
    return Math.min(Math.max(growthRate, -0.5), 1.0);
  }

  private calculateConfidenceLevel(dataPoints: number, projectionDays: number): number {
    // Confidence decreases with longer projections and fewer data points
    const dataConfidence = Math.min(dataPoints / 30, 1); // Max confidence with 30+ data points
    const timeConfidence = Math.max(1 - (projectionDays / 365), 0.3); // Min 30% confidence
    
    return Math.round(dataConfidence * timeConfidence * 100);
  }

  private getDefaultProjections(currentMetrics: CapacityMetrics): GrowthProjection[] {
    // Conservative growth estimates when no historical data is available
    const conservativeGrowth = 0.05; // 5% monthly growth
    
    return [
      {
        timeframe: '1month',
        projectedUsers: Math.round(currentMetrics.totalUsers * 1.05),
        projectedAnalyses: Math.round(currentMetrics.totalAnalyses * 1.1),
        projectedStorage: Math.round(currentMetrics.storageUsed * 1.1),
        confidenceLevel: 50
      },
      {
        timeframe: '3months',
        projectedUsers: Math.round(currentMetrics.totalUsers * 1.16),
        projectedAnalyses: Math.round(currentMetrics.totalAnalyses * 1.33),
        projectedStorage: Math.round(currentMetrics.storageUsed * 1.33),
        confidenceLevel: 40
      },
      {
        timeframe: '6months',
        projectedUsers: Math.round(currentMetrics.totalUsers * 1.34),
        projectedAnalyses: Math.round(currentMetrics.totalAnalyses * 1.77),
        projectedStorage: Math.round(currentMetrics.storageUsed * 1.77),
        confidenceLevel: 30
      },
      {
        timeframe: '1year',
        projectedUsers: Math.round(currentMetrics.totalUsers * 1.8),
        projectedAnalyses: Math.round(currentMetrics.totalAnalyses * 3.14),
        projectedStorage: Math.round(currentMetrics.storageUsed * 3.14),
        confidenceLevel: 20
      }
    ];
  }

  generateRecommendations(
    currentMetrics: CapacityMetrics,
    projections: GrowthProjection[]
  ): ScalingRecommendation[] {
    const recommendations: ScalingRecommendation[] = [];

    // Storage recommendations
    const storageRecommendations = this.generateStorageRecommendations(currentMetrics, projections);
    recommendations.push(...storageRecommendations);

    // Connection pool recommendations
    const connectionRecommendations = this.generateConnectionRecommendations(currentMetrics);
    recommendations.push(...connectionRecommendations);

    // Performance recommendations
    const performanceRecommendations = this.generatePerformanceRecommendations(currentMetrics);
    recommendations.push(...performanceRecommendations);

    // Read replica recommendations
    const replicaRecommendations = this.generateReplicaRecommendations(currentMetrics, projections);
    recommendations.push(...replicaRecommendations);

    // Index optimization recommendations
    const indexRecommendations = this.generateIndexRecommendations(currentMetrics);
    recommendations.push(...indexRecommendations);

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private generateStorageRecommendations(
    metrics: CapacityMetrics,
    projections: GrowthProjection[]
  ): ScalingRecommendation[] {
    const recommendations: ScalingRecommendation[] = [];
    const sixMonthProjection = projections.find(p => p.timeframe === '6months');
    
    if (sixMonthProjection && sixMonthProjection.projectedStorage > metrics.storageUsed * 5) {
      recommendations.push({
        category: 'storage',
        priority: 'high',
        title: 'Implement Data Archiving Strategy',
        description: 'Storage growth is projected to increase 5x in 6 months. Implement automated data archiving.',
        impact: 'Reduces storage costs by 60-80% and improves query performance',
        estimatedCost: '$200-500/month savings',
        timeToImplement: '2-3 weeks',
        metrics: {
          currentStorage: metrics.storageUsed,
          projectedStorage: sixMonthProjection.projectedStorage,
          potentialSavings: sixMonthProjection.projectedStorage * 0.7
        },
        actions: [
          'Enable automated archiving for analysis results older than 2 years',
          'Implement data compression for archived data',
          'Set up automated cleanup for temporary data',
          'Monitor storage usage trends weekly'
        ]
      });
    }

    if (metrics.storageUsed > 50 * 1024 * 1024 * 1024) { // 50GB
      recommendations.push({
        category: 'storage',
        priority: 'medium',
        title: 'Optimize Database Storage',
        description: 'Large database size detected. Consider partitioning and compression.',
        impact: 'Improves query performance and reduces storage costs',
        timeToImplement: '1-2 weeks',
        metrics: {
          currentStorage: metrics.storageUsed,
          estimatedReduction: metrics.storageUsed * 0.3
        },
        actions: [
          'Implement table partitioning for analysis_results',
          'Enable database compression',
          'Optimize JSON column storage',
          'Remove duplicate data'
        ]
      });
    }

    return recommendations;
  }

  private generateConnectionRecommendations(metrics: CapacityMetrics): ScalingRecommendation[] {
    const recommendations: ScalingRecommendation[] = [];

    if (metrics.connectionPoolUtilization > this.thresholds.connections.critical * 100) {
      recommendations.push({
        category: 'connections',
        priority: 'critical',
        title: 'Increase Connection Pool Size',
        description: 'Connection pool utilization is critically high. Immediate action required.',
        impact: 'Prevents connection timeouts and improves application reliability',
        timeToImplement: 'Immediate',
        metrics: {
          currentUtilization: metrics.connectionPoolUtilization,
          recommendedIncrease: 50
        },
        actions: [
          'Increase max connection pool size by 50%',
          'Enable connection pool monitoring',
          'Implement connection retry logic',
          'Review query optimization opportunities'
        ]
      });
    } else if (metrics.connectionPoolUtilization > this.thresholds.connections.warning * 100) {
      recommendations.push({
        category: 'connections',
        priority: 'high',
        title: 'Monitor Connection Pool Usage',
        description: 'Connection pool utilization is approaching limits.',
        impact: 'Prevents future connection issues',
        timeToImplement: '1 week',
        metrics: {
          currentUtilization: metrics.connectionPoolUtilization,
          warningThreshold: this.thresholds.connections.warning * 100
        },
        actions: [
          'Set up connection pool alerts',
          'Plan for connection pool scaling',
          'Optimize long-running queries',
          'Implement connection pooling best practices'
        ]
      });
    }

    return recommendations;
  }

  private generatePerformanceRecommendations(metrics: CapacityMetrics): ScalingRecommendation[] {
    const recommendations: ScalingRecommendation[] = [];

    if (metrics.avgQueryTime > this.thresholds.queryTime.critical) {
      recommendations.push({
        category: 'compute',
        priority: 'critical',
        title: 'Optimize Database Performance',
        description: 'Average query time exceeds acceptable limits. Performance optimization needed.',
        impact: 'Improves user experience and reduces server load',
        timeToImplement: '1-2 weeks',
        metrics: {
          currentAvgTime: metrics.avgQueryTime,
          targetTime: 200,
          performanceGain: ((metrics.avgQueryTime - 200) / metrics.avgQueryTime) * 100
        },
        actions: [
          'Analyze and optimize slow queries',
          'Add missing database indexes',
          'Implement query result caching',
          'Consider database hardware upgrade'
        ]
      });
    } else if (metrics.avgQueryTime > this.thresholds.queryTime.warning) {
      recommendations.push({
        category: 'compute',
        priority: 'medium',
        title: 'Performance Monitoring and Optimization',
        description: 'Query performance is degrading. Proactive optimization recommended.',
        impact: 'Maintains good user experience as load increases',
        timeToImplement: '1 week',
        metrics: {
          currentAvgTime: metrics.avgQueryTime,
          warningThreshold: this.thresholds.queryTime.warning
        },
        actions: [
          'Set up query performance monitoring',
          'Identify and optimize top slow queries',
          'Review index usage statistics',
          'Implement query optimization guidelines'
        ]
      });
    }

    return recommendations;
  }

  private generateReplicaRecommendations(
    metrics: CapacityMetrics,
    projections: GrowthProjection[]
  ): ScalingRecommendation[] {
    const recommendations: ScalingRecommendation[] = [];
    const threeMonthProjection = projections.find(p => p.timeframe === '3months');

    if (threeMonthProjection && threeMonthProjection.projectedUsers > metrics.totalUsers * 2) {
      recommendations.push({
        category: 'replicas',
        priority: 'high',
        title: 'Implement Read Replicas',
        description: 'User growth projection indicates need for read scaling.',
        impact: 'Distributes read load and improves global performance',
        estimatedCost: '$300-800/month',
        timeToImplement: '2-4 weeks',
        metrics: {
          currentUsers: metrics.totalUsers,
          projectedUsers: threeMonthProjection.projectedUsers,
          recommendedReplicas: 2
        },
        actions: [
          'Set up read replicas in key regions',
          'Implement read/write query routing',
          'Configure replica health monitoring',
          'Test failover procedures'
        ]
      });
    }

    if (metrics.peakConcurrentUsers > 100) {
      recommendations.push({
        category: 'replicas',
        priority: 'medium',
        title: 'Geographic Load Distribution',
        description: 'High concurrent user count suggests need for geographic distribution.',
        impact: 'Reduces latency for global users',
        estimatedCost: '$200-500/month per region',
        timeToImplement: '3-4 weeks',
        metrics: {
          peakConcurrentUsers: metrics.peakConcurrentUsers,
          recommendedRegions: 2
        },
        actions: [
          'Analyze user geographic distribution',
          'Deploy replicas in high-usage regions',
          'Implement intelligent query routing',
          'Monitor regional performance metrics'
        ]
      });
    }

    return recommendations;
  }

  private generateIndexRecommendations(metrics: CapacityMetrics): ScalingRecommendation[] {
    const recommendations: ScalingRecommendation[] = [];

    if (metrics.avgQueryTime > 300 && metrics.totalAnalyses > 10000) {
      recommendations.push({
        category: 'indexing',
        priority: 'high',
        title: 'Advanced Index Optimization',
        description: 'Large dataset with slow queries indicates need for advanced indexing.',
        impact: 'Significantly improves query performance',
        timeToImplement: '1-2 weeks',
        metrics: {
          currentQueryTime: metrics.avgQueryTime,
          totalRecords: metrics.totalAnalyses,
          expectedImprovement: 60
        },
        actions: [
          'Analyze query patterns and add composite indexes',
          'Implement partial indexes for active data',
          'Add covering indexes for common queries',
          'Set up index usage monitoring'
        ]
      });
    }

    return recommendations;
  }

  async generateCapacityReport(): Promise<CapacityReport> {
    const currentMetrics = await this.collectCurrentMetrics();
    const projections = await this.calculateGrowthProjections(currentMetrics);
    const recommendations = this.generateRecommendations(currentMetrics, projections);
    
    // Generate alerts
    const alerts = this.generateAlerts(currentMetrics);
    
    // Calculate summary
    const summary = this.calculateSummary(currentMetrics, recommendations, alerts);

    return {
      currentMetrics,
      growthProjections: projections,
      recommendations,
      alerts,
      summary
    };
  }

  private generateAlerts(metrics: CapacityMetrics): CapacityReport['alerts'] {
    const alerts: CapacityReport['alerts'] = [];

    if (metrics.connectionPoolUtilization > this.thresholds.connections.critical * 100) {
      alerts.push({
        type: 'critical',
        message: 'Connection pool utilization is critically high',
        threshold: this.thresholds.connections.critical * 100,
        currentValue: metrics.connectionPoolUtilization
      });
    }

    if (metrics.avgQueryTime > this.thresholds.queryTime.critical) {
      alerts.push({
        type: 'critical',
        message: 'Average query time exceeds acceptable limits',
        threshold: this.thresholds.queryTime.critical,
        currentValue: metrics.avgQueryTime
      });
    }

    if (metrics.connectionPoolUtilization > this.thresholds.connections.warning * 100) {
      alerts.push({
        type: 'warning',
        message: 'Connection pool utilization is high',
        threshold: this.thresholds.connections.warning * 100,
        currentValue: metrics.connectionPoolUtilization
      });
    }

    if (metrics.avgQueryTime > this.thresholds.queryTime.warning) {
      alerts.push({
        type: 'warning',
        message: 'Query performance is degrading',
        threshold: this.thresholds.queryTime.warning,
        currentValue: metrics.avgQueryTime
      });
    }

    return alerts;
  }

  private calculateSummary(
    metrics: CapacityMetrics,
    recommendations: ScalingRecommendation[],
    alerts: CapacityReport['alerts']
  ): CapacityReport['summary'] {
    const criticalAlerts = alerts.filter(a => a.type === 'critical').length;
    const warningAlerts = alerts.filter(a => a.type === 'warning').length;
    
    let overallHealth: 'good' | 'warning' | 'critical' = 'good';
    if (criticalAlerts > 0) {
      overallHealth = 'critical';
    } else if (warningAlerts > 0) {
      overallHealth = 'warning';
    }

    // Estimate time to capacity based on growth trends
    let timeToCapacity = '12+ months';
    if (metrics.connectionPoolUtilization > 80) {
      timeToCapacity = '1-3 months';
    } else if (metrics.connectionPoolUtilization > 60) {
      timeToCapacity = '3-6 months';
    } else if (metrics.connectionPoolUtilization > 40) {
      timeToCapacity = '6-12 months';
    }

    // Estimate monthly costs for recommendations
    const estimatedMonthlyCost = recommendations
      .filter(r => r.estimatedCost)
      .reduce((sum, r) => {
        const cost = r.estimatedCost?.match(/\$(\d+)/)?.[1];
        return sum + (cost ? parseInt(cost) : 0);
      }, 0);

    return {
      overallHealth,
      timeToCapacity,
      recommendedActions: recommendations.filter(r => r.priority === 'high' || r.priority === 'critical').length,
      estimatedMonthlyCost
    };
  }

  async logMetrics(metrics: CapacityMetrics): Promise<void> {
    try {
      await supabase.from('capacity_metrics_log').insert({
        timestamp: metrics.timestamp,
        total_users: metrics.totalUsers,
        active_users: metrics.activeUsers,
        total_analyses: metrics.totalAnalyses,
        daily_analyses: metrics.dailyAnalyses,
        storage_used: metrics.storageUsed,
        avg_query_time: metrics.avgQueryTime,
        peak_concurrent_users: metrics.peakConcurrentUsers,
        connection_pool_utilization: metrics.connectionPoolUtilization
      });
    } catch (error) {
      console.error('Error logging capacity metrics:', error);
    }
  }
}

export const capacityPlanningService = new CapacityPlanningService();