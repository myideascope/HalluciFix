import { config } from '../config';
import { PerformanceMetric } from '../performanceMonitor';

import { logger } from '../logging';
export interface DataDogMetric {
  metric: string;
  points: Array<[number, number]>;
  tags?: string[];
  type?: 'gauge' | 'count' | 'rate' | 'histogram' | 'distribution';
  interval?: number;
  host?: string;
}

export interface DataDogEvent {
  title: string;
  text: string;
  date_happened?: number;
  priority?: 'normal' | 'low';
  host?: string;
  tags?: string[];
  alert_type?: 'error' | 'warning' | 'info' | 'success';
  aggregation_key?: string;
  source_type_name?: string;
}

export interface DataDogServiceCheck {
  check: string;
  host_name: string;
  timestamp?: number;
  status: 0 | 1 | 2 | 3; // OK, WARNING, CRITICAL, UNKNOWN
  message?: string;
  tags?: string[];
}

/**
 * DataDog monitoring integration service
 */
export class DataDogIntegration {
  private apiKey: string;
  private apiUrl: string = 'https://api.datadoghq.com';
  private site: string;

  constructor(apiKey?: string, site: string = 'datadoghq.com') {
    this.apiKey = apiKey || config.monitoring?.datadog?.apiKey || '';
    this.site = site;
    
    if (site !== 'datadoghq.com') {
      this.apiUrl = `https://api.${site}`;
    }
  }

  /**
   * Send metrics to DataDog
   */
  async sendMetrics(metrics: PerformanceMetric[]): Promise<void> {
    if (!this.apiKey) {
      logger.warn("DataDog API key not configured");
      return;
    }

    const dataDogMetrics: DataDogMetric[] = metrics.map(metric => ({
      metric: `hallucifix.${metric.name}`,
      points: [[Math.floor(metric.timestamp.getTime() / 1000), metric.value]],
      tags: Object.entries(metric.tags).map(([k, v]) => `${k}:${v}`),
      type: this.getDataDogMetricType(metric.unit),
      host: window?.location?.hostname || 'unknown'
    }));

    const payload = {
      series: dataDogMetrics
    };

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/series`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`DataDog API error: ${response.status} ${response.statusText}`);
      }

      console.log(`Successfully sent ${metrics.length} metrics to DataDog`);
    } catch (error) {
      logger.error("Failed to send metrics to DataDog:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Send custom event to DataDog
   */
  async sendEvent(event: Omit<DataDogEvent, 'date_happened'> & { date_happened?: Date }): Promise<void> {
    if (!this.apiKey) {
      logger.warn("DataDog API key not configured");
      return;
    }

    const payload: DataDogEvent = {
      ...event,
      date_happened: event.date_happened ? Math.floor(event.date_happened.getTime() / 1000) : Math.floor(Date.now() / 1000),
      host: window?.location?.hostname || 'unknown'
    };

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`DataDog API error: ${response.status} ${response.statusText}`);
      }

      logger.debug("Successfully sent event to DataDog");
    } catch (error) {
      logger.error("Failed to send event to DataDog:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Send service check to DataDog
   */
  async sendServiceCheck(serviceCheck: Omit<DataDogServiceCheck, 'timestamp'> & { timestamp?: Date }): Promise<void> {
    if (!this.apiKey) {
      logger.warn("DataDog API key not configured");
      return;
    }

    const payload: DataDogServiceCheck = {
      ...serviceCheck,
      timestamp: serviceCheck.timestamp ? Math.floor(serviceCheck.timestamp.getTime() / 1000) : Math.floor(Date.now() / 1000)
    };

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/check_run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`DataDog API error: ${response.status} ${response.statusText}`);
      }

      logger.debug("Successfully sent service check to DataDog");
    } catch (error) {
      logger.error("Failed to send service check to DataDog:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Create custom dashboard
   */
  async createDashboard(dashboardConfig: {
    title: string;
    description: string;
    widgets: Array<{
      title: string;
      type: 'timeseries' | 'query_value' | 'toplist' | 'heatmap';
      queries: Array<{
        metric: string;
        aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count';
        tags?: string[];
      }>;
    }>;
  }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('DataDog API key not configured');
    }

    const widgets = dashboardConfig.widgets.map(widget => ({
      definition: {
        title: widget.title,
        type: widget.type,
        requests: widget.queries.map(query => ({
          q: `${query.aggregation}:hallucifix.${query.metric}${query.tags ? `{${query.tags.join(',')}}` : ''}`,
          display_type: 'line'
        }))
      }
    }));

    const payload = {
      title: dashboardConfig.title,
      description: dashboardConfig.description,
      widgets,
      layout_type: 'ordered'
    };

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/dashboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`DataDog API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      logger.debug("Successfully created DataDog dashboard");
      return result.id;
    } catch (error) {
      logger.error("Failed to create DataDog dashboard:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Create monitor/alert
   */
  async createMonitor(monitorConfig: {
    name: string;
    type: 'metric alert' | 'service check' | 'event alert';
    query: string;
    message: string;
    tags?: string[];
    options?: {
      thresholds?: {
        critical?: number;
        warning?: number;
        ok?: number;
      };
      notify_no_data?: boolean;
      no_data_timeframe?: number;
      evaluation_delay?: number;
    };
  }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('DataDog API key not configured');
    }

    const payload = {
      name: monitorConfig.name,
      type: monitorConfig.type,
      query: monitorConfig.query,
      message: monitorConfig.message,
      tags: monitorConfig.tags || [],
      options: monitorConfig.options || {}
    };

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/monitor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`DataDog API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      logger.debug("Successfully created DataDog monitor");
      return result.id;
    } catch (error) {
      logger.error("Failed to create DataDog monitor:", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get metric type for DataDog
   */
  private getDataDogMetricType(unit: PerformanceMetric['unit']): DataDogMetric['type'] {
    switch (unit) {
      case 'count':
        return 'count';
      case 'ms':
      case 'bytes':
      case 'percent':
        return 'gauge';
      default:
        return 'gauge';
    }
  }

  /**
   * Test connection to DataDog
   */
  async testConnection(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/validate`, {
        method: 'GET',
        headers: {
          'DD-API-KEY': this.apiKey
        }
      });

      return response.ok;
    } catch (error) {
      logger.error("DataDog connection test failed:", error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Get dashboard URL
   */
  getDashboardUrl(dashboardId: string): string {
    return `https://app.${this.site}/dashboard/${dashboardId}`;
  }

  /**
   * Get monitor URL
   */
  getMonitorUrl(monitorId: string): string {
    return `https://app.${this.site}/monitors/${monitorId}`;
  }
}

// Export singleton instance
export const dataDogIntegration = new DataDogIntegration();
export default dataDogIntegration;