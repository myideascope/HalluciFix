import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

import { logger } from './logging';
export interface ReadReplicaConfig {
  url: string;
  key: string;
  region: string;
  priority: number;
  maxConnections: number;
  healthCheckInterval: number;
  enabled: boolean;
}

export interface ReplicaHealth {
  replicaId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  lastCheck: Date;
  errorCount: number;
  successRate: number;
}

export interface QueryRoutingStats {
  totalQueries: number;
  readQueries: number;
  writeQueries: number;
  replicaDistribution: Record<string, number>;
  averageLatency: number;
  failoverCount: number;
}

class ReadReplicaService {
  private primaryClient: SupabaseClient;
  private replicaClients: Map<string, SupabaseClient> = new Map();
  private replicaConfigs: Map<string, ReadReplicaConfig> = new Map();
  private replicaHealth: Map<string, ReplicaHealth> = new Map();
  private routingStats: QueryRoutingStats = {
    totalQueries: 0,
    readQueries: 0,
    writeQueries: 0,
    replicaDistribution: {},
    averageLatency: 0,
    failoverCount: 0
  };
  private healthCheckInterval?: NodeJS.Timeout;
  private loadBalancingStrategy: 'round-robin' | 'least-connections' | 'latency-based' = 'latency-based';
  private currentReplicaIndex = 0;

  constructor() {
    this.primaryClient = createClient(
      config.database.supabaseUrl,
      config.database.supabaseAnonKey
    );
    
    this.initializeReplicas();
    this.startHealthMonitoring();
  }

  private initializeReplicas(): void {
    // Initialize read replicas from configuration
    const replicaConfigs = this.getReplicaConfigurations();
    
    replicaConfigs.forEach(replicaConfig => {
      if (replicaConfig.enabled) {
        this.addReadReplica(replicaConfig);
      }
    });
  }

  private getReplicaConfigurations(): ReadReplicaConfig[] {
    // In a real implementation, these would come from environment variables or configuration
    return [
      {
        url: config.database.readReplica1Url || config.database.supabaseUrl,
        key: config.database.readReplica1Key || config.database.supabaseAnonKey,
        region: 'us-east-1',
        priority: 1,
        maxConnections: 50,
        healthCheckInterval: 30000,
        enabled: !!config.database.readReplica1Url
      },
      {
        url: config.database.readReplica2Url || config.database.supabaseUrl,
        key: config.database.readReplica2Key || config.database.supabaseAnonKey,
        region: 'us-west-2',
        priority: 2,
        maxConnections: 50,
        healthCheckInterval: 30000,
        enabled: !!config.database.readReplica2Url
      }
    ];
  }

  addReadReplica(config: ReadReplicaConfig): string {
    const replicaId = `replica-${config.region}-${Date.now()}`;
    
    const client = createClient(config.url, config.key, {
      db: { schema: 'public' },
      auth: { persistSession: false },
      global: {
        headers: {
          'x-replica-id': replicaId,
          'x-read-only': 'true'
        }
      }
    });

    this.replicaClients.set(replicaId, client);
    this.replicaConfigs.set(replicaId, config);
    this.replicaHealth.set(replicaId, {
      replicaId,
      status: 'healthy',
      latency: 0,
      lastCheck: new Date(),
      errorCount: 0,
      successRate: 100
    });

    console.log(`Added read replica: ${replicaId} (${config.region})`);
    return replicaId;
  }

  removeReadReplica(replicaId: string): boolean {
    if (this.replicaClients.has(replicaId)) {
      this.replicaClients.delete(replicaId);
      this.replicaConfigs.delete(replicaId);
      this.replicaHealth.delete(replicaId);
      console.log(`Removed read replica: ${replicaId}`);
      return true;
    }
    return false;
  }

  async executeReadQuery<T>(
    queryFn: (client: SupabaseClient) => Promise<T>,
    options?: {
      preferredRegion?: string;
      maxRetries?: number;
      fallbackToPrimary?: boolean;
    }
  ): Promise<T> {
    const startTime = Date.now();
    this.routingStats.totalQueries++;
    this.routingStats.readQueries++;

    const maxRetries = options?.maxRetries || 2;
    const fallbackToPrimary = options?.fallbackToPrimary !== false;

    // Select best replica for the query
    const selectedReplica = this.selectReplica(options?.preferredRegion);

    if (selectedReplica) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const result = await queryFn(selectedReplica.client);
          
          // Update success metrics
          this.updateReplicaMetrics(selectedReplica.id, Date.now() - startTime, true);
          this.updateRoutingStats(selectedReplica.id, Date.now() - startTime);
          
          return result;
        } catch (error) {
          console.warn(`Read query failed on replica ${selectedReplica.id}, attempt ${attempt + 1}:`, error);
          
          // Update failure metrics
          this.updateReplicaMetrics(selectedReplica.id, Date.now() - startTime, false);
          
          // Try next replica or fallback to primary
          if (attempt === maxRetries - 1) {
            if (fallbackToPrimary) {
              logger.debug("Falling back to primary database");
              this.routingStats.failoverCount++;
              return await queryFn(this.primaryClient);
            } else {
              throw error;
            }
          }
        }
      }
    }

    // No healthy replicas available, use primary if allowed
    if (fallbackToPrimary) {
      logger.debug("No healthy replicas available, using primary database");
      this.routingStats.failoverCount++;
      return await queryFn(this.primaryClient);
    }

    throw new Error('No healthy read replicas available and primary fallback disabled');
  }

  async executeWriteQuery<T>(
    queryFn: (client: SupabaseClient) => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    this.routingStats.totalQueries++;
    this.routingStats.writeQueries++;

    try {
      const result = await queryFn(this.primaryClient);
      this.updateRoutingStats('primary', Date.now() - startTime);
      return result;
    } catch (error) {
      logger.error("Write query failed on primary database:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private selectReplica(preferredRegion?: string): { id: string; client: SupabaseClient } | null {
    const healthyReplicas = Array.from(this.replicaHealth.entries())
      .filter(([_, health]) => health.status === 'healthy')
      .map(([id, health]) => ({ id, health, client: this.replicaClients.get(id)! }))
      .filter(replica => replica.client);

    if (healthyReplicas.length === 0) {
      return null;
    }

    // Prefer specific region if requested
    if (preferredRegion) {
      const regionReplica = healthyReplicas.find(replica => {
        const config = this.replicaConfigs.get(replica.id);
        return config?.region === preferredRegion;
      });
      if (regionReplica) {
        return { id: regionReplica.id, client: regionReplica.client };
      }
    }

    // Apply load balancing strategy
    switch (this.loadBalancingStrategy) {
      case 'round-robin':
        return this.selectRoundRobin(healthyReplicas);
      
      case 'least-connections':
        return this.selectLeastConnections(healthyReplicas);
      
      case 'latency-based':
      default:
        return this.selectLowestLatency(healthyReplicas);
    }
  }

  private selectRoundRobin(replicas: Array<{ id: string; client: SupabaseClient }>): { id: string; client: SupabaseClient } {
    const selected = replicas[this.currentReplicaIndex % replicas.length];
    this.currentReplicaIndex++;
    return selected;
  }

  private selectLeastConnections(replicas: Array<{ id: string; client: SupabaseClient }>): { id: string; client: SupabaseClient } {
    // For simplicity, use round-robin as connection count tracking would require more complex implementation
    return this.selectRoundRobin(replicas);
  }

  private selectLowestLatency(replicas: Array<{ id: string; health: ReplicaHealth; client: SupabaseClient }>): { id: string; client: SupabaseClient } {
    const sorted = replicas.sort((a, b) => a.health.latency - b.health.latency);
    return { id: sorted[0].id, client: sorted[0].client };
  }

  private updateReplicaMetrics(replicaId: string, latency: number, success: boolean): void {
    const health = this.replicaHealth.get(replicaId);
    if (!health) return;

    health.latency = (health.latency + latency) / 2; // Moving average
    health.lastCheck = new Date();

    if (success) {
      health.errorCount = Math.max(0, health.errorCount - 1);
    } else {
      health.errorCount++;
    }

    // Calculate success rate (last 100 operations)
    const totalOps = 100;
    const successOps = totalOps - Math.min(health.errorCount, totalOps);
    health.successRate = (successOps / totalOps) * 100;

    // Update health status
    if (health.successRate < 50) {
      health.status = 'unhealthy';
    } else if (health.successRate < 80) {
      health.status = 'degraded';
    } else {
      health.status = 'healthy';
    }

    this.replicaHealth.set(replicaId, health);
  }

  private updateRoutingStats(target: string, latency: number): void {
    this.routingStats.replicaDistribution[target] = 
      (this.routingStats.replicaDistribution[target] || 0) + 1;
    
    this.routingStats.averageLatency = 
      (this.routingStats.averageLatency + latency) / 2;
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000); // Check every 30 seconds
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.replicaClients.entries()).map(
      async ([replicaId, client]) => {
        try {
          const startTime = Date.now();
          
          // Simple health check query
          await client.from('users').select('count').limit(1);
          
          const latency = Date.now() - startTime;
          this.updateReplicaMetrics(replicaId, latency, true);
        } catch (error) {
          console.warn(`Health check failed for replica ${replicaId}:`, error);
          this.updateReplicaMetrics(replicaId, 0, false);
        }
      }
    );

    await Promise.allSettled(healthCheckPromises);
  }

  getReplicaHealth(): ReplicaHealth[] {
    return Array.from(this.replicaHealth.values());
  }

  getRoutingStats(): QueryRoutingStats {
    return { ...this.routingStats };
  }

  getReplicaConfigs(): ReadReplicaConfig[] {
    return Array.from(this.replicaConfigs.values());
  }

  setLoadBalancingStrategy(strategy: typeof this.loadBalancingStrategy): void {
    this.loadBalancingStrategy = strategy;
    console.log(`Load balancing strategy set to: ${strategy}`);
  }

  async testReplicaConnectivity(): Promise<Record<string, {
    connected: boolean;
    latency: number;
    error?: string;
  }>> {
    const results: Record<string, any> = {};

    // Test primary
    try {
      const startTime = Date.now();
      await this.primaryClient.from('users').select('count').limit(1);
      results.primary = {
        connected: true,
        latency: Date.now() - startTime
      };
    } catch (error) {
      results.primary = {
        connected: false,
        latency: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Test replicas
    const replicaTests = Array.from(this.replicaClients.entries()).map(
      async ([replicaId, client]) => {
        try {
          const startTime = Date.now();
          await client.from('users').select('count').limit(1);
          results[replicaId] = {
            connected: true,
            latency: Date.now() - startTime
          };
        } catch (error) {
          results[replicaId] = {
            connected: false,
            latency: 0,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }
    );

    await Promise.allSettled(replicaTests);
    return results;
  }

  async generateReport(): Promise<{
    summary: {
      totalReplicas: number;
      healthyReplicas: number;
      totalQueries: number;
      readWriteRatio: number;
      averageLatency: number;
      failoverRate: number;
    };
    replicas: ReplicaHealth[];
    routing: QueryRoutingStats;
    recommendations: string[];
  }> {
    const replicas = this.getReplicaHealth();
    const healthyCount = replicas.filter(r => r.status === 'healthy').length;
    const routing = this.getRoutingStats();
    
    const recommendations: string[] = [];
    
    // Generate recommendations
    if (healthyCount === 0) {
      recommendations.push('No healthy read replicas available - check replica connectivity');
    } else if (healthyCount < replicas.length) {
      recommendations.push(`${replicas.length - healthyCount} replicas are unhealthy - investigate connection issues`);
    }
    
    if (routing.failoverCount > routing.totalQueries * 0.1) {
      recommendations.push('High failover rate detected - check replica stability');
    }
    
    if (routing.averageLatency > 1000) {
      recommendations.push('High average latency - consider adding replicas closer to users');
    }
    
    const readWriteRatio = routing.writeQueries > 0 ? routing.readQueries / routing.writeQueries : 0;
    if (readWriteRatio < 3) {
      recommendations.push('Low read/write ratio - ensure read queries are properly routed to replicas');
    }

    return {
      summary: {
        totalReplicas: replicas.length,
        healthyReplicas: healthyCount,
        totalQueries: routing.totalQueries,
        readWriteRatio,
        averageLatency: routing.averageLatency,
        failoverRate: routing.totalQueries > 0 ? routing.failoverCount / routing.totalQueries : 0
      },
      replicas,
      routing,
      recommendations
    };
  }

  resetStats(): void {
    this.routingStats = {
      totalQueries: 0,
      readQueries: 0,
      writeQueries: 0,
      replicaDistribution: {},
      averageLatency: 0,
      failoverCount: 0
    };
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

// Create singleton instance
export const readReplicaService = new ReadReplicaService();

// Convenience functions for common operations
export const executeReadQuery = <T>(
  queryFn: (client: SupabaseClient) => Promise<T>,
  options?: Parameters<ReadReplicaService['executeReadQuery']>[1]
): Promise<T> => {
  return readReplicaService.executeReadQuery(queryFn, options);
};

export const executeWriteQuery = <T>(
  queryFn: (client: SupabaseClient) => Promise<T>
): Promise<T> => {
  return readReplicaService.executeWriteQuery(queryFn);
};