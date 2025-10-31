/**
 * Authentication Workflow E2E Tests
 * Tests for user registration and authentication flows including OAuth integration
 */

import { test, expect } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';
import { Dashboard } from '../pages/Dashboard';
import { AuthHelper, TEST_USERS } from '../utils/auth';
import { TestDataManager } from '../utils/testData';

test.describe('User Registration and Authentication Workflow', () => {
  let landingPage: LandingPage;
  let dashboard: Dashboard;
  let authHelper: AuthHelper;
  let testDataManager: TestDataManager;

  test.beforeEach(async ({ page, context }) => {
    landingPage = new LandingPage(page);
    dashboard = new Dashboard(page);
    authHelper = new AuthHelper(page, context);
    testDataManager = new TestDataManager();
  });

  test.afterEach(async () => {
    // Clear authentication state
    await authHelper.clearAuthState();
  });

  test('should complete user registration workflow', async ({ page }) => {
    // Start from landing page
    await landingPage.goto();

    // Click signup button
    await landingPage.clickSignup();
    await expect(page).toHaveURL(/\/signup/);

    // Fill registration form
    const newUser = {
      name: 'New Test User',
      email: `newuser${Date.now()}@example.com`,
      password: 'NewUserPassword123!',
      role: 'user' as const,
    };

    await authHelper.signup(newUser);

    // Should be redirected to dashboard after successful registration
    await expect(page).toHaveURL(/\/dashboard/);

    // Verify user is logged in
    const isLoggedIn = await authHelper.isLoggedIn();
    expect(isLoggedIn).toBe(true);

    // Verify user information
    const currentUser = await authHelper.getCurrentUser();
    expect(currentUser?.email).toBe(newUser.email);
    expect(currentUser?.name).toBe(newUser.name);

    // Verify dashboard loads correctly for new user
    const isValidLayout = await dashboard.validateDashboardLayout();
    expect(isValidLayout).toBe(true);

    // New users should have free subscription by default
    const subscriptionInfo = await dashboard.getSubscriptionInfo();
    expect(subscriptionInfo.plan.toLowerCase()).toContain('free');

    // Cleanup test user
    await authHelper.cleanupTestUser(newUser.email);
  });

  test('should handle email and password login workflow', async ({ page }) => {
    // Setup test user
    const testUser = TEST_USERS.basicUser;
    await authHelper.setupTestUser(testUser);

    // Start from landing page
    await landingPage.goto();

    // Click login button
    await landingPage.clickLogin();
    await expect(page).toHaveURL(/\/login/);

    // Login with credentials
    await authHelper.login(testUser.email, testUser.password);

    // Should be redirected to dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Verify user is logged in
    const isLoggedIn = await authHelper.isLoggedIn();
    expect(isLoggedIn).toBe(true);

    // Verify correct user information
    const currentUser = await authHelper.getCurrentUser();
    expect(currentUser?.email).toBe(testUser.email);
    expect(currentUser?.name).toBe(testUser.name);

    // Verify subscription level
    const subscriptionInfo = await dashboard.getSubscriptionInfo();
    expect(subscriptionInfo.plan.toLowerCase()).toContain(testUser.subscription);

    // Cleanup
    await authHelper.cleanupTestUser(testUser.email);
  });

  test('should handle Google OAuth login workflow', async ({ page }) => {
    // Start from landing page
    await landingPage.goto();

    // Click login button
    await landingPage.clickLogin();
    await expect(page).toHaveURL(/\/login/);

    // Test Google OAuth flow
    const testEmail = 'oauth.test@gmail.com';
    await authHelper.loginWithGoogle(testEmail);

    // Should be redirected to dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Verify user is logged in
    const isLoggedIn = await authHelper.isLoggedIn();
    expect(isLoggedIn).toBe(true);

    // Verify OAuth user information
    const currentUser = await authHelper.getCurrentUser();
    expect(currentUser?.email).toBe(testEmail);

    // OAuth users should have free subscription initially
    const subscriptionInfo = await dashboard.getSubscriptionInfo();
    expect(subscriptionInfo.plan.toLowerCase()).toContain('free');

    // Cleanup
    await authHelper.cleanupTestUser(testEmail);
  });

  test('should handle logout workflow', async ({ page }) => {
    // Login first
    const testUser = TEST_USERS.basicUser;
    await authHelper.setupTestUser(testUser);
    await authHelper.loginAs('basicUser');

    // Verify logged in state
    await dashboard.goto();
    const isLoggedIn = await authHelper.isLoggedIn();
    expect(isLoggedIn).toBe(true);

    // Logout
    await dashboard.logout();

    // Should be redirected to landing page
    await expect(page).toHaveURL('/');

    // Verify logged out state
    const isStillLoggedIn = await authHelper.isLoggedIn();
    expect(isStillLoggedIn).toBe(false);

    // Attempting to access dashboard should redirect to login
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);

    // Cleanup
    await authHelper.cleanupTestUser(testUser.email);
  });

  test('should handle password reset workflow', async ({ page }) => {
    // Setup test user
    const testUser = TEST_USERS.basicUser;
    await authHelper.setupTestUser(testUser);

    // Start password reset flow
    const newPassword = 'NewPassword123!';
    await authHelper.resetPassword(testUser.email, newPassword);

    // Try logging in with new password
    await landingPage.goto();
    await landingPage.clickLogin();
    await authHelper.login(testUser.email, newPassword);

    // Should successfully login with new password
    await expect(page).toHaveURL(/\/dashboard/);

    const isLoggedIn = await authHelper.isLoggedIn();
    expect(isLoggedIn).toBe(true);

    // Cleanup
    await authHelper.cleanupTestUser(testUser.email);
  });

  test('should handle profile update workflow', async ({ page }) => {
    // Login as test user
    const testUser = TEST_USERS.basicUser;
    await authHelper.setupTestUser(testUser);
    await authHelper.loginAs('basicUser');

    // Update profile
    const updates = {
      name: 'Updated Test User Name',
      email: `updated.${testUser.email}`,
    };

    await authHelper.updateProfile(updates);

    // Verify updates are reflected
    const currentUser = await authHelper.getCurrentUser();
    expect(currentUser?.name).toBe(updates.name);
    expect(currentUser?.email).toBe(updates.email);

    // Cleanup
    await authHelper.cleanupTestUser(updates.email);
  });

  test('should handle password change workflow', async ({ page }) => {
    // Login as test user
    const testUser = TEST_USERS.basicUser;
    await authHelper.setupTestUser(testUser);
    await authHelper.loginAs('basicUser');

    // Change password
    const newPassword = 'ChangedPassword123!';
    await authHelper.changePassword(testUser.password, newPassword);

    // Logout and try logging in with new password
    await dashboard.logout();
    await landingPage.clickLogin();
    await authHelper.login(testUser.email, newPassword);

    // Should successfully login with new password
    await expect(page).toHaveURL(/\/dashboard/);

    // Cleanup
    await authHelper.cleanupTestUser(testUser.email);
  });

  test('should handle invalid login attempts', async ({ page }) => {
    // Start from login page
    await page.goto('/login');

    // Try invalid email
    await page.fill('[data-testid="email-input"]', 'invalid@example.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="login-button"]');

    // Should show error message
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible();

    // Should remain on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('should handle registration validation', async ({ page }) => {
    // Go to signup page
    await page.goto('/signup');

    // Try submitting empty form
    await page.click('[data-testid="signup-button"]');

    // Should show validation errors
    await expect(page.locator('[data-testid="name-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible();

    // Try invalid email format
    await page.fill('[data-testid="email-input"]', 'invalid-email');
    await page.click('[data-testid="signup-button"]');
    await expect(page.locator('[data-testid="email-error"]')).toContainText('valid email');

    // Try weak password
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', '123');
    await page.click('[data-testid="signup-button"]');
    await expect(page.locator('[data-testid="password-error"]')).toContainText('password');

    // Try mismatched password confirmation
    await page.fill('[data-testid="password-input"]', 'StrongPassword123!');
    await page.fill('[data-testid="confirm-password-input"]', 'DifferentPassword123!');
    await page.click('[data-testid="signup-button"]');
    await expect(page.locator('[data-testid="confirm-password-error"]')).toContainText('match');
  });

  test('should handle session persistence', async ({ page, context }) => {
    // Login as test user
    const testUser = TEST_USERS.basicUser;
    await authHelper.setupTestUser(testUser);
    await authHelper.loginAs('basicUser');

    // Save authentication state
    await authHelper.saveAuthState('e2e/auth/test-session.json');

    // Create new page with saved state
    const newPage = await context.newPage();
    await newPage.goto('/dashboard');

    // Should be automatically logged in
    const newAuthHelper = new AuthHelper(newPage, context);
    const isLoggedIn = await newAuthHelper.isLoggedIn();
    expect(isLoggedIn).toBe(true);

    // Verify same user
    const currentUser = await newAuthHelper.getCurrentUser();
    expect(currentUser?.email).toBe(testUser.email);

    // Cleanup
    await authHelper.cleanupTestUser(testUser.email);
  });

  test('should handle account deletion workflow', async ({ page }) => {
    // Create and login as test user
    const testUser = {
      name: 'Delete Test User',
      email: `deletetest${Date.now()}@example.com`,
      password: 'DeletePassword123!',
      role: 'user' as const,
    };

    await authHelper.signup(testUser);

    // Delete account
    await authHelper.deleteAccount(testUser.password);

    // Should be redirected to landing page
    await expect(page).toHaveURL('/');

    // Should not be able to login with deleted account
    await landingPage.clickLogin();
    await page.fill('[data-testid="email-input"]', testUser.email);
    await page.fill('[data-testid="password-input"]', testUser.password);
    await page.click('[data-testid="login-button"]');

    // Should show error for deleted account
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
  });

  test('should handle concurrent login sessions', async ({ page, context }) => {
    // Setup test user
    const testUser = TEST_USERS.basicUser;
    await authHelper.setupTestUser(testUser);

    // Login in first session
    await authHelper.loginAs('basicUser');
    await dashboard.goto();

    // Create second browser context (simulate different device/browser)
    const secondContext = await page.context().browser()?.newContext();
    if (secondContext) {
      const secondPage = await secondContext.newPage();
      const secondAuthHelper = new AuthHelper(secondPage, secondContext);

      // Login in second session
      await secondAuthHelper.loginAs('basicUser');
      
      const secondDashboard = new Dashboard(secondPage);
      await secondDashboard.goto();

      // Both sessions should be valid
      const firstSessionValid = await authHelper.isLoggedIn();
      const secondSessionValid = await secondAuthHelper.isLoggedIn();

      expect(firstSessionValid).toBe(true);
      expect(secondSessionValid).toBe(true);

      // Cleanup second context
      await secondContext.close();
    }

    // Cleanup
    await authHelper.cleanupTestUser(testUser.email);
  });
});

test.describe('OAuth Integration Edge Cases', () => {
  let landingPage: LandingPage;
  let authHelper: AuthHelper;

  test.beforeEach(async ({ page, context }) => {
    landingPage = new LandingPage(page);
    authHelper = new AuthHelper(page, context);
  });

  test('should handle OAuth cancellation', async ({ page }) => {
    await landingPage.goto();
    await landingPage.clickLogin();

    // Click Google login
    await page.click('[data-testid="google-login-button"]');

    // Simulate OAuth cancellation
    await page.evaluate(() => {
      window.postMessage({
        type: 'oauth-cancelled',
        provider: 'google',
      }, '*');
    });

    // Should remain on login page
    await expect(page).toHaveURL(/\/login/);

    // Should show cancellation message
    await expect(page.locator('[data-testid="oauth-cancelled-message"]')).toBeVisible();
  });

  test('should handle OAuth errors', async ({ page }) => {
    await landingPage.goto();
    await landingPage.clickLogin();

    // Click Google login
    await page.click('[data-testid="google-login-button"]');

    // Simulate OAuth error
    await page.evaluate(() => {
      window.postMessage({
        type: 'oauth-error',
        provider: 'google',
        error: 'access_denied',
      }, '*');
    });

    // Should show error message
    await expect(page.locator('[data-testid="oauth-error-message"]')).toBeVisible();
  });

  test('should handle OAuth account linking', async ({ page }) => {
    // Create regular account first
    const testUser = {
      name: 'Link Test User',
      email: 'linktest@example.com',
      password: 'LinkPassword123!',
      role: 'user' as const,
    };

    await authHelper.signup(testUser);
    await authHelper.logout();

    // Try OAuth login with same email
    await landingPage.clickLogin();
    await authHelper.loginWithGoogle(testUser.email);

    // Should successfully link accounts and login
    await expect(page).toHaveURL(/\/dashboard/);

    const currentUser = await authHelper.getCurrentUser();
    expect(currentUser?.email).toBe(testUser.email);

    // Cleanup
    await authHelper.cleanupTestUser(testUser.email);
  });
});