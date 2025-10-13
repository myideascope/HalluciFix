import { Page, Locator, expect } from '@playwright/test';
import { waitForAppLoad, waitForLoadingComplete } from '../utils/test-helpers';

export class AuthPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly loginButton: Locator;
  readonly signupButton: Locator;
  readonly googleSignInButton: Locator;
  readonly toggleModeButton: Locator;
  readonly showPasswordButton: Locator;
  readonly showConfirmPasswordButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly loadingSpinner: Locator;
  readonly closeButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly authModal: Locator;
  readonly loginTab: Locator;
  readonly signupTab: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Form elements
    this.emailInput = page.getByTestId('email-input');
    this.passwordInput = page.getByTestId('password-input');
    this.confirmPasswordInput = page.getByTestId('confirm-password-input');
    
    // Action buttons
    this.loginButton = page.getByTestId('login-button');
    this.signupButton = page.getByTestId('signup-button');
    this.googleSignInButton = page.getByTestId('google-signin-button');
    this.toggleModeButton = page.getByTestId('toggle-mode-button');
    
    // UI controls
    this.showPasswordButton = page.getByTestId('show-password-button');
    this.showConfirmPasswordButton = page.getByTestId('show-confirm-password-button');
    this.closeButton = page.getByTestId('auth-close-button');
    this.forgotPasswordLink = page.getByTestId('forgot-password-link');
    
    // State elements
    this.errorMessage = page.getByTestId('auth-error-message');
    this.successMessage = page.getByTestId('auth-success-message');
    this.loadingSpinner = page.getByTestId('auth-loading-spinner');
    
    // Modal elements
    this.authModal = page.getByTestId('auth-modal');
    this.loginTab = page.getByTestId('login-tab');
    this.signupTab = page.getByTestId('signup-tab');
  }

  async goto() {
    await this.page.goto('/auth');
    await waitForAppLoad(this.page);
  }

  async openAuthModal() {
    // Click sign in button on landing page or navigation
    const signInButton = this.page.getByTestId('open-auth-button');
    await signInButton.click();
    await expect(this.authModal).toBeVisible();
  }

  async closeAuthModal() {
    await this.closeButton.click();
    await expect(this.authModal).toBeHidden();
  }

  async switchToLogin() {
    await this.loginTab.click();
    await expect(this.loginButton).toBeVisible();
    await expect(this.confirmPasswordInput).toBeHidden();
  }

  async switchToSignup() {
    await this.signupTab.click();
    await expect(this.signupButton).toBeVisible();
    await expect(this.confirmPasswordInput).toBeVisible();
  }

  async fillEmail(email: string) {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  async fillConfirmPassword(password: string) {
    await this.confirmPasswordInput.fill(password);
  }

  async togglePasswordVisibility() {
    await this.showPasswordButton.click();
  }

  async toggleConfirmPasswordVisibility() {
    await this.showConfirmPasswordButton.click();
  }

  async expectPasswordVisible() {
    await expect(this.passwordInput).toHaveAttribute('type', 'text');
  }

  async expectPasswordHidden() {
    await expect(this.passwordInput).toHaveAttribute('type', 'password');
  }

  async login(email: string, password: string) {
    await this.switchToLogin();
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.loginButton.click();
    await waitForLoadingComplete(this.page);
  }

  async signup(email: string, password: string, confirmPassword?: string) {
    await this.switchToSignup();
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.fillConfirmPassword(confirmPassword || password);
    await this.signupButton.click();
    await waitForLoadingComplete(this.page);
  }

  async signInWithGoogle() {
    await this.googleSignInButton.click();
    
    // In test environment, this might be mocked
    // Wait for either redirect or mock authentication
    try {
      // Wait for potential redirect or success
      await this.page.waitForURL('**/dashboard', { timeout: 5000 });
    } catch {
      // If no redirect, check for success state
      await waitForLoadingComplete(this.page);
    }
  }

  async expectLoginSuccess() {
    // Should redirect to dashboard or close modal
    try {
      await expect(this.page).toHaveURL(/.*dashboard.*/);
    } catch {
      // Alternative: modal closes and user is authenticated
      await expect(this.authModal).toBeHidden();
    }
  }

  async expectSignupSuccess() {
    // Should show success message or redirect
    try {
      await expect(this.successMessage).toBeVisible();
    } catch {
      await expect(this.page).toHaveURL(/.*dashboard.*/);
    }
  }

  async expectAuthError(expectedMessage?: string) {
    await expect(this.errorMessage).toBeVisible();
    
    if (expectedMessage) {
      await expect(this.errorMessage).toContainText(expectedMessage);
    }
  }

  async expectLoadingState() {
    await expect(this.loadingSpinner).toBeVisible();
    await expect(this.loginButton).toBeDisabled();
    await expect(this.signupButton).toBeDisabled();
  }

  async expectIdleState() {
    await expect(this.loadingSpinner).toBeHidden();
  }

  async getErrorMessage() {
    return await this.errorMessage.textContent();
  }

  async getSuccessMessage() {
    return await this.successMessage.textContent();
  }

  async expectEmailValidation() {
    // Trigger validation by clicking outside or submitting
    await this.passwordInput.click();
    
    // Check for validation styling or message
    const emailField = this.emailInput;
    const hasError = await emailField.evaluate((el) => {
      return el.classList.contains('border-red-500') || 
             el.getAttribute('aria-invalid') === 'true';
    });
    
    expect(hasError).toBeTruthy();
  }

  async expectPasswordValidation() {
    await this.emailInput.click();
    
    const passwordField = this.passwordInput;
    const hasError = await passwordField.evaluate((el) => {
      return el.classList.contains('border-red-500') || 
             el.getAttribute('aria-invalid') === 'true';
    });
    
    expect(hasError).toBeTruthy();
  }

  async expectPasswordMismatch() {
    await expect(this.errorMessage).toContainText('password', { ignoreCase: true });
  }

  async clickForgotPassword() {
    await this.forgotPasswordLink.click();
    // Should show forgot password form or modal
    await expect(this.page.getByTestId('forgot-password-form')).toBeVisible();
  }

  async resetPassword(email: string) {
    await this.clickForgotPassword();
    await this.page.getByTestId('reset-email-input').fill(email);
    await this.page.getByTestId('reset-password-button').click();
    await waitForLoadingComplete(this.page);
  }

  async expectResetPasswordSuccess() {
    await expect(this.successMessage).toContainText('reset', { ignoreCase: true });
  }

  // Test helper methods
  async fillValidCredentials() {
    await this.fillEmail('test@example.com');
    await this.fillPassword('password123');
  }

  async fillInvalidEmail() {
    await this.fillEmail('invalid-email');
  }

  async fillWeakPassword() {
    await this.fillPassword('123');
  }

  async fillMismatchedPasswords() {
    await this.fillPassword('password123');
    await this.fillConfirmPassword('different-password');
  }

  async expectFormValidation() {
    // Check that form prevents submission with invalid data
    await expect(this.loginButton).toBeDisabled();
  }

  async expectFormReady() {
    // Check that form allows submission with valid data
    await expect(this.loginButton).toBeEnabled();
  }
}