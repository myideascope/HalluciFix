import { businessMetricsMonitor } from './businessMetricsMonitor';
import { businessMetricsReporting, BusinessReport, BusinessInsight } from './businessMetricsReporting';
import { dataDogIntegration } from './monitoring/dataDogIntegration';
import { newRelicIntegration } from './monitoring/newRelicIntegration';

import { logger } from './logging';
export interface BusinessAlert {
  id: string;
  type: 'threshold' | 'anomaly' | 'trend' | 'goal' | 'insight';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  metric: string;
  currentValue: number;
  threshold?: number;
  expectedValue?: number;
  deviation?: number;
  timestamp: Date;
  status: 'active' | 'acknowledged' | 'resolved';
  channels: string[];
  tags: Record<string, string>;
  actionItems?: string[];
  relatedMetrics?: string[];
  businessImpact: 'high' | 'medium' | 'low';
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: 'above' | 'below' | 'equals' | 'change_percent' | 'anomaly';
  threshold: number;
  timeWindow: string;
  severity: 'critical' | 'warning' | 'info';
  channels: string[];
  enabled: boolean;
  cooldownPeriod: number; // minutes
  tags: Record<string, string>;
  businessContext?: {
    impact: string;
    stakeholders: string[];
    escalationPath: string[];
  };
}

export interface BusinessGoal {
  id: string;
  name: string;
  metric: string;
  target: number;
  timeframe: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  priority: 'high' | 'medium' | 'low';
  owner: string;
  department: string;
  status: 'on_track' | 'at_risk' | 'behind' | 'achieved';
  progress: number; // percentage
  deadline: Date;
  milestones: Array<{
    name: string;
    target: number;
    deadline: Date;
    completed: boolean;
  }>;
}

export interface InsightRecommendation {
  id: string;
  type: 'optimization' | 'growth' | 'cost_reduction' | 'risk_mitigation' | 'feature_request';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  confidence: number;
  metrics: string[];
  expectedOutcome: string;
  timeToImplement: string;
  resources: string[];
  priority: number;
  tags: string[];
}

export interface NotificationChannel {
  id: string;
  type: 'email' | 'slack' | 'webhook' | 'sms' | 'pagerduty';
  name: string;
  config: Record<string, any>;
  enabled: boolean;
  filters: {
    severity?: string[];
    metrics?: string[];
    tags?: Record<string, string>;
  };
}

/**
 * Business alerting and insights system
 */
export class BusinessAlerting {
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, BusinessAlert> = new Map();
  private businessGoals: Map<string, BusinessGoal> = new Map();
  private notificationChannels: Map<string, NotificationChannel> = new Map();
  private alertHistory: BusinessAlert[] = [];
  private insightCache: Map<string, InsightRecommendation[]> = new Map();
  private lastAlertTimes: Map<string, Date> = new Map();

  constructor() {
    this.setupDefaultAlertRules();
    this.setupDefaultGoals();
    this.setupDefaultChannels();
    this.startAlertMonitoring();
  }

  /**
   * Add alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
  }

  /**
   * Update alert rule
   */
  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): void {
    const rule = this.alertRules.get(ruleId);
    if (rule) {
      this.alertRules.set(ruleId, { ...rule, ...updates });
    }
  }

  /**
   * Add business goal
   */
  addBusinessGoal(goal: BusinessGoal): void {
    this.businessGoals.set(goal.id, goal);
  }

  /**
   * Update business goal progress
   */
  updateGoalProgress(goalId: string, currentValue: number): void {
    const goal = this.businessGoals.get(goalId);
    if (!goal) return;

    const progress = (currentValue / goal.target) * 100;
    let status: BusinessGoal['status'] = 'on_track';

    if (progress >= 100) {
      status = 'achieved';
    } else if (progress < 50) {
      status = 'behind';
    } else if (progress < 80) {
      status = 'at_risk';
    }

    const updatedGoal = { ...goal, progress, status };
    this.businessGoals.set(goalId, updatedGoal);

    // Check if we need to alert on goal status
    this.checkGoalAlerts(updatedGoal, currentValue);
  }

  /**
   * Add notification channel
   */
  addNotificationChannel(channel: NotificationChannel): void {
    this.notificationChannels.set(channel.id, channel);
  }

  /**
   * Process business metrics and check for alerts
   */
  async processMetrics(report: BusinessReport): Promise<void> {
    // Check threshold-based alerts
    await this.checkThresholdAlerts(report);

    // Check anomaly detection
    await this.checkAnomalyAlerts(report);

    // Check trend-based alerts
    await this.checkTrendAlerts(report);

    // Update goal progress
    this.updateGoalsFromReport(report);

    // Generate insights and recommendations
    await this.generateInsights(report);
  }

  /**
   * Check threshold-based alerts
   */
  private async checkThresholdAlerts(report: BusinessReport): Promise<void> {
    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled || rule.condition === 'anomaly') continue;

      const metricValue = this.getMetricValue(report, rule.metric);
      if (metricValue === null) continue;

      let shouldAlert = false;
      let alertDescription = '';

      switch (rule.condition) {
        case 'above':
          shouldAlert = metricValue > rule.threshold;
          alertDescription = `${rule.metric} is ${metricValue} (above threshold of ${rule.threshold})`;
          break;
        case 'below':
          shouldAlert = metricValue < rule.threshold;
          alertDescription = `${rule.metric} is ${metricValue} (below threshold of ${rule.threshold})`;
          break;
        case 'equals':
          shouldAlert = Math.abs(metricValue - rule.threshold) < 0.01;
          alertDescription = `${rule.metric} equals ${metricValue}`;
          break;
        case 'change_percent':
          // This would require historical data comparison
          const historicalValue = await this.getHistoricalValue(rule.metric, rule.timeWindow);
          if (historicalValue !== null) {
            const changePercent = ((metricValue - historicalValue) / historicalValue) * 100;
            shouldAlert = Math.abs(changePercent) > rule.threshold;
            alertDescription = `${rule.metric} changed by ${changePercent.toFixed(1)}% (threshold: ${rule.threshold}%)`;
          }
          break;
      }

      if (shouldAlert && this.shouldTriggerAlert(ruleId, rule.cooldownPeriod)) {
        await this.triggerAlert({
          id: `alert_${ruleId}_${Date.now()}`,
          type: 'threshold',
          severity: rule.severity,
          title: `${rule.name} Alert`,
          description: alertDescription,
          metric: rule.metric,
          currentValue: metricValue,
          threshold: rule.threshold,
          timestamp: new Date(),
          status: 'active',
          channels: rule.channels,
          tags: rule.tags,
          businessImpact: this.assessBusinessImpact(rule.metric, metricValue, rule.threshold),
          actionItems: this.generateActionItems(rule.metric, rule.condition, metricValue, rule.threshold)
        });
      }
    }
  }

  /**
   * Check anomaly detection alerts
   */
  private async checkAnomalyAlerts(report: BusinessReport): Promise<void> {
    const anomalyRules = Array.from(this.alertRules.values()).filter(rule => rule.condition === 'anomaly');

    for (const rule of anomalyRules) {
      const metricValue = this.getMetricValue(report, rule.metric);
      if (metricValue === null) continue;

      const isAnomaly = await this.detectAnomaly(rule.metric, metricValue);
      
      if (isAnomaly && this.shouldTriggerAlert(rule.id, rule.cooldownPeriod)) {
        await this.triggerAlert({
          id: `anomaly_${rule.id}_${Date.now()}`,
          type: 'anomaly',
          severity: rule.severity,
          title: `Anomaly Detected: ${rule.name}`,
          description: `Unusual pattern detected in ${rule.metric}: ${metricValue}`,
          metric: rule.metric,
          currentValue: metricValue,
          timestamp: new Date(),
          status: 'active',
          channels: rule.channels,
          tags: { ...rule.tags, anomaly_type: 'statistical' },
          businessImpact: 'medium',
          actionItems: [
            'Investigate recent changes that might affect this metric',
            'Check for external factors or events',
            'Review related metrics for correlation'
          ]
        });
      }
    }
  }

  /**
   * Check trend-based alerts
   */
  private async checkTrendAlerts(report: BusinessReport): Promise<void> {
    for (const trend of report.trends) {
      if (trend.significance === 'high' && trend.magnitude > 10) {
        const alertSeverity = trend.direction === 'down' && this.isNegativeTrend(trend.metric) ? 'critical' : 'warning';
        
        await this.triggerAlert({
          id: `trend_${trend.metric}_${Date.now()}`,
          type: 'trend',
          severity: alertSeverity,
          title: `Significant Trend Alert: ${trend.metric}`,
          description: `${trend.metric} is trending ${trend.direction} by ${trend.magnitude}% over ${trend.timeframe}`,
          metric: trend.metric,
          currentValue: this.getMetricValue(report, trend.metric) || 0,
          timestamp: new Date(),
          status: 'active',
          channels: ['email', 'slack'],
          tags: { trend_direction: trend.direction, trend_magnitude: trend.magnitude.toString() },
          businessImpact: trend.significance === 'high' ? 'high' : 'medium',
          actionItems: this.generateTrendActionItems(trend)
        });
      }
    }
  }

  /**
   * Check goal alerts
   */
  private checkGoalAlerts(goal: BusinessGoal, currentValue: number): void {
    const daysUntilDeadline = Math.ceil((goal.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    if (goal.status === 'behind' && daysUntilDeadline < 30) {
      this.triggerAlert({
        id: `goal_${goal.id}_${Date.now()}`,
        type: 'goal',
        severity: 'warning',
        title: `Goal At Risk: ${goal.name}`,
        description: `Goal "${goal.name}" is behind schedule with ${goal.progress.toFixed(1)}% progress and ${daysUntilDeadline} days remaining`,
        metric: goal.metric,
        currentValue,
        threshold: goal.target,
        timestamp: new Date(),
        status: 'active',
        channels: ['email'],
        tags: { goal_id: goal.id, department: goal.department, owner: goal.owner },
        businessImpact: goal.priority === 'high' ? 'high' : 'medium',
        actionItems: [
          'Review goal timeline and milestones',
          'Identify blockers and resource constraints',
          'Consider adjusting strategy or timeline',
          'Escalate to stakeholders if needed'
        ]
      });
    }
  }

  /**
   * Generate insights and recommendations
   */
  private async generateInsights(report: BusinessReport): Promise<void> {
    const insights: InsightRecommendation[] = [];

    // Revenue optimization insights
    if (report.metrics.revenue.churnRate > 5) {
      insights.push({
        id: 'churn_reduction',
        type: 'cost_reduction',
        title: 'Reduce Customer Churn',
        description: `Current churn rate of ${report.metrics.revenue.churnRate}% is above the 5% target. Implementing retention strategies could significantly impact revenue.`,
        impact: 'high',
        effort: 'medium',
        confidence: 0.8,
        metrics: ['churnRate', 'mrr', 'ltv'],
        expectedOutcome: 'Reduce churn by 2-3%, increase MRR by $2,000-3,000',
        timeToImplement: '2-3 months',
        resources: ['Customer Success Team', 'Product Team', 'Data Analyst'],
        priority: 1,
        tags: ['revenue', 'retention', 'customer_success']
      });
    }

    // Engagement optimization insights
    if (report.metrics.engagement.sessionDuration < 5) {
      insights.push({
        id: 'engagement_improvement',
        type: 'optimization',
        title: 'Improve User Engagement',
        description: `Average session duration of ${report.metrics.engagement.sessionDuration.toFixed(1)} minutes is below optimal. Enhanced onboarding and UX improvements could increase engagement.`,
        impact: 'medium',
        effort: 'medium',
        confidence: 0.7,
        metrics: ['sessionDuration', 'pageViewsPerSession', 'bounceRate'],
        expectedOutcome: 'Increase session duration by 30-50%, improve conversion rates',
        timeToImplement: '1-2 months',
        resources: ['UX Designer', 'Frontend Developer', 'Product Manager'],
        priority: 2,
        tags: ['engagement', 'ux', 'onboarding']
      });
    }

    // Conversion optimization insights
    const conversionRate = report.metrics.conversion.overallConversionRate;
    if (conversionRate < 3) {
      insights.push({
        id: 'conversion_optimization',
        type: 'growth',
        title: 'Optimize Conversion Funnel',
        description: `Conversion rate of ${conversionRate.toFixed(1)}% has room for improvement. A/B testing key funnel steps could yield significant gains.`,
        impact: 'high',
        effort: 'low',
        confidence: 0.9,
        metrics: ['overallConversionRate', 'funnelConversionRates'],
        expectedOutcome: 'Increase conversion rate by 0.5-1.0%, boost revenue by 15-30%',
        timeToImplement: '2-4 weeks',
        resources: ['Growth Team', 'Data Analyst', 'Frontend Developer'],
        priority: 1,
        tags: ['conversion', 'growth', 'ab_testing']
      });
    }

    // Performance optimization insights
    if (report.metrics.performance.averageResponseTime > 2000) {
      insights.push({
        id: 'performance_optimization',
        type: 'optimization',
        title: 'Improve System Performance',
        description: `Average response time of ${report.metrics.performance.averageResponseTime}ms affects user experience and conversion. Performance optimization is needed.`,
        impact: 'medium',
        effort: 'high',
        confidence: 0.8,
        metrics: ['averageResponseTime', 'uptime', 'throughput'],
        expectedOutcome: 'Reduce response time by 30-50%, improve user satisfaction',
        timeToImplement: '1-3 months',
        resources: ['Backend Team', 'DevOps Engineer', 'Database Administrator'],
        priority: 3,
        tags: ['performance', 'infrastructure', 'user_experience']
      });
    }

    // Mobile optimization insights
    const mobilePercentage = (report.metrics.engagement.deviceDistribution.mobile || 0) / 
      Object.values(report.metrics.engagement.deviceDistribution).reduce((sum, val) => sum + val, 0) * 100;
    
    if (mobilePercentage > 40) {
      insights.push({
        id: 'mobile_optimization',
        type: 'growth',
        title: 'Optimize Mobile Experience',
        description: `${mobilePercentage.toFixed(1)}% of users are on mobile. Mobile-first optimization could capture significant growth opportunity.`,
        impact: 'high',
        effort: 'medium',
        confidence: 0.85,
        metrics: ['deviceDistribution', 'sessionDuration', 'conversionRate'],
        expectedOutcome: 'Increase mobile conversion by 20-40%, improve mobile engagement',
        timeToImplement: '2-4 months',
        resources: ['Mobile Team', 'UX Designer', 'Frontend Developer'],
        priority: 1,
        tags: ['mobile', 'growth', 'user_experience']
      });
    }

    // Cache insights
    this.insightCache.set(`insights_${Date.now()}`, insights);

    // Send insights as notifications if they're high priority
    for (const insight of insights.filter(i => i.priority === 1)) {
      await this.sendInsightNotification(insight);
    }
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(alert: BusinessAlert): Promise<void> {
    // Add to active alerts
    this.activeAlerts.set(alert.id, alert);
    this.alertHistory.push(alert);

    // Update last alert time for cooldown
    const ruleId = alert.id.split('_')[1];
    this.lastAlertTimes.set(ruleId, alert.timestamp);

    // Send notifications
    await this.sendAlertNotifications(alert);

    // Log alert
    console.log(`Business Alert Triggered: ${alert.title} - ${alert.description}`);
  }

  /**
   * Send alert notifications
   */
  private async sendAlertNotifications(alert: BusinessAlert): Promise<void> {
    for (const channelId of alert.channels) {
      const channel = this.notificationChannels.get(channelId);
      if (!channel || !channel.enabled) continue;

      // Check channel filters
      if (!this.passesChannelFilters(alert, channel)) continue;

      try {
        await this.sendNotification(channel, alert);
      } catch (error) {
        console.error(`Failed to send alert to channel ${channelId}:`, error);
      }
    }
  }

  /**
   * Send notification to specific channel
   */
  private async sendNotification(channel: NotificationChannel, alert: BusinessAlert): Promise<void> {
    switch (channel.type) {
      case 'email':
        await this.sendEmailNotification(channel, alert);
        break;
      case 'slack':
        await this.sendSlackNotification(channel, alert);
        break;
      case 'webhook':
        await this.sendWebhookNotification(channel, alert);
        break;
      case 'pagerduty':
        await this.sendPagerDutyNotification(channel, alert);
        break;
      default:
        console.warn(`Unsupported notification channel type: ${channel.type}`);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(channel: NotificationChannel, alert: BusinessAlert): Promise<void> {
    // Mock email sending - in real implementation, integrate with email service
    console.log(`Email notification sent: ${alert.title}`);
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(channel: NotificationChannel, alert: BusinessAlert): Promise<void> {
    const webhookUrl = channel.config.webhookUrl;
    if (!webhookUrl) return;

    const color = alert.severity === 'critical' ? '#ff0000' : alert.severity === 'warning' ? '#ffaa00' : '#00aa00';
    
    const payload = {
      text: `🚨 Business Alert: ${alert.title}`,
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Metric',
              value: alert.metric,
              short: true
            },
            {
              title: 'Current Value',
              value: alert.currentValue.toString(),
              short: true
            },
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true
            },
            {
              title: 'Business Impact',
              value: alert.businessImpact.toUpperCase(),
              short: true
            },
            {
              title: 'Description',
              value: alert.description,
              short: false
            }
          ],
          footer: 'HalluciFix Business Monitoring',
          ts: Math.floor(alert.timestamp.getTime() / 1000)
        }
      ]
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(channel: NotificationChannel, alert: BusinessAlert): Promise<void> {
    const webhookUrl = channel.config.url;
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert)
    });
  }

  /**
   * Send PagerDuty notification
   */
  private async sendPagerDutyNotification(channel: NotificationChannel, alert: BusinessAlert): Promise<void> {
    // Mock PagerDuty integration - in real implementation, use PagerDuty API
    console.log(`PagerDuty notification sent: ${alert.title}`);
  }

  /**
   * Send insight notification
   */
  private async sendInsightNotification(insight: InsightRecommendation): Promise<void> {
    // Send high-priority insights to stakeholders
    const slackChannel = this.notificationChannels.get('slack');
    if (slackChannel && slackChannel.enabled) {
      const payload = {
        text: `💡 Business Insight: ${insight.title}`,
        attachments: [
          {
            color: '#4CAF50',
            fields: [
              {
                title: 'Impact',
                value: insight.impact.toUpperCase(),
                short: true
              },
              {
                title: 'Effort',
                value: insight.effort.toUpperCase(),
                short: true
              },
              {
                title: 'Confidence',
                value: `${(insight.confidence * 100).toFixed(0)}%`,
                short: true
              },
              {
                title: 'Time to Implement',
                value: insight.timeToImplement,
                short: true
              },
              {
                title: 'Description',
                value: insight.description,
                short: false
              },
              {
                title: 'Expected Outcome',
                value: insight.expectedOutcome,
                short: false
              }
            ],
            footer: 'HalluciFix Business Intelligence'
          }
        ]
      };

      if (slackChannel.config.webhookUrl) {
        await fetch(slackChannel.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    }
  }

  /**
   * Helper methods
   */
  private getMetricValue(report: BusinessReport, metricName: string): number | null {
    const metricPaths: Record<string, string> = {
      'mrr': 'revenue.mrr',
      'arr': 'revenue.arr',
      'arpu': 'revenue.arpu',
      'churnRate': 'revenue.churnRate',
      'activeUsers': 'engagement.activeUsers',
      'sessionDuration': 'engagement.sessionDuration',
      'conversionRate': 'conversion.overallConversionRate',
      'averageResponseTime': 'performance.averageResponseTime',
      'accuracyScore': 'quality.accuracyScore'
    };

    const path = metricPaths[metricName];
    if (!path) return null;

    const pathParts = path.split('.');
    let value: any = report.metrics;
    
    for (const part of pathParts) {
      value = value?.[part];
      if (value === undefined) return null;
    }

    return typeof value === 'number' ? value : null;
  }

  private async getHistoricalValue(metric: string, timeWindow: string): Promise<number | null> {
    // Mock historical data - in real implementation, query historical metrics
    return null;
  }

  private async detectAnomaly(metric: string, value: number): Promise<boolean> {
    // Mock anomaly detection - in real implementation, use statistical methods
    return Math.random() < 0.1; // 10% chance of anomaly for demo
  }

  private shouldTriggerAlert(ruleId: string, cooldownMinutes: number): boolean {
    const lastAlert = this.lastAlertTimes.get(ruleId);
    if (!lastAlert) return true;

    const cooldownMs = cooldownMinutes * 60 * 1000;
    return Date.now() - lastAlert.getTime() > cooldownMs;
  }

  private assessBusinessImpact(metric: string, currentValue: number, threshold: number): BusinessAlert['businessImpact'] {
    const deviation = Math.abs(currentValue - threshold) / threshold;
    
    if (deviation > 0.2) return 'high';
    if (deviation > 0.1) return 'medium';
    return 'low';
  }

  private generateActionItems(metric: string, condition: string, currentValue: number, threshold: number): string[] {
    const actionMap: Record<string, string[]> = {
      'mrr': [
        'Review recent churn and new customer acquisition',
        'Analyze pricing strategy effectiveness',
        'Check for payment failures or billing issues'
      ],
      'activeUsers': [
        'Review user acquisition channels',
        'Check for technical issues affecting access',
        'Analyze user engagement patterns'
      ],
      'conversionRate': [
        'A/B test landing page variations',
        'Review funnel drop-off points',
        'Optimize call-to-action placement'
      ],
      'averageResponseTime': [
        'Check server resource utilization',
        'Review database query performance',
        'Analyze recent code deployments'
      ]
    };

    return actionMap[metric] || [
      'Investigate recent changes',
      'Review related metrics',
      'Consult with relevant team members'
    ];
  }

  private generateTrendActionItems(trend: any): string[] {
    const isNegative = this.isNegativeTrend(trend.metric) && trend.direction === 'down';
    
    if (isNegative) {
      return [
        `Investigate root cause of declining ${trend.metric}`,
        'Review recent changes that might impact this metric',
        'Implement corrective measures immediately',
        'Monitor closely for further deterioration'
      ];
    } else {
      return [
        `Analyze factors contributing to positive ${trend.metric} trend`,
        'Document successful strategies for replication',
        'Consider scaling successful initiatives',
        'Monitor sustainability of the trend'
      ];
    }
  }

  private isNegativeTrend(metric: string): boolean {
    const negativeMetrics = ['churnRate', 'bounceRate', 'averageResponseTime', 'errorRate', 'supportTickets'];
    return negativeMetrics.includes(metric);
  }

  private passesChannelFilters(alert: BusinessAlert, channel: NotificationChannel): boolean {
    const filters = channel.filters;
    
    if (filters.severity && !filters.severity.includes(alert.severity)) {
      return false;
    }
    
    if (filters.metrics && !filters.metrics.includes(alert.metric)) {
      return false;
    }
    
    if (filters.tags) {
      for (const [key, value] of Object.entries(filters.tags)) {
        if (alert.tags[key] !== value) {
          return false;
        }
      }
    }
    
    return true;
  }

  private updateGoalsFromReport(report: BusinessReport): void {
    // Update goal progress based on current metrics
    this.businessGoals.forEach((goal, goalId) => {
      const currentValue = this.getMetricValue(report, goal.metric);
      if (currentValue !== null) {
        this.updateGoalProgress(goalId, currentValue);
      }
    });
  }

  private startAlertMonitoring(): void {
    // Start periodic monitoring
    setInterval(async () => {
      try {
        const report = await businessMetricsReporting.generateBusinessReport('1h');
        await this.processMetrics(report);
      } catch (error) {
        logger.error("Error in alert monitoring:", error instanceof Error ? error : new Error(String(error)));
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  private setupDefaultAlertRules(): void {
    // Revenue alerts
    this.addAlertRule({
      id: 'mrr_decline',
      name: 'MRR Decline',
      metric: 'mrr',
      condition: 'change_percent',
      threshold: -5, // Alert if MRR drops by more than 5%
      timeWindow: '24h',
      severity: 'critical',
      channels: ['email', 'slack', 'pagerduty'],
      enabled: true,
      cooldownPeriod: 60,
      tags: { category: 'revenue', priority: 'high' },
      businessContext: {
        impact: 'Direct revenue impact, affects company growth',
        stakeholders: ['CEO', 'CFO', 'Head of Sales'],
        escalationPath: ['Sales Manager', 'VP Sales', 'CEO']
      }
    });

    // Engagement alerts
    this.addAlertRule({
      id: 'low_active_users',
      name: 'Low Active Users',
      metric: 'activeUsers',
      condition: 'below',
      threshold: 100,
      timeWindow: '1h',
      severity: 'warning',
      channels: ['email', 'slack'],
      enabled: true,
      cooldownPeriod: 30,
      tags: { category: 'engagement', priority: 'medium' }
    });

    // Performance alerts
    this.addAlertRule({
      id: 'high_response_time',
      name: 'High Response Time',
      metric: 'averageResponseTime',
      condition: 'above',
      threshold: 3000, // 3 seconds
      timeWindow: '15m',
      severity: 'warning',
      channels: ['slack', 'pagerduty'],
      enabled: true,
      cooldownPeriod: 15,
      tags: { category: 'performance', priority: 'high' }
    });
  }

  private setupDefaultGoals(): void {
    this.addBusinessGoal({
      id: 'q4_mrr_goal',
      name: 'Q4 MRR Target',
      metric: 'mrr',
      target: 15000,
      timeframe: 'quarterly',
      priority: 'high',
      owner: 'Head of Sales',
      department: 'Sales',
      status: 'on_track',
      progress: 83, // 12450 / 15000 * 100
      deadline: new Date('2024-12-31'),
      milestones: [
        { name: 'October Target', target: 13000, deadline: new Date('2024-10-31'), completed: false },
        { name: 'November Target', target: 14000, deadline: new Date('2024-11-30'), completed: false },
        { name: 'December Target', target: 15000, deadline: new Date('2024-12-31'), completed: false }
      ]
    });

    this.addBusinessGoal({
      id: 'conversion_rate_goal',
      name: 'Improve Conversion Rate',
      metric: 'conversionRate',
      target: 5.0,
      timeframe: 'quarterly',
      priority: 'medium',
      owner: 'Head of Growth',
      department: 'Growth',
      status: 'on_track',
      progress: 70, // Assuming current rate is 3.5%
      deadline: new Date('2024-12-31'),
      milestones: [
        { name: 'Funnel Optimization', target: 4.0, deadline: new Date('2024-11-15'), completed: false },
        { name: 'A/B Test Implementation', target: 4.5, deadline: new Date('2024-12-01'), completed: false },
        { name: 'Final Target', target: 5.0, deadline: new Date('2024-12-31'), completed: false }
      ]
    });
  }

  private setupDefaultChannels(): void {
    this.addNotificationChannel({
      id: 'email',
      type: 'email',
      name: 'Email Notifications',
      config: {
        recipients: ['alerts@hallucifix.com', 'team@hallucifix.com']
      },
      enabled: true,
      filters: {
        severity: ['critical', 'warning']
      }
    });

    this.addNotificationChannel({
      id: 'slack',
      type: 'slack',
      name: 'Slack Alerts',
      config: {
        webhookUrl: import.meta.env.VITE_SLACK_WEBHOOK_URL || ''
      },
      enabled: true,
      filters: {}
    });

    this.addNotificationChannel({
      id: 'pagerduty',
      type: 'pagerduty',
      name: 'PagerDuty Critical Alerts',
      config: {
        integrationKey: import.meta.env.VITE_PAGERDUTY_INTEGRATION_KEY || ''
      },
      enabled: true,
      filters: {
        severity: ['critical']
      }
    });
  }

  /**
   * Public API methods
   */
  getActiveAlerts(): BusinessAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertHistory(limit: number = 50): BusinessAlert[] {
    return this.alertHistory.slice(-limit);
  }

  getBusinessGoals(): BusinessGoal[] {
    return Array.from(this.businessGoals.values());
  }

  getInsights(): InsightRecommendation[] {
    const allInsights: InsightRecommendation[] = [];
    this.insightCache.forEach(insights => allInsights.push(...insights));
    return allInsights.sort((a, b) => a.priority - b.priority);
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.status = 'acknowledged';
      this.activeAlerts.set(alertId, alert);
    }
  }

  resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.status = 'resolved';
      this.activeAlerts.delete(alertId);
    }
  }
}

// Export singleton instance
export const businessAlerting = new BusinessAlerting();
export default businessAlerting;