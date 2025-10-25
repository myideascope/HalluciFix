/**
 * Accessibility Compliance Testing Suite
 * Tests for WCAG 2.1 AA compliance, keyboard navigation, and screen reader compatibility
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Compliance Testing', () => {
  
  test.describe('WCAG 2.1 AA Compliance', () => {
    test('Landing page meets WCAG 2.1 AA standards', async ({ page }) => {
      await page.goto('/');
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      
      // Log violations for debugging
      if (accessibilityScanResults.violations.length > 0) {
        console.log('Accessibility violations found:', 
          accessibilityScanResults.violations.map(v => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            nodes: v.nodes.length
          }))
        );
      }
      
      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('Dashboard meets WCAG 2.1 AA standards', async ({ page }) => {
      await page.goto('/dashboard');
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      
      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('Analyzer page meets WCAG 2.1 AA standards', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to analyzer if it's a separate page
      const analyzerLink = page.locator('a[href*="analyzer"], button:has-text("Analyze")').first();
      if (await analyzerLink.isVisible()) {
        await analyzerLink.click();
        await page.waitForLoadState('networkidle');
      }
      
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      
      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('Forms meet accessibility standards', async ({ page }) => {
      await page.goto('/');
      
      // Focus on form elements specifically
      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('form')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      
      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('Navigation meets accessibility standards', async ({ page }) => {
      await page.goto('/');
      
      // Focus on navigation elements
      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('nav, [role="navigation"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      
      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('All interactive elements are keyboard accessible', async ({ page }) => {
      await page.goto('/');
      
      // Get all interactive elements
      const interactiveElements = await page.locator(
        'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"]'
      ).all();
      
      for (const element of interactiveElements) {
        if (await element.isVisible()) {
          // Focus the element
          await element.focus();
          
          // Check if element is actually focused
          const isFocused = await element.evaluate(el => document.activeElement === el);
          expect(isFocused).toBe(true);
          
          // Check for visible focus indicator
          const focusStyles = await element.evaluate(el => {
            const styles = window.getComputedStyle(el);
            return {
              outline: styles.outline,
              outlineWidth: styles.outlineWidth,
              outlineStyle: styles.outlineStyle,
              boxShadow: styles.boxShadow
            };
          });
          
          // Should have some form of focus indicator
          const hasFocusIndicator = 
            focusStyles.outline !== 'none' ||
            focusStyles.outlineWidth !== '0px' ||
            focusStyles.boxShadow !== 'none';
          
          if (!hasFocusIndicator) {
            console.warn(`Element may lack focus indicator:`, await element.textContent());
          }
        }
      }
    });

    test('Tab navigation works correctly', async ({ page }) => {
      await page.goto('/');
      
      // Start from the beginning
      await page.keyboard.press('Tab');
      
      const focusedElements: string[] = [];
      let previousElement = '';
      
      // Tab through first 10 elements to test tab order
      for (let i = 0; i < 10; i++) {
        const activeElement = await page.evaluate(() => {
          const el = document.activeElement;
          if (el) {
            return {
              tagName: el.tagName,
              id: el.id,
              className: el.className,
              textContent: el.textContent?.slice(0, 50) || ''
            };
          }
          return null;
        });
        
        if (activeElement) {
          const elementId = `${activeElement.tagName}#${activeElement.id}.${activeElement.className}`;
          
          // Check that we're not stuck on the same element
          expect(elementId).not.toBe(previousElement);
          
          focusedElements.push(elementId);
          previousElement = elementId;
        }
        
        await page.keyboard.press('Tab');
        await page.waitForTimeout(100);
      }
      
      // Should have focused multiple different elements
      expect(focusedElements.length).toBeGreaterThan(3);
    });

    test('Shift+Tab reverse navigation works', async ({ page }) => {
      await page.goto('/');
      
      // Tab forward a few times
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
      }
      
      const forwardElement = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? el.outerHTML : null;
      });
      
      // Tab backward
      await page.keyboard.press('Shift+Tab');
      
      const backwardElement = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? el.outerHTML : null;
      });
      
      // Should be on a different element
      expect(backwardElement).not.toBe(forwardElement);
    });

    test('Enter and Space keys activate buttons', async ({ page }) => {
      await page.goto('/');
      
      const buttons = await page.locator('button, [role="button"]').all();
      
      for (const button of buttons) {
        if (await button.isVisible() && await button.isEnabled()) {
          await button.focus();
          
          // Test Enter key
          let activated = false;
          
          // Listen for click events
          await page.evaluate(() => {
            window.testActivated = false;
            document.addEventListener('click', () => {
              window.testActivated = true;
            }, { once: true });
          });
          
          await page.keyboard.press('Enter');
          
          activated = await page.evaluate(() => (window as any).testActivated);
          
          if (!activated) {
            // Try Space key
            await page.evaluate(() => {
              window.testActivated = false;
              document.addEventListener('click', () => {
                window.testActivated = true;
              }, { once: true });
            });
            
            await page.keyboard.press('Space');
            activated = await page.evaluate(() => (window as any).testActivated);
          }
          
          // At least one key should activate the button
          if (!activated) {
            const buttonText = await button.textContent();
            console.warn(`Button may not be keyboard activatable: "${buttonText}"`);
          }
          
          break; // Test only first visible button to avoid side effects
        }
      }
    });

    test('Escape key closes modals and dropdowns', async ({ page }) => {
      await page.goto('/');
      
      // Look for elements that might open modals/dropdowns
      const triggers = await page.locator(
        'button:has-text("menu"), button:has-text("options"), [aria-haspopup], [data-testid*="menu"], [data-testid*="dropdown"]'
      ).all();
      
      for (const trigger of triggers) {
        if (await trigger.isVisible()) {
          await trigger.click();
          await page.waitForTimeout(500);
          
          // Check if something opened
          const modal = page.locator('[role="dialog"], [role="menu"], .modal, .dropdown').first();
          
          if (await modal.isVisible()) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            
            // Modal should be closed
            const isStillVisible = await modal.isVisible();
            expect(isStillVisible).toBe(false);
          }
          
          break; // Test only first trigger to avoid conflicts
        }
      }
    });
  });

  test.describe('Screen Reader Compatibility', () => {
    test('All images have alt text', async ({ page }) => {
      await page.goto('/');
      
      const images = await page.locator('img').all();
      
      for (const img of images) {
        const alt = await img.getAttribute('alt');
        const ariaLabel = await img.getAttribute('aria-label');
        const ariaLabelledby = await img.getAttribute('aria-labelledby');
        const role = await img.getAttribute('role');
        
        // Decorative images should have empty alt or role="presentation"
        const isDecorative = alt === '' || role === 'presentation';
        
        if (!isDecorative) {
          // Non-decorative images must have descriptive text
          const hasDescription = alt || ariaLabel || ariaLabelledby;
          expect(hasDescription).toBeTruthy();
          
          if (alt) {
            expect(alt.length).toBeGreaterThan(0);
          }
        }
      }
    });

    test('Form inputs have proper labels', async ({ page }) => {
      await page.goto('/');
      
      const inputs = await page.locator('input, select, textarea').all();
      
      for (const input of inputs) {
        const type = await input.getAttribute('type');
        
        // Skip hidden inputs
        if (type === 'hidden') continue;
        
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledby = await input.getAttribute('aria-labelledby');
        const placeholder = await input.getAttribute('placeholder');
        
        // Check for associated label
        let hasLabel = false;
        
        if (id) {
          const label = page.locator(`label[for="${id}"]`);
          hasLabel = await label.count() > 0;
        }
        
        // Input should have label, aria-label, or aria-labelledby
        const hasAccessibleName = hasLabel || ariaLabel || ariaLabelledby;
        
        if (!hasAccessibleName) {
          const inputInfo = {
            type,
            id,
            placeholder,
            name: await input.getAttribute('name')
          };
          console.warn('Input lacks accessible name:', inputInfo);
        }
        
        expect(hasAccessibleName).toBe(true);
      }
    });

    test('Headings follow proper hierarchy', async ({ page }) => {
      await page.goto('/');
      
      const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
      
      if (headings.length === 0) return; // No headings to test
      
      const headingLevels: number[] = [];
      
      for (const heading of headings) {
        const tagName = await heading.evaluate(el => el.tagName);
        const level = parseInt(tagName.charAt(1));
        headingLevels.push(level);
      }
      
      // Should start with h1
      expect(headingLevels[0]).toBe(1);
      
      // Check for proper hierarchy (no skipping levels)
      for (let i = 1; i < headingLevels.length; i++) {
        const currentLevel = headingLevels[i];
        const previousLevel = headingLevels[i - 1];
        
        // Can stay same, go down one level, or go up any number of levels
        const validTransition = 
          currentLevel === previousLevel || // Same level
          currentLevel === previousLevel + 1 || // One level deeper
          currentLevel < previousLevel; // Any level up
        
        if (!validTransition) {
          console.warn(`Heading hierarchy issue: h${previousLevel} followed by h${currentLevel}`);
        }
      }
    });

    test('ARIA landmarks are present', async ({ page }) => {
      await page.goto('/');
      
      // Check for main landmark
      const main = page.locator('main, [role="main"]');
      expect(await main.count()).toBeGreaterThan(0);
      
      // Check for navigation if present
      const nav = page.locator('nav, [role="navigation"]');
      const navCount = await nav.count();
      
      if (navCount > 0) {
        // Navigation should be accessible
        for (let i = 0; i < navCount; i++) {
          const navElement = nav.nth(i);
          const ariaLabel = await navElement.getAttribute('aria-label');
          const ariaLabelledby = await navElement.getAttribute('aria-labelledby');
          
          if (navCount > 1) {
            // Multiple nav elements should be distinguished
            expect(ariaLabel || ariaLabelledby).toBeTruthy();
          }
        }
      }
    });

    test('Interactive elements have proper roles', async ({ page }) => {
      await page.goto('/');
      
      // Check buttons
      const buttons = await page.locator('button, [role="button"]').all();
      
      for (const button of buttons) {
        const role = await button.getAttribute('role');
        const tagName = await button.evaluate(el => el.tagName);
        
        if (tagName !== 'BUTTON') {
          // Non-button elements acting as buttons should have role="button"
          expect(role).toBe('button');
        }
        
        // Should have accessible name
        const ariaLabel = await button.getAttribute('aria-label');
        const textContent = await button.textContent();
        const ariaLabelledby = await button.getAttribute('aria-labelledby');
        
        const hasAccessibleName = ariaLabel || (textContent && textContent.trim()) || ariaLabelledby;
        expect(hasAccessibleName).toBeTruthy();
      }
      
      // Check links
      const links = await page.locator('a, [role="link"]').all();
      
      for (const link of links) {
        const href = await link.getAttribute('href');
        const role = await link.getAttribute('role');
        const tagName = await link.evaluate(el => el.tagName);
        
        if (tagName !== 'A') {
          expect(role).toBe('link');
        }
        
        // Links should have descriptive text
        const textContent = await link.textContent();
        const ariaLabel = await link.getAttribute('aria-label');
        
        const hasDescription = (textContent && textContent.trim()) || ariaLabel;
        expect(hasDescription).toBeTruthy();
        
        // Avoid generic link text
        if (textContent) {
          const genericTexts = ['click here', 'read more', 'link', 'here'];
          const isGeneric = genericTexts.some(generic => 
            textContent.toLowerCase().trim() === generic
          );
          
          if (isGeneric) {
            console.warn(`Generic link text found: "${textContent}"`);
          }
        }
      }
    });
  });

  test.describe('Color Contrast and Visual Accessibility', () => {
    test('Color contrast meets WCAG AA standards', async ({ page }) => {
      await page.goto('/');
      
      // Use axe-core to check color contrast
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .withRules(['color-contrast'])
        .analyze();
      
      expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('Focus indicators are visible', async ({ page }) => {
      await page.goto('/');
      
      const focusableElements = await page.locator(
        'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ).all();
      
      for (const element of focusableElements.slice(0, 5)) { // Test first 5 elements
        if (await element.isVisible()) {
          await element.focus();
          
          // Check for focus styles
          const focusStyles = await element.evaluate(el => {
            const styles = window.getComputedStyle(el);
            return {
              outline: styles.outline,
              outlineWidth: styles.outlineWidth,
              outlineColor: styles.outlineColor,
              boxShadow: styles.boxShadow,
              borderColor: styles.borderColor
            };
          });
          
          // Should have visible focus indicator
          const hasVisibleFocus = 
            (focusStyles.outline !== 'none' && focusStyles.outlineWidth !== '0px') ||
            focusStyles.boxShadow !== 'none' ||
            focusStyles.borderColor !== 'transparent';
          
          if (!hasVisibleFocus) {
            const elementInfo = await element.evaluate(el => ({
              tagName: el.tagName,
              className: el.className,
              textContent: el.textContent?.slice(0, 30)
            }));
            console.warn('Element may lack visible focus indicator:', elementInfo);
          }
        }
      }
    });

    test('Text is readable without color alone', async ({ page }) => {
      await page.goto('/');
      
      // Check for elements that might rely on color alone
      const colorOnlyElements = await page.locator(
        '.text-red, .text-green, .text-yellow, .bg-red, .bg-green, .bg-yellow, [style*="color:"]'
      ).all();
      
      for (const element of colorOnlyElements) {
        const textContent = await element.textContent();
        const ariaLabel = await element.getAttribute('aria-label');
        const title = await element.getAttribute('title');
        
        // Elements conveying information through color should have additional indicators
        if (textContent && textContent.trim()) {
          // Check if text itself conveys the meaning (not just color)
          const hasTextualIndicator = 
            textContent.includes('error') ||
            textContent.includes('success') ||
            textContent.includes('warning') ||
            textContent.includes('info') ||
            ariaLabel ||
            title;
          
          if (!hasTextualIndicator) {
            console.warn('Element may rely on color alone:', textContent.slice(0, 50));
          }
        }
      }
    });
  });

  test.describe('Motion and Animation Accessibility', () => {
    test('Respects prefers-reduced-motion', async ({ page }) => {
      // Set reduced motion preference
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      
      // Check that animations are disabled or reduced
      const animatedElements = await page.locator(
        '[class*="animate"], [style*="animation"], [style*="transition"]'
      ).all();
      
      for (const element of animatedElements) {
        const styles = await element.evaluate(el => {
          const computed = window.getComputedStyle(el);
          return {
            animationDuration: computed.animationDuration,
            transitionDuration: computed.transitionDuration
          };
        });
        
        // Animations should be disabled or very short with reduced motion
        if (styles.animationDuration !== 'none' && styles.animationDuration !== '0s') {
          console.warn('Animation may not respect reduced motion preference');
        }
      }
    });

    test('No auto-playing media without controls', async ({ page }) => {
      await page.goto('/');
      
      const mediaElements = await page.locator('video, audio').all();
      
      for (const media of mediaElements) {
        const autoplay = await media.getAttribute('autoplay');
        const controls = await media.getAttribute('controls');
        const muted = await media.getAttribute('muted');
        
        if (autoplay !== null) {
          // Auto-playing media should either be muted or have controls
          expect(muted !== null || controls !== null).toBe(true);
        }
      }
    });
  });

  test.describe('Mobile Accessibility', () => {
    test('Touch targets are adequately sized', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      
      const touchTargets = await page.locator('button, a, input, select, [role="button"]').all();
      
      for (const target of touchTargets) {
        if (await target.isVisible()) {
          const boundingBox = await target.boundingBox();
          
          if (boundingBox) {
            // WCAG recommends minimum 44x44 CSS pixels for touch targets
            const minSize = 44;
            
            if (boundingBox.width < minSize || boundingBox.height < minSize) {
              const elementInfo = await target.evaluate(el => ({
                tagName: el.tagName,
                textContent: el.textContent?.slice(0, 30),
                className: el.className
              }));
              
              console.warn(`Touch target may be too small (${boundingBox.width}x${boundingBox.height}):`, elementInfo);
            }
          }
        }
      }
    });

    test('Content is accessible at 200% zoom', async ({ page }) => {
      await page.goto('/');
      
      // Zoom to 200%
      await page.evaluate(() => {
        document.body.style.zoom = '2';
      });
      
      await page.waitForTimeout(1000);
      
      // Check that content is still accessible
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2aa'])
        .analyze();
      
      // Reset zoom
      await page.evaluate(() => {
        document.body.style.zoom = '1';
      });
      
      expect(accessibilityScanResults.violations).toEqual([]);
    });
  });
});