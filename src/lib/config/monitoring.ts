/**
 * Configuration monitoring and logging system
 * Provides audit trails, metrics, and alerting for configuration changes
 */

import { EnvironmentConfig } from './types.js';
import { ConfigurationService } from './index.js';

export interface ConfigurationChangeEvent {
  id: string;
  timestamp: Date;
  type: 'configuration-loaded' | 'configuration-reloaded' | 'configuration-validated' | 'configuration-error';
  source: string;
  environment: string;
  changes?: ConfigurationChange[];
  metadata?: Record<string, any>;
  error?: string;
}

export interface ConfigurationChange {
  path: string;
  oldValue: any;
  newValue: any;
  changeType: 'added' | 'removed' | 'modified';
}

export interface ConfigurationMetrics {
  loadTime: number;
  validationTime: number;
  lastLoadTimestamp: Date;
  loadCount: number;
  errorCount: number;
  warningCount: number;
  healthCheckCount: number;
  lastHealthCheckTimestamp?: Date;
  configurationSize: number;
  activeFeatureFlags: string[];
}

export interface ConfigurationAlert {
  id: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'validation-error' | 'connectivity-failure' | 'drift-detected' | 'performance-degradation';
  message: string;
  details: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
}

/**
 * Configuration audit logger
 */
export class ConfigurationAuditLogger {
  private events: ConfigurationChangeEvent[] = [];
  private maxEvents: number = 1000;
  private logToConsole: boolean = true;
  private logToFile: boolean = false;
  private logFilePath?: string;

  constructor(options: {
    maxEvents?: number;
    logToConsole?: boolean;
    logToFile?: boolean;
    logFilePath?: string;
  } = {}) {
    this.maxEvents = options.maxEvents ?? 1000;
    this.logToConsole = options.logToConsole ?? true;
    this.logToFile = options.logToFile ?? false;
    this.logFilePath = options.logFilePath;
  }

  /**
   * Log a configuration change event
   */
  logEvent(event: Omit<ConfigurationChangeEvent, 'id' | 'timestamp'>): void {
    const fullEvent: ConfigurationChangeEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...event
    };

    // Add to in-memory store
    this.events.push(fullEvent);
    
    // Maintain max events limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Log to console if enabled
    if (this.logToConsole) {
      this.logToConsoleOutput(fullEvent);
    }

    // Log to file if enabled
    if (this.logToFile && this.logFilePath) {
      this.logToFileOutput(fullEvent);
    }
  }

  /**
   * Log configuration loaded event
   */
  logConfigurationLoaded(source: string, environment: string, loadTime: number, metadata?: Record<string, any>): void {
    this.logEvent({
      type: 'configuration-loaded',
      source,
      environment,
      metadata: {
        loadTime,
        ...metadata
      }
    });
  }

  /**
   * Log configuration reloaded event
   */
  logConfigurationReloaded(
    source: string, 
    environment: string, 
    changes: ConfigurationChange[], 
    loadTime: number
  ): void {
    this.logEvent({
      type: 'configuration-reloaded',
      source,
      environment,
      changes,
      metadata: {
        loadTime,
        changeCount: changes.length
      }
    });
  }

  /**
   * Log configuration validation event
   */
  logConfigurationValidated(
    environment: string, 
    validationTime: number, 
    warningCount: number = 0
  ): void {
    this.logEvent({
      type: 'configuration-validated',
      source: 'validation',
      environment,
      metadata: {
        validationTime,
        warningCount
      }
    });
  }

  /**
   * Log configuration error event
   */
  logConfigurationError(
    source: string, 
    environment: string, 
    error: string, 
    metadata?: Record<string, any>
  ): void {
    this.logEvent({
      type: 'configuration-error',
      source,
      environment,
      error,
      metadata
    });
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): ConfigurationChangeEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Get events by type
   */
  getEventsByType(type: ConfigurationChangeEvent['type']): ConfigurationChangeEvent[] {
    return this.events.filter(event => event.type === type);
  }

  /**
   * Get events in date range
   */
  getEventsInRange(startDate: Date, endDate: Date): ConfigurationChangeEvent[] {
    return this.events.filter(event => 
      event.timestamp >= startDate && event.timestamp <= endDate
    );
  }

  /**
   * Clear all events
   */
  clearEvents(): void {
    this.events = [];
  }

  private generateEventId(): string {
    return `config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private logToConsoleOutput(event: ConfigurationChangeEvent): void {
    const timestamp = event.timestamp.toISOString();
    const prefix = `[${timestamp}] CONFIG`;
    
    switch (event.type) {
      case 'configuration-loaded':
        console.log(`${prefix} ✅ Configuration loaded from ${event.source} (${event.metadata?.loadTime}ms)`);
        break;
      case 'configuration-reloaded':
        console.log(`${prefix} 🔄 Configuration reloaded from ${event.source} (${event.changes?.length} changes, ${event.metadata?.loadTime}ms)`);
        if (event.changes && event.changes.length > 0) {
          event.changes.forEach(change => {
            console.log(`${prefix}   - ${change.changeType}: ${change.path}`);
          });
        }
        break;
      case 'configuration-validated':
        console.log(`${prefix} ✓ Configuration validated (${event.metadata?.validationTime}ms, ${event.metadata?.warningCount} warnings)`);
        break;
      case 'configuration-error':
        console.error(`${prefix} ❌ Configuration error in ${event.source}: ${event.error}`);
        break;
    }
  }

  private logToFileOutput(event: ConfigurationChangeEvent): void {
    // In a real implementation, this would write to a file
    // For now, we'll just prepare the log entry
    const logEntry = {
      timestamp: event.timestamp.toISOString(),
      level: event.type === 'configuration-error' ? 'ERROR' : 'INFO',
      category: 'CONFIGURATION',
      event: event.type,
      source: event.source,
      environment: event.environment,
      changes: event.changes,
      metadata: event.metadata,
      error: event.error
    };

    // In a real implementation, append to log file
    console.debug('Would log to file:', JSON.stringify(logEntry));
  }
}

/**
 * Configuration metrics collector
 */
export class ConfigurationMetricsCollector {
  private metrics: ConfigurationMetrics;
  private startTime: number = Date.now();

  constructor() {
    this.metrics = {
      loadTime: 0,
      validationTime: 0,
      lastLoadTimestamp: new Date(),
      loadCount: 0,
      errorCount: 0,
      warningCount: 0,
      healthCheckCount: 0,
      configurationSize: 0,
      activeFeatureFlags: []
    };
  }

  /**
   * Record configuration load metrics
   */
  recordConfigurationLoad(loadTime: number, configSize: number): void {
    this.metrics.loadTime = loadTime;
    this.metrics.lastLoadTimestamp = new Date();
    this.metrics.loadCount++;
    this.metrics.configurationSize = configSize;
  }

  /**
   * Record configuration validation metrics
   */
  recordConfigurationValidation(validationTime: number, warningCount: number = 0): void {
    this.metrics.validationTime = validationTime;
    this.metrics.warningCount += warningCount;
  }

  /**
   * Record configuration error
   */
  recordConfigurationError(): void {
    this.metrics.errorCount++;
  }

  /**
   * Record health check
   */
  recordHealthCheck(): void {
    this.metrics.healthCheckCount++;
    this.metrics.lastHealthCheckTimestamp = new Date();
  }

  /**
   * Update active feature flags
   */
  updateActiveFeatureFlags(features: Record<string, boolean>): void {
    this.metrics.activeFeatureFlags = Object.entries(features)
      .filter(([_, enabled]) => enabled)
      .map(([feature, _]) => feature);
  }

  /**
   * Get current metrics
   */
  getMetrics(): ConfigurationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    averageLoadTime: number;
    averageValidationTime: number;
    errorRate: number;
    uptime: number;
  } {
    const uptime = Date.now() - this.startTime;
    
    return {
      averageLoadTime: this.metrics.loadTime,
      averageValidationTime: this.metrics.validationTime,
      errorRate: this.metrics.loadCount > 0 ? this.metrics.errorCount / this.metrics.loadCount : 0,
      uptime
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      loadTime: 0,
      validationTime: 0,
      lastLoadTimestamp: new Date(),
      loadCount: 0,
      errorCount: 0,
      warningCount: 0,
      healthCheckCount: 0,
      configurationSize: 0,
      activeFeatureFlags: []
    };
    this.startTime = Date.now();
  }
}

/**
 * Configuration alerting system
 */
export class ConfigurationAlertManager {
  private alerts: ConfigurationAlert[] = [];
  private maxAlerts: number = 500;
  private alertHandlers: Array<(alert: ConfigurationAlert) => void> = [];

  constructor(maxAlerts: number = 500) {
    this.maxAlerts = maxAlerts;
  }

  /**
   * Add alert handler
   */
  addAlertHandler(handler: (alert: ConfigurationAlert) => void): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Create and trigger an alert
   */
  createAlert(
    severity: ConfigurationAlert['severity'],
    type: ConfigurationAlert['type'],
    message: string,
    details: Record<string, any> = {}
  ): ConfigurationAlert {
    const alert: ConfigurationAlert = {
      id: this.generateAlertId(),
      timestamp: new Date(),
      severity,
      type,
      message,
      details,
      resolved: false
    };

    // Add to alerts list
    this.alerts.push(alert);
    
    // Maintain max alerts limit
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    // Trigger alert handlers
    this.alertHandlers.forEach(handler => {
      try {
        handler(alert);
      } catch (error) {
        console.error('Alert handler error:', error);
      }
    });

    return alert;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): ConfigurationAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: ConfigurationAlert['severity']): ConfigurationAlert[] {
    return this.alerts.filter(alert => alert.severity === severity);
  }

  /**
   * Get alerts by type
   */
  getAlertsByType(type: ConfigurationAlert['type']): ConfigurationAlert[] {
    return this.alerts.filter(alert => alert.type === type);
  }

  /**
   * Clear resolved alerts
   */
  clearResolvedAlerts(): void {
    this.alerts = this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get alert summary
   */
  getAlertSummary(): {
    total: number;
    active: number;
    resolved: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  } {
    const active = this.alerts.filter(a => !a.resolved);
    const resolved = this.alerts.filter(a => a.resolved);

    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};

    this.alerts.forEach(alert => {
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
      byType[alert.type] = (byType[alert.type] || 0) + 1;
    });

    return {
      total: this.alerts.length,
      active: active.length,
      resolved: resolved.length,
      bySeverity,
      byType
    };
  }

  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Integrated configuration monitoring service
 */
export class ConfigurationMonitoringService {
  private auditLogger: ConfigurationAuditLogger;
  private metricsCollector: ConfigurationMetricsCollector;
  private alertManager: ConfigurationAlertManager;
  private configService: ConfigurationService;

  constructor(configService: ConfigurationService, options: {
    auditOptions?: ConstructorParameters<typeof ConfigurationAuditLogger>[0];
    maxAlerts?: number;
  } = {}) {
    this.configService = configService;
    this.auditLogger = new ConfigurationAuditLogger(options.auditOptions);
    this.metricsCollector = new ConfigurationMetricsCollector();
    this.alertManager = new ConfigurationAlertManager(options.maxAlerts);

    this.setupDefaultAlertHandlers();
  }

  /**
   * Initialize monitoring
   */
  async initialize(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Record initial configuration load
      const configSize = this.calculateConfigurationSize();
      const loadTime = Date.now() - startTime;
      
      this.metricsCollector.recordConfigurationLoad(loadTime, configSize);
      this.auditLogger.logConfigurationLoaded('initialization', this.configService.app.environment, loadTime);
      
      // Update feature flags
      this.metricsCollector.updateActiveFeatureFlags(this.configService.features);
      
      console.log('📊 Configuration monitoring initialized');
    } catch (error) {
      this.auditLogger.logConfigurationError(
        'initialization', 
        this.configService.app.environment, 
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.metricsCollector.recordConfigurationError();
      
      this.alertManager.createAlert(
        'high',
        'validation-error',
        'Failed to initialize configuration monitoring',
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Monitor configuration reload
   */
  async monitorConfigurationReload(oldConfig: EnvironmentConfig, newConfig: EnvironmentConfig): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Calculate changes
      const changes = this.calculateConfigurationChanges(oldConfig, newConfig);
      const loadTime = Date.now() - startTime;
      const configSize = this.calculateConfigurationSize();
      
      // Record metrics
      this.metricsCollector.recordConfigurationLoad(loadTime, configSize);
      this.metricsCollector.updateActiveFeatureFlags(newConfig.features);
      
      // Log event
      this.auditLogger.logConfigurationReloaded(
        'hot-reload',
        newConfig.app.environment,
        changes,
        loadTime
      );
      
      // Check for significant changes that might need alerts
      this.checkForSignificantChanges(changes);
      
    } catch (error) {
      this.auditLogger.logConfigurationError(
        'hot-reload',
        this.configService.app.environment,
        error instanceof Error ? error.message : 'Unknown error'
      );
      this.metricsCollector.recordConfigurationError();
    }
  }

  /**
   * Monitor health check
   */
  monitorHealthCheck(results: any): void {
    this.metricsCollector.recordHealthCheck();
    
    // Check for health issues that need alerts
    if (results.overall === 'unhealthy') {
      const unhealthyChecks = results.checks.filter((check: any) => check.status === 'unhealthy');
      
      unhealthyChecks.forEach((check: any) => {
        this.alertManager.createAlert(
          'high',
          'connectivity-failure',
          `Health check failed: ${check.name}`,
          {
            checkName: check.name,
            message: check.message,
            responseTime: check.responseTime
          }
        );
      });
    }
  }

  /**
   * Get audit logger
   */
  getAuditLogger(): ConfigurationAuditLogger {
    return this.auditLogger;
  }

  /**
   * Get metrics collector
   */
  getMetricsCollector(): ConfigurationMetricsCollector {
    return this.metricsCollector;
  }

  /**
   * Get alert manager
   */
  getAlertManager(): ConfigurationAlertManager {
    return this.alertManager;
  }

  /**
   * Get monitoring summary
   */
  getMonitoringSummary(): {
    metrics: ConfigurationMetrics;
    performanceMetrics: ReturnType<ConfigurationMetricsCollector['getPerformanceMetrics']>;
    alertSummary: ReturnType<ConfigurationAlertManager['getAlertSummary']>;
    recentEvents: ConfigurationChangeEvent[];
  } {
    return {
      metrics: this.metricsCollector.getMetrics(),
      performanceMetrics: this.metricsCollector.getPerformanceMetrics(),
      alertSummary: this.alertManager.getAlertSummary(),
      recentEvents: this.auditLogger.getRecentEvents(10)
    };
  }

  private setupDefaultAlertHandlers(): void {
    // Console alert handler
    this.alertManager.addAlertHandler((alert) => {
      const timestamp = alert.timestamp.toISOString();
      const severityEmoji = {
        low: '🟡',
        medium: '🟠',
        high: '🔴',
        critical: '🚨'
      }[alert.severity];
      
      console.warn(`${severityEmoji} [${timestamp}] CONFIG ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
      if (Object.keys(alert.details).length > 0) {
        console.warn('Alert details:', alert.details);
      }
    });
  }

  private calculateConfigurationSize(): number {
    try {
      const config = {
        app: this.configService.app,
        database: this.configService.database,
        ai: this.configService.ai,
        auth: this.configService.auth,
        payments: this.configService.payments,
        monitoring: this.configService.monitoring,
        features: this.configService.features,
        security: this.configService.security
      };
      
      return JSON.stringify(config).length;
    } catch {
      return 0;
    }
  }

  private calculateConfigurationChanges(oldConfig: EnvironmentConfig, newConfig: EnvironmentConfig): ConfigurationChange[] {
    const changes: ConfigurationChange[] = [];
    
    this.compareObjects('', oldConfig, newConfig, changes);
    
    return changes;
  }

  private compareObjects(path: string, oldObj: any, newObj: any, changes: ConfigurationChange[]): void {
    // Check for removed or modified properties
    for (const key in oldObj) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (!(key in newObj)) {
        changes.push({
          path: currentPath,
          oldValue: oldObj[key],
          newValue: undefined,
          changeType: 'removed'
        });
      } else if (typeof oldObj[key] === 'object' && oldObj[key] !== null) {
        if (typeof newObj[key] === 'object' && newObj[key] !== null) {
          this.compareObjects(currentPath, oldObj[key], newObj[key], changes);
        } else {
          changes.push({
            path: currentPath,
            oldValue: oldObj[key],
            newValue: newObj[key],
            changeType: 'modified'
          });
        }
      } else if (oldObj[key] !== newObj[key]) {
        changes.push({
          path: currentPath,
          oldValue: oldObj[key],
          newValue: newObj[key],
          changeType: 'modified'
        });
      }
    }

    // Check for added properties
    for (const key in newObj) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (!(key in oldObj)) {
        changes.push({
          path: currentPath,
          oldValue: undefined,
          newValue: newObj[key],
          changeType: 'added'
        });
      }
    }
  }

  private checkForSignificantChanges(changes: ConfigurationChange[]): void {
    // Check for critical configuration changes
    const criticalPaths = [
      'database.supabaseUrl',
      'database.supabaseAnonKey',
      'auth.jwt.secret',
      'security.encryptionKey'
    ];

    const criticalChanges = changes.filter(change => 
      criticalPaths.some(path => change.path.startsWith(path))
    );

    if (criticalChanges.length > 0) {
      this.alertManager.createAlert(
        'critical',
        'drift-detected',
        'Critical configuration changes detected',
        {
          changes: criticalChanges.map(c => ({
            path: c.path,
            changeType: c.changeType
          }))
        }
      );
    }

    // Check for feature flag changes
    const featureFlagChanges = changes.filter(change => 
      change.path.startsWith('features.')
    );

    if (featureFlagChanges.length > 0) {
      this.alertManager.createAlert(
        'medium',
        'drift-detected',
        'Feature flag configuration changed',
        {
          changes: featureFlagChanges.map(c => ({
            path: c.path,
            changeType: c.changeType,
            oldValue: c.oldValue,
            newValue: c.newValue
          }))
        }
      );
    }
  }
}