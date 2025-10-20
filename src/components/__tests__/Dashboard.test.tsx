import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../Dashboard';
import { User } from '../../types/user';
import { AnalysisResult } from '../../types/analysis';

// Mock dependencies
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    subscription: { plan: 'pro', status: 'active' },
    subscriptionPlan: 'pro',
    hasActiveSubscription: true,
    canAccessFeature: vi.fn().mockReturnValue(true)
  })
}));

vi.mock('../../hooks/useOptimizedData', () => ({
  useOptimizedData: vi.fn().mockReturnValue({
    data: {
      analysisResults: [],
      dashboardData: {
        totalAnalyses: 10,
        averageAccuracy: 85,
        riskDistribution: { low: 5, medium: 3, high: 2, critical: 0 }
      }
    },
    isLoading: false,
    error: null
  })
}));

vi.mock('../../hooks/useUserEngagement', () => ({
  useUserEngagement: vi.fn().mockReturnValue({
    trackPageView: vi.fn(),
    trackFeatureUsage: vi.fn(),
    trackInteraction: vi.fn(),
    trackJourneyStep: vi.fn()
  }),
  useFeatureTracking: vi.fn().mockReturnValue({
    startTracking: vi.fn(),
    endTracking: vi.fn()
  })
}));

vi.mock('../../hooks/useLogger', () => ({
  useComponentLogger: vi.fn().mockReturnValue({
    logUserAction: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }),
  usePerformanceLogger: vi.fn().mockReturnValue({
    measurePerformance: vi.fn()
  })
}));

describe('Dashboard', () => {
  const mockUser: User = {
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'user',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  };

  const mockAnalysisResults: AnalysisResult[] = [
    {
      id: 'analysis-1',
      user_id: 'test-user-id',
      content: 'Test analysis 1',
      timestamp: '2024-01-01T00:00:00Z',
      accuracy: 85,
      riskLevel: 'low',
      hallucinations: [],
      verificationSources: 3,
      processingTime: 1500,
      analysisType: 'single',
      fullContent: 'Full test content 1'
    },
    {
      id: 'analysis-2',
      user_id: 'test-user-id',
      content: 'Test analysis 2',
      timestamp: '2024-01-02T00:00:00Z',
      accuracy: 65,
      riskLevel: 'medium',
      hallucinations: [
        {
          text: 'Suspicious claim',
          type: 'factual_error',
          confidence: 0.8,
          explanation: 'This claim cannot be verified',
          startIndex: 0,
          endIndex: 15
        }
      ],
      verificationSources: 2,
      processingTime: 2000,
      analysisType: 'single',
      fullContent: 'Full test content 2'
    }
  ];

  const mockProps = {
    analysisResults: mockAnalysisResults,
    setActiveTab: vi.fn(),
    user: mockUser
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('rendering', () => {
    it('should render dashboard header', () => {
      render(<Dashboard {...mockProps} />);

      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    });

    it('should render statistics cards', () => {
      render(<Dashboard {...mockProps} />);

      expect(screen.getByText(/total analyses/i)).toBeInTheDocument();
      expect(screen.getByText(/average accuracy/i)).toBeInTheDocument();
      expect(screen.getByText(/risk distribution/i)).toBeInTheDocument();
    });

    it('should render recent analyses section', () => {
      render(<Dashboard {...mockProps} />);

      expect(screen.getByText(/recent analyses/i)).toBeInTheDocument();
    });

    it('should render usage indicator', () => {
      render(<Dashboard {...mockProps} />);

      expect(screen.getByText(/usage/i)).toBeInTheDocument();
    });
  });

  describe('data loading', () => {
    it('should show loading state', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: null,
        isLoading: true,
        error: null
      });

      render(<Dashboard {...mockProps} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should show error state', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed to load data')
      });

      render(<Dashboard {...mockProps} />);

      expect(screen.getByText(/error loading dashboard data/i)).toBeInTheDocument();
    });

    it('should display data when loaded', async () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: {
          analysisResults: mockAnalysisResults,
          dashboardData: {
            totalAnalyses: 10,
            averageAccuracy: 85,
            riskDistribution: { low: 5, medium: 3, high: 2, critical: 0 }
          }
        },
        isLoading: false,
        error: null
      });

      render(<Dashboard {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('10')).toBeInTheDocument(); // Total analyses
        expect(screen.getByText('85%')).toBeInTheDocument(); // Average accuracy
      });
    });
  });

  describe('statistics display', () => {
    it('should display correct statistics', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: {
          analysisResults: mockAnalysisResults,
          dashboardData: {
            totalAnalyses: 15,
            averageAccuracy: 78,
            riskDistribution: { low: 8, medium: 4, high: 2, critical: 1 }
          }
        },
        isLoading: false,
        error: null
      });

      render(<Dashboard {...mockProps} />);

      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('78%')).toBeInTheDocument();
    });

    it('should show risk distribution', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: {
          analysisResults: mockAnalysisResults,
          dashboardData: {
            totalAnalyses: 10,
            averageAccuracy: 85,
            riskDistribution: { low: 5, medium: 3, high: 2, critical: 0 }
          }
        },
        isLoading: false,
        error: null
      });

      render(<Dashboard {...mockProps} />);

      expect(screen.getByText(/5.*low/i)).toBeInTheDocument();
      expect(screen.getByText(/3.*medium/i)).toBeInTheDocument();
      expect(screen.getByText(/2.*high/i)).toBeInTheDocument();
    });

    it('should handle empty data gracefully', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: {
          analysisResults: [],
          dashboardData: {
            totalAnalyses: 0,
            averageAccuracy: 0,
            riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 }
          }
        },
        isLoading: false,
        error: null
      });

      render(<Dashboard {...mockProps} />);

      expect(screen.getByText(/no analyses yet/i)).toBeInTheDocument();
    });
  });

  describe('recent analyses', () => {
    it('should display recent analysis items', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: {
          analysisResults: mockAnalysisResults,
          dashboardData: {
            totalAnalyses: 2,
            averageAccuracy: 75,
            riskDistribution: { low: 1, medium: 1, high: 0, critical: 0 }
          }
        },
        isLoading: false,
        error: null
      });

      render(<Dashboard {...mockProps} />);

      expect(screen.getByText('Test analysis 1')).toBeInTheDocument();
      expect(screen.getByText('Test analysis 2')).toBeInTheDocument();
    });

    it('should show analysis details on click', async () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: {
          analysisResults: mockAnalysisResults,
          dashboardData: {
            totalAnalyses: 2,
            averageAccuracy: 75,
            riskDistribution: { low: 1, medium: 1, high: 0, critical: 0 }
          }
        },
        isLoading: false,
        error: null
      });

      const user = userEvent.setup();
      render(<Dashboard {...mockProps} />);

      const analysisItem = screen.getByText('Test analysis 1');
      await user.click(analysisItem);

      await waitFor(() => {
        expect(screen.getByText(/analysis details/i)).toBeInTheDocument();
      });
    });

    it('should display risk levels with appropriate styling', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: {
          analysisResults: mockAnalysisResults,
          dashboardData: {
            totalAnalyses: 2,
            averageAccuracy: 75,
            riskDistribution: { low: 1, medium: 1, high: 0, critical: 0 }
          }
        },
        isLoading: false,
        error: null
      });

      render(<Dashboard {...mockProps} />);

      const lowRiskBadge = screen.getByText(/low/i);
      const mediumRiskBadge = screen.getByText(/medium/i);

      expect(lowRiskBadge).toHaveClass('bg-green-100');
      expect(mediumRiskBadge).toHaveClass('bg-yellow-100');
    });
  });

  describe('user engagement tracking', () => {
    it('should track page view on mount', () => {
      const { useUserEngagement } = require('../../hooks/useUserEngagement');
      const mockTracking = {
        trackPageView: vi.fn(),
        trackFeatureUsage: vi.fn(),
        trackInteraction: vi.fn(),
        trackJourneyStep: vi.fn()
      };
      
      vi.mocked(useUserEngagement).mockReturnValue(mockTracking);

      render(<Dashboard {...mockProps} />);

      expect(mockTracking.trackPageView).toHaveBeenCalledWith('/dashboard', { title: 'Dashboard' });
      expect(mockTracking.trackJourneyStep).toHaveBeenCalledWith('dashboard_viewed');
    });

    it('should track feature usage', () => {
      const { useFeatureTracking } = require('../../hooks/useUserEngagement');
      const mockFeatureTracking = {
        startTracking: vi.fn(),
        endTracking: vi.fn()
      };
      
      vi.mocked(useFeatureTracking).mockReturnValue(mockFeatureTracking);

      render(<Dashboard {...mockProps} />);

      expect(mockFeatureTracking.startTracking).toHaveBeenCalledWith({ user_id: mockUser.id });
    });
  });

  describe('subscription integration', () => {
    it('should show subscription guard for premium features', () => {
      const { useAuth } = require('../../hooks/useAuth');
      
      vi.mocked(useAuth).mockReturnValue({
        subscription: null,
        subscriptionPlan: 'free',
        hasActiveSubscription: false,
        canAccessFeature: vi.fn().mockReturnValue(false)
      });

      render(<Dashboard {...mockProps} />);

      expect(screen.getByText(/upgrade to access/i)).toBeInTheDocument();
    });

    it('should show full dashboard for subscribed users', () => {
      const { useAuth } = require('../../hooks/useAuth');
      
      vi.mocked(useAuth).mockReturnValue({
        subscription: { plan: 'pro', status: 'active' },
        subscriptionPlan: 'pro',
        hasActiveSubscription: true,
        canAccessFeature: vi.fn().mockReturnValue(true)
      });

      render(<Dashboard {...mockProps} />);

      expect(screen.getByText(/recent analyses/i)).toBeInTheDocument();
      expect(screen.queryByText(/upgrade to access/i)).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should navigate to analyzer when button is clicked', async () => {
      const user = userEvent.setup();
      render(<Dashboard {...mockProps} />);

      const analyzeButton = screen.getByText(/new analysis/i);
      await user.click(analyzeButton);

      expect(mockProps.setActiveTab).toHaveBeenCalledWith('analyzer');
    });

    it('should navigate to analytics when button is clicked', async () => {
      const user = userEvent.setup();
      render(<Dashboard {...mockProps} />);

      const analyticsButton = screen.getByText(/view analytics/i);
      await user.click(analyticsButton);

      expect(mockProps.setActiveTab).toHaveBeenCalledWith('analytics');
    });
  });

  describe('responsive design', () => {
    it('should adapt layout for mobile screens', () => {
      // Mock window.innerWidth
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<Dashboard {...mockProps} />);

      const container = screen.getByTestId('dashboard-container');
      expect(container).toHaveClass('flex-col');
    });

    it('should show desktop layout for larger screens', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      render(<Dashboard {...mockProps} />);

      const container = screen.getByTestId('dashboard-container');
      expect(container).toHaveClass('grid-cols-3');
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<Dashboard {...mockProps} />);

      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByLabelText(/dashboard statistics/i)).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<Dashboard {...mockProps} />);

      // Tab through interactive elements
      await user.tab();
      expect(screen.getByText(/new analysis/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByText(/view analytics/i)).toHaveFocus();
    });

    it('should announce loading states to screen readers', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: null,
        isLoading: true,
        error: null
      });

      render(<Dashboard {...mockProps} />);

      const loadingElement = screen.getByRole('status');
      expect(loadingElement).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('error handling', () => {
    it('should display error message when data loading fails', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error')
      });

      render(<Dashboard {...mockProps} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/error loading dashboard data/i)).toBeInTheDocument();
    });

    it('should provide retry functionality on error', async () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error'),
        refetch: vi.fn()
      });

      const user = userEvent.setup();
      render(<Dashboard {...mockProps} />);

      const retryButton = screen.getByText(/retry/i);
      await user.click(retryButton);

      // Should attempt to refetch data
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });
});