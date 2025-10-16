/**
 * Error Recovery Tracking System
 * Tracks error recovery attempts, success rates, and user preferences
 */

import { ApiError, ErrorType, ErrorSeverity, ErrorAction } from './types';

export interface RecoveryAttempt {
  errorId: string;
  errorType: ErrorType;
  errorSeverity: ErrorSeverity;
  attemptId: string;
  timestamp: number;
  recoveryAction: string;
  successful: boolean;
  recoveryTime?: number; // milliseconds from error to recovery
  userInitiated: boolean;
  context: {
    url: string;
    userAgent: string;
    sessionId: string;
    userId?: string;
  };
}

export interface RecoveryMetrics {
  errorType: ErrorType;
  totalAttempts: number;
  successfulAttempts: number;
  successRate: number;
  averageRecoveryTime: number;
  mostEffectiveActions: Array<{
    action: string;
    successRate: number;
    usage: number;
  }>;
  commonFailureReasons: string[];
  lastUpdated: number;
}

export interface UserRecoveryPreferences {
  userId?: string;
  sessionId: string;
  preferences: {
    autoRetry: boolean;
    maxAutoRetries: number;
    preferredRecoveryActions: string[];
    dismissedErrorTypes: ErrorType[];
    notificationSettings: {
      showRecoveryTips: boolean;
      showSuccessMessages: boolean;
      reminderInterval: number; // minutes
    };
  };
  lastUpdated: number;
}

class RecoveryTracker {
  private attemptsKey = 'hallucifix_recovery_attempts';
  private metricsKey = 'hallucifix_recovery_metrics';
  private preferencesKey = 'hallucifix_recovery_preferences';
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.cleanupOldData();
  }

  /**
   * Record a recovery attempt
   */
  recordAttempt(
    error: ApiError,
    recoveryAction: string,
    successful: boolean,
    userInitiated: boolean = true,
    recoveryTime?: number
  ): string {
    const attemptId = this.generateAttemptId();
    
    const attempt: RecoveryAttempt = {
      errorId: error.errorId,
      errorType: error.type,
      errorSeverity: error.severity,
      attemptId,
      timestamp: Date.now(),
      recoveryAction,
      successful,
      recoveryTime,
      userInitiated,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        sessionId: this.sessionId,
        userId: this.getCurrentUserId()
      }
    };

    this.saveAttempt(attempt);
    this.updateMetrics(attempt);
    
    return attemptId;
  }

  /**
   * Mark a recovery attempt as successful
   */
  markAttemptSuccessful(attemptId: string, recoveryTime?: number): void {
    const attempts = this.getAttempts();
    const attempt = attempts.find(a => a.attemptId === attemptId);
    
    if (attempt) {
      attempt.successful = true;
      if (recoveryTime) {
        attempt.recoveryTime = recoveryTime;
      }
      
      this.saveAttempts(attempts);
      this.updateMetrics(attempt);
    }
  }

  /**
   * Get recovery metrics for an error type
   */
  getMetrics(errorType?: ErrorType): RecoveryMetrics[] {
    try {
      const stored = localStorage.getItem(this.metricsKey);
      if (!stored) return [];
      
      const metrics: RecoveryMetrics[] = JSON.parse(stored);
      
      if (errorType) {
        return metrics.filter(m => m.errorType === errorType);
      }
      
      return metrics;
    } catch (error) {
      console.error('Failed to load recovery metrics:', error);
      return [];
    }
  }

  /**
   * Get success rate for a specific error type and recovery action
   */
  getActionSuccessRate(errorType: ErrorType, action: string): number {
    const attempts = this.getAttempts().filter(
      a => a.errorType === errorType && a.recoveryAction === action
    );
    
    if (attempts.length === 0) return 0;
    
    const successful = attempts.filter(a => a.successful).length;
    return (successful / attempts.length) * 100;
  }

  /**
   * Get recommended recovery actions for an error type
   */
  getRecommendedActions(errorType: ErrorType): Array<{
    action: string;
    successRate: number;
    confidence: number;
  }> {
    const metrics = this.getMetrics(errorType);
    
    if (metrics.length === 0) {
      return this.getDefaultActions(errorType);
    }
    
    const metric = metrics[0];
    return metric.mostEffectiveActions
      .map(action => ({
        action: action.action,
        successRate: action.successRate,
        confidence: Math.min(action.usage / 10, 1) // Confidence based on usage
      }))
      .sort((a, b) => (b.successRate * b.confidence) - (a.successRate * a.confidence))
      .slice(0, 5);
  }

  /**
   * Get user recovery preferences
   */
  getUserPreferences(): UserRecoveryPreferences | null {
    try {
      const stored = localStorage.getItem(this.preferencesKey);
      if (!stored) return null;
      
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to load user preferences:', error);
      return null;
    }
  }

  /**
   * Update user recovery preferences
   */
  updateUserPreferences(preferences: Partial<UserRecoveryPreferences['preferences']>): void {
    const current = this.getUserPreferences();
    
    const updated: UserRecoveryPreferences = {
      userId: this.getCurrentUserId(),
      sessionId: this.sessionId,
      preferences: {
        autoRetry: true,
        maxAutoRetries: 3,
        preferredRecoveryActions: [],
        dismissedErrorTypes: [],
        notificationSettings: {
          showRecoveryTips: true,
          showSuccessMessages: true,
          reminderInterval: 30
        },
        ...(current?.preferences || {}),
        ...preferences
      },
      lastUpdated: Date.now()
    };

    try {
      localStorage.setItem(this.preferencesKey, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save user preferences:', error);
    }
  }

  /**
   * Check if auto-retry should be attempted
   */
  shouldAutoRetry(error: ApiError): boolean {
    const preferences = this.getUserPreferences();
    
    if (!preferences?.preferences.autoRetry) {
      return false;
    }

    // Don't auto-retry certain error types
    if ([ErrorType.AUTHENTICATION, ErrorType.AUTHORIZATION, ErrorType.VALIDATION].includes(error.type)) {
      return false;
    }

    // Check if max retries exceeded
    const recentAttempts = this.getRecentAttempts(error.errorId, 5 * 60 * 1000); // 5 minutes
    const autoRetries = recentAttempts.filter(a => !a.userInitiated);
    
    return autoRetries.length < preferences.preferences.maxAutoRetries;
  }

  /**
   * Get recovery success rate summary
   */
  getSuccessRateSummary(): {
    overall: number;
    byErrorType: Record<ErrorType, number>;
    bySeverity: Record<ErrorSeverity, number>;
    byAction: Record<string, number>;
    totalAttempts: number;
    successfulAttempts: number;
  } {
    const attempts = this.getAttempts();
    const successful = attempts.filter(a => a.successful);
    
    const overall = attempts.length > 0 ? (successful.length / attempts.length) * 100 : 0;
    
    // Group by error type
    const byErrorType: Record<ErrorType, number> = {} as Record<ErrorType, number>;
    Object.values(ErrorType).forEach(type => {
      const typeAttempts = attempts.filter(a => a.errorType === type);
      const typeSuccessful = typeAttempts.filter(a => a.successful);
      byErrorType[type] = typeAttempts.length > 0 ? (typeSuccessful.length / typeAttempts.length) * 100 : 0;
    });

    // Group by severity
    const bySeverity: Record<ErrorSeverity, number> = {} as Record<ErrorSeverity, number>;
    Object.values(ErrorSeverity).forEach(severity => {
      const severityAttempts = attempts.filter(a => a.errorSeverity === severity);
      const severitySuccessful = severityAttempts.filter(a => a.successful);
      bySeverity[severity] = severityAttempts.length > 0 ? (severitySuccessful.length / severityAttempts.length) * 100 : 0;
    });

    // Group by action
    const byAction: Record<string, number> = {};
    const actionGroups = this.groupBy(attempts, 'recoveryAction');
    Object.entries(actionGroups).forEach(([action, actionAttempts]) => {
      const actionSuccessful = actionAttempts.filter(a => a.successful);
      byAction[action] = (actionSuccessful.length / actionAttempts.length) * 100;
    });

    return {
      overall,
      byErrorType,
      bySeverity,
      byAction,
      totalAttempts: attempts.length,
      successfulAttempts: successful.length
    };
  }

  /**
   * Export recovery data for analysis
   */
  exportRecoveryData(): {
    attempts: RecoveryAttempt[];
    metrics: RecoveryMetrics[];
    preferences: UserRecoveryPreferences | null;
    summary: ReturnType<RecoveryTracker['getSuccessRateSummary']>;
  } {
    return {
      attempts: this.getAttempts(),
      metrics: this.getMetrics(),
      preferences: this.getUserPreferences(),
      summary: this.getSuccessRateSummary()
    };
  }

  /**
   * Clear all recovery data
   */
  clearAllData(): void {
    localStorage.removeItem(this.attemptsKey);
    localStorage.removeItem(this.metricsKey);
    localStorage.removeItem(this.preferencesKey);
  }

  private generateSessionId(): string {
    return `recovery_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAttemptId(): string {
    return `attempt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentUserId(): string | undefined {
    // This would integrate with your auth system
    // For now, return undefined or a session-based ID
    return undefined;
  }

  private getAttempts(): RecoveryAttempt[] {
    try {
      const stored = localStorage.getItem(this.attemptsKey);
      if (!stored) return [];
      
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to load recovery attempts:', error);
      return [];
    }
  }

  private saveAttempt(attempt: RecoveryAttempt): void {
    const attempts = this.getAttempts();
    attempts.push(attempt);
    
    // Keep only recent attempts (last 1000 or 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentAttempts = attempts
      .filter(a => a.timestamp > thirtyDaysAgo)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 1000);
    
    this.saveAttempts(recentAttempts);
  }

  private saveAttempts(attempts: RecoveryAttempt[]): void {
    try {
      localStorage.setItem(this.attemptsKey, JSON.stringify(attempts));
    } catch (error) {
      console.error('Failed to save recovery attempts:', error);
    }
  }

  private updateMetrics(attempt: RecoveryAttempt): void {
    const metrics = this.getMetrics();
    let metric = metrics.find(m => m.errorType === attempt.errorType);
    
    if (!metric) {
      metric = {
        errorType: attempt.errorType,
        totalAttempts: 0,
        successfulAttempts: 0,
        successRate: 0,
        averageRecoveryTime: 0,
        mostEffectiveActions: [],
        commonFailureReasons: [],
        lastUpdated: Date.now()
      };
      metrics.push(metric);
    }

    // Update basic metrics
    metric.totalAttempts++;
    if (attempt.successful) {
      metric.successfulAttempts++;
    }
    metric.successRate = (metric.successfulAttempts / metric.totalAttempts) * 100;
    
    // Update average recovery time
    if (attempt.successful && attempt.recoveryTime) {
      const currentAvg = metric.averageRecoveryTime || 0;
      const count = metric.successfulAttempts;
      metric.averageRecoveryTime = ((currentAvg * (count - 1)) + attempt.recoveryTime) / count;
    }

    // Update most effective actions
    this.updateEffectiveActions(metric, attempt);
    
    metric.lastUpdated = Date.now();
    
    try {
      localStorage.setItem(this.metricsKey, JSON.stringify(metrics));
    } catch (error) {
      console.error('Failed to save recovery metrics:', error);
    }
  }

  private updateEffectiveActions(metric: RecoveryMetrics, attempt: RecoveryAttempt): void {
    let actionMetric = metric.mostEffectiveActions.find(a => a.action === attempt.recoveryAction);
    
    if (!actionMetric) {
      actionMetric = {
        action: attempt.recoveryAction,
        successRate: 0,
        usage: 0
      };
      metric.mostEffectiveActions.push(actionMetric);
    }

    actionMetric.usage++;
    
    // Recalculate success rate for this action
    const attempts = this.getAttempts().filter(
      a => a.errorType === attempt.errorType && a.recoveryAction === attempt.recoveryAction
    );
    const successful = attempts.filter(a => a.successful).length;
    actionMetric.successRate = (successful / attempts.length) * 100;
    
    // Sort by success rate and limit to top 10
    metric.mostEffectiveActions = metric.mostEffectiveActions
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 10);
  }

  private getRecentAttempts(errorId: string, timeWindow: number): RecoveryAttempt[] {
    const cutoff = Date.now() - timeWindow;
    return this.getAttempts().filter(
      a => a.errorId === errorId && a.timestamp > cutoff
    );
  }

  private getDefaultActions(errorType: ErrorType): Array<{
    action: string;
    successRate: number;
    confidence: number;
  }> {
    const defaults: Record<ErrorType, string[]> = {
      [ErrorType.NETWORK]: ['refresh', 'retry', 'check_connection'],
      [ErrorType.AUTHENTICATION]: ['login', 'refresh_token'],
      [ErrorType.AUTHORIZATION]: ['contact_admin', 'go_home'],
      [ErrorType.VALIDATION]: ['fix_input', 'clear_form'],
      [ErrorType.SERVER]: ['retry', 'wait_and_retry', 'contact_support'],
      [ErrorType.RATE_LIMIT]: ['wait', 'reduce_frequency'],
      [ErrorType.TIMEOUT]: ['retry', 'check_connection'],
      [ErrorType.CONNECTIVITY]: ['check_connection', 'retry'],
      [ErrorType.SESSION_EXPIRED]: ['login', 'refresh_session'],
      [ErrorType.CLIENT]: ['refresh', 'clear_cache'],
      [ErrorType.INVALID_INPUT]: ['fix_input', 'validate_data'],
      [ErrorType.SERVICE_UNAVAILABLE]: ['wait_and_retry', 'check_status'],
      [ErrorType.ANALYSIS_ERROR]: ['retry', 'check_file'],
      [ErrorType.FILE_PROCESSING_ERROR]: ['check_file', 'try_different_file'],
      [ErrorType.GOOGLE_DRIVE_ERROR]: ['reconnect_drive', 'check_permissions'],
      [ErrorType.UNKNOWN]: ['refresh', 'contact_support']
    };

    return (defaults[errorType] || defaults[ErrorType.UNKNOWN]).map(action => ({
      action,
      successRate: 50, // Default assumption
      confidence: 0.1 // Low confidence for defaults
    }));
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const group = String(item[key]);
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  private cleanupOldData(): void {
    // Clean up old attempts (older than 30 days)
    const attempts = this.getAttempts();
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentAttempts = attempts.filter(a => a.timestamp > thirtyDaysAgo);
    
    if (recentAttempts.length !== attempts.length) {
      this.saveAttempts(recentAttempts);
    }
  }
}

// Singleton instance
export const recoveryTracker = new RecoveryTracker();

// React hook for using recovery tracking
export const useRecoveryTracker = () => {
  return {
    recordAttempt: recoveryTracker.recordAttempt.bind(recoveryTracker),
    markAttemptSuccessful: recoveryTracker.markAttemptSuccessful.bind(recoveryTracker),
    getMetrics: recoveryTracker.getMetrics.bind(recoveryTracker),
    getActionSuccessRate: recoveryTracker.getActionSuccessRate.bind(recoveryTracker),
    getRecommendedActions: recoveryTracker.getRecommendedActions.bind(recoveryTracker),
    getUserPreferences: recoveryTracker.getUserPreferences.bind(recoveryTracker),
    updateUserPreferences: recoveryTracker.updateUserPreferences.bind(recoveryTracker),
    shouldAutoRetry: recoveryTracker.shouldAutoRetry.bind(recoveryTracker),
    getSuccessRateSummary: recoveryTracker.getSuccessRateSummary.bind(recoveryTracker),
    exportRecoveryData: recoveryTracker.exportRecoveryData.bind(recoveryTracker),
    clearAllData: recoveryTracker.clearAllData.bind(recoveryTracker)
  };
};