/**
 * Feature Flag Logging and Analytics Service
 * Provides comprehensive logging, usage tracking, and analytics for feature flags
 */

import { FeatureFlagKey, FeatureFlagValue, FeatureFlagOverride } from './featureFlags.js';

import { logger } from './logging';
export interface FeatureFlagEvent {
  type: 'evaluation' | 'override_set' | 'override_removed' | 'initialization' | 'error';
  flagKey?: FeatureFlagKey;
  timestamp: number;
  value?: boolean;
  source?: string;
  metadata?: Record<string, any>;
  context?: {
    userId?: string;
    sessionId?: string;
    userAgent?: string;
    url?: string;
    environment: string;
  };
}

export interface FeatureFlagUsageStats {
  flagKey: FeatureFlagKey;
  evaluationCount: number;
  trueCount: number;
  falseCount: number;
  lastEvaluated: number;
  sources: Record<string, number>;
  overrideCount: number;
  errorCount: number;
}

export interface FeatureFlagAnalytics {
  totalEvaluations: number;
  totalOverrides: number;
  totalErrors: number;
  sessionStart: number;
  flagStats: Record<FeatureFlagKey, FeatureFlagUsageStats>;
  recentEvents: FeatureFlagEvent[];
}

/**
 * Feature Flag Logger
 * Handles logging, analytics, and usage tracking for feature flags
 */
export class FeatureFlagLogger {
  private static instance: FeatureFlagLogger;
  private events: FeatureFlagEvent[] = [];
  private analytics: FeatureFlagAnalytics;
  private sessionId: string;
  private maxEvents = 1000; // Keep last 1000 events
  private isEnabled: boolean;

  private constructor() {
    this.sessionId = this.generateSessionId();
    // Enable logging in development or when analytics are enabled via environment variables
    const isDevelopment = import.meta.env.MODE === 'development';
    const analyticsEnabled = import.meta.env.VITE_ENABLE_ANALYTICS === 'true';
    this.isEnabled = isDevelopment || analyticsEnabled;
    this.analytics = this.initializeAnalytics();
    
    // Set up periodic analytics reporting in development
    if (isDevelopment) {
      this.setupPeriodicReporting();
    }
  }

  static getInstance(): FeatureFlagLogger {
    if (!FeatureFlagLogger.instance) {
      FeatureFlagLogger.instance = new FeatureFlagLogger();
    }
    return FeatureFlagLogger.instance;
  }

  /**
   * Log a feature flag evaluation
   */
  logEvaluation(
    flagKey: FeatureFlagKey,
    value: FeatureFlagValue,
    context?: {
      userId?: string;
      customProperties?: Record<string, any>;
    }
  ): void {
    if (!this.isEnabled) return;

    const event: FeatureFlagEvent = {
      type: 'evaluation',
      flagKey,
      timestamp: Date.now(),
      value: value.enabled,
      source: value.source,
      metadata: value.metadata,
      context: {
        userId: context?.userId,
        sessionId: this.sessionId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        environment: import.meta.env.MODE || 'development'
      }
    };

    this.addEvent(event);
    this.updateAnalytics(event);

    // Log to console in development with detailed information
    if (import.meta.env.MODE === 'development') {
      console.log(`[FeatureFlag] 📊 ${flagKey}:`, {
        enabled: value.enabled,
        source: value.source,
        evaluationCount: this.analytics.flagStats[flagKey]?.evaluationCount || 1,
        lastUpdated: new Date(value.lastUpdated).toISOString()
      });
    }
  }

  /**
   * Log a feature flag override being set
   */
  logOverrideSet(
    flagKey: FeatureFlagKey,
    enabled: boolean,
    source: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.isEnabled) return;

    const event: FeatureFlagEvent = {
      type: 'override_set',
      flagKey,
      timestamp: Date.now(),
      value: enabled,
      source,
      metadata,
      context: {
        sessionId: this.sessionId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        environment: import.meta.env.MODE || 'development'
      }
    };

    this.addEvent(event);
    this.updateAnalytics(event);

    if (import.meta.env.MODE === 'development') {
      console.log(`[FeatureFlag] 🔧 Override set for ${flagKey}:`, {
        enabled,
        source,
        metadata,
        totalOverrides: this.analytics.totalOverrides
      });
    }
  }

  /**
   * Log a feature flag override being removed
   */
  logOverrideRemoved(flagKey: FeatureFlagKey): void {
    if (!this.isEnabled) return;

    const event: FeatureFlagEvent = {
      type: 'override_removed',
      flagKey,
      timestamp: Date.now(),
      context: {
        sessionId: this.sessionId,
        environment: import.meta.env.MODE || 'development'
      }
    };

    this.addEvent(event);
    this.updateAnalytics(event);

    if (import.meta.env.MODE === 'development') {
      console.log(`[FeatureFlag] 🗑️ Override removed for ${flagKey}`);
    }
  }

  /**
   * Log feature flag system initialization
   */
  logInitialization(metadata?: Record<string, any>): void {
    if (!this.isEnabled) return;

    const event: FeatureFlagEvent = {
      type: 'initialization',
      timestamp: Date.now(),
      metadata,
      context: {
        sessionId: this.sessionId,
        environment: import.meta.env.MODE || 'development'
      }
    };

    this.addEvent(event);

    if (import.meta.env.MODE === 'development') {
      logger.info("[FeatureFlag] 🚀 Feature flag system initialized", { metadata });
    }
  }

  /**
   * Log a feature flag error
   */
  logError(
    error: Error,
    flagKey?: FeatureFlagKey,
    metadata?: Record<string, any>
  ): void {
    if (!this.isEnabled) return;

    const event: FeatureFlagEvent = {
      type: 'error',
      flagKey,
      timestamp: Date.now(),
      metadata: {
        error: error.message,
        stack: error.stack,
        ...metadata
      },
      context: {
        sessionId: this.sessionId,
        environment: import.meta.env.MODE || 'development'
      }
    };

    this.addEvent(event);
    this.updateAnalytics(event);

    console.error(`[FeatureFlag] ❌ Error${flagKey ? ` for ${flagKey}` : ''}:`, error);
  }

  /**
   * Get current analytics data
   */
  getAnalytics(): FeatureFlagAnalytics {
    return { ...this.analytics };
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 50): FeatureFlagEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Get usage statistics for a specific flag
   */
  getFlagStats(flagKey: FeatureFlagKey): FeatureFlagUsageStats | null {
    return this.analytics.flagStats[flagKey] || null;
  }

  /**
   * Export analytics data for debugging
   */
  exportAnalytics(): string {
    const exportData = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      environment: import.meta.env.MODE || 'development',
      analytics: this.analytics,
      recentEvents: this.getRecentEvents(100)
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Generate a summary report
   */
  generateSummaryReport(): string {
    const { analytics } = this;
    const sessionDuration = Date.now() - analytics.sessionStart;
    const sessionMinutes = Math.round(sessionDuration / 60000);

    let report = `🚩 Feature Flag Usage Report\n`;
    report += `Session Duration: ${sessionMinutes} minutes\n`;
    report += `Total Evaluations: ${analytics.totalEvaluations}\n`;
    report += `Total Overrides: ${analytics.totalOverrides}\n`;
    report += `Total Errors: ${analytics.totalErrors}\n\n`;

    report += `Flag Statistics:\n`;
    Object.entries(analytics.flagStats).forEach(([key, stats]) => {
      const truePercentage = stats.evaluationCount > 0 
        ? Math.round((stats.trueCount / stats.evaluationCount) * 100)
        : 0;
      
      report += `  ${key}:\n`;
      report += `    Evaluations: ${stats.evaluationCount}\n`;
      report += `    True: ${stats.trueCount} (${truePercentage}%)\n`;
      report += `    False: ${stats.falseCount}\n`;
      report += `    Overrides: ${stats.overrideCount}\n`;
      report += `    Errors: ${stats.errorCount}\n`;
      report += `    Sources: ${Object.entries(stats.sources).map(([s, c]) => `${s}(${c})`).join(', ')}\n\n`;
    });

    return report;
  }

  /**
   * Clear all analytics data
   */
  clearAnalytics(): void {
    this.events = [];
    this.analytics = this.initializeAnalytics();
    
    if (import.meta.env.MODE === 'development') {
      logger.debug("[FeatureFlag] 🧹 Analytics data cleared");
    }
  }

  private initializeAnalytics(): FeatureFlagAnalytics {
    return {
      totalEvaluations: 0,
      totalOverrides: 0,
      totalErrors: 0,
      sessionStart: Date.now(),
      flagStats: {} as Record<FeatureFlagKey, FeatureFlagUsageStats>,
      recentEvents: []
    };
  }

  private addEvent(event: FeatureFlagEvent): void {
    this.events.push(event);
    
    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Update recent events in analytics
    this.analytics.recentEvents = this.events.slice(-50);
  }

  private updateAnalytics(event: FeatureFlagEvent): void {
    switch (event.type) {
      case 'evaluation':
        this.analytics.totalEvaluations++;
        if (event.flagKey) {
          this.updateFlagStats(event.flagKey, event);
        }
        break;
      
      case 'override_set':
      case 'override_removed':
        this.analytics.totalOverrides++;
        if (event.flagKey) {
          this.ensureFlagStats(event.flagKey);
          this.analytics.flagStats[event.flagKey].overrideCount++;
        }
        break;
      
      case 'error':
        this.analytics.totalErrors++;
        if (event.flagKey) {
          this.ensureFlagStats(event.flagKey);
          this.analytics.flagStats[event.flagKey].errorCount++;
        }
        break;
    }
  }

  private updateFlagStats(flagKey: FeatureFlagKey, event: FeatureFlagEvent): void {
    this.ensureFlagStats(flagKey);
    
    const stats = this.analytics.flagStats[flagKey];
    stats.evaluationCount++;
    stats.lastEvaluated = event.timestamp;
    
    if (event.value === true) {
      stats.trueCount++;
    } else if (event.value === false) {
      stats.falseCount++;
    }
    
    if (event.source) {
      stats.sources[event.source] = (stats.sources[event.source] || 0) + 1;
    }
  }

  private ensureFlagStats(flagKey: FeatureFlagKey): void {
    if (!this.analytics.flagStats[flagKey]) {
      this.analytics.flagStats[flagKey] = {
        flagKey,
        evaluationCount: 0,
        trueCount: 0,
        falseCount: 0,
        lastEvaluated: 0,
        sources: {},
        overrideCount: 0,
        errorCount: 0
      };
    }
  }

  private generateSessionId(): string {
    return `ff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupPeriodicReporting(): void {
    // Log summary every 5 minutes in development
    setInterval(() => {
      if (this.analytics.totalEvaluations > 0) {
        console.group('🚩 Feature Flag Usage Summary');
        console.log(this.generateSummaryReport());
        console.groupEnd();
      }
    }, 5 * 60 * 1000);
  }
}

// Export singleton instance
export const featureFlagLogger = FeatureFlagLogger.getInstance();