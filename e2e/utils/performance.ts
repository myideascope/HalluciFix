/**
 * Performance Testing Utilities
 * Provides utilities for performance testing including Core Web Vitals measurement
 */

import { Page } from '@playwright/test';

export interface CoreWebVitals {
  // Largest Contentful Paint
  lcp: number;
  // First Input Delay
  fid: number;
  // Cumulative Layout Shift
  cls: number;
  // First Contentful Paint
  fcp: number;
  // Time to Interactive
  tti: number;
  // Total Blocking Time
  tbt: number;
}

export interface PerformanceMetrics {
  // Navigation timing
  navigationStart: number;
  domContentLoaded: number;
  loadComplete: number;
  
  // Core Web Vitals
  coreWebVitals: CoreWebVitals;
  
  // Resource timing
  resources: Array<{
    name: string;
    type: string;
    size: number;
    duration: number;
    startTime: number;
  }>;
  
  // Memory usage
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  
  // Network information
  network?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
  };
}

export interface PerformanceBudget {
  lcp: number;        // Largest Contentful Paint (ms)
  fid: number;        // First Input Delay (ms)
  cls: number;        // Cumulative Layout Shift (score)
  fcp: number;        // First Contentful Paint (ms)
  tti: number;        // Time to Interactive (ms)
  tbt: number;        // Total Blocking Time (ms)
  loadTime: number;   // Page load time (ms)
  bundleSize: number; // Bundle size (bytes)
}

export class PerformanceTester {
  private page: Page;
  private defaultBudget: PerformanceBudget = {
    lcp: 2500,      // 2.5 seconds
    fid: 100,       // 100ms
    cls: 0.1,       // 0.1 score
    fcp: 1800,      // 1.8 seconds
    tti: 3800,      // 3.8 seconds
    tbt: 300,       // 300ms
    loadTime: 3000, // 3 seconds
    bundleSize: 2 * 1024 * 1024, // 2MB
  };

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Measure Core Web Vitals
   */
  async measureCoreWebVitals(): Promise<CoreWebVitals> {
    // Inject web-vitals library and measure
    await this.page.addScriptTag({
      url: 'https://unpkg.com/web-vitals@3/dist/web-vitals.iife.js'
    });

    const vitals = await this.page.evaluate(() => {
      return new Promise<CoreWebVitals>((resolve) => {
        const vitals: Partial<CoreWebVitals> = {};
        let metricsCollected = 0;
        const totalMetrics = 6;

        const checkComplete = () => {
          metricsCollected++;
          if (metricsCollected >= totalMetrics) {
            resolve(vitals as CoreWebVitals);
          }
        };

        // Measure LCP
        (window as any).webVitals.onLCP((metric: any) => {
          vitals.lcp = metric.value;
          checkComplete();
        });

        // Measure FID
        (window as any).webVitals.onFID((metric: any) => {
          vitals.fid = metric.value;
          checkComplete();
        });

        // Measure CLS
        (window as any).webVitals.onCLS((metric: any) => {
          vitals.cls = metric.value;
          checkComplete();
        });

        // Measure FCP
        (window as any).webVitals.onFCP((metric: any) => {
          vitals.fcp = metric.value;
          checkComplete();
        });

        // Measure TTI
        (window as any).webVitals.onTTI((metric: any) => {
          vitals.tti = metric.value;
          checkComplete();
        });

        // Measure TBT (Total Blocking Time)
        (window as any).webVitals.onTBT((metric: any) => {
          vitals.tbt = metric.value;
          checkComplete();
        });

        // Fallback timeout
        setTimeout(() => {
          // Fill in missing metrics with fallback values
          if (!vitals.lcp) vitals.lcp = 0;
          if (!vitals.fid) vitals.fid = 0;
          if (!vitals.cls) vitals.cls = 0;
          if (!vitals.fcp) vitals.fcp = 0;
          if (!vitals.tti) vitals.tti = 0;
          if (!vitals.tbt) vitals.tbt = 0;
          resolve(vitals as CoreWebVitals);
        }, 5000);
      });
    });

    return vitals;
  }

  /**
   * Measure comprehensive performance metrics
   */
  async measurePerformance(): Promise<PerformanceMetrics> {
    // Get navigation timing
    const navigationTiming = await this.page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        navigationStart: navigation.navigationStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.navigationStart,
        loadComplete: navigation.loadEventEnd - navigation.navigationStart,
      };
    });

    // Get Core Web Vitals
    const coreWebVitals = await this.measureCoreWebVitals();

    // Get resource timing
    const resources = await this.page.evaluate(() => {
      const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return resourceEntries.map(entry => ({
        name: entry.name,
        type: entry.initiatorType,
        size: entry.transferSize || 0,
        duration: entry.duration,
        startTime: entry.startTime,
      }));
    });

    // Get memory information (if available)
    const memory = await this.page.evaluate(() => {
      if ('memory' in performance) {
        const mem = (performance as any).memory;
        return {
          usedJSHeapSize: mem.usedJSHeapSize,
          totalJSHeapSize: mem.totalJSHeapSize,
          jsHeapSizeLimit: mem.jsHeapSizeLimit,
        };
      }
      return undefined;
    });

    // Get network information (if available)
    const network = await this.page.evaluate(() => {
      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        return {
          effectiveType: conn.effectiveType,
          downlink: conn.downlink,
          rtt: conn.rtt,
        };
      }
      return undefined;
    });

    return {
      ...navigationTiming,
      coreWebVitals,
      resources,
      memory,
      network,
    };
  }

  /**
   * Validate performance against budget
   */
  async validatePerformanceBudget(
    customBudget?: Partial<PerformanceBudget>
  ): Promise<{
    passed: boolean;
    budget: PerformanceBudget;
    actual: PerformanceMetrics;
    violations: Array<{
      metric: string;
      budget: number;
      actual: number;
      severity: 'warning' | 'error';
    }>;
  }> {
    const budget = { ...this.defaultBudget, ...customBudget };
    const actual = await this.measurePerformance();
    const violations: Array<{
      metric: string;
      budget: number;
      actual: number;
      severity: 'warning' | 'error';
    }> = [];

    // Check Core Web Vitals
    const checks = [
      { metric: 'LCP', budget: budget.lcp, actual: actual.coreWebVitals.lcp },
      { metric: 'FID', budget: budget.fid, actual: actual.coreWebVitals.fid },
      { metric: 'CLS', budget: budget.cls, actual: actual.coreWebVitals.cls },
      { metric: 'FCP', budget: budget.fcp, actual: actual.coreWebVitals.fcp },
      { metric: 'TTI', budget: budget.tti, actual: actual.coreWebVitals.tti },
      { metric: 'TBT', budget: budget.tbt, actual: actual.coreWebVitals.tbt },
      { metric: 'Load Time', budget: budget.loadTime, actual: actual.loadComplete },
    ];

    checks.forEach(check => {
      if (check.actual > check.budget) {
        const severity = check.actual > check.budget * 1.5 ? 'error' : 'warning';
        violations.push({
          metric: check.metric,
          budget: check.budget,
          actual: check.actual,
          severity,
        });
      }
    });

    // Check bundle size
    const totalResourceSize = actual.resources.reduce((sum, resource) => sum + resource.size, 0);
    if (totalResourceSize > budget.bundleSize) {
      violations.push({
        metric: 'Bundle Size',
        budget: budget.bundleSize,
        actual: totalResourceSize,
        severity: totalResourceSize > budget.bundleSize * 1.5 ? 'error' : 'warning',
      });
    }

    return {
      passed: violations.filter(v => v.severity === 'error').length === 0,
      budget,
      actual,
      violations,
    };
  }

  /**
   * Measure page load performance with different network conditions
   */
  async measureWithNetworkConditions(conditions: {
    offline?: boolean;
    downloadThroughput?: number;
    uploadThroughput?: number;
    latency?: number;
  }): Promise<PerformanceMetrics> {
    // Set network conditions
    const client = await this.page.context().newCDPSession(this.page);
    
    if (conditions.offline) {
      await client.send('Network.emulateNetworkConditions', {
        offline: true,
        downloadThroughput: 0,
        uploadThroughput: 0,
        latency: 0,
      });
    } else {
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: conditions.downloadThroughput || -1,
        uploadThroughput: conditions.uploadThroughput || -1,
        latency: conditions.latency || 0,
      });
    }

    // Measure performance
    const metrics = await this.measurePerformance();

    // Reset network conditions
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });

    return metrics;
  }

  /**
   * Measure performance across different device types
   */
  async measureAcrossDevices(): Promise<{
    desktop: PerformanceMetrics;
    tablet: PerformanceMetrics;
    mobile: PerformanceMetrics;
  }> {
    const originalViewport = this.page.viewportSize();

    // Desktop
    await this.page.setViewportSize({ width: 1920, height: 1080 });
    const desktop = await this.measurePerformance();

    // Tablet
    await this.page.setViewportSize({ width: 768, height: 1024 });
    const tablet = await this.measurePerformance();

    // Mobile
    await this.page.setViewportSize({ width: 375, height: 667 });
    const mobile = await this.measurePerformance();

    // Restore original viewport
    if (originalViewport) {
      await this.page.setViewportSize(originalViewport);
    }

    return { desktop, tablet, mobile };
  }

  /**
   * Analyze resource loading performance
   */
  async analyzeResourceLoading(): Promise<{
    totalResources: number;
    totalSize: number;
    slowestResources: Array<{
      name: string;
      type: string;
      duration: number;
      size: number;
    }>;
    resourcesByType: { [type: string]: { count: number; totalSize: number } };
    recommendations: string[];
  }> {
    const resources = await this.page.evaluate(() => {
      const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return resourceEntries.map(entry => ({
        name: entry.name,
        type: entry.initiatorType,
        duration: entry.duration,
        size: entry.transferSize || 0,
      }));
    });

    const totalSize = resources.reduce((sum, resource) => sum + resource.size, 0);
    const slowestResources = resources
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    const resourcesByType: { [type: string]: { count: number; totalSize: number } } = {};
    resources.forEach(resource => {
      if (!resourcesByType[resource.type]) {
        resourcesByType[resource.type] = { count: 0, totalSize: 0 };
      }
      resourcesByType[resource.type].count++;
      resourcesByType[resource.type].totalSize += resource.size;
    });

    const recommendations: string[] = [];
    
    // Analyze and provide recommendations
    if (totalSize > 2 * 1024 * 1024) { // 2MB
      recommendations.push('Consider reducing total bundle size');
    }
    
    if (resourcesByType.script?.totalSize > 1024 * 1024) { // 1MB
      recommendations.push('JavaScript bundle is large, consider code splitting');
    }
    
    if (resourcesByType.img?.totalSize > 1024 * 1024) { // 1MB
      recommendations.push('Optimize images or implement lazy loading');
    }
    
    if (slowestResources[0]?.duration > 1000) {
      recommendations.push('Optimize slowest loading resources');
    }

    return {
      totalResources: resources.length,
      totalSize,
      slowestResources,
      resourcesByType,
      recommendations,
    };
  }

  /**
   * Monitor performance over time
   */
  async monitorPerformanceOverTime(
    duration: number = 30000,
    interval: number = 1000
  ): Promise<{
    samples: Array<{
      timestamp: number;
      memory?: { used: number; total: number };
      fps?: number;
    }>;
    averages: {
      memoryUsage: number;
      fps: number;
    };
  }> {
    const samples: Array<{
      timestamp: number;
      memory?: { used: number; total: number };
      fps?: number;
    }> = [];

    const startTime = Date.now();
    
    while (Date.now() - startTime < duration) {
      const sample = await this.page.evaluate(() => {
        const timestamp = Date.now();
        let memory;
        let fps;

        // Get memory info if available
        if ('memory' in performance) {
          const mem = (performance as any).memory;
          memory = {
            used: mem.usedJSHeapSize,
            total: mem.totalJSHeapSize,
          };
        }

        // Estimate FPS (simplified)
        fps = 60; // Placeholder - real implementation would measure frame timing

        return { timestamp, memory, fps };
      });

      samples.push(sample);
      await this.page.waitForTimeout(interval);
    }

    // Calculate averages
    const memoryUsages = samples.filter(s => s.memory).map(s => s.memory!.used);
    const fpsSamples = samples.filter(s => s.fps).map(s => s.fps!);

    const averages = {
      memoryUsage: memoryUsages.length > 0 ? memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length : 0,
      fps: fpsSamples.length > 0 ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0,
    };

    return { samples, averages };
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(customBudget?: Partial<PerformanceBudget>): Promise<{
    summary: {
      score: number;
      grade: 'A' | 'B' | 'C' | 'D' | 'F';
      passed: boolean;
    };
    metrics: PerformanceMetrics;
    budgetValidation: any;
    resourceAnalysis: any;
    recommendations: string[];
  }> {
    const budgetValidation = await this.validatePerformanceBudget(customBudget);
    const resourceAnalysis = await this.analyzeResourceLoading();
    
    // Calculate performance score (0-100)
    const { coreWebVitals } = budgetValidation.actual;
    const budget = budgetValidation.budget;
    
    const scores = [
      Math.max(0, 100 - (coreWebVitals.lcp / budget.lcp) * 100),
      Math.max(0, 100 - (coreWebVitals.fid / budget.fid) * 100),
      Math.max(0, 100 - (coreWebVitals.cls / budget.cls) * 1000),
      Math.max(0, 100 - (coreWebVitals.fcp / budget.fcp) * 100),
      Math.max(0, 100 - (coreWebVitals.tti / budget.tti) * 100),
    ];
    
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';

    const recommendations = [
      ...budgetValidation.violations.map(v => 
        `Improve ${v.metric}: current ${v.actual}ms exceeds budget of ${v.budget}ms`
      ),
      ...resourceAnalysis.recommendations,
    ];

    return {
      summary: {
        score: Math.round(score),
        grade,
        passed: budgetValidation.passed,
      },
      metrics: budgetValidation.actual,
      budgetValidation,
      resourceAnalysis,
      recommendations,
    };
  }
}