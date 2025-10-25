/**
 * Analyzer Page Object Model
 * Handles interactions with the hallucination analysis page
 */

import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class AnalyzerPage extends BasePage {
  // Selectors
  private readonly selectors = {
    // Page structure
    pageContainer: '[data-testid="analyzer-page"]',
    pageTitle: '[data-testid="analyzer-title"]',
    
    // Input section
    inputSection: '[data-testid="input-section"]',
    textInput: '[data-testid="text-input"]',
    fileUpload: '[data-testid="file-upload"]',
    urlInput: '[data-testid="url-input"]',
    inputTabs: '[data-testid="input-tabs"]',
    textTab: '[data-testid="text-tab"]',
    fileTab: '[data-testid="file-tab"]',
    urlTab: '[data-testid="url-tab"]',
    
    // Analysis options
    optionsSection: '[data-testid="analysis-options"]',
    analysisType: '[data-testid="analysis-type"]',
    confidenceThreshold: '[data-testid="confidence-threshold"]',
    enableSeqLogprob: '[data-testid="enable-seq-logprob"]',
    enableRAG: '[data-testid="enable-rag"]',
    customPrompt: '[data-testid="custom-prompt"]',
    
    // Action buttons
    analyzeButton: '[data-testid="analyze-button"]',
    clearButton: '[data-testid="clear-button"]',
    saveButton: '[data-testid="save-button"]',
    exportButton: '[data-testid="export-button"]',
    
    // Results section
    resultsSection: '[data-testid="results-section"]',
    overallScore: '[data-testid="overall-score"]',
    riskLevel: '[data-testid="risk-level"]',
    confidenceScore: '[data-testid="confidence-score"]',
    
    // Detailed results
    detailedResults: '[data-testid="detailed-results"]',
    hallucinationItems: '[data-testid="hallucination-item"]',
    sourceVerification: '[data-testid="source-verification"]',
    factCheckResults: '[data-testid="fact-check-results"]',
    
    // Seq-logprob analysis
    seqLogprobSection: '[data-testid="seq-logprob-section"]',
    tokenAnalysis: '[data-testid="token-analysis"]',
    uncertaintyMap: '[data-testid="uncertainty-map"]',
    
    // RAG analysis
    ragSection: '[data-testid="rag-section"]',
    retrievedSources: '[data-testid="retrieved-sources"]',
    sourceRelevance: '[data-testid="source-relevance"]',
    
    // Loading and error states
    loadingSpinner: '[data-testid="analysis-loading"]',
    errorMessage: '[data-testid="error-message"]',
    progressBar: '[data-testid="progress-bar"]',
    
    // History and saved analyses
    historySection: '[data-testid="history-section"]',
    savedAnalyses: '[data-testid="saved-analyses"]',
    historyItem: '[data-testid="history-item"]',
    
    // Export options
    exportModal: '[data-testid="export-modal"]',
    exportFormat: '[data-testid="export-format"]',
    exportOptions: '[data-testid="export-options"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigate to the analyzer page
   */
  async goto(): Promise<void> {
    await this.page.goto('/analyze');
    await this.waitForLoad();
  }

  /**
   * Wait for the analyzer page to load
   */
  async waitForLoad(): Promise<void> {
    await this.waitForElement(this.selectors.pageContainer);
    await this.waitForElement(this.selectors.inputSection);
    await this.waitForLoadingToComplete();
  }

  // Input methods
  async selectInputType(type: 'text' | 'file' | 'url'): Promise<void> {
    const tabSelector = this.selectors[`${type}Tab` as keyof typeof this.selectors];
    await this.clickElement(tabSelector);
    await this.page.waitForTimeout(300); // Wait for tab transition
  }

  async enterText(text: string): Promise<void> {
    await this.selectInputType('text');
    await this.clearAndFill(this.selectors.textInput, text);
  }

  async uploadFile(filePath: string): Promise<void> {
    await this.selectInputType('file');
    await this.uploadFile(this.selectors.fileUpload, filePath);
    await this.waitForElement('[data-testid="file-uploaded"]');
  }

  async enterURL(url: string): Promise<void> {
    await this.selectInputType('url');
    await this.clearAndFill(this.selectors.urlInput, url);
  }

  // Analysis configuration
  async setAnalysisType(type: 'standard' | 'deep' | 'quick'): Promise<void> {
    await this.clickElement(this.selectors.analysisType);
    await this.clickElement(`[data-testid="analysis-type-${type}"]`);
  }

  async setConfidenceThreshold(threshold: number): Promise<void> {
    const slider = this.page.locator(this.selectors.confidenceThreshold);
    await slider.fill(threshold.toString());
  }

  async enableSeqLogprobAnalysis(enable: boolean = true): Promise<void> {
    const checkbox = this.page.locator(this.selectors.enableSeqLogprob);
    const isChecked = await checkbox.isChecked();
    
    if (isChecked !== enable) {
      await checkbox.click();
    }
  }

  async enableRAGAnalysis(enable: boolean = true): Promise<void> {
    const checkbox = this.page.locator(this.selectors.enableRAG);
    const isChecked = await checkbox.isChecked();
    
    if (isChecked !== enable) {
      await checkbox.click();
    }
  }

  async setCustomPrompt(prompt: string): Promise<void> {
    await this.clearAndFill(this.selectors.customPrompt, prompt);
  }

  // Analysis execution
  async startAnalysis(): Promise<void> {
    await this.clickElement(this.selectors.analyzeButton);
    await this.waitForElement(this.selectors.loadingSpinner);
  }

  async waitForAnalysisComplete(timeout: number = 60000): Promise<void> {
    await this.waitForElementToBeHidden(this.selectors.loadingSpinner, timeout);
    await this.waitForElement(this.selectors.resultsSection);
  }

  async performCompleteAnalysis(
    input: { type: 'text' | 'file' | 'url'; content: string },
    options?: {
      analysisType?: 'standard' | 'deep' | 'quick';
      confidenceThreshold?: number;
      enableSeqLogprob?: boolean;
      enableRAG?: boolean;
      customPrompt?: string;
    }
  ): Promise<void> {
    // Set input
    switch (input.type) {
      case 'text':
        await this.enterText(input.content);
        break;
      case 'file':
        await this.uploadFile(input.content);
        break;
      case 'url':
        await this.enterURL(input.content);
        break;
    }

    // Configure options
    if (options?.analysisType) {
      await this.setAnalysisType(options.analysisType);
    }
    
    if (options?.confidenceThreshold !== undefined) {
      await this.setConfidenceThreshold(options.confidenceThreshold);
    }
    
    if (options?.enableSeqLogprob !== undefined) {
      await this.enableSeqLogprobAnalysis(options.enableSeqLogprob);
    }
    
    if (options?.enableRAG !== undefined) {
      await this.enableRAGAnalysis(options.enableRAG);
    }
    
    if (options?.customPrompt) {
      await this.setCustomPrompt(options.customPrompt);
    }

    // Start analysis and wait for completion
    await this.startAnalysis();
    await this.waitForAnalysisComplete();
  }

  // Results retrieval
  async getOverallScore(): Promise<number> {
    const scoreText = await this.getElementText(this.selectors.overallScore);
    return parseFloat(scoreText.replace(/[^\d.]/g, ''));
  }

  async getRiskLevel(): Promise<string> {
    return await this.getElementText(this.selectors.riskLevel);
  }

  async getConfidenceScore(): Promise<number> {
    const scoreText = await this.getElementText(this.selectors.confidenceScore);
    return parseFloat(scoreText.replace(/[^\d.]/g, ''));
  }

  async getHallucinationItems(): Promise<Array<{
    text: string;
    score: number;
    type: string;
    explanation: string;
  }>> {
    const items = this.page.locator(this.selectors.hallucinationItems);
    const count = await items.count();
    const hallucinations: Array<{
      text: string;
      score: number;
      type: string;
      explanation: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const text = await item.locator('[data-testid="hallucination-text"]').textContent() || '';
      const scoreText = await item.locator('[data-testid="hallucination-score"]').textContent() || '0';
      const type = await item.locator('[data-testid="hallucination-type"]').textContent() || '';
      const explanation = await item.locator('[data-testid="hallucination-explanation"]').textContent() || '';

      hallucinations.push({
        text,
        score: parseFloat(scoreText.replace(/[^\d.]/g, '')),
        type,
        explanation,
      });
    }

    return hallucinations;
  }

  async getSourceVerification(): Promise<Array<{
    source: string;
    verified: boolean;
    confidence: number;
  }>> {
    const sources = this.page.locator('[data-testid="source-item"]');
    const count = await sources.count();
    const verifications: Array<{
      source: string;
      verified: boolean;
      confidence: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      const item = sources.nth(i);
      const source = await item.locator('[data-testid="source-text"]').textContent() || '';
      const verified = await item.locator('[data-testid="source-verified"]').isVisible();
      const confidenceText = await item.locator('[data-testid="source-confidence"]').textContent() || '0';

      verifications.push({
        source,
        verified,
        confidence: parseFloat(confidenceText.replace(/[^\d.]/g, '')),
      });
    }

    return verifications;
  }

  // Seq-logprob analysis results
  async getTokenAnalysis(): Promise<Array<{
    token: string;
    logprob: number;
    uncertainty: number;
  }>> {
    if (!(await this.isElementVisible(this.selectors.seqLogprobSection))) {
      return [];
    }

    const tokens = this.page.locator('[data-testid="token-item"]');
    const count = await tokens.count();
    const analysis: Array<{
      token: string;
      logprob: number;
      uncertainty: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      const item = tokens.nth(i);
      const token = await item.locator('[data-testid="token-text"]').textContent() || '';
      const logprobText = await item.locator('[data-testid="token-logprob"]').textContent() || '0';
      const uncertaintyText = await item.locator('[data-testid="token-uncertainty"]').textContent() || '0';

      analysis.push({
        token,
        logprob: parseFloat(logprobText),
        uncertainty: parseFloat(uncertaintyText),
      });
    }

    return analysis;
  }

  // RAG analysis results
  async getRetrievedSources(): Promise<Array<{
    title: string;
    url: string;
    relevance: number;
    snippet: string;
  }>> {
    if (!(await this.isElementVisible(this.selectors.ragSection))) {
      return [];
    }

    const sources = this.page.locator('[data-testid="retrieved-source"]');
    const count = await sources.count();
    const retrievedSources: Array<{
      title: string;
      url: string;
      relevance: number;
      snippet: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const item = sources.nth(i);
      const title = await item.locator('[data-testid="source-title"]').textContent() || '';
      const url = await item.locator('[data-testid="source-url"]').getAttribute('href') || '';
      const relevanceText = await item.locator('[data-testid="source-relevance"]').textContent() || '0';
      const snippet = await item.locator('[data-testid="source-snippet"]').textContent() || '';

      retrievedSources.push({
        title,
        url,
        relevance: parseFloat(relevanceText.replace(/[^\d.]/g, '')),
        snippet,
      });
    }

    return retrievedSources;
  }

  // Action methods
  async clearAnalysis(): Promise<void> {
    await this.clickElement(this.selectors.clearButton);
    await this.waitForElementToBeHidden(this.selectors.resultsSection);
  }

  async saveAnalysis(name?: string): Promise<void> {
    await this.clickElement(this.selectors.saveButton);
    
    if (name) {
      await this.waitForElement('[data-testid="save-modal"]');
      await this.fillInput('[data-testid="analysis-name"]', name);
      await this.clickElement('[data-testid="confirm-save"]');
    }
    
    await this.waitForElementToBeHidden('[data-testid="save-modal"]');
  }

  async exportResults(format: 'json' | 'csv' | 'pdf'): Promise<void> {
    await this.clickElement(this.selectors.exportButton);
    await this.waitForElement(this.selectors.exportModal);
    
    await this.clickElement(`[data-testid="export-${format}"]`);
    await this.waitForDownload();
    await this.waitForElementToBeHidden(this.selectors.exportModal);
  }

  // History and saved analyses
  async loadSavedAnalysis(name: string): Promise<void> {
    await this.clickElement(`[data-testid="saved-analysis-${name}"]`);
    await this.waitForLoad();
  }

  async getSavedAnalyses(): Promise<string[]> {
    const items = this.page.locator('[data-testid="saved-analysis-item"]');
    const count = await items.count();
    const names: string[] = [];

    for (let i = 0; i < count; i++) {
      const name = await items.nth(i).textContent();
      if (name) names.push(name.trim());
    }

    return names;
  }

  async deleteSavedAnalysis(name: string): Promise<void> {
    await this.clickElement(`[data-testid="delete-saved-${name}"]`);
    await this.clickElement('[data-testid="confirm-delete"]');
    await this.waitForElementToBeHidden('[data-testid="delete-modal"]');
  }

  // Validation methods
  async validateAnalysisResults(): Promise<boolean> {
    // Check if all required result sections are present
    const requiredSections = [
      this.selectors.overallScore,
      this.selectors.riskLevel,
      this.selectors.confidenceScore,
      this.selectors.detailedResults,
    ];

    for (const selector of requiredSections) {
      if (!(await this.isElementVisible(selector))) {
        console.error(`Required result section not visible: ${selector}`);
        return false;
      }
    }

    // Validate score ranges
    const overallScore = await this.getOverallScore();
    const confidenceScore = await this.getConfidenceScore();

    if (overallScore < 0 || overallScore > 100) {
      console.error(`Invalid overall score: ${overallScore}`);
      return false;
    }

    if (confidenceScore < 0 || confidenceScore > 100) {
      console.error(`Invalid confidence score: ${confidenceScore}`);
      return false;
    }

    return true;
  }

  async validateInputConstraints(): Promise<boolean> {
    // Test text input length limits
    const longText = 'a'.repeat(10001); // Assuming 10k character limit
    await this.enterText(longText);
    
    const errorVisible = await this.isElementVisible('[data-testid="input-error"]');
    if (!errorVisible) {
      console.error('Input length validation not working');
      return false;
    }

    // Clear the error
    await this.clearAnalysis();
    return true;
  }

  async validateFileUploadConstraints(): Promise<boolean> {
    // This would test file size limits, file type restrictions, etc.
    // Implementation depends on specific file upload requirements
    console.log('File upload validation placeholder');
    return true;
  }

  async getAnalysisProgress(): Promise<number> {
    if (await this.isElementVisible(this.selectors.progressBar)) {
      const progressText = await this.getElementAttribute(this.selectors.progressBar, 'aria-valuenow');
      return parseInt(progressText || '0');
    }
    return 0;
  }

  async isAnalysisInProgress(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.loadingSpinner);
  }

  async hasAnalysisError(): Promise<boolean> {
    return await this.isElementVisible(this.selectors.errorMessage);
  }

  async getAnalysisError(): Promise<string> {
    if (await this.hasAnalysisError()) {
      return await this.getElementText(this.selectors.errorMessage);
    }
    return '';
  }
}