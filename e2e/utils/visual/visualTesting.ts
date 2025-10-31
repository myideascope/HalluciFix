import { Page, expect } from '@playwright/test';

export interface VisualTestOptions {
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
  mask?: Array<{ selector: string }>;
  threshold?: number;
  maxDiffPixels?: number;
  animations?: 'disabled' | 'allow';
}

export class VisualTestHelper {
  constructor(private page: Page) {}

  /**
   * Wait for page to be fully loaded and stable for visual testing
   */
  async waitForStableState(): Promise<void> {
    // Wait for network to be idle
    await this.page.waitForLoadState('networkidle');
    
    // Wait for any animations to complete
    await this.page.waitForTimeout(500);
    
    // Wait for fonts to load
    await this.page.evaluate(() => document.fonts.ready);
    
    // Hide dynamic elements that change between runs
    await this.hideDynamicElements();
  }

  /**
   * Hide elements that contain dynamic content (timestamps, random IDs, etc.)
   */
  private async hideDynamicElements(): Promise<void> {
    await this.page.addStyleTag({
      content: `
        /* Hide elements with dynamic content */
        [data-testid*="timestamp"],
        [data-testid*="date"],
        .timestamp,
        .date-time,
        .loading-spinner,
        .skeleton-loader {
          visibility: hidden !important;
        }
        
        /* Disable animations for consistent screenshots */
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `
    });
  }

  /**
   * Take a visual screenshot and compare with baseline
   */
  async compareScreenshot(
    name: string, 
    options: VisualTestOptions = {}
  ): Promise<void> {
    await this.waitForStableState();
    
    const screenshotOptions = {
      fullPage: options.fullPage ?? true,
      clip: options.clip,
      mask: options.mask?.map(m => this.page.locator(m.selector)),
      animations: options.animations ?? 'disabled',
      threshold: options.threshold ?? 0.2,
      maxDiffPixels: options.maxDiffPixels ?? 1000,
    };

    await expect(this.page).toHaveScreenshot(`${name}.png`, screenshotOptions);
  }

  /**
   * Compare a specific element screenshot
   */
  async compareElementScreenshot(
    selector: string,
    name: string,
    options: VisualTestOptions = {}
  ): Promise<void> {
    await this.waitForStableState();
    
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'visible' });
    
    const screenshotOptions = {
      threshold: options.threshold ?? 0.2,
      maxDiffPixels: options.maxDiffPixels ?? 500,
      animations: options.animations ?? 'disabled',
    };

    await expect(element).toHaveScreenshot(`${name}.png`, screenshotOptions);
  }

  /**
   * Test responsive breakpoints
   */
  async testResponsiveBreakpoints(
    name: string,
    breakpoints: Array<{ width: number; height: number; name: string }>
  ): Promise<void> {
    for (const breakpoint of breakpoints) {
      await this.page.setViewportSize({ 
        width: breakpoint.width, 
        height: breakpoint.height 
      });
      
      await this.waitForStableState();
      await this.compareScreenshot(`${name}-${breakpoint.name}`);
    }
  }

  /**
   * Test theme variations (light/dark mode)
   */
  async testThemeVariations(name: string): Promise<void> {
    // Test light theme
    await this.page.emulateMedia({ colorScheme: 'light' });
    await this.waitForStableState();
    await this.compareScreenshot(`${name}-light`);

    // Test dark theme
    await this.page.emulateMedia({ colorScheme: 'dark' });
    await this.waitForStableState();
    await this.compareScreenshot(`${name}-dark`);
  }

  /**
   * Test interactive states (hover, focus, active)
   */
  async testInteractiveStates(
    selector: string,
    name: string
  ): Promise<void> {
    const element = this.page.locator(selector);
    
    // Normal state
    await this.compareElementScreenshot(selector, `${name}-normal`);
    
    // Hover state
    await element.hover();
    await this.page.waitForTimeout(100);
    await this.compareElementScreenshot(selector, `${name}-hover`);
    
    // Focus state
    await element.focus();
    await this.page.waitForTimeout(100);
    await this.compareElementScreenshot(selector, `${name}-focus`);
    
    // Reset state
    await this.page.mouse.move(0, 0);
    await this.page.keyboard.press('Escape');
  }

  /**
   * Mask dynamic content areas
   */
  getMaskSelectors(): Array<{ selector: string }> {
    return [
      { selector: '[data-testid="timestamp"]' },
      { selector: '[data-testid="loading"]' },
      { selector: '.loading-spinner' },
      { selector: '.skeleton-loader' },
      { selector: '[data-testid="random-id"]' },
      { selector: '.toast-notification' },
    ];
  }
}

/**
 * Common responsive breakpoints for testing
 */
export const RESPONSIVE_BREAKPOINTS = [
  { width: 320, height: 568, name: 'mobile-small' },
  { width: 375, height: 667, name: 'mobile-medium' },
  { width: 414, height: 896, name: 'mobile-large' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 1024, height: 768, name: 'tablet-landscape' },
  { width: 1280, height: 720, name: 'desktop-small' },
  { width: 1920, height: 1080, name: 'desktop-large' },
];

/**
 * Common visual test options
 */
export const VISUAL_TEST_OPTIONS = {
  strict: {
    threshold: 0.1,
    maxDiffPixels: 100,
  },
  moderate: {
    threshold: 0.2,
    maxDiffPixels: 1000,
  },
  relaxed: {
    threshold: 0.3,
    maxDiffPixels: 2000,
  },
};