import { Page, Locator, expect } from '@playwright/test';
import { waitForAppLoad, waitForLoadingComplete } from '../utils/test-helpers';

export class GoogleDrivePage {
  readonly page: Page;
  readonly driveContainer: Locator;
  readonly connectButton: Locator;
  readonly disconnectButton: Locator;
  readonly authStatus: Locator;
  readonly filesList: Locator;
  readonly fileItems: Locator;
  readonly folderItems: Locator;
  readonly selectedFiles: Locator;
  readonly selectAllButton: Locator;
  readonly clearSelectionButton: Locator;
  readonly analyzeSelectedButton: Locator;
  readonly downloadSelectedButton: Locator;
  
  // Navigation
  readonly currentFolderPath: Locator;
  readonly backButton: Locator;
  readonly homeButton: Locator;
  readonly breadcrumbs: Locator;
  
  // Search
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly clearSearchButton: Locator;
  readonly searchResults: Locator;
  
  // File operations
  readonly uploadButton: Locator;
  readonly createFolderButton: Locator;
  readonly refreshButton: Locator;
  readonly sortDropdown: Locator;
  readonly viewModeToggle: Locator;
  
  // File details
  readonly filePreview: Locator;
  readonly fileInfo: Locator;
  readonly fileName: Locator;
  readonly fileSize: Locator;
  readonly fileType: Locator;
  readonly lastModified: Locator;
  
  // Analysis results
  readonly analysisProgress: Locator;
  readonly analysisResults: Locator;
  readonly batchAnalysisStatus: Locator;
  
  // State elements
  readonly loadingSpinner: Locator;
  readonly errorMessage: Locator;
  readonly emptyState: Locator;
  readonly connectionError: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // Main container
    this.driveContainer = page.getByTestId('google-drive-container');
    this.connectButton = page.getByTestId('connect-drive-button');
    this.disconnectButton = page.getByTestId('disconnect-drive-button');
    this.authStatus = page.getByTestId('drive-auth-status');
    
    // File listing
    this.filesList = page.getByTestId('files-list');
    this.fileItems = page.getByTestId('file-item');
    this.folderItems = page.getByTestId('folder-item');
    this.selectedFiles = page.getByTestId('selected-file');
    
    // Selection controls
    this.selectAllButton = page.getByTestId('select-all-button');
    this.clearSelectionButton = page.getByTestId('clear-selection-button');
    this.analyzeSelectedButton = page.getByTestId('analyze-selected-button');
    this.downloadSelectedButton = page.getByTestId('download-selected-button');
    
    // Navigation
    this.currentFolderPath = page.getByTestId('current-folder-path');
    this.backButton = page.getByTestId('back-button');
    this.homeButton = page.getByTestId('home-button');
    this.breadcrumbs = page.getByTestId('breadcrumbs');
    
    // Search
    this.searchInput = page.getByTestId('search-input');
    this.searchButton = page.getByTestId('search-button');
    this.clearSearchButton = page.getByTestId('clear-search-button');
    this.searchResults = page.getByTestId('search-results');
    
    // File operations
    this.uploadButton = page.getByTestId('upload-button');
    this.createFolderButton = page.getByTestId('create-folder-button');
    this.refreshButton = page.getByTestId('refresh-button');
    this.sortDropdown = page.getByTestId('sort-dropdown');
    this.viewModeToggle = page.getByTestId('view-mode-toggle');
    
    // File details
    this.filePreview = page.getByTestId('file-preview');
    this.fileInfo = page.getByTestId('file-info');
    this.fileName = page.getByTestId('file-name');
    this.fileSize = page.getByTestId('file-size');
    this.fileType = page.getByTestId('file-type');
    this.lastModified = page.getByTestId('last-modified');
    
    // Analysis
    this.analysisProgress = page.getByTestId('analysis-progress');
    this.analysisResults = page.getByTestId('analysis-results');
    this.batchAnalysisStatus = page.getByTestId('batch-analysis-status');
    
    // State elements
    this.loadingSpinner = page.getByTestId('drive-loading');
    this.errorMessage = page.getByTestId('drive-error');
    this.emptyState = page.getByTestId('empty-state');
    this.connectionError = page.getByTestId('connection-error');
  }

  async goto() {
    await this.page.goto('/drive');
    await waitForAppLoad(this.page);
  }

  async connectGoogleDrive() {
    await this.connectButton.click();
    
    // In test environment, this might be mocked
    // Wait for authentication flow
    await waitForLoadingComplete(this.page);
    
    // Verify connection success
    await expect(this.authStatus).toContainText('connected', { ignoreCase: true });
  }

  async disconnectGoogleDrive() {
    await this.disconnectButton.click();
    await expect(this.authStatus).toContainText('disconnected', { ignoreCase: true });
  }

  async expectConnected() {
    await expect(this.authStatus).toContainText('connected', { ignoreCase: true });
    await expect(this.filesList).toBeVisible();
    await expect(this.connectButton).toBeHidden();
    await expect(this.disconnectButton).toBeVisible();
  }

  async expectDisconnected() {
    await expect(this.authStatus).toContainText('disconnected', { ignoreCase: true });
    await expect(this.connectButton).toBeVisible();
    await expect(this.disconnectButton).toBeHidden();
  }

  async expectFilesLoaded() {
    await expect(this.filesList).toBeVisible();
    await waitForLoadingComplete(this.page);
    
    // Should have either files or empty state
    const fileCount = await this.fileItems.count();
    const folderCount = await this.folderItems.count();
    
    if (fileCount === 0 && folderCount === 0) {
      await expect(this.emptyState).toBeVisible();
    }
  }

  async getFileList() {
    const files = [];
    const fileCount = await this.fileItems.count();
    
    for (let i = 0; i < fileCount; i++) {
      const item = this.fileItems.nth(i);
      const name = await item.locator('[data-testid="file-name"]').textContent();
      const size = await item.locator('[data-testid="file-size"]').textContent();
      const type = await item.locator('[data-testid="file-type"]').textContent();
      const modified = await item.locator('[data-testid="file-modified"]').textContent();
      
      files.push({
        name: name?.trim() || '',
        size: size?.trim() || '',
        type: type?.trim() || '',
        modified: modified?.trim() || ''
      });
    }
    
    return files;
  }

  async getFolderList() {
    const folders = [];
    const folderCount = await this.folderItems.count();
    
    for (let i = 0; i < folderCount; i++) {
      const item = this.folderItems.nth(i);
      const name = await item.locator('[data-testid="folder-name"]').textContent();
      const itemCount = await item.locator('[data-testid="folder-item-count"]').textContent();
      
      folders.push({
        name: name?.trim() || '',
        itemCount: parseInt(itemCount?.replace(/[^0-9]/g, '') || '0')
      });
    }
    
    return folders;
  }

  async selectFile(fileName: string) {
    const fileItem = this.page.locator(`[data-testid="file-item"]:has-text("${fileName}")`);
    await fileItem.click();
    
    // Verify selection
    await expect(fileItem).toHaveClass(/selected|bg-blue/);
  }

  async selectMultipleFiles(fileNames: string[]) {
    for (const fileName of fileNames) {
      const fileItem = this.page.locator(`[data-testid="file-item"]:has-text("${fileName}")`);
      await fileItem.click({ modifiers: ['Control'] }); // Ctrl+click for multi-select
    }
  }

  async selectAllFiles() {
    await this.selectAllButton.click();
    
    // Verify all files are selected
    const totalFiles = await this.fileItems.count();
    const selectedCount = await this.selectedFiles.count();
    expect(selectedCount).toBe(totalFiles);
  }

  async clearSelection() {
    await this.clearSelectionButton.click();
    await expect(this.selectedFiles).toHaveCount(0);
  }

  async getSelectedFiles() {
    const selected = [];
    const selectedCount = await this.selectedFiles.count();
    
    for (let i = 0; i < selectedCount; i++) {
      const item = this.selectedFiles.nth(i);
      const name = await item.locator('[data-testid="file-name"]').textContent();
      selected.push(name?.trim() || '');
    }
    
    return selected;
  }

  async analyzeSelectedFiles() {
    const selectedCount = await this.selectedFiles.count();
    expect(selectedCount).toBeGreaterThan(0);
    
    await this.analyzeSelectedButton.click();
    
    // Wait for analysis to start
    await expect(this.analysisProgress).toBeVisible();
    
    // Wait for analysis to complete
    await waitForLoadingComplete(this.page, 60000); // Longer timeout for file analysis
    
    // Verify results
    await expect(this.analysisResults).toBeVisible();
  }

  async downloadSelectedFiles() {
    const selectedCount = await this.selectedFiles.count();
    expect(selectedCount).toBeGreaterThan(0);
    
    await this.downloadSelectedButton.click();
    // Note: Actual download testing might require special handling
  }

  async openFolder(folderName: string) {
    const folderItem = this.page.locator(`[data-testid="folder-item"]:has-text("${folderName}")`);
    await folderItem.dblclick();
    
    // Wait for folder contents to load
    await waitForLoadingComplete(this.page);
    
    // Verify navigation
    await expect(this.currentFolderPath).toContainText(folderName);
  }

  async navigateBack() {
    await this.backButton.click();
    await waitForLoadingComplete(this.page);
  }

  async navigateHome() {
    await this.homeButton.click();
    await waitForLoadingComplete(this.page);
    await expect(this.currentFolderPath).toContainText('My Drive');
  }

  async searchFiles(query: string) {
    await this.searchInput.fill(query);
    await this.searchButton.click();
    
    await waitForLoadingComplete(this.page);
    await expect(this.searchResults).toBeVisible();
  }

  async clearSearch() {
    await this.clearSearchButton.click();
    await waitForLoadingComplete(this.page);
  }

  async getSearchResults() {
    const results = [];
    const resultItems = this.page.locator('[data-testid="search-result-item"]');
    const count = await resultItems.count();
    
    for (let i = 0; i < count; i++) {
      const item = resultItems.nth(i);
      const name = await item.locator('[data-testid="result-name"]').textContent();
      const path = await item.locator('[data-testid="result-path"]').textContent();
      
      results.push({
        name: name?.trim() || '',
        path: path?.trim() || ''
      });
    }
    
    return results;
  }

  async refreshFiles() {
    await this.refreshButton.click();
    await waitForLoadingComplete(this.page);
  }

  async sortBy(sortOption: 'name' | 'size' | 'modified' | 'type') {
    await this.sortDropdown.click();
    await this.page.locator(`[data-value="${sortOption}"]`).click();
    await waitForLoadingComplete(this.page);
  }

  async toggleViewMode() {
    await this.viewModeToggle.click();
    // Should switch between list and grid view
  }

  async previewFile(fileName: string) {
    const fileItem = this.page.locator(`[data-testid="file-item"]:has-text("${fileName}")`);
    await fileItem.click();
    
    // Wait for preview to load
    await expect(this.filePreview).toBeVisible();
  }

  async getFileInfo() {
    await expect(this.fileInfo).toBeVisible();
    
    const name = await this.fileName.textContent();
    const size = await this.fileSize.textContent();
    const type = await this.fileType.textContent();
    const modified = await this.lastModified.textContent();
    
    return {
      name: name?.trim() || '',
      size: size?.trim() || '',
      type: type?.trim() || '',
      modified: modified?.trim() || ''
    };
  }

  async expectAnalysisComplete() {
    await expect(this.analysisResults).toBeVisible();
    await expect(this.analysisProgress).toBeHidden();
  }

  async expectAnalysisInProgress() {
    await expect(this.analysisProgress).toBeVisible();
  }

  async getBatchAnalysisStatus() {
    const statusText = await this.batchAnalysisStatus.textContent();
    return statusText?.trim() || '';
  }

  async expectConnectionError() {
    await expect(this.connectionError).toBeVisible();
  }

  async expectLoadingState() {
    await expect(this.loadingSpinner).toBeVisible();
  }

  async expectErrorState() {
    await expect(this.errorMessage).toBeVisible();
  }

  async expectEmptyFolder() {
    await expect(this.emptyState).toBeVisible();
    await expect(this.fileItems).toHaveCount(0);
    await expect(this.folderItems).toHaveCount(0);
  }

  // Test helper methods
  async expectFileTypes(expectedTypes: string[]) {
    const files = await this.getFileList();
    const actualTypes = files.map(f => f.type);
    
    for (const expectedType of expectedTypes) {
      expect(actualTypes).toContain(expectedType);
    }
  }

  async expectFilesContain(expectedFiles: string[]) {
    const files = await this.getFileList();
    const fileNames = files.map(f => f.name);
    
    for (const expectedFile of expectedFiles) {
      expect(fileNames).toContain(expectedFile);
    }
  }

  async expectFoldersContain(expectedFolders: string[]) {
    const folders = await this.getFolderList();
    const folderNames = folders.map(f => f.name);
    
    for (const expectedFolder of expectedFolders) {
      expect(folderNames).toContain(expectedFolder);
    }
  }
}