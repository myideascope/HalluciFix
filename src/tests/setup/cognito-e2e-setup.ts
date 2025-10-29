import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Setting up Cognito Auth E2E tests...');
  
  // Launch browser for setup
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Navigate to the application
    await page.goto('http://localhost:5173');
    
    // Set migration mode to Cognito
    await page.addInitScript(() => {
      localStorage.setItem('hallucifix_auth_mode', 'cognito');
      localStorage.setItem('hallucifix_test_mode', 'true');
    });
    
    // Verify the application loads correctly
    await page.waitForSelector('body', { timeout: 30000 });
    
    console.log('✅ Cognito Auth E2E setup completed successfully');
    
  } catch (error) {
    console.error('❌ Cognito Auth E2E setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;