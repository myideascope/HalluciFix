import { Page, Locator, expect } from '@playwright/test';
import { waitForAppLoad, waitForLoadingComplete } from '../utils/test-helpers';

export class DashboardPage {
  readonly page: Page;
  readonly dashboardContainer: Locator;
  readonly welcomeMessage: Locator;
  readonly userAvatar: Locator;
  readonly userName: Locator;
  
  // Stats cards
  readonly totalAnalysesCard: Locator;
  readonly averageAccuracyCard: Locator;
  readonly totalHallucinationsCard: Locator;
  readonly activeUsersCard: Locator;
  
  // Stats values
  readonly totalAnalysesValue: Locator;
  readonly averageAccuracyValue: Locator;
  readonly totalHallucinationsValue: Locator;
  readonly activeUsersValue: Locator;
  
  // Risk distribution chart
  readonly riskDistributionChart: Locator;
  readonly lowRiskPercentage: Locator;
  readonly mediumRiskPercentage: Locator;
  readonly highRiskPercentage: Locator;
  readonly criticalRiskPercentage: Locator;
  
  // Recent analyses
  readonly recentAnalysesSection: Locator;
  readonly analysisItems: Locator;
  readonly noAnalysesMessage: Locator;
  readonly viewAllAnalysesButton: Locator;
  
  // Quick actions
  readonly quickActionsSection: Locator;
  readonly newAnalysisButton: Locator;
  readonly batchAnalysisButton: Locator;
  readonly scheduledScansButton: Locator;
  readonly settingsButton: Locator;
  
  // Navigation
  readonly navigationMenu: Locator;
  readonly analyzerTab: Locator;
  readonly batchTab: Locator;
  readonly scheduledTab: Locator;
  readonly analyticsTab: Locator;
  readonly settingsTab: Locator;
  readonly logoutButton: Locator;
  
  // Loading and error states
  readonly loadingSpinner: Locator;
  readonly errorMessage: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Main container
    this.dashboardContainer = page.getByTestId('dashboard-container');
    this.welcomeMessage = page.getByTestId('welcome-message');
    this.userAvatar = page.getByTestId('user-avatar');
    this.userName = page.getByTestId('user-name');
    
    // Stats cards
    this.totalAnalysesCard = page.getByTestId('total-analyses-card');
    this.averageAccuracyCard = page.getByTestId('average-accuracy-card');
    this.totalHallucinationsCard = page.getByTestId('total-hallucinations-card');
    this.activeUsersCard = page.getByTestId('active-users-card');
    
    // Stats values
    this.totalAnalysesValue = page.getByTestId('total-analyses-value');
    this.averageAccuracyValue = page.getByTestId('average-accuracy-value');
    this.totalHallucinationsValue = page.getByTestId('total-hallucinations-value');
    this.activeUsersValue = page.getByTestId('active-users-value');
    
    // Risk distribution
    this.riskDistributionChart = page.getByTestId('risk-distribution-chart');
    this.lowRiskPercentage = page.getByTestId('low-risk-percentage');
    this.mediumRiskPercentage = page.getByTestId('medium-risk-percentage');
    this.highRiskPercentage = page.getByTestId('high-risk-percentage');
    this.criticalRiskPercentage = page.getByTestId('critical-risk-percentage');
    
    // Recent analyses
    this.recentAnalysesSection = page.getByTestId('recent-analyses-section');
    this.analysisItems = page.getByTestId('analysis-item');
    this.noAnalysesMessage = page.getByTestId('no-analyses-message');
    this.viewAllAnalysesButton = page.getByTestId('view-all-analyses-button');
    
    // Quick actions
    this.quickActionsSection = page.getByTestId('quick-actions-section');
    this.newAnalysisButton = page.getByTestId('new-analysis-button');
    this.batchAnalysisButton = page.getByTestId('batch-analysis-button');
    this.scheduledScansButton = page.getByTestId('scheduled-scans-button');
    this.settingsButton = page.getByTestId('settings-button');
    
    // Navigation
    this.navigationMenu = page.getByTestId('navigation-menu');
    this.analyzerTab = page.getByTestId('analyzer-tab');
    this.batchTab = page.getByTestId('batch-tab');
    this.scheduledTab = page.getByTestId('scheduled-tab');
    this.analyticsTab = page.getByTestId('analytics-tab');
    this.settingsTab = page.getByTestId('settings-tab');
    this.logoutButton = page.getByTestId('logout-button');
    
    // State elements
    this.loadingSpinner = page.getByTestId('dashboard-loading');
    this.errorMessage = page.getByTestId('dashboard-error');
    this.refreshButton = page.getByTestId('refresh-button');
  }

  async goto() {
    await this.page.goto('/dashboard');
    await waitForAppLoad(this.page);
  }

  async expectDashboardLoaded() {
    await expect(this.dashboardContainer).toBeVisible();
    await expect(this.welcomeMessage).toBeVisible();
    await waitForLoadingComplete(this.page);
  }

  async expectUserInfo(expectedName?: string) {
    await expect(this.userAvatar).toBeVisible();
    await expect(this.userName).toBeVisible();
    
    if (expectedName) {
      await expect(this.userName).toContainText(expectedName);
    }
  }

  async getAnalyticsStats() {
    await expect(this.totalAnalysesCard).toBeVisible();
    
    const totalAnalyses = await this.totalAnalysesValue.textContent();
    const averageAccuracy = await this.averageAccuracyValue.textContent();
    const totalHallucinations = await this.totalHallucinationsValue.textContent();
    const activeUsers = await this.activeUsersValue.textContent();
    
    return {
      totalAnalyses: parseInt(totalAnalyses?.replace(/[^0-9]/g, '') || '0'),
      averageAccuracy: parseFloat(averageAccuracy?.replace(/[^0-9.]/g, '') || '0'),
      totalHallucinations: parseInt(totalHallucinations?.replace(/[^0-9]/g, '') || '0'),
      activeUsers: parseInt(activeUsers?.replace(/[^0-9]/g, '') || '0')
    };
  }

  async getRiskDistribution() {
    await expect(this.riskDistributionChart).toBeVisible();
    
    const low = await this.lowRiskPercentage.textContent();
    const medium = await this.mediumRiskPercentage.textContent();
    const high = await this.highRiskPercentage.textContent();
    const critical = await this.criticalRiskPercentage.textContent();
    
    return {
      low: parseInt(low?.replace('%', '') || '0'),
      medium: parseInt(medium?.replace('%', '') || '0'),
      high: parseInt(high?.replace('%', '') || '0'),
      critical: parseInt(critical?.replace('%', '') || '0')
    };
  }

  async getRecentAnalyses() {
    const analyses = [];
    const count = await this.analysisItems.count();
    
    for (let i = 0; i < count; i++) {
      const item = this.analysisItems.nth(i);
      const accuracy = await item.locator('[data-testid="analysis-accuracy"]').textContent();
      const risk = await item.locator('[data-testid="analysis-risk"]').textContent();
      const timestamp = await item.locator('[data-testid="analysis-timestamp"]').textContent();
      const content = await item.locator('[data-testid="analysis-content"]').textContent();
      
      analyses.push({
        accuracy: parseFloat(accuracy?.replace('%', '') || '0'),
        riskLevel: risk?.toLowerCase().trim() || '',
        timestamp: timestamp?.trim() || '',
        content: content?.trim() || ''
      });
    }
    
    return analyses;
  }

  async expectNoAnalyses() {
    await expect(this.noAnalysesMessage).toBeVisible();
    await expect(this.analysisItems).toHaveCount(0);
  }

  async expectAnalysesPresent() {
    await expect(this.analysisItems).toHaveCount({ min: 1 });
    await expect(this.noAnalysesMessage).toBeHidden();
  }

  async clickAnalysisItem(index: number) {
    await this.analysisItems.nth(index).click();
    // Should navigate to detailed view or open modal
  }

  async clickViewAllAnalyses() {
    await this.viewAllAnalysesButton.click();
    // Should navigate to analytics page
    await expect(this.page).toHaveURL(/.*analytics.*/);
  }

  // Quick actions
  async startNewAnalysis() {
    await this.newAnalysisButton.click();
    await expect(this.page).toHaveURL(/.*analyzer.*/);
  }

  async startBatchAnalysis() {
    await this.batchAnalysisButton.click();
    await expect(this.page).toHaveURL(/.*batch.*/);
  }

  async openScheduledScans() {
    await this.scheduledScansButton.click();
    await expect(this.page).toHaveURL(/.*scheduled.*/);
  }

  async openSettings() {
    await this.settingsButton.click();
    await expect(this.page).toHaveURL(/.*settings.*/);
  }

  // Navigation
  async navigateToAnalyzer() {
    await this.analyzerTab.click();
    await expect(this.page).toHaveURL(/.*analyzer.*/);
  }

  async navigateToBatch() {
    await this.batchTab.click();
    await expect(this.page).toHaveURL(/.*batch.*/);
  }

  async navigateToScheduled() {
    await this.scheduledTab.click();
    await expect(this.page).toHaveURL(/.*scheduled.*/);
  }

  async navigateToAnalytics() {
    await this.analyticsTab.click();
    await expect(this.page).toHaveURL(/.*analytics.*/);
  }

  async navigateToSettings() {
    await this.settingsTab.click();
    await expect(this.page).toHaveURL(/.*settings.*/);
  }

  async logout() {
    await this.logoutButton.click();
    // Should redirect to landing page
    await expect(this.page).toHaveURL(/.*\/$|.*\/landing.*/);
  }

  // State expectations
  async expectLoadingState() {
    await expect(this.loadingSpinner).toBeVisible();
  }

  async expectErrorState() {
    await expect(this.errorMessage).toBeVisible();
  }

  async refreshDashboard() {
    await this.refreshButton.click();
    await waitForLoadingComplete(this.page);
  }

  // Validation methods
  async expectStatsAreNumbers() {
    const stats = await this.getAnalyticsStats();
    
    expect(stats.totalAnalyses).toBeGreaterThanOrEqual(0);
    expect(stats.averageAccuracy).toBeGreaterThanOrEqual(0);
    expect(stats.averageAccuracy).toBeLessThanOrEqual(100);
    expect(stats.totalHallucinations).toBeGreaterThanOrEqual(0);
    expect(stats.activeUsers).toBeGreaterThanOrEqual(0);
  }

  async expectRiskDistributionValid() {
    const distribution = await this.getRiskDistribution();
    const total = distribution.low + distribution.medium + distribution.high + distribution.critical;
    
    // Should add up to 100% (allowing for rounding)
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  }

  async expectRecentAnalysesOrdered() {
    const analyses = await this.getRecentAnalyses();
    
    // Should be ordered by timestamp (most recent first)
    for (let i = 1; i < analyses.length; i++) {
      const current = new Date(analyses[i].timestamp);
      const previous = new Date(analyses[i - 1].timestamp);
      expect(current.getTime()).toBeLessThanOrEqual(previous.getTime());
    }
  }

  async expectQuickActionsVisible() {
    await expect(this.quickActionsSection).toBeVisible();
    await expect(this.newAnalysisButton).toBeVisible();
    await expect(this.batchAnalysisButton).toBeVisible();
    await expect(this.scheduledScansButton).toBeVisible();
    await expect(this.settingsButton).toBeVisible();
  }

  async expectNavigationVisible() {
    await expect(this.navigationMenu).toBeVisible();
    await expect(this.analyzerTab).toBeVisible();
    await expect(this.batchTab).toBeVisible();
    await expect(this.scheduledTab).toBeVisible();
    await expect(this.analyticsTab).toBeVisible();
    await expect(this.settingsTab).toBeVisible();
  }
}