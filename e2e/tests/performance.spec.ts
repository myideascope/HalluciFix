/**
 * Performance Testing Suite
 * Tests Core Web Vitals, load times, and resource optimization
 */

import { test, expect } from '@playwright/test';
import { PerformanceTester, createPerformanceBudget } from '../utils/performance';

test.describe('Performance Testing', () => {
  let performanceTester: PerformanceTester;

  test.beforeEach(async ({ page }) => {
    performanceTester = new PerformanceTester(page);
  });

  test('Landing page meets performance budget', async ({ page }) => {
    const budget = createPerformanceBudget('landing');
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const result = await performanceTester.validatePerformanceBudget(budget);
    
    // Log performance metrics for debugging
    console.log('Performance Metrics:', {
      lcp: result.actual.coreWebVitals.lcp,
      fid: result.actual.coreWebVitals.fid,
      cls: result.actual.coreWebVitals.cls,
      fcp: result.actual.coreWebVitals.fcp,
      loadTime: result.actual.loadComplete
    });
    
    // Check for critical violations
    const criticalViolations = result.violations.filter(v => v.severity === 'error');
    if (criticalViolations.length > 0) {
      console.warn('Performance budget violations:', criticalViolations);
    }
    
    expect(result.passed, `Performance budget failed with violations: ${JSON.stringify(criticalViolations)}`).toBe(true);
  });

  test('Dashboard performance under load', async ({ page }) => {
    const budget = createPerformanceBudget('dashboard');
    
    // Navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Simulate user interactions to load data
    await page.click('[data-testid="refresh-data"]', { timeout: 5000 }).catch(() => {
      // Button might not exist, continue test
    });
    
    const result = await performanceTester.validatePerformanceBudget(budget);
    
    // Dashboard can have slightly relaxed performance requirements
    const allowedViolations = result.violations.filter(v => 
      v.metric === 'LCP' && v.actual < budget.lcp * 1.2
    );
    
    const criticalViolations = result.violations.filter(v => 
      v.severity === 'error' && !allowedViolations.includes(v)
    );
    
    expect(criticalViolations.length).toBe(0);
  });

  test('Analyzer performance with file upload', async ({ page }) => {
    const budget = createPerformanceBudget('analyzer');
    
    await page.goto('/');
    
    // Simulate file upload scenario
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible()) {
      // Create a test file
      const testContent = 'This is test content for performance analysis.';
      await fileInput.setInputFiles({
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(testContent)
      });
    }
    
    await page.waitForLoadState('networkidle');
    
    const result = await performanceTester.validatePerformanceBudget(budget);
    
    // Analyzer may have higher resource usage due to processing
    expect(result.actual.coreWebVitals.lcp).toBeLessThan(budget.lcp * 1.3);
    expect(result.actual.loadComplete).toBeLessThan(budget.loadTime * 1.2);
  });

  test('Core Web Vitals across different network conditions', async ({ page }) => {
    const testConditions = [
      { name: 'Fast 3G', downloadThroughput: 1.5 * 1024 * 1024 / 8, latency: 150 },
      { name: 'Slow 3G', downloadThroughput: 0.5 * 1024 * 1024 / 8, latency: 300 },
    ];

    for (const condition of testConditions) {
      await page.goto('/');
      
      const metrics = await performanceTester.measureWithNetworkConditions({
        downloadThroughput: condition.downloadThroughput,
        latency: condition.latency
      });
      
      console.log(`${condition.name} metrics:`, {
        lcp: metrics.coreWebVitals.lcp,
        fcp: metrics.coreWebVitals.fcp,
        loadTime: metrics.loadComplete
      });
      
      // Adjust expectations based on network conditions
      const expectedLCP = condition.name === 'Slow 3G' ? 5000 : 3500;
      expect(metrics.coreWebVitals.lcp).toBeLessThan(expectedLCP);
    }
  });

  test('Resource loading optimization', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const analysis = await performanceTester.analyzeResourceLoading();
    
    console.log('Resource Analysis:', {
      totalResources: analysis.totalResources,
      totalSize: `${(analysis.totalSize / 1024 / 1024).toFixed(2)}MB`,
      recommendations: analysis.recommendations
    });
    
    // Check resource optimization
    expect(analysis.totalSize).toBeLessThan(3 * 1024 * 1024); // 3MB limit
    expect(analysis.totalResources).toBeLessThan(100); // Resource count limit
    
    // Check for large resources
    const largeResources = analysis.slowestResources.filter(r => r.size > 500 * 1024); // 500KB
    expect(largeResources.length).toBeLessThan(5);
  });

  test('Performance across device types', async ({ page }) => {
    await page.goto('/');
    
    const deviceMetrics = await performanceTester.measureAcrossDevices();
    
    // Mobile should have reasonable performance
    expect(deviceMetrics.mobile.coreWebVitals.lcp).toBeLessThan(4000);
    expect(deviceMetrics.mobile.loadComplete).toBeLessThan(5000);
    
    // Desktop should be faster
    expect(deviceMetrics.desktop.coreWebVitals.lcp).toBeLessThan(3000);
    expect(deviceMetrics.desktop.loadComplete).toBeLessThan(4000);
    
    console.log('Device Performance Comparison:', {
      desktop: deviceMetrics.desktop.coreWebVitals.lcp,
      tablet: deviceMetrics.tablet.coreWebVitals.lcp,
      mobile: deviceMetrics.mobile.coreWebVitals.lcp
    });
  });

  test('Memory usage monitoring', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const monitoring = await performanceTester.monitorPerformanceOverTime(10000, 1000);
    
    console.log('Memory Monitoring:', {
      averageMemoryUsage: `${(monitoring.averages.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
      samples: monitoring.samples.length
    });
    
    // Check for memory leaks (simplified)
    if (monitoring.samples.length > 5) {
      const firstSample = monitoring.samples[0].memory?.used || 0;
      const lastSample = monitoring.samples[monitoring.samples.length - 1].memory?.used || 0;
      const memoryGrowth = lastSample - firstSample;
      
      // Memory growth should be reasonable
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB growth limit
    }
  });

  test('Bundle size analysis', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const resources = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return entries
        .filter(entry => entry.initiatorType === 'script' || entry.initiatorType === 'link')
        .map(entry => ({
          name: entry.name,
          type: entry.initiatorType,
          size: entry.transferSize || 0
        }));
    });
    
    const jsBundle = resources
      .filter(r => r.type === 'script' && r.name.includes('index'))
      .reduce((total, r) => total + r.size, 0);
    
    const cssBundle = resources
      .filter(r => r.type === 'link' && r.name.includes('.css'))
      .reduce((total, r) => total + r.size, 0);
    
    console.log('Bundle Analysis:', {
      jsSize: `${(jsBundle / 1024).toFixed(2)}KB`,
      cssSize: `${(cssBundle / 1024).toFixed(2)}KB`,
      totalSize: `${((jsBundle + cssBundle) / 1024).toFixed(2)}KB`
    });
    
    // Bundle size limits
    expect(jsBundle).toBeLessThan(1024 * 1024); // 1MB JS limit
    expect(cssBundle).toBeLessThan(200 * 1024); // 200KB CSS limit
  });

  test('Performance regression detection', async ({ page }) => {
    await page.goto('/');

    const report = await performanceTester.generatePerformanceReport();

    console.log('Performance Report:', {
      score: report.summary.score,
      grade: report.summary.grade,
      recommendations: report.recommendations.slice(0, 3)
    });

    // Performance should meet minimum standards
    expect(report.summary.score).toBeGreaterThan(60); // Minimum C grade
    expect(report.summary.grade).not.toBe('F');

    // Critical metrics should pass
    expect(report.metrics.coreWebVitals.lcp).toBeLessThan(4000);
    expect(report.metrics.coreWebVitals.cls).toBeLessThan(0.25);
  });

  test('Memory leak detection - navigation stress test', async ({ page }) => {
    const performanceTester = new PerformanceTester(page);

    // Initial memory measurement
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const initialMetrics = await performanceTester.measurePerformance();

    console.log('Initial memory usage:', initialMetrics.memory?.usedJSHeapSize || 'N/A');

    // Perform repeated navigation and interactions to stress memory
    for (let i = 0; i < 10; i++) {
      // Navigate to different pages
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Perform some interactions
      await page.click('[data-testid="refresh-data"]', { timeout: 5000 }).catch(() => {
        // Button might not exist, continue test
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Simulate user interactions
      await page.click('button:has-text("Analyze")', { timeout: 2000 }).catch(() => {});
      await page.fill('textarea', `Test content ${i}`, { timeout: 2000 }).catch(() => {});
    }

    // Final memory measurement
    const finalMetrics = await performanceTester.measurePerformance();
    console.log('Final memory usage:', finalMetrics.memory?.usedJSHeapSize || 'N/A');

    // Check for memory leaks
    if (initialMetrics.memory && finalMetrics.memory) {
      const memoryGrowth = finalMetrics.memory.usedJSHeapSize - initialMetrics.memory.usedJSHeapSize;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);

      console.log(`Memory growth after stress test: ${memoryGrowthMB.toFixed(2)}MB`);

      // Memory growth should be reasonable (less than 50MB for this stress test)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB limit

      // Memory growth rate should be acceptable
      const acceptableGrowthRate = 0.1; // 10% of initial memory
      const acceptableGrowth = initialMetrics.memory.usedJSHeapSize * acceptableGrowthRate;
      expect(memoryGrowth).toBeLessThan(acceptableGrowth);
    }
  });

  test('Memory leak detection - component lifecycle test', async ({ page }) => {
    const performanceTester = new PerformanceTester(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Monitor memory during component mounting/unmounting cycles
    const monitoring = await performanceTester.monitorPerformanceOverTime(30000, 2000);

    console.log('Memory monitoring results:', {
      samples: monitoring.samples.length,
      averageMemoryUsage: `${(monitoring.averages.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
      memoryGrowth: monitoring.samples.length > 1 ?
        `${(((monitoring.samples[monitoring.samples.length - 1].memory?.used || 0) - (monitoring.samples[0].memory?.used || 0)) / (1024 * 1024)).toFixed(2)}MB` :
        'N/A'
    });

    // Check for gradual memory leaks
    if (monitoring.samples.length >= 5) {
      const firstSample = monitoring.samples[0].memory?.used || 0;
      const lastSample = monitoring.samples[monitoring.samples.length - 1].memory?.used || 0;
      const totalGrowth = lastSample - firstSample;

      // Calculate growth rate (bytes per minute)
      const durationMinutes = (monitoring.samples.length * 2) / 60; // 2 second intervals
      const growthRatePerMinute = totalGrowth / durationMinutes;

      console.log(`Memory growth rate: ${(growthRatePerMinute / (1024 * 1024)).toFixed(2)}MB/min`);

      // Growth rate should be reasonable (less than 10MB per minute)
      expect(growthRatePerMinute).toBeLessThan(10 * 1024 * 1024); // 10MB/min limit
    }

    // Check for memory spikes (sudden large increases)
    const memoryValues = monitoring.samples
      .map(s => s.memory?.used || 0)
      .filter(v => v > 0);

    if (memoryValues.length >= 3) {
      for (let i = 2; i < memoryValues.length; i++) {
        const recentAvg = (memoryValues[i-1] + memoryValues[i-2]) / 2;
        const current = memoryValues[i];
        const spike = current - recentAvg;

        // No single spike should be more than 20MB
        expect(spike).toBeLessThan(20 * 1024 * 1024); // 20MB spike limit
      }
    }
  });
});

test.describe('Load Testing Scenarios', () => {
  test('Concurrent user simulation', async ({ page, context }) => {
    // Simulate multiple tabs/users
    const pages = await Promise.all([
      context.newPage(),
      context.newPage(),
      context.newPage()
    ]);
    
    try {
      // Load the same page in multiple tabs simultaneously
      await Promise.all(pages.map(p => p.goto('/')));
      await Promise.all(pages.map(p => p.waitForLoadState('networkidle')));
      
      // Measure performance under concurrent load
      const performanceTester = new PerformanceTester(page);
      await page.goto('/');
      
      const metrics = await performanceTester.measurePerformance();
      
      // Performance should degrade gracefully under load
      expect(metrics.coreWebVitals.lcp).toBeLessThan(5000); // Relaxed under load
      expect(metrics.loadComplete).toBeLessThan(6000);
      
    } finally {
      await Promise.all(pages.map(p => p.close()));
    }
  });

  test('Heavy data processing simulation', async ({ page }) => {
    const performanceTester = new PerformanceTester(page);
    
    await page.goto('/');
    
    // Simulate heavy processing by uploading multiple files
    const fileInputs = await page.locator('input[type="file"]').all();
    
    if (fileInputs.length > 0) {
      const testFiles = Array.from({ length: 3 }, (_, i) => ({
        name: `test-${i}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from(`Test content ${i} `.repeat(1000)) // Larger content
      }));
      
      for (const file of testFiles) {
        await fileInputs[0].setInputFiles(file);
        await page.waitForTimeout(1000); // Allow processing time
      }
    }
    
    const metrics = await performanceTester.measurePerformance();
    
    // Should handle heavy processing reasonably
    expect(metrics.coreWebVitals.lcp).toBeLessThan(6000);
    
    // Memory usage should be reasonable
    if (metrics.memory) {
      expect(metrics.memory.usedJSHeapSize).toBeLessThan(100 * 1024 * 1024); // 100MB
    }
  });
});