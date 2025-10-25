import { test } from '@playwright/test';
import { VisualTestHelper } from '../../utils/visual/visualTesting';

test.describe('UI Components Visual Regression', () => {
  let visualHelper: VisualTestHelper;

  test.beforeEach(async ({ page }) => {
    visualHelper = new VisualTestHelper(page);
  });

  test.describe('Form Components', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth');
    });

    test('Login form visual test', async ({ page }) => {
      await visualHelper.compareElementScreenshot(
        '[data-testid="login-form"]',
        'login-form'
      );
    });

    test('Registration form visual test', async ({ page }) => {
      await page.click('[data-testid="register-tab"]');
      await page.waitForSelector('[data-testid="register-form"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="register-form"]',
        'registration-form'
      );
    });

    test('Form validation states', async ({ page }) => {
      // Test invalid state
      await page.fill('[data-testid="email-input"]', 'invalid-email');
      await page.click('[data-testid="login-button"]');
      await page.waitForSelector('[data-testid="email-error"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="login-form"]',
        'form-validation-error'
      );
    });

    test('Form input states', async ({ page }) => {
      const inputSelector = '[data-testid="email-input"]';
      
      await visualHelper.testInteractiveStates(inputSelector, 'form-input');
    });
  });

  test.describe('Button Components', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
    });

    test('Primary button variants', async ({ page }) => {
      const buttons = [
        { selector: '[data-testid="cta-primary"]', name: 'primary' },
        { selector: '[data-testid="cta-secondary"]', name: 'secondary' },
      ];

      for (const button of buttons) {
        await visualHelper.testInteractiveStates(
          button.selector,
          `button-${button.name}`
        );
      }
    });

    test('Button loading state', async ({ page }) => {
      await page.goto('/analyzer');
      
      // Mock delayed API response
      await page.route('**/api/analyze', route => {
        setTimeout(() => route.continue(), 2000);
      });
      
      await page.fill('[data-testid="content-textarea"]', 'Test content');
      await page.click('[data-testid="analyze-button"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="analyze-button"]',
        'button-loading-state'
      );
    });

    test('Disabled button state', async ({ page }) => {
      await page.goto('/analyzer');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="analyze-button"]',
        'button-disabled-state'
      );
    });
  });

  test.describe('Toast Notifications', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard');
    });

    test('Success toast notification', async ({ page }) => {
      // Trigger success toast
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { type: 'success', message: 'Operation completed successfully!' }
        }));
      });
      
      await page.waitForSelector('[data-testid="toast-success"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="toast-success"]',
        'toast-success'
      );
    });

    test('Error toast notification', async ({ page }) => {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { type: 'error', message: 'An error occurred!' }
        }));
      });
      
      await page.waitForSelector('[data-testid="toast-error"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="toast-error"]',
        'toast-error'
      );
    });

    test('Warning toast notification', async ({ page }) => {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: { type: 'warning', message: 'Please check your input!' }
        }));
      });
      
      await page.waitForSelector('[data-testid="toast-warning"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="toast-warning"]',
        'toast-warning'
      );
    });
  });

  test.describe('Modal Components', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard');
    });

    test('Settings modal', async ({ page }) => {
      await page.click('[data-testid="settings-button"]');
      await page.waitForSelector('[data-testid="settings-modal"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="settings-modal"]',
        'settings-modal'
      );
    });

    test('Confirmation dialog', async ({ page }) => {
      await page.click('[data-testid="delete-analysis"]');
      await page.waitForSelector('[data-testid="confirmation-dialog"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="confirmation-dialog"]',
        'confirmation-dialog'
      );
    });
  });

  test.describe('Data Display Components', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/analytics');
    });

    test('Analytics charts', async ({ page }) => {
      await page.waitForSelector('[data-testid="analytics-chart"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="analytics-chart"]',
        'analytics-chart'
      );
    });

    test('Data table', async ({ page }) => {
      await page.waitForSelector('[data-testid="analyses-table"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="analyses-table"]',
        'data-table'
      );
    });

    test('Pagination controls', async ({ page }) => {
      await page.waitForSelector('[data-testid="pagination"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="pagination"]',
        'pagination-controls'
      );
    });
  });

  test.describe('Loading States', () => {
    test('Skeleton loaders', async ({ page }) => {
      await page.goto('/dashboard');
      
      // Intercept API calls to show loading state
      await page.route('**/api/**', route => {
        setTimeout(() => route.continue(), 2000);
      });
      
      await page.reload();
      await page.waitForSelector('[data-testid="skeleton-loader"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="skeleton-loader"]',
        'skeleton-loader'
      );
    });

    test('Spinner loading', async ({ page }) => {
      await page.goto('/analyzer');
      
      await page.route('**/api/analyze', route => {
        setTimeout(() => route.continue(), 2000);
      });
      
      await page.fill('[data-testid="content-textarea"]', 'Test');
      await page.click('[data-testid="analyze-button"]');
      await page.waitForSelector('[data-testid="loading-spinner"]');
      
      await visualHelper.compareElementScreenshot(
        '[data-testid="loading-spinner"]',
        'loading-spinner'
      );
    });
  });
});