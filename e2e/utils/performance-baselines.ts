/**
 * Performance Baselines Configuration
 * Defines performance budgets and validation criteria for HalluciFix
 */

export interface PerformanceBudget {
  // Core Web Vitals (milliseconds)
  fcp: number;      // First Contentful Paint
  lcp: number;      // Largest Contentful Paint
  fid: number;      // First Input Delay
  cls: number;      // Cumulative Layout Shift (score)

  // Load times (milliseconds)
  loadTime: number; // Total load time
  tti: number;      // Time to Interactive
  tbt: number;      // Total Blocking Time

  // Bundle sizes (bytes)
  jsBundleSize: number;
  cssBundleSize: number;
  totalBundleSize: number;

  // Resource limits
  maxResources: number;
  maxLargeResources: number; // Resources > 500KB

  // Memory limits (bytes)
  maxMemoryUsage: number;
  maxMemoryGrowth: number; // Per minute

  // Network limits
  maxRequests: number;
  maxDuplicateRequests: number;
}

// Performance budgets by page type
export const PERFORMANCE_BUDGETS: Record<string, PerformanceBudget> = {
  landing: {
    fcp: 1500,    // 1.5s
    lcp: 2500,    // 2.5s
    fid: 100,     // 100ms
    cls: 0.1,     // 0.1 score
    loadTime: 3000,
    tti: 3500,
    tbt: 300,
    jsBundleSize: 1024 * 1024,      // 1MB
    cssBundleSize: 200 * 1024,      // 200KB
    totalBundleSize: 2 * 1024 * 1024, // 2MB
    maxResources: 50,
    maxLargeResources: 3,
    maxMemoryUsage: 50 * 1024 * 1024,   // 50MB
    maxMemoryGrowth: 10 * 1024 * 1024,  // 10MB/min
    maxRequests: 100,
    maxDuplicateRequests: 5
  },

  dashboard: {
    fcp: 1800,    // 1.8s (more data to load)
    lcp: 3000,    // 3.0s
    fid: 150,     // 150ms
    cls: 0.15,    // 0.15 score
    loadTime: 4000,
    tti: 4500,
    tbt: 500,
    jsBundleSize: 1024 * 1024,      // 1MB
    cssBundleSize: 200 * 1024,      // 200KB
    totalBundleSize: 2 * 1024 * 1024, // 2MB
    maxResources: 75,
    maxLargeResources: 5,
    maxMemoryUsage: 75 * 1024 * 1024,   // 75MB
    maxMemoryGrowth: 15 * 1024 * 1024,  // 15MB/min
    maxRequests: 150,
    maxDuplicateRequests: 8
  },

  analyzer: {
    fcp: 2000,    // 2.0s (processing heavy)
    lcp: 3500,    // 3.5s
    fid: 200,     // 200ms
    cls: 0.2,     // 0.2 score
    loadTime: 5000,
    tti: 5500,
    tbt: 700,
    jsBundleSize: 1024 * 1024,      // 1MB
    cssBundleSize: 200 * 1024,      // 200KB
    totalBundleSize: 2 * 1024 * 1024, // 2MB
    maxResources: 100,
    maxLargeResources: 7,
    maxMemoryUsage: 100 * 1024 * 1024,  // 100MB
    maxMemoryGrowth: 20 * 1024 * 1024,  // 20MB/min
    maxRequests: 200,
    maxDuplicateRequests: 10
  }
};

// Network condition presets for testing
export const NETWORK_CONDITIONS = {
  'fast-4g': {
    downloadThroughput: 9 * 1024 * 1024 / 8,  // 9 Mbps
    uploadThroughput: 3 * 1024 * 1024 / 8,    // 3 Mbps
    latency: 20,                              // 20ms
    name: 'Fast 4G'
  },
  'slow-4g': {
    downloadThroughput: 4 * 1024 * 1024 / 8,  // 4 Mbps
    uploadThroughput: 1 * 1024 * 1024 / 8,    // 1 Mbps
    latency: 50,                              // 50ms
    name: 'Slow 4G'
  },
  'fast-3g': {
    downloadThroughput: 1.5 * 1024 * 1024 / 8, // 1.5 Mbps
    uploadThroughput: 0.75 * 1024 * 1024 / 8,  // 0.75 Mbps
    latency: 150,                              // 150ms
    name: 'Fast 3G'
  },
  'slow-3g': {
    downloadThroughput: 0.5 * 1024 * 1024 / 8, // 0.5 Mbps
    uploadThroughput: 0.25 * 1024 * 1024 / 8,  // 0.25 Mbps
    latency: 300,                              // 300ms
    name: 'Slow 3G'
  },
  '2g': {
    downloadThroughput: 0.1 * 1024 * 1024 / 8, // 0.1 Mbps
    uploadThroughput: 0.05 * 1024 * 1024 / 8,  // 0.05 Mbps
    latency: 800,                              // 800ms
    name: '2G'
  }
};

// Device presets for testing
export const DEVICE_PRESETS = {
  desktop: {
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    name: 'Desktop'
  },
  tablet: {
    viewport: { width: 1024, height: 1366 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: false,
    name: 'Tablet'
  },
  mobile: {
    viewport: { width: 393, height: 851 },
    deviceScaleFactor: 2.75,
    hasTouch: true,
    isMobile: true,
    name: 'Mobile'
  }
};

// Performance regression thresholds
export const REGRESSION_THRESHOLDS = {
  // Percentage increase that triggers warning
  warning: 10,    // 10% degradation
  error: 25,      // 25% degradation

  // Absolute thresholds for critical metrics
  critical: {
    lcp: 500,     // 500ms increase
    fid: 50,      // 50ms increase
    cls: 0.05,    // 0.05 score increase
    bundleSize: 100 * 1024  // 100KB increase
  }
};

// Helper function to create performance budget for specific page
export function createPerformanceBudget(pageType: keyof typeof PERFORMANCE_BUDGETS): PerformanceBudget {
  return { ...PERFORMANCE_BUDGETS[pageType] };
}

// Helper function to validate performance against budget
export function validatePerformanceBudget(
  actual: Partial<PerformanceMetrics>,
  budget: PerformanceBudget
): {
  passed: boolean;
  violations: Array<{
    metric: string;
    actual: number;
    budget: number;
    severity: 'warning' | 'error';
    percentage: number;
  }>;
} {
  const violations: Array<{
    metric: string;
    actual: number;
    budget: number;
    severity: 'warning' | 'error';
    percentage: number;
  }> = [];

  // Core Web Vitals validation
  if (actual.coreWebVitals) {
    const { fcp, lcp, fid, cls } = actual.coreWebVitals;

    if (fcp > budget.fcp) {
      const percentage = ((fcp - budget.fcp) / budget.fcp) * 100;
      violations.push({
        metric: 'FCP',
        actual: fcp,
        budget: budget.fcp,
        severity: percentage > REGRESSION_THRESHOLDS.error ? 'error' : 'warning',
        percentage
      });
    }

    if (lcp > budget.lcp) {
      const percentage = ((lcp - budget.lcp) / budget.lcp) * 100;
      violations.push({
        metric: 'LCP',
        actual: lcp,
        budget: budget.lcp,
        severity: percentage > REGRESSION_THRESHOLDS.error ? 'error' : 'warning',
        percentage
      });
    }

    if (fid > budget.fid) {
      const percentage = ((fid - budget.fid) / budget.fid) * 100;
      violations.push({
        metric: 'FID',
        actual: fid,
        budget: budget.fid,
        severity: percentage > REGRESSION_THRESHOLDS.error ? 'error' : 'warning',
        percentage
      });
    }

    if (cls > budget.cls) {
      const percentage = ((cls - budget.cls) / budget.cls) * 100;
      violations.push({
        metric: 'CLS',
        actual: cls,
        budget: budget.cls,
        severity: percentage > REGRESSION_THRESHOLDS.error ? 'error' : 'warning',
        percentage
      });
    }
  }

  // Load time validation
  if (actual.loadComplete && actual.loadComplete > budget.loadTime) {
    const percentage = ((actual.loadComplete - budget.loadTime) / budget.loadTime) * 100;
    violations.push({
      metric: 'Load Time',
      actual: actual.loadComplete,
      budget: budget.loadTime,
      severity: percentage > REGRESSION_THRESHOLDS.error ? 'error' : 'warning',
      percentage
    });
  }

  // Memory validation
  if (actual.memory && actual.memory.usedJSHeapSize > budget.maxMemoryUsage) {
    const percentage = ((actual.memory.usedJSHeapSize - budget.maxMemoryUsage) / budget.maxMemoryUsage) * 100;
    violations.push({
      metric: 'Memory Usage',
      actual: actual.memory.usedJSHeapSize,
      budget: budget.maxMemoryUsage,
      severity: percentage > REGRESSION_THRESHOLDS.error ? 'error' : 'warning',
      percentage
    });
  }

  return {
    passed: violations.filter(v => v.severity === 'error').length === 0,
    violations
  };
}

// Import the PerformanceMetrics interface
interface PerformanceMetrics {
  navigationStart: number;
  domContentLoaded: number;
  loadComplete: number;
  coreWebVitals: {
    lcp: number;
    fid: number;
    cls: number;
    fcp: number;
    tti: number;
    tbt: number;
  };
  resources: Array<{
    name: string;
    type: string;
    size: number;
    duration: number;
    startTime: number;
  }>;
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  network?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
  };
}