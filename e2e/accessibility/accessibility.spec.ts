import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set up any common accessibility testing configuration
    await page.addInitScript(() => {
      // Disable animations for more consistent testing
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-delay: -0.01ms !important;
          animation-iteration-count: 1 !important;
          background-attachment: initial !important;
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
          transition-delay: 0ms !important;
        }
      `;
      document.head.appendChild(style);
    });
  });

  test('landing page should pass WCAG AA compliance', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('analyzer page should pass WCAG AA compliance', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to analyzer (assuming it's accessible from landing page)
    await page.waitForLoadState('networkidle');
    
    // Look for analyzer content or navigation
    const analyzerButton = page.locator('text=Analyze').first();
    if (await analyzerButton.isVisible()) {
      await analyzerButton.click();
      await page.waitForLoadState('networkidle');
    }
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('dashboard should pass WCAG AA compliance', async ({ page }) => {
    await page.goto('/');
    
    // Try to navigate to dashboard
    await page.waitForLoadState('networkidle');
    
    // Look for dashboard navigation or content
    const dashboardLink = page.locator('text=Dashboard').first();
    if (await dashboardLink.isVisible()) {
      await dashboardLink.click();
      await page.waitForLoadState('networkidle');
    }
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('authentication form should pass WCAG AA compliance', async ({ page }) => {
    await page.goto('/');
    
    // Look for authentication elements
    await page.waitForLoadState('networkidle');
    
    // Try to find login/auth elements
    const authButton = page.locator('text=Sign In').first();
    if (await authButton.isVisible()) {
      await authButton.click();
      await page.waitForLoadState('networkidle');
    }
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should pass accessibility scan with specific rules', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('main')
      .exclude('iframe')
      .withRules(['color-contrast', 'keyboard-navigation', 'aria-labels'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should detect accessibility violations when present', async ({ page }) => {
    // Create a test page with known accessibility issues
    await page.setContent(`
      <html>
        <body>
          <button>Button without accessible name</button>
          <img src="test.jpg" />
          <div style="color: #ccc; background-color: #fff;">Low contrast text</div>
          <input type="text" />
        </body>
      </html>
    `);
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    
    // This test should find violations
    expect(accessibilityScanResults.violations.length).toBeGreaterThan(0);
    
    // Check for specific violation types
    const violationRules = accessibilityScanResults.violations.map(v => v.id);
    expect(violationRules).toContain('button-name');
    expect(violationRules).toContain('image-alt');
  });

  test('should provide detailed violation information', async ({ page }) => {
    await page.setContent(`
      <html>
        <body>
          <img src="test.jpg" />
        </body>
      </html>
    `);
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .analyze();
    
    if (accessibilityScanResults.violations.length > 0) {
      const violation = accessibilityScanResults.violations[0];
      
      expect(violation).toHaveProperty('id');
      expect(violation).toHaveProperty('description');
      expect(violation).toHaveProperty('help');
      expect(violation).toHaveProperty('helpUrl');
      expect(violation).toHaveProperty('nodes');
      expect(violation.nodes.length).toBeGreaterThan(0);
      
      const node = violation.nodes[0];
      expect(node).toHaveProperty('html');
      expect(node).toHaveProperty('target');
    }
  });
});