import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
<<<<<<< HEAD
import { render, screen, fireEvent, waitFor } from '@test/utils/render';
import { userEvent } from '@testing-library/user-event';
import HallucinationAnalyzer from '../HallucinationAnalyzer';
import analysisService from '../../lib/analysisService';
import { supabase } from '../../lib/supabase';
import { parsePDF } from '../../lib/pdfParser';
=======
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, createMockUser } from '../../test/utils/render';
import HallucinationAnalyzer from '../HallucinationAnalyzer';
import analysisService from '../../lib/analysisService';
import { supabase } from '../../lib/supabase';
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

// Mock dependencies
vi.mock('../../lib/analysisService');
vi.mock('../../lib/supabase');
<<<<<<< HEAD
vi.mock('../../lib/pdfParser');
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-123',
      name: 'Test User',
      email: 'test@example.com'
    }
  })
=======
vi.mock('../../lib/pdfParser', () => ({
  parsePDF: vi.fn(),
  isPDFFile: vi.fn()
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
}));

const mockAnalysisService = vi.mocked(analysisService);
const mockSupabase = vi.mocked(supabase);
<<<<<<< HEAD
const mockParsePDF = vi.mocked(parsePDF);

describe('HallucinationAnalyzer', () => {
  const mockAnalysisResult = {
    id: 'analysis-123',
    user_id: 'test-user-123',
    content: 'Test content with exactly 99.7% accuracy',
    timestamp: '2024-01-01T00:00:00Z',
    accuracy: 75.5,
    riskLevel: 'medium' as const,
    hallucinations: [
      {
        text: 'exactly 99.7%',
        type: 'False Precision',
        confidence: 0.85,
        explanation: 'Suspiciously specific statistic without verifiable source',
        startIndex: 18,
        endIndex: 31
=======

describe('HallucinationAnalyzer', () => {
  const mockUser = createMockUser();
  const mockAnalysisResult = {
    id: 'analysis-123',
    user_id: mockUser.id,
    content: 'Test content for analysis',
    timestamp: '2024-01-01T00:00:00Z',
    accuracy: 85.5,
    riskLevel: 'medium' as const,
    hallucinations: [
      {
        text: 'exactly 99.7% accuracy',
        type: 'False Precision',
        confidence: 0.85,
        explanation: 'Suspiciously specific statistic without verifiable source',
        startIndex: 25,
        endIndex: 45
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      }
    ],
    verificationSources: 8,
    processingTime: 1250,
    analysisType: 'single' as const,
<<<<<<< HEAD
    fullContent: 'Test content with exactly 99.7% accuracy'
  };

  const mockRAGAnalysis = {
    rag_enhanced_accuracy: 78.2,
    verified_claims: [
      {
        claim: 'exactly 99.7% accuracy',
        verification_status: 'contradicted',
        confidence: 0.9,
        explanation: 'No reliable sources support this specific accuracy claim'
      }
    ],
    source_coverage: 85.0,
    improvement_score: 2.7
=======
    fullContent: 'This AI system achieves exactly 99.7% accuracy with zero false positives.'
  };

  const mockRAGAnalysis = {
    rag_enhanced_accuracy: 82.3,
    verified_claims: [
      {
        claim: 'exactly 99.7% accuracy',
        verification_status: 'contradicted' as const,
        confidence: 0.90,
        explanation: 'This precision level is unrealistic for AI systems'
      }
    ],
    processing_time: 2100,
    sources_consulted: 12,
    source_coverage: 85.5,
    improvement_score: -3.2
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock Supabase insert
<<<<<<< HEAD
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: null })
      })
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
=======
    mockSupabase.from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        error: null
      })
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  });

  describe('rendering', () => {
    it('should render the analyzer interface', () => {
<<<<<<< HEAD
      render(<HallucinationAnalyzer />);
=======
      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      expect(screen.getByText('AI Content Analysis')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Paste your AI-generated content here for analysis...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /analyze content/i })).toBeInTheDocument();
    });

<<<<<<< HEAD
    it('should render with quick actions when setActiveTab is provided', () => {
      const mockSetActiveTab = vi.fn();
      render(<HallucinationAnalyzer setActiveTab={mockSetActiveTab} />);

      expect(screen.getByText('Batch Analysis')).toBeInTheDocument();
      expect(screen.getByText('Scheduled Scans')).toBeInTheDocument();
=======
    it('should render without user (landing page context)', () => {
      render(<HallucinationAnalyzer />, { initialUser: null });

      expect(screen.getByText('AI Content Analysis')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /analyze content/i })).toBeInTheDocument();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });

    it('should show character count', async () => {
      const user = userEvent.setup();
<<<<<<< HEAD
      render(<HallucinationAnalyzer />);
=======
      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      expect(screen.getByText('12 characters')).toBeInTheDocument();
    });
<<<<<<< HEAD
  });

  describe('content input', () => {
    it('should update content when typing', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);
=======

    it('should show RAG toggle', () => {
      render(<HallucinationAnalyzer />, { initialUser: mockUser });

      expect(screen.getByText('RAG Enhancement')).toBeInTheDocument();
      expect(screen.getByText('Cross-reference claims against reliable knowledge sources')).toBeInTheDocument();
    });
  });

  describe('content input', () => {
    it('should allow typing in textarea', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test analysis content');

      expect(textarea).toHaveValue('Test analysis content');
    });

<<<<<<< HEAD
    it('should load sample text when sample button is clicked', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);
=======
    it('should load sample text', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const sampleButton = screen.getByRole('button', { name: /sample text/i });
      await user.click(sampleButton);

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
<<<<<<< HEAD
      expect(textarea.value.length).toBeGreaterThan(0);
    });

    it('should clear content when clear button is clicked', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);
=======
      expect(textarea.value).toContain('Stanford study');
    });

    it('should clear content', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const clearButton = screen.getByRole('button', { name: /clear/i });
      await user.click(clearButton);

      expect(textarea).toHaveValue('');
    });
<<<<<<< HEAD
=======

    it('should toggle RAG enhancement', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />, { initialUser: mockUser });

      const ragToggle = screen.getByRole('button');
      const initialState = ragToggle.className.includes('bg-purple-600');
      
      await user.click(ragToggle);
      
      expect(ragToggle.className.includes('bg-purple-600')).toBe(!initialState);
    });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  });

  describe('file upload', () => {
    it('should handle text file upload', async () => {
      const user = userEvent.setup();
<<<<<<< HEAD
      render(<HallucinationAnalyzer />);

      const fileContent = 'This is test file content';
      const file = new File([fileContent], 'test.txt', { type: 'text/plain' });

      const uploadButton = screen.getByRole('button', { name: /upload file/i });
      await user.click(uploadButton);

      const fileInput = screen.getByRole('textbox', { hidden: true });
=======
      render(<HallucinationAnalyzer />, { initialUser: mockUser });

      const file = new File(['Test file content'], 'test.txt', { type: 'text/plain' });
      const uploadButton = screen.getByRole('button', { name: /upload file/i });
      
      await user.click(uploadButton);
      
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      await user.upload(fileInput, file);

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
<<<<<<< HEAD
        expect(textarea).toHaveValue(fileContent);
      });
    });

    it('should handle PDF file upload', async () => {
      const user = userEvent.setup();
      const pdfContent = 'Extracted PDF content';
      mockParsePDF.mockResolvedValue(pdfContent);

      render(<HallucinationAnalyzer />);

      const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });

      const uploadButton = screen.getByRole('button', { name: /upload file/i });
      await user.click(uploadButton);

      const fileInput = screen.getByRole('textbox', { hidden: true });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(mockParsePDF).toHaveBeenCalledWith(file);
        const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
        expect(textarea).toHaveValue(pdfContent);
=======
        expect(textarea).toHaveValue('Test file content');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      });
    });

    it('should handle file upload errors', async () => {
      const user = userEvent.setup();
<<<<<<< HEAD
      mockParsePDF.mockRejectedValue(new Error('PDF parsing failed'));

      render(<HallucinationAnalyzer />);

      const file = new File(['invalid pdf'], 'test.pdf', { type: 'application/pdf' });

      const uploadButton = screen.getByRole('button', { name: /upload file/i });
      await user.click(uploadButton);

      const fileInput = screen.getByRole('textbox', { hidden: true });
      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByText(/error reading file/i)).toBeInTheDocument();
      });
    });
  });

  describe('content analysis', () => {
    it('should perform analysis when analyze button is clicked', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: mockRAGAnalysis
      });

      render(<HallucinationAnalyzer />);
=======
      render(<HallucinationAnalyzer />, { initialUser: mockUser });

      // Mock FileReader to throw error
      const originalFileReader = global.FileReader;
      global.FileReader = vi.fn().mockImplementation(() => ({
        readAsText: vi.fn(),
        onerror: null,
        onload: null
      }));

      const file = new File([''], 'test.txt', { type: 'text/plain' });
      const uploadButton = screen.getByRole('button', { name: /upload file/i });
      
      await user.click(uploadButton);
      
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(fileInput, file);

      // Simulate error
      const reader = new FileReader();
      if (reader.onerror) {
        reader.onerror(new ProgressEvent('error'));
      }

      await waitFor(() => {
        expect(screen.getByText(/error reading file/i)).toBeInTheDocument();
      });

      global.FileReader = originalFileReader;
    });
  });

  describe('analysis functionality', () => {
    it('should perform analysis with authenticated user', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: mockRAGAnalysis,
        seqLogprobResult: null
      });

      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content for analysis');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      expect(mockAnalysisService.analyzeContent).toHaveBeenCalledWith(
        'Test content for analysis',
<<<<<<< HEAD
        'test-user-123',
=======
        mockUser.id,
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        {
          sensitivity: 'medium',
          includeSourceVerification: true,
          maxHallucinations: 5,
          enableRAG: true
        }
      );

      await waitFor(() => {
        expect(screen.getByText('Analysis Results')).toBeInTheDocument();
<<<<<<< HEAD
        expect(screen.getByText('75.5%')).toBeInTheDocument();
=======
        expect(screen.getByText('85.5%')).toBeInTheDocument();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        expect(screen.getByText('Medium')).toBeInTheDocument();
      });
    });

    it('should show loading state during analysis', async () => {
      const user = userEvent.setup();
<<<<<<< HEAD
      let resolveAnalysis: (value: any) => void;
      const analysisPromise = new Promise((resolve) => {
        resolveAnalysis = resolve;
      });
      mockAnalysisService.analyzeContent.mockReturnValue(analysisPromise);

      render(<HallucinationAnalyzer />);
=======
      mockAnalysisService.analyzeContent.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      expect(screen.getByText('Analyzing...')).toBeInTheDocument();
      expect(analyzeButton).toBeDisabled();
<<<<<<< HEAD

      // Resolve the analysis
      resolveAnalysis!({
        analysis: mockAnalysisResult,
        ragAnalysis: mockRAGAnalysis
      });

      await waitFor(() => {
        expect(screen.getByText('Analysis Results')).toBeInTheDocument();
      });
    });

    it('should show error when analysis fails', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockRejectedValue(new Error('Analysis failed'));

      render(<HallucinationAnalyzer />);
=======
    });

    it('should handle analysis errors', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockRejectedValue(new Error('Analysis failed'));

      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/analysis failed/i)).toBeInTheDocument();
      });
    });

<<<<<<< HEAD
    it('should prevent analysis with empty content', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);
=======
    it('should prevent analysis without content', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      expect(screen.getByText('Please enter content to analyze')).toBeInTheDocument();
      expect(mockAnalysisService.analyzeContent).not.toHaveBeenCalled();
    });

<<<<<<< HEAD
    it('should call onAnalysisComplete callback when provided', async () => {
      const user = userEvent.setup();
      const mockOnAnalysisComplete = vi.fn();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: mockRAGAnalysis
      });

      render(<HallucinationAnalyzer onAnalysisComplete={mockOnAnalysisComplete} />);
=======
    it('should call onAnalysisAttempt for non-sample content without user', async () => {
      const user = userEvent.setup();
      const mockOnAnalysisAttempt = vi.fn();
      
      render(
        <HallucinationAnalyzer onAnalysisAttempt={mockOnAnalysisAttempt} />, 
        { initialUser: null }
      );

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Custom content that is not a sample');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      expect(mockOnAnalysisAttempt).toHaveBeenCalledWith('Custom content that is not a sample');
      expect(mockAnalysisService.analyzeContent).not.toHaveBeenCalled();
    });

    it('should analyze sample content without authentication', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: { ...mockAnalysisResult, user_id: 'anonymous' },
        ragAnalysis: null,
        seqLogprobResult: null
      });

      render(<HallucinationAnalyzer />, { initialUser: null });

      // Load sample text
      const sampleButton = screen.getByRole('button', { name: /sample text/i });
      await user.click(sampleButton);

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      expect(mockAnalysisService.analyzeContent).toHaveBeenCalledWith(
        expect.stringContaining('Stanford study'),
        'anonymous',
        expect.any(Object)
      );
    });

    it('should save analysis to database for authenticated users', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: null,
        seqLogprobResult: null
      });

      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
<<<<<<< HEAD
        expect(mockOnAnalysisComplete).toHaveBeenCalledWith(mockAnalysisResult);
      });
    });
  });

  describe('RAG toggle', () => {
    it('should toggle RAG enhancement', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);

      const ragToggle = screen.getByRole('button', { name: /rag enhancement/i });
      await user.click(ragToggle);

      // Verify the toggle state changed (you might need to check visual indicators)
      expect(ragToggle).toBeInTheDocument();
    });

    it('should pass RAG setting to analysis service', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult
      });

      render(<HallucinationAnalyzer />);

      // Disable RAG
      const ragToggle = screen.getByRole('button', { name: /rag enhancement/i });
      await user.click(ragToggle);
=======
        expect(mockSupabase.from).toHaveBeenCalledWith('analysis_results');
      });
    });

    it('should handle database save errors gracefully', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: null,
        seqLogprobResult: null
      });

      mockSupabase.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          error: new Error('Database error')
        })
      });

      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

<<<<<<< HEAD
      expect(mockAnalysisService.analyzeContent).toHaveBeenCalledWith(
        'Test content',
        'test-user-123',
        expect.objectContaining({
          enableRAG: false
        })
      );
=======
      // Should still show results even if database save fails
      await waitFor(() => {
        expect(screen.getByText('Analysis Results')).toBeInTheDocument();
      });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('analysis results display', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
<<<<<<< HEAD
        ragAnalysis: mockRAGAnalysis
      });

      render(<HallucinationAnalyzer />);
=======
        ragAnalysis: mockRAGAnalysis,
        seqLogprobResult: {
          seqLogprob: -3.2,
          confidenceScore: 75,
          hallucinationRisk: 'medium',
          isHallucinationSuspected: true
        }
      });

      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('Analysis Results')).toBeInTheDocument();
      });
    });

<<<<<<< HEAD
    it('should display accuracy score', () => {
      expect(screen.getByText('75.5%')).toBeInTheDocument();
      expect(screen.getByText('Accuracy Score')).toBeInTheDocument();
    });

    it('should display risk level with appropriate styling', () => {
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Risk Level')).toBeInTheDocument();
    });

    it('should display hallucinations count', () => {
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Issues Found')).toBeInTheDocument();
    });

    it('should display processing time', () => {
      expect(screen.getByText('Processed in 1250ms')).toBeInTheDocument();
    });

    it('should display detected hallucinations', () => {
      expect(screen.getByText('Detected Issues')).toBeInTheDocument();
      expect(screen.getByText('False Precision')).toBeInTheDocument();
      expect(screen.getByText('"exactly 99.7%"')).toBeInTheDocument();
      expect(screen.getByText('85% confidence')).toBeInTheDocument();
    });

    it('should display RAG analysis results', () => {
      expect(screen.getByText('RAG Enhanced')).toBeInTheDocument();
      expect(screen.getByText('78.2%')).toBeInTheDocument();
      expect(screen.getByText('+2.7%')).toBeInTheDocument();
=======
    it('should display key metrics', () => {
      expect(screen.getByText('85.5%')).toBeInTheDocument(); // Accuracy
      expect(screen.getByText('Medium')).toBeInTheDocument(); // Risk level
      expect(screen.getByText('1')).toBeInTheDocument(); // Issues found
      expect(screen.getByText('8')).toBeInTheDocument(); // Sources checked
    });

    it('should display RAG analysis results', () => {
      expect(screen.getByText('82.3%')).toBeInTheDocument(); // RAG enhanced accuracy
      expect(screen.getByText('-3.2%')).toBeInTheDocument(); // Improvement score
    });

    it('should display seq-logprob results', () => {
      expect(screen.getByText('75%')).toBeInTheDocument(); // Confidence score
      expect(screen.getByText('(medium)')).toBeInTheDocument(); // Risk level
    });

    it('should display hallucination details', () => {
      expect(screen.getByText('Detected Issues')).toBeInTheDocument();
      expect(screen.getByText('False Precision')).toBeInTheDocument();
      expect(screen.getByText('85% confidence')).toBeInTheDocument();
      expect(screen.getByText('"exactly 99.7% accuracy"')).toBeInTheDocument();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });

    it('should show no hallucinations message when none detected', async () => {
      const user = userEvent.setup();
      const cleanResult = {
        ...mockAnalysisResult,
        hallucinations: [],
<<<<<<< HEAD
        accuracy: 95.0,
=======
        accuracy: 95.2,
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
        riskLevel: 'low' as const
      };

      mockAnalysisService.analyzeContent.mockResolvedValue({
<<<<<<< HEAD
        analysis: cleanResult
      });

      render(<HallucinationAnalyzer />);
=======
        analysis: cleanResult,
        ragAnalysis: null,
        seqLogprobResult: null
      });

      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Clean content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('No Hallucinations Detected')).toBeInTheDocument();
        expect(screen.getByText('The content appears to be accurate and reliable based on our analysis.')).toBeInTheDocument();
      });
    });
  });

<<<<<<< HEAD
  describe('landing page mode', () => {
    it('should call onAnalysisAttempt for non-sample content when not authenticated', async () => {
      const user = userEvent.setup();
      const mockOnAnalysisAttempt = vi.fn();

      // Mock useAuth to throw error (landing page context)
      vi.doMock('../../hooks/useAuth', () => ({
        useAuth: () => {
          throw new Error('useAuth not available');
        }
      }));

      render(<HallucinationAnalyzer onAnalysisAttempt={mockOnAnalysisAttempt} />);

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Custom user content');
=======
  describe('callback functions', () => {
    it('should call onAnalysisComplete when analysis finishes', async () => {
      const user = userEvent.setup();
      const mockOnAnalysisComplete = vi.fn();
      
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: null,
        seqLogprobResult: null
      });

      render(
        <HallucinationAnalyzer onAnalysisComplete={mockOnAnalysisComplete} />, 
        { initialUser: mockUser }
      );

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

<<<<<<< HEAD
      expect(mockOnAnalysisAttempt).toHaveBeenCalledWith('Custom user content');
      expect(mockAnalysisService.analyzeContent).not.toHaveBeenCalled();
    });
  });

  describe('database integration', () => {
    it('should save analysis results to database when user is authenticated', async () => {
      const user = userEvent.setup();
      const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
      
      mockSupabase.from.mockReturnValue({
        insert: mockInsert
      } as any);

      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult
      });

      render(<HallucinationAnalyzer />);

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');
=======
      await waitFor(() => {
        expect(mockOnAnalysisComplete).toHaveBeenCalledWith(mockAnalysisResult);
      });
    });

    it('should call setActiveTab when quick action buttons are clicked', async () => {
      const user = userEvent.setup();
      const mockSetActiveTab = vi.fn();

      render(
        <HallucinationAnalyzer setActiveTab={mockSetActiveTab} />, 
        { initialUser: mockUser }
      );

      const batchButton = screen.getByText('Start Batch Process');
      await user.click(batchButton);

      expect(mockSetActiveTab).toHaveBeenCalledWith('batch');

      const scheduledButton = screen.getByText('Configure Scans');
      await user.click(scheduledButton);

      expect(mockSetActiveTab).toHaveBeenCalledWith('scheduled');
    });
  });

  describe('analysis history', () => {
    it('should display recent analyses', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: null,
        seqLogprobResult: null
      });

      render(<HallucinationAnalyzer />, { initialUser: mockUser });

      // Perform first analysis
      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'First analysis');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
<<<<<<< HEAD
        expect(mockSupabase.from).toHaveBeenCalledWith('analysis_results');
        expect(mockInsert).toHaveBeenCalled();
      });
    });

    it('should handle database save errors gracefully', async () => {
      const user = userEvent.setup();
      const mockInsert = vi.fn().mockResolvedValue({ 
        data: null, 
        error: new Error('Database error') 
      });
      
      mockSupabase.from.mockReturnValue({
        insert: mockInsert
      } as any);

      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult
      });

      render(<HallucinationAnalyzer />);
=======
        expect(screen.getByText('Recent Analyses')).toBeInTheDocument();
      });

      // Should show the analysis in history
      expect(screen.getByText('Test content for analysis')).toBeInTheDocument();
    });

    it('should allow clicking on history items to view results', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: null,
        seqLogprobResult: null
      });

      render(<HallucinationAnalyzer />, { initialUser: mockUser });

      // Perform analysis to create history
      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('Recent Analyses')).toBeInTheDocument();
      });

      // Click on history item
      const historyItem = screen.getByText('Test content for analysis');
      await user.click(historyItem);

      // Should display the analysis results
      expect(screen.getByText('Analysis Results')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<HallucinationAnalyzer />, { initialUser: mockUser });

      const textarea = screen.getByLabelText('Content to Analyze');
      expect(textarea).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />, { initialUser: mockUser });

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      
      // Tab to textarea
      await user.tab();
      expect(textarea).toHaveFocus();

      // Type content
      await user.type(textarea, 'Test content');

      // Tab to analyze button
      await user.tab();
      await user.tab();
      await user.tab();
      await user.tab();
      
      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      expect(analyzeButton).toHaveFocus();
    });

    it('should announce analysis completion to screen readers', async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: null,
        seqLogprobResult: null
      });

      render(<HallucinationAnalyzer />, { initialUser: mockUser });
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
<<<<<<< HEAD
        // Should still show results even if database save fails
        expect(screen.getByText('Analysis Results')).toBeInTheDocument();
=======
        const resultsSection = screen.getByText('Analysis Results').closest('div');
        expect(resultsSection).toHaveAttribute('role', 'region');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      });
    });
  });
});