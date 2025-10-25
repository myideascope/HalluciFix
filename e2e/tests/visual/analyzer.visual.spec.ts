import { test } from '@playwright/test';
import { VisualTestHelper } from '../../utils/visual/visualTesting';

test.describe('Hallucination Analyzer Visual Regression', () => {
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    visualHelper = new VisualTestHelper(page);
    await page.goto('/analyzer');
    await page.waitForSelector('[data-testid="analyzer-container"]');
  });

  test('Analyzer page full screenshot', async ({ page }) => {
    await visualHelper.compareScreenshot('analyzer-full', {
      fullPage: true,
      mask: visualHelper.getMaskSelectors(),
    });
  });

  test('Analyzer responsive layouts', async ({ page }) => {
    const breakpoints = [
      { width: 375, height: 667, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1280, height: 720, name: 'desktop' },
    ];

    await visualHelper.testResponsiveBreakpoints('analyzer', breakpoints);
  });

  test('Content input area', async ({ page }) => {
    await visualHelper.compareElementScreenshot(
      '[data-testid="content-input"]',
      'content-input-area'
    );
  });

  test('Analysis options panel', async ({ page }) => {
    await visualHelper.compareElementScreenshot(
      '[data-testid="analysis-options"]',
      'analysis-options-panel'
    );
  });

  test('Analyze button states', async ({ page }) => {
    await visualHelper.testInteractiveStates(
      '[data-testid="analyze-button"]',
      'analyze-button'
    );
  });

  test('Analysis in progress state', async ({ page }) => {
    // Fill content and start analysis
    await page.fill('[data-testid="content-textarea"]', 'Sample content for analysis');
    
    // Mock API to delay response
    await page.route('**/api/analyze', route => {
      setTimeout(() => route.continue(), 3000);
    });
    
    await page.click('[data-testid="analyze-button"]');
    await page.waitForSelector('[data-testid="analysis-progress"]');
    
    await visualHelper.compareElementScreenshot(
      '[data-testid="analyzer-container"]',
      'analysis-in-progress'
    );
  });

  test('Analysis results display', async ({ page }) => {
    // Mock successful analysis result
    await page.route('**/api/analyze', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accuracy: 85,
          risk_level: 'medium',
          issues: [
            { type: 'factual_error', severity: 'high', description: 'Sample issue' }
          ],
          sources: ['source1.com', 'source2.com']
        })
      });
    });
    
    await page.fill('[data-testid="content-textarea"]', 'Sample content for analysis');
    await page.click('[data-testid="analyze-button"]');
    await page.waitForSelector('[data-testid="analysis-results"]');
    
    await visualHelper.compareElementScreenshot(
      '[data-testid="analysis-results"]',
      'analysis-results-display'
    );
  });

  test('Risk level indicators', async ({ page }) => {
    const riskLevels = ['low', 'medium', 'high', 'critical'];
    
    for (const level of riskLevels) {
      await page.route('**/api/analyze', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            accuracy: level === 'low' ? 95 : level === 'medium' ? 80 : level === 'high' ? 70 : 50,
            risk_level: level,
            issues: [],
            sources: []
          })
        });
      });
      
      await page.fill('[data-testid="content-textarea"]', `Content for ${level} risk`);
      await page.click('[data-testid="analyze-button"]');
      await page.waitForSelector('[data-testid="risk-indicator"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="risk-indicator"]',
        `risk-indicator-${level}`
      );
      
      // Clear for next test
      await page.click('[data-testid="clear-results"]');
    }
  });

  test('Error state display', async ({ page }) => {
    // Mock API error
    await page.route('**/api/analyze', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Analysis failed' })
      });
    });
    
    await page.fill('[data-testid="content-textarea"]', 'Sample content');
    await page.click('[data-testid="analyze-button"]');
    await page.waitForSelector('[data-testid="error-message"]');
    
    await visualHelper.compareElementScreenshot(
      '[data-testid="analyzer-container"]',
      'analysis-error-state'
    );
  });

  test('File upload area', async ({ page }) => {
    await page.click('[data-testid="file-upload-tab"]');
    await page.waitForSelector('[data-testid="file-upload-area"]');
    
    await visualHelper.compareElementScreenshot(
      '[data-testid="file-upload-area"]',
      'file-upload-area'
    );
  });

  test('Batch analysis mode', async ({ page }) => {
    await page.click('[data-testid="batch-mode-toggle"]');
    await page.waitForSelector('[data-testid="batch-analysis-panel"]');
    
    await visualHelper.compareElementScreenshot(
      '[data-testid="batch-analysis-panel"]',
      'batch-analysis-panel'
    );
  });
});