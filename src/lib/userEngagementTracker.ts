import { businessMetricsMonitor } from './businessMetricsMonitor';
import { performanceMonitor } from './performanceMonitor';

export interface UserSession {
  sessionId: string;
  userId?: string;
  startTime: Date;
  lastActivity: Date;
  pageViews: number;
  interactions: number;
  featuresUsed: Set<string>;
  conversionEvents: string[];
  referrer?: string;
  userAgent?: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  isActive: boolean;
}

export interface UserInteraction {
  type: 'click' | 'scroll' | 'form_submit' | 'file_upload' | 'analysis_start' | 'analysis_complete' | 'feature_use';
  element?: string;
  feature?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface FeatureUsage {
  featureName: string;
  usageCount: number;
  totalDuration: number;
  averageDuration: number;
  uniqueUsers: Set<string>;
  lastUsed: Date;
  adoptionRate: number;
}

export interface UserJourney {
  userId: string;
  sessionId: string;
  steps: Array<{
    step: string;
    timestamp: Date;
    duration?: number;
    metadata?: Record<string, any>;
  }>;
  conversionGoal?: string;
  completed: boolean;
}

export interface ConversionFunnel {
  name: string;
  steps: string[];
  conversions: Map<string, number>;
  dropoffRates: Map<string, number>;
  averageTimeToConvert: number;
}

/**
 * User engagement and feature usage tracking service
 */
export class UserEngagementTracker {
  private sessions: Map<string, UserSession> = new Map();
  private featureUsage: Map<string, FeatureUsage> = new Map();
  private userJourneys: Map<string, UserJourney> = new Map();
  private conversionFunnels: Map<string, ConversionFunnel> = new Map();
  private sessionTimeout: number = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startSessionCleanup();
    this.setupDefaultFunnels();
  }

  /**
   * Start a new user session
   */
  startSession(sessionId: string, userId?: string, metadata?: {
    referrer?: string;
    userAgent?: string;
    deviceType?: 'desktop' | 'mobile' | 'tablet';
  }): void {
    const session: UserSession = {
      sessionId,
      userId,
      startTime: new Date(),
      lastActivity: new Date(),
      pageViews: 0,
      interactions: 0,
      featuresUsed: new Set(),
      conversionEvents: [],
      referrer: metadata?.referrer,
      userAgent: metadata?.userAgent,
      deviceType: metadata?.deviceType || this.detectDeviceType(metadata?.userAgent),
      isActive: true
    };

    this.sessions.set(sessionId, session);

    // Track session start
    businessMetricsMonitor.trackUserEngagement(userId || 'anonymous', sessionId, {
      type: 'interaction',
      data: { interaction_type: 'session_start' }
    });

    // Track device type distribution
    performanceMonitor.recordBusinessMetric(
      'user.sessions.device_type',
      1,
      'count',
      { device_type: session.deviceType, referrer: session.referrer || 'direct' }
    );
  }

  /**
   * Track page view
   */
  trackPageView(sessionId: string, page: string, metadata?: {
    title?: string;
    loadTime?: number;
    previousPage?: string;
  }): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for page view tracking`);
      return;
    }

    session.pageViews++;
    session.lastActivity = new Date();

    // Track page view in business metrics
    businessMetricsMonitor.trackUserEngagement(session.userId || 'anonymous', sessionId, {
      type: 'page_view',
      data: { page }
    });

    // Track page performance if load time provided
    if (metadata?.loadTime) {
      performanceMonitor.recordBusinessMetric(
        'user.page_load_time',
        metadata.loadTime,
        'ms',
        { page, device_type: session.deviceType }
      );
    }

    // Track page flow
    if (metadata?.previousPage) {
      performanceMonitor.recordBusinessMetric(
        'user.page_flow',
        1,
        'count',
        { from_page: metadata.previousPage, to_page: page }
      );
    }

    this.sessions.set(sessionId, session);
  }

  /**
   * Track user interaction
   */
  trackInteraction(sessionId: string, interaction: UserInteraction): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for interaction tracking`);
      return;
    }

    session.interactions++;
    session.lastActivity = new Date();

    // Track feature usage if specified
    if (interaction.feature) {
      session.featuresUsed.add(interaction.feature);
      this.trackFeatureUsage(interaction.feature, session.userId, interaction.duration);
    }

    // Track interaction in business metrics
    businessMetricsMonitor.trackUserEngagement(session.userId || 'anonymous', sessionId, {
      type: 'interaction',
      data: {
        interaction_type: interaction.type,
        feature: interaction.feature,
        duration: interaction.duration
      }
    });

    // Track specific interaction types
    performanceMonitor.recordBusinessMetric(
      `user.interactions.${interaction.type}`,
      1,
      'count',
      {
        feature: interaction.feature || 'unknown',
        element: interaction.element || 'unknown',
        device_type: session.deviceType
      }
    );

    if (interaction.duration) {
      performanceMonitor.recordBusinessMetric(
        `user.interactions.${interaction.type}.duration`,
        interaction.duration,
        'ms',
        { feature: interaction.feature || 'unknown' }
      );
    }

    this.sessions.set(sessionId, session);
  }

  /**
   * Track feature usage
   */
  private trackFeatureUsage(featureName: string, userId?: string, duration?: number): void {
    const existing = this.featureUsage.get(featureName) || {
      featureName,
      usageCount: 0,
      totalDuration: 0,
      averageDuration: 0,
      uniqueUsers: new Set(),
      lastUsed: new Date(),
      adoptionRate: 0
    };

    existing.usageCount++;
    existing.lastUsed = new Date();

    if (userId) {
      existing.uniqueUsers.add(userId);
    }

    if (duration) {
      existing.totalDuration += duration;
      existing.averageDuration = existing.totalDuration / existing.usageCount;
    }

    // Calculate adoption rate (unique users / total users)
    const totalUsers = new Set(Array.from(this.sessions.values()).map(s => s.userId).filter(Boolean)).size;
    existing.adoptionRate = totalUsers > 0 ? (existing.uniqueUsers.size / totalUsers) * 100 : 0;

    this.featureUsage.set(featureName, existing);

    // Track in business metrics
    businessMetricsMonitor.trackUserEngagement(userId || 'anonymous', 'feature_usage', {
      type: 'feature_use',
      data: { feature: featureName, duration }
    });
  }

  /**
   * Track conversion event
   */
  trackConversion(sessionId: string, event: string, value?: number, metadata?: Record<string, any>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for conversion tracking`);
      return;
    }

    session.conversionEvents.push(event);
    session.lastActivity = new Date();

    // Track conversion in business metrics
    businessMetricsMonitor.trackConversion('main_funnel', event, {
      userId: session.userId,
      sessionId,
      value,
      source: session.referrer || 'direct'
    });

    // Update conversion funnels
    this.updateConversionFunnels(event, session, value);

    this.sessions.set(sessionId, session);
  }

  /**
   * Track user journey step
   */
  trackJourneyStep(userId: string, sessionId: string, step: string, metadata?: Record<string, any>): void {
    const journeyKey = `${userId}_${sessionId}`;
    const journey = this.userJourneys.get(journeyKey) || {
      userId,
      sessionId,
      steps: [],
      completed: false
    };

    const stepData = {
      step,
      timestamp: new Date(),
      metadata
    };

    // Calculate duration from previous step
    if (journey.steps.length > 0) {
      const previousStep = journey.steps[journey.steps.length - 1];
      stepData.duration = stepData.timestamp.getTime() - previousStep.timestamp.getTime();
    }

    journey.steps.push(stepData);
    this.userJourneys.set(journeyKey, journey);

    // Track journey step
    performanceMonitor.recordBusinessMetric(
      'user.journey.step',
      1,
      'count',
      {
        step,
        userId,
        step_number: journey.steps.length.toString()
      }
    );

    if (stepData.duration) {
      performanceMonitor.recordBusinessMetric(
        'user.journey.step_duration',
        stepData.duration,
        'ms',
        { step, userId }
      );
    }
  }

  /**
   * Complete user journey
   */
  completeJourney(userId: string, sessionId: string, conversionGoal?: string): void {
    const journeyKey = `${userId}_${sessionId}`;
    const journey = this.userJourneys.get(journeyKey);
    
    if (!journey) {
      console.warn(`Journey not found for user ${userId}, session ${sessionId}`);
      return;
    }

    journey.completed = true;
    journey.conversionGoal = conversionGoal;

    const totalDuration = journey.steps.length > 0 
      ? journey.steps[journey.steps.length - 1].timestamp.getTime() - journey.steps[0].timestamp.getTime()
      : 0;

    // Track journey completion
    performanceMonitor.recordBusinessMetric(
      'user.journey.completed',
      1,
      'count',
      {
        userId,
        steps_count: journey.steps.length.toString(),
        conversion_goal: conversionGoal || 'unknown'
      }
    );

    performanceMonitor.recordBusinessMetric(
      'user.journey.total_duration',
      totalDuration,
      'ms',
      {
        userId,
        conversion_goal: conversionGoal || 'unknown'
      }
    );

    this.userJourneys.set(journeyKey, journey);
  }

  /**
   * End user session
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.isActive = false;
    const sessionDuration = new Date().getTime() - session.startTime.getTime();

    // Track session end metrics
    businessMetricsMonitor.trackUserEngagement(session.userId || 'anonymous', sessionId, {
      type: 'time_spent',
      data: { duration: sessionDuration }
    });

    performanceMonitor.recordBusinessMetric(
      'user.session.duration',
      sessionDuration,
      'ms',
      {
        device_type: session.deviceType,
        page_views: session.pageViews.toString(),
        interactions: session.interactions.toString(),
        features_used: session.featuresUsed.size.toString()
      }
    );

    performanceMonitor.recordBusinessMetric(
      'user.session.page_views',
      session.pageViews,
      'count',
      { device_type: session.deviceType }
    );

    performanceMonitor.recordBusinessMetric(
      'user.session.interactions',
      session.interactions,
      'count',
      { device_type: session.deviceType }
    );

    performanceMonitor.recordBusinessMetric(
      'user.session.features_used',
      session.featuresUsed.size,
      'count',
      { device_type: session.deviceType }
    );

    this.sessions.set(sessionId, session);
  }

  /**
   * Get engagement analytics
   */
  getEngagementAnalytics(timeWindowMs: number = 24 * 60 * 60 * 1000): {
    totalSessions: number;
    activeSessions: number;
    averageSessionDuration: number;
    averagePageViews: number;
    averageInteractions: number;
    topFeatures: Array<{ feature: string; usage: number; adoptionRate: number }>;
    deviceDistribution: Record<string, number>;
    conversionRates: Record<string, number>;
    userJourneyInsights: {
      averageSteps: number;
      completionRate: number;
      averageTimeToComplete: number;
    };
  } {
    const cutoff = new Date(Date.now() - timeWindowMs);
    const recentSessions = Array.from(this.sessions.values())
      .filter(s => s.startTime >= cutoff);

    const activeSessions = recentSessions.filter(s => s.isActive).length;
    
    const sessionDurations = recentSessions
      .filter(s => !s.isActive)
      .map(s => new Date().getTime() - s.startTime.getTime());
    
    const averageSessionDuration = sessionDurations.length > 0 
      ? sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length 
      : 0;

    const averagePageViews = recentSessions.length > 0 
      ? recentSessions.reduce((sum, s) => sum + s.pageViews, 0) / recentSessions.length 
      : 0;

    const averageInteractions = recentSessions.length > 0 
      ? recentSessions.reduce((sum, s) => sum + s.interactions, 0) / recentSessions.length 
      : 0;

    // Top features
    const topFeatures = Array.from(this.featureUsage.values())
      .filter(f => f.lastUsed >= cutoff)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
      .map(f => ({
        feature: f.featureName,
        usage: f.usageCount,
        adoptionRate: f.adoptionRate
      }));

    // Device distribution
    const deviceDistribution = recentSessions.reduce((acc, session) => {
      acc[session.deviceType] = (acc[session.deviceType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Conversion rates
    const conversionRates: Record<string, number> = {};
    this.conversionFunnels.forEach((funnel, name) => {
      const steps = Array.from(funnel.conversions.keys()).sort();
      if (steps.length > 1) {
        const entryCount = funnel.conversions.get(steps[0]) || 0;
        const finalCount = funnel.conversions.get(steps[steps.length - 1]) || 0;
        conversionRates[name] = entryCount > 0 ? (finalCount / entryCount) * 100 : 0;
      }
    });

    // User journey insights
    const recentJourneys = Array.from(this.userJourneys.values())
      .filter(j => j.steps.length > 0 && j.steps[0].timestamp >= cutoff);

    const completedJourneys = recentJourneys.filter(j => j.completed);
    const averageSteps = recentJourneys.length > 0 
      ? recentJourneys.reduce((sum, j) => sum + j.steps.length, 0) / recentJourneys.length 
      : 0;

    const completionRate = recentJourneys.length > 0 
      ? (completedJourneys.length / recentJourneys.length) * 100 
      : 0;

    const completionTimes = completedJourneys
      .filter(j => j.steps.length > 1)
      .map(j => j.steps[j.steps.length - 1].timestamp.getTime() - j.steps[0].timestamp.getTime());

    const averageTimeToComplete = completionTimes.length > 0 
      ? completionTimes.reduce((sum, t) => sum + t, 0) / completionTimes.length 
      : 0;

    return {
      totalSessions: recentSessions.length,
      activeSessions,
      averageSessionDuration,
      averagePageViews,
      averageInteractions,
      topFeatures,
      deviceDistribution,
      conversionRates,
      userJourneyInsights: {
        averageSteps,
        completionRate,
        averageTimeToComplete
      }
    };
  }

  /**
   * Update conversion funnels
   */
  private updateConversionFunnels(event: string, session: UserSession, value?: number): void {
    this.conversionFunnels.forEach((funnel, name) => {
      if (funnel.steps.includes(event)) {
        const currentCount = funnel.conversions.get(event) || 0;
        funnel.conversions.set(event, currentCount + 1);

        // Calculate dropoff rates
        const stepIndex = funnel.steps.indexOf(event);
        if (stepIndex > 0) {
          const previousStep = funnel.steps[stepIndex - 1];
          const previousCount = funnel.conversions.get(previousStep) || 0;
          const dropoffRate = previousCount > 0 ? ((previousCount - currentCount) / previousCount) * 100 : 0;
          funnel.dropoffRates.set(event, dropoffRate);
        }
      }
    });
  }

  /**
   * Setup default conversion funnels
   */
  private setupDefaultFunnels(): void {
    // Main user acquisition funnel
    this.conversionFunnels.set('acquisition', {
      name: 'User Acquisition',
      steps: ['landing_page_view', 'signup_started', 'signup_completed', 'first_analysis'],
      conversions: new Map(),
      dropoffRates: new Map(),
      averageTimeToConvert: 0
    });

    // Analysis workflow funnel
    this.conversionFunnels.set('analysis_workflow', {
      name: 'Analysis Workflow',
      steps: ['analysis_started', 'content_uploaded', 'analysis_running', 'results_viewed', 'results_exported'],
      conversions: new Map(),
      dropoffRates: new Map(),
      averageTimeToConvert: 0
    });

    // Feature adoption funnel
    this.conversionFunnels.set('feature_adoption', {
      name: 'Feature Adoption',
      steps: ['feature_discovered', 'feature_clicked', 'feature_used', 'feature_completed'],
      conversions: new Map(),
      dropoffRates: new Map(),
      averageTimeToConvert: 0
    });
  }

  /**
   * Detect device type from user agent
   */
  private detectDeviceType(userAgent?: string): 'desktop' | 'mobile' | 'tablet' {
    if (!userAgent) return 'desktop';

    const ua = userAgent.toLowerCase();
    
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    }
    
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    }
    
    return 'desktop';
  }

  /**
   * Start periodic session cleanup
   */
  private startSessionCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const expiredSessions: string[] = [];

      this.sessions.forEach((session, sessionId) => {
        if (session.isActive && (now.getTime() - session.lastActivity.getTime()) > this.sessionTimeout) {
          session.isActive = false;
          this.endSession(sessionId);
          expiredSessions.push(sessionId);
        }
      });

      // Clean up old inactive sessions (older than 24 hours)
      const cleanupCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      this.sessions.forEach((session, sessionId) => {
        if (!session.isActive && session.lastActivity < cleanupCutoff) {
          expiredSessions.push(sessionId);
        }
      });

      expiredSessions.forEach(sessionId => {
        this.sessions.delete(sessionId);
      });

      if (expiredSessions.length > 0) {
        console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  /**
   * Stop session cleanup
   */
  stopSessionCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get feature usage report
   */
  getFeatureUsageReport(): Array<{
    feature: string;
    usageCount: number;
    uniqueUsers: number;
    averageDuration: number;
    adoptionRate: number;
    lastUsed: Date;
  }> {
    return Array.from(this.featureUsage.values())
      .map(f => ({
        feature: f.featureName,
        usageCount: f.usageCount,
        uniqueUsers: f.uniqueUsers.size,
        averageDuration: f.averageDuration,
        adoptionRate: f.adoptionRate,
        lastUsed: f.lastUsed
      }))
      .sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Get conversion funnel report
   */
  getConversionFunnelReport(): Array<{
    name: string;
    steps: Array<{
      step: string;
      conversions: number;
      dropoffRate: number;
    }>;
    overallConversionRate: number;
  }> {
    return Array.from(this.conversionFunnels.values()).map(funnel => {
      const steps = funnel.steps.map(step => ({
        step,
        conversions: funnel.conversions.get(step) || 0,
        dropoffRate: funnel.dropoffRates.get(step) || 0
      }));

      const firstStepCount = steps[0]?.conversions || 0;
      const lastStepCount = steps[steps.length - 1]?.conversions || 0;
      const overallConversionRate = firstStepCount > 0 ? (lastStepCount / firstStepCount) * 100 : 0;

      return {
        name: funnel.name,
        steps,
        overallConversionRate
      };
    });
  }

  /**
   * Clear all tracking data
   */
  clearAllData(): void {
    this.sessions.clear();
    this.featureUsage.clear();
    this.userJourneys.clear();
    this.conversionFunnels.clear();
    this.setupDefaultFunnels();
  }
}

// Export singleton instance
export const userEngagementTracker = new UserEngagementTracker();
export default userEngagementTracker;