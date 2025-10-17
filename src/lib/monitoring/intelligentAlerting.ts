/**
 * Intelligent Alerting and Noise Reduction System
 * Advanced alert correlation, grouping, and noise reduction to prevent alert fatigue
 */

import type { Alert, AlertSeverity } from './alertManager';

export interface AlertCorrelation {
  id: string;
  alerts: Alert[];
  pattern: AlertPattern;
  confidence: number;
  createdAt: Date;
  lastUpdated: Date;
}

export interface AlertPattern {
  type: 'temporal' | 'service' | 'severity' | 'tag-based' | 'cascade';
  description: string;
  criteria: Record<string, any>;
}

export interface NoiseReductionConfig {
  correlationWindowMs: number;
  minCorrelationConfidence: number;
  maxAlertsPerGroup: number;
  suppressDuplicatesMs: number;
  enableSmartGrouping: boolean;
  enableCascadeDetection: boolean;
  businessImpactWeights: Record<string, number>;
}

export interface AlertPriority {
  score: number;
  factors: {
    severity: number;
    businessImpact: number;
    frequency: number;
    correlation: number;
    userImpact: number;
  };
  reasoning: string[];
}

/**
 * Intelligent Alerting System with Noise Reduction
 */
export class IntelligentAlertingSystem {
  private correlations: Map<string, AlertCorrelation> = new Map();
  private alertHistory: Alert[] = [];
  private suppressedAlerts: Set<string> = new Set();
  private config: NoiseReductionConfig;
  private businessImpactRules: Map<string, number> = new Map();

  constructor(config: Partial<NoiseReductionConfig> = {}) {
    this.config = {
      correlationWindowMs: 10 * 60 * 1000, // 10 minutes
      minCorrelationConfidence: 0.7,
      maxAlertsPerGroup: 50,
      suppressDuplicatesMs: 5 * 60 * 1000, // 5 minutes
      enableSmartGrouping: true,
      enableCascadeDetection: true,
      businessImpactWeights: {
        'user-facing': 1.0,
        'payment': 0.9,
        'auth': 0.8,
        'analytics': 0.3,
        'monitoring': 0.2
      },
      ...config
    };

    this.initializeBusinessImpactRules();
  }

  /**
   * Process incoming alert with intelligent filtering and correlation
   */
  async processAlert(alert: Alert): Promise<{
    shouldNotify: boolean;
    correlationId?: string;
    priority: AlertPriority;
    suppressionReason?: string;
  }> {
    // Add to history
    this.alertHistory.push(alert);
    this.cleanupOldHistory();

    // Check for duplicate suppression
    const duplicateCheck = this.checkDuplicateSuppression(alert);
    if (duplicateCheck.isDuplicate) {
      return {
        shouldNotify: false,
        priority: this.calculateAlertPriority(alert),
        suppressionReason: duplicateCheck.reason
      };
    }

    // Calculate alert priority
    const priority = this.calculateAlertPriority(alert);

    // Check for correlations
    const correlation = await this.findOrCreateCorrelation(alert);

    // Determine if we should notify based on correlation and priority
    const shouldNotify = this.shouldNotifyForAlert(alert, correlation, priority);

    return {
      shouldNotify,
      correlationId: correlation?.id,
      priority,
      suppressionReason: shouldNotify ? undefined : 'Correlated with existing alert group'
    };
  }

  /**
   * Check for duplicate alert suppression
   */
  private checkDuplicateSuppression(alert: Alert): { isDuplicate: boolean; reason?: string } {
    const recentAlerts = this.alertHistory.filter(a => 
      Date.now() - a.timestamp.getTime() < this.config.suppressDuplicatesMs
    );

    // Check for exact duplicates
    const exactDuplicate = recentAlerts.find(a => 
      a.ruleId === alert.ruleId &&
      a.message === alert.message &&
      JSON.stringify(a.tags) === JSON.stringify(alert.tags)
    );

    if (exactDuplicate) {
      return { 
        isDuplicate: true, 
        reason: `Duplicate of alert ${exactDuplicate.id} from ${exactDuplicate.timestamp.toISOString()}` 
      };
    }

    // Check for similar alerts (same rule, similar tags)
    const similarAlert = recentAlerts.find(a => 
      a.ruleId === alert.ruleId &&
      this.calculateTagSimilarity(a.tags, alert.tags) > 0.8
    );

    if (similarAlert) {
      return { 
        isDuplicate: true, 
        reason: `Similar to alert ${similarAlert.id} (${Math.round(this.calculateTagSimilarity(similarAlert.tags, alert.tags) * 100)}% similarity)` 
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Calculate tag similarity between two alerts
   */
  private calculateTagSimilarity(tags1: Record<string, string>, tags2: Record<string, string>): number {
    const keys1 = Object.keys(tags1);
    const keys2 = Object.keys(tags2);
    const allKeys = new Set([...keys1, ...keys2]);

    if (allKeys.size === 0) return 1.0;

    let matches = 0;
    for (const key of allKeys) {
      if (tags1[key] === tags2[key]) {
        matches++;
      }
    }

    return matches / allKeys.size;
  }

  /**
   * Find or create alert correlation
   */
  private async findOrCreateCorrelation(alert: Alert): Promise<AlertCorrelation | null> {
    if (!this.config.enableSmartGrouping) {
      return null;
    }

    // Look for existing correlations
    for (const correlation of this.correlations.values()) {
      if (this.shouldAddToCorrelation(alert, correlation)) {
        correlation.alerts.push(alert);
        correlation.lastUpdated = new Date();
        correlation.confidence = this.calculateCorrelationConfidence(correlation);
        return correlation;
      }
    }

    // Check if we should create a new correlation
    const pattern = this.detectAlertPattern(alert);
    if (pattern && this.shouldCreateCorrelation(alert, pattern)) {
      const correlation: AlertCorrelation = {
        id: this.generateCorrelationId(),
        alerts: [alert],
        pattern,
        confidence: 1.0,
        createdAt: new Date(),
        lastUpdated: new Date()
      };

      this.correlations.set(correlation.id, correlation);
      return correlation;
    }

    return null;
  }

  /**
   * Detect alert patterns
   */
  private detectAlertPattern(alert: Alert): AlertPattern | null {
    const recentAlerts = this.getRecentAlerts();

    // Temporal pattern detection
    const temporalPattern = this.detectTemporalPattern(alert, recentAlerts);
    if (temporalPattern) return temporalPattern;

    // Service-based pattern detection
    const servicePattern = this.detectServicePattern(alert, recentAlerts);
    if (servicePattern) return servicePattern;

    // Cascade pattern detection
    if (this.config.enableCascadeDetection) {
      const cascadePattern = this.detectCascadePattern(alert, recentAlerts);
      if (cascadePattern) return cascadePattern;
    }

    return null;
  }

  /**
   * Detect temporal patterns (alerts happening in quick succession)
   */
  private detectTemporalPattern(alert: Alert, recentAlerts: Alert[]): AlertPattern | null {
    const timeWindow = 2 * 60 * 1000; // 2 minutes
    const minAlerts = 3;

    const relatedAlerts = recentAlerts.filter(a => 
      Math.abs(a.timestamp.getTime() - alert.timestamp.getTime()) < timeWindow &&
      (a.ruleId === alert.ruleId || this.calculateTagSimilarity(a.tags, alert.tags) > 0.6)
    );

    if (relatedAlerts.length >= minAlerts) {
      return {
        type: 'temporal',
        description: `Burst of ${relatedAlerts.length} similar alerts within ${timeWindow / 1000} seconds`,
        criteria: {
          timeWindow,
          minAlerts,
          ruleId: alert.ruleId
        }
      };
    }

    return null;
  }

  /**
   * Detect service-based patterns (alerts from same service/component)
   */
  private detectServicePattern(alert: Alert, recentAlerts: Alert[]): AlertPattern | null {
    const service = alert.tags.service;
    if (!service) return null;

    const serviceAlerts = recentAlerts.filter(a => 
      a.tags.service === service && a.id !== alert.id
    );

    if (serviceAlerts.length >= 2) {
      return {
        type: 'service',
        description: `Multiple alerts from service: ${service}`,
        criteria: {
          service,
          minAlerts: 2
        }
      };
    }

    return null;
  }

  /**
   * Detect cascade patterns (one failure causing others)
   */
  private detectCascadePattern(alert: Alert, recentAlerts: Alert[]): AlertPattern | null {
    const cascadeWindow = 5 * 60 * 1000; // 5 minutes
    
    // Look for a critical alert followed by related alerts
    const criticalAlerts = recentAlerts.filter(a => 
      a.severity === 'critical' &&
      alert.timestamp.getTime() - a.timestamp.getTime() < cascadeWindow &&
      alert.timestamp.getTime() > a.timestamp.getTime()
    );

    if (criticalAlerts.length > 0) {
      const rootCause = criticalAlerts[0];
      const hasServiceRelation = alert.tags.service === rootCause.tags.service ||
                                alert.tags.component === rootCause.tags.component;

      if (hasServiceRelation) {
        return {
          type: 'cascade',
          description: `Cascade failure from critical alert: ${rootCause.title}`,
          criteria: {
            rootCauseId: rootCause.id,
            cascadeWindow,
            service: rootCause.tags.service
          }
        };
      }
    }

    return null;
  }

  /**
   * Calculate alert priority based on multiple factors
   */
  private calculateAlertPriority(alert: Alert): AlertPriority {
    const factors = {
      severity: this.calculateSeverityScore(alert.severity),
      businessImpact: this.calculateBusinessImpactScore(alert),
      frequency: this.calculateFrequencyScore(alert),
      correlation: this.calculateCorrelationScore(alert),
      userImpact: this.calculateUserImpactScore(alert)
    };

    const score = (
      factors.severity * 0.3 +
      factors.businessImpact * 0.25 +
      factors.frequency * 0.2 +
      factors.correlation * 0.15 +
      factors.userImpact * 0.1
    );

    const reasoning = this.generatePriorityReasoning(factors);

    return { score, factors, reasoning };
  }

  /**
   * Calculate severity score
   */
  private calculateSeverityScore(severity: AlertSeverity): number {
    const scores = {
      info: 0.25,
      warning: 0.5,
      error: 0.75,
      critical: 1.0
    };
    return scores[severity] || 0.25;
  }

  /**
   * Calculate business impact score
   */
  private calculateBusinessImpactScore(alert: Alert): number {
    let score = 0.5; // Default score

    // Check tags for business impact indicators
    for (const [tag, value] of Object.entries(alert.tags)) {
      const weight = this.config.businessImpactWeights[tag] || 
                    this.config.businessImpactWeights[value] || 0;
      score = Math.max(score, weight);
    }

    // Check rule-based business impact
    const ruleImpact = this.businessImpactRules.get(alert.ruleId);
    if (ruleImpact) {
      score = Math.max(score, ruleImpact);
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate frequency score (how often this type of alert occurs)
   */
  private calculateFrequencyScore(alert: Alert): number {
    const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
    const recentSimilarAlerts = this.alertHistory.filter(a => 
      Date.now() - a.timestamp.getTime() < timeWindow &&
      a.ruleId === alert.ruleId
    );

    // More frequent alerts get lower priority (alert fatigue prevention)
    const frequency = recentSimilarAlerts.length;
    if (frequency <= 1) return 1.0;
    if (frequency <= 5) return 0.8;
    if (frequency <= 10) return 0.6;
    if (frequency <= 20) return 0.4;
    return 0.2;
  }

  /**
   * Calculate correlation score
   */
  private calculateCorrelationScore(alert: Alert): number {
    // Higher score for alerts that are part of a pattern
    const correlation = Array.from(this.correlations.values()).find(c => 
      c.alerts.some(a => a.id === alert.id)
    );

    if (correlation) {
      return Math.min(correlation.confidence, 1.0);
    }

    return 0.5; // Default for uncorrelated alerts
  }

  /**
   * Calculate user impact score
   */
  private calculateUserImpactScore(alert: Alert): number {
    // Check for user-facing service indicators
    const userFacingIndicators = ['frontend', 'api', 'auth', 'payment', 'user-facing'];
    const hasUserImpact = userFacingIndicators.some(indicator => 
      Object.values(alert.tags).some(value => 
        value.toLowerCase().includes(indicator)
      )
    );

    return hasUserImpact ? 1.0 : 0.3;
  }

  /**
   * Generate priority reasoning
   */
  private generatePriorityReasoning(factors: AlertPriority['factors']): string[] {
    const reasoning: string[] = [];

    if (factors.severity >= 0.75) {
      reasoning.push('High severity alert requiring immediate attention');
    }

    if (factors.businessImpact >= 0.8) {
      reasoning.push('High business impact - affects critical systems');
    }

    if (factors.frequency <= 0.4) {
      reasoning.push('Frequent alert - may indicate ongoing issue');
    }

    if (factors.userImpact >= 0.8) {
      reasoning.push('User-facing impact detected');
    }

    if (factors.correlation >= 0.7) {
      reasoning.push('Part of correlated alert pattern');
    }

    return reasoning;
  }

  /**
   * Determine if we should notify for this alert
   */
  private shouldNotifyForAlert(
    alert: Alert, 
    correlation: AlertCorrelation | null, 
    priority: AlertPriority
  ): boolean {
    // Always notify for critical alerts with high priority
    if (alert.severity === 'critical' && priority.score >= 0.8) {
      return true;
    }

    // Don't notify if part of a large correlation group (noise reduction)
    if (correlation && correlation.alerts.length > this.config.maxAlertsPerGroup) {
      return false;
    }

    // Notify based on priority threshold
    const priorityThreshold = this.getPriorityThreshold(alert.severity);
    return priority.score >= priorityThreshold;
  }

  /**
   * Get priority threshold for severity level
   */
  private getPriorityThreshold(severity: AlertSeverity): number {
    const thresholds = {
      critical: 0.6,
      error: 0.7,
      warning: 0.8,
      info: 0.9
    };
    return thresholds[severity] || 0.8;
  }

  /**
   * Initialize business impact rules
   */
  private initializeBusinessImpactRules(): void {
    // Add default business impact rules
    this.businessImpactRules.set('payment-failure', 1.0);
    this.businessImpactRules.set('auth-service-down', 0.9);
    this.businessImpactRules.set('database-connection-failed', 0.8);
    this.businessImpactRules.set('api-high-error-rate', 0.7);
    this.businessImpactRules.set('disk-space-critical', 0.6);
  }

  /**
   * Get recent alerts within correlation window
   */
  private getRecentAlerts(): Alert[] {
    const cutoff = Date.now() - this.config.correlationWindowMs;
    return this.alertHistory.filter(alert => 
      alert.timestamp.getTime() > cutoff
    );
  }

  /**
   * Check if alert should be added to existing correlation
   */
  private shouldAddToCorrelation(alert: Alert, correlation: AlertCorrelation): boolean {
    if (correlation.alerts.length >= this.config.maxAlertsPerGroup) {
      return false;
    }

    const pattern = correlation.pattern;
    
    switch (pattern.type) {
      case 'temporal':
        return alert.ruleId === pattern.criteria.ruleId;
      case 'service':
        return alert.tags.service === pattern.criteria.service;
      case 'cascade':
        return alert.tags.service === pattern.criteria.service;
      default:
        return false;
    }
  }

  /**
   * Calculate correlation confidence
   */
  private calculateCorrelationConfidence(correlation: AlertCorrelation): number {
    const alertCount = correlation.alerts.length;
    const timeSpread = Math.max(...correlation.alerts.map(a => a.timestamp.getTime())) - 
                     Math.min(...correlation.alerts.map(a => a.timestamp.getTime()));
    
    // Higher confidence for more alerts in shorter time
    let confidence = Math.min(alertCount / 10, 1.0);
    
    // Reduce confidence for alerts spread over long time
    if (timeSpread > this.config.correlationWindowMs) {
      confidence *= 0.7;
    }

    return Math.max(confidence, 0.1);
  }

  /**
   * Check if we should create a new correlation
   */
  private shouldCreateCorrelation(alert: Alert, pattern: AlertPattern): boolean {
    return pattern.type !== 'temporal' || this.getRecentAlerts().length >= 2;
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up old alert history
   */
  private cleanupOldHistory(): void {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const cutoff = Date.now() - maxAge;
    
    this.alertHistory = this.alertHistory.filter(alert => 
      alert.timestamp.getTime() > cutoff
    );

    // Clean up old correlations
    for (const [id, correlation] of this.correlations.entries()) {
      if (correlation.lastUpdated.getTime() < cutoff) {
        this.correlations.delete(id);
      }
    }
  }

  /**
   * Get correlation statistics
   */
  getCorrelationStats(): {
    activeCorrelations: number;
    totalAlertsCorrelated: number;
    averageCorrelationSize: number;
    suppressedAlerts: number;
  } {
    const activeCorrelations = this.correlations.size;
    const totalAlertsCorrelated = Array.from(this.correlations.values())
      .reduce((sum, corr) => sum + corr.alerts.length, 0);
    const averageCorrelationSize = activeCorrelations > 0 
      ? totalAlertsCorrelated / activeCorrelations 
      : 0;

    return {
      activeCorrelations,
      totalAlertsCorrelated,
      averageCorrelationSize,
      suppressedAlerts: this.suppressedAlerts.size
    };
  }

  /**
   * Get active correlations
   */
  getActiveCorrelations(): AlertCorrelation[] {
    return Array.from(this.correlations.values());
  }

  /**
   * Add business impact rule
   */
  addBusinessImpactRule(ruleId: string, impact: number): void {
    this.businessImpactRules.set(ruleId, Math.max(0, Math.min(1, impact)));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NoiseReductionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export singleton instance
export const intelligentAlertingSystem = new IntelligentAlertingSystem();