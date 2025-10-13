import { Page, Locator, expect } from '@playwright/test';
import { waitForAppLoad, waitForLoadingComplete } from '../utils/test-helpers';

export class AnalyzerPage {
  readonly page: Page;
  readonly contentTextarea: Locator;
  readonly analyzeButton: Locator;
  readonly sampleTextButton: Locator;
  readonly fileUploadInput: Locator;
  readonly uploadButton: Locator;
  readonly resultsSection: Locator;
  readonly accuracyScore: Locator;
  readonly riskLevel: Locator;
  readonly riskBadge: Locator;
  readonly hallucinationsList: Locator;
  readonly hallucinationItems: Locator;
  readonly processingTime: Locator;
  readonly verificationSources: Locator;
  readonly loadingSpinner: Locator;
  readonly errorMessage: Locator;
  readonly ragToggle: Locator;
  readonly ragAnalysisButton: Locator;
  readonly analysisHistorySection: Locator;
  readonly clearButton: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Input elements
    this.contentTextarea = page.getByTestId('content-textarea');
    this.analyzeButton = page.getByTestId('analyze-button');
    this.sampleTextButton = page.getByTestId('sample-text-button');
    this.fileUploadInput = page.getByTestId('file-upload-input');
    this.uploadButton = page.getByTestId('upload-button');
    
    // Results elements
    this.resultsSection = page.getByTestId('analysis-results');
    this.accuracyScore = page.getByTestId('accuracy-score');
    this.riskLevel = page.getByTestId('risk-level');
    this.riskBadge = page.getByTestId('risk-badge');
    this.hallucinationsList = page.getByTestId('hallucinations-list');
    this.hallucinationItems = page.getByTestId('hallucination-item');
    this.processingTime = page.getByTestId('processing-time');
    this.verificationSources = page.getByTestId('verification-sources');
    
    // State elements
    this.loadingSpinner = page.getByTestId('loading-spinner');
    this.errorMessage = page.getByTestId('error-message');
    
    // Feature elements
    this.ragToggle = page.getByTestId('rag-toggle');
    this.ragAnalysisButton = page.getByTestId('rag-analysis-button');
    this.analysisHistorySection = page.getByTestId('analysis-history');
    this.clearButton = page.getByTestId('clear-button');
  }

  async goto() {
    await this.page.goto('/analyzer');
    await waitForAppLoad(this.page);
  }

  async fillContent(content: string) {
    await this.contentTextarea.fill(content);
  }

  async clearContent() {
    await this.contentTextarea.clear();
  }

  async clickSampleText() {
    await this.sampleTextButton.click();
    // Wait for content to be filled
    await expect(this.contentTextarea).not.toHaveValue('');
  }

  async uploadFile(filePath: string) {
    await this.fileUploadInput.setInputFiles(filePath);
    await this.uploadButton.click();
    await waitForLoadingComplete(this.page);
  }

  async analyzeContent(content?: string) {
    if (content) {
      await this.fillContent(content);
    }
    
    await this.analyzeButton.click();
    
    // Wait for loading to start
    await expect(this.loadingSpinner).toBeVisible();
    
    // Wait for loading to complete
    await waitForLoadingComplete(this.page, 30000);
    
    // Wait for results to appear
    await expect(this.resultsSection).toBeVisible();
  }

  async getAnalysisResults() {
    await expect(this.resultsSection).toBeVisible();
    
    const accuracy = await this.accuracyScore.textContent();
    const risk = await this.riskLevel.textContent();
    const hallucinationCount = await this.hallucinationItems.count();
    const processingTimeText = await this.processingTime.textContent();
    const sourcesText = await this.verificationSources.textContent();
    
    return {
      accuracy: parseFloat(accuracy?.replace('%', '') || '0'),
      riskLevel: risk?.toLowerCase().trim() || '',
      hallucinationCount,
      processingTime: parseInt(processingTimeText?.match(/\\d+/)?.[0] || '0'),
      verificationSources: parseInt(sourcesText?.match(/\\d+/)?.[0] || '0')
    };
  }

  async getHallucinations() {
    const hallucinations = [];
    const count = await this.hallucinationItems.count();
    
    for (let i = 0; i < count; i++) {
      const item = this.hallucinationItems.nth(i);
      const text = await item.textContent();
      const severity = await item.getAttribute('data-severity');
      hallucinations.push({ text: text?.trim(), severity });
    }
    
    return hallucinations;
  }

  async expectAnalysisComplete() {
    await expect(this.resultsSection).toBeVisible();
    await expect(this.accuracyScore).toContainText('%');
    await expect(this.riskLevel).toBeVisible();
    await expect(this.riskBadge).toBeVisible();
  }

  async expectAnalysisError() {
    await expect(this.errorMessage).toBeVisible();
  }

  async expectLoadingState() {
    await expect(this.loadingSpinner).toBeVisible();
    await expect(this.analyzeButton).toBeDisabled();
  }

  async expectIdleState() {
    await expect(this.loadingSpinner).toBeHidden();
    await expect(this.analyzeButton).toBeEnabled();
  }

  async toggleRAG(enabled: boolean) {
    const isCurrentlyEnabled = await this.ragToggle.isChecked();
    if (isCurrentlyEnabled !== enabled) {
      await this.ragToggle.click();
    }
  }

  async openRAGAnalysis() {
    await this.ragAnalysisButton.click();
    // Wait for RAG viewer to open
    await this.page.waitForSelector('[data-testid="rag-viewer"]');
  }

  async clearAnalysis() {
    await this.clearButton.click();
    await expect(this.resultsSection).toBeHidden();
    await expect(this.contentTextarea).toHaveValue('');
  }

  async getAnalysisHistory() {
    const historyItems = this.page.locator('[data-testid="history-item"]');
    const count = await historyItems.count();
    const history = [];
    
    for (let i = 0; i < count; i++) {
      const item = historyItems.nth(i);
      const accuracy = await item.locator('[data-testid="history-accuracy"]').textContent();
      const risk = await item.locator('[data-testid="history-risk"]').textContent();
      const timestamp = await item.locator('[data-testid="history-timestamp"]').textContent();
      
      history.push({
        accuracy: parseFloat(accuracy?.replace('%', '') || '0'),
        riskLevel: risk?.toLowerCase().trim() || '',
        timestamp: timestamp?.trim() || ''
      });
    }
    
    return history;
  }

  async selectHistoryItem(index: number) {
    const historyItems = this.page.locator('[data-testid="history-item"]');
    await historyItems.nth(index).click();
    await expect(this.resultsSection).toBeVisible();
  }

  async getRiskLevelColor() {
    const riskBadgeClass = await this.riskBadge.getAttribute('class');
    
    if (riskBadgeClass?.includes('bg-green')) return 'green';
    if (riskBadgeClass?.includes('bg-yellow')) return 'yellow';
    if (riskBadgeClass?.includes('bg-orange')) return 'orange';
    if (riskBadgeClass?.includes('bg-red')) return 'red';
    
    return 'unknown';
  }

  async expectRiskLevel(expectedRisk: 'low' | 'medium' | 'high' | 'critical') {
    await expect(this.riskLevel).toContainText(expectedRisk, { ignoreCase: true });
    
    const expectedColors = {
      low: 'green',
      medium: 'yellow', 
      high: 'orange',
      critical: 'red'
    };
    
    const actualColor = await this.getRiskLevelColor();
    expect(actualColor).toBe(expectedColors[expectedRisk]);
  }

  async expectAccuracyRange(min: number, max: number) {
    const results = await this.getAnalysisResults();
    expect(results.accuracy).toBeGreaterThanOrEqual(min);
    expect(results.accuracy).toBeLessThanOrEqual(max);
  }

  async expectHallucinationsDetected() {
    const results = await this.getAnalysisResults();
    expect(results.hallucinationCount).toBeGreaterThan(0);
  }

  async expectNoHallucinationsDetected() {
    const results = await this.getAnalysisResults();
    expect(results.hallucinationCount).toBe(0);
  }
}