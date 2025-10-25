import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HallucinationAnalyzer from '../HallucinationAnalyzer';

// Mock dependencies
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 'test-user-id', email: 'test@example.com' }
  })
}));

vi.mock('../../hooks/useLogger', () => ({
  useComponentLogger: vi.fn().mockReturnValue({
    logUserAction: vi.fn(),
    logError: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }),
  usePerformanceLogger: vi.fn().mockReturnValue({
    measurePerformance: vi.fn()
  })
}));

vi.mock('../../lib/optimizedAnalysisService', () => ({
  default: {
    analyzeContent: vi.fn().mockResolvedValue({
      analysis: {
        id: 'test-analysis-id',
        accuracy: 85,
        riskLevel: 'low',
        hallucinations: [],
        processingTime: 1500,
        verificationSources: 3
      },
      ragAnalysis: null
    })
  }
}));

vi.mock('../../lib/monitoredSupabase', () => ({
  monitoredSupabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockResolvedValue({ data: [], error: null })
    })
  }
}));

vi.mock('../../lib/pdfParser', () => ({
  parsePDF: vi.fn().mockResolvedValue('Parsed PDF content'),
  isPDFFile: vi.fn().mockReturnValue(false)
}));

describe('HallucinationAnalyzer', () => {
  const mockProps = {
    onAnalysisAttempt: vi.fn(),
    onAnalysisComplete: vi.fn(),
    setActiveTab: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('rendering', () => {
    it('should render the analyzer interface', () => {
      render(<HallucinationAnalyzer {...mockProps} />);

      expect(screen.getByText(/analyze content for hallucinations/i)).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByText(/analyze content/i)).toBeInTheDocument();
    });

    it('should render sample text button', () => {
      render(<HallucinationAnalyzer {...mockProps} />);

      expect(screen.getByText(/try sample text/i)).toBeInTheDocument();
    });

    it('should render file upload input', () => {
      render(<HallucinationAnalyzer {...mockProps} />);

      expect(screen.getByLabelText(/upload file/i)).toBeInTheDocument();
    });

    it('should render RAG toggle', () => {
      render(<HallucinationAnalyzer {...mockProps} />);

      expect(screen.getByText(/enhanced analysis/i)).toBeInTheDocument();
    });
  });

  describe('content input', () => {
    it('should allow text input', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content for analysis');

      expect(textArea).toHaveValue('Test content for analysis');
    });

    it('should load sample text when button is clicked', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const sampleButton = screen.getByText(/try sample text/i);
      await user.click(sampleButton);

      const textArea = screen.getByRole('textbox');
      expect(textArea.value.length).toBeGreaterThan(0);
    });

    it('should clear error when sample text is loaded', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      // First trigger an error state (we'll simulate this)
      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'test');

      // Then load sample text
      const sampleButton = screen.getByText(/try sample text/i);
      await user.click(sampleButton);

      // Error should be cleared
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('file upload', () => {
    it('should handle text file upload', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const file = new File(['Test file content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByLabelText(/upload file/i);

      await user.upload(fileInput, file);

      await waitFor(() => {
        const textArea = screen.getByRole('textbox');
        expect(textArea).toHaveValue('Test file content');
      });
    });

    it('should handle PDF file upload', async () => {
      const { isPDFFile, parsePDF } = await import('../../lib/pdfParser');
      
      vi.mocked(isPDFFile).mockReturnValue(true);
      vi.mocked(parsePDF).mockResolvedValue('Parsed PDF content');

      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const file = new File(['PDF content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/upload file/i);

      await user.upload(fileInput, file);

      await waitFor(() => {
        const textArea = screen.getByRole('textbox');
        expect(textArea).toHaveValue('Parsed PDF content');
      });

      expect(parsePDF).toHaveBeenCalledWith(file);
    });

    it('should handle file upload errors', async () => {
      const { parsePDF } = await import('../../lib/pdfParser');
      
      vi.mocked(parsePDF).mockRejectedValue(new Error('PDF parsing failed'));

      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const file = new File(['Invalid PDF'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/upload file/i);

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/error reading file/i)).toBeInTheDocument();
      });
    });

    it('should reset file input after upload', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const file = new File(['Test content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByLabelText(/upload file/i) as HTMLInputElement;

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(fileInput.value).toBe('');
      });
    });
  });

  describe('content analysis', () => {
    it('should analyze content when button is clicked', async () => {
      const optimizedAnalysisService = await import('../../lib/optimizedAnalysisService');
      
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content for analysis');

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      expect(optimizedAnalysisService.default.analyzeContent).toHaveBeenCalledWith(
        'Test content for analysis',
        'test-user-id',
        expect.objectContaining({
          enableRAG: true
        })
      );
    });

    it('should show loading state during analysis', async () => {
      const optimizedAnalysisService = await import('../../lib/optimizedAnalysisService');
      
      // Make analysis take some time
      vi.mocked(optimizedAnalysisService.default.analyzeContent).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content');

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
      expect(analyzeButton).toBeDisabled();
    });

    it('should display analysis results', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content');

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/accuracy/i)).toBeInTheDocument();
        expect(screen.getByText(/85%/)).toBeInTheDocument();
        expect(screen.getByText(/low risk/i)).toBeInTheDocument();
      });
    });

    it('should call onAnalysisAttempt callback', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content');

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      expect(mockProps.onAnalysisAttempt).toHaveBeenCalledWith('Test content');
    });

    it('should call onAnalysisComplete callback', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content');

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      await waitFor(() => {
        expect(mockProps.onAnalysisComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'test-analysis-id',
            accuracy: 85,
            riskLevel: 'low'
          })
        );
      });
    });

    it('should prevent analysis with empty content', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      expect(screen.getByText(/please enter content/i)).toBeInTheDocument();
    });

    it('should handle analysis errors', async () => {
      const optimizedAnalysisService = await import('../../lib/optimizedAnalysisService');
      
      vi.mocked(optimizedAnalysisService.default.analyzeContent).mockRejectedValue(
        new Error('Analysis failed')
      );

      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content');

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/analysis failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('RAG analysis toggle', () => {
    it('should toggle RAG analysis setting', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const ragToggle = screen.getByRole('checkbox', { name: /enhanced analysis/i });
      
      expect(ragToggle).toBeChecked(); // Default is enabled

      await user.click(ragToggle);
      expect(ragToggle).not.toBeChecked();

      await user.click(ragToggle);
      expect(ragToggle).toBeChecked();
    });

    it('should pass RAG setting to analysis service', async () => {
      const optimizedAnalysisService = await import('../../lib/optimizedAnalysisService');
      
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      // Disable RAG
      const ragToggle = screen.getByRole('checkbox', { name: /enhanced analysis/i });
      await user.click(ragToggle);

      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content');

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      expect(optimizedAnalysisService.default.analyzeContent).toHaveBeenCalledWith(
        'Test content',
        'test-user-id',
        expect.objectContaining({
          enableRAG: false
        })
      );
    });
  });

  describe('analysis history', () => {
    it('should display analysis history', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      // Perform an analysis to add to history
      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content');

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/recent analyses/i)).toBeInTheDocument();
      });
    });

    it('should allow viewing previous analysis results', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      // Perform an analysis
      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content');

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      await waitFor(() => {
        const historyItem = screen.getByText(/test content/i);
        expect(historyItem).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<HallucinationAnalyzer {...mockProps} />);

      expect(screen.getByLabelText(/content to analyze/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/upload file/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /analyze content/i })).toBeInTheDocument();
    });

    it('should announce analysis status to screen readers', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content');

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have proper error announcements', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const analyzeButton = screen.getByText(/analyze content/i);
      await user.click(analyzeButton);

      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('keyboard navigation', () => {
    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      // Tab through interactive elements
      await user.tab();
      expect(screen.getByRole('textbox')).toHaveFocus();

      await user.tab();
      expect(screen.getByText(/try sample text/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/upload file/i)).toHaveFocus();
    });

    it('should allow Enter key to trigger analysis', async () => {
      const user = userEvent.setup();
      render(<HallucinationAnalyzer {...mockProps} />);

      const textArea = screen.getByRole('textbox');
      await user.type(textArea, 'Test content');

      const analyzeButton = screen.getByText(/analyze content/i);
      analyzeButton.focus();
      
      await user.keyboard('{Enter}');

      expect(mockProps.onAnalysisAttempt).toHaveBeenCalledWith('Test content');
    });
  });
});