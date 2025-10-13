import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
<<<<<<< HEAD
import { googleDriveService } from '../googleDrive';
=======
import { googleDriveService, GoogleDriveFile } from '../googleDrive';
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
import { supabase } from '../supabase';

// Mock Supabase
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn()
    }
  }
}));

<<<<<<< HEAD
=======
const mockSupabase = vi.mocked(supabase);

>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

<<<<<<< HEAD
const mockSupabase = vi.mocked(supabase);

=======
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
describe('GoogleDriveService', () => {
  const mockAccessToken = 'mock-access-token-123';
  
  beforeEach(() => {
    vi.clearAllMocks();
<<<<<<< HEAD
  });

  afterEach(() => {
    vi.restoreAllMocks();
=======
    
    // Mock successful session with provider token
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          provider_token: mockAccessToken,
          user: { id: 'test-user' }
        } as any
      },
      error: null
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  });

  describe('initialize', () => {
    it('should initialize successfully with valid session', async () => {
<<<<<<< HEAD
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            provider_token: mockAccessToken,
            user: { id: 'user-123' }
          }
=======
      const result = await googleDriveService.initialize();
      
      expect(result).toBe(true);
      expect(mockSupabase.auth.getSession).toHaveBeenCalled();
    });

    it('should fail to initialize without provider token', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'test-user' }
          } as any
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        },
        error: null
      });

      const result = await googleDriveService.initialize();
<<<<<<< HEAD

      expect(result).toBe(true);
      expect(googleDriveService.isAuthenticated()).toBe(true);
    });

    it('should fail to initialize without provider token', async () => {
=======
      
      expect(result).toBe(false);
    });

    it('should fail to initialize without session', async () => {
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null
      });

      const result = await googleDriveService.initialize();
<<<<<<< HEAD

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

=======
      
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      expect(result).toBe(false);
    });
  });

  describe('listFiles', () => {
<<<<<<< HEAD
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
=======
    const mockFiles: GoogleDriveFile[] = [
      {
        id: 'file1',
        name: 'Document 1.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: '15432',
        modifiedTime: '2024-01-01T10:00:00Z',
        webViewLink: 'https://docs.google.com/document/d/file1/view',
        parents: ['root']
      },
      {
        id: 'file2',
        name: 'Spreadsheet 1.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: '8765',
        modifiedTime: '2024-01-02T14:30:00Z',
        webViewLink: 'https://docs.google.com/spreadsheets/d/file2/view',
        parents: ['root']
      }
    ];

    beforeEach(async () => {
      await googleDriveService.initialize();
    });

    it('should list files from root folder by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: mockFiles })
      } as Response);

      const files = await googleDriveService.listFiles();

      expect(files).toEqual(mockFiles);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("q='root' in parents and trashed=false"),
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        expect.objectContaining({
          headers: {
            'Authorization': `Bearer ${mockAccessToken}`,
            'Content-Type': 'application/json'
          }
        })
      );
<<<<<<< HEAD

      expect(files).toEqual(mockFiles);
=======
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });

    it('should list files from specific folder', async () => {
      const folderId = 'folder123';
<<<<<<< HEAD
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [] })
      });
=======
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: mockFiles })
      } as Response);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      await googleDriveService.listFiles(folderId);

      expect(mockFetch).toHaveBeenCalledWith(
<<<<<<< HEAD
        expect.stringContaining(`'${folderId}' in parents`),
=======
        expect.stringContaining(`q='${folderId}' in parents and trashed=false`),
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        expect.any(Object)
      );
    });

<<<<<<< HEAD
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
=======
    it('should respect page size parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: mockFiles.slice(0, 1) })
      } as Response);

      await googleDriveService.listFiles('root', 1);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('pageSize=1'),
        expect.any(Object)
      );
    });

    it('should throw error when not authenticated', async () => {
      // Create a new service instance without initialization
      const unauthenticatedService = new (googleDriveService.constructor as any)();
      
      await expect(unauthenticatedService.listFiles()).rejects.toThrow(
        'Google Drive not authenticated'
      );
    });

    it('should throw error when API request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized'
      } as Response);

      await expect(googleDriveService.listFiles()).rejects.toThrow(
        'Failed to fetch files: Unauthorized'
      );
    });

    it('should handle empty file list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: undefined })
      } as Response);

      const files = await googleDriveService.listFiles();

      expect(files).toEqual([]);
    });
  });

  describe('getFolders', () => {
    beforeEach(async () => {
      await googleDriveService.initialize();
    });

    it('should get folders with nested structure', async () => {
      const mockFolders = [
        { id: 'folder1', name: 'Documents' },
        { id: 'folder2', name: 'Images' }
      ];

      const mockSubFiles = [
        {
          id: 'subfile1',
          name: 'Nested Document.pdf',
          mimeType: 'application/pdf',
          size: '12345',
          modifiedTime: '2024-01-03T09:15:00Z',
          webViewLink: 'https://drive.google.com/file/d/subfile1/view',
          parents: ['folder1']
        }
      ];

      // Mock folder listing
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: mockFolders })
      } as Response);

      // Mock files in first folder
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: mockSubFiles })
      } as Response);

      // Mock subfolders in first folder (empty)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      } as Response);

      // Mock files in second folder (empty)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      } as Response);

      // Mock subfolders in second folder (empty)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      } as Response);

      const folders = await googleDriveService.getFolders();

      expect(folders).toHaveLength(2);
      expect(folders[0]).toMatchObject({
        id: 'folder1',
        name: 'Documents',
        files: mockSubFiles,
        folders: []
      });
      expect(folders[1]).toMatchObject({
        id: 'folder2',
        name: 'Images',
        files: [],
        folders: []
      });
    });

    it('should handle folder API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden'
      } as Response);

      await expect(googleDriveService.getFolders()).rejects.toThrow(
        'Failed to fetch folders: Forbidden'
      );
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('downloadFile', () => {
    beforeEach(async () => {
<<<<<<< HEAD
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
=======
      await googleDriveService.initialize();
    });

    it('should download regular file content', async () => {
      const fileId = 'file123';
      const mockContent = 'This is the file content for testing.';

      // Mock metadata request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mimeType: 'text/plain',
          name: 'test.txt'
        })
      } as Response);

      // Mock file download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContent
      } as Response);

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(mockContent);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // Check metadata request
      expect(mockFetch).toHaveBeenNthCalledWith(1,
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
        expect.objectContaining({
          headers: { 'Authorization': `Bearer ${mockAccessToken}` }
        })
      );

      // Check download request
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        expect.objectContaining({
          headers: { 'Authorization': `Bearer ${mockAccessToken}` }
        })
      );
    });

    it('should export Google Docs as plain text', async () => {
      const fileId = 'gdoc123';
      const mockContent = 'Exported Google Doc content.';

      // Mock metadata request for Google Doc
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mimeType: 'application/vnd.google-apps.document',
          name: 'My Document'
        })
      } as Response);

      // Mock export request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContent
      } as Response);

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(mockContent);
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        expect.any(Object)
      );
    });

    it('should export Google Sheets as CSV', async () => {
<<<<<<< HEAD
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
=======
      const fileId = 'gsheet123';
      const mockCsvContent = 'Name,Age,City\nJohn,30,NYC\nJane,25,LA';

      // Mock metadata request for Google Sheet
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mimeType: 'application/vnd.google-apps.spreadsheet',
          name: 'My Spreadsheet'
        })
      } as Response);

      // Mock export request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockCsvContent
      } as Response);

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(mockCsvContent);
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`,
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        expect.any(Object)
      );
    });

<<<<<<< HEAD
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
=======
    it('should export Google Slides as plain text', async () => {
      const fileId = 'gslides123';
      const mockContent = 'Exported presentation content.';

      // Mock metadata request for Google Slides
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mimeType: 'application/vnd.google-apps.presentation',
          name: 'My Presentation'
        })
      } as Response);

      // Mock export request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockContent
      } as Response);

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(mockContent);
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
        expect.any(Object)
      );
    });

    it('should throw error when metadata request fails', async () => {
      const fileId = 'invalid123';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      } as Response);

      await expect(googleDriveService.downloadFile(fileId)).rejects.toThrow(
        'Failed to get file metadata: Not Found'
      );
    });

    it('should throw error when download request fails', async () => {
      const fileId = 'file123';

      // Mock successful metadata request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mimeType: 'text/plain',
          name: 'test.txt'
        })
      } as Response);

      // Mock failed download request
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error'
      } as Response);

      await expect(googleDriveService.downloadFile(fileId)).rejects.toThrow(
        'Failed to download file: Internal Server Error'
      );
    });

    it('should throw error when not authenticated', async () => {
      const unauthenticatedService = new (googleDriveService.constructor as any)();
      
      await expect(unauthenticatedService.downloadFile('file123')).rejects.toThrow(
        'Google Drive not authenticated'
      );
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('searchFiles', () => {
    beforeEach(async () => {
<<<<<<< HEAD
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: { provider_token: mockAccessToken }
        },
        error: null
      });
=======
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      await googleDriveService.initialize();
    });

    it('should search files by name', async () => {
<<<<<<< HEAD
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
=======
      const query = 'report';
      const mockSearchResults = [
        {
          id: 'search1',
          name: 'Monthly Report.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: '25000',
          modifiedTime: '2024-01-01T12:00:00Z',
          webViewLink: 'https://docs.google.com/document/d/search1/view',
          parents: ['root']
        }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: mockSearchResults })
      } as Response);

      const results = await googleDriveService.searchFiles(query);

      expect(results).toEqual(mockSearchResults);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`name contains '${query}' and trashed=false`),
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        expect.any(Object)
      );
    });

<<<<<<< HEAD
    it('should search files with mime type filter', async () => {
      const query = 'document';
      const mimeTypes = ['application/pdf', 'text/plain'];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [] })
      });
=======
    it('should search files with MIME type filter', async () => {
      const query = 'document';
      const mimeTypes = ['application/pdf', 'text/plain'];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] })
      } as Response);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      await googleDriveService.searchFiles(query, mimeTypes);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("mimeType='application/pdf' or mimeType='text/plain'"),
        expect.any(Object)
      );
    });

<<<<<<< HEAD
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
=======
    it('should handle search API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request'
      } as Response);

      await expect(googleDriveService.searchFiles('test')).rejects.toThrow(
        'Failed to search files: Bad Request'
      );
    });

    it('should return empty array when no files found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: undefined })
      } as Response);

      const results = await googleDriveService.searchFiles('nonexistent');

      expect(results).toEqual([]);
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('utility methods', () => {
<<<<<<< HEAD
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
=======
    it('should check authentication status', async () => {
      // Before initialization
      expect(googleDriveService.isAuthenticated()).toBe(false);

      // After successful initialization
      await googleDriveService.initialize();
      expect(googleDriveService.isAuthenticated()).toBe(true);
    });

    it('should return supported MIME types', () => {
      const supportedTypes = googleDriveService.getSupportedMimeTypes();

      expect(supportedTypes).toContain('text/plain');
      expect(supportedTypes).toContain('application/pdf');
      expect(supportedTypes).toContain('application/vnd.google-apps.document');
      expect(supportedTypes).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(supportedTypes).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(supportedTypes).toContain('application/msword');
      expect(supportedTypes).toContain('text/csv');
      expect(supportedTypes).toContain('text/markdown');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await googleDriveService.initialize();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(googleDriveService.listFiles()).rejects.toThrow('Network error');
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      } as Response);

      await expect(googleDriveService.listFiles()).rejects.toThrow('Invalid JSON');
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      } as Response);

      await expect(googleDriveService.listFiles()).rejects.toThrow(
        'Failed to fetch files: Too Many Requests'
      );
    });

    it('should handle quota exceeded errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      } as Response);

      await expect(googleDriveService.downloadFile('file123')).rejects.toThrow(
        'Failed to get file metadata: Forbidden'
      );
    });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  });
});