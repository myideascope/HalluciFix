import { test } from '@playwright/test';
import { VisualTestHelper, RESPONSIVE_BREAKPOINTS } from '../../utils/visual/visualTesting';

test.describe('Landing Page Visual Regression', () => {
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    visualHelper = new VisualTestHelper(page);
    await page.goto('/');
  });

  test('Landing page full page screenshot - desktop', async ({ page }) => {
    await visualHelper.compareScreenshot('landing-page-desktop', {
      fullPage: true,
      mask: visualHelper.getMaskSelectors(),
    });
  });

  test('Landing page responsive breakpoints', async ({ page }) => {
    const breakpoints = [
      { width: 320, height: 568, name: 'mobile' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 1920, height: 1080, name: 'desktop' },
    ];

    await visualHelper.testResponsiveBreakpoints('landing-page', breakpoints);
  });

  test('Landing page theme variations', async ({ page }) => {
    await visualHelper.testThemeVariations('landing-page');
  });

  test('Hero section visual test', async ({ page }) => {
    await visualHelper.compareElementScreenshot(
      '[data-testid="hero-section"]',
      'hero-section'
    );
  });

  test('Features section visual test', async ({ page }) => {
    await visualHelper.compareElementScreenshot(
      '[data-testid="features-section"]',
      'features-section'
    );
  });

  test('CTA buttons interactive states', async ({ page }) => {
    await visualHelper.testInteractiveStates(
      '[data-testid="cta-primary"]',
      'cta-primary-button'
    );
    
    await visualHelper.testInteractiveStates(
      '[data-testid="cta-secondary"]',
      'cta-secondary-button'
    );
  });

  test('Navigation header visual test', async ({ page }) => {
    await visualHelper.compareElementScreenshot(
      'header',
      'navigation-header'
    );
  });

  test('Footer visual test', async ({ page }) => {
    await visualHelper.compareElementScreenshot(
      'footer',
      'footer-section'
    );
  });

  test('Mobile navigation menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Open mobile menu
    await page.click('[data-testid="mobile-menu-toggle"]');
    await page.waitForTimeout(300); // Wait for animation
    
    await visualHelper.compareElementScreenshot(
      '[data-testid="mobile-menu"]',
      'mobile-navigation-menu'
    );
  });
});