/**
 * Error Health Check and System Diagnostics
 * Provides health monitoring endpoints and diagnostic tools
 */

import { ApiError, ErrorSeverity, ErrorType } from './types';
import { errorManager, ErrorStats } from './errorManager';
import { errorMonitor, MonitoringMetrics } from './errorMonitor';
import { incidentManager } from './incidentManager';

/**
 * Health check status
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical'
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  checks: Record<string, CheckResult>;
  summary: HealthSummary;
  recommendations: string[];
}

/**
 * Individual check result
 */
export interface CheckResult {
  status: HealthStatus;
  message: string;
  value?: number;
  threshold?: number;
  details?: Record<string, any>;
  lastChecked: string;
}

/**
 * Health summary
 */
export interface HealthSummary {
  overallStatus: HealthStatus;
  totalChecks: number;
  healthyChecks: number;
  degradedChecks: number;
  unhealthyChecks: number;
  criticalChecks: number;
  uptime: number; // percentage
  errorRate: number;
  incidentCount: number;
}

/**
 * System diagnostic information
 */
export interface SystemDiagnostics {
  timestamp: string;
  system: SystemInfo;
  errorStats: ErrorStats;
  monitoringMetrics: MonitoringMetrics;
  performance: PerformanceMetrics;
  connectivity: ConnectivityInfo;
  storage: StorageInfo;
  configuration: ConfigurationInfo;
}

/**
 * System information
 */
export interface SystemInfo {
  userAgent: string;
  platform: string;
  language: string;
  cookieEnabled: boolean;
  onLine: boolean;
  memoryInfo?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  connectionInfo?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
  };
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  navigation?: {
    loadEventEnd: number;
    domContentLoadedEventEnd: number;
    responseStart: number;
    requestStart: number;
  };
  timing?: {
    domLoading: number;
    domInteractive: number;
    domComplete: number;
  };
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

/**
 * Connectivity information
 */
export interface ConnectivityInfo {
  online: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  lastConnectivityCheck: string;
  connectivityHistory: ConnectivityEvent[];
}

/**
 * Connectivity event
 */
export interface ConnectivityEvent {
  timestamp: string;
  type: 'online' | 'offline';
  duration?: number; // milliseconds offline
}

/**
 * Storage information
 */
export interface StorageInfo {
  localStorage: {
    available: boolean;
    used: number;
    quota?: number;
  };
  sessionStorage: {
    available: boolean;
    used: number;
  };
  indexedDB: {
    available: boolean;
  };
}

/**
 * Configuration information
 */
export interface ConfigurationInfo {
  environment: string;
  version: string;
  features: Record<string, boolean>;
  endpoints: Record<string, string>;
}

/**
 * Error correlation data
 */
export interface ErrorCorrelation {
  errorId: string;
  relatedErrors: string[];
  commonPatterns: string[];
  rootCauseAnalysis: RootCauseAnalysis;
  impactAssessment: ImpactAssessment;
}

/**
 * Root cause analysis
 */
export interface RootCauseAnalysis {
  likelyRootCause: string;
  confidence: number; // 0-1
  contributingFactors: string[];
  timeline: string[];
  recommendations: string[];
}

/**
 * Impact assessment
 */
export interface ImpactAssessment {
  userImpact: 'none' | 'low' | 'medium' | 'high' | 'critical';
  systemImpact: 'none' | 'low' | 'medium' | 'high' | 'critical';
  businessImpact: 'none' | 'low' | 'medium' | 'high' | 'critical';
  affectedUsers: number;
  affectedFeatures: string[];
  estimatedDowntime: number; // minutes
}

/**
 * Health Check Service
 */
export class HealthCheckService {
  private static instance: HealthCheckService;
  private connectivityHistory: ConnectivityEvent[] = [];
  private lastOnlineTime: number = Date.now();
  private healthCheckInterval?: NodeJS.Timeout;

  private constructor() {
    this.setupConnectivityMonitoring();
    this.startPeriodicHealthChecks();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  /**
   * Perform comprehensive health check
   */
  public async performHealthCheck(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const checks: Record<string, CheckResult> = {};

    // Error rate check
    checks.errorRate = await this.checkErrorRate();
    
    // Critical errors check
    checks.criticalErrors = await this.checkCriticalErrors();
    
    // System performance check
    checks.performance = await this.checkSystemPerformance();
    
    // Connectivity check
    checks.connectivity = await this.checkConnectivity();
    
    // Storage check
    checks.storage = await this.checkStorage();
    
    // Memory usage check
    checks.memory = await this.checkMemoryUsage();
    
    // Incident status check
    checks.incidents = await this.checkIncidentStatus();

    // Calculate overall status
    const overallStatus = this.calculateOverallStatus(checks);
    
    // Generate summary
    const summary = this.generateHealthSummary(checks, overallStatus);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(checks);

    return {
      status: overallStatus,
      timestamp,
      checks,
      summary,
      recommendations
    };
  }

  /**
   * Get system diagnostics
   */
  public async getSystemDiagnostics(): Promise<SystemDiagnostics> {
    const timestamp = new Date().toISOString();
    
    return {
      timestamp,
      system: this.getSystemInfo(),
      errorStats: errorManager.getStats(),
      monitoringMetrics: errorMonitor.getMetrics(),
      performance: this.getPerformanceMetrics(),
      connectivity: this.getConnectivityInfo(),
      storage: this.getStorageInfo(),
      configuration: this.getConfigurationInfo()
    };
  }

  /**
   * Analyze error correlation
   */
  public analyzeErrorCorrelation(errorId: string): ErrorCorrelation | null {
    const errorLog = errorManager.getRecentErrors(1000);
    const targetError = errorLog.find(e => e.errorId === errorId);
    
    if (!targetError) return null;

    // Find related errors (same type, similar time, same user, etc.)
    const relatedErrors = errorLog.filter(error => 
      error.errorId !== errorId && (
        error.type === targetError.type ||
        error.userId === targetError.userId ||
        Math.abs(new Date(error.timestamp).getTime() - new Date(targetError.timestamp).getTime()) < 300000 // 5 minutes
      )
    ).map(e => e.errorId);

    // Identify common patterns
    const commonPatterns = this.identifyCommonPatterns(targetError, errorLog);
    
    // Perform root cause analysis
    const rootCauseAnalysis = this.performRootCauseAnalysis(targetError, errorLog);
    
    // Assess impact
    const impactAssessment = this.assessErrorImpact(targetError, errorLog);

    return {
      errorId,
      relatedErrors,
      commonPatterns,
      rootCauseAnalysis,
      impactAssessment
    };
  }

  /**
   * Check error rate
   */
  private async checkErrorRate(): Promise<CheckResult> {
    const metrics = errorMonitor.getMetrics();
    const threshold = 10; // errors per minute
    
    const status = metrics.errorRate > threshold * 2 ? HealthStatus.CRITICAL :
                   metrics.errorRate > threshold ? HealthStatus.UNHEALTHY :
                   metrics.errorRate > threshold * 0.5 ? HealthStatus.DEGRADED :
                   HealthStatus.HEALTHY;

    return {
      status,
      message: `Error rate: ${metrics.errorRate} errors/minute`,
      value: metrics.errorRate,
      threshold,
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Check critical errors
   */
  private async checkCriticalErrors(): Promise<CheckResult> {
    const metrics = errorMonitor.getMetrics();
    
    const status = metrics.criticalErrors > 0 ? HealthStatus.CRITICAL :
                   metrics.highSeverityErrors > 3 ? HealthStatus.UNHEALTHY :
                   metrics.highSeverityErrors > 0 ? HealthStatus.DEGRADED :
                   HealthStatus.HEALTHY;

    return {
      status,
      message: `Critical errors: ${metrics.criticalErrors}, High severity: ${metrics.highSeverityErrors}`,
      value: metrics.criticalErrors,
      details: {
        criticalErrors: metrics.criticalErrors,
        highSeverityErrors: metrics.highSeverityErrors
      },
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Check system performance
   */
  private async checkSystemPerformance(): Promise<CheckResult> {
    const performance = this.getPerformanceMetrics();
    
    let status = HealthStatus.HEALTHY;
    let message = 'System performance is normal';
    
    // Check memory usage
    if (performance.memory) {
      const memoryUsage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
      if (memoryUsage > 0.9) {
        status = HealthStatus.CRITICAL;
        message = 'Critical memory usage detected';
      } else if (memoryUsage > 0.8) {
        status = HealthStatus.UNHEALTHY;
        message = 'High memory usage detected';
      } else if (memoryUsage > 0.7) {
        status = HealthStatus.DEGRADED;
        message = 'Elevated memory usage detected';
      }
    }

    return {
      status,
      message,
      details: performance,
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Check connectivity
   */
  private async checkConnectivity(): Promise<CheckResult> {
    const isOnline = navigator.onLine;
    const connectivityInfo = this.getConnectivityInfo();
    
    const status = isOnline ? HealthStatus.HEALTHY : HealthStatus.CRITICAL;
    const message = isOnline ? 'Network connectivity is normal' : 'Network connectivity is offline';

    return {
      status,
      message,
      details: connectivityInfo,
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Check storage
   */
  private async checkStorage(): Promise<CheckResult> {
    const storageInfo = this.getStorageInfo();
    
    let status = HealthStatus.HEALTHY;
    let message = 'Storage is functioning normally';
    
    if (!storageInfo.localStorage.available) {
      status = HealthStatus.DEGRADED;
      message = 'Local storage is not available';
    } else if (storageInfo.localStorage.quota && 
               storageInfo.localStorage.used / storageInfo.localStorage.quota > 0.9) {
      status = HealthStatus.UNHEALTHY;
      message = 'Local storage is nearly full';
    }

    return {
      status,
      message,
      details: storageInfo,
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Check memory usage
   */
  private async checkMemoryUsage(): Promise<CheckResult> {
    if (typeof performance === 'undefined' || !(performance as any).memory) {
      return {
        status: HealthStatus.HEALTHY,
        message: 'Memory information not available',
        lastChecked: new Date().toISOString()
      };
    }

    const memory = (performance as any).memory;
    const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    
    const status = usageRatio > 0.9 ? HealthStatus.CRITICAL :
                   usageRatio > 0.8 ? HealthStatus.UNHEALTHY :
                   usageRatio > 0.7 ? HealthStatus.DEGRADED :
                   HealthStatus.HEALTHY;

    return {
      status,
      message: `Memory usage: ${Math.round(usageRatio * 100)}%`,
      value: usageRatio,
      threshold: 0.8,
      details: memory,
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Check incident status
   */
  private async checkIncidentStatus(): Promise<CheckResult> {
    const openIncidents = incidentManager.getIncidents({
      status: ['open', 'investigating'] as any
    });
    
    const criticalIncidents = openIncidents.filter(i => i.severity === 'critical').length;
    const highIncidents = openIncidents.filter(i => i.severity === 'high').length;
    
    const status = criticalIncidents > 0 ? HealthStatus.CRITICAL :
                   highIncidents > 0 ? HealthStatus.UNHEALTHY :
                   openIncidents.length > 3 ? HealthStatus.DEGRADED :
                   HealthStatus.HEALTHY;

    return {
      status,
      message: `Open incidents: ${openIncidents.length} (${criticalIncidents} critical, ${highIncidents} high)`,
      value: openIncidents.length,
      details: {
        total: openIncidents.length,
        critical: criticalIncidents,
        high: highIncidents
      },
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Calculate overall health status
   */
  private calculateOverallStatus(checks: Record<string, CheckResult>): HealthStatus {
    const statuses = Object.values(checks).map(check => check.status);
    
    if (statuses.includes(HealthStatus.CRITICAL)) {
      return HealthStatus.CRITICAL;
    }
    if (statuses.includes(HealthStatus.UNHEALTHY)) {
      return HealthStatus.UNHEALTHY;
    }
    if (statuses.includes(HealthStatus.DEGRADED)) {
      return HealthStatus.DEGRADED;
    }
    return HealthStatus.HEALTHY;
  }

  /**
   * Generate health summary
   */
  private generateHealthSummary(
    checks: Record<string, CheckResult>, 
    overallStatus: HealthStatus
  ): HealthSummary {
    const checkValues = Object.values(checks);
    const statusCounts = {
      healthy: checkValues.filter(c => c.status === HealthStatus.HEALTHY).length,
      degraded: checkValues.filter(c => c.status === HealthStatus.DEGRADED).length,
      unhealthy: checkValues.filter(c => c.status === HealthStatus.UNHEALTHY).length,
      critical: checkValues.filter(c => c.status === HealthStatus.CRITICAL).length
    };

    const metrics = errorMonitor.getMetrics();
    const incidents = incidentManager.getIncidents({ limit: 100 });
    
    // Calculate uptime (simplified - based on connectivity)
    const uptime = this.calculateUptime();

    return {
      overallStatus,
      totalChecks: checkValues.length,
      healthyChecks: statusCounts.healthy,
      degradedChecks: statusCounts.degraded,
      unhealthyChecks: statusCounts.unhealthy,
      criticalChecks: statusCounts.critical,
      uptime,
      errorRate: metrics.errorRate,
      incidentCount: incidents.filter(i => i.status === 'open' || i.status === 'investigating').length
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(checks: Record<string, CheckResult>): string[] {
    const recommendations: string[] = [];

    if (checks.errorRate?.status === HealthStatus.UNHEALTHY || checks.errorRate?.status === HealthStatus.CRITICAL) {
      recommendations.push('High error rate detected. Review recent errors and consider implementing additional error handling.');
    }

    if (checks.criticalErrors?.status === HealthStatus.CRITICAL) {
      recommendations.push('Critical errors detected. Immediate investigation required.');
    }

    if (checks.memory?.status === HealthStatus.UNHEALTHY || checks.memory?.status === HealthStatus.CRITICAL) {
      recommendations.push('High memory usage detected. Consider optimizing memory usage or increasing available memory.');
    }

    if (checks.storage?.status === HealthStatus.UNHEALTHY) {
      recommendations.push('Storage issues detected. Clear unnecessary data or increase storage capacity.');
    }

    if (checks.connectivity?.status === HealthStatus.CRITICAL) {
      recommendations.push('Network connectivity issues detected. Check internet connection and network configuration.');
    }

    if (checks.incidents?.status === HealthStatus.UNHEALTHY || checks.incidents?.status === HealthStatus.CRITICAL) {
      recommendations.push('Multiple open incidents detected. Review and resolve pending incidents.');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is operating normally. Continue monitoring for any changes.');
    }

    return recommendations;
  }

  /**
   * Setup connectivity monitoring
   */
  private setupConnectivityMonitoring(): void {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      const now = Date.now();
      const offlineDuration = now - this.lastOnlineTime;
      
      this.connectivityHistory.push({
        timestamp: new Date().toISOString(),
        type: 'online',
        duration: offlineDuration
      });
      
      this.lastOnlineTime = now;
    };

    const handleOffline = () => {
      this.connectivityHistory.push({
        timestamp: new Date().toISOString(),
        type: 'offline'
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicHealthChecks(): void {
    // Perform health check every 5 minutes
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('Health check failed:', error);
      });
    }, 300000);
  }

  /**
   * Get system information
   */
  private getSystemInfo(): SystemInfo {
    const info: SystemInfo = {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'Unknown',
      language: typeof navigator !== 'undefined' ? navigator.language : 'Unknown',
      cookieEnabled: typeof navigator !== 'undefined' ? navigator.cookieEnabled : false,
      onLine: typeof navigator !== 'undefined' ? navigator.onLine : true
    };

    // Add memory info if available
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      info.memoryInfo = (performance as any).memory;
    }

    // Add connection info if available
    if (typeof navigator !== 'undefined' && (navigator as any).connection) {
      const connection = (navigator as any).connection;
      info.connectionInfo = {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt
      };
    }

    return info;
  }

  /**
   * Get performance metrics
   */
  private getPerformanceMetrics(): PerformanceMetrics {
    const metrics: PerformanceMetrics = {};

    if (typeof performance !== 'undefined') {
      // Navigation timing
      if (performance.timing) {
        metrics.navigation = {
          loadEventEnd: performance.timing.loadEventEnd,
          domContentLoadedEventEnd: performance.timing.domContentLoadedEventEnd,
          responseStart: performance.timing.responseStart,
          requestStart: performance.timing.requestStart
        };

        metrics.timing = {
          domLoading: performance.timing.domLoading,
          domInteractive: performance.timing.domInteractive,
          domComplete: performance.timing.domComplete
        };
      }

      // Memory info
      if ((performance as any).memory) {
        metrics.memory = (performance as any).memory;
      }
    }

    return metrics;
  }

  /**
   * Get connectivity information
   */
  private getConnectivityInfo(): ConnectivityInfo {
    const info: ConnectivityInfo = {
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      lastConnectivityCheck: new Date().toISOString(),
      connectivityHistory: this.connectivityHistory.slice(-20) // Keep last 20 events
    };

    // Add connection details if available
    if (typeof navigator !== 'undefined' && (navigator as any).connection) {
      const connection = (navigator as any).connection;
      info.effectiveType = connection.effectiveType;
      info.downlink = connection.downlink;
      info.rtt = connection.rtt;
    }

    return info;
  }

  /**
   * Get storage information
   */
  private getStorageInfo(): StorageInfo {
    const info: StorageInfo = {
      localStorage: {
        available: false,
        used: 0
      },
      sessionStorage: {
        available: false,
        used: 0
      },
      indexedDB: {
        available: false
      }
    };

    // Check localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        info.localStorage.available = true;
        
        // Calculate used space
        let used = 0;
        for (let key in localStorage) {
          if (localStorage.hasOwnProperty(key)) {
            used += localStorage[key].length + key.length;
          }
        }
        info.localStorage.used = used;

        // Try to get quota if available
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          navigator.storage.estimate().then(estimate => {
            if (estimate.quota) {
              info.localStorage.quota = estimate.quota;
            }
          }).catch(() => {
            // Quota estimation not available
          });
        }
      }
    } catch (error) {
      // localStorage not available
    }

    // Check sessionStorage
    try {
      if (typeof sessionStorage !== 'undefined') {
        info.sessionStorage.available = true;
        
        let used = 0;
        for (let key in sessionStorage) {
          if (sessionStorage.hasOwnProperty(key)) {
            used += sessionStorage[key].length + key.length;
          }
        }
        info.sessionStorage.used = used;
      }
    } catch (error) {
      // sessionStorage not available
    }

    // Check IndexedDB
    try {
      if (typeof indexedDB !== 'undefined') {
        info.indexedDB.available = true;
      }
    } catch (error) {
      // IndexedDB not available
    }

    return info;
  }

  /**
   * Get configuration information
   */
  private getConfigurationInfo(): ConfigurationInfo {
    return {
      environment: import.meta.env.MODE || 'development',
      version: import.meta.env.VITE_APP_VERSION || '1.0.0',
      features: {
        errorMonitoring: true,
        incidentManagement: true,
        healthChecks: true,
        diagnostics: true
      },
      endpoints: {
        api: import.meta.env.VITE_API_URL || 'http://localhost:3000',
        supabase: import.meta.env.VITE_SUPABASE_URL || ''
      }
    };
  }

  /**
   * Calculate uptime percentage
   */
  private calculateUptime(): number {
    const totalTime = Date.now() - this.lastOnlineTime;
    const offlineTime = this.connectivityHistory
      .filter(event => event.type === 'offline')
      .reduce((total, event) => total + (event.duration || 0), 0);
    
    if (totalTime === 0) return 100;
    return Math.max(0, Math.min(100, ((totalTime - offlineTime) / totalTime) * 100));
  }

  /**
   * Identify common error patterns
   */
  private identifyCommonPatterns(targetError: any, errorLog: any[]): string[] {
    const patterns: string[] = [];

    // Check for similar error messages
    const similarMessages = errorLog.filter(error => 
      error.message.includes(targetError.message.split(' ')[0]) ||
      targetError.message.includes(error.message.split(' ')[0])
    );
    
    if (similarMessages.length > 1) {
      patterns.push(`Similar error messages (${similarMessages.length} occurrences)`);
    }

    // Check for same user patterns
    if (targetError.userId) {
      const sameUserErrors = errorLog.filter(error => error.userId === targetError.userId);
      if (sameUserErrors.length > 3) {
        patterns.push(`Multiple errors from same user (${sameUserErrors.length} occurrences)`);
      }
    }

    // Check for time-based patterns
    const timeWindow = 300000; // 5 minutes
    const targetTime = new Date(targetError.timestamp).getTime();
    const nearbyErrors = errorLog.filter(error => 
      Math.abs(new Date(error.timestamp).getTime() - targetTime) < timeWindow
    );
    
    if (nearbyErrors.length > 3) {
      patterns.push(`Error cluster in time window (${nearbyErrors.length} errors in 5 minutes)`);
    }

    return patterns;
  }

  /**
   * Perform root cause analysis
   */
  private performRootCauseAnalysis(targetError: any, errorLog: any[]): RootCauseAnalysis {
    const analysis: RootCauseAnalysis = {
      likelyRootCause: 'Unknown',
      confidence: 0.1,
      contributingFactors: [],
      timeline: [],
      recommendations: []
    };

    // Analyze error type patterns
    if (targetError.type === ErrorType.NETWORK) {
      analysis.likelyRootCause = 'Network connectivity issues';
      analysis.confidence = 0.8;
      analysis.contributingFactors.push('Network instability', 'Server unavailability');
      analysis.recommendations.push('Check network connectivity', 'Implement retry mechanisms');
    } else if (targetError.type === ErrorType.AUTHENTICATION) {
      analysis.likelyRootCause = 'Authentication system failure';
      analysis.confidence = 0.7;
      analysis.contributingFactors.push('Token expiration', 'Authentication service issues');
      analysis.recommendations.push('Review authentication flow', 'Check token refresh mechanisms');
    } else if (targetError.type === ErrorType.SERVER) {
      analysis.likelyRootCause = 'Server-side error';
      analysis.confidence = 0.6;
      analysis.contributingFactors.push('Server overload', 'Database issues', 'Code bugs');
      analysis.recommendations.push('Check server logs', 'Review recent deployments');
    }

    // Build timeline
    const relatedErrors = errorLog.filter(error => 
      error.type === targetError.type &&
      Math.abs(new Date(error.timestamp).getTime() - new Date(targetError.timestamp).getTime()) < 3600000 // 1 hour
    ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    analysis.timeline = relatedErrors.map(error => 
      `${new Date(error.timestamp).toLocaleTimeString()}: ${error.message}`
    );

    return analysis;
  }

  /**
   * Assess error impact
   */
  private assessErrorImpact(targetError: any, errorLog: any[]): ImpactAssessment {
    const assessment: ImpactAssessment = {
      userImpact: 'low',
      systemImpact: 'low',
      businessImpact: 'low',
      affectedUsers: 1,
      affectedFeatures: [],
      estimatedDowntime: 0
    };

    // Assess based on error severity
    if (targetError.severity === ErrorSeverity.CRITICAL) {
      assessment.userImpact = 'critical';
      assessment.systemImpact = 'high';
      assessment.businessImpact = 'high';
    } else if (targetError.severity === ErrorSeverity.HIGH) {
      assessment.userImpact = 'high';
      assessment.systemImpact = 'medium';
      assessment.businessImpact = 'medium';
    }

    // Count affected users
    const uniqueUsers = new Set(errorLog
      .filter(error => error.type === targetError.type)
      .map(error => error.userId)
      .filter(Boolean)
    );
    assessment.affectedUsers = uniqueUsers.size;

    // Estimate downtime based on error frequency
    const recentErrors = errorLog.filter(error => 
      error.type === targetError.type &&
      new Date(error.timestamp).getTime() > Date.now() - 3600000 // Last hour
    );
    
    if (recentErrors.length > 10) {
      assessment.estimatedDowntime = 15; // 15 minutes
    } else if (recentErrors.length > 5) {
      assessment.estimatedDowntime = 5; // 5 minutes
    }

    return assessment;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }
}

// Export singleton instance
export const healthCheckService = HealthCheckService.getInstance();