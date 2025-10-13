import { test, expect } from '@playwright/test';
import { measureWebVitals, waitForPageStability } from './utils/web-vitals';
import { PerformanceMonitor } from './utils/performance-monitor';

test.describe('Component Performance Tests', () => {
  let performanceMonitor: PerformanceMonitor;

  test.beforeEach(async ({ page }) => {
    performanceMonitor = new PerformanceMonitor(page);
  });

  test('analyzer component rendering performance', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    await page.goto('/analyzer');
    await waitForPageStability(page);
    
    // Measure initial render performance
    const initialMetrics = await measureWebVitals(page);
    
    // Test textarea performance with large content
    const largeText = 'A'.repeat(10000);
    
    const inputStartTime = Date.now();
    await page.fill('[data-testid="content-textarea"]', largeText);
    const inputEndTime = Date.now();
    
    const inputTime = inputEndTime - inputStartTime;
    
    // Test component responsiveness
    const scrollStartTime = Date.now();
    await page.evaluate(() => {
      const textarea = document.querySelector('[data-testid="content-textarea"]') as HTMLTextAreaElement;
      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    });
    const scrollEndTime = Date.now();
    
    const scrollTime = scrollEndTime - scrollStartTime;
    
    console.log('Analyzer Component Performance:', {
      initialMetrics,
      inputTime,
      scrollTime,
      textLength: largeText.length
    });
    
    // Performance assertions
    expect(inputTime).toBeLessThan(1000); // Text input should be fast
    expect(scrollTime).toBeLessThan(100); // Scrolling should be smooth
    
    if (initialMetrics.fcp) {
      expect(initialMetrics.fcp).toBeLessThan(2000);
    }
  });

  test('results viewer component performance', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    // Mock analysis results with large dataset
    await page.route('**/api/analyze**', async (route) => {
      const mockResults = {
        accuracy: 85.7,
        riskLevel: 'medium',
        hallucinations: Array(50).fill(null).map((_, i) => ({
          id: `hallucination-${i}`,
          text: `Suspicious claim ${i}: This represents a potential hallucination that needs verification.`,
          confidence: 0.7 + Math.random() * 0.3,
          category: ['factual', 'statistical', 'temporal'][Math.floor(Math.random() * 3)],
          severity: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
        })),
        verificationSources: Array(20).fill(null).map((_, i) => ({
          id: `source-${i}`,
          url: `https://example.com/source-${i}`,
          title: `Verification Source ${i}`,
          relevance: Math.random(),
          credibility: 0.8 + Math.random() * 0.2
        })),
        processingTime: 3500
      };
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResults)
      });
    });
    
    await page.goto('/analyzer');
    await waitForPageStability(page);
    
    // Trigger analysis
    await page.fill('[data-testid="content-textarea"]', 'Test content for results performance');
    
    const analysisStartTime = Date.now();
    await page.click('[data-testid="analyze-button"]');
    
    // Wait for results to render
    await page.waitForSelector('[data-testid="analysis-results"]');
    const resultsRenderTime = Date.now() - analysisStartTime;
    
    // Test scrolling performance through results
    const scrollStartTime = Date.now();
    await page.evaluate(() => {
      const resultsContainer = document.querySelector('[data-testid="analysis-results"]');
      if (resultsContainer) {
        resultsContainer.scrollIntoView({ behavior: 'smooth' });
      }
    });
    
    // Test expanding/collapsing hallucination details
    const expandStartTime = Date.now();
    await page.click('[data-testid="hallucination-0"] [data-testid="expand-button"]');
    await page.waitForSelector('[data-testid="hallucination-0-details"]');
    const expandTime = Date.now() - expandStartTime;
    
    // Measure final performance
    const finalMetrics = await measureWebVitals(page);
    
    console.log('Results Viewer Performance:', {
      resultsRenderTime,
      expandTime,
      finalMetrics
    });
    
    // Performance assertions
    expect(resultsRenderTime).toBeLessThan(5000); // Results should render quickly
    expect(expandTime).toBeLessThan(500); // UI interactions should be responsive
    
    if (finalMetrics.cls !== undefined) {
      expect(finalMetrics.cls).toBeLessThan(0.15); // Layout should be stable
    }
  });

  test('dashboard analytics component performance', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    // Mock analytics data
    await page.route('**/api/analytics**', async (route) => {
      const mockAnalytics = {
        totalAnalyses: 50000,
        averageAccuracy: 87.3,
        riskDistribution: {
          low: 32500,
          medium: 12500,
          high: 4000,
          critical: 1000
        },
        timeSeriesData: Array(365).fill(null).map((_, i) => ({
          date: new Date(Date.now() - i * 86400000).toISOString(),
          analyses: Math.floor(Math.random() * 200) + 50,
          averageAccuracy: 80 + Math.random() * 20
        })),
        topHallucinations: Array(100).fill(null).map((_, i) => ({
          text: `Common hallucination pattern ${i}`,
          frequency: Math.floor(Math.random() * 1000) + 100,
          category: ['factual', 'statistical', 'temporal'][Math.floor(Math.random() * 3)]
        }))
      };
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAnalytics)
      });
    });
    
    const loadStartTime = Date.now();
    
    await page.goto('/dashboard');
    await waitForPageStability(page);
    
    // Wait for charts to render
    await page.waitForSelector('[data-testid="analytics-chart"]');
    const chartRenderTime = Date.now() - loadStartTime;
    
    // Test chart interaction performance
    const interactionStartTime = Date.now();
    
    // Hover over chart elements
    await page.hover('[data-testid="analytics-chart"] svg');
    await page.waitForSelector('[data-testid="chart-tooltip"]', { timeout: 2000 });
    
    // Change time range
    await page.click('[data-testid="time-range-selector"]');
    await page.click('[data-testid="time-range-30d"]');
    await page.waitForSelector('[data-testid="analytics-chart"]'); // Wait for re-render
    
    const interactionTime = Date.now() - interactionStartTime;
    
    // Measure performance
    const metrics = await measureWebVitals(page);
    const resourceAnalysis = await performanceMonitor.analyzeResourcePerformance();
    
    console.log('Dashboard Analytics Performance:', {
      chartRenderTime,
      interactionTime,
      metrics,
      resourceAnalysis
    });
    
    // Performance assertions
    expect(chartRenderTime).toBeLessThan(8000); // Charts should render within 8 seconds
    expect(interactionTime).toBeLessThan(3000); // Interactions should be responsive
    
    if (metrics.lcp) {
      expect(metrics.lcp).toBeLessThan(4000); // LCP should be reasonable for data-heavy page
    }
  });

  test('batch analysis component performance', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    await page.goto('/batch-analysis');
    await waitForPageStability(page);
    
    // Test adding multiple files to batch
    const addFilesStartTime = Date.now();
    
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="add-file-button"]');
      await page.fill(`[data-testid="file-input-${i}"]`, `File content ${i}`);
    }
    
    const addFilesTime = Date.now() - addFilesStartTime;
    
    // Test batch processing UI updates
    await page.route('**/api/batch-analyze**', async (route) => {
      // Simulate progressive updates
      const results = Array(10).fill(null).map((_, i) => ({
        id: `file-${i}`,
        status: 'completed',
        accuracy: 70 + Math.random() * 30,
        processingTime: 1000 + Math.random() * 2000
      }));
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results })
      });
    });
    
    const processStartTime = Date.now();
    await page.click('[data-testid="start-batch-button"]');
    
    // Wait for progress updates
    await page.waitForSelector('[data-testid="batch-progress"]');
    await page.waitForSelector('[data-testid="batch-complete"]', { timeout: 30000 });
    
    const processTime = Date.now() - processStartTime;
    
    // Measure performance
    const metrics = await measureWebVitals(page);
    
    console.log('Batch Analysis Component Performance:', {
      addFilesTime,
      processTime,
      metrics
    });
    
    // Performance assertions
    expect(addFilesTime).toBeLessThan(5000); // Adding files should be fast
    expect(processTime).toBeLessThan(25000); // Batch processing UI should be responsive
    
    if (metrics.cls !== undefined) {
      expect(metrics.cls).toBeLessThan(0.2); // Layout should be stable during updates
    }
  });

  test('settings component performance', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    await page.goto('/settings');
    await waitForPageStability(page);
    
    // Test form interaction performance
    const formStartTime = Date.now();
    
    // Toggle multiple settings
    await page.click('[data-testid="dark-mode-toggle"]');
    await page.click('[data-testid="notifications-toggle"]');
    await page.click('[data-testid="auto-save-toggle"]');
    
    // Change dropdown selections
    await page.selectOption('[data-testid="language-select"]', 'es');
    await page.selectOption('[data-testid="timezone-select"]', 'America/New_York');
    
    // Update text inputs
    await page.fill('[data-testid="api-key-input"]', 'test-api-key-12345');
    await page.fill('[data-testid="webhook-url-input"]', 'https://example.com/webhook');
    
    const formTime = Date.now() - formStartTime;
    
    // Test save performance
    const saveStartTime = Date.now();
    await page.click('[data-testid="save-settings-button"]');
    await page.waitForSelector('[data-testid="save-success-message"]');
    const saveTime = Date.now() - saveStartTime;
    
    // Measure performance
    const metrics = await measureWebVitals(page);
    
    console.log('Settings Component Performance:', {
      formTime,
      saveTime,
      metrics
    });
    
    // Performance assertions
    expect(formTime).toBeLessThan(2000); // Form interactions should be fast
    expect(saveTime).toBeLessThan(3000); // Save operation should be quick
    
    if (metrics.fid) {
      expect(metrics.fid).toBeLessThan(100); // Input delay should be minimal
    }
  });

  test('memory usage during component lifecycle', async ({ page }) => {
    await performanceMonitor.startMonitoring();
    
    // Navigate through different components and measure memory
    const memorySnapshots: Array<{ component: string; memory?: any }> = [];
    
    // Landing page
    await page.goto('/');
    await waitForPageStability(page);
    let memory = await performanceMonitor.getMemoryUsage();
    memorySnapshots.push({ component: 'landing', memory });
    
    // Analyzer
    await page.goto('/analyzer');
    await waitForPageStability(page);
    memory = await performanceMonitor.getMemoryUsage();
    memorySnapshots.push({ component: 'analyzer', memory });
    
    // Dashboard
    await page.goto('/dashboard');
    await waitForPageStability(page);
    memory = await performanceMonitor.getMemoryUsage();
    memorySnapshots.push({ component: 'dashboard', memory });
    
    // Batch analysis
    await page.goto('/batch-analysis');
    await waitForPageStability(page);
    memory = await performanceMonitor.getMemoryUsage();
    memorySnapshots.push({ component: 'batch-analysis', memory });
    
    // Back to analyzer (test cleanup)
    await page.goto('/analyzer');
    await waitForPageStability(page);
    memory = await performanceMonitor.getMemoryUsage();
    memorySnapshots.push({ component: 'analyzer-return', memory });
    
    console.log('Memory Usage Snapshots:', memorySnapshots);
    
    // Memory usage assertions
    memorySnapshots.forEach((snapshot, index) => {
      if (snapshot.memory) {
        // Memory usage should be reasonable (less than 100MB)
        expect(snapshot.memory.usedJSHeapSize).toBeLessThan(100 * 1024 * 1024);
        
        // Memory should not grow excessively between components
        if (index > 0 && memorySnapshots[index - 1].memory) {
          const previousMemory = memorySnapshots[index - 1].memory!.usedJSHeapSize;
          const currentMemory = snapshot.memory.usedJSHeapSize;
          const memoryGrowth = currentMemory - previousMemory;
          
          // Memory growth should be reasonable (less than 50MB per component)
          expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
        }
      }
    });
  });
});