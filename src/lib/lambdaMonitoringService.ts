/**
 * Lambda Monitoring Service
 * Client-side service for monitoring Lambda function health and performance
 */

import { logger } from './logging';
import { performanceMonitor } from './performanceMonitor';
import { errorManager } from './errors';

interface LambdaMetric {
  functionName: string;
  metricName: string;
  value: number;
  unit: string;
  timestamp: string;
  dimensions?: Record<string, string>;
}

interface LambdaAlert {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  functionName: string;
  alertType: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface LambdaHealthStatus {
  functionName: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  lastCheck: string;
  metrics: {
    errorRate: number;
    avgDuration: number;
    invocations: number;
    throttles: number;
    memoryUtilization?: number;
  };
  alerts: LambdaAlert[];
}

interface SystemHealthSummary {
  overallStatus: 'healthy' | 'warning' | 'critical';
  totalFunctions: number;
  healthyFunctions: number;
  warningFunctions: number;
  criticalFunctions: number;
  totalAlerts: number;
  lastUpdate: string;
  functions: LambdaHealthStatus[];
}

class LambdaMonitoringService {
  private logger = logger.child({ component: 'LambdaMonitoringService' });
  private apiGatewayUrl: string;
  private isInitialized = false;
  private healthCache: Map<string, LambdaHealthStatus> = new Map();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.apiGatewayUrl = process.env.VITE_API_GATEWAY_URL || '';
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      if (!this.apiGatewayUrl) {
        throw new Error('API Gateway URL not configured');
      }

      this.isInitialized = true;
      this.logger.info('Lambda monitoring service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Lambda monitoring service', error as Error);
      throw error;
    }
  }

  /**
   * Get health status for all Lambda functions
   */
  async getSystemHealth(): Promise<SystemHealthSummary> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const performanceId = performanceMonitor.startOperation('lambda_monitoring_system_health');

    try {
      this.logger.debug('Fetching system health status');

      // Get authentication token
      const token = await this.getAuthToken();

      const response = await fetch(`${this.apiGatewayUrl}/monitoring/system-health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch system health: ${response.status} ${response.statusText}`);
      }

      const healthData = await response.json();

      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        functionsCount: healthData.totalFunctions.toString(),
      });

      // Update cache
      healthData.functions.forEach((func: LambdaHealthStatus) => {
        this.healthCache.set(func.functionName, {
          ...func,
          lastCheck: new Date().toISOString(),
        });
      });

      return healthData;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      const handledError = errorManager.handleError(error, {
        component: 'LambdaMonitoringService',
        feature: 'system-health',
        operation: 'getSystemHealth',
      });

      this.logger.error('Failed to fetch system health', handledError);
      throw handledError;
    }
  }

  /**
   * Get health status for a specific Lambda function
   */
  async getFunctionHealth(functionName: string): Promise<LambdaHealthStatus> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Check cache first
    const cached = this.healthCache.get(functionName);
    if (cached && this.isCacheValid(cached.lastCheck)) {
      return cached;
    }

    const performanceId = performanceMonitor.startOperation('lambda_monitoring_function_health', {
      functionName,
    });

    try {
      this.logger.debug('Fetching function health status', { functionName });

      const token = await this.getAuthToken();

      const response = await fetch(`${this.apiGatewayUrl}/monitoring/function/${encodeURIComponent(functionName)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch function health: ${response.status} ${response.statusText}`);
      }

      const healthData = await response.json();

      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        functionStatus: healthData.status,
      });

      // Update cache
      const healthStatus = {
        ...healthData,
        lastCheck: new Date().toISOString(),
      };
      this.healthCache.set(functionName, healthStatus);

      return healthStatus;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      const handledError = errorManager.handleError(error, {
        component: 'LambdaMonitoringService',
        feature: 'function-health',
        operation: 'getFunctionHealth',
        functionName,
      });

      this.logger.error('Failed to fetch function health', handledError);
      throw handledError;
    }
  }

  /**
   * Get recent alerts for Lambda functions
   */
  async getRecentAlerts(hours: number = 24): Promise<LambdaAlert[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const performanceId = performanceMonitor.startOperation('lambda_monitoring_recent_alerts');

    try {
      this.logger.debug('Fetching recent alerts', { hours });

      const token = await this.getAuthToken();

      const response = await fetch(`${this.apiGatewayUrl}/monitoring/alerts?hours=${hours}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch alerts: ${response.status} ${response.statusText}`);
      }

      const alerts = await response.json();

      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        alertsCount: alerts.length.toString(),
      });

      return alerts;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      const handledError = errorManager.handleError(error, {
        component: 'LambdaMonitoringService',
        feature: 'alerts',
        operation: 'getRecentAlerts',
      });

      this.logger.error('Failed to fetch recent alerts', handledError);
      throw handledError;
    }
  }

  /**
   * Get performance metrics for Lambda functions
   */
  async getPerformanceMetrics(
    functionName?: string,
    timeRange: { start: Date; end: Date } = {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    }
  ): Promise<LambdaMetric[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const performanceId = performanceMonitor.startOperation('lambda_monitoring_performance_metrics', {
      functionName: functionName || 'all',
    });

    try {
      this.logger.debug('Fetching performance metrics', { functionName, timeRange });

      const token = await this.getAuthToken();

      const params = new URLSearchParams({
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
      });

      if (functionName) {
        params.append('functionName', functionName);
      }

      const response = await fetch(`${this.apiGatewayUrl}/monitoring/metrics?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch performance metrics: ${response.status} ${response.statusText}`);
      }

      const metrics = await response.json();

      performanceMonitor.endOperation(performanceId, {
        status: 'success',
        metricsCount: metrics.length.toString(),
      });

      return metrics;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      const handledError = errorManager.handleError(error, {
        component: 'LambdaMonitoringService',
        feature: 'performance-metrics',
        operation: 'getPerformanceMetrics',
        functionName,
      });

      this.logger.error('Failed to fetch performance metrics', handledError);
      throw handledError;
    }
  }

  /**
   * Trigger manual health check
   */
  async triggerHealthCheck(): Promise<{ success: boolean; message: string }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const performanceId = performanceMonitor.startOperation('lambda_monitoring_trigger_health_check');

    try {
      this.logger.info('Triggering manual health check');

      const token = await this.getAuthToken();

      const response = await fetch(`${this.apiGatewayUrl}/monitoring/health-check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to trigger health check: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      performanceMonitor.endOperation(performanceId, { status: 'success' });

      // Clear cache to force fresh data on next request
      this.healthCache.clear();

      this.logger.info('Health check triggered successfully');
      return result;

    } catch (error) {
      performanceMonitor.endOperation(performanceId, { status: 'error' });
      
      const handledError = errorManager.handleError(error, {
        component: 'LambdaMonitoringService',
        feature: 'health-check',
        operation: 'triggerHealthCheck',
      });

      this.logger.error('Failed to trigger health check', handledError);
      throw handledError;
    }
  }

  /**
   * Get cached health status (for real-time UI updates)
   */
  getCachedSystemHealth(): SystemHealthSummary | null {
    const cachedFunctions = Array.from(this.healthCache.values());
    
    if (cachedFunctions.length === 0) {
      return null;
    }

    const healthyCount = cachedFunctions.filter(f => f.status === 'healthy').length;
    const warningCount = cachedFunctions.filter(f => f.status === 'warning').length;
    const criticalCount = cachedFunctions.filter(f => f.status === 'critical').length;
    const totalAlerts = cachedFunctions.reduce((sum, f) => sum + f.alerts.length, 0);

    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalCount > 0) {
      overallStatus = 'critical';
    } else if (warningCount > 0) {
      overallStatus = 'warning';
    }

    return {
      overallStatus,
      totalFunctions: cachedFunctions.length,
      healthyFunctions: healthyCount,
      warningFunctions: warningCount,
      criticalFunctions: criticalCount,
      totalAlerts,
      lastUpdate: Math.max(...cachedFunctions.map(f => new Date(f.lastCheck).getTime())).toString(),
      functions: cachedFunctions,
    };
  }

  /**
   * Subscribe to real-time health updates (WebSocket or polling)
   */
  subscribeToHealthUpdates(callback: (health: SystemHealthSummary) => void): () => void {
    // For now, implement polling. In production, this could use WebSockets
    const interval = setInterval(async () => {
      try {
        const health = await this.getSystemHealth();
        callback(health);
      } catch (error) {
        this.logger.warn('Failed to fetch health updates', undefined, {
          error: (error as Error).message,
        });
      }
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }

  /**
   * Get authentication token
   */
  private async getAuthToken(): Promise<string> {
    // This would integrate with your authentication system
    // For development/testing, return a placeholder
    if (process.env.NODE_ENV === 'development') {
      return 'dev-token';
    }

    throw new Error('Authentication token not available');
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(lastCheck: string): boolean {
    const cacheAge = Date.now() - new Date(lastCheck).getTime();
    return cacheAge < this.cacheExpiry;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      apiGatewayUrl: this.apiGatewayUrl,
      cacheSize: this.healthCache.size,
    };
  }
}

// Export singleton instance
export const lambdaMonitoringService = new LambdaMonitoringService();
export default lambdaMonitoringService;