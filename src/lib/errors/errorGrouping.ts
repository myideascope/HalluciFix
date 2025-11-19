/**
 * Error Grouping and Deduplication Service
 * Implements intelligent error fingerprinting and frequency tracking
 */

import { ApiError, ErrorContext, ErrorSeverity, ErrorType } from './types';
import { ErrorLogEntry } from './errorManager';

/**
 * Error fingerprint for grouping similar errors
 */
export interface ErrorFingerprint {
  id: string;
  type: ErrorType;
  normalizedMessage: string;
  component?: string;
  url?: string;
  stackTraceHash?: string;
}

/**
 * Error group with frequency and trend data
 */
export interface ErrorGroup {
  fingerprint: ErrorFingerprint;
  firstSeen: Date;
  lastSeen: Date;
  count: number;
  severity: ErrorSeverity;
  affectedUsers: Set<string>;
  affectedSessions: Set<string>;
  trend: ErrorTrend;
  samples: ErrorLogEntry[];
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

/**
 * Error trend analysis
 */
export interface ErrorTrend {
  hourly: number[];  // Last 24 hours
  daily: number[];   // Last 30 days
  isIncreasing: boolean;
  changeRate: number; // Percentage change from previous period
}

/**
 * Error impact assessment
 */
export interface ErrorImpact {
  userImpact: {
    totalUsers: number;
    affectedUsers: number;
    impactPercentage: number;
  };
  systemImpact: {
    errorRate: number;
    frequencyPerHour: number;
    criticalityScore: number; // 0-100
  };
  businessImpact: {
    featureAvailability: number; // 0-100
    userExperienceScore: number; // 0-100
    estimatedRevenueLoss?: number;
  };
}

/**
 * Error Grouping and Deduplication Service
 */
export class ErrorGroupingService {
  private static instance: ErrorGroupingService;
  private errorGroups: Map<string, ErrorGroup> = new Map();
  private userSessions: Map<string, Set<string>> = new Map(); // userId -> sessionIds
  private totalUsers: number = 0;
  private cleanupInterval?: NodeJS.Timeout;

  private constructor() {
    // Start cleanup interval to remove old data
    this.startCleanupInterval();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ErrorGroupingService {
    if (!ErrorGroupingService.instance) {
      ErrorGroupingService.instance = new ErrorGroupingService();
    }
    return ErrorGroupingService.instance;
  }

  /**
   * Process error and add to appropriate group
   */
  public processError(error: ApiError, context: ErrorContext = {}): string {
    const fingerprint = this.generateFingerprint(error, context);
    const groupId = fingerprint.id;

    let group = this.errorGroups.get(groupId);
    
    if (!group) {
      // Create new error group
      group = {
        fingerprint,
        firstSeen: new Date(error.timestamp),
        lastSeen: new Date(error.timestamp),
        count: 0,
        severity: error.severity,
        affectedUsers: new Set(),
        affectedSessions: new Set(),
        trend: {
          hourly: new Array(24).fill(0),
          daily: new Array(30).fill(0),
          isIncreasing: false,
          changeRate: 0
        },
        samples: [],
        resolved: false
      };
      this.errorGroups.set(groupId, group);
    }

    // Update group data
    this.updateErrorGroup(group, error, context);

    return groupId;
  }

  /**
   * Get error group by ID
   */
  public getErrorGroup(groupId: string): ErrorGroup | undefined {
    return this.errorGroups.get(groupId);
  }

  /**
   * Get all error groups
   */
  public getAllErrorGroups(): ErrorGroup[] {
    return Array.from(this.errorGroups.values());
  }

  /**
   * Get error groups by severity
   */
  public getErrorGroupsBySeverity(severity: ErrorSeverity): ErrorGroup[] {
    return this.getAllErrorGroups().filter(group => group.severity === severity);
  }

  /**
   * Get trending error groups
   */
  public getTrendingErrorGroups(limit: number = 10): ErrorGroup[] {
    return this.getAllErrorGroups()
      .filter(group => group.trend.isIncreasing)
      .sort((a, b) => b.trend.changeRate - a.trend.changeRate)
      .slice(0, limit);
  }

  /**
   * Get most frequent error groups
   */
  public getMostFrequentErrorGroups(limit: number = 10): ErrorGroup[] {
    return this.getAllErrorGroups()
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get error impact assessment
   */
  public getErrorImpact(groupId: string): ErrorImpact | undefined {
    const group = this.errorGroups.get(groupId);
    if (!group) return undefined;

    const affectedUsers = group.affectedUsers.size;
    const totalUsers = this.getTotalUsers();
    const userImpactPercentage = totalUsers > 0 ? (affectedUsers / totalUsers) * 100 : 0;

    // Calculate error rate (errors per hour in last 24 hours)
    const recentErrors = group.trend.hourly.reduce((sum, count) => sum + count, 0);
    const errorRate = recentErrors / 24;

    // Calculate criticality score based on severity, frequency, and user impact
    const severityWeight = this.getSeverityWeight(group.severity);
    const frequencyWeight = Math.min(group.count / 100, 1); // Normalize to 0-1
    const impactWeight = userImpactPercentage / 100;
    const criticalityScore = Math.round((severityWeight * 0.4 + frequencyWeight * 0.3 + impactWeight * 0.3) * 100);

    // Estimate feature availability impact
    const featureAvailability = Math.max(0, 100 - (criticalityScore * 0.5));
    const userExperienceScore = Math.max(0, 100 - criticalityScore);

    return {
      userImpact: {
        totalUsers,
        affectedUsers,
        impactPercentage: userImpactPercentage
      },
      systemImpact: {
        errorRate,
        frequencyPerHour: errorRate,
        criticalityScore
      },
      businessImpact: {
        featureAvailability,
        userExperienceScore
      }
    };
  }

  /**
   * Mark error group as resolved
   */
  public resolveErrorGroup(groupId: string, resolvedBy?: string): boolean {
    const group = this.errorGroups.get(groupId);
    if (!group) return false;

    group.resolved = true;
    group.resolvedAt = new Date();
    group.resolvedBy = resolvedBy;

    return true;
  }

  /**
   * Check if error group has regressed (new errors after being resolved)
   */
  public checkForRegression(groupId: string): boolean {
    const group = this.errorGroups.get(groupId);
    if (!group || !group.resolved || !group.resolvedAt) return false;

    // Check if there are new errors after resolution
    return group.lastSeen > group.resolvedAt;
  }

  /**
   * Get error group statistics
   */
  public getStatistics(): {
    totalGroups: number;
    activeGroups: number;
    resolvedGroups: number;
    criticalGroups: number;
    trendingGroups: number;
  } {
    const allGroups = this.getAllErrorGroups();
    
    return {
      totalGroups: allGroups.length,
      activeGroups: allGroups.filter(g => !g.resolved).length,
      resolvedGroups: allGroups.filter(g => g.resolved).length,
      criticalGroups: allGroups.filter(g => g.severity === ErrorSeverity.CRITICAL).length,
      trendingGroups: allGroups.filter(g => g.trend.isIncreasing).length
    };
  }

  /**
   * Set total user count for impact calculations
   */
  public setTotalUsers(count: number): void {
    this.totalUsers = count;
  }

  /**
   * Clean up old error groups and data
   */
  public cleanup(retentionDays: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    for (const [groupId, group] of this.errorGroups) {
      if (group.lastSeen < cutoffDate && group.resolved) {
        this.errorGroups.delete(groupId);
      }
    }
  }

  // Private helper methods

  /**
   * Generate error fingerprint for grouping
   */
  private generateFingerprint(error: ApiError, context: ErrorContext): ErrorFingerprint {
    const normalizedMessage = this.normalizeErrorMessage(error.message);
    const stackTraceHash = this.hashStackTrace(error.details?.stack);
    
    // Create fingerprint components
    const components = [
      error.type,
      normalizedMessage,
      context.component || 'unknown',
      this.normalizeUrl(error.url || context.url),
      stackTraceHash
    ].filter(Boolean);

    const fingerprintId = this.hashString(components.join('|'));

    return {
      id: fingerprintId,
      type: error.type,
      normalizedMessage,
      component: context.component,
      url: this.normalizeUrl(error.url || context.url),
      stackTraceHash
    };
  }

  /**
   * Update error group with new error occurrence
   */
  private updateErrorGroup(group: ErrorGroup, error: ApiError, context: ErrorContext): void {
    const now = new Date(error.timestamp);
    
    // Update basic counters
    group.count++;
    group.lastSeen = now;
    
    // Update severity (use highest severity seen)
    if (this.getSeverityWeight(error.severity) > this.getSeverityWeight(group.severity)) {
      group.severity = error.severity;
    }

    // Track affected users and sessions
    if (error.userId) {
      group.affectedUsers.add(error.userId);
      
      // Track user sessions
      if (error.sessionId) {
        if (!this.userSessions.has(error.userId)) {
          this.userSessions.set(error.userId, new Set());
        }
        this.userSessions.get(error.userId)!.add(error.sessionId);
      }
    }
    
    if (error.sessionId) {
      group.affectedSessions.add(error.sessionId);
    }

    // Update trend data
    this.updateTrendData(group, now);

    // Keep sample errors (limit to 10 most recent)
    const errorEntry: ErrorLogEntry = {
      errorId: error.errorId,
      type: error.type,
      severity: error.severity,
      message: error.message,
      userMessage: error.userMessage,
      timestamp: error.timestamp || new Date().toISOString(),
      statusCode: error.statusCode,
      url: error.url || '',
      userAgent: error.userAgent || '',
      userId: error.userId,
      sessionId: error.sessionId,
      context,
      resolved: false
    };

    group.samples.unshift(errorEntry);
    if (group.samples.length > 10) {
      group.samples = group.samples.slice(0, 10);
    }

    // Check if group was resolved but now has new errors (regression)
    if (group.resolved && group.resolvedAt && now > group.resolvedAt) {
      group.resolved = false;
      group.resolvedAt = undefined;
      group.resolvedBy = undefined;
    }
  }

/**
    * Update trend data for error group
    */
   private updateTrendData(group: ErrorGroup, timestamp: Date): void {
     const now = timestamp;
     const hourIndex = now.getHours();
     const dayIndex = now.getDate() - 1;

    // Update hourly trend
    group.trend.hourly[hourIndex]++;

    // Update daily trend
    if (dayIndex >= 0 && dayIndex < 30) {
      group.trend.daily[dayIndex]++;
    }

    // Calculate if trend is increasing
    const recentHours = group.trend.hourly.slice(-6); // Last 6 hours
    const previousHours = group.trend.hourly.slice(-12, -6); // Previous 6 hours
    
    const recentSum = recentHours.reduce((sum, count) => sum + count, 0);
    const previousSum = previousHours.reduce((sum, count) => sum + count, 0);
    
    if (previousSum > 0) {
      group.trend.changeRate = ((recentSum - previousSum) / previousSum) * 100;
      group.trend.isIncreasing = group.trend.changeRate > 20; // 20% increase threshold
    } else {
      group.trend.changeRate = recentSum > 0 ? 100 : 0;
      group.trend.isIncreasing = recentSum > 2; // At least 3 errors in recent period
    }
  }

  /**
   * Normalize error message for consistent grouping
   */
  private normalizeErrorMessage(message: string): string {
    return message
      .replace(/\b\d+\b/g, 'NUMBER')
      .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, 'UUID')
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\b/g, 'TIMESTAMP')
      .replace(/https?:\/\/[^\s]+/g, 'URL')
      .replace(/\/[a-f0-9]{24,}/g, '/ID') // MongoDB-style IDs
      .replace(/\/\d+/g, '/ID') // Numeric IDs
      .toLowerCase()
      .trim();
  }

  /**
   * Normalize URL for consistent grouping
   */
  private normalizeUrl(url?: string): string | undefined {
    if (!url) return undefined;
    
    return url
      .replace(/\/\d+/g, '/ID')
      .replace(/\/[a-f0-9]{24,}/g, '/ID')
      .replace(/\?.*$/, '') // Remove query parameters
      .replace(/#.*$/, ''); // Remove hash
  }

  /**
   * Hash stack trace for fingerprinting
   */
  private hashStackTrace(stackTrace?: string): string | undefined {
    if (!stackTrace) return undefined;
    
    // Normalize stack trace by removing line numbers and file paths
    const normalized = stackTrace
      .replace(/:\d+:\d+/g, ':LINE:COL')
      .replace(/\/[^\/\s]+\.js/g, '/FILE.js')
      .replace(/\/[^\/\s]+\.ts/g, '/FILE.ts');
    
    return this.hashString(normalized);
  }

  /**
   * Simple string hashing function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get severity weight for comparison
   */
  private getSeverityWeight(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return 4;
      case ErrorSeverity.HIGH: return 3;
      case ErrorSeverity.MEDIUM: return 2;
      case ErrorSeverity.LOW: return 1;
      default: return 0;
    }
  }

  /**
   * Get total users count
   */
  private getTotalUsers(): number {
    return this.totalUsers || this.userSessions.size;
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    // Clean up old data every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  /**
   * Stop cleanup interval
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}

// Export singleton instance
export const errorGrouping = ErrorGroupingService.getInstance();