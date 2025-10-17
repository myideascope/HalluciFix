/**
 * Connection Pool Manager
 * Manages HTTP connection pooling for improved performance
 */

import { logger } from '../logging';

export interface ConnectionPoolOptions {
  maxConnections?: number;
  maxConnectionsPerHost?: number;
  connectionTimeout?: number;
  idleTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  enableKeepAlive?: boolean;
  enableMetrics?: boolean;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  failedConnections: number;
  connectionReuse: number;
  averageConnectionTime: number;
  poolUtilization: number;
}

interface PooledConnection {
  id: string;
  host: string;
  port: number;
  protocol: string;
  created: number;
  lastUsed: number;
  useCount: number;
  isActive: boolean;
  socket?: any;
}

export class ConnectionPoolManager {
  private connections = new Map<string, PooledConnection[]>();
  private activeConnections = new Set<string>();
  private stats = {
    totalConnections: 0,
    activeConnections: 0,
    failedConnections: 0,
    connectionReuse: 0,
    totalConnectionTime: 0,
    completedConnections: 0
  };

  private readonly maxConnections: number;
  private readonly maxConnectionsPerHost: number;
  private readonly connectionTimeout: number;
  private readonly idleTimeout: number;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;
  private readonly enableKeepAlive: boolean;
  private readonly enableMetrics: boolean;
  
  private cleanupTimer?: NodeJS.Timeout;
  private logger = logger.child({ component: 'ConnectionPoolManager' });

  constructor(options: ConnectionPoolOptions = {}) {
    this.maxConnections = options.maxConnections || 100;
    this.maxConnectionsPerHost = options.maxConnectionsPerHost || 10;
    this.connectionTimeout = options.connectionTimeout || 30000; // 30 seconds
    this.idleTimeout = options.idleTimeout || 60000; // 1 minute
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.enableKeepAlive = options.enableKeepAlive !== false;
    this.enableMetrics = options.enableMetrics !== false;

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.idleTimeout / 2);

    this.logger.info('Connection pool manager initialized', {
      maxConnections: this.maxConnections,
      maxConnectionsPerHost: this.maxConnectionsPerHost,
      connectionTimeout: this.connectionTimeout,
      idleTimeout: this.idleTimeout,
      enableKeepAlive: this.enableKeepAlive
    });
  }

  /**
   * Get or create a connection for the given URL
   */
  async getConnection(url: string): Promise<PooledConnection> {
    const { host, port, protocol } = this.parseUrl(url);
    const hostKey = `${protocol}://${host}:${port}`;
    
    // Try to reuse an existing idle connection
    const existingConnection = this.findIdleConnection(hostKey);
    if (existingConnection) {
      existingConnection.isActive = true;
      existingConnection.lastUsed = Date.now();
      existingConnection.useCount++;
      this.activeConnections.add(existingConnection.id);
      this.stats.connectionReuse++;
      
      this.logger.debug('Reusing existing connection', {
        connectionId: existingConnection.id,
        host,
        useCount: existingConnection.useCount
      });
      
      return existingConnection;
    }

    // Check connection limits
    if (this.getTotalConnectionCount() >= this.maxConnections) {
      throw new Error(`Connection pool limit reached: ${this.maxConnections}`);
    }

    const hostConnections = this.connections.get(hostKey) || [];
    if (hostConnections.length >= this.maxConnectionsPerHost) {
      throw new Error(`Host connection limit reached: ${this.maxConnectionsPerHost} for ${host}`);
    }

    // Create new connection
    return this.createConnection(hostKey, host, port, protocol);
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(connectionId: string): void {
    const connection = this.findConnectionById(connectionId);
    if (!connection) {
      this.logger.warn('Attempted to release unknown connection', { connectionId });
      return;
    }

    connection.isActive = false;
    connection.lastUsed = Date.now();
    this.activeConnections.delete(connectionId);
    this.stats.activeConnections = this.activeConnections.size;

    this.logger.debug('Connection released', {
      connectionId,
      host: connection.host,
      useCount: connection.useCount
    });
  }

  /**
   * Close a specific connection
   */
  closeConnection(connectionId: string): boolean {
    const connection = this.findConnectionById(connectionId);
    if (!connection) return false;

    // Remove from active connections
    this.activeConnections.delete(connectionId);

    // Remove from pool
    const hostKey = `${connection.protocol}://${connection.host}:${connection.port}`;
    const hostConnections = this.connections.get(hostKey) || [];
    const index = hostConnections.findIndex(c => c.id === connectionId);
    
    if (index !== -1) {
      hostConnections.splice(index, 1);
      if (hostConnections.length === 0) {
        this.connections.delete(hostKey);
      }
    }

    // Close socket if available
    if (connection.socket && typeof connection.socket.destroy === 'function') {
      connection.socket.destroy();
    }

    this.logger.debug('Connection closed', {
      connectionId,
      host: connection.host
    });

    return true;
  }

  /**
   * Close all connections for a specific host
   */
  closeHostConnections(host: string): number {
    let closed = 0;
    const hostKeys = Array.from(this.connections.keys()).filter(key => key.includes(host));
    
    for (const hostKey of hostKeys) {
      const connections = this.connections.get(hostKey) || [];
      for (const connection of connections) {
        if (this.closeConnection(connection.id)) {
          closed++;
        }
      }
    }

    this.logger.info('Host connections closed', { host, closed });
    return closed;
  }

  /**
   * Close all connections
   */
  closeAllConnections(): number {
    let closed = 0;
    
    for (const [hostKey, connections] of this.connections.entries()) {
      for (const connection of connections) {
        if (this.closeConnection(connection.id)) {
          closed++;
        }
      }
    }

    this.connections.clear();
    this.activeConnections.clear();
    this.stats.activeConnections = 0;

    this.logger.info('All connections closed', { closed });
    return closed;
  }

  /**
   * Get connection pool statistics
   */
  getStats(): ConnectionStats {
    const totalConnections = this.getTotalConnectionCount();
    const activeConnections = this.activeConnections.size;
    const idleConnections = totalConnections - activeConnections;
    
    const averageConnectionTime = this.stats.completedConnections > 0
      ? this.stats.totalConnectionTime / this.stats.completedConnections
      : 0;

    const poolUtilization = this.maxConnections > 0
      ? (totalConnections / this.maxConnections) * 100
      : 0;

    return {
      totalConnections,
      activeConnections,
      idleConnections,
      failedConnections: this.stats.failedConnections,
      connectionReuse: this.stats.connectionReuse,
      averageConnectionTime: parseFloat(averageConnectionTime.toFixed(2)),
      poolUtilization: parseFloat(poolUtilization.toFixed(2))
    };
  }

  /**
   * Get connections by host
   */
  getConnectionsByHost(host: string): PooledConnection[] {
    const connections: PooledConnection[] = [];
    
    for (const [hostKey, hostConnections] of this.connections.entries()) {
      if (hostKey.includes(host)) {
        connections.push(...hostConnections);
      }
    }
    
    return connections;
  }

  /**
   * Optimize connection pool by closing idle connections
   */
  optimize(): { closed: number; kept: number } {
    const now = Date.now();
    let closed = 0;
    let kept = 0;

    for (const [hostKey, connections] of this.connections.entries()) {
      const activeConnections = connections.filter(conn => {
        if (conn.isActive) {
          kept++;
          return true;
        }

        const idleTime = now - conn.lastUsed;
        if (idleTime > this.idleTimeout) {
          this.closeConnection(conn.id);
          closed++;
          return false;
        }

        kept++;
        return true;
      });

      if (activeConnections.length === 0) {
        this.connections.delete(hostKey);
      } else {
        this.connections.set(hostKey, activeConnections);
      }
    }

    this.logger.info('Connection pool optimized', { closed, kept });
    return { closed, kept };
  }

  /**
   * Shutdown the connection pool manager
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    const closed = this.closeAllConnections();
    
    this.logger.info('Connection pool manager shutdown', {
      connectionsClosedOnShutdown: closed,
      finalStats: this.getStats()
    });
  }

  private parseUrl(url: string): { host: string; port: number; protocol: string } {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80),
        protocol: parsed.protocol.slice(0, -1) // Remove trailing ':'
      };
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  private findIdleConnection(hostKey: string): PooledConnection | null {
    const connections = this.connections.get(hostKey) || [];
    return connections.find(conn => !conn.isActive && this.enableKeepAlive) || null;
  }

  private findConnectionById(connectionId: string): PooledConnection | null {
    for (const connections of this.connections.values()) {
      const connection = connections.find(c => c.id === connectionId);
      if (connection) return connection;
    }
    return null;
  }

  private async createConnection(
    hostKey: string,
    host: string,
    port: number,
    protocol: string
  ): Promise<PooledConnection> {
    const startTime = Date.now();
    const connectionId = `${hostKey}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const connection: PooledConnection = {
        id: connectionId,
        host,
        port,
        protocol,
        created: Date.now(),
        lastUsed: Date.now(),
        useCount: 1,
        isActive: true
      };

      // Add to pool
      const hostConnections = this.connections.get(hostKey) || [];
      hostConnections.push(connection);
      this.connections.set(hostKey, hostConnections);

      // Track as active
      this.activeConnections.add(connectionId);

      // Update statistics
      this.stats.totalConnections++;
      this.stats.activeConnections = this.activeConnections.size;
      this.stats.completedConnections++;
      this.stats.totalConnectionTime += Date.now() - startTime;

      this.logger.debug('New connection created', {
        connectionId,
        host,
        port,
        protocol,
        connectionTime: Date.now() - startTime
      });

      return connection;

    } catch (error) {
      this.stats.failedConnections++;
      this.logger.error('Failed to create connection', error as Error, {
        host,
        port,
        protocol
      });
      throw error;
    }
  }

  private getTotalConnectionCount(): number {
    let total = 0;
    for (const connections of this.connections.values()) {
      total += connections.length;
    }
    return total;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [hostKey, connections] of this.connections.entries()) {
      const activeConnections = connections.filter(conn => {
        // Keep active connections
        if (conn.isActive) return true;

        // Remove idle connections that have exceeded timeout
        const idleTime = now - conn.lastUsed;
        if (idleTime > this.idleTimeout) {
          this.closeConnection(conn.id);
          cleaned++;
          return false;
        }

        return true;
      });

      if (activeConnections.length === 0) {
        this.connections.delete(hostKey);
      } else {
        this.connections.set(hostKey, activeConnections);
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Connection cleanup completed', {
        cleaned,
        remaining: this.getTotalConnectionCount()
      });
    }
  }
}

// Export singleton instance
export const connectionPoolManager = new ConnectionPoolManager();