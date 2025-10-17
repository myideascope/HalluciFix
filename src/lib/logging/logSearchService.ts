/**
 * Log Search and Analysis Service
 * Provides comprehensive log search, filtering, and correlation capabilities
 */

import { LogEntry, LogLevel, LogContext } from './types';

export interface LogSearchQuery {
  // Time range
  startTime?: Date;
  endTime?: Date;
  
  // Basic filters
  level?: LogLevel | LogLevel[];
  service?: string | string[];
  environment?: string | string[];
  userId?: string | string[];
  requestId?: string | string[];
  
  // Text search
  message?: string;
  messageRegex?: string;
  
  // Context filters
  contextFilters?: Record<string, any>;
  
  // Advanced filters
  hasError?: boolean;
  errorType?: string;
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Sorting
  sortBy?: 'timestamp' | 'level' | 'service';
  sortOrder?: 'asc' | 'desc';
}

export interface LogSearchResult {
  entries: LogEntry[];
  totalCount: number;
  hasMore: boolean;
  searchTime: number;
  aggregations?: LogAggregations;
}

export interface LogAggregations {
  levelCounts: Record<LogLevel, number>;
  serviceCounts: Record<string, number>;
  errorCounts: Record<string, number>;
  timeDistribution: Array<{
    timestamp: string;
    count: number;
  }>;
}

export interface LogCorrelation {
  requestId: string;
  entries: LogEntry[];
  duration: number;
  errorCount: number;
  warnCount: number;
  timeline: Array<{
    timestamp: string;
    level: LogLevel;
    message: string;
    service: string;
  }>;
}

export interface LogPattern {
  pattern: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  examples: LogEntry[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Log Search Service Implementation
 */
export class LogSearchService {
  private logStorage: LogEntry[] = [];
  private indexedFields: Map<string, Map<string, Set<number>>> = new Map();

  constructor() {
    this.initializeIndexes();
  }

  /**
   * Initialize search indexes for performance
   */
  private initializeIndexes(): void {
    // Create indexes for commonly searched fields
    const indexFields = ['level', 'service', 'environment', 'userId', 'requestId'];
    indexFields.forEach(field => {
      this.indexedFields.set(field, new Map());
    });
  }

  /**
   * Add log entry to searchable storage
   */
  addLogEntry(entry: LogEntry): void {
    const index = this.logStorage.length;
    this.logStorage.push(entry);
    
    // Update indexes
    this.updateIndexes(entry, index);
  }

  /**
   * Add multiple log entries
   */
  addLogEntries(entries: LogEntry[]): void {
    entries.forEach(entry => this.addLogEntry(entry));
  }

  /**
   * Update search indexes for a log entry
   */
  private updateIndexes(entry: LogEntry, index: number): void {
    // Index basic fields
    this.addToIndex('level', entry.level, index);
    this.addToIndex('service', entry.service, index);
    this.addToIndex('environment', entry.environment, index);
    
    // Index context fields
    if (entry.context.userId) {
      this.addToIndex('userId', entry.context.userId, index);
    }
    
    if (entry.context.requestId) {
      this.addToIndex('requestId', entry.context.requestId, index);
    }
  }

  /**
   * Add entry to specific index
   */
  private addToIndex(field: string, value: string, index: number): void {
    const fieldIndex = this.indexedFields.get(field);
    if (!fieldIndex) return;
    
    if (!fieldIndex.has(value)) {
      fieldIndex.set(value, new Set());
    }
    
    fieldIndex.get(value)!.add(index);
  }

  /**
   * Search logs with comprehensive filtering
   */
  async searchLogs(query: LogSearchQuery): Promise<LogSearchResult> {
    const startTime = Date.now();
    
    // Get candidate entries using indexes
    let candidateIndexes = this.getCandidateIndexes(query);
    
    // Filter candidates
    const filteredEntries = this.filterEntries(candidateIndexes, query);
    
    // Sort results
    const sortedEntries = this.sortEntries(filteredEntries, query);
    
    // Apply pagination
    const paginatedEntries = this.paginateEntries(sortedEntries, query);
    
    // Generate aggregations
    const aggregations = this.generateAggregations(filteredEntries);
    
    const searchTime = Date.now() - startTime;
    
    return {
      entries: paginatedEntries,
      totalCount: filteredEntries.length,
      hasMore: (query.offset || 0) + paginatedEntries.length < filteredEntries.length,
      searchTime,
      aggregations,
    };
  }

  /**
   * Get candidate entry indexes using search indexes
   */
  private getCandidateIndexes(query: LogSearchQuery): Set<number> {
    let candidates: Set<number> | null = null;
    
    // Use indexed fields to narrow down candidates
    const indexedQueries = [
      { field: 'level', value: query.level },
      { field: 'service', value: query.service },
      { field: 'environment', value: query.environment },
      { field: 'userId', value: query.userId },
      { field: 'requestId', value: query.requestId },
    ];
    
    for (const { field, value } of indexedQueries) {
      if (value) {
        const fieldCandidates = this.getIndexCandidates(field, value);
        if (fieldCandidates.size > 0) {
          candidates = candidates 
            ? this.intersectSets(candidates, fieldCandidates)
            : fieldCandidates;
        }
      }
    }
    
    // If no indexed queries, return all entries
    if (!candidates) {
      candidates = new Set(Array.from({ length: this.logStorage.length }, (_, i) => i));
    }
    
    return candidates;
  }

  /**
   * Get candidates from a specific index
   */
  private getIndexCandidates(field: string, value: string | string[]): Set<number> {
    const fieldIndex = this.indexedFields.get(field);
    if (!fieldIndex) return new Set();
    
    const values = Array.isArray(value) ? value : [value];
    const candidates = new Set<number>();
    
    values.forEach(v => {
      const indexes = fieldIndex.get(v);
      if (indexes) {
        indexes.forEach(index => candidates.add(index));
      }
    });
    
    return candidates;
  }

  /**
   * Intersect two sets
   */
  private intersectSets<T>(set1: Set<T>, set2: Set<T>): Set<T> {
    const result = new Set<T>();
    set1.forEach(item => {
      if (set2.has(item)) {
        result.add(item);
      }
    });
    return result;
  }

  /**
   * Filter entries based on query criteria
   */
  private filterEntries(candidateIndexes: Set<number>, query: LogSearchQuery): LogEntry[] {
    const entries: LogEntry[] = [];
    
    candidateIndexes.forEach(index => {
      const entry = this.logStorage[index];
      if (this.matchesQuery(entry, query)) {
        entries.push(entry);
      }
    });
    
    return entries;
  }

  /**
   * Check if entry matches query criteria
   */
  private matchesQuery(entry: LogEntry, query: LogSearchQuery): boolean {
    // Time range filter
    if (query.startTime || query.endTime) {
      const entryTime = new Date(entry.timestamp);
      if (query.startTime && entryTime < query.startTime) return false;
      if (query.endTime && entryTime > query.endTime) return false;
    }
    
    // Message search
    if (query.message && !entry.message.toLowerCase().includes(query.message.toLowerCase())) {
      return false;
    }
    
    // Message regex search
    if (query.messageRegex) {
      try {
        const regex = new RegExp(query.messageRegex, 'i');
        if (!regex.test(entry.message)) return false;
      } catch {
        // Invalid regex, skip this filter
      }
    }
    
    // Context filters
    if (query.contextFilters) {
      for (const [key, value] of Object.entries(query.contextFilters)) {
        if (entry.context[key] !== value) return false;
      }
    }
    
    // Error filters
    if (query.hasError !== undefined) {
      const hasError = !!entry.error;
      if (hasError !== query.hasError) return false;
    }
    
    if (query.errorType && (!entry.error || entry.error.name !== query.errorType)) {
      return false;
    }
    
    return true;
  }

  /**
   * Sort entries based on query criteria
   */
  private sortEntries(entries: LogEntry[], query: LogSearchQuery): LogEntry[] {
    const sortBy = query.sortBy || 'timestamp';
    const sortOrder = query.sortOrder || 'desc';
    
    return entries.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'timestamp':
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case 'level':
          const levelOrder = { debug: 0, info: 1, warn: 2, error: 3 };
          comparison = levelOrder[a.level] - levelOrder[b.level];
          break;
        case 'service':
          comparison = a.service.localeCompare(b.service);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Apply pagination to entries
   */
  private paginateEntries(entries: LogEntry[], query: LogSearchQuery): LogEntry[] {
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    
    return entries.slice(offset, offset + limit);
  }

  /**
   * Generate aggregations for search results
   */
  private generateAggregations(entries: LogEntry[]): LogAggregations {
    const levelCounts: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };
    
    const serviceCounts: Record<string, number> = {};
    const errorCounts: Record<string, number> = {};
    const timeDistribution: Map<string, number> = new Map();
    
    entries.forEach(entry => {
      // Level counts
      levelCounts[entry.level]++;
      
      // Service counts
      serviceCounts[entry.service] = (serviceCounts[entry.service] || 0) + 1;
      
      // Error counts
      if (entry.error) {
        errorCounts[entry.error.name] = (errorCounts[entry.error.name] || 0) + 1;
      }
      
      // Time distribution (hourly buckets)
      const hour = new Date(entry.timestamp).toISOString().slice(0, 13) + ':00:00.000Z';
      timeDistribution.set(hour, (timeDistribution.get(hour) || 0) + 1);
    });
    
    return {
      levelCounts,
      serviceCounts,
      errorCounts,
      timeDistribution: Array.from(timeDistribution.entries()).map(([timestamp, count]) => ({
        timestamp,
        count,
      })).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    };
  }

  /**
   * Correlate logs by request ID for request flow tracing
   */
  async correlateLogsByRequest(requestId: string): Promise<LogCorrelation | null> {
    const query: LogSearchQuery = {
      requestId: [requestId],
      sortBy: 'timestamp',
      sortOrder: 'asc',
    };
    
    const result = await this.searchLogs(query);
    
    if (result.entries.length === 0) {
      return null;
    }
    
    const entries = result.entries;
    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];
    
    const duration = new Date(lastEntry.timestamp).getTime() - new Date(firstEntry.timestamp).getTime();
    
    const errorCount = entries.filter(e => e.level === 'error').length;
    const warnCount = entries.filter(e => e.level === 'warn').length;
    
    const timeline = entries.map(entry => ({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      service: entry.service,
    }));
    
    return {
      requestId,
      entries,
      duration,
      errorCount,
      warnCount,
      timeline,
    };
  }

  /**
   * Get recent logs for debugging
   */
  async getRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    const query: LogSearchQuery = {
      limit,
      sortBy: 'timestamp',
      sortOrder: 'desc',
    };
    
    const result = await this.searchLogs(query);
    return result.entries;
  }

  /**
   * Get logs for specific user
   */
  async getUserLogs(userId: string, limit: number = 100): Promise<LogEntry[]> {
    const query: LogSearchQuery = {
      userId: [userId],
      limit,
      sortBy: 'timestamp',
      sortOrder: 'desc',
    };
    
    const result = await this.searchLogs(query);
    return result.entries;
  }

  /**
   * Get error logs with context
   */
  async getErrorLogs(limit: number = 100): Promise<LogEntry[]> {
    const query: LogSearchQuery = {
      level: ['error'],
      limit,
      sortBy: 'timestamp',
      sortOrder: 'desc',
    };
    
    const result = await this.searchLogs(query);
    return result.entries;
  }

  /**
   * Clear all stored logs (for testing/cleanup)
   */
  clearLogs(): void {
    this.logStorage = [];
    this.indexedFields.clear();
    this.initializeIndexes();
  }

  /**
   * Get storage statistics
   */
  getStorageStats(): {
    totalEntries: number;
    indexedFields: string[];
    memoryUsage: number;
  } {
    return {
      totalEntries: this.logStorage.length,
      indexedFields: Array.from(this.indexedFields.keys()),
      memoryUsage: JSON.stringify(this.logStorage).length,
    };
  }
}

// Export singleton instance
export const logSearchService = new LogSearchService();