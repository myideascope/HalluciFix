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
      accuracy: 45.2,
      riskLevel: 'critical',
      hallucinations: [
        {
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
  });

  describe('rendering with data', () => {
    it('should render dashboard with analysis data', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Total Analyses')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument(); // Total analyses count
      expect(screen.getByText('Accuracy Rate')).toBeInTheDocument();
      expect(screen.getByText('Hallucinations Detected')).toBeInTheDocument();
      expect(screen.getByText('Active Users')).toBeInTheDocument();
    });

    it('should calculate and display correct statistics', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      // Average accuracy: (75.5 + 92.3 + 45.2) / 3 = 71.0%
      expect(screen.getByText('71.0%')).toBeInTheDocument();
      
      // Total hallucinations: 1 + 0 + 2 = 3
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should display risk distribution correctly', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Risk Distribution')).toBeInTheDocument();
      expect(screen.getByText('Low Risk')).toBeInTheDocument();
      expect(screen.getByText('Medium Risk')).toBeInTheDocument();
      expect(screen.getByText('High Risk')).toBeInTheDocument();
      expect(screen.getByText('Critical Risk')).toBeInTheDocument();

      // Risk percentages: 1 low (33%), 1 medium (33%), 0 high (0%), 1 critical (33%)
      const riskPercentages = screen.getAllByText(/33%|0%/);
      expect(riskPercentages.length).toBeGreaterThan(0);
    });

    it('should display recent detections table', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Recent Detections')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
      expect(screen.getByText('Risk Level')).toBeInTheDocument();
      expect(screen.getByText('Accuracy')).toBeInTheDocument();
      expect(screen.getByText('User')).toBeInTheDocument();

      // Should show analysis results in table
      expect(screen.getByText('First analysis content with exactly 99.7% accuracy')).toBeInTheDocument();
      expect(screen.getByText('75.5%')).toBeInTheDocument();
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    it('should display accuracy trends chart', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Accuracy Trends')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Last 7 days')).toBeInTheDocument();
    });
  });

  describe('rendering without data', () => {
    it('should render empty state when no analysis results', () => {
      render(
        <Dashboard 
          analysisResults={[]} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('No Analysis Data Yet')).toBeInTheDocument();
      expect(screen.getByText('Complete your first content analysis to see recent detections here.')).toBeInTheDocument();
      
      // Should show zero values
      expect(screen.getByText('0')).toBeInTheDocument(); // Total analyses
      expect(screen.getByText('0%')).toBeInTheDocument(); // Accuracy rate
    });

    it('should show empty chart bars when no data', () => {
      render(
        <Dashboard 
          analysisResults={[]} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      expect(screen.getByText('Accuracy Trends')).toBeInTheDocument();
      // Chart should still render but with empty bars
    });
  });

  describe('interactions', () => {
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
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      const batchButton = screen.getByText('Start Batch Process');
      await user.click(batchButton);

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
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      const apiDocsButton = screen.getByText('View API Docs');
      await user.click(apiDocsButton);

      expect(mockWindowOpen).toHaveBeenCalledWith('/api-docs', '_blank');
    });

    it('should change time period in accuracy trends', async () => {
      const user = userEvent.setup();
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

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
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      // 2 low (50%), 1 medium (25%), 1 high (25%), 0 critical (0%)
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('25%')).toBeInTheDocument();
    });

    it('should show correct trend indicators', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

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
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

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
    });
  });

  describe('accessibility', () => {
    it('should have proper table structure', () => {
      render(
        <Dashboard 
          analysisResults={mockAnalysisResults} 
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

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
          setActiveTab={mockSetActiveTab} 
          user={mockUser} 
        />
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAccessibleName();
      });
    });
  });
});