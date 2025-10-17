import { chromium, FullConfig } from '@playwright/test';

/**
 * Global setup for security tests
 * Prepares environment for security testing
 */
async function globalSetup(config: FullConfig) {
  console.log('Setting up security testing environment...');
  
  // Launch browser for setup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to the application
    await page.goto(config.projects[0].use?.baseURL || 'http://localhost:5173');
    
    // Wait for application to be ready
    await page.waitForLoadState('networkidle');
    
    // Setup security test environment
    await setupSecurityTestEnvironment(page);
    
    // Verify security headers are present
    await verifySecurityHeaders(page);
    
    console.log('Security testing environment ready');
  } catch (error) {
    console.error('Failed to setup security testing environment:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function setupSecurityTestEnvironment(page: any) {
  // Clear any existing data
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  // Set up test user for authenticated security tests
  await page.evaluate(() => {
    const testUser = {
      id: 'security-test-user',
      email: 'security@test.com',
      name: 'Security Test User',
      role: 'user'
    };
    localStorage.setItem('auth-user', JSON.stringify(testUser));
    localStorage.setItem('security-test-mode', 'true');
  });
  
  // Override console methods to capture security-related logs
  await page.evaluate(() => {
    const originalConsole = { ...console };
    (window as any).securityLogs = [];
    
    ['log', 'warn', 'error'].forEach(method => {
      (console as any)[method] = (...args: any[]) => {
        const message = args.join(' ');
        if (message.toLowerCase().includes('security') || 
            message.toLowerCase().includes('xss') ||
            message.toLowerCase().includes('csrf') ||
            message.toLowerCase().includes('injection')) {
          (window as any).securityLogs.push({ level: method, message, timestamp: Date.now() });
        }
        (originalConsole as any)[method](...args);
      };
    });
  });
}

async function verifySecurityHeaders(page: any) {
  const response = await page.request.get('/');
  const headers = response.headers();
  
  const criticalHeaders = [
    'x-frame-options',
    'x-content-type-options',
    'x-xss-protection'
  ];
  
  const missingHeaders = criticalHeaders.filter(header => !headers[header]);
  
  if (missingHeaders.length > 0) {
    console.warn(`Missing critical security headers: ${missingHeaders.join(', ')}`);
  }
  
  // Log security headers for debugging
  console.log('Security headers detected:');
  Object.entries(headers).forEach(([key, value]) => {
    if (key.toLowerCase().includes('security') || 
        key.toLowerCase().startsWith('x-') ||
        key.toLowerCase().includes('content-security-policy')) {
      console.log(`  ${key}: ${value}`);
    }
  });
}

export default globalSetup;