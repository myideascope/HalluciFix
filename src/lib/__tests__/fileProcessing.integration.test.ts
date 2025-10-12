import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDatabase, cleanupTestDatabase, createTestUserInDatabase, DatabaseTestIsolation } from '../../test/utils/database';
import { server } from '../../test/mocks/server';
import { rest } from 'msw';
import { googleDriveService } from '../googleDrive';
import { parsePDF } from '../pdfParser';
import analysisService from '../analysisService';
import { supabase } from '../supabase';
import { createMockFile } from '../../test/utils/mocks';

describe('File Processing Integration Tests', () => {
  let testIsolation: DatabaseTestIsolation;
  let testUser: any;

  beforeEach(async () => {
    testIsolation = new DatabaseTestIsolation();
    testUser = await testIsolation.createIsolatedUser({
      email: 'file-processing@test.example.com',
      name: 'File Processing Test User'
    });

    // Mock Supabase auth session
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
    await cleanupTestDatabase();
    vi.restoreAllMocks();
  });

  describe('Google Drive to Analysis Pipeline', () => {
    it('should complete full workflow from Google Drive file to analysis result', async () => {
      const mockFileContent = `
        Our revolutionary AI system achieves exactly 99.7% accuracy with zero false positives.
        According to recent studies published by leading researchers, this represents an unprecedented breakthrough.
        All users report perfect satisfaction with our solution.
      `;

      // Mock Google Drive API responses
      server.use(
        // List files
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          return res(ctx.json({
            files: [
              {
                id: 'test-file-123',
                name: 'Research Document.pdf',
                mimeType: 'application/pdf',
                size: '12345',
                modifiedTime: '2024-01-15T10:30:00Z',
                webViewLink: 'https://drive.google.com/file/d/test-file-123/view',
                parents: ['root']
              }
            ]
          }));
        }),
        // Get file metadata
        rest.get('https://www.googleapis.com/drive/v3/files/test-file-123', (req, res, ctx) => {
          const url = new URL(req.url);
          if (url.searchParams.get('fields') === 'mimeType,name') {
            return res(ctx.json({
              mimeType: 'application/pdf',
              name: 'Research Document.pdf'
            }));
          }
          if (url.searchParams.get('alt') === 'media') {
            return res(ctx.text(mockFileContent));
          }
          return res(ctx.status(400));
        }),
        // Analysis API
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.json({
            id: 'gdrive-analysis-123',
            accuracy: 35.8,
            riskLevel: 'critical',
            processingTime: 2150,
            verificationSources: 12,
            hallucinations: [
              {
                text: 'exactly 99.7% accuracy',
                type: 'False Precision',
                confidence: 0.95,
                explanation: 'Suspiciously specific statistic without verifiable source',
                startIndex: 45,
                endIndex: 67
              },
              {
                text: 'zero false positives',
                type: 'Impossible Metric',
                confidence: 0.88,
                explanation: 'Perfect metrics are statistically unlikely',
                startIndex: 73,
                endIndex: 93
              },
              {
                text: 'unprecedented breakthrough',
                type: 'Exaggerated Language',
                confidence: 0.82,
                explanation: 'Hyperbolic language suggesting potential exaggeration',
                startIndex: 150,
                endIndex: 175
              }
            ],
            metadata: {
              contentLength: mockFileContent.length,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      // Initialize Google Drive service
      await googleDriveService.initialize();

      // Step 1: List files from Google Drive
      const files = await googleDriveService.listFiles();
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('Research Document.pdf');

      // Step 2: Download file content
      const fileContent = await googleDriveService.downloadFile('test-file-123');
      expect(fileContent).toContain('99.7% accuracy');
      expect(fileContent).toContain('zero false positives');

      // Step 3: Analyze content
      const { analysis } = await analysisService.analyzeContent(fileContent, testUser.id, {
        sensitivity: 'high',
        includeSourceVerification: true,
        maxHallucinations: 10
      });

      // Verify analysis results
      expect(analysis).toMatchObject({
        user_id: testUser.id,
        accuracy: 35.8,
        riskLevel: 'critical',
        hallucinations: expect.arrayContaining([
          expect.objectContaining({
            text: 'exactly 99.7% accuracy',
            type: 'False Precision'
          }),
          expect.objectContaining({
            text: 'zero false positives',
            type: 'Impossible Metric'
          })
        ]),
        processingTime: 2150,
        verificationSources: 12
      });

      // Step 4: Verify data was stored in database
      const { data: storedAnalysis, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', testUser.id)
        .single();

      expect(error).toBeNull();
      expect(storedAnalysis).toBeDefined();
      expect(storedAnalysis.accuracy).toBe(35.8);
      expect(storedAnalysis.risk_level).toBe('critical');
    });

    it('should handle Google Docs export and analysis', async () => {
      const mockGoogleDocContent = `
        Marketing Report: Q4 Performance
        
        Our platform has achieved remarkable success with exactly 98.5% customer satisfaction.
        Zero complaints have been received in the past quarter.
        According to internal studies, we've seen a 500% increase in user engagement.
      `;

      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files/gdoc-123', (req, res, ctx) => {
          const url = new URL(req.url);
          if (url.searchParams.get('fields') === 'mimeType,name') {
            return res(ctx.json({
              mimeType: 'application/vnd.google-apps.document',
              name: 'Marketing Report'
            }));
          }
          return res(ctx.status(400));
        }),
        rest.get('https://www.googleapis.com/drive/v3/files/gdoc-123/export', (req, res, ctx) => {
          const url = new URL(req.url);
          if (url.searchParams.get('mimeType') === 'text/plain') {
            return res(ctx.text(mockGoogleDocContent));
          }
          return res(ctx.status(400));
        }),
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.json({
            id: 'gdoc-analysis-456',
            accuracy: 42.1,
            riskLevel: 'high',
            processingTime: 1800,
            verificationSources: 8,
            hallucinations: [
              {
                text: 'exactly 98.5% customer satisfaction',
                type: 'False Precision',
                confidence: 0.91,
                explanation: 'Suspiciously precise satisfaction metric',
                startIndex: 60,
                endIndex: 95
              },
              {
                text: 'Zero complaints',
                type: 'Absolute Claim',
                confidence: 0.85,
                explanation: 'Absolute claims are statistically unlikely',
                startIndex: 97,
                endIndex: 111
              }
            ],
            metadata: {
              contentLength: mockGoogleDocContent.length,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      await googleDriveService.initialize();

      // Download Google Doc as plain text
      const content = await googleDriveService.downloadFile('gdoc-123');
      expect(content).toContain('Marketing Report');
      expect(content).toContain('98.5% customer satisfaction');

      // Analyze the content
      const { analysis } = await analysisService.analyzeContent(content, testUser.id);

      expect(analysis.accuracy).toBe(42.1);
      expect(analysis.riskLevel).toBe('high');
      expect(analysis.hallucinations).toHaveLength(2);
    });

    it('should handle batch processing of Google Drive files', async () => {
      const mockFiles = [
        {
          id: 'batch-file-1',
          name: 'Document 1.pdf',
          content: 'Our system achieves exactly 99.1% accuracy with minimal errors.'
        },
        {
          id: 'batch-file-2',
          name: 'Document 2.pdf',
          content: 'This is a normal document with realistic performance claims.'
        },
        {
          id: 'batch-file-3',
          name: 'Document 3.pdf',
          content: 'Revolutionary breakthrough: 1000x improvement guaranteed by our team.'
        }
      ];

      // Mock Google Drive responses for batch files
      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          return res(ctx.json({
            files: mockFiles.map(file => ({
              id: file.id,
              name: file.name,
              mimeType: 'application/pdf',
              size: '10000',
              modifiedTime: '2024-01-15T10:30:00Z',
              webViewLink: `https://drive.google.com/file/d/${file.id}/view`,
              parents: ['root']
            }))
          }));
        }),
        ...mockFiles.map(file =>
          rest.get(`https://www.googleapis.com/drive/v3/files/${file.id}`, (req, res, ctx) => {
            const url = new URL(req.url);
            if (url.searchParams.get('fields') === 'mimeType,name') {
              return res(ctx.json({
                mimeType: 'application/pdf',
                name: file.name
              }));
            }
            if (url.searchParams.get('alt') === 'media') {
              return res(ctx.text(file.content));
            }
            return res(ctx.status(400));
          })
        ),
        rest.post('https://api.hallucifix.com/api/v1/analyze', async (req, res, ctx) => {
          const body = await req.json();
          const content = body.content;
          
          const isSuspicious = content.includes('99.1% accuracy') || 
                              content.includes('1000x improvement') ||
                              content.includes('guaranteed');
          
          return res(ctx.json({
            id: `batch-analysis-${Math.random()}`,
            accuracy: isSuspicious ? Math.random() * 30 + 20 : Math.random() * 20 + 80,
            riskLevel: isSuspicious ? 'critical' : 'low',
            processingTime: Math.random() * 1000 + 500,
            verificationSources: Math.floor(Math.random() * 10) + 5,
            hallucinations: isSuspicious ? [
              {
                text: content.includes('99.1%') ? '99.1% accuracy' : '1000x improvement',
                type: isSuspicious ? 'False Precision' : 'Performance Exaggeration',
                confidence: 0.9,
                explanation: 'Suspicious claim detected',
                startIndex: 20,
                endIndex: 40
              }
            ] : [],
            metadata: {
              contentLength: content.length,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      await googleDriveService.initialize();

      // Get list of files
      const files = await googleDriveService.listFiles();
      expect(files).toHaveLength(3);

      // Process each file
      const batchResults = [];
      for (const file of files) {
        const content = await googleDriveService.downloadFile(file.id);
        const { analysis } = await analysisService.analyzeContent(content, testUser.id);
        analysis.filename = file.name;
        analysis.analysisType = 'batch';
        batchResults.push(analysis);
      }

      expect(batchResults).toHaveLength(3);
      
      // Verify results
      const suspiciousResults = batchResults.filter(r => r.riskLevel === 'critical');
      const normalResults = batchResults.filter(r => r.riskLevel === 'low');
      
      expect(suspiciousResults.length).toBeGreaterThan(0);
      expect(normalResults.length).toBeGreaterThan(0);

      // Verify all results were stored
      const { data: storedResults } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', testUser.id)
        .eq('analysis_type', 'batch');

      expect(storedResults).toHaveLength(3);
    });
  });

  describe('File Upload to Analysis Pipeline', () => {
    it('should process uploaded PDF file through complete pipeline', async () => {
      // Mock FileReader for PDF processing
      global.FileReader = class MockFileReader {
        onload: ((event: any) => void) | null = null;
        onerror: ((event: any) => void) | null = null;
        result: string | ArrayBuffer | null = null;

        readAsArrayBuffer(file: File) {
          setTimeout(() => {
            // Create mock PDF buffer with suspicious content
            const pdfContent = `
              BT
              /F1 12 Tf
              100 700 Td
              (Our AI achieves exactly 99.9% accuracy) Tj
              ET
              BT
              /F1 12 Tf
              100 680 Td
              (with zero false positives guaranteed) Tj
              ET
            `;
            
            const pdfSignature = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
            const mockContent = new TextEncoder().encode(pdfContent);
            
            const buffer = new ArrayBuffer(pdfSignature.length + mockContent.length);
            const view = new Uint8Array(buffer);
            view.set(pdfSignature, 0);
            view.set(mockContent, pdfSignature.length);
            
            this.result = buffer;
            this.onload?.({ target: this });
          }, 10);
        }
      } as any;

      // Mock analysis API
      server.use(
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.json({
            id: 'upload-analysis-789',
            accuracy: 28.5,
            riskLevel: 'critical',
            processingTime: 1950,
            verificationSources: 15,
            hallucinations: [
              {
                text: 'exactly 99.9% accuracy',
                type: 'False Precision',
                confidence: 0.96,
                explanation: 'Unrealistic precision claim',
                startIndex: 15,
                endIndex: 37
              },
              {
                text: 'zero false positives guaranteed',
                type: 'Impossible Metric',
                confidence: 0.92,
                explanation: 'Perfect metrics with guarantee are unrealistic',
                startIndex: 43,
                endIndex: 74
              }
            ],
            metadata: {
              contentLength: 200,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      // Create mock uploaded file
      const uploadedFile = createMockFile('uploaded-research.pdf', 'content', 'application/pdf');

      // Step 1: Parse PDF
      const extractedText = await parsePDF(uploadedFile);
      expect(extractedText).toContain('99.9% accuracy');
      expect(extractedText).toContain('zero false positives');

      // Step 2: Analyze content
      const { analysis } = await analysisService.analyzeContent(extractedText, testUser.id, {
        sensitivity: 'high',
        includeSourceVerification: true
      });

      // Verify analysis
      expect(analysis).toMatchObject({
        user_id: testUser.id,
        accuracy: 28.5,
        riskLevel: 'critical',
        hallucinations: expect.arrayContaining([
          expect.objectContaining({
            text: 'exactly 99.9% accuracy',
            type: 'False Precision'
          })
        ])
      });

      // Step 3: Verify database storage
      const { data: storedAnalysis } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', testUser.id)
        .single();

      expect(storedAnalysis.accuracy).toBe(28.5);
      expect(storedAnalysis.risk_level).toBe('critical');
    });

    it('should handle text file upload and analysis', async () => {
      global.FileReader = class MockFileReader {
        onload: ((event: any) => void) | null = null;
        onerror: ((event: any) => void) | null = null;
        result: string | null = null;

        readAsText(file: File) {
          setTimeout(() => {
            this.result = `
              Technical Report: System Performance Analysis
              
              Our new algorithm demonstrates exactly 97.3% efficiency improvement.
              According to comprehensive testing, zero system failures occurred.
              All benchmark tests show unprecedented performance gains.
            `;
            this.onload?.({ target: this });
          }, 10);
        }
      } as any;

      server.use(
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.json({
            id: 'text-analysis-101',
            accuracy: 38.7,
            riskLevel: 'high',
            processingTime: 1200,
            verificationSources: 9,
            hallucinations: [
              {
                text: 'exactly 97.3% efficiency improvement',
                type: 'False Precision',
                confidence: 0.89,
                explanation: 'Suspiciously precise improvement metric',
                startIndex: 80,
                endIndex: 116
              },
              {
                text: 'zero system failures',
                type: 'Absolute Claim',
                confidence: 0.87,
                explanation: 'Absolute reliability claims are unrealistic',
                startIndex: 150,
                endIndex: 170
              }
            ],
            metadata: {
              contentLength: 300,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      const textFile = createMockFile('technical-report.txt', 'content', 'text/plain');

      // Read text file content
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(textFile);
      });

      expect(content).toContain('97.3% efficiency improvement');

      // Analyze content
      const { analysis } = await analysisService.analyzeContent(content, testUser.id);

      expect(analysis.accuracy).toBe(38.7);
      expect(analysis.riskLevel).toBe('high');
      expect(analysis.hallucinations).toHaveLength(2);
    });
  });

  describe('Error Handling in File Processing Pipeline', () => {
    it('should handle Google Drive API errors gracefully', async () => {
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

      await googleDriveService.initialize();

      await expect(googleDriveService.listFiles()).rejects.toThrow('Failed to fetch files');
    });

    it('should handle PDF parsing errors in pipeline', async () => {
      global.FileReader = class MockFileReader {
        onload: ((event: any) => void) | null = null;
        onerror: ((event: any) => void) | null = null;

        readAsArrayBuffer(file: File) {
          setTimeout(() => {
            this.onerror?.({ target: this });
          }, 10);
        }
      } as any;

      const corruptedFile = createMockFile('corrupted.pdf', 'content', 'application/pdf');

      await expect(parsePDF(corruptedFile)).rejects.toThrow();
    });

    it('should handle analysis service errors in pipeline', async () => {
      server.use(
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.status(500), ctx.json({
            error: 'Internal server error'
          }));
        })
      );

      const content = 'Test content for analysis error handling';

      // Should fall back to mock analysis
      const { analysis } = await analysisService.analyzeContent(content, testUser.id);

      expect(analysis).toBeDefined();
      expect(analysis.user_id).toBe(testUser.id);
      // Mock analysis should still work
    });

    it('should handle database storage errors in pipeline', async () => {
      server.use(
        rest.post('*/analysis_results', (req, res, ctx) => {
          return res(ctx.status(500), ctx.json({
            error: 'Database connection failed'
          }));
        }),
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.json({
            id: 'db-error-analysis',
            accuracy: 75.0,
            riskLevel: 'medium',
            processingTime: 1000,
            verificationSources: 5,
            hallucinations: [],
            metadata: {
              contentLength: 100,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      const content = 'Test content for database error handling';

      // Analysis should complete despite database error
      const { analysis } = await analysisService.analyzeContent(content, testUser.id);

      expect(analysis).toBeDefined();
      expect(analysis.accuracy).toBe(75.0);
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle concurrent file processing efficiently', async () => {
      const files = Array.from({ length: 5 }, (_, i) => ({
        id: `concurrent-${i}`,
        name: `Document ${i}.pdf`,
        content: `Test content ${i} with some analysis material.`
      }));

      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files', (req, res, ctx) => {
          return res(ctx.json({
            files: files.map(file => ({
              id: file.id,
              name: file.name,
              mimeType: 'application/pdf',
              size: '5000',
              modifiedTime: '2024-01-15T10:30:00Z',
              webViewLink: `https://drive.google.com/file/d/${file.id}/view`,
              parents: ['root']
            }))
          }));
        }),
        ...files.map(file =>
          rest.get(`https://www.googleapis.com/drive/v3/files/${file.id}`, (req, res, ctx) => {
            const url = new URL(req.url);
            if (url.searchParams.get('alt') === 'media') {
              return res(ctx.text(file.content));
            }
            return res(ctx.json({ mimeType: 'application/pdf', name: file.name }));
          })
        ),
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.json({
            id: `concurrent-analysis-${Math.random()}`,
            accuracy: 80 + Math.random() * 15,
            riskLevel: 'low',
            processingTime: 500 + Math.random() * 500,
            verificationSources: 5,
            hallucinations: [],
            metadata: {
              contentLength: 100,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      await googleDriveService.initialize();

      const driveFiles = await googleDriveService.listFiles();
      
      const startTime = Date.now();
      
      // Process files concurrently
      const promises = driveFiles.map(async (file) => {
        const content = await googleDriveService.downloadFile(file.id);
        const { analysis } = await analysisService.analyzeContent(content, testUser.id);
        return analysis;
      });

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(5);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds

      results.forEach(result => {
        expect(result.user_id).toBe(testUser.id);
        expect(result.accuracy).toBeGreaterThan(0);
      });
    });

    it('should optimize memory usage during large file processing', async () => {
      const largeContent = 'Large file content. '.repeat(50000); // ~1MB content

      server.use(
        rest.get('https://www.googleapis.com/drive/v3/files/large-file', (req, res, ctx) => {
          const url = new URL(req.url);
          if (url.searchParams.get('alt') === 'media') {
            return res(ctx.text(largeContent));
          }
          return res(ctx.json({ mimeType: 'application/pdf', name: 'Large File.pdf' }));
        }),
        rest.post('https://api.hallucifix.com/api/v1/analyze', (req, res, ctx) => {
          return res(ctx.json({
            id: 'large-file-analysis',
            accuracy: 85.0,
            riskLevel: 'low',
            processingTime: 3000,
            verificationSources: 8,
            hallucinations: [],
            metadata: {
              contentLength: largeContent.length,
              timestamp: new Date().toISOString(),
              modelVersion: '1.0.0'
            }
          }));
        })
      );

      await googleDriveService.initialize();

      const initialMemory = process.memoryUsage().heapUsed;
      
      const content = await googleDriveService.downloadFile('large-file');
      const { analysis } = await analysisService.analyzeContent(content, testUser.id);
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(analysis).toBeDefined();
      expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024); // Less than 200MB increase
    });
  });
});