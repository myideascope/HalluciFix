import { Page } from '@playwright/test';
import { WebVitalsMetrics } from './web-vitals';

export interface PerformanceReport {
  timestamp: string;
  url: string;
  metrics: WebVitalsMetrics;
  resourceTiming: ResourceTimingEntry[];
  memoryUsage?: MemoryUsage;
  networkRequests: NetworkRequest[];
  userAgent: string;
  viewport: { width: number; height: number };
}

export interface ResourceTimingEntry {
  name: string;
  duration: number;
  size: number;
  type: string;
}

export interface MemoryUsage {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  duration: number;
  size: number;
  type: string;
}

/**
 * Comprehensive performance monitoring class
 */
export class PerformanceMonitor {
  private page: Page;
  private networkRequests: NetworkRequest[] = [];
  private startTime: number = 0;

  constructor(page: Page) {
    this.page = page;
    this.setupNetworkMonitoring();
  }

  private setupNetworkMonitoring() {
    this.page.on('request', (request) => {
      const startTime = Date.now();
      request.timing = { startTime };
    });

    this.page.on('response', (response) => {
      const endTime = Date.now();
      const request = response.request();
      const startTime = (request as any).timing?.startTime || endTime;
      
      this.networkRequests.push({
        url: response.url(),
        method: request.method(),
        status: response.status(),
        duration: endTime - startTime,
        size: parseInt(response.headers()['content-length'] || '0'),
        type: this.getResourceType(response.url(), response.headers()['content-type'] || '')
      });
    });
  }

  private getResourceType(url: string, contentType: string): string {
    if (contentType.includes('text/html')) return 'document';
    if (contentType.includes('text/css')) return 'stylesheet';
    if (contentType.includes('javascript')) return 'script';
    if (contentType.includes('image/')) return 'image';
    if (contentType.includes('font/')) return 'font';
    if (url.includes('/api/')) return 'api';
    return 'other';
  }

  async startMonitoring(): Promise<void> {
    this.startTime = Date.now();
    this.networkRequests = [];
  }

  async getResourceTiming(): Promise<ResourceTimingEntry[]> {
    return await this.page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return resources.map(resource => ({
        name: resource.name,
        duration: resource.duration,
        size: resource.transferSize || 0,
        type: resource.initiatorType
      }));
    });
  }

  async getMemoryUsage(): Promise<MemoryUsage | undefined> {
    return await this.page.evaluate(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        return {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit
        };
      }
      return undefined;
    });
  }

  async generateReport(metrics: WebVitalsMetrics): Promise<PerformanceReport> {
    const resourceTiming = await this.getResourceTiming();
    const memoryUsage = await this.getMemoryUsage();
    const viewport = this.page.viewportSize() || { width: 0, height: 0 };
    const userAgent = await this.page.evaluate(() => navigator.userAgent);

    return {
      timestamp: new Date().toISOString(),
      url: this.page.url(),
      metrics,
      resourceTiming,
      memoryUsage,
      networkRequests: [...this.networkRequests],
      userAgent,
      viewport
    };
  }

  async analyzeResourcePerformance(): Promise<{
    totalSize: number;
    totalRequests: number;
    slowestRequests: NetworkRequest[];
    largestRequests: NetworkRequest[];
    requestsByType: Record<string, number>;
  }> {
    const totalSize = this.networkRequests.reduce((sum, req) => sum + req.size, 0);
    const totalRequests = this.networkRequests.length;
    
    const slowestRequests = [...this.networkRequests]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);
    
    const largestRequests = [...this.networkRequests]
      .sort((a, b) => b.size - a.size)
      .slice(0, 5);
    
    const requestsByType = this.networkRequests.reduce((acc, req) => {
      acc[req.type] = (acc[req.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalSize,
      totalRequests,
      slowestRequests,
      largestRequests,
      requestsByType
    };
  }
}

/**
 * Performance regression detector
 */
export class PerformanceRegressionDetector {
  private baselineMetrics: Map<string, WebVitalsMetrics> = new Map();

  setBaseline(url: string, metrics: WebVitalsMetrics): void {
    this.baselineMetrics.set(url, metrics);
  }

  detectRegressions(url: string, currentMetrics: WebVitalsMetrics): {
    hasRegression: boolean;
    regressions: Array<{
      metric: string;
      baseline: number;
      current: number;
      regressionPercent: number;
    }>;
  } {
    const baseline = this.baselineMetrics.get(url);
    if (!baseline) {
      return { hasRegression: false, regressions: [] };
    }

    const regressions: Array<{
      metric: string;
      baseline: number;
      current: number;
      regressionPercent: number;
    }> = [];

    const thresholds = {
      fcp: 0.2, // 20% regression threshold
      lcp: 0.2,
      cls: 0.5, // 50% for CLS as it's more variable
      fid: 0.3,
      ttfb: 0.25,
      tti: 0.2
    };

    Object.entries(currentMetrics).forEach(([metric, currentValue]) => {
      if (currentValue !== undefined && baseline[metric as keyof WebVitalsMetrics] !== undefined) {
        const baselineValue = baseline[metric as keyof WebVitalsMetrics]!;
        const regressionPercent = (currentValue - baselineValue) / baselineValue;
        const threshold = thresholds[metric as keyof typeof thresholds] || 0.2;

        if (regressionPercent > threshold) {
          regressions.push({
            metric,
            baseline: baselineValue,
            current: currentValue,
            regressionPercent
          });
        }
      }
    });

    return {
      hasRegression: regressions.length > 0,
      regressions
    };
  }
}

/**
 * Performance budget checker
 */
export interface PerformanceBudget {
  maxFCP: number;
  maxLCP: number;
  maxCLS: number;
  maxFID: number;
  maxTTFB: number;
  maxResourceSize: number;
  maxRequests: number;
}

export class PerformanceBudgetChecker {
  private budget: PerformanceBudget;

  constructor(budget: PerformanceBudget) {
    this.budget = budget;
  }

  checkBudget(metrics: WebVitalsMetrics, resourceAnalysis: any): {
    passed: boolean;
    violations: Array<{
      metric: string;
      budget: number;
      actual: number;
      severity: 'warning' | 'error';
    }>;
  } {
    const violations: Array<{
      metric: string;
      budget: number;
      actual: number;
      severity: 'warning' | 'error';
    }> = [];

    // Check Core Web Vitals budget
    if (metrics.fcp && metrics.fcp > this.budget.maxFCP) {
      violations.push({
        metric: 'FCP',
        budget: this.budget.maxFCP,
        actual: metrics.fcp,
        severity: metrics.fcp > this.budget.maxFCP * 1.5 ? 'error' : 'warning'
      });
    }

    if (metrics.lcp && metrics.lcp > this.budget.maxLCP) {
      violations.push({
        metric: 'LCP',
        budget: this.budget.maxLCP,
        actual: metrics.lcp,
        severity: metrics.lcp > this.budget.maxLCP * 1.5 ? 'error' : 'warning'
      });
    }

    if (metrics.cls !== undefined && metrics.cls > this.budget.maxCLS) {
      violations.push({
        metric: 'CLS',
        budget: this.budget.maxCLS,
        actual: metrics.cls,
        severity: metrics.cls > this.budget.maxCLS * 2 ? 'error' : 'warning'
      });
    }

    if (metrics.fid && metrics.fid > this.budget.maxFID) {
      violations.push({
        metric: 'FID',
        budget: this.budget.maxFID,
        actual: metrics.fid,
        severity: metrics.fid > this.budget.maxFID * 2 ? 'error' : 'warning'
      });
    }

    if (metrics.ttfb && metrics.ttfb > this.budget.maxTTFB) {
      violations.push({
        metric: 'TTFB',
        budget: this.budget.maxTTFB,
        actual: metrics.ttfb,
        severity: metrics.ttfb > this.budget.maxTTFB * 2 ? 'error' : 'warning'
      });
    }

    // Check resource budget
    if (resourceAnalysis.totalSize > this.budget.maxResourceSize) {
      violations.push({
        metric: 'Total Resource Size',
        budget: this.budget.maxResourceSize,
        actual: resourceAnalysis.totalSize,
        severity: resourceAnalysis.totalSize > this.budget.maxResourceSize * 1.5 ? 'error' : 'warning'
      });
    }

    if (resourceAnalysis.totalRequests > this.budget.maxRequests) {
      violations.push({
        metric: 'Total Requests',
        budget: this.budget.maxRequests,
        actual: resourceAnalysis.totalRequests,
        severity: resourceAnalysis.totalRequests > this.budget.maxRequests * 1.5 ? 'error' : 'warning'
      });
    }

    return {
      passed: violations.length === 0,
      violations
    };
  }
}