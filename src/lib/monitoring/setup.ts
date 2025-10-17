import { config } from '../config';
import { performanceMonitor } from '../performanceMonitor';
import { webVitalsMonitor } from '../webVitalsMonitor';
import { apiMonitoringService } from '../apiMonitoring';
import { businessMetricsMonitor } from '../businessMetricsMonitor';
import { metricsAggregator } from '../metricsAggregator';
import { dataDogIntegration } from './dataDogIntegration';
import { newRelicIntegration } from './newRelicIntegration';

/**
 * Initialize all monitoring services
 */
export async function initializeMonitoring(): Promise<void> {
  console.log('Initializing monitoring services...');

  try {
    // Configure performance monitor based on config
    if (config.monitoring?.performance) {
      const perfConfig = config.monitoring.performance;
      
      if (perfConfig.batchSize) {
        performanceMonitor.setBatchSize(perfConfig.batchSize);
      }
      
      if (perfConfig.flushIntervalMs) {
        performanceMonitor.setFlushInterval(perfConfig.flushIntervalMs);
      }
    }

    // Initialize Web Vitals monitoring (browser only)
    if (typeof window !== 'undefined') {
      webVitalsMonitor.initialize();
      console.log('✓ Web Vitals monitoring initialized');
    }

    // Test external service connections
    const connectionTests = await Promise.allSettled([
      testDataDogConnection(),
      testNewRelicConnection()
    ]);

    connectionTests.forEach((result, index) => {
      const serviceName = index === 0 ? 'DataDog' : 'New Relic';
      if (result.status === 'fulfilled' && result.value) {
        console.log(`✓ ${serviceName} connection successful`);
      } else {
        console.warn(`⚠ ${serviceName} connection failed or not configured`);
      }
    });

    // Set up metrics aggregation
    if (config.monitoring?.performance?.aggregationIntervalMs) {
      // Metrics aggregator is already initialized with default config
      console.log('✓ Metrics aggregation configured');
    }

    // Configure API monitoring thresholds
    if (config.monitoring?.performance) {
      // Set custom thresholds if needed
      apiMonitoringService.setSlowQueryThreshold(2000); // 2 seconds
      apiMonitoringService.setErrorRateThreshold(0.05); // 5%
      console.log('✓ API monitoring thresholds configured');
    }

    console.log('✅ Monitoring services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize monitoring services:', error);
    throw error;
  }
}

/**
 * Test DataDog connection
 */
async function testDataDogConnection(): Promise<boolean> {
  try {
    return await dataDogIntegration.testConnection();
  } catch (error) {
    console.debug('DataDog connection test failed:', error);
    return false;
  }
}

/**
 * Test New Relic connection
 */
async function testNewRelicConnection(): Promise<boolean> {
  try {
    return await newRelicIntegration.testConnection();
  } catch (error) {
    console.debug('New Relic connection test failed:', error);
    return false;
  }
}

/**
 * Setup monitoring for React applications
 */
export function setupReactMonitoring(): void {
  if (typeof window === 'undefined') return;

  // Track page navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    trackPageNavigation();
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    trackPageNavigation();
  };

  window.addEventListener('popstate', trackPageNavigation);

  // Track unhandled errors
  window.addEventListener('error', (event) => {
    performanceMonitor.recordMetric({
      name: 'error.unhandled',
      value: 1,
      unit: 'count',
      tags: {
        message: event.message,
        filename: event.filename || 'unknown',
        lineno: event.lineno?.toString() || 'unknown',
        colno: event.colno?.toString() || 'unknown'
      }
    });
  });

  // Track unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    performanceMonitor.recordMetric({
      name: 'error.unhandled_promise',
      value: 1,
      unit: 'count',
      tags: {
        reason: event.reason?.toString() || 'unknown'
      }
    });
  });

  console.log('✓ React monitoring setup complete');
}

/**
 * Track page navigation
 */
function trackPageNavigation(): void {
  const url = window.location.pathname;
  const title = document.title;

  performanceMonitor.recordMetric({
    name: 'navigation.page_view',
    value: 1,
    unit: 'count',
    tags: {
      url,
      title
    }
  });

  // Track with business metrics
  businessMetricsMonitor.trackUserEngagement(
    'anonymous', // Would be replaced with actual user ID
    'session_' + Date.now(), // Would be replaced with actual session ID
    {
      type: 'page_view',
      data: { page: url }
    }
  );
}

/**
 * Create default monitoring dashboards
 */
export async function createDefaultDashboards(): Promise<void> {
  console.log('Creating default monitoring dashboards...');

  try {
    // Create DataDog dashboard
    if (config.monitoring?.datadog?.apiKey) {
      const dashboardId = await dataDogIntegration.createDashboard({
        title: 'HalluciFix Performance Dashboard',
        description: 'Comprehensive performance monitoring for HalluciFix application',
        widgets: [
          {
            title: 'API Response Times',
            type: 'timeseries',
            queries: [
              {
                metric: 'api.request.duration',
                aggregation: 'avg',
                tags: ['endpoint:*']
              }
            ]
          },
          {
            title: 'Database Query Performance',
            type: 'timeseries',
            queries: [
              {
                metric: 'database.query.duration',
                aggregation: 'avg',
                tags: ['query:*']
              }
            ]
          },
          {
            title: 'Error Rates',
            type: 'timeseries',
            queries: [
              {
                metric: 'api.request.count',
                aggregation: 'sum',
                tags: ['status:error']
              }
            ]
          },
          {
            title: 'Business Metrics',
            type: 'timeseries',
            queries: [
              {
                metric: 'business.analysis.accuracy_score',
                aggregation: 'avg'
              }
            ]
          }
        ]
      });

      console.log(`✓ DataDog dashboard created: ${dataDogIntegration.getDashboardUrl(dashboardId)}`);
    }

    // Create New Relic dashboard
    if (config.monitoring?.newrelic?.apiKey) {
      const dashboardGuid = await newRelicIntegration.createDashboard({
        name: 'HalluciFix Performance Dashboard',
        permissions: 'PUBLIC_READ_ONLY',
        pages: [
          {
            name: 'Performance Overview',
            widgets: [
              {
                title: 'API Response Times',
                visualization: { id: 'viz.line' },
                rawConfiguration: {
                  nrqlQueries: [
                    {
                      query: 'SELECT average(value) FROM HallucifixMetric WHERE name = \'api.request.duration\' TIMESERIES',
                      accountId: config.monitoring.newrelic.accountId
                    }
                  ]
                }
              }
            ]
          }
        ]
      });

      console.log(`✓ New Relic dashboard created: ${newRelicIntegration.getDashboardUrl(dashboardGuid)}`);
    }

    console.log('✅ Default dashboards created successfully');
  } catch (error) {
    console.error('❌ Failed to create default dashboards:', error);
  }
}

/**
 * Cleanup monitoring services
 */
export function cleanupMonitoring(): void {
  console.log('Cleaning up monitoring services...');

  performanceMonitor.stopPeriodicFlush();
  metricsAggregator.stopAggregation();

  console.log('✓ Monitoring services cleaned up');
}