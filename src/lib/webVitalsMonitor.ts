import { performanceMonitor } from './performanceMonitor';

// Type definitions for Web Vitals API
interface LayoutShift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

interface LargestContentfulPaint extends PerformanceEntry {
  renderTime: number;
  loadTime: number;
  size: number;
  id: string;
  url: string;
}

interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
  cancelable: boolean;
}

export interface WebVitalsMetric {
  name: 'CLS' | 'FCP' | 'FID' | 'LCP' | 'TTFB' | 'TTI';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: 'navigate' | 'reload' | 'back_forward' | 'prerender';
  url: string;
  timestamp: Date;
}

export interface PageLoadMetrics {
  url: string;
  loadTime: number;
  domContentLoaded: number;
  firstPaint: number;
  firstContentfulPaint: number;
  largestContentfulPaint?: number;
  firstInputDelay?: number;
  cumulativeLayoutShift?: number;
  timeToInteractive?: number;
  totalBlockingTime?: number;
  timestamp: Date;
}

/**
 * Core Web Vitals and frontend performance monitoring
 */
export class WebVitalsMonitor {
  private observer: PerformanceObserver | null = null;
  private vitalsCallbacks: Array<(metric: WebVitalsMetric) => void> = [];
  private pageLoadCallbacks: Array<(metrics: PageLoadMetrics) => void> = [];
  private isInitialized = false;

  /**
   * Initialize Web Vitals monitoring
   */
  initialize(): void {
    if (this.isInitialized || typeof window === 'undefined') return;

    this.initializeWebVitals();
    this.initializePageLoadMetrics();
    this.initializeResourceTiming();
    this.initializeNavigationTiming();
    
    this.isInitialized = true;
  }

  /**
   * Initialize Core Web Vitals tracking
   */
  private initializeWebVitals(): void {
    // Track CLS (Cumulative Layout Shift)
    this.trackCLS();
    
    // Track FCP (First Contentful Paint)
    this.trackFCP();
    
    // Track FID (First Input Delay)
    this.trackFID();
    
    // Track LCP (Largest Contentful Paint)
    this.trackLCP();
    
    // Track TTFB (Time to First Byte)
    this.trackTTFB();
    
    // Track TTI (Time to Interactive) - approximation
    this.trackTTI();
  }

  /**
   * Track Cumulative Layout Shift (CLS)
   */
  private trackCLS(): void {
    let clsValue = 0;
    const clsEntries: LayoutShift[] = [];

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LayoutShift[]) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          clsEntries.push(entry);
        }
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });

    // Report CLS on page visibility change or unload
    const reportCLS = () => {
      const metric: WebVitalsMetric = {
        name: 'CLS',
        value: clsValue,
        rating: this.getCLSRating(clsValue),
        delta: clsValue,
        id: this.generateId(),
        navigationType: this.getNavigationType(),
        url: window.location.href,
        timestamp: new Date()
      };

      this.reportWebVital(metric);
    };

    document.addEventListener('visibilitychange', reportCLS);
    window.addEventListener('beforeunload', reportCLS);
  }

  /**
   * Track First Contentful Paint (FCP)
   */
  private trackFCP(): void {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          const metric: WebVitalsMetric = {
            name: 'FCP',
            value: entry.startTime,
            rating: this.getFCPRating(entry.startTime),
            delta: entry.startTime,
            id: this.generateId(),
            navigationType: this.getNavigationType(),
            url: window.location.href,
            timestamp: new Date()
          };

          this.reportWebVital(metric);
          observer.disconnect();
        }
      }
    });

    observer.observe({ type: 'paint', buffered: true });
  }

  /**
   * Track First Input Delay (FID)
   */
  private trackFID(): void {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        const fid = entry.processingStart - entry.startTime;
        
        const metric: WebVitalsMetric = {
          name: 'FID',
          value: fid,
          rating: this.getFIDRating(fid),
          delta: fid,
          id: this.generateId(),
          navigationType: this.getNavigationType(),
          url: window.location.href,
          timestamp: new Date()
        };

        this.reportWebVital(metric);
        observer.disconnect();
      }
    });

    observer.observe({ type: 'first-input', buffered: true });
  }

  /**
   * Track Largest Contentful Paint (LCP)
   */
  private trackLCP(): void {
    let lcpValue = 0;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LargestContentfulPaint[]) {
        lcpValue = entry.startTime;
      }
    });

    observer.observe({ type: 'largest-contentful-paint', buffered: true });

    // Report LCP on page visibility change or unload
    const reportLCP = () => {
      if (lcpValue > 0) {
        const metric: WebVitalsMetric = {
          name: 'LCP',
          value: lcpValue,
          rating: this.getLCPRating(lcpValue),
          delta: lcpValue,
          id: this.generateId(),
          navigationType: this.getNavigationType(),
          url: window.location.href,
          timestamp: new Date()
        };

        this.reportWebVital(metric);
      }
    };

    document.addEventListener('visibilitychange', reportLCP);
    window.addEventListener('beforeunload', reportLCP);
  }

  /**
   * Track Time to First Byte (TTFB)
   */
  private trackTTFB(): void {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceNavigationTiming[]) {
        const ttfb = entry.responseStart - entry.requestStart;
        
        const metric: WebVitalsMetric = {
          name: 'TTFB',
          value: ttfb,
          rating: this.getTTFBRating(ttfb),
          delta: ttfb,
          id: this.generateId(),
          navigationType: this.getNavigationType(),
          url: window.location.href,
          timestamp: new Date()
        };

        this.reportWebVital(metric);
        observer.disconnect();
      }
    });

    observer.observe({ type: 'navigation', buffered: true });
  }

  /**
   * Track Time to Interactive (TTI) - approximation
   */
  private trackTTI(): void {
    // TTI is complex to calculate precisely, this is a simplified version
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const tti = navigationEntry.loadEventEnd - navigationEntry.fetchStart;
        
        const metric: WebVitalsMetric = {
          name: 'TTI',
          value: tti,
          rating: this.getTTIRating(tti),
          delta: tti,
          id: this.generateId(),
          navigationType: this.getNavigationType(),
          url: window.location.href,
          timestamp: new Date()
        };

        this.reportWebVital(metric);
      }, 0);
    });
  }

  /**
   * Initialize page load metrics tracking
   */
  private initializePageLoadMetrics(): void {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const paintEntries = performance.getEntriesByType('paint');
        
        const firstPaint = paintEntries.find(entry => entry.name === 'first-paint')?.startTime || 0;
        const firstContentfulPaint = paintEntries.find(entry => entry.name === 'first-contentful-paint')?.startTime || 0;
        
        const metrics: PageLoadMetrics = {
          url: window.location.href,
          loadTime: navigationEntry.loadEventEnd - navigationEntry.navigationStart,
          domContentLoaded: navigationEntry.domContentLoadedEventEnd - navigationEntry.navigationStart,
          firstPaint,
          firstContentfulPaint,
          timestamp: new Date()
        };

        this.reportPageLoadMetrics(metrics);
      }, 0);
    });
  }

  /**
   * Initialize resource timing monitoring
   */
  private initializeResourceTiming(): void {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        this.trackResourceTiming(entry);
      }
    });

    observer.observe({ type: 'resource', buffered: true });
  }

  /**
   * Track individual resource timing
   */
  private trackResourceTiming(entry: PerformanceResourceTiming): void {
    const resourceType = this.getResourceType(entry.name, entry.initiatorType);
    const duration = entry.responseEnd - entry.requestStart;
    const size = entry.transferSize || 0;

    performanceMonitor.recordMetric({
      name: 'resource.load_time',
      value: duration,
      unit: 'ms',
      tags: {
        resource_type: resourceType,
        url: this.normalizeResourceUrl(entry.name)
      }
    });

    if (size > 0) {
      performanceMonitor.recordMetric({
        name: 'resource.size',
        value: size,
        unit: 'bytes',
        tags: {
          resource_type: resourceType,
          url: this.normalizeResourceUrl(entry.name)
        }
      });
    }

    // Track slow resources
    if (duration > 2000) { // 2 seconds threshold
      performanceMonitor.recordMetric({
        name: 'resource.slow_load',
        value: 1,
        unit: 'count',
        tags: {
          resource_type: resourceType,
          url: this.normalizeResourceUrl(entry.name),
          duration: duration.toString()
        }
      });
    }
  }

  /**
   * Initialize navigation timing monitoring
   */
  private initializeNavigationTiming(): void {
    window.addEventListener('load', () => {
      const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      // Track various navigation phases
      const phases = {
        dns_lookup: navigationEntry.domainLookupEnd - navigationEntry.domainLookupStart,
        tcp_connection: navigationEntry.connectEnd - navigationEntry.connectStart,
        ssl_handshake: navigationEntry.connectEnd - navigationEntry.secureConnectionStart,
        request_response: navigationEntry.responseEnd - navigationEntry.requestStart,
        dom_processing: navigationEntry.domContentLoadedEventStart - navigationEntry.responseEnd,
        resource_loading: navigationEntry.loadEventStart - navigationEntry.domContentLoadedEventEnd
      };

      Object.entries(phases).forEach(([phase, duration]) => {
        if (duration > 0) {
          performanceMonitor.recordMetric({
            name: `navigation.${phase}`,
            value: duration,
            unit: 'ms',
            tags: {
              url: window.location.pathname,
              navigation_type: navigationEntry.type.toString()
            }
          });
        }
      });
    });
  }

  /**
   * Report Web Vital metric
   */
  private reportWebVital(metric: WebVitalsMetric): void {
    // Record in performance monitor
    performanceMonitor.recordWebVital(metric.name, metric.value, metric.rating);
    
    // Notify callbacks
    this.vitalsCallbacks.forEach(callback => {
      try {
        callback(metric);
      } catch (error) {
        console.error('Web Vitals callback error:', error);
      }
    });
  }

  /**
   * Report page load metrics
   */
  private reportPageLoadMetrics(metrics: PageLoadMetrics): void {
    // Record individual metrics
    performanceMonitor.recordMetric({
      name: 'page.load_time',
      value: metrics.loadTime,
      unit: 'ms',
      tags: { url: window.location.pathname }
    });

    performanceMonitor.recordMetric({
      name: 'page.dom_content_loaded',
      value: metrics.domContentLoaded,
      unit: 'ms',
      tags: { url: window.location.pathname }
    });

    // Notify callbacks
    this.pageLoadCallbacks.forEach(callback => {
      try {
        callback(metrics);
      } catch (error) {
        console.error('Page load metrics callback error:', error);
      }
    });
  }

  /**
   * Get resource type from URL and initiator
   */
  private getResourceType(url: string, initiatorType: string): string {
    if (initiatorType === 'img') return 'image';
    if (initiatorType === 'script') return 'script';
    if (initiatorType === 'link') return 'stylesheet';
    if (initiatorType === 'xmlhttprequest' || initiatorType === 'fetch') return 'api';
    if (url.includes('/api/')) return 'api';
    if (url.match(/\.(js|mjs)$/)) return 'script';
    if (url.match(/\.(css)$/)) return 'stylesheet';
    if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
    return 'other';
  }

  /**
   * Normalize resource URL for consistent metrics
   */
  private normalizeResourceUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return url;
    }
  }

  /**
   * Get navigation type
   */
  private getNavigationType(): WebVitalsMetric['navigationType'] {
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    const type = navigationEntry.type;
    if (type === 'navigate') return 'navigate';
    if (type === 'reload') return 'reload';
    if (type === 'back_forward') return 'back_forward';
    if (type === 'prerender') return 'prerender';
    return 'navigate';
  }

  /**
   * Generate unique ID for metrics
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Rating functions for Web Vitals
   */
  private getCLSRating(value: number): WebVitalsMetric['rating'] {
    return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
  }

  private getFCPRating(value: number): WebVitalsMetric['rating'] {
    return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
  }

  private getFIDRating(value: number): WebVitalsMetric['rating'] {
    return value <= 100 ? 'good' : value <= 300 ? 'needs-improvement' : 'poor';
  }

  private getLCPRating(value: number): WebVitalsMetric['rating'] {
    return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
  }

  private getTTFBRating(value: number): WebVitalsMetric['rating'] {
    return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
  }

  private getTTIRating(value: number): WebVitalsMetric['rating'] {
    return value <= 3800 ? 'good' : value <= 7300 ? 'needs-improvement' : 'poor';
  }

  /**
   * Subscribe to Web Vitals metrics
   */
  onWebVital(callback: (metric: WebVitalsMetric) => void): () => void {
    this.vitalsCallbacks.push(callback);
    
    return () => {
      const index = this.vitalsCallbacks.indexOf(callback);
      if (index > -1) {
        this.vitalsCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to page load metrics
   */
  onPageLoad(callback: (metrics: PageLoadMetrics) => void): () => void {
    this.pageLoadCallbacks.push(callback);
    
    return () => {
      const index = this.pageLoadCallbacks.indexOf(callback);
      if (index > -1) {
        this.pageLoadCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get current page performance summary
   */
  getPagePerformanceSummary(): {
    url: string;
    loadTime: number;
    domContentLoaded: number;
    resourceCount: number;
    totalResourceSize: number;
    slowResources: number;
  } {
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    
    const totalResourceSize = resourceEntries.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
    const slowResources = resourceEntries.filter(entry => 
      (entry.responseEnd - entry.requestStart) > 2000
    ).length;

    return {
      url: window.location.href,
      loadTime: navigationEntry.loadEventEnd - navigationEntry.fetchStart,
      domContentLoaded: navigationEntry.domContentLoadedEventEnd - navigationEntry.fetchStart,
      resourceCount: resourceEntries.length,
      totalResourceSize,
      slowResources
    };
  }
}

// Export singleton instance
export const webVitalsMonitor = new WebVitalsMonitor();
export default webVitalsMonitor;

// Auto-initialize if in browser environment
if (typeof window !== 'undefined') {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => webVitalsMonitor.initialize());
  } else {
    webVitalsMonitor.initialize();
  }
}