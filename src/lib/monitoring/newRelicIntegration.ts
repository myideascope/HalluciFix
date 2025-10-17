import { config } from '../config';
import { PerformanceMetric } from '../performanceMonitor';

export interface NewRelicEvent {
  eventType: string;
  timestamp?: number;
  [key: string]: any;
}

export interface NewRelicMetric {
  name: string;
  type: 'gauge' | 'count' | 'summary';
  value: number;
  timestamp?: number;
  interval?: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface NewRelicInsight {
  eventType: string;
  timestamp: number;
  [attribute: string]: string | number | boolean;
}

/**
 * New Relic monitoring integration service
 */
export class NewRelicIntegration {
  private apiKey: string;
  private accountId: string;
  private region: 'US' | 'EU';
  private baseUrl: string;

  constructor(apiKey?: string, accountId?: string, region: 'US' | 'EU' = 'US') {
    this.apiKey = apiKey || config.monitoring?.newrelic?.apiKey || '';
    this.accountId = accountId || config.monitoring?.newrelic?.accountId || '';
    this.region = region;
    this.baseUrl = region === 'EU' 
      ? 'https://insights-collector.eu01.nr-data.net'
      : 'https://insights-collector.newrelic.com';
  }

  /**
   * Send custom events to New Relic Insights
   */
  async sendEvents(events: NewRelicEvent[]): Promise<void> {
    if (!this.apiKey || !this.accountId) {
      console.warn('New Relic API key or account ID not configured');
      return;
    }

    const payload = events.map(event => ({
      ...event,
      timestamp: event.timestamp || Date.now()
    }));

    try {
      const response = await fetch(`${this.baseUrl}/v1/accounts/${this.accountId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Insert-Key': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`New Relic API error: ${response.status} ${response.statusText}`);
      }

      console.log(`Successfully sent ${events.length} events to New Relic`);
    } catch (error) {
      console.error('Failed to send events to New Relic:', error);
      throw error;
    }
  }

  /**
   * Send performance metrics as custom events
   */
  async sendMetrics(metrics: PerformanceMetric[]): Promise<void> {
    const events: NewRelicEvent[] = metrics.map(metric => ({
      eventType: 'HallucifixMetric',
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      timestamp: metric.timestamp.getTime(),
      ...metric.tags
    }));

    await this.sendEvents(events);
  }

  /**
   * Send custom metric data
   */
  async sendCustomMetrics(metrics: NewRelicMetric[]): Promise<void> {
    if (!this.apiKey) {
      console.warn('New Relic API key not configured');
      return;
    }

    const payload = {
      metrics: metrics.map(metric => ({
        ...metric,
        timestamp: metric.timestamp || Math.floor(Date.now() / 1000)
      }))
    };

    try {
      const response = await fetch('https://metric-api.newrelic.com/metric/v1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`New Relic Metric API error: ${response.status} ${response.statusText}`);
      }

      console.log(`Successfully sent ${metrics.length} custom metrics to New Relic`);
    } catch (error) {
      console.error('Failed to send custom metrics to New Relic:', error);
      throw error;
    }
  }

  /**
   * Send application error to New Relic
   */
  async sendError(error: {
    message: string;
    stack?: string;
    errorClass?: string;
    timestamp?: Date;
    attributes?: Record<string, any>;
  }): Promise<void> {
    const errorEvent: NewRelicEvent = {
      eventType: 'HallucifixError',
      message: error.message,
      stack: error.stack,
      errorClass: error.errorClass || 'Error',
      timestamp: error.timestamp?.getTime() || Date.now(),
      ...error.attributes
    };

    await this.sendEvents([errorEvent]);
  }

  /**
   * Send business event
   */
  async sendBusinessEvent(event: {
    eventType: string;
    userId?: string;
    action: string;
    category: string;
    value?: number;
    attributes?: Record<string, any>;
  }): Promise<void> {
    const businessEvent: NewRelicEvent = {
      eventType: event.eventType,
      userId: event.userId,
      action: event.action,
      category: event.category,
      value: event.value,
      timestamp: Date.now(),
      ...event.attributes
    };

    await this.sendEvents([businessEvent]);
  }

  /**
   * Send page view event
   */
  async sendPageView(pageView: {
    url: string;
    title: string;
    userId?: string;
    loadTime?: number;
    referrer?: string;
    userAgent?: string;
  }): Promise<void> {
    const pageViewEvent: NewRelicEvent = {
      eventType: 'HallucifixPageView',
      url: pageView.url,
      title: pageView.title,
      userId: pageView.userId,
      loadTime: pageView.loadTime,
      referrer: pageView.referrer,
      userAgent: pageView.userAgent,
      timestamp: Date.now()
    };

    await this.sendEvents([pageViewEvent]);
  }

  /**
   * Create alert policy
   */
  async createAlertPolicy(policy: {
    name: string;
    incidentPreference: 'PER_POLICY' | 'PER_CONDITION' | 'PER_CONDITION_AND_TARGET';
  }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('New Relic API key not configured');
    }

    try {
      const response = await fetch('https://api.newrelic.com/v2/alerts_policies.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey
        },
        body: JSON.stringify({
          policy: policy
        })
      });

      if (!response.ok) {
        throw new Error(`New Relic API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Successfully created New Relic alert policy');
      return result.policy.id;
    } catch (error) {
      console.error('Failed to create New Relic alert policy:', error);
      throw error;
    }
  }

  /**
   * Create NRQL alert condition
   */
  async createNrqlAlertCondition(condition: {
    policyId: string;
    name: string;
    type: 'static' | 'baseline';
    nrql: {
      query: string;
      sinceValue: string;
    };
    signal: {
      aggregationWindow: number;
      aggregationMethod: 'EVENT_FLOW' | 'EVENT_TIMER' | 'CADENCE';
      aggregationDelay?: number;
      aggregationTimer?: number;
      fillOption?: 'NONE' | 'LAST_VALUE' | 'STATIC';
      fillValue?: number;
    };
    terms: Array<{
      threshold: number;
      thresholdOccurrences: 'ALL' | 'AT_LEAST_ONCE';
      thresholdDuration: number;
      operator: 'ABOVE' | 'BELOW' | 'EQUAL';
      priority: 'CRITICAL' | 'WARNING';
    }>;
    violationTimeLimitSeconds?: number;
  }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('New Relic API key not configured');
    }

    try {
      const response = await fetch(`https://api.newrelic.com/v2/alerts_nrql_conditions/policies/${condition.policyId}.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey
        },
        body: JSON.stringify({
          nrql_condition: condition
        })
      });

      if (!response.ok) {
        throw new Error(`New Relic API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Successfully created New Relic NRQL alert condition');
      return result.nrql_condition.id;
    } catch (error) {
      console.error('Failed to create New Relic NRQL alert condition:', error);
      throw error;
    }
  }

  /**
   * Create custom dashboard
   */
  async createDashboard(dashboard: {
    name: string;
    permissions: 'PUBLIC_READ_ONLY' | 'PUBLIC_READ_WRITE' | 'PRIVATE';
    pages: Array<{
      name: string;
      widgets: Array<{
        title: string;
        visualization: {
          id: string;
        };
        rawConfiguration: {
          nrqlQueries: Array<{
            query: string;
            accountId: string;
          }>;
        };
      }>;
    }>;
  }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('New Relic API key not configured');
    }

    try {
      const response = await fetch('https://api.newrelic.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.apiKey
        },
        body: JSON.stringify({
          query: `
            mutation dashboardCreate($dashboard: DashboardInput!) {
              dashboardCreate(dashboard: $dashboard) {
                entityResult {
                  guid
                  name
                }
                errors {
                  description
                  type
                }
              }
            }
          `,
          variables: {
            dashboard: dashboard
          }
        })
      });

      if (!response.ok) {
        throw new Error(`New Relic GraphQL API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      console.log('Successfully created New Relic dashboard');
      return result.data.dashboardCreate.entityResult.guid;
    } catch (error) {
      console.error('Failed to create New Relic dashboard:', error);
      throw error;
    }
  }

  /**
   * Test connection to New Relic
   */
  async testConnection(): Promise<boolean> {
    if (!this.apiKey || !this.accountId) {
      return false;
    }

    try {
      const testEvent: NewRelicEvent = {
        eventType: 'HallucifixConnectionTest',
        timestamp: Date.now(),
        test: true
      };

      await this.sendEvents([testEvent]);
      return true;
    } catch (error) {
      console.error('New Relic connection test failed:', error);
      return false;
    }
  }

  /**
   * Get dashboard URL
   */
  getDashboardUrl(dashboardGuid: string): string {
    const baseUrl = this.region === 'EU' ? 'https://one.eu.newrelic.com' : 'https://one.newrelic.com';
    return `${baseUrl}/redirect/entity/${dashboardGuid}`;
  }

  /**
   * Get alert policy URL
   */
  getAlertPolicyUrl(policyId: string): string {
    const baseUrl = this.region === 'EU' ? 'https://alerts.eu.newrelic.com' : 'https://alerts.newrelic.com';
    return `${baseUrl}/accounts/${this.accountId}/policies/${policyId}`;
  }

  /**
   * Query NRQL data
   */
  async queryNrql(query: string, timeRange?: { since?: string; until?: string }): Promise<any> {
    if (!this.apiKey || !this.accountId) {
      throw new Error('New Relic API key or account ID not configured');
    }

    const nrqlQuery = timeRange 
      ? `${query} SINCE ${timeRange.since || '1 hour ago'} ${timeRange.until ? `UNTIL ${timeRange.until}` : ''}`
      : query;

    try {
      const response = await fetch(`https://insights-api.newrelic.com/v1/accounts/${this.accountId}/query`, {
        method: 'GET',
        headers: {
          'X-Query-Key': this.apiKey,
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          nrql: nrqlQuery
        })
      });

      if (!response.ok) {
        throw new Error(`New Relic Query API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to query New Relic:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const newRelicIntegration = new NewRelicIntegration();
export default newRelicIntegration;