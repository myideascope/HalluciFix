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
  private metricsInterval: NodeJS.Timeout | null = null;

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
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    // Initialize CloudWatch client
    this.cloudWatch = new CloudWatchClient({
      region: options.region || 'us-east-1',
    });

    // Set up event listeners for connection monitoring
    this.setupConnectionMonitoring();

    // Start metrics collection
    this.startMetricsCollection();
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

  private startMetricsCollection(): void {
    // Emit metrics to CloudWatch every 60 seconds
    this.metricsInterval = setInterval(() => {
      this.emitMetricsToCloudWatch();
    }, 60000);
  }

  private async emitMetricsToCloudWatch(): Promise<void> {
    try {
      const metricData = [
        {
          MetricName: 'CacheHits',
          Value: this.metrics.hits,
          Unit: 'Count',
          Timestamp: new Date(),
        },
        {
          MetricName: 'CacheMisses',
          Value: this.metrics.misses,
          Unit: 'Count',
          Timestamp: new Date(),
        },
        {
          MetricName: 'CacheHitRate',
          Value: this.metrics.hitRate,
          Unit: 'Percent',
          Timestamp: new Date(),
        },
        {
          MetricName: 'TotalOperations',
          Value: this.metrics.totalOperations,
          Unit: 'Count',
          Timestamp: new Date(),
        },
        {
          MetricName: 'ConnectionCount',
          Value: this.metrics.connectionCount,
          Unit: 'Count',
          Timestamp: new Date(),
        },
        {
          MetricName: 'AverageLatency',
          Value: this.metrics.latency,
          Unit: 'Milliseconds',
          Timestamp: new Date(),
        },
      ];

      await this.cloudWatch.send(
        new PutMetricDataCommand({
          Namespace: 'HalluciFix/Cache',
          MetricData: metricData,
        })
      );

      // Reset counters after sending metrics
      this.metrics.hits = 0;
      this.metrics.misses = 0;
      this.metrics.totalOperations = 0;
    } catch (error) {
      console.error('Failed to emit cache metrics to CloudWatch:', error);
    }
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

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const startTime = Date.now();
    
    try {
      const serializedValue = JSON.stringify(value);
      
      if (options.ttl) {
        await this.redis.setex(key, options.ttl, serializedValue);
      } else {
        await this.redis.set(key, serializedValue);
      }

      const latency = Date.now() - startTime;
      this.emitCustomMetric('SetOperations', 1);
      this.emitCustomMetric('SetLatency', latency);
    } catch (error) {
      const latency = Date.now() - startTime;
      this.emitCustomMetric('SetErrors', 1);
      this.emitCustomMetric('SetLatency', latency);
      throw error;
    }
  }

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch data and cache it
    const data = await fetchFn();
    await this.set(key, data, options);
    return data;
  }

  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const result = await this.redis.del(key);
      const latency = Date.now() - startTime;
      
      this.emitCustomMetric('DeleteOperations', 1);
      this.emitCustomMetric('DeleteLatency', latency);
      
      return result > 0;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.emitCustomMetric('DeleteErrors', 1);
      throw error;
    }
  }

  async deleteByPattern(pattern: string): Promise<number> {
    const startTime = Date.now();
    
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.del(...keys);
      const latency = Date.now() - startTime;
      
      this.emitCustomMetric('BulkDeleteOperations', 1);
      this.emitCustomMetric('BulkDeleteLatency', latency);
      
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.emitCustomMetric('BulkDeleteErrors', 1);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const result = await this.redis.exists(key);
      const latency = Date.now() - startTime;
      
      this.emitCustomMetric('ExistsOperations', 1);
      this.emitCustomMetric('ExistsLatency', latency);
      
      return result === 1;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.emitCustomMetric('ExistsErrors', 1);
      throw error;
    }
  }

  async increment(key: string, by: number = 1): Promise<number> {
    const startTime = Date.now();
    
    try {
      const result = await this.redis.incrby(key, by);
      const latency = Date.now() - startTime;
      
      this.emitCustomMetric('IncrementOperations', 1);
      this.emitCustomMetric('IncrementLatency', latency);
      
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.emitCustomMetric('IncrementErrors', 1);
      throw error;
    }
  }

  async setExpire(key: string, ttl: number): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const result = await this.redis.expire(key, ttl);
      const latency = Date.now() - startTime;
      
      this.emitCustomMetric('ExpireOperations', 1);
      this.emitCustomMetric('ExpireLatency', latency);
      
      return result === 1;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.emitCustomMetric('ExpireErrors', 1);
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

  async getConnectionInfo(): Promise<{ connected: boolean; status: string }> {
    return {
      connected: this.redis.status === 'ready',
      status: this.redis.status,
    };
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
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    await this.redis.quit();
  }

  // Cache key helpers
  createUserCacheKey(userId: string, operation: string, params?: Record<string, any>): string {
    const paramString = params ? JSON.stringify(params) : '';
    const hash = Buffer.from(paramString).toString('base64').substring(0, 16);
    return `user:${userId}:${operation}:${hash}`;
  }

  createGlobalCacheKey(operation: string, params?: Record<string, any>): string {
    const paramString = params ? JSON.stringify(params) : '';
    const hash = Buffer.from(paramString).toString('base64').substring(0, 16);
    return `global:${operation}:${hash}`;
  }

  createSessionCacheKey(sessionId: string, operation: string): string {
    return `session:${sessionId}:${operation}`;
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