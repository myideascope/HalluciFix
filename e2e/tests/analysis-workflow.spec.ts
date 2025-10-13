import { test, expect } from '@playwright/test';
import { AnalyzerPage } from '../pages';

test.describe('Analysis Workflow Tests', () => {
  let analyzerPage: AnalyzerPage;

  test.beforeEach(async ({ page }) => {
    analyzerPage = new AnalyzerPage(page);
    await analyzerPage.goto();
  });

  test('should analyze text content with high hallucination risk', async () => {
    const highRiskContent = `
      Our AI system achieves exactly 100% accuracy on all tasks with zero false positives.
      Independent studies by Harvard, MIT, and Stanford all confirm our technology is 
      1000x better than any competitor. Every single user reports perfect satisfaction.
      The system processes infinite requests per second with guaranteed 100% uptime.
    `;

    await analyzerPage.analyzeContent(highRiskContent);
    await analyzerPage.expectAnalysisComplete();

    const results = await analyzerPage.getAnalysisResults();
    
    // Should detect multiple hallucinations
    expect(results.hallucinationCount).toBeGreaterThan(2);
    
    // Should have medium to critical risk
    expect(['medium', 'high', 'critical']).toContain(results.riskLevel);
    
    // Accuracy should reflect the issues
    expect(results.accuracy).toBeLessThan(90);
  });

  test('should analyze text content with low hallucination risk', async () => {
    const lowRiskContent = `
      Our team has been working on improving our AI system's performance.
      Recent internal testing suggests promising results, though we need more data.
      User feedback has been generally positive, with some areas for improvement.
      We continue to iterate on the technology based on real-world usage.
    `;

    await analyzerPage.analyzeContent(lowRiskContent);
    await analyzerPage.expectAnalysisComplete();

    const results = await analyzerPage.getAnalysisResults();
    
    // Should detect few or no hallucinations
    expect(results.hallucinationCount).toBeLessThanOrEqual(1);
    
    // Should have low to medium risk
    expect(['low', 'medium']).toContain(results.riskLevel);
    
    // Accuracy should be higher
    expect(results.accuracy).toBeGreaterThan(70);
  });

  test('should handle sample text analysis', async () => {
    await analyzerPage.clickSampleText();
    
    // Content should be filled
    const content = await analyzerPage.contentTextarea.inputValue();
    expect(content.length).toBeGreaterThan(50);
    
    // Analyze the sample
    await analyzerPage.analyzeButton.click();
    await analyzerPage.expectAnalysisComplete();
    
    const results = await analyzerPage.getAnalysisResults();
    expect(results.accuracy).toBeGreaterThan(0);
    expect(results.hallucinationCount).toBeGreaterThan(0); // Samples should have hallucinations
  });

  test('should handle file upload analysis', async ({ page }) => {
    // Create a test file
    const testContent = 'This is a test document with some claims that may need verification.';
    const buffer = Buffer.from(testContent);
    
    // Mock file upload
    await page.setInputFiles('[data-testid="file-upload-input"]', {
      name: 'test-document.txt',
      mimeType: 'text/plain',
      buffer: buffer
    });
    
    await analyzerPage.uploadButton.click();
    await analyzerPage.expectAnalysisComplete();
    
    const results = await analyzerPage.getAnalysisResults();
    expect(results.accuracy).toBeGreaterThan(0);
  });

  test('should toggle RAG analysis', async () => {
    const testContent = 'Test content for RAG analysis verification.';
    
    // Disable RAG first
    await analyzerPage.toggleRAG(false);
    await analyzerPage.analyzeContent(testContent);
    await analyzerPage.expectAnalysisComplete();
    
    const resultsWithoutRAG = await analyzerPage.getAnalysisResults();
    
    // Clear and enable RAG
    await analyzerPage.clearAnalysis();
    await analyzerPage.toggleRAG(true);
    await analyzerPage.analyzeContent(testContent);
    await analyzerPage.expectAnalysisComplete();
    
    const resultsWithRAG = await analyzerPage.getAnalysisResults();
    
    // Results may differ with RAG enabled
    expect(resultsWithRAG.verificationSources).toBeGreaterThanOrEqual(resultsWithoutRAG.verificationSources);
  });

  test('should maintain analysis history', async () => {
    // Perform first analysis
    await analyzerPage.analyzeContent('First test content');
    await analyzerPage.expectAnalysisComplete();
    
    // Perform second analysis
    await analyzerPage.clearAnalysis();
    await analyzerPage.analyzeContent('Second test content');
    await analyzerPage.expectAnalysisComplete();
    
    // Check history
    const history = await analyzerPage.getAnalysisHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);
    
    // Select previous analysis
    if (history.length > 1) {
      await analyzerPage.selectHistoryItem(1);
      await analyzerPage.expectAnalysisComplete();
    }
  });

  test('should handle empty content validation', async () => {
    // Try to analyze empty content
    await analyzerPage.clearContent();
    
    // Button should be disabled or show validation
    const isDisabled = await analyzerPage.analyzeButton.isDisabled();
    if (!isDisabled) {
      await analyzerPage.analyzeButton.click();
      await analyzerPage.expectAnalysisError();
    }
  });

  test('should handle very long content', async () => {
    // Generate long content
    const longContent = 'This is a test sentence. '.repeat(1000);
    
    await analyzerPage.analyzeContent(longContent);
    await analyzerPage.expectAnalysisComplete();
    
    const results = await analyzerPage.getAnalysisResults();
    expect(results.accuracy).toBeGreaterThan(0);
    expect(results.processingTime).toBeGreaterThan(0);
  });

  test('should handle special characters and formatting', async () => {
    const specialContent = `
      Test with émojis 🚀 and spëcial chàracters!
      Numbers: 123,456.78 and percentages: 99.9%
      URLs: https://example.com and emails: test@example.com
      "Quotes" and 'apostrophes' and (parentheses)
    `;
    
    await analyzerPage.analyzeContent(specialContent);
    await analyzerPage.expectAnalysisComplete();
    
    const results = await analyzerPage.getAnalysisResults();
    expect(results.accuracy).toBeGreaterThan(0);
  });

  test('should show detailed hallucination information', async () => {
    const hallucinationContent = `
      Our product has achieved 100% customer satisfaction with zero complaints.
      Independent testing shows 1000x performance improvement over competitors.
      All major universities have endorsed our revolutionary breakthrough technology.
    `;
    
    await analyzerPage.analyzeContent(hallucinationContent);
    await analyzerPage.expectAnalysisComplete();
    
    const hallucinations = await analyzerPage.getHallucinations();
    expect(hallucinations.length).toBeGreaterThan(0);
    
    // Each hallucination should have text and severity
    for (const hallucination of hallucinations) {
      expect(hallucination.text).toBeTruthy();
      expect(hallucination.severity).toBeTruthy();
    }
  });

  test('should handle network interruption gracefully', async ({ page }) => {
    const testContent = 'Test content for network interruption';
    
    await analyzerPage.fillContent(testContent);
    
    // Simulate network failure during analysis
    await page.route('**/api/analyze', route => {
      route.abort('failed');
    });
    
    await analyzerPage.analyzeButton.click();
    await analyzerPage.expectAnalysisError();
    
    // Restore network and retry
    await page.unroute('**/api/analyze');
    await analyzerPage.analyzeButton.click();
    await analyzerPage.expectAnalysisComplete();
  });
});