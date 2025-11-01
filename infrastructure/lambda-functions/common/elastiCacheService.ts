import Redis from 'ioredis';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalOperations: number;
  connectionCount: number;
  latency: number;
  memoryUsage?: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[];
  compress?: boolean;
}

export class ElastiCacheService {
  private redis: Redis;
  private cloudWatch: CloudWatchClient;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalOperations: 0,
    connectionCount: 0,
    latency: 0,
  };

  constructor(
    redisEndpoint: string,
    port: number = 6379,
    options: {
      password?: string;
      tls?: boolean;
      region?: string;
      clusterName?: string;
    } = {}
  ) {
    // Initialize Redis connection
    this.redis = new Redis({
      host: redisEndpoint,
      port,
      password: options.password,
      tls: options.tls ? {} : undefined,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    // Initialize CloudWatch client
    this.cloudWatch = new CloudWatchClient({
      region: options.region || 'us-east-1',
    });

    // Set up event listeners for connection monitoring
    this.setupConnectionMonitoring();
  }

  private setupConnectionMonitoring(): void {
    this.redis.on('connect', () => {
      console.log('ElastiCache Redis connected');
      this.metrics.connectionCount++;
    });

    this.redis.on('error', (error) => {
      console.error('ElastiCache Redis error:', error);
      this.emitCustomMetric('ConnectionErrors', 1);
    });

    this.redis.on('close', () => {
      console.log('ElastiCache Redis connection closed');
      this.metrics.connectionCount = Math.max(0, this.metrics.connectionCount - 1);
    });

    this.redis.on('reconnecting', () => {
      console.log('ElastiCache Redis reconnecting');
      this.emitCustomMetric('Reconnections', 1);
    });
  }

  private async emitCustomMetric(metricName: string, value: number): Promise<void> {
    try {
      await this.cloudWatch.send(
        new PutMetricDataCommand({
          Namespace: 'HalluciFix/Cache',
          MetricData: [
            {
              MetricName: metricName,
              Value: value,
              Unit: 'Count',
              Timestamp: new Date(),
            },
          ],
        })
      );
    } catch (error) {
      console.error(`Failed to emit custom metric ${metricName}:`, error);
    }
  }

  private updateMetrics(isHit: boolean, latency: number): void {
    this.metrics.totalOperations++;
    
    if (isHit) {
      this.metrics.hits++;
    } else {
      this.metrics.misses++;
    }

    // Calculate hit rate
    this.metrics.hitRate = this.metrics.totalOperations > 0 
      ? (this.metrics.hits / this.metrics.totalOperations) * 100 
      : 0;

    // Update average latency (simple moving average)
    this.metrics.latency = this.metrics.latency === 0 
      ? latency 
      : (this.metrics.latency + latency) / 2;
  }

  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      const result = await this.redis.get(key);
      const latency = Date.now() - startTime;
      
      if (result !== null) {
        this.updateMetrics(true, latency);
        return JSON.parse(result);
      } else {
        this.updateMetrics(false, latency);
        return null;
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateMetrics(false, latency);
      this.emitCustomMetric('GetErrors', 1);
      throw error;
    }
  }

  async getMemoryUsage(): Promise<number | null> {
    try {
      const info = await this.redis.info('memory');
      const match = info.match(/used_memory:(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    } catch (error) {
      console.error('Failed to get memory usage:', error);
      return null;
    }
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency: number;
    memoryUsage?: number;
    connectionStatus: string;
  }> {
    const startTime = Date.now();
    
    try {
      await this.redis.ping();
      const latency = Date.now() - startTime;
      const memoryUsage = await this.getMemoryUsage();
      
      return {
        status: 'healthy',
        latency,
        memoryUsage: memoryUsage || undefined,
        connectionStatus: this.redis.status,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        latency,
        connectionStatus: this.redis.status,
      };
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

// Factory function to create ElastiCache service instance
export function createElastiCacheService(config: {
  endpoint: string;
  port?: number;
  password?: string;
  tls?: boolean;
  region?: string;
  clusterName?: string;
}): ElastiCacheService {
  return new ElastiCacheService(
    config.endpoint,
    config.port,
    {
      password: config.password,
      tls: config.tls,
      region: config.region,
      clusterName: config.clusterName,
    }
  );
}

// Export singleton instance (will be initialized with environment variables)
let elastiCacheService: ElastiCacheService | null = null;

export function getElastiCacheService(): ElastiCacheService {
  if (!elastiCacheService) {
    const endpoint = process.env.ELASTICACHE_ENDPOINT;
    const port = process.env.ELASTICACHE_PORT ? parseInt(process.env.ELASTICACHE_PORT, 10) : 6379;
    const region = process.env.AWS_REGION || 'us-east-1';
    
    if (!endpoint) {
      throw new Error('ELASTICACHE_ENDPOINT environment variable is required');
    }
    
    elastiCacheService = createElastiCacheService({
      endpoint,
      port,
      region,
      tls: process.env.NODE_ENV === 'production',
    });
  }
  
  return elastiCacheService;
}