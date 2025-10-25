/**
 * Authentication Utilities for E2E Tests
 * Handles login, logout, and authentication state management
 */

import { Page, BrowserContext } from '@playwright/test';
import { testDatabase } from '../../src/test/utils/testDatabase';

export interface TestUser {
  email: string;
  password: string;
  name: string;
  role: 'user' | 'admin';
  subscription: 'free' | 'basic' | 'pro' | 'enterprise';
}

export const TEST_USERS: Record<string, TestUser> = {
  basicUser: {
    email: 'test.user@example.com',
    password: 'TestPassword123!',
    name: 'Test User',
    role: 'user',
    subscription: 'basic',
  },
  proUser: {
    email: 'premium.user@example.com',
    password: 'PremiumPassword123!',
    name: 'Premium User',
    role: 'user',
    subscription: 'pro',
  },
  adminUser: {
    email: 'admin.user@example.com',
    password: 'AdminPassword123!',
    name: 'Admin User',
    role: 'admin',
    subscription: 'pro',
  },
  freeUser: {
    email: 'free.user@example.com',
    password: 'FreePassword123!',
    name: 'Free User',
    role: 'user',
    subscription: 'free',
  },
};

export class AuthHelper {
  private page: Page;
  private context: BrowserContext;

  constructor(page: Page, context: BrowserContext) {
    this.page = page;
    this.context = context;
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<void> {
    await this.page.goto('/login');
    
    // Wait for login form to be visible
    await this.page.waitForSelector('[data-testid="login-form"]');
    
    // Fill login form
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
    
    // Submit form
    await this.page.click('[data-testid="login-button"]');
    
    // Wait for successful login (redirect to dashboard)
    await this.page.waitForURL('/dashboard', { timeout: 10000 });
    
    // Wait for dashboard to load
    await this.page.waitForSelector('[data-testid="dashboard-header"]');
  }

  /**
   * Login with a predefined test user
   */
  async loginAs(userType: keyof typeof TEST_USERS): Promise<void> {
    const user = TEST_USERS[userType];
    await this.login(user.email, user.password);
  }

  /**
   * Login with Google OAuth (mocked)
   */
  async loginWithGoogle(email: string): Promise<void> {
    // Mock Google OAuth flow
    await this.page.goto('/login');
    
    // Click Google login button
    await this.page.click('[data-testid="google-login-button"]');
    
    // Mock OAuth callback
    await this.page.evaluate((userEmail) => {
      // Simulate successful OAuth callback
      window.postMessage({
        type: 'oauth-success',
        user: {
          email: userEmail,
          name: userEmail.split('@')[0],
          provider: 'google',
        },
      }, '*');
    }, email);
    
    // Wait for redirect to dashboard
    await this.page.waitForURL('/dashboard', { timeout: 10000 });
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    // Open user menu
    await this.page.click('[data-testid="user-avatar"]');
    await this.page.waitForSelector('[data-testid="user-menu"]');
    
    // Click logout
    await this.page.click('[data-testid="logout-button"]');
    
    // Wait for redirect to landing page
    await this.page.waitForURL('/', { timeout: 10000 });
  }

  /**
   * Check if user is logged in
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.waitForSelector('[data-testid="user-avatar"]', { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current user information
   */
  async getCurrentUser(): Promise<{ email: string; name: string; role: string } | null> {
    if (!(await this.isLoggedIn())) {
      return null;
    }

    // Open user menu to get user info
    await this.page.click('[data-testid="user-avatar"]');
    await this.page.waitForSelector('[data-testid="user-menu"]');
    
    const email = await this.page.textContent('[data-testid="user-email"]') || '';
    const name = await this.page.textContent('[data-testid="user-name"]') || '';
    const role = await this.page.getAttribute('[data-testid="user-role"]', 'data-role') || 'user';
    
    // Close user menu
    await this.page.click('[data-testid="user-avatar"]');
    
    return { email, name, role };
  }

  /**
   * Save authentication state to file
   */
  async saveAuthState(filePath: string): Promise<void> {
    await this.context.storageState({ path: filePath });
  }

  /**
   * Load authentication state from file
   */
  async loadAuthState(filePath: string): Promise<void> {
    // This would be used when creating a new context
    // const context = await browser.newContext({ storageState: filePath });
    console.log(`Loading auth state from ${filePath}`);
  }

  /**
   * Create a new user account
   */
  async signup(user: Omit<TestUser, 'subscription'>): Promise<void> {
    await this.page.goto('/signup');
    
    // Wait for signup form
    await this.page.waitForSelector('[data-testid="signup-form"]');
    
    // Fill signup form
    await this.page.fill('[data-testid="name-input"]', user.name);
    await this.page.fill('[data-testid="email-input"]', user.email);
    await this.page.fill('[data-testid="password-input"]', user.password);
    await this.page.fill('[data-testid="confirm-password-input"]', user.password);
    
    // Accept terms
    await this.page.check('[data-testid="terms-checkbox"]');
    
    // Submit form
    await this.page.click('[data-testid="signup-button"]');
    
    // Wait for email verification page or direct login
    try {
      await this.page.waitForURL('/verify-email', { timeout: 5000 });
      // Handle email verification if required
      await this.handleEmailVerification(user.email);
    } catch {
      // Direct login - wait for dashboard
      await this.page.waitForURL('/dashboard', { timeout: 10000 });
    }
  }

  /**
   * Handle email verification (mocked)
   */
  private async handleEmailVerification(email: string): Promise<void> {
    // In a real test, this might involve checking a test email service
    // For now, we'll mock the verification
    await this.page.evaluate((userEmail) => {
      // Simulate clicking verification link
      window.location.href = `/verify-email?token=mock-token&email=${encodeURIComponent(userEmail)}`;
    }, email);
    
    await this.page.waitForURL('/dashboard', { timeout: 10000 });
  }

  /**
   * Reset password
   */
  async resetPassword(email: string, newPassword: string): Promise<void> {
    await this.page.goto('/forgot-password');
    
    // Request password reset
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.click('[data-testid="reset-button"]');
    
    // Wait for confirmation
    await this.page.waitForSelector('[data-testid="reset-sent-message"]');
    
    // Mock clicking reset link from email
    await this.page.goto(`/reset-password?token=mock-reset-token&email=${encodeURIComponent(email)}`);
    
    // Set new password
    await this.page.fill('[data-testid="new-password-input"]', newPassword);
    await this.page.fill('[data-testid="confirm-password-input"]', newPassword);
    await this.page.click('[data-testid="update-password-button"]');
    
    // Wait for success message
    await this.page.waitForSelector('[data-testid="password-updated-message"]');
  }

  /**
   * Change password while logged in
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    // Navigate to settings
    await this.page.goto('/settings');
    await this.page.waitForSelector('[data-testid="settings-page"]');
    
    // Go to security tab
    await this.page.click('[data-testid="security-tab"]');
    
    // Fill password change form
    await this.page.fill('[data-testid="current-password"]', currentPassword);
    await this.page.fill('[data-testid="new-password"]', newPassword);
    await this.page.fill('[data-testid="confirm-new-password"]', newPassword);
    
    // Submit
    await this.page.click('[data-testid="change-password-button"]');
    
    // Wait for success message
    await this.page.waitForSelector('[data-testid="password-changed-message"]');
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: { name?: string; email?: string }): Promise<void> {
    await this.page.goto('/settings');
    await this.page.waitForSelector('[data-testid="settings-page"]');
    
    // Go to profile tab
    await this.page.click('[data-testid="profile-tab"]');
    
    if (updates.name) {
      await this.page.fill('[data-testid="name-input"]', updates.name);
    }
    
    if (updates.email) {
      await this.page.fill('[data-testid="email-input"]', updates.email);
    }
    
    // Save changes
    await this.page.click('[data-testid="save-profile-button"]');
    
    // Wait for success message
    await this.page.waitForSelector('[data-testid="profile-updated-message"]');
  }

  /**
   * Delete user account
   */
  async deleteAccount(password: string): Promise<void> {
    await this.page.goto('/settings');
    await this.page.waitForSelector('[data-testid="settings-page"]');
    
    // Go to account tab
    await this.page.click('[data-testid="account-tab"]');
    
    // Click delete account
    await this.page.click('[data-testid="delete-account-button"]');
    
    // Confirm in modal
    await this.page.waitForSelector('[data-testid="delete-account-modal"]');
    await this.page.fill('[data-testid="confirm-password"]', password);
    await this.page.click('[data-testid="confirm-delete-button"]');
    
    // Wait for redirect to landing page
    await this.page.waitForURL('/', { timeout: 10000 });
  }

  /**
   * Setup test user in database
   */
  async setupTestUser(user: TestUser): Promise<void> {
    const { data, error } = await testDatabase.supabase
      .from('users')
      .upsert({
        email: user.email,
        name: user.name,
        role: user.role,
        access_level: user.subscription === 'free' ? 'free' : 'premium',
        // In a real app, you'd hash the password
        password_hash: `hashed_${user.password}`,
      }, { onConflict: 'email' })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to setup test user: ${error.message}`);
    }

    // Setup subscription if not free
    if (user.subscription !== 'free') {
      await testDatabase.supabase
        .from('user_subscriptions')
        .upsert({
          user_id: data.id,
          plan_id: `price_${user.subscription}_monthly`,
          status: 'active',
          current_period_start: new Date(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }, { onConflict: 'user_id' });
    }
  }

  /**
   * Cleanup test user from database
   */
  async cleanupTestUser(email: string): Promise<void> {
    await testDatabase.supabase
      .from('users')
      .delete()
      .eq('email', email);
  }

  /**
   * Mock authentication for testing
   */
  async mockAuthentication(user: TestUser): Promise<void> {
    // Set authentication cookies/localStorage directly
    await this.page.evaluate((userData) => {
      localStorage.setItem('auth_user', JSON.stringify({
        id: 'test-user-id',
        email: userData.email,
        name: userData.name,
        role: userData.role,
        subscription: userData.subscription,
      }));
      
      localStorage.setItem('auth_token', 'mock-jwt-token');
      localStorage.setItem('auth_expires', (Date.now() + 24 * 60 * 60 * 1000).toString());
    }, user);

    // Reload page to apply authentication
    await this.page.reload();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Clear authentication state
   */
  async clearAuthState(): Promise<void> {
    await this.page.evaluate(() => {
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_expires');
      sessionStorage.clear();
    });

    // Clear cookies
    await this.context.clearCookies();
  }
}