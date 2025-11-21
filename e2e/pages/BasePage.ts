/**
 * Base Page Object Model
 * Provides common utilities and methods for all page objects
 */

import { Page, Locator, expect } from '@playwright/test';

import { logger } from './logging';
export abstract class BasePage {
  protected page: Page;
  protected baseUrl: string;

  constructor(page: Page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'http://localhost:5173';
  }

  /**
   * Navigate to the page
   */
  abstract goto(): Promise<void>;

  /**
   * Wait for the page to be loaded
   */
  abstract waitForLoad(): Promise<void>;

  /**
   * Get the page title
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Get the current URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Wait for an element to be visible
   */
  async waitForElement(selector: string, timeout: number = 10000): Promise<Locator> {
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'visible', timeout });
    return element;
  }

  /**
   * Wait for an element to be hidden
   */
  async waitForElementToBeHidden(selector: string, timeout: number = 10000): Promise<void> {
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'hidden', timeout });
  }

  /**
   * Click an element with retry logic
   */
  async clickElement(selector: string, options?: { timeout?: number; force?: boolean }): Promise<void> {
    const element = this.page.locator(selector);
    await element.click(options);
  }

  /**
   * Fill input field with text
   */
  async fillInput(selector: string, text: string): Promise<void> {
    const input = this.page.locator(selector);
    await input.fill(text);
  }

  /**
   * Clear and fill input field
   */
  async clearAndFill(selector: string, text: string): Promise<void> {
    const input = this.page.locator(selector);
    await input.clear();
    await input.fill(text);
  }

  /**
   * Select option from dropdown
   */
  async selectOption(selector: string, value: string): Promise<void> {
    const select = this.page.locator(selector);
    await select.selectOption(value);
  }

  /**
   * Upload file to input
   */
  async uploadFile(selector: string, filePath: string): Promise<void> {
    const fileInput = this.page.locator(selector);
    await fileInput.setInputFiles(filePath);
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(url?: string, timeout: number = 30000): Promise<void> {
    if (url) {
      await this.page.waitForURL(url, { timeout });
    } else {
      await this.page.waitForLoadState('networkidle', { timeout });
    }
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ 
      path: `e2e/screenshots/${name}-${Date.now()}.png`,
      fullPage: true 
    });
  }

  /**
   * Scroll element into view
   */
  async scrollIntoView(selector: string): Promise<void> {
    const element = this.page.locator(selector);
    await element.scrollIntoViewIfNeeded();
  }

  /**
   * Wait for API response
   */
  async waitForApiResponse(urlPattern: string | RegExp, timeout: number = 30000): Promise<any> {
    const response = await this.page.waitForResponse(
      response => {
        const url = response.url();
        if (typeof urlPattern === 'string') {
          return url.includes(urlPattern);
        }
        return urlPattern.test(url);
      },
      { timeout }
    );
    return response.json();
  }

  /**
   * Mock API response
   */
  async mockApiResponse(urlPattern: string | RegExp, responseData: any, status: number = 200): Promise<void> {
    await this.page.route(urlPattern, route => {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      });
    });
  }

  /**
   * Wait for loading spinner to disappear
   */
  async waitForLoadingToComplete(): Promise<void> {
    // Wait for common loading indicators to disappear
    const loadingSelectors = [
      '[data-testid="loading"]',
      '.loading',
      '.spinner',
      '[aria-label="Loading"]',
    ];

    for (const selector of loadingSelectors) {
      try {
        await this.page.waitForSelector(selector, { state: 'hidden', timeout: 1000 });
      } catch {
        // Selector not found, which is fine
      }
    }
  }

  /**
   * Check if element exists
   */
  async elementExists(selector: string): Promise<boolean> {
    try {
      await this.page.locator(selector).waitFor({ state: 'attached', timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get element text content
   */
  async getElementText(selector: string): Promise<string> {
    const element = this.page.locator(selector);
    return await element.textContent() || '';
  }

  /**
   * Get element attribute value
   */
  async getElementAttribute(selector: string, attribute: string): Promise<string | null> {
    const element = this.page.locator(selector);
    return await element.getAttribute(attribute);
  }

  /**
   * Check if element is visible
   */
  async isElementVisible(selector: string): Promise<boolean> {
    const element = this.page.locator(selector);
    return await element.isVisible();
  }

  /**
   * Check if element is enabled
   */
  async isElementEnabled(selector: string): Promise<boolean> {
    const element = this.page.locator(selector);
    return await element.isEnabled();
  }

  /**
   * Wait for text to appear in element
   */
  async waitForText(selector: string, text: string, timeout: number = 10000): Promise<void> {
    const element = this.page.locator(selector);
    await expect(element).toContainText(text, { timeout });
  }

  /**
   * Hover over element
   */
  async hoverElement(selector: string): Promise<void> {
    const element = this.page.locator(selector);
    await element.hover();
  }

  /**
   * Double click element
   */
  async doubleClickElement(selector: string): Promise<void> {
    const element = this.page.locator(selector);
    await element.dblclick();
  }

  /**
   * Right click element
   */
  async rightClickElement(selector: string): Promise<void> {
    const element = this.page.locator(selector);
    await element.click({ button: 'right' });
  }

  /**
   * Press key
   */
  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  /**
   * Type text with delay
   */
  async typeText(text: string, delay: number = 100): Promise<void> {
    await this.page.keyboard.type(text, { delay });
  }

  /**
   * Handle dialog (alert, confirm, prompt)
   */
  async handleDialog(accept: boolean = true, promptText?: string): Promise<void> {
    this.page.on('dialog', async dialog => {
      if (dialog.type() === 'prompt' && promptText) {
        await dialog.accept(promptText);
      } else if (accept) {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });
  }

  /**
   * Wait for download to start
   */
  async waitForDownload(): Promise<any> {
    const downloadPromise = this.page.waitForEvent('download');
    return downloadPromise;
  }

  /**
   * Get page performance metrics
   */
  async getPerformanceMetrics(): Promise<any> {
    return await this.page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
      };
    });
  }

  /**
   * Check accessibility violations
   */
  async checkAccessibility(): Promise<void> {
    // This would integrate with axe-core for accessibility testing
    // Implementation depends on @axe-core/playwright package
    logger.debug("Accessibility check placeholder - implement with @axe-core/playwright");
  }

  /**
   * Wait for network to be idle
   */
  async waitForNetworkIdle(timeout: number = 30000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  /**
   * Reload page
   */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForLoad();
  }

  /**
   * Go back in browser history
   */
  async goBack(): Promise<void> {
    await this.page.goBack();
    await this.waitForLoad();
  }

  /**
   * Go forward in browser history
   */
  async goForward(): Promise<void> {
    await this.page.goForward();
    await this.waitForLoad();
  }

  /**
   * Set viewport size
   */
  async setViewportSize(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
  }

  /**
   * Get console logs
   */
  getConsoleLogs(): string[] {
    const logs: string[] = [];
    this.page.on('console', msg => {
      logs.push(`${msg.type()}: ${msg.text()}`);
    });
    return logs;
  }

  /**
   * Get network requests
   */
  getNetworkRequests(): string[] {
    const requests: string[] = [];
    this.page.on('request', request => {
      requests.push(`${request.method()} ${request.url()}`);
    });
    return requests;
  }
}