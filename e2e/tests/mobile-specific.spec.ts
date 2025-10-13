import { test, expect, devices } from '@playwright/test';
import { AnalyzerPage, DashboardPage, AuthPage, GoogleDrivePage } from '../pages';

// Mobile device configurations
const mobileDevices = [
  devices['iPhone 12'],
  devices['iPhone 12 Pro'],
  devices['iPhone SE'],
  devices['Pixel 5'],
  devices['Samsung Galaxy S21'],
  devices['iPad'],
  devices['iPad Pro']
];

test.describe('Mobile-Specific Tests', () => {
  for (const device of mobileDevices) {
    test.describe(`${device.name || 'Mobile Device'}`, () => {
      test.use({ ...device });

      test('should handle touch interactions on analyzer', async ({ page }) => {
        const analyzerPage = new AnalyzerPage(page);
        await analyzerPage.goto();

        // Test touch interactions
        await analyzerPage.contentTextarea.tap();
        await expect(analyzerPage.contentTextarea).toBeFocused();

        // Test long press (if supported)
        await analyzerPage.contentTextarea.tap({ timeout: 1000 });

        // Test sample text button touch
        await analyzerPage.sampleTextButton.tap();
        const content = await analyzerPage.contentTextarea.inputValue();
        expect(content.length).toBeGreaterThan(0);

        // Test analyze button touch
        await analyzerPage.analyzeButton.tap();
        await analyzerPage.expectLoadingState();
      });

      test('should handle mobile keyboard and input', async ({ page }) => {
        const analyzerPage = new AnalyzerPage(page);
        await analyzerPage.goto();

        // Focus on textarea should show mobile keyboard
        await analyzerPage.contentTextarea.tap();
        await expect(analyzerPage.contentTextarea).toBeFocused();

        // Type on mobile keyboard
        await analyzerPage.contentTextarea.type('Mobile test content');
        
        const content = await analyzerPage.contentTextarea.inputValue();
        expect(content).toContain('Mobile test content');

        // Test mobile-specific input behaviors
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        
        const updatedContent = await analyzerPage.contentTextarea.inputValue();
        expect(updatedContent).toContain('\n');
      });

      test('should handle mobile navigation and gestures', async ({ page }) => {
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

        // Test mobile navigation
        if (device.viewport.width < 768) {
          // Should have mobile menu or hamburger
          const mobileMenu = page.getByTestId('mobile-menu-button');
          if (await mobileMenu.isVisible()) {
            await mobileMenu.tap();
            await expect(dashboardPage.navigationMenu).toBeVisible();
          }
        }

        // Test swipe gestures (if implemented)
        const statsCard = dashboardPage.totalAnalysesCard;
        await statsCard.hover();
        
        // Simulate swipe left
        await page.mouse.move(100, 100);
        await page.mouse.down();
        await page.mouse.move(50, 100);
        await page.mouse.up();
      });

      test('should handle mobile file upload', async ({ page }) => {
        const analyzerPage = new AnalyzerPage(page);
        await analyzerPage.goto();

        // Mobile file upload should work
        const fileInput = analyzerPage.fileUploadInput;
        
        // Create test file
        const testContent = 'Mobile file upload test content';
        const buffer = Buffer.from(testContent);
        
        await fileInput.setInputFiles({
          name: 'mobile-test.txt',
          mimeType: 'text/plain',
          buffer: buffer
        });

        await analyzerPage.uploadButton.tap();
        await analyzerPage.expectAnalysisComplete();
      });

      test('should handle mobile authentication', async ({ page }) => {
        const authPage = new AuthPage(page);
        
        await page.goto('/');
        await authPage.openAuthModal();

        // Mobile form should be properly sized
        await expect(authPage.authModal).toBeVisible();
        
        // Input fields should be touch-friendly
        await authPage.emailInput.tap();
        await authPage.emailInput.type('mobile@example.com');
        
        await authPage.passwordInput.tap();
        await authPage.passwordInput.type('password123');

        // Password visibility toggle should work on mobile
        await authPage.showPasswordButton.tap();
        await authPage.expectPasswordVisible();

        // Submit should work with touch
        await authPage.loginButton.tap();
      });

      test('should handle mobile scrolling and viewport', async ({ page }) => {
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

        // Test scrolling behavior
        await page.evaluate(() => window.scrollTo(0, 0));
        
        // Scroll down
        await page.evaluate(() => window.scrollBy(0, 500));
        
        // Elements should remain accessible
        await expect(dashboardPage.totalAnalysesCard).toBeVisible();
        
        // Test horizontal scrolling if needed
        const container = dashboardPage.dashboardContainer;
        const containerRect = await container.boundingBox();
        
        if (containerRect && containerRect.width > device.viewport.width) {
          await page.evaluate(() => window.scrollBy(100, 0));
        }
      });

      test('should handle mobile Google Drive integration', async ({ page }) => {
        const drivePage = new GoogleDrivePage(page);
        
        // Mock authentication
        await page.addInitScript(() => {
          localStorage.setItem('supabase.auth.token', JSON.stringify({
            access_token: 'mock-token',
            user: { id: 'test-user', email: 'test@example.com' }
          }));
        });

        await drivePage.goto();

        // Connect button should be touch-friendly
        await drivePage.connectButton.tap();
        await drivePage.expectConnected();

        // File selection should work with touch
        const files = await drivePage.getFileList();
        if (files.length > 0) {
          await drivePage.selectFile(files[0].name);
          
          const selectedFiles = await drivePage.getSelectedFiles();
          expect(selectedFiles).toContain(files[0].name);
        }

        // Mobile-specific file operations
        if (await drivePage.analyzeSelectedButton.isVisible()) {
          await drivePage.analyzeSelectedButton.tap();
        }
      });

      test('should handle mobile performance and loading', async ({ page }) => {
        const analyzerPage = new AnalyzerPage(page);
        
        // Monitor performance on mobile
        const startTime = Date.now();
        await analyzerPage.goto();
        const loadTime = Date.now() - startTime;
        
        // Mobile should load reasonably fast
        expect(loadTime).toBeLessThan(5000);

        // Test analysis performance on mobile
        const analysisStartTime = Date.now();
        await analyzerPage.clickSampleText();
        await analyzerPage.analyzeButton.tap();
        await analyzerPage.expectAnalysisComplete();
        const analysisTime = Date.now() - analysisStartTime;
        
        // Analysis should complete in reasonable time on mobile
        expect(analysisTime).toBeLessThan(30000);
      });

      test('should handle mobile orientation changes', async ({ page }) => {
        const analyzerPage = new AnalyzerPage(page);
        await analyzerPage.goto();

        // Fill content in current orientation
        await analyzerPage.clickSampleText();
        const originalContent = await analyzerPage.contentTextarea.inputValue();

        // Simulate orientation change (swap width/height)
        const currentViewport = page.viewportSize();
        if (currentViewport) {
          await page.setViewportSize({
            width: currentViewport.height,
            height: currentViewport.width
          });

          // Content should be preserved
          const newContent = await analyzerPage.contentTextarea.inputValue();
          expect(newContent).toBe(originalContent);

          // Layout should adapt
          await expect(analyzerPage.contentTextarea).toBeVisible();
          await expect(analyzerPage.analyzeButton).toBeVisible();
        }
      });

      test('should handle mobile accessibility features', async ({ page }) => {
        const analyzerPage = new AnalyzerPage(page);
        await analyzerPage.goto();

        // Test focus management on mobile
        await analyzerPage.contentTextarea.tap();
        await expect(analyzerPage.contentTextarea).toBeFocused();

        // Test tab navigation (if supported)
        await page.keyboard.press('Tab');
        
        // Test voice input simulation (if supported)
        await analyzerPage.contentTextarea.tap();
        await analyzerPage.contentTextarea.type('Voice input test content');
        
        const content = await analyzerPage.contentTextarea.inputValue();
        expect(content).toContain('Voice input test content');
      });

      test('should handle mobile network conditions', async ({ page }) => {
        const analyzerPage = new AnalyzerPage(page);
        
        // Simulate slow mobile network
        const client = await page.context().newCDPSession(page);
        await client.send('Network.emulateNetworkConditions', {
          offline: false,
          downloadThroughput: 100 * 1024, // 100 KB/s
          uploadThroughput: 50 * 1024,    // 50 KB/s
          latency: 500 // 500ms
        });

        await analyzerPage.goto();
        await analyzerPage.clickSampleText();
        await analyzerPage.analyzeButton.tap();

        // Should handle slow network gracefully
        await analyzerPage.expectLoadingState();
        await analyzerPage.expectAnalysisComplete();

        // Reset network conditions
        await client.send('Network.emulateNetworkConditions', {
          offline: false,
          downloadThroughput: -1,
          uploadThroughput: -1,
          latency: 0
        });
      });
    });
  }

  test('should handle cross-device consistency', async ({ browser }) => {
    // Test that data persists across different mobile devices
    const context1 = await browser.newContext(devices['iPhone 12']);
    const page1 = await context1.newPage();
    
    const analyzerPage1 = new AnalyzerPage(page1);
    await analyzerPage1.goto();
    await analyzerPage1.clickSampleText();
    await analyzerPage1.analyzeContent();
    await analyzerPage1.expectAnalysisComplete();

    await context1.close();

    // Switch to different device
    const context2 = await browser.newContext(devices['Pixel 5']);
    const page2 = await context2.newPage();
    
    const analyzerPage2 = new AnalyzerPage(page2);
    await analyzerPage2.goto();
    
    // Should maintain session/data consistency
    // (This would depend on actual authentication implementation)
    
    await context2.close();
  });
});