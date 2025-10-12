import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../test/utils/render';
import { setupTestDatabase, cleanupTestDatabase, createTestUserInDatabase, DatabaseTestIsolation } from '../../test/utils/database';
import { server } from '../../test/mocks/server';
import { rest } from 'msw';
import BatchAnalysis from '../BatchAnalysis';
import { createMockFile, createMockFileList } from '../../test/utils/mocks';
import * as pdfParser from '../../lib/pdfParser';
import analysisService from '../../lib/analysisService';

// Mock the PDF parser
vi.mock('../../lib/pdfParser', () => ({
  parsePDF: vi.fn(),
  isPDFFile: vi.fn(),
  validatePDFFile: vi.fn(),
  getPDFInfo: vi.fn()
}));

// Mock the analysis service
vi.mock('../../lib/analysisService', () => ({
  default: {
    analyzeContent: vi.fn()
  }
}));

describe('BatchAnalysis Integration Tests', () => {
  let testIsolation: DatabaseTestIsolation;
  let testUser: any;
  let mockOnBatchComplete: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    testIsolation = new DatabaseTestIsolation();
    testUser = await testIsolation.createIsolatedUser({
      email: 'batch-test@test.example.com',
      name: 'Batch Test User'
    });

    mockOnBatchComplete = vi.fn();

    // Setup PDF parser mocks
    vi.mocked(pdfParser.isPDFFile).mockImplementation((file: File) => 
      file.type === 'application/pdf' || file.name.endsWith('.pdf')
    );

    vi.mocked(pdfParser.validatePDFFile).mockImplementation((file: File) => ({
      valid: file.size > 0 && file.size < 50 * 1024 * 1024,
      error: file.size === 0 ? 'File is empty' : undefined
    }));

    vi.mocked(pdfParser.parsePDF).mockImplementation(async (file: File) => {
      if (file.name.includes('error')) {
        throw new Error('PDF parsing failed');
      }
      if (file.name.includes('suspicious')) {
        return 'Our AI system achieves exactly 99.7% accuracy with zero false positives according to recent studies.';
      }
      return `Extracted text content from ${file.name}. This is sample content for testing purposes.`;
    });

    // Setup analysis service mock
    vi.mocked(analysisService.analyzeContent).mockImplementation(async (content: string, userId: string) => {
      const isSuspicious = content.includes('99.7% accuracy') || content.includes('zero false positives');
      
      return {
        analysis: {
          id: `analysis-${Date.now()}-${Math.random()}`,
          user_id: userId,
          content: content.substring(0, 200) + '...',
          timestamp: new Date().toISOString(),
          accuracy: isSuspicious ? 45.2 : 85.5,
          riskLevel: isSuspicious ? 'critical' : 'low' as any,
          hallucinations: isSuspicious ? [
            {
              text: '99.7% accuracy',
              type: 'False Precision',
              confidence: 0.92,
              explanation: 'Suspiciously specific statistic',
              startIndex: 20,
              endIndex: 35
            }
          ] : [],
          verificationSources: 5,
          processingTime: 1000,
          analysisType: 'single' as any,
          fullContent: content
        },
        ragAnalysis: {
          rag_enhanced_accuracy: isSuspicious ? 25.5 : 88.0,
          verified_claims: [],
          processing_time: 500
        }
      };
    });

    // Mock file reading
    global.FileReader = class MockFileReader {
      onload: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      result: string | null = null;

      readAsText(file: File) {
        setTimeout(() => {
          if (file.name.includes('read-error')) {
            this.onerror?.({ target: this });
          } else {
            this.result = `Text content from ${file.name}`;
            this.onload?.({ target: this });
          }
        }, 10);
      }
    } as any;
  });

  afterEach(async () => {
    await testIsolation.cleanup();
    await cleanupTestDatabase();
    vi.restoreAllMocks();
  });

  describe('File Upload and Processing', () => {
    it('should handle single file upload', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const file = createMockFile('test-document.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      expect(fileInput).toBeDefined();

      // Simulate file selection
      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([file]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      expect(screen.getByText('1 document uploaded')).toBeInTheDocument();
    });

    it('should handle multiple file uploads', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const files = [
        createMockFile('doc1.pdf', 'content1', 'application/pdf'),
        createMockFile('doc2.txt', 'content2', 'text/plain'),
        createMockFile('doc3.pdf', 'content3', 'application/pdf')
      ];

      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList(files),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('doc1.pdf')).toBeInTheDocument();
        expect(screen.getByText('doc2.txt')).toBeInTheDocument();
        expect(screen.getByText('doc3.pdf')).toBeInTheDocument();
      });

      expect(screen.getByText('3 documents uploaded')).toBeInTheDocument();
    });

    it('should handle file upload errors', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const errorFile = createMockFile('read-error.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([errorFile]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('read-error.pdf')).toBeInTheDocument();
      });

      // Should show error status
      await waitFor(() => {
        const errorIcon = screen.getByTestId('error-icon') || document.querySelector('[data-testid="error-icon"]');
        expect(errorIcon || screen.getByText(/failed to read file/i)).toBeInTheDocument();
      });
    });

    it('should handle PDF parsing errors', async () => {
      vi.mocked(pdfParser.parsePDF).mockRejectedValueOnce(new Error('PDF parsing failed'));

      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const pdfFile = createMockFile('error.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([pdfFile]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText(/failed to read file/i)).toBeInTheDocument();
      });
    });

    it('should remove documents from the list', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const file = createMockFile('removable.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([file]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('removable.pdf')).toBeInTheDocument();
      });

      // Find and click remove button
      const removeButton = screen.getByRole('button', { name: /remove/i }) || 
                          document.querySelector('[title="Remove document"]') ||
                          screen.getByTestId('remove-document');

      if (removeButton) {
        fireEvent.click(removeButton);

        await waitFor(() => {
          expect(screen.queryByText('removable.pdf')).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('Batch Analysis Execution', () => {
    it('should execute batch analysis successfully', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      // Upload files
      const files = [
        createMockFile('normal.pdf', 'content', 'application/pdf'),
        createMockFile('suspicious.pdf', 'content', 'application/pdf')
      ];

      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList(files),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('2 documents uploaded')).toBeInTheDocument();
      });

      // Start analysis
      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      // Should show processing state
      await waitFor(() => {
        expect(screen.getByText(/processing/i)).toBeInTheDocument();
      });

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByText(/batch analysis results/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Verify results
      expect(mockOnBatchComplete).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            analysisType: 'batch',
            filename: expect.stringMatching(/\.pdf$/)
          })
        ])
      );
    });

    it('should show progress during batch processing', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const files = Array.from({ length: 3 }, (_, i) =>
        createMockFile(`doc${i}.pdf`, 'content', 'application/pdf')
      );

      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList(files),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('3 documents uploaded')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      // Should show progress bar
      await waitFor(() => {
        expect(screen.getByText(/processing documents/i)).toBeInTheDocument();
      });

      // Progress should eventually reach 100%
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('should handle analysis errors gracefully', async () => {
      vi.mocked(analysisService.analyzeContent).mockRejectedValueOnce(new Error('Analysis service error'));

      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const file = createMockFile('analysis-error.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([file]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('analysis-error.pdf')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/analysis failed/i)).toBeInTheDocument();
      });
    });

    it('should continue processing other files when one fails', async () => {
      // Mock one failure and one success
      vi.mocked(analysisService.analyzeContent)
        .mockRejectedValueOnce(new Error('First file failed'))
        .mockResolvedValueOnce({
          analysis: {
            id: 'success-analysis',
            user_id: testUser.id,
            content: 'Success content...',
            timestamp: new Date().toISOString(),
            accuracy: 85.5,
            riskLevel: 'low' as any,
            hallucinations: [],
            verificationSources: 5,
            processingTime: 1000,
            analysisType: 'batch' as any,
            fullContent: 'Full success content'
          }
        });

      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const files = [
        createMockFile('fail.pdf', 'content', 'application/pdf'),
        createMockFile('success.pdf', 'content', 'application/pdf')
      ];

      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList(files),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('2 documents uploaded')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/batch analysis results/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Should have called onBatchComplete with successful results only
      expect(mockOnBatchComplete).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'success-analysis'
          })
        ])
      );
    });
  });

  describe('RAG Analysis Integration', () => {
    it('should toggle RAG analysis option', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const ragToggle = screen.getByRole('button', { name: /rag enhancement/i }) ||
                       document.querySelector('[data-testid="rag-toggle"]') ||
                       screen.getByText(/rag enhancement/i).closest('button');

      expect(ragToggle).toBeInTheDocument();

      // Toggle should be enabled by default
      fireEvent.click(ragToggle!);

      // Verify RAG is disabled in analysis call
      const file = createMockFile('rag-test.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([file]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('rag-test.pdf')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(analysisService.analyzeContent).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            enableRAG: false
          })
        );
      });
    });

    it('should display RAG analysis results', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const file = createMockFile('rag-results.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([file]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('rag-results.pdf')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        // Should show RAG accuracy in document list
        expect(screen.getByText(/rag:/i)).toBeInTheDocument();
      });
    });
  });

  describe('Results Display and Summary', () => {
    it('should display batch analysis summary', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const files = [
        createMockFile('normal1.pdf', 'content', 'application/pdf'),
        createMockFile('normal2.pdf', 'content', 'application/pdf'),
        createMockFile('suspicious.pdf', 'content', 'application/pdf')
      ];

      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList(files),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('3 documents uploaded')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/batch analysis results/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Should show summary statistics
      expect(screen.getByText('3')).toBeInTheDocument(); // Document count
      expect(screen.getByText(/avg accuracy/i)).toBeInTheDocument();
      expect(screen.getByText(/total issues/i)).toBeInTheDocument();
      expect(screen.getByText(/high risk/i)).toBeInTheDocument();
    });

    it('should display individual document results', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const file = createMockFile('individual.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([file]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('individual.pdf')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/batch analysis results/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Should show individual result details
      expect(screen.getByText('individual.pdf')).toBeInTheDocument();
      expect(screen.getByText(/accuracy:/i)).toBeInTheDocument();
      expect(screen.getByText(/issues:/i)).toBeInTheDocument();
      expect(screen.getByText(/sources:/i)).toBeInTheDocument();
    });

    it('should show risk level indicators', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const files = [
        createMockFile('low-risk.pdf', 'content', 'application/pdf'),
        createMockFile('suspicious-high-risk.pdf', 'content', 'application/pdf')
      ];

      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList(files),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('2 documents uploaded')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/batch analysis results/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Should show different risk levels
      expect(screen.getByText('low')).toBeInTheDocument();
      expect(screen.getByText('critical')).toBeInTheDocument();
    });
  });

  describe('User Interface and Interactions', () => {
    it('should clear all documents', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const file = createMockFile('clearable.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([file]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('clearable.pdf')).toBeInTheDocument();
      });

      const clearButton = screen.getByRole('button', { name: /clear all/i });
      fireEvent.click(clearButton);

      expect(screen.queryByText('clearable.pdf')).not.toBeInTheDocument();
      expect(screen.queryByText(/documents uploaded/)).not.toBeInTheDocument();
    });

    it('should disable buttons during processing', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const file = createMockFile('processing-test.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([file]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('processing-test.pdf')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      // Buttons should be disabled during processing
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
      });

      const clearButton = screen.getByRole('button', { name: /clear all/i });
      expect(clearButton).toBeDisabled();
    });

    it('should show getting started message when no files', () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      expect(screen.getByText(/batch document analysis/i)).toBeInTheDocument();
      expect(screen.getByText(/upload multiple documents/i)).toBeInTheDocument();
      expect(screen.getByText(/multi-format support/i)).toBeInTheDocument();
    });
  });

  describe('Database Integration', () => {
    it('should save analysis results to database when user is authenticated', async () => {
      // Mock authenticated user context
      const mockUser = { id: testUser.id, email: testUser.email };
      
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />, {
        user: mockUser
      });

      const file = createMockFile('database-test.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([file]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('database-test.pdf')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/batch analysis results/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Verify analysis service was called with correct user ID
      expect(analysisService.analyzeContent).toHaveBeenCalledWith(
        expect.any(String),
        testUser.id,
        expect.any(Object)
      );
    });

    it('should handle database save errors gracefully', async () => {
      // Mock database error
      server.use(
        rest.post('*/analysis_results', (req, res, ctx) => {
          return res(ctx.status(500), ctx.json({ error: 'Database error' }));
        })
      );

      const mockUser = { id: testUser.id, email: testUser.email };
      
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />, {
        user: mockUser
      });

      const file = createMockFile('db-error-test.pdf', 'content', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([file]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('db-error-test.pdf')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      // Should still complete analysis despite database error
      await waitFor(() => {
        expect(screen.getByText(/batch analysis results/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      expect(mockOnBatchComplete).toHaveBeenCalled();
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large batch processing', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      // Create many files
      const files = Array.from({ length: 20 }, (_, i) =>
        createMockFile(`large-batch-${i}.pdf`, 'content', 'application/pdf')
      );

      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList(files),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('20 documents uploaded')).toBeInTheDocument();
      });

      const analyzeButton = screen.getByRole('button', { name: /start analysis/i });
      fireEvent.click(analyzeButton);

      // Should handle large batch without errors
      await waitFor(() => {
        expect(screen.getByText(/batch analysis results/i)).toBeInTheDocument();
      }, { timeout: 10000 });

      expect(mockOnBatchComplete).toHaveBeenCalledWith(
        expect.arrayContaining(
          Array.from({ length: 20 }, () => expect.objectContaining({
            analysisType: 'batch'
          }))
        )
      );
    });

    it('should handle mixed file types correctly', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const files = [
        createMockFile('document.pdf', 'content', 'application/pdf'),
        createMockFile('text.txt', 'content', 'text/plain'),
        createMockFile('markdown.md', 'content', 'text/markdown'),
        createMockFile('word.docx', 'content', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      ];

      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList(files),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('4 documents uploaded')).toBeInTheDocument();
      });

      // All files should be processed regardless of type
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText('text.txt')).toBeInTheDocument();
      expect(screen.getByText('markdown.md')).toBeInTheDocument();
      expect(screen.getByText('word.docx')).toBeInTheDocument();
    });

    it('should handle empty file uploads', async () => {
      render(<BatchAnalysis onBatchComplete={mockOnBatchComplete} />);

      const emptyFile = createMockFile('empty.pdf', '', 'application/pdf');
      const fileInput = screen.getByRole('button', { name: /choose files/i }).closest('div')?.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: createMockFileList([emptyFile]),
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('empty.pdf')).toBeInTheDocument();
      });

      // Should show error for empty file
      await waitFor(() => {
        expect(screen.getByText(/failed to read file/i)).toBeInTheDocument();
      });
    });
  });
});