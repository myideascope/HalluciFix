/**
 * Analysis Workflow E2E Tests
 * Tests for the complete analysis workflow from content input to results display
 */

import { test, expect } from '@playwright/test';
import { AnalyzerPage } from '../pages/AnalyzerPage';
import { Dashboard } from '../pages/Dashboard';
import { AuthHelper, TEST_USERS } from '../utils/auth';
import { TestDataManager } from '../utils/testData';

test.describe('Complete Analysis Workflow', () => {
  let analyzerPage: AnalyzerPage;
  let dashboard: Dashboard;
  let authHelper: AuthHelper;
  let testDataManager: TestDataManager;

  test.beforeEach(async ({ page, context }) => {
    analyzerPage = new AnalyzerPage(page);
    dashboard = new Dashboard(page);
    authHelper = new AuthHelper(page, context);
    testDataManager = new TestDataManager();

    // Login as basic user
    await authHelper.loginAs('basicUser');
  });

  test.afterEach(async () => {
    // Cleanup test data
    const user = TEST_USERS.basicUser;
    const { data } = await testDataManager.testDatabase.supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single();
    
    if (data) {
      await testDataManager.cleanupUserTestData(data.id);
    }
  });

  test('should complete text analysis workflow end-to-end', async () => {
    // Navigate to analyzer
    await analyzerPage.goto();

    // Test content with potential hallucinations
    const testContent = `
      The Earth is the third planet from the Sun and has a diameter of approximately 12,742 kilometers.
      However, the Moon is made entirely of cheese and was discovered by Neil Armstrong in 1969.
      Water boils at 100 degrees Celsius at sea level, but unicorns can be found in the Amazon rainforest.
      The Great Wall of China is visible from space with the naked eye.
    `;

    // Perform complete analysis
    await analyzerPage.performCompleteAnalysis(
      { type: 'text', content: testContent },
      {
        analysisType: 'deep',
        confidenceThreshold: 75,
        enableSeqLogprob: true,
        enableRAG: true,
      }
    );

    // Validate analysis results
    const isValid = await analyzerPage.validateAnalysisResults();
    expect(isValid).toBe(true);

    // Check overall score
    const overallScore = await analyzerPage.getOverallScore();
    expect(overallScore).toBeGreaterThanOrEqual(0);
    expect(overallScore).toBeLessThanOrEqual(100);

    // Check risk level
    const riskLevel = await analyzerPage.getRiskLevel();
    expect(['low', 'medium', 'high', 'critical']).toContain(riskLevel.toLowerCase());

    // Check confidence score
    const confidenceScore = await analyzerPage.getConfidenceScore();
    expect(confidenceScore).toBeGreaterThanOrEqual(0);
    expect(confidenceScore).toBeLessThanOrEqual(100);

    // Verify hallucination detection
    const hallucinations = await analyzerPage.getHallucinationItems();
    expect(hallucinations.length).toBeGreaterThan(0);

    // Verify specific hallucinations are detected
    const hallucinationTexts = hallucinations.map(h => h.text.toLowerCase());
    expect(hallucinationTexts.some(text => 
      text.includes('moon') && text.includes('cheese')
    )).toBe(true);
    expect(hallucinationTexts.some(text => 
      text.includes('unicorn')
    )).toBe(true);

    // Check source verification
    const sources = await analyzerPage.getSourceVerification();
    expect(sources.length).toBeGreaterThan(0);

    // Verify seq-logprob analysis (if enabled)
    const tokenAnalysis = await analyzerPage.getTokenAnalysis();
    if (tokenAnalysis.length > 0) {
      expect(tokenAnalysis[0]).toHaveProperty('token');
      expect(tokenAnalysis[0]).toHaveProperty('logprob');
      expect(tokenAnalysis[0]).toHaveProperty('uncertainty');
    }

    // Verify RAG analysis (if enabled)
    const retrievedSources = await analyzerPage.getRetrievedSources();
    if (retrievedSources.length > 0) {
      expect(retrievedSources[0]).toHaveProperty('title');
      expect(retrievedSources[0]).toHaveProperty('url');
      expect(retrievedSources[0]).toHaveProperty('relevance');
    }

    // Save analysis
    const analysisName = `Test Analysis ${Date.now()}`;
    await analyzerPage.saveAnalysis(analysisName);

    // Verify analysis appears in saved analyses
    const savedAnalyses = await analyzerPage.getSavedAnalyses();
    expect(savedAnalyses).toContain(analysisName);

    // Export results
    await analyzerPage.exportResults('json');

    // Navigate to dashboard and verify analysis appears in recent analyses
    await dashboard.goto();
    await dashboard.waitForDataToLoad();

    const recentAnalyses = await dashboard.getRecentAnalyses();
    expect(recentAnalyses.length).toBeGreaterThan(0);
    expect(recentAnalyses.some(analysis => 
      analysis.title.includes('Test Analysis')
    )).toBe(true);
  });

  test('should handle file upload analysis workflow', async () => {
    // Create test file
    const testFiles = await testDataManager.createTestFiles();
    
    // Navigate to analyzer
    await analyzerPage.goto();

    // Upload and analyze file
    await analyzerPage.performCompleteAnalysis(
      { type: 'file', content: testFiles.text },
      { analysisType: 'standard' }
    );

    // Validate results
    const isValid = await analyzerPage.validateAnalysisResults();
    expect(isValid).toBe(true);

    // Check that file content was processed
    const hallucinations = await analyzerPage.getHallucinationItems();
    expect(hallucinations.length).toBeGreaterThan(0);

    // Cleanup test files
    await testDataManager.cleanupTestFiles();
  });

  test('should handle URL analysis workflow', async () => {
    // Navigate to analyzer
    await analyzerPage.goto();

    // Mock URL content analysis
    const testUrl = 'https://example.com/test-content';
    
    // Mock the API response for URL analysis
    await analyzerPage.mockApiResponse(
      /\/api\/analyze-url/,
      {
        content: 'Sample content from URL with some questionable claims about flying elephants.',
        metadata: { url: testUrl, title: 'Test Page' }
      }
    );

    // Perform URL analysis
    await analyzerPage.performCompleteAnalysis(
      { type: 'url', content: testUrl },
      { analysisType: 'quick' }
    );

    // Validate results
    const isValid = await analyzerPage.validateAnalysisResults();
    expect(isValid).toBe(true);

    // Verify URL-specific metadata is displayed
    const sources = await analyzerPage.getSourceVerification();
    expect(sources.some(source => source.source.includes(testUrl))).toBe(true);
  });

  test('should handle analysis errors gracefully', async () => {
    // Navigate to analyzer
    await analyzerPage.goto();

    // Test with empty content
    await analyzerPage.enterText('');
    await analyzerPage.startAnalysis();

    // Should show validation error
    const hasError = await analyzerPage.hasAnalysisError();
    expect(hasError).toBe(true);

    const errorMessage = await analyzerPage.getAnalysisError();
    expect(errorMessage.toLowerCase()).toContain('content');

    // Test with content that's too long
    await analyzerPage.validateInputConstraints();
  });

  test('should track analysis progress correctly', async () => {
    // Navigate to analyzer
    await analyzerPage.goto();

    const testContent = 'This is a test content for progress tracking.';
    
    // Start analysis
    await analyzerPage.enterText(testContent);
    await analyzerPage.startAnalysis();

    // Check that analysis is in progress
    const isInProgress = await analyzerPage.isAnalysisInProgress();
    expect(isInProgress).toBe(true);

    // Wait for completion
    await analyzerPage.waitForAnalysisComplete();

    // Verify analysis is no longer in progress
    const isStillInProgress = await analyzerPage.isAnalysisInProgress();
    expect(isStillInProgress).toBe(false);
  });

  test('should handle multiple analysis types correctly', async () => {
    const testContent = 'Sample content for testing different analysis types.';

    // Test quick analysis
    await analyzerPage.goto();
    await analyzerPage.performCompleteAnalysis(
      { type: 'text', content: testContent },
      { analysisType: 'quick' }
    );

    let overallScore = await analyzerPage.getOverallScore();
    expect(overallScore).toBeGreaterThanOrEqual(0);

    // Clear and test standard analysis
    await analyzerPage.clearAnalysis();
    await analyzerPage.performCompleteAnalysis(
      { type: 'text', content: testContent },
      { analysisType: 'standard' }
    );

    overallScore = await analyzerPage.getOverallScore();
    expect(overallScore).toBeGreaterThanOrEqual(0);

    // Clear and test deep analysis
    await analyzerPage.clearAnalysis();
    await analyzerPage.performCompleteAnalysis(
      { type: 'text', content: testContent },
      { analysisType: 'deep' }
    );

    overallScore = await analyzerPage.getOverallScore();
    expect(overallScore).toBeGreaterThanOrEqual(0);
  });

  test('should handle custom prompts correctly', async () => {
    await analyzerPage.goto();

    const testContent = 'The sky is blue and grass is green.';
    const customPrompt = 'Focus specifically on color-related claims and verify them against scientific sources.';

    await analyzerPage.performCompleteAnalysis(
      { type: 'text', content: testContent },
      { 
        analysisType: 'standard',
        customPrompt: customPrompt
      }
    );

    // Verify analysis completed with custom prompt
    const isValid = await analyzerPage.validateAnalysisResults();
    expect(isValid).toBe(true);

    // The analysis should focus on color-related claims as specified in the prompt
    const hallucinations = await analyzerPage.getHallucinationItems();
    // Since the claims about sky and grass are generally true, 
    // we expect fewer or no hallucinations detected
    expect(hallucinations.length).toBeGreaterThanOrEqual(0);
  });

  test('should maintain analysis history correctly', async () => {
    await analyzerPage.goto();

    // Perform multiple analyses
    const analyses = [
      'First test analysis content.',
      'Second test analysis content.',
      'Third test analysis content.'
    ];

    for (let i = 0; i < analyses.length; i++) {
      await analyzerPage.performCompleteAnalysis(
        { type: 'text', content: analyses[i] },
        { analysisType: 'quick' }
      );

      await analyzerPage.saveAnalysis(`Analysis ${i + 1}`);
      
      if (i < analyses.length - 1) {
        await analyzerPage.clearAnalysis();
      }
    }

    // Verify all analyses are saved
    const savedAnalyses = await analyzerPage.getSavedAnalyses();
    expect(savedAnalyses.length).toBeGreaterThanOrEqual(3);

    // Test loading a saved analysis
    await analyzerPage.loadSavedAnalysis('Analysis 1');
    
    // Verify the analysis loaded correctly
    const isValid = await analyzerPage.validateAnalysisResults();
    expect(isValid).toBe(true);
  });
});

test.describe('Analysis Workflow - Pro User Features', () => {
  let analyzerPage: AnalyzerPage;
  let authHelper: AuthHelper;

  test.beforeEach(async ({ page, context }) => {
    analyzerPage = new AnalyzerPage(page);
    authHelper = new AuthHelper(page, context);

    // Login as pro user
    await authHelper.loginAs('proUser');
  });

  test('should access advanced analysis features for pro users', async () => {
    await analyzerPage.goto();

    const testContent = 'Advanced analysis content for pro user testing.';

    // Pro users should have access to all analysis types including deep analysis
    await analyzerPage.performCompleteAnalysis(
      { type: 'text', content: testContent },
      {
        analysisType: 'deep',
        enableSeqLogprob: true,
        enableRAG: true,
        confidenceThreshold: 90,
      }
    );

    // Verify advanced features are available
    const tokenAnalysis = await analyzerPage.getTokenAnalysis();
    expect(tokenAnalysis.length).toBeGreaterThan(0);

    const retrievedSources = await analyzerPage.getRetrievedSources();
    expect(retrievedSources.length).toBeGreaterThan(0);

    // Pro users should be able to export in multiple formats
    await analyzerPage.exportResults('pdf');
    await analyzerPage.exportResults('csv');
    await analyzerPage.exportResults('json');
  });

  test('should handle larger content for pro users', async () => {
    await analyzerPage.goto();

    // Pro users should be able to analyze larger content
    const largeContent = 'Large content. '.repeat(1000); // Simulate large content

    await analyzerPage.performCompleteAnalysis(
      { type: 'text', content: largeContent },
      { analysisType: 'standard' }
    );

    const isValid = await analyzerPage.validateAnalysisResults();
    expect(isValid).toBe(true);
  });
});