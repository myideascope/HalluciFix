import { Page } from '@playwright/test';

export interface WebVitalsMetrics {
  fcp?: number; // First Contentful Paint
  lcp?: number; // Largest Contentful Paint
  cls?: number; // Cumulative Layout Shift
  fid?: number; // First Input Delay
  ttfb?: number; // Time to First Byte
  tti?: number; // Time to Interactive
}

export interface PerformanceBenchmarks {
  fcp: { good: number; needsImprovement: number };
  lcp: { good: number; needsImprovement: number };
  cls: { good: number; needsImprovement: number };
  fid: { good: number; needsImprovement: number };
  ttfb: { good: number; needsImprovement: number };
  tti: { good: number; needsImprovement: number };
}

// Performance benchmarks based on Core Web Vitals thresholds
export const PERFORMANCE_BENCHMARKS: PerformanceBenchmarks = {
  fcp: { good: 1800, needsImprovement: 3000 }, // milliseconds
  lcp: { good: 2500, needsImprovement: 4000 },
  cls: { good: 0.1, needsImprovement: 0.25 }, // score
  fid: { good: 100, needsImprovement: 300 },
  ttfb: { good: 800, needsImprovement: 1800 },
  tti: { good: 3800, needsImprovement: 7300 }
};

/**
 * Measure Core Web Vitals using the web-vitals library
 */
export async function measureWebVitals(page: Page): Promise<WebVitalsMetrics> {
  // Inject web-vitals library and measurement script
  await page.addInitScript(() => {
    // Store metrics globally
    (window as any).webVitalsMetrics = {};
    
    // Import web-vitals functions (assuming they're available)
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/web-vitals@3/dist/web-vitals.iife.js';
    document.head.appendChild(script);
    
    script.onload = () => {
      const { getCLS, getFID, getFCP, getLCP, getTTFB } = (window as any).webVitals;
      
      getCLS((metric: any) => {
        (window as any).webVitalsMetrics.cls = metric.value;
      });
      
      getFID((metric: any) => {
        (window as any).webVitalsMetrics.fid = metric.value;
      });
      
      getFCP((metric: any) => {
        (window as any).webVitalsMetrics.fcp = metric.value;
      });
      
      getLCP((metric: any) => {
        (window as any).webVitalsMetrics.lcp = metric.value;
      });
      
      getTTFB((metric: any) => {
        (window as any).webVitalsMetrics.ttfb = metric.value;
      });
    };
  });

  // Alternative measurement using Performance API
  const metrics = await page.evaluate(() => {
    return new Promise<WebVitalsMetrics>((resolve) => {
      const metrics: WebVitalsMetrics = {};
      
      // Measure using Performance Observer
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        
        entries.forEach((entry) => {
          switch (entry.entryType) {
            case 'paint':
              if (entry.name === 'first-contentful-paint') {
                metrics.fcp = entry.startTime;
              }
              break;
            case 'largest-contentful-paint':
              metrics.lcp = entry.startTime;
              break;
            case 'layout-shift':
              if (!metrics.cls) metrics.cls = 0;
              if (!(entry as any).hadRecentInput) {
                metrics.cls += (entry as any).value;
              }
              break;
            case 'first-input':
              metrics.fid = (entry as any).processingStart - entry.startTime;
              break;
          }
        });
      });
      
      observer.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift', 'first-input'] });
      
      // Also measure navigation timing
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        metrics.ttfb = navigation.responseStart - navigation.requestStart;
      }
      
      // Resolve after a reasonable time to collect metrics
      setTimeout(() => {
        observer.disconnect();
        
        // Try to get web-vitals metrics if available
        const webVitalsMetrics = (window as any).webVitalsMetrics || {};
        
        resolve({
          fcp: webVitalsMetrics.fcp || metrics.fcp,
          lcp: webVitalsMetrics.lcp || metrics.lcp,
          cls: webVitalsMetrics.cls || metrics.cls,
          fid: webVitalsMetrics.fid || metrics.fid,
          ttfb: webVitalsMetrics.ttfb || metrics.ttfb,
          tti: metrics.tti
        });
      }, 5000);
    });
  });

  return metrics;
}

/**
 * Set network throttling conditions
 */
export async function setNetworkThrottling(page: Page, condition: 'fast3g' | 'slow3g' | 'offline' | 'none') {
  const conditions = {
    fast3g: {
      offline: false,
      downloadThroughput: 1.5 * 1024 * 1024 / 8, // 1.5 Mbps
      uploadThroughput: 750 * 1024 / 8, // 750 Kbps
      latency: 150 // 150ms
    },
    slow3g: {
      offline: false,
      downloadThroughput: 500 * 1024 / 8, // 500 Kbps
      uploadThroughput: 500 * 1024 / 8, // 500 Kbps
      latency: 400 // 400ms
    },
    offline: {
      offline: true,
      downloadThroughput: 0,
      uploadThroughput: 0,
      latency: 0
    },
    none: {
      offline: false,
      downloadThroughput: -1, // No throttling
      uploadThroughput: -1,
      latency: 0
    }
  };

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  
  if (condition !== 'none') {
    await cdp.send('Network.emulateNetworkConditions', conditions[condition]);
  }
}

/**
 * Evaluate performance metrics against benchmarks
 */
export function evaluatePerformance(metrics: WebVitalsMetrics): {
  score: number;
  grade: 'good' | 'needs-improvement' | 'poor';
  details: Record<string, { value: number; status: 'good' | 'needs-improvement' | 'poor' }>;
} {
  const details: Record<string, { value: number; status: 'good' | 'needs-improvement' | 'poor' }> = {};
  let totalScore = 0;
  let metricCount = 0;

  Object.entries(metrics).forEach(([key, value]) => {
    if (value !== undefined && key in PERFORMANCE_BENCHMARKS) {
      const benchmark = PERFORMANCE_BENCHMARKS[key as keyof PerformanceBenchmarks];
      let status: 'good' | 'needs-improvement' | 'poor';
      
      if (key === 'cls') {
        // CLS is a score, lower is better
        status = value <= benchmark.good ? 'good' : 
                value <= benchmark.needsImprovement ? 'needs-improvement' : 'poor';
      } else {
        // Other metrics are time-based, lower is better
        status = value <= benchmark.good ? 'good' : 
                value <= benchmark.needsImprovement ? 'needs-improvement' : 'poor';
      }
      
      details[key] = { value, status };
      
      // Calculate score (good = 100, needs-improvement = 50, poor = 0)
      const metricScore = status === 'good' ? 100 : status === 'needs-improvement' ? 50 : 0;
      totalScore += metricScore;
      metricCount++;
    }
  });

  const averageScore = metricCount > 0 ? totalScore / metricCount : 0;
  const grade = averageScore >= 80 ? 'good' : averageScore >= 50 ? 'needs-improvement' : 'poor';

  return {
    score: averageScore,
    grade,
    details
  };
}

/**
 * Wait for page to be fully loaded and stable
 */
export async function waitForPageStability(page: Page, timeout = 10000): Promise<void> {
  // Wait for network to be idle
  await page.waitForLoadState('networkidle', { timeout });
  
  // Wait for any animations or dynamic content to settle
  await page.waitForTimeout(1000);
  
  // Check if there are any pending requests
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', () => resolve());
      }
    });
  });
}