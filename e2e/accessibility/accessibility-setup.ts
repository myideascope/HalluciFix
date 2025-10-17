/**
 * Accessibility testing setup and utilities
 * This file contains setup functions and configurations for accessibility testing
 */

import { Page } from '@playwright/test';

/**
 * Global setup for accessibility testing
 */
export async function setupAccessibilityTesting() {
  console.log('🔧 Setting up accessibility testing environment...');
  
  // Set environment variables for accessibility testing
  process.env.ACCESSIBILITY_TESTING = 'true';
  process.env.FORCE_COLOR = '1'; // Ensure colored output in CI
  
  console.log('✅ Accessibility testing environment ready');
}

/**
 * Configure page for accessibility testing
 */
export async function configurePageForAccessibility(page: Page) {
  // Disable animations for consistent testing
  await page.addInitScript(() => {
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

  // Add accessibility testing utilities to the page
  await page.addInitScript(() => {
    // Add global accessibility testing utilities
    (window as any).accessibilityTestUtils = {
      // Get all focusable elements
      getFocusableElements: () => {
        return Array.from(document.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ));
      },
      
      // Get heading structure
      getHeadingStructure: () => {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        return headings.map(h => ({
          level: parseInt(h.tagName[1]),
          text: h.textContent?.trim() || '',
          element: h
        }));
      },
      
      // Get ARIA live regions
      getAriaLiveRegions: () => {
        return Array.from(document.querySelectorAll('[aria-live]'));
      },
      
      // Get form elements and their labels
      getFormElementsWithLabels: () => {
        const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
        return inputs.map(input => {
          const id = input.getAttribute('id');
          const ariaLabel = input.getAttribute('aria-label');
          const ariaLabelledBy = input.getAttribute('aria-labelledby');
          
          let associatedLabel = null;
          if (id) {
            associatedLabel = document.querySelector(`label[for="${id}"]`);
          }
          
          return {
            element: input,
            id,
            ariaLabel,
            ariaLabelledBy,
            associatedLabel,
            hasAccessibleName: !!(ariaLabel || ariaLabelledBy || associatedLabel)
          };
        });
      },
      
      // Check color contrast (basic implementation)
      checkColorContrast: (element: Element) => {
        const styles = window.getComputedStyle(element);
        return {
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight
        };
      },
      
      // Get landmark elements
      getLandmarks: () => {
        return Array.from(document.querySelectorAll(
          'main, nav, aside, header, footer, section, [role="main"], [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"], [role="region"]'
        ));
      }
    };
  });

  // Set up console logging for accessibility issues
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('accessibility')) {
      console.error('Accessibility Error:', msg.text());
    }
  });

  // Set up page error handling
  page.on('pageerror', error => {
    if (error.message.includes('accessibility')) {
      console.error('Page Accessibility Error:', error.message);
    }
  });
}

/**
 * Wait for page to be ready for accessibility testing
 */
export async function waitForAccessibilityReady(page: Page) {
  // Wait for network to be idle
  await page.waitForLoadState('networkidle');
  
  // Wait for any dynamic content to load
  await page.waitForTimeout(500);
  
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
 * Common accessibility test patterns
 */
export const AccessibilityPatterns = {
  // WCAG 2.1 AA compliance tags
  WCAG_AA: ['wcag2a', 'wcag2aa', 'wcag21aa'],
  
  // Best practice tags
  BEST_PRACTICE: ['best-practice'],
  
  // Critical accessibility rules
  CRITICAL_RULES: [
    'color-contrast',
    'keyboard-navigation',
    'button-name',
    'link-name',
    'image-alt',
    'label',
    'heading-order',
    'landmark-one-main'
  ],
  
  // Form-specific rules
  FORM_RULES: [
    'label',
    'form-field-multiple-labels',
    'label-title-only',
    'input-button-name'
  ],
  
  // Navigation-specific rules
  NAVIGATION_RULES: [
    'landmark-one-main',
    'landmark-complementary-is-top-level',
    'landmark-no-duplicate-banner',
    'region'
  ],
  
  // Content-specific rules
  CONTENT_RULES: [
    'heading-order',
    'empty-heading',
    'image-alt',
    'image-redundant-alt',
    'link-name'
  ]
};

/**
 * Accessibility test configurations for different scenarios
 */
export const AccessibilityConfigs = {
  // Full comprehensive scan
  COMPREHENSIVE: {
    includeTags: [...AccessibilityPatterns.WCAG_AA, ...AccessibilityPatterns.BEST_PRACTICE],
    rules: AccessibilityPatterns.CRITICAL_RULES
  },
  
  // Quick scan for critical issues
  CRITICAL_ONLY: {
    includeTags: AccessibilityPatterns.WCAG_AA,
    rules: AccessibilityPatterns.CRITICAL_RULES
  },
  
  // Form-focused testing
  FORMS: {
    includeTags: AccessibilityPatterns.WCAG_AA,
    rules: AccessibilityPatterns.FORM_RULES,
    include: ['form', 'input', 'textarea', 'select', 'button[type="submit"]', 'fieldset']
  },
  
  // Navigation-focused testing
  NAVIGATION: {
    includeTags: AccessibilityPatterns.WCAG_AA,
    rules: AccessibilityPatterns.NAVIGATION_RULES,
    include: ['nav', 'header', 'footer', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]']
  },
  
  // Content-focused testing
  CONTENT: {
    includeTags: AccessibilityPatterns.WCAG_AA,
    rules: AccessibilityPatterns.CONTENT_RULES,
    include: ['main', '[role="main"]', 'article', 'section']
  }
};

/**
 * Generate accessibility test report
 */
export function generateAccessibilityTestReport(results: any, testName: string) {
  const report = {
    testName,
    timestamp: new Date().toISOString(),
    summary: {
      violations: results.violations.length,
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      inapplicable: results.inapplicable.length
    },
    violations: results.violations.map((violation: any) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      tags: violation.tags,
      nodes: violation.nodes.length,
      nodeDetails: violation.nodes.map((node: any) => ({
        html: node.html,
        target: node.target,
        failureSummary: node.failureSummary
      }))
    }))
  };
  
  // Log summary
  console.log(`\n=== Accessibility Test Report: ${testName} ===`);
  console.log(`Violations: ${report.summary.violations}`);
  console.log(`Passes: ${report.summary.passes}`);
  console.log(`Incomplete: ${report.summary.incomplete}`);
  console.log(`Inapplicable: ${report.summary.inapplicable}`);
  
  if (report.violations.length > 0) {
    console.log('\n=== Violation Details ===');
    report.violations.forEach((violation, index) => {
      console.log(`${index + 1}. ${violation.id} (${violation.impact})`);
      console.log(`   ${violation.description}`);
      console.log(`   Help: ${violation.helpUrl}`);
      console.log(`   Affected elements: ${violation.nodes}`);
    });
  }
  
  return report;
}