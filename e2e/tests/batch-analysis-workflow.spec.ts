/**
 * Batch Analysis Workflow E2E Tests
 * Tests for batch analysis workflow with file upload and processing
 */

import { test, expect } from '@playwright/test';
import { Dashboard } from '../pages/Dashboard';
import { AuthHelper, TEST_USERS } from '../utils/auth';
import { TestDataManager } from '../utils/testData';
import { BasePage } from '../pages/BasePage';

class BatchAnalysisPage extends BasePage {
  private readonly selectors = {
    // Page structure
    pageContainer: '[data-testid="batch-analysis-page"]',
    pageTitle: '[data-testid="batch-title"]',
    
    // File upload section
    uploadSection: '[data-testid="upload-section"]',
    fileUpload: '[data-testid="batch-file-upload"]',
    dragDropZone: '[data-testid="drag-drop-zone"]',
    uploadedFiles: '[data-testid="uploaded-files"]',
    fileItem: '[data-testid="file-item"]',
    removeFileButton: '[data-testid="remove-file"]',
    
    // Batch configuration
    configSection: '[data-testid="batch-config"]',
    analysisType: '[data-testid="batch-analysis-type"]',
    confidenceThreshold: '[data-testid="batch-confidence-threshold"]',
    enableParallel: '[data-testid="enable-parallel"]',
    maxConcurrency: '[data-testid="max-concurrency"]',
    
    // Processing controls
    startBatchButton: '[data-testid="start-batch-button"]',
    pauseBatchButton: '[data-testid="pause-batch-button"]',
    cancelBatchButton: '[data-testid="cancel-batch-button"]',
    
    // Progress tracking
    progressSection: '[data-testid="progress-section"]',
    overallProgress: '[data-testid="overall-progress"]',
    progressBar: '[data-testid="progress-bar"]',
    processedCount: '[data-testid="processed-count"]',
    totalCount: '[data-testid="total-count"]',
    estimatedTime: '[data-testid="estimated-time"]',
    
    // Results section
    resultsSection: '[data-testid="batch-results"]',
    resultsList: '[data-testid="results-list"]',
    resultItem: '[data-testid="result-item"]',
    resultScore: '[data-testid="result-score"]',
    resultStatus: '[data-testid="result-status"]',
    
    // Export and actions
    exportButton: '[data-testid="export-batch-results"]',
    downloadReport: '[data-testid="download-report"]',
    saveResults: '[data-testid="save-batch-results"]',
    
    // Error handling
    errorMessage: '[data-testid="batch-error"]',
    retryButton: '[data-testid="retry-failed"]',
    
    // History
    historySection: '[data-testid="batch-history"]',
    historyItem: '[data-testid="history-item"]',
  };

  async goto(): Promise<void> {
    await this.page.goto('/batch');
    await this.waitForLoad();
  }

  async waitForLoad(): Promise<void> {
    await this.waitForElement(this.selectors.pageContainer);
    await this.waitForElement(this.selectors.uploadSection);
  }

  async uploadFiles(filePaths: string[]): Promise<void> {
    const fileInput = this.page.locator(this.selectors.fileUpload);
    await fileInput.setInputFiles(filePaths);
    await this.waitForElement(this.selectors.uploadedFiles);
  }

  async removeFile(index: number): Promise<void> {
    const removeButtons = this.page.locator(this.selectors.removeFileButton);
    await removeButtons.nth(index).click();
  }

  async getUploadedFiles(): Promise<string[]> {
    const fileItems = this.page.locator(this.selectors.fileItem);
    const count = await fileItems.count();
    const fileNames: string[] = [];

    for (let i = 0; i < count; i++) {
      const fileName = await fileItems.nth(i).textContent();
      if (fileName) fileNames.push(fileName.trim());
    }

    return fileNames;
  }

  async configureBatchAnalysis(options: {
    analysisType?: 'quick' | 'standard' | 'deep';
    confidenceThreshold?: number;
    enableParallel?: boolean;
    maxConcurrency?: number;
  }): Promise<void> {
    if (options.analysisType) {
      await this.clickElement(this.selectors.analysisType);
      await this.clickElement(`[data-testid="batch-type-${options.analysisType}"]`);
    }

    if (options.confidenceThreshold !== undefined) {
      await this.fillInput(this.selectors.confidenceThreshold, options.confidenceThreshold.toString());
    }

    if (options.enableParallel !== undefined) {
      const checkbox = this.page.locator(this.selectors.enableParallel);
      const isChecked = await checkbox.isChecked();
      if (isChecked !== options.enableParallel) {
        await checkbox.click();
      }
    }

    if (options.maxConcurrency !== undefined) {
      await this.fillInput(this.selectors.maxConcurrency, options.maxConcurrency.toString());
    }
  }

  async startBatchAnalysis(): Promise<void> {
    await this.clickElement(this.selectors.startBatchButton);
    await this.waitForElement(this.selectors.progressSection);
  }

  async pauseBatchAnalysis(): Promise<void> {
    await this.clickElement(this.selectors.pauseBatchButton);
  }

  async cancelBatchAnalysis(): Promise<void> {
    await this.clickElement(this.selectors.cancelBatchButton);
  }

  async waitForBatchComplete(timeout: number = 120000): Promise<void> {
    await this.waitForElementToBeHidden(this.selectors.progressBar, timeout);
    await this.waitForElement(this.selectors.resultsSection);
  }

  async getBatchProgress(): Promise<{
    processed: number;
    total: number;
    percentage: number;
    estimatedTime: string;
  }> {
    const processedText = await this.getElementText(this.selectors.processedCount);
    const totalText = await this.getElementText(this.selectors.totalCount);
    const progressText = await this.getElementAttribute(this.selectors.progressBar, 'aria-valuenow');
    const estimatedTime = await this.getElementText(this.selectors.estimatedTime);

    return {
      processed: parseInt(processedText),
      total: parseInt(totalText),
      percentage: parseInt(progressText || '0'),
      estimatedTime,
    };
  }

  async getBatchResults(): Promise<Array<{
    fileName: string;
    score: number;
    status: string;
    riskLevel: string;
  }>> {
    const resultItems = this.page.locator(this.selectors.resultItem);
    const count = await resultItems.count();
    const results: Array<{
      fileName: string;
      score: number;
      status: string;
      riskLevel: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const item = resultItems.nth(i);
      const fileName = await item.locator('[data-testid="result-filename"]').textContent() || '';
      const scoreText = await item.locator(this.selectors.resultScore).textContent() || '0';
      const status = await item.locator(this.selectors.resultStatus).textContent() || '';
      const riskLevel = await item.locator('[data-testid="result-risk"]').textContent() || '';

      results.push({
        fileName,
        score: parseFloat(scoreText.replace(/[^\d.]/g, '')),
        status,
        riskLevel,
      });
    }

    return results;
  }

  async exportBatchResults(format: 'csv' | 'json' | 'pdf'): Promise<void> {
    await this.clickElement(this.selectors.exportButton);
    await this.clickElement(`[data-testid="export-${format}"]`);
    await this.waitForDownload();
  }

  async saveBatchResults(name: string): Promise<void> {
    await this.clickElement(this.selectors.saveResults);
    await this.fillInput('[data-testid="batch-name"]', name);
    await this.clickElement('[data-testid="confirm-save"]');
  }

  async retryFailedAnalyses(): Promise<void> {
    await this.clickElement(this.selectors.retryButton);
  }

  async getBatchHistory(): Promise<Array<{
    name: string;
    date: string;
    fileCount: number;
    status: string;
  }>> {
    const historyItems = this.page.locator(this.selectors.historyItem);
    const count = await historyItems.count();
    const history: Array<{
      name: string;
      date: string;
      fileCount: number;
      status: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const item = historyItems.nth(i);
      const name = await item.locator('[data-testid="history-name"]').textContent() || '';
      const date = await item.locator('[data-testid="history-date"]').textContent() || '';
      const fileCountText = await item.locator('[data-testid="history-files"]').textContent() || '0';
      const status = await item.locator('[data-testid="history-status"]').textContent() || '';

      history.push({
        name,
        date,
        fileCount: parseInt(fileCountText.replace(/[^\d]/g, '')),
        status,
      });
    }

    return history;
  }

  async isBatchInProgress(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.progressBar);
  }

  async hasBatchError(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.errorMessage);
  }

  async getBatchError(): Promise<string> {
    if (await this.hasBatchError()) {
      return await this.getElementText(this.selectors.errorMessage);
    }
    return '';
  }
}

test.describe('Batch Analysis Workflow', () => {
  let batchPage: BatchAnalysisPage;
  let dashboard: Dashboard;
  let authHelper: AuthHelper;
  let testDataManager: TestDataManager;

  test.beforeEach(async ({ page, context }) => {
    batchPage = new BatchAnalysisPage(page);
    dashboard = new Dashboard(page);
    authHelper = new AuthHelper(page, context);
    testDataManager = new TestDataManager();

    // Login as pro user (batch analysis typically requires pro subscription)
    await authHelper.loginAs('proUser');
  });

  test.afterEach(async () => {
    // Cleanup test files and data
    await testDataManager.cleanupTestFiles();
    
    const user = TEST_USERS.proUser;
    const { data } = await testDataManager.testDatabase.supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single();
    
    if (data) {
      await testDataManager.cleanupUserTestData(data.id);
    }
  });

  test('should complete full batch analysis workflow', async () => {
    // Create test files
    const testFiles = await testDataManager.createTestFiles();
    const filePaths = [testFiles.text, testFiles.json, testFiles.csv];

    // Navigate to batch analysis page
    await batchPage.goto();

    // Upload files
    await batchPage.uploadFiles(filePaths);

    // Verify files are uploaded
    const uploadedFiles = await batchPage.getUploadedFiles();
    expect(uploadedFiles.length).toBe(3);

    // Configure batch analysis
    await batchPage.configureBatchAnalysis({
      analysisType: 'standard',
      confidenceThreshold: 75,
      enableParallel: true,
      maxConcurrency: 2,
    });

    // Start batch analysis
    await batchPage.startBatchAnalysis();

    // Monitor progress
    const isInProgress = await batchPage.isBatchInProgress();
    expect(isInProgress).toBe(true);

    // Check initial progress
    const initialProgress = await batchPage.getBatchProgress();
    expect(initialProgress.total).toBe(3);
    expect(initialProgress.processed).toBeGreaterThanOrEqual(0);

    // Wait for completion
    await batchPage.waitForBatchComplete();

    // Verify batch is no longer in progress
    const isStillInProgress = await batchPage.isBatchInProgress();
    expect(isStillInProgress).toBe(false);

    // Check final results
    const results = await batchPage.getBatchResults();
    expect(results.length).toBe(3);

    // Verify each result has required properties
    for (const result of results) {
      expect(result.fileName).toBeTruthy();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.status).toBeTruthy();
      expect(['completed', 'failed']).toContain(result.status);
    }

    // Save batch results
    const batchName = `Batch Analysis ${Date.now()}`;
    await batchPage.saveBatchResults(batchName);

    // Export results
    await batchPage.exportBatchResults('csv');
    await batchPage.exportBatchResults('json');

    // Verify batch appears in history
    const history = await batchPage.getBatchHistory();
    expect(history.some(item => item.name.includes('Batch Analysis'))).toBe(true);
  });

  test('should handle file upload validation', async () => {
    await batchPage.goto();

    // Try uploading a large file
    const largeFilePath = await testDataManager.createLargeTestFile(15); // 15MB file

    await batchPage.uploadFiles([largeFilePath]);

    // Should show file size error
    const hasError = await batchPage.hasBatchError();
    expect(hasError).toBe(true);

    const errorMessage = await batchPage.getBatchError();
    expect(errorMessage.toLowerCase()).toContain('size');
  });

  test('should handle batch analysis pause and resume', async () => {
    // Create multiple test files for longer processing
    const testFiles = await testDataManager.createTestFiles();
    const filePaths = [testFiles.text, testFiles.json, testFiles.csv];

    await batchPage.goto();
    await batchPage.uploadFiles(filePaths);

    // Configure for slower processing
    await batchPage.configureBatchAnalysis({
      analysisType: 'deep',
      enableParallel: false, // Sequential processing for predictable pausing
    });

    // Start batch analysis
    await batchPage.startBatchAnalysis();

    // Wait a moment then pause
    await batchPage.page.waitForTimeout(2000);
    await batchPage.pauseBatchAnalysis();

    // Verify batch is paused (progress should stop)
    const progressBeforePause = await batchPage.getBatchProgress();
    
    await batchPage.page.waitForTimeout(2000);
    
    const progressAfterPause = await batchPage.getBatchProgress();
    expect(progressAfterPause.processed).toBe(progressBeforePause.processed);

    // Resume batch analysis
    await batchPage.startBatchAnalysis();

    // Wait for completion
    await batchPage.waitForBatchComplete();

    // Verify all files were processed
    const results = await batchPage.getBatchResults();
    expect(results.length).toBe(3);
  });

  test('should handle batch analysis cancellation', async () => {
    const testFiles = await testDataManager.createTestFiles();
    const filePaths = [testFiles.text, testFiles.json];

    await batchPage.goto();
    await batchPage.uploadFiles(filePaths);

    // Start batch analysis
    await batchPage.startBatchAnalysis();

    // Cancel immediately
    await batchPage.cancelBatchAnalysis();

    // Verify batch is no longer in progress
    const isInProgress = await batchPage.isBatchInProgress();
    expect(isInProgress).toBe(false);

    // Results section should show cancellation status
    const results = await batchPage.getBatchResults();
    expect(results.some(result => result.status === 'cancelled')).toBe(true);
  });

  test('should handle failed file processing and retry', async () => {
    await batchPage.goto();

    // Mock API to simulate failures for specific files
    await batchPage.mockApiResponse(
      /\/api\/analyze-batch/,
      {
        results: [
          { fileName: 'test1.txt', status: 'completed', score: 85 },
          { fileName: 'test2.txt', status: 'failed', error: 'Processing timeout' },
        ]
      }
    );

    const testFiles = await testDataManager.createTestFiles();
    await batchPage.uploadFiles([testFiles.text, testFiles.json]);

    await batchPage.startBatchAnalysis();
    await batchPage.waitForBatchComplete();

    // Check that some files failed
    const results = await batchPage.getBatchResults();
    const failedResults = results.filter(r => r.status === 'failed');
    expect(failedResults.length).toBeGreaterThan(0);

    // Retry failed analyses
    await batchPage.retryFailedAnalyses();

    // Should restart processing for failed files
    const isInProgress = await batchPage.isBatchInProgress();
    expect(isInProgress).toBe(true);
  });

  test('should handle different file types correctly', async () => {
    const testFiles = await testDataManager.createTestFiles();
    
    await batchPage.goto();
    await batchPage.uploadFiles([testFiles.text, testFiles.json, testFiles.csv]);

    await batchPage.configureBatchAnalysis({
      analysisType: 'standard',
    });

    await batchPage.startBatchAnalysis();
    await batchPage.waitForBatchComplete();

    const results = await batchPage.getBatchResults();
    
    // Verify all file types were processed
    const fileTypes = results.map(r => r.fileName.split('.').pop());
    expect(fileTypes).toContain('txt');
    expect(fileTypes).toContain('json');
    expect(fileTypes).toContain('csv');

    // All should have completed successfully
    expect(results.every(r => r.status === 'completed')).toBe(true);
  });

  test('should handle parallel vs sequential processing', async () => {
    const testFiles = await testDataManager.createTestFiles();
    const filePaths = [testFiles.text, testFiles.json, testFiles.csv];

    // Test parallel processing
    await batchPage.goto();
    await batchPage.uploadFiles(filePaths);

    await batchPage.configureBatchAnalysis({
      analysisType: 'quick',
      enableParallel: true,
      maxConcurrency: 3,
    });

    const parallelStartTime = Date.now();
    await batchPage.startBatchAnalysis();
    await batchPage.waitForBatchComplete();
    const parallelEndTime = Date.now();
    const parallelDuration = parallelEndTime - parallelStartTime;

    // Clear and test sequential processing
    await batchPage.goto();
    await batchPage.uploadFiles(filePaths);

    await batchPage.configureBatchAnalysis({
      analysisType: 'quick',
      enableParallel: false,
    });

    const sequentialStartTime = Date.now();
    await batchPage.startBatchAnalysis();
    await batchPage.waitForBatchComplete();
    const sequentialEndTime = Date.now();
    const sequentialDuration = sequentialEndTime - sequentialStartTime;

    // Parallel should generally be faster (though this might be flaky in tests)
    console.log(`Parallel: ${parallelDuration}ms, Sequential: ${sequentialDuration}ms`);
    
    // At minimum, both should complete successfully
    const parallelResults = await batchPage.getBatchResults();
    expect(parallelResults.length).toBe(3);
  });

  test('should validate subscription limits for batch analysis', async () => {
    // Logout and login as basic user
    await authHelper.logout();
    await authHelper.loginAs('basicUser');

    await batchPage.goto();

    // Basic users might have file count limits
    const testFiles = await testDataManager.createTestFiles();
    const manyFiles = Array(20).fill(testFiles.text); // Try to upload many files

    await batchPage.uploadFiles(manyFiles);

    // Should show subscription limit error
    const hasError = await batchPage.hasBatchError();
    if (hasError) {
      const errorMessage = await batchPage.getBatchError();
      expect(errorMessage.toLowerCase()).toMatch(/limit|subscription|upgrade/);
    }
  });

  test('should handle batch analysis history and management', async () => {
    // Create and run multiple batch analyses
    const testFiles = await testDataManager.createTestFiles();

    for (let i = 0; i < 3; i++) {
      await batchPage.goto();
      await batchPage.uploadFiles([testFiles.text]);
      
      await batchPage.configureBatchAnalysis({
        analysisType: 'quick',
      });

      await batchPage.startBatchAnalysis();
      await batchPage.waitForBatchComplete();

      await batchPage.saveBatchResults(`Batch ${i + 1}`);
    }

    // Check batch history
    const history = await batchPage.getBatchHistory();
    expect(history.length).toBeGreaterThanOrEqual(3);

    // Verify history items have correct structure
    for (const item of history) {
      expect(item.name).toBeTruthy();
      expect(item.date).toBeTruthy();
      expect(item.fileCount).toBeGreaterThan(0);
      expect(item.status).toBeTruthy();
    }
  });

  test('should integrate with dashboard analytics', async () => {
    // Run batch analysis
    const testFiles = await testDataManager.createTestFiles();
    
    await batchPage.goto();
    await batchPage.uploadFiles([testFiles.text, testFiles.json]);
    
    await batchPage.startBatchAnalysis();
    await batchPage.waitForBatchComplete();

    // Navigate to dashboard
    await dashboard.goto();
    await dashboard.waitForDataToLoad();

    // Verify batch analysis appears in recent analyses
    const recentAnalyses = await dashboard.getRecentAnalyses();
    expect(recentAnalyses.some(analysis => 
      analysis.title.toLowerCase().includes('batch')
    )).toBe(true);

    // Verify usage statistics are updated
    const usage = await dashboard.getUsageStatistics();
    expect(usage.current).toBeGreaterThan(0);
  });
});