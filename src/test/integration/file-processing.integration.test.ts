import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  setupTestDatabase, 
  cleanupTestDatabase, 
  seedMinimalTestData,
  testDataScenarios,
  getTestDatabase 
} from '../utils/database';
import { 
  parsePDF, 
  parsePDFAdvanced, 
  isPDFFile, 
  validatePDFFile, 
  getPDFInfo,
  PDFParsingError 
} from '../../lib/pdfParser';
import { googleDriveService } from '../../lib/googleDrive';
import analysisService from '../../lib/analysisService';

describe('File Processing Integration Tests', () => {
  let testData: any;
  
  beforeEach(async () => {
    await setupTestDatabase();
    testData = await seedMinimalTestData();
  });
  
  afterEach(async () => {
    await cleanupTestDatabase();
  });

  describe('PDF File Processing', () => {
    // Helper function to create mock PDF file
    const createMockPDFFile = (content: string, filename: string = 'test.pdf'): File => {
      // Create a minimal PDF structure with the content
      const pdfHeader = '%PDF-1.4\n';
      const pdfContent = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length ${content.length + 20} >>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(${content}) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000206 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${300 + content.length}\n%%EOF`;
      
      const pdfBlob = new Blob([pdfHeader + pdfContent], { type: 'application/pdf' });
      return new File([pdfBlob], filename, { type: 'application/pdf' });
    };

    const createMockTextFile = (content: string, filename: string = 'test.txt'): File => {
      const blob = new Blob([content], { type: 'text/plain' });
      return new File([blob], filename, { type: 'text/plain' });
    };

    it('should validate PDF files correctly', async () => {
      const validPDF = createMockPDFFile('Test PDF content');
      const textFile = createMockTextFile('Not a PDF');
      const emptyFile = new File([], 'empty.pdf', { type: 'application/pdf' });

      // Test valid PDF
      expect(isPDFFile(validPDF)).toBe(true);
      const validResult = validatePDFFile(validPDF);
      expect(validResult.valid).toBe(true);
      expect(validResult.error).toBeUndefined();

      // Test invalid file type
      expect(isPDFFile(textFile)).toBe(false);
      const invalidResult = validatePDFFile(textFile);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain('not a valid PDF');

      // Test empty file
      const emptyResult = validatePDFFile(emptyFile);
      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.error).toContain('empty');
    });

    it('should extract text from PDF files', async () => {
      const testContent = 'This is test content for PDF extraction testing.';
      const pdfFile = createMockPDFFile(testContent);

      const extractedText = await parsePDF(pdfFile);
      
      expect(extractedText).toBeDefined();
      expect(typeof extractedText).toBe('string');
      expect(extractedText.length).toBeGreaterThan(0);
      
      // The extracted text should contain some meaningful content
      // (might not be exact due to PDF parsing complexities)
      expect(extractedText.toLowerCase()).toMatch(/test|content|pdf|extraction/);
    });

    it('should provide detailed PDF parsing results', async () => {
      const testContent = 'Detailed PDF parsing test with comprehensive analysis.';
      const pdfFile = createMockPDFFile(testContent, 'detailed-test.pdf');

      const result = await parsePDFAdvanced(pdfFile);
      
      expect(result).toMatchObject({
        text: expect.any(String),
        metadata: {
          pageCount: expect.any(Number),
          fileSize: expect.any(Number),
          processingTime: expect.any(Number)
        },
        pages: expect.any(Array),
        warnings: expect.any(Array),
        errors: expect.any(Array)
      });

      expect(result.metadata.fileSize).toBe(pdfFile.size);
      expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.pages.length).toBeGreaterThan(0);
    });

    it('should handle PDF parsing errors gracefully', async () => {
      // Create a corrupted PDF file
      const corruptedPDF = new File(['Not a real PDF content'], 'corrupted.pdf', { 
        type: 'application/pdf' 
      });

      await expect(parsePDF(corruptedPDF)).rejects.toThrow(PDFParsingError);
      
      try {
        await parsePDF(corruptedPDF);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFParsingError);
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });

    it('should get PDF file information without full parsing', async () => {
      const pdfFile = createMockPDFFile('Test content for info extraction');
      
      const info = await getPDFInfo(pdfFile);
      
      expect(info).toMatchObject({
        name: pdfFile.name,
        size: pdfFile.size,
        sizeFormatted: expect.stringMatching(/\d+\.\d+ MB/),
        type: pdfFile.type,
        lastModified: expect.any(String),
        isValid: true,
        estimatedPages: expect.any(Number)
      });
    });

    it('should handle large PDF files appropriately', async () => {
      // Create a large content string (simulate large PDF)
      const largeContent = 'Large PDF content. '.repeat(10000); // ~200KB of text
      const largePDF = createMockPDFFile(largeContent, 'large-document.pdf');

      const result = await parsePDFAdvanced(largePDF, {
        maxPages: 100,
        timeout: 15000
      });

      expect(result.text).toBeDefined();
      expect(result.metadata.fileSize).toBe(largePDF.size);
      expect(result.metadata.processingTime).toBeLessThan(15000);
    });

    it('should handle PDF parsing with different options', async () => {
      const pdfFile = createMockPDFFile('Test content with various parsing options');

      // Test with different parsing options
      const basicResult = await parsePDFAdvanced(pdfFile, {
        preserveFormatting: false,
        extractImages: false
      });

      const advancedResult = await parsePDFAdvanced(pdfFile, {
        preserveFormatting: true,
        extractImages: true,
        fallbackToOCR: true,
        maxPages: 50,
        timeout: 10000
      });

      expect(basicResult.text).toBeDefined();
      expect(advancedResult.text).toBeDefined();
      
      // Advanced options might produce different results
      expect(advancedResult.warnings.length).toBeGreaterThanOrEqual(basicResult.warnings.length);
    });
  });

  describe('Text File Processing', () => {
    it('should process plain text files correctly', async () => {
      const textContent = 'This is a plain text file with some content for testing.';
      const textFile = createMockTextFile(textContent, 'test-document.txt');

      // Simulate file reading
      const fileContent = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(textFile);
      });

      expect(fileContent).toBe(textContent);
      
      // Test analysis of text content
      const { analysis } = await analysisService.analyzeContent(
        fileContent,
        testData.user.id,
        { enableRAG: false }
      );

      expect(analysis).toBeDefined();
      expect(analysis.fullContent).toBe(textContent);
      expect(analysis.user_id).toBe(testData.user.id);
    });

    it('should handle different text encodings', async () => {
      const unicodeContent = 'Text with unicode: café, naïve, résumé, 中文, 日本語';
      const unicodeFile = createMockTextFile(unicodeContent, 'unicode-test.txt');

      const fileContent = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(unicodeFile, 'UTF-8');
      });

      expect(fileContent).toBe(unicodeContent);
      expect(fileContent).toContain('café');
      expect(fileContent).toContain('中文');
    });

    it('should handle large text files', async () => {
      const largeContent = 'Large text content. '.repeat(50000); // ~1MB of text
      const largeFile = createMockTextFile(largeContent, 'large-text.txt');

      const startTime = Date.now();
      const fileContent = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(largeFile);
      });
      const processingTime = Date.now() - startTime;

      expect(fileContent).toBe(largeContent);
      expect(processingTime).toBeLessThan(5000); // Should process within 5 seconds
    });
  });

  describe('Batch File Processing', () => {
    it('should process multiple files in batch correctly', async () => {
      const files = [
        createMockTextFile('First document content with some claims.', 'doc1.txt'),
        createMockTextFile('Second document with different content and assertions.', 'doc2.txt'),
        createMockPDFFile('Third document in PDF format with various statements.', 'doc3.pdf')
      ];

      const documents = [];
      
      // Process each file to extract content
      for (const file of files) {
        let content = '';
        
        if (isPDFFile(file)) {
          content = await parsePDF(file);
        } else {
          content = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsText(file);
          });
        }
        
        documents.push({
          id: `doc-${Date.now()}-${Math.random()}`,
          content,
          filename: file.name
        });
      }

      // Perform batch analysis
      const results = await analysisService.analyzeBatch(
        documents,
        testData.user.id,
        { sensitivity: 'medium', enableRAG: false }
      );

      expect(results).toHaveLength(3);
      
      results.forEach((result, index) => {
        expect(result.analysis).toMatchObject({
          user_id: testData.user.id,
          analysisType: 'batch',
          filename: files[index].name
        });
        
        expect(result.analysis.accuracy).toBeGreaterThanOrEqual(0);
        expect(result.analysis.accuracy).toBeLessThanOrEqual(100);
      });
    });

    it('should handle batch processing errors gracefully', async () => {
      const files = [
        createMockTextFile('Valid document content.', 'valid.txt'),
        new File([''], 'empty.txt', { type: 'text/plain' }), // Empty file
        createMockTextFile('Another valid document.', 'valid2.txt')
      ];

      const documents = [];
      
      for (const file of files) {
        try {
          let content = '';
          
          if (file.size === 0) {
            throw new Error('Empty file');
          }
          
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
          });
          
          documents.push({
            id: `doc-${Date.now()}-${Math.random()}`,
            content,
            filename: file.name
          });
        } catch (error) {
          console.warn(`Skipping file ${file.name}: ${error.message}`);
        }
      }

      // Should only process valid files
      expect(documents).toHaveLength(2);
      
      const results = await analysisService.analyzeBatch(
        documents,
        testData.user.id
      );

      expect(results).toHaveLength(2);
    });

    it('should maintain performance with concurrent file processing', async () => {
      const fileCount = 10;
      const files = Array.from({ length: fileCount }, (_, index) => 
        createMockTextFile(
          `Document ${index + 1} content with various claims and statements for testing.`,
          `concurrent-doc-${index + 1}.txt`
        )
      );

      const startTime = Date.now();
      
      // Process files concurrently
      const contentPromises = files.map(async (file) => {
        const content = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsText(file);
        });
        
        return {
          id: `doc-${Date.now()}-${Math.random()}`,
          content,
          filename: file.name
        };
      });

      const documents = await Promise.all(contentPromises);
      const processingTime = Date.now() - startTime;

      expect(documents).toHaveLength(fileCount);
      expect(processingTime).toBeLessThan(2000); // Should complete within 2 seconds
      
      // Verify all documents have content
      documents.forEach(doc => {
        expect(doc.content).toBeDefined();
        expect(doc.content.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Google Drive File Integration', () => {
    beforeEach(() => {
      // Mock Google Drive API responses
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('googleapis.com/drive/v3/files')) {
          if (url.includes('alt=media') || url.includes('export')) {
            // Mock file download
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve('Mock Google Drive file content for integration testing')
            });
          } else if (url.includes('fields=mimeType')) {
            // Mock file metadata
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                name: 'Google Drive Test Document.docx'
              })
            });
          } else {
            // Mock file listing
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                files: [
                  {
                    id: 'gdrive-file-1',
                    name: 'Integration Test Document.docx',
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    size: '25600',
                    modifiedTime: '2024-01-15T10:30:00Z',
                    webViewLink: 'https://docs.google.com/document/d/gdrive-file-1/edit'
                  },
                  {
                    id: 'gdrive-file-2',
                    name: 'Test PDF Document.pdf',
                    mimeType: 'application/pdf',
                    size: '51200',
                    modifiedTime: '2024-01-14T15:45:00Z',
                    webViewLink: 'https://drive.google.com/file/d/gdrive-file-2/view'
                  }
                ]
              })
            });
          }
        }
        
        return Promise.resolve({
          ok: false,
          statusText: 'Not Found'
        });
      });
    });

    it('should download and process Google Drive files', async () => {
      // Mock authentication
      googleDriveService['accessToken'] = 'mock-access-token';
      
      // List files
      const files = await googleDriveService.listFiles();
      expect(files).toHaveLength(2);
      
      // Download and process first file
      const fileContent = await googleDriveService.downloadFile('gdrive-file-1');
      expect(fileContent).toBe('Mock Google Drive file content for integration testing');
      
      // Analyze the downloaded content
      const { analysis } = await analysisService.analyzeContent(
        fileContent,
        testData.user.id,
        { enableRAG: false }
      );
      
      expect(analysis).toBeDefined();
      expect(analysis.fullContent).toBe(fileContent);
      expect(analysis.user_id).toBe(testData.user.id);
      
      // Store in database
      const db = getTestDatabase();
      const { data: storedAnalysis, error } = await db
        .from('analysis_results')
        .insert({
          id: analysis.id,
          user_id: analysis.user_id,
          content: analysis.content,
          accuracy: analysis.accuracy,
          risk_level: analysis.riskLevel,
          hallucinations: analysis.hallucinations,
          verification_sources: analysis.verificationSources,
          processing_time: analysis.processingTime,
          created_at: analysis.timestamp,
          analysis_type: 'google_drive',
          filename: 'Integration Test Document.docx',
          full_content: analysis.fullContent
        })
        .select()
        .single();
      
      expect(error).toBeNull();
      expect(storedAnalysis).toBeDefined();
    });

    it('should handle different Google Drive file types', async () => {
      googleDriveService['accessToken'] = 'mock-access-token';
      
      // Mock different file type responses
      const fileTypes = [
        {
          id: 'gdocs-file',
          mimeType: 'application/vnd.google-apps.document',
          content: 'Google Docs content'
        },
        {
          id: 'gsheets-file',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          content: 'Google Sheets content'
        },
        {
          id: 'gslides-file',
          mimeType: 'application/vnd.google-apps.presentation',
          content: 'Google Slides content'
        }
      ];

      for (const fileType of fileTypes) {
        // Mock specific responses for each file type
        global.fetch = vi.fn().mockImplementation((url: string) => {
          if (url.includes(`files/${fileType.id}`) && url.includes('fields=mimeType')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                mimeType: fileType.mimeType,
                name: `Test ${fileType.id}`
              })
            });
          } else if (url.includes(`files/${fileType.id}`) && url.includes('export')) {
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve(fileType.content)
            });
          }
          return Promise.resolve({ ok: false });
        });

        const content = await googleDriveService.downloadFile(fileType.id);
        expect(content).toBe(fileType.content);
      }
    });

    it('should handle Google Drive batch processing', async () => {
      googleDriveService['accessToken'] = 'mock-access-token';
      
      const files = await googleDriveService.listFiles();
      const documents = [];
      
      // Download all files
      for (const file of files) {
        const content = await googleDriveService.downloadFile(file.id);
        documents.push({
          id: file.id,
          content,
          filename: file.name
        });
      }
      
      // Perform batch analysis
      const results = await analysisService.analyzeBatch(
        documents,
        testData.user.id,
        { enableRAG: false }
      );
      
      expect(results).toHaveLength(2);
      
      results.forEach((result, index) => {
        expect(result.analysis.analysisType).toBe('batch');
        expect(result.analysis.filename).toBe(files[index].name);
        expect(result.analysis.user_id).toBe(testData.user.id);
      });
    });

    it('should handle Google Drive API errors during file processing', async () => {
      googleDriveService['accessToken'] = 'mock-access-token';
      
      // Mock API error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({
          error: {
            code: 403,
            message: 'Insufficient permissions'
          }
        })
      });
      
      await expect(googleDriveService.listFiles()).rejects.toThrow('Failed to fetch files: Forbidden');
      await expect(googleDriveService.downloadFile('test-file')).rejects.toThrow('Failed to download file: Forbidden');
    });
  });

  describe('File Processing Error Handling', () => {
    it('should handle file reading errors gracefully', async () => {
      // Create a file that will cause reading errors
      const problematicFile = new File([''], 'problematic.txt', { type: 'text/plain' });
      
      // Mock FileReader error
      const originalFileReader = global.FileReader;
      global.FileReader = vi.fn().mockImplementation(() => ({
        readAsText: vi.fn().mockImplementation(function() {
          setTimeout(() => {
            if (this.onerror) {
              this.onerror(new Error('Simulated file reading error'));
            }
          }, 10);
        }),
        onerror: null,
        onload: null
      }));

      try {
        await new Promise<string>((resolve, reject) => {
          const reader = new (global.FileReader as any)();
          reader.onload = (e: any) => resolve(e.target?.result as string);
          reader.onerror = (error: any) => reject(error);
          reader.readAsText(problematicFile);
        });
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        global.FileReader = originalFileReader;
      }
    });

    it('should handle unsupported file types', async () => {
      const unsupportedFile = new File(['binary data'], 'image.jpg', { type: 'image/jpeg' });
      
      // Should not be recognized as PDF
      expect(isPDFFile(unsupportedFile)).toBe(false);
      
      // Should fail PDF validation
      const validation = validatePDFFile(unsupportedFile);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('not a valid PDF');
    });

    it('should handle file size limits', async () => {
      // Create a mock large file (simulate > 50MB)
      const largeFileSize = 60 * 1024 * 1024; // 60MB
      const largeFile = new File(['x'.repeat(1000)], 'large.pdf', { type: 'application/pdf' });
      
      // Mock file size
      Object.defineProperty(largeFile, 'size', {
        value: largeFileSize,
        writable: false
      });
      
      const validation = validatePDFFile(largeFile);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('exceeds maximum allowed size');
    });

    it('should handle network timeouts during file processing', async () => {
      googleDriveService['accessToken'] = 'mock-access-token';
      
      // Mock network timeout
      global.fetch = vi.fn().mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );
      
      await expect(googleDriveService.listFiles()).rejects.toThrow();
      await expect(googleDriveService.downloadFile('test-file')).rejects.toThrow();
    });
  });

  describe('File Processing Performance', () => {
    it('should process files within acceptable time limits', async () => {
      const testFiles = [
        createMockTextFile('Small file content', 'small.txt'),
        createMockTextFile('Medium file content. '.repeat(1000), 'medium.txt'),
        createMockPDFFile('PDF file content for performance testing', 'test.pdf')
      ];

      for (const file of testFiles) {
        const startTime = Date.now();
        
        let content = '';
        if (isPDFFile(file)) {
          content = await parsePDF(file, { timeout: 5000 });
        } else {
          content = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsText(file);
          });
        }
        
        const processingTime = Date.now() - startTime;
        
        expect(content).toBeDefined();
        expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      }
    });

    it('should handle concurrent file processing efficiently', async () => {
      const fileCount = 5;
      const files = Array.from({ length: fileCount }, (_, index) => 
        createMockTextFile(`Concurrent file ${index + 1} content`, `concurrent-${index + 1}.txt`)
      );

      const startTime = Date.now();
      
      const contentPromises = files.map(async (file) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsText(file);
        });
      });

      const contents = await Promise.all(contentPromises);
      const totalTime = Date.now() - startTime;

      expect(contents).toHaveLength(fileCount);
      expect(totalTime).toBeLessThan(1000); // Should complete within 1 second
      
      contents.forEach((content, index) => {
        expect(content).toContain(`Concurrent file ${index + 1}`);
      });
    });
  });
});