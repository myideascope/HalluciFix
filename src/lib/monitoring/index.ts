/**
 * System Health Monitoring Infrastructure
 * Comprehensive monitoring, alerting, and incident management
 */

// Health Check System
export {
  healthCheckSystem,
  HealthStatus,
  type HealthCheck,
  type HealthCheckResult,
  type SystemHealthResult
} from './healthCheckSystem';

// Infrastructure Metrics
export {
  infrastructureMetrics,
  type ResourceMetrics,
  type CPUMetrics,
  type MemoryMetrics,
  type NetworkMetrics,
  type StorageMetrics,
  type PerformanceMetrics,
  type ServiceAvailability,
  type AlertThreshold,
  type MetricAlert
} from './infrastructureMetrics';

// Incident Tracking
export {
  incidentTracker,
  type SystemIncident,
  type IncidentPattern,
  type PostMortem,
  type ActionItem
} from './incidentTracker';

// Re-export existing monitoring components
export { dbPerformanceMonitor } from '../databasePerformanceMonitor';
export { performanceMonitor } from '../performanceMonitor';
export { incidentManager } from '../errors/incidentManager';
export { healthCheckService } from '../errors/healthCheck';

// Types from existing components
export type { QueryMetrics, PerformanceAlert, HealthCheckResult as ErrorHealthCheckResult } from '../databasePerformanceMonitor';
export type { PerformanceMetric } from '../performanceMonitor';
export type { Incident, IncidentSeverity, IncidentStatus } from '../errors/incidentManager';