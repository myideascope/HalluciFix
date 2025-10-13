import { test, expect, devices } from '@playwright/test';
import { AnalyzerPage, DashboardPage, AuthPage } from '../pages';

// Test different viewport sizes
const viewports = [
  { name: 'Mobile Portrait', width: 375, height: 667 },
  { name: 'Mobile Landscape', width: 667, height: 375 },
  { name: 'Tablet Portrait', width: 768, height: 1024 },
  { name: 'Tablet Landscape', width: 1024, height: 768 },
  { name: 'Desktop Small', width: 1280, height: 720 },
  { name: 'Desktop Large', width: 1920, height: 1080 }
];

test.describe('Responsive Design Tests', () => {
  for (const viewport of viewports) {
    test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
      });

      test('should display analyzer page correctly', async ({ page }) => {
        const analyzerPage = new AnalyzerPage(page);
        await analyzerPage.goto();

        // Check that main elements are visible
        await expect(analyzerPage.contentTextarea).toBeVisible();
        await expect(analyzerPage.analyzeButton).toBeVisible();

        // Check responsive layout
        if (viewport.width < 768) {
          // Mobile: elements should stack vertically
          await expect(analyzerPage.contentTextarea).toBeVisible();
        } else {
          // Desktop/Tablet: elements can be side by side
          await expect(analyzerPage.contentTextarea).toBeVisible();
        }

        // Test functionality works on this viewport
        await analyzerPage.clickSampleText();
        const content = await analyzerPage.contentTextarea.inputValue();
        expect(content.length).toBeGreaterThan(0);
      });

      test('should display dashboard correctly', async ({ page }) => {
        const dashboardPage = new DashboardPage(page);
        
        // Mock authentication for dashboard access
        await page.addInitScript(() => {
          localStorage.setItem('supabase.auth.token', JSON.stringify({
            access_token: 'mock-token',
            user: { id: 'test-user', email: 'test@example.com' }
          }));
        });

        await dashboardPage.goto();
        await dashboardPage.expectDashboardLoaded();

        // Check stats cards are visible and properly arranged
        await expect(dashboardPage.totalAnalysesCard).toBeVisible();
        await expect(dashboardPage.averageAccuracyCard).toBeVisible();

        if (viewport.width < 768) {
          // Mobile: cards should stack
          const card1Rect = await dashboardPage.totalAnalysesCard.boundingBox();
          const card2Rect = await dashboardPage.averageAccuracyCard.boundingBox();
          
          if (card1Rect && card2Rect) {
            // Cards should be vertically stacked on mobile
            expect(Math.abs(card1Rect.x - card2Rect.x)).toBeLessThan(50);
          }
        }

        // Test navigation works
        if (viewport.width >= 768) {
          await expect(dashboardPage.navigationMenu).toBeVisible();
        }
      });

      test('should handle authentication modal responsively', async ({ page }) => {
        const authPage = new AuthPage(page);
        
        await page.goto('/');
        await authPage.openAuthModal();

        // Modal should be visible and properly sized
        await expect(authPage.authModal).toBeVisible();
        
        // Form elements should be accessible
        await expect(authPage.emailInput).toBeVisible();
        await expect(authPage.passwordInput).toBeVisible();
        await expect(authPage.loginButton).toBeVisible();

        // Test form interaction
        await authPage.fillEmail('test@example.com');
        await authPage.fillPassword('password123');

        // Buttons should be properly sized for touch
        if (viewport.width < 768) {
          const buttonRect = await authPage.loginButton.boundingBox();
          if (buttonRect) {
            expect(buttonRect.height).toBeGreaterThan(40); // Minimum touch target
          }
        }
      });
    });
  }

  test('should handle orientation changes', async ({ page }) => {
    const analyzerPage = new AnalyzerPage(page);
    
    // Start in portrait
    await page.setViewportSize({ width: 375, height: 667 });
    await analyzerPage.goto();
    await analyzerPage.clickSampleText();
    
    const contentBefore = await analyzerPage.contentTextarea.inputValue();
    
    // Rotate to landscape
    await page.setViewportSize({ width: 667, height: 375 });
    
    // Content should be preserved
    const contentAfter = await analyzerPage.contentTextarea.inputValue();
    expect(contentAfter).toBe(contentBefore);
    
    // Layout should adapt
    await expect(analyzerPage.contentTextarea).toBeVisible();
    await expect(analyzerPage.analyzeButton).toBeVisible();
  });

  test('should handle zoom levels', async ({ page }) => {
    const analyzerPage = new AnalyzerPage(page);
    await analyzerPage.goto();

    // Test different zoom levels
    const zoomLevels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    
    for (const zoom of zoomLevels) {
      await page.evaluate((zoomLevel) => {
        document.body.style.zoom = zoomLevel.toString();
      }, zoom);

      // Elements should remain visible and functional
      await expect(analyzerPage.contentTextarea).toBeVisible();
      await expect(analyzerPage.analyzeButton).toBeVisible();
      
      // Test interaction still works
      await analyzerPage.contentTextarea.click();
      await expect(analyzerPage.contentTextarea).toBeFocused();
    }
  });

  test('should handle very small screens', async ({ page }) => {
    // Test on very small screen (smartwatch size)
    await page.setViewportSize({ width: 280, height: 280 });
    
    const analyzerPage = new AnalyzerPage(page);
    await analyzerPage.goto();

    // Core functionality should still be accessible
    await expect(analyzerPage.contentTextarea).toBeVisible();
    await expect(analyzerPage.analyzeButton).toBeVisible();
    
    // Elements should not overflow
    const textareaRect = await analyzerPage.contentTextarea.boundingBox();
    if (textareaRect) {
      expect(textareaRect.width).toBeLessThanOrEqual(280);
    }
  });

  test('should handle very large screens', async ({ page }) => {
    // Test on 4K screen
    await page.setViewportSize({ width: 3840, height: 2160 });
    
    const dashboardPage = new DashboardPage(page);
    
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        user: { id: 'test-user', email: 'test@example.com' }
      }));
    });

    await dashboardPage.goto();
    await dashboardPage.expectDashboardLoaded();

    // Content should not be stretched too wide
    const containerRect = await dashboardPage.dashboardContainer.boundingBox();
    if (containerRect) {
      // Should have reasonable max-width
      expect(containerRect.width).toBeLessThan(2000);
    }
  });
});