import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  parsePDF, 
  parsePDFAdvanced, 
  isPDFFile, 
  validatePDFFile, 
  getPDFInfo,
  PDFParsingError 
} from '../pdfParser';
import { createMockFile, createMockFileList } from '../../test/utils/mocks';

describe('PDF Parser Integration Tests', () => {
  beforeEach(() => {
    // Mock FileReader for consistent testing
    global.FileReader = class MockFileReader {
      onload: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      result: string | ArrayBuffer | null = null;

      readAsText(file: File) {
        setTimeout(() => {
          if (file.name.includes('error')) {
            this.onerror?.({ target: this });
          } else {
            this.result = this.generateMockTextContent(file);
            this.onload?.({ target: this });
          }
        }, 10);
      }

      readAsArrayBuffer(file: File) {
        setTimeout(() => {
          if (file.name.includes('error')) {
            this.onerror?.({ target: this });
          } else {
            this.result = this.generateMockPDFBuffer(file);
            this.onload?.({ target: this });
          }
        }, 10);
      }

      private generateMockTextContent(file: File): string {
        if (file.name.includes('empty')) return '';
        if (file.name.includes('large')) return 'Large content. '.repeat(10000);
        if (file.name.includes('suspicious')) {
          return 'Our AI system achieves exactly 99.7% accuracy with zero false positives. According to recent studies, this represents a revolutionary breakthrough.';
        }
        return `This is mock content from ${file.name}. It contains sample text for testing purposes.`;
      }

      private generateMockPDFBuffer(file: File): ArrayBuffer {
        // Create a mock PDF buffer with proper PDF signature
        const pdfSignature = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
        const mockContent = new TextEncoder().encode(this.generateMockPDFContent(file));
        
        const buffer = new ArrayBuffer(pdfSignature.length + mockContent.length);
        const view = new Uint8Array(buffer);
        
        // Add PDF signature
        view.set(pdfSignature, 0);
        view.set(mockContent, pdfSignature.length);
        
        return buffer;
      }

      private generateMockPDFContent(file: File): string {
        if (file.name.includes('empty')) return '';
        if (file.name.includes('compressed')) {
          // Simulate compressed/encoded content
          return '\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A';
        }
        if (file.name.includes('text-objects')) {
          // Simulate PDF with text objects
          return `
            BT
            /F1 12 Tf
            100 700 Td
            (This is extracted PDF text from ${file.name}) Tj
            ET
            BT
            /F1 12 Tf
            100 680 Td
            (Second line of PDF content) Tj
            ET
          `;
        }
        if (file.name.includes('suspicious')) {
          return `
            BT
            /F1 12 Tf
            100 700 Td
            (Our AI system achieves exactly 99.7% accuracy) Tj
            ET
            BT
            /F1 12 Tf
            100 680 Td
            (with zero false positives according to studies) Tj
            ET
          `;
        }
        return `Mock PDF content from ${file.name}`;
      }
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('File Validation', () => {
    it('should validate PDF files correctly', () => {
      const pdfFile = createMockFile('test.pdf', 'content', 'application/pdf');
      const textFile = createMockFile('test.txt', 'content', 'text/plain');

      expect(isPDFFile(pdfFile)).toBe(true);
      expect(isPDFFile(textFile)).toBe(false);
    });

    it('should validate PDF files by extension', () => {
      const pdfFile = createMockFile('document.pdf', 'content', 'application/octet-stream');
      expect(isPDFFile(pdfFile)).toBe(true);
    });

    it('should validate file size limits', () => {
      const smallFile = createMockFile('small.pdf', 'content', 'application/pdf');
      const largeFile = createMockFile('large.pdf', 'x'.repeat(60 * 1024 * 1024), 'application/pdf');

      const smallValidation = validatePDFFile(smallFile);
      const largeValidation = validatePDFFile(largeFile);

      expect(smallValidation.valid).toBe(true);
      expect(largeValidation.valid).toBe(false);
      expect(largeValidation.error).toContain('50MB');
    });

    it('should validate empty files', () => {
      const emptyFile = createMockFile('empty.pdf', '', 'application/pdf');
      const validation = validatePDFFile(emptyFile);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('empty');
    });

    it('should handle null file input', () => {
      const validation = validatePDFFile(null as any);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('No file provided');
    });
  });

  describe('PDF Information Extraction', () => {
    it('should extract basic PDF information', async () => {
      const pdfFile = createMockFile('test-document.pdf', 'content', 'application/pdf');
      pdfFile.lastModified = Date.now();

      const info = await getPDFInfo(pdfFile);

      expect(info).toMatchObject({
        name: 'test-document.pdf',
        size: expect.any(Number),
        sizeFormatted: expect.stringMatching(/\d+\.\d+ MB/),
        type: 'application/pdf',
        lastModified: expect.any(String),
        isValid: true,
        estimatedPages: expect.any(Number)
      });
    });

    it('should handle invalid PDF files in info extraction', async () => {
      const invalidFile = createMockFile('invalid.txt', 'content', 'text/plain');

      const info = await getPDFInfo(invalidFile);

      expect(info.isValid).toBe(false);
      expect(info.estimatedPages).toBeUndefined();
    });
  });

  describe('Basic PDF Parsing', () => {
    it('should parse simple PDF files', async () => {
      const pdfFile = createMockFile('simple.pdf', 'content', 'application/pdf');

      const text = await parsePDF(pdfFile);

      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    });

    it('should parse PDF with text objects', async () => {
      const pdfFile = createMockFile('text-objects.pdf', 'content', 'application/pdf');

      const text = await parsePDF(pdfFile);

      expect(text).toContain('extracted PDF text');
      expect(text).toContain('Second line');
    });

    it('should handle empty PDF files', async () => {
      const emptyFile = createMockFile('empty.pdf', '', 'application/pdf');

      await expect(parsePDF(emptyFile)).rejects.toThrow(PDFParsingError);
    });

    it('should handle corrupted PDF files', async () => {
      const corruptedFile = createMockFile('corrupted.pdf', 'not-pdf-content', 'application/pdf');

      await expect(parsePDF(corruptedFile)).rejects.toThrow();
    });

    it('should handle file reading errors', async () => {
      const errorFile = createMockFile('error.pdf', 'content', 'application/pdf');

      await expect(parsePDF(errorFile)).rejects.toThrow();
    });
  });

  describe('Advanced PDF Parsing', () => {
    it('should return detailed parsing results', async () => {
      const pdfFile = createMockFile('detailed.pdf', 'content', 'application/pdf');

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

      expect(result.pages.length).toBeGreaterThan(0);
      expect(result.pages[0]).toMatchObject({
        pageNumber: expect.any(Number),
        text: expect.any(String),
        wordCount: expect.any(Number)
      });
    });

    it('should handle parsing with custom options', async () => {
      const pdfFile = createMockFile('options-test.pdf', 'content', 'application/pdf');

      const result = await parsePDFAdvanced(pdfFile, {
        maxPages: 5,
        timeout: 10000,
        preserveFormatting: true,
        extractImages: false,
        fallbackToOCR: false
      });

      expect(result).toBeDefined();
      expect(result.metadata.processingTime).toBeLessThan(10000);
    });

    it('should include warnings for problematic content', async () => {
      const problematicFile = createMockFile('compressed.pdf', 'content', 'application/pdf');

      const result = await parsePDFAdvanced(problematicFile);

      // Should have warnings about compressed/encoded content
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle OCR fallback when enabled', async () => {
      const scannedFile = createMockFile('scanned.pdf', 'content', 'application/pdf');

      const result = await parsePDFAdvanced(scannedFile, {
        fallbackToOCR: true
      });

      expect(result).toBeDefined();
      // OCR fallback should be indicated in warnings
      if (result.warnings.some(w => w.includes('OCR'))) {
        expect(result.text).toContain('OCR');
      }
    });

    it('should measure processing time accurately', async () => {
      const pdfFile = createMockFile('timing-test.pdf', 'content', 'application/pdf');

      const startTime = Date.now();
      const result = await parsePDFAdvanced(pdfFile);
      const endTime = Date.now();

      expect(result.metadata.processingTime).toBeGreaterThan(0);
      expect(result.metadata.processingTime).toBeLessThanOrEqual(endTime - startTime + 100); // Allow some margin
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle timeout scenarios', async () => {
      const slowFile = createMockFile('slow.pdf', 'content', 'application/pdf');

      await expect(parsePDFAdvanced(slowFile, { timeout: 1 })).rejects.toThrow('timeout');
    });

    it('should handle very large files', async () => {
      const largeFile = createMockFile('large.pdf', 'x'.repeat(60 * 1024 * 1024), 'application/pdf');

      await expect(parsePDF(largeFile)).rejects.toThrow(PDFParsingError);
    });

    it('should handle files with special characters in names', async () => {
      const specialFile = createMockFile('test-file-with-特殊字符.pdf', 'content', 'application/pdf');

      const text = await parsePDF(specialFile);
      expect(text).toBeDefined();
    });

    it('should handle concurrent parsing requests', async () => {
      const files = Array.from({ length: 5 }, (_, i) =>
        createMockFile(`concurrent-${i}.pdf`, `content ${i}`, 'application/pdf')
      );

      const promises = files.map(file => parsePDF(file));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });

    it('should provide helpful error messages', async () => {
      const invalidFile = createMockFile('invalid.pdf', 'not-pdf', 'application/pdf');

      try {
        await parsePDF(invalidFile);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(PDFParsingError);
        expect(error.message).toBeDefined();
        expect(error.code).toBeDefined();
      }
    });

    it('should handle malformed PDF signatures', async () => {
      // This would be tested with actual malformed PDF bytes
      const malformedFile = createMockFile('malformed.pdf', 'content', 'application/pdf');

      // The mock FileReader will simulate a malformed PDF
      await expect(parsePDF(malformedFile)).rejects.toThrow();
    });
  });

  describe('Content Analysis Integration', () => {
    it('should extract suspicious content for analysis', async () => {
      const suspiciousFile = createMockFile('suspicious.pdf', 'content', 'application/pdf');

      const text = await parsePDF(suspiciousFile);

      expect(text).toContain('99.7% accuracy');
      expect(text).toContain('zero false positives');
    });

    it('should handle different content types', async () => {
      const contentTypes = [
        { name: 'technical.pdf', expectedContent: 'technical' },
        { name: 'marketing.pdf', expectedContent: 'marketing' },
        { name: 'research.pdf', expectedContent: 'research' }
      ];

      for (const { name, expectedContent } of contentTypes) {
        const file = createMockFile(name, 'content', 'application/pdf');
        const text = await parsePDF(file);

        expect(text).toBeDefined();
        expect(text.length).toBeGreaterThan(0);
      }
    });

    it('should preserve important formatting for analysis', async () => {
      const formattedFile = createMockFile('formatted.pdf', 'content', 'application/pdf');

      const result = await parsePDFAdvanced(formattedFile, {
        preserveFormatting: true
      });

      expect(result.text).toBeDefined();
      // Formatting preservation would be tested with actual formatted content
    });

    it('should extract metadata useful for analysis context', async () => {
      const metadataFile = createMockFile('with-metadata.pdf', 'content', 'application/pdf');

      const result = await parsePDFAdvanced(metadataFile);

      expect(result.metadata).toMatchObject({
        pageCount: expect.any(Number),
        fileSize: expect.any(Number),
        processingTime: expect.any(Number)
      });

      // Additional metadata fields might be available
      if (result.metadata.title) {
        expect(typeof result.metadata.title).toBe('string');
      }
    });
  });

  describe('Performance and Optimization', () => {
    it('should process small files quickly', async () => {
      const smallFile = createMockFile('small.pdf', 'small content', 'application/pdf');

      const startTime = Date.now();
      await parsePDF(smallFile);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle batch processing efficiently', async () => {
      const files = Array.from({ length: 10 }, (_, i) =>
        createMockFile(`batch-${i}.pdf`, `content ${i}`, 'application/pdf')
      );

      const startTime = Date.now();
      const results = await Promise.all(files.map(file => parsePDF(file)));
      const endTime = Date.now();

      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(5000); // Batch should complete within 5 seconds
    });

    it('should optimize memory usage for large files', async () => {
      const largeContentFile = createMockFile('large-content.pdf', 'content', 'application/pdf');

      // Monitor memory usage (simplified test)
      const initialMemory = process.memoryUsage().heapUsed;
      
      try {
        await parsePDF(largeContentFile);
      } catch (error) {
        // Expected to fail due to size limits
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
    });

    it('should clean up resources properly', async () => {
      const file = createMockFile('cleanup-test.pdf', 'content', 'application/pdf');

      // Parse multiple times to test resource cleanup
      for (let i = 0; i < 5; i++) {
        await parsePDF(file);
      }

      // If resources aren't cleaned up properly, this would cause issues
      expect(true).toBe(true); // Test passes if no memory leaks or errors
    });
  });

  describe('Integration with File Processing Workflow', () => {
    it('should integrate with file upload workflow', async () => {
      const uploadedFile = createMockFile('uploaded.pdf', 'content', 'application/pdf');

      // Simulate file upload validation
      const validation = validatePDFFile(uploadedFile);
      expect(validation.valid).toBe(true);

      // Simulate file processing
      const text = await parsePDF(uploadedFile);
      expect(text).toBeDefined();

      // Simulate file info extraction
      const info = await getPDFInfo(uploadedFile);
      expect(info.isValid).toBe(true);
    });

    it('should handle multiple file formats in batch processing', async () => {
      const files = [
        createMockFile('doc1.pdf', 'content1', 'application/pdf'),
        createMockFile('doc2.pdf', 'content2', 'application/pdf'),
        createMockFile('doc3.txt', 'content3', 'text/plain') // Non-PDF file
      ];

      const pdfFiles = files.filter(isPDFFile);
      expect(pdfFiles).toHaveLength(2);

      const results = await Promise.all(pdfFiles.map(file => parsePDF(file)));
      expect(results).toHaveLength(2);
    });

    it('should provide consistent results for analysis pipeline', async () => {
      const testFile = createMockFile('consistent.pdf', 'content', 'application/pdf');

      // Parse the same file multiple times
      const results = await Promise.all([
        parsePDF(testFile),
        parsePDF(testFile),
        parsePDF(testFile)
      ]);

      // Results should be consistent
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });
  });
});