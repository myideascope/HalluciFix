import { Browser, BrowserContext, Page, chromium } from '@playwright/test';
import { WebVitalsMetrics, measureWebVitals } from './web-vitals';
import { PerformanceMonitor } from './performance-monitor';

export interface LoadTestConfig {
  concurrentUsers: number;
  testDuration: number; // in milliseconds
  rampUpTime: number; // time to reach full load
  scenarios: LoadTestScenario[];
}

export interface LoadTestScenario {
  name: string;
  weight: number; // percentage of users running this scenario
  actions: LoadTestAction[];
}

export interface LoadTestAction {
  type: 'navigate' | 'click' | 'fill' | 'wait' | 'analyze' | 'upload';
  target?: string;
  value?: string;
  timeout?: number;
  delay?: number;
}

export interface LoadTestResult {
  scenario: string;
  userId: number;
  startTime: number;
  endTime: number;
  success: boolean;
  error?: string;
  metrics?: WebVitalsMetrics;
  actionResults: ActionResult[];
}

export interface ActionResult {
  action: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
}

export interface LoadTestSummary {
  totalUsers: number;
  successfulUsers: number;
  failedUsers: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number; // requests per second
  errorRate: number;
  scenarioResults: Record<string, {
    count: number;
    successRate: number;
    averageTime: number;
  }>;
  performanceMetrics: {
    averageFCP: number;
    averageLCP: number;
    averageCLS: number;
  };
}

/**
 * Load testing orchestrator
 */
export class LoadTester {
  private browser: Browser | null = null;
  private contexts: BrowserContext[] = [];
  private results: LoadTestResult[] = [];

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
  }

  async cleanup(): Promise<void> {
    // Close all contexts
    await Promise.all(this.contexts.map(context => context.close()));
    this.contexts = [];
    
    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async runLoadTest(config: LoadTestConfig): Promise<LoadTestSummary> {
    if (!this.browser) {
      throw new Error('LoadTester not initialized. Call initialize() first.');
    }

    this.results = [];
    const userPromises: Promise<void>[] = [];

    // Calculate user distribution across scenarios
    const userDistribution = this.calculateUserDistribution(config);

    // Ramp up users gradually
    const rampUpInterval = config.rampUpTime / config.concurrentUsers;

    for (let userId = 0; userId < config.concurrentUsers; userId++) {
      const scenario = this.selectScenario(userId, userDistribution, config.scenarios);
      
      // Delay user start for ramp-up
      const startDelay = userId * rampUpInterval;
      
      const userPromise = this.runUserScenario(userId, scenario, config.testDuration, startDelay);
      userPromises.push(userPromise);
    }

    // Wait for all users to complete
    await Promise.allSettled(userPromises);

    // Generate summary
    return this.generateSummary();
  }

  private calculateUserDistribution(config: LoadTestConfig): number[] {
    const distribution: number[] = [];
    let currentUser = 0;

    config.scenarios.forEach(scenario => {
      const userCount = Math.floor((scenario.weight / 100) * config.concurrentUsers);
      for (let i = 0; i < userCount; i++) {
        distribution.push(config.scenarios.indexOf(scenario));
        currentUser++;
      }
    });

    // Assign remaining users to first scenario
    while (currentUser < config.concurrentUsers) {
      distribution.push(0);
      currentUser++;
    }

    return distribution;
  }

  private selectScenario(userId: number, distribution: number[], scenarios: LoadTestScenario[]): LoadTestScenario {
    const scenarioIndex = distribution[userId] || 0;
    return scenarios[scenarioIndex];
  }

  private async runUserScenario(
    userId: number, 
    scenario: LoadTestScenario, 
    duration: number, 
    startDelay: number
  ): Promise<void> {
    // Wait for ramp-up delay
    if (startDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, startDelay));
    }

    const startTime = Date.now();
    const endTime = startTime + duration;
    
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let performanceMonitor: PerformanceMonitor | null = null;

    try {
      // Create browser context for this user
      context = await this.browser!.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: `LoadTest-User-${userId}`
      });
      this.contexts.push(context);

      page = await context.newPage();
      performanceMonitor = new PerformanceMonitor(page);
      await performanceMonitor.startMonitoring();

      const actionResults: ActionResult[] = [];
      let success = true;
      let error: string | undefined;

      // Run scenario actions repeatedly until duration expires
      while (Date.now() < endTime && success) {
        for (const action of scenario.actions) {
          if (Date.now() >= endTime) break;

          const actionResult = await this.executeAction(page, action);
          actionResults.push(actionResult);

          if (!actionResult.success) {
            success = false;
            error = actionResult.error;
            break;
          }

          // Add delay between actions if specified
          if (action.delay) {
            await new Promise(resolve => setTimeout(resolve, action.delay));
          }
        }

        // Small delay between scenario iterations
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Measure final performance metrics
      const metrics = await measureWebVitals(page);

      // Record result
      this.results.push({
        scenario: scenario.name,
        userId,
        startTime,
        endTime: Date.now(),
        success,
        error,
        metrics,
        actionResults
      });

    } catch (err) {
      // Record failed result
      this.results.push({
        scenario: scenario.name,
        userId,
        startTime,
        endTime: Date.now(),
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        actionResults: []
      });
    } finally {
      // Cleanup
      if (context) {
        await context.close();
        const index = this.contexts.indexOf(context);
        if (index > -1) {
          this.contexts.splice(index, 1);
        }
      }
    }
  }

  private async executeAction(page: Page, action: LoadTestAction): Promise<ActionResult> {
    const startTime = Date.now();
    
    try {
      switch (action.type) {
        case 'navigate':
          await page.goto(action.target || '/', { timeout: action.timeout || 30000 });
          break;
          
        case 'click':
          if (action.target) {
            await page.click(action.target, { timeout: action.timeout || 10000 });
          }
          break;
          
        case 'fill':
          if (action.target && action.value) {
            await page.fill(action.target, action.value, { timeout: action.timeout || 10000 });
          }
          break;
          
        case 'wait':
          if (action.target) {
            await page.waitForSelector(action.target, { timeout: action.timeout || 30000 });
          } else {
            await page.waitForTimeout(action.timeout || 1000);
          }
          break;
          
        case 'analyze':
          // Specific action for analysis workflow
          await page.fill('[data-testid="content-textarea"]', action.value || 'Test content for load testing');
          await page.click('[data-testid="analyze-button"]');
          await page.waitForSelector('[data-testid="analysis-results"]', { timeout: action.timeout || 60000 });
          break;
          
        case 'upload':
          // Specific action for file upload
          const fileInput = page.locator('input[type="file"]');
          await fileInput.setInputFiles({
            name: 'load-test-file.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from(action.value || 'Load test file content')
          });
          await page.waitForSelector('[data-testid="upload-success"]', { timeout: action.timeout || 30000 });
          break;
          
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

      return {
        action: action.type,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        success: true
      };

    } catch (err) {
      return {
        action: action.type,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    }
  }

  private generateSummary(): LoadTestSummary {
    const totalUsers = this.results.length;
    const successfulUsers = this.results.filter(r => r.success).length;
    const failedUsers = totalUsers - successfulUsers;

    // Calculate response times
    const responseTimes = this.results.map(r => r.endTime - r.startTime);
    responseTimes.sort((a, b) => a - b);
    
    const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
    const p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

    // Calculate throughput
    const testDuration = Math.max(...this.results.map(r => r.endTime)) - Math.min(...this.results.map(r => r.startTime));
    const totalActions = this.results.reduce((sum, r) => sum + r.actionResults.length, 0);
    const throughput = (totalActions / testDuration) * 1000; // actions per second

    // Calculate error rate
    const errorRate = (failedUsers / totalUsers) * 100;

    // Scenario results
    const scenarioResults: Record<string, { count: number; successRate: number; averageTime: number }> = {};
    
    this.results.forEach(result => {
      if (!scenarioResults[result.scenario]) {
        scenarioResults[result.scenario] = { count: 0, successRate: 0, averageTime: 0 };
      }
      scenarioResults[result.scenario].count++;
    });

    Object.keys(scenarioResults).forEach(scenario => {
      const scenarioData = this.results.filter(r => r.scenario === scenario);
      const successCount = scenarioData.filter(r => r.success).length;
      const avgTime = scenarioData.reduce((sum, r) => sum + (r.endTime - r.startTime), 0) / scenarioData.length;
      
      scenarioResults[scenario].successRate = (successCount / scenarioData.length) * 100;
      scenarioResults[scenario].averageTime = avgTime;
    });

    // Performance metrics
    const performanceMetrics = this.calculateAveragePerformanceMetrics();

    return {
      totalUsers,
      successfulUsers,
      failedUsers,
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      throughput,
      errorRate,
      scenarioResults,
      performanceMetrics
    };
  }

  private calculateAveragePerformanceMetrics(): {
    averageFCP: number;
    averageLCP: number;
    averageCLS: number;
  } {
    const metricsWithData = this.results.filter(r => r.metrics);
    
    if (metricsWithData.length === 0) {
      return { averageFCP: 0, averageLCP: 0, averageCLS: 0 };
    }

    const fcpValues = metricsWithData.filter(r => r.metrics!.fcp).map(r => r.metrics!.fcp!);
    const lcpValues = metricsWithData.filter(r => r.metrics!.lcp).map(r => r.metrics!.lcp!);
    const clsValues = metricsWithData.filter(r => r.metrics!.cls !== undefined).map(r => r.metrics!.cls!);

    return {
      averageFCP: fcpValues.length > 0 ? fcpValues.reduce((sum, val) => sum + val, 0) / fcpValues.length : 0,
      averageLCP: lcpValues.length > 0 ? lcpValues.reduce((sum, val) => sum + val, 0) / lcpValues.length : 0,
      averageCLS: clsValues.length > 0 ? clsValues.reduce((sum, val) => sum + val, 0) / clsValues.length : 0
    };
  }

  getResults(): LoadTestResult[] {
    return [...this.results];
  }
}

/**
 * Predefined load test scenarios
 */
export const LOAD_TEST_SCENARIOS = {
  // Basic user browsing and analyzing content
  basicAnalysis: {
    name: 'Basic Analysis',
    weight: 40,
    actions: [
      { type: 'navigate' as const, target: '/' },
      { type: 'wait' as const, timeout: 2000 },
      { type: 'navigate' as const, target: '/analyzer' },
      { type: 'wait' as const, timeout: 1000 },
      { type: 'analyze' as const, value: 'This AI system achieves 99.7% accuracy with zero false positives.' },
      { type: 'wait' as const, timeout: 2000 }
    ]
  },

  // Power user with dashboard and batch analysis
  powerUser: {
    name: 'Power User',
    weight: 30,
    actions: [
      { type: 'navigate' as const, target: '/dashboard' },
      { type: 'wait' as const, timeout: 3000 },
      { type: 'navigate' as const, target: '/batch-analysis' },
      { type: 'wait' as const, timeout: 1000 },
      { type: 'click' as const, target: '[data-testid="add-file-button"]' },
      { type: 'fill' as const, target: '[data-testid="file-input-0"]', value: 'Batch analysis content' },
      { type: 'click' as const, target: '[data-testid="start-batch-button"]' },
      { type: 'wait' as const, target: '[data-testid="batch-complete"]', timeout: 30000 }
    ]
  },

  // Casual browser
  casualBrowser: {
    name: 'Casual Browser',
    weight: 20,
    actions: [
      { type: 'navigate' as const, target: '/' },
      { type: 'wait' as const, timeout: 5000 },
      { type: 'navigate' as const, target: '/analyzer' },
      { type: 'wait' as const, timeout: 3000 },
      { type: 'fill' as const, target: '[data-testid="content-textarea"]', value: 'Simple test content' },
      { type: 'wait' as const, timeout: 2000 }
    ]
  },

  // Settings and configuration user
  configurationUser: {
    name: 'Configuration User',
    weight: 10,
    actions: [
      { type: 'navigate' as const, target: '/settings' },
      { type: 'wait' as const, timeout: 2000 },
      { type: 'click' as const, target: '[data-testid="dark-mode-toggle"]' },
      { type: 'wait' as const, timeout: 500 },
      { type: 'fill' as const, target: '[data-testid="api-key-input"]', value: 'test-api-key' },
      { type: 'wait' as const, timeout: 1000 },
      { type: 'click' as const, target: '[data-testid="save-settings-button"]' },
      { type: 'wait' as const, target: '[data-testid="save-success-message"]', timeout: 5000 }
    ]
  }
};