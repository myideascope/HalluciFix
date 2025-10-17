import { Page, expect } from '@playwright/test';

/**
 * Utility functions for visual regression testing
 */

export interface VisualTestOptions {
  fullPage?: boolean;
  animations?: 'disabled' | 'allow';
  threshold?: number;
  maxDiffPixels?: number;
  clip?: { x: number; y: number; width: number; height: number };
}

/**
 * Prepare page for consistent visual testing
 */
export async function preparePageForVisualTest(page: Page) {
  // Disable animations
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      
      /* Hide scrollbars for consistent screenshots */
      ::-webkit-scrollbar {
        display: none;
      }
      
      /* Ensure consistent font rendering */
      * {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
    `
  });
  
  // Set consistent theme
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.remove('dark');
  });
  
  // Wait for fonts to load
  await page.waitForFunction(() => document.fonts.ready);
  
  // Wait for images to load
  await page.waitForLoadState('networkidle');
}

/**
 * Hide dynamic content that changes between test runs
 */
export async function hideDynamicContent(page: Page) {
  await page.evaluate(() => {
    // Hide timestamps
    const timestamps = document.querySelectorAll('[data-testid*="timestamp"], .timestamp, [class*="timestamp"]');
    timestamps.forEach(el => {
      (el as HTMLElement).style.visibility = 'hidden';
    });
    
    // Hide counters that might change
    const counters = document.querySelectorAll('[data-testid*="count"], .count, [class*="count"]');
    counters.forEach(el => {
      const text = el.textContent;
      if (text && /\d+/.test(text)) {
        (el as HTMLElement).style.visibility = 'hidden';
      }
    });
    
    // Hide any elements marked as dynamic
    const dynamicElements = document.querySelectorAll('[data-dynamic="true"], [data-visual-ignore="true"]');
    dynamicElements.forEach(el => {
      (el as HTMLElement).style.visibility = 'hidden';
    });
  });
}

/**
 * Mock consistent data for visual testing
 */
export async function mockConsistentData(page: Page) {
  await page.evaluate(() => {
    // Mock user data
    const mockUser = {
      id: 'visual-test-user',
      email: 'visual@test.com',
      name: 'Visual Test User',
      role: 'user'
    };
    localStorage.setItem('auth-user', JSON.stringify(mockUser));
    
    // Mock analytics data
    const mockAnalytics = {
      totalAnalyses: 1247,
      averageAccuracy: 87.3,
      totalHallucinations: 156,
      recentAnalyses: [
        {
          id: '1',
          content: 'Sample analysis 1',
          accuracy: 85.5,
          riskLevel: 'medium',
          timestamp: '2024-01-15T10:30:00Z'
        },
        {
          id: '2',
          content: 'Sample analysis 2',
          accuracy: 92.1,
          riskLevel: 'low',
          timestamp: '2024-01-15T09:15:00Z'
        }
      ]
    };
    localStorage.setItem('mock-analytics', JSON.stringify(mockAnalytics));
  });
}

/**
 * Take a screenshot with consistent settings
 */
export async function takeConsistentScreenshot(
  page: Page, 
  name: string, 
  options: VisualTestOptions = {}
) {
  const defaultOptions: VisualTestOptions = {
    fullPage: true,
    animations: 'disabled',
    threshold: 0.2,
    maxDiffPixels: 1000
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  await preparePageForVisualTest(page);
  await hideDynamicContent(page);
  
  return expect(page).toHaveScreenshot(name, mergedOptions);
}

/**
 * Compare element screenshot with baseline
 */
export async function compareElementScreenshot(
  page: Page,
  selector: string,
  name: string,
  options: VisualTestOptions = {}
) {
  const element = page.locator(selector);
  await element.waitFor({ state: 'visible' });
  
  await preparePageForVisualTest(page);
  await hideDynamicContent(page);
  
  const defaultOptions: VisualTestOptions = {
    animations: 'disabled',
    threshold: 0.2,
    maxDiffPixels: 500
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  return expect(element).toHaveScreenshot(name, mergedOptions);
}

/**
 * Test responsive design across multiple viewports
 */
export async function testResponsiveDesign(
  page: Page,
  url: string,
  baseName: string,
  viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 720 }
  ]
) {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    
    await takeConsistentScreenshot(page, `${baseName}-${viewport.name}.png`);
  }
}

/**
 * Test theme variations
 */
export async function testThemeVariations(
  page: Page,
  url: string,
  baseName: string,
  themes = ['light', 'dark']
) {
  for (const theme of themes) {
    await page.evaluate((themeName) => {
      localStorage.setItem('theme', themeName);
      document.documentElement.classList.toggle('dark', themeName === 'dark');
    }, theme);
    
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    
    await takeConsistentScreenshot(page, `${baseName}-${theme}.png`);
  }
}

/**
 * Generate baseline screenshots for all critical pages
 */
export async function generateBaselines(page: Page) {
  const criticalPages = [
    { url: '/', name: 'landing' },
    { url: '/analyzer', name: 'analyzer' },
    { url: '/dashboard', name: 'dashboard' },
    { url: '/analytics', name: 'analytics' },
    { url: '/settings', name: 'settings' }
  ];
  
  for (const pageInfo of criticalPages) {
    try {
      await page.goto(pageInfo.url);
      await page.waitForLoadState('networkidle');
      await takeConsistentScreenshot(page, `baseline-${pageInfo.name}.png`);
      console.log(`Generated baseline for ${pageInfo.name}`);
    } catch (error) {
      console.warn(`Failed to generate baseline for ${pageInfo.name}:`, error);
    }
  }
}

/**
 * Approve visual changes by updating baselines
 */
export async function approveVisualChanges(testName: string) {
  // This would typically integrate with your CI/CD system
  // to move failed screenshots to become new baselines
  console.log(`Approving visual changes for test: ${testName}`);
  
  // In a real implementation, this might:
  // 1. Move test-results/visual-diff/*.png to test-results/visual-baseline/
  // 2. Update version control with new baselines
  // 3. Notify team of approved changes
}

/**
 * Generate visual diff report
 */
export async function generateVisualDiffReport(testResults: any[]) {
  const report = {
    timestamp: new Date().toISOString(),
    totalTests: testResults.length,
    passed: testResults.filter(r => r.status === 'passed').length,
    failed: testResults.filter(r => r.status === 'failed').length,
    results: testResults
  };
  
  return report;
}