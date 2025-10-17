import { Page, Locator, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility testing utilities for Playwright tests
 */

export interface AccessibilityTestOptions {
  includeTags?: string[];
  excludeTags?: string[];
  rules?: string[];
  include?: string[];
  exclude?: string[];
}

/**
 * Run a comprehensive accessibility scan on a page
 */
export async function runAccessibilityScan(
  page: Page, 
  options: AccessibilityTestOptions = {}
) {
  const {
    includeTags = ['wcag2a', 'wcag2aa', 'wcag21aa'],
    excludeTags = [],
    rules = [],
    include = [],
    exclude = []
  } = options;

  let axeBuilder = new AxeBuilder({ page });

  if (includeTags.length > 0) {
    axeBuilder = axeBuilder.withTags(includeTags);
  }

  if (excludeTags.length > 0) {
    axeBuilder = axeBuilder.disableRules(excludeTags);
  }

  if (rules.length > 0) {
    axeBuilder = axeBuilder.withRules(rules);
  }

  if (include.length > 0) {
    for (const selector of include) {
      axeBuilder = axeBuilder.include(selector);
    }
  }

  if (exclude.length > 0) {
    for (const selector of exclude) {
      axeBuilder = axeBuilder.exclude(selector);
    }
  }

  return await axeBuilder.analyze();
}

/**
 * Assert that a page has no accessibility violations
 */
export async function expectNoAccessibilityViolations(
  page: Page, 
  options: AccessibilityTestOptions = {}
) {
  const results = await runAccessibilityScan(page, options);
  
  if (results.violations.length > 0) {
    console.log('Accessibility violations found:');
    results.violations.forEach(violation => {
      console.log(`- ${violation.id}: ${violation.description}`);
      console.log(`  Help: ${violation.help}`);
      console.log(`  Help URL: ${violation.helpUrl}`);
      violation.nodes.forEach(node => {
        console.log(`  Element: ${node.html}`);
      });
    });
  }
  
  expect(results.violations).toEqual([]);
}

/**
 * Test keyboard navigation for a specific element or page
 */
export async function testKeyboardNavigation(page: Page, startElement?: string) {
  // Get all focusable elements
  const focusableElements = await page.locator(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ).all();

  if (focusableElements.length === 0) {
    console.warn('No focusable elements found on the page');
    return;
  }

  // Start from the first focusable element or specified element
  if (startElement) {
    await page.locator(startElement).focus();
  } else {
    await focusableElements[0].focus();
  }

  // Test Tab navigation
  for (let i = 0; i < Math.min(focusableElements.length, 10); i++) {
    await page.keyboard.press('Tab');
    
    // Verify that focus moved to a focusable element
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  }

  // Test Shift+Tab navigation
  for (let i = 0; i < Math.min(3, focusableElements.length); i++) {
    await page.keyboard.press('Shift+Tab');
    
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  }
}

/**
 * Test that interactive elements have proper accessible names
 */
export async function testAccessibleNames(page: Page) {
  // Test buttons
  const buttons = await page.locator('button').all();
  for (const button of buttons) {
    const accessibleName = await button.getAttribute('aria-label') || 
                          await button.textContent() ||
                          await button.getAttribute('title');
    expect(accessibleName).toBeTruthy();
  }

  // Test links
  const links = await page.locator('a[href]').all();
  for (const link of links) {
    const accessibleName = await link.getAttribute('aria-label') || 
                          await link.textContent() ||
                          await link.getAttribute('title');
    expect(accessibleName).toBeTruthy();
  }

  // Test form inputs
  const inputs = await page.locator('input, textarea, select').all();
  for (const input of inputs) {
    const id = await input.getAttribute('id');
    const ariaLabel = await input.getAttribute('aria-label');
    const ariaLabelledBy = await input.getAttribute('aria-labelledby');
    
    if (id) {
      const label = page.locator(`label[for="${id}"]`);
      const hasLabel = await label.count() > 0;
      expect(hasLabel || ariaLabel || ariaLabelledBy).toBeTruthy();
    } else {
      expect(ariaLabel || ariaLabelledBy).toBeTruthy();
    }
  }
}

/**
 * Test heading structure for logical hierarchy
 */
export async function testHeadingStructure(page: Page) {
  const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
  
  if (headings.length === 0) {
    console.warn('No headings found on the page');
    return;
  }

  const headingLevels: number[] = [];
  
  for (const heading of headings) {
    const tagName = await heading.evaluate(el => el.tagName.toLowerCase());
    const level = parseInt(tagName[1]);
    headingLevels.push(level);
  }

  // Check that we start with h1
  expect(headingLevels[0]).toBe(1);

  // Check that heading levels don't skip (e.g., h1 -> h3)
  for (let i = 1; i < headingLevels.length; i++) {
    const currentLevel = headingLevels[i];
    const previousLevel = headingLevels[i - 1];
    
    // Allow same level, one level down, or any level up
    const isValidProgression = currentLevel <= previousLevel + 1;
    expect(isValidProgression).toBeTruthy();
  }
}

/**
 * Test ARIA live regions for dynamic content
 */
export async function testAriaLiveRegions(page: Page) {
  const liveRegions = await page.locator('[aria-live]').all();
  
  for (const region of liveRegions) {
    const ariaLive = await region.getAttribute('aria-live');
    expect(['polite', 'assertive', 'off']).toContain(ariaLive);
    
    // Check that live regions have accessible names if they contain important content
    const hasContent = await region.textContent();
    if (hasContent && hasContent.trim().length > 0) {
      const accessibleName = await region.getAttribute('aria-label') ||
                            await region.getAttribute('aria-labelledby');
      // This is a recommendation, not a strict requirement
      if (!accessibleName) {
        console.warn('Live region without accessible name:', await region.innerHTML());
      }
    }
  }
}

/**
 * Test color contrast programmatically (basic check)
 */
export async function testColorContrast(page: Page) {
  // This is a basic implementation - axe-core does more comprehensive testing
  const textElements = await page.locator('p, span, div, h1, h2, h3, h4, h5, h6, a, button, label').all();
  
  for (const element of textElements.slice(0, 10)) { // Test first 10 elements
    const styles = await element.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontSize: computed.fontSize
      };
    });
    
    // Basic check - ensure text has color and background is not the same
    expect(styles.color).not.toBe(styles.backgroundColor);
  }
}

/**
 * Test form accessibility
 */
export async function testFormAccessibility(page: Page) {
  const forms = await page.locator('form').all();
  
  for (const form of forms) {
    // Check for form labels
    const inputs = await form.locator('input, textarea, select').all();
    
    for (const input of inputs) {
      const type = await input.getAttribute('type');
      
      // Skip hidden inputs
      if (type === 'hidden') continue;
      
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      
      if (id) {
        const label = form.locator(`label[for="${id}"]`);
        const hasLabel = await label.count() > 0;
        expect(hasLabel || ariaLabel || ariaLabelledBy).toBeTruthy();
      } else {
        expect(ariaLabel || ariaLabelledBy).toBeTruthy();
      }
    }
    
    // Check for fieldsets with legends for grouped inputs
    const fieldsets = await form.locator('fieldset').all();
    for (const fieldset of fieldsets) {
      const legend = fieldset.locator('legend');
      const hasLegend = await legend.count() > 0;
      expect(hasLegend).toBeTruthy();
    }
  }
}

/**
 * Test modal/dialog accessibility
 */
export async function testModalAccessibility(page: Page, modalSelector: string) {
  const modal = page.locator(modalSelector);
  await expect(modal).toBeVisible();
  
  // Check for proper ARIA attributes
  const role = await modal.getAttribute('role');
  expect(role).toBe('dialog');
  
  const ariaModal = await modal.getAttribute('aria-modal');
  expect(ariaModal).toBe('true');
  
  const ariaLabel = await modal.getAttribute('aria-label');
  const ariaLabelledBy = await modal.getAttribute('aria-labelledby');
  expect(ariaLabel || ariaLabelledBy).toBeTruthy();
  
  // Check focus management
  const focusedElement = page.locator(':focus');
  const isInsideModal = await focusedElement.evaluate((el, modalEl) => {
    return modalEl.contains(el);
  }, await modal.elementHandle());
  
  expect(isInsideModal).toBeTruthy();
}

/**
 * Generate accessibility report
 */
export async function generateAccessibilityReport(
  page: Page, 
  testName: string,
  options: AccessibilityTestOptions = {}
) {
  const results = await runAccessibilityScan(page, options);
  
  const report = {
    testName,
    timestamp: new Date().toISOString(),
    url: page.url(),
    violations: results.violations.length,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length,
    violationDetails: results.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.length
    }))
  };
  
  console.log(`Accessibility Report for ${testName}:`, JSON.stringify(report, null, 2));
  
  return report;
}