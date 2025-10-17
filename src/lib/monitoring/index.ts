/**
 * Monitoring System Exports
 * Central export point for all monitoring functionality
 */

// Core monitoring services
export { APIMonitor, getAPIMonitor } from './apiMonitor';
export { CostTracker, getCostTracker } from './costTracker';
export { MonitoringService, getMonitoringService, defaultMonitoringConfig } from './monitoringService';

// Integration helpers
export {
  withOpenAIMonitoring,
  withAnthropicMonitoring,
  withGoogleDriveMonitoring,
  withWikipediaMonitoring,
  withAPIMonitoring,
  withFileOperationMonitoring,
  withAuthMonitoring,
  monitorBatchAPICalls,
  createMonitoredAnalysisService,
  createMonitoredGoogleDriveService,
  initializeServiceMonitoring,
  getServiceMonitoringStats
} from './integrations';

// React component
export { default as MonitoringDashboard } from '../../components/MonitoringDashboard';

// Types
export type {
  APIMetrics,
  ProviderQuota,
  AlertConfig,
  ProviderMetrics,
  QuotaStatus,
  Alert
} from './apiMonitor';

export type {
  CostModel,
  CostBreakdown,
  CostAlert,
  CostSummary
} from './costTracker';

export type {
  MonitoringConfig
} from './monitoringService';

// Utility functions
export function createMonitoringConfig(overrides: Partial<MonitoringConfig> = {}): MonitoringConfig {
  const baseConfig = defaultMonitoringConfig;
  return {
    ...baseConfig,
    ...overrides,
    apiMonitor: {
      ...baseConfig.apiMonitor,
      ...overrides.apiMonitor
    },
    costTracking: {
      ...baseConfig.costTracking,
      ...overrides.costTracking,
      budgets: {
        ...baseConfig.costTracking.budgets,
        ...overrides.costTracking?.budgets
      }
    }
  };
}

/**
 * Initialize complete monitoring system
 */
export function initializeMonitoring(config?: Partial<MonitoringConfig>) {
  const monitoringConfig = createMonitoringConfig(config);
  const monitoringService = getMonitoringService(monitoringConfig);
  
  // Initialize service integrations
  initializeServiceMonitoring();
  
  return {
    monitoringService,
    apiMonitor: getAPIMonitor(),
    costTracker: getCostTracker()
  };
}

/**
 * Get comprehensive monitoring status
 */
export function getMonitoringStatus() {
  try {
    const monitoringService = getMonitoringService();
    const stats = getServiceMonitoringStats();
    const status = monitoringService.getStatus();
    
    return {
      ...status,
      stats,
      healthy: status.enabled && status.initialized && stats.errorRate < 10
    };
  } catch (error) {
    return {
      enabled: false,
      initialized: false,
      apiMonitorActive: false,
      costTrackingActive: false,
      stats: {
        providers: [],
        totalRequests: 0,
        totalCost: 0,
        avgResponseTime: 0,
        errorRate: 0
      },
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}