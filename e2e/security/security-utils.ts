import { Page, expect } from '@playwright/test';

/**
 * Security testing utilities
 */

export interface SecurityTestOptions {
  skipAuthTests?: boolean;
  skipXSSTests?: boolean;
  skipSQLInjectionTests?: boolean;
  customPayloads?: string[];
}

/**
 * Common XSS payloads for testing
 */
export const XSS_PAYLOADS = [
  '<script>alert("XSS")</script>',
  '<img src="x" onerror="alert(\'XSS\')">',
  'javascript:alert("XSS")',
  '<svg onload="alert(\'XSS\')">',
  '"><script>alert("XSS")</script>',
  '\'; alert("XSS"); //',
  '<iframe src="javascript:alert(\'XSS\')"></iframe>',
  '<body onload="alert(\'XSS\')">',
  '<input type="image" src="x" onerror="alert(\'XSS\')">',
  '<object data="javascript:alert(\'XSS\')">',
  '<embed src="javascript:alert(\'XSS\')">',
  '<link rel="stylesheet" href="javascript:alert(\'XSS\')">',
  '<style>@import "javascript:alert(\'XSS\')";</style>',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(\'XSS\')">',
  '<form><button formaction="javascript:alert(\'XSS\')">Click</button></form>'
];

/**
 * Common SQL injection payloads for testing
 */
export const SQL_INJECTION_PAYLOADS = [
  "'; DROP TABLE users; --",
  "' OR '1'='1",
  "'; INSERT INTO users VALUES ('hacker', 'password'); --",
  "' UNION SELECT * FROM users --",
  "'; DELETE FROM analysis_results; --",
  "' OR 1=1 --",
  "admin'--",
  "admin'/*",
  "' OR 'x'='x",
  "'; EXEC xp_cmdshell('dir'); --",
  "' UNION SELECT username, password FROM users --",
  "'; UPDATE users SET password='hacked' WHERE username='admin'; --"
];

/**
 * Test XSS vulnerability in input fields
 */
export async function testXSSVulnerability(
  page: Page, 
  inputSelector: string, 
  payloads: string[] = XSS_PAYLOADS
): Promise<boolean> {
  let vulnerabilityFound = false;
  
  for (const payload of payloads) {
    // Clear any existing alerts
    await page.evaluate(() => {
      (window as any).alertFired = false;
      (window as any).originalAlert = window.alert;
      window.alert = () => {
        (window as any).alertFired = true;
      };
    });
    
    // Input the payload
    await page.fill(inputSelector, payload);
    
    // Wait for potential script execution
    await page.waitForTimeout(500);
    
    // Check if alert was triggered
    const alertFired = await page.evaluate(() => {
      return (window as any).alertFired || false;
    });
    
    if (alertFired) {
      vulnerabilityFound = true;
      console.warn(`XSS vulnerability found with payload: ${payload}`);
    }
    
    // Clear the input
    await page.fill(inputSelector, '');
  }
  
  // Restore original alert
  await page.evaluate(() => {
    if ((window as any).originalAlert) {
      window.alert = (window as any).originalAlert;
    }
  });
  
  return vulnerabilityFound;
}

/**
 * Test SQL injection vulnerability in search/input fields
 */
export async function testSQLInjection(
  page: Page,
  inputSelector: string,
  submitSelector?: string,
  payloads: string[] = SQL_INJECTION_PAYLOADS
): Promise<boolean> {
  let vulnerabilityFound = false;
  
  for (const payload of payloads) {
    await page.fill(inputSelector, payload);
    
    if (submitSelector) {
      await page.click(submitSelector);
    } else {
      await page.keyboard.press('Enter');
    }
    
    // Wait for response
    await page.waitForTimeout(1000);
    
    // Check for SQL error messages
    const pageContent = await page.textContent('body');
    const sqlErrorPatterns = [
      /sql syntax/i,
      /mysql error/i,
      /postgresql error/i,
      /sqlite error/i,
      /database error/i,
      /syntax error/i,
      /unexpected token/i,
      /column.*doesn't exist/i,
      /table.*doesn't exist/i
    ];
    
    const hasError = sqlErrorPatterns.some(pattern => 
      pageContent && pattern.test(pageContent)
    );
    
    if (hasError) {
      vulnerabilityFound = true;
      console.warn(`SQL injection vulnerability found with payload: ${payload}`);
    }
    
    // Clear the input
    await page.fill(inputSelector, '');
  }
  
  return vulnerabilityFound;
}

/**
 * Test authentication bypass attempts
 */
export async function testAuthenticationBypass(page: Page): Promise<void> {
  const protectedRoutes = [
    '/dashboard',
    '/admin',
    '/settings',
    '/analytics',
    '/api/user/profile',
    '/api/admin/users'
  ];
  
  for (const route of protectedRoutes) {
    // Try to access without authentication
    const response = await page.request.get(route);
    
    // Should be redirected or receive 401/403
    if (response.status() === 200) {
      const content = await response.text();
      
      // Check if it's actually protected content
      const hasProtectedContent = /dashboard|admin|settings|profile/i.test(content);
      
      if (hasProtectedContent) {
        throw new Error(`Authentication bypass found for route: ${route}`);
      }
    }
    
    expect([401, 403, 302, 404]).toContain(response.status());
  }
}

/**
 * Test CSRF protection
 */
export async function testCSRFProtection(page: Page): Promise<void> {
  // Test state parameter validation for OAuth
  await page.goto('/auth/callback?code=test&state=invalid_state');
  
  const hasError = await page.getByText(/invalid state|csrf|security error/i).isVisible().catch(() => false);
  const isRedirected = !page.url().includes('/callback');
  
  expect(hasError || isRedirected).toBeTruthy();
}

/**
 * Test rate limiting
 */
export async function testRateLimit(
  page: Page,
  endpoint: string,
  maxRequests: number = 10,
  timeWindow: number = 1000
): Promise<void> {
  const requests = [];
  
  for (let i = 0; i < maxRequests; i++) {
    const request = page.request.post(endpoint, {
      data: { test: `request_${i}` }
    });
    requests.push(request);
  }
  
  const responses = await Promise.all(requests);
  const rateLimitedResponses = responses.filter(r => r.status() === 429);
  
  // Should have some rate limited responses
  expect(rateLimitedResponses.length).toBeGreaterThan(0);
}

/**
 * Test file upload security
 */
export async function testFileUploadSecurity(
  page: Page,
  fileInputSelector: string
): Promise<void> {
  const maliciousFiles = [
    { name: 'malicious.exe', content: 'MZ\x90\x00', type: 'application/x-executable' },
    { name: 'script.js', content: 'alert("XSS")', type: 'application/javascript' },
    { name: 'malware.bat', content: '@echo off\necho "malware"', type: 'application/x-bat' },
    { name: 'virus.scr', content: 'screensaver', type: 'application/x-screensaver' },
    { name: 'shell.php', content: '<?php system($_GET["cmd"]); ?>', type: 'application/x-php' }
  ];
  
  for (const file of maliciousFiles) {
    const blob = new Blob([file.content], { type: file.type });
    const mockFile = new File([blob], file.name, { type: file.type });
    
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
}

/**
 * Test Content Security Policy
 */
export async function testCSP(page: Page): Promise<void> {
  const response = await page.request.get('/');
  const cspHeader = response.headers()['content-security-policy'];
  
  if (cspHeader) {
    // Should have restrictive CSP
    expect(cspHeader).toContain("default-src 'self'");
    expect(cspHeader).not.toContain("'unsafe-eval'");
    
    // Test inline script blocking
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.innerHTML = 'window.inlineScriptExecuted = true;';
      document.head.appendChild(script);
    });
    
    await page.waitForTimeout(1000);
    
    const scriptExecuted = await page.evaluate(() => {
      return (window as any).inlineScriptExecuted || false;
    });
    
    expect(scriptExecuted).toBeFalsy();
  }
}

/**
 * Test security headers
 */
export async function testSecurityHeaders(page: Page): Promise<void> {
  const response = await page.request.get('/');
  const headers = response.headers();
  
  const requiredHeaders = {
    'x-frame-options': ['DENY', 'SAMEORIGIN'],
    'x-content-type-options': ['nosniff'],
    'x-xss-protection': ['1; mode=block', '0'], // 0 is also acceptable for modern browsers
    'referrer-policy': ['strict-origin-when-cross-origin', 'no-referrer', 'same-origin']
  };
  
  Object.entries(requiredHeaders).forEach(([header, expectedValues]) => {
    const headerValue = headers[header];
    
    if (headerValue) {
      expect(expectedValues).toContain(headerValue);
    } else {
      console.warn(`Missing security header: ${header}`);
    }
  });
}

/**
 * Test for sensitive data exposure
 */
export async function testSensitiveDataExposure(page: Page): Promise<void> {
  const pageContent = await page.content();
  
  const sensitivePatterns = [
    /sk-[a-zA-Z0-9]{48}/, // OpenAI API keys
    /AIza[0-9A-Za-z-_]{35}/, // Google API keys
    /AKIA[0-9A-Z]{16}/, // AWS Access Keys
    /password\s*[:=]\s*["'][^"']+["']/, // Hardcoded passwords
    /secret\s*[:=]\s*["'][^"']+["']/, // Hardcoded secrets
    /token\s*[:=]\s*["'][^"']+["']/, // Hardcoded tokens
    /key\s*[:=]\s*["'][^"']+["']/, // Hardcoded keys
  ];
  
  for (const pattern of sensitivePatterns) {
    if (pattern.test(pageContent)) {
      throw new Error(`Sensitive data exposed in page source: ${pattern}`);
    }
  }
}

/**
 * Comprehensive security test suite
 */
export async function runSecurityTestSuite(
  page: Page,
  options: SecurityTestOptions = {}
): Promise<void> {
  console.log('Running comprehensive security test suite...');
  
  if (!options.skipAuthTests) {
    await testAuthenticationBypass(page);
    await testCSRFProtection(page);
  }
  
  if (!options.skipXSSTests) {
    // Test common input fields for XSS
    const inputSelectors = [
      '[data-testid="content-textarea"]',
      '[data-testid="search-input"]',
      '[data-testid="email-input"]',
      '[data-testid="name-input"]'
    ];
    
    for (const selector of inputSelectors) {
      const element = page.locator(selector);
      if (await element.isVisible().catch(() => false)) {
        const hasVulnerability = await testXSSVulnerability(page, selector, options.customPayloads);
        expect(hasVulnerability).toBeFalsy();
      }
    }
  }
  
  if (!options.skipSQLInjectionTests) {
    // Test search functionality for SQL injection
    const searchSelector = '[data-testid="search-input"]';
    const element = page.locator(searchSelector);
    if (await element.isVisible().catch(() => false)) {
      const hasVulnerability = await testSQLInjection(page, searchSelector);
      expect(hasVulnerability).toBeFalsy();
    }
  }
  
  await testSecurityHeaders(page);
  await testSensitiveDataExposure(page);
  await testCSP(page);
  
  console.log('Security test suite completed successfully');
}