/**
 * Log Retention and Storage Management
 * Handles log rotation, archival, and cleanup policies
 */

import { LogEntry, LogLevel } from './types';

export interface RetentionPolicy {
  maxAge: number; // in milliseconds
  maxSize: number; // in bytes
  maxEntries: number;
  compressionEnabled: boolean;
  archivalEnabled: boolean;
  archivalPath?: string;
}

export interface LogStorage {
  store(entries: LogEntry[]): Promise<void>;
  retrieve(filters?: LogFilter): Promise<LogEntry[]>;
  cleanup(policy: RetentionPolicy): Promise<void>;
  getSize(): Promise<number>;
  getCount(): Promise<number>;
}

export interface LogFilter {
  startDate?: Date;
  endDate?: Date;
  level?: LogLevel;
  service?: string;
  userId?: string;
  requestId?: string;
}

/**
 * In-Memory Log Storage (for development/testing)
 */
export class InMemoryLogStorage implements LogStorage {
  private logs: LogEntry[] = [];
  private maxSize: number = 10 * 1024 * 1024; // 10MB default

  constructor(maxSize?: number) {
    if (maxSize) {
      this.maxSize = maxSize;
    }
  }

  async store(entries: LogEntry[]): Promise<void> {
    this.logs.push(...entries);
    
    // Simple size-based cleanup
    const currentSize = await this.getSize();
    if (currentSize > this.maxSize) {
      const targetSize = this.maxSize * 0.8; // Remove 20% when limit reached
      while ((await this.getSize()) > targetSize && this.logs.length > 0) {
        this.logs.shift(); // Remove oldest entries
      }
    }
  }

  async retrieve(filters?: LogFilter): Promise<LogEntry[]> {
    let filteredLogs = [...this.logs];

    if (filters) {
      filteredLogs = filteredLogs.filter(log => {
        const logDate = new Date(log.timestamp);
        
        if (filters.startDate && logDate < filters.startDate) return false;
        if (filters.endDate && logDate > filters.endDate) return false;
        if (filters.level && log.level !== filters.level) return false;
        if (filters.service && log.service !== filters.service) return false;
        if (filters.userId && log.context.userId !== filters.userId) return false;
        if (filters.requestId && log.context.requestId !== filters.requestId) return false;
        
        return true;
      });
    }

    return filteredLogs;
  }

  async cleanup(policy: RetentionPolicy): Promise<void> {
    const now = Date.now();
    const cutoffTime = now - policy.maxAge;

    // Remove entries older than maxAge
    this.logs = this.logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime > cutoffTime;
    });

    // Limit by maxEntries
    if (this.logs.length > policy.maxEntries) {
      this.logs = this.logs.slice(-policy.maxEntries);
    }

    // Size-based cleanup
    const currentSize = await this.getSize();
    if (currentSize > policy.maxSize) {
      const targetSize = policy.maxSize * 0.8;
      while ((await this.getSize()) > targetSize && this.logs.length > 0) {
        this.logs.shift();
      }
    }
  }

  async getSize(): Promise<number> {
    return JSON.stringify(this.logs).length;
  }

  async getCount(): Promise<number> {
    return this.logs.length;
  }
}

/**
 * Local Storage Log Storage (for browser environments)
 */
export class LocalStorageLogStorage implements LogStorage {
  private storageKey: string;
  private maxSize: number;

  constructor(storageKey: string = 'hallucifix_logs', maxSize: number = 5 * 1024 * 1024) {
    this.storageKey = storageKey;
    this.maxSize = maxSize;
  }

  private getLogs(): LogEntry[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveLogs(logs: LogEntry[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(logs));
    } catch (error) {
      console.warn('Failed to save logs to localStorage:', error);
    }
  }

  async store(entries: LogEntry[]): Promise<void> {
    const existingLogs = this.getLogs();
    const allLogs = [...existingLogs, ...entries];
    
    // Size-based cleanup
    const serialized = JSON.stringify(allLogs);
    if (serialized.length > this.maxSize) {
      const targetSize = this.maxSize * 0.8;
      const filteredLogs = allLogs;
      
      while (JSON.stringify(filteredLogs).length > targetSize && filteredLogs.length > 0) {
        filteredLogs.shift();
      }
      
      this.saveLogs(filteredLogs);
    } else {
      this.saveLogs(allLogs);
    }
  }

  async retrieve(filters?: LogFilter): Promise<LogEntry[]> {
    const logs = this.getLogs();
    
    if (!filters) {
      return logs;
    }

    return logs.filter(log => {
      const logDate = new Date(log.timestamp);
      
      if (filters.startDate && logDate < filters.startDate) return false;
      if (filters.endDate && logDate > filters.endDate) return false;
      if (filters.level && log.level !== filters.level) return false;
      if (filters.service && log.service !== filters.service) return false;
      if (filters.userId && log.context.userId !== filters.userId) return false;
      if (filters.requestId && log.context.requestId !== filters.requestId) return false;
      
      return true;
    });
  }

  async cleanup(policy: RetentionPolicy): Promise<void> {
    const logs = this.getLogs();
    const now = Date.now();
    const cutoffTime = now - policy.maxAge;

    let filteredLogs = logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime > cutoffTime;
    });

    // Limit by maxEntries
    if (filteredLogs.length > policy.maxEntries) {
      filteredLogs = filteredLogs.slice(-policy.maxEntries);
    }

    this.saveLogs(filteredLogs);
  }

  async getSize(): Promise<number> {
    const logs = this.getLogs();
    return JSON.stringify(logs).length;
  }

  async getCount(): Promise<number> {
    const logs = this.getLogs();
    return logs.length;
  }
}

/**
 * Log Retention Manager
 */
export class LogRetentionManager {
  private storage: LogStorage;
  private policy: RetentionPolicy;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(storage: LogStorage, policy: RetentionPolicy) {
    this.storage = storage;
    this.policy = policy;
    
    // Start automatic cleanup
    this.startAutomaticCleanup();
  }

  private startAutomaticCleanup(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  async cleanup(): Promise<void> {
    try {
      await this.storage.cleanup(this.policy);
    } catch (error) {
      console.error('Log cleanup failed:', error);
    }
  }

  async getStorageStats(): Promise<{
    size: number;
    count: number;
    policy: RetentionPolicy;
  }> {
    const size = await this.storage.getSize();
    const count = await this.storage.getCount();
    
    return {
      size,
      count,
      policy: this.policy,
    };
  }

  updatePolicy(newPolicy: Partial<RetentionPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Default retention policies
export const DEFAULT_RETENTION_POLICIES = {
  development: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    maxSize: 10 * 1024 * 1024, // 10MB
    maxEntries: 10000,
    compressionEnabled: false,
    archivalEnabled: false,
  },
  production: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxSize: 100 * 1024 * 1024, // 100MB
    maxEntries: 100000,
    compressionEnabled: true,
    archivalEnabled: true,
  },
} as const;