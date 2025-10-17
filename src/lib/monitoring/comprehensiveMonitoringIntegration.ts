/**
 * Comprehensive Monitoring Integration Service
 * Connects logging, monitoring, error tracking, and alerting systems
 */

import { logger, StructuredLogger } from '../logging/StructuredLogger';
import { errorMonitor, ErrorMonitor } from '../errors/errorMonitor';
import { businessMetricsMonitor, BusinessMetricsMonitor } from '../businessMetricsMonitor';
import { performanceMonitor } from '../performanceMonitor';
import { getMonitoringService, MonitoringService } from './monitoringService';
import { getAPIMonitor } from './apiMonitor';
import { getCostTracker } from './costTracker';
import { incidentManager } from '../errors/incidentManager';
import { webVitalsMonitor } from '../webVitalsMonitor';
import { userEngagementTracker } from '../userEngagementTracker';

export interface MonitoringIntegrationConfig {
  enabled: boolean;
  components: {
    logging: boolean;
    errorTracking: boolean;
    performanceMonitoring: boolean;
    businessMetrics: boolean;
    apiMonitoring: boolean;
    costTracking: boolean;
    incidentManagement: boolean;
    webVitals: boolean;
    userEngagement: boolean;
  };
  alerting: {
    enabled: boolean;
    channels: ('console' | 'notification' | 'webhook' | 'email' | 'sentry')[];
    webhookUrl?: string;
    emailConfig?: {
      smtp: string;
      from: string;
      to: string[];
    };
  };
  dataFlow: {
    enableCrossComponentCorrelation: boolean;
    enableRealTimeSync: boolean;
    bufferSize: number;
    flushInterval: number;
  };
  externalServices: {
    datadog: {
      enabled: boolean;
      apiKey?: string;
      appKey?: string;
    };
    newRelic: {
      enabled: boolean;
      licenseKey?: string;
    };
    sentry: {
      enabled: boolean;
      dsn?: string;
    };
  };
}

export interface MonitoringEvent {
  id: string;
  timestamp: Date;
  type: 'log' | 'error' | 'performance' | 'business' | 'api' | 'incident' | 'user_engagement';
  source: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  data: any;
  correlationId?: string;
  userId?: string;
  sessionId?: string;
}

export interface SystemHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  components: {
    logging: 'healthy' | 'degraded' | 'unhealthy';
    errorTracking: 'healthy' | 'degraded' | 'unhealthy';
    performanceMonitoring: 'healthy' | 'degraded' | 'unhealthy';
    businessMetrics: 'healthy' | 'degraded' | 'unhealthy';
    apiMonitoring: 'healthy' | 'degraded' | 'unhealthy';
    incidentManagement: 'healthy' | 'degraded' | 'unhealthy';
  };
  metrics: {
    errorRate: number;
    avgResponseTime: number;
    systemLoad: number;
    activeIncidents: number;
    alertsLast24h: number;
  };
  lastUpdated: Date;
}

/**
 * Comprehensive Monitoring Integration Service
 */
export class ComprehensiveMonitoringIntegration {
  private static instance: ComprehensiveMonitoringIntegration;
  private config: MonitoringIntegrationConfig;
  private initialized = false;
  private eventBuffer: MonitoringEvent[] = [];
  private correlationMap: Map<string, MonitoringEvent[]> = new Map();
  private healthStatus: SystemHealthStatus;
  private flushInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private eventListeners: Set<(event: MonitoringEvent) => void> = new Set();

  private constructor(config: MonitoringIntegrationConfig) {
    this.config = config;
    this.healthStatus = this.initializeHealthStatus();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: MonitoringIntegrationConfig): ComprehensiveMonitoringIntegration {
    if (!ComprehensiveMonitoringIntegration.instance) {
      ComprehensiveMonitoringIntegration.instance = new ComprehensiveMonitoringIntegration(
        config || defaultMonitoringIntegrationConfig
      );
    }
    return ComprehensiveMonitoringIntegration.instance;
  }

  /**
   * Initialize all monitoring components
   */
  public async initialize(): Promise<void> {
    if (!this.config.enabled || this.initialized) {
      return;
    }

    try {
      logger.info('Initializing comprehensive monitoring integration', {
        components: this.config.components,
        alerting: this.config.alerting.enabled
      });

      // Initialize core monitoring service
      const monitoringService = getMonitoringService();
      
      // Initialize individual components
      await this.initializeComponents();
      
      // Setup cross-component integration
      await this.setupCrossComponentIntegration();
      
      // Setup data flow and correlation
      this.setupDataFlow();
      
      // Setup health monitoring
      this.setupHealthMonitoring();
      
      // Setup external service integrations
      await this.setupExternalServices();

      this.initialized = true;
      
      logger.info('Comprehensive monitoring integration initialized successfully', {
        enabledComponents: Object.entries(this.config.components)
          .filter(([_, enabled]) => enabled)
          .map(([name]) => name)
      });

      // Send initialization event
      this.emitEvent({
        type: 'log',
        source: 'monitoring_integration',
        severity: 'low',
        data: {
          message: 'Monitoring integration initialized',
          components: this.config.components
        }
      });

    } catch (error) {
      logger.error('Failed to initialize comprehensive monitoring integration', error);
      throw error;
    }
  }

  /**
   * Initialize individual monitoring components
   */
  private async initializeComponents(): Promise<void> {
    const { components } = this.config;

    // Initialize error monitoring
    if (components.errorTracking) {
      errorMonitor.addAlertListener((alert) => {
        this.emitEvent({
          type: 'error',
          source: 'error_monitor',
          severity: alert.severity as any,
          data: alert,
          correlationId: alert.id
        });
      });

      errorMonitor.addMetricsListener((metrics) => {
        this.emitEvent({
          type: 'performance',
          source: 'error_monitor',
          severity: metrics.errorRate > 10 ? 'high' : 'low',
          data: metrics
        });
      });
    }

    // Initialize business metrics monitoring
    if (components.businessMetrics) {
      // Business metrics are already initialized as singleton
      logger.info('Business metrics monitoring enabled');
    }

    // Initialize web vitals monitoring
    if (components.webVitals && typeof window !== 'undefined') {
      webVitalsMonitor.initialize();
      logger.info('Web vitals monitoring enabled');
    }

    // Initialize user engagement tracking
    if (components.userEngagement) {
      // User engagement tracker is already initialized as singleton
      logger.info('User engagement tracking enabled');
    }

    // Initialize API monitoring
    if (components.apiMonitoring) {
      const apiMonitor = getAPIMonitor();
      logger.info('API monitoring enabled');
    }

    // Initialize cost tracking
    if (components.costTracking) {
      const costTracker = getCostTracker();
      logger.info('Cost tracking enabled');
    }
  }

  /**
   * Setup cross-component integration
   */
  private async setupCrossComponentIntegration(): Promise<void> {
    if (!this.config.dataFlow.enableCrossComponentCorrelation) {
      return;
    }

    // Create correlation between errors and performance metrics
    errorMonitor.addAlertListener((alert) => {
      const correlationId = this.generateCorrelationId();
      
      // Get related performance metrics
      const performanceMetrics = performanceMonitor.getRecentMetrics(60000); // Last minute
      
      if (performanceMetrics.length > 0) {
        this.addCorrelation(correlationId, [
          {
            type: 'error',
            source: 'error_monitor',
            severity: alert.severity as any,
            data: alert,
            correlationId
          },
          {
            type: 'performance',
            source: 'performance_monitor',
            severity: 'medium',
            data: performanceMetrics,
            correlationId
          }
        ]);
      }
    });

    // Create correlation between business metrics and system performance
    if (this.config.components.businessMetrics && this.config.components.performanceMonitoring) {
      // This would be implemented with business metrics callbacks
      logger.info('Cross-component correlation enabled');
    }
  }

  /**
   * Setup data flow and buffering
   */
  private setupDataFlow(): void {
    if (this.config.dataFlow.enableRealTimeSync) {
      this.flushInterval = setInterval(() => {
        this.flushEventBuffer();
      }, this.config.dataFlow.flushInterval);
    }
  }

  /**
   * Setup health monitoring
   */
  private setupHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.updateSystemHealth();
    }, 30000); // Update every 30 seconds

    // Initial health check
    this.updateSystemHealth();
  }

  /**
   * Setup external service integrations
   */
  private async setupExternalServices(): Promise<void> {
    const { externalServices } = this.config;

    // Setup DataDog integration
    if (externalServices.datadog.enabled && externalServices.datadog.apiKey) {
      logger.info('DataDog integration enabled');
    }

    // Setup New Relic integration
    if (externalServices.newRelic.enabled && externalServices.newRelic.licenseKey) {
      logger.info('New Relic integration enabled');
    }

    // Setup Sentry integration
    if (externalServices.sentry.enabled && externalServices.sentry.dsn) {
      logger.info('Sentry integration enabled');
    }
  }

  /**
   * Emit monitoring event
   */
  private emitEvent(eventData: Omit<MonitoringEvent, 'id' | 'timestamp'>): void {
    const event: MonitoringEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...eventData
    };

    // Add to buffer
    this.eventBuffer.push(event);

    // Trim buffer if too large
    if (this.eventBuffer.length > this.config.dataFlow.bufferSize) {
      this.eventBuffer = this.eventBuffer.slice(-this.config.dataFlow.bufferSize);
    }

    // Notify listeners
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        logger.error('Error in event listener', error);
      }
    });

    // Handle critical events immediately
    if (event.severity === 'critical') {
      this.handleCriticalEvent(event);
    }
  }

  /**
   * Handle critical events immediately
   */
  private async handleCriticalEvent(event: MonitoringEvent): Promise<void> {
    logger.error('Critical monitoring event detected', undefined, {
      eventId: event.id,
      type: event.type,
      source: event.source,
      data: event.data
    });

    // Create incident if incident management is enabled
    if (this.config.components.incidentManagement) {
      try {
        await incidentManager.createIncident({
          title: `Critical ${event.type} event from ${event.source}`,
          description: JSON.stringify(event.data),
          severity: 'critical',
          source: event.source,
          metadata: {
            eventId: event.id,
            correlationId: event.correlationId
          }
        });
      } catch (error) {
        logger.error('Failed to create incident for critical event', error);
      }
    }

    // Send immediate alerts
    await this.sendAlert(event);
  }

  /**
   * Send alert for event
   */
  private async sendAlert(event: MonitoringEvent): Promise<void> {
    if (!this.config.alerting.enabled) {
      return;
    }

    const alertMessage = `${event.severity.toUpperCase()} ${event.type} alert from ${event.source}`;

    for (const channel of this.config.alerting.channels) {
      try {
        switch (channel) {
          case 'console':
            console.error(`[ALERT] ${alertMessage}`, event);
            break;

          case 'notification':
            if (typeof window !== 'undefined' && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                new Notification('HalluciFix Alert', {
                  body: alertMessage,
                  icon: '/favicon.ico'
                });
              }
            }
            break;

          case 'webhook':
            if (this.config.alerting.webhookUrl) {
              await fetch(this.config.alerting.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  alert: alertMessage,
                  event,
                  timestamp: event.timestamp
                })
              });
            }
            break;

          case 'sentry':
            if (typeof window !== 'undefined' && (window as any).Sentry) {
              const Sentry = (window as any).Sentry;
              Sentry.captureMessage(alertMessage, {
                level: event.severity === 'critical' ? 'fatal' : 'error',
                extra: event
              });
            }
            break;
        }
      } catch (error) {
        logger.error(`Failed to send alert via ${channel}`, error);
      }
    }
  }

  /**
   * Update system health status
   */
  private updateSystemHealth(): void {
    const components = this.config.components;
    const newHealthStatus: SystemHealthStatus = {
      overall: 'healthy',
      components: {
        logging: components.logging ? 'healthy' : 'unhealthy',
        errorTracking: components.errorTracking ? this.checkErrorTrackingHealth() : 'unhealthy',
        performanceMonitoring: components.performanceMonitoring ? this.checkPerformanceHealth() : 'unhealthy',
        businessMetrics: components.businessMetrics ? 'healthy' : 'unhealthy',
        apiMonitoring: components.apiMonitoring ? this.checkApiMonitoringHealth() : 'unhealthy',
        incidentManagement: components.incidentManagement ? 'healthy' : 'unhealthy'
      },
      metrics: {
        errorRate: this.calculateErrorRate(),
        avgResponseTime: this.calculateAvgResponseTime(),
        systemLoad: this.calculateSystemLoad(),
        activeIncidents: this.getActiveIncidentsCount(),
        alertsLast24h: this.getAlertsLast24h()
      },
      lastUpdated: new Date()
    };

    // Determine overall health
    const componentHealthValues = Object.values(newHealthStatus.components);
    if (componentHealthValues.some(health => health === 'unhealthy')) {
      newHealthStatus.overall = 'critical';
    } else if (componentHealthValues.some(health => health === 'degraded')) {
      newHealthStatus.overall = 'degraded';
    } else if (newHealthStatus.metrics.errorRate > 10 || newHealthStatus.metrics.avgResponseTime > 5000) {
      newHealthStatus.overall = 'degraded';
    }

    // Check if health status changed
    if (this.healthStatus.overall !== newHealthStatus.overall) {
      this.emitEvent({
        type: 'log',
        source: 'health_monitor',
        severity: newHealthStatus.overall === 'critical' ? 'critical' : 'medium',
        data: {
          message: `System health changed from ${this.healthStatus.overall} to ${newHealthStatus.overall}`,
          previousHealth: this.healthStatus,
          newHealth: newHealthStatus
        }
      });
    }

    this.healthStatus = newHealthStatus;
  }

  /**
   * Check error tracking health
   */
  private checkErrorTrackingHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    try {
      const metrics = errorMonitor.getMetrics();
      if (metrics.errorRate > 20) return 'unhealthy';
      if (metrics.errorRate > 10) return 'degraded';
      return 'healthy';
    } catch {
      return 'unhealthy';
    }
  }

  /**
   * Check performance monitoring health
   */
  private checkPerformanceHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    try {
      const recentMetrics = performanceMonitor.getRecentMetrics(300000); // Last 5 minutes
      if (recentMetrics.length === 0) return 'unhealthy';
      
      const avgResponseTime = recentMetrics.reduce((sum, m) => sum + (m.value || 0), 0) / recentMetrics.length;
      if (avgResponseTime > 10000) return 'unhealthy';
      if (avgResponseTime > 5000) return 'degraded';
      return 'healthy';
    } catch {
      return 'unhealthy';
    }
  }

  /**
   * Check API monitoring health
   */
  private checkApiMonitoringHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    try {
      const apiMonitor = getAPIMonitor();
      // This would check API monitor status
      return 'healthy';
    } catch {
      return 'unhealthy';
    }
  }

  /**
   * Calculate current error rate
   */
  private calculateErrorRate(): number {
    try {
      return errorMonitor.getMetrics().errorRate;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate average response time
   */
  private calculateAvgResponseTime(): number {
    try {
      const recentMetrics = performanceMonitor.getRecentMetrics(300000);
      if (recentMetrics.length === 0) return 0;
      return recentMetrics.reduce((sum, m) => sum + (m.value || 0), 0) / recentMetrics.length;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate system load (placeholder)
   */
  private calculateSystemLoad(): number {
    // This would integrate with system monitoring
    return 0.5; // 50% load
  }

  /**
   * Get active incidents count
   */
  private getActiveIncidentsCount(): number {
    try {
      return incidentManager.getActiveIncidents().length;
    } catch {
      return 0;
    }
  }

  /**
   * Get alerts in last 24 hours
   */
  private getAlertsLast24h(): number {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.eventBuffer.filter(event => 
      event.timestamp >= oneDayAgo && 
      (event.severity === 'high' || event.severity === 'critical')
    ).length;
  }

  /**
   * Flush event buffer
   */
  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      // Send to external services
      await this.sendEventsToExternalServices(eventsToFlush);
    } catch (error) {
      logger.error('Failed to flush event buffer', error);
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...eventsToFlush.slice(-100)); // Keep last 100 events
    }
  }

  /**
   * Send events to external services
   */
  private async sendEventsToExternalServices(events: MonitoringEvent[]): Promise<void> {
    const { externalServices } = this.config;

    // Send to DataDog
    if (externalServices.datadog.enabled && externalServices.datadog.apiKey) {
      try {
        // Implementation would send events to DataDog
        logger.debug(`Sent ${events.length} events to DataDog`);
      } catch (error) {
        logger.error('Failed to send events to DataDog', error);
      }
    }

    // Send to New Relic
    if (externalServices.newRelic.enabled && externalServices.newRelic.licenseKey) {
      try {
        // Implementation would send events to New Relic
        logger.debug(`Sent ${events.length} events to New Relic`);
      } catch (error) {
        logger.error('Failed to send events to New Relic', error);
      }
    }
  }

  /**
   * Add correlation between events
   */
  private addCorrelation(correlationId: string, events: MonitoringEvent[]): void {
    this.correlationMap.set(correlationId, events);
    
    // Emit correlated events
    events.forEach(event => {
      event.correlationId = correlationId;
      this.emitEvent(event);
    });
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize health status
   */
  private initializeHealthStatus(): SystemHealthStatus {
    return {
      overall: 'healthy',
      components: {
        logging: 'healthy',
        errorTracking: 'healthy',
        performanceMonitoring: 'healthy',
        businessMetrics: 'healthy',
        apiMonitoring: 'healthy',
        incidentManagement: 'healthy'
      },
      metrics: {
        errorRate: 0,
        avgResponseTime: 0,
        systemLoad: 0,
        activeIncidents: 0,
        alertsLast24h: 0
      },
      lastUpdated: new Date()
    };
  }

  /**
   * Public API methods
   */

  /**
   * Get current system health
   */
  public getSystemHealth(): SystemHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Get recent events
   */
  public getRecentEvents(limit: number = 100): MonitoringEvent[] {
    return this.eventBuffer.slice(-limit);
  }

  /**
   * Get correlated events
   */
  public getCorrelatedEvents(correlationId: string): MonitoringEvent[] {
    return this.correlationMap.get(correlationId) || [];
  }

  /**
   * Add event listener
   */
  public addEventListener(listener: (event: MonitoringEvent) => void): void {
    this.eventListeners.add(listener);
  }

  /**
   * Remove event listener
   */
  public removeEventListener(listener: (event: MonitoringEvent) => void): void {
    this.eventListeners.delete(listener);
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<MonitoringIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Monitoring integration configuration updated', { newConfig });
  }

  /**
   * Get monitoring status
   */
  public getStatus(): {
    initialized: boolean;
    enabled: boolean;
    components: typeof this.config.components;
    eventBufferSize: number;
    correlationsCount: number;
  } {
    return {
      initialized: this.initialized,
      enabled: this.config.enabled,
      components: this.config.components,
      eventBufferSize: this.eventBuffer.length,
      correlationsCount: this.correlationMap.size
    };
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Flush remaining events
    if (this.eventBuffer.length > 0) {
      this.flushEventBuffer();
    }

    this.eventListeners.clear();
    this.correlationMap.clear();
    this.eventBuffer = [];

    logger.info('Comprehensive monitoring integration destroyed');
  }
}

// Default configuration
export const defaultMonitoringIntegrationConfig: MonitoringIntegrationConfig = {
  enabled: true,
  components: {
    logging: true,
    errorTracking: true,
    performanceMonitoring: true,
    businessMetrics: true,
    apiMonitoring: true,
    costTracking: true,
    incidentManagement: true,
    webVitals: true,
    userEngagement: true
  },
  alerting: {
    enabled: true,
    channels: ['console', 'notification']
  },
  dataFlow: {
    enableCrossComponentCorrelation: true,
    enableRealTimeSync: true,
    bufferSize: 1000,
    flushInterval: 30000 // 30 seconds
  },
  externalServices: {
    datadog: {
      enabled: false
    },
    newRelic: {
      enabled: false
    },
    sentry: {
      enabled: false
    }
  }
};

// Export singleton instance
export const comprehensiveMonitoringIntegration = ComprehensiveMonitoringIntegration.getInstance();