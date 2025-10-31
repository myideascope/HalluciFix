// Redis client service for AWS ElastiCache integration
import { createClient, RedisClientType } from 'redis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  tls?: boolean;
  connectTimeout?: number;
  commandTimeout?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  db?: number;
}

export interface RedisConnectionPool {
  client: RedisClientType;
  isConnected: boolean;
  connectionCount: number;
  lastError?: Error;
}

class RedisClientService {
  private client: RedisClientType | null = null;
  private config: RedisConfig;
  private connectionPool: RedisConnectionPool;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  constructor(config: RedisConfig) {
    this.config = {
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      db: 0,
      ...config
    };

    this.connectionPool = {
      client: null as any,
      isConnected: false,
      connectionCount: 0,
      lastError: undefined
    };

    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      const redisUrl = this.buildRedisUrl();
      
      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: this.config.connectTimeout,
          commandTimeout: this.config.commandTimeout,
          reconnectStrategy: (retries) => {
            if (retries >= this.maxReconnectAttempts) {
              console.error('Redis: Max reconnection attempts reached');
              return false;
            }
            const delay = Math.min(this.reconnectDelay * Math.pow(2, retries), 30000);
            console.log(`Redis: Reconnecting in ${delay}ms (attempt ${retries + 1})`);
            return delay;
          }
        }
      });

      this.setupEventHandlers();
      this.connectionPool.client = this.client;
    } catch (error) {
      console.error('Redis: Failed to initialize client:', error);
      this.connectionPool.lastError = error as Error;
    }
  }

  private buildRedisUrl(): string {
    const protocol = this.config.tls ? 'rediss' : 'redis';
    const auth = this.config.password ? `:${this.config.password}@` : '';
    return `${protocol}://${auth}${this.config.host}:${this.config.port}/${this.config.db}`;
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      console.log('Redis: Connected to ElastiCache');
      this.connectionPool.isConnected = true;
      this.connectionPool.connectionCount++;
      this.reconnectAttempts = 0;
    });

    this.client.on('ready', () => {
      console.log('Redis: Ready to accept commands');
    });

    this.client.on('error', (error) => {
      console.error('Redis: Connection error:', error);
      this.connectionPool.isConnected = false;
      this.connectionPool.lastError = error;
    });

    this.client.on('end', () => {
      console.log('Redis: Connection ended');
      this.connectionPool.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('Redis: Reconnecting to ElastiCache');
      this.reconnectAttempts++;
    });
  }

  async connect(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    if (this.connectionPool.isConnected) {
      return;
    }

    try {
      await this.client.connect();
    } catch (error) {
      console.error('Redis: Failed to connect:', error);
      this.connectionPool.lastError = error as Error;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connectionPool.isConnected) {
      try {
        await this.client.disconnect();
        this.connectionPool.isConnected = false;
      } catch (error) {
        console.error('Redis: Failed to disconnect:', error);
        throw error;
      }
    }
  }

  async ping(): Promise<string> {
    if (!this.client || !this.connectionPool.isConnected) {
      throw new Error('Redis client not connected');
    }

    try {
      return await this.client.ping();
    } catch (error) {
      console.error('Redis: Ping failed:', error);
      throw error;
    }
  }

  // Basic Redis operations
  async get(key: string): Promise<string | null> {
    if (!this.client || !this.connectionPool.isConnected) {
      throw new Error('Redis client not connected');
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      console.error(`Redis: Failed to get key ${key}:`, error);
      throw error;
    }
  }

  async set(key: string, value: string, options?: { EX?: number; PX?: number }): Promise<string | null> {
    if (!this.client || !this.connectionPool.isConnected) {
      throw new Error('Redis client not connected');
    }

    try {
      if (options?.EX) {
        return await this.client.setEx(key, options.EX, value);
      } else if (options?.PX) {
        return await this.client.pSetEx(key, options.PX, value);
      } else {
        return await this.client.set(key, value);
      }
    } catch (error) {
      console.error(`Redis: Failed to set key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string | string[]): Promise<number> {
    if (!this.client || !this.connectionPool.isConnected) {
      throw new Error('Redis client not connected');
    }

    try {
      return await this.client.del(key);
    } catch (error) {
      console.error(`Redis: Failed to delete key(s):`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<number> {
    if (!this.client || !this.connectionPool.isConnected) {
      throw new Error('Redis client not connected');
    }

    try {
      return await this.client.exists(key);
    } catch (error) {
      console.error(`Redis: Failed to check existence of key ${key}:`, error);
      throw error;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client || !this.connectionPool.isConnected) {
      throw new Error('Redis client not connected');
    }

    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      console.error(`Redis: Failed to set expiration for key ${key}:`, error);
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    if (!this.client || !this.connectionPool.isConnected) {
      throw new Error('Redis client not connected');
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error(`Redis: Failed to get TTL for key ${key}:`, error);
      throw error;
    }
  }

  // Hash operations
  async hGet(key: string, field: string): Promise<string | undefined> {
    if (!this.client || !this.connectionPool.isConnected) {
      throw new Error('Redis client not connected');
    }

    try {
      return await this.client.hGet(key, field);
    } catch (error) {
      console.error(`Redis: Failed to get hash field ${field} from key ${key}:`, error);
