import { Page, expect } from '@playwright/test';

/**
 * Mobile-specific test utilities
 */

/**
 * Simulate touch gestures
 */
export async function swipeLeft(page: Page, element?: string) {
  const selector = element || 'body';
  const elementHandle = await page.locator(selector).first();
  const box = await elementHandle.boundingBox();
  
  if (box) {
    const startX = box.x + box.width * 0.8;
    const endX = box.x + box.width * 0.2;
    const y = box.y + box.height / 2;
    
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(endX, y, { steps: 10 });
    await page.mouse.up();
  }
}

export async function swipeRight(page: Page, element?: string) {
  const selector = element || 'body';
  const elementHandle = await page.locator(selector).first();
  const box = await elementHandle.boundingBox();
  
  if (box) {
    const startX = box.x + box.width * 0.2;
    const endX = box.x + box.width * 0.8;
    const y = box.y + box.height / 2;
    
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(endX, y, { steps: 10 });
    await page.mouse.up();
  }
}

export async function swipeUp(page: Page, element?: string) {
  const selector = element || 'body';
  const elementHandle = await page.locator(selector).first();
  const box = await elementHandle.boundingBox();
  
  if (box) {
    const x = box.x + box.width / 2;
    const startY = box.y + box.height * 0.8;
    const endY = box.y + box.height * 0.2;
    
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await page.mouse.move(x, endY, { steps: 10 });
    await page.mouse.up();
  }
}

export async function swipeDown(page: Page, element?: string) {
  const selector = element || 'body';
  const elementHandle = await page.locator(selector).first();
  const box = await elementHandle.boundingBox();
  
  if (box) {
    const x = box.x + box.width / 2;
    const startY = box.y + box.height * 0.2;
    const endY = box.y + box.height * 0.8;
    
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await page.mouse.move(x, endY, { steps: 10 });
    await page.mouse.up();
  }
}

/**
 * Simulate pinch to zoom
 */
export async function pinchZoom(page: Page, scale: number, element?: string) {
  const selector = element || 'body';
  const elementHandle = await page.locator(selector).first();
  const box = await elementHandle.boundingBox();
  
  if (box) {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const distance = 100;
    
    // Start with fingers close together
    const startDistance = 20;
    const endDistance = startDistance * scale;
    
    // Simulate two-finger pinch
    await page.touchscreen.tap(centerX - startDistance / 2, centerY);
    await page.touchscreen.tap(centerX + startDistance / 2, centerY);
    
    // Move fingers apart (zoom in) or together (zoom out)
    await page.mouse.move(centerX - endDistance / 2, centerY);
    await page.mouse.move(centerX + endDistance / 2, centerY);
  }
}

/**
 * Check if element is touch-friendly (minimum 44px touch target)
 */
export async function expectTouchFriendly(page: Page, selector: string) {
  const element = page.locator(selector);
  const box = await element.boundingBox();
  
  if (box) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
}

/**
 * Simulate mobile keyboard input
 */
export async function typeMobile(page: Page, selector: string, text: string) {
  const element = page.locator(selector);
  await element.tap();
  
  // Simulate mobile keyboard behavior
  for (const char of text) {
    await page.keyboard.type(char);
    await page.waitForTimeout(50); // Slight delay between characters
  }
}

/**
 * Check viewport is mobile
 */
export function isMobileViewport(page: Page): boolean {
  const viewport = page.viewportSize();
  return viewport ? viewport.width < 768 : false;
}

/**
 * Check viewport is tablet
 */
export function isTabletViewport(page: Page): boolean {
  const viewport = page.viewportSize();
  return viewport ? viewport.width >= 768 && viewport.width < 1024 : false;
}

/**
 * Simulate device orientation change
 */
export async function rotateDevice(page: Page) {
  const currentViewport = page.viewportSize();
  if (currentViewport) {
    await page.setViewportSize({
      width: currentViewport.height,
      height: currentViewport.width
    });
  }
}

/**
 * Simulate slow mobile network
 */
export async function simulateMobileNetwork(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: 200 * 1024, // 200 KB/s
    uploadThroughput: 100 * 1024,   // 100 KB/s
    latency: 300 // 300ms
  });
}

/**
 * Reset network conditions
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

/**
 * Check if element is visible in mobile viewport
 */
export async function expectVisibleInMobileViewport(page: Page, selector: string) {
  const element = page.locator(selector);
  await expect(element).toBeVisible();
  
  const box = await element.boundingBox();
  const viewport = page.viewportSize();
  
  if (box && viewport) {
    // Element should be within viewport bounds
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
}

/**
 * Simulate mobile scroll behavior
 */
export async function scrollMobile(page: Page, direction: 'up' | 'down' | 'left' | 'right', distance: number = 300) {
  const viewport = page.viewportSize();
  if (!viewport) return;
  
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  
  let startX = centerX;
  let startY = centerY;
  let endX = centerX;
  let endY = centerY;
  
  switch (direction) {
    case 'up':
      startY = centerY + distance / 2;
      endY = centerY - distance / 2;
      break;
    case 'down':
      startY = centerY - distance / 2;
      endY = centerY + distance / 2;
      break;
    case 'left':
      startX = centerX + distance / 2;
      endX = centerX - distance / 2;
      break;
    case 'right':
      startX = centerX - distance / 2;
      endX = centerX + distance / 2;
      break;
  }
  
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
}

/**
 * Wait for mobile keyboard to appear/disappear
 */
export async function waitForMobileKeyboard(page: Page, visible: boolean = true) {
  // Mobile keyboards change viewport height
  const initialViewport = page.viewportSize();
  
  if (visible) {
    // Wait for viewport to shrink (keyboard appears)
    await page.waitForFunction((initialHeight) => {
      return window.innerHeight < initialHeight;
    }, initialViewport?.height);
  } else {
    // Wait for viewport to restore (keyboard disappears)
    await page.waitForFunction((initialHeight) => {
      return window.innerHeight >= initialHeight;
    }, initialViewport?.height);
  }
}

/**
 * Check responsive breakpoints
 */
export function getBreakpoint(page: Page): 'mobile' | 'tablet' | 'desktop' {
  const viewport = page.viewportSize();
  if (!viewport) return 'desktop';
  
  if (viewport.width < 768) return 'mobile';
  if (viewport.width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Test element at different zoom levels
 */
export async function testZoomLevels(page: Page, selector: string, zoomLevels: number[] = [0.5, 1.0, 1.5, 2.0]) {
  const element = page.locator(selector);
  
  for (const zoom of zoomLevels) {
    await page.evaluate((zoomLevel) => {
      document.body.style.zoom = zoomLevel.toString();
    }, zoom);
    
    await expect(element).toBeVisible();
    
    // Element should remain interactive
    await element.hover();
  }
  
  // Reset zoom
  await page.evaluate(() => {
    document.body.style.zoom = '1';
  });
}