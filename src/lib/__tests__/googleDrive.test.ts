import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies FIRST - before any imports that might use them
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockImplementation(async () => {
        logger.debug("Supabase getSession called");
        const result = {
          data: { session: { user: { id: 'test-user-id' } }, error: null },
          error: null
        };
        logger.info("Supabase getSession returning:", { result });
        return result;
      })
    }
  }
}));

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-user-id' } }, error: null }
      })
    }
  }
}));

vi.mock('../oauth/tokenManager', () => ({
  TokenManager: vi.fn().mockImplementation(() => ({
    hasValidTokens: vi.fn().mockResolvedValue(true),
    getValidTokens: vi.fn().mockResolvedValue({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token'
    })
  }))
}));

vi.mock('../serviceDegradationManager', () => ({
  serviceDegradationManager: {
    isOfflineMode: vi.fn().mockReturnValue(false),
    shouldUseFallback: vi.fn().mockReturnValue(false),
    forceFallback: vi.fn()
  }
}));

vi.mock('../offlineCacheManager', () => ({
  offlineCacheManager: {
    getCachedDriveFiles: vi.fn().mockReturnValue(null),
    cacheDriveFiles: vi.fn(),
    getCachedFileContent: vi.fn().mockReturnValue(null),
    cacheFileContent: vi.fn()
  }
}));

// Import after mocking
import { googleDriveService, DriveError, DriveErrorType } from '../googleDrive';
import type { GoogleDriveFile, GoogleDriveFolder } from '../googleDrive';

import { logger } from './logging';
vi.mock('../config', () => ({
  config: {
    getAuth: vi.fn().mockResolvedValue({
      google: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      }
    })
  }
}));

vi.mock('../config', () => ({
  config: {
    getAuth: vi.fn().mockResolvedValue({
      google: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret'
      }
    })
  }
}));

vi.mock('../oauth/tokenManager', () => ({
  TokenManager: vi.fn().mockImplementation(() => ({
    hasValidTokens: vi.fn().mockResolvedValue(true),
    getValidTokens: vi.fn().mockResolvedValue({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token'
    })
  }))
}));

vi.mock('../serviceDegradationManager', () => ({
  serviceDegradationManager: {
    isOfflineMode: vi.fn().mockReturnValue(false),
    shouldUseFallback: vi.fn().mockReturnValue(false),
    forceFallback: vi.fn()
  }
}));

vi.mock('../offlineCacheManager', () => ({
  offlineCacheManager: {
    getCachedDriveFiles: vi.fn().mockReturnValue(null),
    cacheDriveFiles: vi.fn(),
    getCachedFileContent: vi.fn().mockReturnValue(null),
    cacheFileContent: vi.fn()
  }
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GoogleDriveService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Set environment variables as fallback
    import.meta.env.VITE_GOOGLE_CLIENT_ID = 'test-client-id';
    import.meta.env.VITE_GOOGLE_CLIENT_SECRET = 'test-client-secret';
    
    // Reset service state
    await googleDriveService['checkConfiguration']();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      const isInitialized = await googleDriveService.initialize();
      
      expect(isInitialized).toBe(true);
    });

    it('should handle missing configuration gracefully', async () => {
      const { config } = await import('../config');
      
vi.mocked(config.getAuth).mockResolvedValueOnce({
          google: {
            clientId: '',
            clientSecret: ''
          }
        });

      // Reset configuration check
      googleDriveService['configurationChecked'] = false;
      
      const isInitialized = await googleDriveService.initialize();
      
      expect(isInitialized).toBe(false);
    });

    it('should check availability correctly', async () => {
      const isAvailable = await googleDriveService.isAvailable();
      
      expect(isAvailable).toBe(true);
    });

    it('should handle configuration errors', async () => {
      const { config } = await import('../config');
      
      vi.mocked(config.getAuth).mockRejectedValueOnce(new Error('Config error'));

      // Reset configuration check
      googleDriveService['configurationChecked'] = false;
      
      const isAvailable = await googleDriveService.isAvailable();
      
      // Should fallback to environment variables
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('authentication', () => {
    it('should get valid access token', async () => {
      const token = await googleDriveService['getAccessToken']();
      
      expect(token).toBe('test-access-token');
    });

    it('should throw error when user not authenticated', async () => {
      const { supabase } = await import('../supabase');
      
vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
          data: { session: null },
          error: null
        });

      await expect(googleDriveService['getAccessToken']()).rejects.toThrow(
        DriveError
      );
    });

    it('should throw error when no valid tokens found', async () => {
      const { TokenManager } = await import('../oauth/tokenManager');
      const mockTokenManager = new TokenManager('test-key');
      
      vi.mocked(mockTokenManager.getValidTokens).mockResolvedValueOnce(null);
      googleDriveService['tokenManager'] = mockTokenManager;

      await expect(googleDriveService['getAccessToken']()).rejects.toThrow(
        DriveError
      );
    });

    it('should check authentication status', async () => {
      const isAuthenticated = await googleDriveService.isAuthenticated();
      
      expect(isAuthenticated).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limits', async () => {
      // Simulate hitting rate limit
      for (let i = 0; i < 101; i++) {
        try {
          await googleDriveService['checkRateLimit']();
        } catch (error) {
          expect(error).toBeInstanceOf(DriveError);
          expect((error as DriveError).type).toBe(DriveErrorType.RATE_LIMIT_ERROR);
          break;
        }
      }
    });

    it('should reset rate limit window', async () => {
      // Set up rate limit state
      googleDriveService['rateLimitState'] = {
        requestCount: 50,
        windowStart: Date.now() - 70000 // 70 seconds ago
      };

      // Should reset and allow request
      await expect(googleDriveService['checkRateLimit']()).resolves.not.toThrow();
    });

    it('should provide rate limit status', () => {
      const status = googleDriveService.getRateLimitStatus();
      
      expect(status).toHaveProperty('requestsRemaining');
      expect(status).toHaveProperty('windowResetTime');
      expect(status).toHaveProperty('isInBackoff');
      expect(typeof status.requestsRemaining).toBe('number');
    });

    it('should allow manual rate limit reset', () => {
      googleDriveService['rateLimitState'].requestCount = 100;
      
      googleDriveService.resetRateLimit();
      
      expect(googleDriveService['rateLimitState'].requestCount).toBe(0);
    });
  });

  describe('file operations', () => {
    beforeEach(() => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn(),
        text: vi.fn(),
        arrayBuffer: vi.fn(),
        headers: new Headers()
      };
      
      mockFetch.mockResolvedValue(mockResponse);
    });

    describe('listFiles', () => {
      it('should list files successfully', async () => {
        const mockFilesResponse = {
          files: [
            {
              id: 'file-1',
              name: 'Document 1.pdf',
              mimeType: 'application/pdf',
              size: '1024',
              modifiedTime: '2024-01-01T00:00:00Z',
              webViewLink: 'https://drive.google.com/file/d/file-1/view'
            },
            {
              id: 'file-2',
              name: 'Document 2.docx',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              size: '2048',
              modifiedTime: '2024-01-02T00:00:00Z',
              webViewLink: 'https://drive.google.com/file/d/file-2/view'
            }
          ],
          nextPageToken: 'next-page-token'
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockFilesResponse),
          headers: new Headers()
        });

        const result = await googleDriveService.listFiles('root', 100);

        expect(result.files).toHaveLength(2);
        expect(result.nextPageToken).toBe('next-page-token');
        expect(result.hasMore).toBe(true);
        expect(result.files[0].name).toBe('Document 1.pdf');
      });

      it('should handle pagination', async () => {
        const mockFilesResponse = {
          files: [
            {
              id: 'file-3',
              name: 'Document 3.pdf',
              mimeType: 'application/pdf'
            }
          ]
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockFilesResponse),
          headers: new Headers()
        });

        const result = await googleDriveService.listFiles('root', 50, 'page-token');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('pageToken=page-token'),
          expect.any(Object)
        );
        expect(result.files).toHaveLength(1);
      });

      it('should use cached files in offline mode', async () => {
        const { serviceDegradationManager } = await import('../serviceDegradationManager');
        const { offlineCacheManager } = await import('../offlineCacheManager');
        
        vi.mocked(serviceDegradationManager.isOfflineMode).mockReturnValue(true);
        
        const cachedFiles = [
          {
            id: 'cached-file-1',
            name: 'Cached Document.pdf',
            mimeType: 'application/pdf',
            modifiedTime: '2024-01-01T00:00:00Z',
            webViewLink: 'https://drive.google.com/file/d/cached-file-1/view'
          }
        ];
        
        vi.mocked(offlineCacheManager.getCachedDriveFiles).mockReturnValue(cachedFiles);

        const result = await googleDriveService.listFiles('root');

        expect(result.files).toEqual(cachedFiles);
        expect(result.hasMore).toBe(false);
      });
    });

    describe('getFileInfo', () => {
      it('should get file information successfully', async () => {
        const mockFileInfo = {
          id: 'file-123',
          name: 'Test Document.pdf',
          mimeType: 'application/pdf',
          size: '1024',
          modifiedTime: '2024-01-01T00:00:00Z',
          webViewLink: 'https://drive.google.com/file/d/file-123/view',
          parents: ['folder-456']
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockFileInfo),
          headers: new Headers()
        });

        const result = await googleDriveService.getFileInfo('file-123');

        expect(result).toEqual(mockFileInfo);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/files/file-123'),
          expect.any(Object)
        );
      });

      it('should return null for non-existent files', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: vi.fn().mockResolvedValue({ error: 'File not found' }),
          headers: new Headers()
        });

        const result = await googleDriveService.getFileInfo('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('downloadFile', () => {
      it('should download text file successfully', async () => {
        const mockFileInfo = {
          id: 'file-123',
          name: 'test.txt',
          mimeType: 'text/plain',
          size: '100'
        };

        const mockFileContent = 'This is test file content';

        // Mock file info request
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockFileInfo),
          headers: new Headers()
        });

        // Mock file download request
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue(mockFileContent),
          headers: new Headers()
        });

        const result = await googleDriveService.downloadFile('file-123');

        expect(result.content).toBe(mockFileContent);
        expect(result.mimeType).toBe('text/plain');
        expect(result.size).toBe(mockFileContent.length);
        expect(result.truncated).toBe(false);
      });

      it('should handle Google Workspace document export', async () => {
        const mockFileInfo = {
          id: 'doc-123',
          name: 'Google Doc',
          mimeType: 'application/vnd.google-apps.document',
          size: undefined
        };

        const mockExportedContent = 'Exported document content';

        // Mock file info request
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockFileInfo),
          headers: new Headers()
        });

        // Mock export request
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue(mockExportedContent),
          headers: new Headers()
        });

        const result = await googleDriveService.downloadFile('doc-123');

        expect(result.content).toBe(mockExportedContent);
        expect(result.mimeType).toBe('text/plain');
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/export?mimeType=text%2Fplain'),
          expect.any(Object)
        );
      });

      it('should handle file size limits', async () => {
        const mockFileInfo = {
          id: 'large-file',
          name: 'large.pdf',
          mimeType: 'application/pdf',
          size: '20971520' // 20MB
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockFileInfo),
          headers: new Headers()
        });

        await expect(
          googleDriveService.downloadFile('large-file', { maxSizeBytes: 10 * 1024 * 1024 })
        ).rejects.toThrow(DriveError);
      });

      it('should truncate large content', async () => {
        const mockFileInfo = {
          id: 'file-123',
          name: 'test.txt',
          mimeType: 'text/plain'
        };

        const largeContent = 'x'.repeat(15 * 1024 * 1024); // 15MB

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockFileInfo),
          headers: new Headers()
        });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue(largeContent),
          headers: new Headers()
        });

        const result = await googleDriveService.downloadFile('file-123');

        expect(result.truncated).toBe(true);
        expect(result.content.length).toBeLessThan(largeContent.length);
        expect(result.content).toContain('[Content truncated due to size limit]');
      });

      it('should use cached content in offline mode', async () => {
        const { serviceDegradationManager } = await import('../serviceDegradationManager');
        const { offlineCacheManager } = await import('../offlineCacheManager');
        
        vi.mocked(serviceDegradationManager.isOfflineMode).mockReturnValue(true);
        
        const cachedContent = {
          content: 'Cached file content',
          mimeType: 'text/plain'
        };
        
        vi.mocked(offlineCacheManager.getCachedFileContent).mockReturnValue(cachedContent);

        const result = await googleDriveService.downloadFile('file-123');

        expect(result.content).toBe(cachedContent.content);
        expect(result.mimeType).toBe(cachedContent.mimeType);
      });
    });

    describe('searchFiles', () => {
      it('should search files successfully', async () => {
        const mockSearchResponse = {
          files: [
            {
              id: 'search-result-1',
              name: 'Search Result 1.pdf',
              mimeType: 'application/pdf'
            },
            {
              id: 'search-result-2',
              name: 'Search Result 2.docx',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
          ]
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockSearchResponse),
          headers: new Headers()
        });

        const result = await googleDriveService.searchFiles('test query', {
          mimeTypes: ['application/pdf'],
          maxResults: 10
        });

        expect(result.files).toHaveLength(2);
        expect(result.totalResults).toBe(2);
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('q='),
          expect.any(Object)
        );
      });

      it('should handle search with folder restriction', async () => {
        const mockSearchResponse = { files: [] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockSearchResponse),
          headers: new Headers()
        });

        await googleDriveService.searchFiles('test', {
          folderId: 'folder-123'
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("'folder-123' in parents"),
          expect.any(Object)
        );
      });
    });

    describe('getFolders', () => {
      it('should get folders successfully', async () => {
        const mockFoldersResponse = {
          files: [
            {
              id: 'folder-1',
              name: 'Folder 1',
              modifiedTime: '2024-01-01T00:00:00Z'
            },
            {
              id: 'folder-2',
              name: 'Folder 2',
              modifiedTime: '2024-01-02T00:00:00Z'
            }
          ]
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockFoldersResponse),
          headers: new Headers()
        });

        const result = await googleDriveService.getFolders('root');

        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('Folder 1');
        expect(result[0].files).toEqual([]);
        expect(result[0].folders).toEqual([]);
      });

      it('should include folder contents when requested', async () => {
        const mockFoldersResponse = {
          files: [
            {
              id: 'folder-1',
              name: 'Folder 1',
              modifiedTime: '2024-01-01T00:00:00Z'
            }
          ]
        };

        const mockFilesResponse = {
          files: [
            {
              id: 'file-1',
              name: 'File in folder',
              mimeType: 'text/plain'
            }
          ]
        };

        // Mock folder list request
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockFoldersResponse),
          headers: new Headers()
        });

        // Mock files in folder request
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(mockFilesResponse),
          headers: new Headers()
        });

        const result = await googleDriveService.getFolders('root', true);

        expect(result).toHaveLength(1);
        expect(result[0].files).toHaveLength(1);
        expect(result[0].files[0].name).toBe('File in folder');
      });
    });
  });

  describe('error handling', () => {
    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({ error: 'Invalid token' }),
        headers: new Headers()
      });

      await expect(googleDriveService.listFiles()).rejects.toThrow(DriveError);
    });

    it('should handle permission errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: vi.fn().mockResolvedValue({ error: 'Insufficient permissions' }),
        headers: new Headers()
      });

      await expect(googleDriveService.listFiles()).rejects.toThrow(DriveError);
    });

    it('should handle rate limit errors with retry-after', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: vi.fn().mockResolvedValue({ error: 'Rate limit exceeded' }),
        headers: new Headers({ 'retry-after': '60' })
      });

      await expect(googleDriveService.listFiles()).rejects.toThrow(DriveError);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Network error'));

      await expect(googleDriveService.listFiles()).rejects.toThrow(DriveError);
    });

    it('should retry on transient errors', async () => {
      // First call fails with 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValue({ error: 'Server error' }),
        headers: new Headers()
      });

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ files: [] }),
        headers: new Headers()
      });

      const result = await googleDriveService.listFiles();

      expect(result.files).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('mime type utilities', () => {
    it('should get supported mime types', () => {
      const mimeTypes = googleDriveService.getSupportedMimeTypes();
      
      expect(Array.isArray(mimeTypes)).toBe(true);
      expect(mimeTypes.length).toBeGreaterThan(0);
    });

    it('should get export formats for mime type', () => {
      const formats = googleDriveService.getExportFormats('application/vnd.google-apps.document');
      
      expect(Array.isArray(formats)).toBe(true);
    });

    it('should identify Google Workspace files', () => {
      const isWorkspace = googleDriveService.isGoogleWorkspaceFile('application/vnd.google-apps.document');
      
      expect(typeof isWorkspace).toBe('boolean');
    });

    it('should categorize file types', () => {
      const category = googleDriveService.getFileTypeCategory('application/pdf');
      
      expect(['document', 'spreadsheet', 'presentation', 'image', 'pdf', 'text', 'other']).toContain(category);
    });

    it('should provide file type descriptions', () => {
      const description = googleDriveService.getFileTypeDescription('application/pdf');
      
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
    });

    it('should validate file sizes', () => {
      const validation = googleDriveService.validateFileSizeForType('application/pdf', 1024 * 1024);
      
      expect(validation).toHaveProperty('valid');
      expect(typeof validation.valid).toBe('boolean');
    });
  });

  describe('file access validation', () => {
    it('should validate file access permissions', async () => {
      const mockCapabilities = {
        capabilities: {
          canDownload: true,
          canEdit: false,
          canShare: true
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockCapabilities),
        headers: new Headers()
      });

      const result = await googleDriveService.validateFileAccess('file-123');

      expect(result.canRead).toBe(true);
      expect(result.canWrite).toBe(false);
      expect(result.canShare).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle access validation errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: vi.fn().mockResolvedValue({ error: 'Access denied' }),
        headers: new Headers()
      });

      const result = await googleDriveService.validateFileAccess('file-123');

      expect(result.canRead).toBe(false);
      expect(result.canWrite).toBe(false);
      expect(result.canShare).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});