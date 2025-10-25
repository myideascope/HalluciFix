/**
 * Landing Page E2E Tests
 * Tests for the application landing page functionality
 */

import { test, expect } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';

test.describe('Landing Page', () => {
  let landingPage: LandingPage;

  test.beforeEach(async ({ page }) => {
    landingPage = new LandingPage(page);
    await landingPage.goto();
  });

  test('should load and display all required elements', async () => {
    // Verify page structure
    const isValid = await landingPage.validatePageStructure();
    expect(isValid).toBe(true);

    // Check hero section content
    const heroTitle = await landingPage.getHeroTitle();
    expect(heroTitle).toContain('HalluciFix');

    const heroSubtitle = await landingPage.getHeroSubtitle();
    expect(heroSubtitle.length).toBeGreaterThan(0);
  });

  test('should navigate to different sections', async () => {
    // Test navigation to features section
    await landingPage.navigateToSection('features');
    await landingPage.scrollToFeatures();

    // Verify features are displayed
    const featureCards = await landingPage.getFeatureCards();
    expect(featureCards.length).toBeGreaterThan(0);

    // Test navigation to pricing section
    await landingPage.navigateToSection('pricing');
    await landingPage.scrollToPricing();

    // Verify pricing plans are displayed
    const basicPrice = await landingPage.getPlanPrice('basic');
    expect(basicPrice).toMatch(/\$\d+/);
  });

  test('should perform quick analysis', async () => {
    const testText = 'The Earth is flat and the moon is made of cheese.';
    
    // Perform analysis
    await landingPage.performQuickAnalysis(testText);

    // Wait for results
    await expect(async () => {
      const isLoading = await landingPage.isAnalysisLoading();
      expect(isLoading).toBe(false);
    }).toPass({ timeout: 30000 });

    // Verify results are displayed
    const results = await landingPage.getAnalysisResults();
    expect(results.length).toBeGreaterThan(0);
  });

  test('should handle pricing plan selection', async () => {
    await landingPage.scrollToPricing();

    // Test basic plan selection
    await landingPage.selectBasicPlan();
    
    // Should redirect to signup/checkout
    await expect(landingPage.page).toHaveURL(/\/(signup|checkout)/);
  });

  test('should display correct plan features', async () => {
    await landingPage.scrollToPricing();

    // Check basic plan features
    const basicFeatures = await landingPage.getPlanFeatures('basic');
    expect(basicFeatures).toContain('1,000 analyses per month');

    // Check pro plan features
    const proFeatures = await landingPage.getPlanFeatures('pro');
    expect(proFeatures).toContain('10,000 analyses per month');
  });

  test('should be responsive on different screen sizes', async () => {
    await landingPage.validateResponsiveDesign();
  });

  test('should meet accessibility standards', async () => {
    await landingPage.validateAccessibility();
  });

  test('should have good performance metrics', async () => {
    const metrics = await landingPage.validatePerformance();
    
    // Check that First Contentful Paint is under 2 seconds
    expect(metrics.firstContentfulPaint).toBeLessThan(2000);
    
    // Check that DOM Content Loaded is under 3 seconds
    expect(metrics.domContentLoaded).toBeLessThan(3000);
  });

  test('should handle footer links correctly', async () => {
    const footerLinks = await landingPage.getFooterLinks();
    expect(footerLinks.length).toBeGreaterThan(0);

    // Test a footer link (if privacy policy exists)
    if (footerLinks.includes('Privacy Policy')) {
      await landingPage.clickFooterLink('Privacy Policy');
      await expect(landingPage.page).toHaveURL(/\/privacy/);
    }
  });

  test('should handle login and signup buttons', async () => {
    // Test login button
    await landingPage.clickLogin();
    await expect(landingPage.page).toHaveURL(/\/login/);

    // Go back and test signup button
    await landingPage.goto();
    await landingPage.clickSignup();
    await expect(landingPage.page).toHaveURL(/\/signup/);
  });

  test('should handle demo button', async () => {
    await landingPage.clickDemo();
    
    // Should either show a demo modal or navigate to demo page
    const hasModal = await landingPage.elementExists('[data-testid="demo-modal"]');
    const isDemoPage = landingPage.getCurrentUrl().includes('/demo');
    
    expect(hasModal || isDemoPage).toBe(true);
  });
});