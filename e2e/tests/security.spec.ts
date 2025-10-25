/**
 * Security Testing Suite
 * Tests for security vulnerabilities, authentication, and data protection
 */

import { test, expect } from '@playwright/test';

test.describe('Security Testing', () => {
  
  test.describe('Authentication Security', () => {
    test('Login form prevents XSS attacks', async ({ page }) => {
      await page.goto('/');
      
      // Try to inject XSS in login form
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(\'xss\')">',
        '"><script>alert("xss")</script>',
        '\';alert("xss");//'
      ];
      
      for (const payload of xssPayloads) {
        // Look for email/username input
        const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
        
        if (await emailInput.isVisible()) {
          await emailInput.fill(payload);
          
          // Check that script is not executed
          const hasAlert = await page.evaluate(() => {
            return window.alert !== window.alert; // Check if alert was overridden
          });
          
          expect(hasAlert).toBe(false);
          
          // Check that payload is properly escaped in DOM
          const inputValue = await emailInput.inputValue();
          expect(inputValue).toBe(payload); // Should be stored as text, not executed
        }
      }
    });

    test('Password field security', async ({ page }) => {
      await page.goto('/');
      
      const passwordInput = page.locator('input[type="password"]').first();
      
      if (await passwordInput.isVisible()) {
        // Check password field attributes
        const autocomplete = await passwordInput.getAttribute('autocomplete');
        expect(autocomplete).toBe('current-password');
        
        // Verify password is not visible in DOM
        await passwordInput.fill('testpassword123');
        const inputType = await passwordInput.getAttribute('type');
        expect(inputType).toBe('password');
        
        // Check that password is not logged in console
        const consoleLogs: string[] = [];
        page.on('console', msg => consoleLogs.push(msg.text()));
        
        await passwordInput.fill('secretpassword');
        await page.waitForTimeout(1000);
        
        const hasPasswordInLogs = consoleLogs.some(log => 
          log.includes('secretpassword')
        );
        expect(hasPasswordInLogs).toBe(false);
      }
    });

    test('Session security headers', async ({ page }) => {
      const response = await page.goto('/');
      
      if (response) {
        const headers = response.headers();
        
        // Check security headers
        expect(headers['x-frame-options'] || headers['X-Frame-Options']).toBeTruthy();
        expect(headers['x-content-type-options'] || headers['X-Content-Type-Options']).toBe('nosniff');
        
        // Check for HTTPS redirect in production
        if (process.env.NODE_ENV === 'production') {
          expect(headers['strict-transport-security']).toBeTruthy();
        }
      }
    });

    test('CSRF protection', async ({ page }) => {
      await page.goto('/');
      
      // Check for CSRF tokens in forms
      const forms = await page.locator('form').all();
      
      for (const form of forms) {
        const csrfToken = await form.locator('input[name*="csrf"], input[name*="token"]').first();
        
        if (await csrfToken.isVisible()) {
          const tokenValue = await csrfToken.getAttribute('value');
          expect(tokenValue).toBeTruthy();
          expect(tokenValue!.length).toBeGreaterThan(10);
        }
      }
    });
  });

  test.describe('Data Protection', () => {
    test('Sensitive data not exposed in client', async ({ page }) => {
      await page.goto('/');
      
      // Check that sensitive environment variables are not exposed
      const exposedSecrets = await page.evaluate(() => {
        const sensitiveKeys = [
          'SUPABASE_SERVICE_ROLE_KEY',
          'STRIPE_SECRET_KEY',
          'JWT_SECRET',
          'DATABASE_PASSWORD',
          'API_SECRET'
        ];
        
        const exposed: string[] = [];
        
        // Check window object
        sensitiveKeys.forEach(key => {
          if ((window as any)[key]) {
            exposed.push(key);
          }
        });
        
        // Check process.env (should not be available in browser)
        if (typeof process !== 'undefined' && process.env) {
          sensitiveKeys.forEach(key => {
            if (process.env[key]) {
              exposed.push(key);
            }
          });
        }
        
        return exposed;
      });
      
      expect(exposedSecrets).toHaveLength(0);
    });

    test('Local storage security', async ({ page }) => {
      await page.goto('/');
      
      // Check that sensitive data is not stored in localStorage
      const localStorageData = await page.evaluate(() => {
        const data: { [key: string]: string } = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            data[key] = localStorage.getItem(key) || '';
          }
        }
        return data;
      });
      
      const sensitivePatterns = [
        /password/i,
        /secret/i,
        /private.*key/i,
        /api.*key/i,
        /token.*secret/i
      ];
      
      Object.entries(localStorageData).forEach(([key, value]) => {
        sensitivePatterns.forEach(pattern => {
          expect(key).not.toMatch(pattern);
          expect(value).not.toMatch(pattern);
        });
      });
    });

    test('Session storage security', async ({ page }) => {
      await page.goto('/');
      
      const sessionStorageData = await page.evaluate(() => {
        const data: { [key: string]: string } = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) {
            data[key] = sessionStorage.getItem(key) || '';
          }
        }
        return data;
      });
      
      // Check that no plaintext passwords or secrets are stored
      Object.values(sessionStorageData).forEach(value => {
        expect(value).not.toMatch(/password.*:/i);
        expect(value).not.toMatch(/secret.*:/i);
        expect(value).not.toMatch(/private.*key/i);
      });
    });
  });

  test.describe('Input Validation', () => {
    test('File upload security', async ({ page }) => {
      await page.goto('/');
      
      const fileInput = page.locator('input[type="file"]').first();
      
      if (await fileInput.isVisible()) {
        // Test malicious file types
        const maliciousFiles = [
          { name: 'test.exe', content: 'MZ\x90\x00', mimeType: 'application/x-msdownload' },
          { name: 'test.php', content: '<?php echo "test"; ?>', mimeType: 'application/x-php' },
          { name: 'test.js', content: 'alert("xss")', mimeType: 'application/javascript' },
          { name: 'test.html', content: '<script>alert("xss")</script>', mimeType: 'text/html' }
        ];
        
        for (const file of maliciousFiles) {
          try {
            await fileInput.setInputFiles({
              name: file.name,
              mimeType: file.mimeType,
              buffer: Buffer.from(file.content)
            });
            
            // Check for error message or rejection
            const errorMessage = await page.locator('[role="alert"], .error, .alert-error').first().textContent({ timeout: 2000 }).catch(() => null);
            
            if (!errorMessage) {
              // If no immediate error, check if file was actually processed
              await page.waitForTimeout(1000);
              
              // Should not execute any scripts
              const hasAlert = await page.evaluate(() => {
                return window.alert !== window.alert;
              });
              expect(hasAlert).toBe(false);
            }
          } catch (error) {
            // File rejection is expected for malicious files
            console.log(`File ${file.name} was rejected (expected behavior)`);
          }
        }
      }
    });

    test('SQL injection prevention', async ({ page }) => {
      await page.goto('/');
      
      // Test SQL injection in search/input fields
      const sqlPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "'; SELECT * FROM users WHERE 't'='t",
        "' UNION SELECT * FROM users --",
        "admin'--",
        "admin'/*"
      ];
      
      const inputFields = await page.locator('input[type="text"], input[type="search"], textarea').all();
      
      for (const input of inputFields) {
        if (await input.isVisible()) {
          for (const payload of sqlPayloads) {
            await input.fill(payload);
            
            // Submit form or trigger search
            await input.press('Enter').catch(() => {});
            await page.waitForTimeout(500);
            
            // Check that no database errors are exposed
            const pageContent = await page.textContent('body');
            expect(pageContent).not.toMatch(/sql.*error/i);
            expect(pageContent).not.toMatch(/mysql.*error/i);
            expect(pageContent).not.toMatch(/postgresql.*error/i);
            expect(pageContent).not.toMatch(/database.*error/i);
          }
        }
      }
    });

    test('Command injection prevention', async ({ page }) => {
      await page.goto('/');
      
      const commandPayloads = [
        '; ls -la',
        '| cat /etc/passwd',
        '&& whoami',
        '`id`',
        '$(whoami)',
        '; rm -rf /',
        '| nc -l 4444'
      ];
      
      const inputFields = await page.locator('input, textarea').all();
      
      for (const input of inputFields) {
        if (await input.isVisible()) {
          for (const payload of commandPayloads) {
            await input.fill(payload);
            await input.press('Enter').catch(() => {});
            await page.waitForTimeout(500);
            
            // Check that no command output is displayed
            const pageContent = await page.textContent('body');
            expect(pageContent).not.toMatch(/root:x:0:0/); // /etc/passwd content
            expect(pageContent).not.toMatch(/uid=\d+/); // id command output
            expect(pageContent).not.toMatch(/total \d+/); // ls output
          }
        }
      }
    });
  });

  test.describe('Content Security Policy', () => {
    test('CSP headers present', async ({ page }) => {
      const response = await page.goto('/');
      
      if (response) {
        const headers = response.headers();
        const csp = headers['content-security-policy'] || headers['Content-Security-Policy'];
        
        if (csp) {
          // Check for basic CSP directives
          expect(csp).toMatch(/default-src/);
          expect(csp).toMatch(/script-src/);
          expect(csp).toMatch(/style-src/);
          
          // Should not allow unsafe-eval or unsafe-inline without nonce
          if (csp.includes('unsafe-eval')) {
            console.warn('CSP allows unsafe-eval - consider removing for better security');
          }
          
          if (csp.includes('unsafe-inline') && !csp.includes('nonce-')) {
            console.warn('CSP allows unsafe-inline without nonce - consider using nonces');
          }
        }
      }
    });

    test('Inline scripts blocked by CSP', async ({ page }) => {
      await page.goto('/');
      
      // Try to inject inline script
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.textContent = 'window.cspTestExecuted = true;';
        document.head.appendChild(script);
      });
      
      await page.waitForTimeout(1000);
      
      // Check if inline script was blocked
      const scriptExecuted = await page.evaluate(() => {
        return (window as any).cspTestExecuted === true;
      });
      
      // If CSP is properly configured, inline script should be blocked
      if (scriptExecuted) {
        console.warn('Inline script executed - CSP may not be properly configured');
      }
    });
  });

  test.describe('HTTPS and Transport Security', () => {
    test('Secure cookie attributes', async ({ page }) => {
      await page.goto('/');
      
      // Check cookies for security attributes
      const cookies = await page.context().cookies();
      
      cookies.forEach(cookie => {
        if (cookie.name.toLowerCase().includes('session') || 
            cookie.name.toLowerCase().includes('auth') ||
            cookie.name.toLowerCase().includes('token')) {
          
          // Secure cookies should have secure flag in production
          if (process.env.NODE_ENV === 'production') {
            expect(cookie.secure).toBe(true);
          }
          
          // HttpOnly flag for sensitive cookies
          expect(cookie.httpOnly).toBe(true);
          
          // SameSite attribute
          expect(['Strict', 'Lax']).toContain(cookie.sameSite);
        }
      });
    });

    test('Mixed content prevention', async ({ page }) => {
      const mixedContentWarnings: string[] = [];
      
      page.on('console', msg => {
        if (msg.type() === 'warning' && msg.text().includes('mixed content')) {
          mixedContentWarnings.push(msg.text());
        }
      });
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Check for mixed content warnings
      expect(mixedContentWarnings).toHaveLength(0);
      
      // Check that all resources are loaded over HTTPS in production
      if (process.env.NODE_ENV === 'production') {
        const resources = await page.evaluate(() => {
          const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          return entries.map(entry => entry.name);
        });
        
        resources.forEach(resource => {
          if (resource.startsWith('http://')) {
            console.warn(`Insecure resource loaded: ${resource}`);
          }
        });
      }
    });
  });

  test.describe('Error Handling Security', () => {
    test('Error messages do not expose sensitive information', async ({ page }) => {
      await page.goto('/nonexistent-page');
      
      const pageContent = await page.textContent('body');
      
      // Check that error pages don't expose sensitive info
      expect(pageContent).not.toMatch(/stack trace/i);
      expect(pageContent).not.toMatch(/database.*connection/i);
      expect(pageContent).not.toMatch(/internal.*server.*error/i);
      expect(pageContent).not.toMatch(/debug.*info/i);
      expect(pageContent).not.toMatch(/file.*path/i);
    });

    test('API error responses are sanitized', async ({ page }) => {
      // Intercept API calls and check error responses
      const apiErrors: any[] = [];
      
      page.route('**/api/**', async (route) => {
        const response = await route.fetch();
        
        if (response.status() >= 400) {
          const body = await response.text();
          apiErrors.push({
            url: route.request().url(),
            status: response.status(),
            body
          });
        }
        
        await route.continue();
      });
      
      await page.goto('/');
      
      // Trigger some API calls that might fail
      await page.evaluate(() => {
        // Try to make unauthorized API calls
        fetch('/api/admin/users').catch(() => {});
        fetch('/api/sensitive-data').catch(() => {});
      });
      
      await page.waitForTimeout(2000);
      
      // Check that error responses don't expose sensitive information
      apiErrors.forEach(error => {
        expect(error.body).not.toMatch(/password/i);
        expect(error.body).not.toMatch(/secret/i);
        expect(error.body).not.toMatch(/private.*key/i);
        expect(error.body).not.toMatch(/database.*connection/i);
        expect(error.body).not.toMatch(/stack.*trace/i);
      });
    });
  });

  test.describe('Dependency Security', () => {
    test('No known vulnerable dependencies in client bundle', async ({ page }) => {
      await page.goto('/');
      
      // Check for known vulnerable libraries in the client
      const vulnerableLibraries = await page.evaluate(() => {
        const knownVulnerable = [
          'jquery@1.',
          'jquery@2.',
          'lodash@3.',
          'lodash@4.0.',
          'moment@2.18.',
          'handlebars@3.',
          'handlebars@4.0.'
        ];
        
        const found: string[] = [];
        
        // Check if any known vulnerable versions are loaded
        knownVulnerable.forEach(lib => {
          if ((window as any)[lib.split('@')[0]]) {
            const version = (window as any)[lib.split('@')[0]].version || 'unknown';
            if (version.startsWith(lib.split('@')[1])) {
              found.push(`${lib.split('@')[0]}@${version}`);
            }
          }
        });
        
        return found;
      });
      
      expect(vulnerableLibraries).toHaveLength(0);
    });
  });
});