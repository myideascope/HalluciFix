/**
 * Infrastructure Metrics Monitoring
 * Monitors CPU, memory, disk, network usage and service availability
 */

export interface ResourceMetrics {
  timestamp: string;
  cpu?: CPUMetrics;
  memory?: MemoryMetrics;
  network?: NetworkMetrics;
  storage?: StorageMetrics;
  performance?: PerformanceMetrics;
}

export interface CPUMetrics {
  usage: number; // percentage
  loadAverage?: number[];
  cores?: number;
  details?: Record<string, any>;
}

export interface MemoryMetrics {
  used: number; // bytes
  total: number; // bytes
  available: number; // bytes
  percentage: number;
  heap?: {
    used: number;
    total: number;
    limit: number;
  };
}

export interface NetworkMetrics {
  online: boolean;
  effectiveType?: string;
  downlink?: number; // Mbps
  rtt?: number; // ms
  bytesReceived?: number;
  bytesSent?: number;
  packetsReceived?: number;
  packetsSent?: number;
}

export interface StorageMetrics {
  localStorage: {
    used: number;
    available: boolean;
    quota?: number;
  };
  sessionStorage: {
    used: number;
    available: boolean;
  };
  indexedDB: {
    available: boolean;
    usage?: number;
    quota?: number;
  };
  cache?: {
    used: number;
    quota?: number;
  };
}

export interface PerformanceMetrics {
  navigation?: {
    loadTime: number;
    domContentLoaded: number;
    firstPaint?: number;
    firstContentfulPaint?: number;
    largestContentfulPaint?: number;
  };
  vitals?: {
    cls: number; // Cumulative Layout Shift
    fid?: number; // First Input Delay
    lcp?: number; // Largest Contentful Paint
    fcp?: number; // First Contentful Paint
    ttfb?: number; // Time to First Byte
  };
}

export interface ServiceAvailability {
  serviceName: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  responseTime?: number;
  lastCheck: string;
  uptime: number; // percentage
  details?: Record<string, any>;
}

export interface AlertThreshold {
  metric: string;
  operator: 'greater_than' | 'less_than' | 'equal' | 'not_equal';
  value: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

export interface MetricAlert {
  id: string;
  threshold: AlertThreshold;
  currentValue: number;
  timestamp: string;
  message: string;
  acknowledged: boolean;
}

/**
 * Infrastructure Metrics Monitor
 * Collects and monitors system resource usage and service availability
 */
export class InfrastructureMetricsMonitor {
  private metrics: ResourceMetrics[] = [];
  private services: Map<string, ServiceAvailability> = new Map();
  private thresholds: Map<string, AlertThreshold> = new Map();
  private alerts: MetricAlert[] = [];
  private metricsInterval?: NodeJS.Timeout;
  private servicesInterval?: NodeJS.Timeout;
  private maxMetricsHistory = 1000;
  private alertCallbacks: Array<(alert: MetricAlert) => void> = [];

  constructor() {
    this.setupDefaultThresholds();
    this.registerDefaultServices();
  }

  /**
   * Start monitoring infrastructure metrics
   */
  startMonitoring(metricsIntervalMs = 30000, servicesIntervalMs = 60000): void {
    // Collect metrics periodically
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, metricsIntervalMs);

    // Check service availability periodically
    this.servicesInterval = setInterval(() => {
      this.checkServiceAvailability();
    }, servicesIntervalMs);

    // Initial collection
    this.collectMetrics();
    this.checkServiceAvailability();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
    if (this.servicesInterval) {
      clearInterval(this.servicesInterval);
      this.servicesInterval = undefined;
    }
  }

  /**
   * Collect current infrastructure metrics
   */
  async collectMetrics(): Promise<ResourceMetrics> {
    const timestamp = new Date().toISOString();
    
    const metrics: ResourceMetrics = {
      timestamp,
      cpu: await this.collectCPUMetrics(),
      memory: await this.collectMemoryMetrics(),
      network: await this.collectNetworkMetrics(),
      storage: await this.collectStorageMetrics(),
      performance: await this.collectPerformanceMetrics()
    };

    // Store metrics
    this.metrics.push(metrics);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // Check thresholds and trigger alerts
    this.checkThresholds(metrics);

    return metrics;
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(count = 100): ResourceMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * Get metrics within time range
   */
  getMetricsInRange(startTime: Date, endTime: Date): ResourceMetrics[] {
    return this.metrics.filter(m => {
      const timestamp = new Date(m.timestamp);
      return timestamp >= startTime && timestamp <= endTime;
    });
  }

  /**
   * Register a service for availability monitoring
   */
  registerService(serviceName: string, checkUrl?: string, checkFunction?: () => Promise<boolean>): void {
    this.services.set(serviceName, {
      serviceName,
      status: 'unknown',
      lastCheck: new Date().toISOString(),
      uptime: 100,
      details: { checkUrl, hasCustomCheck: !!checkFunction }
    });
  }

  /**
   * Get service availability status
   */
  getServiceAvailability(): ServiceAvailability[] {
    return Array.from(this.services.values());
  }

  /**
   * Add alert threshold
   */
  addThreshold(id: string, threshold: AlertThreshold): void {
    this.thresholds.set(id, threshold);
  }

  /**
   * Remove alert threshold
   */
  removeThreshold(id: string): void {
    this.thresholds.delete(id);
  }

  /**
   * Get current alerts
   */
  getCurrentAlerts(): MetricAlert[] {
    return this.alerts.filter(a => !a.acknowledged);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Subscribe to alerts
   */
  onAlert(callback: (alert: MetricAlert) => void): () => void {
    this.alertCallbacks.push(callback);
    return () => {
      const index = this.alertCallbacks.indexOf(callback);
      if (index > -1) {
        this.alertCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Collect CPU metrics (browser-based approximation)
   */
  private async collectCPUMetrics(): Promise<CPUMetrics | undefined> {
    // In browser environment, we can't directly access CPU metrics
    // We can approximate based on performance timing and frame rates
    
    if (typeof performance === 'undefined') return undefined;

    try {
      // Use performance.now() precision as a rough indicator
      const start = performance.now();
      
      // Perform a small computational task to measure responsiveness
      let sum = 0;
      for (let i = 0; i < 100000; i++) {
        sum += Math.random();
      }
      
      const duration = performance.now() - start;
      
      // Rough approximation: longer duration = higher CPU usage
      // This is not accurate but gives a relative indication
      const approximateUsage = Math.min(100, Math.max(0, (duration - 1) * 10));

      return {
        usage: approximateUsage,
        cores: navigator.hardwareConcurrency || undefined,
        details: {
          computationTime: duration,
          note: 'Browser-based CPU approximation'
        }
      };
    } catch (error) {
      return {
        usage: 0,
        details: { error: 'CPU metrics collection failed' }
      };
    }
  }

  /**
   * Collect memory metrics
   */
  private async collectMemoryMetrics(): Promise<MemoryMetrics | undefined> {
    if (typeof performance === 'undefined') return undefined;

    try {
      const memory = (performance as any).memory;
      if (!memory) return undefined;

      const used = memory.usedJSHeapSize;
      const total = memory.totalJSHeapSize;
      const limit = memory.jsHeapSizeLimit;
      const percentage = (used / limit) * 100;

      return {
        used,
        total,
        available: limit - used,
        percentage,
        heap: {
          used,
          total,
          limit
        }
      };
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Collect network metrics
   */
  private async collectNetworkMetrics(): Promise<NetworkMetrics | undefined> {
    if (typeof navigator === 'undefined') return undefined;

    try {
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      
      const metrics: NetworkMetrics = {
        online: navigator.onLine
      };

      if (connection) {
        metrics.effectiveType = connection.effectiveType;
        metrics.downlink = connection.downlink;
        metrics.rtt = connection.rtt;
      }

      return metrics;
    } catch (error) {
      return {
        online: typeof navigator !== 'undefined' ? navigator.onLine : true
      };
    }
  }

  /**
   * Collect storage metrics
   */
  private async collectStorageMetrics(): Promise<StorageMetrics | undefined> {
    try {
      const storage: StorageMetrics = {
        localStorage: {
          used: 0,
          available: false
        },
        sessionStorage: {
          used: 0,
          available: false
        },
        indexedDB: {
          available: false
        }
      };

      // Local storage
      try {
        if (typeof localStorage !== 'undefined') {
          storage.localStorage.available = true;
          let used = 0;
          for (const key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
              used += localStorage[key].length + key.length;
            }
          }
          storage.localStorage.used = used;

          // Try to get quota
          if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            if (estimate.quota) {
              storage.localStorage.quota = estimate.quota;
            }
          }
        }
      } catch (error) {
        // localStorage not available
      }

      // Session storage
      try {
        if (typeof sessionStorage !== 'undefined') {
          storage.sessionStorage.available = true;
          let used = 0;
          for (const key in sessionStorage) {
            if (sessionStorage.hasOwnProperty(key)) {
              used += sessionStorage[key].length + key.length;
            }
          }
          storage.sessionStorage.used = used;
        }
      } catch (error) {
        // sessionStorage not available
      }

      // IndexedDB
      try {
        if (typeof indexedDB !== 'undefined') {
          storage.indexedDB.available = true;
          
          // Try to get usage
          if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            if (estimate.usage) {
              storage.indexedDB.usage = estimate.usage;
            }
            if (estimate.quota) {
              storage.indexedDB.quota = estimate.quota;
            }
          }
        }
      } catch (error) {
        // IndexedDB not available
      }

      return storage;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Collect performance metrics
   */
  private async collectPerformanceMetrics(): Promise<PerformanceMetrics | undefined> {
    if (typeof performance === 'undefined') return undefined;

    try {
      const metrics: PerformanceMetrics = {};

      // Navigation timing
      if (performance.timing) {
        const timing = performance.timing;
        metrics.navigation = {
          loadTime: timing.loadEventEnd - timing.navigationStart,
          domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart
        };
      }

      // Performance entries
      if (performance.getEntriesByType) {
        const paintEntries = performance.getEntriesByType('paint');
        const navigationEntries = performance.getEntriesByType('navigation');

        if (paintEntries.length > 0) {
          metrics.navigation = metrics.navigation || {};
          paintEntries.forEach(entry => {
            if (entry.name === 'first-paint') {
              metrics.navigation!.firstPaint = entry.startTime;
            } else if (entry.name === 'first-contentful-paint') {
              metrics.navigation!.firstContentfulPaint = entry.startTime;
            }
          });
        }

        // Web Vitals approximation
        if (navigationEntries.length > 0) {
          const nav = navigationEntries[0] as any;
          metrics.vitals = {
            cls: 0, // Would need layout shift observer
            ttfb: nav.responseStart - nav.requestStart
          };
        }
      }

      return metrics;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Check service availability
   */
  private async checkServiceAvailability(): Promise<void> {
    const checkPromises = Array.from(this.services.entries()).map(async ([name, service]) => {
      const startTime = Date.now();
      let status: 'up' | 'down' | 'degraded' = 'down';
      let responseTime = 0;

      try {
        // For browser environment, we'll check basic connectivity
        if (name === 'network') {
          status = navigator.onLine ? 'up' : 'down';
          responseTime = 0;
        } else if (name === 'supabase') {
          // Test Supabase connectivity with a simple query
          const { error } = await fetch(import.meta.env.VITE_SUPABASE_URL + '/rest/v1/', {
            method: 'HEAD',
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
            }
          });
          
          responseTime = Date.now() - startTime;
          status = !error ? 'up' : 'down';
        } else {
          // Generic HTTP check if URL is provided
          const checkUrl = service.details?.checkUrl;
          if (checkUrl) {
            const response = await fetch(checkUrl, {
              method: 'HEAD',
              timeout: 5000
            } as any);
            
            responseTime = Date.now() - startTime;
            status = response.ok ? 'up' : 'degraded';
          } else {
            status = 'up'; // Assume up if no check method
          }
        }
      } catch (error) {
        responseTime = Date.now() - startTime;
        status = 'down';
      }

      // Update service status
      const updatedService: ServiceAvailability = {
        ...service,
        status,
        responseTime,
        lastCheck: new Date().toISOString()
      };

      // Calculate uptime (simplified)
      if (status === 'up') {
        updatedService.uptime = Math.min(100, service.uptime + 0.1);
      } else {
        updatedService.uptime = Math.max(0, service.uptime - 1);
      }

      this.services.set(name, updatedService);
    });

    await Promise.allSettled(checkPromises);
  }

  /**
   * Check thresholds and trigger alerts
   */
  private checkThresholds(metrics: ResourceMetrics): void {
    for (const [id, threshold] of this.thresholds.entries()) {
      if (!threshold.enabled) continue;

      const value = this.extractMetricValue(metrics, threshold.metric);
      if (value === undefined) continue;

      const shouldAlert = this.evaluateThreshold(value, threshold);
      
      if (shouldAlert) {
        const alert: MetricAlert = {
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          threshold,
          currentValue: value,
          timestamp: metrics.timestamp,
          message: `${threshold.metric} ${threshold.operator.replace('_', ' ')} ${threshold.value} (current: ${value})`,
          acknowledged: false
        };

        this.alerts.push(alert);
        
        // Keep only recent alerts
        if (this.alerts.length > 1000) {
          this.alerts = this.alerts.slice(-1000);
        }

        // Notify callbacks
        this.alertCallbacks.forEach(callback => {
          try {
            callback(alert);
          } catch (error) {
            console.error('Alert callback failed:', error);
          }
        });
      }
    }
  }

  /**
   * Extract metric value from metrics object
   */
  private extractMetricValue(metrics: ResourceMetrics, metricPath: string): number | undefined {
    const parts = metricPath.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Evaluate threshold condition
   */
  private evaluateThreshold(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.operator) {
      case 'greater_than':
        return value > threshold.value;
      case 'less_than':
        return value < threshold.value;
      case 'equal':
        return value === threshold.value;
      case 'not_equal':
        return value !== threshold.value;
      default:
        return false;
    }
  }

  /**
   * Setup default alert thresholds
   */
  private setupDefaultThresholds(): void {
    const defaultThresholds: Array<[string, AlertThreshold]> = [
      ['memory_high', {
        metric: 'memory.percentage',
        operator: 'greater_than',
        value: 80,
        severity: 'high',
        enabled: true
      }],
      ['memory_critical', {
        metric: 'memory.percentage',
        operator: 'greater_than',
        value: 90,
        severity: 'critical',
        enabled: true
      }],
      ['cpu_high', {
        metric: 'cpu.usage',
        operator: 'greater_than',
        value: 80,
        severity: 'medium',
        enabled: true
      }],
      ['network_offline', {
        metric: 'network.online',
        operator: 'equal',
        value: 0,
        severity: 'critical',
        enabled: true
      }]
    ];

    defaultThresholds.forEach(([id, threshold]) => {
      this.thresholds.set(id, threshold);
    });
  }

  /**
   * Register default services for monitoring
   */
  private registerDefaultServices(): void {
    this.registerService('network');
    this.registerService('supabase');
    this.registerService('localStorage');
    this.registerService('sessionStorage');
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    latest: ResourceMetrics | null;
    averages: Partial<ResourceMetrics>;
    alerts: number;
    services: { up: number; down: number; total: number };
  } {
    const latest = this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
    const recentMetrics = this.getRecentMetrics(10);
    
    // Calculate averages
    const averages: Partial<ResourceMetrics> = {};
    if (recentMetrics.length > 0) {
      const memoryAvg = recentMetrics
        .filter(m => m.memory)
        .reduce((sum, m) => sum + (m.memory!.percentage || 0), 0) / recentMetrics.length;
      
      if (memoryAvg > 0) {
        averages.memory = { percentage: memoryAvg } as MemoryMetrics;
      }
    }

    // Service status
    const services = Array.from(this.services.values());
    const serviceStats = {
      up: services.filter(s => s.status === 'up').length,
      down: services.filter(s => s.status === 'down').length,
      total: services.length
    };

    return {
      latest,
      averages,
      alerts: this.getCurrentAlerts().length,
      services: serviceStats
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.metrics = [];
    this.services.clear();
    this.thresholds.clear();
    this.alerts = [];
    this.alertCallbacks = [];
  }
}

// Export singleton instance
export const infrastructureMetrics = new InfrastructureMetricsMonitor();
export default infrastructureMetrics;