/**
 * Responsive Design Testing Utilities
 * Provides utilities for testing responsive design across different devices and viewports
 */

import { Page } from '@playwright/test';

export interface DeviceConfig {
  name: string;
  viewport: { width: number; height: number };
  userAgent: string;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

export interface ResponsiveTestResult {
  device: string;
  viewport: { width: number; height: number };
  layoutIssues: string[];
  overflowElements: Array<{
    selector: string;
    width: number;
    height: number;
    overflowX: boolean;
    overflowY: boolean;
  }>;
  hiddenElements: string[];
  touchTargets: Array<{
    selector: string;
    size: { width: number; height: number };
    meetsMinimum: boolean;
  }>;
  textReadability: {
    tooSmall: string[];
    averageFontSize: number;
    minFontSize: number;
  };
}

export class ResponsiveTester {
  private page: Page;
  
  // Common device configurations
  private devices: DeviceConfig[] = [
    {
      name: 'iPhone 12',
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
    {
      name: 'iPhone 12 Pro Max',
      viewport: { width: 428, height: 926 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
    {
      name: 'Samsung Galaxy S21',
      viewport: { width: 384, height: 854 },
      userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36',
      deviceScaleFactor: 2.75,
      isMobile: true,
      hasTouch: true,
    },
    {
      name: 'iPad Air',
      viewport: { width: 820, height: 1180 },
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      deviceScaleFactor: 2,
      isMobile: false,
      hasTouch: true,
    },
    {
      name: 'iPad Pro',
      viewport: { width: 1024, height: 1366 },
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      deviceScaleFactor: 2,
      isMobile: false,
      hasTouch: true,
    },
    {
      name: 'Desktop 1920x1080',
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    {
      name: 'Desktop 1366x768',
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    {
      name: 'Desktop 1440x900',
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  ];

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Test responsive design across all common devices
   */
  async testAllDevices(): Promise<ResponsiveTestResult[]> {
    const results: ResponsiveTestResult[] = [];
    
    for (const device of this.devices) {
      const result = await this.testDevice(device);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Test responsive design for a specific device
   */
  async testDevice(device: DeviceConfig): Promise<ResponsiveTestResult> {
    // Set device configuration
    await this.page.setViewportSize(device.viewport);
    await this.page.setExtraHTTPHeaders({
      'User-Agent': device.userAgent,
    });

    // Wait for layout to settle
    await this.page.waitForTimeout(500);

    // Run responsive tests
    const layoutIssues = await this.checkLayoutIssues();
    const overflowElements = await this.checkOverflowElements();
    const hiddenElements = await this.checkHiddenElements();
    const touchTargets = await this.checkTouchTargets(device.hasTouch);
    const textReadability = await this.checkTextReadability(device.isMobile);

    return {
      device: device.name,
      viewport: device.viewport,
      layoutIssues,
      overflowElements,
      hiddenElements,
      touchTargets,
      textReadability,
    };
  }

  /**
   * Check for layout issues
   */
  private async checkLayoutIssues(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const issues: string[] = [];
      
      // Check for horizontal scrollbars
      if (document.documentElement.scrollWidth > window.innerWidth) {
        issues.push('Horizontal scrollbar detected - content wider than viewport');
      }
      
      // Check for elements extending beyond viewport
      const allElements = document.querySelectorAll('*');
      Array.from(allElements).forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        if (rect.right > window.innerWidth + 10) { // 10px tolerance
          issues.push(`Element extends beyond right edge: ${element.tagName.toLowerCase()}[${index}]`);
        }
      });
      
      // Check for fixed positioning issues
      const fixedElements = Array.from(document.querySelectorAll('*')).filter(el => 
        window.getComputedStyle(el).position === 'fixed'
      );
      
      fixedElements.forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        if (rect.width > window.innerWidth || rect.height > window.innerHeight) {
          issues.push(`Fixed element too large for viewport: ${element.tagName.toLowerCase()}[${index}]`);
        }
      });
      
      return issues;
    });
  }

  /**
   * Check for elements with overflow issues
   */
  private async checkOverflowElements(): Promise<Array<{
    selector: string;
    width: number;
    height: number;
    overflowX: boolean;
    overflowY: boolean;
  }>> {
    return await this.page.evaluate(() => {
      const overflowElements: Array<{
        selector: string;
        width: number;
        height: number;
        overflowX: boolean;
        overflowY: boolean;
      }> = [];
      
      const allElements = document.querySelectorAll('*');
      Array.from(allElements).forEach((element, index) => {
        const computedStyle = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        
        // Check if element has content overflow
        if (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight) {
          const overflowX = computedStyle.overflowX;
          const overflowY = computedStyle.overflowY;
          
          // Only report if overflow is not intentionally handled
          if (overflowX === 'visible' || overflowY === 'visible') {
            overflowElements.push({
              selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}[${index}]`,
              width: rect.width,
              height: rect.height,
              overflowX: element.scrollWidth > element.clientWidth,
              overflowY: element.scrollHeight > element.clientHeight,
            });
          }
        }
      });
      
      return overflowElements;
    });
  }

  /**
   * Check for elements that become hidden on smaller screens
   */
  private async checkHiddenElements(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const hiddenElements: string[] = [];
      
      // Check for elements that might be important but are hidden
      const importantSelectors = [
        'nav', 'button', 'a', 'input', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="navigation"]'
      ];
      
      importantSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        Array.from(elements).forEach((element, index) => {
          const computedStyle = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          
          // Check if element is hidden
          if (computedStyle.display === 'none' || 
              computedStyle.visibility === 'hidden' ||
              computedStyle.opacity === '0' ||
              rect.width === 0 || rect.height === 0) {
            hiddenElements.push(`${selector}[${index}]: ${element.textContent?.trim().substring(0, 50) || 'no text'}`);
          }
        });
      });
      
      return hiddenElements;
    });
  }

  /**
   * Check touch target sizes for mobile devices
   */
  private async checkTouchTargets(hasTouch: boolean): Promise<Array<{
    selector: string;
    size: { width: number; height: number };
    meetsMinimum: boolean;
  }>> {
    if (!hasTouch) return [];
    
    return await this.page.evaluate(() => {
      const touchTargets: Array<{
        selector: string;
        size: { width: number; height: number };
        meetsMinimum: boolean;
      }> = [];
      
      const minTouchSize = 44; // 44px minimum touch target size (iOS/Android guidelines)
      
      // Check interactive elements
      const interactiveSelectors = [
        'button', 'a', 'input[type="button"]', 'input[type="submit"]',
        '[role="button"]', '[onclick]', '[role="link"]'
      ];
      
      interactiveSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        Array.from(elements).forEach((element, index) => {
          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);
          
          // Skip hidden elements
          if (computedStyle.display === 'none' || rect.width === 0 || rect.height === 0) {
            return;
          }
          
          const meetsMinimum = rect.width >= minTouchSize && rect.height >= minTouchSize;
          
          if (!meetsMinimum) {
            touchTargets.push({
              selector: `${selector}[${index}]`,
              size: { width: rect.width, height: rect.height },
              meetsMinimum,
            });
          }
        });
      });
      
      return touchTargets;
    });
  }

  /**
   * Check text readability on different screen sizes
   */
  private async checkTextReadability(isMobile: boolean): Promise<{
    tooSmall: string[];
    averageFontSize: number;
    minFontSize: number;
  }> {
    return await this.page.evaluate((isMobile) => {
      const tooSmall: string[] = [];
      const fontSizes: number[] = [];
      const minMobileFontSize = 16; // 16px minimum for mobile
      const minDesktopFontSize = 14; // 14px minimum for desktop
      const minFontSize = isMobile ? minMobileFontSize : minDesktopFontSize;
      
      // Check text elements
      const textElements = document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, a, button, label, li');
      
      Array.from(textElements).forEach((element, index) => {
        const computedStyle = window.getComputedStyle(element);
        const fontSize = parseFloat(computedStyle.fontSize);
        
        // Skip elements without text content
        if (!element.textContent?.trim()) return;
        
        fontSizes.push(fontSize);
        
        if (fontSize < minFontSize) {
          tooSmall.push(`${element.tagName.toLowerCase()}[${index}]: ${fontSize}px (min: ${minFontSize}px)`);
        }
      });
      
      const averageFontSize = fontSizes.length > 0 
        ? fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length 
        : 0;
      
      const actualMinFontSize = fontSizes.length > 0 ? Math.min(...fontSizes) : 0;
      
      return {
        tooSmall,
        averageFontSize: Math.round(averageFontSize * 100) / 100,
        minFontSize: actualMinFontSize,
      };
    }, isMobile);
  }

  /**
   * Test responsive images
   */
  async testResponsiveImages(): Promise<{
    totalImages: number;
    responsiveImages: number;
    missingAlt: string[];
    oversizedImages: Array<{
      src: string;
      displaySize: { width: number; height: number };
      naturalSize: { width: number; height: number };
      wastedBytes: number;
    }>;
  }> {
    return await this.page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const missingAlt: string[] = [];
      const oversizedImages: Array<{
        src: string;
        displaySize: { width: number; height: number };
        naturalSize: { width: number; height: number };
        wastedBytes: number;
      }> = [];
      
      let responsiveImages = 0;
      
      Array.from(images).forEach((img, index) => {
        // Check for alt text
        if (!img.alt) {
          missingAlt.push(`img[${index}]: ${img.src.substring(0, 50)}`);
        }
        
        // Check for responsive attributes
        if (img.srcset || img.sizes || img.style.maxWidth === '100%') {
          responsiveImages++;
        }
        
        // Check for oversized images
        const rect = img.getBoundingClientRect();
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        
        if (naturalWidth > rect.width * 2 || naturalHeight > rect.height * 2) {
          // Estimate wasted bytes (simplified calculation)
          const displayPixels = rect.width * rect.height;
          const naturalPixels = naturalWidth * naturalHeight;
          const wastedPixels = naturalPixels - displayPixels;
          const estimatedWastedBytes = wastedPixels * 3; // Rough estimate
          
          oversizedImages.push({
            src: img.src,
            displaySize: { width: rect.width, height: rect.height },
            naturalSize: { width: naturalWidth, height: naturalHeight },
            wastedBytes: estimatedWastedBytes,
          });
        }
      });
      
      return {
        totalImages: images.length,
        responsiveImages,
        missingAlt,
        oversizedImages,
      };
    });
  }

  /**
   * Test responsive navigation
   */
  async testResponsiveNavigation(): Promise<{
    hasHamburgerMenu: boolean;
    navigationVisible: boolean;
    mobileMenuFunctional: boolean;
    navigationAccessible: boolean;
  }> {
    const result = await this.page.evaluate(() => {
      // Check for hamburger menu
      const hamburgerSelectors = [
        '.hamburger', '.menu-toggle', '.nav-toggle', 
        '[aria-label*="menu"]', '[aria-label*="navigation"]'
      ];
      
      const hasHamburgerMenu = hamburgerSelectors.some(selector => 
        document.querySelector(selector) !== null
      );
      
      // Check if main navigation is visible
      const navElements = document.querySelectorAll('nav, [role="navigation"]');
      const navigationVisible = Array.from(navElements).some(nav => {
        const style = window.getComputedStyle(nav);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      
      // Check navigation accessibility
      const navigationAccessible = Array.from(navElements).some(nav => {
        return nav.getAttribute('aria-label') || 
               nav.getAttribute('role') === 'navigation' ||
               nav.tagName.toLowerCase() === 'nav';
      });
      
      return {
        hasHamburgerMenu,
        navigationVisible,
        navigationAccessible,
      };
    });
    
    // Test mobile menu functionality if hamburger menu exists
    let mobileMenuFunctional = false;
    if (result.hasHamburgerMenu) {
      try {
        const hamburger = this.page.locator('.hamburger, .menu-toggle, .nav-toggle').first();
        await hamburger.click();
        await this.page.waitForTimeout(500);
        
        // Check if menu opened
        const menuVisible = await this.page.evaluate(() => {
          const menus = document.querySelectorAll('.mobile-menu, .nav-menu, [aria-expanded="true"]');
          return Array.from(menus).some(menu => {
            const style = window.getComputedStyle(menu);
            return style.display !== 'none' && style.visibility !== 'hidden';
          });
        });
        
        mobileMenuFunctional = menuVisible;
      } catch (error) {
        // Hamburger menu might not be clickable or functional
        mobileMenuFunctional = false;
      }
    }
    
    return {
      ...result,
      mobileMenuFunctional,
    };
  }

  /**
   * Generate comprehensive responsive design report
   */
  async generateResponsiveReport(): Promise<{
    summary: {
      totalDevicesTested: number;
      devicesWithIssues: number;
      criticalIssues: number;
      overallScore: number;
    };
    deviceResults: ResponsiveTestResult[];
    imageAnalysis: any;
    navigationAnalysis: any;
    recommendations: string[];
  }> {
    // Test all devices
    const deviceResults = await this.testAllDevices();
    
    // Test images (using mobile viewport)
    await this.page.setViewportSize({ width: 375, height: 667 });
    const imageAnalysis = await this.testResponsiveImages();
    
    // Test navigation (using mobile viewport)
    const navigationAnalysis = await this.testResponsiveNavigation();
    
    // Calculate summary
    const devicesWithIssues = deviceResults.filter(result => 
      result.layoutIssues.length > 0 || 
      result.overflowElements.length > 0 ||
      result.touchTargets.some(target => !target.meetsMinimum)
    ).length;
    
    const criticalIssues = deviceResults.reduce((sum, result) => 
      sum + result.layoutIssues.length + result.overflowElements.length, 0
    );
    
    // Calculate score (0-100)
    const maxPossibleIssues = deviceResults.length * 10; // Arbitrary max
    const score = Math.max(0, 100 - (criticalIssues / maxPossibleIssues) * 100);
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (criticalIssues > 0) {
      recommendations.push(`Fix ${criticalIssues} critical responsive design issues`);
    }
    
    if (imageAnalysis.oversizedImages.length > 0) {
      recommendations.push(`Optimize ${imageAnalysis.oversizedImages.length} oversized images`);
    }
    
    if (imageAnalysis.responsiveImages / imageAnalysis.totalImages < 0.8) {
      recommendations.push('Implement responsive images with srcset and sizes attributes');
    }
    
    if (!navigationAnalysis.mobileMenuFunctional) {
      recommendations.push('Implement functional mobile navigation menu');
    }
    
    const touchTargetIssues = deviceResults.reduce((sum, result) => 
      sum + result.touchTargets.filter(target => !target.meetsMinimum).length, 0
    );
    
    if (touchTargetIssues > 0) {
      recommendations.push(`Increase size of ${touchTargetIssues} touch targets for mobile devices`);
    }
    
    return {
      summary: {
        totalDevicesTested: deviceResults.length,
        devicesWithIssues,
        criticalIssues,
        overallScore: Math.round(score),
      },
      deviceResults,
      imageAnalysis,
      navigationAnalysis,
      recommendations,
    };
  }

  /**
   * Test specific breakpoints
   */
  async testBreakpoints(breakpoints: number[]): Promise<Array<{
    width: number;
    layoutIssues: string[];
    elementVisibility: { [selector: string]: boolean };
  }>> {
    const results: Array<{
      width: number;
      layoutIssues: string[];
      elementVisibility: { [selector: string]: boolean };
    }> = [];
    
    const testSelectors = [
      'nav', '.navigation', '.menu', '.sidebar', '.header', '.footer',
      '.container', '.content', '.main', '.hero'
    ];
    
    for (const width of breakpoints) {
      await this.page.setViewportSize({ width, height: 800 });
      await this.page.waitForTimeout(500);
      
      const layoutIssues = await this.checkLayoutIssues();
      
      const elementVisibility = await this.page.evaluate((selectors) => {
        const visibility: { [selector: string]: boolean } = {};
        
        selectors.forEach(selector => {
          const element = document.querySelector(selector);
          if (element) {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            visibility[selector] = style.display !== 'none' && 
                                 style.visibility !== 'hidden' &&
                                 rect.width > 0 && rect.height > 0;
          } else {
            visibility[selector] = false;
          }
        });
        
        return visibility;
      }, testSelectors);
      
      results.push({
        width,
        layoutIssues,
        elementVisibility,
      });
    }
    
    return results;
  }
}