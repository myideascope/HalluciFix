/**
 * Accessibility Testing Utilities
 * Helper functions for accessibility testing and WCAG compliance validation
 */

import { Page, Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export interface AccessibilityReport {
  violations: any[];
  passes: any[];
  incomplete: any[];
  inapplicable: any[];
  summary: {
    violationCount: number;
    passCount: number;
    incompleteCount: number;
    criticalViolations: any[];
    moderateViolations: any[];
    minorViolations: any[];
  };
}

export interface KeyboardNavigationResult {
  totalElements: number;
  focusableElements: number;
  tabbableElements: number;
  elementsWithFocusIndicator: number;
  issues: Array<{
    element: string;
    issue: string;
    severity: 'critical' | 'moderate' | 'minor';
  }>;
}

export interface ColorContrastResult {
  totalElements: number;
  passedElements: number;
  failedElements: number;
  failures: Array<{
    element: string;
    foreground: string;
    background: string;
    ratio: number;
    required: number;
  }>;
}

export class AccessibilityTester {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Run comprehensive accessibility scan with axe-core
   */
  async runAccessibilityScan(options: {
    tags?: string[];
    rules?: string[];
    include?: string[];
    exclude?: string[];
  } = {}): Promise<AccessibilityReport> {
    const {
      tags = ['wcag2a', 'wcag2aa', 'wcag21aa'],
      rules,
      include,
      exclude
    } = options;

    let builder = new AxeBuilder({ page: this.page }).withTags(tags);

    if (rules) {
      builder = builder.withRules(rules);
    }

    if (include) {
      include.forEach(selector => {
        builder = builder.include(selector);
      });
    }

    if (exclude) {
      exclude.forEach(selector => {
        builder = builder.exclude(selector);
      });
    }

    const results = await builder.analyze();

    // Categorize violations by impact
    const criticalViolations = results.violations.filter(v => v.impact === 'critical');
    const moderateViolations = results.violations.filter(v => v.impact === 'serious');
    const minorViolations = results.violations.filter(v => 
      v.impact === 'moderate' || v.impact === 'minor'
    );

    return {
      violations: results.violations,
      passes: results.passes,
      incomplete: results.incomplete,
      inapplicable: results.inapplicable,
      summary: {
        violationCount: results.violations.length,
        passCount: results.passes.length,
        incompleteCount: results.incomplete.length,
        criticalViolations,
        moderateViolations,
        minorViolations
      }
    };
  }

  /**
   * Test keyboard navigation comprehensively
   */
  async testKeyboardNavigation(): Promise<KeyboardNavigationResult> {
    const issues: Array<{
      element: string;
      issue: string;
      severity: 'critical' | 'moderate' | 'minor';
    }> = [];

    // Get all potentially focusable elements
    const allElements = await this.page.locator(
      'a, button, input, select, textarea, [tabindex], [contenteditable], iframe, object, embed, area[href], summary'
    ).all();

    let focusableElements = 0;
    let tabbableElements = 0;
    let elementsWithFocusIndicator = 0;

    for (const element of allElements) {
      if (!(await element.isVisible())) continue;

      const elementInfo = await this.getElementInfo(element);

      // Test if element is focusable
      try {
        await element.focus();
        const isFocused = await element.evaluate(el => document.activeElement === el);
        
        if (isFocused) {
          focusableElements++;

          // Check if element is tabbable
          const tabIndex = await element.getAttribute('tabindex');
          if (tabIndex !== '-1') {
            tabbableElements++;
          }

          // Check for focus indicator
          const hasFocusIndicator = await this.checkFocusIndicator(element);
          if (hasFocusIndicator) {
            elementsWithFocusIndicator++;
          } else {
            issues.push({
              element: elementInfo,
              issue: 'Missing visible focus indicator',
              severity: 'moderate'
            });
          }

          // Check for accessible name
          const hasAccessibleName = await this.checkAccessibleName(element);
          if (!hasAccessibleName) {
            issues.push({
              element: elementInfo,
              issue: 'Missing accessible name',
              severity: 'critical'
            });
          }
        }
      } catch (error) {
        // Element not focusable
      }
    }

    // Test tab order
    await this.testTabOrder(issues);

    return {
      totalElements: allElements.length,
      focusableElements,
      tabbableElements,
      elementsWithFocusIndicator,
      issues
    };
  }

  /**
   * Test color contrast compliance
   */
  async testColorContrast(): Promise<ColorContrastResult> {
    const results = await this.runAccessibilityScan({
      rules: ['color-contrast']
    });

    const failures: Array<{
      element: string;
      foreground: string;
      background: string;
      ratio: number;
      required: number;
    }> = [];

    results.violations.forEach(violation => {
      violation.nodes.forEach((node: any) => {
        if (node.any && node.any[0] && node.any[0].data) {
          const data = node.any[0].data;
          failures.push({
            element: node.target.join(' '),
            foreground: data.fgColor,
            background: data.bgColor,
            ratio: data.contrastRatio,
            required: data.expectedContrastRatio
          });
        }
      });
    });

    return {
      totalElements: results.passes.length + results.violations.length,
      passedElements: results.passes.length,
      failedElements: results.violations.length,
      failures
    };
  }

  /**
   * Test screen reader compatibility
   */
  async testScreenReaderCompatibility(): Promise<{
    imagesWithoutAlt: number;
    formsWithoutLabels: number;
    headingHierarchyIssues: number;
    landmarkIssues: number;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check images without alt text
    const images = await this.page.locator('img').all();
    let imagesWithoutAlt = 0;

    for (const img of images) {
      const alt = await img.getAttribute('alt');
      const ariaLabel = await img.getAttribute('aria-label');
      const role = await img.getAttribute('role');

      if (!alt && !ariaLabel && role !== 'presentation') {
        imagesWithoutAlt++;
        const src = await img.getAttribute('src');
        issues.push(`Image without alt text: ${src}`);
      }
    }

    // Check form inputs without labels
    const inputs = await this.page.locator('input, select, textarea').all();
    let formsWithoutLabels = 0;

    for (const input of inputs) {
      const type = await input.getAttribute('type');
      if (type === 'hidden') continue;

      const hasLabel = await this.checkAccessibleName(input);
      if (!hasLabel) {
        formsWithoutLabels++;
        const name = await input.getAttribute('name') || 'unnamed';
        issues.push(`Form input without label: ${name}`);
      }
    }

    // Check heading hierarchy
    const headings = await this.page.locator('h1, h2, h3, h4, h5, h6').all();
    let headingHierarchyIssues = 0;

    if (headings.length > 0) {
      const levels: number[] = [];
      for (const heading of headings) {
        const tagName = await heading.evaluate(el => el.tagName);
        levels.push(parseInt(tagName.charAt(1)));
      }

      // Check for proper hierarchy
      if (levels[0] !== 1) {
        headingHierarchyIssues++;
        issues.push('Page should start with h1');
      }

      for (let i = 1; i < levels.length; i++) {
        if (levels[i] > levels[i - 1] + 1) {
          headingHierarchyIssues++;
          issues.push(`Heading hierarchy skip: h${levels[i - 1]} to h${levels[i]}`);
        }
      }
    }

    // Check landmarks
    let landmarkIssues = 0;
    const main = await this.page.locator('main, [role="main"]').count();
    if (main === 0) {
      landmarkIssues++;
      issues.push('Missing main landmark');
    }

    return {
      imagesWithoutAlt,
      formsWithoutLabels,
      headingHierarchyIssues,
      landmarkIssues,
      issues
    };
  }

  /**
   * Test mobile accessibility
   */
  async testMobileAccessibility(): Promise<{
    touchTargetIssues: number;
    zoomIssues: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    let touchTargetIssues = 0;
    let zoomIssues = 0;

    // Test touch target sizes
    const touchTargets = await this.page.locator(
      'button, a, input, select, [role="button"], [onclick]'
    ).all();

    for (const target of touchTargets) {
      if (await target.isVisible()) {
        const box = await target.boundingBox();
        if (box && (box.width < 44 || box.height < 44)) {
          touchTargetIssues++;
          const text = await target.textContent();
          issues.push(`Touch target too small: "${text?.slice(0, 30)}"`);
        }
      }
    }

    // Test zoom compatibility (simplified)
    await this.page.evaluate(() => {
      document.body.style.zoom = '2';
    });

    await this.page.waitForTimeout(1000);

    // Check if content is still accessible at 200% zoom
    const overflowElements = await this.page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      let count = 0;
      elements.forEach(el => {
        const styles = window.getComputedStyle(el);
        if (styles.overflow === 'hidden' && el.scrollWidth > el.clientWidth) {
          count++;
        }
      });
      return count;
    });

    if (overflowElements > 0) {
      zoomIssues = overflowElements;
      issues.push(`${overflowElements} elements have overflow issues at 200% zoom`);
    }

    // Reset zoom
    await this.page.evaluate(() => {
      document.body.style.zoom = '1';
    });

    return {
      touchTargetIssues,
      zoomIssues,
      issues
    };
  }

  /**
   * Generate comprehensive accessibility report
   */
  async generateAccessibilityReport(): Promise<{
    overall: AccessibilityReport;
    keyboard: KeyboardNavigationResult;
    colorContrast: ColorContrastResult;
    screenReader: any;
    mobile: any;
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    recommendations: string[];
  }> {
    const overall = await this.runAccessibilityScan();
    const keyboard = await this.testKeyboardNavigation();
    const colorContrast = await this.testColorContrast();
    const screenReader = await this.testScreenReaderCompatibility();
    const mobile = await this.testMobileAccessibility();

    // Calculate accessibility score (0-100)
    let score = 100;
    
    // Deduct points for violations
    score -= overall.summary.criticalViolations.length * 20;
    score -= overall.summary.moderateViolations.length * 10;
    score -= overall.summary.minorViolations.length * 5;
    
    // Deduct points for keyboard issues
    score -= keyboard.issues.filter(i => i.severity === 'critical').length * 15;
    score -= keyboard.issues.filter(i => i.severity === 'moderate').length * 8;
    
    // Deduct points for other issues
    score -= colorContrast.failedElements * 10;
    score -= screenReader.imagesWithoutAlt * 5;
    score -= screenReader.formsWithoutLabels * 10;
    score -= mobile.touchTargetIssues * 3;

    score = Math.max(0, score);

    // Determine grade
    let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
    if (score >= 95) grade = 'A';
    else if (score >= 85) grade = 'B';
    else if (score >= 75) grade = 'C';
    else if (score >= 65) grade = 'D';

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (overall.summary.criticalViolations.length > 0) {
      recommendations.push('Fix critical accessibility violations immediately');
    }
    
    if (keyboard.issues.length > 0) {
      recommendations.push('Improve keyboard navigation and focus management');
    }
    
    if (colorContrast.failedElements > 0) {
      recommendations.push('Improve color contrast to meet WCAG AA standards');
    }
    
    if (screenReader.formsWithoutLabels > 0) {
      recommendations.push('Add proper labels to all form inputs');
    }
    
    if (mobile.touchTargetIssues > 0) {
      recommendations.push('Increase touch target sizes for mobile accessibility');
    }

    return {
      overall,
      keyboard,
      colorContrast,
      screenReader,
      mobile,
      score: Math.round(score),
      grade,
      recommendations
    };
  }

  /**
   * Helper: Get element information for reporting
   */
  private async getElementInfo(element: Locator): Promise<string> {
    const tagName = await element.evaluate(el => el.tagName);
    const id = await element.getAttribute('id');
    const className = await element.getAttribute('class');
    const text = await element.textContent();

    let info = tagName.toLowerCase();
    if (id) info += `#${id}`;
    if (className) info += `.${className.split(' ')[0]}`;
    if (text) info += ` "${text.slice(0, 20)}"`;

    return info;
  }

  /**
   * Helper: Check if element has visible focus indicator
   */
  private async checkFocusIndicator(element: Locator): Promise<boolean> {
    await element.focus();
    
    const focusStyles = await element.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        outline: styles.outline,
        outlineWidth: styles.outlineWidth,
        outlineStyle: styles.outlineStyle,
        boxShadow: styles.boxShadow,
        borderColor: styles.borderColor
      };
    });

    return (
      (focusStyles.outline !== 'none' && focusStyles.outlineWidth !== '0px') ||
      focusStyles.boxShadow !== 'none' ||
      focusStyles.borderColor !== 'transparent'
    );
  }

  /**
   * Helper: Check if element has accessible name
   */
  private async checkAccessibleName(element: Locator): Promise<boolean> {
    const ariaLabel = await element.getAttribute('aria-label');
    const ariaLabelledby = await element.getAttribute('aria-labelledby');
    const textContent = await element.textContent();
    const title = await element.getAttribute('title');
    
    // Check for associated label
    const id = await element.getAttribute('id');
    let hasLabel = false;
    
    if (id) {
      const label = this.page.locator(`label[for="${id}"]`);
      hasLabel = await label.count() > 0;
    }

    return !!(ariaLabel || ariaLabelledby || (textContent && textContent.trim()) || title || hasLabel);
  }

  /**
   * Helper: Test tab order
   */
  private async testTabOrder(issues: Array<{
    element: string;
    issue: string;
    severity: 'critical' | 'moderate' | 'minor';
  }>): Promise<void> {
    // Reset focus
    await this.page.evaluate(() => {
      if (document.activeElement && 'blur' in document.activeElement) {
        (document.activeElement as HTMLElement).blur();
      }
    });

    const focusedElements: string[] = [];
    let previousElement = '';

    // Tab through elements
    for (let i = 0; i < 10; i++) {
      await this.page.keyboard.press('Tab');
      await this.page.waitForTimeout(100);

      const activeElement = await this.page.evaluate(() => {
        const el = document.activeElement;
        return el ? el.outerHTML.slice(0, 100) : null;
      });

      if (activeElement) {
        if (activeElement === previousElement) {
          issues.push({
            element: activeElement,
            issue: 'Tab navigation stuck on element',
            severity: 'critical'
          });
          break;
        }

        focusedElements.push(activeElement);
        previousElement = activeElement;
      }
    }

    if (focusedElements.length < 3) {
      issues.push({
        element: 'page',
        issue: 'Insufficient tabbable elements found',
        severity: 'moderate'
      });
    }
  }
}

/**
 * Helper function to wait for accessibility-ready state
 */
export async function waitForAccessibilityReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  
  // Wait for any dynamic content to load
  await page.waitForTimeout(1000);
  
  // Ensure all images are loaded
  await page.evaluate(() => {
    const images = Array.from(document.images);
    return Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = img.onerror = resolve;
        });
      })
    );
  });
}

/**
 * Helper function to create accessibility test data
 */
export function createAccessibilityTestData() {
  return {
    validAltTexts: [
      'User profile photo',
      'Chart showing sales increase of 25%',
      'Company logo',
      'Navigation menu icon'
    ],
    invalidAltTexts: [
      'image',
      'photo',
      'picture',
      'img_001.jpg'
    ],
    validLinkTexts: [
      'Read more about accessibility',
      'Download the report (PDF, 2MB)',
      'Contact our support team',
      'View product details'
    ],
    invalidLinkTexts: [
      'click here',
      'read more',
      'link',
      'here'
    ]
  };
}