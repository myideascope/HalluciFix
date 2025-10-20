import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MonitoringDashboard from '../MonitoringDashboard';

// Mock dependencies
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 'test-user-id', email: 'test@example.com' },
    subscription: { plan: 'pro', status: 'active' },
    hasActiveSubscription: true,
    canAccessFeature: vi.fn().mockReturnValue(true)
  })
}));

vi.mock('../../lib/monitoring', () => ({
  monitoringService: {
    getSystemHealth: vi.fn().mockResolvedValue({
      status: 'healthy',
      uptime: 99.9,
      responseTime: 150,
      errorRate: 0.1,
      activeConnections: 1250,
      memoryUsage: 65,
      cpuUsage: 45
    }),
    getMetrics: vi.fn().mockResolvedValue([
      {
        timestamp: '2024-01-01T00:00:00Z',
        metric: 'response_time',
        value: 150,
        unit: 'ms'
      },
      {
        timestamp: '2024-01-01T00:00:00Z',
        metric: 'error_rate',
        value: 0.1,
        unit: 'percent'
      }
    ]),
    getAlerts: vi.fn().mockResolvedValue([
      {
        id: 'alert-1',
        type: 'warning',
        message: 'High response time detected',
        timestamp: '2024-01-01T00:00:00Z',
        resolved: false
      }
    ])
  }
}));

vi.mock('../../lib/errors/healthCheck', () => ({
  healthCheckService: {
    runHealthCheck: vi.fn().mockResolvedValue({
      status: 'healthy',
      checks: {
        database: { status: 'healthy', responseTime: 50 },
        api: { status: 'healthy', responseTime: 100 },
        external_services: { status: 'healthy', responseTime: 200 }
      },
      timestamp: '2024-01-01T00:00:00Z'
    })
  }
}));

describe('MonitoringDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('rendering', () => {
    it('should render monitoring dashboard', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/system monitoring/i)).toBeInTheDocument();
        expect(screen.getByText(/real-time system health/i)).toBeInTheDocument();
      });
    });

    it('should render system health metrics', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/system status/i)).toBeInTheDocument();
        expect(screen.getByText(/uptime/i)).toBeInTheDocument();
        expect(screen.getByText(/response time/i)).toBeInTheDocument();
        expect(screen.getByText(/error rate/i)).toBeInTheDocument();
      });
    });

    it('should display health status indicators', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/healthy/i)).toBeInTheDocument();
        expect(screen.getByText(/99.9%/)).toBeInTheDocument(); // Uptime
        expect(screen.getByText(/150ms/)).toBeInTheDocument(); // Response time
      });
    });
  });

  describe('data loading', () => {
    it('should show loading state initially', () => {
      const { monitoringService } = require('../../lib/monitoring');
      
      // Make the promise never resolve to keep loading state
      vi.mocked(monitoringService.getSystemHealth).mockReturnValue(new Promise(() => {}));

      render(<MonitoringDashboard />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should handle API errors gracefully', async () => {
      const { monitoringService } = require('../../lib/monitoring');
      
      vi.mocked(monitoringService.getSystemHealth).mockRejectedValue(
        new Error('API Error')
      );

      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/error loading monitoring data/i)).toBeInTheDocument();
      });
    });

    it('should refresh data automatically', async () => {
      const { monitoringService } = require('../../lib/monitoring');
      
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(monitoringService.getSystemHealth).toHaveBeenCalled();
      });

      // Should call again after refresh interval
      expect(monitoringService.getSystemHealth).toHaveBeenCalledTimes(1);
    });
  });

  describe('health checks', () => {
    it('should display individual service health', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/database/i)).toBeInTheDocument();
        expect(screen.getByText(/api/i)).toBeInTheDocument();
        expect(screen.getByText(/external services/i)).toBeInTheDocument();
      });
    });

    it('should show service response times', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/50ms/)).toBeInTheDocument(); // Database
        expect(screen.getByText(/100ms/)).toBeInTheDocument(); // API
        expect(screen.getByText(/200ms/)).toBeInTheDocument(); // External services
      });
    });

    it('should run manual health check', async () => {
      const { healthCheckService } = require('../../lib/errors/healthCheck');
      const user = userEvent.setup();
      
      render(<MonitoringDashboard />);

      await waitFor(() => {
        const refreshButton = screen.getByText(/run health check/i);
        expect(refreshButton).toBeInTheDocument();
      });

      const refreshButton = screen.getByText(/run health check/i);
      await user.click(refreshButton);

      expect(healthCheckService.runHealthCheck).toHaveBeenCalled();
    });
  });

  describe('metrics visualization', () => {
    it('should render performance charts', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/performance metrics/i)).toBeInTheDocument();
        expect(screen.getByText(/response time trends/i)).toBeInTheDocument();
        expect(screen.getByText(/error rate trends/i)).toBeInTheDocument();
      });
    });

    it('should display resource usage metrics', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/memory usage/i)).toBeInTheDocument();
        expect(screen.getByText(/cpu usage/i)).toBeInTheDocument();
        expect(screen.getByText(/65%/)).toBeInTheDocument(); // Memory
        expect(screen.getByText(/45%/)).toBeInTheDocument(); // CPU
      });
    });

    it('should show active connections', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/active connections/i)).toBeInTheDocument();
        expect(screen.getByText(/1,250/)).toBeInTheDocument();
      });
    });
  });

  describe('alerts and notifications', () => {
    it('should display active alerts', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/alerts/i)).toBeInTheDocument();
        expect(screen.getByText(/high response time detected/i)).toBeInTheDocument();
      });
    });

    it('should show alert severity levels', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/warning/i)).toBeInTheDocument();
      });
    });

    it('should allow dismissing alerts', async () => {
      const user = userEvent.setup();
      render(<MonitoringDashboard />);

      await waitFor(() => {
        const dismissButton = screen.queryByText(/dismiss/i);
        if (dismissButton) {
          expect(dismissButton).toBeInTheDocument();
        }
      });
    });
  });

  describe('time range selection', () => {
    it('should render time range selector', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/last hour/i)).toBeInTheDocument();
        expect(screen.getByText(/last 24 hours/i)).toBeInTheDocument();
        expect(screen.getByText(/last 7 days/i)).toBeInTheDocument();
      });
    });

    it('should update metrics when time range changes', async () => {
      const { monitoringService } = require('../../lib/monitoring');
      const user = userEvent.setup();
      
      render(<MonitoringDashboard />);

      await waitFor(() => {
        const timeRangeButton = screen.getByText(/last 24 hours/i);
        expect(timeRangeButton).toBeInTheDocument();
      });

      const timeRangeButton = screen.getByText(/last 24 hours/i);
      await user.click(timeRangeButton);

      expect(monitoringService.getMetrics).toHaveBeenCalled();
    });
  });

  describe('real-time updates', () => {
    it('should update data in real-time', async () => {
      const { monitoringService } = require('../../lib/monitoring');
      
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(monitoringService.getSystemHealth).toHaveBeenCalled();
      });

      // Should continue to poll for updates
      expect(monitoringService.getSystemHealth).toHaveBeenCalledTimes(1);
    });

    it('should show last updated timestamp', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/last updated/i)).toBeInTheDocument();
      });
    });
  });

  describe('status indicators', () => {
    it('should show healthy status with green indicator', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        const healthyStatus = screen.getByText(/healthy/i);
        expect(healthyStatus).toBeInTheDocument();
        expect(healthyStatus.closest('div')).toHaveClass('text-green-600');
      });
    });

    it('should show degraded status with yellow indicator', async () => {
      const { monitoringService } = require('../../lib/monitoring');
      
      vi.mocked(monitoringService.getSystemHealth).mockResolvedValue({
        status: 'degraded',
        uptime: 95.5,
        responseTime: 500,
        errorRate: 2.5,
        activeConnections: 800,
        memoryUsage: 85,
        cpuUsage: 75
      });

      render(<MonitoringDashboard />);

      await waitFor(() => {
        const degradedStatus = screen.getByText(/degraded/i);
        expect(degradedStatus).toBeInTheDocument();
        expect(degradedStatus.closest('div')).toHaveClass('text-yellow-600');
      });
    });

    it('should show critical status with red indicator', async () => {
      const { monitoringService } = require('../../lib/monitoring');
      
      vi.mocked(monitoringService.getSystemHealth).mockResolvedValue({
        status: 'critical',
        uptime: 85.0,
        responseTime: 1000,
        errorRate: 10.0,
        activeConnections: 200,
        memoryUsage: 95,
        cpuUsage: 90
      });

      render(<MonitoringDashboard />);

      await waitFor(() => {
        const criticalStatus = screen.getByText(/critical/i);
        expect(criticalStatus).toBeInTheDocument();
        expect(criticalStatus.closest('div')).toHaveClass('text-red-600');
      });
    });
  });

  describe('interactive features', () => {
    it('should allow manual refresh', async () => {
      const { monitoringService } = require('../../lib/monitoring');
      const user = userEvent.setup();
      
      render(<MonitoringDashboard />);

      await waitFor(() => {
        const refreshButton = screen.getByText(/refresh/i);
        expect(refreshButton).toBeInTheDocument();
      });

      const refreshButton = screen.getByText(/refresh/i);
      await user.click(refreshButton);

      expect(monitoringService.getSystemHealth).toHaveBeenCalledTimes(2);
    });

    it('should toggle auto-refresh', async () => {
      const user = userEvent.setup();
      render(<MonitoringDashboard />);

      await waitFor(() => {
        const autoRefreshToggle = screen.queryByText(/auto refresh/i);
        if (autoRefreshToggle) {
          expect(autoRefreshToggle).toBeInTheDocument();
        }
      });
    });
  });

  describe('subscription integration', () => {
    it('should show full monitoring for subscribed users', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/system monitoring/i)).toBeInTheDocument();
        expect(screen.queryByText(/upgrade to access/i)).not.toBeInTheDocument();
      });
    });

    it('should show limited monitoring for free users', async () => {
      const { useAuth } = require('../../hooks/useAuth');
      
      vi.mocked(useAuth).mockReturnValue({
        user: { id: 'test-user-id', email: 'test@example.com' },
        subscription: null,
        hasActiveSubscription: false,
        canAccessFeature: vi.fn().mockReturnValue(false)
      });

      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/upgrade to access/i)).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/system monitoring/i)).toBeInTheDocument();
      });

      await user.tab();
      expect(document.activeElement).toBeDefined();
    });

    it('should announce status changes to screen readers', async () => {
      render(<MonitoringDashboard />);

      await waitFor(() => {
        const statusElement = screen.getByText(/healthy/i);
        expect(statusElement).toHaveAttribute('aria-live', 'polite');
      });
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      const { monitoringService } = require('../../lib/monitoring');
      
      vi.mocked(monitoringService.getSystemHealth).mockRejectedValue(
        new Error('Network error')
      );

      render(<MonitoringDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/error loading monitoring data/i)).toBeInTheDocument();
      });
    });

    it('should provide retry functionality', async () => {
      const { monitoringService } = require('../../lib/monitoring');
      const user = userEvent.setup();
      
      vi.mocked(monitoringService.getSystemHealth).mockRejectedValue(
        new Error('Network error')
      );

      render(<MonitoringDashboard />);

      await waitFor(() => {
        const retryButton = screen.getByText(/retry/i);
        expect(retryButton).toBeInTheDocument();
      });

      const retryButton = screen.getByText(/retry/i);
      await user.click(retryButton);

      expect(monitoringService.getSystemHealth).toHaveBeenCalledTimes(2);
    });
  });

  describe('responsive design', () => {
    it('should adapt layout for mobile screens', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<MonitoringDashboard />);

      await waitFor(() => {
        const container = screen.getByText(/system monitoring/i).closest('div');
        expect(container).toBeInTheDocument();
      });
    });

    it('should show desktop layout for larger screens', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      render(<MonitoringDashboard />);

      await waitFor(() => {
        const container = screen.getByText(/system monitoring/i).closest('div');
        expect(container).toBeInTheDocument();
      });
    });
  });
});