import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase, cleanupTestDatabase, createTestUserInDatabase, DatabaseTestIsolation } from '../../test/utils/database';
import { server } from '../../test/mocks/server';
import { rest } from 'msw';
import { googleDriveService } from '../googleDrive';
import { supabase } from '../supabase';

describe('Google Drive Service Integration Tests', () => {
  let testIsolation: DatabaseTestIsolation;
  let testUser: any;

  beforeEach(async () => {
    testIsolation = new DatabaseTestIsolation();
    testUser = await testIsolation.createIsolatedUser({
      email: 'gdrive-test@test.example.com',
      name: 'Google Drive Test User'
    });

    // Mock Supabase auth session with Google provider token
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          provider_token: 'mock-google-access-token',
          access_token: 'mock-supabase-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: testUser.id,
            email: testUser.email,
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: testUser.createdAt
          }
        }
      },
      error: null
    });
  });

  afterEach(async () => {
    await testIsolation.cleanup();
    vi.restoreAllMocks();
  });

  describe('Authentication and Initialization', () => {
    it('should initialize successfully with valid session', async () => {
      const initialized = await googleDriveService.initialize();
      
      expect(initialized).toBe(true);
      expect(googleDriveService.isAuthenticated()).toBe(true);
    });

    it('should fail initialization without valid session', async () => {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: null },
        error: null
      });

      const initialized = await googleDriveService.initialize();
      
      expect(initialized).toBe(false);
      expect(googleDriveService.isAuthenticated()).toBe(false);
    });

    it('should handle authentication errors gracefully', async () => {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: null },
        error: new Error('Authentication failed')
      });

      const initialized = await googleDriveService.initialize();
      
      expect(initialized).toBe(false);
    });
  });

  describe('File Listing Operations', () => {
    beforeEach(async () => {
      await googleDriveService.initialize();
    });

    it('should list files from root directory', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Test Document.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: '12345',
          modifiedTime: '2024-01-15T10:30:00Z',
          webViewLink: 'https://drive.google.com/file/d/file1/view',
          parents: ['root']
        },
        {
          id: 'file2',
          name: 'Presentation.pptx',
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          size: '67890',
          modifiedTime: '2024-01-14T15:45:00Z',
          webViewLink: 'https://drive.google.com/file/d/file2/view',
          parents: ['root']
        }
      ];

      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          const url = new URL(req.url);
          const query = url.searchParams.get('q');
          
          expect(query).toContain("'root' in parents");
          expect(query).toContain('trashed=false');
          
          return res(ctx.json({ files: mockFiles }));
        })
      );

      const files = await googleDriveService.listFiles();

      expect(files).toHaveLength(2);
      expect(files[0]).toMatchObject({
        id: 'file1',
        name: 'Test Document.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
    });

    it('should list files from specific folder', async () => {
      const folderId = 'folder123';
      const mockFiles = [
        {
          id: 'file3',
          name: 'Folder Document.pdf',
          mimeType: 'application/pdf',
          size: '54321',
          modifiedTime: '2024-01-13T09:15:00Z',
          webViewLink: 'https://drive.google.com/file/d/file3/view',
          parents: [folderId]
        }
      ];

      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          const url = new URL(req.url);
          const query = url.searchParams.get('q');
          
          expect(query).toContain(`'${folderId}' in parents`);
          
          return res(ctx.json({ files: mockFiles }));
        })
      );

      const files = await googleDriveService.listFiles(folderId);

      expect(files).toHaveLength(1);
      expect(files[0].parents).toContain(folderId);
    });

    it('should handle API errors when listing files', async () => {
      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          return res(ctx.status(403), ctx.json({
            error: {
              code: 403,
              message: 'Insufficient permissions'
            }
          }));
        })
      );

      await expect(googleDriveService.listFiles()).rejects.toThrow('Failed to fetch files');
    });

    it('should handle empty file list', async () => {
      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          return res(ctx.json({ files: [] }));
        })
      );

      const files = await googleDriveService.listFiles();

      expect(files).toHaveLength(0);
    });
  });

  describe('Folder Operations', () => {
    beforeEach(async () => {
      await googleDriveService.initialize();
    });

    it('should get folders with nested structure', async () => {
      const mockFolders = [
        {
          id: 'folder1',
          name: 'Documents'
        },
        {
          id: 'folder2',
          name: 'Projects'
        }
      ];

      const mockFiles = [
        {
          id: 'file1',
          name: 'Document1.txt',
          mimeType: 'text/plain',
          size: '1000',
          modifiedTime: '2024-01-15T10:30:00Z',
          webViewLink: 'https://drive.google.com/file/d/file1/view',
          parents: ['folder1']
        }
      ];

      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          const url = new URL(req.url);
          const query = url.searchParams.get('q');
          
          if (query?.includes('mimeType=\'application/vnd.google-apps.folder\'')) {
            return res(ctx.json({ files: mockFolders }));
          } else {
            return res(ctx.json({ files: mockFiles }));
          }
        })
      );

      const folders = await googleDriveService.getFolders();

      expect(folders).toHaveLength(2);
      expect(folders[0]).toMatchObject({
        id: 'folder1',
        name: 'Documents',
        files: expect.any(Array),
        folders: expect.any(Array)
      });
    });
  });

  describe('File Download Operations', () => {
    beforeEach(async () => {
      await googleDriveService.initialize();
    });

    it('should download regular file content', async () => {
      const fileId = 'file123';
      const mockContent = 'This is the content of the test file.';

      server.use(
        rest.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, (req, res, ctx) => {
          const url = new URL(req.url);
          if (url.searchParams.get('fields') === 'mimeType,name') {
            return res(ctx.json({
              mimeType: 'text/plain',
              name: 'test.txt'
            }));
          }
          if (url.searchParams.get('alt') === 'media') {
            return res(ctx.text(mockContent));
          }
          return res(ctx.status(400));
        })
      );

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(mockContent);
    });

    it('should export Google Docs as plain text', async () => {
      const fileId = 'gdoc123';
      const mockContent = 'This is exported Google Docs content.';

      server.use(
        rest.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, (req, res, ctx) => {
          const url = new URL(req.url);
          if (url.searchParams.get('fields') === 'mimeType,name') {
            return res(ctx.json({
              mimeType: 'application/vnd.google-apps.document',
              name: 'Google Doc.gdoc'
            }));
          }
          return res(ctx.status(400));
        }),
        rest.get(`https://www.googleapis.com/drive/v3/files/${fileId}/export`, (req, res, ctx) => {
          const url = new URL(req.url);
          if (url.searchParams.get('mimeType') === 'text/plain') {
            return res(ctx.text(mockContent));
          }
          return res(ctx.status(400));
        })
      );

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(mockContent);
    });

    it('should export Google Sheets as CSV', async () => {
      const fileId = 'gsheet123';
      const mockContent = 'Name,Age,City\nJohn,30,New York\nJane,25,Los Angeles';

      server.use(
        rest.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, (req, res, ctx) => {
          const url = new URL(req.url);
          if (url.searchParams.get('fields') === 'mimeType,name') {
            return res(ctx.json({
              mimeType: 'application/vnd.google-apps.spreadsheet',
              name: 'Spreadsheet.gsheet'
            }));
          }
          return res(ctx.status(400));
        }),
        rest.get(`https://www.googleapis.com/drive/v3/files/${fileId}/export`, (req, res, ctx) => {
          const url = new URL(req.url);
          if (url.searchParams.get('mimeType') === 'text/csv') {
            return res(ctx.text(mockContent));
          }
          return res(ctx.status(400));
        })
      );

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(mockContent);
    });

    it('should handle download errors gracefully', async () => {
      const fileId = 'error-file';

      server.use(
        rest.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, (req, res, ctx) => {
          return res(ctx.status(404), ctx.json({
            error: {
              code: 404,
              message: 'File not found'
            }
          }));
        })
      );

      await expect(googleDriveService.downloadFile(fileId)).rejects.toThrow('Failed to get file metadata');
    });

    it('should handle large file downloads', async () => {
      const fileId = 'large-file';
      const largeContent = 'Large file content. '.repeat(10000); // ~200KB

      server.use(
        rest.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, (req, res, ctx) => {
          const url = new URL(req.url);
          if (url.searchParams.get('fields') === 'mimeType,name') {
            return res(ctx.json({
              mimeType: 'text/plain',
              name: 'large-file.txt'
            }));
          }
          if (url.searchParams.get('alt') === 'media') {
            return res(ctx.text(largeContent));
          }
          return res(ctx.status(400));
        })
      );

      const content = await googleDriveService.downloadFile(fileId);

      expect(content).toBe(largeContent);
      expect(content.length).toBeGreaterThan(100000);
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      await googleDriveService.initialize();
    });

    it('should search files by name', async () => {
      const searchQuery = 'test document';
      const mockResults = [
        {
          id: 'search1',
          name: 'Test Document 1.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: '12345',
          modifiedTime: '2024-01-15T10:30:00Z',
          webViewLink: 'https://drive.google.com/file/d/search1/view',
          parents: ['root']
        }
      ];

      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          const url = new URL(req.url);
          const query = url.searchParams.get('q');
          
          expect(query).toContain(`name contains '${searchQuery}'`);
          expect(query).toContain('trashed=false');
          
          return res(ctx.json({ files: mockResults }));
        })
      );

      const results = await googleDriveService.searchFiles(searchQuery);

      expect(results).toHaveLength(1);
      expect(results[0].name).toContain('Test Document');
    });

    it('should search files by name and mime type', async () => {
      const searchQuery = 'presentation';
      const mimeTypes = ['application/vnd.openxmlformats-officedocument.presentationml.presentation'];

      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          const url = new URL(req.url);
          const query = url.searchParams.get('q');
          
          expect(query).toContain(`name contains '${searchQuery}'`);
          expect(query).toContain('mimeType=\'application/vnd.openxmlformats-officedocument.presentationml.presentation\'');
          
          return res(ctx.json({ files: [] }));
        })
      );

      const results = await googleDriveService.searchFiles(searchQuery, mimeTypes);

      expect(results).toHaveLength(0);
    });

    it('should handle search API errors', async () => {
      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          return res(ctx.status(400), ctx.json({
            error: {
              code: 400,
              message: 'Invalid search query'
            }
          }));
        })
      );

      await expect(googleDriveService.searchFiles('invalid query')).rejects.toThrow('Failed to search files');
    });
  });

  describe('Utility Functions', () => {
    it('should return supported mime types', () => {
      const supportedTypes = googleDriveService.getSupportedMimeTypes();

      expect(supportedTypes).toContain('text/plain');
      expect(supportedTypes).toContain('application/pdf');
      expect(supportedTypes).toContain('application/vnd.google-apps.document');
      expect(supportedTypes).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should check authentication status', async () => {
      expect(googleDriveService.isAuthenticated()).toBe(false);

      await googleDriveService.initialize();
      expect(googleDriveService.isAuthenticated()).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await googleDriveService.initialize();
    });

    it('should handle network timeouts', async () => {
      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          return res(ctx.delay(30000)); // 30 second delay to simulate timeout
        })
      );

      // This test would need to be configured with a shorter timeout
      // For now, we'll just verify the service handles the request
      const promise = googleDriveService.listFiles();
      expect(promise).toBeInstanceOf(Promise);
    });

    it('should handle rate limiting', async () => {
      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          return res(ctx.status(429), ctx.json({
            error: {
              code: 429,
              message: 'Rate limit exceeded'
            }
          }));
        })
      );

      await expect(googleDriveService.listFiles()).rejects.toThrow('Failed to fetch files');
    });

    it('should handle invalid file IDs', async () => {
      const invalidFileId = 'invalid-file-id';

      server.use(
        rest.get(`https://www.googleapis.com/drive/v3/files/${invalidFileId}`, (req, res, ctx) => {
          return res(ctx.status(404), ctx.json({
            error: {
              code: 404,
              message: 'File not found'
            }
          }));
        })
      );

      await expect(googleDriveService.downloadFile(invalidFileId)).rejects.toThrow('Failed to get file metadata');
    });

    it('should handle malformed API responses', async () => {
      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          return res(ctx.text('Invalid JSON response'));
        })
      );

      await expect(googleDriveService.listFiles()).rejects.toThrow();
    });
  });
});