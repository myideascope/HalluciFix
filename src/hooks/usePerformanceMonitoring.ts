import { useEffect, useCallback, useRef } from 'react';
import { 
  performanceMonitor, 
  webVitalsMonitor, 
  businessMetricsMonitor,
  apiMonitoringService 
} from '../lib/monitoring';

/**
 * Hook for performance monitoring in React components
 */
export function usePerformanceMonitoring(componentName: string) {
  const renderStartTime = useRef<number>(Date.now());
  const operationId = useRef<string | null>(null);

  useEffect(() => {
    // Start render timing
    operationId.current = performanceMonitor.startOperation(`render.${componentName}`, {
      component: componentName,
      type: 'render'
    });

    // Component mounted
    return () => {
      // Component will unmount
      if (operationId.current) {
        performanceMonitor.endOperation(operationId.current, { phase: 'unmount' });
      }
      
      performanceMonitor.recordMetric({
        name: `render.${componentName}.unmount`,
        value: 1,
        unit: 'count',
        tags: { component: componentName }
      });
    };
  }, [componentName]);

  // Track user interactions
  const trackInteraction = useCallback((
    action: string,
    metadata?: Record<string, any>
  ) => {
    businessMetricsMonitor.trackUserEngagement(
      'current-user', // Would be replaced with actual user ID
      'current-session', // Would be replaced with actual session ID
      {
        type: 'interaction',
        data: {
          interaction_type: action,
          ...metadata
        }
      }
    );
  }, []);

  // Track feature usage
  const trackFeatureUsage = useCallback((featureName: string) => {
    businessMetricsMonitor.trackUserEngagement(
      'current-user',
      'current-session',
      {
        type: 'feature_use',
        data: { feature: featureName }
      }
    );
  }, []);

  // Track API calls with monitoring
  const monitoredFetch = useCallback(async (
    url: string,
    options?: RequestInit
  ): Promise<Response> => {
    return apiMonitoringService.monitoredFetch(url, options, {
      userId: 'current-user',
      userAgent: navigator.userAgent
    });
  }, []);

  // Track time spent on component
  const trackTimeSpent = useCallback(() => {
    const timeSpent = Date.now() - renderStartTime.current;
    
    businessMetricsMonitor.trackUserEngagement(
      'current-user',
      'current-session',
      {
        type: 'time_spent',
        data: { duration: timeSpent }
      }
    );
  }, []);

  return {
    trackInteraction,
    trackFeatureUsage,
    monitoredFetch,
    trackTimeSpent
  };
}

/**
 * Hook for tracking Web Vitals in components
 */
export function useWebVitals() {
  useEffect(() => {
    const unsubscribeWebVitals = webVitalsMonitor.onWebVital((metric) => {
      console.log('Web Vital:', metric);
      
      // Track poor performance
      if (metric.rating === 'poor') {
        performanceMonitor.recordMetric({
          name: 'web_vitals.poor_performance',
          value: 1,
          unit: 'count',
          tags: {
            metric: metric.name,
            url: window.location.pathname
          }
        });
      }
    });

    const unsubscribePageLoad = webVitalsMonitor.onPageLoad((metrics) => {
      console.log('Page Load Metrics:', metrics);
      
      // Track slow page loads
      if (metrics.loadTime > 3000) { // 3 seconds
        performanceMonitor.recordMetric({
          name: 'page.slow_load',
          value: 1,
          unit: 'count',
          tags: {
            url: window.location.pathname,
            loadTime: metrics.loadTime.toString()
          }
        });
      }
    });

    return () => {
      unsubscribeWebVitals();
      unsubscribePageLoad();
    };
  }, []);

  const getPagePerformance = useCallback(() => {
    return webVitalsMonitor.getPagePerformanceSummary();
  }, []);

  return { getPagePerformance };
}

/**
 * Hook for business metrics tracking
 */
export function useBusinessMetrics() {
  const trackConversion = useCallback((
    funnelName: string,
    step: string,
    data: {
      userId?: string;
      sessionId: string;
      value?: number;
      source?: string;
      campaign?: string;
    }
  ) => {
    businessMetricsMonitor.trackConversion(funnelName, step, data);
  }, []);

  const trackRevenue = useCallback((revenue: {
    transactionId: string;
    userId: string;
    amount: number;
    currency: string;
    planType: string;
    paymentMethod: string;
  }) => {
    businessMetricsMonitor.trackRevenue({
      transaction_id: revenue.transactionId,
      user_id: revenue.userId,
      amount: revenue.amount,
      currency: revenue.currency,
      plan_type: revenue.planType,
      payment_method: revenue.paymentMethod
    });
  }, []);

  const trackAnalysisQuality = useCallback((metrics: {
    analysisId: string;
    userId: string;
    accuracyScore: number;
    processingTime: number;
    contentLength: number;
    hallucinationsDetected: number;
    confidenceScore: number;
  }) => {
    businessMetricsMonitor.trackAnalysisQuality(metrics);
  }, []);

  const getBusinessReport = useCallback((timeWindowMs?: number) => {
    return businessMetricsMonitor.getBusinessReport(timeWindowMs);
  }, []);

  return {
    trackConversion,
    trackRevenue,
    trackAnalysisQuality,
    getBusinessReport
  };
}

/**
 * Hook for performance budget monitoring
 */
export function usePerformanceBudget() {
  const checkBudget = useCallback((
    operation: string,
    duration: number,
    type: 'api' | 'database' | 'render'
  ): boolean => {
    const budgets = {
      api: 2000, // 2 seconds
      database: 1000, // 1 second
      render: 100 // 100ms
    };

    const budget = budgets[type];
    const withinBudget = duration <= budget;

    if (!withinBudget) {
      performanceMonitor.recordMetric({
        name: `budget.violation.${type}`,
        value: 1,
        unit: 'count',
        tags: {
          operation,
          duration: duration.toString(),
          budget: budget.toString(),
          overage: (duration - budget).toString()
        }
      });
    }

    return withinBudget;
  }, []);

  return { checkBudget };
}