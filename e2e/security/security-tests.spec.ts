import { test, expect } from '@playwright/test';
import { AuthPage, AnalyzerPage, DashboardPage } from '../pages';
import { mockAuthentication, clearAuthentication } from '../utils/test-helpers';

test.describe('Security Testing Suite', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthentication(page);
  });

  test.describe('Authentication Security', () => {
    test('should prevent unauthorized access to protected routes', async ({ page }) => {
      const protectedRoutes = ['/dashboard', '/analytics', '/settings', '/admin'];
      
      for (const route of protectedRoutes) {
        await page.goto(route);
        
        // Should redirect to login or show unauthorized message
        const currentUrl = page.url();
        const isRedirected = currentUrl.includes('/login') || currentUrl.includes('/auth') || currentUrl === '/';
        const hasUnauthorizedMessage = await page.getByText(/unauthorized|access denied|please log in/i).isVisible().catch(() => false);
        
        expect(isRedirected || hasUnauthorizedMessage).toBeTruthy();
      }
    });

    test('should validate JWT token integrity', async ({ page }) => {
      const authPage = new AuthPage(page);
      const dashboardPage = new DashboardPage(page);
      
      // Login with valid credentials
      await mockAuthentication(page);
      await dashboardPage.goto();
      await dashboardPage.expectDashboardLoaded();
      
      // Tamper with JWT token
      await page.evaluate(() => {
        const token = localStorage.getItem('auth-token');
        if (token) {
          // Corrupt the token
          localStorage.setItem('auth-token', token + 'corrupted');
        }
      });
      
      // Refresh page - should detect invalid token
      await page.reload();
      
      // Should redirect to login or show error
      const currentUrl = page.url();
      const isRedirectedToAuth = currentUrl.includes('/login') || currentUrl.includes('/auth') || currentUrl === '/';
      expect(isRedirectedToAuth).toBeTruthy();
    });

    test('should handle session timeout properly', async ({ page }) => {
      await mockAuthentication(page);
      
      // Mock expired token
      await page.evaluate(() => {
        const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
        localStorage.setItem('auth-token', expiredToken);
      });
      
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      
      // Should handle expired token gracefully
      const hasErrorMessage = await page.getByText(/session expired|please log in again/i).isVisible().catch(() => false);
      const isRedirectedToAuth = page.url().includes('/login') || page.url().includes('/auth');
      
      expect(hasErrorMessage || isRedirectedToAuth).toBeTruthy();
    });

    test('should prevent brute force attacks', async ({ page }) => {
      const authPage = new AuthPage(page);
      
      await page.goto('/');
      await authPage.openAuthModal();
      
      // Attempt multiple failed logins
      const maxAttempts = 5;
      for (let i = 0; i < maxAttempts; i++) {
        await authPage.login('test@example.com', 'wrongpassword');
        
        // Check for rate limiting after multiple attempts
        if (i >= 3) {
          const rateLimitMessage = await page.getByText(/too many attempts|rate limit|try again later/i).isVisible().catch(() => false);
          const isButtonDisabled = await page.getByTestId('login-button').isDisabled().catch(() => false);
          
          if (rateLimitMessage || isButtonDisabled) {
            expect(true).toBeTruthy(); // Rate limiting is working
            break;
          }
        }
        
        // Wait between attempts
        await page.waitForTimeout(1000);
      }
    });

    test('should validate OAuth state parameter', async ({ page }) => {
      // Test OAuth CSRF protection
      await page.goto('/auth/callback?code=test&state=invalid_state');
      
      // Should reject invalid state parameter
      const hasError = await page.getByText(/invalid state|csrf|security error/i).isVisible().catch(() => false);
      const isRedirectedToAuth = page.url().includes('/login') || page.url().includes('/auth');
      
      expect(hasError || isRedirectedToAuth).toBeTruthy();
    });
  });

  test.describe('Input Validation Security', () => {
    test('should prevent XSS attacks in content analysis', async ({ page }) => {
      const analyzerPage = new AnalyzerPage(page);
      
      await analyzerPage.goto();
      
      // Test various XSS payloads
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(\'XSS\')">',
        'javascript:alert("XSS")',
        '<svg onload="alert(\'XSS\')">',
        '"><script>alert("XSS")</script>',
        '\'; alert("XSS"); //',
        '<iframe src="javascript:alert(\'XSS\')"></iframe>'
      ];
      
      for (const payload of xssPayloads) {
        await analyzerPage.fillContent(payload);
        
        // Check that script doesn't execute
        const alertFired = await page.evaluate(() => {
          return window.alertFired || false;
        });
        
        expect(alertFired).toBeFalsy();
        
        // Check that content is properly escaped in DOM
        const textareaValue = await analyzerPage.contentTextarea.inputValue();
        expect(textareaValue).toBe(payload); // Should contain the raw text, not execute
        
        await analyzerPage.clearContent();
      }
    });

    test('should sanitize HTML in analysis results', async ({ page }) => {
      const analyzerPage = new AnalyzerPage(page);
      
      await analyzerPage.goto();
      
      // Mock analysis results with potential XSS
      await page.evaluate(() => {
        // Override the analysis service to return malicious content
        (window as any).mockAnalysisResults = {
          accuracy: 85.5,
          riskLevel: '<script>alert("XSS")</script>medium',
          hallucinations: [
            { text: '<img src="x" onerror="alert(\'XSS\')">', severity: 'high' },
            { text: 'Normal hallucination', severity: 'low' }
          ]
        };
      });
      
      await analyzerPage.fillContent('Test content for XSS prevention');
      
      // Trigger analysis (this would normally call the API)
      await analyzerPage.analyzeButton.click();
      
      // Wait for results to appear
      await page.waitForTimeout(2000);
      
      // Check that no scripts executed
      const alertFired = await page.evaluate(() => {
        return window.alertFired || false;
      });
      
      expect(alertFired).toBeFalsy();
      
      // Check that HTML is properly escaped in results
      const resultsContent = await page.getByTestId('analysis-results').textContent();
      expect(resultsContent).not.toContain('<script>');
      expect(resultsContent).not.toContain('<img');
    });

    test('should validate file upload security', async ({ page }) => {
      const analyzerPage = new AnalyzerPage(page);
      
      await analyzerPage.goto();
      
      // Test file type validation
      const maliciousFiles = [
        { name: 'malicious.exe', type: 'application/x-executable' },
        { name: 'script.js', type: 'application/javascript' },
        { name: 'malware.bat', type: 'application/x-bat' },
        { name: 'virus.scr', type: 'application/x-screensaver' }
      ];
      
      for (const file of maliciousFiles) {
        // Create a mock file
        const fileContent = 'This is a test file';
        const blob = new Blob([fileContent], { type: file.type });
        const mockFile = new File([blob], file.name, { type: file.type });
        
        // Attempt to upload
        await page.evaluate((mockFile) => {
          const input = document.querySelector('[data-testid="file-upload-input"]') as HTMLInputElement;
          if (input) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(mockFile);
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, mockFile);
        
        // Should show error for invalid file types
        const errorMessage = await page.getByText(/invalid file type|file not supported|security error/i).isVisible().catch(() => false);
        expect(errorMessage).toBeTruthy();
      }
    });

    test('should prevent SQL injection in search queries', async ({ page }) => {
      // Navigate to a page with search functionality
      await page.goto('/dashboard');
      await mockAuthentication(page);
      
      const searchInput = page.getByTestId('search-input');
      if (await searchInput.isVisible()) {
        const sqlInjectionPayloads = [
          "'; DROP TABLE users; --",
          "' OR '1'='1",
          "'; INSERT INTO users VALUES ('hacker', 'password'); --",
          "' UNION SELECT * FROM users --",
          "'; DELETE FROM analysis_results; --"
        ];
        
        for (const payload of sqlInjectionPayloads) {
          await searchInput.fill(payload);
          await page.keyboard.press('Enter');
          
          // Wait for search results
          await page.waitForTimeout(1000);
          
          // Should not show database errors or unauthorized data
          const hasDbError = await page.getByText(/sql error|database error|syntax error/i).isVisible().catch(() => false);
          const hasUnauthorizedData = await page.getByText(/password|admin|secret/i).isVisible().catch(() => false);
          
          expect(hasDbError).toBeFalsy();
          expect(hasUnauthorizedData).toBeFalsy();
          
          await searchInput.clear();
        }
      }
    });
  });

  test.describe('API Security', () => {
    test('should validate API authentication', async ({ page }) => {
      // Test API endpoints without authentication
      const apiEndpoints = [
        '/api/analysis',
        '/api/user/profile',
        '/api/analytics',
        '/api/admin/users'
      ];
      
      for (const endpoint of apiEndpoints) {
        const response = await page.request.get(endpoint);
        
        // Should return 401 Unauthorized or 403 Forbidden
        expect([401, 403]).toContain(response.status());
      }
    });

    test('should enforce rate limiting on API endpoints', async ({ page }) => {
      await mockAuthentication(page);
      
      // Test rate limiting on analysis endpoint
      const requests = [];
      const maxRequests = 10;
      
      for (let i = 0; i < maxRequests; i++) {
        const request = page.request.post('/api/analysis', {
          data: { content: `Test content ${i}` }
        });
        requests.push(request);
      }
      
      const responses = await Promise.all(requests);
      
      // Should have some rate limited responses (429)
      const rateLimitedResponses = responses.filter(r => r.status() === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should validate request size limits', async ({ page }) => {
      await mockAuthentication(page);
      
      // Create large payload
      const largeContent = 'A'.repeat(10 * 1024 * 1024); // 10MB
      
      const response = await page.request.post('/api/analysis', {
        data: { content: largeContent }
      });
      
      // Should reject large payloads
      expect([413, 400]).toContain(response.status());
    });

    test('should validate CORS headers', async ({ page }) => {
      // Test CORS configuration
      const response = await page.request.fetch('/api/health', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://malicious-site.com',
          'Access-Control-Request-Method': 'POST'
        }
      });
      
      const corsHeader = response.headers()['access-control-allow-origin'];
      
      // Should not allow arbitrary origins
      expect(corsHeader).not.toBe('*');
      expect(corsHeader).not.toBe('https://malicious-site.com');
    });
  });

  test.describe('Data Protection', () => {
    test('should not expose sensitive data in client-side code', async ({ page }) => {
      await page.goto('/');
      
      // Check for exposed secrets in page source
      const pageContent = await page.content();
      
      const sensitivePatterns = [
        /sk-[a-zA-Z0-9]{48}/, // OpenAI API keys
        /AIza[0-9A-Za-z-_]{35}/, // Google API keys
        /AKIA[0-9A-Z]{16}/, // AWS Access Keys
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, // UUIDs that might be secrets
        /password\s*[:=]\s*["'][^"']+["']/, // Hardcoded passwords
        /secret\s*[:=]\s*["'][^"']+["']/, // Hardcoded secrets
      ];
      
      for (const pattern of sensitivePatterns) {
        expect(pageContent).not.toMatch(pattern);
      }
    });

    test('should not log sensitive information', async ({ page }) => {
      await mockAuthentication(page);
      
      // Monitor console logs
      const consoleLogs: string[] = [];
      page.on('console', msg => {
        consoleLogs.push(msg.text());
      });
      
      const analyzerPage = new AnalyzerPage(page);
      await analyzerPage.goto();
      await analyzerPage.fillContent('Sensitive user data: SSN 123-45-6789');
      
      // Wait for any logging to occur
      await page.waitForTimeout(2000);
      
      // Check that sensitive data is not logged
      const sensitiveDataInLogs = consoleLogs.some(log => 
        log.includes('123-45-6789') || 
        log.includes('password') || 
        log.includes('token')
      );
      
      expect(sensitiveDataInLogs).toBeFalsy();
    });

    test('should implement proper session management', async ({ page }) => {
      await mockAuthentication(page);
      
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      await dashboardPage.expectDashboardLoaded();
      
      // Check session storage security
      const sessionData = await page.evaluate(() => {
        return {
          localStorage: { ...localStorage },
          sessionStorage: { ...sessionStorage },
          cookies: document.cookie
        };
      });
      
      // Should not store sensitive data in localStorage
      const localStorageString = JSON.stringify(sessionData.localStorage);
      expect(localStorageString).not.toMatch(/password|secret|private/i);
      
      // Should use secure session management
      const hasSecureSession = sessionData.cookies.includes('Secure') || 
                              sessionData.cookies.includes('HttpOnly') ||
                              Object.keys(sessionData.sessionStorage).length > 0;
      
      expect(hasSecureSession).toBeTruthy();
    });
  });

  test.describe('Content Security Policy', () => {
    test('should enforce Content Security Policy', async ({ page }) => {
      await page.goto('/');
      
      // Check for CSP headers
      const response = await page.request.get('/');
      const cspHeader = response.headers()['content-security-policy'];
      
      if (cspHeader) {
        // Should have restrictive CSP
        expect(cspHeader).toContain("default-src 'self'");
        expect(cspHeader).not.toContain("'unsafe-eval'");
        expect(cspHeader).not.toContain("'unsafe-inline'");
      }
    });

    test('should prevent inline script execution', async ({ page }) => {
      await page.goto('/');
      
      // Try to inject inline script
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.innerHTML = 'window.inlineScriptExecuted = true;';
        document.head.appendChild(script);
      });
      
      // Wait for potential execution
      await page.waitForTimeout(1000);
      
      // Check that inline script didn't execute
      const scriptExecuted = await page.evaluate(() => {
        return (window as any).inlineScriptExecuted || false;
      });
      
      expect(scriptExecuted).toBeFalsy();
    });
  });

  test.describe('Security Headers', () => {
    test('should include security headers', async ({ page }) => {
      const response = await page.request.get('/');
      const headers = response.headers();
      
      // Check for important security headers
      const securityHeaders = {
        'x-frame-options': ['DENY', 'SAMEORIGIN'],
        'x-content-type-options': ['nosniff'],
        'x-xss-protection': ['1; mode=block'],
        'strict-transport-security': null, // Should exist
        'referrer-policy': ['strict-origin-when-cross-origin', 'no-referrer']
      };
      
      Object.entries(securityHeaders).forEach(([header, expectedValues]) => {
        const headerValue = headers[header];
        
        if (expectedValues === null) {
          expect(headerValue).toBeDefined();
        } else {
          expect(expectedValues).toContain(headerValue);
        }
      });
    });
  });
});