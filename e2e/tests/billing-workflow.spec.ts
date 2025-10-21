/**
 * Subscription and Billing Workflow E2E Tests
 * Tests for subscription management and billing workflows with payment simulation
 */

import { test, expect } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';
import { Dashboard } from '../pages/Dashboard';
import { AuthHelper, TEST_USERS } from '../utils/auth';
import { TestDataManager } from '../utils/testData';
import { BasePage } from '../pages/BasePage';

class BillingPage extends BasePage {
  private readonly selectors = {
    // Page structure
    pageContainer: '[data-testid="billing-page"]',
    pageTitle: '[data-testid="billing-title"]',
    
    // Subscription section
    subscriptionSection: '[data-testid="subscription-section"]',
    currentPlan: '[data-testid="current-plan"]',
    planName: '[data-testid="plan-name"]',
    planPrice: '[data-testid="plan-price"]',
    planStatus: '[data-testid="plan-status"]',
    billingCycle: '[data-testid="billing-cycle"]',
    nextBillingDate: '[data-testid="next-billing-date"]',
    
    // Plan selection
    planCards: '[data-testid="plan-card"]',
    basicPlan: '[data-testid="basic-plan-card"]',
    proPlan: '[data-testid="pro-plan-card"]',
    enterprisePlan: '[data-testid="enterprise-plan-card"]',
    selectPlanButton: '[data-testid="select-plan"]',
    upgradePlanButton: '[data-testid="upgrade-plan"]',
    downgradePlanButton: '[data-testid="downgrade-plan"]',
    
    // Payment methods
    paymentMethodsSection: '[data-testid="payment-methods-section"]',
    paymentMethodList: '[data-testid="payment-method-list"]',
    paymentMethodItem: '[data-testid="payment-method-item"]',
    addPaymentMethodButton: '[data-testid="add-payment-method"]',
    removePaymentMethodButton: '[data-testid="remove-payment-method"]',
    setDefaultButton: '[data-testid="set-default-payment"]',
    
    // Billing history
    billingHistorySection: '[data-testid="billing-history-section"]',
    invoiceList: '[data-testid="invoice-list"]',
    invoiceItem: '[data-testid="invoice-item"]',
    invoiceDate: '[data-testid="invoice-date"]',
    invoiceAmount: '[data-testid="invoice-amount"]',
    invoiceStatus: '[data-testid="invoice-status"]',
    downloadInvoiceButton: '[data-testid="download-invoice"]',
    
    // Usage and limits
    usageSection: '[data-testid="usage-section"]',
    usageChart: '[data-testid="usage-chart"]',
    currentUsage: '[data-testid="current-usage"]',
    usageLimit: '[data-testid="usage-limit"]',
    usagePercentage: '[data-testid="usage-percentage"]',
    
    // Checkout and payment
    checkoutModal: '[data-testid="checkout-modal"]',
    paymentForm: '[data-testid="payment-form"]',
    cardNumber: '[data-testid="card-number"]',
    expiryDate: '[data-testid="expiry-date"]',
    cvc: '[data-testid="cvc"]',
    billingAddress: '[data-testid="billing-address"]',
    submitPaymentButton: '[data-testid="submit-payment"]',
    
    // Subscription management
    cancelSubscriptionButton: '[data-testid="cancel-subscription"]',
    pauseSubscriptionButton: '[data-testid="pause-subscription"]',
    reactivateButton: '[data-testid="reactivate-subscription"]',
    manageSubscriptionButton: '[data-testid="manage-subscription"]',
    
    // Promotional codes
    promoSection: '[data-testid="promo-section"]',
    promoCodeInput: '[data-testid="promo-code-input"]',
    applyPromoButton: '[data-testid="apply-promo"]',
    removePromoButton: '[data-testid="remove-promo"]',
    
    // Notifications and alerts
    billingAlert: '[data-testid="billing-alert"]',
    paymentFailedAlert: '[data-testid="payment-failed-alert"]',
    trialEndingAlert: '[data-testid="trial-ending-alert"]',
  };

  async goto(): Promise<void> {
    await this.page.goto('/billing');
    await this.waitForLoad();
  }

  async waitForLoad(): Promise<void> {
    await this.waitForElement(this.selectors.pageContainer);
    await this.waitForElement(this.selectors.subscriptionSection);
  }

  async getCurrentSubscription(): Promise<{
    plan: string;
    price: string;
    status: string;
    billingCycle: string;
    nextBillingDate: string;
  }> {
    const plan = await this.getElementText(this.selectors.planName);
    const price = await this.getElementText(this.selectors.planPrice);
    const status = await this.getElementText(this.selectors.planStatus);
    const billingCycle = await this.getElementText(this.selectors.billingCycle);
    const nextBillingDate = await this.getElementText(this.selectors.nextBillingDate);

    return { plan, price, status, billingCycle, nextBillingDate };
  }

  async selectPlan(plan: 'basic' | 'pro' | 'enterprise'): Promise<void> {
    const planSelector = this.selectors[`${plan}Plan` as keyof typeof this.selectors];
    await this.scrollIntoView(planSelector);
    await this.clickElement(`${planSelector} ${this.selectors.selectPlanButton}`);
  }

  async upgradePlan(plan: 'basic' | 'pro' | 'enterprise'): Promise<void> {
    const planSelector = this.selectors[`${plan}Plan` as keyof typeof this.selectors];
    await this.scrollIntoView(planSelector);
    await this.clickElement(`${planSelector} ${this.selectors.upgradePlanButton}`);
  }

  async downgradePlan(plan: 'basic' | 'pro' | 'enterprise'): Promise<void> {
    const planSelector = this.selectors[`${plan}Plan` as keyof typeof this.selectors];
    await this.scrollIntoView(planSelector);
    await this.clickElement(`${planSelector} ${this.selectors.downgradePlanButton}`);
  }

  async addPaymentMethod(cardDetails: {
    number: string;
    expiry: string;
    cvc: string;
    address?: string;
  }): Promise<void> {
    await this.clickElement(this.selectors.addPaymentMethodButton);
    await this.waitForElement(this.selectors.paymentForm);

    await this.fillInput(this.selectors.cardNumber, cardDetails.number);
    await this.fillInput(this.selectors.expiryDate, cardDetails.expiry);
    await this.fillInput(this.selectors.cvc, cardDetails.cvc);

    if (cardDetails.address) {
      await this.fillInput(this.selectors.billingAddress, cardDetails.address);
    }

    await this.clickElement(this.selectors.submitPaymentButton);
    await this.waitForElementToBeHidden(this.selectors.paymentForm);
  }

  async getPaymentMethods(): Promise<Array<{
    last4: string;
    brand: string;
    expiry: string;
    isDefault: boolean;
  }>> {
    const methodItems = this.page.locator(this.selectors.paymentMethodItem);
    const count = await methodItems.count();
    const methods: Array<{
      last4: string;
      brand: string;
      expiry: string;
      isDefault: boolean;
    }> = [];

    for (let i = 0; i < count; i++) {
      const item = methodItems.nth(i);
      const last4 = await item.locator('[data-testid="card-last4"]').textContent() || '';
      const brand = await item.locator('[data-testid="card-brand"]').textContent() || '';
      const expiry = await item.locator('[data-testid="card-expiry"]').textContent() || '';
      const isDefault = await item.locator('[data-testid="default-badge"]').isVisible();

      methods.push({ last4, brand, expiry, isDefault });
    }

    return methods;
  }

  async removePaymentMethod(index: number): Promise<void> {
    const removeButtons = this.page.locator(this.selectors.removePaymentMethodButton);
    await removeButtons.nth(index).click();
    
    // Confirm removal
    await this.clickElement('[data-testid="confirm-remove"]');
    await this.waitForElementToBeHidden('[data-testid="remove-modal"]');
  }

  async setDefaultPaymentMethod(index: number): Promise<void> {
    const setDefaultButtons = this.page.locator(this.selectors.setDefaultButton);
    await setDefaultButtons.nth(index).click();
  }

  async getBillingHistory(): Promise<Array<{
    date: string;
    amount: string;
    status: string;
    description: string;
  }>> {
    const invoiceItems = this.page.locator(this.selectors.invoiceItem);
    const count = await invoiceItems.count();
    const invoices: Array<{
      date: string;
      amount: string;
      status: string;
      description: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const item = invoiceItems.nth(i);
      const date = await item.locator(this.selectors.invoiceDate).textContent() || '';
      const amount = await item.locator(this.selectors.invoiceAmount).textContent() || '';
      const status = await item.locator(this.selectors.invoiceStatus).textContent() || '';
      const description = await item.locator('[data-testid="invoice-description"]').textContent() || '';

      invoices.push({ date, amount, status, description });
    }

    return invoices;
  }

  async downloadInvoice(index: number): Promise<void> {
    const downloadButtons = this.page.locator(this.selectors.downloadInvoiceButton);
    await downloadButtons.nth(index).click();
    await this.waitForDownload();
  }

  async getUsageStatistics(): Promise<{
    current: number;
    limit: number;
    percentage: number;
  }> {
    const currentText = await this.getElementText(this.selectors.currentUsage);
    const limitText = await this.getElementText(this.selectors.usageLimit);
    const percentageText = await this.getElementText(this.selectors.usagePercentage);

    return {
      current: parseInt(currentText.replace(/\D/g, '')),
      limit: parseInt(limitText.replace(/\D/g, '')),
      percentage: parseInt(percentageText.replace(/\D/g, '')),
    };
  }

  async cancelSubscription(reason?: string): Promise<void> {
    await this.clickElement(this.selectors.cancelSubscriptionButton);
    await this.waitForElement('[data-testid="cancel-modal"]');

    if (reason) {
      await this.fillInput('[data-testid="cancellation-reason"]', reason);
    }

    await this.clickElement('[data-testid="confirm-cancel"]');
    await this.waitForElementToBeHidden('[data-testid="cancel-modal"]');
  }

  async reactivateSubscription(): Promise<void> {
    await this.clickElement(this.selectors.reactivateButton);
    await this.waitForElement('[data-testid="reactivate-modal"]');
    await this.clickElement('[data-testid="confirm-reactivate"]');
    await this.waitForElementToBeHidden('[data-testid="reactivate-modal"]');
  }

  async applyPromoCode(code: string): Promise<void> {
    await this.fillInput(this.selectors.promoCodeInput, code);
    await this.clickElement(this.selectors.applyPromoButton);
  }

  async removePromoCode(): Promise<void> {
    await this.clickElement(this.selectors.removePromoButton);
  }

  async hasPaymentFailedAlert(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.paymentFailedAlert);
  }

  async hasTrialEndingAlert(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.trialEndingAlert);
  }

  async getBillingAlerts(): Promise<string[]> {
    const alerts = this.page.locator(this.selectors.billingAlert);
    const count = await alerts.count();
    const alertTexts: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await alerts.nth(i).textContent();
      if (text) alertTexts.push(text.trim());
    }

    return alertTexts;
  }
}

test.describe('Subscription and Billing Workflow', () => {
  let landingPage: LandingPage;
  let billingPage: BillingPage;
  let dashboard: Dashboard;
  let authHelper: AuthHelper;
  let testDataManager: TestDataManager;

  test.beforeEach(async ({ page, context }) => {
    landingPage = new LandingPage(page);
    billingPage = new BillingPage(page);
    dashboard = new Dashboard(page);
    authHelper = new AuthHelper(page, context);
    testDataManager = new TestDataManager();
  });

  test.afterEach(async () => {
    // Cleanup test data
    await testDataManager.cleanupAllTestData();
  });

  test('should complete subscription upgrade workflow from landing page', async ({ page }) => {
    // Start as anonymous user on landing page
    await landingPage.goto();

    // Navigate to pricing and select pro plan
    await landingPage.scrollToPricing();
    await landingPage.selectProPlan();

    // Should redirect to signup/checkout
    await expect(page).toHaveURL(/\/(signup|checkout)/);

    // Complete signup process
    const newUser = {
      name: 'Pro Subscriber',
      email: `prouser${Date.now()}@example.com`,
      password: 'ProPassword123!',
      role: 'user' as const,
    };

    await authHelper.signup(newUser);

    // Should be redirected to checkout for pro plan
    await expect(page).toHaveURL(/\/checkout/);

    // Mock successful payment
    await billingPage.mockApiResponse(
      /\/api\/create-checkout-session/,
      {
        sessionId: 'cs_test_success',
        url: '/checkout/success?session_id=cs_test_success',
      }
    );

    // Fill payment details (using test card)
    await billingPage.addPaymentMethod({
      number: '4242424242424242', // Stripe test card
      expiry: '12/25',
      cvc: '123',
      address: '123 Test St, Test City, TC 12345',
    });

    // Should redirect to success page then dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Verify pro subscription is active
    await billingPage.goto();
    const subscription = await billingPage.getCurrentSubscription();
    expect(subscription.plan.toLowerCase()).toContain('pro');
    expect(subscription.status.toLowerCase()).toContain('active');

    // Cleanup
    await authHelper.cleanupTestUser(newUser.email);
  });

  test('should handle subscription upgrade for existing user', async ({ page }) => {
    // Login as basic user
    await authHelper.loginAs('basicUser');
    await billingPage.goto();

    // Verify current basic subscription
    const currentSubscription = await billingPage.getCurrentSubscription();
    expect(currentSubscription.plan.toLowerCase()).toContain('basic');

    // Upgrade to pro plan
    await billingPage.upgradePlan('pro');

    // Should open checkout modal
    await billingPage.waitForElement(billingPage['selectors'].checkoutModal);

    // Add payment method
    await billingPage.addPaymentMethod({
      number: '4242424242424242',
      expiry: '12/25',
      cvc: '123',
    });

    // Mock successful upgrade
    await billingPage.mockApiResponse(
      /\/api\/upgrade-subscription/,
      {
        success: true,
        subscription: {
          plan: 'pro',
          status: 'active',
          prorationAmount: 7000, // $70 prorated
        },
      }
    );

    // Verify upgrade success
    const upgradedSubscription = await billingPage.getCurrentSubscription();
    expect(upgradedSubscription.plan.toLowerCase()).toContain('pro');

    // Verify billing history shows upgrade
    const billingHistory = await billingPage.getBillingHistory();
    expect(billingHistory.some(invoice => 
      invoice.description.toLowerCase().includes('upgrade')
    )).toBe(true);
  });

  test('should handle subscription downgrade workflow', async ({ page }) => {
    // Login as pro user
    await authHelper.loginAs('proUser');
    await billingPage.goto();

    // Verify current pro subscription
    const currentSubscription = await billingPage.getCurrentSubscription();
    expect(currentSubscription.plan.toLowerCase()).toContain('pro');

    // Downgrade to basic plan
    await billingPage.downgradePlan('basic');

    // Should show downgrade confirmation
    await billingPage.waitForElement('[data-testid="downgrade-modal"]');
    await billingPage.clickElement('[data-testid="confirm-downgrade"]');

    // Mock successful downgrade
    await billingPage.mockApiResponse(
      /\/api\/downgrade-subscription/,
      {
        success: true,
        subscription: {
          plan: 'basic',
          status: 'active',
          effectiveDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        },
      }
    );

    // Verify downgrade is scheduled
    const downgradedSubscription = await billingPage.getCurrentSubscription();
    expect(downgradedSubscription.status.toLowerCase()).toContain('scheduled');

    // Should show alert about downgrade timing
    const alerts = await billingPage.getBillingAlerts();
    expect(alerts.some(alert => 
      alert.toLowerCase().includes('downgrade')
    )).toBe(true);
  });

  test('should handle payment method management', async ({ page }) => {
    // Login as user with existing subscription
    await authHelper.loginAs('proUser');
    await billingPage.goto();

    // Add first payment method
    await billingPage.addPaymentMethod({
      number: '4242424242424242',
      expiry: '12/25',
      cvc: '123',
    });

    // Add second payment method
    await billingPage.addPaymentMethod({
      number: '5555555555554444', // Mastercard test number
      expiry: '06/26',
      cvc: '456',
    });

    // Verify both payment methods are listed
    const paymentMethods = await billingPage.getPaymentMethods();
    expect(paymentMethods.length).toBe(2);
    expect(paymentMethods[0].brand.toLowerCase()).toContain('visa');
    expect(paymentMethods[1].brand.toLowerCase()).toContain('mastercard');

    // Set second method as default
    await billingPage.setDefaultPaymentMethod(1);

    // Verify default status changed
    const updatedMethods = await billingPage.getPaymentMethods();
    expect(updatedMethods[1].isDefault).toBe(true);
    expect(updatedMethods[0].isDefault).toBe(false);

    // Remove first payment method
    await billingPage.removePaymentMethod(0);

    // Verify method was removed
    const finalMethods = await billingPage.getPaymentMethods();
    expect(finalMethods.length).toBe(1);
  });

  test('should handle billing history and invoice downloads', async ({ page }) => {
    // Login as user with billing history
    await authHelper.loginAs('proUser');

    // Create test billing data
    const user = TEST_USERS.proUser;
    const { data: userData } = await testDataManager.testDatabase.supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (userData) {
      await testDataManager.createTestBillingScenario();
    }

    await billingPage.goto();

    // Verify billing history is displayed
    const billingHistory = await billingPage.getBillingHistory();
    expect(billingHistory.length).toBeGreaterThan(0);

    // Verify invoice structure
    for (const invoice of billingHistory) {
      expect(invoice.date).toBeTruthy();
      expect(invoice.amount).toMatch(/\$\d+/);
      expect(invoice.status).toBeTruthy();
    }

    // Download first invoice
    if (billingHistory.length > 0) {
      await billingPage.downloadInvoice(0);
    }
  });

  test('should handle subscription cancellation workflow', async ({ page }) => {
    // Login as subscribed user
    await authHelper.loginAs('proUser');
    await billingPage.goto();

    // Cancel subscription
    const cancellationReason = 'Testing cancellation workflow';
    await billingPage.cancelSubscription(cancellationReason);

    // Mock successful cancellation
    await billingPage.mockApiResponse(
      /\/api\/cancel-subscription/,
      {
        success: true,
        subscription: {
          status: 'active',
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      }
    );

    // Verify cancellation is scheduled
    const subscription = await billingPage.getCurrentSubscription();
    expect(subscription.status.toLowerCase()).toContain('cancel');

    // Should show reactivation option
    const reactivateVisible = await billingPage.isElementVisible(
      billingPage['selectors'].reactivateButton
    );
    expect(reactivateVisible).toBe(true);

    // Test reactivation
    await billingPage.reactivateSubscription();

    // Verify subscription is reactivated
    const reactivatedSubscription = await billingPage.getCurrentSubscription();
    expect(reactivatedSubscription.status.toLowerCase()).toContain('active');
  });

  test('should handle promotional codes', async ({ page }) => {
    // Login as user
    await authHelper.loginAs('basicUser');
    await billingPage.goto();

    // Apply valid promo code
    await billingPage.applyPromoCode('SAVE20');

    // Mock successful promo application
    await billingPage.mockApiResponse(
      /\/api\/apply-promo-code/,
      {
        success: true,
        discount: {
          percentOff: 20,
          name: '20% Off',
        },
      }
    );

    // Verify discount is applied
    const subscription = await billingPage.getCurrentSubscription();
    expect(subscription.price).toContain('20%'); // Should show discount

    // Remove promo code
    await billingPage.removePromoCode();

    // Verify discount is removed
    const updatedSubscription = await billingPage.getCurrentSubscription();
    expect(updatedSubscription.price).not.toContain('20%');
  });

  test('should handle failed payment scenarios', async ({ page }) => {
    // Login as user
    await authHelper.loginAs('basicUser');
    await billingPage.goto();

    // Mock failed payment
    await billingPage.mockApiResponse(
      /\/api\/process-payment/,
      {
        success: false,
        error: 'Your card was declined.',
      },
      402 // Payment Required
    );

    // Try to upgrade with failing payment
    await billingPage.upgradePlan('pro');

    await billingPage.addPaymentMethod({
      number: '4000000000000002', // Stripe test card that always fails
      expiry: '12/25',
      cvc: '123',
    });

    // Should show payment failed alert
    const hasPaymentFailedAlert = await billingPage.hasPaymentFailedAlert();
    expect(hasPaymentFailedAlert).toBe(true);

    // Should remain on current plan
    const subscription = await billingPage.getCurrentSubscription();
    expect(subscription.plan.toLowerCase()).toContain('basic');
  });

  test('should handle trial ending notifications', async ({ page }) => {
    // Mock user with trial ending soon
    await authHelper.mockAuthentication({
      ...TEST_USERS.basicUser,
      subscription: 'trial',
    });

    await billingPage.goto();

    // Mock trial ending data
    await billingPage.mockApiResponse(
      /\/api\/subscription-status/,
      {
        plan: 'trial',
        status: 'trialing',
        trialEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
        daysRemaining: 3,
      }
    );

    // Should show trial ending alert
    const hasTrialEndingAlert = await billingPage.hasTrialEndingAlert();
    expect(hasTrialEndingAlert).toBe(true);

    // Alert should contain days remaining
    const alerts = await billingPage.getBillingAlerts();
    expect(alerts.some(alert => 
      alert.includes('3 days')
    )).toBe(true);
  });

  test('should handle usage limits and overages', async ({ page }) => {
    // Login as user approaching limits
    await authHelper.loginAs('basicUser');

    // Create usage data near limit
    const user = TEST_USERS.basicUser;
    const { data: userData } = await testDataManager.testDatabase.supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (userData) {
      // Create usage records totaling 950 out of 1000 limit
      await testDataManager.testDatabase.supabase
        .from('usage_records')
        .insert({
          user_id: userData.id,
          usage_type: 'analysis',
          quantity: 950,
          timestamp: new Date(),
        });
    }

    await billingPage.goto();

    // Verify usage statistics
    const usage = await billingPage.getUsageStatistics();
    expect(usage.current).toBe(950);
    expect(usage.limit).toBe(1000);
    expect(usage.percentage).toBe(95);

    // Should show usage warning
    const alerts = await billingPage.getBillingAlerts();
    expect(alerts.some(alert => 
      alert.toLowerCase().includes('usage') || alert.toLowerCase().includes('limit')
    )).toBe(true);
  });

  test('should integrate billing with dashboard analytics', async ({ page }) => {
    // Login as subscribed user
    await authHelper.loginAs('proUser');

    // Navigate to billing and verify subscription
    await billingPage.goto();
    const subscription = await billingPage.getCurrentSubscription();
    expect(subscription.plan.toLowerCase()).toContain('pro');

    // Navigate to dashboard
    await dashboard.goto();
    await dashboard.waitForDataToLoad();

    // Verify subscription info matches in dashboard
    const dashboardSubscription = await dashboard.getSubscriptionInfo();
    expect(dashboardSubscription.plan.toLowerCase()).toContain('pro');
    expect(dashboardSubscription.status.toLowerCase()).toContain('active');

    // Verify usage limits match subscription level
    const isValid = await dashboard.validateSubscriptionLimits('pro');
    expect(isValid).toBe(true);
  });
});