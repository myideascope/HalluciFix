import { Page, expect } from '@playwright/test';

/**
 * Common test utilities for E2E tests
 */

/**
 * Wait for the application to be fully loaded
 */
export async function waitForAppLoad(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="app-loaded"]', { timeout: 10000 });
}

/**
 * Mock authentication for testing
 */
export async function mockAuthentication(page: Page, user = { 
  id: 'test-user-1', 
  email: 'test@example.com', 
  name: 'Test User' 
}) {
  await page.addInitScript((userData) => {
    // Mock the auth state in localStorage
    localStorage.setItem('supabase.auth.token', JSON.stringify({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      user: userData
    }));
  }, user);
}

/**
 * Clear all authentication data
 */
export async function clearAuthentication(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * Wait for and dismiss any toast notifications
 */
export async function dismissToasts(page: Page) {
  const toasts = page.locator('[data-testid="toast"]');
  const count = await toasts.count();
  
  for (let i = 0; i < count; i++) {
    const toast = toasts.nth(i);
    if (await toast.isVisible()) {
      const closeButton = toast.locator('[data-testid="toast-close"]');
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    }
  }
}

/**
 * Fill form field with proper validation wait
 */
export async function fillFormField(page: Page, selector: string, value: string) {
  const field = page.locator(selector);
  await field.fill(value);
  await field.blur(); // Trigger validation
  await page.waitForTimeout(100); // Allow validation to complete
}

/**
 * Wait for loading states to complete
 */
export async function waitForLoadingComplete(page: Page, timeout = 30000) {
  // Wait for any loading spinners to disappear
  const loadingSpinners = page.locator('[data-testid*="loading"], [data-testid*="spinner"], .loading');
  
  try {
    await expect(loadingSpinners.first()).toBeHidden({ timeout });
  } catch {
    // If no loading spinners found, that's fine
  }
}

/**
 * Take a screenshot with a descriptive name
 */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ 
    path: `test-results/screenshots/${name}-${Date.now()}.png`,
    fullPage: true 
  });
}

/**
 * Mock API responses for testing
 */
export async function mockApiResponse(page: Page, url: string, response: any, status = 200) {
  await page.route(url, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });
}

/**
 * Simulate network conditions
 */
export async function simulateSlowNetwork(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: 1000 * 1024, // 1MB/s
    uploadThroughput: 500 * 1024,    // 500KB/s
    latency: 100 // 100ms
  });
}

/**
 * Reset network conditions to normal
 */
export async function resetNetworkConditions(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: -1,
    uploadThroughput: -1,
    latency: 0
  });
}