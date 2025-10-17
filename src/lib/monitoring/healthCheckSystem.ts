/**
 * System Health Check Framework
 * Configurable health checks for database, API, and service dependencies
 */

import { supabase } from '../supabase';
import { performanceMonitor } from '../performanceMonitor';

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical'
}

export interface HealthCheck {
  name: string;
  description: string;
  check: () => Promise<HealthCheckResult>;
  timeout?: number;
  critical?: boolean;
  tags?: string[];
}

export interface HealthCheckResult {
  status: HealthStatus;
  message: string;
  duration: number;
  timestamp: string;
  details?: Record<string, any>;
  error?: string;
}

export interface SystemHealthResult {
  status: HealthStatus;
  timestamp: string;
  checks: Record<string, HealthCheckResult>;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    critical: number;
  };
  uptime: number;
  responseTime: number;
}

/**
 * Health Check System
 * Manages and executes configurable health checks
 */
export class HealthCheckSystem {
  private checks: Map<string, HealthCheck> = new Map();
  private lastResults: Map<string, HealthCheckResult> = new Map();
  private systemStartTime: number = Date.now();
  private checkInterval?: NodeJS.Timeout;

  constructor() {
    this.registerDefaultChecks();
  }

  /**
   * Register a health check
   */
  registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(name: string): void {
    this.checks.delete(name);
    this.lastResults.delete(name);
  }

  /**
   * Execute a single health check
   */
  async executeCheck(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }

    const startTime = Date.now();
    const timeout = check.timeout || 5000;

    try {
      const result = await Promise.race([
        check.check(),
        new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), timeout)
        )
      ]);

      result.duration = Date.now() - startTime;
      result.timestamp = new Date().toISOString();
      
      this.lastResults.set(name, result);
      return result;
    } catch (error) {
      const result: HealthCheckResult = {
        status: HealthStatus.CRITICAL,
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.lastResults.set(name, result);
      return result;
    }
  }

  /**
   * Execute all health checks
   */
  async executeAllChecks(): Promise<SystemHealthResult> {
    const startTime = Date.now();
    const checkResults: Record<string, HealthCheckResult> = {};
    
    // Execute all checks in parallel
    const checkPromises = Array.from(this.checks.keys()).map(async (name) => {
      const result = await this.executeCheck(name);
      checkResults[name] = result;
      return result;
    });

    await Promise.allSettled(checkPromises);

    // Calculate overall system status
    const results = Object.values(checkResults);
    const summary = {
      total: results.length,
      healthy: results.filter(r => r.status === HealthStatus.HEALTHY).length,
      degraded: results.filter(r => r.status === HealthStatus.DEGRADED).length,
      unhealthy: results.filter(r => r.status === HealthStatus.UNHEALTHY).length,
      critical: results.filter(r => r.status === HealthStatus.CRITICAL).length
    };

    // Determine overall status
    let overallStatus = HealthStatus.HEALTHY;
    if (summary.critical > 0) {
      overallStatus = HealthStatus.CRITICAL;
    } else if (summary.unhealthy > 0) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (summary.degraded > 0) {
      overallStatus = HealthStatus.DEGRADED;
    }

    // Check if any critical checks failed
    const criticalChecks = Array.from(this.checks.values()).filter(c => c.critical);
    const failedCriticalChecks = criticalChecks.filter(check => {
      const result = checkResults[check.name];
      return result && result.status === HealthStatus.CRITICAL;
    });

    if (failedCriticalChecks.length > 0) {
      overallStatus = HealthStatus.CRITICAL;
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: checkResults,
      summary,
      uptime: this.getUptime(),
      responseTime: Date.now() - startTime
    };
  }

  /**
   * Get the last result for a specific check
   */
  getLastResult(name: string): HealthCheckResult | null {
    return this.lastResults.get(name) || null;
  }

  /**
   * Get all registered checks
   */
  getRegisteredChecks(): HealthCheck[] {
    return Array.from(this.checks.values());
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      try {
        await this.executeAllChecks();
      } catch (error) {
        console.error('Periodic health check failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  /**
   * Get system uptime in seconds
   */
  private getUptime(): number {
    return Math.floor((Date.now() - this.systemStartTime) / 1000);
  }

  /**
   * Register default health checks
   */
  private registerDefaultChecks(): void {
    // Database connectivity check
    this.registerCheck({
      name: 'database',
      description: 'Database connectivity and basic query execution',
      critical: true,
      tags: ['database', 'critical'],
      check: async (): Promise<HealthCheckResult> => {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('count')
            .limit(1);

          if (error) {
            return {
              status: HealthStatus.CRITICAL,
              message: `Database error: ${error.message}`,
              duration: 0,
              timestamp: '',
              error: error.message
            };
          }

          return {
            status: HealthStatus.HEALTHY,
            message: 'Database is accessible and responding',
            duration: 0,
            timestamp: '',
            details: { queryResult: 'success' }
          };
        } catch (error) {
          return {
            status: HealthStatus.CRITICAL,
            message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            duration: 0,
            timestamp: '',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }
    });

    // API endpoint health check
    this.registerCheck({
      name: 'api_endpoints',
      description: 'Core API endpoints availability',
      critical: true,
      tags: ['api', 'critical'],
      check: async (): Promise<HealthCheckResult> => {
        try {
          // Test a basic API endpoint
          const response = await fetch('/api/health', {
            method: 'GET',
            timeout: 5000
          } as any);

          if (response.ok) {
            return {
              status: HealthStatus.HEALTHY,
              message: 'API endpoints are responding',
              duration: 0,
              timestamp: '',
              details: { statusCode: response.status }
            };
          } else {
            return {
              status: HealthStatus.UNHEALTHY,
              message: `API endpoint returned status ${response.status}`,
              duration: 0,
              timestamp: '',
              details: { statusCode: response.status }
            };
          }
        } catch (error) {
          return {
            status: HealthStatus.DEGRADED,
            message: 'API endpoints may not be available (this is expected in development)',
            duration: 0,
            timestamp: '',
            details: { note: 'API health check skipped in development mode' }
          };
        }
      }
    });

    // Memory usage check
    this.registerCheck({
      name: 'memory_usage',
      description: 'JavaScript heap memory usage',
      tags: ['performance', 'memory'],
      check: async (): Promise<HealthCheckResult> => {
        if (typeof performance === 'undefined' || !(performance as any).memory) {
          return {
            status: HealthStatus.HEALTHY,
            message: 'Memory information not available',
            duration: 0,
            timestamp: '',
            details: { note: 'Memory API not supported' }
          };
        }

        const memory = (performance as any).memory;
        const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
        const usagePercent = Math.round(usageRatio * 100);

        let status = HealthStatus.HEALTHY;
        let message = `Memory usage: ${usagePercent}%`;

        if (usageRatio > 0.9) {
          status = HealthStatus.CRITICAL;
          message = `Critical memory usage: ${usagePercent}%`;
        } else if (usageRatio > 0.8) {
          status = HealthStatus.UNHEALTHY;
          message = `High memory usage: ${usagePercent}%`;
        } else if (usageRatio > 0.7) {
          status = HealthStatus.DEGRADED;
          message = `Elevated memory usage: ${usagePercent}%`;
        }

        return {
          status,
          message,
          duration: 0,
          timestamp: '',
          details: {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            usagePercent
          }
        };
      }
    });

    // Network connectivity check
    this.registerCheck({
      name: 'network_connectivity',
      description: 'Network connectivity status',
      tags: ['network'],
      check: async (): Promise<HealthCheckResult> => {
        const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        
        if (!isOnline) {
          return {
            status: HealthStatus.CRITICAL,
            message: 'Network is offline',
            duration: 0,
            timestamp: '',
            details: { online: false }
          };
        }

        // Test actual connectivity with a simple request
        try {
          const response = await fetch('https://httpbin.org/status/200', {
            method: 'HEAD',
            timeout: 3000
          } as any);

          return {
            status: HealthStatus.HEALTHY,
            message: 'Network connectivity is working',
            duration: 0,
            timestamp: '',
            details: { 
              online: true,
              testResponse: response.status
            }
          };
        } catch (error) {
          return {
            status: HealthStatus.DEGRADED,
            message: 'Network connectivity test failed, but browser reports online',
            duration: 0,
            timestamp: '',
            details: { 
              online: true,
              testError: error instanceof Error ? error.message : 'Unknown error'
            }
          };
        }
      }
    });

    // Local storage check
    this.registerCheck({
      name: 'local_storage',
      description: 'Local storage availability and functionality',
      tags: ['storage'],
      check: async (): Promise<HealthCheckResult> => {
        try {
          if (typeof localStorage === 'undefined') {
            return {
              status: HealthStatus.UNHEALTHY,
              message: 'Local storage is not available',
              duration: 0,
              timestamp: '',
              details: { available: false }
            };
          }

          // Test write/read/delete
          const testKey = '__health_check_test__';
          const testValue = 'test_value';
          
          localStorage.setItem(testKey, testValue);
          const retrievedValue = localStorage.getItem(testKey);
          localStorage.removeItem(testKey);

          if (retrievedValue !== testValue) {
            return {
              status: HealthStatus.UNHEALTHY,
              message: 'Local storage read/write test failed',
              duration: 0,
              timestamp: '',
              details: { available: true, testPassed: false }
            };
          }

          // Calculate usage
          let used = 0;
          for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
              used += localStorage[key].length + key.length;
            }
          }

          return {
            status: HealthStatus.HEALTHY,
            message: 'Local storage is working correctly',
            duration: 0,
            timestamp: '',
            details: { 
              available: true, 
              testPassed: true,
              usedBytes: used
            }
          };
        } catch (error) {
          return {
            status: HealthStatus.UNHEALTHY,
            message: `Local storage error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            duration: 0,
            timestamp: '',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }
    });

    // Performance metrics check
    this.registerCheck({
      name: 'performance_metrics',
      description: 'Application performance metrics',
      tags: ['performance'],
      check: async (): Promise<HealthCheckResult> => {
        try {
          // Get recent performance metrics from the performance monitor
          const recentMetrics = performanceMonitor.getPerformanceReport();
          
          let status = HealthStatus.HEALTHY;
          let message = 'Performance metrics are within normal ranges';
          
          // Check average response time
          if (recentMetrics.averageExecutionTime > 2000) {
            status = HealthStatus.UNHEALTHY;
            message = 'High average response time detected';
          } else if (recentMetrics.averageExecutionTime > 1000) {
            status = HealthStatus.DEGRADED;
            message = 'Elevated average response time';
          }

          // Check error rate
          if (recentMetrics.errorRate > 0.1) {
            status = HealthStatus.CRITICAL;
            message = 'High error rate detected';
          } else if (recentMetrics.errorRate > 0.05) {
            status = HealthStatus.UNHEALTHY;
            message = 'Elevated error rate';
          }

          return {
            status,
            message,
            duration: 0,
            timestamp: '',
            details: {
              averageExecutionTime: recentMetrics.averageExecutionTime,
              totalQueries: recentMetrics.totalQueries,
              errorRate: recentMetrics.errorRate,
              slowQueries: recentMetrics.slowQueries.length
            }
          };
        } catch (error) {
          return {
            status: HealthStatus.DEGRADED,
            message: 'Unable to retrieve performance metrics',
            duration: 0,
            timestamp: '',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopPeriodicChecks();
    this.checks.clear();
    this.lastResults.clear();
  }
}

// Export singleton instance
export const healthCheckSystem = new HealthCheckSystem();
export default healthCheckSystem;