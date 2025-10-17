import { chromium, FullConfig } from '@playwright/test';

/**
 * Global setup for visual regression tests
 * Ensures consistent environment and prepares baseline data
 */
async function globalSetup(config: FullConfig) {
  console.log('Setting up visual regression testing environment...');
  
  // Launch browser for setup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to the application
    await page.goto(config.projects[0].use?.baseURL || 'http://localhost:5173');
    
    // Wait for application to be ready
    await page.waitForLoadState('networkidle');
    
    // Setup test data if needed
    await setupTestData(page);
    
    console.log('Visual regression testing environment ready');
  } catch (error) {
    console.error('Failed to setup visual regression testing:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function setupTestData(page: any) {
  // Clear any existing data
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  // Set consistent theme for visual testing
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('visual-test-mode', 'true');
  });
  
  // Mock authentication for consistent visual states
  await page.evaluate(() => {
    const mockUser = {
      id: 'visual-test-user',
      email: 'visual@test.com',
      name: 'Visual Test User',
      role: 'user'
    };
    localStorage.setItem('auth-user', JSON.stringify(mockUser));
  });
}

export default globalSetup;