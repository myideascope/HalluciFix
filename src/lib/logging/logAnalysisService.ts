/**
 * Log Analysis Service
 * Provides advanced log analysis, pattern detection, and troubleshooting tools
 */

import { LogEntry, LogLevel } from './types';
import { LogSearchService, LogPattern, LogCorrelation } from './logSearchService';

export interface LogAnalysisResult {
  summary: LogSummary;
  patterns: LogPattern[];
  anomalies: LogAnomaly[];
  recommendations: LogRecommendation[];
  trends: LogTrend[];
}

export interface LogSummary {
  totalEntries: number;
  timeRange: {
    start: Date;
    end: Date;
  };
  levelDistribution: Record<LogLevel, number>;
  serviceDistribution: Record<string, number>;
  errorRate: number;
  averageResponseTime?: number;
}

export interface LogAnomaly {
  type: 'spike' | 'drop' | 'pattern' | 'error_burst';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: Date;
  affectedEntries: number;
  context: Record<string, any>;
}

export interface LogRecommendation {
  type: 'performance' | 'error' | 'security' | 'monitoring';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  action: string;
  impact: string;
}

export interface LogTrend {
  metric: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  change: number;
  timeframe: string;
  significance: 'low' | 'medium' | 'high';
}

export interface DebugContext {
  requestId?: string;
  userId?: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
  services?: string[];
  errorTypes?: string[];
}

/**
 * Log Analysis Service Implementation
 */
export class LogAnalysisService {
  private searchService: LogSearchService;
  private patternCache: Map<string, LogPattern[]> = new Map();
  private analysisCache: Map<string, LogAnalysisResult> = new Map();

  constructor(searchService: LogSearchService) {
    this.searchService = searchService;
  }

  /**
   * Perform comprehensive log analysis
   */
  async analyzeLogsPeriod(
    startTime: Date,
    endTime: Date,
    services?: string[]
  ): Promise<LogAnalysisResult> {
    const cacheKey = `${startTime.getTime()}-${endTime.getTime()}-${services?.join(',')}`;
    
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }

    const searchResult = await this.searchService.searchLogs({
      startTime,
      endTime,
      service: services,
      limit: 10000, // Analyze up to 10k entries
    });

    const entries = searchResult.entries;
    
    const summary = this.generateLogSummary(entries, startTime, endTime);
    const patterns = await this.detectLogPatterns(entries);
    const anomalies = this.detectAnomalies(entries);
    const recommendations = this.generateRecommendations(entries, patterns, anomalies);
    const trends = this.analyzeTrends(entries);

    const result: LogAnalysisResult = {
      summary,
      patterns,
      anomalies,
      recommendations,
      trends,
    };

    // Cache result for 5 minutes
    this.analysisCache.set(cacheKey, result);
    setTimeout(() => this.analysisCache.delete(cacheKey), 5 * 60 * 1000);

    return result;
  }

  /**
   * Generate log summary statistics
   */
  private generateLogSummary(
    entries: LogEntry[],
    startTime: Date,
    endTime: Date
  ): LogSummary {
    const levelDistribution: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    const serviceDistribution: Record<string, number> = {};
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    entries.forEach(entry => {
      levelDistribution[entry.level]++;
      
      serviceDistribution[entry.service] = (serviceDistribution[entry.service] || 0) + 1;
      
      // Extract response time if available
      if (entry.context.duration && typeof entry.context.duration === 'number') {
        totalResponseTime += entry.context.duration;
        responseTimeCount++;
      }
    });

    const errorCount = levelDistribution.error + levelDistribution.warn;
    const errorRate = entries.length > 0 ? (errorCount / entries.length) * 100 : 0;
    const averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : undefined;

    return {
      totalEntries: entries.length,
      timeRange: { start: startTime, end: endTime },
      levelDistribution,
      serviceDistribution,
      errorRate,
      averageResponseTime,
    };
  }

  /**
   * Detect common log patterns
   */
  async detectLogPatterns(entries: LogEntry[]): Promise<LogPattern[]> {
    const patterns: Map<string, LogPattern> = new Map();
    
    // Group similar messages
    const messageGroups: Map<string, LogEntry[]> = new Map();
    
    entries.forEach(entry => {
      // Normalize message by removing dynamic parts
      const normalizedMessage = this.normalizeMessage(entry.message);
      
      if (!messageGroups.has(normalizedMessage)) {
        messageGroups.set(normalizedMessage, []);
      }
      messageGroups.get(normalizedMessage)!.push(entry);
    });

    // Convert groups to patterns
    messageGroups.forEach((groupEntries, pattern) => {
      if (groupEntries.length >= 2) { // Only consider patterns that occur multiple times
        const firstEntry = groupEntries[0];
        const lastEntry = groupEntries[groupEntries.length - 1];
        
        const severity = this.calculatePatternSeverity(groupEntries);
        
        patterns.set(pattern, {
          pattern,
          count: groupEntries.length,
          firstSeen: new Date(firstEntry.timestamp),
          lastSeen: new Date(lastEntry.timestamp),
          examples: groupEntries.slice(0, 3), // Keep first 3 examples
          severity,
        });
      }
    });

    return Array.from(patterns.values())
      .sort((a, b) => b.count - a.count) // Sort by frequency
      .slice(0, 20); // Return top 20 patterns
  }

  /**
   * Normalize log message for pattern detection
   */
  private normalizeMessage(message: string): string {
    return message
      // Replace numbers with placeholder
      .replace(/\b\d+\b/g, '{number}')
      // Replace UUIDs with placeholder
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{uuid}')
      // Replace timestamps with placeholder
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '{timestamp}')
      // Replace IP addresses with placeholder
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '{ip}')
      // Replace URLs with placeholder
      .replace(/https?:\/\/[^\s]+/g, '{url}')
      // Replace file paths with placeholder
      .replace(/\/[^\s]+/g, '{path}');
  }

  /**
   * Calculate pattern severity based on log levels and frequency
   */
  private calculatePatternSeverity(entries: LogEntry[]): 'low' | 'medium' | 'high' | 'critical' {
    const errorCount = entries.filter(e => e.level === 'error').length;
    const warnCount = entries.filter(e => e.level === 'warn').length;
    const totalCount = entries.length;
    
    const errorRate = errorCount / totalCount;
    const warnRate = warnCount / totalCount;
    
    if (errorRate > 0.5 || totalCount > 100) return 'critical';
    if (errorRate > 0.2 || warnRate > 0.5 || totalCount > 50) return 'high';
    if (errorRate > 0.1 || warnRate > 0.2 || totalCount > 20) return 'medium';
    return 'low';
  }

  /**
   * Detect anomalies in log data
   */
  private detectAnomalies(entries: LogEntry[]): LogAnomaly[] {
    const anomalies: LogAnomaly[] = [];
    
    // Detect error bursts
    const errorBursts = this.detectErrorBursts(entries);
    anomalies.push(...errorBursts);
    
    // Detect volume spikes
    const volumeSpikes = this.detectVolumeSpikes(entries);
    anomalies.push(...volumeSpikes);
    
    // Detect unusual patterns
    const unusualPatterns = this.detectUnusualPatterns(entries);
    anomalies.push(...unusualPatterns);
    
    return anomalies.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Detect error bursts (many errors in short time)
   */
  private detectErrorBursts(entries: LogEntry[]): LogAnomaly[] {
    const anomalies: LogAnomaly[] = [];
    const errorEntries = entries.filter(e => e.level === 'error');
    
    if (errorEntries.length < 5) return anomalies;
    
    // Group errors by 5-minute windows
    const windows: Map<string, LogEntry[]> = new Map();
    
    errorEntries.forEach(entry => {
      const timestamp = new Date(entry.timestamp);
      const windowKey = new Date(
        timestamp.getFullYear(),
        timestamp.getMonth(),
        timestamp.getDate(),
        timestamp.getHours(),
        Math.floor(timestamp.getMinutes() / 5) * 5
      ).toISOString();
      
      if (!windows.has(windowKey)) {
        windows.set(windowKey, []);
      }
      windows.get(windowKey)!.push(entry);
    });
    
    // Find windows with unusually high error counts
    const averageErrorsPerWindow = errorEntries.length / windows.size;
    const threshold = Math.max(5, averageErrorsPerWindow * 3);
    
    windows.forEach((windowEntries, windowKey) => {
      if (windowEntries.length >= threshold) {
        anomalies.push({
          type: 'error_burst',
          severity: windowEntries.length > threshold * 2 ? 'critical' : 'high',
          description: `Error burst detected: ${windowEntries.length} errors in 5-minute window`,
          timestamp: new Date(windowKey),
          affectedEntries: windowEntries.length,
          context: {
            window: windowKey,
            threshold,
            errorTypes: [...new Set(windowEntries.map(e => e.error?.name).filter(Boolean))],
          },
        });
      }
    });
    
    return anomalies;
  }

  /**
   * Detect volume spikes
   */
  private detectVolumeSpikes(entries: LogEntry[]): LogAnomaly[] {
    const anomalies: LogAnomaly[] = [];
    
    if (entries.length < 100) return anomalies;
    
    // Group entries by hour
    const hourlyVolume: Map<string, number> = new Map();
    
    entries.forEach(entry => {
      const hour = new Date(entry.timestamp).toISOString().slice(0, 13);
      hourlyVolume.set(hour, (hourlyVolume.get(hour) || 0) + 1);
    });
    
    const volumes = Array.from(hourlyVolume.values());
    const averageVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
    const threshold = averageVolume * 3;
    
    hourlyVolume.forEach((volume, hour) => {
      if (volume >= threshold) {
        anomalies.push({
          type: 'spike',
          severity: volume > threshold * 2 ? 'high' : 'medium',
          description: `Volume spike detected: ${volume} logs in hour (${Math.round((volume / averageVolume) * 100)}% above average)`,
          timestamp: new Date(hour + ':00:00.000Z'),
          affectedEntries: volume,
          context: {
            hour,
            volume,
            averageVolume: Math.round(averageVolume),
            threshold: Math.round(threshold),
          },
        });
      }
    });
    
    return anomalies;
  }

  /**
   * Detect unusual patterns
   */
  private detectUnusualPatterns(entries: LogEntry[]): LogAnomaly[] {
    const anomalies: LogAnomaly[] = [];
    
    // Detect services with unusual error rates
    const serviceStats: Map<string, { total: number; errors: number }> = new Map();
    
    entries.forEach(entry => {
      const service = entry.service;
      if (!serviceStats.has(service)) {
        serviceStats.set(service, { total: 0, errors: 0 });
      }
      
      const stats = serviceStats.get(service)!;
      stats.total++;
      if (entry.level === 'error') {
        stats.errors++;
      }
    });
    
    serviceStats.forEach((stats, service) => {
      const errorRate = stats.errors / stats.total;
      
      if (errorRate > 0.1 && stats.total > 10) { // More than 10% error rate with significant volume
        anomalies.push({
          type: 'pattern',
          severity: errorRate > 0.3 ? 'critical' : errorRate > 0.2 ? 'high' : 'medium',
          description: `High error rate detected in ${service}: ${Math.round(errorRate * 100)}% (${stats.errors}/${stats.total})`,
          timestamp: new Date(),
          affectedEntries: stats.errors,
          context: {
            service,
            errorRate,
            totalEntries: stats.total,
            errorCount: stats.errors,
          },
        });
      }
    });
    
    return anomalies;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    entries: LogEntry[],
    patterns: LogPattern[],
    anomalies: LogAnomaly[]
  ): LogRecommendation[] {
    const recommendations: LogRecommendation[] = [];
    
    // Performance recommendations
    const slowOperations = entries.filter(e => 
      e.context.duration && typeof e.context.duration === 'number' && e.context.duration > 5000
    );
    
    if (slowOperations.length > 0) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        title: 'Slow Operations Detected',
        description: `Found ${slowOperations.length} operations taking longer than 5 seconds`,
        action: 'Investigate slow operations and optimize performance',
        impact: 'Improved user experience and system responsiveness',
      });
    }
    
    // Error recommendations
    const criticalPatterns = patterns.filter(p => p.severity === 'critical');
    if (criticalPatterns.length > 0) {
      recommendations.push({
        type: 'error',
        priority: 'critical',
        title: 'Critical Error Patterns',
        description: `Found ${criticalPatterns.length} critical error patterns requiring immediate attention`,
        action: 'Review and fix critical error patterns',
        impact: 'Reduced system errors and improved reliability',
      });
    }
    
    // Security recommendations
    const securityEvents = entries.filter(e => 
      e.message.toLowerCase().includes('unauthorized') ||
      e.message.toLowerCase().includes('forbidden') ||
      e.message.toLowerCase().includes('authentication failed')
    );
    
    if (securityEvents.length > 10) {
      recommendations.push({
        type: 'security',
        priority: 'high',
        title: 'Security Events Detected',
        description: `Found ${securityEvents.length} potential security-related events`,
        action: 'Review security events and strengthen authentication',
        impact: 'Enhanced system security and reduced breach risk',
      });
    }
    
    // Monitoring recommendations
    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical');
    if (criticalAnomalies.length > 0) {
      recommendations.push({
        type: 'monitoring',
        priority: 'high',
        title: 'Critical Anomalies Detected',
        description: `Found ${criticalAnomalies.length} critical anomalies requiring monitoring setup`,
        action: 'Set up alerts for detected anomaly patterns',
        impact: 'Proactive issue detection and faster resolution',
      });
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Analyze trends in log data
   */
  private analyzeTrends(entries: LogEntry[]): LogTrend[] {
    const trends: LogTrend[] = [];
    
    if (entries.length < 50) return trends;
    
    // Sort entries by timestamp
    const sortedEntries = entries.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    const midpoint = Math.floor(sortedEntries.length / 2);
    const firstHalf = sortedEntries.slice(0, midpoint);
    const secondHalf = sortedEntries.slice(midpoint);
    
    // Analyze error rate trend
    const firstHalfErrors = firstHalf.filter(e => e.level === 'error').length;
    const secondHalfErrors = secondHalf.filter(e => e.level === 'error').length;
    
    const firstErrorRate = firstHalfErrors / firstHalf.length;
    const secondErrorRate = secondHalfErrors / secondHalf.length;
    const errorRateChange = ((secondErrorRate - firstErrorRate) / firstErrorRate) * 100;
    
    if (Math.abs(errorRateChange) > 20) {
      trends.push({
        metric: 'Error Rate',
        direction: errorRateChange > 0 ? 'increasing' : 'decreasing',
        change: Math.abs(errorRateChange),
        timeframe: 'recent period',
        significance: Math.abs(errorRateChange) > 50 ? 'high' : 'medium',
      });
    }
    
    // Analyze volume trend
    const volumeChange = ((secondHalf.length - firstHalf.length) / firstHalf.length) * 100;
    
    if (Math.abs(volumeChange) > 30) {
      trends.push({
        metric: 'Log Volume',
        direction: volumeChange > 0 ? 'increasing' : 'decreasing',
        change: Math.abs(volumeChange),
        timeframe: 'recent period',
        significance: Math.abs(volumeChange) > 100 ? 'high' : 'medium',
      });
    }
    
    return trends;
  }

  /**
   * Debug specific issue with contextual analysis
   */
  async debugIssue(context: DebugContext): Promise<{
    relatedLogs: LogEntry[];
    correlations: LogCorrelation[];
    patterns: LogPattern[];
    timeline: Array<{
      timestamp: string;
      event: string;
      severity: LogLevel;
      context: Record<string, any>;
    }>;
    recommendations: string[];
  }> {
    const searchQuery = {
      requestId: context.requestId ? [context.requestId] : undefined,
      userId: context.userId ? [context.userId] : undefined,
      startTime: context.timeRange?.start,
      endTime: context.timeRange?.end,
      service: context.services,
      hasError: true,
      limit: 500,
    };
    
    const searchResult = await this.searchService.searchLogs(searchQuery);
    const relatedLogs = searchResult.entries;
    
    // Get correlations if request ID is provided
    const correlations: LogCorrelation[] = [];
    if (context.requestId) {
      const correlation = await this.searchService.correlateLogsByRequest(context.requestId);
      if (correlation) {
        correlations.push(correlation);
      }
    }
    
    // Detect patterns in related logs
    const patterns = await this.detectLogPatterns(relatedLogs);
    
    // Build timeline
    const timeline = relatedLogs
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map(entry => ({
        timestamp: entry.timestamp,
        event: entry.message,
        severity: entry.level,
        context: entry.context,
      }));
    
    // Generate debug recommendations
    const recommendations: string[] = [];
    
    if (relatedLogs.length === 0) {
      recommendations.push('No related logs found. Check if logging is properly configured for this component.');
    } else {
      const errorLogs = relatedLogs.filter(e => e.level === 'error');
      if (errorLogs.length > 0) {
        recommendations.push(`Found ${errorLogs.length} error logs. Review error messages and stack traces.`);
      }
      
      const criticalPatterns = patterns.filter(p => p.severity === 'critical');
      if (criticalPatterns.length > 0) {
        recommendations.push(`Found ${criticalPatterns.length} critical patterns. Focus on most frequent issues first.`);
      }
      
      if (correlations.length > 0) {
        const correlation = correlations[0];
        recommendations.push(`Request took ${correlation.duration}ms with ${correlation.errorCount} errors. Check request flow for bottlenecks.`);
      }
    }
    
    return {
      relatedLogs,
      correlations,
      patterns,
      timeline,
      recommendations,
    };
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.patternCache.clear();
    this.analysisCache.clear();
  }
}

// Export singleton instance
export const logAnalysisService = new LogAnalysisService(
  // Will be injected with search service instance
  {} as LogSearchService
);