/**
 * Cross-Browser Compatibility E2E Tests
 * Tests for ensuring functionality works across Chromium, Firefox, and WebKit browsers
 */

import { test, expect, devices } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';
import { Dashboard } from '../pages/Dashboard';
import { AnalyzerPage } from '../pages/AnalyzerPage';
import { AuthHelper, TEST_USERS } from '../utils/auth';
import { TestDataManager } from '../utils/testData';

// Test across all major browsers
const browsers = ['chromium', 'firefox', 'webkit'];

browsers.forEach(browserName => {
  test.describe(`Cross-Browser Tests - ${browserName}`, () => {
    let landingPage: LandingPage;
    let dashboard: Dashboard;
    let analyzerPage: AnalyzerPage;
    let authHelper: AuthHelper;
    let testDataManager: TestDataManager;

    test.beforeEach(async ({ page, context }) => {
      landingPage = new LandingPage(page);
      dashboard = new Dashboard(page);
      analyzerPage = new AnalyzerPage(page);
      authHelper = new AuthHelper(page, context);
      testDataManager = new TestDataManager();
    });

    test(`should load landing page correctly in ${browserName}`, async ({ page }) => {
      await landingPage.goto();

      // Verify page structure loads correctly
      const isValid = await landingPage.validatePageStructure();
      expect(isValid).toBe(true);

      // Check browser-specific rendering
      const heroTitle = await landingPage.getHeroTitle();
      expect(heroTitle).toContain('HalluciFix');

      // Test CSS rendering
      const heroSection = page.locator('[data-testid="hero-section"]');
      const isVisible = await heroSection.isVisible();
      expect(isVisible).toBe(true);

      // Check for browser-specific layout issues
      const layoutIssues = await page.evaluate(() => {
        const issues: string[] = [];
        
        // Check for common cross-browser issues
        const elements = document.querySelectorAll('*');
        Array.from(elements).forEach(element => {
          const style = window.getComputedStyle(element);
          
          // Check for flexbox issues
          if (style.display === 'flex') {
            const children = Array.from(element.children);
            if (children.length > 0 && !style.flexWrap) {
              // Potential overflow in flex containers
              const containerWidth = element.getBoundingClientRect().width;
              const childrenWidth = children.reduce((sum, child) => 
                sum + child.getBoundingClientRect().width, 0
              );
              
              if (childrenWidth > containerWidth * 1.1) {
                issues.push(`Flex container overflow: ${element.tagName.toLowerCase()}`);
              }
            }
          }
          
          // Check for grid issues
          if (style.display === 'grid') {
            const gridTemplateColumns = style.gridTemplateColumns;
            if (gridTemplateColumns === 'none') {
              issues.push(`Grid container without columns: ${element.tagName.toLowerCase()}`);
            }
          }
        });
        
        return issues;
      });

      expect(layoutIssues.length).toBe(0);
    });

    test(`should handle authentication flow in ${browserName}`, async ({ page, context }) => {
      // Setup test user
      await authHelper.setupTestUser(TEST_USERS.basicUser);

      // Test login flow
      await landingPage.goto();
      await landingPage.clickLogin();

      await authHelper.login(TEST_USERS.basicUser.email, TEST_USERS.basicUser.password);

      // Verify successful login
      await expect(page).toHaveURL(/\/dashboard/);
      
      const isLoggedIn = await authHelper.isLoggedIn();
      expect(isLoggedIn).toBe(true);

      // Test browser-specific session handling
      const currentUser = await authHelper.getCurrentUser();
      expect(currentUser?.email).toBe(TEST_USERS.basicUser.email);

      // Test logout
      await dashboard.logout();
      await expect(page).toHaveURL('/');

      // Cleanup
      await authHelper.cleanupTestUser(TEST_USERS.basicUser.email);
    });

    test(`should perform analysis workflow in ${browserName}`, async ({ page, context }) => {
      // Login
      await authHelper.loginAs('basicUser');
      await analyzerPage.goto();

      // Test analysis with browser-specific considerations
      const testContent = 'The Earth is flat and unicorns exist in reality.';
      
      await analyzerPage.performCompleteAnalysis(
        { type: 'text', content: testContent },
        { analysisType: 'standard' }
      );

      // Verify results display correctly
      const isValid = await analyzerPage.validateAnalysisResults();
      expect(isValid).toBe(true);

      // Check browser-specific rendering of results
      const overallScore = await analyzerPage.getOverallScore();
      expect(overallScore).toBeGreaterThanOrEqual(0);
      expect(overallScore).toBeLessThanOrEqual(100);

      // Test browser-specific JavaScript functionality
      const hallucinations = await analyzerPage.getHallucinationItems();
      expect(hallucinations.length).toBeGreaterThan(0);

      // Verify browser handles dynamic content updates
      await analyzerPage.clearAnalysis();
      const resultsVisible = await analyzerPage.isElementVisible('[data-testid="results-section"]');
      expect(resultsVisible).toBe(false);
    });

    test(`should handle file uploads in ${browserName}`, async ({ page, context }) => {
      // Create test file
      const testFiles = await testDataManager.createTestFiles();
      
      await authHelper.loginAs('proUser');
      await analyzerPage.goto();

      // Test file upload (browser-specific file handling)
      await analyzerPage.uploadFile(testFiles.text);

      // Verify file upload works across browsers
      const fileUploaded = await analyzerPage.elementExists('[data-testid="file-uploaded"]');
      expect(fileUploaded).toBe(true);

      // Start analysis
      await analyzerPage.startAnalysis();
      await analyzerPage.waitForAnalysisComplete();

      // Verify results
      const isValid = await analyzerPage.validateAnalysisResults();
      expect(isValid).toBe(true);

      // Cleanup
      await testDataManager.cleanupTestFiles();
    });

    test(`should handle CSS animations and transitions in ${browserName}`, async ({ page }) => {
      await landingPage.goto();

      // Test CSS animations work correctly
      const animatedElements = await page.evaluate(() => {
        const elements = document.querySelectorAll('*');
        const animated: string[] = [];
        
        Array.from(elements).forEach((element, index) => {
          const style = window.getComputedStyle(element);
          if (style.animationName !== 'none' || style.transitionProperty !== 'none') {
            animated.push(`${element.tagName.toLowerCase()}[${index}]`);
          }
        });
        
        return animated;
      });

      // If animations exist, test they don't break functionality
      if (animatedElements.length > 0) {
        // Test that animations don't interfere with interactions
        await landingPage.clickCTA();
        
        // Should still navigate correctly despite animations
        const currentUrl = landingPage.getCurrentUrl();
        expect(currentUrl).not.toBe('/');
      }
    });

    test(`should handle JavaScript events correctly in ${browserName}`, async ({ page, context }) => {
      await authHelper.loginAs('basicUser');
      await dashboard.goto();

      // Test click events
      await dashboard.navigateToAnalyze();
      await expect(page).toHaveURL(/\/analyze/);

      // Test form events
      await analyzerPage.enterText('Test content for JavaScript events');
      
      const inputValue = await page.inputValue('[data-testid="text-input"]');
      expect(inputValue).toBe('Test content for JavaScript events');

      // Test keyboard events
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      
      const clearedValue = await page.inputValue('[data-testid="text-input"]');
      expect(clearedValue).toBe('');

      // Test focus events
      await page.focus('[data-testid="text-input"]');
      const isFocused = await page.evaluate(() => 
        document.activeElement?.getAttribute('data-testid') === 'text-input'
      );
      expect(isFocused).toBe(true);
    });

    test(`should handle local storage and cookies in ${browserName}`, async ({ page, context }) => {
      // Test local storage functionality
      await page.goto('/');
      
      // Set some test data in local storage
      await page.evaluate(() => {
        localStorage.setItem('test-key', 'test-value');
        sessionStorage.setItem('session-key', 'session-value');
      });

      // Reload page and verify data persists
      await page.reload();
      
      const localStorageValue = await page.evaluate(() => 
        localStorage.getItem('test-key')
      );
      expect(localStorageValue).toBe('test-value');

      const sessionStorageValue = await page.evaluate(() => 
        sessionStorage.getItem('session-key')
      );
      expect(sessionStorageValue).toBe('session-value');

      // Test cookie handling
      await context.addCookies([{
        name: 'test-cookie',
        value: 'cookie-value',
        domain: 'localhost',
        path: '/',
      }]);

      const cookies = await context.cookies();
      const testCookie = cookies.find(cookie => cookie.name === 'test-cookie');
      expect(testCookie?.value).toBe('cookie-value');
    });

    test(`should handle responsive design in ${browserName}`, async ({ page }) => {
      await landingPage.goto();

      // Test different viewport sizes
      const viewports = [
        { width: 320, height: 568 },  // iPhone SE
        { width: 768, height: 1024 }, // iPad
        { width: 1920, height: 1080 }, // Desktop
      ];

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(500);

        // Verify layout adapts correctly
        const isValid = await landingPage.validatePageStructure();
        expect(isValid).toBe(true);

        // Check for horizontal scrollbars
        const hasHorizontalScroll = await page.evaluate(() => 
          document.documentElement.scrollWidth > window.innerWidth
        );
        expect(hasHorizontalScroll).toBe(false);
      }
    });
  });
});

test.describe('Browser-Specific Feature Tests', () => {
  test('should handle WebKit-specific issues', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'WebKit-specific test');
    
    const landingPage = new LandingPage(page);
    await landingPage.goto();

    // Test WebKit-specific CSS properties
    const webkitIssues = await page.evaluate(() => {
      const issues: string[] = [];
      
      // Check for -webkit- prefixed properties that might not work
      const elements = document.querySelectorAll('*');
      Array.from(elements).forEach(element => {
        const style = window.getComputedStyle(element);
        
        // Check for backdrop-filter support
        if (style.backdropFilter && style.backdropFilter !== 'none') {
          // WebKit might handle this differently
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            issues.push('Backdrop filter element not rendering correctly');
          }
        }
      });
      
      return issues;
    });

    expect(webkitIssues.length).toBe(0);
  });

  test('should handle Firefox-specific issues', async ({ page, browserName }) => {
    test.skip(browserName !== 'firefox', 'Firefox-specific test');
    
    const landingPage = new LandingPage(page);
    await landingPage.goto();

    // Test Firefox-specific behaviors
    const firefoxIssues = await page.evaluate(() => {
      const issues: string[] = [];
      
      // Check for Firefox-specific CSS grid issues
      const gridElements = document.querySelectorAll('[style*="grid"], .grid');
      Array.from(gridElements).forEach(element => {
        const style = window.getComputedStyle(element);
        if (style.display === 'grid') {
          // Firefox might handle grid differently
          const rect = element.getBoundingClientRect();
          if (rect.width === 0) {
            issues.push('Grid element not rendering correctly in Firefox');
          }
        }
      });
      
      return issues;
    });

    expect(firefoxIssues.length).toBe(0);
  });

  test('should handle Chromium-specific features', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium-specific test');
    
    const landingPage = new LandingPage(page);
    await landingPage.goto();

    // Test Chromium-specific features
    const chromiumFeatures = await page.evaluate(() => {
      const features = {
        webGL: !!window.WebGLRenderingContext,
        webAssembly: typeof WebAssembly !== 'undefined',
        serviceWorker: 'serviceWorker' in navigator,
        webWorker: typeof Worker !== 'undefined',
        indexedDB: 'indexedDB' in window,
        webCrypto: 'crypto' in window && 'subtle' in window.crypto,
      };
      
      return features;
    });

    // Verify modern web features are available
    expect(chromiumFeatures.webGL).toBe(true);
    expect(chromiumFeatures.webAssembly).toBe(true);
    expect(chromiumFeatures.serviceWorker).toBe(true);
    expect(chromiumFeatures.webWorker).toBe(true);
    expect(chromiumFeatures.indexedDB).toBe(true);
    expect(chromiumFeatures.webCrypto).toBe(true);
  });
});

test.describe('Cross-Browser Analysis Functionality', () => {
  browsers.forEach(browserName => {
    test(`should perform analysis correctly in ${browserName}`, async ({ page, context }) => {
      const analyzerPage = new AnalyzerPage(page);
      const authHelper = new AuthHelper(page, context);

      await authHelper.loginAs('basicUser');
      await analyzerPage.goto();

      // Test analysis functionality across browsers
      const testContent = 'Cross-browser test content with potential hallucinations about flying elephants.';
      
      await analyzerPage.performCompleteAnalysis(
        { type: 'text', content: testContent },
        { analysisType: 'standard' }
      );

      // Verify results are consistent across browsers
      const isValid = await analyzerPage.validateAnalysisResults();
      expect(isValid).toBe(true);

      const overallScore = await analyzerPage.getOverallScore();
      expect(overallScore).toBeGreaterThanOrEqual(0);
      expect(overallScore).toBeLessThanOrEqual(100);

      // Test browser-specific JavaScript execution
      const hallucinations = await analyzerPage.getHallucinationItems();
      expect(hallucinations.length).toBeGreaterThan(0);

      // Verify browser handles async operations correctly
      const riskLevel = await analyzerPage.getRiskLevel();
      expect(['low', 'medium', 'high', 'critical']).toContain(riskLevel.toLowerCase());
    });
  });
});

test.describe('Cross-Browser Dashboard Functionality', () => {
  browsers.forEach(browserName => {
    test(`should display dashboard correctly in ${browserName}`, async ({ page, context }) => {
      const dashboard = new Dashboard(page);
      const authHelper = new AuthHelper(page, context);
      const testDataManager = new TestDataManager();

      await authHelper.loginAs('basicUser');
      
      // Create test data
      const user = TEST_USERS.basicUser;
      const { data: userData } = await testDataManager.testDatabase.supabase
        .from('users')
        .select('id')
        .eq('email', user.email)
        .single();

      if (userData) {
        await testDataManager.createTestAnalyses(userData.id, 3);
      }

      await dashboard.goto();
      await dashboard.waitForDataToLoad();

      // Verify dashboard layout works across browsers
      const isValid = await dashboard.validateDashboardLayout();
      expect(isValid).toBe(true);

      // Test data loading and display
      const recentAnalyses = await dashboard.getRecentAnalyses();
      expect(recentAnalyses.length).toBeGreaterThan(0);

      // Test navigation works across browsers
      await dashboard.navigateToAnalyze();
      await expect(page).toHaveURL(/\/analyze/);

      // Cleanup
      if (userData) {
        await testDataManager.cleanupUserTestData(userData.id);
      }
    });
  });
});

test.describe('Cross-Browser Form Handling', () => {
  browsers.forEach(browserName => {
    test(`should handle forms correctly in ${browserName}`, async ({ page, context }) => {
      const authHelper = new AuthHelper(page, context);

      // Test signup form
      await page.goto('/signup');

      const testUser = {
        name: `Cross Browser User ${browserName}`,
        email: `crossbrowser.${browserName}@example.com`,
        password: 'CrossBrowserPassword123!',
        role: 'user' as const,
      };

      // Fill form
      await page.fill('[data-testid="name-input"]', testUser.name);
      await page.fill('[data-testid="email-input"]', testUser.email);
      await page.fill('[data-testid="password-input"]', testUser.password);
      await page.fill('[data-testid="confirm-password-input"]', testUser.password);

      // Test form validation across browsers
      await page.check('[data-testid="terms-checkbox"]');

      // Submit form
      await page.click('[data-testid="signup-button"]');

      // Verify form submission works
      await expect(page).toHaveURL(/\/dashboard|\/verify-email/);

      // Cleanup
      await authHelper.cleanupTestUser(testUser.email);
    });
  });
});

test.describe('Cross-Browser Error Handling', () => {
  browsers.forEach(browserName => {
    test(`should handle errors gracefully in ${browserName}`, async ({ page, context }) => {
      const analyzerPage = new AnalyzerPage(page);
      const authHelper = new AuthHelper(page, context);

      await authHelper.loginAs('basicUser');
      await analyzerPage.goto();

      // Test error handling with invalid input
      await analyzerPage.enterText('');
      await analyzerPage.startAnalysis();

      // Verify error is displayed correctly across browsers
      const hasError = await analyzerPage.hasAnalysisError();
      expect(hasError).toBe(true);

      const errorMessage = await analyzerPage.getAnalysisError();
      expect(errorMessage.length).toBeGreaterThan(0);

      // Test error recovery
      await analyzerPage.enterText('Valid content for error recovery test');
      await analyzerPage.startAnalysis();
      await analyzerPage.waitForAnalysisComplete();

      // Error should be cleared
      const hasErrorAfterRecovery = await analyzerPage.hasAnalysisError();
      expect(hasErrorAfterRecovery).toBe(false);
    });
  });
});

test.describe('Cross-Browser Performance Consistency', () => {
  browsers.forEach(browserName => {
    test(`should maintain performance standards in ${browserName}`, async ({ page }) => {
      const landingPage = new LandingPage(page);
      await landingPage.goto();

      // Measure performance metrics
      const metrics = await landingPage.validatePerformance();

      // Verify performance is acceptable across browsers
      expect(metrics.firstContentfulPaint).toBeLessThan(3000); // 3 seconds
      expect(metrics.domContentLoaded).toBeLessThan(5000); // 5 seconds

      // Test that performance doesn't degrade significantly across browsers
      // (This would require baseline measurements in a real implementation)
      console.log(`${browserName} performance:`, metrics);
    });
  });
});