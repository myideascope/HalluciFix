/**
 * Advanced Log Retention and Archival System
 * Provides sophisticated retention policies, compression, and archival strategies
 */

import { LogEntry, LogLevel } from './types';
import { RetentionPolicy, LogStorage } from './logRetention';

import { logger } from './index';
export interface AdvancedRetentionPolicy extends RetentionPolicy {
  // Tiered retention based on log level
  levelPolicies: Record<LogLevel, {
    maxAge: number;
    priority: number; // Higher priority = kept longer
  }>;
  
  // Service-specific retention
  servicePolicies: Record<string, {
    maxAge: number;
    maxSize: number;
  }>;
  
  // Archival tiers
  archivalTiers: ArchivalTier[];
  
  // Compression settings
  compressionSettings: CompressionSettings;
  
  // Cleanup schedule
  cleanupSchedule: CleanupSchedule;
}

export interface ArchivalTier {
  name: string;
  minAge: number; // Minimum age before moving to this tier
  maxAge: number; // Maximum age in this tier before deletion
  compressionLevel: number; // 0-9, higher = more compression
  storageType: 'local' | 'cloud' | 'cold';
  enabled: boolean;
}

export interface CompressionSettings {
  enabled: boolean;
  algorithm: 'gzip' | 'lz4' | 'zstd';
  level: number; // 1-9
  batchSize: number; // Number of entries to compress together
  minSizeThreshold: number; // Minimum size before compression
}

export interface CleanupSchedule {
  interval: number; // minutes
  enabled: boolean;
  maintenanceWindow?: {
    startHour: number; // 0-23
    endHour: number; // 0-23
  };
}

export interface ArchivalStats {
  totalEntries: number;
  totalSize: number;
  tierDistribution: Record<string, {
    entries: number;
    size: number;
    compressionRatio?: number;
  }>;
  oldestEntry: Date;
  newestEntry: Date;
  retentionEfficiency: number; // Percentage of space saved
}

/**
 * Advanced Log Archival Service
 */
export class LogArchivalService {
  private policy: AdvancedRetentionPolicy;
  private storage: LogStorage;
  private compressionCache: Map<string, CompressedLogBatch> = new Map();
  private archivalStats: ArchivalStats | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(storage: LogStorage, policy: AdvancedRetentionPolicy) {
    this.storage = storage;
    this.policy = policy;
    this.startScheduledCleanup();
  }

  /**
   * Start scheduled cleanup process
   */
  private startScheduledCleanup(): void {
    if (!this.policy.cleanupSchedule.enabled) return;

    this.cleanupInterval = setInterval(async () => {
      if (this.isInMaintenanceWindow()) {
        await this.performScheduledCleanup();
      }
    }, this.policy.cleanupSchedule.interval * 60 * 1000);
  }

  /**
   * Check if current time is within maintenance window
   */
  private isInMaintenanceWindow(): boolean {
    if (!this.policy.cleanupSchedule.maintenanceWindow) return true;

    const now = new Date();
    const currentHour = now.getHours();
    const { startHour, endHour } = this.policy.cleanupSchedule.maintenanceWindow;

    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour <= endHour;
    } else {
      // Maintenance window crosses midnight
      return currentHour >= startHour || currentHour <= endHour;
    }
  }

  /**
   * Perform scheduled cleanup and archival
   */
  private async performScheduledCleanup(): Promise<void> {
    try {
      logger.info("Starting scheduled log cleanup and archival...");
      
      // Get all logs for processing
      const allLogs = await this.storage.retrieve();
      
      // Categorize logs by retention tier
      const categorizedLogs = this.categorizeLogs(allLogs);
      
      // Process each tier
      for (const [tierName, logs] of Object.entries(categorizedLogs)) {
        await this.processTier(tierName, logs);
      }
      
      // Update archival statistics
      await this.updateArchivalStats();
      
      logger.debug("Scheduled cleanup completed successfully");
    } catch (error) {
      logger.error("Scheduled cleanup failed:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Categorize logs into retention tiers
   */
  private categorizeLogs(logs: LogEntry[]): Record<string, LogEntry[]> {
    const now = Date.now();
    const categorized: Record<string, LogEntry[]> = {};

    // Initialize categories
    this.policy.archivalTiers.forEach(tier => {
      categorized[tier.name] = [];
    });
    categorized['active'] = [];
    categorized['expired'] = [];

    logs.forEach(log => {
      const logAge = now - new Date(log.timestamp).getTime();
      const logLevel = log.level;
      const service = log.service;

      // Check if log is expired based on level policy
      const levelPolicy = this.policy.levelPolicies[logLevel];
      if (levelPolicy && logAge > levelPolicy.maxAge) {
        categorized['expired'].push(log);
        return;
      }

      // Check service-specific policy
      const servicePolicy = this.policy.servicePolicies[service];
      if (servicePolicy && logAge > servicePolicy.maxAge) {
        categorized['expired'].push(log);
        return;
      }

      // Find appropriate archival tier
      let assigned = false;
      for (const tier of this.policy.archivalTiers) {
        if (tier.enabled && logAge >= tier.minAge && logAge < tier.maxAge) {
          categorized[tier.name].push(log);
          assigned = true;
          break;
        }
      }

      // If not assigned to any tier, keep as active
      if (!assigned) {
        categorized['active'].push(log);
      }
    });

    return categorized;
  }

  /**
   * Process logs in a specific tier
   */
  private async processTier(tierName: string, logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) return;

    if (tierName === 'expired') {
      // Delete expired logs
      await this.deleteExpiredLogs(logs);
      return;
    }

    if (tierName === 'active') {
      // Keep active logs as-is
      return;
    }

    // Find tier configuration
    const tier = this.policy.archivalTiers.find(t => t.name === tierName);
    if (!tier) return;

    // Compress logs if needed
    if (this.policy.compressionSettings.enabled && tier.compressionLevel > 0) {
      await this.compressLogs(logs, tier.compressionLevel);
    }

    // Archive based on storage type
    switch (tier.storageType) {
      case 'local':
        await this.archiveToLocal(logs, tier);
        break;
      case 'cloud':
        await this.archiveToCloud(logs, tier);
        break;
      case 'cold':
        await this.archiveToColdStorage(logs, tier);
        break;
    }
  }

  /**
   * Delete expired logs
   */
  private async deleteExpiredLogs(logs: LogEntry[]): Promise<void> {
    console.log(`Deleting ${logs.length} expired log entries`);
    // In a real implementation, this would remove logs from storage
    // For now, we'll just log the action
  }

  /**
   * Compress logs using specified algorithm and level
   */
  private async compressLogs(logs: LogEntry[], compressionLevel: number): Promise<void> {
    const { algorithm, batchSize, minSizeThreshold } = this.policy.compressionSettings;
    
    // Group logs into batches
    const batches = this.createLogBatches(logs, batchSize);
    
    for (const batch of batches) {
      const serialized = JSON.stringify(batch);
      
      if (serialized.length < minSizeThreshold) {
        continue; // Skip compression for small batches
      }

      const compressed = await this.compressData(serialized, algorithm, compressionLevel);
      const compressionRatio = compressed.length / serialized.length;
      
      // Cache compressed batch
      const batchId = this.generateBatchId(batch);
      this.compressionCache.set(batchId, {
        id: batchId,
        originalSize: serialized.length,
        compressedSize: compressed.length,
        compressionRatio,
        algorithm,
        level: compressionLevel,
        data: compressed,
        entries: batch.length,
        createdAt: new Date(),
      });
      
      console.log(`Compressed batch ${batchId}: ${Math.round((1 - compressionRatio) * 100)}% size reduction`);
    }
  }

  /**
   * Create log batches for compression
   */
  private createLogBatches(logs: LogEntry[], batchSize: number): LogEntry[][] {
    const batches: LogEntry[][] = [];
    
    for (let i = 0; i < logs.length; i += batchSize) {
      batches.push(logs.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Compress data using specified algorithm
   */
  private async compressData(
    data: string,
    algorithm: string,
    level: number
  ): Promise<Uint8Array> {
    // In a real implementation, this would use actual compression libraries
    // For now, we'll simulate compression by encoding the string
    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);
    
    // Simulate compression ratio based on algorithm and level
    const compressionRatio = this.getSimulatedCompressionRatio(algorithm, level);
    const compressedSize = Math.floor(encoded.length * compressionRatio);
    
    return encoded.slice(0, compressedSize);
  }

  /**
   * Get simulated compression ratio for testing
   */
  private getSimulatedCompressionRatio(algorithm: string, level: number): number {
    const baseRatios = {
      gzip: 0.3,
      lz4: 0.5,
      zstd: 0.25,
    };
    
    const baseRatio = baseRatios[algorithm as keyof typeof baseRatios] || 0.4;
    const levelMultiplier = 1 - (level / 20); // Higher level = better compression
    
    return Math.max(0.1, baseRatio * levelMultiplier);
  }

  /**
   * Generate unique batch ID
   */
  private generateBatchId(batch: LogEntry[]): string {
    const firstTimestamp = batch[0]?.timestamp || '';
    const lastTimestamp = batch[batch.length - 1]?.timestamp || '';
    const hash = this.simpleHash(`${firstTimestamp}-${lastTimestamp}-${batch.length}`);
    return `batch_${hash}`;
  }

  /**
   * Simple hash function for batch IDs
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Archive logs to local storage
   */
  private async archiveToLocal(logs: LogEntry[], tier: ArchivalTier): Promise<void> {
    console.log(`Archiving ${logs.length} logs to local storage (tier: ${tier.name})`);
    // Implementation would save to local archive directory
  }

  /**
   * Archive logs to cloud storage
   */
  private async archiveToCloud(logs: LogEntry[], tier: ArchivalTier): Promise<void> {
    console.log(`Archiving ${logs.length} logs to cloud storage (tier: ${tier.name})`);
    // Implementation would upload to cloud storage service
  }

  /**
   * Archive logs to cold storage
   */
  private async archiveToColdStorage(logs: LogEntry[], tier: ArchivalTier): Promise<void> {
    console.log(`Archiving ${logs.length} logs to cold storage (tier: ${tier.name})`);
    // Implementation would move to cold storage (e.g., AWS Glacier)
  }

  /**
   * Update archival statistics
   */
  private async updateArchivalStats(): Promise<void> {
    const allLogs = await this.storage.retrieve();
    const now = Date.now();
    
    const tierDistribution: Record<string, { entries: number; size: number; compressionRatio?: number }> = {};
    let totalSize = 0;
    let oldestEntry = new Date();
    let newestEntry = new Date(0);

    // Calculate distribution
    const categorized = this.categorizeLogs(allLogs);
    
    Object.entries(categorized).forEach(([tierName, logs]) => {
      const tierSize = JSON.stringify(logs).length;
      totalSize += tierSize;
      
      tierDistribution[tierName] = {
        entries: logs.length,
        size: tierSize,
      };
      
      // Update oldest/newest
      logs.forEach(log => {
        const logDate = new Date(log.timestamp);
        if (logDate < oldestEntry) oldestEntry = logDate;
        if (logDate > newestEntry) newestEntry = logDate;
      });
    });

    // Calculate compression ratios
    this.compressionCache.forEach((batch, batchId) => {
      const tierName = this.findTierForBatch(batchId);
      if (tierName && tierDistribution[tierName]) {
        tierDistribution[tierName].compressionRatio = batch.compressionRatio;
      }
    });

    // Calculate retention efficiency
    const originalSize = allLogs.length * 1000; // Estimate original size
    const retentionEfficiency = totalSize > 0 ? ((originalSize - totalSize) / originalSize) * 100 : 0;

    this.archivalStats = {
      totalEntries: allLogs.length,
      totalSize,
      tierDistribution,
      oldestEntry,
      newestEntry,
      retentionEfficiency: Math.max(0, retentionEfficiency),
    };
  }

  /**
   * Find tier for compressed batch
   */
  private findTierForBatch(batchId: string): string | null {
    // In a real implementation, this would track which tier each batch belongs to
    return 'archived'; // Simplified for demo
  }

  // Public API methods

  /**
   * Get current archival statistics
   */
  async getArchivalStats(): Promise<ArchivalStats | null> {
    if (!this.archivalStats) {
      await this.updateArchivalStats();
    }
    return this.archivalStats;
  }

  /**
   * Update retention policy
   */
  updatePolicy(newPolicy: Partial<AdvancedRetentionPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }

  /**
   * Manually trigger cleanup
   */
  async triggerCleanup(): Promise<void> {
    await this.performScheduledCleanup();
  }

  /**
   * Get compression cache statistics
   */
  getCompressionStats(): {
    totalBatches: number;
    totalOriginalSize: number;
    totalCompressedSize: number;
    averageCompressionRatio: number;
  } {
    const batches = Array.from(this.compressionCache.values());
    
    if (batches.length === 0) {
      return {
        totalBatches: 0,
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        averageCompressionRatio: 0,
      };
    }

    const totalOriginalSize = batches.reduce((sum, batch) => sum + batch.originalSize, 0);
    const totalCompressedSize = batches.reduce((sum, batch) => sum + batch.compressedSize, 0);
    const averageCompressionRatio = batches.reduce((sum, batch) => sum + batch.compressionRatio, 0) / batches.length;

    return {
      totalBatches: batches.length,
      totalOriginalSize,
      totalCompressedSize,
      averageCompressionRatio,
    };
  }

  /**
   * Stop archival service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

interface CompressedLogBatch {
  id: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  algorithm: string;
  level: number;
  data: Uint8Array;
  entries: number;
  createdAt: Date;
}

// Default advanced retention policies
export const DEFAULT_ADVANCED_RETENTION_POLICIES = {
  development: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    maxSize: 10 * 1024 * 1024, // 10MB
    maxEntries: 10000,
    compressionEnabled: false,
    archivalEnabled: false,
    levelPolicies: {
      debug: { maxAge: 2 * 60 * 60 * 1000, priority: 1 }, // 2 hours
      info: { maxAge: 12 * 60 * 60 * 1000, priority: 2 }, // 12 hours
      warn: { maxAge: 24 * 60 * 60 * 1000, priority: 3 }, // 1 day
      error: { maxAge: 7 * 24 * 60 * 60 * 1000, priority: 4 }, // 7 days
    },
    servicePolicies: {},
    archivalTiers: [
      {
        name: 'recent',
        minAge: 0,
        maxAge: 60 * 60 * 1000, // 1 hour
        compressionLevel: 0,
        storageType: 'local',
        enabled: true,
      },
    ],
    compressionSettings: {
      enabled: false,
      algorithm: 'gzip',
      level: 1,
      batchSize: 100,
      minSizeThreshold: 1024,
    },
    cleanupSchedule: {
      interval: 60, // 1 hour
      enabled: true,
    },
  } as AdvancedRetentionPolicy,

  production: {
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    maxSize: 1024 * 1024 * 1024, // 1GB
    maxEntries: 1000000,
    compressionEnabled: true,
    archivalEnabled: true,
    levelPolicies: {
      debug: { maxAge: 24 * 60 * 60 * 1000, priority: 1 }, // 1 day
      info: { maxAge: 7 * 24 * 60 * 60 * 1000, priority: 2 }, // 7 days
      warn: { maxAge: 30 * 24 * 60 * 60 * 1000, priority: 3 }, // 30 days
      error: { maxAge: 90 * 24 * 60 * 60 * 1000, priority: 4 }, // 90 days
    },
    servicePolicies: {
      'critical-service': {
        maxAge: 180 * 24 * 60 * 60 * 1000, // 180 days
        maxSize: 500 * 1024 * 1024, // 500MB
      },
    },
    archivalTiers: [
      {
        name: 'hot',
        minAge: 0,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        compressionLevel: 1,
        storageType: 'local',
        enabled: true,
      },
      {
        name: 'warm',
        minAge: 24 * 60 * 60 * 1000, // 1 day
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        compressionLevel: 6,
        storageType: 'cloud',
        enabled: true,
      },
      {
        name: 'cold',
        minAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
        compressionLevel: 9,
        storageType: 'cold',
        enabled: true,
      },
    ],
    compressionSettings: {
      enabled: true,
      algorithm: 'zstd',
      level: 6,
      batchSize: 1000,
      minSizeThreshold: 10240, // 10KB
    },
    cleanupSchedule: {
      interval: 240, // 4 hours
      enabled: true,
      maintenanceWindow: {
        startHour: 2, // 2 AM
        endHour: 6,   // 6 AM
      },
    },
  } as AdvancedRetentionPolicy,
} as const;