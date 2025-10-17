// Performance Monitoring
export { performanceMonitor } from '../performanceMonitor';
export type { PerformanceMetric, OperationTiming, MetricsBatch } from '../performanceMonitor';

export { 
  timed, 
  withTiming, 
  measureTime, 
  timedApiCall, 
  timedFetch, 
  timedDatabaseQuery,
  withRenderTiming,
  useInteractionTracking,
  PerformanceBudgetChecker,
  defaultPerformanceBudget,
  performanceBudgetChecker
} from '../performanceUtils';

// Metrics Aggregation
export { metricsAggregator, MetricsAggregator } from '../metricsAggregator';
export type { AggregatedMetric } from '../metricsAggregator';

// API Monitoring
export { apiMonitoringService } from '../apiMonitoring';
export type { ApiEndpointMetrics, SlowQueryAlert } from '../apiMonitoring';

// Web Vitals Monitoring
export { webVitalsMonitor } from '../webVitalsMonitor';
export type { WebVitalsMetric, PageLoadMetrics } from '../webVitalsMonitor';

// Business Metrics
export { businessMetricsMonitor } from '../businessMetricsMonitor';
export type { 
  BusinessMetric, 
  UserEngagementMetrics, 
  ConversionMetrics, 
  RevenueMetrics 
} from '../businessMetricsMonitor';

// External Integrations
export { dataDogIntegration } from './dataDogIntegration';
export type { DataDogMetric, DataDogEvent, DataDogServiceCheck } from './dataDogIntegration';

export { newRelicIntegration } from './newRelicIntegration';
export type { NewRelicEvent, NewRelicMetric, NewRelicInsight } from './newRelicIntegration';

// Database Performance (existing)
export { dbPerformanceMonitor } from '../databasePerformanceMonitor';
export type { QueryMetrics, PerformanceAlert, HealthCheckResult } from '../databasePerformanceMonitor';