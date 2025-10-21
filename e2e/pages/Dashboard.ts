/**
 * Dashboard Page Object Model
 * Handles interactions with the main dashboard page
 */

import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class Dashboard extends BasePage {
  // Selectors
  private readonly selectors = {
    // Header and navigation
    header: '[data-testid="dashboard-header"]',
    userMenu: '[data-testid="user-menu"]',
    userAvatar: '[data-testid="user-avatar"]',
    logoutButton: '[data-testid="logout-button"]',
    settingsButton: '[data-testid="settings-button"]',
    
    // Sidebar navigation
    sidebar: '[data-testid="sidebar"]',
    navAnalyze: '[data-testid="nav-analyze"]',
    navBatch: '[data-testid="nav-batch"]',
    navScheduled: '[data-testid="nav-scheduled"]',
    navAnalytics: '[data-testid="nav-analytics"]',
    navBilling: '[data-testid="nav-billing"]',
    
    // Main content area
    mainContent: '[data-testid="main-content"]',
    pageTitle: '[data-testid="page-title"]',
    
    // Dashboard overview widgets
    overviewSection: '[data-testid="overview-section"]',
    usageWidget: '[data-testid="usage-widget"]',
    recentAnalysisWidget: '[data-testid="recent-analysis-widget"]',
    subscriptionWidget: '[data-testid="subscription-widget"]',
    
    // Usage statistics
    usageChart: '[data-testid="usage-chart"]',
    usageCount: '[data-testid="usage-count"]',
    usageLimit: '[data-testid="usage-limit"]',
    usagePercentage: '[data-testid="usage-percentage"]',
    
    // Recent analysis list
    recentAnalysisList: '[data-testid="recent-analysis-list"]',
    analysisItem: '[data-testid="analysis-item"]',
    analysisTitle: '[data-testid="analysis-title"]',
    analysisDate: '[data-testid="analysis-date"]',
    analysisScore: '[data-testid="analysis-score"]',
    analysisStatus: '[data-testid="analysis-status"]',
    
    // Subscription info
    subscriptionPlan: '[data-testid="subscription-plan"]',
    subscriptionStatus: '[data-testid="subscription-status"]',
    billingDate: '[data-testid="billing-date"]',
    upgradeButton: '[data-testid="upgrade-button"]',
    
    // Quick actions
    quickActionsSection: '[data-testid="quick-actions"]',
    newAnalysisButton: '[data-testid="new-analysis-button"]',
    batchAnalysisButton: '[data-testid="batch-analysis-button"]',
    scheduleAnalysisButton: '[data-testid="schedule-analysis-button"]',
    
    // Notifications
    notificationBell: '[data-testid="notification-bell"]',
    notificationBadge: '[data-testid="notification-badge"]',
    notificationDropdown: '[data-testid="notification-dropdown"]',
    notificationItem: '[data-testid="notification-item"]',
    
    // Loading states
    loadingSpinner: '[data-testid="loading-spinner"]',
    skeletonLoader: '[data-testid="skeleton-loader"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the dashboard
   */
  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
    await this.waitForLoad();
  }

  /**
   * Wait for the dashboard to load
   */
  async waitForLoad(): Promise<void> {
    await this.waitForElement(this.selectors.header);
    await this.waitForElement(this.selectors.mainContent);
    await this.waitForLoadingToComplete();
  }

  // Navigation methods
  async navigateToAnalyze(): Promise<void> {
    await this.clickElement(this.selectors.navAnalyze);
    await this.waitForNavigation('/analyze');
  }

  async navigateToBatch(): Promise<void> {
    await this.clickElement(this.selectors.navBatch);
    await this.waitForNavigation('/batch');
  }

  async navigateToScheduled(): Promise<void> {
    await this.clickElement(this.selectors.navScheduled);
    await this.waitForNavigation('/scheduled');
  }

  async navigateToAnalytics(): Promise<void> {
    await this.clickElement(this.selectors.navAnalytics);
    await this.waitForNavigation('/analytics');
  }

  async navigateToBilling(): Promise<void> {
    await this.clickElement(this.selectors.navBilling);
    await this.waitForNavigation('/billing');
  }

  // User menu interactions
  async openUserMenu(): Promise<void> {
    await this.clickElement(this.selectors.userAvatar);
    await this.waitForElement(this.selectors.userMenu);
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.clickElement(this.selectors.logoutButton);
    await this.waitForNavigation('/');
  }

  async openSettings(): Promise<void> {
    await this.openUserMenu();
    await this.clickElement(this.selectors.settingsButton);
    await this.waitForNavigation('/settings');
  }

  // Dashboard overview methods
  async getUsageStatistics(): Promise<{
    current: number;
    limit: number;
    percentage: number;
  }> {
    const currentText = await this.getElementText(this.selectors.usageCount);
    const limitText = await this.getElementText(this.selectors.usageLimit);
    const percentageText = await this.getElementText(this.selectors.usagePercentage);

    return {
      current: parseInt(currentText.replace(/\D/g, '')),
      limit: parseInt(limitText.replace(/\D/g, '')),
      percentage: parseInt(percentageText.replace(/\D/g, '')),
    };
  }

  async getRecentAnalyses(): Promise<Array<{
    title: string;
    date: string;
    score: string;
    status: string;
  }>> {
    const items = this.page.locator(this.selectors.analysisItem);
    const count = await items.count();
    const analyses: Array<{
      title: string;
      date: string;
      score: string;
      status: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const title = await item.locator(this.selectors.analysisTitle).textContent() || '';
      const date = await item.locator(this.selectors.analysisDate).textContent() || '';
      const score = await item.locator(this.selectors.analysisScore).textContent() || '';
      const status = await item.locator(this.selectors.analysisStatus).textContent() || '';

      analyses.push({ title, date, score, status });
    }

    return analyses;
  }

  async getSubscriptionInfo(): Promise<{
    plan: string;
    status: string;
    billingDate: string;
  }> {
    const plan = await this.getElementText(this.selectors.subscriptionPlan);
    const status = await this.getElementText(this.selectors.subscriptionStatus);
    const billingDate = await this.getElementText(this.selectors.billingDate);

    return { plan, status, billingDate };
  }

  // Quick actions
  async startNewAnalysis(): Promise<void> {
    await this.clickElement(this.selectors.newAnalysisButton);
    await this.waitForNavigation('/analyze');
  }

  async startBatchAnalysis(): Promise<void> {
    await this.clickElement(this.selectors.batchAnalysisButton);
    await this.waitForNavigation('/batch');
  }

  async scheduleAnalysis(): Promise<void> {
    await this.clickElement(this.selectors.scheduleAnalysisButton);
    await this.waitForNavigation('/scheduled');
  }

  async upgradeSubscription(): Promise<void> {
    await this.clickElement(this.selectors.upgradeButton);
    await this.waitForNavigation('/billing/upgrade');
  }

  // Notifications
  async openNotifications(): Promise<void> {
    await this.clickElement(this.selectors.notificationBell);
    await this.waitForElement(this.selectors.notificationDropdown);
  }

  async getNotificationCount(): Promise<number> {
    const badge = this.page.locator(this.selectors.notificationBadge);
    if (await badge.isVisible()) {
      const text = await badge.textContent();
      return parseInt(text || '0');
    }
    return 0;
  }

  async getNotifications(): Promise<Array<{
    title: string;
    message: string;
    time: string;
    read: boolean;
  }>> {
    await this.openNotifications();
    
    const items = this.page.locator(this.selectors.notificationItem);
    const count = await items.count();
    const notifications: Array<{
      title: string;
      message: string;
      time: string;
      read: boolean;
    }> = [];

    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const title = await item.locator('[data-testid="notification-title"]').textContent() || '';
      const message = await item.locator('[data-testid="notification-message"]').textContent() || '';
      const time = await item.locator('[data-testid="notification-time"]').textContent() || '';
      const read = await item.getAttribute('data-read') === 'true';

      notifications.push({ title, message, time, read });
    }

    return notifications;
  }

  async markNotificationAsRead(index: number): Promise<void> {
    await this.openNotifications();
    const items = this.page.locator(this.selectors.notificationItem);
    const item = items.nth(index);
    await item.locator('[data-testid="mark-read-button"]').click();
  }

  // Analysis item interactions
  async clickAnalysisItem(index: number): Promise<void> {
    const items = this.page.locator(this.selectors.analysisItem);
    await items.nth(index).click();
  }

  async viewAnalysisDetails(index: number): Promise<void> {
    const items = this.page.locator(this.selectors.analysisItem);
    const item = items.nth(index);
    await item.locator('[data-testid="view-details-button"]').click();
  }

  async deleteAnalysis(index: number): Promise<void> {
    const items = this.page.locator(this.selectors.analysisItem);
    const item = items.nth(index);
    await item.locator('[data-testid="delete-button"]').click();
    
    // Confirm deletion in modal
    await this.clickElement('[data-testid="confirm-delete-button"]');
    await this.waitForElementToBeHidden('[data-testid="delete-modal"]');
  }

  // Search and filtering
  async searchAnalyses(query: string): Promise<void> {
    await this.fillInput('[data-testid="search-input"]', query);
    await this.pressKey('Enter');
    await this.waitForLoadingToComplete();
  }

  async filterByStatus(status: 'all' | 'completed' | 'processing' | 'failed'): Promise<void> {
    await this.clickElement('[data-testid="status-filter"]');
    await this.clickElement(`[data-testid="status-${status}"]`);
    await this.waitForLoadingToComplete();
  }

  async filterByDateRange(startDate: string, endDate: string): Promise<void> {
    await this.clickElement('[data-testid="date-filter"]');
    await this.fillInput('[data-testid="start-date"]', startDate);
    await this.fillInput('[data-testid="end-date"]', endDate);
    await this.clickElement('[data-testid="apply-filter"]');
    await this.waitForLoadingToComplete();
  }

  // Validation methods
  async validateDashboardLayout(): Promise<boolean> {
    const requiredElements = [
      this.selectors.header,
      this.selectors.sidebar,
      this.selectors.mainContent,
      this.selectors.overviewSection,
      this.selectors.usageWidget,
      this.selectors.recentAnalysisWidget,
      this.selectors.subscriptionWidget,
    ];

    for (const selector of requiredElements) {
      if (!(await this.elementExists(selector))) {
        console.error(`Required element not found: ${selector}`);
        return false;
      }
    }

    return true;
  }

  async validateUserPermissions(expectedRole: 'user' | 'admin'): Promise<boolean> {
    // Check if admin-only elements are visible for admin users
    const adminElements = [
      '[data-testid="admin-panel"]',
      '[data-testid="user-management"]',
      '[data-testid="system-settings"]',
    ];

    for (const selector of adminElements) {
      const isVisible = await this.isElementVisible(selector);
      if (expectedRole === 'admin' && !isVisible) {
        console.error(`Admin element not visible: ${selector}`);
        return false;
      }
      if (expectedRole === 'user' && isVisible) {
        console.error(`Admin element visible to regular user: ${selector}`);
        return false;
      }
    }

    return true;
  }

  async validateSubscriptionLimits(expectedPlan: 'basic' | 'pro' | 'enterprise'): Promise<boolean> {
    const usage = await this.getUsageStatistics();
    
    // Expected limits based on plan
    const planLimits = {
      basic: 1000,
      pro: 10000,
      enterprise: -1, // unlimited
    };

    const expectedLimit = planLimits[expectedPlan];
    
    if (expectedLimit === -1) {
      // Unlimited plan should show "Unlimited" text
      const limitText = await this.getElementText(this.selectors.usageLimit);
      return limitText.toLowerCase().includes('unlimited');
    } else {
      return usage.limit === expectedLimit;
    }
  }

  async waitForDataToLoad(): Promise<void> {
    // Wait for all dashboard widgets to load their data
    await this.waitForElementToBeHidden(this.selectors.skeletonLoader);
    await this.waitForElement(this.selectors.usageChart);
    await this.waitForElement(this.selectors.recentAnalysisList);
    await this.waitForNetworkIdle();
  }

  async refreshDashboard(): Promise<void> {
    await this.reload();
    await this.waitForDataToLoad();
  }

  async exportData(format: 'csv' | 'json' | 'pdf'): Promise<void> {
    await this.clickElement('[data-testid="export-button"]');
    await this.clickElement(`[data-testid="export-${format}"]`);
    await this.waitForDownload();
  }
}