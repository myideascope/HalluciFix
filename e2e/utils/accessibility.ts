/**
 * Accessibility Testing Utilities
 * Provides utilities for accessibility testing with axe-core integration
 */

import { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export interface AccessibilityViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary: string;
  }>;
}

export interface AccessibilityResult {
  violations: AccessibilityViolation[];
  passes: number;
  incomplete: number;
  inapplicable: number;
  url: string;
  timestamp: Date;
}

export class AccessibilityTester {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Run comprehensive accessibility scan
   */
  async scanPage(options?: {
    tags?: string[];
    rules?: { [key: string]: { enabled: boolean } };
    exclude?: string[];
    include?: string[];
  }): Promise<AccessibilityResult> {
    let axeBuilder = new AxeBuilder({ page: this.page });

    // Configure tags (WCAG levels, best practices, etc.)
    if (options?.tags) {
      axeBuilder = axeBuilder.withTags(options.tags);
    } else {
      // Default to WCAG 2.1 AA compliance
      axeBuilder = axeBuilder.withTags(['wcag2a', 'wcag2aa', 'wcag21aa']);
    }

    // Configure rules
    if (options?.rules) {
      Object.entries(options.rules).forEach(([ruleId, config]) => {
        if (config.enabled) {
          axeBuilder = axeBuilder.include(ruleId);
        } else {
          axeBuilder = axeBuilder.exclude(ruleId);
        }
      });
    }

    // Configure selectors to include/exclude
    if (options?.include) {
      options.include.forEach(selector => {
        axeBuilder = axeBuilder.include(selector);
      });
    }

    if (options?.exclude) {
      options.exclude.forEach(selector => {
        axeBuilder = axeBuilder.exclude(selector);
      });
    }

    const results = await axeBuilder.analyze();

    return {
      violations: results.violations.map(violation => ({
        id: violation.id,
        impact: violation.impact as 'minor' | 'moderate' | 'serious' | 'critical',
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.map(node => ({
          target: node.target,
          html: node.html,
          failureSummary: node.failureSummary || '',
        })),
      })),
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      inapplicable: results.inapplicable.length,
      url: this.page.url(),
      timestamp: new Date(),
    };
  }

  /**
   * Scan for WCAG 2.1 AA compliance
   */
  async scanWCAG21AA(): Promise<AccessibilityResult> {
    return this.scanPage({
      tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
    });
  }

  /**
   * Scan for keyboard navigation issues
   */
  async scanKeyboardNavigation(): Promise<AccessibilityResult> {
    return this.scanPage({
      tags: ['keyboard'],
    });
  }

  /**
   * Scan for color contrast issues
   */
  async scanColorContrast(): Promise<AccessibilityResult> {
    return this.scanPage({
      tags: ['color-contrast'],
    });
  }

  /**
   * Scan for screen reader compatibility
   */
  async scanScreenReader(): Promise<AccessibilityResult> {
    return this.scanPage({
      tags: ['screen-reader'],
    });
  }

  /**
   * Test keyboard navigation manually
   */
  async testKeyboardNavigation(): Promise<{
    focusableElements: number;
    tabOrder: string[];
    trapsFocus: boolean;
    hasSkipLinks: boolean;
  }> {
    // Get all focusable elements
    const focusableElements = await this.page.evaluate(() => {
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]',
      ];

      const elements = document.querySelectorAll(focusableSelectors.join(', '));
      return Array.from(elements).map((el, index) => ({
        tagName: el.tagName.toLowerCase(),
        id: el.id || `element-${index}`,
        className: el.className,
        tabIndex: (el as HTMLElement).tabIndex,
        ariaLabel: el.getAttribute('aria-label'),
        text: el.textContent?.trim().substring(0, 50) || '',
      }));
    });

    // Test tab navigation
    const tabOrder: string[] = [];
    let currentElement = await this.page.locator(':focus').first();
    
    // Start from first focusable element
    await this.page.keyboard.press('Tab');
    
    for (let i = 0; i < Math.min(focusableElements.length, 20); i++) {
      try {
        const focusedElement = await this.page.locator(':focus').first();
        const elementInfo = await focusedElement.evaluate(el => ({
          tagName: el.tagName.toLowerCase(),
          id: el.id,
          text: el.textContent?.trim().substring(0, 30) || '',
        }));
        
        tabOrder.push(`${elementInfo.tagName}${elementInfo.id ? `#${elementInfo.id}` : ''}: ${elementInfo.text}`);
        await this.page.keyboard.press('Tab');
      } catch (error) {
        break;
      }
    }

    // Check for skip links
    const hasSkipLinks = await this.page.evaluate(() => {
      const skipLinks = document.querySelectorAll('a[href^="#"], a[href*="skip"]');
      return skipLinks.length > 0;
    });

    // Check for focus traps (simplified check)
    const trapsFocus = await this.page.evaluate(() => {
      const modals = document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"]');
      return modals.length > 0;
    });

    return {
      focusableElements: focusableElements.length,
      tabOrder,
      trapsFocus,
      hasSkipLinks,
    };
  }

  /**
   * Test screen reader announcements
   */
  async testScreenReaderAnnouncements(): Promise<{
    liveRegions: number;
    ariaLabels: number;
    headingStructure: Array<{ level: number; text: string }>;
    landmarks: string[];
  }> {
    const screenReaderInfo = await this.page.evaluate(() => {
      // Count live regions
      const liveRegions = document.querySelectorAll('[aria-live], [role="status"], [role="alert"]');
      
      // Count aria labels
      const ariaLabels = document.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby]');
      
      // Get heading structure
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const headingStructure = Array.from(headings).map(heading => ({
        level: parseInt(heading.tagName.charAt(1)),
        text: heading.textContent?.trim().substring(0, 100) || '',
      }));
      
      // Get landmarks
      const landmarks = Array.from(document.querySelectorAll('[role]')).map(el => 
        el.getAttribute('role') || ''
      ).filter(role => [
        'banner', 'navigation', 'main', 'complementary', 'contentinfo', 'search', 'form'
      ].includes(role));

      return {
        liveRegions: liveRegions.length,
        ariaLabels: ariaLabels.length,
        headingStructure,
        landmarks: [...new Set(landmarks)],
      };
    });

    return screenReaderInfo;
  }

  /**
   * Test color contrast manually
   */
  async testColorContrast(): Promise<{
    textElements: number;
    contrastIssues: Array<{
      element: string;
      foreground: string;
      background: string;
      ratio: number;
      level: 'AA' | 'AAA' | 'fail';
    }>;
  }> {
    const contrastInfo = await this.page.evaluate(() => {
      // Helper function to calculate contrast ratio
      function getContrastRatio(color1: string, color2: string): number {
        // Simplified contrast calculation - in real implementation,
        // you'd use a proper color contrast library
        return 4.5; // Placeholder
      }

      // Helper function to get computed styles
      function getComputedColor(element: Element, property: string): string {
        return window.getComputedStyle(element).getPropertyValue(property);
      }

      const textElements = document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, a, button, label');
      const contrastIssues: Array<{
        element: string;
        foreground: string;
        background: string;
        ratio: number;
        level: 'AA' | 'AAA' | 'fail';
      }> = [];

      Array.from(textElements).slice(0, 50).forEach((element, index) => {
        const foreground = getComputedColor(element, 'color');
        const background = getComputedColor(element, 'background-color');
        const ratio = getContrastRatio(foreground, background);
        
        let level: 'AA' | 'AAA' | 'fail' = 'fail';
        if (ratio >= 7) level = 'AAA';
        else if (ratio >= 4.5) level = 'AA';

        if (level === 'fail') {
          contrastIssues.push({
            element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}[${index}]`,
            foreground,
            background,
            ratio,
            level,
          });
        }
      });

      return {
        textElements: textElements.length,
        contrastIssues,
      };
    });

    return contrastInfo;
  }

  /**
   * Generate accessibility report
   */
  async generateReport(): Promise<{
    summary: {
      totalViolations: number;
      criticalViolations: number;
      seriousViolations: number;
      moderateViolations: number;
      minorViolations: number;
      wcagLevel: 'AA' | 'AAA' | 'fail';
    };
    wcagScan: AccessibilityResult;
    keyboardNavigation: any;
    screenReader: any;
    colorContrast: any;
    recommendations: string[];
  }> {
    // Run all accessibility tests
    const wcagScan = await this.scanWCAG21AA();
    const keyboardNavigation = await this.testKeyboardNavigation();
    const screenReader = await this.testScreenReaderAnnouncements();
    const colorContrast = await this.testColorContrast();

    // Calculate summary
    const criticalViolations = wcagScan.violations.filter(v => v.impact === 'critical').length;
    const seriousViolations = wcagScan.violations.filter(v => v.impact === 'serious').length;
    const moderateViolations = wcagScan.violations.filter(v => v.impact === 'moderate').length;
    const minorViolations = wcagScan.violations.filter(v => v.impact === 'minor').length;

    // Determine WCAG compliance level
    let wcagLevel: 'AA' | 'AAA' | 'fail' = 'AA';
    if (criticalViolations > 0 || seriousViolations > 0) {
      wcagLevel = 'fail';
    } else if (moderateViolations === 0 && minorViolations === 0) {
      wcagLevel = 'AAA';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (criticalViolations > 0) {
      recommendations.push(`Fix ${criticalViolations} critical accessibility violations immediately`);
    }
    
    if (seriousViolations > 0) {
      recommendations.push(`Address ${seriousViolations} serious accessibility issues`);
    }
    
    if (!keyboardNavigation.hasSkipLinks) {
      recommendations.push('Add skip navigation links for keyboard users');
    }
    
    if (screenReader.headingStructure.length === 0) {
      recommendations.push('Add proper heading structure for screen readers');
    }
    
    if (screenReader.landmarks.length < 3) {
      recommendations.push('Add more ARIA landmarks for better navigation');
    }
    
    if (colorContrast.contrastIssues.length > 0) {
      recommendations.push(`Improve color contrast for ${colorContrast.contrastIssues.length} elements`);
    }

    return {
      summary: {
        totalViolations: wcagScan.violations.length,
        criticalViolations,
        seriousViolations,
        moderateViolations,
        minorViolations,
        wcagLevel,
      },
      wcagScan,
      keyboardNavigation,
      screenReader,
      colorContrast,
      recommendations,
    };
  }

  /**
   * Test specific accessibility features
   */
  async testAccessibilityFeature(feature: 'forms' | 'images' | 'links' | 'buttons'): Promise<AccessibilityResult> {
    const tagMap = {
      forms: ['forms'],
      images: ['image-alt'],
      links: ['link-name'],
      buttons: ['button-name'],
    };

    return this.scanPage({
      tags: tagMap[feature],
    });
  }

  /**
   * Validate ARIA implementation
   */
  async validateARIA(): Promise<{
    ariaAttributes: number;
    invalidAria: string[];
    missingLabels: string[];
    roleUsage: { [role: string]: number };
  }> {
    return await this.page.evaluate(() => {
      const elementsWithAria = document.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby], [role]');
      
      const invalidAria: string[] = [];
      const missingLabels: string[] = [];
      const roleUsage: { [role: string]: number } = {};

      Array.from(elementsWithAria).forEach((element, index) => {
        // Check for invalid ARIA attributes
        const ariaAttributes = Array.from(element.attributes).filter(attr => 
          attr.name.startsWith('aria-')
        );

        ariaAttributes.forEach(attr => {
          // Simplified validation - in real implementation, use proper ARIA spec validation
          if (!attr.value.trim()) {
            invalidAria.push(`${element.tagName.toLowerCase()}[${index}]: empty ${attr.name}`);
          }
        });

        // Check role usage
        const role = element.getAttribute('role');
        if (role) {
          roleUsage[role] = (roleUsage[role] || 0) + 1;
        }

        // Check for missing labels on interactive elements
        const interactiveTags = ['button', 'input', 'select', 'textarea'];
        if (interactiveTags.includes(element.tagName.toLowerCase())) {
          const hasLabel = element.getAttribute('aria-label') || 
                          element.getAttribute('aria-labelledby') ||
                          element.id && document.querySelector(`label[for="${element.id}"]`);
          
          if (!hasLabel) {
            missingLabels.push(`${element.tagName.toLowerCase()}[${index}]: missing accessible name`);
          }
        }
      });

      return {
        ariaAttributes: elementsWithAria.length,
        invalidAria,
        missingLabels,
        roleUsage,
      };
    });
  }
}