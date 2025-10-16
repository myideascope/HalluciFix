import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileProcessingService, FileProcessingError } from '../fileProcessingService';
import { googleDriveService } from '../googleDrive';

// Mock the Google Drive service
vi.mock('../googleDrive', () => ({
  googleDriveService: {
    getFileInfo: vi.fn(),
    downloadFile: vi.fn(),
    validateFileAccess: vi.fn(),
    getSupportedMimeTypes: vi.fn(() => [
      'text/plain',
      'application/vnd.google-apps.document',
      'application/pdf'
    ])
  }
}));

describe('FileProcessingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processFile', () => {
    it('should process a text file successfully', async () => {
      const mockFileInfo = {
        id: 'test-file-id',
        name: 'test.txt',
        mimeType: 'text/plain',
        size: '1000',
        modifiedTime: '2023-01-01T00:00:00Z'
      };

      const mockDownloadResult = {
        content: 'This is test content',
        mimeType: 'text/plain',
        size: 1000,
        truncated: false
      };

      vi.mocked(googleDriveService.getFileInfo).mockResolvedValue(mockFileInfo);
      vi.mocked(googleDriveService.downloadFile).mockResolvedValue(mockDownloadResult);

      const result = await fileProcessingService.processFile('test-file-id');

      expect(result).toMatchObject({
        id: 'test-file-id',
        name: 'test.txt',
        content: 'This is test content',
        mimeType: 'text/plain',
        originalMimeType: 'text/plain',
        size: 1000,
        truncated: false
      });

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle file not found error', async () => {
      vi.mocked(googleDriveService.getFileInfo).mockResolvedValue(null);

      await expect(fileProcessingService.processFile('non-existent-file'))
        .rejects
        .toThrow(FileProcessingError);
    });

    it('should handle unsupported file types', async () => {
      const mockFileInfo = {
        id: 'test-file-id',
        name: 'test.xyz',
        mimeType: 'application/unsupported',
        size: '1000',
        modifiedTime: '2023-01-01T00:00:00Z'
      };

      vi.mocked(googleDriveService.getFileInfo).mockResolvedValue(mockFileInfo);

      await expect(fileProcessingService.processFile('test-file-id'))
        .rejects
        .toThrow(FileProcessingError);
    });

    it('should handle files that are too large', async () => {
      const mockFileInfo = {
        id: 'test-file-id',
        name: 'large-file.txt',
        mimeType: 'text/plain',
        size: '50000000', // 50MB
        modifiedTime: '2023-01-01T00:00:00Z'
      };

      vi.mocked(googleDriveService.getFileInfo).mockResolvedValue(mockFileInfo);

      await expect(fileProcessingService.processFile('test-file-id', { maxSizeBytes: 1000000 }))
        .rejects
        .toThrow(FileProcessingError);
    });
  });

  describe('processFiles', () => {
    it('should process multiple files and handle mixed success/failure', async () => {
      const mockFileInfo1 = {
        id: 'file-1',
        name: 'test1.txt',
        mimeType: 'text/plain',
        size: '1000',
        modifiedTime: '2023-01-01T00:00:00Z'
      };

      const mockDownloadResult1 = {
        content: 'Content 1',
        mimeType: 'text/plain',
        size: 1000,
        truncated: false
      };

      vi.mocked(googleDriveService.getFileInfo)
        .mockResolvedValueOnce(mockFileInfo1)
        .mockResolvedValueOnce(null); // Second file not found

      vi.mocked(googleDriveService.downloadFile)
        .mockResolvedValueOnce(mockDownloadResult1);

      const result = await fileProcessingService.processFiles(['file-1', 'file-2']);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.successful[0].id).toBe('file-1');
      expect(result.failed[0].fileId).toBe('file-2');
    });
  });

  describe('validateFile', () => {
    it('should validate a supported file successfully', async () => {
      const mockFileInfo = {
        id: 'test-file-id',
        name: 'test.txt',
        mimeType: 'text/plain',
        size: '1000',
        modifiedTime: '2023-01-01T00:00:00Z'
      };

      const mockAccessInfo = {
        canRead: true,
        canWrite: false,
        canShare: false
      };

      vi.mocked(googleDriveService.getFileInfo).mockResolvedValue(mockFileInfo);
      vi.mocked(googleDriveService.validateFileAccess).mockResolvedValue(mockAccessInfo);

      const result = await fileProcessingService.validateFile('test-file-id');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.estimatedProcessingTime).toBeGreaterThanOrEqual(0);
    });

    it('should return validation errors for unsupported files', async () => {
      const mockFileInfo = {
        id: 'test-file-id',
        name: 'test.xyz',
        mimeType: 'application/unsupported',
        size: '1000',
        modifiedTime: '2023-01-01T00:00:00Z'
      };

      vi.mocked(googleDriveService.getFileInfo).mockResolvedValue(mockFileInfo);

      const result = await fileProcessingService.validateFile('test-file-id');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});