/**
 * Monitoring System Integration Index
 * Central export point for all monitoring components
 */

// Core monitoring services
export { 
  comprehensiveMonitoringIntegration,
  getComprehensiveMonitoringIntegration,
  ComprehensiveMonitoringIntegration,
  type MonitoringIntegrationConfig,
  type MonitoringEvent,
  type SystemHealthStatus,
  defaultMonitoringIntegrationConfig
} from './comprehensiveMonitoringIntegration';

export {
  monitoringValidationService,
  MonitoringValidationService,
  type ValidationResult,
  type ValidationReport,
  type LoadTestConfig
} from './monitoringValidationService';

export {
  getMonitoringService,
  MonitoringService,
  type MonitoringConfig,
  defaultMonitoringConfig
} from './monitoringService';

export {
  getAPIMonitor,
  type APIMonitor,
  type APIMetrics,
  type ProviderQuota
} from './apiMonitor';

export {
  getCostTracker,
  type CostTracker,
  type CostBreakdown,
  type CostModel
} from './costTracker';

// Logging
export { 
  logger,
  StructuredLogger,
  type LogLevel,
  type LogEntry,
  type LogContext
} from '../logging/StructuredLogger';

// Error monitoring
export {
  errorMonitor,
  ErrorMonitor,
  type MonitoringThreshold,
  type AlertEvent,
  type MonitoringMetrics
} from '../errors/errorMonitor';

// Performance monitoring
export {
  performanceMonitor,
  type PerformanceMetric,
  type OperationTiming
} from '../performanceMonitor';

// Business metrics
export {
  businessMetricsMonitor,
  BusinessMetricsMonitor,
  type BusinessMetric,
  type UserEngagementMetrics,
  type ConversionMetrics
} from '../businessMetricsMonitor';

// User engagement
export {
  userEngagementTracker,
  type UserSession,
  type FeatureUsage
} from '../userEngagementTracker';

// Web vitals
export {
  webVitalsMonitor,
  type WebVitalsMetric
} from '../webVitalsMonitor';

// Incident management
export {
  incidentManager,
  type SystemIncident,
  type IncidentSeverity
} from '../errors/incidentManager';

/**
 * Initialize all monitoring components
 */
export async function initializeMonitoring(config?: Partial<MonitoringIntegrationConfig>): Promise<void> {
  try {
    // Skip initialization in browser environment
    if (typeof window !== 'undefined') {
      logger.info('Monitoring initialization skipped in browser environment');
      return;
    }
    
    // Initialize the comprehensive monitoring integration
    const integration = getComprehensiveMonitoringIntegration();
    
    if (config) {
      integration.updateConfig(config);
    }
    
    await integration.initialize();
    
    logger.info('All monitoring components initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize monitoring components', error);
    throw error;
  }
}

/**
 * Get monitoring system status
 */
export function getMonitoringStatus(): {
  integration: ReturnType<ComprehensiveMonitoringIntegration['getStatus']>;
  systemHealth: SystemHealthStatus;
  components: {
    logging: boolean;
    errorTracking: boolean;
    performanceMonitoring: boolean;
    businessMetrics: boolean;
    apiMonitoring: boolean;
    incidentManagement: boolean;
  };
} {
  // Return safe defaults in browser environment
  if (typeof window !== 'undefined') {
    return {
      integration: {
        initialized: false,
        enabled: false,
        components: {},
        lastUpdated: new Date(),
      } as any,
      systemHealth: {
        overall: 'healthy' as const,
        components: {},
        lastUpdated: new Date(),
      },
      components: {
        logging: true,
        errorTracking: true,
        performanceMonitoring: true,
        businessMetrics: false,
        apiMonitoring: false,
        incidentManagement: false,
      },
    };
  }
  
  const integration = getComprehensiveMonitoringIntegration();
  
  return {
    integration: integration.getStatus(),
    systemHealth: integration.getSystemHealth(),
    components: {
      logging: true, // Always available
      errorTracking: true, // Always available
      performanceMonitoring: true, // Always available
      businessMetrics: true, // Always available
      apiMonitoring: true, // Always available
      incidentManagement: true // Always available
    }
  };
}

/**
 * Run comprehensive monitoring validation
 */
export async function validateMonitoringSystem(): Promise<ValidationReport> {
  return await monitoringValidationService.runComprehensiveValidation();
}

/**
 * Shutdown all monitoring components
 */
export function shutdownMonitoring(): void {
  try {
    // Skip shutdown in browser environment
    if (typeof window !== 'undefined') {
      logger.info('Monitoring shutdown skipped in browser environment');
      return;
    }
    
    getComprehensiveMonitoringIntegration().destroy();
    logger.info('All monitoring components shut down successfully');
  } catch (error) {
    logger.error('Error during monitoring shutdown', error);
  }
}

/**
 * Monitoring system health check
 */
export function healthCheck(): {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  components: Record<string, 'healthy' | 'degraded' | 'unhealthy'>;
  timestamp: Date;
} {
  // Return safe defaults in browser environment
  if (typeof window !== 'undefined') {
    return {
      status: 'healthy' as const,
      components: {},
      timestamp: new Date(),
    };
  }
  
  const systemHealth = getComprehensiveMonitoringIntegration().getSystemHealth();
  
  return {
    status: systemHealth.overall,
    components: systemHealth.components,
    timestamp: systemHealth.lastUpdated
  };
}

/**
 * Get monitoring metrics summary
 */
export function getMetricsSummary(): {
  errors: {
    rate: number;
    total: number;
    critical: number;
  };
  performance: {
    avgResponseTime: number;
    systemLoad: number;
  };
  business: {
    totalMetrics: number;
    categories: string[];
  };
  incidents: {
    active: number;
    total24h: number;
  };
} {
  // Return safe defaults in browser environment
  if (typeof window !== 'undefined') {
    return {
      errors: {
        rate: 0,
        total: 0,
        critical: 0,
      },
      performance: {
        avgResponseTime: 0,
        systemLoad: 0,
      },
      business: {
        totalMetrics: 0,
        categories: [],
      },
      incidents: {
        active: 0,
        total24h: 0,
      },
    };
  }
  
  const systemHealth = getComprehensiveMonitoringIntegration().getSystemHealth();
  const errorMetrics = errorMonitor.getMetrics();
  const businessReport = businessMetricsMonitor.getBusinessReport();
  
  return {
    errors: {
      rate: errorMetrics.errorRate,
      total: errorMetrics.totalErrors,
      critical: errorMetrics.criticalErrors
    },
    performance: {
      avgResponseTime: systemHealth.metrics.avgResponseTime,
      systemLoad: systemHealth.metrics.systemLoad
    },
    business: {
      totalMetrics: businessReport.totalMetrics,
      categories: Object.keys(businessReport.metricsByCategory)
    },
    incidents: {
      active: systemHealth.metrics.activeIncidents,
      total24h: systemHealth.metrics.alertsLast24h
    }
  };
}

// Default export for convenience
export default {
  initialize: initializeMonitoring,
  getStatus: getMonitoringStatus,
  validate: validateMonitoringSystem,
  shutdown: shutdownMonitoring,
  healthCheck,
  getMetricsSummary,
  
  // Direct access to main services (lazy initialization)
  get integration() {
    return typeof window === 'undefined' ? getComprehensiveMonitoringIntegration() : null;
  },
  validation: monitoringValidationService,
  logger,
  errorMonitor,
  performanceMonitor,
  businessMetricsMonitor
};