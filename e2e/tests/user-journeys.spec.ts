import { test, expect } from '@playwright/test';
import { AnalyzerPage, AuthPage, DashboardPage, GoogleDrivePage } from '../pages';
import { mockAuthentication, clearAuthentication } from '../utils/test-helpers';

test.describe('Critical User Journeys', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing authentication
    await clearAuthentication(page);
  });

  test('complete analysis workflow from content input to results display', async ({ page }) => {
    const analyzerPage = new AnalyzerPage(page);
    
    // Navigate to analyzer
    await analyzerPage.goto();
    
    // Test content with potential hallucinations
    const testContent = `
      Our revolutionary AI system achieves exactly 99.7% accuracy with zero false positives.
      According to recent studies, this represents a 1000x improvement over existing solutions.
      All users report perfect satisfaction with unprecedented results.
      The system processes 1 million requests per second with 100% uptime guaranteed.
    `;
    
    // Perform analysis
    await analyzerPage.analyzeContent(testContent);
    
    // Verify analysis completed
    await analyzerPage.expectAnalysisComplete();
    
    // Get and validate results
    const results = await analyzerPage.getAnalysisResults();
    
    // Validate result structure
    expect(results.accuracy).toBeGreaterThan(0);
    expect(results.accuracy).toBeLessThanOrEqual(100);
    expect(['low', 'medium', 'high', 'critical']).toContain(results.riskLevel);
    expect(results.hallucinationCount).toBeGreaterThan(0); // Should detect suspicious claims
    expect(results.processingTime).toBeGreaterThan(0);
    expect(results.verificationSources).toBeGreaterThan(0);
    
    // Verify hallucinations were detected
    await analyzerPage.expectHallucinationsDetected();
    
    // Get detailed hallucination information
    const hallucinations = await analyzerPage.getHallucinations();
    expect(hallucinations.length).toBeGreaterThan(0);
    
    // Verify risk level matches accuracy
    if (results.accuracy >= 90) {
      await analyzerPage.expectRiskLevel('low');
    } else if (results.accuracy >= 80) {
      await analyzerPage.expectRiskLevel('medium');
    } else if (results.accuracy >= 70) {
      await analyzerPage.expectRiskLevel('high');
    } else {
      await analyzerPage.expectRiskLevel('critical');
    }
  });

  test('authentication flow from login to dashboard access', async ({ page }) => {
    const authPage = new AuthPage(page);
    const dashboardPage = new DashboardPage(page);
    
    // Start from landing page
    await page.goto('/');
    
    // Open authentication modal
    await authPage.openAuthModal();
    
    // Test login flow
    await authPage.login('test@example.com', 'password123');
    
    // Should redirect to dashboard or show success
    await authPage.expectLoginSuccess();
    
    // Navigate to dashboard if not already there
    await dashboardPage.goto();
    
    // Verify dashboard loads with user data
    await dashboardPage.expectDashboardLoaded();
    await dashboardPage.expectUserInfo('Test User');
    
    // Verify dashboard components are present
    await dashboardPage.expectQuickActionsVisible();
    await dashboardPage.expectNavigationVisible();
    
    // Get and validate analytics stats
    const stats = await dashboardPage.getAnalyticsStats();
    await dashboardPage.expectStatsAreNumbers();
    
    // Test navigation from dashboard
    await dashboardPage.startNewAnalysis();
    await expect(page).toHaveURL(/.*analyzer.*/);
    
    // Return to dashboard
    await dashboardPage.goto();
    await dashboardPage.expectDashboardLoaded();
  });

  test('Google Drive integration from connection to file analysis', async ({ page }) => {
    const authPage = new AuthPage(page);
    const drivePage = new GoogleDrivePage(page);
    
    // Authenticate first
    await mockAuthentication(page);
    
    // Navigate to Google Drive integration
    await drivePage.goto();
    
    // Initially should be disconnected
    await drivePage.expectDisconnected();
    
    // Connect Google Drive
    await drivePage.connectGoogleDrive();
    
    // Verify connection success
    await drivePage.expectConnected();
    
    // Verify file listing loads
    await drivePage.expectFilesLoaded();
    
    // Get available files
    const files = await drivePage.getFileList();
    const folders = await drivePage.getFolderList();
    
    // Test file operations if files exist
    if (files.length > 0) {
      // Select first file
      await drivePage.selectFile(files[0].name);
      
      // Verify selection
      const selectedFiles = await drivePage.getSelectedFiles();
      expect(selectedFiles).toContain(files[0].name);
      
      // Test file preview
      await drivePage.previewFile(files[0].name);
      const fileInfo = await drivePage.getFileInfo();
      expect(fileInfo.name).toBe(files[0].name);
      
      // Analyze selected file
      await drivePage.analyzeSelectedFiles();
      await drivePage.expectAnalysisComplete();
    }
    
    // Test folder navigation if folders exist
    if (folders.length > 0) {
      await drivePage.openFolder(folders[0].name);
      await drivePage.expectFilesLoaded();
      
      // Navigate back
      await drivePage.navigateBack();
      await drivePage.expectFilesLoaded();
    }
    
    // Test search functionality
    await drivePage.searchFiles('test');
    const searchResults = await drivePage.getSearchResults();
    // Results may be empty, but search should work
    
    // Clear search
    await drivePage.clearSearch();
    await drivePage.expectFilesLoaded();
    
    // Test refresh
    await drivePage.refreshFiles();
    await drivePage.expectFilesLoaded();
  });

  test('subscription and payment workflows (with test Stripe integration)', async ({ page }) => {
    // Mock Stripe for testing
    await page.addInitScript(() => {
      // Mock Stripe object
      (window as any).Stripe = () => ({
        elements: () => ({
          create: () => ({
            mount: () => {},
            on: () => {},
            destroy: () => {}
          }),
          getElement: () => null
        }),
        createPaymentMethod: () => Promise.resolve({
          paymentMethod: { id: 'pm_test_123' }
        }),
        confirmCardPayment: () => Promise.resolve({
          paymentIntent: { status: 'succeeded' }
        })
      });
    });
    
    const authPage = new AuthPage(page);
    const dashboardPage = new DashboardPage(page);
    
    // Authenticate user
    await mockAuthentication(page);
    
    // Navigate to settings/subscription page
    await page.goto('/settings');
    
    // Verify subscription section is visible
    const subscriptionSection = page.getByTestId('subscription-section');
    await expect(subscriptionSection).toBeVisible();
    
    // Check current subscription status
    const currentPlan = page.getByTestId('current-plan');
    await expect(currentPlan).toBeVisible();
    
    // Test upgrade flow
    const upgradeButton = page.getByTestId('upgrade-plan-button');
    if (await upgradeButton.isVisible()) {
      await upgradeButton.click();
      
      // Should open pricing modal or navigate to pricing page
      const pricingModal = page.getByTestId('pricing-modal');
      const pricingPage = page.getByTestId('pricing-page');
      
      const modalVisible = await pricingModal.isVisible().catch(() => false);
      const pageVisible = await pricingPage.isVisible().catch(() => false);
      
      expect(modalVisible || pageVisible).toBeTruthy();
      
      // Select a plan
      const selectPlanButton = page.getByTestId('select-pro-plan').first();
      await selectPlanButton.click();
      
      // Should open payment form
      const paymentForm = page.getByTestId('payment-form');
      await expect(paymentForm).toBeVisible();
      
      // Fill payment details (test data)
      await page.getByTestId('card-number-input').fill('4242424242424242');
      await page.getByTestId('card-expiry-input').fill('12/25');
      await page.getByTestId('card-cvc-input').fill('123');
      await page.getByTestId('billing-name-input').fill('Test User');
      
      // Submit payment
      const submitPaymentButton = page.getByTestId('submit-payment-button');
      await submitPaymentButton.click();
      
      // Wait for payment processing
      await page.waitForSelector('[data-testid="payment-success"]', { timeout: 10000 });
      
      // Verify success
      const successMessage = page.getByTestId('payment-success');
      await expect(successMessage).toBeVisible();
    }
    
    // Test usage tracking
    const usageSection = page.getByTestId('usage-section');
    if (await usageSection.isVisible()) {
      const currentUsage = page.getByTestId('current-usage');
      const usageLimit = page.getByTestId('usage-limit');
      
      await expect(currentUsage).toBeVisible();
      await expect(usageLimit).toBeVisible();
      
      // Verify usage numbers are valid
      const usageText = await currentUsage.textContent();
      const limitText = await usageLimit.textContent();
      
      const usage = parseInt(usageText?.replace(/[^0-9]/g, '') || '0');
      const limit = parseInt(limitText?.replace(/[^0-9]/g, '') || '0');
      
      expect(usage).toBeGreaterThanOrEqual(0);
      expect(limit).toBeGreaterThan(0);
      expect(usage).toBeLessThanOrEqual(limit);
    }
    
    // Test billing history
    const billingHistoryButton = page.getByTestId('billing-history-button');
    if (await billingHistoryButton.isVisible()) {
      await billingHistoryButton.click();
      
      const billingHistory = page.getByTestId('billing-history');
      await expect(billingHistory).toBeVisible();
      
      // Check for invoice items
      const invoiceItems = page.getByTestId('invoice-item');
      const invoiceCount = await invoiceItems.count();
      
      // May be empty for new accounts
      if (invoiceCount > 0) {
        // Verify invoice structure
        const firstInvoice = invoiceItems.first();
        await expect(firstInvoice.locator('[data-testid="invoice-date"]')).toBeVisible();
        await expect(firstInvoice.locator('[data-testid="invoice-amount"]')).toBeVisible();
        await expect(firstInvoice.locator('[data-testid="invoice-status"]')).toBeVisible();
      }
    }
  });

  test('end-to-end workflow: authentication → analysis → dashboard → Google Drive', async ({ page }) => {
    const authPage = new AuthPage(page);
    const analyzerPage = new AnalyzerPage(page);
    const dashboardPage = new DashboardPage(page);
    const drivePage = new GoogleDrivePage(page);
    
    // 1. Start from landing page
    await page.goto('/');
    
    // 2. Authenticate
    await authPage.openAuthModal();
    await authPage.login('test@example.com', 'password123');
    await authPage.expectLoginSuccess();
    
    // 3. Perform analysis
    await analyzerPage.goto();
    const testContent = 'This AI model achieves 100% accuracy with zero errors ever recorded.';
    await analyzerPage.analyzeContent(testContent);
    await analyzerPage.expectAnalysisComplete();
    
    // 4. Check dashboard reflects the analysis
    await dashboardPage.goto();
    await dashboardPage.expectDashboardLoaded();
    
    const stats = await dashboardPage.getAnalyticsStats();
    expect(stats.totalAnalyses).toBeGreaterThan(0);
    
    const recentAnalyses = await dashboardPage.getRecentAnalyses();
    expect(recentAnalyses.length).toBeGreaterThan(0);
    
    // 5. Test Google Drive integration
    await drivePage.goto();
    await drivePage.connectGoogleDrive();
    await drivePage.expectConnected();
    await drivePage.expectFilesLoaded();
    
    // 6. Return to dashboard and verify everything still works
    await dashboardPage.goto();
    await dashboardPage.expectDashboardLoaded();
    
    // 7. Test navigation between all sections
    await dashboardPage.navigateToAnalyzer();
    await expect(page).toHaveURL(/.*analyzer.*/);
    
    await dashboardPage.goto();
    await dashboardPage.navigateToAnalytics();
    await expect(page).toHaveURL(/.*analytics.*/);
    
    // 8. Logout
    await dashboardPage.goto();
    await dashboardPage.logout();
    await expect(page).toHaveURL(/.*\/$|.*\/landing.*/);
  });

  test('error handling and recovery workflows', async ({ page }) => {
    const analyzerPage = new AnalyzerPage(page);
    
    // Test network error handling
    await page.route('**/api/**', route => {
      route.abort('failed');
    });
    
    await analyzerPage.goto();
    await analyzerPage.fillContent('Test content');
    await analyzerPage.analyzeButton.click();
    
    // Should show error state
    await analyzerPage.expectAnalysisError();
    
    // Remove network block
    await page.unroute('**/api/**');
    
    // Retry should work
    await analyzerPage.analyzeButton.click();
    await analyzerPage.expectAnalysisComplete();
    
    // Test invalid content handling
    await analyzerPage.clearContent();
    await analyzerPage.analyzeButton.click();
    
    // Should show validation error or be disabled
    const isDisabled = await analyzerPage.analyzeButton.isDisabled();
    if (!isDisabled) {
      await analyzerPage.expectAnalysisError();
    }
    
    // Test recovery with valid content
    await analyzerPage.fillContent('Valid test content for analysis');
    await analyzerPage.analyzeContent();
    await analyzerPage.expectAnalysisComplete();
  });

  test('accessibility and keyboard navigation', async ({ page }) => {
    const analyzerPage = new AnalyzerPage(page);
    
    await analyzerPage.goto();
    
    // Test keyboard navigation
    await page.keyboard.press('Tab');
    await expect(analyzerPage.contentTextarea).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(analyzerPage.analyzeButton).toBeFocused();
    
    // Test keyboard shortcuts
    await analyzerPage.contentTextarea.focus();
    await page.keyboard.type('Test content');
    
    // Test Enter key to submit (if implemented)
    await page.keyboard.press('Control+Enter');
    
    // Should either start analysis or focus submit button
    const isAnalyzing = await analyzerPage.loadingSpinner.isVisible();
    const isButtonFocused = await analyzerPage.analyzeButton.isFocused();
    
    expect(isAnalyzing || isButtonFocused).toBeTruthy();
  });
});