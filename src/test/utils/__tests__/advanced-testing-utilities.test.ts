import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  VisualRegressionTester,
  SecurityTester,
  TestDataManager,
  TestDataIsolationFactory,
  createVisualTester,
  createSecurityTester,
  createTestDataManager,
  getIsolatedTestDataManager
} from '../advanced-testing-utilities';

// Mock Playwright Page
const mockPage = {
  addStyleTag: vi.fn(),
  evaluate: vi.fn(),
  locator: vi.fn(() => ({
    evaluateAll: vi.fn(),
    waitFor: vi.fn(),
    isVisible: vi.fn(() => Promise.resolve(true)),
    fill: vi.fn(),
    inputValue: vi.fn(() => Promise.resolve(''))
  })),
  waitForFunction: vi.fn(),
  waitForLoadState: vi.fn(),
  waitForTimeout: vi.fn(),
  setViewportSize: vi.fn(),
  goto: vi.fn(),
  url: 'http://localhost:3000/test',
  request: {
    get: vi.fn(() => Promise.resolve({
      status: () => 200,
      text: () => Promise.resolve('<html></html>'),
      headers: () => ({})
    }))
  },
  content: vi.fn(() => Promise.resolve('<html></html>')),
  textContent: vi.fn(() => Promise.resolve('test content')),
  keyboard: {
    press: vi.fn()
  },
  getByText: vi.fn(() => ({
    isVisible: vi.fn(() => Promise.resolve(false))
  }))
} as unknown as Page;

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: 'test-id' }, error: null }))
      }))
    })),
    select: vi.fn(() => ({
      in: vi.fn(() => Promise.resolve({ data: [], error: null })),
      single: vi.fn(() => Promise.resolve({ data: { id: 'test-id' }, error: null }))
    })),
    delete: vi.fn(() => ({
      in: vi.fn(() => Promise.resolve({ error: null })),
      like: vi.fn(() => Promise.resolve({ error: null }))
    }))
  }))
};

describe('Advanced Testing Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VisualRegressionTester', () => {
    let visualTester: VisualRegressionTester;

    beforeEach(() => {
      visualTester = new VisualRegressionTester(mockPage, 'test-visual', {
        threshold: 0.1,
        maxDiffPixels: 500
      });
    });

    it('should create visual tester with correct configuration', () => {
      expect(visualTester).toBeInstanceOf(VisualRegressionTester);
    });

    it('should prepare page for visual testing', async () => {
      await visualTester.preparePage();

      expect(mockPage.addStyleTag).toHaveBeenCalledWith({
        content: expect.stringContaining('animation-duration: 0s !important')
      });
      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(mockPage.waitForFunction).toHaveBeenCalled();
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle');
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(100);
    });

    it('should test responsive design across viewports', async () => {
      const viewports = [
        { name: 'mobile', width: 375, height: 667 },
        { name: 'tablet', width: 768, height: 1024 }
      ];

      // Mock expect to avoid actual screenshot comparison
      vi.mock('@playwright/test', () => ({
        expect: vi.fn(() => ({
          toHaveScreenshot: vi.fn(() => Promise.resolve())
        }))
      }));

      const results = await visualTester.testResponsiveDesign(viewports);

      expect(mockPage.setViewportSize).toHaveBeenCalledTimes(2);
      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 375, height: 667 });
      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 768, height: 1024 });
      expect(results).toHaveLength(2);
    });

    it('should test theme variations', async () => {
      const themes = ['light', 'dark'];

      // Mock expect to avoid actual screenshot comparison
      vi.mock('@playwright/test', () => ({
        expect: vi.fn(() => ({
          toHaveScreenshot: vi.fn(() => Promise.resolve())
        }))
      }));

      const results = await visualTester.testThemeVariations(themes);

      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        'light'
      );
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        'dark'
      );
      expect(results).toHaveLength(2);
    });

    it('should generate visual test report', () => {
      const results = [
        { passed: true, screenshotPath: 'test1.png' },
        { passed: false, screenshotPath: 'test2.png', diffPixels: 100 },
        { passed: true, screenshotPath: 'test3.png' }
      ];

      const report = visualTester.generateReport(results);

      expect(report).toEqual({
        totalTests: 3,
        passed: 2,
        failed: 1,
        passRate: 66.66666666666666,
        results
      });
    });
  });

  describe('SecurityTester', () => {
    let securityTester: SecurityTester;

    beforeEach(() => {
      securityTester = new SecurityTester(mockPage, {
        skipAuthTests: false,
        inputSelectors: ['[data-testid="test-input"]']
      });
    });

    it('should create security tester with correct configuration', () => {
      expect(securityTester).toBeInstanceOf(SecurityTester);
    });

    it('should test XSS vulnerabilities', async () => {
      // Mock page interactions
      mockPage.locator = vi.fn(() => ({
        isVisible: vi.fn(() => Promise.resolve(true)),
        fill: vi.fn()
      }));

      mockPage.evaluate = vi.fn()
        .mockResolvedValueOnce(undefined) // Setup XSS detection
        .mockResolvedValueOnce(false) // Check if XSS detected
        .mockResolvedValueOnce(undefined); // Restore alert

      const result = await securityTester.testXSSVulnerabilities();

      expect(result.testType).toBe('xss');
      expect(result.passed).toBe(true);
      expect(result.vulnerabilities).toHaveLength(0);
      expect(result.recommendations).toContain('No XSS vulnerabilities detected in tested inputs');
    });

    it('should test SQL injection vulnerabilities', async () => {
      // Mock search input
      mockPage.locator = vi.fn(() => ({
        isVisible: vi.fn(() => Promise.resolve(true)),
        fill: vi.fn()
      }));

      mockPage.textContent = vi.fn(() => Promise.resolve('normal page content'));

      const result = await securityTester.testSQLInjection();

      expect(result.testType).toBe('sql_injection');
      expect(result.passed).toBe(true);
      expect(result.vulnerabilities).toHaveLength(0);
      expect(result.recommendations).toContain('No SQL injection vulnerabilities detected');
    });

    it('should test authentication security', async () => {
      // Mock request responses
      mockPage.request.get = vi.fn(() => Promise.resolve({
        status: () => 401 // Properly protected
      }));

      const result = await securityTester.testAuthentication();

      expect(result.testType).toBe('authentication');
      expect(result.passed).toBe(true);
      expect(result.vulnerabilities).toHaveLength(0);
    });

    it('should generate security report', () => {
      const results = [
        {
          testType: 'xss',
          passed: true,
          vulnerabilities: [],
          recommendations: ['No XSS vulnerabilities detected']
        },
        {
          testType: 'sql_injection',
          passed: false,
          vulnerabilities: [
            {
              type: 'sql_injection',
              severity: 'critical' as const,
              description: 'SQL injection found',
              location: 'search input'
            }
          ],
          recommendations: ['Use parameterized queries']
        }
      ];

      const report = securityTester.generateSecurityReport(results);

      expect(report.totalTests).toBe(2);
      expect(report.passed).toBe(1);
      expect(report.failed).toBe(1);
      expect(report.criticalVulnerabilities).toBe(1);
      expect(report.overallScore).toBe(75); // 100 - 25 (critical penalty)
    });
  });

  describe('TestDataManager', () => {
    let testDataManager: TestDataManager;

    beforeEach(() => {
      testDataManager = new TestDataManager({
        strategy: 'test',
        autoCleanup: true,
        namespace: 'test-namespace'
      });
    });

    it('should create test data manager with correct configuration', () => {
      expect(testDataManager).toBeInstanceOf(TestDataManager);
      expect(testDataManager.getIsolationId()).toMatch(/^test-test-namespace-\d+-[a-z0-9]+$/);
    });

    it('should initialize with database connection', async () => {
      await testDataManager.initialize(mockSupabase as any);
      
      // Should not throw error
      expect(true).toBe(true);
    });

    it('should create isolated test user', async () => {
      await testDataManager.initialize(mockSupabase as any);
      
      const user = await testDataManager.createIsolatedUser({
        name: 'Test User Override'
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('users');
      expect(user).toEqual({ id: 'test-id' });
    });

    it('should create isolated analysis result', async () => {
      await testDataManager.initialize(mockSupabase as any);
      
      const analysisResult = await testDataManager.createIsolatedAnalysisResult('user-id', {
        content: 'Custom test content'
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('analysis_results');
      expect(analysisResult).toEqual({ id: 'test-id' });
    });

    it('should create test scenario with multiple entities', async () => {
      await testDataManager.initialize(mockSupabase as any);
      
      const scenario = await testDataManager.createTestScenario({
        userCount: 2,
        analysisCount: 3,
        scenarioType: 'complex'
      });

      expect(scenario.users).toHaveLength(2);
      expect(scenario.analysisResults).toHaveLength(3);
      expect(scenario.scenarioId).toMatch(/scenario-\d+$/);
    });

    it('should create and restore snapshots', async () => {
      await testDataManager.initialize(mockSupabase as any);
      
      // Create some test data first
      await testDataManager.createIsolatedUser();
      
      const snapshot = await testDataManager.createSnapshot('test-snapshot');
      
      expect(snapshot.id).toMatch(/snapshot-test-snapshot-\d+$/);
      expect(snapshot.metadata.isolationId).toBe(testDataManager.getIsolationId());
      
      // Test restore
      await testDataManager.restoreFromSnapshot(snapshot.id);
      
      // Should not throw error
      expect(true).toBe(true);
    });

    it('should get isolation statistics', async () => {
      await testDataManager.initialize(mockSupabase as any);
      
      // Create some test data
      await testDataManager.createIsolatedUser();
      await testDataManager.createIsolatedAnalysisResult('user-id');
      
      const stats = testDataManager.getIsolationStats();
      
      expect(stats.isolationId).toBe(testDataManager.getIsolationId());
      expect(stats.strategy).toBe('test');
      expect(stats.createdDataCounts.users).toBe(1);
      expect(stats.createdDataCounts.analysis_results).toBe(1);
      expect(stats.totalEntities).toBe(2);
    });

    it('should verify data isolation between managers', async () => {
      const manager1 = new TestDataManager({
        strategy: 'test',
        autoCleanup: true,
        namespace: 'manager1'
      });
      
      const manager2 = new TestDataManager({
        strategy: 'test',
        autoCleanup: true,
        namespace: 'manager2'
      });

      await manager1.initialize(mockSupabase as any);
      await manager2.initialize(mockSupabase as any);

      const isolation = await manager1.verifyIsolation(manager2);
      
      expect(isolation.isolated).toBe(true);
      expect(isolation.conflicts).toHaveLength(0);
    });

    it('should cleanup test data', async () => {
      await testDataManager.initialize(mockSupabase as any);
      
      // Create some test data
      await testDataManager.createIsolatedUser();
      await testDataManager.createIsolatedAnalysisResult('user-id');
      
      await testDataManager.cleanup();
      
      expect(mockSupabase.from).toHaveBeenCalledWith('users');
      expect(mockSupabase.from).toHaveBeenCalledWith('analysis_results');
    });
  });

  describe('TestDataIsolationFactory', () => {
    afterEach(async () => {
      await TestDataIsolationFactory.cleanupAll();
    });

    it('should get or create test data manager', () => {
      const manager1 = TestDataIsolationFactory.getManager({
        strategy: 'test',
        autoCleanup: true,
        namespace: 'factory-test'
      });

      const manager2 = TestDataIsolationFactory.getManager({
        strategy: 'test',
        autoCleanup: true,
        namespace: 'factory-test'
      });

      // Should return the same manager for same configuration
      expect(manager1).toBe(manager2);
    });

    it('should create shared manager', async () => {
      const sharedManager = await TestDataIsolationFactory.createSharedManager(
        'shared-test',
        mockSupabase as any
      );

      expect(sharedManager).toBeInstanceOf(TestDataManager);
      expect(sharedManager.getIsolationId()).toMatch(/^global-shared-test-\d+-[a-z0-9]+$/);
    });

    it('should get isolation statistics for all managers', () => {
      // Create some managers
      TestDataIsolationFactory.getManager({
        strategy: 'test',
        autoCleanup: true,
        namespace: 'stats-test-1'
      });

      TestDataIsolationFactory.getManager({
        strategy: 'suite',
        autoCleanup: true,
        namespace: 'stats-test-2'
      });

      const allStats = TestDataIsolationFactory.getAllIsolationStats();

      expect(allStats).toHaveLength(2);
      expect(allStats[0].managerId).toMatch(/^test-stats-test-1$/);
      expect(allStats[1].managerId).toMatch(/^suite-stats-test-2$/);
    });

    it('should cleanup all managers', async () => {
      // Create some managers
      const manager1 = TestDataIsolationFactory.getManager({
        strategy: 'test',
        autoCleanup: true,
        namespace: 'cleanup-test-1'
      });

      const manager2 = TestDataIsolationFactory.getManager({
        strategy: 'test',
        autoCleanup: true,
        namespace: 'cleanup-test-2'
      });

      // Mock cleanup methods
      vi.spyOn(manager1, 'cleanup').mockResolvedValue();
      vi.spyOn(manager2, 'cleanup').mockResolvedValue();

      await TestDataIsolationFactory.cleanupAll();

      expect(manager1.cleanup).toHaveBeenCalled();
      expect(manager2.cleanup).toHaveBeenCalled();
    });
  });

  describe('Utility Functions', () => {
    it('should create visual tester', () => {
      const tester = createVisualTester(mockPage, 'test-visual', { threshold: 0.1 });
      expect(tester).toBeInstanceOf(VisualRegressionTester);
    });

    it('should create security tester', () => {
      const tester = createSecurityTester(mockPage, { skipAuthTests: true });
      expect(tester).toBeInstanceOf(SecurityTester);
    });

    it('should create test data manager', () => {
      const manager = createTestDataManager({
        strategy: 'test',
        autoCleanup: true
      });
      expect(manager).toBeInstanceOf(TestDataManager);
    });

    it('should get isolated test data manager', () => {
      const manager = getIsolatedTestDataManager({ namespace: 'isolated-test' });
      expect(manager).toBeInstanceOf(TestDataManager);
    });
  });
});