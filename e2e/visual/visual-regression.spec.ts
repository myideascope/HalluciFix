import { test, expect } from '@playwright/test';
import { AnalyzerPage, DashboardPage, AuthPage } from '../pages';
import { mockAuthentication, waitForAppLoad } from '../utils/test-helpers';

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set consistent viewport and theme
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Disable animations for consistent screenshots
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `
    });
    
    // Set consistent theme
    await page.evaluate(() => {
      localStorage.setItem('theme', 'light');
    });
  });

  test('landing page visual baseline', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Wait for all images and content to load
    await page.waitForLoadState('networkidle');
    
    // Hide dynamic elements that change between runs
    await page.evaluate(() => {
      // Hide timestamps, counters, or other dynamic content
      const dynamicElements = document.querySelectorAll('[data-dynamic="true"]');
      dynamicElements.forEach(el => {
        (el as HTMLElement).style.visibility = 'hidden';
      });
    });
    
    // Take full page screenshot
    await expect(page).toHaveScreenshot('landing-page.png', {
      fullPage: true,
      animations: 'disabled'
    });
    
    // Test different sections
    const heroSection = page.getByTestId('hero-section');
    if (await heroSection.isVisible()) {
      await expect(heroSection).toHaveScreenshot('landing-hero-section.png');
    }
    
    const featuresSection = page.getByTestId('features-section');
    if (await featuresSection.isVisible()) {
      await expect(featuresSection).toHaveScreenshot('landing-features-section.png');
    }
  });

  test('analyzer page visual states', async ({ page }) => {
    const analyzerPage = new AnalyzerPage(page);
    
    await analyzerPage.goto();
    await waitForAppLoad(page);
    
    // Initial empty state
    await expect(page).toHaveScreenshot('analyzer-empty-state.png', {
      fullPage: true,
      animations: 'disabled'
    });
    
    // With sample content
    await analyzerPage.fillContent('This is sample content for visual testing purposes.');
    await expect(page).toHaveScreenshot('analyzer-with-content.png', {
      fullPage: true,
      animations: 'disabled'
    });
    
    // Mock analysis results for consistent visual testing
    await page.evaluate(() => {
      // Mock the analysis results
      const mockResults = {
        accuracy: 85.5,
        riskLevel: 'medium',
        hallucinations: [
          { text: 'Sample hallucination 1', severity: 'medium' },
          { text: 'Sample hallucination 2', severity: 'low' }
        ],
        processingTime: 1250,
        verificationSources: 8
      };
      
      // Simulate results display
      const resultsSection = document.querySelector('[data-testid="analysis-results"]');
      if (resultsSection) {
        resultsSection.innerHTML = `
          <div data-testid="accuracy-score">85.5%</div>
          <div data-testid="risk-level">Medium</div>
          <div data-testid="risk-badge" class="bg-yellow-500">Medium Risk</div>
          <div data-testid="processing-time">Processing time: 1250ms</div>
          <div data-testid="verification-sources">Sources: 8</div>
          <div data-testid="hallucinations-list">
            <div data-testid="hallucination-item" data-severity="medium">Sample hallucination 1</div>
            <div data-testid="hallucination-item" data-severity="low">Sample hallucination 2</div>
          </div>
        `;
        (resultsSection as HTMLElement).style.display = 'block';
      }
    });
    
    // Results state
    await expect(page).toHaveScreenshot('analyzer-with-results.png', {
      fullPage: true,
      animations: 'disabled'
    });
    
    // Test different risk levels
    const riskLevels = ['low', 'medium', 'high', 'critical'];
    for (const risk of riskLevels) {
      await page.evaluate((riskLevel) => {
        const riskElement = document.querySelector('[data-testid="risk-level"]');
        const riskBadge = document.querySelector('[data-testid="risk-badge"]');
        if (riskElement && riskBadge) {
          riskElement.textContent = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);
          
          // Update badge color based on risk level
          riskBadge.className = riskBadge.className.replace(/bg-\w+-\d+/, '');
          const colorMap = {
            low: 'bg-green-500',
            medium: 'bg-yellow-500',
            high: 'bg-orange-500',
            critical: 'bg-red-500'
          };
          riskBadge.classList.add(colorMap[riskLevel as keyof typeof colorMap]);
        }
      }, risk);
      
      await expect(page.getByTestId('analysis-results')).toHaveScreenshot(`analyzer-risk-${risk}.png`);
    }
  });

  test('dashboard visual states', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);
    
    // Mock authentication
    await mockAuthentication(page);
    
    await dashboardPage.goto();
    await waitForAppLoad(page);
    
    // Mock dashboard data for consistent visuals
    await page.evaluate(() => {
      // Mock analytics data
      const mockStats = {
        totalAnalyses: 1247,
        averageAccuracy: 87.3,
        totalHallucinations: 156,
        riskDistribution: {
          low: 65,
          medium: 25,
          high: 8,
          critical: 2
        }
      };
      
      // Update stats display
      const statsElements = {
        'total-analyses': '1,247',
        'average-accuracy': '87.3%',
        'total-hallucinations': '156',
        'low-risk-count': '65%',
        'medium-risk-count': '25%',
        'high-risk-count': '8%',
        'critical-risk-count': '2%'
      };
      
      Object.entries(statsElements).forEach(([testId, value]) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        if (element) {
          element.textContent = value;
        }
      });
    });
    
    // Dashboard overview
    await expect(page).toHaveScreenshot('dashboard-overview.png', {
      fullPage: true,
      animations: 'disabled'
    });
    
    // Individual dashboard sections
    const quickActions = page.getByTestId('quick-actions');
    if (await quickActions.isVisible()) {
      await expect(quickActions).toHaveScreenshot('dashboard-quick-actions.png');
    }
    
    const analyticsSection = page.getByTestId('analytics-section');
    if (await analyticsSection.isVisible()) {
      await expect(analyticsSection).toHaveScreenshot('dashboard-analytics.png');
    }
    
    const recentAnalyses = page.getByTestId('recent-analyses');
    if (await recentAnalyses.isVisible()) {
      await expect(recentAnalyses).toHaveScreenshot('dashboard-recent-analyses.png');
    }
  });

  test('authentication modal visual states', async ({ page }) => {
    const authPage = new AuthPage(page);
    
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Open auth modal
    await authPage.openAuthModal();
    
    // Login form state
    await expect(page.getByTestId('auth-modal')).toHaveScreenshot('auth-modal-login.png');
    
    // Switch to signup if available
    const signupTab = page.getByTestId('signup-tab');
    if (await signupTab.isVisible()) {
      await signupTab.click();
      await expect(page.getByTestId('auth-modal')).toHaveScreenshot('auth-modal-signup.png');
    }
    
    // Error state
    await page.evaluate(() => {
      const errorElement = document.querySelector('[data-testid="auth-error"]');
      if (errorElement) {
        errorElement.textContent = 'Invalid email or password';
        (errorElement as HTMLElement).style.display = 'block';
      }
    });
    
    await expect(page.getByTestId('auth-modal')).toHaveScreenshot('auth-modal-error.png');
  });

  test('responsive design visual tests', async ({ page }) => {
    // Test different viewport sizes
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1280, height: 720 },
      { name: 'large-desktop', width: 1920, height: 1080 }
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Landing page responsive
      await page.goto('/');
      await waitForAppLoad(page);
      await expect(page).toHaveScreenshot(`landing-${viewport.name}.png`, {
        fullPage: true,
        animations: 'disabled'
      });
      
      // Analyzer page responsive
      const analyzerPage = new AnalyzerPage(page);
      await analyzerPage.goto();
      await waitForAppLoad(page);
      await expect(page).toHaveScreenshot(`analyzer-${viewport.name}.png`, {
        fullPage: true,
        animations: 'disabled'
      });
    }
  });

  test('dark mode visual comparison', async ({ page }) => {
    // Test both light and dark themes
    const themes = ['light', 'dark'];
    
    for (const theme of themes) {
      await page.evaluate((themeName) => {
        localStorage.setItem('theme', themeName);
        document.documentElement.classList.toggle('dark', themeName === 'dark');
      }, theme);
      
      // Landing page
      await page.goto('/');
      await waitForAppLoad(page);
      await expect(page).toHaveScreenshot(`landing-${theme}-theme.png`, {
        fullPage: true,
        animations: 'disabled'
      });
      
      // Analyzer page
      const analyzerPage = new AnalyzerPage(page);
      await analyzerPage.goto();
      await waitForAppLoad(page);
      await expect(page).toHaveScreenshot(`analyzer-${theme}-theme.png`, {
        fullPage: true,
        animations: 'disabled'
      });
      
      // Dashboard (with mock auth)
      await mockAuthentication(page);
      const dashboardPage = new DashboardPage(page);
      await dashboardPage.goto();
      await waitForAppLoad(page);
      await expect(page).toHaveScreenshot(`dashboard-${theme}-theme.png`, {
        fullPage: true,
        animations: 'disabled'
      });
    }
  });

  test('component interaction states', async ({ page }) => {
    const analyzerPage = new AnalyzerPage(page);
    
    await analyzerPage.goto();
    await waitForAppLoad(page);
    
    // Button states
    const analyzeButton = analyzerPage.analyzeButton;
    
    // Default state
    await expect(analyzeButton).toHaveScreenshot('button-default.png');
    
    // Hover state
    await analyzeButton.hover();
    await expect(analyzeButton).toHaveScreenshot('button-hover.png');
    
    // Focus state
    await analyzeButton.focus();
    await expect(analyzeButton).toHaveScreenshot('button-focus.png');
    
    // Disabled state
    await page.evaluate(() => {
      const button = document.querySelector('[data-testid="analyze-button"]') as HTMLButtonElement;
      if (button) {
        button.disabled = true;
      }
    });
    await expect(analyzeButton).toHaveScreenshot('button-disabled.png');
    
    // Form validation states
    await analyzerPage.fillContent('');
    await analyzeButton.click();
    
    const textarea = analyzerPage.contentTextarea;
    await expect(textarea).toHaveScreenshot('textarea-error-state.png');
  });

  test('loading states visual comparison', async ({ page }) => {
    const analyzerPage = new AnalyzerPage(page);
    
    await analyzerPage.goto();
    await waitForAppLoad(page);
    
    // Mock loading state
    await page.evaluate(() => {
      const loadingSpinner = document.querySelector('[data-testid="loading-spinner"]');
      const analyzeButton = document.querySelector('[data-testid="analyze-button"]') as HTMLButtonElement;
      
      if (loadingSpinner && analyzeButton) {
        (loadingSpinner as HTMLElement).style.display = 'block';
        analyzeButton.disabled = true;
        analyzeButton.textContent = 'Analyzing...';
      }
    });
    
    await expect(page).toHaveScreenshot('analyzer-loading-state.png', {
      fullPage: true,
      animations: 'disabled'
    });
    
    // Loading spinner component
    const loadingSpinner = page.getByTestId('loading-spinner');
    await expect(loadingSpinner).toHaveScreenshot('loading-spinner.png');
  });
});