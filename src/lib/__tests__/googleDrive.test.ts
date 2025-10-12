import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { googleDriveService } from '../googleDrive';
import { supabase } from '../supabase';

// Mock Supabase
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn()
    }
  }
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockSupabase = vi.mocked(supabase);

describe('GoogleDriveService', () => {
  const mockAccessToken = 'mock-access-token-123';
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize successfully with valid session', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            provider_token: mockAccessToken,
            user: { id: 'user-123' }
          }
        },
        error: null
      });

      const result = await googleDriveService.initialize();

      expect(result).toBe(true);
      expect(googleDriveService.isAuthenticated()).toBe(true);
    });

    it('should fail to initialize without provider token', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      const result = await googleDriveService.initialize();

      expect(result).toBe(false);
      expect(googleDriveService.isAuthenticated()).toBe(false);
    });

    it('should fail to initialize with session but no provider token', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user-123' }
            // No provider_token
          }
        },
        error: null
      });

      const result = await googleDriveService.initialize();

      expect(result).toBe(false);
    });
  });

  describe('listFiles', () => {
    beforeEach(async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: { provider_token: mockAccessToken }
        },
        error: null
      });
      await googleDriveService.initialize();
    });

    it('should list files successfully', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Document 1.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: '1024',
          modifiedTime: '2024-01-01T00:00:00Z',
          webViewLink: 'https://drive.google.com/file/d/file1/view',
          parents: ['root']
        },
        {
          id: 'file2',
          name: 'Spreadsheet 1.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: '2048',
          modifiedTime: '2024-01-02T00:00:00Z',
          webViewLink: 'https://drive.google.com/file/d/file2/view',
          parents: ['root']
        }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: mockFiles })
      });

      const files = await googleDriveService.listFiles();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://www.googleapis.com/drive/v3/files'),
        expect.objectContaining({
          headers: {
            'Authorization': `Bearer ${mockAccessToken}`,
            'Content-Type': 'application/json'
          }
        })
      );

      expect(files).toEqual(mockFiles);
    });

    it('should list files from specific folder', async () => {
      const folderId = 'folder123';
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [] })
      });

      await googleDriveService.listFiles(folderId);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`'${folderId}' in parents`),
        expect.any(Object)
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized'
      });

      await expect(googleDriveService.listFiles()).rejects.toThrow('Failed to fetch files: Unauthorized');
    });

    it('should throw error when not authenticated', async () => {
      // Reset authentication
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });
      await googleDriveService.initialize();

      await expect(googleDriveService.listFiles()).rejects.toThrow('Google Drive not authenticated');
    });
  });

  describe('downloadFile', () => {
    beforeEach(async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: { provider_token: mockAccessToken }
        },
        error: null
      });
      await googleDriveService.initialize();
    });

    it('should download regular file', async () => {
      const fileId = 'file123';
      const fileContent = 'This is the file content';

      // Mock metadata request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            mimeType: 'text/plain',
            name: 'test.txt'
          })
        })
        // Mock download request
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(fileContent)
        });

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(fileContent);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should export Google Docs as plain text', async () => {
      const fileId = 'doc123';
      const docContent = 'Google Doc content';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            mimeType: 'application/vnd.google-apps.document',
            name: 'Google Doc'
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(docContent)
        });

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(docContent);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/export?mimeType=text/plain'),
        expect.any(Object)
      );
    });

    it('should export Google Sheets as CSV', async () => {
      const fileId = 'sheet123';
      const sheetContent = 'col1,col2\nval1,val2';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            mimeType: 'application/vnd.google-apps.spreadsheet',
            name: 'Google Sheet'
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(sheetContent)
        });

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(sheetContent);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/export?mimeType=text/csv'),
        expect.any(Object)
      );
    });

    it('should handle metadata fetch errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      await expect(googleDriveService.downloadFile('invalid-id')).rejects.toThrow('Failed to get file metadata: Not Found');
    });

    it('should handle download errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            mimeType: 'text/plain',
            name: 'test.txt'
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          statusText: 'Forbidden'
        });

      await expect(googleDriveService.downloadFile('file123')).rejects.toThrow('Failed to download file: Forbidden');
    });
  });

  describe('searchFiles', () => {
    beforeEach(async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: { provider_token: mockAccessToken }
        },
        error: null
      });
      await googleDriveService.initialize();
    });

    it('should search files by name', async () => {
      const query = 'test document';
      const mockResults = [
        {
          id: 'search1',
          name: 'Test Document 1.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: mockResults })
      });

      const results = await googleDriveService.searchFiles(query);

      expect(results).toEqual(mockResults);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`name contains '${query}'`),
        expect.any(Object)
      );
    });

    it('should search files with mime type filter', async () => {
      const query = 'document';
      const mimeTypes = ['application/pdf', 'text/plain'];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [] })
      });

      await googleDriveService.searchFiles(query, mimeTypes);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("mimeType='application/pdf' or mimeType='text/plain'"),
        expect.any(Object)
      );
    });

    it('should handle search errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request'
      });

      await expect(googleDriveService.searchFiles('test')).rejects.toThrow('Failed to search files: Bad Request');
    });
  });

  describe('getFolders', () => {
    beforeEach(async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: { provider_token: mockAccessToken }
        },
        error: null
      });
      await googleDriveService.initialize();
    });

    it('should get folders with files and subfolders', async () => {
      const mockFolders = [
        { id: 'folder1', name: 'Folder 1' },
        { id: 'folder2', name: 'Folder 2' }
      ];

      const mockFiles = [
        { id: 'file1', name: 'File 1.txt' }
      ];

      // Mock folder list request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: mockFolders })
        })
        // Mock files in folder1
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: mockFiles })
        })
        // Mock subfolders in folder1
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [] })
        })
        // Mock files in folder2
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [] })
        })
        // Mock subfolders in folder2
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [] })
        });

      const folders = await googleDriveService.getFolders();

      expect(folders).toHaveLength(2);
      expect(folders[0]).toMatchObject({
        id: 'folder1',
        name: 'Folder 1',
        files: mockFiles,
        folders: []
      });
    });
  });

  describe('utility methods', () => {
    it('should return supported mime types', () => {
      const mimeTypes = googleDriveService.getSupportedMimeTypes();

      expect(mimeTypes).toContain('text/plain');
      expect(mimeTypes).toContain('application/pdf');
      expect(mimeTypes).toContain('application/vnd.google-apps.document');
      expect(mimeTypes).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should check authentication status', async () => {
      expect(googleDriveService.isAuthenticated()).toBe(false);

      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: { provider_token: mockAccessToken }
        },
        error: null
      });

      await googleDriveService.initialize();
      expect(googleDriveService.isAuthenticated()).toBe(true);
    });
  });
});