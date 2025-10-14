import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

export interface ConnectionPoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis: number;
  idleTimeoutMillis: number;
  reapIntervalMillis: number;
  createTimeoutMillis: number;
  destroyTimeoutMillis: number;
}

export interface ConnectionPoolStats {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingClients: number;
  poolSize: number;
  maxPoolSize: number;
  minPoolSize: number;
}

export interface ConnectionPoolHealth {
  status: 'healthy' | 'warning' | 'critical';
  utilizationPercent: number;
  waitingClients: number;
  avgWaitTime: number;
  recommendations: string[];
}

class ConnectionPoolOptimizer {
  private config: ConnectionPoolConfig;
  private client: SupabaseClient;
  private statsHistory: ConnectionPoolStats[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private autoAdjustmentEnabled: boolean = true;

  constructor(initialConfig?: Partial<ConnectionPoolConfig>) {
    this.config = {
      min: 2,
      max: 20,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 300000,
      reapIntervalMillis: 1000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      ...initialConfig
    };

    this.initializeClient();
    this.startHealthMonitoring();
  }

  private initializeClient(): void {
    // Create optimized Supabase client with connection pool configuration
    this.client = createClient(
      config.database.supabaseUrl,
      config.database.supabaseAnonKey,
      {
        db: {
          schema: 'public'
        },
        auth: {
          persistSession: false
        },
        global: {
          headers: {
            'x-connection-pool': 'optimized'
          }
        }
      }
    );
  }

  async getPoolStats(): Promise<ConnectionPoolStats> {
    try {
      // Get connection pool statistics from database
      const { data, error } = await this.client.rpc('get_connection_pool_stats');
      
      if (error) {
        console.warn('Failed to get pool stats:', error);
        return this.getDefaultStats();
      }

      const stats = data?.[0] || {};
      
      const poolStats: ConnectionPoolStats = {
        totalConnections: stats.total_connections || 0,
        idleConnections: stats.idle_connections || 0,
        activeConnections: stats.active_connections || 0,
        waitingClients: stats.waiting_clients || 0,
        poolSize: stats.pool_size || this.config.max,
        maxPoolSize: this.config.max,
        minPoolSize: this.config.min
      };

      // Store in history for trend analysis
      this.statsHistory.push({
        ...poolStats,
        timestamp: Date.now()
      } as any);

      // Keep only last 100 entries
      if (this.statsHistory.length > 100) {
        this.statsHistory = this.statsHistory.slice(-100);
      }

      return poolStats;
    } catch (error) {
      console.error('Error getting pool stats:', error);
      return this.getDefaultStats();
    }
  }

  private getDefaultStats(): ConnectionPoolStats {
    return {
      totalConnections: 0,
      idleConnections: 0,
      activeConnections: 0,
      waitingClients: 0,
      poolSize: this.config.max,
      maxPoolSize: this.config.max,
      minPoolSize: this.config.min
    };
  }

  async checkPoolHealth(): Promise<ConnectionPoolHealth> {
    const stats = await this.getPoolStats();
    const utilizationPercent = (stats.activeConnections / stats.maxPoolSize) * 100;
    const avgWaitTime = this.calculateAverageWaitTime();
    
    let status: ConnectionPoolHealth['status'] = 'healthy';
    const recommendations: string[] = [];

    // Determine health status
    if (utilizationPercent > 90 || stats.waitingClients > 5) {
      status = 'critical';
      recommendations.push('Connection pool is at critical capacity');
      recommendations.push('Consider increasing max pool size');
    } else if (utilizationPercent > 75 || stats.waitingClients > 0) {
      status = 'warning';
      recommendations.push('Connection pool utilization is high');
      recommendations.push('Monitor for potential bottlenecks');
    }

    // Check for idle connections
    if (stats.idleConnections > stats.maxPoolSize * 0.5) {
      recommendations.push('High number of idle connections detected');
      recommendations.push('Consider reducing max pool size');
    }

    // Check wait times
    if (avgWaitTime > 1000) {
      recommendations.push(`Average wait time is high: ${avgWaitTime}ms`);
      recommendations.push('Consider optimizing query performance');
    }

    return {
      status,
      utilizationPercent,
      waitingClients: stats.waitingClients,
      avgWaitTime,
      recommendations
    };
  }

  private calculateAverageWaitTime(): number {
    if (this.statsHistory.length < 2) return 0;
    
    // Calculate based on waiting clients over time
    const recentStats = this.statsHistory.slice(-10);
    const totalWaitingTime = recentStats.reduce((sum, stat) => sum + (stat.waitingClients * 100), 0);
    return totalWaitingTime / recentStats.length;
  }

  async optimizePoolSize(): Promise<{
    oldConfig: ConnectionPoolConfig;
    newConfig: ConnectionPoolConfig;
    reason: string;
  }> {
    if (!this.autoAdjustmentEnabled) {
      throw new Error('Auto-adjustment is disabled');
    }

    const stats = await this.getPoolStats();
    const health = await this.checkPoolHealth();
    const oldConfig = { ...this.config };
    let reason = 'No changes needed';

    // Increase pool size if under pressure
    if (health.status === 'critical' && stats.waitingClients > 0) {
      const newMax = Math.min(this.config.max + 5, 50);
      if (newMax > this.config.max) {
        this.config.max = newMax;
        reason = `Increased max pool size due to ${stats.waitingClients} waiting clients`;
      }
    }
    
    // Decrease pool size if over-provisioned
    else if (health.utilizationPercent < 30 && stats.idleConnections > this.config.max * 0.7) {
      const newMax = Math.max(this.config.max - 2, this.config.min + 2);
      if (newMax < this.config.max) {
        this.config.max = newMax;
        reason = `Decreased max pool size due to low utilization (${health.utilizationPercent.toFixed(1)}%)`;
      }
    }

    // Adjust timeouts based on performance
    if (health.avgWaitTime > 5000) {
      this.config.acquireTimeoutMillis = Math.min(this.config.acquireTimeoutMillis + 10000, 60000);
      reason += '; Increased acquire timeout due to high wait times';
    }

    // Reinitialize client if config changed
    if (JSON.stringify(oldConfig) !== JSON.stringify(this.config)) {
      this.initializeClient();
    }

    return {
      oldConfig,
      newConfig: { ...this.config },
      reason
    };
  }

  private startHealthMonitoring(): void {
    // Check pool health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.checkPoolHealth();
        
        if (health.status === 'critical') {
          console.error('Connection pool health critical:', health);
          
          // Attempt auto-optimization if enabled
          if (this.autoAdjustmentEnabled) {
            const optimization = await this.optimizePoolSize();
            console.log('Auto-optimized pool:', optimization);
          }
        } else if (health.status === 'warning') {
          console.warn('Connection pool health warning:', health);
        }
      } catch (error) {
        console.error('Error during health monitoring:', error);
      }
    }, 30000);
  }

  enableAutoAdjustment(): void {
    this.autoAdjustmentEnabled = true;
  }

  disableAutoAdjustment(): void {
    this.autoAdjustmentEnabled = false;
  }

  updateConfig(newConfig: Partial<ConnectionPoolConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // Validate configuration
    if (this.config.min >= this.config.max) {
      throw new Error('Minimum pool size must be less than maximum');
    }
    
    if (this.config.max > 100) {
      throw new Error('Maximum pool size cannot exceed 100');
    }

    // Reinitialize client with new config
    this.initializeClient();
    
    console.log('Connection pool config updated:', {
      old: oldConfig,
      new: this.config
    });
  }

  getConfig(): ConnectionPoolConfig {
    return { ...this.config };
  }

  getStatsHistory(): ConnectionPoolStats[] {
    return [...this.statsHistory];
  }

  async runDiagnostics(): Promise<{
    config: ConnectionPoolConfig;
    currentStats: ConnectionPoolStats;
    health: ConnectionPoolHealth;
    recommendations: string[];
    trends: {
      utilizationTrend: 'increasing' | 'decreasing' | 'stable';
      avgUtilization: number;
      peakUtilization: number;
    };
  }> {
    const currentStats = await this.getPoolStats();
    const health = await this.checkPoolHealth();
    const trends = this.analyzeTrends();
    
    const recommendations = [
      ...health.recommendations,
      ...this.generateConfigRecommendations(currentStats, trends)
    ];

    return {
      config: this.getConfig(),
      currentStats,
      health,
      recommendations,
      trends
    };
  }

  private analyzeTrends(): {
    utilizationTrend: 'increasing' | 'decreasing' | 'stable';
    avgUtilization: number;
    peakUtilization: number;
  } {
    if (this.statsHistory.length < 10) {
      return {
        utilizationTrend: 'stable',
        avgUtilization: 0,
        peakUtilization: 0
      };
    }

    const recent = this.statsHistory.slice(-10);
    const utilizations = recent.map(stat => 
      (stat.activeConnections / stat.maxPoolSize) * 100
    );

    const avgUtilization = utilizations.reduce((sum, util) => sum + util, 0) / utilizations.length;
    const peakUtilization = Math.max(...utilizations);
    
    // Determine trend
    const firstHalf = utilizations.slice(0, 5);
    const secondHalf = utilizations.slice(5);
    const firstAvg = firstHalf.reduce((sum, util) => sum + util, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, util) => sum + util, 0) / secondHalf.length;
    
    let utilizationTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (secondAvg > firstAvg + 5) {
      utilizationTrend = 'increasing';
    } else if (secondAvg < firstAvg - 5) {
      utilizationTrend = 'decreasing';
    }

    return {
      utilizationTrend,
      avgUtilization,
      peakUtilization
    };
  }

  private generateConfigRecommendations(
    stats: ConnectionPoolStats, 
    trends: ReturnType<ConnectionPoolOptimizer['analyzeTrends']>
  ): string[] {
    const recommendations: string[] = [];

    if (trends.utilizationTrend === 'increasing' && trends.avgUtilization > 60) {
      recommendations.push('Consider increasing max pool size proactively');
    }

    if (trends.peakUtilization > 95) {
      recommendations.push('Peak utilization is very high - increase max pool size');
    }

    if (trends.avgUtilization < 20 && this.config.max > this.config.min + 5) {
      recommendations.push('Average utilization is low - consider reducing max pool size');
    }

    if (this.config.acquireTimeoutMillis < 15000 && trends.avgUtilization > 70) {
      recommendations.push('Consider increasing acquire timeout for high utilization periods');
    }

    return recommendations;
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

// Create singleton instance
export const connectionPoolOptimizer = new ConnectionPoolOptimizer();

// Export for testing and advanced usage
export { ConnectionPoolOptimizer };