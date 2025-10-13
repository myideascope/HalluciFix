import { test, expect } from '@playwright/test';
import { 
  measureWebVitals, 
  setNetworkThrottling, 
  evaluatePerformance, 
  waitForPageStability,
  PERFORMANCE_BENCHMARKS 
} from './utils/web-vitals';

test.describe('Core Web Vitals Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Reset network conditions before each test
    await setNetworkThrottling(page, 'none');
  });

  test('landing page should meet Core Web Vitals benchmarks', async ({ page }) => {
    // Navigate to landing page
    await page.goto('/');
    
    // Wait for page stability
    await waitForPageStability(page);
    
    // Measure Core Web Vitals
    const metrics = await measureWebVitals(page);
    
    // Evaluate performance
    const evaluation = evaluatePerformance(metrics);
    
    // Log metrics for debugging
    console.log('Landing Page Metrics:', metrics);
    console.log('Performance Evaluation:', evaluation);
    
    // Assert Core Web Vitals benchmarks
    if (metrics.fcp) {
      expect(metrics.fcp).toBeLessThan(PERFORMANCE_BENCHMARKS.fcp.needsImprovement);
      expect.soft(metrics.fcp).toBeLessThan(PERFORMANCE_BENCHMARKS.fcp.good);
    }
    
    if (metrics.lcp) {
      expect(metrics.lcp).toBeLessThan(PERFORMANCE_BENCHMARKS.lcp.needsImprovement);
      expect.soft(metrics.lcp).toBeLessThan(PERFORMANCE_BENCHMARKS.lcp.good);
    }
    
    if (metrics.cls !== undefined) {
      expect(metrics.cls).toBeLessThan(PERFORMANCE_BENCHMARKS.cls.needsImprovement);
      expect.soft(metrics.cls).toBeLessThan(PERFORMANCE_BENCHMARKS.cls.good);
    }
    
    if (metrics.fid) {
      expect(metrics.fid).toBeLessThan(PERFORMANCE_BENCHMARKS.fid.needsImprovement);
      expect.soft(metrics.fid).toBeLessThan(PERFORMANCE_BENCHMARKS.fid.good);
    }
    
    // Overall performance should be at least "needs-improvement"
    expect(evaluation.grade).not.toBe('poor');
    expect.soft(evaluation.grade).toBe('good');
  });

  test('analyzer page should meet performance benchmarks', async ({ page }) => {
    await page.goto('/analyzer');
    await waitForPageStability(page);
    
    const metrics = await measureWebVitals(page);
    const evaluation = evaluatePerformance(metrics);
    
    console.log('Analyzer Page Metrics:', metrics);
    console.log('Performance Evaluation:', evaluation);
    
    // Analyzer page should have good performance for user interaction
    if (metrics.fcp) {
      expect(metrics.fcp).toBeLessThan(PERFORMANCE_BENCHMARKS.fcp.needsImprovement);
    }
    
    if (metrics.lcp) {
      expect(metrics.lcp).toBeLessThan(PERFORMANCE_BENCHMARKS.lcp.needsImprovement);
    }
    
    expect(evaluation.grade).not.toBe('poor');
  });

  test('dashboard should meet performance benchmarks with data', async ({ page }) => {
    // Navigate to dashboard (assuming authentication is handled)
    await page.goto('/dashboard');
    await waitForPageStability(page);
    
    const metrics = await measureWebVitals(page);
    const evaluation = evaluatePerformance(metrics);
    
    console.log('Dashboard Metrics:', metrics);
    console.log('Performance Evaluation:', evaluation);
    
    // Dashboard with data should still perform well
    if (metrics.lcp) {
      expect(metrics.lcp).toBeLessThan(PERFORMANCE_BENCHMARKS.lcp.needsImprovement);
    }
    
    expect(evaluation.grade).not.toBe('poor');
  });

  test('performance under slow 3G conditions', async ({ page }) => {
    // Set slow 3G throttling
    await setNetworkThrottling(page, 'slow3g');
    
    await page.goto('/');
    await waitForPageStability(page, 15000); // Longer timeout for slow network
    
    const metrics = await measureWebVitals(page);
    const evaluation = evaluatePerformance(metrics);
    
    console.log('Slow 3G Metrics:', metrics);
    console.log('Performance Evaluation:', evaluation);
    
    // Under slow network, we allow for degraded performance but not complete failure
    if (metrics.fcp) {
      expect(metrics.fcp).toBeLessThan(10000); // 10 seconds max
    }
    
    if (metrics.lcp) {
      expect(metrics.lcp).toBeLessThan(15000); // 15 seconds max
    }
    
    // Should at least not be completely broken
    expect(evaluation.score).toBeGreaterThan(0);
  });

  test('performance regression detection', async ({ page }) => {
    // This test would compare against baseline metrics
    // In a real implementation, you'd store baseline metrics and compare
    
    await page.goto('/');
    await waitForPageStability(page);
    
    const metrics = await measureWebVitals(page);
    
    // Store metrics for regression detection
    // In practice, you'd compare against stored baselines
    const baselineMetrics = {
      fcp: 1500,
      lcp: 2000,
      cls: 0.05,
      fid: 50,
      ttfb: 500
    };
    
    // Check for significant regressions (>20% increase)
    if (metrics.fcp && baselineMetrics.fcp) {
      const regression = (metrics.fcp - baselineMetrics.fcp) / baselineMetrics.fcp;
      expect(regression).toBeLessThan(0.2); // Less than 20% regression
    }
    
    if (metrics.lcp && baselineMetrics.lcp) {
      const regression = (metrics.lcp - baselineMetrics.lcp) / baselineMetrics.lcp;
      expect(regression).toBeLessThan(0.2);
    }
    
    if (metrics.cls !== undefined && baselineMetrics.cls) {
      const regression = (metrics.cls - baselineMetrics.cls) / baselineMetrics.cls;
      expect(regression).toBeLessThan(0.5); // Allow more variance for CLS
    }
  });

  test('mobile performance benchmarks', async ({ page, browserName }) => {
    // Skip on desktop browsers for mobile-specific test
    test.skip(browserName !== 'chromium' || !page.viewportSize()?.width || page.viewportSize()!.width > 500);
    
    await page.goto('/');
    await waitForPageStability(page);
    
    const metrics = await measureWebVitals(page);
    const evaluation = evaluatePerformance(metrics);
    
    console.log('Mobile Metrics:', metrics);
    console.log('Mobile Performance Evaluation:', evaluation);
    
    // Mobile should have slightly relaxed benchmarks
    if (metrics.fcp) {
      expect(metrics.fcp).toBeLessThan(PERFORMANCE_BENCHMARKS.fcp.needsImprovement * 1.2);
    }
    
    if (metrics.lcp) {
      expect(metrics.lcp).toBeLessThan(PERFORMANCE_BENCHMARKS.lcp.needsImprovement * 1.2);
    }
    
    expect(evaluation.grade).not.toBe('poor');
  });
});