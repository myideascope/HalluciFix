import { test, expect } from '@playwright/test';
import { 
  measureWebVitals, 
  setNetworkThrottling, 
  waitForPageStability 
} from './utils/web-vitals';
import { 
  PerformanceMonitor, 
  PerformanceBudgetChecker, 
  PerformanceBudget 
} from './utils/performance-monitor';

// Performance budgets for critical operations
const PERFORMANCE_BUDGETS: Record<string, PerformanceBudget> = {
  analysis: {
    maxFCP: 2000,
    maxLCP: 3000,
    maxCLS: 0.1,
    maxFID: 100,
    maxTTFB: 800,
    maxResourceSize: 2 * 1024 * 1024, // 2MB
    maxRequests: 50
  },
  dashboard: {
    maxFCP: 1800,
    maxLCP: 2500,
    maxCLS: 0.1,
    maxFID: 100,
    maxTTFB: 600,
    maxResourceSize: 3 * 1024 * 1024, // 3MB
    maxRequests: 60
  },
  fileUpload: {
    maxFCP: 2000,
    maxLCP: 3000,
    maxCLS: 0.15,
    maxFID: 150,
    maxTTFB: 1000,
    maxResourceSize: 1.5 * 1024 * 1024, // 1.5MB
    maxRequests: 40
  }
};

test.describe('Critical Operations Performance Tests', () => {
  let performanceMonitor: PerformanceMonitor;

  test.beforeEach(async ({ page }) => {
    performanceMonitor = new PerformanceMonitor(page);
    await setNetworkThrottling(page, 'none');
  });

  test('analysis performance with small content', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    // Navigate to analyzer
    await page.goto('/analyzer');
    await waitForPageStability(page);
    
    const startTime = Date.now();
    
    // Perform analysis with small content
    const smallContent = 'This AI system achieves 99.7% accuracy with zero false positives.';
    await page.fill('[data-testid="content-textarea"]', smallContent);
    
    const analyzeStartTime = Date.now();
    await page.click('[data-testid="analyze-button"]');
    
    // Wait for analysis to complete
    await page.waitForSelector('[data-testid="analysis-results"]', { timeout: 30000 });
    const analyzeEndTime = Date.now();
    
    const analysisTime = analyzeEndTime - analyzeStartTime;
    const totalTime = analyzeEndTime - startTime;
    
    // Measure performance metrics
    const metrics = await measureWebVitals(page);
    const resourceAnalysis = await performanceMonitor.analyzeResourcePerformance();
    
    // Check performance budget
    const budgetChecker = new PerformanceBudgetChecker(PERFORMANCE_BUDGETS.analysis);
    const budgetResult = budgetChecker.checkBudget(metrics, resourceAnalysis);
    
    console.log('Small Content Analysis Performance:', {
      analysisTime,
      totalTime,
      metrics,
      resourceAnalysis,
      budgetViolations: budgetResult.violations
    });
    
    // Performance assertions
    expect(analysisTime).toBeLessThan(10000); // Analysis should complete within 10 seconds
    expect(totalTime).toBeLessThan(15000); // Total time including page load
    
    // Budget assertions (soft expectations)
    expect.soft(budgetResult.passed).toBe(true);
    
    // Critical performance requirements
    if (metrics.lcp) {
      expect(metrics.lcp).toBeLessThan(5000); // Hard limit for LCP
    }
    
    expect(resourceAnalysis.totalRequests).toBeLessThan(100); // Reasonable request count
  });

  test('analysis performance with large content', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    await page.goto('/analyzer');
    await waitForPageStability(page);
    
    const startTime = Date.now();
    
    // Generate large content (approximately 5000 words)
    const largeContent = Array(1000).fill(
      'This is a comprehensive analysis of AI system performance metrics and accuracy measurements. ' +
      'The system demonstrates exceptional capabilities in natural language processing and understanding. ' +
      'However, some claims about perfect accuracy may require additional verification and validation. ' +
      'The implementation includes advanced algorithms for hallucination detection and content analysis. ' +
      'Performance benchmarks indicate significant improvements over baseline systems and methodologies.'
    ).join(' ');
    
    await page.fill('[data-testid="content-textarea"]', largeContent);
    
    const analyzeStartTime = Date.now();
    await page.click('[data-testid="analyze-button"]');
    
    // Wait for analysis with longer timeout for large content
    await page.waitForSelector('[data-testid="analysis-results"]', { timeout: 60000 });
    const analyzeEndTime = Date.now();
    
    const analysisTime = analyzeEndTime - analyzeStartTime;
    
    // Measure performance
    const metrics = await measureWebVitals(page);
    const resourceAnalysis = await performanceMonitor.analyzeResourcePerformance();
    
    console.log('Large Content Analysis Performance:', {
      contentLength: largeContent.length,
      analysisTime,
      metrics,
      resourceAnalysis
    });
    
    // Performance assertions for large content
    expect(analysisTime).toBeLessThan(60000); // Should complete within 60 seconds
    expect(analysisTime).toBeGreaterThan(5000); // Should take some time for large content
    
    // Memory usage should be reasonable
    if (metrics.ttfb) {
      expect(metrics.ttfb).toBeLessThan(2000); // Server response should still be fast
    }
  });

  test('dashboard loading performance with large datasets', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    // Mock large dataset response
    await page.route('**/api/analytics**', async (route) => {
      const mockData = {
        totalAnalyses: 10000,
        averageAccuracy: 87.5,
        riskDistribution: {
          low: 6500,
          medium: 2500,
          high: 800,
          critical: 200
        },
        recentAnalyses: Array(100).fill(null).map((_, i) => ({
          id: `analysis-${i}`,
          content: `Analysis content ${i}`,
          accuracy: 70 + Math.random() * 30,
          riskLevel: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)],
          createdAt: new Date(Date.now() - i * 3600000).toISOString()
        })),
        performanceMetrics: Array(30).fill(null).map((_, i) => ({
          date: new Date(Date.now() - i * 86400000).toISOString(),
          averageAccuracy: 80 + Math.random() * 20,
          totalAnalyses: Math.floor(Math.random() * 100) + 50
        }))
      };
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockData)
      });
    });
    
    const startTime = Date.now();
    
    // Navigate to dashboard
    await page.goto('/dashboard');
    await waitForPageStability(page);
    
    // Wait for data to load
    await page.waitForSelector('[data-testid="analytics-chart"]', { timeout: 15000 });
    
    const loadTime = Date.now() - startTime;
    
    // Measure performance
    const metrics = await measureWebVitals(page);
    const resourceAnalysis = await performanceMonitor.analyzeResourcePerformance();
    
    // Check budget
    const budgetChecker = new PerformanceBudgetChecker(PERFORMANCE_BUDGETS.dashboard);
    const budgetResult = budgetChecker.checkBudget(metrics, resourceAnalysis);
    
    console.log('Dashboard Large Dataset Performance:', {
      loadTime,
      metrics,
      resourceAnalysis,
      budgetViolations: budgetResult.violations
    });
    
    // Performance assertions
    expect(loadTime).toBeLessThan(10000); // Dashboard should load within 10 seconds
    
    if (metrics.lcp) {
      expect(metrics.lcp).toBeLessThan(4000); // LCP should be reasonable even with large data
    }
    
    // Soft budget expectations
    expect.soft(budgetResult.passed).toBe(true);
  });

  test('file upload and processing performance', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    await page.goto('/analyzer');
    await waitForPageStability(page);
    
    // Create a mock file for upload testing
    const fileContent = 'This is a test document with content that needs to be analyzed for hallucinations and accuracy.';
    
    // Mock file upload API
    await page.route('**/api/upload**', async (route) => {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fileId: 'test-file-123',
          content: fileContent,
          processingTime: 2000
        })
      });
    });
    
    const startTime = Date.now();
    
    // Simulate file upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-document.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent)
    });
    
    // Wait for upload to complete
    await page.waitForSelector('[data-testid="upload-success"]', { timeout: 15000 });
    
    const uploadTime = Date.now() - startTime;
    
    // Measure performance
    const metrics = await measureWebVitals(page);
    const resourceAnalysis = await performanceMonitor.analyzeResourcePerformance();
    
    console.log('File Upload Performance:', {
      uploadTime,
      fileSize: fileContent.length,
      metrics,
      resourceAnalysis
    });
    
    // Performance assertions
    expect(uploadTime).toBeLessThan(10000); // Upload should complete within 10 seconds
    
    // UI should remain responsive during upload
    if (metrics.cls !== undefined) {
      expect(metrics.cls).toBeLessThan(0.2); // Layout should be stable during upload
    }
  });

  test('batch analysis performance', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    await page.goto('/batch-analysis');
    await waitForPageStability(page);
    
    // Mock batch analysis API
    await page.route('**/api/batch-analyze**', async (route) => {
      const batchSize = 10;
      const results = Array(batchSize).fill(null).map((_, i) => ({
        id: `batch-item-${i}`,
        accuracy: 70 + Math.random() * 30,
        riskLevel: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        processingTime: 1000 + Math.random() * 2000
      }));
      
      // Simulate batch processing time
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results })
      });
    });
    
    const startTime = Date.now();
    
    // Start batch analysis
    await page.click('[data-testid="start-batch-analysis"]');
    
    // Wait for batch to complete
    await page.waitForSelector('[data-testid="batch-results"]', { timeout: 30000 });
    
    const batchTime = Date.now() - startTime;
    
    // Measure performance
    const metrics = await measureWebVitals(page);
    const resourceAnalysis = await performanceMonitor.analyzeResourcePerformance();
    
    console.log('Batch Analysis Performance:', {
      batchTime,
      metrics,
      resourceAnalysis
    });
    
    // Performance assertions
    expect(batchTime).toBeLessThan(30000); // Batch should complete within 30 seconds
    expect(batchTime).toBeGreaterThan(3000); // Should take reasonable time for processing
    
    // UI should handle batch processing well
    if (metrics.lcp) {
      expect(metrics.lcp).toBeLessThan(3000);
    }
  });

  test('performance under network throttling', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    // Test with fast 3G conditions
    await setNetworkThrottling(page, 'fast3g');
    
    const startTime = Date.now();
    
    await page.goto('/analyzer');
    await waitForPageStability(page, 20000); // Longer timeout for throttled network
    
    const loadTime = Date.now() - startTime;
    
    // Perform analysis under throttled conditions
    await page.fill('[data-testid="content-textarea"]', 'Test content for throttled analysis');
    
    const analyzeStartTime = Date.now();
    await page.click('[data-testid="analyze-button"]');
    await page.waitForSelector('[data-testid="analysis-results"]', { timeout: 45000 });
    const analyzeTime = Date.now() - analyzeStartTime;
    
    // Measure performance
    const metrics = await measureWebVitals(page);
    const resourceAnalysis = await performanceMonitor.analyzeResourcePerformance();
    
    console.log('Throttled Network Performance:', {
      loadTime,
      analyzeTime,
      metrics,
      resourceAnalysis
    });
    
    // Adjusted expectations for throttled network
    expect(loadTime).toBeLessThan(20000); // Allow more time for throttled loading
    expect(analyzeTime).toBeLessThan(30000); // Analysis should still complete reasonably
    
    // Core functionality should still work
    expect(resourceAnalysis.totalRequests).toBeGreaterThan(0);
  });
});