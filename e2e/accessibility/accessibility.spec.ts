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

    // Set up accessibility testing context
    await page.addInitScript(() => {
      // Add accessibility testing utilities to window
      window.accessibilityTestUtils = {
        getAriaLiveRegions: () => document.querySelectorAll('[aria-live]'),
        getFocusableElements: () => document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        getHeadingStructure: () => {
          const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
          return headings.map(h => ({ level: parseInt(h.tagName[1]), text: h.textContent }));
        }
      };
    });
  });

  test('landing page should pass WCAG AA compliance', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .exclude('#__next') // Exclude Next.js wrapper if present
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('analyzer page should pass WCAG AA compliance', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // The analyzer should be visible on the landing page
    const contentTextarea = page.locator('textarea[placeholder*="Paste your AI-generated content"]');
    await expect(contentTextarea).toBeVisible();
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .exclude('#__next')
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('authentication modal should pass WCAG AA compliance', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Click Sign In to open auth modal
    const signInButton = page.locator('text=Sign In').first();
    if (await signInButton.isVisible()) {
      await signInButton.click();
      await page.waitForTimeout(500); // Wait for modal to appear
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .include('[role="dialog"], .modal, [data-testid*="modal"]') // Focus on modal content
        .analyze();
      
      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });

  test('form elements should have proper labels and descriptions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check main content textarea
    const textarea = page.locator('textarea[placeholder*="Paste your AI-generated content"]');
    await expect(textarea).toBeVisible();
    
    // Check if textarea has proper labeling
    const textareaId = await textarea.getAttribute('id');
    if (textareaId) {
      const label = page.locator(`label[for="${textareaId}"]`);
      await expect(label).toBeVisible();
    }
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['label', 'label-title-only', 'form-field-multiple-labels'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('interactive elements should have accessible names', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['button-name', 'link-name', 'input-button-name'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('images should have alternative text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['image-alt', 'image-redundant-alt'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('color contrast should meet WCAG AA standards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('dark mode should maintain accessibility standards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Toggle to dark mode
    const darkModeToggle = page.locator('[aria-label*="Switch to dark mode"], [title*="Switch to dark mode"]');
    if (await darkModeToggle.isVisible()) {
      await darkModeToggle.click();
      await page.waitForTimeout(500); // Wait for theme transition
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      
      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });

  test('analysis results should be accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Fill in sample content and analyze
    const textarea = page.locator('textarea[placeholder*="Paste your AI-generated content"]');
    await textarea.fill('This is a test content for accessibility analysis.');
    
    const analyzeButton = page.locator('button:has-text("Analyze Content")');
    await analyzeButton.click();
    
    // Wait for results to appear
    await page.waitForSelector('[data-testid="analysis-results"], .analysis-results, [class*="result"]', { timeout: 10000 });
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('navigation should be accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('nav, [role="navigation"], header')
      .withRules(['landmark-one-main', 'landmark-complementary-is-top-level', 'landmark-no-duplicate-banner'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('heading structure should be logical', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['heading-order', 'empty-heading'])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('focus management should be proper', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['focus-order-semantics', 'focusable-content'])
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

  test('accessibility regression detection', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Run comprehensive accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    
    // Store results for regression comparison
    const violationCount = accessibilityScanResults.violations.length;
    const violationTypes = accessibilityScanResults.violations.map(v => v.id);
    
    // Log results for CI/CD tracking
    console.log(`Accessibility scan completed: ${violationCount} violations found`);
    if (violationCount > 0) {
      console.log('Violation types:', violationTypes);
      accessibilityScanResults.violations.forEach(violation => {
        console.log(`- ${violation.id}: ${violation.description}`);
      });
    }
    
    // Fail if any violations are found
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});

// Additional comprehensive accessibility tests using utilities
test.describe('Comprehensive Accessibility Coverage', () => {
  test('keyboard navigation should work properly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Import utilities dynamically
    const { testKeyboardNavigation } = await import('./accessibility-utils');
    await testKeyboardNavigation(page);
  });

  test('all interactive elements should have accessible names', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const { testAccessibleNames } = await import('./accessibility-utils');
    await testAccessibleNames(page);
  });

  test('heading structure should be logical', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const { testHeadingStructure } = await import('./accessibility-utils');
    await testHeadingStructure(page);
  });

  test('ARIA live regions should be properly configured', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Trigger an analysis to create dynamic content
    const textarea = page.locator('textarea[placeholder*="Paste your AI-generated content"]');
    await textarea.fill('Test content for live region testing.');
    
    const analyzeButton = page.locator('button:has-text("Analyze Content")');
    await analyzeButton.click();
    
    const { testAriaLiveRegions } = await import('./accessibility-utils');
    await testAriaLiveRegions(page);
  });

  test('forms should be accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open auth modal if it exists
    const signInButton = page.locator('text=Sign In').first();
    if (await signInButton.isVisible()) {
      await signInButton.click();
      await page.waitForTimeout(500);
    }
    
    const { testFormAccessibility } = await import('./accessibility-utils');
    await testFormAccessibility(page);
  });

  test('should generate comprehensive accessibility report', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const { generateAccessibilityReport } = await import('./accessibility-utils');
    const report = await generateAccessibilityReport(page, 'Landing Page Full Scan');
    
    // Ensure report is generated
    expect(report).toHaveProperty('testName');
    expect(report).toHaveProperty('violations');
    expect(report).toHaveProperty('passes');
    
    // Fail if violations are found
    expect(report.violations).toBe(0);
  });
  });

test.describe('Page-Specific Accessibility Tests', () => {
  test('analyzer component accessibility', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Test the main analyzer component
    const { expectNoAccessibilityViolations } = await import('./accessibility-utils');
    await expectNoAccessibilityViolations(page, {
      include: ['[class*="analyzer"], [data-testid*="analyzer"], textarea, button[class*="analyze"]']
    });
  });

  test('results display accessibility', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Fill and analyze content
    const textarea = page.locator('textarea[placeholder*="Paste your AI-generated content"]');
    await textarea.fill('This is test content with potential accuracy issues and claims that need verification.');
    
    const analyzeButton = page.locator('button:has-text("Analyze Content")');
    await analyzeButton.click();
    
    // Wait for results
    await page.waitForTimeout(3000);
    
    const { expectNoAccessibilityViolations } = await import('./accessibility-utils');
    await expectNoAccessibilityViolations(page, {
      include: ['[class*="result"], [data-testid*="result"], [class*="analysis"]']
    });
  });

  test('navigation accessibility', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const { expectNoAccessibilityViolations } = await import('./accessibility-utils');
    await expectNoAccessibilityViolations(page, {
      include: ['nav, header, [role="navigation"], [class*="nav"]'],
      rules: ['landmark-one-main', 'landmark-complementary-is-top-level', 'region']
    });
  });

  test('footer accessibility', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const { expectNoAccessibilityViolations } = await import('./accessibility-utils');
    await expectNoAccessibilityViolations(page, {
      include: ['footer, [role="contentinfo"], [class*="footer"]']
    });
  });
  });

test.describe('Dynamic Content Accessibility', () => {
  test('loading states should be accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Fill content and start analysis
    const textarea = page.locator('textarea[placeholder*="Paste your AI-generated content"]');
    await textarea.fill('Test content for loading state accessibility.');
    
    const analyzeButton = page.locator('button:has-text("Analyze Content")');
    await analyzeButton.click();
    
    // Check loading state accessibility immediately
    const { expectNoAccessibilityViolations } = await import('./accessibility-utils');
    await expectNoAccessibilityViolations(page, {
      include: ['[class*="loading"], [class*="spinner"], [aria-live]']
    });
  });

  test('error states should be accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Try to analyze empty content to trigger error
    const analyzeButton = page.locator('button:has-text("Analyze Content")');
    await analyzeButton.click();
    
    // Wait for error message
    await page.waitForTimeout(1000);
    
    const { expectNoAccessibilityViolations } = await import('./accessibility-utils');
    await expectNoAccessibilityViolations(page, {
      include: ['[class*="error"], [role="alert"], [aria-live]']
    });
  });

  test('modal dialogs should be accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open auth modal
    const signInButton = page.locator('text=Sign In').first();
    if (await signInButton.isVisible()) {
      await signInButton.click();
      await page.waitForTimeout(500);
      
      const { testModalAccessibility } = await import('./accessibility-utils');
      await testModalAccessibility(page, '[role="dialog"], .modal, [data-testid*="modal"]');
    }
  });
  });

test.describe('Accessibility Regression Prevention', () => {
  test('comprehensive accessibility baseline', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Run the most comprehensive scan possible
    const { runAccessibilityScan } = await import('./accessibility-utils');
    const results = await runAccessibilityScan(page, {
      includeTags: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'],
      rules: [
        'color-contrast',
        'keyboard-navigation',
        'aria-labels',
        'button-name',
        'link-name',
        'image-alt',
        'heading-order',
        'landmark-one-main',
        'focus-order-semantics',
        'label',
        'form-field-multiple-labels'
      ]
    });
    
    // Log detailed results for CI/CD tracking
    console.log('=== ACCESSIBILITY BASELINE RESULTS ===');
    console.log(`Total violations: ${results.violations.length}`);
    console.log(`Total passes: ${results.passes.length}`);
    console.log(`Incomplete tests: ${results.incomplete.length}`);
    console.log(`Inapplicable tests: ${results.inapplicable.length}`);
    
    if (results.violations.length > 0) {
      console.log('\n=== VIOLATIONS DETAILS ===');
      results.violations.forEach((violation, index) => {
        console.log(`${index + 1}. ${violation.id} (${violation.impact})`);
        console.log(`   Description: ${violation.description}`);
        console.log(`   Help: ${violation.help}`);
        console.log(`   Help URL: ${violation.helpUrl}`);
        console.log(`   Affected elements: ${violation.nodes.length}`);
        violation.nodes.forEach((node, nodeIndex) => {
          console.log(`     ${nodeIndex + 1}. ${node.html}`);
        });
        console.log('');
      });
    }
    
    // This test should pass with zero violations
    expect(results.violations).toEqual([]);
  });
});