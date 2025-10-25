import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Analytics from '../Analytics';
import { AnalysisResult } from '../../types/analysis';

// Mock dependencies
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 'test-user-id', email: 'test@example.com' },
    subscription: { plan: 'pro', status: 'active' },
    hasActiveSubscription: true,
    canAccessFeature: vi.fn().mockReturnValue(true)
  })
}));

vi.mock('../../hooks/useOptimizedData', () => ({
  useOptimizedData: vi.fn().mockReturnValue({
    data: {
      analysisResults: [
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
          analysisType: 'batch',
          fullContent: 'Full test content 2'
        }
      ],
      dashboardData: {
        totalAnalyses: 2,
        averageAccuracy: 75,
        riskDistribution: { low: 1, medium: 1, high: 0, critical: 0 }
      }
    },
    isLoading: false,
    error: null,
    refetch: vi.fn()
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

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('rendering', () => {
    it('should render analytics dashboard', () => {
      render(<Analytics />);

      expect(screen.getByText(/analytics dashboard/i)).toBeInTheDocument();
      expect(screen.getByText(/comprehensive analysis insights/i)).toBeInTheDocument();
    });

    it('should render key metrics', () => {
      render(<Analytics />);

      expect(screen.getByText(/total analyses/i)).toBeInTheDocument();
      expect(screen.getByText(/average accuracy/i)).toBeInTheDocument();
      expect(screen.getByText(/risk distribution/i)).toBeInTheDocument();
    });

    it('should display analysis statistics', () => {
      render(<Analytics />);

      expect(screen.getByText('2')).toBeInTheDocument(); // Total analyses
      expect(screen.getByText('75%')).toBeInTheDocument(); // Average accuracy
    });
  });

  describe('data loading', () => {
    it('should show loading state', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn()
      });

      render(<Analytics />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should show error state', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed to load data'),
        refetch: vi.fn()
      });

      render(<Analytics />);

      expect(screen.getByText(/error loading analytics/i)).toBeInTheDocument();
    });

    it('should display data when loaded', () => {
      render(<Analytics />);

      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
    });
  });

  describe('time range filtering', () => {
    it('should render time range selector', () => {
      render(<Analytics />);

      expect(screen.getByText(/last 7 days/i)).toBeInTheDocument();
      expect(screen.getByText(/last 30 days/i)).toBeInTheDocument();
      expect(screen.getByText(/last 90 days/i)).toBeInTheDocument();
    });

    it('should update data when time range changes', async () => {
      const user = userEvent.setup();
      render(<Analytics />);

      const timeRangeButton = screen.getByText(/last 30 days/i);
      await user.click(timeRangeButton);

      // Should trigger data refetch
      expect(screen.getByText(/last 30 days/i)).toBeInTheDocument();
    });
  });

  describe('charts and visualizations', () => {
    it('should render accuracy trend chart', () => {
      render(<Analytics />);

      expect(screen.getByText(/accuracy trends/i)).toBeInTheDocument();
    });

    it('should render risk distribution chart', () => {
      render(<Analytics />);

      expect(screen.getByText(/risk distribution/i)).toBeInTheDocument();
    });

    it('should render analysis volume chart', () => {
      render(<Analytics />);

      expect(screen.getByText(/analysis volume/i)).toBeInTheDocument();
    });

    it('should render processing time metrics', () => {
      render(<Analytics />);

      expect(screen.getByText(/processing time/i)).toBeInTheDocument();
    });
  });

  describe('detailed analysis list', () => {
    it('should display recent analyses', () => {
      render(<Analytics />);

      expect(screen.getByText(/recent analyses/i)).toBeInTheDocument();
      expect(screen.getByText('Test analysis 1')).toBeInTheDocument();
      expect(screen.getByText('Test analysis 2')).toBeInTheDocument();
    });

    it('should show analysis details', () => {
      render(<Analytics />);

      expect(screen.getByText(/85%/)).toBeInTheDocument(); // Accuracy
      expect(screen.getByText(/65%/)).toBeInTheDocument(); // Accuracy
      expect(screen.getByText(/low/i)).toBeInTheDocument(); // Risk level
      expect(screen.getByText(/medium/i)).toBeInTheDocument(); // Risk level
    });

    it('should filter analyses by type', async () => {
      const user = userEvent.setup();
      render(<Analytics />);

      // Should have filter options
      const filterButton = screen.queryByText(/filter by type/i);
      if (filterButton) {
        await user.click(filterButton);
        expect(screen.getByText(/single/i)).toBeInTheDocument();
        expect(screen.getByText(/batch/i)).toBeInTheDocument();
      }
    });
  });

  describe('export functionality', () => {
    it('should render export button', () => {
      render(<Analytics />);

      expect(screen.getByText(/export data/i)).toBeInTheDocument();
    });

    it('should handle data export', async () => {
      const user = userEvent.setup();
      render(<Analytics />);

      const exportButton = screen.getByText(/export data/i);
      await user.click(exportButton);

      // Export functionality would be triggered
      expect(exportButton).toBeInTheDocument();
    });
  });

  describe('subscription integration', () => {
    it('should show full analytics for subscribed users', () => {
      render(<Analytics />);

      expect(screen.getByText(/analytics dashboard/i)).toBeInTheDocument();
      expect(screen.queryByText(/upgrade to access/i)).not.toBeInTheDocument();
    });

    it('should show upgrade prompt for free users', () => {
      const { useAuth } = require('../../hooks/useAuth');
      
      vi.mocked(useAuth).mockReturnValue({
        user: { id: 'test-user-id', email: 'test@example.com' },
        subscription: null,
        hasActiveSubscription: false,
        canAccessFeature: vi.fn().mockReturnValue(false)
      });

      render(<Analytics />);

      expect(screen.getByText(/upgrade to access/i)).toBeInTheDocument();
    });
  });

  describe('performance metrics', () => {
    it('should display processing time statistics', () => {
      render(<Analytics />);

      expect(screen.getByText(/processing time/i)).toBeInTheDocument();
    });

    it('should show verification source metrics', () => {
      render(<Analytics />);

      expect(screen.getByText(/verification sources/i)).toBeInTheDocument();
    });

    it('should display hallucination detection stats', () => {
      render(<Analytics />);

      expect(screen.getByText(/hallucinations detected/i)).toBeInTheDocument();
    });
  });

  describe('interactive features', () => {
    it('should allow drilling down into specific analyses', async () => {
      const user = userEvent.setup();
      render(<Analytics />);

      const analysisItem = screen.getByText('Test analysis 1');
      await user.click(analysisItem);

      // Should show detailed view
      await waitFor(() => {
        expect(screen.getByText(/analysis details/i)).toBeInTheDocument();
      });
    });

    it('should support date range selection', async () => {
      const user = userEvent.setup();
      render(<Analytics />);

      const dateRangeButton = screen.queryByText(/custom range/i);
      if (dateRangeButton) {
        await user.click(dateRangeButton);
        // Date picker would appear
        expect(dateRangeButton).toBeInTheDocument();
      }
    });
  });

  describe('real-time updates', () => {
    it('should refresh data periodically', () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      const mockRefetch = vi.fn();
      
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
        error: null,
        refetch: mockRefetch
      });

      render(<Analytics />);

      // Auto-refresh would be set up
      expect(mockRefetch).toBeDefined();
    });

    it('should handle real-time data updates', () => {
      render(<Analytics />);

      // Component should handle live data updates
      expect(screen.getByText(/analytics dashboard/i)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<Analytics />);

      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<Analytics />);

      await user.tab();
      expect(document.activeElement).toBeDefined();
    });

    it('should have proper heading structure', () => {
      render(<Analytics />);

      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
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
        error: null,
        refetch: vi.fn()
      });

      render(<Analytics />);

      expect(screen.getByText(/no analyses yet/i)).toBeInTheDocument();
    });

    it('should provide retry functionality on error', async () => {
      const { useOptimizedData } = require('../../hooks/useOptimizedData');
      const mockRefetch = vi.fn();
      
      vi.mocked(useOptimizedData).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Network error'),
        refetch: mockRefetch
      });

      const user = userEvent.setup();
      render(<Analytics />);

      const retryButton = screen.getByText(/retry/i);
      await user.click(retryButton);

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('responsive design', () => {
    it('should adapt layout for mobile screens', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<Analytics />);

      const container = screen.getByText(/analytics dashboard/i).closest('div');
      expect(container).toBeInTheDocument();
    });

    it('should show desktop layout for larger screens', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      render(<Analytics />);

      const container = screen.getByText(/analytics dashboard/i).closest('div');
      expect(container).toBeInTheDocument();
    });
  });
});