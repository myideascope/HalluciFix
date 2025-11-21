/**
 * Landing Page Object Model
 * Handles interactions with the application landing page
 */

import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

import { logger } from './logging';
export class LandingPage extends BasePage {
  // Selectors
  private readonly selectors = {
    // Header elements
    header: 'header',
    logo: '[data-testid="logo"]',
    navigationMenu: '[data-testid="nav-menu"]',
    loginButton: '[data-testid="login-button"]',
    signupButton: '[data-testid="signup-button"]',
    
    // Hero section
    heroSection: '[data-testid="hero-section"]',
    heroTitle: '[data-testid="hero-title"]',
    heroSubtitle: '[data-testid="hero-subtitle"]',
    ctaButton: '[data-testid="cta-button"]',
    demoButton: '[data-testid="demo-button"]',
    
    // Features section
    featuresSection: '[data-testid="features-section"]',
    featureCards: '[data-testid="feature-card"]',
    
    // Pricing section
    pricingSection: '[data-testid="pricing-section"]',
    pricingPlans: '[data-testid="pricing-plan"]',
    basicPlan: '[data-testid="basic-plan"]',
    proPlan: '[data-testid="pro-plan"]',
    enterprisePlan: '[data-testid="enterprise-plan"]',
    
    // Footer
    footer: 'footer',
    footerLinks: 'footer a',
    
    // Quick analysis section
    quickAnalysisSection: '[data-testid="quick-analysis"]',
    textInput: '[data-testid="analysis-input"]',
    analyzeButton: '[data-testid="analyze-button"]',
    resultsContainer: '[data-testid="analysis-results"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the landing page
   */
  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.waitForLoad();
  }

  /**
   * Wait for the landing page to load
   */
  async waitForLoad(): Promise<void> {
    await this.waitForElement(this.selectors.header);
    await this.waitForElement(this.selectors.heroSection);
    await this.waitForLoadingToComplete();
  }

  // Header interactions
  async clickLogo(): Promise<void> {
    await this.clickElement(this.selectors.logo);
  }

  async clickLogin(): Promise<void> {
    await this.clickElement(this.selectors.loginButton);
  }

  async clickSignup(): Promise<void> {
    await this.clickElement(this.selectors.signupButton);
  }

  // Hero section interactions
  async getHeroTitle(): Promise<string> {
    return await this.getElementText(this.selectors.heroTitle);
  }

  async getHeroSubtitle(): Promise<string> {
    return await this.getElementText(this.selectors.heroSubtitle);
  }

  async clickCTA(): Promise<void> {
    await this.clickElement(this.selectors.ctaButton);
  }

  async clickDemo(): Promise<void> {
    await this.clickElement(this.selectors.demoButton);
  }

  // Features section interactions
  async scrollToFeatures(): Promise<void> {
    await this.scrollIntoView(this.selectors.featuresSection);
  }

  async getFeatureCards(): Promise<Locator[]> {
    const cards = this.page.locator(this.selectors.featureCards);
    const count = await cards.count();
    const cardElements: Locator[] = [];
    
    for (let i = 0; i < count; i++) {
      cardElements.push(cards.nth(i));
    }
    
    return cardElements;
  }

  async getFeatureCardText(index: number): Promise<string> {
    const cards = this.page.locator(this.selectors.featureCards);
    return await cards.nth(index).textContent() || '';
  }

  // Pricing section interactions
  async scrollToPricing(): Promise<void> {
    await this.scrollIntoView(this.selectors.pricingSection);
  }

  async selectBasicPlan(): Promise<void> {
    await this.scrollIntoView(this.selectors.basicPlan);
    await this.clickElement(`${this.selectors.basicPlan} button`);
  }

  async selectProPlan(): Promise<void> {
    await this.scrollIntoView(this.selectors.proPlan);
    await this.clickElement(`${this.selectors.proPlan} button`);
  }

  async selectEnterprisePlan(): Promise<void> {
    await this.scrollIntoView(this.selectors.enterprisePlan);
    await this.clickElement(`${this.selectors.enterprisePlan} button`);
  }

  async getPlanPrice(plan: 'basic' | 'pro' | 'enterprise'): Promise<string> {
    const planSelector = this.selectors[`${plan}Plan` as keyof typeof this.selectors];
    return await this.getElementText(`${planSelector} [data-testid="price"]`);
  }

  async getPlanFeatures(plan: 'basic' | 'pro' | 'enterprise'): Promise<string[]> {
    const planSelector = this.selectors[`${plan}Plan` as keyof typeof this.selectors];
    const features = this.page.locator(`${planSelector} [data-testid="feature"]`);
    const count = await features.count();
    const featureTexts: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const text = await features.nth(i).textContent();
      if (text) featureTexts.push(text);
    }
    
    return featureTexts;
  }

  // Quick analysis interactions
  async performQuickAnalysis(text: string): Promise<void> {
    await this.scrollIntoView(this.selectors.quickAnalysisSection);
    await this.fillInput(this.selectors.textInput, text);
    await this.clickElement(this.selectors.analyzeButton);
    await this.waitForElement(this.selectors.resultsContainer);
  }

  async getAnalysisResults(): Promise<string> {
    await this.waitForElement(this.selectors.resultsContainer);
    return await this.getElementText(this.selectors.resultsContainer);
  }

  async isAnalysisLoading(): Promise<boolean> {
    return await this.isElementVisible('[data-testid="analysis-loading"]');
  }

  // Navigation helpers
  async navigateToSection(section: 'features' | 'pricing' | 'about' | 'contact'): Promise<void> {
    const navLink = `[data-testid="nav-${section}"]`;
    await this.clickElement(navLink);
    
    // Wait for scroll to complete
    await this.page.waitForTimeout(500);
  }

  // Footer interactions
  async getFooterLinks(): Promise<string[]> {
    const links = this.page.locator(this.selectors.footerLinks);
    const count = await links.count();
    const linkTexts: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const text = await links.nth(i).textContent();
      if (text) linkTexts.push(text.trim());
    }
    
    return linkTexts;
  }

  async clickFooterLink(linkText: string): Promise<void> {
    await this.clickElement(`footer a:has-text("${linkText}")`);
  }

  // Validation helpers
  async validatePageStructure(): Promise<boolean> {
    const requiredElements = [
      this.selectors.header,
      this.selectors.heroSection,
      this.selectors.featuresSection,
      this.selectors.pricingSection,
      this.selectors.footer,
    ];

    for (const selector of requiredElements) {
      if (!(await this.elementExists(selector))) {
        return false;
      }
    }

    return true;
  }

  async validateResponsiveDesign(): Promise<void> {
    // Test mobile viewport
    await this.setViewportSize(375, 667);
    await this.page.waitForTimeout(500);
    
    // Check if mobile menu exists
    const mobileMenuExists = await this.elementExists('[data-testid="mobile-menu"]');
    if (!mobileMenuExists) {
      throw new Error('Mobile menu not found in mobile viewport');
    }

    // Test tablet viewport
    await this.setViewportSize(768, 1024);
    await this.page.waitForTimeout(500);

    // Test desktop viewport
    await this.setViewportSize(1920, 1080);
    await this.page.waitForTimeout(500);
  }

  async validateAccessibility(): Promise<void> {
    // Check for proper heading hierarchy
    const headings = await this.page.locator('h1, h2, h3, h4, h5, h6').all();
    if (headings.length === 0) {
      throw new Error('No headings found on the page');
    }

    // Check for alt text on images
    const images = await this.page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      if (!alt) {
        throw new Error('Image found without alt text');
      }
    }

    // Check for proper form labels
    const inputs = await this.page.locator('input').all();
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      
      if (id) {
        const labelExists = await this.elementExists(`label[for="${id}"]`);
        if (!labelExists && !ariaLabel && !ariaLabelledBy) {
          throw new Error(`Input with id "${id}" has no associated label`);
        }
      }
    }
  }

  async validatePerformance(): Promise<{ [key: string]: number }> {
    const metrics = await this.getPerformanceMetrics();
    
    // Validate performance thresholds
    const thresholds = {
      firstContentfulPaint: 2000, // 2 seconds
      domContentLoaded: 3000,     // 3 seconds
      loadComplete: 5000,         // 5 seconds
    };

    const violations: string[] = [];
    
    if (metrics.firstContentfulPaint > thresholds.firstContentfulPaint) {
      violations.push(`First Contentful Paint too slow: ${metrics.firstContentfulPaint}ms`);
    }
    
    if (metrics.domContentLoaded > thresholds.domContentLoaded) {
      violations.push(`DOM Content Loaded too slow: ${metrics.domContentLoaded}ms`);
    }
    
    if (metrics.loadComplete > thresholds.loadComplete) {
      violations.push(`Load Complete too slow: ${metrics.loadComplete}ms`);
    }

    if (violations.length > 0) {
      logger.warn("Performance violations:", { violations });
    }

    return metrics;
  }
}