import { Page, expect } from '@playwright/test';
import { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

/**
 * Advanced Testing Utilities
 * 
 * This module provides comprehensive utilities for:
 * - Visual regression testing
 * - Security testing integration and validation
 * - Test data management and isolation
 */

// ============================================================================
// VISUAL REGRESSION TESTING UTILITIES
// ============================================================================

export interface VisualTestConfig {
  threshold?: number;
  maxDiffPixels?: number;
  animations?: 'disabled' | 'allow';
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
  mask?: string[];
  hideElements?: string[];
}

export interface VisualTestResult {
  passed: boolean;
  diffPixels?: number;
  threshold?: number;
  screenshotPath?: string;
  baselinePath?: string;
  diffPath?: string;
}

/**
 * Visual regression testing utilities with advanced features
 */
export class VisualRegressionTester {
  private page: Page;
  private config: VisualTestConfig;
  private testName: string;

  constructor(page: Page, testName: string, config: VisualTestConfig = {}) {
    this.page = page;
    this.testName = testName;
    this.config = {
      threshold: 0.2,
      maxDiffPixels: 1000,
      animations: 'disabled',
      fullPage: true,
      ...config
    };
  }

  /**
   * Prepare page for consistent visual testing
   */
  async preparePage(): Promise<void> {
    // Disable animations for consistent screenshots
    if (this.config.animations === 'disabled') {
      await this.page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
            scroll-behavior: auto !important;
          }
          
          /* Hide scrollbars for consistent screenshots */
          ::-webkit-scrollbar {
            display: none;
          }
          
          /* Ensure consistent font rendering */
          * {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
        `
      });
    }

    // Set consistent viewport and theme
    await this.page.evaluate(() => {
      // Set consistent theme
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
      
      // Hide dynamic content
      const dynamicSelectors = [
        '[data-testid*="timestamp"]',
        '[data-testid*="time"]',
        '[data-dynamic="true"]',
        '[data-visual-ignore="true"]',
        '.timestamp',
        '.time-ago',
        '.loading-spinner'
      ];
      
      dynamicSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          (el as HTMLElement).style.visibility = 'hidden';
        });
      });
    });

    // Hide specified elements
    if (this.config.hideElements) {
      for (const selector of this.config.hideElements) {
        await this.page.locator(selector).evaluateAll(elements => {
          elements.forEach(el => {
            (el as HTMLElement).style.visibility = 'hidden';
          });
        });
      }
    }

    // Wait for fonts and images to load
    await this.page.waitForFunction(() => document.fonts.ready);
    await this.page.waitForLoadState('networkidle');
    
    // Small delay to ensure everything is settled
    await this.page.waitForTimeout(100);
  }

  /**
   * Take screenshot with consistent settings
   */
  async takeScreenshot(name?: string): Promise<VisualTestResult> {
    await this.preparePage();
    
    const screenshotName = name || `${this.testName}.png`;
    
    try {
      const screenshotOptions: any = {
        threshold: this.config.threshold,
        maxDiffPixels: this.config.maxDiffPixels,
        animations: this.config.animations
      };

      if (this.config.fullPage) {
        screenshotOptions.fullPage = true;
      }

      if (this.config.clip) {
        screenshotOptions.clip = this.config.clip;
      }

      if (this.config.mask) {
        screenshotOptions.mask = this.config.mask.map(selector => this.page.locator(selector));
      }

      await expect(this.page).toHaveScreenshot(screenshotName, screenshotOptions);
      
      return {
        passed: true,
        screenshotPath: screenshotName
      };
    } catch (error: any) {
      return {
        passed: false,
        screenshotPath: screenshotName,
        diffPixels: error.diffPixels,
        threshold: this.config.threshold
      };
    }
  }

  /**
   * Compare element screenshot
   */
  async compareElement(selector: string, name?: string): Promise<VisualTestResult> {
    await this.preparePage();
    
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'visible' });
    
    const screenshotName = name || `${this.testName}-element.png`;
    
    try {
      await expect(element).toHaveScreenshot(screenshotName, {
        threshold: this.config.threshold,
        maxDiffPixels: this.config.maxDiffPixels,
        animations: this.config.animations
      });
      
      return {
        passed: true,
        screenshotPath: screenshotName
      };
    } catch (error: any) {
      return {
        passed: false,
        screenshotPath: screenshotName,
        diffPixels: error.diffPixels,
        threshold: this.config.threshold
      };
    }
  }

  /**
   * Test responsive design across viewports
   */
  async testResponsiveDesign(
    viewports: Array<{ name: string; width: number; height: number }> = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1280, height: 720 }
    ]
  ): Promise<VisualTestResult[]> {
    const results: VisualTestResult[] = [];
    
    for (const viewport of viewports) {
      await this.page.setViewportSize({ width: viewport.width, height: viewport.height });
      await this.page.waitForTimeout(200); // Allow layout to settle
      
      const result = await this.takeScreenshot(`${this.testName}-${viewport.name}`);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Test theme variations
   */
  async testThemeVariations(
    themes: string[] = ['light', 'dark']
  ): Promise<VisualTestResult[]> {
    const results: VisualTestResult[] = [];
    
    for (const theme of themes) {
      await this.page.evaluate((themeName) => {
        localStorage.setItem('theme', themeName);
        document.documentElement.classList.toggle('dark', themeName === 'dark');
      }, theme);
      
      await this.page.waitForTimeout(200); // Allow theme to apply
      
      const result = await this.takeScreenshot(`${this.testName}-${theme}`);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Generate visual test report
   */
  generateReport(results: VisualTestResult[]): {
    totalTests: number;
    passed: number;
    failed: number;
    passRate: number;
    results: VisualTestResult[];
  } {
    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    
    return {
      totalTests: results.length,
      passed,
      failed,
      passRate: (passed / results.length) * 100,
      results
    };
  }
}

// ============================================================================
// SECURITY TESTING INTEGRATION AND VALIDATION
// ============================================================================

export interface SecurityTestConfig {
  skipAuthTests?: boolean;
  skipXSSTests?: boolean;
  skipSQLInjectionTests?: boolean;
  skipCSRFTests?: boolean;
  customPayloads?: string[];
  endpoints?: string[];
  inputSelectors?: string[];
}

export interface SecurityTestResult {
  testType: string;
  passed: boolean;
  vulnerabilities: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    payload?: string;
    location?: string;
  }>;
  recommendations: string[];
}

/**
 * Comprehensive security testing utilities
 */
export class SecurityTester {
  private page: Page;
  private config: SecurityTestConfig;

  constructor(page: Page, config: SecurityTestConfig = {}) {
    this.page = page;
    this.config = {
      skipAuthTests: false,
      skipXSSTests: false,
      skipSQLInjectionTests: false,
      skipCSRFTests: false,
      endpoints: ['/api/analyze', '/api/users', '/api/admin'],
      inputSelectors: [
        '[data-testid="content-textarea"]',
        '[data-testid="search-input"]',
        '[data-testid="email-input"]',
        '[data-testid="name-input"]'
      ],
      ...config
    };
  }

  /**
   * Run comprehensive security test suite
   */
  async runSecurityTestSuite(): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    if (!this.config.skipAuthTests) {
      results.push(await this.testAuthentication());
      results.push(await this.testAuthorization());
    }

    if (!this.config.skipXSSTests) {
      results.push(await this.testXSSVulnerabilities());
    }

    if (!this.config.skipSQLInjectionTests) {
      results.push(await this.testSQLInjection());
    }

    if (!this.config.skipCSRFTests) {
      results.push(await this.testCSRFProtection());
    }

    results.push(await this.testSecurityHeaders());
    results.push(await this.testSensitiveDataExposure());
    results.push(await this.testInputValidation());

    return results;
  }

  /**
   * Test authentication security
   */
  async testAuthentication(): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityTestResult['vulnerabilities'] = [];
    const recommendations: string[] = [];

    try {
      // Test protected routes without authentication
      const protectedRoutes = ['/dashboard', '/admin', '/settings', '/analytics'];
      
      for (const route of protectedRoutes) {
        const response = await this.page.request.get(route);
        
        if (response.status() === 200) {
          const content = await response.text();
          const hasProtectedContent = /dashboard|admin|settings|profile/i.test(content);
          
          if (hasProtectedContent) {
            vulnerabilities.push({
              type: 'authentication_bypass',
              severity: 'critical',
              description: `Protected route ${route} accessible without authentication`,
              location: route
            });
          }
        }
      }

      // Test session management
      await this.page.evaluate(() => {
        localStorage.removeItem('supabase.auth.token');
        sessionStorage.clear();
      });

      await this.page.goto('/dashboard');
      const isRedirected = !this.page.url().includes('/dashboard');
      
      if (!isRedirected) {
        vulnerabilities.push({
          type: 'session_management',
          severity: 'high',
          description: 'Application does not properly handle expired sessions',
          location: '/dashboard'
        });
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'authentication_test_error',
        severity: 'medium',
        description: `Authentication test failed: ${error}`
      });
    }

    if (vulnerabilities.length === 0) {
      recommendations.push('Authentication security appears to be properly implemented');
    } else {
      recommendations.push('Implement proper authentication checks on all protected routes');
      recommendations.push('Ensure session expiration is handled correctly');
    }

    return {
      testType: 'authentication',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      recommendations
    };
  }

  /**
   * Test authorization and access control
   */
  async testAuthorization(): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityTestResult['vulnerabilities'] = [];
    const recommendations: string[] = [];

    try {
      // Test role-based access control
      const adminEndpoints = ['/api/admin/users', '/api/admin/settings'];
      
      for (const endpoint of adminEndpoints) {
        // Test with regular user token (if available)
        const response = await this.page.request.get(endpoint, {
          headers: {
            'Authorization': 'Bearer regular-user-token'
          }
        });
        
        if (response.status() === 200) {
          vulnerabilities.push({
            type: 'authorization_bypass',
            severity: 'critical',
            description: `Admin endpoint ${endpoint} accessible to regular users`,
            location: endpoint
          });
        }
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'authorization_test_error',
        severity: 'medium',
        description: `Authorization test failed: ${error}`
      });
    }

    if (vulnerabilities.length === 0) {
      recommendations.push('Authorization controls appear to be properly implemented');
    } else {
      recommendations.push('Implement proper role-based access control');
      recommendations.push('Validate user permissions on all sensitive endpoints');
    }

    return {
      testType: 'authorization',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      recommendations
    };
  }

  /**
   * Test XSS vulnerabilities
   */
  async testXSSVulnerabilities(): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityTestResult['vulnerabilities'] = [];
    const recommendations: string[] = [];

    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(\'XSS\')">',
      'javascript:alert("XSS")',
      '<svg onload="alert(\'XSS\')">',
      '"><script>alert("XSS")</script>',
      '\'; alert("XSS"); //',
      ...(this.config.customPayloads || [])
    ];

    try {
      for (const selector of this.config.inputSelectors || []) {
        const element = this.page.locator(selector);
        
        if (await element.isVisible().catch(() => false)) {
          for (const payload of xssPayloads) {
            // Set up XSS detection
            await this.page.evaluate(() => {
              (window as any).xssDetected = false;
              (window as any).originalAlert = window.alert;
              window.alert = () => {
                (window as any).xssDetected = true;
              };
            });

            await element.fill(payload);
            await this.page.waitForTimeout(500);

            const xssDetected = await this.page.evaluate(() => {
              return (window as any).xssDetected || false;
            });

            if (xssDetected) {
              vulnerabilities.push({
                type: 'xss_vulnerability',
                severity: 'high',
                description: `XSS vulnerability found in input field`,
                payload,
                location: selector
              });
            }

            await element.fill(''); // Clear input
          }
        }
      }

      // Restore original alert
      await this.page.evaluate(() => {
        if ((window as any).originalAlert) {
          window.alert = (window as any).originalAlert;
        }
      });

    } catch (error) {
      vulnerabilities.push({
        type: 'xss_test_error',
        severity: 'medium',
        description: `XSS test failed: ${error}`
      });
    }

    if (vulnerabilities.length === 0) {
      recommendations.push('No XSS vulnerabilities detected in tested inputs');
    } else {
      recommendations.push('Implement proper input sanitization and output encoding');
      recommendations.push('Use Content Security Policy (CSP) headers');
      recommendations.push('Validate and sanitize all user inputs');
    }

    return {
      testType: 'xss',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      recommendations
    };
  }

  /**
   * Test SQL injection vulnerabilities
   */
  async testSQLInjection(): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityTestResult['vulnerabilities'] = [];
    const recommendations: string[] = [];

    const sqlPayloads = [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "'; INSERT INTO users VALUES ('hacker', 'password'); --",
      "' UNION SELECT * FROM users --",
      "' OR 1=1 --",
      "admin'--",
      "' OR 'x'='x"
    ];

    try {
      const searchSelector = '[data-testid="search-input"]';
      const element = this.page.locator(searchSelector);
      
      if (await element.isVisible().catch(() => false)) {
        for (const payload of sqlPayloads) {
          await element.fill(payload);
          await this.page.keyboard.press('Enter');
          await this.page.waitForTimeout(1000);

          const pageContent = await this.page.textContent('body');
          const sqlErrorPatterns = [
            /sql syntax/i,
            /mysql error/i,
            /postgresql error/i,
            /sqlite error/i,
            /database error/i,
            /syntax error/i,
            /column.*doesn't exist/i,
            /table.*doesn't exist/i
          ];

          const hasError = sqlErrorPatterns.some(pattern => 
            pageContent && pattern.test(pageContent)
          );

          if (hasError) {
            vulnerabilities.push({
              type: 'sql_injection',
              severity: 'critical',
              description: 'SQL injection vulnerability detected',
              payload,
              location: searchSelector
            });
          }

          await element.fill(''); // Clear input
        }
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'sql_injection_test_error',
        severity: 'medium',
        description: `SQL injection test failed: ${error}`
      });
    }

    if (vulnerabilities.length === 0) {
      recommendations.push('No SQL injection vulnerabilities detected');
    } else {
      recommendations.push('Use parameterized queries and prepared statements');
      recommendations.push('Implement proper input validation');
      recommendations.push('Use an ORM or query builder with built-in protection');
    }

    return {
      testType: 'sql_injection',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      recommendations
    };
  }

  /**
   * Test CSRF protection
   */
  async testCSRFProtection(): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityTestResult['vulnerabilities'] = [];
    const recommendations: string[] = [];

    try {
      // Test OAuth state parameter validation
      await this.page.goto('/auth/callback?code=test&state=invalid_state');
      
      const hasError = await this.page.getByText(/invalid state|csrf|security error/i).isVisible().catch(() => false);
      const isRedirected = !this.page.url().includes('/callback');
      
      if (!hasError && !isRedirected) {
        vulnerabilities.push({
          type: 'csrf_vulnerability',
          severity: 'high',
          description: 'CSRF protection not properly implemented for OAuth callback',
          location: '/auth/callback'
        });
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'csrf_test_error',
        severity: 'medium',
        description: `CSRF test failed: ${error}`
      });
    }

    if (vulnerabilities.length === 0) {
      recommendations.push('CSRF protection appears to be properly implemented');
    } else {
      recommendations.push('Implement CSRF tokens for state-changing operations');
      recommendations.push('Validate OAuth state parameters');
      recommendations.push('Use SameSite cookie attributes');
    }

    return {
      testType: 'csrf',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      recommendations
    };
  }

  /**
   * Test security headers
   */
  async testSecurityHeaders(): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityTestResult['vulnerabilities'] = [];
    const recommendations: string[] = [];

    try {
      const response = await this.page.request.get('/');
      const headers = response.headers();

      const requiredHeaders = {
        'x-frame-options': ['DENY', 'SAMEORIGIN'],
        'x-content-type-options': ['nosniff'],
        'x-xss-protection': ['1; mode=block', '0'],
        'referrer-policy': ['strict-origin-when-cross-origin', 'no-referrer', 'same-origin'],
        'content-security-policy': null // Just check if present
      };

      Object.entries(requiredHeaders).forEach(([header, expectedValues]) => {
        const headerValue = headers[header];
        
        if (!headerValue) {
          vulnerabilities.push({
            type: 'missing_security_header',
            severity: 'medium',
            description: `Missing security header: ${header}`,
            location: 'HTTP headers'
          });
        } else if (expectedValues && !expectedValues.includes(headerValue)) {
          vulnerabilities.push({
            type: 'incorrect_security_header',
            severity: 'low',
            description: `Incorrect value for security header ${header}: ${headerValue}`,
            location: 'HTTP headers'
          });
        }
      });

    } catch (error) {
      vulnerabilities.push({
        type: 'security_headers_test_error',
        severity: 'medium',
        description: `Security headers test failed: ${error}`
      });
    }

    if (vulnerabilities.length === 0) {
      recommendations.push('Security headers are properly configured');
    } else {
      recommendations.push('Configure all required security headers');
      recommendations.push('Review and update Content Security Policy');
      recommendations.push('Implement HSTS for HTTPS enforcement');
    }

    return {
      testType: 'security_headers',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      recommendations
    };
  }

  /**
   * Test for sensitive data exposure
   */
  async testSensitiveDataExposure(): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityTestResult['vulnerabilities'] = [];
    const recommendations: string[] = [];

    try {
      const pageContent = await this.page.content();
      
      const sensitivePatterns = [
        { pattern: /sk-[a-zA-Z0-9]{48}/, type: 'OpenAI API key' },
        { pattern: /AIza[0-9A-Za-z-_]{35}/, type: 'Google API key' },
        { pattern: /AKIA[0-9A-Z]{16}/, type: 'AWS Access Key' },
        { pattern: /password\s*[:=]\s*["'][^"']+["']/, type: 'Hardcoded password' },
        { pattern: /secret\s*[:=]\s*["'][^"']+["']/, type: 'Hardcoded secret' },
        { pattern: /token\s*[:=]\s*["'][^"']+["']/, type: 'Hardcoded token' }
      ];

      for (const { pattern, type } of sensitivePatterns) {
        if (pattern.test(pageContent)) {
          vulnerabilities.push({
            type: 'sensitive_data_exposure',
            severity: 'critical',
            description: `${type} exposed in page source`,
            location: 'Page source'
          });
        }
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'sensitive_data_test_error',
        severity: 'medium',
        description: `Sensitive data test failed: ${error}`
      });
    }

    if (vulnerabilities.length === 0) {
      recommendations.push('No sensitive data exposure detected');
    } else {
      recommendations.push('Remove all sensitive data from client-side code');
      recommendations.push('Use environment variables for sensitive configuration');
      recommendations.push('Implement proper secrets management');
    }

    return {
      testType: 'sensitive_data',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      recommendations
    };
  }

  /**
   * Test input validation
   */
  async testInputValidation(): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityTestResult['vulnerabilities'] = [];
    const recommendations: string[] = [];

    try {
      const testInputs = [
        { value: 'a'.repeat(10000), type: 'oversized_input' },
        { value: '../../etc/passwd', type: 'path_traversal' },
        { value: 'null\x00byte', type: 'null_byte_injection' },
        { value: '<script>alert(1)</script>', type: 'script_injection' }
      ];

      for (const selector of this.config.inputSelectors || []) {
        const element = this.page.locator(selector);
        
        if (await element.isVisible().catch(() => false)) {
          for (const testInput of testInputs) {
            await element.fill(testInput.value);
            
            // Check if input was accepted without validation
            const inputValue = await element.inputValue();
            
            if (inputValue === testInput.value) {
              vulnerabilities.push({
                type: 'insufficient_input_validation',
                severity: 'medium',
                description: `Input field accepts ${testInput.type} without proper validation`,
                location: selector
              });
            }
            
            await element.fill(''); // Clear input
          }
        }
      }

    } catch (error) {
      vulnerabilities.push({
        type: 'input_validation_test_error',
        severity: 'medium',
        description: `Input validation test failed: ${error}`
      });
    }

    if (vulnerabilities.length === 0) {
      recommendations.push('Input validation appears to be properly implemented');
    } else {
      recommendations.push('Implement comprehensive input validation');
      recommendations.push('Set appropriate input length limits');
      recommendations.push('Sanitize and validate all user inputs');
    }

    return {
      testType: 'input_validation',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      recommendations
    };
  }

  /**
   * Generate security test report
   */
  generateSecurityReport(results: SecurityTestResult[]): {
    overallScore: number;
    totalTests: number;
    passed: number;
    failed: number;
    totalVulnerabilities: number;
    criticalVulnerabilities: number;
    highVulnerabilities: number;
    mediumVulnerabilities: number;
    lowVulnerabilities: number;
    results: SecurityTestResult[];
    recommendations: string[];
  } {
    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    
    const allVulnerabilities = results.flatMap(r => r.vulnerabilities);
    const criticalVulnerabilities = allVulnerabilities.filter(v => v.severity === 'critical').length;
    const highVulnerabilities = allVulnerabilities.filter(v => v.severity === 'high').length;
    const mediumVulnerabilities = allVulnerabilities.filter(v => v.severity === 'medium').length;
    const lowVulnerabilities = allVulnerabilities.filter(v => v.severity === 'low').length;
    
    // Calculate security score (0-100)
    const maxScore = 100;
    const criticalPenalty = criticalVulnerabilities * 25;
    const highPenalty = highVulnerabilities * 15;
    const mediumPenalty = mediumVulnerabilities * 10;
    const lowPenalty = lowVulnerabilities * 5;
    
    const overallScore = Math.max(0, maxScore - criticalPenalty - highPenalty - mediumPenalty - lowPenalty);
    
    const allRecommendations = results.flatMap(r => r.recommendations);
    const uniqueRecommendations = [...new Set(allRecommendations)];

    return {
      overallScore,
      totalTests: results.length,
      passed,
      failed,
      totalVulnerabilities: allVulnerabilities.length,
      criticalVulnerabilities,
      highVulnerabilities,
      mediumVulnerabilities,
      lowVulnerabilities,
      results,
      recommendations: uniqueRecommendations
    };
  }
}// 
============================================================================
// TEST DATA MANAGEMENT AND ISOLATION UTILITIES
// ============================================================================

export interface TestDataIsolationConfig {
  strategy: 'test' | 'suite' | 'global';
  autoCleanup: boolean;
  namespace?: string;
  maxRetries?: number;
  cleanupTimeout?: number;
}

export interface TestDataSnapshot {
  id: string;
  timestamp: string;
  data: Record<string, any[]>;
  metadata: {
    testName?: string;
    isolationId: string;
    strategy: string;
  };
}

/**
 * Advanced test data management with isolation and versioning
 */
export class TestDataManager {
  private isolationId: string;
  private config: TestDataIsolationConfig;
  private database: SupabaseClient | null = null;
  private snapshots: Map<string, TestDataSnapshot> = new Map();
  private createdData: Map<string, string[]> = new Map(); // table -> ids

  constructor(config: TestDataIsolationConfig) {
    this.config = {
      maxRetries: 3,
      cleanupTimeout: 30000,
      ...config
    };
    this.isolationId = this.generateIsolationId();
  }

  private generateIsolationId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const strategy = this.config.strategy;
    const namespace = this.config.namespace || 'default';
    
    return `${strategy}-${namespace}-${timestamp}-${random}`;
  }

  /**
   * Initialize test data manager with database connection
   */
  async initialize(database: SupabaseClient): Promise<void> {
    this.database = database;
    
    // Set up isolation tracking
    this.createdData.set('users', []);
    this.createdData.set('analysis_results', []);
    this.createdData.set('scheduled_scans', []);
    this.createdData.set('reviews', []);
  }

  /**
   * Create isolated test user
   */
  async createIsolatedUser(overrides: any = {}): Promise<any> {
    if (!this.database) {
      throw new Error('Test data manager not initialized');
    }

    const userId = `${this.isolationId}-user-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const userData = {
      id: userId,
      email: `${userId}@test.example.com`,
      name: `Test User ${userId}`,
      role_id: 'user',
      status: 'active',
      created_at: new Date().toISOString(),
      ...overrides
    };

    const { data, error } = await this.database
      .from('users')
      .insert(userData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create isolated user: ${error.message}`);
    }

    // Track created data for cleanup
    const userIds = this.createdData.get('users') || [];
    userIds.push(userId);
    this.createdData.set('users', userIds);

    return data;
  }

  /**
   * Create isolated test analysis result
   */
  async createIsolatedAnalysisResult(userId: string, overrides: any = {}): Promise<any> {
    if (!this.database) {
      throw new Error('Test data manager not initialized');
    }

    const analysisId = `${this.isolationId}-analysis-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const analysisData = {
      id: analysisId,
      user_id: userId,
      content: `Test content for analysis ${analysisId}`,
      accuracy: 85.5,
      risk_level: 'medium',
      hallucinations: [],
      verification_sources: 5,
      processing_time: 1000,
      created_at: new Date().toISOString(),
      analysis_type: 'single',
      ...overrides
    };

    const { data, error } = await this.database
      .from('analysis_results')
      .insert(analysisData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create isolated analysis result: ${error.message}`);
    }

    // Track created data for cleanup
    const analysisIds = this.createdData.get('analysis_results') || [];
    analysisIds.push(analysisId);
    this.createdData.set('analysis_results', analysisIds);

    return data;
  }

  /**
   * Create test scenario with multiple related entities
   */
  async createTestScenario(options: {
    userCount?: number;
    analysisCount?: number;
    scenarioType?: 'basic' | 'complex' | 'performance';
  } = {}): Promise<{
    users: any[];
    analysisResults: any[];
    scenarioId: string;
  }> {
    const {
      userCount = 1,
      analysisCount = 3,
      scenarioType = 'basic'
    } = options;

    const scenarioId = `${this.isolationId}-scenario-${Date.now()}`;
    const users: any[] = [];
    const analysisResults: any[] = [];

    // Create users
    for (let i = 0; i < userCount; i++) {
      const user = await this.createIsolatedUser({
        name: `Test User ${i + 1} (${scenarioType})`,
        email: `user${i + 1}-${scenarioId}@test.example.com`
      });
      users.push(user);
    }

    // Create analysis results
    for (let i = 0; i < analysisCount; i++) {
      const userId = users[i % users.length].id;
      const analysisResult = await this.createIsolatedAnalysisResult(userId, {
        content: `Test analysis content ${i + 1} for ${scenarioType} scenario`,
        accuracy: 70 + (Math.random() * 30), // Random accuracy between 70-100
        risk_level: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
      });
      analysisResults.push(analysisResult);
    }

    return {
      users,
      analysisResults,
      scenarioId
    };
  }

  /**
   * Create snapshot of current test data
   */
  async createSnapshot(name: string): Promise<TestDataSnapshot> {
    if (!this.database) {
      throw new Error('Test data manager not initialized');
    }

    const snapshot: TestDataSnapshot = {
      id: `${this.isolationId}-snapshot-${name}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {},
      metadata: {
        testName: name,
        isolationId: this.isolationId,
        strategy: this.config.strategy
      }
    };

    // Capture data for each tracked table
    for (const [table, ids] of this.createdData.entries()) {
      if (ids.length > 0) {
        const { data, error } = await this.database
          .from(table)
          .select('*')
          .in('id', ids);

        if (!error && data) {
          snapshot.data[table] = data;
        }
      }
    }

    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  /**
   * Restore from snapshot
   */
  async restoreFromSnapshot(snapshotId: string): Promise<void> {
    if (!this.database) {
      throw new Error('Test data manager not initialized');
    }

    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    // Clean up current data first
    await this.cleanup();

    // Restore data from snapshot
    for (const [table, records] of Object.entries(snapshot.data)) {
      if (records.length > 0) {
        const { error } = await this.database
          .from(table)
          .insert(records);

        if (error) {
          throw new Error(`Failed to restore ${table} from snapshot: ${error.message}`);
        }

        // Update tracking
        const ids = records.map((record: any) => record.id);
        this.createdData.set(table, ids);
      }
    }
  }

  /**
   * Get isolation statistics
   */
  getIsolationStats(): {
    isolationId: string;
    strategy: string;
    createdDataCounts: Record<string, number>;
    snapshotCount: number;
    totalEntities: number;
  } {
    const createdDataCounts: Record<string, number> = {};
    let totalEntities = 0;

    for (const [table, ids] of this.createdData.entries()) {
      createdDataCounts[table] = ids.length;
      totalEntities += ids.length;
    }

    return {
      isolationId: this.isolationId,
      strategy: this.config.strategy,
      createdDataCounts,
      snapshotCount: this.snapshots.size,
      totalEntities
    };
  }

  /**
   * Verify data isolation
   */
  async verifyIsolation(otherManager: TestDataManager): Promise<{
    isolated: boolean;
    conflicts: Array<{ table: string; conflictingIds: string[] }>;
  }> {
    if (!this.database) {
      throw new Error('Test data manager not initialized');
    }

    const conflicts: Array<{ table: string; conflictingIds: string[] }> = [];

    for (const [table, myIds] of this.createdData.entries()) {
      const otherIds = otherManager.createdData.get(table) || [];
      const conflictingIds = myIds.filter(id => otherIds.includes(id));
      
      if (conflictingIds.length > 0) {
        conflicts.push({ table, conflictingIds });
      }
    }

    return {
      isolated: conflicts.length === 0,
      conflicts
    };
  }

  /**
   * Clean up all isolated test data
   */
  async cleanup(): Promise<void> {
    if (!this.database || !this.config.autoCleanup) {
      return;
    }

    const cleanupPromises: Promise<void>[] = [];

    // Clean up in reverse dependency order
    const cleanupOrder = ['reviews', 'analysis_results', 'scheduled_scans', 'users'];

    for (const table of cleanupOrder) {
      const ids = this.createdData.get(table) || [];
      
      if (ids.length > 0) {
        cleanupPromises.push(
          this.cleanupTable(table, ids)
        );
      }
    }

    try {
      await Promise.all(cleanupPromises);
      
      // Clear tracking
      this.createdData.clear();
      this.snapshots.clear();
      
    } catch (error) {
      console.warn(`Cleanup failed for isolation ${this.isolationId}:`, error);
      
      // Retry cleanup once
      if (this.config.maxRetries && this.config.maxRetries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.forceCleanup();
      }
    }
  }

  private async cleanupTable(table: string, ids: string[]): Promise<void> {
    if (!this.database) return;

    const batchSize = 50; // Clean up in batches to avoid query limits
    
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      
      try {
        const { error } = await this.database
          .from(table)
          .delete()
          .in('id', batch);

        if (error) {
          console.warn(`Failed to cleanup ${table} batch:`, error);
        }
      } catch (error) {
        console.warn(`Error cleaning up ${table} batch:`, error);
      }
    }
  }

  private async forceCleanup(): Promise<void> {
    if (!this.database) return;

    // More aggressive cleanup using isolation ID pattern
    const tables = ['reviews', 'analysis_results', 'scheduled_scans', 'users'];
    
    for (const table of tables) {
      try {
        await this.database
          .from(table)
          .delete()
          .like('id', `${this.isolationId}%`);
      } catch (error) {
        console.warn(`Force cleanup failed for ${table}:`, error);
      }
    }
  }

  /**
   * Get isolation ID
   */
  getIsolationId(): string {
    return this.isolationId;
  }
}

/**
 * Test data isolation factory
 */
export class TestDataIsolationFactory {
  private static managers: Map<string, TestDataManager> = new Map();

  /**
   * Get or create test data manager for current test
   */
  static getManager(config: TestDataIsolationConfig): TestDataManager {
    const key = `${config.strategy}-${config.namespace || 'default'}`;
    
    if (!this.managers.has(key)) {
      const manager = new TestDataManager(config);
      this.managers.set(key, manager);
    }

    return this.managers.get(key)!;
  }

  /**
   * Create shared test data manager
   */
  static async createSharedManager(
    namespace: string,
    database: SupabaseClient
  ): Promise<TestDataManager> {
    const manager = new TestDataManager({
      strategy: 'global',
      autoCleanup: false,
      namespace
    });
    
    await manager.initialize(database);
    this.managers.set(`shared-${namespace}`, manager);
    
    return manager;
  }

  /**
   * Clean up all managers
   */
  static async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.managers.values()).map(manager => 
      manager.cleanup()
    );
    
    await Promise.all(cleanupPromises);
    this.managers.clear();
  }

  /**
   * Get isolation statistics for all managers
   */
  static getAllIsolationStats(): Array<{
    managerId: string;
    stats: ReturnType<TestDataManager['getIsolationStats']>;
  }> {
    return Array.from(this.managers.entries()).map(([key, manager]) => ({
      managerId: key,
      stats: manager.getIsolationStats()
    }));
  }
}

// Export utility functions for easy integration
export const createVisualTester = (page: Page, testName: string, config?: VisualTestConfig) => 
  new VisualRegressionTester(page, testName, config);

export const createSecurityTester = (page: Page, config?: SecurityTestConfig) => 
  new SecurityTester(page, config);

export const createTestDataManager = (config: TestDataIsolationConfig) => 
  new TestDataManager(config);

export const getIsolatedTestDataManager = (config?: Partial<TestDataIsolationConfig>) => 
  TestDataIsolationFactory.getManager({
    strategy: 'test',
    autoCleanup: true,
    ...config
  });