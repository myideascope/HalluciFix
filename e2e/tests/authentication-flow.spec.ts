import { test, expect } from '@playwright/test';
import { AuthPage, DashboardPage } from '../pages';
import { clearAuthentication } from '../utils/test-helpers';

test.describe('Authentication Flow Tests', () => {
  let authPage: AuthPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    dashboardPage = new DashboardPage(page);
    await clearAuthentication(page);
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    await authPage.login('test@example.com', 'password123');
    await authPage.expectLoginSuccess();
    
    // Should be able to access dashboard
    await dashboardPage.goto();
    await dashboardPage.expectDashboardLoaded();
  });

  test('should successfully signup with valid information', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    await authPage.signup('newuser@example.com', 'password123');
    await authPage.expectSignupSuccess();
  });

  test('should handle login with invalid credentials', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    await authPage.login('invalid@example.com', 'wrongpassword');
    await authPage.expectAuthError();
    
    const errorMessage = await authPage.getErrorMessage();
    expect(errorMessage).toContain('Invalid');
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    await authPage.fillInvalidEmail();
    await authPage.expectEmailValidation();
  });

  test('should validate password strength', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    await authPage.switchToSignup();
    
    await authPage.fillWeakPassword();
    await authPage.expectPasswordValidation();
  });

  test('should validate password confirmation match', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    await authPage.switchToSignup();
    
    await authPage.fillMismatchedPasswords();
    await authPage.expectPasswordMismatch();
  });

  test('should toggle password visibility', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    await authPage.fillPassword('testpassword');
    await authPage.expectPasswordHidden();
    
    await authPage.togglePasswordVisibility();
    await authPage.expectPasswordVisible();
    
    await authPage.togglePasswordVisibility();
    await authPage.expectPasswordHidden();
  });

  test('should switch between login and signup modes', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    // Should start in login mode
    await expect(authPage.loginButton).toBeVisible();
    await expect(authPage.confirmPasswordInput).toBeHidden();
    
    // Switch to signup
    await authPage.switchToSignup();
    await expect(authPage.signupButton).toBeVisible();
    await expect(authPage.confirmPasswordInput).toBeVisible();
    
    // Switch back to login
    await authPage.switchToLogin();
    await expect(authPage.loginButton).toBeVisible();
    await expect(authPage.confirmPasswordInput).toBeHidden();
  });

  test('should handle Google Sign-In', async ({ page }) => {
    // Mock Google OAuth for testing
    await page.addInitScript(() => {
      (window as any).google = {
        accounts: {
          id: {
            initialize: () => {},
            renderButton: () => {},
            prompt: () => {}
          }
        }
      };
    });
    
    await page.goto('/');
    await authPage.openAuthModal();
    
    await authPage.signInWithGoogle();
    
    // Should handle OAuth flow (mocked in test)
    // In real tests, this would redirect to Google
  });

  test('should handle forgot password flow', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    await authPage.resetPassword('test@example.com');
    await authPage.expectResetPasswordSuccess();
  });

  test('should close authentication modal', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    await authPage.closeAuthModal();
    // Should return to landing page state
  });

  test('should maintain form state when switching modes', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    // Fill email in login mode
    await authPage.fillEmail('test@example.com');
    
    // Switch to signup
    await authPage.switchToSignup();
    
    // Email should be preserved
    const emailValue = await authPage.emailInput.inputValue();
    expect(emailValue).toBe('test@example.com');
  });

  test('should show loading state during authentication', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    // Mock slow authentication
    await page.route('**/auth/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      route.continue();
    });
    
    await authPage.fillValidCredentials();
    await authPage.loginButton.click();
    
    await authPage.expectLoadingState();
  });

  test('should handle session persistence', async ({ page }) => {
    // Login
    await page.goto('/');
    await authPage.openAuthModal();
    await authPage.login('test@example.com', 'password123');
    await authPage.expectLoginSuccess();
    
    // Refresh page
    await page.reload();
    
    // Should still be authenticated
    await dashboardPage.goto();
    await dashboardPage.expectDashboardLoaded();
  });

  test('should handle logout', async ({ page }) => {
    // Login first
    await page.goto('/');
    await authPage.openAuthModal();
    await authPage.login('test@example.com', 'password123');
    await authPage.expectLoginSuccess();
    
    // Navigate to dashboard
    await dashboardPage.goto();
    await dashboardPage.expectDashboardLoaded();
    
    // Logout
    await dashboardPage.logout();
    
    // Should redirect to landing page
    await expect(page).toHaveURL(/.*\/$|.*\/landing.*/);
    
    // Should not be able to access protected pages
    await page.goto('/dashboard');
    // Should redirect to login or show auth modal
  });

  test('should handle authentication errors gracefully', async ({ page }) => {
    // Mock server error
    await page.route('**/auth/login', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      });
    });
    
    await page.goto('/');
    await authPage.openAuthModal();
    await authPage.login('test@example.com', 'password123');
    
    await authPage.expectAuthError('server error');
  });

  test('should validate form before submission', async ({ page }) => {
    await page.goto('/');
    await authPage.openAuthModal();
    
    // Empty form should not be submittable
    await authPage.expectFormValidation();
    
    // Fill valid data
    await authPage.fillValidCredentials();
    await authPage.expectFormReady();
  });

  test('should handle rate limiting', async ({ page }) => {
    // Mock rate limit response
    await page.route('**/auth/login', route => {
      route.fulfill({
        status: 429,
        body: JSON.stringify({ error: 'Too many attempts' })
      });
    });
    
    await page.goto('/');
    await authPage.openAuthModal();
    await authPage.login('test@example.com', 'password123');
    
    await authPage.expectAuthError('too many');
  });
});