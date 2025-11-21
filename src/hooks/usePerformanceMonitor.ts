import { useEffect, useState } from 'react';

import { logger } from './logging';
export interface PerformanceMetrics {
  // Core Web Vitals
  FCP: number | null; // First Contentful Paint
  LCP: number | null; // Largest Contentful Paint
  FID: number | null; // First Input Delay
  CLS: number | null; // Cumulative Layout Shift
  TTFB: number | null; // Time to First Byte

  // Additional metrics
  domContentLoaded: number | null;
  loadComplete: number | null;
  firstPaint: number | null;
  firstByte: number | null;

  // Memory usage (if available)
  memoryUsage: {
    used: number;
    total: number;
    limit: number;
  } | null;

  // Network information
  connection: {
    effectiveType: string;
    downlink: number;
    rtt: number;
  } | null;
}

export interface PerformanceObserver {
  disconnect: () => void;
}

export class PerformanceMonitor {
  private observers: PerformanceObserver[] = [];
  private metrics: Partial<PerformanceMetrics> = {};

  constructor() {
    this.initializeObservers();
    this.collectInitialMetrics();
  }

  private initializeObservers() {
    // Core Web Vitals
    if ('PerformanceObserver' in window) {
      // Largest Contentful Paint
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.metrics.LCP = lastEntry.startTime;
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.push(lcpObserver);
      } catch (e) {
        logger.warn("LCP observer not supported");
      }

      // First Input Delay
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            this.metrics.FID = entry.processingStart - entry.startTime;
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);
      } catch (e) {
        logger.warn("FID observer not supported");
      }

      // Cumulative Layout Shift
      try {
        const clsObserver = new PerformanceObserver((list) => {
          let clsValue = 0;
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          });
          this.metrics.CLS = clsValue;
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(clsObserver);
      } catch (e) {
        logger.warn("CLS observer not supported");
      }
    }
  }

  private collectInitialMetrics() {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

    if (navigation) {
      this.metrics.TTFB = navigation.responseStart - navigation.requestStart;
      this.metrics.domContentLoaded = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
      this.metrics.loadComplete = navigation.loadEventEnd - navigation.loadEventStart;
    }

    // Paint timing
    const paintEntries = performance.getEntriesByType('paint');
    paintEntries.forEach((entry) => {
      if (entry.name === 'first-paint') {
        this.metrics.firstPaint = entry.startTime;
      } else if (entry.name === 'first-contentful-paint') {
        this.metrics.FCP = entry.startTime;
      }
    });

    // Memory usage (Chrome only)
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
      };
    }

    // Network information
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      this.metrics.connection = {
        effectiveType: connection.effectiveType || 'unknown',
        downlink: connection.downlink || 0,
        rtt: connection.rtt || 0,
      };
    }
  }

  public getMetrics(): Partial<PerformanceMetrics> {
    return { ...this.metrics };
  }

  public updateMetrics() {
    this.collectInitialMetrics();
  }

  public destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }

  // Utility method to measure custom operations
  public measureOperation(name: string, operation: () => Promise<any> | any): Promise<any> {
    const startMark = `${name}-start`;
    const endMark = `${name}-end`;
    const measureName = `${name}-duration`;

    performance.mark(startMark);

    const result = typeof operation === 'function' ? operation() : operation;

    return Promise.resolve(result).then((res) => {
      performance.mark(endMark);
      performance.measure(measureName, startMark, endMark);

      const measure = performance.getEntriesByName(measureName)[0];
      console.log(`[Performance] ${name}: ${measure.duration.toFixed(2)}ms`);

      return res;
    });
  }
}

// React hook for performance monitoring
export function usePerformanceMonitor() {
  const [metrics, setMetrics] = useState<Partial<PerformanceMetrics>>({});
  const [monitor] = useState(() => new PerformanceMonitor());

  useEffect(() => {
    // Update metrics periodically
    const updateInterval = setInterval(() => {
      monitor.updateMetrics();
      setMetrics(monitor.getMetrics());
    }, 5000); // Update every 5 seconds

    // Initial metrics
    setMetrics(monitor.getMetrics());

    return () => {
      clearInterval(updateInterval);
      monitor.destroy();
    };
  }, [monitor]);

  return {
    metrics,
    measureOperation: monitor.measureOperation.bind(monitor),
  };
}

// Utility function to report metrics to monitoring service
export function reportPerformanceMetrics(metrics: Partial<PerformanceMetrics>) {
  // Send to your monitoring service (e.g., DataDog, New Relic, etc.)
  logger.info("[Performance Report]", { metrics });

  // Example: Send to DataDog or similar
  if (window.dataLayer) {
    window.dataLayer.push({
      event: 'performance_metrics',
      ...metrics,
    });
  }
}