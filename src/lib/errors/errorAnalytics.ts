/**
 * Error Analytics and Trend Reporting System
 * Provides comprehensive error analysis, pattern detection, and trend reporting
 */

import { 
  ErrorType, 
  ErrorSeverity, 
  ApiError 
} from './types';
import { ErrorLogEntry, ErrorStats } from './errorManager';

/**
 * Time period for analytics
 */
export enum TimePeriod {
  LAST_HOUR = 'last_hour',
  LAST_DAY = 'last_day',
  LAST_WEEK = 'last_week',
  LAST_MONTH = 'last_month',
  CUSTOM = 'custom'
}

/**
 * Error trend data point
 */
export interface ErrorTrendPoint {
  timestamp: string;
  count: number;
  severity: ErrorSeverity;
  type?: ErrorType;
}

/**
 * Error pattern detection result
 */
export interface ErrorPattern {
  id: string;
  pattern: string;
  description: string;
  frequency: number;
  severity: ErrorSeverity;
  firstSeen: string;
  lastSeen: string;
  affectedUsers: number;
  examples: ErrorLogEntry[];
  recommendation?: string;
}

/**
 * Error impact assessment
 */
export interface ErrorImpact {
  totalErrors: number;
  uniqueUsers: number;
  errorRate: number; // errors per minute
  uptimeImpact: number; // percentage
  severityDistribution: Record<ErrorSeverity, number>;
  typeDistribution: Record<ErrorType, number>;
  topErrors: ErrorPattern[];
  criticalErrors: ErrorLogEntry[];
}

/**
 * Error trend analysis
 */
export interface ErrorTrend {
  period: TimePeriod;
  startDate: string;
  endDate: string;
  dataPoints: ErrorTrendPoint[];
  totalErrors: number;
  averageErrorRate: number;
  peakErrorRate: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  id: string;
  name: string;
  enabled: boolean;
  conditions: AlertCondition[];
  actions: AlertAction[];
  cooldownPeriod: number; // minutes
  lastTriggered?: string;
}

/**
 * Alert condition
 */
export interface AlertCondition {
  type: 'error_rate' | 'error_count' | 'severity' | 'pattern';
  operator: 'greater_than' | 'less_than' | 'equals' | 'contains';
  value: number | string;
  timeWindow: number; // minutes
}

/**
 * Alert action
 */
export interface AlertAction {
  type: 'email' | 'webhook' | 'console' | 'notification';
  target: string;
  message?: string;
}

/**
 * Triggered alert
 */
export interface TriggeredAlert {
  alertId: string;
  alertName: string;
  triggeredAt: string;
  condition: AlertCondition;
  currentValue: number | string;
  severity: ErrorSeverity;
  affectedErrors: ErrorLogEntry[];
}

/**
 * Error Analytics Service
 * Provides comprehensive error analysis and reporting capabilities
 */
export class ErrorAnalytics {
  private errorLog: ErrorLogEntry[] = [];
  private alertConfigs: AlertConfig[] = [];
  private triggeredAlerts: TriggeredAlert[] = [];

  constructor() {
    this.initializeDefaultAlerts();
  }

  /**
   * Update error log for analysis
   */
  public updateErrorLog(errorLog: ErrorLogEntry[]): void {
    this.errorLog = [...errorLog];
  }

  /**
   * Get error trends for a specific time period
   */
  public getErrorTrends(
    period: TimePeriod, 
    startDate?: string, 
    endDate?: string
  ): ErrorTrend {
    const { start, end } = this.getDateRange(period, startDate, endDate);
    const filteredErrors = this.filterErrorsByDateRange(start, end);
    
    // Group errors by time intervals
    const intervalMinutes = this.getIntervalMinutes(period);
    const dataPoints = this.groupErrorsByInterval(filteredErrors, start, end, intervalMinutes);
    
    // Calculate trend metrics
    const totalErrors = filteredErrors.length;
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    const averageErrorRate = totalErrors / durationMinutes;
    const peakErrorRate = Math.max(...dataPoints.map(p => p.count / intervalMinutes));
    
    // Calculate trend direction
    const { trend, trendPercentage } = this.calculateTrend(dataPoints);

    return {
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      dataPoints,
      totalErrors,
      averageErrorRate,
      peakErrorRate,
      trend,
      trendPercentage
    };
  }

  /**
   * Analyze error impact
   */
  public analyzeErrorImpact(period: TimePeriod = TimePeriod.LAST_DAY): ErrorImpact {
    const { start, end } = this.getDateRange(period);
    const filteredErrors = this.filterErrorsByDateRange(start, end);
    
    // Calculate basic metrics
    const totalErrors = filteredErrors.length;
    const uniqueUsers = new Set(filteredErrors.map(e => e.userId).filter(Boolean)).size;
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    const errorRate = totalErrors / durationMinutes;
    
    // Calculate uptime impact (simplified - based on critical errors)
    const criticalErrors = filteredErrors.filter(e => e.severity === ErrorSeverity.CRITICAL);
    const uptimeImpact = Math.min((criticalErrors.length / totalErrors) * 100, 100);
    
    // Distribution analysis
    const severityDistribution = this.calculateSeverityDistribution(filteredErrors);
    const typeDistribution = this.calculateTypeDistribution(filteredErrors);
    
    // Pattern detection
    const topErrors = this.detectErrorPatterns(filteredErrors);
    
    return {
      totalErrors,
      uniqueUsers,
      errorRate,
      uptimeImpact,
      severityDistribution,
      typeDistribution,
      topErrors: topErrors.slice(0, 10),
      criticalErrors: criticalErrors.slice(0, 20)
    };
  }

  /**
   * Detect error patterns
   */
  public detectErrorPatterns(errors?: ErrorLogEntry[]): ErrorPattern[] {
    const errorsToAnalyze = errors || this.errorLog;
    const patterns: Map<string, ErrorPattern> = new Map();
    
    // Group errors by message patterns
    const messageGroups = this.groupErrorsByMessage(errorsToAnalyze);
    
    for (const [pattern, groupedErrors] of messageGroups) {
      if (groupedErrors.length < 2) continue; // Skip single occurrences
      
      const uniqueUsers = new Set(groupedErrors.map(e => e.userId).filter(Boolean)).size;
      const severity = this.calculatePatternSeverity(groupedErrors);
      const firstSeen = groupedErrors.reduce((earliest, error) => 
        error.timestamp < earliest ? error.timestamp : earliest, 
        groupedErrors[0].timestamp
      );
      const lastSeen = groupedErrors.reduce((latest, error) => 
        error.timestamp > latest ? error.timestamp : latest, 
        groupedErrors[0].timestamp
      );

      patterns.set(pattern, {
        id: this.generatePatternId(pattern),
        pattern,
        description: this.generatePatternDescription(pattern, groupedErrors),
        frequency: groupedErrors.length,
        severity,
        firstSeen,
        lastSeen,
        affectedUsers: uniqueUsers,
        examples: groupedErrors.slice(0, 5),
        recommendation: this.generateRecommendation(pattern, groupedErrors)
      });
    }
    
    // Sort by frequency and severity
    return Array.from(patterns.values())
      .sort((a, b) => {
        const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
        const aWeight = severityWeight[a.severity] * a.frequency;
        const bWeight = severityWeight[b.severity] * b.frequency;
        return bWeight - aWeight;
      });
  }

  /**
   * Check for alert conditions
   */
  public checkAlerts(): TriggeredAlert[] {
    const newAlerts: TriggeredAlert[] = [];
    const now = new Date();
    
    for (const config of this.alertConfigs) {
      if (!config.enabled) continue;
      
      // Check cooldown period
      if (config.lastTriggered) {
        const lastTriggered = new Date(config.lastTriggered);
        const cooldownEnd = new Date(lastTriggered.getTime() + config.cooldownPeriod * 60 * 1000);
        if (now < cooldownEnd) continue;
      }
      
      // Check each condition
      for (const condition of config.conditions) {
        const alert = this.evaluateAlertCondition(config, condition);
        if (alert) {
          newAlerts.push(alert);
          config.lastTriggered = now.toISOString();
          break; // Only trigger one alert per config
        }
      }
    }
    
    this.triggeredAlerts.push(...newAlerts);
    return newAlerts;
  }

  /**
   * Add alert configuration
   */
  public addAlert(config: Omit<AlertConfig, 'id'>): AlertConfig {
    const alertConfig: AlertConfig = {
      ...config,
      id: this.generateAlertId()
    };
    
    this.alertConfigs.push(alertConfig);
    return alertConfig;
  }

  /**
   * Remove alert configuration
   */
  public removeAlert(alertId: string): boolean {
    const index = this.alertConfigs.findIndex(config => config.id === alertId);
    if (index >= 0) {
      this.alertConfigs.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get alert configurations
   */
  public getAlerts(): AlertConfig[] {
    return [...this.alertConfigs];
  }

  /**
   * Get triggered alerts
   */
  public getTriggeredAlerts(limit: number = 50): TriggeredAlert[] {
    return this.triggeredAlerts
      .slice(-limit)
      .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());
  }

  /**
   * Clear triggered alerts
   */
  public clearTriggeredAlerts(): void {
    this.triggeredAlerts = [];
  }

  /**
   * Get comprehensive analytics report
   */
  public getAnalyticsReport(period: TimePeriod = TimePeriod.LAST_DAY): {
    trends: ErrorTrend;
    impact: ErrorImpact;
    patterns: ErrorPattern[];
    alerts: TriggeredAlert[];
  } {
    return {
      trends: this.getErrorTrends(period),
      impact: this.analyzeErrorImpact(period),
      patterns: this.detectErrorPatterns(),
      alerts: this.getTriggeredAlerts(10)
    };
  }

  // Private helper methods

  private initializeDefaultAlerts(): void {
    // High error rate alert
    this.addAlert({
      name: 'High Error Rate',
      enabled: true,
      conditions: [{
        type: 'error_rate',
        operator: 'greater_than',
        value: 10, // errors per minute
        timeWindow: 5
      }],
      actions: [{
        type: 'console',
        target: 'console',
        message: 'High error rate detected'
      }],
      cooldownPeriod: 15
    });

    // Critical error alert
    this.addAlert({
      name: 'Critical Error',
      enabled: true,
      conditions: [{
        type: 'severity',
        operator: 'equals',
        value: ErrorSeverity.CRITICAL,
        timeWindow: 1
      }],
      actions: [{
        type: 'console',
        target: 'console',
        message: 'Critical error detected'
      }],
      cooldownPeriod: 5
    });
  }

  private getDateRange(
    period: TimePeriod, 
    startDate?: string, 
    endDate?: string
  ): { start: Date; end: Date } {
    const end = endDate ? new Date(endDate) : new Date();
    let start: Date;

    switch (period) {
      case TimePeriod.LAST_HOUR:
        start = new Date(end.getTime() - 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_DAY:
        start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_WEEK:
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.LAST_MONTH:
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case TimePeriod.CUSTOM:
        start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    }

    return { start, end };
  }

  private getIntervalMinutes(period: TimePeriod): number {
    switch (period) {
      case TimePeriod.LAST_HOUR:
        return 5; // 5-minute intervals
      case TimePeriod.LAST_DAY:
        return 60; // 1-hour intervals
      case TimePeriod.LAST_WEEK:
        return 360; // 6-hour intervals
      case TimePeriod.LAST_MONTH:
        return 1440; // 1-day intervals
      default:
        return 60;
    }
  }

  private filterErrorsByDateRange(start: Date, end: Date): ErrorLogEntry[] {
    return this.errorLog.filter(error => {
      const errorDate = new Date(error.timestamp);
      return errorDate >= start && errorDate <= end;
    });
  }

  private groupErrorsByInterval(
    errors: ErrorLogEntry[], 
    start: Date, 
    end: Date, 
    intervalMinutes: number
  ): ErrorTrendPoint[] {
    const dataPoints: ErrorTrendPoint[] = [];
    const intervalMs = intervalMinutes * 60 * 1000;
    
    for (let time = start.getTime(); time < end.getTime(); time += intervalMs) {
      const intervalStart = new Date(time);
      const intervalEnd = new Date(time + intervalMs);
      
      const intervalErrors = errors.filter(error => {
        const errorDate = new Date(error.timestamp);
        return errorDate >= intervalStart && errorDate < intervalEnd;
      });
      
      dataPoints.push({
        timestamp: intervalStart.toISOString(),
        count: intervalErrors.length,
        severity: this.calculateIntervalSeverity(intervalErrors)
      });
    }
    
    return dataPoints;
  }

  private calculateIntervalSeverity(errors: ErrorLogEntry[]): ErrorSeverity {
    if (errors.some(e => e.severity === ErrorSeverity.CRITICAL)) return ErrorSeverity.CRITICAL;
    if (errors.some(e => e.severity === ErrorSeverity.HIGH)) return ErrorSeverity.HIGH;
    if (errors.some(e => e.severity === ErrorSeverity.MEDIUM)) return ErrorSeverity.MEDIUM;
    return ErrorSeverity.LOW;
  }

  private calculateTrend(dataPoints: ErrorTrendPoint[]): { trend: 'increasing' | 'decreasing' | 'stable'; trendPercentage: number } {
    if (dataPoints.length < 2) {
      return { trend: 'stable', trendPercentage: 0 };
    }

    const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
    const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((sum, p) => sum + p.count, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, p) => sum + p.count, 0) / secondHalf.length;
    
    const change = secondHalfAvg - firstHalfAvg;
    const changePercentage = firstHalfAvg > 0 ? (change / firstHalfAvg) * 100 : 0;
    
    if (Math.abs(changePercentage) < 10) {
      return { trend: 'stable', trendPercentage: changePercentage };
    }
    
    return {
      trend: changePercentage > 0 ? 'increasing' : 'decreasing',
      trendPercentage: Math.abs(changePercentage)
    };
  }

  private calculateSeverityDistribution(errors: ErrorLogEntry[]): Record<ErrorSeverity, number> {
    const distribution: Record<ErrorSeverity, number> = {
      [ErrorSeverity.LOW]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.CRITICAL]: 0
    };

    for (const error of errors) {
      distribution[error.severity]++;
    }

    return distribution;
  }

  private calculateTypeDistribution(errors: ErrorLogEntry[]): Record<ErrorType, number> {
    const distribution: Record<ErrorType, number> = {} as Record<ErrorType, number>;

    for (const error of errors) {
      distribution[error.type] = (distribution[error.type] || 0) + 1;
    }

    return distribution;
  }

  private groupErrorsByMessage(errors: ErrorLogEntry[]): Map<string, ErrorLogEntry[]> {
    const groups = new Map<string, ErrorLogEntry[]>();
    
    for (const error of errors) {
      // Normalize error message to detect patterns
      const pattern = this.normalizeErrorMessage(error.message);
      
      if (!groups.has(pattern)) {
        groups.set(pattern, []);
      }
      groups.get(pattern)!.push(error);
    }
    
    return groups;
  }

  private normalizeErrorMessage(message: string): string {
    // Remove specific IDs, numbers, and timestamps to identify patterns
    return message
      .replace(/\b\d+\b/g, 'NUMBER')
      .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, 'UUID')
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\b/g, 'TIMESTAMP')
      .replace(/https?:\/\/[^\s]+/g, 'URL')
      .toLowerCase()
      .trim();
  }

  private calculatePatternSeverity(errors: ErrorLogEntry[]): ErrorSeverity {
    const severityCounts = this.calculateSeverityDistribution(errors);
    
    if (severityCounts[ErrorSeverity.CRITICAL] > 0) return ErrorSeverity.CRITICAL;
    if (severityCounts[ErrorSeverity.HIGH] > errors.length * 0.5) return ErrorSeverity.HIGH;
    if (severityCounts[ErrorSeverity.MEDIUM] > errors.length * 0.7) return ErrorSeverity.MEDIUM;
    return ErrorSeverity.LOW;
  }

  private generatePatternId(pattern: string): string {
    return `pattern_${pattern.replace(/\s+/g, '_').substring(0, 20)}_${Date.now()}`;
  }

  private generatePatternDescription(pattern: string, errors: ErrorLogEntry[]): string {
    const errorType = errors[0].type;
    const frequency = errors.length;
    const timeSpan = this.calculateTimeSpan(errors);
    
    return `${errorType} error occurring ${frequency} times over ${timeSpan}`;
  }

  private generateRecommendation(pattern: string, errors: ErrorLogEntry[]): string {
    const errorType = errors[0].type;
    
    switch (errorType) {
      case ErrorType.NETWORK:
        return 'Check network connectivity and implement retry mechanisms';
      case ErrorType.AUTHENTICATION:
        return 'Review authentication flow and token refresh logic';
      case ErrorType.VALIDATION:
        return 'Improve input validation and user guidance';
      case ErrorType.SERVER:
        return 'Investigate server performance and error handling';
      default:
        return 'Review error logs and implement appropriate error handling';
    }
  }

  private calculateTimeSpan(errors: ErrorLogEntry[]): string {
    if (errors.length < 2) return 'single occurrence';
    
    const timestamps = errors.map(e => new Date(e.timestamp).getTime());
    const span = Math.max(...timestamps) - Math.min(...timestamps);
    
    const minutes = span / (1000 * 60);
    if (minutes < 60) return `${Math.round(minutes)} minutes`;
    
    const hours = minutes / 60;
    if (hours < 24) return `${Math.round(hours)} hours`;
    
    const days = hours / 24;
    return `${Math.round(days)} days`;
  }

  private evaluateAlertCondition(config: AlertConfig, condition: AlertCondition): TriggeredAlert | null {
    const timeWindow = new Date(Date.now() - condition.timeWindow * 60 * 1000);
    const recentErrors = this.errorLog.filter(error => 
      new Date(error.timestamp) > timeWindow
    );
    
    let currentValue: number | string;
    let shouldTrigger = false;
    
    switch (condition.type) {
      case 'error_rate':
        currentValue = recentErrors.length / condition.timeWindow;
        shouldTrigger = this.compareValues(currentValue, condition.operator, condition.value as number);
        break;
        
      case 'error_count':
        currentValue = recentErrors.length;
        shouldTrigger = this.compareValues(currentValue, condition.operator, condition.value as number);
        break;
        
      case 'severity':
        const severityErrors = recentErrors.filter(e => e.severity === condition.value);
        currentValue = severityErrors.length;
        shouldTrigger = currentValue > 0;
        break;
        
      case 'pattern':
        const patternErrors = recentErrors.filter(e => 
          e.message.toLowerCase().includes((condition.value as string).toLowerCase())
        );
        currentValue = patternErrors.length;
        shouldTrigger = currentValue > 0;
        break;
        
      default:
        return null;
    }
    
    if (!shouldTrigger) return null;
    
    return {
      alertId: config.id,
      alertName: config.name,
      triggeredAt: new Date().toISOString(),
      condition,
      currentValue,
      severity: this.calculateAlertSeverity(recentErrors),
      affectedErrors: recentErrors.slice(0, 10)
    };
  }

  private compareValues(current: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'greater_than':
        return current > threshold;
      case 'less_than':
        return current < threshold;
      case 'equals':
        return current === threshold;
      default:
        return false;
    }
  }

  private calculateAlertSeverity(errors: ErrorLogEntry[]): ErrorSeverity {
    if (errors.some(e => e.severity === ErrorSeverity.CRITICAL)) return ErrorSeverity.CRITICAL;
    if (errors.some(e => e.severity === ErrorSeverity.HIGH)) return ErrorSeverity.HIGH;
    if (errors.some(e => e.severity === ErrorSeverity.MEDIUM)) return ErrorSeverity.MEDIUM;
    return ErrorSeverity.LOW;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const errorAnalytics = new ErrorAnalytics();