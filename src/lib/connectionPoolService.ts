import { connectionPoolOptimizer, ConnectionPoolHealth, ConnectionPoolStats } from './connectionPoolOptimizer';
import { supabase } from './supabase';

import { logger } from './logging';
export interface ConnectionPoolMetrics {
  current: ConnectionPoolStats;
  health: ConnectionPoolHealth;
  trends: {
    utilizationTrend: 'increasing' | 'decreasing' | 'stable';
    avgUtilization: number;
    peakUtilization: number;
  };
  history: Array<{
    timestamp: string;
    utilization: number;
    activeConnections: number;
    totalConnections: number;
  }>;
}

class ConnectionPoolService {
  private monitoringEnabled: boolean = true;
  private alertThresholds = {
    critical: 90,
    warning: 75,
    highWaitTime: 5000
  };

  async getMetrics(): Promise<ConnectionPoolMetrics> {
    const diagnostics = await connectionPoolOptimizer.runDiagnostics();
    const history = await this.getHistoricalMetrics();

    return {
      current: diagnostics.currentStats,
      health: diagnostics.health,
      trends: diagnostics.trends,
      history
    };
  }

  private async getHistoricalMetrics(): Promise<ConnectionPoolMetrics['history']> {
    try {
      const { data, error } = await supabase
        .from('connection_pool_stats')
        .select('timestamp, utilization_percent, active_connections, total_connections')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) {
        logger.warn("Failed to fetch historical metrics:", { error });
        return [];
      }

      return (data || []).map(row => ({
        timestamp: row.timestamp,
        utilization: row.utilization_percent,
        activeConnections: row.active_connections,
        totalConnections: row.total_connections
      }));
    } catch (error) {
      logger.error("Error fetching historical metrics:", error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  async optimizePool(): Promise<{
    success: boolean;
    changes: any;
    message: string;
  }> {
    try {
      const optimization = await connectionPoolOptimizer.optimizePoolSize();
      
      // Log the optimization
      await this.logOptimization(optimization);
      
      return {
        success: true,
        changes: optimization,
        message: optimization.reason
      };
    } catch (error) {
      logger.error("Pool optimization failed:", error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        changes: null,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async logOptimization(optimization: any): Promise<void> {
    try {
      await supabase.from('maintenance_log').insert({
        operation: 'connection_pool_optimization',
        status: 'completed',
        details: {
          oldConfig: optimization.oldConfig,
          newConfig: optimization.newConfig,
          reason: optimization.reason
        }
      });
    } catch (error) {
      logger.warn("Failed to log optimization:", { error });
    }
  }

  async checkHealth(): Promise<ConnectionPoolHealth> {
    return await connectionPoolOptimizer.checkPoolHealth();
  }

  async enableAutoOptimization(): Promise<void> {
    connectionPoolOptimizer.enableAutoAdjustment();
    logger.debug("Connection pool auto-optimization enabled");
  }

  async disableAutoOptimization(): Promise<void> {
    connectionPoolOptimizer.disableAutoAdjustment();
    logger.debug("Connection pool auto-optimization disabled");
  }

  async updateConfiguration(config: Partial<any>): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      connectionPoolOptimizer.updateConfig(config);
      
      // Log configuration change
      await supabase.from('maintenance_log').insert({
        operation: 'connection_pool_config_update',
        status: 'completed',
        details: { newConfig: config }
      });

      return {
        success: true,
        message: 'Connection pool configuration updated successfully'
      };
    } catch (error) {
      logger.error("Failed to update configuration:", error instanceof Error ? error : new Error(String(error)));
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getRecommendations(): Promise<string[]> {
    const health = await this.checkHealth();
    const diagnostics = await connectionPoolOptimizer.runDiagnostics();
    
    return [
      ...health.recommendations,
      ...diagnostics.recommendations
    ];
  }

  async runHealthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    checks: {
      poolUtilization: boolean;
      waitingClients: boolean;
      responseTime: boolean;
      configuration: boolean;
    };
    metrics: ConnectionPoolStats;
    recommendations: string[];
  }> {
    const health = await this.checkHealth();
    const stats = await connectionPoolOptimizer.getPoolStats();
    
    const checks = {
      poolUtilization: health.utilizationPercent < this.alertThresholds.critical,
      waitingClients: health.waitingClients === 0,
      responseTime: health.avgWaitTime < this.alertThresholds.highWaitTime,
      configuration: this.validateConfiguration()
    };

    return {
      status: health.status,
      checks,
      metrics: stats,
      recommendations: health.recommendations
    };
  }

  private validateConfiguration(): boolean {
    const config = connectionPoolOptimizer.getConfig();
    
    // Basic validation rules
    return (
      config.min > 0 &&
      config.max > config.min &&
      config.max <= 100 &&
      config.acquireTimeoutMillis > 0 &&
      config.idleTimeoutMillis > 0
    );
  }

  async getTrends(hoursBack: number = 24): Promise<Array<{
    hour: string;
    avgUtilization: number;
    maxUtilization: number;
    avgActiveConnections: number;
    maxActiveConnections: number;
  }>> {
    try {
      const { data, error } = await supabase.rpc('get_connection_pool_trends', {
        hours_back: hoursBack
      });

      if (error) {
        logger.warn("Failed to fetch trends:", { error });
        return [];
      }

      return (data || []).map((row: any) => ({
        hour: row.hour_bucket,
        avgUtilization: parseFloat(row.avg_utilization),
        maxUtilization: parseFloat(row.max_utilization),
        avgActiveConnections: parseFloat(row.avg_active_connections),
        maxActiveConnections: row.max_active_connections
      }));
    } catch (error) {
      logger.error("Error fetching trends:", error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  async generateReport(): Promise<{
    summary: {
      status: string;
      currentUtilization: number;
      peakUtilization: number;
      avgResponseTime: number;
    };
    configuration: any;
    recommendations: string[];
    trends: any[];
    lastOptimization?: string;
  }> {
    const diagnostics = await connectionPoolOptimizer.runDiagnostics();
    const trends = await this.getTrends(24);
    
    // Get last optimization from maintenance log
    const { data: lastOptimization } = await supabase
      .from('maintenance_log')
      .select('completed_at, details')
      .eq('operation', 'connection_pool_optimization')
      .order('completed_at', { ascending: false })
      .limit(1);

    return {
      summary: {
        status: diagnostics.health.status,
        currentUtilization: diagnostics.health.utilizationPercent,
        peakUtilization: diagnostics.trends.peakUtilization,
        avgResponseTime: diagnostics.health.avgWaitTime
      },
      configuration: diagnostics.config,
      recommendations: diagnostics.recommendations,
      trends,
      lastOptimization: lastOptimization?.[0]?.completed_at
    };
  }

  setMonitoringEnabled(enabled: boolean): void {
    this.monitoringEnabled = enabled;
  }

  isMonitoringEnabled(): boolean {
    return this.monitoringEnabled;
  }

  updateAlertThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
  }

  getAlertThresholds(): typeof this.alertThresholds {
    return { ...this.alertThresholds };
  }
}

export const connectionPoolService = new ConnectionPoolService();