import { Page, Locator, expect } from '@playwright/test';
import { waitForAppLoad, waitForLoadingComplete } from '../utils/test-helpers';

export class BasePage {
  readonly page: Page;
  readonly appContainer: Locator;
  readonly navigationHeader: Locator;
  readonly loadingIndicator: Locator;
  readonly errorBoundary: Locator;
  readonly toastContainer: Locator;
  readonly modalOverlay: Locator;

  constructor(page: Page) {
    this.page = page;
    this.appContainer = page.getByTestId('app-container');
    this.navigationHeader = page.getByTestId('navigation-header');
    this.loadingIndicator = page.getByTestId('global-loading');
    this.errorBoundary = page.getByTestId('error-boundary');
    this.toastContainer = page.getByTestId('toast-container');
    this.modalOverlay = page.getByTestId('modal-overlay');
  }

  async waitForPageLoad() {
    await waitForAppLoad(this.page);
    await expect(this.appContainer).toBeVisible();
  }

  async expectNoErrors() {
    await expect(this.errorBoundary).toBeHidden();
  }

  async expectToastMessage(message: string, type?: 'success' | 'error' | 'warning' | 'info') {
    const toast = this.page.getByTestId('toast-message');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(message);
    
    if (type) {
      await expect(toast).toHaveClass(new RegExp(type));
    }
  }

  async dismissToast() {
    const closeButton = this.page.getByTestId('toast-close');
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  }

  async expectModalOpen() {
    await expect(this.modalOverlay).toBeVisible();
  }

  async expectModalClosed() {
    await expect(this.modalOverlay).toBeHidden();
  }

  async closeModal() {
    const closeButton = this.page.getByTestId('modal-close');
    await closeButton.click();
    await this.expectModalClosed();
  }

  async expectGlobalLoading() {
    await expect(this.loadingIndicator).toBeVisible();
  }

  async expectGlobalLoadingComplete() {
    await expect(this.loadingIndicator).toBeHidden();
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ 
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
      fullPage: true 
    });
  }
}