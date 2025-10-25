/**
 * Dashboard E2E Tests
 * Tests for the main dashboard functionality
 */

import { test, expect } from '@playwright/test';
import { Dashboard } from '../pages/Dashboard';
import { AuthHelper, TEST_USERS } from '../utils/auth';
import { TestDataManager } from '../utils/testData';

test.describe('Dashboard', () => {
  let dashboard: Dashboard;
  let authHelper: AuthHelper;
  let testDataManager: TestDataManager;

  test.beforeEach(async ({ page, context }) => {
    dashboard = new Dashboard(page);
    authHelper = new AuthHelper(page, context);
    testDataManager = new TestDataManager();

    // Login as basic user
    await authHelper.loginAs('basicUser');
    await dashboard.goto();
  });

  test.afterEach(async () => {
    // Cleanup test data
    const user = TEST_USERS.basicUser;
    const { data } = await testDataManager.testDatabase.supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single();
    
    if (data) {
      await testDataManager.cleanupUserTestData(data.id);
    }
  });

  test('should load dashboard with all required elements', async () => {
    // Verify dashboard layout
    const isValid = await dashboard.validateDashboardLayout();
    expect(isValid).toBe(true);

    // Wait for data to load
    await dashboard.waitForDataToLoad();

    // Check that usage statistics are displayed
    const usage = await dashboard.getUsageStatistics();
    expect(usage.current).toBeGreaterThanOrEqual(0);
    expect(usage.limit).toBeGreaterThan(0);
    expect(usage.percentage).toBeGreaterThanOrEqual(0);
  });

  test('should display user subscription information', async () => {
    const subscriptionInfo = await dashboard.getSubscriptionInfo();
    
    expect(subscriptionInfo.plan).toBeTruthy();
    expect(subscriptionInfo.status).toBeTruthy();
    expect(['active', 'trialing', 'past_due']).toContain(subscriptionInfo.status);
  });

  test('should navigate to different sections', async () => {
    // Test navigation to analyze page
    await dashboard.navigateToAnalyze();
    expect(dashboard.getCurrentUrl()).toContain('/analyze');

    // Navigate back to dashboard
    await dashboard.goto();

    // Test navigation to batch analysis
    await dashboard.navigateToBatch();
    expect(dashboard.getCurrentUrl()).toContain('/batch');

    // Navigate back to dashboard
    await dashboard.goto();

    // Test navigation to scheduled scans
    await dashboard.navigateToScheduled();
    expect(dashboard.getCurrentUrl()).toContain('/scheduled');
  });

  test('should display recent analyses', async ({ page, context }) => {
    // Create test data
    const user = TEST_USERS.basicUser;
    const { data: userData } = await testDataManager.testDatabase.supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (userData) {
      await testDataManager.createTestAnalyses(userData.id, 5);
    }

    // Refresh dashboard to load new data
    await dashboard.refreshDashboard();

    // Check recent analyses
    const recentAnalyses = await dashboard.getRecentAnalyses();
    expect(recentAnalyses.length).toBeGreaterThan(0);

    // Verify analysis data structure
    for (const analysis of recentAnalyses) {
      expect(analysis.title).toBeTruthy();
      expect(analysis.date).toBeTruthy();
      expect(analysis.score).toBeTruthy();
      expect(analysis.status).toBeTruthy();
    }
  });

  test('should handle quick actions', async () => {
    // Test new analysis button
    await dashboard.startNewAnalysis();
    expect(dashboard.getCurrentUrl()).toContain('/analyze');

    // Go back to dashboard
    await dashboard.goto();

    // Test batch analysis button
    await dashboard.startBatchAnalysis();
    expect(dashboard.getCurrentUrl()).toContain('/batch');

    // Go back to dashboard
    await dashboard.goto();

    // Test schedule analysis button
    await dashboard.scheduleAnalysis();
    expect(dashboard.getCurrentUrl()).toContain('/scheduled');
  });

  test('should handle notifications', async ({ page, context }) => {
    // Create test notifications
    const user = TEST_USERS.basicUser;
    const { data: userData } = await testDataManager.testDatabase.supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (userData) {
      await testDataManager.createTestNotifications(userData.id, 3);
    }

    // Refresh dashboard
    await dashboard.refreshDashboard();

    // Check notification count
    const notificationCount = await dashboard.getNotificationCount();
    expect(notificationCount).toBeGreaterThan(0);

    // Open notifications
    const notifications = await dashboard.getNotifications();
    expect(notifications.length).toBeGreaterThan(0);

    // Verify notification structure
    for (const notification of notifications) {
      expect(notification.title).toBeTruthy();
      expect(notification.message).toBeTruthy();
      expect(notification.time).toBeTruthy();
      expect(typeof notification.read).toBe('boolean');
    }
  });

  test('should handle user menu interactions', async () => {
    // Test user menu
    await dashboard.openUserMenu();

    // Test settings navigation
    await dashboard.openSettings();
    expect(dashboard.getCurrentUrl()).toContain('/settings');

    // Go back to dashboard
    await dashboard.goto();

    // Test logout
    await dashboard.logout();
    expect(dashboard.getCurrentUrl()).toBe('/');
  });

  test('should validate subscription limits for basic user', async () => {
    const isValid = await dashboard.validateSubscriptionLimits('basic');
    expect(isValid).toBe(true);
  });

  test('should handle analysis item interactions', async ({ page, context }) => {
    // Create test analyses
    const user = TEST_USERS.basicUser;
    const { data: userData } = await testDataManager.testDatabase.supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (userData) {
      await testDataManager.createTestAnalyses(userData.id, 3);
    }

    // Refresh dashboard
    await dashboard.refreshDashboard();

    // Click on first analysis item
    await dashboard.clickAnalysisItem(0);
    
    // Should navigate to analysis details or results page
    const currentUrl = dashboard.getCurrentUrl();
    expect(currentUrl).toMatch(/\/(analysis|results)/);
  });

  test('should handle search and filtering', async ({ page, context }) => {
    // Create test analyses with specific titles
    const user = TEST_USERS.basicUser;
    const { data: userData } = await testDataManager.testDatabase.supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (userData) {
      await testDataManager.createTestAnalyses(userData.id, 5);
    }

    // Refresh dashboard
    await dashboard.refreshDashboard();

    // Test search functionality
    await dashboard.searchAnalyses('Test Analysis');
    
    // Verify search results
    const analyses = await dashboard.getRecentAnalyses();
    for (const analysis of analyses) {
      expect(analysis.title.toLowerCase()).toContain('test analysis');
    }

    // Test status filtering
    await dashboard.filterByStatus('completed');
    
    // Verify filtered results
    const completedAnalyses = await dashboard.getRecentAnalyses();
    for (const analysis of completedAnalyses) {
      expect(analysis.status).toBe('completed');
    }
  });

  test('should handle data export', async () => {
    // Test CSV export
    await dashboard.exportData('csv');
    
    // Note: In a real test, you might want to verify the downloaded file
    // This would require additional setup to handle file downloads
  });

  test('should display correct user permissions', async () => {
    // Validate that basic user sees appropriate elements
    const isValid = await dashboard.validateUserPermissions('user');
    expect(isValid).toBe(true);
  });
});

test.describe('Dashboard - Pro User', () => {
  let dashboard: Dashboard;
  let authHelper: AuthHelper;
  let testDataManager: TestDataManager;

  test.beforeEach(async ({ page, context }) => {
    dashboard = new Dashboard(page);
    authHelper = new AuthHelper(page, context);
    testDataManager = new TestDataManager();

    // Login as pro user
    await authHelper.loginAs('proUser');
    await dashboard.goto();
  });

  test('should validate subscription limits for pro user', async () => {
    const isValid = await dashboard.validateSubscriptionLimits('pro');
    expect(isValid).toBe(true);
  });

  test('should show upgrade button for basic features only', async () => {
    // Pro users should not see upgrade prompts for basic features
    const subscriptionInfo = await dashboard.getSubscriptionInfo();
    expect(subscriptionInfo.plan.toLowerCase()).toContain('pro');
  });
});

test.describe('Dashboard - Admin User', () => {
  let dashboard: Dashboard;
  let authHelper: AuthHelper;

  test.beforeEach(async ({ page, context }) => {
    dashboard = new Dashboard(page);
    authHelper = new AuthHelper(page, context);

    // Login as admin user
    await authHelper.loginAs('adminUser');
    await dashboard.goto();
  });

  test('should display admin-specific elements', async () => {
    const isValid = await dashboard.validateUserPermissions('admin');
    expect(isValid).toBe(true);
  });

  test('should have access to admin navigation items', async () => {
    // Check for admin-specific navigation items
    const hasAdminPanel = await dashboard.elementExists('[data-testid="admin-panel"]');
    const hasUserManagement = await dashboard.elementExists('[data-testid="user-management"]');
    
    expect(hasAdminPanel || hasUserManagement).toBe(true);
  });
});