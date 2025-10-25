import { test } from '@playwright/test';
import { VisualTestHelper } from '../../utils/visual/visualTesting';

test.describe('Dashboard Visual Regression', () => {
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    visualHelper = new VisualTestHelper(page);
    
    // Mock authentication and navigate to dashboard
    await page.goto('/dashboard');
    
    // Wait for dashboard to load
    await page.waitForSelector('[data-testid="dashboard-container"]');
  });

  test('Dashboard full page screenshot', async ({ page }) => {
    await visualHelper.compareScreenshot('dashboard-full', {
      fullPage: true,
      mask: [
        ...visualHelper.getMaskSelectors(),
        { selector: '[data-testid="last-updated"]' },
        { selector: '[data-testid="user-avatar"]' },
      ],
    });
  });

  test('Dashboard responsive layouts', async ({ page }) => {
    const breakpoints = [
      { width: 375, height: 667, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1280, height: 720, name: 'desktop' },
    ];

    await visualHelper.testResponsiveBreakpoints('dashboard', breakpoints);
  });

  test('Dashboard theme variations', async ({ page }) => {
    await visualHelper.testThemeVariations('dashboard');
  });

  test('Analytics cards visual test', async ({ page }) => {
    await visualHelper.compareElementScreenshot(
      '[data-testid="analytics-cards"]',
      'analytics-cards'
    );
  });

  test('Recent analyses section', async ({ page }) => {
    await visualHelper.compareElementScreenshot(
      '[data-testid="recent-analyses"]',
      'recent-analyses-section'
    );
  });

  test('Quick actions panel', async ({ page }) => {
    await visualHelper.compareElementScreenshot(
      '[data-testid="quick-actions"]',
      'quick-actions-panel'
    );
  });

  test('Navigation sidebar', async ({ page }) => {
    await visualHelper.compareElementScreenshot(
      '[data-testid="sidebar"]',
      'navigation-sidebar'
    );
  });

  test('User profile dropdown', async ({ page }) => {
    // Open user profile dropdown
    await page.click('[data-testid="user-profile-trigger"]');
    await page.waitForTimeout(200);
    
    await visualHelper.compareElementScreenshot(
      '[data-testid="user-profile-dropdown"]',
      'user-profile-dropdown'
    );
  });

  test('Empty state visual test', async ({ page }) => {
    // Navigate to a page with empty state
    await page.goto('/dashboard?empty=true');
    await page.waitForSelector('[data-testid="empty-state"]');
    
    await visualHelper.compareElementScreenshot(
      '[data-testid="empty-state"]',
      'dashboard-empty-state'
    );
  });

  test('Loading state visual test', async ({ page }) => {
    // Intercept API calls to simulate loading
    await page.route('**/api/**', route => {
      // Delay response to capture loading state
      setTimeout(() => route.continue(), 2000);
    });
    
    await page.reload();
    await page.waitForSelector('[data-testid="loading-skeleton"]');
    
    await visualHelper.compareElementScreenshot(
      '[data-testid="dashboard-container"]',
      'dashboard-loading-state'
    );
  });
});