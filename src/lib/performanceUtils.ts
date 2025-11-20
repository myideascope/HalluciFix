import React from 'react';
import { performanceMonitor } from './performanceMonitor';

/**
 * Decorator for timing function execution
 */
export function timed(operationName?: string) {
  return function <T extends (...args: any[]) => any>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;
    const name = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = function (...args: any[]) {
      const operationId = performanceMonitor.startOperation(name, {
        class: target.constructor.name,
        method: propertyKey
      });

      try {
        const result = originalMethod.apply(this, args);
        
        // Handle async functions
        if (result && typeof result.then === 'function') {
          return result
            .then((value: any) => {
              performanceMonitor.endOperation(operationId, { status: 'success' });
              return value;
            })
            .catch((error: any) => {
              performanceMonitor.endOperation(operationId, { 
                status: 'error',
                error: error instanceof Error ? error.name : 'unknown'
              });
              throw error;
            });
        } else {
          performanceMonitor.endOperation(operationId, { status: 'success' });
          return result;
        }
      } catch (error) {
        performanceMonitor.endOperation(operationId, { 
          status: 'error',
          error: error instanceof Error ? error.name : 'unknown'
        });
        throw error;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Higher-order function for timing any function
 */
export function withTiming<T extends (...args: any[]) => any>(
  fn: T,
  operationName: string,
  tags?: Record<string, string>
): T {
  return ((...args: any[]) => {
    const operationId = performanceMonitor.startOperation(operationName, tags);

    try {
      const result = fn(...args);
      
      // Handle async functions
      if (result && typeof result.then === 'function') {
        return result
          .then((value: any) => {
            performanceMonitor.endOperation(operationId, { status: 'success' });
            return value;
          })
          .catch((error: any) => {
            performanceMonitor.endOperation(operationId, { 
              status: 'error',
              error: error instanceof Error ? error.name : 'unknown'
            });
            throw error;
          });
      } else {
        performanceMonitor.endOperation(operationId, { status: 'success' });
        return result;
      }
    } catch (error) {
      performanceMonitor.endOperation(operationId, { 
        status: 'error',
        error: error instanceof Error ? error.name : 'unknown'
      });
      throw error;
    }
  }) as T;
}

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(
  operation: () => Promise<T> | T,
  operationName: string,
  tags?: Record<string, string>
): Promise<{ result: T; duration: number }> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    
    performanceMonitor.recordMetric({
      name: `${operationName}.duration`,
      value: duration,
      unit: 'ms',
      tags: { ...tags, status: 'success' }
    });

    return { result, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    performanceMonitor.recordMetric({
      name: `${operationName}.duration`,
      value: duration,
      unit: 'ms',
      tags: { 
        ...tags, 
        status: 'error',
        error: error instanceof Error ? error.name : 'unknown'
      }
    });

    throw error;
  }
}

/**
 * API call timing wrapper
 */
export async function timedApiCall<T>(
  apiCall: () => Promise<Response>,
  endpoint: string,
  method: string = 'GET',
  tags?: Record<string, string>
): Promise<Response> {
  const startTime = Date.now();
  
  try {
    const response = await apiCall();
    const duration = Date.now() - startTime;
    
    performanceMonitor.recordApiCall(
      endpoint,
      method,
      response.status,
      duration,
      tags
    );

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    performanceMonitor.recordApiCall(
      endpoint,
      method,
      0, // Unknown status code for network errors
      duration,
      { ...tags, error: 'network_error' }
    );

    throw error;
  }
}

/**
 * Fetch wrapper with automatic performance tracking
 */
export async function timedFetch(
  url: string,
  options?: RequestInit,
  tags?: Record<string, string>
): Promise<Response> {
  const method = options.method || 'GET';
  
  return timedApiCall(
    () => fetch(url, options),
    url,
    method,
    tags
  );
}

/**
 * Database query timing wrapper
 */
export async function timedDatabaseQuery<T>(
  queryFn: () => Promise<T>,
  queryName: string,
  tags: Record<string, string> = {}
): Promise<T> {
  return performanceMonitor.timeOperation(
    `db.${queryName}`,
    queryFn,
    { ...tags, type: 'database' }
  );
}

/**
 * Component render timing (for React components)
 */
export function withRenderTiming<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
): React.ComponentType<P> {
  const name = componentName || Component.displayName || Component.name || 'UnknownComponent';
  
  return function TimedComponent(props: P) {
    const operationId = performanceMonitor.startOperation(`render.${name}`, {
      component: name,
      type: 'render'
    });

    React.useEffect(() => {
      // Component mounted, end timing
      performanceMonitor.endOperation(operationId, { phase: 'mount' });
      
      return () => {
        // Component will unmount
        performanceMonitor.recordMetric({
          name: `render.${name}.unmount`,
          value: 1,
          unit: 'count',
          tags: { component: name }
        });
      };
    }, [operationId]);

    return React.createElement(Component, props);
  };
}

/**
 * Hook for tracking user interactions
 */
export function useInteractionTracking() {
  const trackInteraction = React.useCallback((
    action: string,
    component: string,
    metadata?: Record<string, any>
  ) => {
    performanceMonitor.recordUserInteraction(action, component, undefined, metadata);
  }, []);

  const trackTimedInteraction = React.useCallback((
    action: string,
    component: string,
    operation: () => Promise<void> | void,
    metadata?: Record<string, any>
  ) => {
    const startTime = Date.now();
    
    const result = operation();
    
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        const duration = Date.now() - startTime;
        performanceMonitor.recordUserInteraction(action, component, duration, metadata);
      });
    } else {
      const duration = Date.now() - startTime;
      performanceMonitor.recordUserInteraction(action, component, duration, metadata);
    }
  }, []);

  return { trackInteraction, trackTimedInteraction };
}

/**
 * Performance budget checker
 */
export interface PerformanceBudget {
  maxApiResponseTime: number;
  maxDatabaseQueryTime: number;
  maxRenderTime: number;
  maxMemoryUsage: number;
}

export class PerformanceBudgetChecker {
  private budget: PerformanceBudget;
  private violations: Array<{
    metric: string;
    budget: number;
    actual: number;
    timestamp: Date;
  }> = [];

  constructor(budget: PerformanceBudget) {
    this.budget = budget;
  }

  checkApiResponse(duration: number, endpoint: string): boolean {
    if (duration > this.budget.maxApiResponseTime) {
      this.violations.push({
        metric: `api.${endpoint}`,
        budget: this.budget.maxApiResponseTime,
        actual: duration,
        timestamp: new Date()
      });
      return false;
    }
    return true;
  }

  checkDatabaseQuery(duration: number, queryName: string): boolean {
    if (duration > this.budget.maxDatabaseQueryTime) {
      this.violations.push({
        metric: `db.${queryName}`,
        budget: this.budget.maxDatabaseQueryTime,
        actual: duration,
        timestamp: new Date()
      });
      return false;
    }
    return true;
  }

  checkRenderTime(duration: number, componentName: string): boolean {
    if (duration > this.budget.maxRenderTime) {
      this.violations.push({
        metric: `render.${componentName}`,
        budget: this.budget.maxRenderTime,
        actual: duration,
        timestamp: new Date()
      });
      return false;
    }
    return true;
  }

  getViolations(): typeof this.violations {
    return [...this.violations];
  }

  clearViolations(): void {
    this.violations = [];
  }
}

// Default performance budget
export const defaultPerformanceBudget: PerformanceBudget = {
  maxApiResponseTime: 2000, // 2 seconds
  maxDatabaseQueryTime: 1000, // 1 second
  maxRenderTime: 100, // 100ms
  maxMemoryUsage: 50 * 1024 * 1024 // 50MB
};

export const performanceBudgetChecker = new PerformanceBudgetChecker(defaultPerformanceBudget);