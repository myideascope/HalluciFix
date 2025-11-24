/**
 * Automated Log Analysis Service
 * Provides automated pattern detection, anomaly identification, and insights
 */

import { LogEntry, LogLevel } from './types';
import { LogSearchService, LogPattern } from './logSearchService';
import { LogAnalysisService, LogAnomaly, LogRecommendation } from './logAnalysisService';

import { logger } from './index';
export interface AutomatedInsight {
  id: string;
  type: 'pattern' | 'anomaly' | 'trend' | 'performance' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  detectedAt: Date;
  affectedPeriod: {
    start: Date;
    end: Date;
  };
  metrics: Record<string, number>;
  recommendations: string[];
  relatedLogs: LogEntry[];
  confidence: number; // 0-100
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: AlertCondition[];
  actions: AlertAction[];
  cooldownMinutes: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AlertCondition {
  type: 'error_rate' | 'log_volume' | 'pattern_frequency' | 'response_time' | 'custom';
  operator: 'gt' | 'lt' | 'eq' | 'contains' | 'regex';
  threshold: number | string;
  timeWindow: number; // minutes
  field?: string;
}

export interface AlertAction {
  type: 'log' | 'webhook' | 'email';
  config: Record<string, any>;
}

export interface AnalysisSchedule {
  interval: number; // minutes
  enabled: boolean;
  analysisTypes: ('patterns' | 'anomalies' | 'trends' | 'performance')[];
  retentionDays: number;
}

/**
 * Automated Analysis Service Implementation
 */
export class AutomatedAnalysisService {
  private searchService: LogSearchService;
  private analysisService: LogAnalysisService;
  private insights: Map<string, AutomatedInsight> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private analysisInterval: NodeJS.Timeout | null = null;
  private lastAnalysisTime: Date = new Date();
  private schedule: AnalysisSchedule = {
    interval: 15, // 15 minutes
    enabled: true,
    analysisTypes: ['patterns', 'anomalies', 'trends', 'performance'],
    retentionDays: 30,
  };

  constructor(searchService: LogSearchService, analysisService: LogAnalysisService) {
    this.searchService = searchService;
    this.analysisService = analysisService;
    this.initializeDefaultAlertRules();
    this.startAutomatedAnalysis();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlertRules(): void {
    // High error rate alert
    this.addAlertRule({
      id: 'high-error-rate',
      name: 'High Error Rate',
      description: 'Alert when error rate exceeds 5% in 10 minutes',
      enabled: true,
      conditions: [{
        type: 'error_rate',
        operator: 'gt',
        threshold: 5,
        timeWindow: 10,
      }],
      actions: [{
        type: 'log',
        config: { level: 'error' },
      }],
      cooldownMinutes: 30,
      severity: 'high',
    });

    // Log volume spike alert
    this.addAlertRule({
      id: 'log-volume-spike',
      name: 'Log Volume Spike',
      description: 'Alert when log volume increases by 300% in 5 minutes',
      enabled: true,
      conditions: [{
        type: 'log_volume',
        operator: 'gt',
        threshold: 300,
        timeWindow: 5,
      }],
      actions: [{
        type: 'log',
        config: { level: 'warn' },
      }],
      cooldownMinutes: 15,
      severity: 'medium',
    });
  }  /**
   * 
Start automated analysis process
   */
  private startAutomatedAnalysis(): void {
    if (!this.schedule.enabled) return;

    this.analysisInterval = setInterval(async () => {
      try {
        await this.performAutomatedAnalysis();
      } catch (error) {
        logger.error("Automated analysis failed:", error instanceof Error ? error : new Error(String(error)));
      }
    }, this.schedule.interval * 60 * 1000);
  }

  /**
   * Perform automated analysis
   */
  private async performAutomatedAnalysis(): Promise<void> {
    const now = new Date();
    const analysisStart = new Date(this.lastAnalysisTime.getTime());
    
    // Analyze logs from last analysis time to now
    const analysisResult = await this.analysisService.analyzeLogsPeriod(
      analysisStart,
      now
    );

    // Generate insights from analysis
    const newInsights = await this.generateInsights(analysisResult, analysisStart, now);
    
    // Store insights
    newInsights.forEach(insight => {
      this.insights.set(insight.id, insight);
    });

    // Check alert rules
    await this.checkAlertRules(analysisStart, now);

    // Clean up old insights
    this.cleanupOldInsights();

    this.lastAnalysisTime = now;
  }

  /**
   * Generate insights from analysis results
   */
  private async generateInsights(
    analysisResult: any,
    startTime: Date,
    endTime: Date
  ): Promise<AutomatedInsight[]> {
    const insights: AutomatedInsight[] = [];

    // Pattern insights
    if (this.schedule.analysisTypes.includes('patterns')) {
      const patternInsights = this.generatePatternInsights(
        analysisResult.patterns,
        startTime,
        endTime
      );
      insights.push(...patternInsights);
    }

    // Anomaly insights
    if (this.schedule.analysisTypes.includes('anomalies')) {
      const anomalyInsights = this.generateAnomalyInsights(
        analysisResult.anomalies,
        startTime,
        endTime
      );
      insights.push(...anomalyInsights);
    }

    // Performance insights
    if (this.schedule.analysisTypes.includes('performance')) {
      const performanceInsights = await this.generatePerformanceInsights(
        startTime,
        endTime
      );
      insights.push(...performanceInsights);
    }

    return insights;
  }

  /**
   * Generate insights from detected patterns
   */
  private generatePatternInsights(
    patterns: LogPattern[],
    startTime: Date,
    endTime: Date
  ): AutomatedInsight[] {
    const insights: AutomatedInsight[] = [];

    patterns.forEach(pattern => {
      if (pattern.severity === 'critical' || pattern.severity === 'high') {
        const insight: AutomatedInsight = {
          id: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'pattern',
          severity: pattern.severity,
          title: `Critical Pattern Detected: ${pattern.pattern}`,
          description: `Pattern "${pattern.pattern}" occurred ${pattern.count} times, indicating potential system issues`,
          detectedAt: new Date(),
          affectedPeriod: { start: startTime, end: endTime },
          metrics: {
            occurrences: pattern.count,
            timeSpan: endTime.getTime() - startTime.getTime(),
          },
          recommendations: [
            'Investigate the root cause of this recurring pattern',
            'Consider implementing preventive measures',
            'Monitor for pattern escalation',
          ],
          relatedLogs: pattern.examples,
          confidence: this.calculatePatternConfidence(pattern),
        };

        insights.push(insight);
      }
    });

    return insights;
  }

  /**
   * Generate insights from detected anomalies
   */
  private generateAnomalyInsights(
    anomalies: LogAnomaly[],
    startTime: Date,
    endTime: Date
  ): AutomatedInsight[] {
    const insights: AutomatedInsight[] = [];

    anomalies.forEach(anomaly => {
      const insight: AutomatedInsight = {
        id: `anomaly-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'anomaly',
        severity: anomaly.severity,
        title: `Anomaly Detected: ${anomaly.type}`,
        description: anomaly.description,
        detectedAt: new Date(),
        affectedPeriod: { start: startTime, end: endTime },
        metrics: {
          affectedEntries: anomaly.affectedEntries,
          ...anomaly.context,
        },
        recommendations: this.getAnomalyRecommendations(anomaly),
        relatedLogs: [],
        confidence: this.calculateAnomalyConfidence(anomaly),
      };

      insights.push(insight);
    });

    return insights;
  }

  /**
   * Generate performance insights
   */
  private async generatePerformanceInsights(
    startTime: Date,
    endTime: Date
  ): Promise<AutomatedInsight[]> {
    const insights: AutomatedInsight[] = [];

    // Get performance-related logs
    const performanceLogs = await this.searchService.searchLogs({
      startTime,
      endTime,
      contextFilters: { duration: { $exists: true } },
      limit: 1000,
    });

    if (performanceLogs.entries.length === 0) return insights;

    // Analyze response times
    const durations = performanceLogs.entries
      .map(e => e.context.duration)
      .filter(d => typeof d === 'number') as number[];

    if (durations.length > 0) {
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const slowRequests = durations.filter(d => d > 5000).length;

      if (slowRequests > durations.length * 0.1) { // More than 10% slow requests
        insights.push({
          id: `performance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'performance',
          severity: slowRequests > durations.length * 0.3 ? 'high' : 'medium',
          title: 'Performance Degradation Detected',
          description: `${slowRequests} out of ${durations.length} requests (${Math.round((slowRequests / durations.length) * 100)}%) took longer than 5 seconds`,
          detectedAt: new Date(),
          affectedPeriod: { start: startTime, end: endTime },
          metrics: {
            averageResponseTime: Math.round(avgDuration),
            slowRequestCount: slowRequests,
            totalRequests: durations.length,
            slowRequestPercentage: Math.round((slowRequests / durations.length) * 100),
          },
          recommendations: [
            'Investigate slow database queries',
            'Check external API response times',
            'Review application performance bottlenecks',
            'Consider implementing caching strategies',
          ],
          relatedLogs: performanceLogs.entries.filter(e => 
            typeof e.context.duration === 'number' && e.context.duration > 5000
          ).slice(0, 5),
          confidence: 85,
        });
      }
    }

    return insights;
  }

  /**
   * Check alert rules against recent logs
   */
  private async checkAlertRules(startTime: Date, endTime: Date): Promise<void> {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      try {
        const shouldAlert = await this.evaluateAlertRule(rule, startTime, endTime);
        if (shouldAlert) {
          await this.triggerAlert(rule, startTime, endTime);
        }
      } catch (error) {
        console.error(`Failed to evaluate alert rule ${rule.id}:`, error);
      }
    }
  }

  /**
   * Evaluate if alert rule conditions are met
   */
  private async evaluateAlertRule(
    rule: AlertRule,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    for (const condition of rule.conditions) {
      const conditionMet = await this.evaluateCondition(condition, startTime, endTime);
      if (!conditionMet) {
        return false; // All conditions must be met
      }
    }
    return true;
  }

  /**
   * Evaluate individual alert condition
   */
  private async evaluateCondition(
    condition: AlertCondition,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    const windowStart = new Date(endTime.getTime() - condition.timeWindow * 60 * 1000);
    
    switch (condition.type) {
      case 'error_rate':
        return await this.checkErrorRate(condition, windowStart, endTime);
      
      case 'log_volume':
        return await this.checkLogVolume(condition, windowStart, endTime);
      
      case 'pattern_frequency':
        return await this.checkPatternFrequency(condition, windowStart, endTime);
      
      case 'response_time':
        return await this.checkResponseTime(condition, windowStart, endTime);
      
      default:
        return false;
    }
  }

  /**
   * Check error rate condition
   */
  private async checkErrorRate(
    condition: AlertCondition,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    const logs = await this.searchService.searchLogs({
      startTime,
      endTime,
      limit: 10000,
    });

    if (logs.entries.length === 0) return false;

    const errorCount = logs.entries.filter(e => e.level === 'error').length;
    const errorRate = (errorCount / logs.entries.length) * 100;

    return this.compareValues(errorRate, condition.operator, condition.threshold as number);
  }

  /**
   * Check log volume condition
   */
  private async checkLogVolume(
    condition: AlertCondition,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    const currentLogs = await this.searchService.searchLogs({
      startTime,
      endTime,
      limit: 10000,
    });

    // Compare with previous period
    const previousStart = new Date(startTime.getTime() - (endTime.getTime() - startTime.getTime()));
    const previousLogs = await this.searchService.searchLogs({
      startTime: previousStart,
      endTime: startTime,
      limit: 10000,
    });

    if (previousLogs.entries.length === 0) return false;

    const currentVolume = currentLogs.entries.length;
    const previousVolume = previousLogs.entries.length;
    const volumeIncrease = ((currentVolume - previousVolume) / previousVolume) * 100;

    return this.compareValues(volumeIncrease, condition.operator, condition.threshold as number);
  }

  /**
   * Compare values based on operator
   */
  private compareValues(actual: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return actual > threshold;
      case 'lt': return actual < threshold;
      case 'eq': return actual === threshold;
      default: return false;
    }
  }

  /**
   * Trigger alert actions
   */
  private async triggerAlert(rule: AlertRule, startTime: Date, endTime: Date): Promise<void> {
    for (const action of rule.actions) {
      try {
        await this.executeAlertAction(action, rule, startTime, endTime);
      } catch (error) {
        console.error(`Failed to execute alert action:`, error);
      }
    }
  }

  /**
   * Execute alert action
   */
  private async executeAlertAction(
    action: AlertAction,
    rule: AlertRule,
    startTime: Date,
    endTime: Date
  ): Promise<void> {
    switch (action.type) {
      case 'log':
        console.log(`ALERT: ${rule.name} - ${rule.description}`);
        break;
      
      case 'webhook':
        if (action.config.url) {
          await fetch(action.config.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rule: rule.name,
              description: rule.description,
              severity: rule.severity,
              timestamp: new Date().toISOString(),
              period: { start: startTime.toISOString(), end: endTime.toISOString() },
            }),
          });
        }
        break;
    }
  }

  /**
   * Calculate pattern confidence score
   */
  private calculatePatternConfidence(pattern: LogPattern): number {
    let confidence = 50; // Base confidence
    
    // Higher frequency increases confidence
    if (pattern.count > 10) confidence += 20;
    if (pattern.count > 50) confidence += 20;
    
    // Severity increases confidence
    if (pattern.severity === 'high') confidence += 10;
    if (pattern.severity === 'critical') confidence += 20;
    
    return Math.min(confidence, 100);
  }

  /**
   * Calculate anomaly confidence score
   */
  private calculateAnomalyConfidence(anomaly: LogAnomaly): number {
    let confidence = 60; // Base confidence for anomalies
    
    // Severity increases confidence
    if (anomaly.severity === 'high') confidence += 15;
    if (anomaly.severity === 'critical') confidence += 25;
    
    // More affected entries increase confidence
    if (anomaly.affectedEntries > 10) confidence += 10;
    if (anomaly.affectedEntries > 100) confidence += 15;
    
    return Math.min(confidence, 100);
  }

  /**
   * Get recommendations for anomaly types
   */
  private getAnomalyRecommendations(anomaly: LogAnomaly): string[] {
    switch (anomaly.type) {
      case 'error_burst':
        return [
          'Investigate the root cause of the error burst',
          'Check if recent deployments introduced issues',
          'Review system resources and capacity',
        ];
      
      case 'spike':
        return [
          'Monitor system resources during high load',
          'Consider implementing rate limiting',
          'Review scaling policies',
        ];
      
      case 'pattern':
        return [
          'Analyze the detected pattern for system issues',
          'Implement monitoring for this pattern',
          'Consider preventive measures',
        ];
      
      default:
        return ['Investigate the anomaly and implement appropriate measures'];
    }
  }

  /**
   * Clean up old insights based on retention policy
   */
  private cleanupOldInsights(): void {
    const cutoffDate = new Date(Date.now() - this.schedule.retentionDays * 24 * 60 * 60 * 1000);
    
    for (const [id, insight] of this.insights.entries()) {
      if (insight.detectedAt < cutoffDate) {
        this.insights.delete(id);
      }
    }
  }

  // Public API methods

  /**
   * Add alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
  }

  /**
   * Get all insights
   */
  getInsights(
    type?: AutomatedInsight['type'],
    severity?: AutomatedInsight['severity']
  ): AutomatedInsight[] {
    let insights = Array.from(this.insights.values());
    
    if (type) {
      insights = insights.filter(i => i.type === type);
    }
    
    if (severity) {
      insights = insights.filter(i => i.severity === severity);
    }
    
    return insights.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  }

  /**
   * Get alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Update analysis schedule
   */
  updateSchedule(schedule: Partial<AnalysisSchedule>): void {
    this.schedule = { ...this.schedule, ...schedule };
    
    // Restart analysis with new schedule
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
    }
    
    if (this.schedule.enabled) {
      this.startAutomatedAnalysis();
    }
  }

  /**
   * Manually trigger analysis
   */
  async triggerAnalysis(): Promise<AutomatedInsight[]> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const analysisResult = await this.analysisService.analyzeLogsPeriod(oneHourAgo, now);
    const insights = await this.generateInsights(analysisResult, oneHourAgo, now);
    
    insights.forEach(insight => {
      this.insights.set(insight.id, insight);
    });
    
    return insights;
  }

  /**
   * Stop automated analysis
   */
  stop(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  // Placeholder methods for missing condition checks
  private async checkPatternFrequency(condition: AlertCondition, startTime: Date, endTime: Date): Promise<boolean> {
    // Implementation would check for specific pattern frequency
    return false;
  }

  private async checkResponseTime(condition: AlertCondition, startTime: Date, endTime: Date): Promise<boolean> {
    // Implementation would check average response times
    return false;
  }
}

// Export singleton instance (will be properly initialized with dependencies)
export const automatedAnalysisService = new AutomatedAnalysisService(
  {} as LogSearchService,
  {} as LogAnalysisService
);