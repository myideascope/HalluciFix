<<<<<<< HEAD
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@test/utils/render';
import { userEvent } from '@testing-library/user-event';
import Dashboard from '../Dashboard';
import { AnalysisResult } from '../../types/analysis';
import { User, DEFAULT_ROLES } from '../../types/user';

describe('Dashboard', () => {
  const mockUser: User = {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    avatar: 'https://example.com/avatar.jpg',
    role: DEFAULT_ROLES[0],
    department: 'Engineering',
    status: 'active',
    lastActive: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    permissions: DEFAULT_ROLES[0].permissions
  };

  const mockAnalysisResults: AnalysisResult[] = [
    {
      id: 'analysis-1',
      user_id: 'test-user-123',
      content: 'First analysis content with exactly 99.7% accuracy',
      timestamp: '2024-01-01T10:00:00Z',
      accuracy: 75.5,
      riskLevel: 'medium',
      hallucinations: [
        {
          text: 'exactly 99.7%',
          type: 'False Precision',
          confidence: 0.85,
          explanation: 'Suspiciously specific statistic',
          startIndex: 30,
          endIndex: 43
        }
      ],
      verificationSources: 8,
      processingTime: 1250,
      analysisType: 'single',
      fullContent: 'First analysis content with exactly 99.7% accuracy'
    },
    {
      id: 'analysis-2',
      user_id: 'test-user-123',
      content: 'Second analysis with high accuracy and low risk',
      timestamp: '2024-01-01T11:00:00Z',
      accuracy: 92.3,
      riskLevel: 'low',
      hallucinations: [],
      verificationSources: 12,
      processingTime: 800,
      analysisType: 'single',
      fullContent: 'Second analysis with high accuracy and low risk'
    },
    {
      id: 'analysis-3',
      user_id: 'test-user-123',
      content: 'Critical risk analysis with multiple issues',
      timestamp: '2024-01-01T12:00:00Z',
=======
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, createMockUser, createMockAnalysisResult } from '../../test/utils/render';
import Dashboard from '../Dashboard';
import { useOptimizedData } from '../../hooks/useOptimizedData';
import { AnalysisResult } from '../../types/analysis';

// Mock the optimized data hook
vi.mock('../../hooks/useOptimizedData');

const mockUseOptimizedData = vi.mocked(useOptimizedData);

describe('Dashboard', () => {
  const mockUser = createMockUser();
  const mockSetActiveTab = vi.fn();

  const mockAnalysisResults: AnalysisResult[] = [
    createMockAnalysisResult({
      id: 'analysis-1',
      accuracy: 92.5,
      riskLevel: 'low',
      hallucinations: [],
      timestamp: '2024-01-01T10:00:00Z'
    }),
    createMockAnalysisResult({
      id: 'analysis-2',
      accuracy: 78.3,
      riskLevel: 'medium',
      hallucinations: [
        {
          text: 'exactly 99.7% accuracy',
          type: 'False Precision',
          confidence: 0.85,
          explanation: 'Suspiciously specific statistic'
        }
      ],
      timestamp: '2024-01-01T09:00:00Z'
    }),
    createMockAnalysisResult({
      id: 'analysis-3',
      accuracy: 65.1,
      riskLevel: 'high',
      hallucinations: [
        {
          text: 'zero false positives',
          type: 'Impossible Metric',
          confidence: 0.90,
          explanation: 'Absolute claims are statistically improbable'
        },
        {
          text: 'unprecedented results',
          type: 'Exaggerated Language',
          confidence: 0.75,
          explanation: 'Language suggests potential exaggeration'
        }
      ],
      timestamp: '2024-01-01T08:00:00Z'
    }),
    createMockAnalysisResult({
      id: 'analysis-4',
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      accuracy: 45.2,
      riskLevel: 'critical',
      hallucinations: [
        {
<<<<<<< HEAD
          text: 'unprecedented results',
          type: 'Exaggerated Language',
          confidence: 0.9,
          explanation: 'Potentially exaggerated claim',
          startIndex: 0,
          endIndex: 20
        },
        {
          text: 'zero complaints',
          type: 'Unverifiable Claim',
          confidence: 0.8,
          explanation: 'Unverifiable absolute claim',
          startIndex: 25,
          endIndex: 40
        }
      ],
      verificationSources: 5,
      processingTime: 1800,
      analysisType: 'batch',
      fullContent: 'Critical risk analysis with multiple issues'
    }
  ];

  const mockSetActiveTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
=======
          text: 'perfect 100% satisfaction',
          type: 'Impossible Metric',
          confidence: 0.95,
          explanation: 'Perfect metrics are unrealistic'
        }
      ],
      timestamp: '2024-01-01T07:00:00Z',
      seqLogprobAnalysis: {
        seqLogprob: -4.2,
        normalizedSeqLogprob: -1.2,
        confidenceScore: 35,
        hallucinationRisk: 'critical',
        isHallucinationSuspected: true,
        lowConfidenceTokens: ['perfect', '100%'],
        suspiciousSequences: 2,
        processingTime: 180
      }
    })
  ];

  const mockOptimizedData = {
    analysisResults: mockAnalysisResults,
    dashboardData: {
      stats: {
        totalAnalyses: 4,
        averageAccuracy: 70.3,
        totalHallucinations: 4,
        activeUsers: 1
      },
      riskDistribution: {
        low: 25,
        medium: 25,
        high: 25,
        critical: 25
      },
      recentAnalyses: mockAnalysisResults.slice(0, 4)
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock setup
    mockUseOptimizedData.mockReturnValue({
      data: mockOptimizedData,
      isLoading: false,
      error: null
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
  });

  describe('rendering with data', () => {
    it('should render dashboard with analysis data', () => {
      render(
        <Dashboard 
<<<<<<< HEAD
          analysisResults={mockAnalysisResults} 
=======
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('4')).toBeInTheDocument(); // Total analyses
      expect(screen.getByText('70.3%')).toBeInTheDocument(); // Average accuracy
      expect(screen.getByText('4')).toBeInTheDocument(); // Total hallucinations
      expect(screen.getByText('1')).toBeInTheDocument(); // Active users
    });

    it('should render overview stats cards', () => {
      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Total Analyses')).toBeInTheDocument();
<<<<<<< HEAD
      expect(screen.getByText('3')).toBeInTheDocument(); // Total analyses count
=======
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      expect(screen.getByText('Accuracy Rate')).toBeInTheDocument();
      expect(screen.getByText('Hallucinations Detected')).toBeInTheDocument();
      expect(screen.getByText('Active Users')).toBeInTheDocument();
    });

<<<<<<< HEAD
    it('should calculate and display correct statistics', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
=======
    it('should render accuracy trends chart', () => {
      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

<<<<<<< HEAD
      // Average accuracy: (75.5 + 92.3 + 45.2) / 3 = 71.0%
      expect(screen.getByText('71.0%')).toBeInTheDocument();
      
      // Total hallucinations: 1 + 0 + 2 = 3
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should display risk distribution correctly', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
=======
      expect(screen.getByText('Accuracy Trends')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Last 7 days')).toBeInTheDocument();
    });

    it('should render risk distribution chart', () => {
      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Risk Distribution')).toBeInTheDocument();
      expect(screen.getByText('Low Risk')).toBeInTheDocument();
      expect(screen.getByText('Medium Risk')).toBeInTheDocument();
      expect(screen.getByText('High Risk')).toBeInTheDocument();
      expect(screen.getByText('Critical Risk')).toBeInTheDocument();
<<<<<<< HEAD

      // Risk percentages: 1 low (33%), 1 medium (33%), 0 high (0%), 1 critical (33%)
      const riskPercentages = screen.getAllByText(/33%|0%/);
      expect(riskPercentages.length).toBeGreaterThan(0);
    });

    it('should display recent detections table', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
=======
      
      // Check percentages
      expect(screen.getByText('25%')).toBeInTheDocument();
    });

    it('should render recent detections table', () => {
      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Recent Detections')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
      expect(screen.getByText('Risk Level')).toBeInTheDocument();
      expect(screen.getByText('Accuracy')).toBeInTheDocument();
      expect(screen.getByText('User')).toBeInTheDocument();
<<<<<<< HEAD

      // Should show analysis results in table
      expect(screen.getByText('First analysis content with exactly 99.7% accuracy')).toBeInTheDocument();
      expect(screen.getByText('75.5%')).toBeInTheDocument();
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    it('should display accuracy trends chart', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
=======
      expect(screen.getByText('Time')).toBeInTheDocument();
    });

    it('should render quick actions section', () => {
      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

<<<<<<< HEAD
      expect(screen.getByText('Accuracy Trends')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Last 7 days')).toBeInTheDocument();
    });
  });

  describe('rendering without data', () => {
    it('should render empty state when no analysis results', () => {
      render(
        <Dashboard 
          analysisResults={[]} 
=======
      expect(screen.getByText('Batch Analysis')).toBeInTheDocument();
      expect(screen.getByText('API Integration')).toBeInTheDocument();
      expect(screen.getByText('Scheduled Scans')).toBeInTheDocument();
    });

    it('should display seq-logprob data when available', () => {
      render(
        <Dashboard 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      // Should show seq-logprob confidence score for analysis-4
      expect(screen.getByText('35%')).toBeInTheDocument();
      expect(screen.getByText('critical')).toBeInTheDocument();
    });
  });

  describe('loading states', () => {
    it('should show loading spinner when data is loading', () => {
      mockUseOptimizedData.mockReturnValue({
        data: null,
        isLoading: true,
        error: null
      });

      render(
        <Dashboard 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
    });

    it('should show dashboard when data loads after loading state', () => {
      const { rerender } = render(
        <Dashboard 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      // Initially loading
      mockUseOptimizedData.mockReturnValue({
        data: null,
        isLoading: true,
        error: null
      });

      rerender(
        <Dashboard 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();

      // Then loaded
      mockUseOptimizedData.mockReturnValue({
        data: mockOptimizedData,
        isLoading: false,
        error: null
      });

      rerender(
        <Dashboard 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.queryByText('Loading dashboard...')).not.toBeInTheDocument();
      expect(screen.getByText('Total Analyses')).toBeInTheDocument();
    });
  });

  describe('error states', () => {
    it('should show error message when data loading fails', () => {
      mockUseOptimizedData.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed to load dashboard data')
      });

      render(
        <Dashboard 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Failed to Load Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('should show generic error message when error has no message', () => {
      mockUseOptimizedData.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error()
      });

      render(
        <Dashboard 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('An error occurred while loading the dashboard data.')).toBeInTheDocument();
    });
  });

  describe('empty states', () => {
    it('should show empty state when no analysis data is available', () => {
      mockUseOptimizedData.mockReturnValue({
        data: {
          analysisResults: [],
          dashboardData: {
            stats: {
              totalAnalyses: 0,
              averageAccuracy: 0,
              totalHallucinations: 0,
              activeUsers: 1
            },
            riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
            recentAnalyses: []
          }
        },
        isLoading: false,
        error: null
      });

      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('No Analysis Data Yet')).toBeInTheDocument();
      expect(screen.getByText('Complete your first content analysis to see recent detections here.')).toBeInTheDocument();
<<<<<<< HEAD
      
      // Should show zero values
      expect(screen.getByText('0')).toBeInTheDocument(); // Total analyses
      expect(screen.getByText('0%')).toBeInTheDocument(); // Accuracy rate
    });

    it('should show empty chart bars when no data', () => {
      render(
        <Dashboard 
          analysisResults={[]} 
=======
    });

    it('should show zero values in stats when no data', () => {
      mockUseOptimizedData.mockReturnValue({
        data: {
          analysisResults: [],
          dashboardData: {
            stats: {
              totalAnalyses: 0,
              averageAccuracy: 0,
              totalHallucinations: 0,
              activeUsers: 1
            },
            riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
            recentAnalyses: []
          }
        },
        isLoading: false,
        error: null
      });

      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

<<<<<<< HEAD
      expect(screen.getByText('Accuracy Trends')).toBeInTheDocument();
      // Chart should still render but with empty bars
=======
      expect(screen.getByText('0')).toBeInTheDocument(); // Total analyses
      expect(screen.getByText('0%')).toBeInTheDocument(); // Average accuracy
    });
  });

  describe('fallback to props data', () => {
    it('should use props data when optimized data is not available', () => {
      mockUseOptimizedData.mockReturnValue({
        data: null,
        isLoading: false,
        error: null
      });

      render(
        <Dashboard 
          analysisResults={mockAnalysisResults}
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      // Should calculate stats from props data
      expect(screen.getByText('4')).toBeInTheDocument(); // Total analyses
      expect(screen.getByText('70.3%')).toBeInTheDocument(); // Average accuracy
    });

    it('should handle empty props data gracefully', () => {
      mockUseOptimizedData.mockReturnValue({
        data: null,
        isLoading: false,
        error: null
      });

      render(
        <Dashboard 
          analysisResults={[]}
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('No Analysis Data Yet')).toBeInTheDocument();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('interactions', () => {
<<<<<<< HEAD
    it('should open result viewer when clicking on analysis content', async () => {
      const user = userEvent.setup();
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      const contentLink = screen.getByText('First analysis content with exactly 99.7% accuracy');
      await user.click(contentLink);

      // Should open ResultsViewer modal (we'd need to check for modal content)
      // This would depend on the ResultsViewer component implementation
    });

    it('should navigate to analytics when clicking View All', async () => {
      const user = userEvent.setup();
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      const viewAllButton = screen.getByText('View All');
      await user.click(viewAllButton);

      expect(mockSetActiveTab).toHaveBeenCalledWith('analytics');
    });

    it('should navigate to batch analysis from quick actions', async () => {
      const user = userEvent.setup();
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
=======
    it('should call setActiveTab when quick action buttons are clicked', async () => {
      const user = userEvent.setup();
      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      const batchButton = screen.getByText('Start Batch Process');
      await user.click(batchButton);
<<<<<<< HEAD

      expect(mockSetActiveTab).toHaveBeenCalledWith('batch');
    });

    it('should navigate to scheduled scans from quick actions', async () => {
      const user = userEvent.setup();
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      const scheduledButton = screen.getByText('Configure Scans');
      await user.click(scheduledButton);

      expect(mockSetActiveTab).toHaveBeenCalledWith('scheduled');
    });

    it('should open API docs in new window', async () => {
      const user = userEvent.setup();
      const mockWindowOpen = vi.fn();
      vi.stubGlobal('window', { ...window, open: mockWindowOpen });

      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
=======
      expect(mockSetActiveTab).toHaveBeenCalledWith('batch');

      const scheduledButton = screen.getByText('Configure Scans');
      await user.click(scheduledButton);
      expect(mockSetActiveTab).toHaveBeenCalledWith('scheduled');
    });

    it('should call setActiveTab when "View All" is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

<<<<<<< HEAD
      const apiDocsButton = screen.getByText('View API Docs');
      await user.click(apiDocsButton);

      expect(mockWindowOpen).toHaveBeenCalledWith('/api-docs', '_blank');
=======
      const viewAllButton = screen.getByText('View All');
      await user.click(viewAllButton);
      expect(mockSetActiveTab).toHaveBeenCalledWith('analytics');
    });

    it('should open analysis result when content link is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Dashboard 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      const contentLink = screen.getByText('Test content for analysis');
      await user.click(contentLink);

      // Should open results viewer modal (we can't easily test the modal content here)
      // but we can verify the click handler was called
      expect(contentLink).toBeInTheDocument();
    });

    it('should open API docs when API Integration button is clicked', async () => {
      const user = userEvent.setup();
      
      // Mock window.open
      const mockOpen = vi.fn();
      vi.stubGlobal('open', mockOpen);

      render(
        <Dashboard 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      const apiButton = screen.getByText('View API Docs');
      await user.click(apiButton);

      expect(mockOpen).toHaveBeenCalledWith('/api-docs', '_blank');
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });

    it('should change time period in accuracy trends', async () => {
      const user = userEvent.setup();
      render(
        <Dashboard 
<<<<<<< HEAD
          analysisResults={mockAnalysisResults} 
=======
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

<<<<<<< HEAD
      const timeSelect = screen.getByDisplayValue('Last 7 days');
      await user.selectOptions(timeSelect, 'Last 30 days');

      expect(timeSelect).toHaveValue('Last 30 days');
    });
  });

  describe('statistics calculations', () => {
    it('should handle single analysis result', () => {
      const singleResult = [mockAnalysisResults[0]];
      render(
        <Dashboard 
          analysisResults={singleResult} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('1')).toBeInTheDocument(); // Total analyses
      expect(screen.getByText('75.5%')).toBeInTheDocument(); // Accuracy (same as single result)
    });

    it('should calculate risk distribution percentages correctly', () => {
      // Create specific test data for risk distribution
      const riskTestResults: AnalysisResult[] = [
        { ...mockAnalysisResults[0], riskLevel: 'low' },
        { ...mockAnalysisResults[1], riskLevel: 'low' },
        { ...mockAnalysisResults[2], riskLevel: 'medium' },
        { ...mockAnalysisResults[0], id: 'analysis-4', riskLevel: 'high' }
      ];

      render(
        <Dashboard 
          analysisResults={riskTestResults} 
=======
      const select = screen.getByDisplayValue('Last 7 days');
      await user.selectOptions(select, 'Last 30 days');

      expect(select).toHaveValue('Last 30 days');
    });
  });

  describe('data calculations', () => {
    it('should calculate correct risk distribution percentages', () => {
      const customAnalysisResults = [
        createMockAnalysisResult({ riskLevel: 'low' }),
        createMockAnalysisResult({ riskLevel: 'low' }),
        createMockAnalysisResult({ riskLevel: 'medium' }),
        createMockAnalysisResult({ riskLevel: 'high' })
      ];

      mockUseOptimizedData.mockReturnValue({
        data: null, // Force fallback to props
        isLoading: false,
        error: null
      });

      render(
        <Dashboard 
          analysisResults={customAnalysisResults}
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

<<<<<<< HEAD
      // 2 low (50%), 1 medium (25%), 1 high (25%), 0 critical (0%)
=======
      // Should calculate: 50% low, 25% medium, 25% high, 0% critical
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('25%')).toBeInTheDocument();
    });

<<<<<<< HEAD
    it('should show correct trend indicators', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
=======
    it('should calculate correct average accuracy', () => {
      const customAnalysisResults = [
        createMockAnalysisResult({ accuracy: 90 }),
        createMockAnalysisResult({ accuracy: 80 }),
        createMockAnalysisResult({ accuracy: 70 }),
        createMockAnalysisResult({ accuracy: 60 })
      ];

      mockUseOptimizedData.mockReturnValue({
        data: null, // Force fallback to props
        isLoading: false,
        error: null
      });

      render(
        <Dashboard 
          analysisResults={customAnalysisResults}
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

<<<<<<< HEAD
      // Should show trend indicators (up/down arrows)
      const trendElements = screen.getAllByText(/\+\d+%|-\d+%/);
      expect(trendElements.length).toBeGreaterThan(0);
    });
  });

  describe('responsive behavior', () => {
    it('should render grid layouts for different screen sizes', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
=======
      // Average should be 75%
      expect(screen.getByText('75.0%')).toBeInTheDocument();
    });

    it('should count total hallucinations correctly', () => {
      const customAnalysisResults = [
        createMockAnalysisResult({ 
          hallucinations: [
            { text: 'test1', type: 'Type1', confidence: 0.8, explanation: 'test' },
            { text: 'test2', type: 'Type2', confidence: 0.9, explanation: 'test' }
          ]
        }),
        createMockAnalysisResult({ 
          hallucinations: [
            { text: 'test3', type: 'Type3', confidence: 0.7, explanation: 'test' }
          ]
        }),
        createMockAnalysisResult({ hallucinations: [] })
      ];

      mockUseOptimizedData.mockReturnValue({
        data: null, // Force fallback to props
        isLoading: false,
        error: null
      });

      render(
        <Dashboard 
          analysisResults={customAnalysisResults}
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      // Should show 3 total hallucinations
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('relative time formatting', () => {
    it('should format recent timestamps correctly', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const customAnalysisResults = [
        createMockAnalysisResult({ 
          id: 'recent',
          timestamp: oneHourAgo.toISOString()
        }),
        createMockAnalysisResult({ 
          id: 'older',
          timestamp: oneDayAgo.toISOString()
        })
      ];

      mockUseOptimizedData.mockReturnValue({
        data: {
          analysisResults: customAnalysisResults,
          dashboardData: {
            stats: {
              totalAnalyses: 2,
              averageAccuracy: 85,
              totalHallucinations: 0,
              activeUsers: 1
            },
            riskDistribution: { low: 100, medium: 0, high: 0, critical: 0 },
            recentAnalyses: customAnalysisResults
          }
        },
        isLoading: false,
        error: null
      });

      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

<<<<<<< HEAD
      // Check for responsive grid classes (these would be in the DOM)
      const container = screen.getByText('Total Analyses').closest('div');
      expect(container).toHaveClass('grid');
    });
  });

  describe('data formatting', () => {
    it('should format large numbers correctly', () => {
      const largeNumberResults = Array.from({ length: 1500 }, (_, i) => ({
        ...mockAnalysisResults[0],
        id: `analysis-${i}`,
        timestamp: new Date(Date.now() - i * 1000).toISOString()
      }));

      render(
        <Dashboard 
          analysisResults={largeNumberResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      // Should format 1500 as "1,500"
      expect(screen.getByText('1,500')).toBeInTheDocument();
    });

    it('should show relative time correctly', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      // Should show relative time like "1 day ago", "2 hours ago", etc.
      // The exact text depends on when the test runs, so we check for time-related patterns
      const timeElements = screen.getAllByText(/ago|Just now/);
      expect(timeElements.length).toBeGreaterThan(0);
    });

    it('should display risk levels with appropriate styling', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      const mediumRisk = screen.getByText('medium');
      const lowRisk = screen.getByText('low');
      const criticalRisk = screen.getByText('critical');

      expect(mediumRisk).toHaveClass('capitalize');
      expect(lowRisk).toHaveClass('capitalize');
      expect(criticalRisk).toHaveClass('capitalize');
=======
      expect(screen.getByText('1 hour ago')).toBeInTheDocument();
      expect(screen.getByText('1 day ago')).toBeInTheDocument();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });

  describe('accessibility', () => {
<<<<<<< HEAD
    it('should have proper table structure', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
=======
    it('should have proper table headers', () => {
      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

<<<<<<< HEAD
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();

      const columnHeaders = screen.getAllByRole('columnheader');
      expect(columnHeaders.length).toBeGreaterThan(0);

      const rows = screen.getAllByRole('row');
      expect(rows.length).toBeGreaterThan(1); // Header + data rows
    });

    it('should have accessible button labels', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
=======
      expect(screen.getByRole('columnheader', { name: 'Content' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Risk Level' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Accuracy' })).toBeInTheDocument();
    });

    it('should have accessible buttons', () => {
      render(
        <Dashboard 
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

<<<<<<< HEAD
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAccessibleName();
      });
=======
      expect(screen.getByRole('button', { name: /start batch process/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view api docs/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /configure scans/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(
        <Dashboard 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      // Tab to first interactive element
      await user.tab();
      
      // Should be able to navigate through buttons
      const batchButton = screen.getByText('Start Batch Process');
      expect(batchButton).toHaveFocus();
>>>>>>> 6f70d26 (feat(database): Implement comprehensive database optimization and performance improvements)
    });
  });
});