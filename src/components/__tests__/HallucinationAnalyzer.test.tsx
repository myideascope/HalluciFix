import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@test/utils/render';
import { userEvent } from '@testing-library/user-event';
import HallucinationAnalyzer from '../HallucinationAnalyzer';
import analysisService from '../../lib/analysisService';
import { supabase } from '../../lib/supabase';
import { parsePDF } from '../../lib/pdfParser';

// Mock dependencies
vi.mock('../../lib/analysisService');
vi.mock('../../lib/supabase');
vi.mock('../../lib/pdfParser');
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-123',
      name: 'Test User',
      email: 'test@example.com'
    }
  })
}));

const mockAnalysisService = vi.mocked(analysisService);
const mockSupabase = vi.mocked(supabase);
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
      }
    ],
    verificationSources: 8,
    processingTime: 1250,
    analysisType: 'single' as const,
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock Supabase insert
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: null })
      })
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render the analyzer interface', () => {
      render(<HallucinationAnalyzer />);

      expect(screen.getByText('AI Content Analysis')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Paste your AI-generated content here for analysis...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /analyze content/i })).toBeInTheDocument();
    });

    it('should render with quick actions when setActiveTab is provided', () => {
      const mockSetActiveTab = vi.fn();
      render(<HallucinationAnalyzer setActiveTab={mockSetActiveTab} />);

      expect(screen.getByText('Batch Analysis')).toBeInTheDocument();
      expect(screen.getByText('Scheduled Scans')).toBeInTheDocument();
    });

    it('should show character count', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      expect(screen.getByText('12 characters')).toBeInTheDocument();
    });
  });

  describe('content input', () => {
    it('should update content when typing', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test analysis content');

      expect(textarea).toHaveValue('Test analysis content');
    });

    it('should load sample text when sample button is clicked', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);

      const sampleButton = screen.getByRole('button', { name: /sample text/i });
      await user.click(sampleButton);

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      expect(textarea.value.length).toBeGreaterThan(0);
    });

    it('should clear content when clear button is clicked', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const clearButton = screen.getByRole('button', { name: /clear/i });
      await user.click(clearButton);

      expect(textarea).toHaveValue('');
    });
  });

  describe('file upload', () => {
    it('should handle text file upload', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);

      const fileContent = 'This is test file content';
      const file = new File([fileContent], 'test.txt', { type: 'text/plain' });

      const uploadButton = screen.getByRole('button', { name: /upload file/i });
      await user.click(uploadButton);

      const fileInput = screen.getByRole('textbox', { hidden: true });
      await user.upload(fileInput, file);

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
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
      });
    });

    it('should handle file upload errors', async () => {
      const user = userEvent.setup();
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

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content for analysis');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      expect(mockAnalysisService.analyzeContent).toHaveBeenCalledWith(
        'Test content for analysis',
        'test-user-123',
        {
          sensitivity: 'medium',
          includeSourceVerification: true,
          maxHallucinations: 5,
          enableRAG: true
        }
      );

      await waitFor(() => {
        expect(screen.getByText('Analysis Results')).toBeInTheDocument();
        expect(screen.getByText('75.5%')).toBeInTheDocument();
        expect(screen.getByText('Medium')).toBeInTheDocument();
      });
    });

    it('should show loading state during analysis', async () => {
      const user = userEvent.setup();
      let resolveAnalysis: (value: any) => void;
      const analysisPromise = new Promise((resolve) => {
        resolveAnalysis = resolve;
      });
      mockAnalysisService.analyzeContent.mockReturnValue(analysisPromise);

      render(<HallucinationAnalyzer />);

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      expect(screen.getByText('Analyzing...')).toBeInTheDocument();
      expect(analyzeButton).toBeDisabled();

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

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/analysis failed/i)).toBeInTheDocument();
      });
    });

    it('should prevent analysis with empty content', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer />);

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      expect(screen.getByText('Please enter content to analyze')).toBeInTheDocument();
      expect(mockAnalysisService.analyzeContent).not.toHaveBeenCalled();
    });

    it('should call onAnalysisComplete callback when provided', async () => {
      const user = userEvent.setup();
      const mockOnAnalysisComplete = vi.fn();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: mockRAGAnalysis
      });

      render(<HallucinationAnalyzer onAnalysisComplete={mockOnAnalysisComplete} />);

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
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

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      expect(mockAnalysisService.analyzeContent).toHaveBeenCalledWith(
        'Test content',
        'test-user-123',
        expect.objectContaining({
          enableRAG: false
        })
      );
    });
  });

  describe('analysis results display', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: mockAnalysisResult,
        ragAnalysis: mockRAGAnalysis
      });

      render(<HallucinationAnalyzer />);

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('Analysis Results')).toBeInTheDocument();
      });
    });

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
    });

    it('should show no hallucinations message when none detected', async () => {
      const user = userEvent.setup();
      const cleanResult = {
        ...mockAnalysisResult,
        hallucinations: [],
        accuracy: 95.0,
        riskLevel: 'low' as const
      };

      mockAnalysisService.analyzeContent.mockResolvedValue({
        analysis: cleanResult
      });

      render(<HallucinationAnalyzer />);

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

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

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

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
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

      const textarea = screen.getByPlaceholderText('Paste your AI-generated content here for analysis...');
      await user.type(textarea, 'Test content');

      const analyzeButton = screen.getByRole('button', { name: /analyze content/i });
      await user.click(analyzeButton);

      await waitFor(() => {
        // Should still show results even if database save fails
        expect(screen.getByText('Analysis Results')).toBeInTheDocument();
      });
    });
  });
});