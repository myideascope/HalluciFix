/**
 * Health Check API Endpoints
 * Provides REST endpoints for health monitoring and diagnostics
 */

import { healthCheckService, HealthCheckResult, SystemDiagnostics } from './healthCheck';
import { errorManager } from './errorManager';
import { errorMonitor } from './errorMonitor';
import { incidentManager } from './incidentManager';

/**
 * Health endpoint response format
 */
export interface HealthEndpointResponse {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  timestamp: string;
  version: string;
  uptime: number;
  checks?: Record<string, any>;
  details?: any;
}

/**
 * Health Check Endpoints
 * Provides standardized health check endpoints for monitoring systems
 */
export class HealthEndpoints {
  private static instance: HealthEndpoints;
  private startTime: number = Date.now();

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): HealthEndpoints {
    if (!HealthEndpoints.instance) {
      HealthEndpoints.instance = new HealthEndpoints();
    }
    return HealthEndpoints.instance;
  }

  /**
   * Basic health check endpoint
   * Returns minimal health information for load balancers
   */
  public async getBasicHealth(): Promise<HealthEndpointResponse> {
    try {
      const healthResult = await healthCheckService.performHealthCheck();
      
      return {
        status: healthResult.status as any,
        timestamp: healthResult.timestamp,
        version: process.env.REACT_APP_VERSION || '1.0.0',
        uptime: Date.now() - this.startTime
      };
    } catch (error) {
      return {
        status: 'critical',
        timestamp: new Date().toISOString(),
        version: process.env.REACT_APP_VERSION || '1.0.0',
        uptime: Date.now() - this.startTime
      };
    }
  }

  /**
   * Detailed health check endpoint
   * Returns comprehensive health information
   */
  public async getDetailedHealth(): Promise<HealthEndpointResponse> {
    try {
      const healthResult = await healthCheckService.performHealthCheck();
      
      return {
        status: healthResult.status as any,
        timestamp: healthResult.timestamp,
        version: process.env.REACT_APP_VERSION || '1.0.0',
        uptime: Date.now() - this.startTime,
        checks: healthResult.checks,
        details: {
          summary: healthResult.summary,
          recommendations: healthResult.recommendations
        }
      };
    } catch (error) {
      return {
        status: 'critical',
        timestamp: new Date().toISOString(),
        version: process.env.REACT_APP_VERSION || '1.0.0',
        uptime: Date.now() - this.startTime,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Readiness check endpoint
   * Indicates if the application is ready to serve traffic
   */
  public async getReadiness(): Promise<HealthEndpointResponse> {
    try {
      const healthResult = await healthCheckService.performHealthCheck();
      
      // Application is ready if no critical issues
      const isReady = healthResult.status !== 'critical';
      
      return {
        status: isReady ? 'healthy' : 'critical',
        timestamp: healthResult.timestamp,
        version: process.env.REACT_APP_VERSION || '1.0.0',
        uptime: Date.now() - this.startTime,
        details: {
          ready: isReady,
          criticalIssues: Object.entries(healthResult.checks)
            .filter(([_, check]) => check.status === 'critical')
            .map(([name, check]) => ({ name, message: check.message }))
        }
      };
    } catch (error) {
      return {
        status: 'critical',
        timestamp: new Date().toISOString(),
        version: process.env.REACT_APP_VERSION || '1.0.0',
        uptime: Date.now() - this.startTime,
        details: {
          ready: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Liveness check endpoint
   * Indicates if the application is alive and responsive
   */
  public async getLiveness(): Promise<HealthEndpointResponse> {
    // Simple liveness check - if we can respond, we're alive
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.REACT_APP_VERSION || '1.0.0',
      uptime: Date.now() - this.startTime,
      details: {
        alive: true
      }
    };
  }

  /**
   * Error metrics endpoint
   * Returns error-related metrics for monitoring
   */
  public async getErrorMetrics(): Promise<any> {
    try {
      const errorStats = errorManager.getStats();
      const monitoringMetrics = errorMonitor.getMetrics();
      const alerts = errorMonitor.getAlertHistory(10);
      
      return {
        timestamp: new Date().toISOString(),
        errorStats,
        monitoringMetrics,
        recentAlerts: alerts,
        status: monitoringMetrics.criticalErrors > 0 ? 'critical' :
                monitoringMetrics.errorRate > 10 ? 'unhealthy' :
                monitoringMetrics.errorRate > 5 ? 'degraded' : 'healthy'
      };
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        status: 'critical',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Incident metrics endpoint
   * Returns incident-related metrics for monitoring
   */
  public async getIncidentMetrics(): Promise<any> {
    try {
      const openIncidents = incidentManager.getIncidents({
        status: ['open', 'investigating'] as any,
        limit: 100
      });
      
      const criticalIncidents = openIncidents.filter(i => i.severity === 'critical');
      const highIncidents = openIncidents.filter(i => i.severity === 'high');
      
      return {
        timestamp: new Date().toISOString(),
        totalOpenIncidents: openIncidents.length,
        criticalIncidents: criticalIncidents.length,
        highSeverityIncidents: highIncidents.length,
        recentIncidents: openIncidents.slice(0, 5).map(incident => ({
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          status: incident.status,
          createdAt: incident.createdAt
        })),
        status: criticalIncidents.length > 0 ? 'critical' :
                highIncidents.length > 0 ? 'unhealthy' :
                openIncidents.length > 3 ? 'degraded' : 'healthy'
      };
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        status: 'critical',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * System diagnostics endpoint
   * Returns comprehensive system diagnostic information
   */
  public async getSystemDiagnostics(): Promise<SystemDiagnostics> {
    return await healthCheckService.getSystemDiagnostics();
  }

  /**
   * Performance metrics endpoint
   * Returns performance-related metrics
   */
  public async getPerformanceMetrics(): Promise<any> {
    try {
      const diagnostics = await healthCheckService.getSystemDiagnostics();
      
      return {
        timestamp: diagnostics.timestamp,
        performance: diagnostics.performance,
        memory: diagnostics.system.memoryInfo,
        connectivity: diagnostics.connectivity,
        status: this.assessPerformanceStatus(diagnostics)
      };
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        status: 'critical',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create Express.js middleware for health endpoints
   */
  public createExpressMiddleware() {
    return {
      // Basic health check
      health: async (req: any, res: any) => {
        try {
          const health = await this.getBasicHealth();
          const statusCode = health.status === 'healthy' ? 200 :
                           health.status === 'degraded' ? 200 :
                           health.status === 'unhealthy' ? 503 : 503;
          
          res.status(statusCode).json(health);
        } catch (error) {
          res.status(503).json({
            status: 'critical',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },

      // Detailed health check
      healthDetailed: async (req: any, res: any) => {
        try {
          const health = await this.getDetailedHealth();
          const statusCode = health.status === 'healthy' ? 200 :
                           health.status === 'degraded' ? 200 :
                           health.status === 'unhealthy' ? 503 : 503;
          
          res.status(statusCode).json(health);
        } catch (error) {
          res.status(503).json({
            status: 'critical',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },

      // Readiness check
      ready: async (req: any, res: any) => {
        try {
          const readiness = await this.getReadiness();
          const statusCode = readiness.status === 'healthy' ? 200 : 503;
          
          res.status(statusCode).json(readiness);
        } catch (error) {
          res.status(503).json({
            status: 'critical',
            timestamp: new Date().toISOString(),
            ready: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },

      // Liveness check
      live: async (req: any, res: any) => {
        try {
          const liveness = await this.getLiveness();
          res.status(200).json(liveness);
        } catch (error) {
          res.status(503).json({
            status: 'critical',
            timestamp: new Date().toISOString(),
            alive: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },

      // Error metrics
      errorMetrics: async (req: any, res: any) => {
        try {
          const metrics = await this.getErrorMetrics();
          res.status(200).json(metrics);
        } catch (error) {
          res.status(500).json({
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },

      // Incident metrics
      incidentMetrics: async (req: any, res: any) => {
        try {
          const metrics = await this.getIncidentMetrics();
          res.status(200).json(metrics);
        } catch (error) {
          res.status(500).json({
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },

      // System diagnostics
      diagnostics: async (req: any, res: any) => {
        try {
          const diagnostics = await this.getSystemDiagnostics();
          res.status(200).json(diagnostics);
        } catch (error) {
          res.status(500).json({
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      },

      // Performance metrics
      performance: async (req: any, res: any) => {
        try {
          const metrics = await this.getPerformanceMetrics();
          res.status(200).json(metrics);
        } catch (error) {
          res.status(500).json({
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    };
  }

  /**
   * Create fetch-based API handlers for client-side use
   */
  public createFetchHandlers() {
    return {
      getHealth: () => this.getBasicHealth(),
      getDetailedHealth: () => this.getDetailedHealth(),
      getReadiness: () => this.getReadiness(),
      getLiveness: () => this.getLiveness(),
      getErrorMetrics: () => this.getErrorMetrics(),
      getIncidentMetrics: () => this.getIncidentMetrics(),
      getDiagnostics: () => this.getSystemDiagnostics(),
      getPerformanceMetrics: () => this.getPerformanceMetrics()
    };
  }

  /**
   * Assess performance status based on diagnostics
   */
  private assessPerformanceStatus(diagnostics: SystemDiagnostics): string {
    let status = 'healthy';

    // Check memory usage
    if (diagnostics.system.memoryInfo) {
      const memoryUsage = diagnostics.system.memoryInfo.usedJSHeapSize / 
                         diagnostics.system.memoryInfo.jsHeapSizeLimit;
      
      if (memoryUsage > 0.9) {
        status = 'critical';
      } else if (memoryUsage > 0.8) {
        status = 'unhealthy';
      } else if (memoryUsage > 0.7) {
        status = 'degraded';
      }
    }

    // Check connectivity
    if (!diagnostics.connectivity.online) {
      status = 'critical';
    }

    // Check error rate
    if (diagnostics.monitoringMetrics.errorRate > 20) {
      status = 'critical';
    } else if (diagnostics.monitoringMetrics.errorRate > 10) {
      status = 'unhealthy';
    } else if (diagnostics.monitoringMetrics.errorRate > 5) {
      status = 'degraded';
    }

    return status;
  }
}

// Export singleton instance
export const healthEndpoints = HealthEndpoints.getInstance();

// Export convenience functions for direct use
export const getHealth = () => healthEndpoints.getBasicHealth();
export const getDetailedHealth = () => healthEndpoints.getDetailedHealth();
export const getReadiness = () => healthEndpoints.getReadiness();
export const getLiveness = () => healthEndpoints.getLiveness();
export const getErrorMetrics = () => healthEndpoints.getErrorMetrics();
export const getIncidentMetrics = () => healthEndpoints.getIncidentMetrics();
export const getSystemDiagnostics = () => healthEndpoints.getSystemDiagnostics();
export const getPerformanceMetrics = () => healthEndpoints.getPerformanceMetrics();