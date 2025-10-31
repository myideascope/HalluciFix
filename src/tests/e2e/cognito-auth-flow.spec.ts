import { test, expect } from '@playwright/test';

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:5173',
  testUser: {
    email: 'test@example.com',
    password: 'TestPassword123!',
    name: 'Test User',
  },
  timeout: 30000,
};

test.describe('Cognito Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Enable migration mode and set to Cognito
    await page.addInitScript(() => {
      localStorage.setItem('hallucifix_auth_mode', 'cognito');
    });
    
    await page.goto(TEST_CONFIG.baseUrl);
  });

  test.describe('Sign Up Flow', () => {
    test('should complete email/password sign up', async ({ page }) => {
      // Navigate to sign up
      await page.click('[data-testid="sign-up-button"]');
      
      // Fill sign up form
      await page.fill('[data-testid="email-input"]', TEST_CONFIG.testUser.email);
      await page.fill('[data-testid="password-input"]', TEST_CONFIG.testUser.password);
      await page.fill('[data-testid="confirm-password-input"]', TEST_CONFIG.testUser.password);
      await page.fill('[data-testid="name-input"]', TEST_CONFIG.testUser.name);
      
      // Submit sign up
      await page.click('[data-testid="submit-sign-up"]');
      
      // Should show email verification message
      await expect(page.locator('[data-testid="verification-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="verification-message"]')).toContainText('verify your email');
    });

    test('should show validation errors for invalid input', async ({ page }) => {
      await page.click('[data-testid="sign-up-button"]');
      
      // Try to submit with invalid email
      await page.fill('[data-testid="email-input"]', 'invalid-email');
      await page.fill('[data-testid="password-input"]', 'weak');
      await page.click('[data-testid="submit-sign-up"]');
      
      // Should show validation errors
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="password-error"]')).toBeVisible();
    });

    test('should handle existing user error', async ({ page }) => {
      await page.click('[data-testid="sign-up-button"]');
      
      // Mock existing user response
      await page.route('**/auth/signup', async route => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'UsernameExistsException',
            message: 'An account with this email already exists.',
          }),
        });
      });
      
      await page.fill('[data-testid="email-input"]', 'existing@example.com');
      await page.fill('[data-testid="password-input"]', TEST_CONFIG.testUser.password);
      await page.click('[data-testid="submit-sign-up"]');
      
      await expect(page.locator('[data-testid="auth-error"]')).toContainText('already exists');
    });
  });

  test.describe('Sign In Flow', () => {
    test('should complete email/password sign in', async ({ page }) => {
      // Mock successful sign in
      await page.route('**/auth/signin', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'user-123',
              email: TEST_CONFIG.testUser.email,
              name: TEST_CONFIG.testUser.name,
            },
            session: {
              accessToken: 'mock-access-token',
              refreshToken: 'mock-refresh-token',
            },
          }),
        });
      });
      
      // Fill sign in form
      await page.fill('[data-testid="email-input"]', TEST_CONFIG.testUser.email);
      await page.fill('[data-testid="password-input"]', TEST_CONFIG.testUser.password);
      
      // Submit sign in
      await page.click('[data-testid="submit-sign-in"]');
      
      // Should redirect to dashboard
      await expect(page).toHaveURL(/.*dashboard/);
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-name"]')).toContainText(TEST_CONFIG.testUser.name);
    });

    test('should handle invalid credentials', async ({ page }) => {
      // Mock authentication error
      await page.route('**/auth/signin', async route => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'NotAuthorizedException',
            message: 'Invalid email or password.',
          }),
        });
      });
      
      await page.fill('[data-testid="email-input"]', TEST_CONFIG.testUser.email);
      await page.fill('[data-testid="password-input"]', 'wrongpassword');
      await page.click('[data-testid="submit-sign-in"]');
      
      await expect(page.locator('[data-testid="auth-error"]')).toContainText('Invalid email or password');
    });

    test('should handle unverified email', async ({ page }) => {
      // Mock unverified user error
      await page.route('**/auth/signin', async route => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'UserNotConfirmedException',
            message: 'Please verify your email address before signing in.',
          }),
        });
      });
      
      await page.fill('[data-testid="email-input"]', 'unverified@example.com');
      await page.fill('[data-testid="password-input"]', TEST_CONFIG.testUser.password);
      await page.click('[data-testid="submit-sign-in"]');
      
      await expect(page.locator('[data-testid="auth-error"]')).toContainText('verify your email');
      await expect(page.locator('[data-testid="resend-verification"]')).toBeVisible();
    });
  });

  test.describe('Google OAuth Flow', () => {
    test('should initiate Google OAuth', async ({ page }) => {
      // Mock OAuth initiation
      await page.route('**/auth/oauth/google', async route => {
        await route.fulfill({
          status: 302,
          headers: {
            'Location': 'https://accounts.google.com/oauth/authorize?client_id=test&redirect_uri=http://localhost:5173/auth/callback',
          },
        });
      });
      
      // Click Google sign in button
      await page.click('[data-testid="google-signin-button"]');
      
      // Should redirect to Google OAuth (we'll mock this)
      await expect(page).toHaveURL(/.*accounts\.google\.com/);
    });

    test('should handle OAuth callback', async ({ page }) => {
      // Navigate directly to OAuth callback with mock parameters
      await page.goto(`${TEST_CONFIG.baseUrl}/auth/callback?code=mock_auth_code&state=mock_state`);
      
      // Mock successful OAuth callback processing
      await page.route('**/auth/oauth/callback', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'google-user-123',
              email: 'test@gmail.com',
              name: 'Test User',
              avatar: 'https://lh3.googleusercontent.com/avatar.jpg',
            },
            session: {
              accessToken: 'mock-oauth-access-token',
              refreshToken: 'mock-oauth-refresh-token',
            },
          }),
        });
      });
      
      // Should process callback and redirect to dashboard
      await expect(page).toHaveURL(/.*dashboard/);
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test('should handle OAuth error', async ({ page }) => {
      // Navigate to OAuth callback with error
      await page.goto(`${TEST_CONFIG.baseUrl}/auth/callback?error=access_denied&error_description=User%20denied%20access`);
      
      // Should show OAuth error message
      await expect(page.locator('[data-testid="oauth-error"]')).toContainText('access denied');
      await expect(page.locator('[data-testid="back-to-signin"]')).toBeVisible();
    });
  });

  test.describe('MFA Flow', () => {
    test('should handle TOTP MFA challenge', async ({ page }) => {
      // Mock sign in that requires MFA
      await page.route('**/auth/signin', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            challengeName: 'SOFTWARE_TOKEN_MFA',
            session: 'mock-mfa-session',
          }),
        });
      });
      
      await page.fill('[data-testid="email-input"]', TEST_CONFIG.testUser.email);
      await page.fill('[data-testid="password-input"]', TEST_CONFIG.testUser.password);
      await page.click('[data-testid="submit-sign-in"]');
      
      // Should show MFA challenge form
      await expect(page.locator('[data-testid="mfa-challenge"]')).toBeVisible();
      await expect(page.locator('[data-testid="totp-input"]')).toBeVisible();
      
      // Mock successful MFA verification
      await page.route('**/auth/mfa/verify', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'user-123',
              email: TEST_CONFIG.testUser.email,
              name: TEST_CONFIG.testUser.name,
            },
          }),
        });
      });
      
      await page.fill('[data-testid="totp-input"]', '123456');
      await page.click('[data-testid="verify-mfa"]');
      
      // Should complete authentication
      await expect(page).toHaveURL(/.*dashboard/);
    });

    test('should handle SMS MFA challenge', async ({ page }) => {
      // Mock sign in that requires SMS MFA
      await page.route('**/auth/signin', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            challengeName: 'SMS_MFA',
            session: 'mock-sms-session',
          }),
        });
      });
      
      await page.fill('[data-testid="email-input"]', TEST_CONFIG.testUser.email);
      await page.fill('[data-testid="password-input"]', TEST_CONFIG.testUser.password);
      await page.click('[data-testid="submit-sign-in"]');
      
      // Should show SMS MFA challenge
      await expect(page.locator('[data-testid="sms-mfa-challenge"]')).toBeVisible();
      await expect(page.locator('[data-testid="sms-code-input"]')).toBeVisible();
    });

    test('should handle invalid MFA code', async ({ page }) => {
      // Set up MFA challenge first
      await page.route('**/auth/signin', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            challengeName: 'SOFTWARE_TOKEN_MFA',
            session: 'mock-mfa-session',
          }),
        });
      });
      
      await page.fill('[data-testid="email-input"]', TEST_CONFIG.testUser.email);
      await page.fill('[data-testid="password-input"]', TEST_CONFIG.testUser.password);
      await page.click('[data-testid="submit-sign-in"]');
      
      // Mock invalid MFA code response
      await page.route('**/auth/mfa/verify', async route => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'CodeMismatchException',
            message: 'Invalid MFA code.',
          }),
        });
      });
      
      await page.fill('[data-testid="totp-input"]', 'invalid');
      await page.click('[data-testid="verify-mfa"]');
      
      await expect(page.locator('[data-testid="mfa-error"]')).toContainText('Invalid MFA code');
    });
  });

  test.describe('Password Reset Flow', () => {
    test('should initiate password reset', async ({ page }) => {
      await page.click('[data-testid="forgot-password-link"]');
      
      // Should show forgot password form
      await expect(page.locator('[data-testid="forgot-password-form"]')).toBeVisible();
      
      // Mock successful password reset initiation
      await page.route('**/auth/forgot-password', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            CodeDeliveryDetails: {
              Destination: 't***@example.com',
            },
          }),
        });
      });
      
      await page.fill('[data-testid="reset-email-input"]', TEST_CONFIG.testUser.email);
      await page.click('[data-testid="send-reset-code"]');
      
      // Should show confirmation message
      await expect(page.locator('[data-testid="reset-code-sent"]')).toContainText('reset code sent');
    });

    test('should complete password reset', async ({ page }) => {
      // Navigate to reset confirmation (would normally come from email link)
      await page.goto(`${TEST_CONFIG.baseUrl}/auth/reset-password?email=${TEST_CONFIG.testUser.email}`);
      
      // Mock successful password reset
      await page.route('**/auth/confirm-password', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });
      
      await page.fill('[data-testid="reset-code-input"]', '123456');
      await page.fill('[data-testid="new-password-input"]', 'NewPassword123!');
      await page.fill('[data-testid="confirm-new-password-input"]', 'NewPassword123!');
      await page.click('[data-testid="confirm-password-reset"]');
      
      // Should redirect to sign in with success message
      await expect(page).toHaveURL(/.*signin/);
      await expect(page.locator('[data-testid="password-reset-success"]')).toContainText('password reset successful');
    });
  });

  test.describe('Session Management', () => {
    test('should maintain session across page reloads', async ({ page }) => {
      // Mock authenticated state
      await page.addInitScript(() => {
        localStorage.setItem('cognito_session', JSON.stringify({
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          user: {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
          },
        }));
      });
      
      await page.reload();
      
      // Should still be authenticated
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test('should handle session expiration', async ({ page }) => {
      // Mock expired session
      await page.route('**/auth/refresh', async route => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'TokenExpiredException',
            message: 'Session expired',
          }),
        });
      });
      
      // Trigger session check
      await page.goto(`${TEST_CONFIG.baseUrl}/dashboard`);
      
      // Should redirect to sign in
      await expect(page).toHaveURL(/.*signin/);
      await expect(page.locator('[data-testid="session-expired-message"]')).toBeVisible();
    });

    test('should sign out successfully', async ({ page }) => {
      // Set up authenticated state
      await page.addInitScript(() => {
        localStorage.setItem('cognito_session', JSON.stringify({
          user: { id: 'user-123', email: 'test@example.com' },
        }));
      });
      
      await page.goto(`${TEST_CONFIG.baseUrl}/dashboard`);
      
      // Mock sign out
      await page.route('**/auth/signout', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });
      
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="sign-out-button"]');
      
      // Should redirect to landing page
      await expect(page).toHaveURL(TEST_CONFIG.baseUrl);
      await expect(page.locator('[data-testid="sign-in-button"]')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // Mock network error
      await page.route('**/auth/signin', async route => {
        await route.abort('failed');
      });
      
      await page.fill('[data-testid="email-input"]', TEST_CONFIG.testUser.email);
      await page.fill('[data-testid="password-input"]', TEST_CONFIG.testUser.password);
      await page.click('[data-testid="submit-sign-in"]');
      
      await expect(page.locator('[data-testid="network-error"]')).toContainText('network error');
      await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
    });

    test('should show loading states', async ({ page }) => {
      // Mock slow response
      await page.route('**/auth/signin', async route => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: { id: 'user-123' } }),
        });
      });
      
      await page.fill('[data-testid="email-input"]', TEST_CONFIG.testUser.email);
      await page.fill('[data-testid="password-input"]', TEST_CONFIG.testUser.password);
      await page.click('[data-testid="submit-sign-in"]');
      
      // Should show loading state
      await expect(page.locator('[data-testid="auth-loading"]')).toBeVisible();
      await expect(page.locator('[data-testid="submit-sign-in"]')).toBeDisabled();
    });
  });
});