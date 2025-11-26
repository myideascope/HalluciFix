import { performanceMonitor } from './performanceMonitor';
import { dataDogIntegration } from './monitoring/dataDogIntegration';
import { newRelicIntegration } from './monitoring/newRelicIntegration';

import { logger } from './logging';
export interface BusinessMetric {
  name: string;
  value: number;
  unit: 'count' | 'currency' | 'percent' | 'ms' | 'bytes';
  category: 'user_engagement' | 'conversion' | 'revenue' | 'performance' | 'quality';
  tags: Record<string, string>;
  timestamp: Date;
}

export interface UserEngagementMetrics {
  userId: string;
  sessionId: string;
  pageViews: number;
  timeOnSite: number;
  interactions: number;
  features_used: string[];
  conversion_events: string[];
}

export interface ConversionMetrics {
  funnel_step: string;
  user_id?: string;
  session_id: string;
  conversion_value?: number;
  source: string;
  campaign?: string;
}

export interface RevenueMetrics {
  transaction_id: string;
  user_id: string;
  amount: number;
  currency: string;
  plan_type: string;
  payment_method: string;
}

/**
 * Business metrics monitoring service for tracking KPIs and business performance
 */
export class BusinessMetricsMonitor {
  private metrics: BusinessMetric[] = [];
  private userSessions: Map<string, UserEngagementMetrics> = new Map();
  private conversionFunnels: Map<string, ConversionMetrics[]> = new Map();
  private alertThresholds: Map<string, { min?: number; max?: number; change_percent?: number }> = new Map();

  constructor() {
    this.setupDefaultThresholds();
  }

  /**
   * Track user engagement metrics
   */
  trackUserEngagement(userId: string, sessionId: string, event: {
    type: 'page_view' | 'interaction' | 'feature_use' | 'time_spent';
    data: {
      page?: string;
      feature?: string;
      interaction_type?: string;
      duration?: number;
    };
  }): void {
    const session = this.userSessions.get(sessionId) || {
      userId,
      sessionId,
      pageViews: 0,
      timeOnSite: 0,
      interactions: 0,
      features_used: [],
      conversion_events: []
    };

    switch (event.type) {
      case 'page_view':
        session.pageViews++;
        this.recordBusinessMetric('user.page_views', 1, 'count', 'user_engagement', {
          userId,
          sessionId,
          page: event.data.page || 'unknown'
        });
        break;

      case 'interaction':
        session.interactions++;
        this.recordBusinessMetric('user.interactions', 1, 'count', 'user_engagement', {
          userId,
          sessionId,
          interaction_type: event.data.interaction_type || 'unknown'
        });
        break;

      case 'feature_use':
        if (event.data.feature && !session.features_used.includes(event.data.feature)) {
          session.features_used.push(event.data.feature);
        }
        this.recordBusinessMetric('user.feature_usage', 1, 'count', 'user_engagement', {
          userId,
          sessionId,
          feature: event.data.feature || 'unknown'
        });
        break;

      case 'time_spent':
        if (event.data.duration) {
          session.timeOnSite += event.data.duration;
          this.recordBusinessMetric('user.time_on_site', event.data.duration, 'ms', 'user_engagement', {
            userId,
            sessionId
          });
        }
        break;
    }

    this.userSessions.set(sessionId, session);
  }

  /**
   * Track conversion funnel metrics
   */
  trackConversion(funnelName: string, step: string, data: {
    userId?: string;
    sessionId: string;
    value?: number;
    source?: string;
    campaign?: string;
  }): void {
    const conversion: ConversionMetrics = {
      funnel_step: step,
      user_id: data.userId,
      session_id: data.sessionId,
      conversion_value: data.value,
      source: data.source || 'direct',
      campaign: data.campaign
    };

    const funnelSteps = this.conversionFunnels.get(funnelName) || [];
    funnelSteps.push(conversion);
    this.conversionFunnels.set(funnelName, funnelSteps);

    this.recordBusinessMetric(`conversion.${funnelName}.${step}`, 1, 'count', 'conversion', {
      funnel: funnelName,
      step,
      source: data.source || 'direct',
      ...(data.userId && { userId: data.userId }),
      ...(data.campaign && { campaign: data.campaign })
    });

    if (data.value) {
      this.recordBusinessMetric(`conversion.${funnelName}.${step}.value`, data.value, 'currency', 'conversion', {
        funnel: funnelName,
        step,
        source: data.source || 'direct'
      });
    }
  }

  /**
   * Track revenue metrics
   */
  trackRevenue(revenue: RevenueMetrics): void {
    this.recordBusinessMetric('revenue.transaction', revenue.amount, 'currency', 'revenue', {
      userId: revenue.user_id,
      transactionId: revenue.transaction_id,
      currency: revenue.currency,
      planType: revenue.plan_type,
      paymentMethod: revenue.payment_method
    });

    // Track MRR (Monthly Recurring Revenue) for subscription plans
    if (revenue.plan_type.includes('monthly')) {
      this.recordBusinessMetric('revenue.mrr', revenue.amount, 'currency', 'revenue', {
        planType: revenue.plan_type
      });
    }

    // Track ARR (Annual Recurring Revenue) for yearly plans
    if (revenue.plan_type.includes('yearly')) {
      this.recordBusinessMetric('revenue.arr', revenue.amount, 'currency', 'revenue', {
        planType: revenue.plan_type
      });
    }
  }

  /**
   * Track analysis quality metrics
   */
  trackAnalysisQuality(metrics: {
    analysisId: string;
    userId: string;
    accuracyScore: number;
    processingTime: number;
    contentLength: number;
    hallucinationsDetected: number;
    confidenceScore: number;
  }): void {
    this.recordBusinessMetric('analysis.accuracy_score', metrics.accuracyScore, 'percent', 'quality', {
      analysisId: metrics.analysisId,
      userId: metrics.userId
    });

    this.recordBusinessMetric('analysis.processing_time', metrics.processingTime, 'ms', 'performance', {
      analysisId: metrics.analysisId,
      userId: metrics.userId
    });

    this.recordBusinessMetric('analysis.hallucinations_detected', metrics.hallucinationsDetected, 'count', 'quality', {
      analysisId: metrics.analysisId,
      userId: metrics.userId
    });

    this.recordBusinessMetric('analysis.confidence_score', metrics.confidenceScore, 'percent', 'quality', {
      analysisId: metrics.analysisId,
      userId: metrics.userId
    });

    // Calculate hallucination rate
    const hallucinationRate = metrics.contentLength > 0 
      ? (metrics.hallucinationsDetected / metrics.contentLength) * 100 
      : 0;

    this.recordBusinessMetric('analysis.hallucination_rate', hallucinationRate, 'percent', 'quality', {
      analysisId: metrics.analysisId,
      userId: metrics.userId
    });
  }

  /**
   * Track user retention metrics
   */
  trackUserRetention(userId: string, cohortDate: Date, returnDate: Date): void {
    const daysSinceSignup = Math.floor((returnDate.getTime() - cohortDate.getTime()) / (1000 * 60 * 60 * 24));
    
    let retentionPeriod = 'day_1';
    if (daysSinceSignup >= 30) retentionPeriod = 'day_30';
    else if (daysSinceSignup >= 7) retentionPeriod = 'day_7';
    else if (daysSinceSignup >= 1) retentionPeriod = 'day_1';

    this.recordBusinessMetric(`retention.${retentionPeriod}`, 1, 'count', 'user_engagement', {
      userId,
      cohortDate: cohortDate.toISOString().split('T')[0],
      daysSinceSignup: daysSinceSignup.toString()
    });
  }

  /**
   * Record business metric
   */
  private recordBusinessMetric(
    name: string,
    value: number,
    unit: 'count' | 'ms' | 'bytes' | 'percent',
    category: BusinessMetric['category'],
    tags: Record<string, string>
  ): void {
    const metric: BusinessMetric = {
      name,
      value,
      unit,
      category,
      tags,
      timestamp: new Date()
    };

    this.metrics.push(metric);

    // Record in performance monitor
    performanceMonitor.recordBusinessMetric(name, value, unit, tags);

    // Check for alerts
    this.checkBusinessAlerts(metric);

    // Send to external services
    this.sendToExternalServices(metric);
  }

  /**
   * Check business metric alerts
   */
  private checkBusinessAlerts(metric: BusinessMetric): void {
    const threshold = this.alertThresholds.get(metric.name);
    if (!threshold) return;

    let alertTriggered = false;
    let alertType = '';
    let alertMessage = '';

    if (threshold.min !== undefined && metric.value < threshold.min) {
      alertTriggered = true;
      alertType = 'below_minimum';
      alertMessage = `${metric.name} is below minimum threshold: ${metric.value} < ${threshold.min}`;
    }

    if (threshold.max !== undefined && metric.value > threshold.max) {
      alertTriggered = true;
      alertType = 'above_maximum';
      alertMessage = `${metric.name} is above maximum threshold: ${metric.value} > ${threshold.max}`;
    }

    if (alertTriggered) {
logger.warn(`Business Metric Alert: ${alertMessage}`, {
        alertType,
        threshold,
        currentValue: metric.value,
        timestamp: metric.timestamp
      });
      
      // Send alert to external services
      this.sendBusinessAlert({
        metric: metric.name,
        value: metric.value,
        threshold,
        alertType,
        message: alertMessage,
        timestamp: metric.timestamp
      });
    }
  }

  /**
   * Send business alert
   */
  private async sendBusinessAlert(alert: {
    metric: string;
    value: number;
    threshold: any;
    alertType: string;
    message: string;
    timestamp: Date;
  }): Promise<void> {
    // Send to DataDog
    try {
      await dataDogIntegration.sendEvent({
        title: 'Business Metric Alert',
        text: alert.message,
        alert_type: 'warning',
        tags: [`metric:${alert.metric}`, `alert_type:${alert.alertType}`],
        date_happened: alert.timestamp
      });
    } catch (error) {
      logger.error("Failed to send business alert to DataDog:", error instanceof Error ? error : new Error(String(error)));
    }

    // Send to New Relic
    try {
      await newRelicIntegration.sendEvents([{
        eventType: 'HallucifixBusinessAlert',
        metric: alert.metric,
        value: alert.value,
        alertType: alert.alertType,
        message: alert.message,
        timestamp: alert.timestamp.getTime()
      }]);
    } catch (error) {
      logger.error("Failed to send business alert to New Relic:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send metrics to external services
   */
  private async sendToExternalServices(metric: BusinessMetric): Promise<void> {
    // Send to DataDog
    try {
      await dataDogIntegration.sendMetrics([{
        name: metric.name,
        value: metric.value,
        unit: metric.unit === 'currency' ? 'count' : metric.unit,
        tags: metric.tags,
        timestamp: metric.timestamp
      }]);
    } catch (error) {
      logger.error("Failed to send business metric to DataDog:", error instanceof Error ? error : new Error(String(error)));
    }

    // Send to New Relic
    try {
      await newRelicIntegration.sendEvents([{
        eventType: 'HallucifixBusinessMetric',
        name: metric.name,
        value: metric.value,
        unit: metric.unit,
        category: metric.category,
        timestamp: metric.timestamp.getTime(),
        ...metric.tags
      }]);
    } catch (error) {
      logger.error("Failed to send business metric to New Relic:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Setup default alert thresholds
   */
  private setupDefaultThresholds(): void {
    // Analysis quality thresholds
    this.alertThresholds.set('analysis.accuracy_score', { min: 80 }); // 80% minimum accuracy
    this.alertThresholds.set('analysis.processing_time', { max: 30 }); // 30 seconds max processing
    this.alertThresholds.set('analysis.hallucination_rate', { max: 10 }); // 10% max hallucination rate

    // User engagement thresholds
    this.alertThresholds.set('user.time_on_site', { min: 60 }); // 1 minute minimum session
    this.alertThresholds.set('conversion.signup.completed', { min: 1 }); // At least 1 signup per hour

    // Revenue thresholds
    this.alertThresholds.set('revenue.mrr', { change_percent: -10 }); // Alert on 10% MRR drop
  }

  /**
   * Set custom alert threshold
   */
  setAlertThreshold(metricName: string, threshold: { min?: number; max?: number; change_percent?: number }): void {
    this.alertThresholds.set(metricName, threshold);
  }

  /**
   * Get business metrics report
   */
  getBusinessReport(timeWindowMs: number = 24 * 60 * 60 * 1000): {
    totalMetrics: number;
    metricsByCategory: Record<string, number>;
    topMetrics: Array<{ name: string; value: number; category: string }>;
    conversionRates: Record<string, number>;
    userEngagement: {
      totalSessions: number;
      averageTimeOnSite: number;
      averagePageViews: number;
      topFeatures: Array<{ feature: string; usage: number }>;
    };
  } {
    const cutoff = new Date(Date.now() - timeWindowMs);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff);

    const metricsByCategory = recentMetrics.reduce((acc, metric) => {
      acc[metric.category] = (acc[metric.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topMetrics = recentMetrics
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(m => ({ name: m.name, value: m.value, category: m.category }));

    // Calculate conversion rates
    const conversionRates: Record<string, number> = {};
    this.conversionFunnels.forEach((steps, funnelName) => {
      const recentSteps = steps.filter(s => new Date() >= cutoff);
      const stepCounts = recentSteps.reduce((acc, step) => {
        acc[step.funnel_step] = (acc[step.funnel_step] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate conversion rate (assuming first step is entry point)
      const stepNames = Object.keys(stepCounts).sort();
      if (stepNames.length > 1) {
        const entryCount = stepCounts[stepNames[0]] || 0;
        const finalCount = stepCounts[stepNames[stepNames.length - 1]] || 0;
        conversionRates[funnelName] = entryCount > 0 ? (finalCount / entryCount) * 100 : 0;
      }
    });

    // Calculate user engagement metrics
    const recentSessions = Array.from(this.userSessions.values());
    const userEngagement = {
      totalSessions: recentSessions.length,
      averageTimeOnSite: recentSessions.length > 0 
        ? recentSessions.reduce((sum, s) => sum + s.timeOnSite, 0) / recentSessions.length 
        : 0,
      averagePageViews: recentSessions.length > 0 
        ? recentSessions.reduce((sum, s) => sum + s.pageViews, 0) / recentSessions.length 
        : 0,
      topFeatures: this.getTopFeatures(recentSessions)
    };

    return {
      totalMetrics: recentMetrics.length,
      metricsByCategory,
      topMetrics,
      conversionRates,
      userEngagement
    };
  }

  /**
   * Get top used features
   */
  private getTopFeatures(sessions: UserEngagementMetrics[]): Array<{ feature: string; usage: number }> {
    const featureUsage = new Map<string, number>();
    
    sessions.forEach(session => {
      session.features_used.forEach(feature => {
        featureUsage.set(feature, (featureUsage.get(feature) || 0) + 1);
      });
    });

    return Array.from(featureUsage.entries())
      .map(([feature, usage]) => ({ feature, usage }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10);
  }

  /**
   * Clear metrics history
   */
  clearHistory(): void {
    this.metrics = [];
    this.userSessions.clear();
    this.conversionFunnels.clear();
  }
}

// Export singleton instance
export const businessMetricsMonitor = new BusinessMetricsMonitor();
export default businessMetricsMonitor;